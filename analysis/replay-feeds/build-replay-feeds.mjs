#!/usr/bin/env node
// Brief L slice 2 — the replay reducer.
//
// Normalizes the historical data lake's per-session semantic-layer tables into
// the capture-shaped snapshot feeds the Time Machine plays, so "Watch this race
// unfold" can appear on 2024-2026 races, not just our own captures.
//
// Inputs (READ-ONLY): the committed semantic-layer outputs. Never the raw lake,
// never the live sqlite.
//   - finishing-order.json            -> 28 clean 2024-25 RaceTools races + canonicalSessionId
//   - crosswalk-validation.json       -> 12 Timing71 2026 races + canonicalSessionId + winner check
//   - identity-crosswalk-2026.json    -> per-session eventId + per-car driverIds
//   - capture-final-states.json       -> our own capture final field (two-source diff)
//   - sessions/*.ndjson.gz            -> RaceTools per-session tables
//   - sessions-2026/*.ndjson.gz       -> Timing71 per-session tables
//
// Outputs:
//   - output/feeds/<canonicalSessionId>.ndjson.gz   (capture-shaped snapshot rows)
//   - output/replay-feeds-manifest.json             (what is in / excluded and why)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessionPack, writeFeedPack } from './lib/pack-reader.mjs';
import {
  reduceRaceTools,
  reduceTiming71,
  BRYCE_DRIVER_ID,
  MAX_INTERPOLATION_HOLD_SECONDS,
} from './lib/reduce.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const semanticOut = join(__dirname, '..', 'semantic-layer', 'output');
const feedsDir = join(__dirname, 'output', 'feeds');
const manifestPath = join(__dirname, 'output', 'replay-feeds-manifest.json');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const TIER_LABEL = {
  racetools_capture: 'RaceTools race-weekend capture',
  timing71_normalized: 'third-party normalized (Timing71)',
  race_control_capture: 'BryceCast capture of INDYCAR Race Control timing'
};

const numericSuffix = (id) => {
  const m = String(id ?? '').match(/_(\d+)$/);
  return m ? m[1] : null;
};

const MIN_WATCHABLE_SAMPLES = 120; // mirrors scripts/lib/replay-overlay.mjs

// --- Load validation references ------------------------------------------------
const finishingOrder = readJson(join(semanticOut, 'validation', 'finishing-order.json'));
const crosswalkValidation = readJson(join(semanticOut, 'crosswalk', 'crosswalk-validation.json'));
const identityCrosswalk = readJson(join(semanticOut, 'crosswalk', 'identity-crosswalk-2026.json'));
const captureFinalStates = readJson(join(semanticOut, 'cross-check', 'capture-final-states.json'));
const liveCaptureManifestPath = join(semanticOut, 'live-captures', 'live-captures-manifest.json');
const liveCaptureManifest = existsSync(liveCaptureManifestPath)
  ? readJson(liveCaptureManifestPath)
  : { sessions: [] };

const crosswalkBySession = new Map(identityCrosswalk.sessions.map((s) => [s.t71SessionId, s]));
const captureByEventSessionId = new Map(
  (captureFinalStates.sessions ?? []).map((s) => [String(s.officialEventSessionId), s])
);

// --- Validation helpers --------------------------------------------------------
const flagSanity = (snapshots) => {
  const flags = snapshots.map((s) => s.raw.timing.timing_results.heartbeat.currentFlag);
  const first = flags[0];
  const last = flags[flags.length - 1];
  const distinct = [...new Set(flags)];
  const validStates = distinct.every((s) => ['GREEN', 'YELLOW', 'RED', 'CHECKERED', 'WHITE'].includes(s));
  const hasGreen = flags.includes('GREEN');
  return {
    startsGreen: first === 'GREEN',
    endsCheckered: last === 'CHECKERED',
    states: distinct,
    // A race is flag-sane when green racing occurs, it ends checkered, and every
    // state is a real flag. The very first virtual second can read YELLOW when the
    // green flips a fraction of a second later (floor() catches the prior caution);
    // that is not a defect, so `startsGreen` is informational only.
    ok: hasGreen && last === 'CHECKERED' && validStates
  };
};

