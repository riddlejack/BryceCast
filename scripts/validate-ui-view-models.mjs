import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const requiredSurfaces = [
  'race_weekend_prep',
  'live_race_companion',
  'race_debrief',
  'career_lab',
  'source_ops'
];

const requiredStateExports = [
  'RaceWeekendPrepState',
  'LiveRaceCompanionState',
  'RaceDebriefState',
  'CareerLabState',
  'SourceOpsState',
  'AnalyticsMetric'
];

const requiredSurfaceIds = {
  race_weekend_prep: ['prep_event_command_center', 'prep_track_history', 'prep_practice_qualifying_funnel', 'prep_weather_window'],
  live_race_companion: ['live_source_readiness', 'live_bryce_status_tile', 'live_timing_tower', 'live_gap_lap_trend', 'live_points_projection', 'live_weather_strip'],
  race_debrief: [
    'debrief_header',
    'debrief_qualifying_conversion',
    'debrief_lap_position_story',
    'debrief_incidents_penalties',
    'debrief_team_context',
    'debrief_source_drawer'
  ],
  career_lab: ['career_series_summary', 'career_metric_parity_matrix', 'career_result_conversion_explorer', 'career_gap_ledger'],
  source_ops: ['ops_validation_status', 'ops_live_source_console', 'ops_replay_archive_state']
};

const readJson = (relativePath) => {
  const fullPath = path.join(repoRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
};

const readText = (relativePath) => {
  const fullPath = path.join(repoRoot, relativePath);
  return fs.readFileSync(fullPath, 'utf8');
};

const fail = (message) => {
  throw new Error(message);
};

const manifest = readJson('analysis/ui-contract/ui-metric-manifest.json');
if (manifest.schemaVersion !== 'brycecast.uiMetricManifest.v1') {
  fail(`Unexpected UI metric manifest schema: ${manifest.schemaVersion}`);
}

if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
  fail('UI metric manifest has no items');
}

const manifestSurfaces = new Set(manifest.items.map((item) => item.surface));
for (const surface of requiredSurfaces) {
  if (!manifestSurfaces.has(surface)) {
    fail(`UI metric manifest missing surface ${surface}`);
  }
}

for (const [surface, ids] of Object.entries(requiredSurfaceIds)) {
  const itemIds = new Set(manifest.items.filter((item) => item.surface === surface).map((item) => item.id));
  for (const id of ids) {
    if (!itemIds.has(id)) {
      fail(`UI metric manifest missing ${surface} item ${id}`);
    }
  }
}

const contractsSource = readText('src/data/analyticsContracts.ts');
const viewModelsSource = readText('src/data/analyticsViewModels.ts');

for (const exportName of requiredStateExports) {
  if (!contractsSource.includes(`interface ${exportName}`) && !contractsSource.includes(`type ${exportName}`)) {
    fail(`analyticsContracts.ts missing ${exportName}`);
  }
}

for (const surface of requiredSurfaces) {
  if (!contractsSource.includes(surface)) {
    fail(`analyticsContracts.ts missing surface ${surface}`);
  }
}

for (const [surface, ids] of Object.entries(requiredSurfaceIds)) {
  if (!viewModelsSource.includes(surface)) {
    fail(`analyticsViewModels.ts missing selector family ${surface}`);
  }
  for (const id of ids) {
    if (!viewModelsSource.includes(id)) {
      fail(`analyticsViewModels.ts missing manifest item ${id}`);
    }
  }
}

console.log(`Validated ${manifest.items.length} manifest items across ${requiredSurfaces.length} UI view-model surfaces.`);
