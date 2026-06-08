# INDY NXT Dashboard Readiness

Updated: 2026-06-08 13:10 CDT.

This is the production-use contract for BryceCast UI work against the 2024-current INDY NXT slice. Source of truth remains `data/career/career.dataset.json`, with generated coverage in `data/career/reports/career-coverage-matrix.json` and parser diagnostics in `data/career/reports/indy-nxt-report-details-backfill-report.json`.

## Readiness State

INDY NXT has no active source-backed priority gaps in the current coverage matrix. Its open gap row, `gap_indy_nxt_qualifying_lap_reports`, is retained as a caveat ledger for explicitly source-bounded details, not as a blocker for dashboard work.

Current INDY NXT coverage:

| Category | State | Production use |
| --- | --- | --- |
| Events and sessions | complete, 45 events / 189 sessions | Season/event/session navigation. |
| Race results | complete, 36/36 completed race sessions, 738 race rows | Results, finishing position, status, points, race deltas. |
| Qualifying classifications | complete, 87/87 result-bearing qualifying sessions | Qualifying rank, quali-to-race deltas, start-context cards. |
| Grid/start positions | complete, 738/738 race rows | Start vs finish, launch/position-gain analytics. |
| Pit-stop counts | complete, 738/738 race rows | Pit count summaries only. |
| Penalties/decisions | complete for official Results PDF rows, 76 imported rows | Official penalty/decision callouts where rows exist. |
| Incidents/cautions | complete for official status and caution-summary rows, 132 INDY NXT incident rows total | Status incidents and caution causal summaries. |
| Racecraft summary | complete for official Event Summary rows, 35 racecraft events | Most-improved and official racecraft summary cards. |
| Leader-lap/event metrics | complete for completed race reports | Leader lap, margin, flag-state, and race-stat context. |
| Section data | partial, 144/145 comparable sessions | Section-rank and per-lap section metrics except the single corrupt official report holdout. |
| Lap samples | partial by fidelity, 36/36 completed races imported | Lap-position charts from official Race Lap Charts with caveat labels for partial charts. |
| Track metadata | complete, 13/13 INDY NXT tracks | Track cards, track type, length, corners, timezone. |
| Exact session windows | partial, 111/189 physical sessions | Use exact-time rows for time joins; keep the remaining qualifying/group rows date-only. |
| Official weather conditions | unavailable | Do not present modeled ambient weather as official INDY NXT weather. |
| Modeled ambient weather | complete for archive-eligible exact-window sessions, 95 rows | Ambient context for exact-window race/practice/qualifying sessions with non-official labels. |
| Detailed pit context | unavailable | Do not show stop lap, pit lane time, tire/service, or sequence. |
| Derived benchmarks | blocked | Build separately before teammate/field-strength claims become production-safe. |

## Safe Analytics Now

- Event/session browser for 2024, 2025, and current 2026 INDY NXT.
- Bryce race and qualifying history, including start, finish, position gain/loss, status, points, and pit-stop count.
- Field-wide race result context across all imported INDY NXT races.
- Official qualifying-to-race and grid-to-finish comparisons for completed races.
- Lap-position charting for all completed races, with explicit partial-chart caveats on the 10 clean partial imports.
- Official penalty/decision summaries and caution-summary incidents from Results PDFs.
- Official terminal-status incidents from EventsSessionDetails status labels.
- Official Event Summary race-stat metrics and most-improved racecraft notes.
- Official Leader Lap Summary metrics with leader timing, margins, and flag-state context.
- Official section timing/rank metrics for all comparable sessions except `session_indy_nxt_2024_6325`.
- Track metadata and timezone-aware exact-window joins for the 111 source-backed exact session windows.
- Non-official modeled ambient weather for 95 archive-eligible exact-window sessions, including all 36 completed race sessions. Use `modeled_medium` labels and the station cross-check report as supporting QA, not as official weather.

## Caveats For UI Copy

- Lap charts: 26 of 36 completed Race Lap Chart PDFs fully validate. Ten are clean partial visible-sample imports. Do not infer missing terminal or conflict laps from result lap counts.
- Section data: `session_indy_nxt_2024_6325` is held out because the official Section Results URL returns corrupt/truncated non-PDF bytes. `session_indy_nxt_2025_6596` is an official canceled/no-row qualifying report and is excluded from the comparable denominator.
- Exact session windows: the 78 remaining date-only INDY NXT rows are qualifying/group/combined qualifying sessions where official sources expose only coarse qualifying blocks or no exact qualifying row. Do not use those rows for hour-level weather or live-context joins.
- Pit context: official sources expose pit-stop counts, but no dedicated pit-summary or pit-lane sequence. Keep UI language to counts.
- Weather: no official INDY NXT session weather/track-condition observations are imported. The separate Open-Meteo model covers 95 archive-eligible exact-window sessions and is cross-checked against 6 NOAA/NCEI GHCNh station samples with no material conflicts. Keep UI labels to modeled ambient weather.
- Derived benchmarks: teammate and field-strength analytics are not production-ready from this career dataset yet.

## Next Highest-Leverage Work

1. Wire the UI/data layer to consume the safe INDY NXT categories above, with caveat badges driven by the coverage matrix and gap IDs.
2. Resolve or preserve GB3 2022 session `1248` after one focused alternate-official-source check.
3. Decide Formula Ford 2020 lap-sample scope: expand from official lap-analysis pages if worthwhile, or mark Bryce-only as the supported historical scope.
4. Build derived benchmarks only after the UI-facing INDY NXT source categories are stable.