// Two-source diff: reduced final on-road order vs our own capture's final field.
const twoSourceDiff = (eventSessionId, finalOrder) => {
  const capture = captureByEventSessionId.get(String(eventSessionId));
  if (!capture || !Array.isArray(capture.finalField) || capture.finalField.length === 0) return null;
  const captureOrder = [...capture.finalField]
    .filter((r) => Number.isFinite(r.rank))
    .sort((a, b) => a.rank - b.rank)
    .map((r) => String(r.car));
  const n = Math.min(captureOrder.length, finalOrder.length);
  let agree = 0;
  for (let i = 0; i < n; i += 1) if (captureOrder[i] === finalOrder[i]) agree += 1;
  return {
    captureSessionKey: capture.sessionKey,
    captureSnapshots: capture.snapshotCount ?? null,
    thinCapture: (capture.snapshotCount ?? 0) < MIN_WATCHABLE_SAMPLES,
    checked: n,
    agree,
    agreementFraction: n ? Number((agree / n).toFixed(4)) : null,
    captureFinalOrder: captureOrder,
    reducedFinalOrder: finalOrder
  };
};

const reduced = [];
const excluded = [];

// --- (a) 2024-25 RaceTools races ----------------------------------------------
for (const race of finishingOrder.results) {
  if (!race.canonicalSessionId || !race.matched) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId ?? null, sourceTier: 'racetools_capture', reason: 'no canonicalSessionId or unmatched to canonical' });
    continue;
  }
  const packPath = join(semanticOut, 'sessions', `${race.id}.ndjson.gz`);
  let pack;
  try {
    pack = readSessionPack(packPath);
  } catch (err) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'racetools_capture', reason: `pack unreadable: ${err.message}` });
    continue;
  }
  const eventSessionId = numericSuffix(race.canonicalSessionId);
  const out = reduceRaceTools(pack, { canonicalSessionId: race.canonicalSessionId, eventSessionId, seasonYear: race.year });
  if (!out.snapshots.length) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'racetools_capture', reason: out.reason ?? 'reducer produced no snapshots' });
    continue;
  }

  const winner = out.finalOrder[0];
  const podium = out.finalOrder.slice(0, 3);
  const winnerMatch = winner === race.derivedWinner && winner === race.canonicalWinner;
  const podiumMatch = JSON.stringify(podium) === JSON.stringify(race.canonicalPodium);
  const flags = flagSanity(out.snapshots);
  const bryceSamples = out.snapshots.filter((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID)).length;
  const validationOk = winnerMatch && podiumMatch && flags.ok && out.bryceSeen && bryceSamples >= MIN_WATCHABLE_SAMPLES;

  const entry = {
    id: race.id,
    canonicalSessionId: race.canonicalSessionId,
    sessionKey: race.canonicalSessionId,
    eventSessionId,
    seasonYear: race.year,
    sourceTier: out.sourceTier,
    tierLabel: TIER_LABEL[out.sourceTier],
    observationBasis: 'interpolated_step_hold_from_observed_timing_events',
    replayInterpolated: true,
    noGps: true,
    feedArtifact: `feeds/${race.canonicalSessionId}.ndjson.gz`,
    interpolationCoverage: out.interpolationCoverage,
    venue: race.venue,
    sessionName: out.meta?.sessionLabel ?? 'Race',
    eventName: out.meta?.event ?? race.venue,
    date: race.date,
    totalLaps: out.totalLaps,
    samples: out.snapshots.length,
    bryceSamples,
    firstCheckedAt: out.snapshots[0].checkedAt,
    lastCheckedAt: out.snapshots[out.snapshots.length - 1].checkedAt,
    firstGreenAt: out.firstGreenIso,
    durationSeconds: Math.round((Date.parse(out.snapshots[out.snapshots.length - 1].checkedAt) - Date.parse(out.snapshots[0].checkedAt)) / 1000),
    validation: {
      winner,
      winnerMatch,
      podium,
      podiumMatch,
      finalOrder: out.finalOrder,
      lapCountWithin1: `${race.lapCountWithin1}/${race.lapCountChecked}`,
      flags,
      asRacedVsCanonical: 'match',
      twoSource: twoSourceDiff(eventSessionId, out.finalOrder)
    },
    excludedFromAvailable: !validationOk,
    watchable: validationOk
  };
  if (!validationOk) {
    entry.excludeReason = [
      !winnerMatch && 'winner mismatch',
      !podiumMatch && 'podium mismatch',
      !flags.ok && 'flag intervals not sane',
      bryceSamples < MIN_WATCHABLE_SAMPLES && 'too few Bryce samples'
    ].filter(Boolean).join('; ');
  }
  writeFeedPack(join(feedsDir, `${race.canonicalSessionId}.ndjson.gz`), out.snapshots);
  reduced.push(entry);
  process.stdout.write(`RT ${race.year} ${race.venue.padEnd(34)} -> ${race.canonicalSessionId}  ${out.snapshots.length}r  win#${winner} ${validationOk ? 'OK' : 'EXCLUDED:' + entry.excludeReason}\n`);
}

