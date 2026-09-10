#!/usr/bin/env node
// Build the canonical 2024-26 INDY NXT timing coverage ledger and native
// observation archive. This is an evidence index, not a completeness claim:
// observed source frames/heartbeats and 1 Hz replay interpolation are separate.

import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {enumerateNxtSessions, lakeDataRoot, readSessionLogText} from '../semantic-layer/lib/lake.mjs';
import {reconstructTiming71Frames} from './lib/timing71-reader.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');
const OBS_DIR = join(REPO_ROOT, 'analysis/semantic-layer/output/timing-observations');
const LEDGER_PATH = join(REPO_ROOT, 'data/historical-data-lake/catalog/timing-coverage-ledger.json');
const SOURCE_MAP_PATH = join(HERE, 'timing-coverage-sources.json');
const SOURCE_INVENTORY_PATH = join(HERE, 'timing-coverage-inventory.json');
const CAREER_PATH = join(REPO_ROOT, 'data/career/career.dataset.json');
const RT_SUMMARY_PATH = join(REPO_ROOT, 'analysis/semantic-layer/output/loop-crossings-summary.json');
const FINISHING_PATH = join(REPO_ROOT, 'analysis/semantic-layer/output/validation/finishing-order.json');
const AUDIT_PATH = join(REPO_ROOT, 'analysis/historical-high-frequency-data-audit/timing71-2026-coverage.json');
const LIVE_MANIFEST_PATH = join(REPO_ROOT, 'analysis/semantic-layer/output/live-captures/live-captures-manifest.json');
const REPLAY_FEEDS_DIR = join(REPO_ROOT, 'analysis/replay-feeds/output/feeds');
const REPLAY_MANIFEST_PATH = join(REPO_ROOT, 'analysis/replay-feeds/output/replay-feeds-manifest.json');

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const exists = async (path) => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

function datePart(value) {
  if (!value) return null;
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (iso) return iso[1];
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return null;
}

function percentile(sorted, fraction) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function coverageStats(epochMillis) {
  const ordered = [...epochMillis].filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = [];
  const gapIntervals = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const seconds = (ordered[i] - ordered[i - 1]) / 1000;
    gaps.push(seconds);
    if (seconds > 2) {
      gapIntervals.push({
        lastObservedAt: new Date(ordered[i - 1]).toISOString(),
        nextObservedAt: new Date(ordered[i]).toISOString(),
        seconds: Number(seconds.toFixed(3)),
      });
    }
  }
  gaps.sort((a, b) => a - b);
  const round = (value) => (value == null ? null : Number(value.toFixed(3)));
  return {
    observedStart: ordered.length ? new Date(ordered[0]).toISOString() : null,
    observedEnd: ordered.length ? new Date(ordered.at(-1)).toISOString() : null,
    observationCount: ordered.length,
    observedSpanSeconds: ordered.length > 1 ? round((ordered.at(-1) - ordered[0]) / 1000) : 0,
    cadence: {
      p50Seconds: round(percentile(gaps, 0.5)),
      p95Seconds: round(percentile(gaps, 0.95)),
      maxSeconds: round(gaps.at(-1) ?? null),
    },
    gaps: {
      over2Seconds: gaps.filter((gap) => gap > 2).length,
      over5Seconds: gaps.filter((gap) => gap > 5).length,
      over10Seconds: gaps.filter((gap) => gap > 10).length,
      maxSeconds: round(gaps.at(-1) ?? null),
      intervalsOver2Seconds: gapIntervals,
    },
  };
}

function isoFromTimeOfDay(date, seconds) {
  if (!date || !Number.isFinite(seconds)) return null;
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day) + seconds * 1000).toISOString();
}

function normalizedFlag(value) {
  return String(value ?? '').trim().toLowerCase().replace('chequered', 'checkered');
}

function lapObservationCoverage(rows, clockBasis) {
  const samples = rows
    .map((row) => ({observedAt: row.observedAt, lap: Number(row.bryce?.laps)}))
    .filter((row) => row.observedAt && Number.isFinite(row.lap));
  let changes = 0;
  let previous = null;
  for (const row of samples) {
    if (previous !== null && row.lap !== previous) changes += 1;
    previous = row.lap;
  }
  return {
    clockBasis,
    hasObservedClock: samples.length > 0,
    firstObservedAt: samples[0]?.observedAt ?? null,
    lastObservedAt: samples.at(-1)?.observedAt ?? null,
    sampleCount: samples.length,
    lapChangeObservationCount: changes,
    minLap: samples.length ? Math.min(...samples.map((row) => row.lap)) : null,
    maxLap: samples.length ? Math.max(...samples.map((row) => row.lap)) : null,
  };
}

