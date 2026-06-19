# BryceCast UI Blueprint

Generated: 2026-06-18

Source baseline:

- Product packet: `analysis/product-definition/PRODUCT_DEFINITION_PACKET.md`
- UI data package: `analysis/ui-data-package/ui-data-package.json`, `schemaVersion=brycecast.uiDataPackage.v1`, `generatedAt=2026-06-18T17:52:13.930Z`, `baselineCommit=ce904af`
- Metric manifest: `analysis/ui-contract/ui-metric-manifest.json`, 24 metric IDs across 5 surfaces
- Context-pack manifest: `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`, with 9 upcoming-event packs, 36 race-debrief packs, 1 Career Lab pack, and 1 live race-day pack
- Predictive scorecard: `analysis/predictive-race-intelligence/output/model_scorecard.json`, for model-policy/source-drawer use only
- Runtime live gate: `/api/readiness`, `schemaVersion=live-readiness.v1`

This blueprint is an information architecture and component contract. It does not choose final visual style, implement frontend visuals, or change ingestion.

## Product Stance

BryceCast v1 should be a mobile-first race companion with a dynamic homepage. The first screen answers "what should I know right now?" for family/friends, while one tap down exposes serious analytics, source detail, and operator evidence.

Hard boundaries:

- Live race truth comes from `/api/readiness` first, not raw endpoint reachability.
- Static package values and context packs can seed prep, debrief, career, and QA states; they do not become live timing, live weather, or live points.
- Race-week prep must hydrate the upcoming-event `contextPackRef.path` before falling back to shallow screen summaries.
- Weather is NWS runtime context only. Do not label it as official INDY NXT weather or track temperature.
- Points display is v1, but only through `/api/readiness.points`; no local championship model or rank-to-points math.
- Predictive content is allowed as historical prior bands, analogs, model-policy notes, and "what needs to go right" path language. Do not show a single expected finish, top-10 probability, or betting-style line.
- No live GPS/moving-dot, POV, radio audio, detailed pit sequence, tire/fuel/overtake strategy, engineering root-cause, official weather, or unsupported team/field-strength claims.
- Debrief archetype labels are review aids until manually approved.
- Incident/penalty and team context stay drawer/v1.5 unless Jack explicitly promotes reviewed detail.

## Route Map

| Route | Surface | Purpose | Primary source | V1 status |
| --- | --- | --- | --- | --- |
| `/` | Dynamic Home | Resolve current user task: prep, imminent session, live, guarded fallback, debrief, career/off-week. | `/api/readiness`; `uiDataPackage.screens.*` | v1 |
| `/weekend/:eventId` | Race Weekend Prep | Event command center, race-intelligence band, top-10 path, analogs, track facts, same-track/track-type history, runtime weather readiness. | `screens.roadAmericaPrep`; upcoming-event context pack; `/api/session`; `/api/weather/*` | v1 |
| `/live` | Live Companion | Readiness banner, Bryce status, timing tower, guarded points, weather strip. | `/api/readiness`; `/api/timing`; `/api/bryce`; `/api/weather/live`; `/api/sources` | v1 shell |
| `/debrief/:sessionId` | Race Debrief | Official result framing, qualifying conversion, lap story, race-section story, source drawer. | `screens.raceDebrief.featuredDebriefs`; race-debrief context packs; section/lap artifacts | v1 |
| `/career` | Career Lab | Series summary, metric-family parity, gap ledger, result-conversion, career dimension context, and source-bounded deep modules. | `screens.careerLab`; career-lab context pack; career parity/context artifacts | v1 plus drilldowns |
| `/sources` | Source Ops | Validation, live source console, replay/archive state, backend gaps. | `screens.sourceOps`; `/api/sources`; `/api/replay/bryce` | v1 operator |
| Drawer routes or overlays | Source Detail | Metric/source/caveat detail without cluttering family layer. | Screen `sourceRefs`, manifest caveats, readiness gates | v1 |

## Homepage State Router

The homepage is a state router, not a static dashboard. It should evaluate runtime state in this order:

1. Fetch `/api/readiness`.
2. If `state=ready`, render Live Companion in live mode.
3. If `state=degraded`, render Live Companion with amber source labels and hide only affected widgets.
4. If `state=wrong_series`, render a guarded fallback: red source banner, no Bryce live values, schedule/watch/prep context if available, optional archived Bryce sample only as stale.
5. If `state=stale`, render frozen/stale-labeled diagnostics plus safe schedule, prep, debrief, or career context. Stop live deltas.
6. If `state=blocked`, render recovery/source checklist and no live values.
7. If `state=pre_session`, render Session Imminent when next known INDY NXT session is near; otherwise Race Weekend Prep.
8. If the session has ended and replay/live payloads exist, route to Race Debrief unreconciled when `points.reconciliationRequired=true` or no official reconciliation report exists.
9. Route to Race Debrief reconciled only after a backend reconciliation report path proves official result/points agreement. Current package does not provide this proof.
10. If no race-week/live context exists, render Off-Week: next-event preview, career highlights, and source status. This is a product-level derived state, not a readiness enum.

