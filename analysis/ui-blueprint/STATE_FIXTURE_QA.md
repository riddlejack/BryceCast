# State Fixture QA

Generated: 2026-06-18

Source fixtures: `analysis/ui-data-package/ui-data-package.json`, `screens.liveCompanionFixtures.fixtures[]`.

Package baseline: generated `2026-06-18T17:52:13.930Z`, `baselineCommit=ce904af`, source hash `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`.

Context-pack baseline: `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json` with 9 upcoming-event packs, 36 race-debrief packs, 1 Career Lab pack, and 1 live race-day pack. These context packs are source-backed design/build fixtures; live runtime truth still comes from `/api/readiness`.

Current fixture coverage:

- Required readiness states: `wrong_series`, `pre_session`, `ready`, `degraded`, `stale`, `blocked`
- Required variants: `base`, `no_bryce_archive_ready`, `no_bryce_archive_missing`, `replay_empty`, `replay_repeated_cold`
- Fixture count: 10
- Fixture caveat: these are synthetic design/QA states. Runtime truth still comes from `/api/readiness`, and a green fixture is not Road America green-flag production proof.

## Readiness Fixture Matrix

| State / variant | Fixture reason | Gate pattern | Expected UI behavior |
| --- | --- | --- | --- |
| `wrong_series / base` | Current Race Control feed is not Bryce INDY NXT. | `timing_reachable=pass`; `indy_nxt_heartbeat=fail`; `bryce_identity=fail`; `timing_freshness=pass`; `points_fields=warn`; `weather=pass`; `replay_archive=warn`. | Show red wrong-series banner. Do not populate product race-weekend identity from the wrong-series heartbeat. Do not render Bryce live status, live points, live rank, or live gap. Timing details can appear only as diagnostic/source drawer. |
| `pre_session / base` | INDY NXT context exists, but green/yellow live Bryce timing is not active. | `timing_reachable=pass`; `indy_nxt_heartbeat=pass`; `bryce_identity=pass`; `timing_freshness=warn`; `points_fields=warn`; `weather=pass`; `replay_archive=warn`. | Show Session Imminent: countdown/session, route/readiness/source, weather if live, and historical prep. Suppress live timing tower and live points label. |
| `ready / base` | Fresh INDY NXT timing has a guarded Bryce row. | All required gates pass, including `points_fields=pass`, `weather=pass`, `replay_archive=pass`. | Show Live Companion. Enable Bryce status, timing tower, Race Control running points, NWS weather strip, and source drawer. Label points provisional because `points.reconciliationRequired=true`. Do not claim production-live reliability from this fixture alone. |
| `degraded / base` | Core timing is usable, but one enrichment source is partial. | Core timing/identity gates pass; `enrichment_sources=warn`; `weather=warn`; `replay_archive=warn`; `points_fields=pass`. | Keep Live Companion active with amber source labels. Render guarded Bryce/timing. Points mode is partial; show populated fields and warnings. Weather strip hides missing NWS leg and exposes failed probe in drawer. |
| `stale / base` | Timing data is too old for live Bryce display. | Timing and identity pass, but `timing_freshness=fail`; replay passes. | Freeze or suppress live values, stop live deltas, show stale age/source warning, keep replay/source diagnostics. Points mode is `stale`, not live. |
| `blocked / base` | Required live timing context is unavailable. | `timing_reachable=fail`; `indy_nxt_heartbeat=fail`; `bryce_identity=fail`; `timing_freshness=fail`; `enrichment_sources=fail`; `weather=fail`; `replay_archive=warn`. | Show recovery/source checklist. Do not show live Bryce/timing/points. Safe schedule/career fallback can appear if separately source-backed. |
| `blocked / no_bryce_archive_ready` | Active INDY NXT timing is available, but no guarded Bryce car #9 row is present. | Timing/heartbeat/freshness pass; `bryce_identity=fail`; `enrichment_sources=fail`; replay passes. | Block live Bryce display even though same-series timing exists. Optional archived Bryce context can be shown as stale/replay-labeled, not current. |
| `blocked / no_bryce_archive_missing` | Active INDY NXT timing is available, but no guarded Bryce car #9 row and no usable archive are available. | Timing/heartbeat/freshness pass; `bryce_identity=fail`; replay warns missing. | Block live Bryce display and do not offer archived fallback. Show source checklist and same-series/no-Bryce explanation. |
| `pre_session / replay_empty` | INDY NXT context exists, but the replay archive is empty. | Pre-session gate pattern; `replay_archive=warn`. | Same as pre-session, plus show archive capture needed. Replay trend disabled. |
| `pre_session / replay_repeated_cold` | INDY NXT context exists, but replay samples are repeated cold-state rows. | Pre-session gate pattern; `replay_archive=warn`. | Same as pre-session, plus show repeated-cold warning. Replay samples do not qualify for race trend analytics. |

