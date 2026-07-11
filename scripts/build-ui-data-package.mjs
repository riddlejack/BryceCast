import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';

import { buildPointsProjectionState } from './live-points-state.mjs';
import { analyticsPython, runPredictiveRaceIntelligence } from './run-predictive-race-intelligence.mjs';

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, 'analysis/ui-data-package/ui-data-package.json');

const sources = {
  canonicalDataset: 'data/career/career.dataset.json',
  manifest: 'analysis/ui-contract/ui-metric-manifest.json',
  uiReadyArtifacts: 'analysis/ui-ready-artifacts.json',
  validationReport: 'data/career/reports/validation-report.json',
  ingestionSummary: 'data/career/reports/ingestion-summary.json',
  coverageMatrix: 'data/career/reports/career-coverage-matrix.json',
  historyBryce: 'public/data/history-bryce.json',
  futureWeekendPrep: 'analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv',
  raceDebriefScores: 'analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv',
  indyNxtLapTimeline: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_lap_timeline.csv',
  fullFieldLapDynamicsByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv',
  incidentPenaltyContext: 'analysis/indy-nxt-discovery/output/deep_dive/tables/incident_penalty_context.csv',
  teamContextByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv',
  championshipProgression: 'analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv',
  sourceFamilyAudit: 'analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv',
  contextEventGapBoundary: 'analysis/context-event-narrative-layer/output/gap_source_boundary_context.csv',
  prepSessionSignals: 'analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv',
  fieldStrengthByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/field_strength_by_race.csv',
  headToHead: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv',
  sectionResultsDeepByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv',
  leaderLapContext: 'analysis/indy-nxt-discovery/output/deep_dive/tables/leader_lap_context.csv',
  careerSeriesSummary: 'analysis/career-parity/output/tables/career_series_result_summary.csv',
  careerMetricParity: 'analysis/career-parity/output/tables/career_metric_family_parity.csv',
  careerResultConversion: 'analysis/career-parity/output/tables/career_result_conversion.csv',
  predictiveSummary: 'analysis/predictive-race-intelligence/output/summary.json',
  predictiveInventory: 'analysis/predictive-race-intelligence/output/analytics_inventory_registry.json',
  predictiveModelScorecard: 'analysis/predictive-race-intelligence/output/model_scorecard.json',
  predictiveContextPackManifest: 'analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json',
  predictiveCareerPriorMatrix: 'analysis/predictive-race-intelligence/output/career_prior_matrix.csv',
  predictiveIndyFeatureMatrix: 'analysis/predictive-race-intelligence/output/indy_nxt_feature_matrix.csv',
  predictiveBuilderScript: 'analysis/predictive-race-intelligence/scripts/build_predictive_race_intelligence.py',
  predictiveValidatorScript: 'analysis/predictive-race-intelligence/scripts/validate_predictive_race_intelligence.py',
  sectionLapDeepDiveSummary: 'analysis/indy-nxt-section-lap-deep-dive/output/summary.json',
  sectionLapContextPack: 'analysis/indy-nxt-section-lap-deep-dive/output/context-packs/indy-nxt-section-lap-context.json',
  sectionLapBuilderScript: 'analysis/indy-nxt-section-lap-deep-dive/scripts/build_indy_nxt_section_lap_deep_dive.py',
  sectionLapValidatorScript: 'analysis/indy-nxt-section-lap-deep-dive/scripts/validate_indy_nxt_section_lap_deep_dive.py',
  raceLapSectionSummary: 'analysis/indy-nxt-race-lap-section-enhancement/output/summary.json',
  raceLapSectionContextPack: 'analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/indy-nxt-race-lap-section-context.json',
  raceLapSectionBuilderScript: 'analysis/indy-nxt-race-lap-section-enhancement/scripts/build_indy_nxt_race_lap_section_enhancement.py',
  raceLapSectionValidatorScript: 'analysis/indy-nxt-race-lap-section-enhancement/scripts/validate_indy_nxt_race_lap_section_enhancement.py',
  predictiveRunnerScript: 'scripts/run-predictive-race-intelligence.mjs',
  uiDataPackageBuilderScript: 'scripts/build-ui-data-package.mjs',
  uiDataPackageValidatorScript: 'scripts/validate-ui-data-package.mjs'
};

const requiredSourceKeys = Object.keys(sources);

const readText = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records
    .filter((record) => record.some((value) => value !== ''))
    .map((record) => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ''])));
};

const readCsv = (relativePath) => parseCsv(readText(relativePath));

