# Project Brief

BryceCast is a Bryce Aron racing analytics product. The intended product is a general BryceCast app for race-week prep, live companion readiness, post-race debrief, and a source-backed Career Lab. Road America is the current concrete event slice because the generated June 18 pack includes Road America Race 1/Race 2 as the first upcoming-event UI sources; it is not the final app scope.

Primary audiences:

- Bryce and race-facing users who need source-backed context without unsupported engineering claims.
- Family/friends and serious fans who want the weekend story, what to watch, and a clear debrief.
- Operators/builders who need source confidence, gaps, and live readiness states visible.

Source hierarchy for the review:

1. `data/career/career.dataset.json` and generated reports under `data/career/reports/`.
2. `analysis/ui-data-package/ui-data-package.json`.
3. Predictive context-pack manifest and packs under `analysis/predictive-race-intelligence/output/context-packs/`.
4. Validator-backed analysis lane outputs under `analysis/*/output/`.
5. Runtime `/api/*` contracts and source code for live behavior.
6. Prose docs after generated artifacts.

Hard guardrails:

- Do not use legacy MagicPath visual mock docs as current UI direction.
- Do not ask the UI to parse raw CSVs directly when a UI package/context pack exists.
- Predictive content is limited to historical prior bands, top-10 path language, analogs, and update hooks. Do not create public expected finish, top-10 probability, betting line, or causal model claims.
- Live mode is fixture-backed/API-plumbed but not production-proven. Do not claim live green-flag proof, official points reconciliation, live GPS, team radio audio, live POV, tire/overtake strategy, or detailed pit sequence unless a later live proof artifact exists.
- Older series have uneven source granularity; Career Lab needs coverage badges and unavailable states instead of pretending every era has INDY NXT-grade data.

Verified anchors:

| Anchor | Value |
| --- | --- |
| career schema | bryce-career.v1 |
| dataset updatedAt | 2026-06-16T18:12:31.143Z |
| validation errors | 0 |
| validation warnings | 1 |
| open gaps | 9 (gap_euroformula_2023_championship_classification_pdf_current_mismatch, gap_formula_ford_2020_grid_start_source_asymmetry_holdouts, gap_froc_2024_round_4_date_conflict, gap_froc_2024_session_times_missing, gap_froc_2024_start_positions_partial, gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch, gap_gb3_2022_session_1248_missing_json, gap_indy_nxt_qualifying_lap_reports, gap_remaining_career_rows_after_track_metadata) |
| UI package schema | brycecast.uiDataPackage.v1 |
| UI package generatedAt | 2026-06-18T17:52:13.930Z |
| UI screens | roadAmericaPrep, liveCompanionFixtures, raceDebrief, careerLab, sourceOps |
| predictive summary schema | brycecast.predictiveRaceIntelligence.summary.v1 |
| context pack schema | brycecast.predictiveRaceIntelligence.contextPackManifest.v1 |
| context pack counts | {"career_lab":1,"live_race_day":1,"race_debrief":36,"upcoming_event":9} |
