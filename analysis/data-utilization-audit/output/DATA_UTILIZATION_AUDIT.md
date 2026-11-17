# BryceCast Data Utilization Audit

Generated: `2026-11-16T18:07:21Z`
Canonical dataset hash: `b2b086cd97391645a464fa6f4d9387f8a354749c53fd4b80b0681bb0b66030d5`
Canonical dataset updated: `2026-11-16T17:29:58.816Z`
Ingestion summary generated: `2026-11-16T17:30:06.446Z`
Validation: `ok=True`, errors `0`, warnings `1`

## Decision

The backend analytics layer still has 8 generated utilization backlog rows. Do not treat backend productization as complete until the backlog table is empty and focus rows are productized.

## Canonical Collection Coverage

| Collection | Rows | Utilization status | Value score | Signal |
| --- | ---: | --- | ---: | --- |
| drivers | 683 | productized_context_pack | 7.0 | Driver identity is now queryable for cohorts, teammate overlap, shared fields, and source-bounded Career Lab filtering. |
| series | 10 | productized_context_pack | 4.0 | No major standalone series-dimension signal beyond routing and source-family labels. |
| teams | 84 | productized_context_pack | 8.0 | Team/era context is now addressable for debrief and Career Lab stories with source-family guards. |
| cars | 698 | productized_context_pack | 6.5 | Car number, entrant, class, and co-driver/usage context are now addressable across canonical cars. |
| tracks | 46 | partially_analyzed_more_value_remaining | 8.0 | Track configuration, corner count, length, weather readiness, repeat venue history, and analogs are now queryable. |
| seasons | 14 | productized_context_pack | 5.0 | Season summaries are useful but lower value than session/lap grains. |
| events | 99 | partially_analyzed_more_value_remaining | 6.0 | Event rows are mostly routing; value comes through linked sessions/results/laps. |
| sessions | 533 | partially_analyzed_more_value_remaining | 7.0 | Session windows and session-type structure still matter for live joins and practice/qualifying context. |
| results | 9826 | partially_analyzed_more_value_remaining | 8.0 | Every canonical result row is now productized through source-hash validated full-field result context, with Bryce-facing conversion/debrief slices layered on top. |
| qualifyingResults | 1967 | productized_context_pack | 8.5 | Qualifying rows are now addressable by session format, track type, team era, car, driver, and source-bounded race conversion joins. |
| lapSamples | 75740 | partially_analyzed_more_value_remaining | 10.0 | No canonical lapSample source family remains unproductized; future value is through joins to context, incidents, qualifying, and track analogs. |
| racecraftEvents | 44 | partially_analyzed_more_value_remaining | 7.5 | Racecraft rows are now addressable as source-bounded context facts; remaining value comes from UI storytelling and lap/context joins. |
| penalties | 94 | partially_analyzed_more_value_remaining | 7.0 | Penalty type, lap, and position/time impact are now productized; downstream displays should keep no-row/source-coverage caveats visible. |
| incidents | 166 | partially_analyzed_more_value_remaining | 7.5 | Caution/contact/mechanical context is now productized; remaining value is presentation and source-backed lap-position joins. |
| weatherObservations | 252 | productized_context_pack | 7.0 | Weather rows are now queryable by series/session/source family; future value is visual comparison, not additional backend extraction. |
| mediaAssets | 1128 | productized_context_pack | 6.5 | Media rows are now source-indexed for narrative and source-drawer use; UI must still apply rights-status display rules. |
| derivedMetrics | 453 | productized_context_pack | 10.0 | All canonical derivedMetric rows are now addressable; deeper interpretation remains in the specialized section/race-lap lanes. |
| sourceEvidence | 1463 | productized_context_pack | 6.0 | Source-family quality is now queryable; remaining value is visual/source-ops presentation. |
| gaps | 13 | productized_context_pack | 5.0 | All canonical gap rows are now productized as explicit source-boundary truth with row-level IDs and source states preserved. |
| broadcastRoutes | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |
| notificationEvents | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |
| notificationRules | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |

## Highest-Value Underused Data

| Priority | Opportunity | Series | Collection | Rows | Value | Recommended lane |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 50 | collection_lapSamples | global | lapSamples | 75740 | 10.0 | analysis/data-utilization-audit/backlog |
| 50 | collection_results | global | results | 9826 | 8.0 | analysis/data-utilization-audit/backlog |
| 50 | collection_tracks | global | tracks | 46 | 8.0 | analysis/data-utilization-audit/backlog |
| 50 | collection_incidents | global | incidents | 166 | 7.5 | analysis/data-utilization-audit/backlog |
| 50 | collection_racecraftEvents | global | racecraftEvents | 44 | 7.5 | analysis/data-utilization-audit/backlog |
| 50 | collection_penalties | global | penalties | 94 | 7.0 | analysis/data-utilization-audit/backlog |
| 50 | collection_sessions | global | sessions | 533 | 7.0 | analysis/data-utilization-audit/backlog |
| 50 | collection_events | global | events | 99 | 6.0 | analysis/data-utilization-audit/backlog |

## Executed Data-Exhaustion Lanes

- `indy_nxt_practice_qualifying_section_lap`: productized under `analysis/indy-nxt-section-lap-deep-dive` with validator-backed artifacts and source-hash checked context-pack coverage.
- `indy_nxt_race_lap_section_enhancement`: productized under `analysis/indy-nxt-race-lap-section-enhancement` with validator-backed artifacts and source-hash checked context-pack coverage.
- `imsa_daytona_stint_class_pace`: productized under `analysis/imsa-daytona-stint-class-pace` with validator-backed artifacts and source-hash checked context-pack coverage.
- `formula_ford_lap_shape`: productized under `analysis/formula-ford-lap-shape` with validator-backed artifacts and source-hash checked context-pack coverage.
- `non_lap_context_events`: productized under `analysis/context-event-narrative-layer` with validator-backed artifacts and source-hash checked context-pack coverage.
- `career_dimension_qualifying_context`: productized under `analysis/career-dimension-context-layer` with validator-backed artifacts and source-hash checked context-pack coverage.

## Phase 2 Priority Order

1. Completed: INDY NXT practice/qualifying section-lap deep dive.
2. Completed: INDY NXT race lap/section enhancement beyond current aggregates.
3. Completed: IMSA Daytona stint/class/co-driver pace feature.
4. Completed: Formula Ford source-bounded lap-shape pass.
5. Completed: Non-lap context layer: incidents, penalties, racecraft, weather, media/source narrative.
6. Completed: Full-field result context, qualifying conversion, plus team/track/driver/car context dimensions.

## Frontend Gate

Frontend visuals should not proceed as data-exhaustive while `underused_data_opportunity_backlog.csv` contains rows. Use the backlog and matrix to route remaining backend analytics work first.

## Status Counts

```json
{
  "not_worth_analyzing_with_rationale": 3,
  "partially_analyzed_more_value_remaining": 8,
  "productized_context_pack": 17
}
```
