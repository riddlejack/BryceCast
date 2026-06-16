# BryceCast UI Readiness Execution Plan

Generated: 2026-06-16
Baseline commit: `5636bb6 Harden preserved career data gaps`

## Objective

Prepare BryceCast for a polished analytics-first frontend by turning the clean source/backend baseline into explicit product contracts, refreshed analytics artifacts, live-race readiness contracts, and a clean active workspace boundary.

## Baseline State

- Career validation passes with `errorCount: 0`.
- Current validation warning: 9 FROC physical sessions do not yet have exact `scheduledStart` or `actualStart`; weather/live joins must wait for source-backed session time backfill.
- Current generated career reports are from 2026-06-16.
- Historical open gaps are preserved source limits/caveats, not broad unknown blockers.
- Live endpoint plumbing exists, but green-flag INDY NXT production proof still requires a real session rehearsal.

## Work Lanes

### Lane 1: UI Analytics Contract

Ownership:

- `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`
- `analysis/ui-contract/ui-metric-manifest.json`
- Optional `analysis/ui-contract/README.md`

Goal:

Define every v1/v1.5 UI screen, card, chart, fallback state, and source/caveat requirement before frontend work starts.

Acceptance:

- Every proposed v1 metric names an exact dataset collection, generated table, or API endpoint.
- Every metric has grain, required fields, source state, confidence/caveat behavior, fallback state, and recommended visualization family.
- Live-only metrics are separated from historical/pre-race metrics.
- Unsupported metrics are explicitly labeled unavailable/deferred, not silently omitted.

### Lane 2: Analytics Refresh And Promotion

Ownership:

- `analysis/indy-nxt-discovery/**`
- `analysis/career-parity/**`
- Optional `analysis/race-weekend-prep/**`

Goal:

Rerun and review analytics after baseline `5636bb6`, then identify which exploratory insights should graduate into stable UI-facing artifacts.

Acceptance:

- Analytics outputs reflect the current canonical dataset and current generated reports.
- Race-weekend prep, race debrief, live companion, and career lab candidates are separated.
- Each promoted insight has a stable artifact path and source/caveat state.
- Exploratory-only analyses are clearly labeled and excluded from v1 UI contracts.

### Lane 3: Live Race Contract And Points Projection

Ownership:

- `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`
- Optional proposed tests/specs under `docs/` or `analysis/live-contract/`
- Do not edit shared API source until the contract has been reviewed by the orchestrator.

Goal:

Define the live race-day backend contract needed by the UI, especially readiness state, wrong-series safeguards, replay requirements, and live points projection.

Acceptance:

- Specifies `LiveTimingState`, `BryceLiveState`, `PointsProjectionState`, `WeatherState`, `ReplayState`, and `SourceHealthState`.
- Defines `/api/readiness` or equivalent readiness contract with `ready`, `pre_session`, `degraded`, `wrong_series`, `stale`, and `blocked` states.
- Defines how live Race Control point fields are used when populated and how the UI degrades when absent.
- Lists tests needed for null-vs-zero, wrong-series timing, stale timing, no Bryce row, missing weather leg, and partial replay archive.

### Lane 4: Workspace Cleanup

Ownership:

- To be opened only after Lanes 1-3 are reviewed.

Goal:

Archive or relabel legacy POV/radio UI artifacts and stale frontend files after active product surfaces are known.

Acceptance:

- Active docs and historical docs are clearly separated.
- Old screenshots/mockups are archived or labeled legacy.
- `src/App.tsx` no longer presents POV/radio assumptions as the active product direction; legacy POV/radio helper modules may remain as inactive research utilities.
- No active contract/source files are deleted.

## Integration Gates

The orchestrator must review Lanes 1-3 before any frontend implementation starts.

Pass criteria:

- Every v1 UI element is backed by a source-backed metric, a live API contract, or an explicit unavailable state.
- Points projection is either implemented in the backend or explicitly deferred from v1 with a product-approved fallback.
- Road America live rehearsal gates are documented and testable.
- Generated reports and docs do not contradict each other.
- The active workspace boundary is clear enough for a UI agent to start without inheriting old POV/radio assumptions.

## Final Backend/Product Readiness Commands

Run after integration and any implementation work:

```bash
npm run career:import:all
npm run career:test
npm run api:smoke
npm run audit:sources
npm run audit:live:pressure:primary
npm run weather:live
npm run weather:live:upcoming
npm run build
git diff --check
```

Run targeted autoreview on the final integration diff and any implementation commits. Review prompts should focus on source-state truthfulness, wrong-series timing, null-vs-zero handling, stale/generated doc drift, and UI metrics without backing data.
