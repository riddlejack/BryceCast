# BryceCast Live Race-Day Product Contract

Generated: 2026-06-16
Lane: Live Race Contract And Points Projection
Baseline: `e24edd0 Plan UI readiness execution lanes`

## Decision

BryceCast can start UI implementation after the backend exposes one product-level readiness wrapper over the existing live routes. The underlying data surface is already broad enough for v1 live timing, Bryce focus, source health, weather, replay, and a cautious points card. The missing piece is a stable UI contract that prevents the frontend from inferring race-day truth directly from raw endpoint reachability.

Do not build v1 around live GPS, moving-dot track position, sector timing, tire strategy, overtake strategy, pit prediction, live POV, or team radio audio. Those remain unavailable or rehearsal-only until live INDY NXT proof exists.

## Current Evidence

- `GET /api/readiness` is implemented as an additive product-level wrapper for live UI gating.
- `GET /api/snapshot`, `/api/session`, `/api/bryce`, and `/api/timing` already normalize Race Control timing and block only on the critical `timing` feed.
- `GET /api/sources` already reports endpoint-level `sourceState`, `readinessState`, freshness, role, and semantic summaries.
- `GET /api/weather/live?trackId=...` and `/api/weather/upcoming` already expose NWS weather with `live`, `partial`, or `error` behavior.
- `/api/readiness` selects its weather track from the active INDY NXT heartbeat when source metadata can be matched, otherwise from the next upcoming INDY NXT event, with Road America only as a final fallback.
- `GET /api/replay/bryce` already exposes archive states: `missing`, `empty`, `tiny`, `ready`.
- `TimingRow` already carries `runningDriverPoints`, `totalDriverPoints`, and `totalEntrantPoints` when Race Control provides them.
- `public/data/history-bryce.json` is present and currently records Bryce with 131 points and rank 14 after 8 2026 rows, sourced from official INDY NXT results plus provisional timing when applicable.
- `data/live/live-source-pressure-latest.json` is not present in this worktree. Prior docs record cold/post-session pressure proof, but this lane should not claim a current generated pressure artifact.
- Current `npm run api:smoke` passes by checking `/api/readiness` first and only requiring Bryce-specific snapshot/session/timing routes when readiness is `ready` or `degraded`. On 2026-06-16 the smoke path correctly reports `wrong_series` because the active global Race Control feed is not a Bryce INDY NXT session; treat that as evidence for the guarded off-session/wrong-series path, not as live green-flag proof.

## Routes

The UI should treat these as the race-day backend boundary.

| Route | Product state | Use | Required before UI |
| --- | --- | --- | --- |
| `GET /api/readiness` | `ReadinessState` | Single room/product status reducer for UI gating. | Implemented. |
| `GET /api/session` | `RaceWeekendState` | Event, session, lap, flag, route, and pre-session context. | Existing route, wrapped by `/api/readiness` for product state. |
| `GET /api/timing` | `LiveTimingState` | Timing tower rows, Bryce highlight, point fields, gaps, pace, pit/pass fields. | Existing route, needs field freshness/null rules documented in tests. |
| `GET /api/bryce` | `BryceLiveState` | Bryce row, identity/profile, radio frequency metadata, and route context. | Existing route, wrapped by `/api/readiness` for product state. |
| `GET /api/weather/live?trackId=...` | `WeatherState` | Venue observation, forecast, alerts, station/grid, cache/probes. | Existing route. |
| `GET /api/replay/bryce?limit=...` | `ReplayState` | Local archive replay and post-session summary. | Existing route. |
| `GET /api/sources` | `SourceHealthState` | Operator/source diagnostics and product readiness inputs. | Existing route, keep endpoint-level states separate from product-level states. |
| `GET /api/history/bryce?compact=1` | Historical points baseline | Current official/provisional season standing fallback. | Existing route. |

`/api/readiness` should be additive. It should not replace `/api/sources`; it should consume source facts and expose a UI-safe state machine.

## ReadinessState

Product readiness states are intentionally narrower than endpoint-level `readinessState` values in `/api/sources`.

