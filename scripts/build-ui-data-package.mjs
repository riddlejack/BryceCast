import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execSync, spawnSync } from 'node:child_process';

import { buildPointsProjectionState } from './live-points-state.mjs';
import { analyticsPython, runPredictiveRaceIntelligence } from './run-predictive-race-intelligence.mjs';

const repoRoot = process.cwd();
const outputPath = path.join(repoRoot, 'analysis/ui-data-package/ui-data-package.json');
// Narrow package lanes can refresh their own deterministic artifacts without
// rewriting unrelated generated reports whose timestamps otherwise churn.
const skipUpstreamRefresh = process.env.BRYCECAST_SKIP_UPSTREAM_REFRESH === '1';
// Dry-run the as-of pin guard (Finding C) without regenerating anything, so an
// operator can confirm a run is safely pinned before spending the full rebuild.
const eventRollCheckOnly = process.argv.includes('--check-event-roll');

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
  contextEventWeatherConditions: 'analysis/context-event-narrative-layer/output/weather_condition_context.csv',
  prepSessionSignals: 'analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv',
  fieldStrengthByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/field_strength_by_race.csv',
  headToHead: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv',
  raceLapInflectionPoints: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_lap_inflection_points.csv',
  raceSectionLapObservations: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
  raceSectionFieldDistribution: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_field_distribution.json',
  sectionResultsDeepByRace: 'analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv',
  leaderLapContext: 'analysis/indy-nxt-discovery/output/deep_dive/tables/leader_lap_context.csv',
  careerSeriesSummary: 'analysis/career-parity/output/tables/career_series_result_summary.csv',
  careerMetricParity: 'analysis/career-parity/output/tables/career_metric_family_parity.csv',
  careerResultConversion: 'analysis/career-parity/output/tables/career_result_conversion.csv',
  careerLifeStatsSummary: 'analysis/career-life-stats/output/summary.json',
  careerLifeStatsResearch: 'analysis/career-life-stats/RESEARCH.md',
  careerLifeStatsVenueFacts: 'analysis/career-life-stats/data/venue_facts.csv',
  careerLifeStatsResourceAssumptions: 'analysis/career-life-stats/data/resource_model_assumptions.csv',
  careerLifeStatsMilesRaced: 'analysis/career-life-stats/output/tables/miles_raced.csv',
  careerLifeStatsSessionLedger: 'analysis/career-life-stats/output/tables/session_mileage_ledger.csv',
  careerLifeStatsMileageBreakdowns: 'analysis/career-life-stats/output/tables/mileage_breakdowns.csv',
  careerLifeStatsTravelLegs: 'analysis/career-life-stats/output/tables/travel_legs.csv',
  careerLifeStatsTravelModeBreakdown: 'analysis/career-life-stats/output/tables/travel_mode_breakdown.csv',
  careerLifeStatsFuelEstimate: 'analysis/career-life-stats/output/tables/estimated_fuel_burned.csv',
  careerLifeStatsTireEstimate: 'analysis/career-life-stats/output/tables/estimated_unique_tires.csv',
  careerAtlasOutput: 'analysis/career-atlas/output/atlas.json',
  careerAtlasGlobeTexture: 'analysis/career-atlas/output/world_land_texture.png',
  careerAtlasNaturalEarth: 'analysis/career-atlas/data/ne_110m_land.geojson',
  careerAtlasNaturalEarthSource: 'analysis/career-atlas/data/SOURCE.md',
  careerAtlasRequirements: 'analysis/career-atlas/requirements.txt',
  careerAtlasBuilderScript: 'analysis/career-atlas/scripts/build_career_atlas.py',
  careerAtlasValidatorScript: 'analysis/career-atlas/scripts/validate_career_atlas.py',
  restartReportSummary: 'analysis/restart-report/output/summary.json',
  restartReportEvents: 'analysis/restart-report/output/tables/restart_events.csv',
  restartReportByRace: 'analysis/restart-report/output/tables/restart_by_race.csv',
  restartReportByVenue: 'analysis/restart-report/output/tables/restart_by_venue.csv',
  restartReportBySeason: 'analysis/restart-report/output/tables/restart_by_season.csv',
  restartReportVenueBaseline: 'analysis/restart-report/output/tables/restart_venue_baseline.csv',
  restartReportDriverDeltas: 'analysis/restart-report/output/tables/restart_driver_deltas.csv',
  restartReportBuilderScript: 'analysis/restart-report/scripts/build_restart_report.py',
  restartReportValidatorScript: 'analysis/restart-report/scripts/validate_restart_report.py',
  qualifyingLayerSummary: 'analysis/qualifying-layer/output/summary.json',
  qualifyingLayerSessions: 'analysis/qualifying-layer/output/tables/quali_sessions.csv',
  qualifyingLayerConversion: 'analysis/qualifying-layer/output/tables/quali_race_conversion.csv',
  qualifyingLayerBySeriesSeason: 'analysis/qualifying-layer/output/tables/quali_by_series_season.csv',
  qualifyingLayerExcluded: 'analysis/qualifying-layer/output/tables/excluded_races.csv',
  qualifyingLayerBuilderScript: 'analysis/qualifying-layer/scripts/build_qualifying_layer.py',
  qualifyingLayerValidatorScript: 'analysis/qualifying-layer/scripts/validate_qualifying_layer.py',
  cautionAtlasSummary: 'analysis/caution-atlas/output/summary.json',
  cautionAtlasEvents: 'analysis/caution-atlas/output/tables/caution_events.csv',
  cautionAtlasByRace: 'analysis/caution-atlas/output/tables/caution_by_race.csv',
  cautionAtlasByVenue: 'analysis/caution-atlas/output/tables/caution_by_venue.csv',
  cautionAtlasBuilderScript: 'analysis/caution-atlas/scripts/build_caution_atlas.py',
  cautionAtlasValidatorScript: 'analysis/caution-atlas/scripts/validate_caution_atlas.py',
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
  trackOutlineIndex: 'src/assets/tracks/index.ts',
  trackOutlineBuilderScript: 'scripts/build-track-outline.mjs',
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

const runCareerLifeStats = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/career-life-stats/scripts/build_career_life_stats.py',
    'analysis/career-life-stats/scripts/validate_career_life_stats.py'
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

const runCareerAtlas = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/career-atlas/scripts/build_career_atlas.py',
    'analysis/career-atlas/scripts/validate_career_atlas.py'
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

const runRestartReport = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/restart-report/scripts/build_restart_report.py',
    'analysis/restart-report/scripts/validate_restart_report.py'
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

const runCautionAtlas = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/caution-atlas/scripts/build_caution_atlas.py',
    'analysis/caution-atlas/scripts/validate_caution_atlas.py'
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