## Current Fixture Field Expectations

| State / variant | Product context | Bryce guard | Points | Weather | Replay |
| --- | --- | --- | --- | --- | --- |
| `wrong_series / base` | `raceWeekend.eventName=null`, `trackName=null`, `liveTiming.heartbeat.series=I`, row count 25. | `identityGuard.seriesOk=false`, `matchedBy=null`, `bryce.bryce=null`; car #9 row exists with `bryce=false`. | `mode=historical_fallback`, source `history_compact`, 131 points, rank 14, live blocked warning. | `sourceState=live`, zero warnings. | `archiveState=tiny`, available true. |
| `pre_session / base` | Road America Race 1, source `cold`, lap 0/20, row count 25. | `seriesOk=true`, `matchedBy=driver_id`, Bryce row present but cold. | `historical_fallback`, source `history_compact`, warning that live Race Control points are unavailable while pre-session. | `sourceState=live`. | `archiveState=tiny`. |
| `ready / base` | Road America Race 1, source `live`, lap 12/20, row count 25. | `seriesOk=true`, `matchedBy=driver_id`, Bryce row present. | `mode=race_control_live`, source `race_control_timing`, running 25, total driver 143, entrant 160, field coverage 25/25/25, `reconciliationRequired=true`. | `sourceState=live`. | `archiveState=ready`, live samples 120. |
| `degraded / base` | Road America Race 1, source `live`, lap 12/20, row count 25. | Guard passes. | `mode=partial`, running 12, total driver null, entrant null, running rows 8/25, warnings present, `reconciliationRequired=true`. | `sourceState=partial`, one warning. | `archiveState=tiny`. |
| `stale / base` | Road America Race 1, source `stale`, lap 12/20, row count 25. | Guard passes but stale. | `mode=stale`, source `history_compact`, warning that live timing is stale. | `sourceState=live`. | `archiveState=ready`, live samples 120. |
| `blocked / base` | No event/session/track identity; timing source `error`, row count 0. | `seriesOk=false`, `matchedBy=null`, no Bryce row. | `historical_fallback`, source `history_compact`, rows 0, blocked warning. | `sourceState=error`, one warning. | `archiveState=missing`, available false. |
| `blocked / no_bryce_archive_ready` | Road America Race 1, source `live`, lap 12/20, row count 25. | `seriesOk=true`, `matchedBy=null`, no Bryce row; car #9 fixture row has `bryce=false`. | `historical_fallback`, source `history_compact`, no live Bryce points. | `sourceState=live`. | `archiveState=ready`. |
| `blocked / no_bryce_archive_missing` | Road America Race 1, source `live`, lap 12/20, row count 25. | `seriesOk=true`, `matchedBy=null`, no Bryce row. | `historical_fallback`, source `history_compact`. | `sourceState=live`. | `archiveState=missing`, available false. |
| `pre_session / replay_empty` | Road America Race 1, source `cold`, lap 0/20. | Guard passes but cold. | `historical_fallback`. | `sourceState=live`. | `archiveState=empty`, available true. |
| `pre_session / replay_repeated_cold` | Road America Race 1, source `cold`, lap 0/20. | Guard passes but cold. | `historical_fallback`. | `sourceState=live`. | `archiveState=tiny`, warning count 1, cold samples 6. |