const runContextEventNarrativeLayer = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/context-event-narrative-layer/scripts/build_context_event_narrative_layer.py',
    'analysis/context-event-narrative-layer/scripts/validate_context_event_narrative_layer.py'
  ]) {
    const result = spawnSync(python, [script], { cwd: repoRoot, stdio: 'inherit' });
    if (result.error) {
      throw new Error(`Failed to run ${script} with ${python}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`${script} exited ${result.status ?? 'without a status'} using ${python}`);
    }
  }
};

const runSupplementalContextPacks = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/indy-nxt-section-lap-deep-dive/scripts/build_indy_nxt_section_lap_deep_dive.py',
    'analysis/indy-nxt-section-lap-deep-dive/scripts/validate_indy_nxt_section_lap_deep_dive.py',
    'analysis/indy-nxt-race-lap-section-enhancement/scripts/build_indy_nxt_race_lap_section_enhancement.py',
    'analysis/indy-nxt-race-lap-section-enhancement/scripts/validate_indy_nxt_race_lap_section_enhancement.py'
  ]) {
    const result = spawnSync(python, [script], { cwd: repoRoot, stdio: 'inherit' });
    if (result.error) {
      throw new Error(`Failed to run ${script} with ${python}: ${result.error.message}`);
    }
    if (result.status !== 0) {
      throw new Error(`${script} exited ${result.status ?? 'without a status'} using ${python}`);
    }
  }
};

const gitHead = () => {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const percentOrNull = (value) => {
  const parsed = numberOrNull(value);
  return parsed === null ? null : Math.round(parsed * 1000) / 10;
};

const dateMs = (value) => {
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const sourceRef = (key, note) => ({ key, path: sources[key], note });

const sourceKeyFromPath = (relativePath) =>
  String(relativePath ?? 'source')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'source';

const venueSlug = (trackName) => {
  const normalized = String(trackName ?? '').toLowerCase();
  if (normalized.includes('mid-ohio')) return 'mid_ohio';
  return (
    normalized
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'track'
  );
};

const supplementalContextPackRef = (relativePath, role) => ({
  key: `supplemental:${sourceKeyFromPath(relativePath)}`,
  role,
  ...summarizeArtifact(relativePath)
});

const uiSourceRefFromContextPackRef = (ref) => ({
  key: `context-pack:${sourceKeyFromPath(ref.path)}`,
  path: ref.path,
  note: ref.role ?? ref.note ?? 'Context-pack source.',
  bytes: ref.bytes,
  sha256: ref.sha256
});

const incidentPenaltyFromContextPack = (pack) => {
  const context = pack.incidentPenalty ?? pack.raceContext;
  if (!context) return null;
  return {
    sourceState: pack.sourceState ?? null,
    sessionIncidentCount: numberOrNull(context.sessionIncidentCount),
    sessionPenaltyCount: numberOrNull(context.sessionPenaltyCount),
    bryceIncidentCount: numberOrNull(context.bryceIncidentCount),
    brycePenaltyCount: numberOrNull(context.brycePenaltyCount),
    bryceIncidentDescriptions: context.bryceIncidentDescriptions ?? null,
    brycePenaltyDescriptions: context.brycePenaltyDescriptions ?? null,
    leaderEntropy: numberOrNull(context.leaderEntropy),
    topLeader: context.topLeader ?? null,
    topLeaderShare: percentOrNull(context.topLeaderShare),
    weatherContext: context.weatherContext ?? null,
    policy: 'source_bounded_context_pack'
  };
};

const coveredByUiFixtures = (contract) => /live-readiness hardening fixtures/i.test(contract);
const uiFixtureCoverageText = (contract) => contract.replace(/^Remaining\s+/i, 'Static UI fixture coverage: ');

const summarizeArtifact = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = fs.statSync(absolutePath);
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: relativePath,
    bytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    sha256: createHash('sha256').update(bytes).digest('hex')
  };
};

const debriefCardFromContextPack = ({ pack, packRef, label }) => ({
  label,
  sourcePayload: 'race_debrief_context_pack',
  contextPackRef: packRef,
  sessionId: pack.sessionId,
  raceLabel: pack.raceLabel,
  seasonYear: numberOrNull(pack.seasonYear),
  track: pack.track ?? null,
  teamName: pack.outcome?.teamName ?? pack.teamContext?.teamName ?? null,
  result: {
    startPosition: numberOrNull(pack.outcome?.startPosition),
    finishPosition: numberOrNull(pack.outcome?.finishPosition),
    positionGain: numberOrNull(pack.outcome?.positionGain),
    finishPercentile: percentOrNull(pack.outcome?.finishPercentile),
    points: numberOrNull(pack.outcome?.points),
    cumulativePoints: numberOrNull(pack.outcome?.cumulativePoints),
    standingRank: numberOrNull(pack.outcome?.standingRank)
  },
  analysis: pack.conversion
    ? {
        archetype: pack.conversion.archetype ?? null,
        bestLapRank: numberOrNull(pack.conversion.bestLapRank),
        conversionPercentileDelta: percentOrNull(pack.conversion.conversionPercentileDelta),
        labelReviewState: pack.conversion.labelReviewState ?? null,
        paceIndex: percentOrNull(pack.conversion.paceIndex)
      }
    : null,
  lapStory: pack.lapStory ?? null,
  incidentPenalty: incidentPenaltyFromContextPack(pack),
  raceContext: pack.raceContext ?? null,
  teamContext: pack.teamContext ?? null,
  sectionSignal: pack.sectionSignal ?? null,
  chartSpecs: pack.chartSpecs ?? [],
  sourceState: pack.sourceState,
  confidence: pack.confidence,
  caveat: (pack.caveats ?? []).join(' ') || 'Race debrief context pack has no public-copy caveat.',
  sourceRefs: (pack.sourceRefs ?? []).map(uiSourceRefFromContextPackRef)
});

const eventFromUpcomingContextPack = ({ pack, packRef }) => ({
  sourcePayload: 'upcoming_event_context_pack',
  contextPackRef: packRef,
  eventId: pack.eventId,
  eventName: pack.eventName,
  eventStartDate: pack.eventStartDate,
  trackName: pack.track?.name ?? null,
  trackType: pack.track?.type ?? null,
  trackLengthMi: numberOrNull(pack.track?.lengthMi),
  cornerCount: numberOrNull(pack.track?.cornerCount),
  sameTrack: pack.sameTrackHistory
    ? {
        raceCount: numberOrNull(pack.sameTrackHistory.raceCount),
        avgFinish: numberOrNull(pack.sameTrackHistory.avgFinish),
        avgGain: numberOrNull(pack.sameTrackHistory.avgGain),
        top10RatePct: percentOrNull(pack.sameTrackHistory.top10Rate)
      }
    : null,
  trackTypeHistory: pack.trackTypeHistory
    ? {
        raceCount: numberOrNull(pack.trackTypeHistory.raceCount),
        avgFinish: numberOrNull(pack.trackTypeHistory.avgFinish),
        avgGain: numberOrNull(pack.trackTypeHistory.avgGain),
        finishPercentileMedian: numberOrNull(pack.trackTypeHistory.finishPercentileMedian),
        top10RatePct: percentOrNull(pack.trackTypeHistory.top10Rate)
      }
    : null,
  predictionBand: pack.predictionBand ?? null,
  top10Path: pack.top10Path ?? [],
  analogRaces: pack.analogRaces ?? [],
  chartSpecs: pack.chartSpecs ?? [],
  weatherState: pack.weatherState ?? null,
  sourceState: pack.sameTrackHistory?.sourceState ?? 'predictive_context_pack'
});

/* ------------------------------------------------------------------
   Race Week prep modules (docs/CREATIVE_DIRECTION.md): start→finish
   conversion rows for the next event's track type, the practice→race
   "Friday signal", and a points-standings snapshot from our last COLD
   Race Control capture. All rows carry official status so the one
   mechanical DNF is labeled, never hidden and never silently dropped.
   ------------------------------------------------------------------ */

const buildNextEventPrep = ({ nextEvent, debriefScores, prepSignals, resultsBySession }) => {
  if (!nextEvent) return null;
  const races = debriefScores
    .filter((row) => row.trackType === nextEvent.trackType)
    .map((row) => {
      const official = resultsBySession.get(row.sessionId) ?? null;
      return {
        sessionId: row.sessionId,
        raceLabel: row.raceLabel,
        seasonYear: numberOrNull(row.seasonYear),
        trackName: row.trackName,
        sameTrack: row.trackName === nextEvent.trackName,
        startPosition: numberOrNull(row.startPosition),
        finishPosition: numberOrNull(row.finishPosition),
        positionGain: numberOrNull(row.positionGain),
        finishPercentile: numberOrNull(row.finishPercentile),
        officialStatus: official?.status ?? null,
        fieldSize: official?.fieldSize ?? null
      };
    });
  if (races.length === 0) return null;

  const clean = races.filter((row) => row.officialStatus === 'running');
  const mean = (values) => (values.length === 0 ? null : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10);
  const raceSummary = {
    raceCount: races.length,
    movedForwardCount: races.filter((row) => (row.positionGain ?? 0) > 0).length,
    cleanRaceCount: clean.length,
    cleanAvgFinish: mean(clean.map((row) => row.finishPosition).filter((value) => value !== null)),
    cleanAvgGain: mean(clean.map((row) => row.positionGain).filter((value) => value !== null)),
    cleanTop10Count: clean.filter((row) => (row.finishPosition ?? 99) <= 10).length,
    nonRunningStatuses: races.filter((row) => row.officialStatus !== 'running').map((row) => ({ sessionId: row.sessionId, officialStatus: row.officialStatus }))
  };

  const raceBySession = new Map(races.map((row) => [row.sessionId, row]));
  const fridaySignal = prepSignals
    .filter((row) => raceBySession.has(row.sessionId) && numberOrNull(row.bestPracticeRank) !== null)
    .map((row) => {
      const race = raceBySession.get(row.sessionId);
      return {
        sessionId: row.sessionId,
        raceLabel: row.raceLabel,
        seasonYear: race.seasonYear,
        trackName: race.trackName,
        sameTrack: race.sameTrack,
        bestPracticeRank: numberOrNull(row.bestPracticeRank),
        bestQualifyingRank: numberOrNull(row.bestQualifyingRank),
        raceStart: numberOrNull(row.raceStart),
        raceFinish: numberOrNull(row.raceFinish),
        officialStatus: race.officialStatus,
        practiceFieldMedian: numberOrNull(row.practiceFieldMedian)
      };
    });
  const fridayClean = fridaySignal.filter((row) => row.officialStatus === 'running' && row.raceFinish !== null);
  const fridayDeltas = fridayClean.map((row) => row.bestPracticeRank - row.raceFinish).sort((left, right) => left - right);
  const fridaySummary = {
    weekendCount: fridayClean.length,
    finishBeatBestPractice: fridayClean.filter((row) => row.raceFinish < row.bestPracticeRank).length,
    finishMatchedBestPractice: fridayClean.filter((row) => row.raceFinish === row.bestPracticeRank).length,
    medianPositionsBetter: fridayDeltas.length === 0 ? null : fridayDeltas[Math.floor(fridayDeltas.length / 2)]
  };

  return {
    eventId: nextEvent.eventId,
    trackType: nextEvent.trackType,
    trackName: nextEvent.trackName,
    races,
    raceSummary,
    fridaySignal,
    fridaySummary,
    sourceState: 'official_results_with_official_status_join',
    caveats: [
      'Rows are Bryce INDY NXT races on this track type; official result status labels non-running races (summaries that exclude them must say so on screen).',
      'Practice and group qualifying are rank/context signals; session formats are not fully equivalent across weekends.'
    ]
  };
};

const readLatestColdRaceCapture = () => {
  const dbPath = path.join(repoRoot, 'data/live/brycecast.sqlite');
  if (!fs.existsSync(dbPath)) return { available: false, reason: 'live capture database not present' };
  const query = "SELECT checked_at || '\t' || session_key || '\t' || payload_json FROM race_snapshots WHERE flag='COLD' AND session_name LIKE 'Race%' ORDER BY id DESC LIMIT 1";
  const result = spawnSync('sqlite3', [dbPath, query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout.trim()) {
    return { available: false, reason: `no COLD race snapshot readable from live capture (${result.stderr?.trim() || 'empty result'})` };
  }
  const [checkedAt, sessionKey, ...rest] = result.stdout.trim().split('\t');
  try {
    return { available: true, checkedAt, sessionKey, payload: JSON.parse(rest.join('\t')) };
  } catch (error) {
    return { available: false, reason: `COLD snapshot payload did not parse: ${error.message}` };
  }
};

const buildStandingsSnapshot = ({ headToHeadRows, racesRemaining, roundsCompleted }) => {
  const capture = readLatestColdRaceCapture();
  if (!capture.available) return { available: false, reason: capture.reason };
  const timing = capture.payload?.raw?.timing?.timing_results ?? {};
  const heartbeat = timing.heartbeat ?? {};
  const items = Array.isArray(timing.Item) ? timing.Item : [];
  const seriesOk = heartbeat.Series === 'L' && heartbeat.SessionType === 'R';
  if (!seriesOk || items.length === 0) {
    return { available: false, reason: 'latest COLD capture is not an INDY NXT race with timing rows' };
  }

  const headToHeadByName = new Map(headToHeadRows.map((row) => [row.driverName.toLowerCase(), row]));
  const entries = items
    .map((item) => {
      const driverName = `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim();
      const headToHead = headToHeadByName.get(driverName.toLowerCase()) ?? null;
      return {
        carNo: String(item.no ?? ''),
        driverName,
        teamName: item.team ?? null,
        points: numberOrNull(item.runningDriverPoints),
        isBryce: String(item.DriverID ?? '') === '2143' && String(item.no ?? '') === '9',
        headToHead: headToHead
          ? {
              racesTogether: numberOrNull(headToHead.racesTogether),
              bryceAhead: numberOrNull(headToHead.bryceAhead),
              bryceBehind: numberOrNull(headToHead.bryceBehind)
            }
          : null
      };
    })
    .filter((entry) => entry.points !== null)
    .sort((left, right) => right.points - left.points)
    .map((entry, index) => ({ ...entry, pointsRankInCapture: index + 1 }));

  const bryce = entries.find((entry) => entry.isBryce) ?? null;
  if (!bryce) return { available: false, reason: 'no guarded Bryce row in the latest COLD capture' };

  return {
    available: true,
    capturedAt: capture.checkedAt,
    capturePath: 'data/live/brycecast.sqlite',
    sessionKey: capture.sessionKey,
    eventName: heartbeat.eventName ?? null,
    sessionName: heartbeat.SessionName ?? null,
    seriesGuard: { series: heartbeat.Series ?? null, sessionType: heartbeat.SessionType ?? null, ok: seriesOk },
    roundsCompleted,
    racesRemaining,
    bryce: { carNo: bryce.carNo, points: bryce.points, pointsRankInCapture: bryce.pointsRankInCapture },
    entries,
    sourceState: 'race_control_capture_cold_unofficial',
    caveats: [
      'Points come from our Race Control capture at the end of the last completed race; official standings can differ after post-race penalties or adjustments.',
      'Only cars in that session appear; part-season drivers who missed it are not listed.',
      'Career head-to-head counts every shared INDY NXT race since 2024, not just this season.'
    ]
  };
};