const runQualifyingLayer = () => {
  const python = analyticsPython();
  for (const script of [
    'analysis/qualifying-layer/scripts/build_qualifying_layer.py',
    'analysis/qualifying-layer/scripts/validate_qualifying_layer.py'
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

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/* The committed package as it sits in git HEAD — the authoritative "what we
 * shipped" baseline for the as-of pin guard, independent of any working-tree
 * churn. Falls back to the on-disk artifact outside a git checkout. */
const readCommittedPackage = () => {
  try {
    return JSON.parse(
      execSync('git show HEAD:analysis/ui-data-package/ui-data-package.json', {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
      })
    );
  } catch {
    if (fs.existsSync(outputPath)) return readJson(path.relative(repoRoot, outputPath));
    return null;
  }
};

/* Finding C — as-of pin fail-closed guard.
 *
 * The Python analytics lanes resolve their run date from
 * BRYCECAST_ANALYTICS_AS_OF_DATE, silently falling back to date.today() when it
 * is absent. An unpinned regeneration on race day would roll the upcoming-event
 * window forward and delete the current race-week pack the family is watching.
 *
 * Before any upstream regeneration, compare the resolved as-of date against the
 * committed package. Refuse the run when it would change the upcoming-event set,
 * or when it is unpinned while the committed race-week event is today-or-future.
 * BRYCECAST_ALLOW_EVENT_ROLL=1 proceeds deliberately (the post-race roll-forward). */
const assertAsOfPinAllowsBuild = () => {
  const allowRoll = process.env.BRYCECAST_ALLOW_EVENT_ROLL === '1';
  const rawEnvDate = process.env.BRYCECAST_ANALYTICS_AS_OF_DATE;
  const envDate = rawEnvDate && rawEnvDate.trim() ? rawEnvDate.trim() : null;
  if (envDate && !/^\d{4}-\d{2}-\d{2}$/.test(envDate)) {
    throw new Error(`BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD (got "${envDate}").`);
  }
  const today = todayIsoDate();
  const resolvedDate = envDate ?? today;

  const committed = readCommittedPackage();
  if (!committed) {
    return { ok: true, resolvedDate, pinned: Boolean(envDate), note: 'no committed package to compare against' };
  }

  const committedAsOfDate = typeof committed.asOfDate === 'string' ? committed.asOfDate : null;
  const committedEvents = (committed.screens?.upcomingPrep?.events ?? [])
    .map((event) => ({
      eventId: event.eventId ?? null,
      trackName: event.trackName ?? null,
      eventStartDate: typeof event.eventStartDate === 'string' ? event.eventStartDate : null
    }))
    .filter((event) => event.eventStartDate)
    .sort((left, right) => left.eventStartDate.localeCompare(right.eventStartDate));
  const nextEvent = committedEvents[0] ?? null;

  // The committed upcoming set is events with startDate >= committedAsOfDate. At
  // the resolved date, any with startDate < resolvedDate roll out of the set; a
  // resolved date earlier than committedAsOfDate would re-add past events. Both
  // change the set the package would regenerate.
  const droppedEvents = committedEvents.filter((event) => event.eventStartDate < resolvedDate);
  const grewEarlier = committedAsOfDate ? resolvedDate < committedAsOfDate : false;
  const setChanges = droppedEvents.length > 0 || grewEarlier;

  // Fail-closed race-day case: an unpinned run while the committed race-week
  // event is today-or-future would regenerate — and can delete — the pack the
  // family is watching, even when the >= set comparison hasn't shifted yet.
  const unpinnedOnRaceWindow = !envDate && Boolean(nextEvent) && nextEvent.eventStartDate >= today;

  const result = {
    ok: true,
    pinned: Boolean(envDate),
    resolvedDate,
    committedAsOfDate,
    nextEvent,
    droppedEvents,
    grewEarlier,
    setChanges,
    unpinnedOnRaceWindow,
    allowRoll
  };

  if ((setChanges || unpinnedOnRaceWindow) && !allowRoll) {
    const lines = [
      'Refusing to regenerate the UI data package: the resolved as-of date would roll the upcoming-event set.',
      `  Committed asOfDate:      ${committedAsOfDate ?? '(none)'}`,
      `  Resolved as-of date:     ${resolvedDate} ${envDate ? '(pinned)' : '(unpinned → today())'}`,
      nextEvent
        ? `  Current race-week event: ${nextEvent.trackName ?? nextEvent.eventId} on ${nextEvent.eventStartDate}`
        : '  Current race-week event: (none in committed package)'
    ];
    if (droppedEvents.length > 0) {
      lines.push(`  Would drop from upcoming: ${droppedEvents.map((event) => `${event.trackName ?? event.eventId} (${event.eventStartDate})`).join(', ')}`);
    }
    if (grewEarlier) lines.push('  Resolved date precedes the committed asOfDate, which would re-add past events.');
    if (unpinnedOnRaceWindow) lines.push('  Unpinned run while the current race-week event is today-or-future.');
    lines.push('');
    lines.push('  Fix one of:');
    lines.push('    • Pin the run:  BRYCECAST_ANALYTICS_AS_OF_DATE=YYYY-MM-DD (reproduce the committed package)');
    lines.push('    • Roll on purpose:  BRYCECAST_ALLOW_EVENT_ROLL=1 (deliberate post-race roll-forward)');
    throw Object.assign(new Error(lines.join('\n')), { asOfGuard: result });
  }

  return result;
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

/* Fresh managed worktrees give every checked-out file a new mtime. Preserve
 * the last generated package's timestamp when path + content hash are stable,
 * so a narrow package refresh does not manufacture unrelated JSON churn. */
const previousArtifactByPath = (() => {
  let previousPackage = null;
  try {
    previousPackage = JSON.parse(
      execSync('git show HEAD:analysis/ui-data-package/ui-data-package.json', {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
      })
    );
  } catch {
    if (fs.existsSync(outputPath)) previousPackage = readJson(path.relative(repoRoot, outputPath));
  }
  const artifacts = new Map();
  const visit = (value) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (typeof value.path === 'string' && typeof value.sha256 === 'string' && typeof value.modifiedAt === 'string') {
      artifacts.set(value.path, value);
    }
    Object.values(value).forEach(visit);
  };
  visit(previousPackage);
  return artifacts;
})();

const summarizeArtifact = (relativePath) => {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = fs.statSync(absolutePath);
  const bytes = fs.readFileSync(absolutePath);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const previous = previousArtifactByPath.get(relativePath);
  return {
    path: relativePath,
    bytes: stat.size,
    modifiedAt: previous?.sha256 === sha256 ? previous.modifiedAt : stat.mtime.toISOString(),
    sha256
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

const eventFromUpcomingContextPack = ({ pack, packRef, raceDate = null }) => ({
  sourcePayload: 'upcoming_event_context_pack',
  contextPackRef: packRef,
  eventId: pack.eventId,
  eventName: pack.eventName,
  eventStartDate: pack.eventStartDate,
  /* The RACE session's own local date from the canonical schedule (e.g. a
     Saturday-practice weekend whose race runs Sunday). eventStartDate is the
     WEEKEND's first day — "Race day" copy and days-to-green must never be
     computed from it. Null when the schedule carries no race session yet;
     consumers fall back to eventStartDate. */
  raceDate,
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

/* ------------------------------------------------------------------
   Race-story packs: one JSON per completed race with the full-field
   lap chart (official lap-chart positions for every car), Bryce's
   inflection moments, the field-strength read, teammate finishes, and
   humanized section strengths. Written to analysis/race-story/output/
   context-packs/ so the UI's context-pack glob and integrity checks
   pick them up like any other pack.
   ------------------------------------------------------------------ */

const sectionNameMap = [
  [/^FS ?- ?PO( \d)?$/i, 'Pit-out straight$1'],
  [/^FS ?- ?PI$/i, 'Pit-in straight'],
  [/^FS to SF$/i, 'Run to the line'],
  [/^BS ?-? ?T(\d)$/i, 'Back straight → T$1'],
  [/^BS to T(\d)$/i, 'Back straight → T$1'],
  [/^BS ?(\d)$/i, 'Back straight $1'],
  [/^SF$/i, 'Start/finish line']
];

const humanizeSectionName = (raw) => {
  const name = raw.trim();
  for (const [pattern, replacement] of sectionNameMap) {
    if (pattern.test(name)) return name.replace(pattern, replacement);
  }
  return name; // official timing-station codes (e.g. "I1 to I2") stay as-is — never invent corner names
};

const parseSectionFamilies = (value) =>
  String(value ?? '')
    .split(';')
    .map((part) => {
      const splitAt = part.lastIndexOf(':');
      if (splitAt === -1) return null;
      const name = part.slice(0, splitAt).trim();
      const pct = numberOrNull(part.slice(splitAt + 1));
      return name && pct !== null ? { name: humanizeSectionName(name), percentile: pct } : null;
    })
    .filter(Boolean);

const parseTopRatedRivals = (value) =>
  String(value ?? '')
    .split(';')
    .map((part) => {
      const splitAt = part.lastIndexOf(':');
      if (splitAt === -1) return null;
      const name = part.slice(0, splitAt).trim();
      const rating = numberOrNull(part.slice(splitAt + 1));
      return name && rating !== null ? { name, rating } : null;
    })
    .filter(Boolean);

/** The per-race restart card: each restart's window plus Bryce against the
 *  full field, sized so per-second data can later refine the same shape. */
const buildRaceStoryRestartBlock = ({ events, raceRow }) => {
  if (!raceRow) return null;
  const cautionPeriods = numberOrNull(raceRow.cautionPeriods) ?? 0;
  const detected = numberOrNull(raceRow.restartCount) ?? 0;
  const noRestartReason = cautionPeriods === 0 ? 'no_cautions' : detected === 0 ? 'cautions_ended_under_yellow' : '';
  const eventBlocks = (events ?? [])
    .slice()
    .sort((left, right) => (numberOrNull(left.restartIndex) ?? 0) - (numberOrNull(right.restartIndex) ?? 0))
    .map((row) => ({
      restartIndex: numberOrNull(row.restartIndex),
      restartLap: numberOrNull(row.restartLap),
      baselineLap: numberOrNull(row.baselineLap),
      windowLaps: numberOrNull(row.windowLaps),
      windowEndLap: numberOrNull(row.windowEndLap),
      fullWindow: row.fullWindow === 'true',
      cautionReasons: row.cautionReasons || null,
      precision: 'lap-chart',
      field: {
        classified: numberOrNull(row.fieldClassified),
        medianNet: numberOrNull(row.fieldNetMedian),
        bestNet: numberOrNull(row.fieldNetBest)
      },
      bryce:
        row.bryceClassified === 'true'
          ? {
              baselinePosition: numberOrNull(row.bryceBaselinePosition),
              restartPosition: numberOrNull(row.bryceRestartPosition),
              endPosition: numberOrNull(row.bryceEndPosition),
              net: numberOrNull(row.bryceNet),
              rankInField: numberOrNull(row.bryceRankInField),
              fieldSize: numberOrNull(row.bryceFieldSizeRanked)
            }
          : null
    }));
  return {
    detected,
    cautionPeriods,
    windowLaps: 2,
    precision: 'lap-chart',
    noRestartReason,
    bryce: {
      counted: numberOrNull(raceRow.bryceRestartsCounted) ?? 0,
      net: numberOrNull(raceRow.bryceNet) ?? 0,
      gained: numberOrNull(raceRow.bryceGained) ?? 0,
      held: numberOrNull(raceRow.bryceHeld) ?? 0,
      slipped: numberOrNull(raceRow.bryceSlipped) ?? 0,
      rankInField: numberOrNull(raceRow.bryceRankInField),
      fieldSizeRanked: numberOrNull(raceRow.fieldSizeRanked),
      soleBestInField: raceRow.soleBestInField === 'true',
      coBestInField: raceRow.coBestInField === 'true'
    },
    coverageNote: raceRow.coverageNote || '',
    events: eventBlocks,
    caveat:
      'Restart movement is running order over the green laps after each restart, from the official lap chart — positions only, never lap times.'
  };
};

/** The per-race caution line for "The day": how many yellows flew and how many
 *  laps ran under caution, plus each episode's official cause and the third of
 *  the race it fell in — descriptive counting, from the official caution
 *  summary. Null when the race isn't in the atlas (not yet run / no summary). */
const parseCategoriesString = (value) =>
  String(value || '')
    .split(';')
    .filter(Boolean)
    .map((part) => {
      const [category, count] = part.split(':');
      return { category, count: numberOrNull(count) ?? 0 };
    });

const buildRaceStoryCautionBlock = ({ events, raceRow }) => {
  if (!raceRow) return null;
  const count = numberOrNull(raceRow.cautionCount) ?? 0;
  const eventBlocks = (events ?? [])
    .slice()
    .sort((left, right) => (numberOrNull(left.startLap) ?? 0) - (numberOrNull(right.startLap) ?? 0))
    .map((row) => ({
      cautionNumber: numberOrNull(row.cautionNumber),
      startLap: numberOrNull(row.startLap),
      endLap: numberOrNull(row.endLap),
      durationLaps: numberOrNull(row.durationLaps),
      restartLap: numberOrNull(row.restartLap),
      ranToFlag: row.ranToFlag === 'true',
      third: row.third,
      category: row.category
    }));
  return {
    precision: 'official-report',
    count,
    lapsUnderYellow: numberOrNull(raceRow.cautionLapsTotal) ?? 0,
    totalRaceLaps: numberOrNull(raceRow.totalRaceLaps),
    thirds: {
      opening: numberOrNull(raceRow.openingThird) ?? 0,
      middle: numberOrNull(raceRow.middleThird) ?? 0,
      final: numberOrNull(raceRow.finalThird) ?? 0
    },
    categories: parseCategoriesString(raceRow.categories),
    events: eventBlocks,
    caveat:
      'Full-course cautions from the official Results-PDF caution summary — counts of official caution episodes, not lap times or positions.'
  };
};

const buildRaceStoryPacks = ({ raceDebriefPackPairs, canonicalDataset, canonicalSha256 }) => {
  const outputDir = path.join(repoRoot, 'analysis/race-story/output/context-packs');
  fs.mkdirSync(outputDir, { recursive: true });
  if (skipUpstreamRefresh) {
    return raceDebriefPackPairs.map(({ pack }) => {
      const id = `race_story_${pack.sessionId}`;
      const relativePath = path.relative(repoRoot, path.join(outputDir, `${id}.json`));
      if (!fs.existsSync(path.join(repoRoot, relativePath))) {
        throw new Error(`Missing existing race-story pack during narrow package refresh: ${relativePath}`);
      }
      return { sessionId: pack.sessionId, id, type: 'race_story', ...summarizeArtifact(relativePath) };
    });
  }

  const driverNameById = new Map((canonicalDataset.drivers ?? []).map((driver) => [driver.id, driver.displayName]));
  const lapSamplesBySession = new Map();
  for (const sample of canonicalDataset.lapSamples ?? []) {
    if (!String(sample.sessionId).includes('indy_nxt') || !Number.isFinite(sample.position)) continue;
    if (!lapSamplesBySession.has(sample.sessionId)) lapSamplesBySession.set(sample.sessionId, []);
    lapSamplesBySession.get(sample.sessionId).push(sample);
  }
  const resultsBySessionAll = new Map();
  for (const result of canonicalDataset.results ?? []) {
    if (!String(result.sessionId).includes('indy_nxt')) continue;
    if (!resultsBySessionAll.has(result.sessionId)) resultsBySessionAll.set(result.sessionId, []);
    resultsBySessionAll.get(result.sessionId).push(result);
  }

  const inflectionRows = readCsv(sources.raceLapInflectionPoints);
  const restartEventRows = readCsv(sources.restartReportEvents);
  const restartRaceRows = readCsv(sources.restartReportByRace);
  const restartEventsBySession = new Map();
  for (const row of restartEventRows) {
    if (!restartEventsBySession.has(row.sessionId)) restartEventsBySession.set(row.sessionId, []);
    restartEventsBySession.get(row.sessionId).push(row);
  }
  const restartRaceBySession = new Map(restartRaceRows.map((row) => [row.sessionId, row]));
  const cautionEventRows = readCsv(sources.cautionAtlasEvents);
  const cautionRaceRows = readCsv(sources.cautionAtlasByRace);
  const cautionEventsBySession = new Map();
  for (const row of cautionEventRows) {
    if (!cautionEventsBySession.has(row.sessionId)) cautionEventsBySession.set(row.sessionId, []);
    cautionEventsBySession.get(row.sessionId).push(row);
  }
  const cautionRaceBySession = new Map(cautionRaceRows.map((row) => [row.sessionId, row]));
  const fieldStrengthRows = readCsv(sources.fieldStrengthByRace);
  const sectionRows = readCsv(sources.sectionResultsDeepByRace);
  const teamRows = readCsv(sources.teamContextByRace);
  const progressionRows = readCsv(sources.championshipProgression);
  const weekendSignalRows = readCsv(sources.prepSessionSignals);

  const fieldStrengthBySession = new Map(fieldStrengthRows.map((row) => [row.sessionId, row]));
  const seasonDepthRank = (sessionId) => {
    const row = fieldStrengthBySession.get(sessionId);
    if (!row) return null;
    const seasonPrefix = sessionId.replace(/_\d+$/, '');
    const seasonRows = fieldStrengthRows.filter((candidate) => candidate.sessionId.startsWith(seasonPrefix));
    const sorted = seasonRows
      .map((candidate) => ({ sessionId: candidate.sessionId, mean: numberOrNull(candidate.fieldStrengthMean) ?? 0 }))
      .sort((left, right) => right.mean - left.mean);
    const index = sorted.findIndex((candidate) => candidate.sessionId === sessionId);
    return index === -1 ? null : { rank: index + 1, of: sorted.length };
  };

  const refs = [];
  for (const { pack } of raceDebriefPackPairs) {
    const sessionId = pack.sessionId;
    const samples = lapSamplesBySession.get(sessionId) ?? [];
    const results = resultsBySessionAll.get(sessionId) ?? [];
    const resultByDriver = new Map(results.map((result) => [result.driverId, result]));
    const bryceResult = resultByDriver.get('driver_bryce_aron') ?? null;
    const bryceTeamId = bryceResult?.teamId ?? null;

    const lapsByDriver = new Map();
    for (const sample of samples) {
      if (!lapsByDriver.has(sample.driverId)) lapsByDriver.set(sample.driverId, []);
      lapsByDriver.get(sample.driverId).push([sample.lapNumber, sample.position]);
    }
    const drivers = [...lapsByDriver.entries()]
      .map(([driverId, laps]) => {
        const result = resultByDriver.get(driverId) ?? null;
        return {
          driverId,
          driverName: driverNameById.get(driverId) ?? driverId,
          carNumber: result?.carNumber ?? null,
          isBryce: driverId === 'driver_bryce_aron',
          isTeammate: driverId !== 'driver_bryce_aron' && bryceTeamId !== null && result?.teamId === bryceTeamId,
          finishPosition: numberOrNull(result?.finishPosition),
          status: result?.status ?? null,
          laps: laps.sort((left, right) => left[0] - right[0])
        };
      })
      .sort((left, right) => (left.finishPosition ?? 99) - (right.finishPosition ?? 99));

    /* Wheel-to-wheel company: laps spent within one position of Bryce, and
     * how often the pair traded places. */
    const bryceLine = drivers.find((driver) => driver.isBryce) ?? null;
    let battles = [];
    if (bryceLine && bryceLine.laps.length > 0) {
      for (const rival of drivers) {
        if (rival.isBryce) continue;
        const rivalByLap = new Map(rival.laps);
        let lapsAdjacent = 0;
        let swaps = 0;
        let previousDiff = null;
        for (const [lap, brycePosition] of bryceLine.laps) {
          const rivalPosition = rivalByLap.get(lap);
          if (rivalPosition === undefined) {
            previousDiff = null;
            continue;
          }
          const diff = brycePosition - rivalPosition;
          if (Math.abs(diff) <= 1) lapsAdjacent += 1;
          if (previousDiff !== null && diff !== 0 && previousDiff !== 0 && Math.sign(diff) !== Math.sign(previousDiff)) swaps += 1;
          previousDiff = diff;
        }
        if (lapsAdjacent > 0) {
          battles.push({ driverName: rival.driverName, carNumber: rival.carNumber, isTeammate: rival.isTeammate, lapsAdjacent, swaps });
        }
      }
      battles.sort((left, right) => right.lapsAdjacent - left.lapsAdjacent || right.swaps - left.swaps);
      battles = battles.slice(0, 3);
    }

    const weatherObservation = (canonicalDataset.weatherObservations ?? []).find((observation) => observation.sessionId === sessionId) ?? null;

    const inflections = inflectionRows
      .filter((row) => row.sessionId === sessionId)
      .map((row) => ({
        lap: numberOrNull(row.lapNumber),
        fromPosition: numberOrNull(row.previousPosition),
        toPosition: numberOrNull(row.position),
        delta: numberOrNull(row.positionDelta),
        trigger: row.trigger,
        cautionState: row.cautionState
      }))
      .filter((row) => row.lap !== null && row.toPosition !== null)
      .sort((left, right) => left.lap - right.lap);

    const strength = fieldStrengthBySession.get(sessionId) ?? null;
    const depth = seasonDepthRank(sessionId);
    const weekendRow = weekendSignalRows.find((row) => row.sessionId === sessionId) ?? null;
    const section = sectionRows.find((row) => row.sessionId === sessionId) ?? null;
    const team = teamRows.find((row) => row.sessionId === sessionId) ?? null;
    const progressionIndex = progressionRows.findIndex((row) => row.sessionId === sessionId);
    const progression = progressionIndex === -1 ? null : progressionRows[progressionIndex];
    const previousRound =
      progressionIndex > 0 && progressionRows[progressionIndex - 1].seasonYear === progression?.seasonYear
        ? progressionRows[progressionIndex - 1]
        : null;

    const storyPack = {
      schemaVersion: 'brycecast.raceStory.v1',
      type: 'race_story',
      id: `race_story_${sessionId}`,
      generatedAt: new Date().toISOString(),
      sourceHash: canonicalSha256,
      sessionId,
      raceLabel: pack.raceLabel,
      seasonYear: numberOrNull(pack.seasonYear),
      track: pack.track ?? null,
      lapChart: {
        totalLaps: Math.max(0, ...samples.map((sample) => sample.lapNumber)),
        fieldSize: drivers.length,
        sourceState: 'official_lap_chart',
        drivers
      },
      /* Explicit Bryce state: a race can legitimately have no Bryce lap line
       * (0 completed laps, e.g. opening-lap contact) — the UI must say so
       * rather than chart nothing. */
      bryce: {
        inLapChart: drivers.some((driver) => driver.isBryce && driver.laps.length > 0),
        lapsCompleted: numberOrNull(bryceResult?.lapsCompleted),
        startPosition: numberOrNull(bryceResult?.startPosition),
        finishPosition: numberOrNull(bryceResult?.finishPosition),
        status: bryceResult?.status ?? null
      },
      inflections,
      battles,
      restarts: buildRaceStoryRestartBlock({
        events: restartEventsBySession.get(sessionId),
        raceRow: restartRaceBySession.get(sessionId)
      }),
      cautions: buildRaceStoryCautionBlock({
        events: cautionEventsBySession.get(sessionId),
        raceRow: cautionRaceBySession.get(sessionId)
      }),
      weather: weatherObservation
        ? {
            ambientTempC: numberOrNull(weatherObservation.ambientTempC),
            windSpeedKph: numberOrNull(weatherObservation.windSpeedKph),
            windGustKph: numberOrNull(weatherObservation.windGustKph),
            humidityPct: numberOrNull(weatherObservation.relativeHumidityPct),
            precipitationMm: numberOrNull(weatherObservation.precipitationMm),
            conditionRaw: weatherObservation.ambientConditionRaw ?? null,
            source: weatherObservation.source ?? null,
            caveat: 'Modeled near-track weather for the race hour (Open-Meteo hourly archive), not official series weather.'
          }
        : null,
      /* The weekend arc: practice → qualifying → start → finish. */
      weekendSignal: weekendRow
        ? {
            bestPracticeRank: numberOrNull(weekendRow.bestPracticeRank),
            bestQualifyingRank: numberOrNull(weekendRow.bestQualifyingRank),
            raceStart: numberOrNull(weekendRow.raceStart),
            raceFinish: numberOrNull(weekendRow.raceFinish),
            caveat: weekendRow.caveat
          }
        : null,
      fieldStrength: strength
        ? {
            ratedRivals: numberOrNull(strength.fieldRatedRivals),
            mean: numberOrNull(strength.fieldStrengthMean),
            median: numberOrNull(strength.fieldStrengthMedian),
            topRated: parseTopRatedRivals(strength.topRatedRivals),
            bryceFinishPercentile: numberOrNull(strength.bryceFinishPercentile),
            resultVsFieldStrength: numberOrNull(strength.resultVsFieldStrength),
            seasonDepthRank: depth,
            sourceState: strength.sourceState,
            caveat: strength.caveat
          }
        : null,
      teammates: results
        .filter((result) => bryceTeamId !== null && result.teamId === bryceTeamId)
        .map((result) => ({
          driverName: driverNameById.get(result.driverId) ?? result.driverId,
          carNumber: result.carNumber ?? null,
          isBryce: result.driverId === 'driver_bryce_aron',
          finishPosition: numberOrNull(result.finishPosition),
          startPosition: numberOrNull(result.startPosition),
          status: result.status ?? null
        }))
        .sort((left, right) => (left.finishPosition ?? 99) - (right.finishPosition ?? 99)),
      teamContext: team
        ? { teamName: team.teamName, teamCars: numberOrNull(team.teamCars), teamAverageFinish: numberOrNull(team.teamAverageFinish), statusCaveat: team.statusCaveat }
        : null,
      sections: section
        ? {
            comparisonRows: numberOrNull(section.sectionComparisonRows),
            medianPercentile: numberOrNull(section.medianSectionPercentile),
            best: parseSectionFamilies(section.bestSectionFamilies),
            weakest: parseSectionFamilies(section.weakestSectionFamilies),
            sourceState: section.sourceState,
            caveat: section.caveat
          }
        : null,
      pointsImpact: progression
        ? {
            racePoints: numberOrNull(progression.bryceRacePoints),
            cumulativePoints: numberOrNull(progression.bryceCumulativePoints),
            standingAfter: numberOrNull(progression.bryceStandingRank),
            standingBefore: previousRound ? numberOrNull(previousRound.bryceStandingRank) : null,
            pointsBehindLeader: numberOrNull(progression.pointsBehindLeader),
            leaderDriver: progression.leaderDriver ?? null
          }
        : null,
      sourceRefs: [
        { key: 'canonicalDataset', path: sources.canonicalDataset, note: 'Official lap-chart positions and results for every car in the race.' },
        { key: 'raceLapInflectionPoints', path: sources.raceLapInflectionPoints, note: 'Bryce position inflection moments with lap triggers.' },
        { key: 'fieldStrengthByRace', path: sources.fieldStrengthByRace, note: 'Descriptive field-strength context and result-vs-expectation.' },
        { key: 'sectionResultsDeepByRace', path: sources.sectionResultsDeepByRace, note: 'Official section-time percentiles for the weekend.' },
        { key: 'teamContextByRace', path: sources.teamContextByRace, note: 'Teammate results within the same official session.' },
        { key: 'championshipProgression', path: sources.championshipProgression, note: 'Points and standing movement across the season.' },
        { key: 'restartReportEvents', path: sources.restartReportEvents, note: 'Positions gained over the green laps after each official restart, Bryce vs the full field.' },
        { key: 'cautionAtlasByRace', path: sources.cautionAtlasByRace, note: 'Full-course cautions this race — count, laps under yellow, and official causes, from the caution summary.' }
      ],
      caveats: [
        'Lap chart shows official running order at each completed lap; it does not carry lap times or gaps.',
        'Field strength is same-sample descriptive context, not a prediction.',
        'Result status is official session status, not engineering root-cause attribution.'
      ]
    };

    const outputPath = path.join(outputDir, `${storyPack.id}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(storyPack)}\n`);
    refs.push({ sessionId, id: storyPack.id, type: 'race_story', ...summarizeArtifact(path.relative(repoRoot, outputPath)) });
  }
  return refs;
};

/* ------------------------------------------------------------------
   Section-lap packs (Brief H — Section Intelligence). One pack per race
   carrying Bryce's per-lap, per-section observations from the official
   Section Results parse, so the heat map's lap scopes and the "why" drawer
   read numbers directly traceable to the observation table. Written to
   analysis/race-story/output/context-packs/ like race-story packs.
   ------------------------------------------------------------------ */

const SECTION_LAP_TUPLE_ORDER = [
  'lap',
  'fieldPercentile',
  'fieldRank',
  'fieldComparisonCount',
  'clean',
  'caution',
  'timeSeconds',
  'speedMph'
];

/** Races whose section-lap ref points at the MEASURED loop-crossing pack
 *  (sourceTier: lake_loop_crossings) produced by the semantic layer, rather
 *  than the parsed-PDF pack. See buildSectionLapPacks for the override. */
const MEASURED_SECTION_PACKS = [
  {
    sessionId: 'session_indy_nxt_2024_6323',
    id: 'section_laps_measured_session_indy_nxt_2024_6323',
    venueName: 'Nashville Superspeedway',
    seasonYear: 2024,
    path: 'analysis/semantic-layer/output/context-packs/section_laps_measured_session_indy_nxt_2024_6323.json'
  },
  {
    sessionId: 'session_indy_nxt_2025_6447',
    id: 'section_laps_measured_session_indy_nxt_2025_6447',
    venueName: 'Nashville Superspeedway',
    seasonYear: 2025,
    path: 'analysis/semantic-layer/output/context-packs/section_laps_measured_session_indy_nxt_2025_6447.json'
  }
];

const buildSectionLapPacks = ({ raceDebriefPackPairs }) => {
  const outputDir = path.join(repoRoot, 'analysis/race-story/output/context-packs');
  fs.mkdirSync(outputDir, { recursive: true });
  const observationRows = readCsv(sources.raceSectionLapObservations);
  const rowsBySession = new Map();
  for (const row of observationRows) {
    if (!rowsBySession.has(row.sessionId)) rowsBySession.set(row.sessionId, []);
    rowsBySession.get(row.sessionId).push(row);
  }
  /* Full-field extraction (Brief H coverage fix): per-section field time
     distributions and Bryce's per-lap DERIVED remainder with real full-field
     percentiles, from race_section_field_distribution.json. The derived
     remainder rides the same section shape so the drawer, scopes, and YoY
     inherit it; it ships only where the racing sections leave a genuine untimed
     stretch (Nashville's straights) — never where they tile the lap. */
  const fieldDistribution = readJson(sources.raceSectionFieldDistribution).sessions ?? {};
  const debriefSessionIds = new Set(raceDebriefPackPairs.map(({ pack }) => pack.sessionId));
  const refs = [];
  const cautionCode = { green: 'g', caution: 'c', restart_lap: 'r' };
  for (const [sessionId, rows] of rowsBySession) {
    if (!debriefSessionIds.has(sessionId)) continue; // race sessions only
    const id = `section_laps_${sessionId}`;
    const relativePath = path.relative(repoRoot, path.join(outputDir, `${id}.json`));
    const first = rows[0];
    const venueName = first.trackName;
    const seasonYear = numberOrNull(first.seasonYear);
    if (skipUpstreamRefresh) {
      if (!fs.existsSync(path.join(repoRoot, relativePath))) {
        throw new Error(`Missing existing section-lap pack during narrow package refresh: ${relativePath}`);
      }
      refs.push({ sessionId, id, type: 'section_laps', venueName, seasonYear, ...summarizeArtifact(relativePath) });
      continue;
    }
    const tuple = (row) => [
      numberOrNull(row.lapNumber),
      numberOrNull(row.fieldPercentile),
      numberOrNull(row.fieldRank),
      numberOrNull(row.fieldComparisonCount),
      row.cleanRaceLapCandidate === 'yes' ? 1 : 0,
      cautionCode[row.cautionState] ?? 'u',
      numberOrNull(row.timeSeconds),
      numberOrNull(row.speedMph)
    ];
    const byFamily = new Map();
    const lapTotals = [];
    for (const row of rows) {
      if (row.sectionType === 'lap_total') {
        lapTotals.push(tuple(row));
      } else if (row.sectionType === 'track_section') {
        if (!byFamily.has(row.sectionFamily)) byFamily.set(row.sectionFamily, []);
        byFamily.get(row.sectionFamily).push(tuple(row));
      }
      // pit_or_timing_line rows are not lap-shape sections; excluded deliberately.
    }
    if (byFamily.size === 0) continue;
    const bySort = (left, right) => (left[0] ?? 0) - (right[0] ?? 0);

    /* Field distribution + derived remainder for this race. */
    const distribution = fieldDistribution[sessionId] ?? null;
    const fieldSecondsFor = (family) => distribution?.sections?.[family]?.fieldCarMedians ?? null;
    const measuredSections = [...byFamily.entries()].map(([sectionName, laps]) => {
      const fieldSeconds = fieldSecondsFor(sectionName);
      return {
        sectionName,
        kind: 'measured',
        laps: laps.sort(bySort),
        ...(fieldSeconds ? { fieldSeconds } : {})
      };
    });
    /* The derived "Untimed remainder" section: Bryce's per-lap lap-time-minus-
       timed-sections, ranked against the field's remainders. Shipped only for
       a genuine untimed gap; the field distribution comes from the same lane. */
    const derivedRemainderTuple = (row) => [
      numberOrNull(row.lapNumber),
      numberOrNull(row.fieldPercentile),
      numberOrNull(row.fieldRank),
      numberOrNull(row.fieldComparisonCount),
      row.cleanRaceLapCandidate === 'yes' ? 1 : 0,
      cautionCode[row.cautionState] ?? 'u',
      numberOrNull(row.timeSeconds),
      null
    ];
    const derivedSections =
      distribution && distribution.derivedCoverage === 'genuine_gap' && (distribution.derivedRemainder ?? []).length > 0
        ? [
            {
              sectionName: 'Untimed remainder',
              kind: 'derived_remainder',
              laps: distribution.derivedRemainder.map(derivedRemainderTuple).sort(bySort),
              ...(fieldSecondsFor('Untimed remainder') ? { fieldSeconds: fieldSecondsFor('Untimed remainder') } : {})
            }
          ]
        : [];
    const pack = {
      schemaVersion: 'brycecast.sectionLaps.v1',
      type: 'section_laps',
      id,
      generatedAt: new Date().toISOString(),
      sourceHash: first.sourceHash,
      sessionId,
      raceLabel: first.raceLabel,
      seasonYear,
      venueName,
      trackType: first.trackType,
      totalLaps: Math.max(0, ...rows.map((row) => numberOrNull(row.lapNumber) ?? 0)),
      tupleOrder: SECTION_LAP_TUPLE_ORDER,
      sections: [...measuredSections, ...derivedSections],
      derivedCoverage: distribution?.derivedCoverage ?? null,
      lapTotals: lapTotals.sort(bySort),
      sourceStateCounts: rows.reduce((counts, row) => {
        counts[row.sourceState] = (counts[row.sourceState] ?? 0) + 1;
        return counts;
      }, {}),
      sourceRefs: [
        {
          key: 'raceSectionLapObservations',
          path: sources.raceSectionLapObservations,
          note: "Bryce's per-lap section times, speeds, and field percentiles from official Section Results reports."
        },
        {
          key: 'raceSectionFieldDistribution',
          path: sources.raceSectionFieldDistribution,
          note: "Full-field per-section time distributions and Bryce's per-lap derived remainder (lap time minus timed sections) with real full-field percentiles."
        }
      ],
      caveats: [
        'Section times come from official timing loops — time-based, not GPS or car position.',
        'Field percentile compares source-visible cars on the same lap; clean flags follow the lap-chart caution context.',
        'The untimed remainder is lap time minus the timed sections — the exact time on stretches with no loops, ranked against the field the same way.',
        'Aggregates should use clean green-flag laps and label their denominators on screen.'
      ]
    };
    fs.writeFileSync(path.join(repoRoot, relativePath), `${JSON.stringify(pack)}\n`);
    refs.push({ sessionId, id, type: 'section_laps', venueName, seasonYear, ...summarizeArtifact(relativePath) });
  }

  /* Measured lake upgrade (heat-map v2): where the semantic layer produced 8
     timing-loop sub-sections for a race, its ref points at the MEASURED pack
     instead of the PDF one. The measured packs are produced upstream by
     analysis/semantic-layer/build-nashville-measured-sections.mjs from the
     committed interval packs (no lake read here); this only re-registers the
     ref (path/sha256) so a full refresh stays idempotent. The PDF pack above
     still exists as the fallback for races without loop data. */
  for (const measured of MEASURED_SECTION_PACKS) {
    if (!fs.existsSync(path.join(repoRoot, measured.path))) continue;
    const ref = {
      sessionId: measured.sessionId,
      id: measured.id,
      type: 'section_laps',
      venueName: measured.venueName,
      seasonYear: measured.seasonYear,
      ...summarizeArtifact(measured.path)
    };
    const existing = refs.findIndex((entry) => entry.sessionId === measured.sessionId);
    if (existing >= 0) refs[existing] = ref;
    else refs.push(ref);
  }
  return refs.sort((left, right) => left.sessionId.localeCompare(right.sessionId));
};

/* ------------------------------------------------------------------
   Pass-mark packs (heat-map v2, item 7). Registers the per-race pass-mark
   packs (produced upstream by analysis/track-position/build-pass-marks.mjs
   from the committed pass-placement lane — GO races only) for the debrief
   sessions that have one. The UI draws each green Bryce pass at its between-
   loop interval on the heat map. No pack ⇒ no marks (CONDITIONAL/NO-GO races,
   and races the lane never covered).
   ------------------------------------------------------------------ */
const buildPassMarkRefs = ({ raceDebriefPackPairs }) => {
  const refs = [];
  for (const { pack } of raceDebriefPackPairs) {
    const id = `pass_marks_${pack.sessionId}`;
    const relativePath = `analysis/track-position/output/context-packs/${id}.json`;
    if (!fs.existsSync(path.join(repoRoot, relativePath))) continue; // no GO pack for this race
    const packJson = readJson(relativePath);
    refs.push({
      sessionId: pack.sessionId,
      id,
      type: 'pass_marks',
      venueName: packJson.venueName ?? pack.track?.name ?? null,
      seasonYear: packJson.seasonYear ?? pack.seasonYear ?? null,
      ...summarizeArtifact(relativePath)
    });
  }
  return refs.sort((left, right) => left.sessionId.localeCompare(right.sessionId));
};

/** One synchronous row per completed race for the archive's season spine:
 *  finish/start/points plus standing and gap-to-leader after each round,
 *  with official result status so hard days are labeled, never mysterious. */
const buildSeasonIndex = ({ raceDebriefPackPairs, resultsBySession, progressionRows }) => {
  const progressionBySession = new Map(progressionRows.map((row) => [row.sessionId, row]));
  return raceDebriefPackPairs
    .map(({ pack }) => {
      const official = resultsBySession.get(pack.sessionId) ?? null;
      const progression = progressionBySession.get(pack.sessionId) ?? null;
      const roundIndex = typeof pack.raceOrder === 'number' ? pack.raceOrder : (pack.raceOrder?.roundIndex ?? null);
      return {
        sessionId: pack.sessionId,
        raceLabel: pack.raceLabel,
        seasonYear: numberOrNull(pack.seasonYear),
        roundIndex: numberOrNull(roundIndex),
        eventStartDate: pack.eventStartDate ?? null,
        /* The race's own day. eventStartDate is the WEEKEND's first day and
         * differs from the session date on 38 of 41 races — anything reader-
         * facing should prefer raceDate. */
        raceDate: pack.raceOrder?.sessionStartDate ?? pack.eventStartDate ?? null,
        trackName: pack.track?.name ?? null,
        trackType: pack.track?.type ?? null,
        startPosition: numberOrNull(pack.outcome?.startPosition),
        finishPosition: numberOrNull(pack.outcome?.finishPosition),
        points: numberOrNull(pack.outcome?.points),
        cumulativePoints: numberOrNull(pack.outcome?.cumulativePoints),
        standingRank: numberOrNull(pack.outcome?.standingRank),
        officialStatus: official?.status ?? null,
        pointsBehindLeader: progression ? numberOrNull(progression.pointsBehindLeader) : null,
        leaderDriver: progression?.leaderDriver ?? null
      };
    })
    .sort(
      (left, right) =>
        (left.seasonYear ?? 0) - (right.seasonYear ?? 0) || (left.roundIndex ?? 0) - (right.roundIndex ?? 0)
    );
};

/* ---------- the campaigns: every championship season as a points arc ---------- */

/** One short name per series, mirroring the Career Lab chapter vocabulary so the
 *  campaign panels and the chapter cards read with the same words. */
const CAMPAIGN_SHORT_NAMES = {
  'F1600 Championship Series': 'F1600',
  'Formula Ford': 'Formula Ford',
  'GB3 Championship': 'GB3',
  'Euroformula Open': 'Euroformula',
  'Castrol Toyota Formula Regional Oceania Championship': 'FR Oceania',
  'IMSA WeatherTech SportsCar Championship': 'IMSA',
  'INDY NXT': 'INDY NXT'
};
const campaignShort = (seriesName) => CAMPAIGN_SHORT_NAMES[seriesName] ?? seriesName;

/* Seasons Bryce contested that carry no sourced championship points tally get an
 * honest, named exclusion rather than an invented arc — each is told in its own
 * chapter on the page. Keyed by seriesId|year. */
const CAMPAIGN_EXCLUSION_REASONS = {
  'series_formula_ford|2020':
    'The 2020 Formula Ford year was a run of invitational meetings; the sourced data carries no single championship points tally.',
  'series_froc|2024': 'The six FR Oceania races have no season championship points total in the sourced data.',
  'series_imsa_weathertech|2025':
    'The Rolex 24 at Daytona is one endurance race, not a points campaign — it has its own chapter.'
};

/** INDY NXT races carry a full debrief page; every other race gets the light
 *  career sheet. Mirrors the UI raceHref so a click resolves the same way. */
const campaignRaceHref = (sessionId) =>
  String(sessionId ?? '').includes('indy_nxt')
    ? `/races/${encodeURIComponent(sessionId)}`
    : `/career/race/${encodeURIComponent(sessionId)}`;

/** The whole career as points arcs: one championship season per campaign, each
 *  accumulating Bryce's official race points in the order they were scored.
 *
 *  The data votes on how each season renders (never invented, always sourced):
 *   - arc      — official results carry per-race points, so the climb is real.
 *                INDY NXT seasons prefer the reconciled championship-progression
 *                table (it also carries standing and the leader gap per round);
 *                earlier series sum canonical per-race points chronologically.
 *   - endpoint — only the official season total and final classification are
 *                sourced; the round-by-round climb is not, so no arc is drawn.
 *   - excluded — no championship points tally exists at all; named honestly.
 *
 *  Where a season's summed race points differ from its official championship
 *  total (a series' own drop-scores rule), both sourced numbers are surfaced
 *  and the panel carries a reconciliation note — the number is never silently
 *  reconciled or hidden. */
const buildSeasonCampaigns = ({ canonicalDataset, progressionRows, resultConversionSessionIds }) => {
  const seriesById = new Map((canonicalDataset.series ?? []).map((series) => [series.id, series]));
  const trackById = new Map((canonicalDataset.tracks ?? []).map((track) => [track.id, track]));
  const sessionById = new Map((canonicalDataset.sessions ?? []).map((session) => [session.id, session]));
  const eventById = new Map((canonicalDataset.events ?? []).map((event) => [event.id, event]));
  const raceSessionIds = new Set(
    (canonicalDataset.sessions ?? []).filter((session) => session.sessionType === 'race').map((session) => session.id)
  );
  const hasRacePage = (sessionId) => resultConversionSessionIds.has(sessionId);

  // Bryce's race results grouped by seriesId|year, chronological within a season.
  const raceResultsBySeason = new Map();
  for (const result of canonicalDataset.results ?? []) {
    if (result.driverId !== 'driver_bryce_aron' || !raceSessionIds.has(result.sessionId)) continue;
    const session = sessionById.get(result.sessionId);
    const event = session ? eventById.get(session.eventId) : null;
    if (!event) continue;
    const key = `${event.seriesId}|${event.seasonYear}`;
    const list = raceResultsBySeason.get(key) ?? [];
    list.push({ result, session, event });
    raceResultsBySeason.set(key, list);
  }
  const orderRaces = (rows) =>
    rows.slice().sort(
      (left, right) =>
        String(left.event.eventStartDate ?? '').localeCompare(String(right.event.eventStartDate ?? '')) ||
        (numberOrNull(left.event.round) ?? 0) - (numberOrNull(right.event.round) ?? 0) ||
        (numberOrNull(left.session.raceNumber) ?? 0) - (numberOrNull(right.session.raceNumber) ?? 0) ||
        String(left.session.scheduledStart ?? '').localeCompare(String(right.session.scheduledStart ?? '')) ||
        String(left.result.sessionId).localeCompare(String(right.result.sessionId))
    );

  // INDY NXT: the reconciled progression table, grouped by season year.
  const progressionBySeason = new Map();
  for (const row of progressionRows) {
    const year = numberOrNull(row.seasonYear);
    if (year === null) continue;
    const list = progressionBySeason.get(year) ?? [];
    list.push(row);
    progressionBySeason.set(year, list);
  }

  const latestIndyYear = Math.max(
    0,
    ...(canonicalDataset.seasons ?? [])
      .filter((season) => season.driverId === 'driver_bryce_aron' && season.seriesId === 'series_indy_nxt')
      .map((season) => numberOrNull(season.year) ?? 0)
  );

  const bryceSeasons = (canonicalDataset.seasons ?? [])
    .filter((season) => season.driverId === 'driver_bryce_aron')
    .slice()
    .sort(
      (left, right) =>
        (numberOrNull(left.year) ?? 0) - (numberOrNull(right.year) ?? 0) ||
        String(seriesById.get(left.seriesId)?.name ?? '').localeCompare(String(seriesById.get(right.seriesId)?.name ?? ''))
    );

  const campaigns = [];
  const excluded = [];

  for (const season of bryceSeasons) {
    const seriesName = seriesById.get(season.seriesId)?.name ?? season.seriesId;
    const year = numberOrNull(season.year);
    const key = `${season.seriesId}|${year}`;
    const officialSeasonPoints = numberOrNull(season.points);
    const officialStandingRank = numberOrNull(season.championshipPosition);
    const isIndy = season.seriesId === 'series_indy_nxt';
    const races = orderRaces(raceResultsBySeason.get(key) ?? []);
    const hasPerRacePoints = races.some((row) => numberOrNull(row.result.points) !== null);

    // No sourced championship points anywhere → an honest, named exclusion.
    if (!hasPerRacePoints && officialSeasonPoints === null) {
      excluded.push({
        seriesId: season.seriesId,
        seriesName,
        seriesShort: campaignShort(seriesName),
        seasonYear: year,
        raceCount: races.length,
        reason: CAMPAIGN_EXCLUSION_REASONS[key] ?? 'No sourced championship points total exists for this season.'
      });
      continue;
    }

    const provenanceRefs = Array.isArray(season.provenanceRefs) ? season.provenanceRefs : [];

    // Endpoint-only: the season total is sourced but the round-by-round climb is
    // not. No arc is invented; the final classification is shown as-is.
    if (!hasPerRacePoints) {
      campaigns.push({
        seasonYear: year,
        seriesId: season.seriesId,
        seriesName,
        seriesShort: campaignShort(seriesName),
        renderMode: 'endpoint',
        isCurrent: false,
        inProgress: false,
        races: [],
        earnedPoints: null,
        officialSeasonPoints,
        officialStandingRank,
        raceCount: races.length,
        roundCount: new Set(races.map((row) => numberOrNull(row.event.round)).filter((round) => round !== null)).size || null,
        startsOfficial: numberOrNull(season.starts),
        reconciles: null,
        reconciliationNote: null,
        note: 'Round-by-round points are not sourced for this season; the official final classification is shown.',
        sourceState: 'official_final_classification_only',
        provenanceRefs
      });
      continue;
    }

    // Arc: a real, sourced accumulation. INDY prefers the reconciled progression
    // rows; earlier series sum canonical per-race points chronologically.
    const progression = isIndy ? progressionBySeason.get(year) ?? [] : [];
    const progressionBySession = new Map(progression.map((row) => [row.sessionId, row]));
    let cumulative = 0;
    const raceRows = races.map((row, index) => {
      const racePoints = numberOrNull(row.result.points) ?? 0;
      cumulative += racePoints;
      const prog = progressionBySession.get(row.result.sessionId) ?? null;
      const track = trackById.get(row.event.trackId) ?? null;
      const raceNumber = numberOrNull(row.session.raceNumber);
      const trackLabel = track?.name ?? row.event.name ?? 'Race';
      const raceLabel = prog?.raceLabel
        ? String(prog.raceLabel).replace(/^\d{4}\s+/, '')
        : `${trackLabel}${raceNumber !== null ? ` · R${raceNumber}` : ''}`;
      return {
        raceIndex: index + 1,
        sessionId: row.result.sessionId,
        raceLabel,
        roundIndex: isIndy && prog ? numberOrNull(prog.roundIndex) : numberOrNull(row.event.round),
        raceDate: String(row.session.scheduledStart ?? row.event.eventStartDate ?? '').slice(0, 10) || null,
        racePoints,
        cumulativePoints: cumulative,
        finishPosition: numberOrNull(row.result.finishPosition),
        startPosition: numberOrNull(row.result.startPosition),
        // Standing per round is sourced for INDY only (the progression table).
        standingRank: isIndy && prog ? numberOrNull(prog.bryceStandingRank) : null,
        pointsBehindLeader: isIndy && prog ? numberOrNull(prog.pointsBehindLeader) : null,
        leaderDriver: isIndy && prog ? prog.leaderDriver ?? null : null,
        status: row.result.status ?? null,
        hasRacePage: hasRacePage(row.result.sessionId),
        raceHref: campaignRaceHref(row.result.sessionId)
      };
    });

    const earnedPoints = cumulative;
    const reconciles = officialSeasonPoints !== null ? earnedPoints === officialSeasonPoints : null;
    const inProgress = isIndy && year === latestIndyYear;
    const isCurrent = inProgress;
    const roundCount =
      new Set(races.map((row) => numberOrNull(row.event.round)).filter((round) => round !== null)).size || null;
    const reconciliationNote =
      reconciles === false && officialSeasonPoints !== null
        ? `Race points add to ${earnedPoints} in the order they were scored; the official ${campaignShort(
            seriesName
          )} championship total is ${officialSeasonPoints}${
            officialStandingRank !== null ? ` (P${officialStandingRank})` : ''
          }.`
        : null;

    campaigns.push({
      seasonYear: year,
      seriesId: season.seriesId,
      seriesName,
      seriesShort: campaignShort(seriesName),
      renderMode: 'arc',
      isCurrent,
      inProgress,
      races: raceRows,
      earnedPoints,
      officialSeasonPoints,
      officialStandingRank,
      raceCount: raceRows.length,
      roundCount,
      startsOfficial: numberOrNull(season.starts),
      reconciles,
      reconciliationNote,
      note: isIndy
        ? inProgress
          ? `Points banked through ${raceRows.length} of the season's rounds — the campaign is still running.`
          : 'Points banked round by round, reconciled to the official championship progression.'
        : 'Points banked race by race across the season.',
      sourceState: isIndy ? 'official_results_points_progression' : 'canonical_per_race_points',
      provenanceRefs
    });
  }

  return {
    schemaVersion: 'brycecast.careerSeasonCampaigns.v1',
    question: 'How did each championship campaign accumulate?',
    campaigns,
    excluded,
    caveats: [
      'Each arc adds up Bryce’s official race points in the order they were scored; the line ends where the season ended.',
      'Round-by-round points are sourced only where the official results carry per-race points. Seasons with only an official season total show that final classification instead; seasons with no sourced points sit in their own chapters.',
      'Points systems and field sizes differ series to series, so campaigns are shown side by side and never on one shared scale.',
      'A season whose summed race points differ from its official championship total carries both sourced numbers and a note — the difference is a series’ own scoring rule, never a correction here.'
    ],
    sourceRefs: [
      sourceRef('canonicalDataset', 'Official per-race points, season totals, and final championship classifications.'),
      sourceRef('championshipProgression', 'Reconciled INDY NXT cumulative points and standing after each round.'),
      sourceRef('careerResultConversion', 'Which races carry a career race page for click-through.')
    ]
  };
};

/** The Career Lab climb needs true chronology; conversion rows carry no
 *  dates, so join each session to its canonical event start date. */
const enrichConversionRows = (rows, canonicalDataset, weatherConditionRows = []) => {
  const sessionById = new Map((canonicalDataset.sessions ?? []).map((session) => [session.id, session]));
  const eventById = new Map((canonicalDataset.events ?? []).map((event) => [event.id, event]));
  const weatherBySession = new Map(
    weatherConditionRows
      .filter((row) => row.sessionId && row.wetDry && row.wetDry !== 'unknown')
      .map((row) => [row.sessionId, { wetDry: row.wetDry, weatherConfidence: row.confidence ?? null }])
  );
  return rows.map((row) => {
    const session = sessionById.get(row.sessionId);
    const event = session ? eventById.get(session.eventId) : null;
    const weather = weatherBySession.get(row.sessionId) ?? null;
    return {
      ...row,
      eventStartDate: event?.eventStartDate ?? null,
      wetDry: weather?.wetDry ?? null,
      weatherConfidence: weather?.weatherConfidence ?? null
    };
  });
};

/* Named climb moments stay source-derived and deterministic: earliest means
 * event date then session id, while the best INDY NXT result sorts finish
 * position first and applies the same chronology as its tie-breaker. */
const careerMomentKindOrder = [
  'first_car_win',
  'first_indy_nxt_race',
  'best_indy_nxt_finish',
  'daytona_24',
  'wwtr_mechanical'
];

const compareCareerMomentChronology = (left, right) =>
  String(left?.eventStartDate ?? '').localeCompare(String(right?.eventStartDate ?? '')) ||
  String(left?.sessionId ?? '').localeCompare(String(right?.sessionId ?? ''));

const buildCareerMoments = ({ resultConversion, seasonIndex }) => {
  const chronologicalRows = resultConversion
    .filter((row) => row.sessionId && row.eventStartDate)
    .slice()
    .sort(compareCareerMomentChronology);
  const indyNxtRows = chronologicalRows.filter((row) => row.seriesId === 'series_indy_nxt');
  const firstCarWin = chronologicalRows.find((row) => numberOrNull(row.finishPosition) === 1) ?? null;
  const firstIndyNxtRace = indyNxtRows[0] ?? null;
  const bestIndyNxtFinish = indyNxtRows
    .filter((row) => numberOrNull(row.finishPosition) !== null)
    .slice()
    .sort(
      (left, right) =>
        numberOrNull(left.finishPosition) - numberOrNull(right.finishPosition) ||
        compareCareerMomentChronology(left, right)
    )[0] ?? null;
  const daytona24 = chronologicalRows.find(
    (row) =>
      row.seriesId === 'series_imsa_weathertech' &&
      /daytona/i.test(`${row.eventName ?? ''} ${row.trackName ?? ''}`) &&
      /(?:rolex|24)/i.test(`${row.eventName ?? ''} ${row.raceLabel ?? ''}`)
  ) ?? null;
  const wwtrMechanical = seasonIndex
    .filter(
      (row) =>
        numberOrNull(row.seasonYear) === 2026 &&
        String(row.eventStartDate ?? '').startsWith('2026-06') &&
        row.trackName === 'World Wide Technology Raceway' &&
        String(row.officialStatus ?? '').toLowerCase() === 'mechanical'
    )
    .slice()
    .sort(
      (left, right) =>
        compareCareerMomentChronology(left, right) ||
        (numberOrNull(left.roundIndex) ?? Number.MAX_SAFE_INTEGER) -
          (numberOrNull(right.roundIndex) ?? Number.MAX_SAFE_INTEGER)
    )[0] ?? null;

  const candidates = [
    firstCarWin ? { kind: 'first_car_win', row: firstCarWin, shortLabel: 'First car win · P1' } : null,
    firstIndyNxtRace ? { kind: 'first_indy_nxt_race', row: firstIndyNxtRace, shortLabel: 'INDY NXT debut' } : null,
    bestIndyNxtFinish
      ? {
          kind: 'best_indy_nxt_finish',
          row: bestIndyNxtFinish,
          shortLabel: `Best INDY NXT · P${numberOrNull(bestIndyNxtFinish.finishPosition)}`
        }
      : null,
    daytona24
      ? { kind: 'daytona_24', row: daytona24, shortLabel: `Daytona 24 · P${numberOrNull(daytona24.finishPosition)}` }
      : null,
    wwtrMechanical ? { kind: 'wwtr_mechanical', row: wwtrMechanical, shortLabel: 'WWTR · mechanical' } : null
  ].filter(Boolean);

  return candidates
    .sort(
      (left, right) =>
        compareCareerMomentChronology(left.row, right.row) ||
        careerMomentKindOrder.indexOf(left.kind) - careerMomentKindOrder.indexOf(right.kind)
    )
    .map(({ kind, row, shortLabel }) => ({ sessionId: row.sessionId, shortLabel, kind }));
};

/* Career head-to-head: every rival Bryce has shared an INDY NXT grid with,
 * sorted by races together. notableRaces parse: "label (+15) | label (-10)". */
const buildCareerHeadToHead = (rows) =>
  rows
    .map((row) => ({
      driverId: row.driverId ?? null,
      driverName: row.driverName ?? '',
      racesTogether: numberOrNull(row.racesTogether),
      bryceAhead: numberOrNull(row.bryceAhead),
      bryceBehind: numberOrNull(row.bryceBehind),
      headToHeadWinRate: numberOrNull(row.headToHeadWinRate),
      avgFinishDeltaVsRival: numberOrNull(row.avgFinishDeltaVsRival),
      sameTeamRaces: numberOrNull(row.sameTeamRaces),
      notableRaces: String(row.notableRaces ?? '')
        .split('|')
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map((chunk) => {
          const match = chunk.match(/^(.*)\(([+-]\d+)\)$/);
          return match ? { label: match[1].trim(), finishDelta: Number(match[2]) } : { label: chunk, finishDelta: null };
        })
    }))
    .filter((row) => row.driverName && (row.racesTogether ?? 0) > 0)
    .sort((left, right) => (right.racesTogether ?? 0) - (left.racesTogether ?? 0) || left.driverName.localeCompare(right.driverName));

/* The restart through-line: career, per-season, and per-venue restart movement
 * against the field, plus a per-race spine for the Career Lab and a per-venue
 * prior for Race Week. Sized for the lake (precision swaps lap-chart→per-second
 * with no UI rework). */
const buildRestartReport = ({ summary, byRaceRows, seasonIndex }) => {
  const seasonRowBySession = new Map((seasonIndex ?? []).map((row) => [row.sessionId, row]));
  const stripHash = ({ sourceHash, ...rest }) => rest;
  const byRace = (byRaceRows ?? [])
    .filter((row) => (numberOrNull(row.restartCount) ?? 0) > 0)
    .map((row) => {
      const seasonRow = seasonRowBySession.get(row.sessionId) ?? null;
      return {
        sessionId: row.sessionId,
        seasonYear: numberOrNull(row.seasonYear),
        raceLabel: row.raceLabel,
        trackName: row.trackName,
        trackType: row.trackType,
        venueSlug: row.venueSlug,
        eventStartDate: seasonRow?.eventStartDate ?? null,
        roundIndex: seasonRow ? numberOrNull(seasonRow.roundIndex) : null,
        restartCount: numberOrNull(row.restartCount),
        bryceRestartsCounted: numberOrNull(row.bryceRestartsCounted),
        bryceNet: numberOrNull(row.bryceNet),
        bryceGained: numberOrNull(row.bryceGained),
        bryceHeld: numberOrNull(row.bryceHeld),
        bryceSlipped: numberOrNull(row.bryceSlipped),
        bryceRankInField: numberOrNull(row.bryceRankInField),
        fieldSizeRanked: numberOrNull(row.fieldSizeRanked),
        fieldMedianNet: numberOrNull(row.fieldMedianNet),
        bryceBeatFieldTypical: row.bryceBeatFieldTypical === 'true',
        soleBestInField: row.soleBestInField === 'true',
        coBestInField: row.coBestInField === 'true',
        coverageNote: row.coverageNote || ''
      };
    })
    .sort((left, right) => dateMs(left.eventStartDate) - dateMs(right.eventStartDate) || String(left.sessionId).localeCompare(String(right.sessionId)));
  return {
    schemaVersion: summary.schemaVersion,
    precision: summary.method?.precision ?? 'lap-chart',
    windowLaps: numberOrNull(summary.windowLaps),
    coverage: summary.coverage,
    career: summary.career,
    // Brief K v2, additive: the field baseline (series-wide + per-venue). Absent
    // on pre-K-v2 summaries; the optional contract fields stay undefined then.
    ...(summary.fieldBaseline ? { fieldBaseline: summary.fieldBaseline } : {}),
    ...(summary.venueBaselines
      ? {
          venueBaselines: summary.venueBaselines.map((row) => {
            const { sourceHash, stable, ...rest } = row;
            return { ...rest, stable: stable === 'true' || stable === true };
          })
        }
      : {}),
    byRace,
    byVenue: (summary.byVenue ?? []).map(stripHash),
    bySeason: (summary.bySeason ?? []).map(stripHash),
    handVerification: summary.handVerification ?? [],
    caveats: summary.caveats ?? [],
    sourceRefs: [
      sourceRef('restartReportSummary', 'Validated restart-report totals, coverage, and hand-verification.'),
      sourceRef('restartReportByRace', 'Per-race restart movement with the field rank.'),
      sourceRef('restartReportByVenue', 'Per-venue restart rollup for the Race Week prior.'),
      sourceRef('restartReportBySeason', 'Per-season restart rollup.'),
      sourceRef('restartReportVenueBaseline', 'Per-venue field baseline: the average restart place-swing across the field.'),
      sourceRef('restartReportEvents', 'One row per restart, Bryce against the full field.'),
      sourceRef('canonicalDataset', 'Official Results-PDF caution summaries and official lap-chart positions.')
    ]
  };
};

/* The qualifying layer: one qualifying model across every series. The per-season
 * rollup carries where Bryce qualified (average/best rank, field-size
 * denominator) and — where the source has a grid column — how that grid slot
 * converted to the flag (ahead / held / behind, with denominators). Source
 * family is preserved on every row; the two families are never blended within a
 * session. Sized small for Brief M (per-series rollup + career, no per-race
 * spine on the wire). */
const buildQualifyingLayer = ({ summary, conversionRows, sessionRows }) => {
  const bySeriesSeason = (summary.bySeriesSeason ?? []).map((row) => ({
    seriesId: row.seriesId,
    seriesName: row.seriesName,
    seasonYear: numberOrNull(row.seasonYear),
    sourceFamily: row.sourceFamily,
    qualifyingSessions: numberOrNull(row.qualifyingSessions),
    gridSettingSessions: numberOrNull(row.gridSettingSessions),
    avgQualiRank: numberOrNull(row.avgQualiRank),
    bestQualiRank: numberOrNull(row.bestQualiRank),
    avgQualiFieldSize: numberOrNull(row.avgQualiFieldSize),
    conversionRaces: numberOrNull(row.conversionRaces),
    finishedAhead: numberOrNull(row.finishedAhead),
    held: numberOrNull(row.held),
    finishedBehind: numberOrNull(row.finishedBehind),
    avgQualiRankConverted: numberOrNull(row.avgQualiRankConverted),
    avgFinishConverted: numberOrNull(row.avgFinishConverted)
  }));
  // A per-series roll-up (families summed) for the headline lanes, career-ordered
  // by first season so the module reads oldest → newest like the rest of the page.
  const bySeriesMap = new Map();
  for (const row of bySeriesSeason) {
    const entry = bySeriesMap.get(row.seriesId) ?? {
      seriesId: row.seriesId,
      seriesName: row.seriesName,
      firstSeason: row.seasonYear,
      sourceFamilies: new Set(),
      conversionRaces: 0,
      finishedAhead: 0,
      held: 0,
      finishedBehind: 0,
      qualifyingSessions: 0,
      _rankWeighted: 0,
      _rankCount: 0,
      _fieldWeighted: 0,
      _fieldCount: 0,
      bestQualiRank: null
    };
    entry.sourceFamilies.add(row.sourceFamily);
    entry.conversionRaces += row.conversionRaces ?? 0;
    entry.finishedAhead += row.finishedAhead ?? 0;
    entry.held += row.held ?? 0;
    entry.finishedBehind += row.finishedBehind ?? 0;
    entry.qualifyingSessions += row.qualifyingSessions ?? 0;
    if (row.avgQualiRank != null && row.gridSettingSessions) {
      entry._rankWeighted += row.avgQualiRank * row.gridSettingSessions;
      entry._rankCount += row.gridSettingSessions;
    }
    if (row.avgQualiFieldSize != null && row.gridSettingSessions) {
      entry._fieldWeighted += row.avgQualiFieldSize * row.gridSettingSessions;
      entry._fieldCount += row.gridSettingSessions;
    }
    if (row.bestQualiRank != null) {
      entry.bestQualiRank = entry.bestQualiRank == null ? row.bestQualiRank : Math.min(entry.bestQualiRank, row.bestQualiRank);
    }
    if (row.seasonYear != null && (entry.firstSeason == null || row.seasonYear < entry.firstSeason)) {
      entry.firstSeason = row.seasonYear;
    }
    bySeriesMap.set(row.seriesId, entry);
  }
  const bySeries = [...bySeriesMap.values()]
    .map((entry) => ({
      seriesId: entry.seriesId,
      seriesName: entry.seriesName,
      firstSeason: entry.firstSeason,
      sourceFamilies: [...entry.sourceFamilies],
      qualifyingSessions: entry.qualifyingSessions,
      avgQualiRank: entry._rankCount ? Number((entry._rankWeighted / entry._rankCount).toFixed(1)) : null,
      bestQualiRank: entry.bestQualiRank,
      avgQualiFieldSize: entry._fieldCount ? Number((entry._fieldWeighted / entry._fieldCount).toFixed(1)) : null,
      conversionRaces: entry.conversionRaces,
      finishedAhead: entry.finishedAhead,
      held: entry.held,
      finishedBehind: entry.finishedBehind
    }))
    .sort((left, right) => (left.firstSeason ?? 0) - (right.firstSeason ?? 0) || String(left.seriesId).localeCompare(String(right.seriesId)));
  // Best qualifying, with the context the stat tile needs: how often that grid
  // slot was reached, in which series/season, and against what field sizes.
  // The per-race spine never rides the wire, so this is condensed from the
  // qualifying inventory here rather than hard-coded in the view.
  const bestQualifying = (() => {
    const ranked = (sessionRows ?? [])
      .map((row) => ({
        rank: numberOrNull(row.qualiRank),
        field: numberOrNull(row.qualiFieldSize),
        seriesName: row.seriesName,
        seasonYear: numberOrNull(row.seasonYear)
      }))
      .filter((row) => row.rank != null);
    if (ranked.length === 0) return null;
    const rank = Math.min(...ranked.map((row) => row.rank));
    const at = ranked.filter((row) => row.rank === rank);
    const seriesNames = [...new Set(at.map((row) => row.seriesName).filter(Boolean))];
    const seasons = [...new Set(at.map((row) => row.seasonYear).filter((year) => year != null))].sort((a, b) => a - b);
    const fieldSizes = at.map((row) => row.field).filter((size) => size != null).sort((a, b) => a - b);
    return {
      rank,
      occurrences: at.length,
      seriesName: seriesNames.length === 1 ? seriesNames[0] : null,
      seasonYear: seasons.length === 1 ? seasons[0] : null,
      fieldSizes
    };
  })();
  return {
    schemaVersion: summary.schemaVersion,
    coverage: summary.coverage,
    career: summary.career,
    bestQualifying,
    sourceFamilyMap: summary.sourceFamilyMap ?? [],
    bySeries,
    bySeriesSeason,
    conversionSample: (conversionRows ?? []).slice(0, 25).map((row) => ({
      raceSessionId: row.raceSessionId,
      seriesName: row.seriesName,
      seasonYear: numberOrNull(row.seasonYear),
      eventName: row.eventName,
      raceLabel: row.raceLabel,
      sourceFamily: row.sourceFamily,
      qualiRank: numberOrNull(row.qualiRank),
      qualiFieldSize: numberOrNull(row.qualiFieldSize),
      finish: numberOrNull(row.finish),
      conversionOutcome: row.conversionOutcome
    })),
    caveats: summary.caveats ?? [],
    sourceRefs: [
      sourceRef('qualifyingLayerSummary', 'Validated qualifying-layer coverage, source-family map, and career conversion totals.'),
      sourceRef('qualifyingLayerBySeriesSeason', 'Per-series/season qualifying and conversion rollup with labeled denominators.'),
      sourceRef('qualifyingLayerConversion', 'One row per grid-confirmed qualifying-to-flag conversion.'),
      sourceRef('qualifyingLayerSessions', 'The normalized per-session qualifying inventory with source family and field-size denominator.'),
      sourceRef('canonicalDataset', 'Canonical qualifyingResults, qualifying-session results, and race grids.')
    ]
  };
};

/* The caution atlas: a descriptive, per-venue count of full-course cautions —
 * how many fell per race (median + range), where in the race they fell, the
 * official causes (counted, never editorialized), and how long they ran. Feeds
 * the Race Week "Cautions at this venue" module. Counting only, no modeling:
 * gold is absent by design (a caution is not a Bryce moment). */
const buildCautionAtlas = ({ summary, eventRows, byRaceRows, byVenueRows, seasonIndex }) => {
  const seasonRowBySession = new Map((seasonIndex ?? []).map((row) => [row.sessionId, row]));
  const events = (eventRows ?? []).map((row) => ({
    sessionId: row.sessionId,
    seasonYear: numberOrNull(row.seasonYear),
    trackName: row.trackName,
    venueSlug: row.venueSlug,
    startLap: numberOrNull(row.startLap),
    endLap: numberOrNull(row.endLap),
    durationLaps: numberOrNull(row.durationLaps),
    totalRaceLaps: numberOrNull(row.totalRaceLaps),
    lapFraction: numberOrNull(row.lapFraction),
    third: row.third,
    restartLap: numberOrNull(row.restartLap),
    ranToFlag: row.ranToFlag === 'true',
    category: row.category
  }));
  const byRace = (byRaceRows ?? [])
    .filter((row) => (numberOrNull(row.cautionCount) ?? 0) > 0)
    .map((row) => {
      const seasonRow = seasonRowBySession.get(row.sessionId) ?? null;
      return {
        sessionId: row.sessionId,
        seasonYear: numberOrNull(row.seasonYear),
        raceLabel: row.raceLabel,
        trackName: row.trackName,
        trackType: row.trackType,
        venueSlug: row.venueSlug,
        eventStartDate: row.eventStartDate || seasonRow?.eventStartDate || null,
        totalRaceLaps: numberOrNull(row.totalRaceLaps),
        cautionCount: numberOrNull(row.cautionCount),
        cautionLapsTotal: numberOrNull(row.cautionLapsTotal),
        opening: numberOrNull(row.openingThird),
        middle: numberOrNull(row.middleThird),
        final: numberOrNull(row.finalThird),
        ranToFlagCount: numberOrNull(row.ranToFlagCount),
        medianDurationLaps: numberOrNull(row.medianDurationLaps),
        categories: parseCategoriesString(row.categories)
      };
    })
    .sort((left, right) => dateMs(left.eventStartDate) - dateMs(right.eventStartDate) || String(left.sessionId).localeCompare(String(right.sessionId)));
  const byVenue = (byVenueRows ?? []).map((row) => ({
    venueSlug: row.venueSlug,
    trackName: row.trackName,
    trackType: row.trackType,
    seasons: row.seasons,
    races: numberOrNull(row.races),
    cautions: numberOrNull(row.cautions),
    medianPerRace: numberOrNull(row.medianPerRace),
    minPerRace: numberOrNull(row.minPerRace),
    maxPerRace: numberOrNull(row.maxPerRace),
    meanPerRace: numberOrNull(row.meanPerRace),
    opening: numberOrNull(row.openingThird),
    middle: numberOrNull(row.middleThird),
    final: numberOrNull(row.finalThird),
    dominantThird: row.dominantThird || '',
    ranToFlagCount: numberOrNull(row.ranToFlagCount),
    medianDurationLaps: numberOrNull(row.medianDurationLaps),
    categories: parseCategoriesString(row.categories)
  }));
  return {
    schemaVersion: summary.schemaVersion,
    precision: summary.method?.precision ?? 'official-report',
    asOfDate: summary.asOfDate ?? null,
    coverage: summary.coverage,
    totals: summary.totals,
    byVenue,
    byRace,
    events,
    thirdsDefinition:
      'Opening / middle / final third by the lap each caution flew, over the race distance run.',
    caveats: summary.caveats ?? [],
    sourceRefs: [
      sourceRef('cautionAtlasSummary', 'Validated caution-atlas coverage, totals, per-venue rollup, and hand-verification.'),
      sourceRef('cautionAtlasByVenue', 'Per-venue caution rollup for the Race Week module.'),
      sourceRef('cautionAtlasByRace', 'Per-race caution counts, thirds, and official causes.'),
      sourceRef('cautionAtlasEvents', 'One row per official caution episode, placed by the lap it flew.'),
      sourceRef('canonicalDataset', 'Official Results-PDF caution summaries and official lap-chart distance.')
    ]
  };
};

/* Where the laps lived: Bryce's official running position on every sourced
 * INDY NXT lap, bucketed per season — the climb visible inside the races,
 * not just at the flag. */
const buildLapPositionMix = ({ lapTimelineRows, canonicalDataset }) => {
  const sessionById = new Map((canonicalDataset.sessions ?? []).map((session) => [session.id, session]));
  const eventById = new Map((canonicalDataset.events ?? []).map((event) => [event.id, event]));
  const seasons = new Map();
  for (const row of lapTimelineRows) {
    const position = numberOrNull(row.position);
    if (position === null || position < 1) continue;
    const session = sessionById.get(row.sessionId);
    const event = session ? eventById.get(session.eventId) : null;
    const yearFromEvent = event?.eventStartDate ? Number(String(event.eventStartDate).slice(0, 4)) : null;
    const yearFromLabel = Number(String(row.raceLabel ?? '').slice(0, 4));
    const seasonYear = yearFromEvent ?? (Number.isFinite(yearFromLabel) ? yearFromLabel : null);
    if (!seasonYear) continue;
    const bucket = seasons.get(seasonYear) ?? { seasonYear, totalLaps: 0, sessionIds: new Set(), counts: new Map() };
    bucket.totalLaps += 1;
    bucket.sessionIds.add(row.sessionId);
    bucket.counts.set(position, (bucket.counts.get(position) ?? 0) + 1);
    seasons.set(seasonYear, bucket);
  }
  return [...seasons.values()]
    .sort((left, right) => left.seasonYear - right.seasonYear)
    .map((bucket) => {
      const positions = [...bucket.counts.entries()].sort((left, right) => left[0] - right[0]).map(([position, laps]) => ({ position, laps }));
      const lapsInside = (limit) => positions.filter((entry) => entry.position <= limit).reduce((sum, entry) => sum + entry.laps, 0);
      return {
        seasonYear: bucket.seasonYear,
        races: bucket.sessionIds.size,
        totalLaps: bucket.totalLaps,
        top5LapShare: lapsInside(5) / bucket.totalLaps,
        top10LapShare: lapsInside(10) / bucket.totalLaps,
        positions
      };
    });
};

/* ---------- venue dossier: this place, other years ----------
 * Bryce's most explicit ask: year-over-year conditions + results at each
 * venue. One source-agnostic contract sized for the future data lake — v1 is
 * fed by canonical results + Open-Meteo modeled weather; v2 can swap trackside
 * lake messages into `conditions` with zero UI rework (adapter-contract law).
 * The runtime forecast / current-now for the race-week venue stays on the
 * weather API; this static module carries the historic visits + venue geo. */

const CARDINALS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const windCardinal = (deg) => {
  if (deg == null || !Number.isFinite(deg)) return null;
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return CARDINALS_16[index];
};
const celsiusToF = (celsius) => (celsius == null ? null : Math.round((celsius * 9) / 5 + 32));
const kphToMph = (kph) => (kph == null ? null : Math.round(kph / 1.609344));
const humanizeSky = (raw) => (raw ? String(raw).replaceAll('_', ' ') : null);
/** Smallest signed angle from bearing a to bearing b, in (−180, 180]. */
const bearingDelta = (a, b) => {
  if (a == null || b == null) return null;
  return ((b - a + 540) % 360) - 180;
};

const normalizeVenueName = (name) => String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const loadTrackOutlineIndex = () => {
  const dir = path.join(repoRoot, 'src/assets/tracks');
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => readJson(path.join('src/assets/tracks', file)))
    .filter((asset) => asset && asset.slug)
    .map((asset) => ({
      slug: asset.slug,
      normalized: normalizeVenueName(asset.name),
      northOffsetDeg: typeof asset.northOffsetDeg === 'number' ? asset.northOffsetDeg : null,
      provider: asset.source?.provider ?? null
    }));
};

const buildVenueDossier = ({ canonicalDataset, asOfDate }) => {
  const eventsById = new Map((canonicalDataset.events ?? []).map((row) => [row.id, row]));
  const tracksById = new Map((canonicalDataset.tracks ?? []).map((row) => [row.id, row]));
  const weatherBySession = new Map((canonicalDataset.weatherObservations ?? []).map((row) => [row.sessionId, row]));
  const bryceResultBySession = new Map(
    (canonicalDataset.results ?? [])
      .filter((row) => row.driverId === 'driver_bryce_aron')
      .map((row) => [row.sessionId, row])
  );
  const outlineIndex = loadTrackOutlineIndex();
  const outlineFor = (trackName) => {
    const norm = normalizeVenueName(trackName);
    return outlineIndex.find((outline) => outline.normalized === norm) ?? null;
  };

  /* INDY NXT race sessions Bryce actually ran (carries a Bryce result). */
  const raceEntries = (canonicalDataset.sessions ?? [])
    .filter((session) => session.sessionType === 'race')
    .filter((session) => eventsById.get(session.eventId)?.seriesId === 'series_indy_nxt')
    .filter((session) => bryceResultBySession.has(session.id))
    .map((session) => ({ session, event: eventsById.get(session.eventId) }))
    .filter((entry) => entry.event?.trackId);

  /* Next upcoming INDY NXT event → its scheduled session windows, attached to
   * that venue so the UI can slice the runtime hourly forecast to "his race
   * hour" without re-deriving the schedule. */
  const nextEvent = (canonicalDataset.events ?? [])
    .filter((event) => event.seriesId === 'series_indy_nxt' && (event.eventStartDate ?? '') >= asOfDate)
    .sort((left, right) => String(left.eventStartDate).localeCompare(String(right.eventStartDate)))[0] ?? null;
  const upcomingByTrack = new Map();
  if (nextEvent) {
    const scheduledSessions = (canonicalDataset.sessions ?? [])
      .filter((session) => session.eventId === nextEvent.id)
      .map((session) => ({
        sessionId: session.id,
        sessionType: session.sessionType,
        sessionName: session.sessionName ?? null,
        /* Future sessions carry the published schedule; prefer scheduledStart
         * (a not-yet-run session's actualStart can be a stale placeholder). */
        scheduledStart: session.scheduledStart ?? session.actualStart ?? null,
        timezone: session.timezone ?? tracksById.get(nextEvent.trackId)?.timezone ?? null,
        status: session.status ?? null
      }))
      .sort((left, right) => String(left.scheduledStart).localeCompare(String(right.scheduledStart)));
    upcomingByTrack.set(nextEvent.trackId, {
      eventId: nextEvent.id,
      eventName: nextEvent.name,
      eventStartDate: nextEvent.eventStartDate ?? null,
      scheduledSessions
    });
  }

  const conditionsFrom = (observation) => {
    if (!observation) return null;
    const tempC = numberOrNull(observation.ambientTempC);
    const windKph = numberOrNull(observation.windSpeedKph);
    const gustKph = numberOrNull(observation.windGustKph);
    const dirDeg = numberOrNull(observation.windDirectionDeg);
    return {
      observedAt: observation.observedAt ?? null,
      ambientTempC: tempC,
      ambientTempF: celsiusToF(tempC),
      apparentTempC: numberOrNull(observation.apparentTempC),
      humidityPct: numberOrNull(observation.relativeHumidityPct),
      windSpeedKph: windKph,
      windSpeedMph: kphToMph(windKph),
      windGustKph: gustKph,
      windGustMph: kphToMph(gustKph),
      windDirectionDeg: dirDeg,
      windCardinal: windCardinal(dirDeg),
      sky: humanizeSky(observation.ambientConditionRaw),
      wetDry: observation.wetDry ?? null,
      source: observation.source ?? 'Open-Meteo Historical Weather API hourly archive',
      sourceType: 'modeled_reanalysis',
      official: false,
      confidence: observation.confidence ?? 'modeled_medium',
      caveat: 'Modeled near-track weather for the race hour (Open-Meteo hourly archive), not official series weather or track temperature.'
    };
  };

  const byTrack = new Map();
  for (const entry of raceEntries) {
    const trackId = entry.event.trackId;
    if (!byTrack.has(trackId)) byTrack.set(trackId, []);
    byTrack.get(trackId).push(entry);
  }

  const venues = [];
  for (const [trackId, entries] of byTrack) {
    const track = tracksById.get(trackId);
    const outline = outlineFor(track?.name);
    entries.sort(
      (left, right) =>
        String(left.event.eventStartDate ?? '').localeCompare(String(right.event.eventStartDate ?? '')) ||
        String(left.session.scheduledStart ?? '').localeCompare(String(right.session.scheduledStart ?? ''))
    );
    const yearCounts = new Map();
    for (const { event } of entries) yearCounts.set(event.seasonYear, (yearCounts.get(event.seasonYear) ?? 0) + 1);
    const yearSeen = new Map();

    const visits = entries.map(({ session, event }) => {
      const result = bryceResultBySession.get(session.id) ?? {};
      const start = numberOrNull(result.startPosition);
      const finish = numberOrNull(result.finishPosition);
      const seenN = (yearSeen.get(event.seasonYear) ?? 0) + 1;
      yearSeen.set(event.seasonYear, seenN);
      const raceInYearIndex = (yearCounts.get(event.seasonYear) ?? 0) > 1 ? seenN : null;
      return {
        sessionId: session.id,
        seasonYear: event.seasonYear,
        raceInYearIndex,
        raceLabel: raceInYearIndex ? `${event.seasonYear} · Race ${raceInYearIndex}` : String(event.seasonYear),
        eventStartDate: event.eventStartDate ?? null,
        start,
        finish,
        gain: start != null && finish != null ? start - finish : null,
        result,
        conditions: conditionsFrom(weatherBySession.get(session.id))
      };
    });

    const dossierVisits = visits.map((visit, index) => {
      const prior = index > 0 ? visits[index - 1] : null;
      let deltaVsPrior = null;
      if (prior) {
        const tempThis = visit.conditions?.ambientTempF ?? null;
        const tempPrior = prior.conditions?.ambientTempF ?? null;
        const windThis = visit.conditions?.windSpeedMph ?? null;
        const windPrior = prior.conditions?.windSpeedMph ?? null;
        const humidityThis = visit.conditions?.humidityPct ?? null;
        const humidityPrior = prior.conditions?.humidityPct ?? null;
        const directionDelta = bearingDelta(prior.conditions?.windDirectionDeg ?? null, visit.conditions?.windDirectionDeg ?? null);
        deltaVsPrior = {
          priorSeasonYear: prior.seasonYear,
          priorSessionId: prior.sessionId,
          priorRaceLabel: prior.raceLabel,
          finishDelta: prior.finish != null && visit.finish != null ? prior.finish - visit.finish : null,
          gridDelta: prior.start != null && visit.start != null ? prior.start - visit.start : null,
          tempDeltaF: tempThis != null && tempPrior != null ? tempThis - tempPrior : null,
          humidityDeltaPct: humidityThis != null && humidityPrior != null ? Math.round(humidityThis - humidityPrior) : null,
          windSpeedDeltaMph: windThis != null && windPrior != null ? windThis - windPrior : null,
          windDirectionFrom: prior.conditions?.windCardinal ?? null,
          windDirectionTo: visit.conditions?.windCardinal ?? null,
          windSwung: directionDelta != null ? Math.abs(directionDelta) > 45 : false
        };
      }
      return {
        sessionId: visit.sessionId,
        seasonYear: visit.seasonYear,
        raceInYearIndex: visit.raceInYearIndex,
        raceLabel: visit.raceLabel,
        raceHref: `/races/${visit.sessionId}`,
        eventStartDate: visit.eventStartDate,
        result: {
          startPosition: visit.start,
          finishPosition: visit.finish,
          gain: visit.gain,
          finishPercentile: numberOrNull(visit.result.finishPercentile),
          fieldSize: numberOrNull(visit.result.fieldSize),
          officialStatus: visit.result.status ?? null,
          points: numberOrNull(visit.result.points)
        },
        conditions: visit.conditions,
        deltaVsPrior
      };
    });

    venues.push({
      venueId: trackId,
      trackName: track?.name ?? trackId,
      trackSlug: outline?.slug ?? null,
      trackType: track?.trackType ?? null,
      drivingDirection: track?.direction ?? null,
      lengthMi: numberOrNull(track?.lengthMi),
      cornerCount: numberOrNull(track?.cornerCount),
      geo: {
        oriented: outline?.northOffsetDeg != null,
        northOffsetDeg: outline?.northOffsetDeg ?? null,
        note:
          outline?.northOffsetDeg != null
            ? 'Outline traced from OpenStreetMap geometry; the wind bearing can be drawn to true north on the shape.'
            : outline
              ? 'Outline traced from an official track map without geographic orientation; wind is honestly omitted on the shape.'
              : 'No outline traced for this venue yet.'
      },
      visits: dossierVisits,
      visitYears: [...new Set(dossierVisits.map((visit) => visit.seasonYear))].sort((left, right) => left - right),
      upcoming: upcomingByTrack.get(trackId) ?? null
    });
  }

  venues.sort((left, right) => left.trackName.localeCompare(right.trackName));

  return {
    schemaVersion: 'brycecast.venueDossier.v1',
    title: 'This place, other years',
    readiness: 'available',
    venues,
    venueCount: venues.length,
    caveats: [
      'Conditions are modeled near-track weather joined to the race hour (Open-Meteo hourly archive) — never official INDY NXT session weather or track temperature.',
      'Deltas compare each visit to Bryce’s previous INDY NXT race at the same venue; a weather delta is a fact about the day, not a verdict on the drive.',
      'This weekend’s forecast and current conditions come from the runtime weather routes, not this static package.'
    ],
    sourceRefs: [
      sourceRef('canonicalDataset', 'Official INDY NXT results (grid, finish, field size, status) and per-race modeled weather observations, by venue and year.'),
      sourceRef('trackOutlineIndex', 'OpenStreetMap-traced outlines (ODbL) carry the north offset used to draw the wind bearing on real-geo venues; street circuits omit it.'),
      { key: 'api-weather-upcoming', path: '/api/weather/upcoming', note: 'Runtime NWS current conditions + hourly forecast for the race-week venue (near-track, not official).' }
    ]
  };
};

const readLatestColdRaceCapture = () => {
  // The live capture archive lives outside any worktree checkout. Resolve it
  // from BRYCECAST_SQLITE_PATH when the build runs somewhere the default
  // repo-relative copy does not exist (every overnight worktree regeneration),
  // so the standings snapshot reads the same archive the runtime serves.
  const dbPath = path.resolve(process.env.BRYCECAST_SQLITE_PATH ?? path.join(repoRoot, 'data/live/brycecast.sqlite'));
  if (!fs.existsSync(dbPath)) {
    // Loud, non-fatal guard (Finding: Race Week points picture went blank).
    // A worktree build with no archive would otherwise silently bake
    // standingsSnapshot.available=false into the shipped package. Warn on
    // stderr so this can never pass unnoticed again.
    console.error(
      `[build-ui-data-package] WARNING: live capture sqlite not found at ${dbPath}. ` +
        'standingsSnapshot will ship as unavailable — set BRYCECAST_SQLITE_PATH to the ' +
        'real archive to bake the points picture. (Finding: Race Week points picture blank.)'
    );
    return { available: false, reason: 'live capture database not present' };
  }
  const query = "SELECT checked_at || '\t' || session_key || '\t' || payload_json FROM race_snapshots WHERE flag='COLD' AND session_name LIKE 'Race%' ORDER BY id DESC LIMIT 1";
  // Open read-only: the archive may be an actively written live database, and
  // this build must never mutate it. Some hosts refuse `-readonly` on this
  // archive (SQLITE_CANTOPEN 14); the immutable URI is the working read path
  // there, and is safe because the roll-forward only builds against a settled
  // post-race archive — never mid-session.
  let result = spawnSync('sqlite3', ['-readonly', dbPath, query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0 || !result.stdout.trim()) {
    const uri = `file:${dbPath.split(path.sep).map(encodeURIComponent).join('/')}?immutable=1`;
    result = spawnSync('sqlite3', [uri, query], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  }
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
  /* Mirror the compact live API: every Race Control row carries its stable
     DriverID as driverId (the field the UI keys on). Omitting it forced the
     tower/battle keys onto car number, where a filler car sharing Bryce's #9
     collided — the duplicate-key warning. Faithful fixtures carry it too. */
  driverId: String(row?.DriverID ?? '').trim(),
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
  const careerLifeStats = readJson(sources.careerLifeStatsSummary);
  const careerLifeStatsMilesRaced = readCsv(sources.careerLifeStatsMilesRaced);
  const careerLifeStatsMileageBreakdowns = readCsv(sources.careerLifeStatsMileageBreakdowns);
  const careerLifeStatsTravelModeBreakdown = readCsv(sources.careerLifeStatsTravelModeBreakdown);
  const careerLifeStatsFuelEstimate = readCsv(sources.careerLifeStatsFuelEstimate);
  const careerLifeStatsTireEstimate = readCsv(sources.careerLifeStatsTireEstimate);
  const careerAtlas = readJson(sources.careerAtlasOutput);
  const restartReportSummary = readJson(sources.restartReportSummary);
  const restartByRaceRows = readCsv(sources.restartReportByRace);
  const qualifyingLayerSummary = readJson(sources.qualifyingLayerSummary);
  const qualifyingLayerConversionRows = readCsv(sources.qualifyingLayerConversion);
  const qualifyingLayerSessionRows = readCsv(sources.qualifyingLayerSessions);
  const cautionAtlasSummary = readJson(sources.cautionAtlasSummary);
  const cautionAtlasEventRows = readCsv(sources.cautionAtlasEvents);
  const cautionAtlasByRaceRows = readCsv(sources.cautionAtlasByRace);
  const cautionAtlasByVenueRows = readCsv(sources.cautionAtlasByVenue);
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

  const upcomingContextPackRefs = upcomingPackPairs.map(({ packRef }) => packRef);

  const canonicalDataset = readJson(sources.canonicalDataset);

  /* Each event's RACE date: the earliest race session's scheduledStart, kept as
     the schedule's own LOCAL date string (America/Chicago etc.) — no timezone
     math here, so no shift can move the day. The un-run race's actualStart is
     deliberately ignored: the feed's estimatedgreenflag has carried a date
     inconsistent with its own session window (Nashville 2026: green-flag field
     said Jul 18 while the window said Jul 19). */
  const raceDateByEventId = new Map();
  for (const session of canonicalDataset.sessions ?? []) {
    if (session.sessionType !== 'race' || !session.scheduledStart) continue;
    const date = String(session.scheduledStart).slice(0, 10);
    const existing = raceDateByEventId.get(session.eventId);
    if (!existing || date < existing) raceDateByEventId.set(session.eventId, date);
  }
  const upcomingEvents = upcomingPackPairs.map(({ pack, packRef }) =>
    eventFromUpcomingContextPack({ pack, packRef, raceDate: raceDateByEventId.get(pack.eventId) ?? null })
  );
  const resultsBySession = new Map(
    (canonicalDataset.results ?? [])
      .filter((row) => row.driverId === 'driver_bryce_aron')
      .map((row) => [row.sessionId, { status: row.status ?? null, fieldSize: numberOrNull(row.fieldSize) }])
  );
  const debriefScoreRows = readCsv(sources.raceDebriefScores);
  const prepSignalRows = readCsv(sources.prepSessionSignals);
  const headToHeadRows = readCsv(sources.headToHead);
  const weatherConditionRows = readCsv(sources.contextEventWeatherConditions);
  const lapTimelineRows = readCsv(sources.indyNxtLapTimeline);
  const careerConversionEnriched = enrichConversionRows(careerLabPayload.resultConversion ?? [], canonicalDataset, weatherConditionRows);
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
  const raceStoryRefs = buildRaceStoryPacks({
    raceDebriefPackPairs,
    canonicalDataset,
    canonicalSha256: summarizeArtifact(sources.canonicalDataset).sha256
  });
  const sectionLapRefs = buildSectionLapPacks({ raceDebriefPackPairs });
  const passMarkRefs = buildPassMarkRefs({ raceDebriefPackPairs });
  const seasonIndex = buildSeasonIndex({ raceDebriefPackPairs, resultsBySession, progressionRows: championshipRows });
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
    baselineCommit: skipUpstreamRefresh ? predictiveSummary.repoHead : gitHead(),
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
        raceStoryRefs,
        sectionLapRefs,
        passMarkRefs,
        seasonIndex,
        chartFamilies: [
          'outcome KPI strip',
          'qualifying-to-finish slope',
          'lap-position story',
          'incident/penalty chips',
          'team-context ranked dots',
          'source drawer'
        ],
        caveats: ['Derived archetype labels are review aids until approved for public UI copy.'],
        sourceRefs: [
          sourceRef('raceDebriefScores', 'Race debrief seed rows.'),
          sourceRef('fullFieldLapDynamicsByRace', 'Lap position story rows.'),
          sourceRef('canonicalDataset', 'Official lap-chart positions for every car, hydrated into race-story packs.'),
          sourceRef('raceLapInflectionPoints', 'Bryce inflection moments annotated on race-story lap charts.'),
          sourceRef('raceSectionLapObservations', 'Per-lap section observations behind the track heat map and its drawer.'),
          sourceRef('raceSectionFieldDistribution', 'Full-field section distributions and the derived untimed-remainder percentiles behind the heat map.'),
          sourceRef('predictiveContextPackManifest', 'All race-debrief context pack refs.')
        ]
      },
      careerLab: {
        title: 'Career Analytics Lab',
        readiness: 'available',
        sourcePayload: 'career_lab_context_pack',
        contextPackRef: careerLabContextPack,
        /* GB3 depth-layer pack, integrity-registered (the raceStory pattern):
           the UI loader verifies sha256 + id against THIS ref at load time and
           fails closed; the source drawer cites the inventory-backed path. */
        gb3DeepDiveRef: (() => {
          const relativePath = 'analysis/gb3-deep-dive/output/context-packs/gb3-deep-dive-context.json';
          if (!fs.existsSync(path.join(repoRoot, relativePath))) return null;
          const payload = readJson(relativePath);
          return { id: payload.id, type: 'gb3_deep_dive', ...summarizeArtifact(relativePath) };
        })(),
        /* Formula Ford lap-shape pack, integrity-registered like the GB3 ref:
           the UI loader verifies sha256 + id and fails closed. */
        formulaFordLapShapeRef: (() => {
          const relativePath = 'analysis/formula-ford-lap-shape/output/context-packs/formula-ford-lap-shape-context.json';
          if (!fs.existsSync(path.join(repoRoot, relativePath))) return null;
          const payload = readJson(relativePath);
          return { id: payload.id, type: 'formula_ford_lap_shape', ...summarizeArtifact(relativePath) };
        })(),
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
        resultConversion: careerConversionEnriched,
        resultConversionSample: careerConversionEnriched.slice(0, 25),
        moments: buildCareerMoments({ resultConversion: careerConversionEnriched, seasonIndex }),
        headToHead: buildCareerHeadToHead(headToHeadRows),
        lapPositionMix: buildLapPositionMix({ lapTimelineRows, canonicalDataset }),
        seasonCampaigns: buildSeasonCampaigns({
          canonicalDataset,
          progressionRows: championshipRows,
          resultConversionSessionIds: new Set(careerConversionEnriched.map((row) => row.sessionId))
        }),
        restarts: buildRestartReport({ summary: restartReportSummary, byRaceRows: restartByRaceRows, seasonIndex }),
        qualifyingLayer: buildQualifyingLayer({ summary: qualifyingLayerSummary, conversionRows: qualifyingLayerConversionRows, sessionRows: qualifyingLayerSessionRows }),
        cautionAtlas: buildCautionAtlas({
          summary: cautionAtlasSummary,
          eventRows: cautionAtlasEventRows,
          byRaceRows: cautionAtlasByRaceRows,
          byVenueRows: cautionAtlasByVenueRows,
          seasonIndex
        }),
        atlas: {
          schemaVersion: careerAtlas.schemaVersion,
          naturalEarth: careerAtlas.naturalEarth,
          geometry: careerAtlas.geometry,
          globe: careerAtlas.globe,
          venues: careerAtlas.venues,
          venueCount: careerAtlas.venueCount,
          raceCount: careerAtlas.raceCount,
          confidenceClasses: careerAtlas.confidenceClasses,
          caveats: careerAtlas.caveats,
          sourceRefs: [
            sourceRef('careerAtlasOutput', 'Validated, deterministic career atlas geometry and venue module.'),
            sourceRef('careerAtlasGlobeTexture', 'Deterministic full-world land mask generated from the pinned Natural Earth polygons.'),
            sourceRef('careerAtlasNaturalEarth', 'Pinned Natural Earth 110m public-domain land polygons.'),
            sourceRef('careerAtlasNaturalEarthSource', 'Natural Earth source commit, checksum, and public-domain terms.'),
            sourceRef('careerAtlasRequirements', 'Pinned Pillow dependency for byte-stable full-world texture generation.'),
            sourceRef('careerLifeStatsVenueFacts', 'A2 track identity and sourced coordinates for every career venue.'),
            sourceRef('careerLifeStatsMilesRaced', 'A2 personally attributable ledger covering all 145 canonical race rows.'),
            sourceRef('careerLifeStatsResearch', 'A2 metric-grain and confidence-class contracts.'),
            sourceRef('canonicalDataset', 'Canonical race identity, series, date, and classified finish fields.'),
            sourceRef('careerResultConversion', 'Career Lab conversion context; A2 restores four unclassified canonical race rows for atlas counts.'),
            sourceRef('careerAtlasBuilderScript', 'Deterministic career crop, full-world globe texture, projection, clipping, and simplification.'),
            sourceRef('careerAtlasValidatorScript', 'Provenance, globe-texture determinism, coordinate coverage, and lineage gates.')
          ]
        },
        lifeStats: {
          schemaVersion: careerLifeStats.schemaVersion,
          personalRaceMileage: careerLifeStats.personalRaceMileage,
          // Every race row already summed into the exact career mileage. The
          // odometer dedups a live/replayed session against this set so an
          // already-counted race (e.g. Nashville) never gets its provisional
          // laps added a second time. Kept at the lifeStats root because the
          // validator pins personalRaceMileage to the summary.json shape.
          coveredSessionIds: careerLifeStatsMilesRaced
            .map((row) => String(row.sessionId ?? '').trim())
            .filter(Boolean),
          physicalSessionMileage: careerLifeStats.physicalSessionMileage,
          travel: careerLifeStats.travel,
          countries: numberOrNull(careerLifeStats.countries),
          venues: numberOrNull(careerLifeStats.venues),
          longestLeg: careerLifeStats.longestLeg,
          farthestVenuePair: careerLifeStats.farthestVenuePair,
          coverageGaps: careerLifeStats.coverageGaps ?? [],
          resourceModels: careerLifeStats.resourceModels,
          mileageBreakdowns: careerLifeStatsMileageBreakdowns.map((row) => ({
            ...row,
            sessionCount: numberOrNull(row.sessionCount),
            lapsFloor: numberOrNull(row.lapsFloor),
            milesFloor: numberOrNull(row.milesFloor)
          })),
          travelModeBreakdown: careerLifeStatsTravelModeBreakdown.map((row) => ({
            ...row,
            legCount: numberOrNull(row.legCount),
            greatCircleMiles: numberOrNull(row.greatCircleMiles),
            routeAdjustedLowMiles: numberOrNull(row.routeAdjustedLowMiles),
            routeAdjustedBaseMiles: numberOrNull(row.routeAdjustedBaseMiles),
            routeAdjustedHighMiles: numberOrNull(row.routeAdjustedHighMiles)
          })),
          fuelEstimateRanges: careerLifeStatsFuelEstimate.map((row) => ({
            ...row,
            seasonYear: numberOrNull(row.seasonYear),
            observedMilesFloor: numberOrNull(row.observedMilesFloor),
            estimatedFuelLowLiters: numberOrNull(row.estimatedFuelLowLiters),
            estimatedFuelBaseLiters: numberOrNull(row.estimatedFuelBaseLiters),
            estimatedFuelHighLiters: numberOrNull(row.estimatedFuelHighLiters)
          })),
          tireEstimateRanges: careerLifeStatsTireEstimate.map((row) => ({
            ...row,
            seasonYear: numberOrNull(row.seasonYear),
            observedSessionsWithLaps: numberOrNull(row.observedSessionsWithLaps),
            unknownLapSessionsExcluded: numberOrNull(row.unknownLapSessionsExcluded),
            estimatedUniqueTiresLow: numberOrNull(row.estimatedUniqueTiresLow),
            estimatedUniqueTiresBase: numberOrNull(row.estimatedUniqueTiresBase),
            estimatedUniqueTiresHigh: numberOrNull(row.estimatedUniqueTiresHigh)
          })),
          venueSources: careerLifeStats.venueSources ?? [],
          caveats: [
            'All 145 canonical race rows count. Daytona uses Bryce’s 142 Al Kamel-derived driver-stint laps, never the shared car’s 780 laps.',
            'The physical-session number is a floor: exact observations and F1600 lower bounds stay separate; FROC and private-test gaps remain unknown.',
            'Travel is a minimum venue-to-venue displacement. The route adjustment is a modeled range; actual travel is blocked pending seasonBase and returnHomeFrequency.'
          ],
          sourceRefs: [
            sourceRef('careerLifeStatsSummary', 'Validated Career Life Stats totals and method labels.'),
            sourceRef('careerLifeStatsResearch', 'Source-grain, metric-grain, confidence, travel, fuel, and tire contracts.'),
            sourceRef('careerLifeStatsVenueFacts', 'Named, checkable length and coordinate sources for every career venue.'),
            sourceRef('careerLifeStatsResourceAssumptions', 'Explicit low/base/high model assumptions and primary source URLs.'),
            sourceRef('careerLifeStatsMilesRaced', 'All 145 race rows at personally attributable driver-race grain.'),
            sourceRef('careerLifeStatsSessionLedger', 'Deduplicated physical-session ledger with confidence classes.'),
            sourceRef('careerLifeStatsMileageBreakdowns', 'Visualization-ready mileage dimensions for future UI work.'),
            sourceRef('careerLifeStatsTravelLegs', 'Chronological travel minimum and route-proxy range by leg.'),
            sourceRef('careerLifeStatsTravelModeBreakdown', 'Visualization-ready travel-mode proxy totals.'),
            sourceRef('careerLifeStatsFuelEstimate', 'Modeled low/base/high fuel estimates by series and chassis.'),
            sourceRef('careerLifeStatsTireEstimate', 'Modeled low/base/high unique-tire estimates by series and year.')
          ]
        },
        caveats: [
          'Career analytics must use metric-family parity states; older series do not expose INDY NXT-grade depth.',
          'Result-conversion rows are source-bounded historical context, not a universal driver-strength model.',
          'Weather joins cover only sessions with a sourced condition report (official series reports or labeled modeled observations); rows without one carry null and are excluded from wet/dry splits.',
          'Head-to-head records cover INDY NXT grids only and count official classified finishes, not lap-by-lap battles.'
        ],
        sourceRefs: [
          sourceRef('careerSeriesSummary', 'Series-level performance rows.'),
          sourceRef('careerMetricParity', 'Metric parity/source-boundary rows.'),
          sourceRef('careerResultConversion', 'Cross-series result conversion rows.'),
          sourceRef('predictiveCareerPriorMatrix', 'Parity-aware career prior matrix.'),
          sourceRef('headToHead', 'INDY NXT head-to-head records vs every rival shared a grid with.'),
          sourceRef('contextEventWeatherConditions', 'Per-session wet/dry condition reports joined onto career races.'),
          sourceRef('indyNxtLapTimeline', 'Bryce per-lap official positions across all INDY NXT races.')
        ]
      },
      venueDossier: buildVenueDossier({ canonicalDataset, asOfDate: predictiveSummary.asOfDate }),
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
// Finding C — fail closed before touching any generated artifact.
const asOfGuard = assertAsOfPinAllowsBuild();
if (eventRollCheckOnly) {
  console.log(JSON.stringify({ ok: true, mode: 'check-event-roll', ...asOfGuard }, null, 2));
  process.exit(0);
}
if (!skipUpstreamRefresh) {
  runContextEventNarrativeLayer();
  runPredictiveRaceIntelligence();
  runSupplementalContextPacks();
}
runCareerLifeStats();
runCareerAtlas();
runRestartReport();
runCautionAtlas();
runQualifyingLayer();
const dataPackage = buildPackage();
fs.writeFileSync(outputPath, `${JSON.stringify(dataPackage, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, wrote: path.relative(repoRoot, outputPath), schemaVersion: dataPackage.schemaVersion }, null, 2));
