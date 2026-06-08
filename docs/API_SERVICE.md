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

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Service, storage, static app, and local file availability. |
| `GET /api/snapshot` | Full normalized `RaceSnapshot` for the web app. |
| `GET /api/session` | Compact event, session, flag, lap, track, source, and broadcast route. |
| `GET /api/bryce` | Bryce #9 timing row, driver profile, radio frequency, and route context. |
| `GET /api/timing` | Compact timing tower with Bryce highlighted. |
| `GET /api/sources` | Upstream Race Control probes plus local storage/proof file status. |
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

The service also proxies known `/racecontrol/*.json` paths server-side for compatibility, but BryceCast clients should use `/api/*` as the primary contract.

## Analytics Contract

The API can currently power analytics from timing rows, official history, source probes, and local archive rows.

Source-backed live fields include:

- Session: event, track, track type/length, session name/type/status, flag, lap, total laps, EventID, EventSessionID, updated timestamp, source state.
- Bryce row: rank, liveRank, start position, laps, status/comment, marker, diff, gap, liveGap, last lap, best lap, best lap number, best/last/average speed, pit stops, last pit lap, laps since pit, passes, passed, running points fields when present.
- Timing tower: every timing row sorted by rank with the same Race Control row fields.
- Sources: endpoint status, byte count, Last-Modified, ETag, checked age, modified age, and notes.
- History: official/provisional season rows, track-type splits, qualifying-to-finish deltas, best-lap-rank signal, points/standing, and teammate benchmark.
- Replay archive: sampled Bryce rows over time from SQLite after `npm run poll:race:watch`.

Not currently available through the API:

- Live Bryce GPS coordinates or a validated moving-dot track position.
- Weather observations/forecast/radar.
- Sector timing unless new fields or official reports are added.
- Team radio audio stream.
- Live POV/onboard video.

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