const fixtureCheckedAt = 'fixture';

const buildFixtureTimingRows = ({ state, pointsProfile, timingScenario = 'normal' }) => {
  if (state === 'blocked' && timingScenario !== 'no_bryce_active') return [];
  return Array.from({ length: 25 }, (_, index) => {
    const isBryce = index === 0 && state !== 'wrong_series' && timingScenario !== 'no_bryce_active';
    const baseRow = {
      no: isBryce ? '9' : String(index + 1),
      DriverID: isBryce ? '2143' : String(9000 + index),
      firstName: isBryce ? 'Bryce' : 'Fixture',
      lastName: isBryce ? 'Aron' : `Driver ${index + 1}`,
      rank: String(index + 1),
      runningDriverPoints: '',
      totalDriverPoints: '',
      totalEntrantPoints: ''
    };
    if (pointsProfile === 'full') {
      return {
        ...baseRow,
        runningDriverPoints: String(Math.max(0, 25 - index)),
        totalDriverPoints: String(143 - index),
        totalEntrantPoints: String(160 - index)
      };
    }
    if (pointsProfile === 'partial') {
      return index < 8 ? { ...baseRow, runningDriverPoints: String(Math.max(0, 12 - index)) } : baseRow;
    }
    return baseRow;
  });
};

const buildFixtureHeartbeat = (state, timingScenario = 'normal') =>
  state === 'blocked' && timingScenario !== 'no_bryce_active'
    ? null
    : {
        eventName: state === 'wrong_series' ? '10th Annual Bommarito Automotive Group 500' : 'Grand Prix at Road America Race 1',
        EventID: state === 'wrong_series' ? '709' : '710',
        EventSessionID: state === 'wrong_series' ? '6751' : '6762',
        SessionName: 'Race',
        SessionType: 'Race',
        SessionStatus: state === 'pre_session' ? 'Cold' : state === 'stale' ? 'Green' : 'Green',
        Series: state === 'wrong_series' ? 'I' : 'L',
        currentFlag: state === 'pre_session' ? 'COLD' : 'GREEN',
        lapNumber: state === 'pre_session' ? '0' : '12',
        totalLaps: '20',
        trackName: state === 'wrong_series' ? 'World Wide Technology Raceway' : 'Road America',
        trackType: state === 'wrong_series' ? 'O' : 'R',
        trackLength: state === 'wrong_series' ? '1.25' : '4.048'
      };

