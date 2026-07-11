# Analytics Inventory

Generated analytics are already broad. The review task is not only "what else can we compute?" but also "what should be elevated, demoted, combined, or visualized differently?"

## Lane Summary

| Lane | Source | Generated | Counts | Claim strength | Product use |
| --- | --- | --- | --- | --- | --- |
| UI data package | analysis/ui-data-package/ui-data-package.json | 2026-06-18T17:52:13.930Z | {"screens":5,"sourceInventory":34,"liveFixtures":10} |  | Primary frontend fixture and source-ref package. |
| Predictive race intelligence | analysis/predictive-race-intelligence/output/summary.json | 2026-06-18T17:52:08Z | {"inventoryItems":76,"careerPriorRows":68,"indyNxtRaceRows":36,"modelRows":14,"upcomingEventPacks":9,"raceDebriefPacks":36} |  | Historical prior bands, top-10 path language, analogs, debrief packs, Career Lab pack. |
| INDY NXT discovery | analysis/indy-nxt-discovery/output/summary.json | 2026-06-16T18:12:31.143Z | {"analyzableBryceRaceRows":36,"datasetPath":"data/career/career.dataset.json","datasetUpdatedAt":"2026-06-16T18:12:31.143Z","headToHeadRows":49,"indyNxtEvents":45,"indyNxtSessions":189,"lapShapeRows":36,"lapTimelineRows":1390,"outputs":{"charts":["analysis/indy-nxt-discovery/output/charts/best_section_percentiles.svg","analysis/indy-nxt-discovery/output/charts/featured_lap_position_trace.svg","analysis/indy-nxt-discovery/output/charts/finish_position_over_time.svg","analysis/indy-nxt-discovery/output/charts/head_to_head_win_rate.svg","analysis/indy-nxt-discovery/output/charts/largest_position_gains.svg"],"insightInventory":"analysis/indy-nxt-discovery/output/UI_ANALYTICS_INSIGHT_INVENTORY.md","report":"analysis/indy-nxt-discovery/output/INDY_NXT_ANALYTICS_DISCOVERY.md","tables":["analysis/indy-nxt-discovery/output/tables/indy_nxt_correlations.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_exploratory_model.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_group_summary.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_lap_shape.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_lap_timeline.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_race_outcomes.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_section_strengths.csv","analysis/indy-nxt-discovery/output/tables/indy_nxt_weather_segments.csv"]},"repoHead":"ce904af","sectionStrengthRows":989,"weatherRowsInRaceSet":36,"weatherSegmentRows":10} |  | INDY NXT outcomes, lap shape, section strengths, weather segments, debrief seeds. |
| Career parity | analysis/career-parity/output/summary.json | 2026-06-16T18:12:31.143Z | {"datasetPath":"data/career/career.dataset.json","datasetUpdatedAt":"2026-06-16T18:12:31.143Z","metricFamilyRows":49,"modelingPriorityRows":7,"outputs":{"report":"analysis/career-parity/output/CAREER_ANALYTICS_PARITY_PASS.md","tablesDir":"analysis/career-parity/output/tables"},"resultRows":137,"seriesSummaryRows":7} |  | Cross-series result conversion, series summary, metric-family parity guardrails. |
| Section lap deep dive | analysis/indy-nxt-section-lap-deep-dive/output/summary.json | 2026-06-18T10:49:39Z | {"roadAmericaPrepRows":6,"sectionFamilyRows":248,"sectionObservations":21044,"sessionSummaries":83,"sessionToRaceTransferRows":36,"topSectionRows":2678} | historical_backtest_only | Practice/qualifying section profiles and Road America prep context. |
| Race lap/section enhancement | analysis/indy-nxt-race-lap-section-enhancement/output/summary.json | 2026-06-18T10:49:41Z | {"raceLapInflectionPoints":151,"raceLapMicrostates":1390,"raceLapSegments":159,"raceSectionLapObservations":16001,"raceSectionSessionSummaries":35,"roadAmericaRows":2} | post_race_descriptive_only | Race lap microstates, segments, inflection overlays, race section context. |
| Career dimension context | analysis/career-dimension-context-layer/output/summary.json | 2026-06-18T10:49:58Z | {"carRows":472,"driverRows":555,"qualifyingRows":1547,"qualifyingSessionRows":108,"resultRows":8158,"teamEraRows":90,"teamRows":75,"trackAnalogRows":210,"trackRows":42} | source_bounded_dimension_context_not_rating_or_forecast | Career Lab filters, team/track/driver/cohort context. |
| Context/event narrative | analysis/context-event-narrative-layer/output/summary.json | 2026-06-18T17:52:01Z | {"derivedMetricRows":370,"gapRows":9,"mediaRows":940,"seriesCoverageRows":8,"sessionRollupRows":399,"sourceEvidenceRows":1199,"timelineRows":1370,"weatherRows":181} | source_bounded_context_narrative_not_telemetry | Timelines, weather/media/source lineage, gap/caveat display. |
| IMSA Daytona stint/class pace | analysis/imsa-daytona-stint-class-pace/output/summary.json | 2026-06-18T10:49:44Z | {"bryceStints":10,"car85CodriverRows":4,"driverSummaries":231,"hourlyClassRows":100,"lapObservations":37885,"stints":1680} | source_bounded_descriptive_stint_class_pace | Career Lab IMSA stint/class/co-driver module. |
| Formula Ford lap shape | analysis/formula-ford-lap-shape/output/summary.json | 2026-06-18T10:49:53Z | {"conditionRows":9,"eventProgressionRows":7,"lapObservations":282,"sessionSummaries":24} | source_bounded_bryce_only_lap_shape | Career Lab early-career lap-shape module. |