function timing71ActiveWindow(rows) {
  const firstGreenIndex = rows.findIndex((row) => normalizedFlag(row.flag) === 'green');
  if (firstGreenIndex < 0) return null;
  const checkeredOffset = rows.slice(firstGreenIndex).findIndex((row) => normalizedFlag(row.flag) === 'checkered');
  const endIndex = checkeredOffset < 0 ? rows.length - 1 : firstGreenIndex + checkeredOffset;
  const windowRows = rows.slice(firstGreenIndex, endIndex + 1);
  return {
    startBoundary: 'first_observed_green_frame',
    endBoundary: checkeredOffset < 0 ? 'last_retained_frame_no_checkered_observed' : 'first_observed_checkered_frame',
    checkeredObserved: checkeredOffset >= 0,
    ...coverageStats(windowRows.map((row) => Date.parse(row.observedAt))),
  };
}

async function writeGzipNdjson(path, rows) {
  await mkdir(dirname(path), {recursive: true});
  const gzip = createGzip({level: 9});
  const output = createWriteStream(path);
  gzip.pipe(output);
  for (const row of rows) {
    if (!gzip.write(`${JSON.stringify(row)}\n`)) await once(gzip, 'drain');
  }
  gzip.end();
  await once(output, 'finish');
}

function raceToolsHeartbeatEpochs(logText) {
  const epochs = [];
  for (const line of logText.split(/\r?\n/)) {
    if (!line.startsWith('$H')) continue;
    const raw = line.split('¦')[5];
    if (!/^[0-9a-f]+$/i.test(raw ?? '')) continue;
    const epoch = Number.parseInt(raw, 16);
    if (epoch > 1_167_609_600 && epoch < 2_051_222_400) epochs.push(epoch);
  }
  return epochs;
}

function timing71Columns(frame) {
  const names = (frame.manifest.colSpec ?? []).map((column) => column[0]);
  const index = (name) => names.indexOf(name);
  return {
    num: index('Num'),
    state: index('State'),
    driver: index('Driver'),
    team: index('Team'),
    laps: index('Laps'),
    gap: index('Gap'),
    interval: index('Int'),
    last: index('Last'),
    best: index('Best'),
    sectors: [index('S1'), index('S2'), index('S3')],
  };
}

const cell = (value) => (Array.isArray(value) ? value[0] : value);

function normalizeTiming71Rows(zipBytes, sourceId) {
  const rows = [];
  let maxLapSum = 0;
  for (const frame of reconstructTiming71Frames(zipBytes)) {
    const idx = timing71Columns(frame);
    const cars = frame.state.cars ?? [];
    const hasBryce = cars.some((car) => /\bbryce\s+aron\b/i.test(String(car[idx.driver] ?? '')));
    if (!hasBryce) continue;
    const lapSum = cars.reduce((sum, car) => sum + (Number(cell(car[idx.laps])) || 0), 0);
    if (maxLapSum >= 10 && lapSum < 0.3 * maxLapSum) break;
    maxLapSum = Math.max(maxLapSum, lapSum);
    const field = cars.map((car, position) => ({
      car: String(car[idx.num] ?? ''),
      driver: car[idx.driver] ?? null,
      team: car[idx.team] ?? null,
      rank: position + 1,
      state: cell(car[idx.state]) ?? null,
      laps: Number(cell(car[idx.laps])) || 0,
      gap: cell(car[idx.gap]) ?? null,
      interval: cell(car[idx.interval]) ?? null,
      lastLapSeconds: Number(cell(car[idx.last])) || null,
      bestLapSeconds: Number(cell(car[idx.best])) || null,
      sectors: idx.sectors.map((index) => (index < 0 ? null : Number(cell(car[index])) || null)),
    }));
    rows.push({
      record: 'observation',
      sourceSessionId: sourceId,
      observedAt: new Date(frame.observedAtEpoch * 1000).toISOString(),
      sourceTier: 'timing71_normalized',
      observationBasis: 'observed_source_frame',
      interpolated: false,
      noGps: true,
      flag: frame.state.session?.flagState ?? null,
      field,
      bryce: field.find((car) => /\bbryce\s+aron\b/i.test(car.driver ?? '')) ?? null,
    });
  }
  return rows;
}