| State | Meaning | UI behavior | Primary trigger |
| --- | --- | --- | --- |
| `ready` | Live INDY NXT timing is fresh, Bryce row is present, and core timing route is usable. | Enable live race mode and 1-second UI polling. | Timing heartbeat is INDY NXT, car `9` is Bryce by `DriverID=2143` or exact name, and timing freshness is within live threshold. |
| `pre_session` | The weekend/session route is known, but the active timing feed is not a fresh Bryce NXT session yet. | Show schedule, route, weather, historical prep, source countdown, and archive controls. | Track activity, schedule, or upcoming-event metadata has current/next NXT session context; timing is cold, absent, or not yet green. |
| `degraded` | Core live timing is usable, but one or more enrichments are partial. | Show live race mode with visible amber source labels and hide affected widgets. | Timing/Bryce guard passes, but driver profile, route, weather leg, archive writer, or history fallback is partial/stale. |
| `wrong_series` | The global Race Control timing feed is live/reachable but not the Bryce INDY NXT session. | Block live Bryce labels; show source warning, next NXT session, and last archived Bryce sample if available. | Timing feed lacks Bryce row or heartbeat is top-series/non-NXT. |
| `stale` | Last usable live data is too old for live display. | Freeze values, mark stale, stop live deltas, keep replay/source diagnostics visible. | Timing `checkedAgeSeconds` or snapshot age exceeds freshness threshold, or only archived fallback is available. |
| `blocked` | Required data for any honest race-day mode is missing or invalid. | Show recovery checklist and do not show live values. | Timing fetch error with no valid archive, payload invalid, no event/session context, or local API unavailable. |

Recommended freshness thresholds:

- `ready`: timing checked age <= 3 seconds during active UI polling and payload heartbeat not cold/checkered/complete.
- `stale`: timing checked age > 10 seconds during active session, or archived fallback is the active source.
- `pre_session`: no fresh Bryce row, but route/weather/history are available and next NXT session is known.
- `blocked`: no timing heartbeat and no usable archived Bryce sample.

The reducer should include:

```ts
type ReadinessState = {
  schemaVersion: 'live-readiness.v1';
  checkedAt: string;
  state: 'ready' | 'pre_session' | 'degraded' | 'wrong_series' | 'stale' | 'blocked';
  severity: 'green' | 'amber' | 'red';
  reason: string;
  raceWeekend: RaceWeekendState;
  liveTiming: LiveTimingState;
  bryce: BryceLiveState;
  points: PointsProjectionState;
  weather: WeatherState;
  replay: ReplayState;
  sources: SourceHealthState;
  gates: ReadinessGate[];
};
```

## RaceWeekendState

Purpose: source-backed event/session route and pre-session context.

Required fields:

- `eventId`, `eventSessionId`, `eventName`, `sessionName`, `sessionType`, `sessionStatus`
- `trackName`, `trackType`, `trackLength`
- `flag`, `lap`, `totalLaps`
- `startsAt`, `estimatedGreenFlag`, `endsAt`, `timezone`
- `broadcastRoute` from track activity, schedule, config, or unavailable state
- `sourceState`: `live`, `cold`, `stale`, `seed`, `error`
- `readiness`: `ready`, `pre_session`, `degraded`, `wrong_series`, `stale`, `blocked`

Null-vs-zero:

- Missing lap, total laps, or track length is `null`, not `0`.
- `lap=0` is valid only if Race Control explicitly sends zero.
- Empty route arrays mean no source-backed route; they do not mean "none scheduled" unless the source says so.

## LiveTimingState

Purpose: timing tower and live-race metrics.

Required fields:

- `checkedAt`, `sourceState`, `rowCount`, `bryceNo`
- `heartbeat` summary: event/session/series/flag/lap/total laps
- `rows[]` sorted by rank with `no`, `name`, `team`, `rank`, `liveRank`, `startPosition`, `status`, `comment`, `gap`, `liveGap`, `diff`, `laps`
- pace fields: `bestLapTime`, `lastLapTime`, `bestSpeed`, `lastSpeed`, `averageSpeed`
- racecraft fields: `passes`, `passed`, `pitStops`, `lastPitLap`, `sincePitLap`
- optional candidate fields: `tire`, `overtakeRemain`, `overtakeActive`, `lapDistance`, `liveDiffAhead`, `liveDiffBehind`
- point fields: `runningDriverPoints`, `totalDriverPoints`, `totalEntrantPoints`
- `bryce: boolean`

