# BryceCast Local API Service

The local API service is the production-style data boundary for BryceCast. It serves the built React app, fetches official Race Control data server-side, exposes normalized BryceCast routes, and persists legacy POV/audio proof state plus current audio/frequency status.

## Run

```bash
npm run build
npm run serve:app
```

Open `http://localhost:8787`.

For API-only development:

```bash
npm run serve:api
```

## Live Cache Behavior

The live routes are cache-backed by default. `/api/snapshot`, `/api/session`, `/api/bryce`, `/api/timing`, `/api/readiness`, `/api/sources`, and the compatibility Race Control proxy paths serve server-side cached state. When `scripts/live-runner.mjs` has a fresh status heartbeat and recent archive write, the API prefers the runner-owned SQLite/raw snapshot state; otherwise one internal API refresh loop maintains the fallback cache.

Client polling does not trigger direct Race Control fetches. Use `POST /api/refresh` for an explicit operator/debug refresh. Compatibility proxy paths also read cache by default; `?refresh=1` is reserved for operator checks and returns a warning header.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Service, storage, static app, and local file availability. |
| `GET /api/readiness` | Product-level live readiness wrapper with race-weekend, timing, Bryce, points, weather, replay, source, and gate state. Use this as the live-mode UI gate. |
| `GET /api/snapshot` | Full normalized `RaceSnapshot` for the web app. |
| `GET /api/session` | Compact event, session, flag, lap, track, source, and broadcast route. |
| `GET /api/bryce` | Bryce #9 timing row, driver profile, radio frequency, and route context. |
| `GET /api/timing` | Compact timing tower with Bryce highlighted. |
| `GET /api/sources` | Upstream Race Control probes plus local storage/proof file status. |
| `GET /api/weather/live?trackId=track_road_america` | Current NWS observation, forecast, alerts, station, grid metadata, and probe status for one track. |
| `GET /api/weather/upcoming` | Current NWS weather plus forecast-readiness labels for every remaining 2026 INDY NXT event in the career dataset. |
| `GET /api/history/bryce` | Official/provisional Bryce season history snapshot with schema and source-confidence metadata. |
| `GET /api/history/bryce?compact=1` | Compact season analytics projection for iPhone/mobile widgets: latest race, track splits, gain/loss, best-lap rank, and CGR teammate bench. |
| `GET /api/onboard-catalog` | Legacy/latest official INDYCAR LIVE catalog probe. Research only; live POV is unavailable for the active product. |
| `GET /api/race-log/latest` | Latest persisted local poller snapshot. |
| `GET /api/replay/bryce?limit=100&sessionKey=...` | SQLite-backed Bryce replay analytics: archive state, sessions, warnings, rank/pass/status summary, and chronological rows. |
| `GET /api/pov-proof` | Legacy live #9 POV proof state. Active UI should treat POV as unavailable unless new rights-holder access appears. |
| `POST /api/pov-proof` | Persist legacy POV proof state. Delayed/replay states must remain failing and live POV remains out of scope. |
| `GET /api/audio-proof` | Current audio/radio proof state. |
| `POST /api/audio-proof` | Persist audio/radio proof state. |
| `POST /api/refresh` | Manual Race Control/source refresh. |

The service also proxies known live-source paths server-side for compatibility, but BryceCast clients should use `/api/*` as the primary contract. Proxied paths are centralized in `scripts/live-source-endpoints.mjs` and include the Race Control JSON feeds plus the exposed NTT prediction candidate path.

## Analytics Contract

The API can currently power analytics from timing rows, official history, source probes, live weather, upcoming-event weather readiness, local archive rows, and the product-level `/api/readiness` state.

Source-backed live fields include:

- Session: event, track, track type/length, session name/type/status, flag, lap, total laps, EventID, EventSessionID, updated timestamp, source state.
- Critical live path: `/api/snapshot`, `/api/session`, `/api/bryce`, and `/api/timing` block on the Race Control timing feed only. NXT driver profile, config, schedule, and track-activity feeds are enrichment; the API serves their latest cached result, including failed refresh states, and refreshes stale/missing enrichment in the background so a slow profile or schedule feed does not stall a valid live timing response.
- Bryce row: rank, liveRank, start position, laps, status/comment, marker, diff, gap, liveGap, last lap, best lap, best lap number, best/last/average speed, pit stops, last pit lap, laps since pit, passes, passed, running points fields when present.
- Bryce profile: identity/team/radio/image metadata from the NXT driver feed when available. Driver-profile failure is enrichment degradation, not a core timing failure; valid Bryce timing and valid archived Bryce timing fallback can return with fallback identity fields and stale/error profile source state.
- Timing tower: every timing row sorted by rank with compact Race Control row fields, including running/total points, live diff ahead/behind, lap distance, tire, overtake, pit, pass, pace, and status fields when present.
- Sources: endpoint status, byte count, Last-Modified, ETag, checked age, modified age, series, cadence class, source role, proxy path, timeout/error state, and notes. Upstream source probes and the source-audit CLI use a bounded 5-second timeout by default.
- Source readiness: `/api/sources` exposes `sourceState` and `readinessState`. Candidate/reference feeds cannot become app-available from HTTP success alone. The stale NTT prediction blob reports payload datetime/age and stays `candidate_unavailable`; top-series guard feeds stay `reference_only`; global timing reports `wrong_session` unless the shared live-source predicate sees an INDY NXT heartbeat and Bryce as car `9` with `DriverID=2143` or exact `Bryce Aron` identity; the NXT driver feed reports `profile_unavailable` or `profile_partial` when profile/radio enrichment is incomplete.
- Product readiness: `/api/readiness` consumes timing, source health, compact history, replay, and weather into `ready`, `pre_session`, `degraded`, `wrong_series`, `stale`, or `blocked`. Current off-session smoke should report `wrong_series` when Race Control points at top-series car `9`; that is a successful guard, not a Bryce data failure.
- Proxied Race Control/reference/candidate JSON routes use the same bounded 5-second upstream timeout and return a 502 error instead of hanging a client request indefinitely.
- Weather: NWS current observation, hourly forecast, daily forecast, active alerts, station/grid metadata, source state, forecast-readiness label, cache state, and probe proof. Long-range event forecasts remain unavailable until the NWS forecast window opens. Individual NWS leg failures should return `sourceState: partial`, not an API 500. Operator refreshes force cache refresh but preserve in-flight request reuse. Upcoming-event weather uses bounded concurrent track refreshes and per-track deadline fallbacks. `/api/readiness` selects weather from the active INDY NXT heartbeat when it can match source metadata, otherwise from the next upcoming INDY NXT event in the career dataset.
- Missing NWS observation-station, hourly-forecast, or daily-forecast URLs are recorded as failed probes so weather cannot be marked `live` while silently omitting current observation or forecast legs. HTTP 200 is not sufficient for weather readiness; JSON parse failures and schema-empty observation/hourly/daily payloads are failed probes.
- History: official/provisional season rows, track-type splits, qualifying-to-finish deltas, best-lap-rank signal, points/standing, and teammate benchmark.
- Replay archive: sampled Bryce rows over time from SQLite after `npm run poll:race:watch`. Watch mode compensates for fetch/write elapsed time, and optional live timing numbers preserve missing values as `null` from poller write through replay read. Expanded fields persisted for new samples include best-lap number, average speed, pit recency, tire/overtake, lap distance, live diff ahead/behind, running/total points, and radio metadata.

Not currently available through the API:

- Live Bryce GPS coordinates or a validated moving-dot track position.
- Radar and official series weather.
- Unbounded high-frequency weather fan-out. Weather routes use a per-track cache and in-flight request reuse; clients can request `?refresh=1` or `?cache=0` for operator checks, but those refreshes still reuse in-flight requests.
- Sector timing unless new fields or official reports are added.
- Team radio audio stream.
- Live POV/onboard video.
- NTT prediction data for INDY NXT. The official leaderboard exposes a prediction blob, but the current public payload is stale and must remain candidate/unavailable until live-session proof exists.

If the UI renders any unavailable item, it must be labeled as unavailable, reference-only, candidate, or estimate. Do not silently substitute seed data for production analytics.

## History Contract

`GET /api/history/bryce` preserves the full `history-bryce.json` shape and adds `meta` plus an `x-brycecast-schema-version` response header. `meta.schemaVersion` is currently `history-bryce.v1`.

The metadata includes row count, official row count, provisional row count, source label, checked timestamp, checked age, and a deterministic source fingerprint. This lets compact clients show freshness and confidence without parsing every race row.

`GET /api/history/bryce?compact=1` returns only derived, source-backed season widgets:

- `latestRace`
- `trackSplits`
- `bestGain`
- `largestLoss`
- `bestLapRank`
- `teammateBench`
- `bryceStanding`
- `currentYear`

All compact fields are derived from the same official/provisional season history payload. No new source is implied by the compact response.

## Verification

```bash
npm run build
npm run api:smoke
npm run weather:live
npm run weather:live:upcoming
npm run audit:live:pressure
npm run audit:live:pressure:primary
BRYCECAST_URL=http://127.0.0.1:8788 BRYCECAST_EXPECT_API=1 npm run qa:render
```

The API-mode render QA fails if the browser reaches directly for `/racecontrol/*`, `/ntt-data/*`, `/data/live-snapshot.json`, `/data/onboard-catalog.json`, or `/data/history-bryce.json`.

## POV Status

The API can store proof state for historical compatibility, but the active product should treat live Bryce #9 POV as unavailable. Do not use API proof state to imply the app can include live POV unless a rights-holder-controlled stream is explicitly offered later.

## Replay Analytics

`GET /api/replay/bryce` reads `data/live/brycecast.sqlite`. It defaults to the latest archived session and clamps `limit` to 500 rows.

Replay archive states:

- `missing`: SQLite archive is unavailable.
- `empty`: archive exists but has no Bryce samples.
- `tiny`: fewer than 10 samples returned. The UI should treat this as coverage proof, not a full race trend.
- `ready`: enough samples exist for a useful rank/status trend.

The endpoint returns derived fields such as `positionDelta`, `netPasses`, `coverageMinutes`, latest status/comment, status events, and warnings for repeated cold/post-race samples. Engineer mode uses this as the replay and post-race analysis surface.