const summarizeFixtureHeartbeat = (heartbeat) => ({
  eventName: heartbeat?.eventName ?? null,
  eventId: heartbeat?.EventID ?? null,
  eventSessionId: heartbeat?.EventSessionID ?? null,
  sessionName: heartbeat?.SessionName ?? null,
  sessionType: heartbeat?.SessionType ?? null,
  sessionStatus: heartbeat?.SessionStatus ?? null,
  series: heartbeat?.Series ?? null,
  flag: heartbeat?.currentFlag ?? null,
  lap: numberOrNull(heartbeat?.lapNumber),
  totalLaps: numberOrNull(heartbeat?.totalLaps),
  trackName: heartbeat?.trackName ?? null,
  trackType: heartbeat?.trackType ?? null
});

const compactFixtureTimingRow = (row, heartbeat) => ({
  no: row?.no ?? '',
  firstName: row?.firstName ?? '',
  lastName: row?.lastName ?? '',
  name: `${row?.firstName ?? ''} ${row?.lastName ?? ''}`.trim(),
  team: row?.team ?? 'Fixture Team',
  rank: numberOrNull(row?.rank),
  liveRank: numberOrNull(row?.rank),
  startPosition: numberOrNull(row?.startPosition),
  status: row?.status ?? 'Running',
  comment: row?.comment ?? '',
  gap: row?.gap ?? '',
  liveGap: row?.liveGap ?? '',
  diff: row?.diff ?? '',
  laps: row?.laps ?? heartbeat?.lapNumber ?? '',
  bestLapTime: row?.bestLapTime ?? '',
  lastLapTime: row?.lastLapTime ?? '',
  bestSpeed: numberOrNull(row?.BestSpeed),
  lastSpeed: numberOrNull(row?.LastSpeed),
  averageSpeed: numberOrNull(row?.AverageSpeed),
  passes: numberOrNull(row?.Passes),
  passed: numberOrNull(row?.Passed),
  pitStops: numberOrNull(row?.pitStops),
  lastPitLap: numberOrNull(row?.lastPitLap),
  sincePitLap: numberOrNull(row?.sincePitLap),
  tire: row?.Tire ?? '',
  overtakeRemain: numberOrNull(row?.OverTake_Remain),
  overtakeActive: row?.OverTake_Active ?? '',
  lapDistance: numberOrNull(row?.lapDistance),
  liveDiffAhead: row?.liveDiffAhead ?? '',
  liveDiffBehind: row?.liveDiffBehind ?? '',
  runningDriverPoints: numberOrNull(row?.runningDriverPoints),
  totalDriverPoints: numberOrNull(row?.totalDriverPoints),
  totalEntrantPoints: numberOrNull(row?.totalEntrantPoints),
  bryce: row?.DriverID === '2143'
});

const buildFixtureRaceWeekend = ({ state, sourceState, heartbeat }) => ({
  checkedAt: fixtureCheckedAt,
  eventId: state === 'wrong_series' ? null : heartbeat?.EventID ?? null,
  eventSessionId: state === 'wrong_series' ? null : heartbeat?.EventSessionID ?? null,
  eventName: state === 'wrong_series' ? null : heartbeat?.eventName ?? null,
  sessionName: state === 'wrong_series' ? null : heartbeat?.SessionName ?? null,
  sessionType: state === 'wrong_series' ? null : heartbeat?.SessionType ?? null,
  sessionStatus: state === 'wrong_series' ? null : heartbeat?.SessionStatus ?? null,
  trackName: state === 'wrong_series' ? null : heartbeat?.trackName ?? null,
  trackType: state === 'wrong_series' ? null : heartbeat?.trackType ?? null,
  trackLength: state === 'wrong_series' ? null : numberOrNull(heartbeat?.trackLength),
  flag: state === 'wrong_series' ? null : heartbeat?.currentFlag ?? null,
  lap: state === 'wrong_series' ? null : numberOrNull(heartbeat?.lapNumber),
  totalLaps: state === 'wrong_series' ? null : numberOrNull(heartbeat?.totalLaps),
  startsAt: null,
  estimatedGreenFlag: null,
  endsAt: null,
  timezone: 'America/Chicago',
  broadcastRoute: state === 'wrong_series' ? null : { source: 'fixture', alternates: [], audio: [], international: [] },
  sourceState,
  readiness: state
});

const buildFixtureEndpoints = ({ state, timingRows, bryce, weatherState }) => {
  const timingUnavailable = state === 'blocked' && timingRows.length === 0;
  const timingStale = state === 'stale';
  return [
    {
      id: 'timing',
      role: 'primary_timing',
      series: state === 'wrong_series' ? 'INDYCAR Series' : 'INDY NXT',
      cadence: 'fast',
      ok: !timingUnavailable,
      status: timingUnavailable ? null : 200,
      sourceState: timingUnavailable ? 'error' : timingStale ? 'stale' : 'live',
      readinessState: timingUnavailable ? 'unavailable' : state === 'wrong_series' ? 'wrong_session' : timingStale ? 'stale' : 'available',
      checkedAgeSeconds: timingStale ? 12 : 0,
      modifiedAgeSeconds: timingStale ? 120 : 0,
      freshnessLabel: timingUnavailable ? 'timing unavailable' : timingStale ? 'checked 12s ago; modified 2m ago' : 'checked 0s ago; modified 0s ago',
      sourceSummary: { brycePresent: Boolean(bryce), rows: timingRows.length },
      note: timingUnavailable ? 'Synthetic blocked fixture with no reachable timing rows.' : ''
    },
    {
      id: 'drivers_nxt',
      role: 'driver_identity_profile',
      series: 'INDY NXT',
      cadence: 'medium',
      ok: state !== 'blocked',
      status: state === 'blocked' ? null : 200,
      sourceState: state === 'blocked' ? 'error' : 'live',
      readinessState: state === 'blocked' ? 'unavailable' : 'available',
      checkedAgeSeconds: state === 'blocked' ? null : 0,
      modifiedAgeSeconds: state === 'blocked' ? null : 0,
      freshnessLabel: state === 'blocked' ? 'driver profile unavailable' : 'checked 0s ago; modified 0s ago',
      sourceSummary: { bryceProfilePresent: Boolean(bryce) },
      note: ''
    },
    {
      id: 'weather_live',
      role: 'weather_context',
      series: 'external',
      cadence: 'medium',
      ok: weatherState !== 'error',
      status: weatherState === 'error' ? null : 200,
      sourceState: weatherState,
      readinessState: weatherState === 'live' ? 'available' : weatherState === 'partial' ? 'partial' : 'unavailable',
      checkedAgeSeconds: weatherState === 'error' ? null : 0,
      modifiedAgeSeconds: weatherState === 'error' ? null : 0,
      freshnessLabel: weatherState === 'error' ? 'weather unavailable' : `weather ${weatherState}`,
      sourceSummary: { trackId: 'track_road_america' },
      note: 'Synthetic fixture endpoint for live weather display-state coverage.'
    }
  ];
};

