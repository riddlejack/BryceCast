# BryceCast Analytics-First UI Product Definition Packet

Generated: 2026-06-17

Baseline inspected: current working tree at `19b16af Build UI analytics data package`. Primary package baseline inside generated artifacts: `5636bb6 Harden preserved career data gaps`.

## Executive Summary

- **The product should be a mobile-first race companion with a dynamic homepage, not a static dashboard.** The same route should resolve into Race Weekend Prep, Session Imminent, Live Companion, degraded/wrong-series/source states, Race Debrief, or Off-Week depending on `/api/readiness`, schedule context, replay/reconciliation state, and generated prep artifacts.
- **The first screen should be family-readable, with serious analytics one tap down.** First-screen space should go to event/session context, Bryce status when guarded live data is ready, source/readiness state, points state, weather context, and one or two historical context cards. Lap dynamics, parity matrices, source family audit, and replay detail belong in drilldowns or drawers.
- **The data is strong enough for v1 if the UI respects availability states.** Race Weekend Prep, guarded Live Companion shell, Race Debrief seed, Career Lab parity, and Source/Ops status are supported. Full replay trend analytics, section-strength headlines, field-strength/teammate models, and production-live confidence are not supported until proof gaps close.
- **The biggest product risks are overclaiming live and causal truth.** Current sources ban official INDY NXT weather claims, live GPS/moving-dot claims, POV/radio claims, detailed pit sequence, tire/fuel/overtake strategy, engineering root-cause claims, and local points-model math.

## Source Precedence And Conflict Log

Source precedence for this packet:

1. `analysis/ui-data-package/ui-data-package.json`
2. `data/career/reports/validation-report.json`, `data/career/reports/ingestion-summary.json`, `data/career/reports/career-coverage-matrix.json`
3. `analysis/ui-ready-artifacts.json`
4. `analysis/ui-contract/ui-metric-manifest.json`, `analysis/live-contract/live-api-contract.json`
5. `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`, `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`, `analysis/ANALYTICS_UI_ARTIFACT_INDEX.md`
6. `src/data/*` TypeScript contracts

Recorded conflicts and resolutions:

- `off-week` is requested as a product state, but it is not a literal package/readiness enum. Treat it as a homepage routing state: no current race-week/live context, live disabled, next event/career/source cards available.
- `post-session unreconciled/reconciled` is requested as a state, but the current formal live readiness enum does not include those names. Current support is `points.reconciliationRequired`, replay archive state, and the live contract's reconciliation procedure. Treat unreconciled/reconciled as Race Debrief substates until a backend reconciliation report path exists.
- Race Debrief prose says incident/penalty and team context can be built in v1, while the generated manifest marks `debrief_incidents_penalties` and `debrief_team_context` as `v1.5`. Trust the generated manifest: use these as drawer/detail context in v1 and promote to first-screen only after product/editorial review.
- Static Road America prep includes historical/schedule context and explicitly has `weatherState=future_unavailable_in_historical_dataset`. Any weather card must come from live NWS APIs at runtime, not from static prep rows.

## Current Source Facts

- `analysis/ui-data-package/ui-data-package.json`: package screens are `roadAmericaPrep`, `liveCompanionFixtures`, `raceDebrief`, `careerLab`, and `sourceOps`.
- `analysis/ui-contract/ui-metric-manifest.json`: 24 metric IDs across five surfaces.
- `analysis/ui-ready-artifacts.json`: 13 stable artifacts, 7 exploratory/deferred artifacts, 3 missing backend contracts.
- `data/career/reports/validation-report.json`: `ok=true`, `errorCount=0`, `warningCount=1`.
- `data/career/reports/ingestion-summary.json`: 555 drivers, 7 series, 87 events, 469 sessions, 8,158 results, 1,547 qualifying results, 67,686 lap samples, 370 derived metrics, 9 open gaps, no priority gaps.
- `data/career/reports/career-coverage-matrix.json`: INDY NXT has 45 events, 189 sessions, 36 completed race sessions, 738 race/heat rows, 87 qualifying sessions, 36/36 completed races with lap-chart samples, 0/189 official weather rows, detailed pit context unavailable, derived benchmarks blocked.
- Generated career truth has `broadcastRoutes=0`, `notificationRules=0`, and `notificationEvents=0`; any watch/listen route or notification product behavior must come from runtime APIs or later source contracts.
- Points coverage is source-bounded. Per-result/season points are safe where present, but not universal across all series.
- `public/data/live-snapshot.json`: current snapshot is stale Series I/wrong-series evidence with `bryce=null`.
- `data/live/brycecast.sqlite`: 13 race snapshots, 6 Bryce samples, 93 source probes; this is not enough for full replay trend analytics.

