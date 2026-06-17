# Career Generated Worker Note

Scope: read-only review of current generated career analytics truth and the generated UI-ready career artifacts. No ingestion generators were run.

## Current Generated Truth

- `data/career/reports/validation-report.json`:
  - `checkedAt=2026-06-16T18:12:34.976Z`
  - `ok=true`
  - `errorCount=0`
  - `warningCount=1`
  - Warning: 9 physical sessions do not yet have `scheduledStart` or `actualStart`; weather/live joins must wait for session time backfill.
- `data/career/reports/ingestion-summary.json`:
  - `generatedAt=2026-06-16T18:12:35.595Z`
  - `openGapCount=9`
  - `priorityGaps=[]`
  - Counts: 555 drivers, 7 series, 75 teams, 472 cars, 42 tracks, 10 seasons, 87 events, 469 sessions, 8,158 results, 1,547 qualifying results, 67,686 lap samples, 35 racecraft events, 82 penalties, 132 incidents, 181 weather observations, 940 media assets, 370 derived metrics, 1,199 source evidence rows.
  - `broadcastRoutes=0`, `notificationRules=0`, and `notificationEvents=0`; those are not current product data sources.
- `data/career/reports/career-coverage-matrix.json`:
  - `generatedAt=2026-06-16T18:12:36.313Z`
  - INDY NXT: 45 events, 189 sessions, 36 completed race sessions, 738 race/heat result rows, 87 qualifying sessions, 111/189 exact session windows, 0/189 official weather rows, 36/36 completed races with lap chart samples, 144/145 comparable sessions with official section metrics, 738/738 pit-stop counts, detailed pit context unavailable, derived benchmarks blocked.

## UI-Ready Artifact Counts

- `analysis/ui-ready-artifacts.json` validation snapshot:
  - `careerMetricFamilyRows=49`
  - `careerResultRows=137`
  - `deepFuturePrepRows=9`
  - `deepRaceScoreRows=36`
  - `firstPassIndyNxtRaceRows=36`
  - `firstPassLapTimelineRows=1390`
  - `ingestionOpenGaps=9`
  - `validationErrors=0`
  - `validationWarnings=1`
- Stable UI artifact count: 13.
- Exploratory/deferred artifact count: 7.
- Missing backend contracts: runtime live-readiness hardening proof, post-official-results reconciliation report path, timezone-normalized schedule countdown semantics.

## Career Lab Implications

- Career Lab v1 should use `career_series_result_summary.csv` and `career_metric_family_parity.csv`.
- `career_result_conversion.csv` is source-bounded and suitable for v1.5 explorer/drilldown.
- Older series must be shown through metric-family parity, not through INDY NXT-grade racecraft/section/live assumptions.
- Weather context is source-backed only for some non-INDY series and modeled/NWS contexts. Official INDY NXT weather is unavailable.
- Teammate/team rows are descriptive result context only. They do not support engineering root-cause claims.
- Points coverage is not universal. Season/result points are safe only where source-present; do not infer missing points.
- Field-strength and teammate benchmark models are blocked, not partial.
- Generated career truth supports historical/prep views. It does not support live telemetry, live Race Control claims, POV/radio, broadcast route inventory, notification rules, or detailed pit strategy.

## Stable Vs Deferred

Stable v1 inputs include:

- `analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_driver.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/race_track_type_summary.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_year.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv`
- `analysis/indy-nxt-discovery/output/deep_dive/tables/ui_analytics_contract.csv`
- `analysis/career-parity/output/tables/career_metric_family_parity.csv`
- `analysis/career-parity/output/tables/career_result_conversion.csv`

Deferred/exploratory inputs include correlations, exploratory model outputs, driver/field strength ratings, and deep section-results artifacts until denominator QA/display filtering exists.