const buildFixtureGates = ({ state, timingRows, bryce, points, weatherState, replayState }) => [
  {
    id: 'timing_reachable',
    state: state === 'blocked' && timingRows.length === 0 ? 'fail' : 'pass',
    summary: state === 'blocked' && timingRows.length === 0 ? 'Race Control timing endpoint is unavailable in this fixture.' : 'Race Control timing endpoint is reachable.'
  },
  {
    id: 'indy_nxt_heartbeat',
    state: state === 'wrong_series' || (state === 'blocked' && timingRows.length === 0) ? 'fail' : 'pass',
    summary: state === 'wrong_series' ? 'Timing heartbeat is not INDY NXT.' : state === 'blocked' && timingRows.length === 0 ? 'Timing heartbeat is unavailable.' : 'Timing heartbeat is INDY NXT-compatible.'
  },
  {
    id: 'bryce_identity',
    state: bryce ? 'pass' : 'fail',
    summary: bryce ? 'Bryce car #9 passed driver-id/name guard.' : 'No guarded Bryce car #9 row is present.'
  },
  {
    id: 'timing_freshness',
    state: state === 'stale' ? 'fail' : state === 'pre_session' ? 'warn' : state === 'blocked' && timingRows.length === 0 ? 'fail' : 'pass',
    summary: state === 'stale' ? 'Timing source is stale in this fixture.' : `Timing fixture has ${timingRows.length} row(s).`
  },
  {
    id: 'enrichment_sources',
    state: state === 'degraded' ? 'warn' : state === 'blocked' ? 'fail' : 'pass',
    summary: state === 'degraded' ? 'One enrichment source is partial in this fixture.' : 'Required enrichment sources are available or not blocking.'
  },
  {
    id: 'points_fields',
    state: ['race_control_live', 'partial'].includes(points.mode) ? 'pass' : 'warn',
    summary: bryce ? 'Race Control points fields inspected for Bryce.' : 'Live Bryce points are unavailable without a guarded Bryce row.'
  },
  {
    id: 'weather',
    state: weatherState === 'live' ? 'pass' : weatherState === 'partial' ? 'warn' : 'fail',
    summary: `Weather source is ${weatherState}.`
  },
  {
    id: 'replay_archive',
    state: replayState === 'ready' ? 'pass' : 'warn',
    summary: `Replay archive is ${replayState}.`
  }
];

const replayCounts = {
  ready: 120,
  tiny: 6,
  empty: 0,
  missing: 0,
  repeated_cold: 6
};

const buildReplayFixture = (replayState, warnings = []) => ({
  available: !['missing'].includes(replayState),
  generatedAt: fixtureCheckedAt,
  archiveState: replayState === 'repeated_cold' ? 'tiny' : replayState,
  count: replayCounts[replayState] ?? 0,
  returned: replayState === 'ready' ? 5 : Math.min(5, replayCounts[replayState] ?? 0),
  selectedCount: replayCounts[replayState] ?? 0,
  sessionKey: replayState === 'missing' ? null : 'fixture-road-america-race-1',
  sessions: replayState === 'missing' ? [] : [{ sessionKey: 'fixture-road-america-race-1', count: replayCounts[replayState] ?? 0, firstCheckedAt: fixtureCheckedAt, lastCheckedAt: fixtureCheckedAt }],
  summary: {
    firstRank: replayState === 'ready' ? 8 : null,
    lastRank: replayState === 'ready' ? 6 : null,
    bestRank: replayState === 'ready' ? 5 : null,
    worstRank: replayState === 'ready' ? 10 : null,
    sourceStateCounts: { live: replayState === 'ready' ? 120 : 0, cold: replayState === 'repeated_cold' ? 6 : 0 }
  },
  rows: replayState === 'ready' ? [{ checkedAt: fixtureCheckedAt, rank: 8, liveRank: 8, laps: '12', sourceState: 'live', flag: 'GREEN' }] : [],
  warnings
});