## Screen And State Map

| State | Trigger/source truth | Homepage first screen | Drilldown/drawer | Claim guardrails |
| --- | --- | --- | --- | --- |
| Race week | Upcoming INDY NXT event in `future_weekend_prep_inputs.csv`; Road America Race 1 on 2026-06-19 and Race 2 on 2026-06-20. | Race Weekend Prep: event name/date, track facts, same-track history, track-type history, watch/listen route if API supplies it, weather readiness only from runtime API. | Source drawer with prep artifact path, generation time, same-track denominators, weather unavailable note. | Static prep is historical/schedule context, not forecast, strategy, or prediction. |
| Session imminent | `/api/readiness.state=pre_session` or known next NXT session close to start. Countdown semantics still need timezone normalization. | Session countdown, route/watch actions, source banner, NWS weather if live, historical track cards. No live rank. | Readiness gates and schedule source timestamps. | Do not label cold/no-row timing as live. |
| Live ready | `/api/readiness.state=ready`: fresh INDY NXT timing, guarded Bryce car 9 row, usable core timing. | Live Companion: readiness banner, Bryce status tile, timing tower with Bryce focus, Race Control points card if `points.mode=race_control_live`, weather strip. | Full source health, field coverage, replay capture status, point reconciliation notice. | Green fixture is not production proof; real Road America live rehearsal still required before claiming production-live reliability. |
| Degraded | `/api/readiness.state=degraded`: core timing usable, one or more enrichments partial. | Same live shell, amber source labels, hide missing widgets, keep Bryce timing if guarded. | Failed enrichment probe, endpoint/source detail, affected widgets. | Degraded data must suppress missing numeric fields, not render zeros. |
| Wrong series | `/api/readiness.state=wrong_series` or stale public snapshot with active top-series feed/no Bryce. | Red source banner, no live Bryce labels, schedule/watch context, last archived Bryce sample only if explicitly stale. | Identity guard detail, endpoint roles, top-series guard evidence. | Top-series car 9 is never Bryce. No live rank/gap/points from wrong-series timing. |
| Stale | `/api/readiness.state=stale` or only old timing/archive available. | Freeze or suppress live values, show stale age/source warning, keep replay/source diagnostics. | Archive age, last valid sample, endpoint freshness. | No live deltas; stale values are historical fallback only. |
| Blocked | `/api/readiness.state=blocked` or no honest timing/event context. | Recovery checklist, no live values, safe schedule/career fallback if available. | Source errors, missing route/API, local archive state. | Do not fill blanks with seed values. |
| Post-session unreconciled | Session ended, live/replay exists, `points.reconciliationRequired=true`, official results not refreshed or no reconciliation report path. | Immediate Debrief shell with provisional/replay labels: result/status if source-backed, points marked provisional, source/reconciliation pill visible. | Replay archive sufficiency, Race Control point fields, official-result refresh status. | Do not call points official; no official standings claim until reconciled. |
| Post-session reconciled | Official history/result refreshed and live points/replay agree by event/session/identity keys. Current backend path is still missing. | Race Debrief: official result KPI, start-to-finish, lap story if source-backed, points/standing official, source drawer compact. | Reconciliation report, discrepancies if any, official source refs. | Requires backend report path; cannot be claimed from current package alone. |
| Off-week | No race-week/live session context; use next event, career lab, and season status. Not a formal readiness enum. | Dynamic homepage becomes next-event preview plus career highlights and source status, live companion disabled. | Career Lab and Source/Ops. | Do not show stale live content as current. |

## Road America Homepage Answers