## Predictive Registry Status Counts

| Status | Count |
| --- | --- |
| analyst_only | 5 |
| blocked | 4 |
| context_pack_ready | 29 |
| deferred | 2 |
| productized | 36 |

## Context Packs

| Type | Count |
| --- | --- |
| career_lab | 1 |
| live_race_day | 1 |
| race_debrief | 36 |
| upcoming_event | 9 |

## Representative Predictive Inventory Items

| Surface | Kind | Label | Status | Recommended action | Caveat |
| --- | --- | --- | --- | --- | --- |
| race_weekend_prep | metric_contract | prep_event_command_center | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Schedule feed timestamps lack explicit timezone offsets; weather forecast readiness is NWS context, not official series weather. |
| race_weekend_prep | metric_contract | prep_track_history | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Small same-track samples need denominators in the drawer. |
| race_weekend_prep | metric_contract | prep_practice_qualifying_funnel | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Practice and group qualifying are rank/context signals; session formats are not fully equivalent. |
| race_weekend_prep | metric_contract | prep_weather_window | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | NWS weather is current and forecast context, not official series weather or track temperature. |
| live_race_companion | metric_contract | live_source_readiness | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Timing endpoint can point to top-series; require /api/readiness to prove INDY NXT heartbeat plus car 9 and DriverID 2143 or exact Bryce identity. |
| live_race_companion | metric_contract | live_bryce_status_tile | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Gap strings need label discipline; null and zero are different. |
| live_race_companion | metric_contract | live_timing_tower | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Top-series car-number collisions must be guarded by Bryce identity predicate. |
| live_race_companion | metric_contract | live_gap_lap_trend | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Current archive is tiny; full-session trend quality requires race watch capture. |
| live_race_companion | metric_contract | live_points_projection | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Required v1 card. Display only the /api/readiness.points state; reconcile against official standings after session. Do not fabricate from local formula or promote raw timing fields outside the readiness reducer. |
| live_race_companion | metric_contract | live_weather_strip | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | NWS only; no official track temp or radar. |
| race_debrief | metric_contract | debrief_header | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Derived archetype labels are review aids until manually approved. |
| race_debrief | metric_contract | debrief_qualifying_conversion | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Group and combined qualifying formats need source/session caveats. |
| race_debrief | metric_contract | debrief_lap_position_story | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | 36/36 completed INDY NXT races have lap samples; 26 fully validate and 10 are clean partial visible-sample imports. |
| race_debrief | metric_contract | debrief_section_strengths | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Useful as a v1.5 drilldown only. The section artifacts still need denominator QA and display filtering before headline claims; session_indy_nxt_2024_6325 remains source-broken. |
| race_debrief | metric_contract | debrief_incidents_penalties | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Rows exist when official PDFs/API expose them; absence is not proof nothing happened unless source family has complete no-event semantics. |
| race_debrief | metric_contract | debrief_team_context | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Descriptive only; no engineering root-cause claims. |
| race_debrief | metric_contract | debrief_source_drawer | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Drawer owns detail so main screen stays clean. |
| career_lab | metric_contract | career_series_summary | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Use percentiles with raw finish because field sizes differ. |
| career_lab | metric_contract | career_metric_parity_matrix | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Prevent weak source families from poisoning INDY NXT-grade views. |
| career_lab | metric_contract | career_result_conversion_explorer | productized | Keep as canonical metric id; hydrate from context pack or runtime API. | Start/gain unavailable for series without grid/start source; do not compute gain from missing start. |

## Review Guidance

- Treat Road America prep outputs as a concrete event slice, not the whole product.
- The model scorecard is useful for policy and source-drawer transparency, not public point predictions.
- The data-utilization audit reporting no remaining generated utilization backlog does not mean the final product API, semantic layer, or arbitrary query interface is complete.
- Ask whether a finding deserves a chart, a compact stat, a table row, a source drawer entry, or no UI at all.
- Prefer charts that answer a user question. Do not reward chart quantity.
