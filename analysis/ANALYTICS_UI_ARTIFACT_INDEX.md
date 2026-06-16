# BryceCast Analytics UI Artifact Index

Generated: 2026-06-16
Baseline: `5636bb6 Harden preserved career data gaps`
Canonical dataset updated: `2026-06-16T18:12:31.143Z`

This index promotes only source-backed analytics artifacts that can feed the UI contract after the current backend baseline. It separates stable v1 inputs from exploratory work that should stay out of the first frontend build.

## Stable UI Artifacts

| UI use case | Stable artifact | Grain | Source/caveat state | UI status |
| --- | --- | --- | --- | --- |
| Hydrated UI data package | `analysis/ui-data-package/ui-data-package.json` | screen package | `schemaVersion=brycecast.uiDataPackage.v1`; includes source refs/caveats per screen | Use as the primary design/build fixture source before polished UI work. Regenerate with `npm run analytics:ui-data-package`; validate with `npm run analytics:ui-data-package:validate`. |
| Race-weekend prep, including Road America | `analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv` | future INDY NXT event | `sourceState=schedule_plus_historical_results`; `weatherState=future_unavailable_in_historical_dataset` | Use for preview cards. Road America Race 1 is 2026-06-19 and Race 2 is 2026-06-20. Do not show forecast/weather claims from this file. |
| Race-weekend prep funnel | `analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv` | completed race event | `sourceState=official_api_session_results`; caveat says practice/group qualifying are rank-context signals | Use as context, not absolute pace proof. |
| Live race companion historical join context | `analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv` | season race checkpoint | `sourceState=official_results_points_progression`; future 2026 sessions excluded | Join by season/session context when live timing identifies the current event. Requires live readiness contract before live use. |
| Live race companion track context | `analysis/indy-nxt-discovery/output/deep_dive/tables/race_track_type_summary.csv` | track type | `sourceState=official_results_derived_summary` | Use as low-risk track-type baseline near live timing. |
| Race debrief scoring/classification | `analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv` | one Bryce INDY NXT race | has `sourceState`, `confidence`, `caveat`; archetypes are derived | Use for debrief structure after manual label review. Keep caveat drawer visible. |
| Race debrief source coverage | `analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv` | source family | has `analysisStatus` and `auditConclusion` | Use to drive source confidence drawer and unavailable-state copy. |
| INDY NXT deep analytics contract | `analysis/indy-nxt-discovery/output/deep_dive/INDY_NXT_UI_ANALYTICS_CONTRACT.md` and `analysis/indy-nxt-discovery/output/deep_dive/tables/ui_analytics_contract.csv` | UI module | every module has source state, readiness, and display rule | Use as the stable bridge from analytics to Lane 1 UI contract work. |
| Lap-position and race-shape context | `analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv` and `analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_driver.csv` | race and driver-race | `sourceState=official_lap_chart`; partial chart badges required | Use for lap story and live companion historical context, not unsupported telemetry. |
| Team/teammate context | `analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv` and `analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_year.csv` | race and team-season | `sourceState=official_results`; caveats prohibit engineering-root-cause claims | Use descriptively only. |
| Full career lab parity | `analysis/career-parity/output/tables/career_metric_family_parity.csv` | series by metric family | has `parityStatus`, `uiUse`, and `caveat` | Use to decide which metric families appear in Career Lab and which show unavailable states. |
| Full career result conversion | `analysis/career-parity/output/tables/career_result_conversion.csv` and `analysis/career-parity/output/tables/career_series_result_summary.csv` | race result and series summary | `sourceState=official_or_source_backed_result`; field-size caveats in parity table | Use for source-bounded cross-series summaries with finish percentiles. |

## Road America Prep State

`future_weekend_prep_inputs.csv` currently has 9 future rows from run date 2026-06-16. The first two rows are:

| Event | Date | Track | Prior Bryce INDY NXT races at track | Same-track average finish | Road-course top-10 rate | Weather state |
| --- | --- | --- | --- | --- | --- | --- |
| Grand Prix at Road America Race 1 | 2026-06-19 | Road America | 2 | 8.5 | 0.4 | `future_unavailable_in_historical_dataset` |
| Grand Prix at Road America Race 2 | 2026-06-20 | Road America | 2 | 8.5 | 0.4 | `future_unavailable_in_historical_dataset` |

This is stable for historical prep context. It is not a weather forecast, live session state, or strategy predictor.

## Exploratory Or Non-v1 Artifacts

| Artifact | Why it should not ship as v1 UI truth |
| --- | --- |
| `analysis/indy-nxt-discovery/output/tables/indy_nxt_correlations.csv` | Correlations are explicitly exploratory and non-causal. Use for analyst hypothesis selection only. |
| `analysis/indy-nxt-discovery/output/tables/indy_nxt_exploratory_model.csv` | Sample size is too small for product claims. Do not expose model coefficients or causal interpretation. |
| `analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_correlations.csv` | Directional prep signal only; use `prep_session_signals.csv` for UI context instead. |
| `analysis/indy-nxt-discovery/output/deep_dive/tables/driver_strength_ratings.csv` and `field_strength_by_race.csv` | Descriptive same-sample opponent context. Safe only with "descriptive, not predictive" language; hold from v1 headline cards. |
| `analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv` and `section_results_deep_by_section.csv` | Useful but needs denominator QA and display filtering. It can support deeper drilldown after the first debrief slice. |
| Weather-performance interpretations | Current INDY NXT weather is modeled/non-official. Use weather as context only; do not claim causal effects. |
| Pit strategy analysis | Current source supports pit-stop counts only. No pit sequence, tire, service, stop-lap, or pit-time detail exists. |
| Engineering or reliability root-cause analysis | Official result status and team rows do not expose engineering telemetry, setup notes, or root-cause evidence. |

## Remaining Proof Gaps Before Production Live Mode

- Live race companion has `/api/readiness`, guarded points modes, wrong-series guard, stale/no-Bryce states, and replay state. It still needs a real green/yellow INDY NXT session rehearsal before claiming production live mode.
- Live points projection can render Race Control point fields when `/api/readiness.points.mode` permits it. It still needs live-session field-population proof and post-session official reconciliation.
- Future-weather display needs a separate forecast/current-weather source with source state. The prep artifact intentionally leaves future weather unavailable.
- Race debrief archetype labels need manual review before public copy. The score table is stable; the prose labels are not final editorial truth.
- Section results need a UI denominator rule before headline display: suppress or badge low-comparison rows.
- Career Lab must read parity by metric family, not assume INDY NXT-grade depth across older series.
- Polished visual direction is still intentionally unresolved; use the UI data package and fixture-state library before asking for final taste decisions.

## Verification Snapshot

- First-pass INDY NXT summary: 36 analyzable Bryce race rows, 1,390 lap timeline rows, 989 section-strength rows, `repoHead=e24edd0`.
- Deep INDY NXT summary: 36 race score rows, 50 driver-strength rows, 36 championship progression rows, 9 future prep rows, run date 2026-06-16.
- Career parity summary: 137 result rows, 49 metric-family rows, 7 series summary rows.
- Generated reports remain source-bounded: current validation has 0 errors, 1 warning for 9 FROC physical sessions missing exact start times, and 9 preserved open gaps in the ingestion summary.