- **Morning of Road America Race 1, 2026-06-19:** show Race Weekend Prep. First screen should show Road America Race 1, track facts (4.048 mi, 14 corners), same-track history (2 races, avg finish 8.5, avg gain 0, top-10 100%), road-course history (avg finish 12.6, avg gain -2.45, top-10 40%), watch/listen actions if `/api/session` supplies them, and weather only if `/api/weather/*` is live. Static prep must show future weather as unavailable.
- **Five minutes before the race:** show Session Imminent if `/api/readiness` is `pre_session`. First screen should prioritize countdown/route/source readiness, weather strip, and historical prep. No live rank, gap, points, or timing tower until Bryce identity and INDY NXT heartbeat pass.
- **During green flag if live data is ready:** show Live Companion. First-screen space goes to source readiness, Bryce status, timing tower, provisional Race Control points, flag/lap context, and weather strip. Replay trend stays hidden unless archive state is `ready`.
- **If Race Control is wrong-series:** show red wrong-series guard, no Bryce live values, next NXT/session context, and optionally last archived Bryce sample as stale. Put identity guard and endpoint details in the drawer.
- **Immediately after the race:** show Race Debrief unreconciled until official results and points reconcile. Use replay/source labels and provisional copy. After official reconciliation exists, switch to reconciled debrief and official standings language.

## Metric Menu By Surface

| Surface | Metric ID | Source path/API | Grain | Availability/confidence/caveat | Priority | Placement |
| --- | --- | --- | --- | --- | --- | --- |
| Race Weekend Prep | `prep_event_command_center` | `/api/session`; `/api/weather/upcoming`; `future_weekend_prep_inputs.csv` | event/session | Partial, medium. Schedule timestamp offsets and weather readiness need runtime source state. | v1 | first-screen |
| Race Weekend Prep | `prep_track_history` | `future_weekend_prep_inputs.csv`; `race_track_type_summary.csv`; `career_result_conversion.csv` | event/session/series | Available, high. Small same-track samples need denominators. | v1 | first-screen, drilldown |
| Race Weekend Prep | `prep_practice_qualifying_funnel` | `prep_session_signals.csv`; `prep_session_correlations.csv` | session/result | Source-bounded, medium. Context signal only; no correlation claim. | v1.5 | drilldown |
| Race Weekend Prep | `prep_weather_window` | `/api/weather/live?trackId={trackId}`; `/api/weather/upcoming` | event/session/source | Live-only, medium. NWS context, not official series weather or track temp. | v1 | first-screen if live, drawer on partial |
| Live Companion | `live_source_readiness` | `/api/readiness`; `/api/sources` | source/session | Live-only, medium. Product readiness must come from reducer, not HTTP 200. | v1 | first-screen banner, drawer |
| Live Companion | `live_bryce_status_tile` | `/api/bryce`; `/api/snapshot` | driver/session | Live-only, medium. Requires guarded Bryce row; null and zero are distinct. | v1 | first-screen |
| Live Companion | `live_timing_tower` | `/api/timing` | driver/session | Live-only, medium. Wrong-series car-number collisions must be guarded. | v1 | first-screen/compact list |
| Live Companion | `live_gap_lap_trend` | `/api/replay/bryce`; `data/live/brycecast.sqlite`; `data/live/snapshots.jsonl` | lap/driver/source | Replay-only, low. Current archive is tiny. | v1.5 | drilldown; disabled until archive ready |
| Live Companion | `live_points_projection` | `/api/readiness`; `/api/timing` only as underlying provenance | driver/session | Live-only, medium. Use readiness `points.mode`; reconcile after official results. | v1 | first-screen guarded card |
| Live Companion | `live_weather_strip` | `/api/weather/live?trackId={trackId}` | source/event | Live-only, medium. NWS only; suppress missing fields. | v1 | first-screen compact |
| Race Debrief | `debrief_header` | `race_debrief_scores.csv`; `career_result_conversion.csv`; `championship_progression.csv` | session/result | Available, high. Archetype labels need manual review. | v1 | first-screen |
| Race Debrief | `debrief_qualifying_conversion` | `prep_session_signals.csv`; `career_result_conversion.csv`; `career.dataset.json` | session/result | Available, high. Group/combined qualifying caveats. | v1 | first-screen or drilldown |
| Race Debrief | `debrief_lap_position_story` | `full_field_lap_dynamics_by_race.csv`; `full_field_lap_dynamics_by_driver.csv`; `career.dataset.json` | lap/driver/session | Source-bounded, medium. 36/36 completed races have lap samples; 26 full and 10 partial. | v1 | drilldown, debrief hero if readable |
| Race Debrief | `debrief_section_strengths` | `section_results_deep_by_race.csv`; `section_results_deep_by_section.csv` | session/lap | Source-bounded, medium. Needs denominator QA/display filtering. | v1.5 | drilldown |
| Race Debrief | `debrief_incidents_penalties` | `incident_penalty_context.csv`; `leader_lap_context.csv`; coverage matrix | event/session | Available, medium. No-row is not proof none occurred unless source semantics say so. | v1.5 | drilldown/chips |
| Race Debrief | `debrief_team_context` | `team_context_by_race.csv`; `team_context_by_year.csv` | team/result | Source-bounded, medium. Descriptive only; no engineering cause. | v1.5 | drilldown/table |
| Race Debrief | `debrief_source_drawer` | `indy_nxt_source_family_audit.csv`; coverage matrix; validation report | source | Available, high. Drawer carries trust detail. | v1 | drawer |
| Career Lab | `career_series_summary` | `career_series_result_summary.csv`; `career_result_conversion.csv` | series/result | Available, high. Use percentiles with raw finish. | v1 | first-screen |
| Career Lab | `career_metric_parity_matrix` | `career_metric_family_parity.csv`; coverage matrix | series/source | Available, high. Prevents INDY NXT-grade overprojection. | v1 | first-screen and drawer |
| Career Lab | `career_result_conversion_explorer` | `career_result_conversion.csv` | result/session | Source-bounded, high. Start/gain unavailable where grid/start missing. | v1.5 | drilldown |
| Career Lab | `career_gap_ledger` | coverage matrix; generated coverage docs | series/source | Available, high. Open gaps are caveats; priority gaps block UI. | v1 | drawer/source detail |
| Source/Ops | `ops_validation_status` | validation report; ingestion summary | source | Available, high. One warning blocks only affected weather/live joins. | v1 | operator first-screen |
| Source/Ops | `ops_live_source_console` | `/api/sources`; live readiness audit docs | source | Live-only, medium. HTTP 200 is not readiness. | v1 | admin drawer/table |
| Source/Ops | `ops_replay_archive_state` | `/api/replay/bryce`; SQLite; snapshots JSONL | source/session | Replay-only, low. Tiny archive is proof of plumbing only. | v1.5 | admin drilldown |