Display rules:

- `rank=0`, `passes=0`, `pitStops=0`, `overtakeRemain=0`, and point values of `0` are valid only when present as numeric source values.
- Missing numeric source values must remain `null`, not `0`.
- Empty strings in gap/time fields mean source-empty; the UI should show unavailable, not zero gap.
- `lapDistance` must not power a moving track position until live-session proof shows nonzero, changing values during green INDY NXT running.
- Tire/overtake fields must stay hidden or candidate-labeled until Road America proves they are meaningful for INDY NXT.

## BryceLiveState

Purpose: the Bryce-focused live card and guardrail against wrong-series car #9 collisions.

Required fields:

- `checkedAt`, `sourceState`, `readiness`
- `heartbeat`
- `bryce` timing row
- `profile` from NXT driver feed or fallback identity
- `identityGuard`: `{ carNumber: '9', rcDriverId: '2143', matchedBy: 'driver_id' | 'exact_name', seriesOk: boolean }`
- `broadcastRoute`
- `warnings[]`

Wrong-series guard criteria:

- The timing heartbeat must be INDY NXT. Current code accepts `Series: "L"`, text containing `nxt`, or preamble ending in `.l`.
- The row must be car `9`.
- The row must match either Race Control `DriverID=2143` or exact `Bryce Aron`.
- Top-series car #9 must never be treated as Bryce.
- If the guard fails but an archived Bryce sample exists, the product state is `wrong_series` or `stale`, never `ready`.

## PointsProjectionState

Purpose: v1 live points display without overclaiming an official championship model.

Current Race Control fields:

- `runningDriverPoints`
- `totalDriverPoints`
- `totalEntrantPoints`

Recommendation: these fields are enough for v1 display when populated and fresh. They are not enough for a standalone what-if projection engine, because the repo does not yet own an official INDY NXT points-table model, bonus-point rules, tiebreakers, penalties, entrant/driver distinction rules, or official post-race reconciliation logic.

V1 policy:

- Use Race Control `runningDriverPoints` as the live projected race/session points value when present for Bryce and competitors.
- Use `totalDriverPoints` as the projected championship total when present.
- Use `totalEntrantPoints` only as an entrant/team-context field; do not label it as Bryce driver points.
- Label the card `Race Control running points` or `provisional live points`, not `official points`.
- Do not calculate a replacement total from rank unless a later backend lane adds an official points table and rule tests.

Fallback:

- If live point fields are absent, `null`, source-empty, stale, or only present for some rows, set `mode: 'unavailable' | 'partial'` and show Bryce's latest historical official/provisional standing from `/api/history/bryce?compact=1`.
- If timing is `wrong_series`, freeze the latest valid Bryce/live or historical baseline and show `wrong_series`.
- If timing is `stale`, keep the last known point values only with explicit stale age.
- If point values are `0` and source-present, show zero; if absent, show unavailable.

Contract shape:

```ts
type PointsProjectionState = {
  schemaVersion: 'live-points.v1';
  checkedAt: string;
  mode: 'race_control_live' | 'historical_fallback' | 'partial' | 'unavailable' | 'stale';
  source: 'race_control_timing' | 'history_compact' | 'archive' | 'none';
  label: string;
  bryce: {
    runningDriverPoints: number | null;
    totalDriverPoints: number | null;
    totalEntrantPoints: number | null;
    historicalDriverPoints: number | null;
    historicalRank: number | null;
  };
  fieldCoverage: {
    rows: number;
    runningDriverPointsRows: number;
    totalDriverPointsRows: number;
    totalEntrantPointsRows: number;
  };
  officialModelAvailable: false;
  reconciliationRequired: boolean;
  warnings: string[];
};
```

Official results reconciliation after publish:

1. Refresh official history ingestion after INDYCAR results publish.
2. Compare Race Control live `runningDriverPoints` and `totalDriverPoints` against official race points and championship total.
3. Record discrepancy rows by EventID/EventSessionID, driver, entrant, live value, official value, and reason if known.
4. Promote official result into `public/data/history-bryce.json` and compact history.
5. Mark the session replay as `reconciled` only after the official row and local replay agree on identity/session keys.