Router inputs:

- `/api/readiness.state`, `severity`, `reason`, `checkedAt`, `gates[]`
- `/api/readiness.raceWeekend`, `liveTiming`, `bryce`, `points`, `weather`, `replay`, `sources`
- `uiDataPackage.screens.roadAmericaPrep.events[]`
- `uiDataPackage.screens.roadAmericaPrep.events[].contextPackRef.path`
- `uiDataPackage.screens.raceDebrief.featuredDebriefs[]`
- Race-debrief context packs from `analysis/predictive-race-intelligence/output/context-packs/race-debriefs/`
- `uiDataPackage.screens.careerLab.seriesSummary[]`
- `uiDataPackage.screens.sourceOps.validation`, `ingestion`, `coverage`, `historyStanding`

## Screen Hierarchy

### Global Shell

Mobile:

- Top status band: current product state, source severity, last checked.
- Primary content stack: one dominant state card followed by two to four contextual cards.
- Bottom or inline action row: refresh, watch/listen if runtime API supplies it, source drawer.
- Source/caveat pills stay compact. Tap opens a bottom drawer.

Desktop:

- Main column for the active state surface.
- Secondary column for related prep/debrief/career context.
- Right rail or drawer trigger for source health, readiness gates, and caveats.
- Do not turn Source Ops into the default homepage unless the state is blocked or operator mode is selected.

### Dynamic Home

Top layer:

- Product state banner from `/api/readiness` or derived off-week/post-session state.
- Event/session identity when source-backed.
- One primary answer: upcoming race, countdown, live Bryce status, guarded fallback, or debrief outcome.
- Source pill with state and drawer affordance.

Second layer:

- Race Weekend Prep card when future Road America rows are relevant.
- Live readiness gates when live shell is active or failing.
- Debrief seed after session.
- Career context when off-week or no live data is safe.

### Race Weekend Prep

Hierarchy:

1. Event command center: event/session, track facts, date, runtime watch/listen route if supplied.
2. Race-intelligence band: finish-percentile prior interval with `p25`, `median`, `p75`, `n`, confidence, and model-policy caveat.
3. Top-10 path: ordered source-backed factors from `top10Path`, phrased as what to watch, not as probability.
4. Analog races: ranked/curated table from the upcoming-event context pack with source refs and confidence.
5. Track history: same-track and track-type comparison with denominators.
6. Weather context: runtime NWS only; static prep `weatherState=future_unavailable_in_historical_dataset` remains a caveat.
7. Prep funnel: v1.5 raw practice/qualifying context only, no correlation or causal claim until post-practice/qualifying context is available.
8. Source drawer: context pack path, prep artifact, model scorecard, generation time/source refs, countdown/timezone caveat.

### Session Imminent

Hierarchy:

1. Countdown/session card from `/api/readiness.raceWeekend` and `/api/session`.
2. Readiness gates showing why live mode is not active.
3. Runtime weather strip if live/partial.
4. Track history/prep context.
5. No live rank, live gap, live points, or timing tower until `state=ready` or `degraded` with a guarded Bryce row.

### Live Companion

Hierarchy:

1. Readiness banner from `/api/readiness.state`, `severity`, `reason`.
2. Bryce status tile only when `bryce.identityGuard.seriesOk=true`, `matchedBy` is `driver_id` or `exact_name`, and `bryce.bryce` is non-null.
3. Focused timing tower with Bryce band when `state=ready` or `degraded`.
4. Points card from `/api/readiness.points`.
5. Weather strip from `/api/readiness.weather` or `/api/weather/live`.
6. Source drawer: readiness gates, endpoint source states, replay/archive status, caveats.
7. Replay trend is v1.5 until full-session archive proof reaches `archiveState=ready`.

### Race Debrief

Hierarchy:

1. Debrief header: race label, result, start/finish/gain, points if source-present, source/confidence/caveat.
2. Qualifying conversion: qualifying-to-race or start-to-finish fallback.
3. Lap-position story: badge partial lap charts; do not infer missing laps.
4. Race-section/lap enhancement: segment strips, inflection points, section-family strengths, and Road America section context when the context pack/session coverage supports it.
5. Incident/penalty and team context as reviewed source-bounded panels; keep causality out of headline copy.
6. Source drawer with debrief context pack, debrief score, lap dynamics, section/race-lap lane, coverage matrix, validation warning.
7. Archetype labels must be factual-only or review-gated until Jack approves editorial language.

### Career Lab

Hierarchy:

1. Series summary table/cards using raw finish plus percentiles.
2. Metric parity matrix by series and metric family.
3. Career dimension browser: team eras, track archetypes, driver cohorts, car/entrant context, and qualifying conversion where source-backed.
4. Deep modules: IMSA Daytona stint/class/co-driver pace and Formula Ford lap shape where validators prove coverage.
5. Gap/source ledger.
6. Result conversion explorer and career prior matrix.
7. No INDY NXT-grade lap/section/live assumptions projected onto older series.

### Source Ops

Hierarchy:

1. Validation status: `ok`, `errorCount`, `warningCount`, issues.
2. Ingestion/source baseline: generated time, open gaps, priority gaps.
3. Live source console from `/api/sources`.
4. Replay/archive state from `/api/replay/bryce`.
5. Missing backend contracts.
6. Keep this as operator/admin unless source state blocks the family layer.

## Component Inventory

| Component | Surface | Primary job | V1/V1.5 |
| --- | --- | --- | --- |
| `HomepageStateRouter` | Dynamic Home | Select homepage mode from readiness, package prep/debrief/career context, and post-session/off-week derivations. | v1 |
| `ProductStateBanner` | All | Show state, severity, reason, checked time, and source drawer entry point. | v1 |
| `SourcePill` | All | Compact confidence/availability/source-state disclosure. | v1 |
| `SourceDrawer` | All | Metric provenance, caveats, denominators, gates, source refs, backend gaps. | v1 |
| `RaceWeekendCommandCenter` | Prep | Event/session, venue facts, route/weather readiness. | v1 |
| `RaceIntelligenceBand` | Prep | Source-bounded finish-percentile prior interval with model-policy caveat. | v1 |
| `Top10PathPanel` | Prep | What needs to go right, using path language without public probability claims. | v1 |
| `AnalogRaceTable` | Prep | Source-backed comparable races and confidence labels. | v1 |
| `TrackHistoryComparison` | Prep | Same-track and track-type context with denominators. | v1 |
| `RoadAmericaSectionProfile` | Prep/Debrief | Section-family and section-lap context for Road America where source-backed. | v1 |
| `RuntimeWeatherStrip` | Prep/Live | NWS live/partial/error context, no official weather claim. | v1 |
| `PrepFunnelCard` | Prep | Practice/qualifying raw context, no causal correlation claim. | v1.5 |
| `SessionCountdownCard` | Session Imminent | Pre-session route/countdown/readiness state. | v1, countdown caveat |
| `ReadinessGateList` | Live/Ops | Explain pass/warn/fail gates. | v1 |
| `BryceStatusTile` | Live | Guarded live status for Bryce. | v1 |
| `TimingTowerFocus` | Live | Nearby cars and Bryce band from guarded timing rows. | v1 |
| `LivePointsCard` | Live | Race Control points mode/historical fallback/partial/stale states. | v1 |
| `ReplayTrendCard` | Live/Ops | Rank/gap trend after archive proof. | v1.5 |
| `DebriefHeader` | Debrief | Official result/outcome framing. | v1 |
| `QualifyingConversionCard` | Debrief | Qualifying/start to finish relationship. | v1 |
| `LapPositionStory` | Debrief | Official lap-chart shape with partial badges. | v1 |
| `RaceLapSegmentStory` | Debrief | Race microstates, segments, and inflection points. | v1 |
| `SectionStrengthsPanel` | Debrief | Source-bounded section-family and section-lap strengths. | v1 |
| `IncidentPenaltyChips` | Debrief | Imported incident/penalty/status context. | v1.5 drawer/detail |
| `TeamContextPanel` | Debrief | Descriptive team context only. | v1.5 drawer/detail |
| `SeriesSummaryTable` | Career | Cross-series performance summary. | v1 |
| `MetricParityMatrix` | Career | Metric-family availability and safe UI use. | v1 |
| `CareerDimensionBrowser` | Career | Team era, track archetype, driver cohort, car/entrant, and qualifying context. | v1 |
| `CareerDeepModuleMenu` | Career | Route to IMSA stint/class and Formula Ford lap-shape modules where available. | v1 |
| `GapLedgerDrawer` | Career/Ops | Open gaps, priority gaps, source categories. | v1 |
| `ResultConversionExplorer` | Career | Filterable race result drilldown. | v1 |
| `ValidationStatusPanel` | Ops | Build safety from generated validation report. | v1 |
| `LiveSourceConsole` | Ops | Endpoint health/detail from `/api/sources`. | v1 |
| `ReplayArchiveStatePanel` | Ops | Archive availability and sufficiency. | v1.5 |

## Source And Caveat Behavior

Every first-screen component should expose one compact source signal and delegate detail to `SourceDrawer`.

Source pill model:

- `available/high`: safe first-screen value with denominator when relevant.
- `partial/medium`: value can render, but missing/partial fields are hidden or badged.
- `source_bounded`: value can render only inside stated artifact/source family.
- `live_only`: render only from runtime API; package fixture is QA-only.
- `replay_only`: render only when archive state is sufficient.
- `deferred/unavailable`: render unavailable state, not blank success.

Drawer contents:

- Source path or API endpoint.
- Context-pack path and pack SHA when a `contextPackRef` is present.
- Metric ID when available.
- `sourceState`, `readiness`, `confidence`, caveat IDs/copy.
- Denominator or row-count fields when relevant.
- Readiness gates for live states.
- Missing backend contracts when a component is blocked by proof, not taste.

## Empty And Degraded States

| Condition | UI behavior |
| --- | --- |
| Missing numeric field | Show unavailable/empty value. Do not render `0` unless source-present numeric zero. |
| Static prep weather unavailable | Keep prep visible; show weather unavailable from static artifact and use runtime weather only if `/api/weather/*` supplies it. |
| `pre_session` | Show countdown/session/prep context; suppress live rank/gap/tower/points-as-live. |
| `ready` | Enable live shell, 1-second polling posture, guarded live widgets. Still do not claim production-live reliability from fixture alone. |
| `degraded` | Keep live shell, amber labels, hide failed/missing enrichment widgets. |
| `wrong_series` | Red source banner, no live Bryce labels, no live points, no product race-weekend identity from wrong-series heartbeat. |
| `stale` | Freeze or suppress live values, mark age/source, keep replay/source diagnostics. |
| `blocked` | Recovery/source checklist and safe schedule/career fallback only. |
| `points.mode=historical_fallback` | Show latest historical standing only; do not call it live. |
| `points.mode=partial` | Show populated Bryce fields with partial coverage/warnings; do not synthesize missing totals. |
| `points.reconciliationRequired=true` | Label live points provisional/Race Control; post-session debrief remains unreconciled until official report path exists. |
| `replay.archiveState=missing/empty/tiny` | Disable replay trend; show capture/archive sufficiency state. |
| `weather.sourceState=partial` | Render only available NWS legs; drawer shows failed probes. |
| No current race-week context | Off-week homepage with next-event/career/source status; no stale live values as current. |

## Mobile Layout Specs

Use mobile as the primary posture.

- One-column stack with stable component heights where state changes can otherwise shift content.
- First viewport: state banner, primary task card, one compact source affordance, and one next action.
- Timing tower defaults to Bryce-nearby subset; full field is a drilldown.
- Drawers are bottom sheets with summary first, raw source table below.
- Tables become cards or horizontally scrollable grids only when row comparison is necessary.
- Source/Ops detail stays behind an explicit source affordance except blocked states.
- Keep copy plain enough for family/friends; analytic terms belong in labels/tooltips/drawers.

## Desktop Layout Specs

Desktop expands density without changing hierarchy.

- Dynamic Home: 12-column layout with active state in the main 7-8 columns, contextual modules in 4-5 columns.
- Live Companion: main live column, compact right source rail, timing list wide enough for nearby cars and key gaps.
- Race Debrief: result/lap story main area, source/caveat rail, optional drilldown drawer.
- Career Lab: parity matrix/table can use full width with sticky source drawer trigger.
- Source Ops: table-first operator surface with filters, but not the default consumer homepage.

## V1 Cut

V1 includes:

- Dynamic homepage router across Race Weekend Prep, Session Imminent, Live Ready, Degraded, Wrong-Series, Stale, Blocked, Race Debrief, Career Lab, and Off-Week.
- Race Weekend Prep command center, race-intelligence band, top-10 path, analog table, track history, and runtime NWS weather strip.
- Live Companion readiness banner, Bryce status tile, timing tower, guarded points card, weather strip, and source drawer.
- Race Debrief header, qualifying conversion, lap-position story, race-lap/section story, and source drawer.
- Career Lab series summary, metric parity matrix, career dimension browser, deep module menu, result conversion explorer, and gap ledger.
- Source Ops validation status and live source console.

## V1.5 Cut

V1.5 includes:

- Prep practice/qualifying funnel.
- Replay rank/gap trend after full-session archive proof.
- Incident/penalty chips and team context as reviewed debrief details.
- Replay archive trend/operator drilldown.

## Later Or Blocked

Later/deferred until source contracts prove them:

- Production-live reliability claim after real green/yellow INDY NXT rehearsal.
- Formal post-official-results reconciliation report path and reconciled/unreconciled backend state.
- Timezone-normalized countdown semantics.
- Official points-table model and rule tests.
- Betting-style public predictive model, single expected finish, top-10 probability, and field-strength/driver-strength headline claims.
- Live GPS/moving dot, tire/fuel/overtake strategy, detailed pit sequence, POV/radio, notification rules, broadcast route inventory, official INDY NXT weather.