## Stakeholder Job Map

| Stakeholder | Job to be done | First-screen needs | Drilldown needs | What to avoid |
| --- | --- | --- | --- | --- |
| Family/friends | Know when to watch, where Bryce is, and what just happened without parsing racing jargon. | Event/session, watch/listen route, Bryce position/status when guarded, simple points label, debrief result. | Plain-English source drawer, lap story with clear labels. | Dense parity matrices, raw source logs, unsupported strategy claims. |
| Bryce | Quickly understand weekend context, live race position, conversion from start/qualifying, and post-session story. | Prep track history, live status, points, debrief header. | Qualifying conversion, lap-position story, section/team context when reviewed. | Public-copy archetypes without review, false certainty around weather/team causes. |
| Team-adjacent | Use source-bounded context without mistaking product data for engineering telemetry. | Track/session context, readiness/source state, debrief outcome. | Section strengths, team context, incident/penalty rows, source audit. | Engineering root-cause, setup, tire/fuel, detailed pit claims without team data. |
| Serious fans | Explore why a race unfolded the way it did and compare across career/series. | Live timing tower, points state, race debrief, career summary. | Lap dynamics, parity matrix, result conversion explorer, gap ledger. | Predictive field-strength or causal model language. |
| Operator/admin | Know whether the UI is safe to show and what source failed. | Validation status, readiness state, source health. | Endpoint diagnostics, replay archive state, gap ledger, missing backend contracts. | Letting Source/Ops clutter the family homepage. |

## Visualization Inventory

| Metric family | Recommended component/chart | Mobile/live constraints |
| --- | --- | --- |
| Event/session command center | Schedule timeline, venue fact row, watch/listen actions | Keep one next session primary; no timezone-sensitive countdown until normalized. |
| Track history | Compact comparison cards plus small horizontal bars | Show denominators beside same-track stats; avoid full table first-screen. |
| Practice/qualifying funnel | Funnel/slope card | v1.5; raw ranks only, no correlation/causal claim. |
| Live readiness | Status banner plus compact gate pills; drawer table for endpoints | One primary state color; endpoint details hidden by default. |
| Bryce live status | KPI tile plus delta strip | Only render when identity guard passes; null fields show unavailable. |
| Timing tower | Focused tower/list with Bryce band | Family layer should show nearby cars, not all fields; full tower can drill down. |
| Points projection | Points delta card plus field coverage note | Label as provisional/Race Control; never local math. |
| Weather | Compact weather strip with source/probe pill | NWS context only; hide failed legs and show partial state. |
| Replay/rank trend | Rank/gap line with source-state overlay | Disabled until archive is `ready`; current archive is too thin. |
| Debrief outcome | KPI strip plus short narrative | Archetype copy requires manual approval. |
| Qualifying conversion | Slope/dumbbell from start to finish | If no qualifying row, show start-to-finish only. |
| Lap-position story | Inverted y-axis lap-position line | Badge partial charts; avoid inferred missing laps. |
| Section strengths | Ranked bars or section heatmap | v1.5; needs denominator QA and sparse-row suppression. |
| Incidents/penalties | Event chips and caution/penalty timeline | Absence of rows means no imported official row, not proof none happened. |
| Team context | Ranked dot plot/table | Descriptive only; no root-cause language. |
| Career summary | Sortable series table plus small multiples | Use percentiles because field sizes differ. |
| Metric parity | Matrix heatmap | Primary job is availability, not performance ranking. |
| Gap/source ledger | Coverage matrix plus drawer | Keep out of family first-screen except compact trust pill. |
| Source/Ops | Status checklist, source table, archive card | Admin surface only; do not dominate homepage. |