## WeatherState

Purpose: venue weather context, not official series weather.

Required fields:

- `schemaVersion: 'live-weather.v1'`
- `checkedAt`, `sourceState`, `source: 'NWS API'`
- `track`, `point`, `grid`, `station`
- `observation`
- `forecastHourly[]`, `forecast[]`, `alerts[]`
- `probes[]`
- `cache`

Behavior:

- `sourceState: 'live'` requires parseable NWS point, station, observation, hourly forecast, daily forecast, and alerts responses with required observation identity and non-empty forecast periods.
- `sourceState: 'partial'` is acceptable for UI if failed probes are visible and the missing leg is hidden.
- One failed NWS leg must not collapse the race-day API into HTTP 500.
- Missing observation or forecast values remain `null`, not `0`.
- Do not label this as official INDY NXT weather, track temperature, radar, or session-specific condition unless a separate official source exists.

## ReplayState

Purpose: archive sufficiency for replay, debrief, and stale fallback.

Current states from `/api/replay/bryce`:

- `missing`: SQLite archive unavailable.
- `empty`: archive exists but has no Bryce samples.
- `tiny`: fewer than 10 returned samples; coverage proof only.
- `ready`: enough returned samples for a useful trend.

Replay/archive sufficiency criteria for race-weekend proof:

- Archive capture ran with `npm run poll:race:watch -- --interval-ms=1000`.
- The selected session has at least 20 minutes of samples during an active session for live proof.
- Rows are chronological and preserve `null` numeric fields as `null`.
- Summary can show rank movement, gap changes, pass windows, status/comment events, point-field availability, and source health.
- Repeated cold/post-race samples must produce a warning and must not be treated as replay quality.

## SourceHealthState

Purpose: operator diagnostics and source-level reason codes.

Required fields:

- `checkedAt`
- `endpoints[]` with `id`, `role`, `series`, `cadence`, `ok`, `status`, `sourceState`, endpoint-level `readinessState`, `checkedAgeSeconds`, `modifiedAgeSeconds`, `freshnessLabel`, `sourceSummary`, and `note`
- `local` storage/proof file status
- `critical[]`, `enrichment[]`, `reference[]`, `candidate[]`

Mapping rules:

- `timing` is the only critical live source for `/api/snapshot`, `/api/session`, `/api/bryce`, and `/api/timing`.
- `drivers_nxt`, `config`, `schedule_nxt`, and `trackactivity_nxt` are enrichment. Failures degrade, but do not block a valid Bryce timing row.
- `drivers_top`, `schedule_top`, and `trackactivity_top` are reference-only wrong-series guards.
- `ntt_data_polling` is candidate-only until live INDY NXT relevance is proven.
- HTTP 200 is not enough for product readiness.

## Road America Live-Session Rehearsal Checklist

Run these during the June 19-21, 2026 Road America INDY NXT windows documented in the readiness audit.

Before session:

- Start `npm run serve:app` or `npm run serve:api`.
- Start archive capture: `npm run poll:race:watch -- --interval-ms=1000`.
- Run `npm run weather:live`.
- Open `/api/sources`, `/api/session`, `/api/bryce`, `/api/timing`, `/api/replay/bryce?limit=20`.
- Confirm product readiness is `pre_session`, not `ready`, until the Bryce NXT timing row appears fresh.

During green/yellow running:

- Run `npm run audit:live:pressure:primary`.
- Confirm timing updates at least every 5 seconds.
- Confirm 1-second polling for the primary feeds sustains at least 20 minutes with zero or negligible errors.
- Confirm heartbeat is INDY NXT and Bryce is car `9` with `DriverID=2143` or exact identity.
- Confirm `rank`, `liveRank`, `gap`, `liveGap`, `liveDiffAhead`, and `liveDiffBehind` labels are directionally correct.
- Record whether `runningDriverPoints`, `totalDriverPoints`, and `totalEntrantPoints` are populated for Bryce and competitors.
- Record whether `lapDistance` is nonzero and changing. If not, no moving-dot UI.
- Record whether `Tire` and `OverTake_Remain` are meaningful for INDY NXT. If not, no strategy UI.
- Measure broadcast lag by comparing a visible broadcast moment, flag/lap change, or timing rank/gap change against Race Control timestamp/check time. Record Race Control ahead/behind and approximate seconds.