function qCode(sessionName) {
  if (/group\s*1/i.test(sessionName ?? '')) return 'QA';
  if (/group\s*2/i.test(sessionName ?? '')) return 'QB';
  return 'QC';
}

function selectQualifyingForRace(race, sessions, qualifyingResults) {
  const latestOverrides = {6764: '6900', 6757: '6935', 6759: '6950', 6758: '6953'};
  const override = latestOverrides[String(race.officialSessionId)];
  if (override) return sessions.find((session) => String(session.officialSessionId) === override) ?? null;
  const candidates = sessions.filter(
    (session) => session.eventId === race.eventId && session.sessionType === 'qualifying' && !/combined/i.test(session.sessionName ?? ''),
  );
  if (candidates.length <= 1) return candidates[0] ?? null;
  const bryceBySession = new Map();
  for (const result of qualifyingResults) {
    if (result.driverId !== 'driver_bryce_aron') continue;
    const previous = bryceBySession.get(result.sessionId);
    if (!previous || (Number(result.laps) || 0) > (Number(previous.laps) || 0)) bryceBySession.set(result.sessionId, result);
  }
  return [...candidates].sort((a, b) => {
    const ar = bryceBySession.get(a.id);
    const br = bryceBySession.get(b.id);
    return (Number(br?.laps) || 0) - (Number(ar?.laps) || 0) || Number(Boolean(br)) - Number(Boolean(ar));
  })[0];
}

const [career, sourceMap, sourceInventory, rtSummary, finishing, audit] = await Promise.all([
  readJson(CAREER_PATH),
  readJson(SOURCE_MAP_PATH),
  readJson(SOURCE_INVENTORY_PATH),
  readJson(RT_SUMMARY_PATH),
  readJson(FINISHING_PATH),
  readJson(AUDIT_PATH),
]);
const liveManifest = (await exists(LIVE_MANIFEST_PATH)) ? await readJson(LIVE_MANIFEST_PATH) : {sessions: []};
const replayManifest = (await exists(REPLAY_MANIFEST_PATH)) ? await readJson(REPLAY_MANIFEST_PATH) : {sessions: []};
const lakeRoot = lakeDataRoot();
const [manifest, t71Quality] = await Promise.all([
  readJson(join(lakeRoot, 'manifests/source-files.json')),
  readJson(join(lakeRoot, 'catalog/timing71-session-quality-all.json')),
]);

const eventsById = new Map(career.events.map((event) => [event.id, event]));
const completedBryceRaceSessionIds = new Set(
  career.results
    .filter((result) => result.driverId === 'driver_bryce_aron')
    .filter((result) =>
      result.finishPosition != null ||
      result.classifiedPosition != null ||
      result.lapsCompleted != null
    )
    .map((result) => result.sessionId),
);
const races = career.sessions
  .filter((session) => {
    const event = eventsById.get(session.eventId);
    return session.sessionType === 'race' &&
      event?.seriesId === 'series_indy_nxt' &&
      completedBryceRaceSessionIds.has(session.id);
  })
  .sort((a, b) => Number(a.id.match(/202\d/)?.[0]) - Number(b.id.match(/202\d/)?.[0]) || String(a.officialSessionId).localeCompare(String(b.officialSessionId), undefined, {numeric: true}));
const rtById = new Map(rtSummary.sessions.map((session) => [session.id, session]));
const finishingByCanonical = new Map(finishing.results.map((row) => [row.canonicalSessionId, row]));
const rawRtSessions = await enumerateNxtSessions({years: [2024, 2025]});
const rawRtById = new Map(rawRtSessions.map((session) => [session.id, session]));
const t71ByReplay = new Map(t71Quality.sessions.map((session) => [session.replayId, session]));
const manifestByReplay = new Map();
for (const file of manifest.files ?? []) {
  if (file.kind !== 'derived_analysis' && file.metadata?.replayId) manifestByReplay.set(file.metadata.replayId, file);
}
const liveByCanonical = new Map();
for (const session of liveManifest.sessions ?? []) {
  liveByCanonical.set(session.canonicalSessionId, session);
  for (const alias of session.canonicalAliases ?? []) liveByCanonical.set(alias, {...session, aliasOf: session.canonicalSessionId});
}
const replayByCanonical = new Map((replayManifest.sessions ?? []).map((session) => [session.canonicalSessionId, session]));