## Claim Ladder

| Claim level | Allowed examples | Evidence required | UI treatment |
| --- | --- | --- | --- |
| Raw facts | Event date, track length, live readiness state, rank, lap, validation error count. | Direct API/package/generated report field. | First-screen allowed when current and guarded. |
| Derived stats | Same-track avg finish, top-10 rate, finish percentile, position gain, parity status. | Generated artifact with denominator/source state. | First-screen or drilldown with denominator/caveat pill. |
| Descriptive insights | "Road America history is small but positive"; "lap chart shows partial source coverage." | Multiple source-backed fields; no causal language. | Narrative cards and debrief summaries. |
| Hypotheses | Practice/qualifying relationship, section weakness, field-strength context. | Exploratory/deferred artifact plus explicit review state. | Analyst/drilldown only; not v1 headline. |
| Unsupported claims | Official INDY NXT weather, live GPS, POV/radio, engineering cause, tire/fuel strategy, detailed pit sequence, broadcast route inventory from career data, notification rules, teammate/field-strength benchmarks, official points from local math. | Current source set does not support these; generated career reports show zero broadcast/notification rows and blocked derived benchmarks. | Ban, defer, or unavailable-state only. |

## V1 / V1.5 / Later Cut

V1:

- Dynamic homepage router across Race Weekend Prep, Session Imminent, Live Ready, Wrong-Series/Stale/Blocked, Race Debrief, Career Lab, and Off-Week.
- Race Weekend Prep command center, track history, and runtime weather strip with NWS/source caveat.
- Live Companion readiness banner, Bryce status tile, timing tower, guarded Race Control points card, and weather strip.
- Race Debrief header, qualifying conversion, lap-position story with partial badges, and source drawer.
- Career Lab series summary, metric parity matrix, and gap/source ledger.
- Source/Ops validation status and live source console.

V1.5:

- Practice/qualifying funnel as a deeper prep card.
- Replay rank/gap trend after full-session archive reaches `ready`.
- Section strengths after denominator QA/display filtering.
- Incident/penalty chips and team context as reviewed debrief details.
- Career result conversion explorer.
- Replay archive state trends for operators.

Later/deferred:

- Production-live reliability claim after Road America or later green/yellow live rehearsal.
- Post-official-results reconciliation report path and reconciled/unreconciled formal state.
- Timezone-normalized countdown semantics.
- Official points-table model, if a later backend lane adds rules/tests.
- Field-strength/driver-strength product claims after validation and copy review.
- Live GPS/moving dot, tire/overtake strategy, detailed pit sequence, POV/radio, notification rules, broadcast route inventory, and official INDY NXT weather only if new source contracts prove them.

## Decisions Still Requiring Jack

- How aggressive should the homepage be: family-readable live companion first, or analytics-first with debrief/career modules visible during race week?
- Should the debrief first screen use reviewed archetype labels, or should v1 stay strictly factual until Jack approves editorial language?
- Should incident/penalty and team-context details stay v1.5, or should they be promoted to v1 debrief details while still staying out of headline copy?
- What tone should source pills use: terse operator labels (`wrong_series`, `stale`) or family-readable labels (`Race Control is showing another series`)?
- Should Road America live proof be a hard launch gate for public sharing, or only for claiming "production live mode" while the static/live-state shell ships earlier?
- Which device posture should dominate first: iPhone race companion, MacBook dashboard, or TV mode?