// --- (b) 2026 Timing71 GO races ------------------------------------------------
for (const race of crosswalkValidation.raceClassificationChecks) {
  if (!race.canonicalSessionId || !race.matched) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId ?? null, sourceTier: 'timing71_normalized', reason: 'no canonicalSessionId or unmatched' });
    continue;
  }
  const cw = crosswalkBySession.get(race.id);
  const goNoGo = crosswalkValidation.goNoGo.find((g) => g.t71SessionId === race.id);
  const verdict = goNoGo?.verdict ?? 'UNKNOWN';
  if (verdict === 'NO-GO') {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: `crosswalk verdict NO-GO` });
    continue;
  }
  const packPath = join(semanticOut, 'sessions-2026', `${race.id}.ndjson.gz`);
  let pack;
  try {
    pack = readSessionPack(packPath);
  } catch (err) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: `pack unreadable: ${err.message}` });
    continue;
  }
  const eventSessionId = cw?.canonicalOfficialSessionId ?? numericSuffix(race.canonicalSessionId);
  const eventId = numericSuffix(cw?.canonicalEventId);
  const crosswalkMap = {};
  for (const m of cw?.mappings ?? []) crosswalkMap[String(m.car)] = { driverId: m.driverId };
  const out = reduceTiming71(pack, { canonicalSessionId: race.canonicalSessionId, eventSessionId, seasonYear: 2026, eventId, crosswalk: crosswalkMap });
  if (!out.snapshots.length) {
    excluded.push({ id: race.id, canonicalSessionId: race.canonicalSessionId, sourceTier: 'timing71_normalized', reason: out.reason ?? 'reducer produced no snapshots' });
    continue;
  }

  const winner = out.finalOrder[0];
  const podium = out.finalOrder.slice(0, 3);
  // As-raced vs canonical: raceClassificationChecks.winnerMatch is canonical.
  // The CONDITIONAL (Road America R2) diverges by design (post-race DQ).
  const asRaced = verdict === 'CONDITIONAL' ? 'as_raced_diverges_from_canonical' : 'match';
  const flags = flagSanity(out.snapshots);
  const bryceSamples = out.snapshots.filter((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID)).length;
  // Watchable requires a sane replay with Bryce present. Canonical winner match
  // is NOT required (as-raced replays are legitimate); the honesty line carries it.
  const validationOk = flags.ok && out.bryceSeen && bryceSamples >= MIN_WATCHABLE_SAMPLES && winner != null;

  const entry = {
    id: race.id,
    canonicalSessionId: race.canonicalSessionId,
    sessionKey: race.canonicalSessionId,
    eventSessionId: String(eventSessionId),
    seasonYear: 2026,
    sourceTier: out.sourceTier,
    tierLabel: TIER_LABEL[out.sourceTier],
    observationBasis: 'interpolated_step_hold_from_observed_timing_events',
    replayInterpolated: true,
    noGps: true,
    feedArtifact: `feeds/${race.canonicalSessionId}.ndjson.gz`,
    interpolationCoverage: out.interpolationCoverage,
    verdict,
    venue: out.meta?.venue ?? cw?.venue,
    sessionName: 'Race',
    eventName: out.meta?.event ?? out.meta?.venue,
    date: cw?.date ?? out.meta?.date,
    totalLaps: out.totalLaps,
    samples: out.snapshots.length,
    bryceSamples,
    firstCheckedAt: out.snapshots[0].checkedAt,
    lastCheckedAt: out.snapshots[out.snapshots.length - 1].checkedAt,
    firstGreenAt: out.firstGreenIso,
    durationSeconds: Math.round((Date.parse(out.snapshots[out.snapshots.length - 1].checkedAt) - Date.parse(out.snapshots[0].checkedAt)) / 1000),
    validation: {
      winner,
      canonicalWinnerMatch: race.winnerMatch,
      canonicalPositionExact: `${race.positionExact}/${race.checked}`,
      podium,
      finalOrder: out.finalOrder,
      flags,
      asRacedVsCanonical: asRaced,
      twoSource: twoSourceDiff(eventSessionId, out.finalOrder)
    },
    excludedFromAvailable: !validationOk,
    watchable: validationOk
  };
  if (!validationOk) {
    entry.excludeReason = [
      !flags.ok && 'flag intervals not sane',
      bryceSamples < MIN_WATCHABLE_SAMPLES && 'too few Bryce samples',
      winner == null && 'no final order'
    ].filter(Boolean).join('; ');
  }
  writeFeedPack(join(feedsDir, `${race.canonicalSessionId}.ndjson.gz`), out.snapshots);
  reduced.push(entry);
  process.stdout.write(`T71 2026 ${(out.meta?.venue ?? '').padEnd(20)} -> ${race.canonicalSessionId}  ${out.snapshots.length}r  win#${winner} ${verdict} ${asRaced === 'match' ? '' : '(as-raced)'} ${validationOk ? 'OK' : 'EXCLUDED'}\n`);
}