const auditRaceMap = new Map((audit.raceReplays ?? []).map((row) => [String(row.officialSessionId), row.replayId]));
for (const [officialId, replayId] of Object.entries(sourceMap.raceReplayOverrides ?? {})) auditRaceMap.set(String(officialId), replayId);

await mkdir(OBS_DIR, {recursive: true});
const builtRt = new Map();
const builtT71 = new Map();

async function raceToolsSource(sourceId) {
  if (builtRt.has(sourceId)) return builtRt.get(sourceId);
  const raw = rawRtById.get(sourceId);
  const summary = rtById.get(sourceId);
  if (!raw || !summary) return null;
  const epochs = raceToolsHeartbeatEpochs(await readSessionLogText(raw));
  const stats = coverageStats(epochs.map((epoch) => epoch * 1000));
  const greenAt = isoFromTimeOfDay(summary.date, summary.greenTod);
  const checkeredAt = isoFromTimeOfDay(summary.date, summary.checkeredTod);
  const activeStartMillis = Date.parse(greenAt);
  const activeEndMillis = Number.isFinite(Date.parse(checkeredAt)) ? Date.parse(checkeredAt) : Date.parse(stats.observedEnd);
  const activeEpochMillis = epochs
    .map((epoch) => epoch * 1000)
    .filter((epoch) => (!Number.isFinite(activeStartMillis) || epoch >= activeStartMillis) && (!Number.isFinite(activeEndMillis) || epoch <= activeEndMillis));
  const activeWindowCoverage = Number.isFinite(activeStartMillis)
    ? {
        startBoundary: 'first_reported_green_flag',
        endBoundary: checkeredAt ? 'reported_checkered_flag' : 'last_observed_heartbeat_checkered_time_unavailable',
        greenFlagAt: greenAt,
        checkeredFlagAt: checkeredAt,
        checkeredDetected: summary.hasCheckered === true,
        ...coverageStats(activeEpochMillis),
      }
    : null;
  const artifact = `analysis/semantic-layer/output/timing-observations/${sourceId}.ndjson.gz`;
  await writeGzipNdjson(join(OBS_DIR, `${sourceId}.ndjson.gz`), [
    {
      record: 'session_meta',
      sourceSessionId: sourceId,
      sourceTier: 'racetools_capture',
      sourceLabel: 'RaceTools capture of the INDYCAR timing feed',
      clockBasis: 'session_local_feed_clock',
      clockCaveat: 'Encoded on the session date with a Z suffix for monotonic replay only; this is not UTC and must not be converted as browser time.',
      observationBasis: 'observed_source_heartbeat',
      interpolated: false,
      noGps: true,
      semanticEventArtifact: `analysis/semantic-layer/output/${summary.pack}`,
    },
    ...epochs.map((epoch) => ({
      record: 'observation',
      sourceSessionId: sourceId,
      observedAt: new Date(epoch * 1000).toISOString(),
      sourceTier: 'racetools_capture',
      clockBasis: 'session_local_feed_clock',
      observationBasis: 'observed_source_heartbeat',
      interpolated: false,
      noGps: true,
    })),
  ]);
  const descriptor = {
    tier: 'racetools_capture',
    label: 'RaceTools capture of the INDYCAR timing feed',
    sourceSessionId: sourceId,
    clockBasis: 'session_local_feed_clock',
    clockCaveat: 'Observed timestamps encode RaceTools session-local time on the session date. The Z suffix is a replay container convention, not UTC.',
    observedArtifact: artifact,
    semanticEventArtifact: `analysis/semantic-layer/output/${summary.pack}`,
    ...stats,
    activeWindowCoverage,
    lapObservationCoverage: {
      clockBasis: 'session_local_feed_clock',
      hasObservedClock: stats.observationCount > 0,
      allCarLapObservationCount: summary.lapRowCount ?? 0,
      maxDerivedLap: summary.maxDerivedLaps ?? null,
      note: 'RaceTools semantic lap rows are field observations; the source heartbeat clock is retained separately.',
    },
    identityProof: {seriesCodes: summary.heartbeat?.seriesCodes ?? [], bryceInSessionRoster: true},
    qualityMasks: summary.qualityMasks ?? [],
    observationBasis: 'observed_source_heartbeat',
    interpolated: false,
    noGps: true,
    observationAssertion: 'observations_present_not_unbroken_1hz',
  };
  builtRt.set(sourceId, descriptor);
  return descriptor;
}

