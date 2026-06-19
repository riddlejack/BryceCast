# UI Contract Worker Note

Status after June 18: background evidence only. The active UI fixture baseline is `analysis/ui-data-package/ui-data-package.json` generated `2026-06-18T17:52:13.930Z` plus `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`. If this note conflicts with those files, use the newer context-pack baseline.

Scope: read-only review of `analysis/ui-data-package/ui-data-package.json`, `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`, `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`, `analysis/ANALYTICS_UI_ARTIFACT_INDEX.md`, `analysis/ui-ready-artifacts.json`, and supporting generated contract manifests.

## Source-Backed Findings

- The active UI data package is the primary design/build fixture source for current UI work. It was regenerated as `schemaVersion=brycecast.uiDataPackage.v1`, `generatedAt=2026-06-18T17:52:13.930Z`, and `baselineCommit=ce904af`.
- Package screens are `roadAmericaPrep`, `liveCompanionFixtures`, `raceDebrief`, `careerLab`, and `sourceOps`.
- The package rules explicitly say static package values do not replace canonical career ingestion or runtime live APIs. Live timing, live weather, and live points remain runtime API truth.
- Road America prep is `readiness=partial`, with two event rows:
  - Race 1: `Grand Prix at Road America Race 1`, `2026-06-19`, Road America, road, 4.048 miles, 14 corners.
  - Race 2: `Grand Prix at Road America Race 2`, `2026-06-20`, same track facts.
  - Same-track history: 2 prior INDY NXT races, average finish 8.5, average gain 0, top-10 rate 100%.
  - Track-type history: average finish 12.6, average gain -2.45, top-10 rate 40%.
  - `weatherState=future_unavailable_in_historical_dataset`, so static prep must not make weather claims.
- Live fixture states are exactly `wrong_series`, `pre_session`, `ready`, `degraded`, `stale`, and `blocked`. Variants are `base`, `no_bryce_archive_ready`, `no_bryce_archive_missing`, `replay_empty`, and `replay_repeated_cold`.
- `ready` and `degraded` are live-on states. `ready` has `points.mode=race_control_live` and `reconciliationRequired=true`; `degraded` has `points.mode=partial` and also requires reconciliation.
- `wrong_series` is a red state, not an off-week synonym. It means Race Control may be reachable, but the active feed is not the guarded Bryce INDY NXT session.
- `post-session unreconciled/reconciled` is only partially materialized. Current package fields expose `points.reconciliationRequired`; the live contract describes reconciliation, but there is not yet a literal readiness enum for `unreconciled` or `reconciled`.
- `off-week` is not a literal package state. It must be a product-level homepage state built from the absence of a current race-week/live-readiness context plus the next schedule/career context.

## Contract Conflicts To Preserve

- The docs sometimes speak as if incident/penalty and team-context debrief elements can be v1, but the generated metric manifest marks `debrief_incidents_penalties` and `debrief_team_context` as `v1.5`. Trust the generated manifest/package first: these can exist in data drawers or reviewed debrief details, but should not be first-screen v1 headline claims without Jack/product review.
- The live contract and package support points display in v1, but only through `/api/readiness.points`; the frontend should not compute a standalone points model locally.
- The package covers synthetic `ready` fixture data, but docs still require a real Road America green/yellow INDY NXT rehearsal before claiming production live mode.

## Useful Source Handles

- `analysis/ui-data-package/ui-data-package.json`
- `analysis/ui-contract/ui-metric-manifest.json`
- `analysis/ui-ready-artifacts.json`
- `analysis/live-contract/live-api-contract.json`
- `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`
- `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`
- `analysis/ANALYTICS_UI_ARTIFACT_INDEX.md`