const buildWeatherFixture = (weatherState) => ({
  schemaVersion: 'live-weather.v1',
  checkedAt: fixtureCheckedAt,
  sourceState: weatherState,
  source: 'NWS API',
  track: { id: 'track_road_america', name: 'Road America', latitude: 43.797, longitude: -87.989 },
  point: '43.7970,-87.9890',
  grid: {
    office: weatherState === 'error' ? null : 'MKX',
    gridX: weatherState === 'error' ? null : 72,
    gridY: weatherState === 'error' ? null : 43,
    forecastZone: weatherState === 'error' ? null : 'fixture-forecast-zone',
    county: weatherState === 'error' ? null : 'fixture-county',
    fireWeatherZone: weatherState === 'error' ? null : 'fixture-fire-weather-zone'
  },
  station: weatherState === 'error' ? null : { id: 'fixture-ketb', url: 'https://api.weather.gov/stations/fixture-ketb' },
  observation:
    weatherState === 'error'
      ? null
      : {
          observedAt: fixtureCheckedAt,
          ambientTempF: 72,
          humidityPct: 58,
          dewPointF: 56,
          windSpeedMph: 9,
          windGustMph: weatherState === 'partial' ? null : 16,
          windDirectionDeg: 220,
          precipitationIn: 0,
          rawCondition: weatherState === 'partial' ? 'partly available' : 'clear'
        },
  forecastHourly:
    weatherState === 'error'
      ? []
      : [{ number: 1, name: 'This Hour', startTime: fixtureCheckedAt, endTime: fixtureCheckedAt, isDaytime: true, temperature: 72, temperatureUnit: 'F', probabilityOfPrecipitationPct: weatherState === 'partial' ? null : 10, dewpointC: 13.3, relativeHumidityPct: 58, windSpeed: '9 mph', windDirection: 'SW', shortForecast: 'Clear', detailedForecast: 'Fixture hourly weather.' }],
  forecast:
    weatherState === 'error'
      ? []
      : [{ number: 1, name: 'Race Day', startTime: fixtureCheckedAt, endTime: fixtureCheckedAt, isDaytime: true, temperature: 72, temperatureUnit: 'F', probabilityOfPrecipitationPct: weatherState === 'partial' ? null : 10, dewpointC: 13.3, relativeHumidityPct: 58, windSpeed: '9 mph', windDirection: 'SW', shortForecast: 'Clear', detailedForecast: 'Fixture daily weather.' }],
  alerts: [],
  probes: [
    { id: 'nws_points', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_observation_stations', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_latest_observation', ok: weatherState === 'live', status: weatherState === 'error' ? null : weatherState === 'partial' ? 503 : 200 },
    { id: 'nws_hourly_forecast', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_forecast', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 },
    { id: 'nws_alerts', ok: weatherState !== 'error', status: weatherState === 'error' ? null : 200 }
  ],
  cache: { status: 'fixture', ttlSeconds: 300 },
  warnings: weatherState === 'partial' ? ['One weather probe failed in this fixture.'] : weatherState === 'error' ? ['Weather payload unavailable in this fixture.'] : []
});

const buildLiveFixture = ({ state, severity, reason, history, variant = 'base', pointsProfile = 'none', replayState = 'tiny', replayWarnings = [], weatherState = 'live', timingScenario = 'normal' }) => {
  const timingRows = buildFixtureTimingRows({ state, pointsProfile, timingScenario });
  const bryce = timingRows.find((row) => row.DriverID === '2143') ?? null;
  const points = buildPointsProjectionState({ checkedAt: fixtureCheckedAt, timingRows, bryce, readinessState: state, history });
  const heartbeat = buildFixtureHeartbeat(state, timingScenario);
  const sourceState = state === 'blocked' && timingRows.length === 0 ? 'error' : state === 'stale' ? 'stale' : state === 'pre_session' ? 'cold' : 'live';
  const heartbeatSummary = summarizeFixtureHeartbeat(heartbeat);
  const liveTimingRows = timingRows.slice().sort((left, right) => (numberOrNull(left.rank) ?? 999) - (numberOrNull(right.rank) ?? 999)).map((row) => compactFixtureTimingRow(row, heartbeat));
  const identityGuard = { carNumber: '9', rcDriverId: '2143', matchedBy: bryce ? 'driver_id' : null, seriesOk: state !== 'wrong_series' && sourceState !== 'error' };
  const carNineExists = timingRows.some((row) => String(row?.no ?? '').trim() === '9');
  const bryceWarnings = bryce ? [] : [carNineExists ? 'Car #9 exists in this fixture but failed the Bryce INDY NXT identity guard.' : 'No Bryce timing row is present in this fixture.'];

  return {
    schemaVersion: 'live-readiness.v1',
    checkedAt: fixtureCheckedAt,
    variant,
    state,
    severity,
    reason,
    raceWeekend: buildFixtureRaceWeekend({ state, sourceState, heartbeat }),
    liveTiming: {
      checkedAt: fixtureCheckedAt,
      sourceState,
      rowCount: timingRows.length,
      bryceNo: '9',
      heartbeat: heartbeatSummary,
      rows: liveTimingRows
    },
    bryce: {
      checkedAt: fixtureCheckedAt,
      sourceState,
      readiness: state,
      heartbeat: heartbeatSummary,
      bryce: bryce ? compactFixtureTimingRow(bryce, heartbeat) : null,
      profile: bryce
        ? { driverid: '4959', rc_driver_id: '2143', name: 'Bryce Aron', firstname: 'Bryce', lastname: 'Aron', number: '9', team: 'Chip Ganassi Racing' }
        : null,
      identityGuard,
      broadcastRoute: state === 'wrong_series' ? null : { source: 'fixture', alternates: [], audio: [], international: [] },
      warnings: bryceWarnings
    },
    points,
    weather: buildWeatherFixture(weatherState),
    replay: buildReplayFixture(replayState, replayWarnings),
    sources: {
      checkedAt: fixtureCheckedAt,
      endpoints: buildFixtureEndpoints({ state, timingRows, bryce, weatherState }),
      local: { history: { path: sources.historyBryce } }
    },
    gates: buildFixtureGates({ state, timingRows, bryce, points, weatherState, replayState })
  };
};

const buildPackage = () => {
  for (const key of requiredSourceKeys) {
    const relativePath = sources[key];
    if (!fs.existsSync(path.join(repoRoot, relativePath))) {
      throw new Error(`Missing UI data source ${key}: ${relativePath}`);
    }
  }

  const manifest = readJson(sources.manifest);
  const uiReadyArtifacts = readJson(sources.uiReadyArtifacts);
  const validationReport = readJson(sources.validationReport);
  const ingestionSummary = readJson(sources.ingestionSummary);
  const coverageMatrix = readJson(sources.coverageMatrix);
  const history = readJson(sources.historyBryce);
  const sourceFamilyAudit = readCsv(sources.sourceFamilyAudit);
  const contextEventGapBoundary = readCsv(sources.contextEventGapBoundary);
  const predictiveSummary = readJson(sources.predictiveSummary);
  const predictiveInventory = readJson(sources.predictiveInventory);
  const predictiveModelScorecard = readJson(sources.predictiveModelScorecard);
  const predictiveContextPackManifest = readJson(sources.predictiveContextPackManifest);
  const predictiveChartRefs = (predictiveSummary.charts ?? []).map((chartPath) => summarizeArtifact(chartPath));

  const contextPackRefs = predictiveContextPackManifest.packs.map((pack) => ({
    ...pack,
    ...summarizeArtifact(pack.path)
  }));
  const packsByType = (type) => contextPackRefs.filter((pack) => pack.type === type);
  const contextPackPayloads = new Map(contextPackRefs.map((packRef) => [packRef.path, readJson(packRef.path)]));
  const payloadForPack = (packRef, label) => {
    const payload = contextPackPayloads.get(packRef.path);
    if (!payload) throw new Error(`Missing payload for ${label}: ${packRef.path}`);
    return payload;
  };
  const packPairsByType = (type) => packsByType(type).map((packRef) => ({ packRef, pack: payloadForPack(packRef, packRef.id) }));
  const upcomingPackPairs = packPairsByType('upcoming_event').sort((left, right) => dateMs(left.pack.eventStartDate) - dateMs(right.pack.eventStartDate) || String(left.pack.eventId).localeCompare(String(right.pack.eventId)));
  const raceDebriefPackPairs = packPairsByType('race_debrief');
  const careerLabContextPack = packsByType('career_lab')[0] ?? null;
  const liveRaceDayContextPack = packsByType('live_race_day')[0] ?? null;
  const careerLabPayload = careerLabContextPack ? payloadForPack(careerLabContextPack, 'career_lab') : null;
  if (!careerLabPayload) {
    throw new Error('Missing Career Lab context pack payload');
  }

  const upcomingEvents = upcomingPackPairs.map(eventFromUpcomingContextPack);
  const upcomingContextPackRefs = upcomingPackPairs.map(({ packRef }) => packRef);

  const canonicalDataset = readJson(sources.canonicalDataset);
  const resultsBySession = new Map(
    (canonicalDataset.results ?? [])
      .filter((row) => row.driverId === 'driver_bryce_aron')
      .map((row) => [row.sessionId, { status: row.status ?? null, fieldSize: numberOrNull(row.fieldSize) }])
  );
  const debriefScoreRows = readCsv(sources.raceDebriefScores);
  const prepSignalRows = readCsv(sources.prepSessionSignals);
  const headToHeadRows = readCsv(sources.headToHead);
  const championshipRows = readCsv(sources.championshipProgression);
  const latestSeasonYear = Math.max(...championshipRows.map((row) => numberOrNull(row.seasonYear) ?? 0));
  const nextEventPrep = buildNextEventPrep({
    nextEvent: upcomingEvents[0] ?? null,
    debriefScores: debriefScoreRows,
    prepSignals: prepSignalRows,
    resultsBySession
  });
  const standingsSnapshot = buildStandingsSnapshot({
    headToHeadRows,
    racesRemaining: upcomingEvents.length,
    roundsCompleted: championshipRows.filter((row) => numberOrNull(row.seasonYear) === latestSeasonYear).length
  });
  const nextUpcomingVenue = upcomingEvents[0]?.trackName ?? null;
  const nextUpcomingVenueSlug = venueSlug(nextUpcomingVenue);
  const nextUpcomingVenuePackSlug = nextUpcomingVenueSlug.replaceAll('_', '-');
  const supplementalPrepSectionRef = supplementalContextPackRef(
    `analysis/indy-nxt-section-lap-deep-dive/output/context-packs/${nextUpcomingVenuePackSlug}-prep-context.json`,
    'next_upcoming_venue_prep_section_context'
  );
  const supplementalRaceLapSectionRef = supplementalContextPackRef(
    `analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/${nextUpcomingVenuePackSlug}-race-context.json`,
    'next_upcoming_venue_race_lap_section_context'
  );

  const latestDebrief = raceDebriefPackPairs
    .slice()
    .sort(
      (left, right) =>
        (numberOrNull(right.pack.seasonYear) ?? 0) - (numberOrNull(left.pack.seasonYear) ?? 0) ||
        (numberOrNull(right.pack.raceOrder?.roundIndex) ?? 0) - (numberOrNull(left.pack.raceOrder?.roundIndex) ?? 0)
    )[0];
  const bestDebrief = raceDebriefPackPairs.slice().sort((left, right) => (numberOrNull(right.pack.outcome?.finishPercentile) ?? -Infinity) - (numberOrNull(left.pack.outcome?.finishPercentile) ?? -Infinity))[0];
  const worstDebrief = raceDebriefPackPairs.slice().sort((left, right) => (numberOrNull(left.pack.outcome?.finishPercentile) ?? Infinity) - (numberOrNull(right.pack.outcome?.finishPercentile) ?? Infinity))[0];
  const debriefRows = [
    { label: 'latestCompleted', pair: latestDebrief },
    { label: 'bestFinishPercentile', pair: bestDebrief },
    { label: 'lowestFinishPercentile', pair: worstDebrief }
  ].map(({ label, pair }) => debriefCardFromContextPack({ label, packRef: pair.packRef, pack: pair.pack }));

  const parityBySeries = (careerLabPayload.metricFamilyParity ?? []).reduce((acc, row) => {
    acc[row.seriesName] ??= [];
    acc[row.seriesName].push({
      metricFamily: row.metricFamily,
      metricLabel: row.metricLabel,
      parityStatus: row.parityStatus,
      uiUse: row.uiUse,
      caveat: row.caveat,
      sourceRowsOrSessions: numberOrNull(row.sourceRowsOrSessions)
    });
    return acc;
  }, {});

  const sourceInventory = {
    ...Object.fromEntries(Object.entries(sources).map(([key, relativePath]) => [key, summarizeArtifact(relativePath)])),
    supplementalPrepSectionContextPack: supplementalPrepSectionRef,
    supplementalRaceLapSectionContextPack: supplementalRaceLapSectionRef
  };

  return {
    schemaVersion: 'brycecast.uiDataPackage.v1',
    generatedAt: new Date().toISOString(),
    sourceHash: sourceInventory.canonicalDataset.sha256,
    asOfDate: predictiveSummary.asOfDate,
    baselineCommit: gitHead(),
    metricManifestBaselineCommit: manifest.baselineCommit,
    predictiveRaceIntelligenceRepoHead: predictiveSummary.repoHead,
    sourceInventory,
    packageRules: [
      'This package hydrates UI-ready data for design/build work; it does not replace canonical career ingestion or live API routes.',
      'Live weather, timing, and points remain runtime API data. Static package values are historical/prep context and fixtures.',
      'Every screen object includes source refs and caveat text for source-drawer wiring.',
      'Full analytics depth lives in predictive race-intelligence context packs; screen summaries should link to those packs instead of re-parsing raw CSVs.',
      'Visual design may change presentation, but should not change these source, confidence, or availability states in component code.'
    ],
    predictiveRaceIntelligence: {
      schemaVersion: predictiveSummary.schemaVersion,
      generatedAt: predictiveSummary.generatedAt,
      asOfDate: predictiveSummary.asOfDate,
      inventoryItems: predictiveSummary.inventoryItems,
      careerPriorRows: predictiveSummary.careerPriorRows,
      indyNxtRaceRows: predictiveSummary.indyNxtRaceRows,
      modelRows: predictiveSummary.modelRows,
      contextPackCounts: {
        upcomingEvent: predictiveSummary.upcomingEventPacks,
        raceDebrief: predictiveSummary.raceDebriefPacks,
        careerLab: predictiveSummary.careerLabPacks,
        liveRaceDay: predictiveSummary.liveRaceDayPacks
      },
      contextPackManifestPath: sources.predictiveContextPackManifest,
      modelScorecardPath: sources.predictiveModelScorecard,
      inventoryStatusCounts: predictiveInventory.statusCounts,
      modelPromotionGates: predictiveModelScorecard.promotionGates,
      validationGates: predictiveSummary.validationGates,
      chartRefs: predictiveChartRefs,
      contextPackRefs,
      sourceRefs: [
        sourceRef('predictiveSummary', 'Predictive race-intelligence validation summary.'),
        sourceRef('predictiveInventory', 'Inventory of productized, context-ready, analyst-only, deferred, and blocked analytics.'),
        sourceRef('predictiveModelScorecard', 'Predictive feasibility and backtest scorecard.'),
        sourceRef('predictiveContextPackManifest', 'Manifest for upcoming-event, race-debrief, Career Lab, and live race-day context packs.')
      ]
    },
    screens: {
      upcomingPrep: {
        title: 'Upcoming Race Weekend Prep',
        readiness: 'partial',
        nextVenue: nextUpcomingVenue,
        events: upcomingEvents,
        nextEventPrep,
        standingsSnapshot,
        contextPackRefs: upcomingContextPackRefs,
        supplementalContextRefs: {
          prepSection: supplementalPrepSectionRef,
          raceLapSection: supplementalRaceLapSectionRef
        },
        runtimeApiRequirements: ['/api/readiness', '/api/weather/upcoming', '/api/weather/live'],
        caveats: [
          'Schedule feed timestamps can lack explicit timezone offsets; polished countdowns need runtime normalization.',
          'Weather is NWS current/forecast context, not official INDY NXT session weather or track temperature.'
        ],
        sourceRefs: [
          sourceRef('futureWeekendPrep', 'Upcoming-event prep inputs from INDY NXT analytics.'),
          sourceRef('raceDebriefScores', 'Start→finish rows for the next event’s track type, joined to official result status.'),
          sourceRef('prepSessionSignals', 'Practice/qualifying rank signals behind the Friday-signal module.'),
          sourceRef('headToHead', 'Career head-to-head records joined into the points-standings snapshot.'),
          { key: 'live-capture-timing', path: '/api/timing', note: 'Full-field points in standingsSnapshot come from the same Race Control capture this route serves (archived in data/live/brycecast.sqlite; COLD snapshot; unofficial).' },
          sourceRef('predictiveContextPackManifest', 'Full upcoming-event predictive race-intelligence pack refs.'),
          sourceRef('sectionLapDeepDiveSummary', 'Practice/qualifying section-lap supplemental context summary.'),
          sourceRef('raceLapSectionSummary', 'Race lap/section supplemental context summary.'),
          { key: supplementalPrepSectionRef.key, path: supplementalPrepSectionRef.path, note: 'Current next-venue practice/qualifying section context pack.' },
          { key: supplementalRaceLapSectionRef.key, path: supplementalRaceLapSectionRef.path, note: 'Current next-venue race lap/section context pack.' },
          sourceRef('manifest', 'UI metric contract and caveats.')
        ]
      },
      liveCompanionFixtures: {
        title: 'Live Companion Fixture States',
        requiredStates: ['wrong_series', 'pre_session', 'ready', 'degraded', 'stale', 'blocked'],
        requiredVariants: ['base', 'no_bryce_archive_ready', 'no_bryce_archive_missing', 'replay_empty', 'replay_repeated_cold'],
        contextPackRef: liveRaceDayContextPack,
        fixtures: [
          buildLiveFixture({ state: 'wrong_series', severity: 'red', reason: 'Current Race Control feed is not Bryce INDY NXT.', history }),
          buildLiveFixture({ state: 'pre_session', severity: 'amber', reason: 'INDY NXT context exists, but green/yellow live Bryce timing is not active.', history }),
          buildLiveFixture({ state: 'ready', severity: 'green', reason: 'Fresh INDY NXT timing has a guarded Bryce row.', history, pointsProfile: 'full', replayState: 'ready' }),
          buildLiveFixture({ state: 'degraded', severity: 'amber', reason: 'Core timing is usable, but one enrichment source is partial.', history, pointsProfile: 'partial', weatherState: 'partial' }),
          buildLiveFixture({ state: 'stale', severity: 'amber', reason: 'Timing data is too old for live Bryce display.', history, replayState: 'ready' }),
          buildLiveFixture({ state: 'blocked', severity: 'red', reason: 'Required live timing context is unavailable.', history, replayState: 'missing', weatherState: 'error' }),
          buildLiveFixture({ state: 'blocked', variant: 'no_bryce_archive_ready', severity: 'red', reason: 'Active INDY NXT timing is available, but no guarded Bryce car #9 row is present.', history, timingScenario: 'no_bryce_active', replayState: 'ready' }),
          buildLiveFixture({ state: 'blocked', variant: 'no_bryce_archive_missing', severity: 'red', reason: 'Active INDY NXT timing is available, but no guarded Bryce car #9 row is present and no usable archive is available.', history, timingScenario: 'no_bryce_active', replayState: 'missing' }),
          buildLiveFixture({ state: 'pre_session', variant: 'replay_empty', severity: 'amber', reason: 'INDY NXT context exists, but the replay archive is empty.', history, replayState: 'empty' }),
          buildLiveFixture({ state: 'pre_session', variant: 'replay_repeated_cold', severity: 'amber', reason: 'INDY NXT context exists, but replay samples are repeated cold-state rows.', history, replayState: 'repeated_cold', replayWarnings: ['Replay samples are repeated cold-state rows and are not enough for race trend analytics.'] })
        ],
        caveats: [
          'These are synthetic readiness fixtures for design and QA. Runtime truth still comes from /api/readiness.',
          'A green fixture is not proof that live INDY NXT session polling has been rehearsed under race conditions.'
        ],
        sourceRefs: [sourceRef('manifest', 'Live companion metric requirements.'), sourceRef('predictiveContextPackManifest', 'Live race-day context pack and proof gates.'), { key: 'api-readiness', path: '/api/readiness', note: 'Runtime source for live product gate.' }]
      },
      raceDebrief: {
        title: 'INDY NXT Race Debrief Seeds',
        readiness: 'available',
        featuredDebriefs: debriefRows,
        contextPackCoverage: {
          raceDebriefPacks: predictiveSummary.raceDebriefPacks,
          manifestPath: sources.predictiveContextPackManifest
        },
        contextPackRefs: packsByType('race_debrief'),
        chartFamilies: [
          'outcome KPI strip',
          'qualifying-to-finish slope',
          'lap-position story',
          'incident/penalty chips',
          'team-context ranked dots',
          'source drawer'
        ],
        caveats: ['Derived archetype labels are review aids until approved for public UI copy.'],
        sourceRefs: [sourceRef('raceDebriefScores', 'Race debrief seed rows.'), sourceRef('fullFieldLapDynamicsByRace', 'Lap position story rows.'), sourceRef('predictiveContextPackManifest', 'All 36 race-debrief context pack refs.')]
      },
      careerLab: {
        title: 'Career Analytics Lab',
        readiness: 'available',
        sourcePayload: 'career_lab_context_pack',
        contextPackRef: careerLabContextPack,
        careerPriorMatrixPath: sources.predictiveCareerPriorMatrix,
        seriesSummary: (careerLabPayload.seriesSummary ?? []).map((row) => ({
          seriesId: row.seriesId,
          seriesName: row.seriesName,
          raceRows: numberOrNull(row.raceRows),
          avgFinish: numberOrNull(row.avgFinish),
          medianFinish: numberOrNull(row.medianFinish),
          avgGain: numberOrNull(row.avgGain),
          avgFinishPercentile: percentOrNull(row.avgFinishPercentile),
          top5RatePct: percentOrNull(row.top5Rate),
          top10RatePct: percentOrNull(row.top10Rate),
          issueLikeStatusRatePct: percentOrNull(row.issueLikeStatusRate)
        })),
        parityBySeries,
        sourceFamilyRules: careerLabPayload.sourceFamilyRules ?? [],
        topCareerStories: careerLabPayload.topCareerStories ?? [],
        chartSpecs: careerLabPayload.chartSpecs ?? [],
        resultConversionRows: careerLabPayload.resultConversionRows,
        resultConversion: careerLabPayload.resultConversion ?? [],
        resultConversionSample: (careerLabPayload.resultConversion ?? []).slice(0, 25),
        caveats: [
          'Career analytics must use metric-family parity states; older series do not expose INDY NXT-grade depth.',
          'Result-conversion rows are source-bounded historical context, not a universal driver-strength model.'
        ],
        sourceRefs: [sourceRef('careerSeriesSummary', 'Series-level performance rows.'), sourceRef('careerMetricParity', 'Metric parity/source-boundary rows.'), sourceRef('careerResultConversion', 'Cross-series result conversion rows.'), sourceRef('predictiveCareerPriorMatrix', 'Parity-aware career prior matrix.')]
      },
      sourceOps: {
        title: 'Source Ops Baseline',
        predictiveRaceIntelligence: {
          summaryPath: sources.predictiveSummary,
          inventoryPath: sources.predictiveInventory,
          modelScorecardPath: sources.predictiveModelScorecard,
          contextPackManifestPath: sources.predictiveContextPackManifest,
          validationGates: predictiveSummary.validationGates
        },
        validation: {
          ok: validationReport.ok,
          errorCount: validationReport.errorCount,
          warningCount: validationReport.warningCount,
          issues: validationReport.issues ?? []
        },
        ingestion: {
          generatedAt: ingestionSummary.generatedAt,
          openGapCount: ingestionSummary.openGaps?.length ?? 0,
          priorityGaps: ingestionSummary.priorityGaps ?? []
        },
        gapBoundary: {
          path: sources.contextEventGapBoundary,
          rowCount: contextEventGapBoundary.length,
          statusCounts: contextEventGapBoundary.reduce((acc, row) => {
            acc[row.status] = (acc[row.status] ?? 0) + 1;
            return acc;
          }, {}),
          rows: contextEventGapBoundary
        },
        coverage: {
          totals: coverageMatrix.totals ?? null,
          indyNxt: coverageMatrix.series?.find?.((series) => series.seriesId === 'series_indy_nxt') ?? null
        },
        historyStanding: history.bryceStanding,
        sourceFamilyAudit: sourceFamilyAudit.slice(0, 50),
        caveats: [
          'Source Ops is a secondary/admin surface; it should not become front-page product clutter.',
          'Validation warnings and preserved gaps are transparency states, not automatic UI blockers.'
        ],
        sourceRefs: [sourceRef('validationReport', 'Canonical validation result.'), sourceRef('ingestionSummary', 'Canonical ingestion summary.'), sourceRef('coverageMatrix', 'Canonical coverage matrix.'), sourceRef('historyBryce', 'Compact Bryce history and standings baseline.'), sourceRef('sourceFamilyAudit', 'INDY NXT source family audit rows.'), sourceRef('contextEventGapBoundary', 'Canonical gap source-boundary rows.'), sourceRef('predictiveSummary', 'Predictive race-intelligence artifact summary.')]
      }
    },
    uiReadyArtifacts: {
      stableArtifacts: uiReadyArtifacts.stableArtifacts,
      exploratoryOrDeferred: uiReadyArtifacts.exploratoryOrDeferred,
      missingBackendContracts: uiReadyArtifacts.missingBackendContracts ?? [],
      uiFixtureCoverage: [
        ...(uiReadyArtifacts.uiFixtureCoverage ?? []),
        ...(uiReadyArtifacts.missingBackendContracts ?? []).filter(coveredByUiFixtures).map(uiFixtureCoverageText)
      ]
    }
  };
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
runContextEventNarrativeLayer();
runPredictiveRaceIntelligence();
runSupplementalContextPacks();
const dataPackage = buildPackage();
fs.writeFileSync(outputPath, `${JSON.stringify(dataPackage, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, outputPath), schemaVersion: dataPackage.schemaVersion }, null, 2));