## Product States Not Formal Readiness Enums

| Product state | Trigger/source truth | Current fixture support | Expected UI behavior |
| --- | --- | --- | --- |
| Race week | Upcoming INDY NXT event from `screens.roadAmericaPrep.events[]`; current package has Road America Race 1 on `2026-06-19` and Race 2 on `2026-06-20`; each event carries `contextPackRef.path`. | Not a live fixture; package prep state is `readiness=partial`. Upcoming-event context packs are available. | Show Race Weekend Prep command center, track facts, race-intelligence band, top-10 path, analogs, same-track/track-type history, source drawer. Weather unavailable from static artifact unless runtime NWS route supplies it. |
| Session imminent | `/api/readiness.state=pre_session` or next known NXT session close to start. | `pre_session / base`, `replay_empty`, `replay_repeated_cold`. | Show countdown/session, readiness gates, weather/prep. No live rank/gap/tower/points-as-live. |
| Live ready | `/api/readiness.state=ready`. | `ready / base`. | Show full guarded live shell. Points remain Race Control/provisional until reconciled. |
| Degraded live | `/api/readiness.state=degraded`. | `degraded / base`. | Show live shell with affected widgets hidden/badged. |
| Wrong series | `/api/readiness.state=wrong_series`. | `wrong_series / base`. | Red guard, no Bryce live labels, no product identity from wrong-series heartbeat. |
| Stale | `/api/readiness.state=stale`. | `stale / base`. | Freeze/suppress live values, mark stale, keep replay/source diagnostics. |
| Blocked | `/api/readiness.state=blocked`. | `blocked` variants. | Recovery checklist, no live values, safe fallback only. |
| Post-session unreconciled | Session ended with live/replay evidence and `points.reconciliationRequired=true`, or no official reconciliation report path. | No formal readiness enum. `ready` and `degraded` fixtures show `reconciliationRequired=true`; package has debrief seeds. | Route to Race Debrief with provisional/source labels. Do not call points official. |
| Post-session reconciled | Official history/result refreshed and a reconciliation report proves live points/replay agree. | No current backend fixture. Missing backend contract lists "Post-official-results points reconciliation report path." | Do not render as current v1 state. Keep as later until report path exists. |
| Off-week | No race-week/live context; use next event, career, and source status. | No formal readiness enum. | Dynamic home becomes next-event preview plus career highlights/source status. No stale live content as current. |

## Validator And Test Behaviors To Preserve

- Every live fixture must include runtime-shaped `raceWeekend`, `liveTiming`, `bryce`, `points`, `weather`, `replay`, `sources`, and `gates`.
- Every roadAmericaPrep event should preserve `contextPackRef.path`, `predictionBand`, `top10Path`, and `chartSpecs`; UI should not regress to shallow same-track cards only.
- Predictive fixture language must stay source-bounded: historical prior bands/path language only, no single expected finish or public top-10 probability.
- `wrong_series` must not populate product `raceWeekend.eventName` or `trackName`.
- `wrong_series` must include a non-Bryce car #9 row so top-series contamination is tested.
- Same-series timing without a guarded Bryce row is `blocked`, not live.
- Cold same-series timing without Bryce can remain `pre_session`.
- Source-present numeric zero is valid; missing numeric values remain `null`.
- `liveTiming.rows.length` must match `liveTiming.rowCount`.
- `liveTiming.rowCount` must match `points.fieldCoverage.rows`.
- `identityGuard.rcDriverId` must be `2143`; stale `raceControlDriverId` must not appear.
- Replay gate cannot pass unless `archiveState=ready`.
- Partial weather fixture must include warnings and a warn weather gate.
- Points historical fallback must match `screens.sourceOps.historyStanding` with 131 points and rank 14 in the current package.
- Replay repeated-cold fixture must include replay warnings.