// --- (c) late-2026 direct Race Control captures -------------------------------
// These packs are produced by export-live-captures.mjs from sqlite opened with
// -readonly. They are already capture-shaped source observations, so the replay
// preserves native timestamps and does not interpolate between them.
for (const capture of liveCaptureManifest.sessions ?? []) {
  if (capture.sessionType !== 'race' || !capture.replayArtifact) continue;
  const feedPath = join(REPO_ROOT, capture.replayArtifact);
  const feedArtifact = capture.replayArtifact.replace(/^analysis\/replay-feeds\/output\//, '');
  let rows;
  try {
    const { gunzipSync } = await import('node:zlib');
    rows = gunzipSync(readFileSync(feedPath)).toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
  } catch (error) {
    excluded.push({
      id: capture.captureSessionKey,
      canonicalSessionId: capture.canonicalSessionId,
      sourceTier: 'race_control_capture',
      reason: `capture feed unreadable: ${error.message}`,
    });
    continue;
  }
  const flags = flagSanity(rows);
  const bryceSamples = rows.filter((row) =>
    row.raw.timing.timing_results.Item.some((item) => String(item.DriverID) === BRYCE_DRIVER_ID)
  ).length;
  const finalOrder = rows.at(-1).raw.timing.timing_results.Item
    .filter((row) => Number(row.rank ?? row.liveRank) > 0)
    .sort((a, b) => Number(a.rank ?? a.liveRank) - Number(b.rank ?? b.liveRank))
    .map((row) => String(row.no));
  const watchable = rows.length >= MIN_WATCHABLE_SAMPLES && bryceSamples >= MIN_WATCHABLE_SAMPLES && flags.ok && finalOrder.length > 0;
  const canonicalOfficialSessionId = numericSuffix(capture.canonicalSessionId);
  const entry = {
    id: capture.captureSessionKey,
    canonicalSessionId: capture.canonicalSessionId,
    sessionKey: capture.canonicalSessionId,
    eventSessionId: canonicalOfficialSessionId,
    seasonYear: 2026,
    sourceTier: 'race_control_capture',
    tierLabel: TIER_LABEL.race_control_capture,
    observationBasis: 'observed_source_snapshot',
    replayInterpolated: false,
    noGps: true,
    feedArtifact,
    sourceArtifactSha256: capture.replayArtifactSha256 ?? sha256(readFileSync(feedPath)),
    interpolationCoverage: {
      maximumHoldSeconds: 0,
      withheldSeconds: 0,
      sourceGaps: [],
      note: 'Native Race Control snapshots are replayed at observed timestamps; no intermediate rows are created.',
    },
    venue: rows[0].summary.trackName,
    sessionName: 'Race',
    eventName: rows[0].raw.timing.timing_results.heartbeat.eventName,
    date: rows[0].checkedAt.slice(0, 10),
    totalLaps: Number(rows.at(-1).summary.totalLaps) || null,
    samples: rows.length,
    bryceSamples,
    firstCheckedAt: rows[0].checkedAt,
    lastCheckedAt: rows.at(-1).checkedAt,
    firstGreenAt: rows[0].checkedAt,
    durationSeconds: Math.round((Date.parse(rows.at(-1).checkedAt) - Date.parse(rows[0].checkedAt)) / 1000),
    validation: {
      winner: finalOrder[0] ?? null,
      canonicalWinnerMatch: null,
      podium: finalOrder.slice(0, 3),
      finalOrder,
      flags,
      asRacedVsCanonical: 'capture_observed_pending_or_independent_of_official_classification',
      twoSource: twoSourceDiff(canonicalOfficialSessionId, finalOrder),
    },
    excludedFromAvailable: !watchable,
    watchable,
  };
  if (!watchable) entry.excludeReason = 'direct capture failed cadence/identity/flag/final-order gate';
  reduced.push(entry);
  process.stdout.write(`RC 2026 ${String(entry.venue ?? '').padEnd(20)} -> ${entry.canonicalSessionId}  ${rows.length}r ${watchable ? 'OK' : 'EXCLUDED'}\n`);
}

// --- Manifest ------------------------------------------------------------------
const sourcePriority = {racetools_capture: 1, timing71_normalized: 2, race_control_capture: 3};
const primaryByCanonical = new Map();
for (const candidate of reduced) {
  const current = primaryByCanonical.get(candidate.canonicalSessionId);
  const preferable = !current ||
    (candidate.watchable && !current.watchable) ||
    (candidate.watchable === current.watchable &&
      (sourcePriority[candidate.sourceTier] ?? 0) > (sourcePriority[current.sourceTier] ?? 0));
  if (preferable) {
    primaryByCanonical.set(candidate.canonicalSessionId, candidate);
  }
}
const primary = [...primaryByCanonical.values()];
const alternateSessions = reduced.filter((candidate) => primaryByCanonical.get(candidate.canonicalSessionId) !== candidate);
for (const selected of primary) {
  selected.alternateReplaySources = alternateSessions
    .filter((candidate) => candidate.canonicalSessionId === selected.canonicalSessionId)
    .map((candidate) => ({
      sourceTier: candidate.sourceTier,
      feedArtifact: candidate.feedArtifact,
      samples: candidate.samples,
      firstCheckedAt: candidate.firstCheckedAt,
      lastCheckedAt: candidate.lastCheckedAt,
    }));
}
const watchable = primary.filter((r) => r.watchable);
const manifest = {
  artifact: 'replay-feeds-manifest',
  generatedAt: new Date().toISOString(),
  note: 'Lake-fed replay feeds for the Time Machine. Every session is source-tiered and validated; failing sessions are excluded from available() with the reason recorded. Classification/final order shown is as-raced (the honesty line at the checkered); canonical is the validation reference.',
  clockCaveat: 'RaceTools feeds carry a session-local virtual clock (seconds-of-day on the session date, labelled Z) — correct year/date, NOT UTC-accurate; the replay uses it only as a relative virtual clock. Timing71 feeds carry real UTC epoch timestamps.',
  interpolationPolicy: {
    derivedReplayCadenceSeconds: 1,
    maximumHoldSeconds: MAX_INTERPOLATION_HOLD_SECONDS,
    behaviorAfterMaximumHold: 'withhold rows until the next observed source heartbeat/frame',
    directCaptureRows: 'native observed timestamps; no interpolation',
  },
  scope: {
    racetools_2024_25_races: primary.filter((r) => r.sourceTier === 'racetools_capture').length,
    timing71_2026_races: primary.filter((r) => r.sourceTier === 'timing71_normalized').length,
    raceControlCapture_2026_races: primary.filter((r) => r.sourceTier === 'race_control_capture').length,
    practiceQualifyingShipped: 0,
    practiceQualifyingNote: 'Practice/qualifying (slice c) intentionally not shipped: a validated race subset over an unvalidated sweep.'
  },
  counts: {
    reduced: primary.length,
    sourceCandidates: reduced.length,
    alternateSources: alternateSessions.length,
    watchable: watchable.length,
    excluded: primary.length - watchable.length + excluded.length
  },
  tierLabels: TIER_LABEL,
  sessions: primary,
  alternateSessions,
  excludedSessions: excluded
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
process.stdout.write(`\nmanifest: ${primary.length} primary from ${reduced.length} source candidates, ${watchable.length} watchable, ${alternateSessions.length} retained alternates -> ${manifestPath}\n`);