async function timing71Source(replayId) {
  if (builtT71.has(replayId)) return builtT71.get(replayId);
  const quality = t71ByReplay.get(replayId);
  const file = manifestByReplay.get(replayId);
  if (!quality || !file) return null;
  const zipBytes = await readFile(join(lakeRoot, file.viewPath));
  const rows = normalizeTiming71Rows(zipBytes, replayId);
  const stats = coverageStats(rows.map((row) => Date.parse(row.observedAt)));
  const activeWindowCoverage = timing71ActiveWindow(rows);
  const lapCoverage = lapObservationCoverage(rows, 'utc_archive_frame_timestamp');
  const artifact = `analysis/semantic-layer/output/timing-observations/t71_${replayId}.ndjson.gz`;
  await writeGzipNdjson(join(OBS_DIR, `t71_${replayId}.ndjson.gz`), [
    {
      record: 'session_meta',
      sourceSessionId: replayId,
      replayId,
      sourceTier: 'timing71_normalized',
      sourceLabel: 'Timing71 normalized replay of live timing',
      clockBasis: 'utc_archive_timestamp',
      observationBasis: 'observed_source_frame',
      interpolated: false,
      noGps: true,
      description: quality.sessionLabel,
    },
    ...rows,
  ]);
  const segment = quality.analysis?.content?.bryceSegment ?? {};
  const descriptor = {
    tier: 'timing71_normalized',
    label: 'Timing71 normalized replay of live timing',
    replayId,
    sourceSessionId: quality.sessionId,
    clockBasis: 'utc_archive_timestamp',
    observedArtifact: artifact,
    rawReplayView: file.viewPath,
    ...stats,
    activeWindowCoverage,
    lapObservationCoverage: lapCoverage,
    identityProof: {
      bryce: quality.analysis?.content?.bryce ?? null,
      minCars: segment.minCars ?? null,
      maxCars: segment.maxCars ?? null,
      uniqueDriverCount: segment.uniqueDriverCount ?? null,
    },
    sourceQuality: quality.analysis?.quality?.status ?? null,
    observationBasis: 'observed_source_frame',
    interpolated: false,
    noGps: true,
    observationAssertion: 'observations_present_not_unbroken_1hz',
  };
  builtT71.set(replayId, descriptor);
  return descriptor;
}

function liveSource(session) {
  if (!session) return null;
  return {
    tier: 'race_control_capture',
    label: session.sourceLabel,
    sourceSessionId: session.captureSessionKey,
    clockBasis: 'utc_capture_timestamp',
    observedArtifact: session.observedArtifact,
    observedStart: session.observedStart,
    observedEnd: session.observedEnd,
    observationCount: session.observationCount,
    observedSpanSeconds: Number(((Date.parse(session.observedEnd) - Date.parse(session.observedStart)) / 1000).toFixed(3)),
    cadence: {
      p50Seconds: session.cadence.p50Seconds,
      p95Seconds: session.cadence.p95Seconds,
      maxSeconds: session.cadence.maxSeconds,
    },
    gaps: {
      over2Seconds: session.cadence.gapsOver2Seconds,
      over5Seconds: session.cadence.gapsOver5Seconds,
      over10Seconds: session.cadence.gapsOver10Seconds,
      maxSeconds: session.cadence.maxSeconds,
      intervalsOver2Seconds: session.cadence.intervalsOver2Seconds ?? [],
    },
    activeWindowCoverage: session.racingWindow ?? null,
    lapObservationCoverage: session.bryceLapCoverage ?? null,
    identityProof: {bryceObservationCount: session.bryceObservationCount},
    observationBasis: 'observed_source_snapshot',
    interpolated: false,
    noGps: true,
    observationAssertion: 'observations_present_not_unbroken_1hz',
  };
}