After session:

- Query replay with a high limit and confirm `archiveState: 'ready'`.
- Save pressure-test output path and source summary.
- Refresh official history when results publish.
- Reconcile live points fields against official result and championship totals.

## 1-Second Polling Acceptance

Cold/post-session proof is not enough. A live-session pass requires:

- Primary endpoints only: `timing`, `drivers_nxt`, `config`, `schedule_nxt`, `trackactivity_nxt`.
- Interval: 1,000 ms.
- Duration: at least 20 minutes during active INDY NXT running.
- Timing feed: zero fatal fetch errors; negligible transient errors only if retry behavior keeps the UI honest.
- p95 latency: target under 750 ms, hard fail over 2,000 ms sustained.
- Payload semantics: fresh timing payloads, changing timing hashes or heartbeat/timing fields during running, Bryce row present.
- Archive: poll-start-to-poll-start cadence preserved closely enough to reconstruct race changes.

## Tests

Implemented before UI implementation:

- API smoke assertion that `/api/readiness` exists and maps endpoint facts without requiring UI logic.
- Product readiness fixture coverage for `ready` and `wrong_series`.
- Wrong-series fixture where top-series car `9` exists but Bryce guard fails.
- Null-vs-zero fixture for timing numeric fields.
- Points field coverage fixtures for all fields present, absent/historical fallback, partial row coverage, and wrong-series fallback.

Still needed for backend hardening:

- Reducer fixture coverage for `pre_session`, `degraded`, `stale`, and `blocked`.
- Stale timing fixture where Race Control fetch succeeds but checked age exceeds threshold.
- No-Bryce-row fixture with archived fallback available and unavailable.
- Weather partial fixture where one NWS leg fails and the route returns `partial`.
- Replay fixture for `missing`, `empty`, `tiny`, `ready`, and repeated-cold warning.

Remaining race-weekend proof:

- A real green-flag INDY NXT Road America session must still prove live cadence, Bryce row presence, point-field behavior, candidate lap-distance/tire/overtake fields, and broadcast lag.

Can happen during UI implementation:

- Visual source labels for every degraded widget.
- Operator-only details view for endpoint-level `/api/sources`.
- UI polling backoff after `wrong_series`, `stale`, or `blocked`.
- Compact mobile readiness card.

Race-weekend rehearsal only:

- 20-minute 1-second primary-feed soak.
- Broadcast lag measurement.
- Live point-field availability proof.
- Lap-distance/tire/overtake proof.
- Full-session replay sufficiency proof.
- Official post-race points reconciliation.

## Implementation Backlog

Completed before UI:

1. Add `/api/readiness` as a `ReadinessState` route.
2. Add first-pass readiness reducer tests for ready/wrong-series, null-vs-zero, and point fallback modes.
3. Add API smoke coverage for `/api/readiness` and off-session/wrong-series behavior.
4. Add explicit `PointsProjectionState` builder that uses Race Control fields when fresh and compact history when absent/stale.

Remaining backend follow-up:

1. Add a small reconciliation report path for post-official-results comparison.
2. Add the remaining readiness fixtures listed above.

Can happen during UI:

1. Consume `/api/readiness` as the single live-mode gate.
2. Build the points card with live Race Control mode and historical fallback mode.
3. Build source-state badges from product readiness first, endpoint detail second.
4. Hide candidate widgets until proof flags are true.

Race-weekend rehearsal:

1. Execute the Road America checklist.
2. Commit or archive pressure/replay proof artifacts if they become part of the source-of-truth handoff.
3. Update this contract with measured cadence, broadcast lag, point availability, and reconciliation outcome.

## Non-Goals

- No frontend visual UI source is defined by this contract.
- No ingestion-owned file edits are required by this live readiness layer.
- No official points-table model in v1 unless a later backend lane adds source-backed rules and tests.
