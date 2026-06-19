# BryceCast Data Utilization Audit

Generated: `2026-06-18T17:24:28Z`
Canonical dataset hash: `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`
Canonical dataset updated: `2026-06-16T18:12:31.143Z`
Ingestion summary generated: `2026-06-16T18:12:35.595Z`
Validation: `ok=True`, errors `0`, warnings `1`

## Decision

The backend analytics layer has no remaining generated utilization backlog rows. All major focus lanes are productized with validators and source-hash checked context packs.

## Canonical Collection Coverage

| Collection | Rows | Utilization status | Value score | Signal |
| --- | ---: | --- | ---: | --- |
| drivers | 555 | productized_context_pack | 7.0 | Driver identity is now queryable for cohorts, teammate overlap, shared fields, and source-bounded Career Lab filtering. |
| series | 7 | productized_context_pack | 4.0 | No major standalone series-dimension signal beyond routing and source-family labels. |
| teams | 75 | productized_context_pack | 8.0 | Team/era context is now addressable for debrief and Career Lab stories with source-family guards. |
| cars | 472 | productized_context_pack | 6.5 | Car number, entrant, class, and co-driver/usage context are now addressable across canonical cars. |
| tracks | 42 | productized_context_pack | 8.0 | Track configuration, corner count, length, weather readiness, repeat venue history, and analogs are now queryable. |
| seasons | 10 | productized_context_pack | 5.0 | Season summaries are useful but lower value than session/lap grains. |
| events | 87 | productized_context_pack | 6.0 | Event rows are mostly routing; value comes through linked sessions/results/laps. |
| sessions | 469 | productized_context_pack | 7.0 | Session windows and session-type structure still matter for live joins and practice/qualifying context. |
| results | 8158 | productized_context_pack | 8.0 | Every canonical result row is now productized through source-hash validated full-field result context, with Bryce-facing conversion/debrief slices layered on top. |
| qualifyingResults | 1547 | productized_context_pack | 8.5 | Qualifying rows are now addressable by session format, track type, team era, car, driver, and source-bounded race conversion joins. |
| lapSamples | 67686 | productized_context_pack | 10.0 | No canonical lapSample source family remains unproductized; future value is through joins to context, incidents, qualifying, and track analogs. |
| racecraftEvents | 35 | productized_context_pack | 7.5 | Racecraft rows are now addressable as source-bounded context facts; remaining value comes from UI storytelling and lap/context joins. |
| penalties | 82 | productized_context_pack | 7.0 | Penalty type, lap, and position/time impact are now productized; downstream displays should keep no-row/source-coverage caveats visible. |
| incidents | 132 | productized_context_pack | 7.5 | Caution/contact/mechanical context is now productized; remaining value is presentation and source-backed lap-position joins. |
| weatherObservations | 181 | productized_context_pack | 7.0 | Weather rows are now queryable by series/session/source family; future value is visual comparison, not additional backend extraction. |
| mediaAssets | 940 | productized_context_pack | 6.5 | Media rows are now source-indexed for narrative and source-drawer use; UI must still apply rights-status display rules. |
| derivedMetrics | 370 | productized_context_pack | 10.0 | All canonical derivedMetric rows are now addressable; deeper interpretation remains in the specialized section/race-lap lanes. |
| sourceEvidence | 1199 | productized_context_pack | 6.0 | Source-family quality is now queryable; remaining value is visual/source-ops presentation. |
| gaps | 9 | productized_context_pack | 5.0 | All canonical gap rows are now productized as explicit source-boundary truth with row-level IDs and source states preserved. |
| broadcastRoutes | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |
| notificationEvents | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |
| notificationRules | 0 | not_worth_analyzing_with_rationale | 2.0 | No current rows to analyze. |

## Highest-Value Underused Data

| Priority | Opportunity | Series | Collection | Rows | Value | Recommended lane |
| ---: | --- | --- | --- | ---: | ---: | --- |

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

Frontend visuals may proceed against generated context packs once all lane validators and autoreview pass. Raw CSVs remain analysis artifacts; UI should consume source-hash checked context packs/manifests and keep the unsupported-claim caveats visible.

## Status Counts

```json
{
  "not_worth_analyzing_with_rationale": 3,
  "productized_context_pack": 25
}
```