const ledgerSessions = [];
for (const race of races) {
  const year = Number(race.id.match(/202\d/)?.[0]);
  const event = eventsById.get(race.eventId);
  const date = datePart(race.actualStart ?? race.scheduledStart) ?? datePart(event?.startDate);
  const sources = [];
  if (year <= 2025) {
    const finish = finishingByCanonical.get(race.id);
    if (finish?.id) {
      const source = await raceToolsSource(finish.id);
      if (source) sources.push(source);
    }
  } else {
    const replayId = auditRaceMap.get(String(race.officialSessionId));
    if (replayId) {
      const source = await timing71Source(replayId);
      if (source) sources.push(source);
    }
    const capture = liveSource(liveByCanonical.get(race.id));
    if (capture) sources.unshift(capture);
  }
  const supplementalConfig = sourceMap.supplementalRaceSources?.[race.id];
  if (supplementalConfig?.kind === 'timing71') {
    const supplemental = await timing71Source(supplementalConfig.replayId);
    if (supplemental && !sources.some((source) => source.replayId === supplemental.replayId)) {
      sources.push({...supplemental, supplementalPurpose: supplementalConfig.purpose});
    }
  }
  const replayEntry = replayByCanonical.get(race.id);
  const replayPath = replayEntry?.feedArtifact
    ? `analysis/replay-feeds/output/${replayEntry.feedArtifact}`
    : `analysis/replay-feeds/output/feeds/${race.id}.ndjson.gz`;
  const replayAvailable = replayEntry?.feedArtifact
    ? await exists(join(REPO_ROOT, replayPath))
    : await exists(join(REPLAY_FEEDS_DIR, `${race.id}.ndjson.gz`));
  ledgerSessions.push({
    canonicalSessionId: race.id,
    canonicalOfficialSessionId: String(race.officialSessionId),
    eventId: race.eventId,
    event: event?.name ?? null,
    year,
    date,
    sessionType: 'race',
    status: sources.length ? 'observed' : 'unavailable',
    observationCoverage: sources.length ? 'observations_present' : 'no_joined_observations',
    completenessClaim: 'none',
    primarySource: sources[0] ?? null,
    sources,
    activeWindowCoverage: sources[0]?.activeWindowCoverage ?? null,
    replayArtifact: replayAvailable ? replayPath : null,
    replayBasis: replayAvailable
      ? sources[0]?.tier === 'race_control_capture'
        ? 'observed_source_snapshot'
        : 'interpolated_step_hold_from_observed_timing_events'
      : null,
    replayInterpolated: replayAvailable ? sources[0]?.tier !== 'race_control_capture' : null,
    replayInterpolationCoverage: replayAvailable ? replayEntry?.interpolationCoverage ?? null : null,
    noGps: true,
    caveats: sources.length
      ? ['Timing is timing-line/display-state observation, not vehicle GPS or continuous track position.']
      : ['No high-frequency source was joined after the RaceTools, Timing71, and BryceCast capture search.'],
  });

  const qualifying = selectQualifyingForRace(race, career.sessions, career.qualifyingResults);
  const qSources = [];
  if (qualifying && year <= 2025) {
    const qDate = datePart(qualifying.actualStart ?? qualifying.scheduledStart);
    const code = qCode(qualifying.sessionName);
    const sourceSummary = rtSummary.sessions.find(
      (session) => session.year === year && session.sessionType === 'qualifying' && session.date === qDate && session.sessionCode === code,
    );
    if (sourceSummary) {
      const source = await raceToolsSource(sourceSummary.id);
      if (source) qSources.push(source);
    }
  } else if (qualifying && year === 2026) {
    const selected = sourceMap.qualifyingSources?.[String(qualifying.officialSessionId)];
    if (selected?.kind === 'timing71') {
      const source = await timing71Source(selected.replayId);
      if (source) qSources.push(source);
      if (selected.captureSessionKey) {
        const capture = liveSource(liveByCanonical.get(qualifying.id));
        if (!capture || capture.sourceSessionId !== selected.captureSessionKey) {
          throw new Error(`${qualifying.id}: configured native qualifying capture ${selected.captureSessionKey} is missing or mismatched`);
        }
        if (selected.preferredObservedSource === 'race_control_capture') qSources.unshift(capture);
        else qSources.push(capture);
      }
    } else if (selected?.kind === 'race_control_capture') {
      const source = liveSource(liveByCanonical.get(qualifying.id));
      if (source) qSources.push(source);
    }
  }
  let qStatus = qSources.length ? 'observed' : 'unavailable';
  const qCaveats = [];
  if (String(qualifying?.officialSessionId) === '6489') {
    qStatus = qSources.length ? 'partial' : 'unavailable';
    qCaveats.push('Nashville 2024 qualifying was interrupted; retain observed timing and sourced lap facts without treating the field run as complete.');
  }
  if (String(qualifying?.officialSessionId) === '6596') {
    qCaveats.push('Iowa 2025 qualifying has official classification context but no high-frequency capture occurred.');
  }
  if (String(qualifying?.officialSessionId) === '6950' || String(qualifying?.officialSessionId) === '6953') {
    qCaveats.push('Monterey 2026 qualifying capture is sparse: 432 archived observations with periodic 15-second gaps.');
  }
  ledgerSessions.push({
    canonicalSessionId: qualifying?.id ?? null,
    canonicalOfficialSessionId: qualifying?.officialSessionId ? String(qualifying.officialSessionId) : null,
    qualifiesRaceSessionId: race.id,
    eventId: race.eventId,
    event: event?.name ?? null,
    year,
    date: datePart(qualifying?.actualStart ?? qualifying?.scheduledStart) ?? date,
    sessionType: 'qualifying',
    sessionName: qualifying?.sessionName ?? null,
    status: qStatus,
    observationCoverage: qSources.length ? 'observations_present' : 'no_joined_observations',
    completenessClaim: 'none',
    primarySource: qSources[0] ?? null,
    sources: qSources,
    lapObservationCoverage: qSources[0]?.lapObservationCoverage ?? null,
    replayArtifact: null,
    replayBasis: null,
    replayInterpolated: null,
    noGps: true,
    caveats: qCaveats.length
      ? qCaveats
      : qSources.length
        ? ['Timing is timing-line/display-state observation, not vehicle GPS or continuous track position.']
        : ['No high-frequency source was joined after the RaceTools, Timing71, and BryceCast capture search.'],
  });
}

const raceRows = ledgerSessions.filter((session) => session.sessionType === 'race');
const qualifyingRows = ledgerSessions.filter((session) => session.sessionType === 'qualifying');
const sourceFiles = manifest.files ?? [];
const lakeInventory = {
  lakeDataRoot: lakeRoot,
  manifestFileCount: sourceFiles.length,
  contentAddressedObjectCount: new Set(sourceFiles.map((file) => file.sha256).filter(Boolean)).size,
  timing71AnalyzedSessionCount: t71Quality.sessions.length,
  timing71AnalyzedByYear: Object.fromEntries(
    [...new Set(t71Quality.sessions.map((session) => session.year))]
      .sort()
      .map((year) => [year, t71Quality.sessions.filter((session) => session.year === year).length]),
  ),
  raceToolsNxtSessionCount2024To2025: rawRtSessions.length,
  raceControlSubsetCount: liveManifest.sessions?.length ?? 0,
};
const ledger = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  asOfDate: new Date().toISOString().slice(0, 10),
  canonicalDatasetUpdatedAt: career.updatedAt ?? null,
  scope: 'Bryce Aron INDY NXT races and the qualifying source used for each race, 2024-2026',
  contract: {
    observed: 'A timestamp exists in a retained source heartbeat, replay frame, or BryceCast Race Control snapshot.',
    interpolated: 'A 1 Hz consumer row holds or derives state between observed timing events. It is never counted as an observed source frame.',
    unavailable: 'The expected canonical session remains in the ledger with the sources searched and a reason.',
    position: 'Timing-line/display order only. No source in this ledger is GPS.',
  },
  counts: {
    racesExpected: raceRows.length,
    racesObserved: raceRows.filter((row) => row.status === 'observed').length,
    racesWithReplay: raceRows.filter((row) => row.replayArtifact).length,
    qualifyingLinksExpected: qualifyingRows.length,
    qualifyingObserved: qualifyingRows.filter((row) => row.status === 'observed').length,
    qualifyingPartial: qualifyingRows.filter((row) => row.status === 'partial').length,
    qualifyingUnavailable: qualifyingRows.filter((row) => row.status === 'unavailable').length,
  },
  canonicalExpectedRaceIds: raceRows.map((row) => row.canonicalSessionId),
  sourceInventoryEvidence: {
    ...sourceInventory,
    currentLake: lakeInventory,
  },
  rejectedSources: sourceMap.rejectedReplayIds,
  sessions: ledgerSessions,
};
await mkdir(dirname(LEDGER_PATH), {recursive: true});
await writeFile(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(ledger.counts, null, 2)}\n${LEDGER_PATH}\n`);
