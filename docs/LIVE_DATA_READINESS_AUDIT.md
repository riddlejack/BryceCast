# BryceCast Live Data Readiness Audit

Current audit timestamp: June 13, 2026.

## Bottom Line

BryceCast now has a repeatable live-source lane for every public live or near-live feed found in the official INDYCAR leaderboard bundle and existing BryceCast source inventory.

The current source surface is enough to build a serious race-day companion around live timing, gaps, rank, flags, lap context, status, passes, pit counts, tire/overtake fields when populated, and live/running championship points fields when populated.

It is not enough to claim a proven green-flag INDY NXT production system yet. The remaining proof must happen during live Road America sessions, because the global timing blob currently points to the cold top-series WWTR race and the current Bryce-valid archive remains only six cold INDY NXT WWTR race samples.

## Endpoint Catalog

| Endpoint ID | Source | Status | Product Use | Current Caveat |
| --- | --- | --- | --- | --- |
| `timing` | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Accessible | Live timing tower, Bryce row, rank, gaps, lap times, speed, passes, pit counts, tire/overtake, points fields | Global active-session feed can point to top-series; require the shared Bryce timing predicate: INDY NXT heartbeat plus car `9` and either Race Control `DriverID=2143` or exact `Bryce Aron` timing-row identity. |
| `drivers_nxt` | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Accessible | Bryce identity, team, car assets, radio frequency, season stats | Medium cadence profile feed, not live timing. |
| `config` | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Accessible | Static track map, official watch links, track-map config discovery | Current config has static map only; websocket fields are blank. |
| `schedule_nxt` | `https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json` | Accessible | Event/session schedule, broadcast route, track context | Feed timestamps lack explicit timezone in JSON strings. Normalize before UI. |
| `trackactivity_nxt` | `https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json` | Accessible | Current/upcoming session routing, networks, result import/official status | Feed timestamps lack explicit timezone in JSON strings. Normalize before UI. |
| `ntt_data_polling` | `https://indycar.blob.core.windows.net/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json` | Accessible but stale | Candidate pit prediction source | Current payload is a 2024 heartbeat only. Treat as unavailable unless it wakes up live. |
| `drivers_top` | `https://indycar.blob.core.windows.net/racecontrol/driversfeed.json` | Accessible | Wrong-series guard/reference | Do not mix with Bryce NXT live row. |
| `schedule_top` | `https://indycar.blob.core.windows.net/racecontrol/schedulefeed.json` | Accessible | Wrong-series guard/reference | Do not use for Bryce NXT route unless explicitly showing top-series context. |
| `trackactivity_top` | `https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed.json` | Accessible | Wrong-series guard/reference | Do not use for Bryce NXT route unless explicitly showing top-series context. |

These endpoints are centralized in `scripts/live-source-endpoints.mjs`. The local API proxies all of them through their `proxyPath` values, and `/api/sources` reports all of them with status, latency-adjacent freshness metadata, Last-Modified, ETag, bytes, series, cadence class, and role.

Source probes use a bounded 5-second fetch timeout. A slow upstream endpoint should become an error probe rather than hanging `/api/sources` or `/api/refresh`.

Normalized snapshot routes have a stricter race-day contract: `/api/snapshot`, `/api/session`, `/api/bryce`, and `/api/timing` block only on the critical `timing` feed. NXT driver profile, config, schedule, and track-activity feeds are served from a short in-memory enrichment cache and refreshed in the background when missing or stale. The cache stores the latest result, including failed refresh states, so enrichment outages remain visible instead of being hidden behind older successful payloads. If enrichment has not loaded yet, those probes report pending/error state instead of delaying the live timing response.

`/api/sources` separates HTTP reachability from app readiness. Candidate/reference feeds expose `readinessState` so `200 OK` cannot imply a usable BryceCast source. The NTT prediction blob currently reports as `candidate_unavailable` because its payload datetime is a stale 2024 heartbeat, and top-series feeds report as `reference_only` wrong-series guards.

The global timing endpoint also requires payload semantics before it becomes app-ready. `/api/sources` reports `wrong_session` when the timing feed is reachable but has no Bryce row, even if the HTTP request succeeds. The Bryce timing guard requires an INDY NXT heartbeat context, car `9`, and either Race Control `DriverID=2143` or exact `Bryce Aron` timing-row identity. Current archived INDY NXT samples use heartbeat `Series: "L"`.

The NXT driver feed is also semantic, not transport-only. `/api/sources` reports `profile_unavailable` when Bryce is absent from `driversfeed_nxt.json`, and `profile_partial` when Bryce is present but radio metadata is missing.

## Current 1-Second Pressure Test

Command:

```bash
npm run audit:live:pressure
```

All-source run result on June 8, 2026:

| Measure | Result |
| --- | ---: |
| Endpoint count | 9 |
| Interval | 1,000 ms |
| Iterations | 30 |
| Total requests | 270 |
| Errors | 0 |
| Overall success rate | 100% |
| Highest endpoint p95 latency | 75 ms |

June 8 all-source p95 latency by endpoint:

| Endpoint | p95 latency |
| --- | ---: |
| `timing` | 49 ms |
| `drivers_nxt` | 54 ms |
| `config` | 50 ms |
| `schedule_nxt` | 51 ms |
| `trackactivity_nxt` | 72 ms |
| `ntt_data_polling` | 47 ms |
| `drivers_top` | 48 ms |
| `schedule_top` | 75 ms |
| `trackactivity_top` | 64 ms |

Interpretation: polling all known public feeds every second is technically viable from this machine under current cold/post-session conditions. This does not prove live green-flag cadence, broadcast alignment, or server tolerance during peak race traffic. It proves the local tooling can sustain the target request pattern and capture reliability evidence.

Primary-feed 60-iteration soak on June 8, 2026:

| Measure | Result |
| --- | ---: |
| Endpoint count | 5 |
| Interval | 1,000 ms |
| Iterations | 60 |
| Total requests | 300 |
| Errors | 0 |
| Overall success rate | 100% |

Primary-feed p95 latency:

| Endpoint | p95 latency |
| --- | ---: |
| `timing` | 43 ms |
| `drivers_nxt` | 51 ms |
| `config` | 44 ms |
| `schedule_nxt` | 49 ms |
| `trackactivity_nxt` | 41 ms |

Pressure-test output is written under ignored live data paths:

- `data/live/live-source-pressure-latest.json`
- `data/live/pressure-tests/live-source-pressure-*.json`

June 13 primary-feed quick verification samples:

| Measure | Result |
| --- | ---: |
| Endpoint count | 5 |
| Interval | 1,000 ms |
| Iterations | 3 |
| Total requests | 15 |
| Errors | 0 |
| Highest p95 latency | roughly 160-180 ms across repeated 3-iteration checks |

June 13 primary-feed p95 latency:

| Endpoint | p95 latency |
| --- | ---: |
| `timing` | roughly 150-165 ms |
| `drivers_nxt` | roughly 140-150 ms |
| `config` | roughly 120-140 ms |
| `schedule_nxt` | roughly 170-180 ms |
| `trackactivity_nxt` | roughly 170-175 ms |

The June 13 timing sample still pointed to the top-series WWTR race, flag `COLD`, lap `260/260`, with no Bryce timing row. Treat this as a successful source-reachability check and a successful wrong-series guard check, not as live INDY NXT readiness.

## Live Weather And Upcoming Event Plumbing

Race-day weather now has a separate live adapter from the historical INDY NXT weather enrichment lane. It uses the NWS API against track coordinates already stored in the career dataset, and it reports current observations, hourly forecast, daily forecast, alerts, NWS station, NWS grid metadata, probe latency, and source state.

| Route or command | Status | Product Use | Caveat |
| --- | --- | --- | --- |
| `npm run weather:live` | Working for Road America | Current venue observation, next hourly forecast, alerts, station, probe proof | Forecast is current-day/hourly context, not a session-specific guarantee. |
| `npm run weather:live:upcoming` | Working for 9 remaining 2026 INDY NXT events | Preloads weather readiness for the rest of the season | Road America is now inside the NWS forecast window; later events remain `too_far_for_event_forecast` until their forecast window opens. |
| `GET /api/weather/live?trackId=track_road_america` | Working | Frontend/mobile contract for one venue | Source can be `partial` if one NWS subrequest fails. Per-track cache defaults to 5 minutes. |
| `GET /api/weather/upcoming` | Working | Frontend/mobile contract for all upcoming INDY NXT events | Uses per-track cache, single-flight refresh, bounded concurrency, and per-track deadline fallbacks to avoid repeated or serial NWS fan-out. |

Documented Road America live weather sample from the June 13 final verification sweep:

| Field | Result |
| --- | --- |
| Track | Road America, Elkhart Lake, Wisconsin |
| Source | NWS API |
| Station | `KSBM` |
| Observation timestamp | `2026-06-13T17:50:00+00:00` |
| Condition | Mostly Cloudy |
| Temperature | 26.0 C |
| Dew point | 16.0 C |
| Relative humidity | 54% |
| Wind | 250 degrees at 22.2 kph |
| Wind gust | 33.3 kph |
| Pressure | 100914 Pa |
| Active alerts | none |

Documented upcoming INDY NXT event readiness from the June 13 final verification sweep:

| Event | Date | Track | Days until event | Weather Readiness |
| --- | --- | --- | ---: | --- |
| Grand Prix at Road America Race 1 | 2026-06-19 to 2026-06-20 | Road America | 5.2 | `forecast_window_open` |
| Grand Prix at Road America Race 2 | 2026-06-20 to 2026-06-21 | Road America | 6.2 | `forecast_window_open` |
| Grand Prix at Mid-Ohio Race 1 | 2026-07-04 | Mid-Ohio Sports Car Course | 20.2 | `too_far_for_event_forecast` |
| Grand Prix at Mid-Ohio Race 2 | 2026-07-05 | Mid-Ohio Sports Car Course | 21.2 | `too_far_for_event_forecast` |
| Music City Grand Prix | 2026-07-18 | Nashville Superspeedway | 34.2 | `too_far_for_event_forecast` |
| Grand Prix of Portland | 2026-08-09 | Portland International Raceway | 56.2 | `too_far_for_event_forecast` |
| INDY NXT by Firestone at Milwaukee Mile | 2026-08-30 | The Milwaukee Mile | 77.2 | `too_far_for_event_forecast` |
| Grand Prix of Monterey Race 1 | 2026-09-05 | WeatherTech Raceway Laguna Seca | 83.2 | `too_far_for_event_forecast` |
| Grand Prix of Monterey Race 2 | 2026-09-06 | WeatherTech Raceway Laguna Seca | 84.2 | `too_far_for_event_forecast` |

The weather code deliberately keeps missing NWS numeric measurements as `null`; an early normalization bug turned missing values into zero, which would have created fake precision for fields like gust, sea-level pressure, heat index, and precipitation.

The weather code also wraps NWS requests with timeouts and per-probe failure handling. If one observation, forecast, or alert leg fails, the route should return `sourceState: partial` with the failed probe recorded instead of collapsing into an API 500. `/api/weather/upcoming` uses per-track cache, in-flight request reuse, bounded concurrent track fetches, and a 12-second per-track deadline fallback so one client refresh does not issue repeated or serial NWS fan-out for every venue. Operator refreshes through `?refresh=1` or `?cache=0` force cache refresh but still use in-flight request reuse.

Missing NWS observation-station, hourly-forecast, or daily-forecast URLs are explicit failed probes. They should produce `sourceState: partial`, not a falsely complete `live` weather response with empty forecast arrays.

NWS HTTP success is not enough for weather readiness. JSON parse failures and schema-empty observation/hourly/daily payloads are failed probes, so `sourceState: live` requires parseable NWS JSON plus required observation properties and non-empty forecast periods for both hourly and daily forecast legs.

## Live Fields Currently Exposed By Timing

Current timing payload field discovery found:

- Core race state: `rank`, `liveRank`, `startPosition`, `status`, `comment`, `laps`, `diff`, `gap`, `liveGap`, `liveDiffAhead`, `liveDiffBehind`.
- Pace: `bestLapTime`, `bestLap`, `lastLapTime`, `BestSpeed`, `LastSpeed`, `AverageSpeed`, no-tow fields.
- Racecraft: `Passes`, `Passed`.
- Pit: `pitStops`, `lastPitLap`, `sincePitLap`, `onTrack`.
- Points: `runningDriverPoints`, `totalDriverPoints`, `totalEntrantPoints`.
- Candidate strategy/context: `Tire`, `OverTake_Remain`, `lapDistance`.

Current cold top-series sample has `lapDistance=0` for all rows, tire `P`, overtake remaining `0`, and no sector timing keys. These fields should be displayed only when live values are populated and pass session-specific freshness checks.

## Road America Sessions To Prove

From the current INDY NXT track activity feed:

| Event | Session | EventSessionID | Feed Start | Estimated Green | Networks |
| --- | --- | --- | --- | --- | --- |
| Road America Race 1 | Practice | `6869` | `2026-06-19 19:00:00` | `2026-06-19 19:00:00` | FS2, INDYCAR LIVE, SiriusXM, INDYCAR Radio Network |
| Road America Race 1 | Qualifying Race 1 Group 1 | `6870` | `2026-06-20 14:00:00` | `2026-06-20 14:00:00` | FS1, INDYCAR LIVE, SiriusXM, INDYCAR Radio Network |
| Road America Race 1 | Qualifying Race 1 Group 2 | `6871` | `2026-06-20 14:18:00` | `2026-06-20 14:18:00` | FS1, INDYCAR LIVE, SiriusXM, INDYCAR Radio Network |
| Road America Race 1 | Combined Qualifying | `6872` | `2026-06-20 14:30:00` | `2026-06-20 14:30:00` | none in current feed |
| Road America Race 1 | Race | `6762` | `2026-06-20 16:30:00` | `2026-06-20 16:36:00` | FS1, INDYCAR LIVE, SiriusXM, INDYCAR Radio Network |
| Road America Race 2 | Race | `6754` | `2026-06-21 16:00:00` | `2026-06-21 16:06:00` | FS1, INDYCAR LIVE, SiriusXM, INDYCAR Radio Network |

These timestamps are source strings without timezone offsets. Treat them as source timestamps until normalized against official schedule display and local venue time.

## Race-Day Data Acceptance Gates

BryceCast should not call Road America race-day live mode ready until all gates below pass during a live INDY NXT session:

1. `timing` updates at least every 5 seconds during green or yellow running.
2. A 1-second poll for the `timing` endpoint runs for at least 20 minutes with zero or negligible errors.
3. The active `timing` heartbeat is INDY NXT, not top-series, and Bryce is present as car `9` with `DriverID=2143` or exact `Bryce Aron` identity.
4. `runningDriverPoints`, `totalDriverPoints`, and `totalEntrantPoints` are either populated live for Bryce and competitors or explicitly marked unavailable.
5. The points projection card is reconciled against official timing/standings after the session.
6. `liveGap`, `liveDiffAhead`, and `liveDiffBehind` are inspected during active running and labeled correctly.
7. `lapDistance` is nonzero and moves during green before any live track-position visualization ships.
8. `Tire` and `OverTake_Remain` are non-empty and meaningful for INDY NXT before any tire/overtake UI ships.
9. Broadcast lag is measured in person or from stream: record whether Race Control is ahead of the visible broadcast and by roughly how many seconds.
10. The local archive captures enough samples to replay rank/gap changes, pass windows, status changes, and source health after the session.

## Commands

Current-source audit:

```bash
npm run audit:sources
```

Current Road America weather:

```bash
npm run weather:live
```

Weather readiness for all upcoming INDY NXT events:

```bash
npm run weather:live:upcoming
```

All discovered live/candidate feeds at 1-second cadence. The pressure-test fetch timeout defaults to 5 seconds and can be changed with `--timeout-ms=...`:

```bash
npm run audit:live:pressure
```

Primary BryceCast feeds at 1-second cadence for a longer live-session soak:

```bash
npm run audit:live:pressure:primary
```

Race archive capture at 1-second cadence:

```bash
npm run poll:race:watch -- --interval-ms=1000
```

Race archive capture with all discovered sources in the raw payload:

```bash
npm run poll:race:watch -- --interval-ms=1000 --all-sources
```

The race poller accepts the last repeated CLI argument, so the appended `--interval-ms=1000` overrides the package script default. Poller endpoint fetches use the same default 5-second timeout style as the source probes and pressure-test helper; one slow endpoint should become an error sample rather than blocking archive writes. Watch mode compensates for fetch/write elapsed time before sleeping, so the intended cadence is measured from poll start to poll start rather than fetch duration plus interval.

## Product Implications

The Road America app should be designed around three explicit live states:

| State | Trigger | UX Meaning |
| --- | --- | --- |
| `pre_session` | Schedule/trackactivity available, no Bryce live timing row yet | Show schedule, route, start grid if source-backed, career/track prep, weather, and source countdown. |
| `live_verified` | NXT timing heartbeat plus Bryce row present and fresh | Show live rank, gap ahead/behind, start delta, lap/flag, pace, pass/pit/status changes, and points projection. |
| `stale_or_wrong_series` | Timing feed exists but Bryce row absent or top-series active | Show stale label, last archived Bryce sample, source health, and next NXT session route. |

Do not design around a moving dot, live track map, sector dashboard, tire/overtake strategy panel, or pit prediction panel until the live-session gates above prove the fields are populated for INDY NXT.

Live timing is the gating source for the core race-day state. The NXT driver-profile feed enriches identity, team, radio, imagery, and points metadata, but a driver-profile timeout must not take down a valid Bryce live timing row or valid archived Bryce timing fallback. In that case the API returns fallback profile identity fields, leaves enrichment fields empty, and marks the profile source probe stale/error.

Config, schedule, and track-activity feeds follow the same enrichment rule for core live routes. They can improve the route card, track map, and current-session labeling, but they are not allowed to hold up a valid timing payload.

## Issues Found While Navigating

- `npm run audit:live:pressure -- --iterations=20` originally did not override the default because the script parser used the first argument value. The pressure-test parser now uses the last supplied value.
- The official leaderboard bundle exposes richer field labels than the current BryceCast compact timing endpoint did. `/api/timing` has been expanded to include running points, total points, live diff ahead/behind, lap distance, tire, overtake, and pit fields.
- An all-source poll can write a no-Bryce top-series sample as the newest archive row. The API fallback now searches recent archive rows for a real Bryce timing row instead of assuming the newest raw sample is Bryce-valid.
- The NTT prediction blob is exposed by the official leaderboard bundle, but the current public payload is only a stale 2024 heartbeat. It should stay candidate/unavailable until it wakes up during a live session and proves relevance to INDY NXT.
- `/api/sources` originally made the NTT prediction candidate look healthy from HTTP success alone. It now reports endpoint-level `readinessState`, NTT payload datetime/age, and candidate-unavailable status when the blob is stale.
- `/api/sources` also originally allowed the global timing endpoint to look app-available from HTTP success alone. It now inspects the timing heartbeat and Bryce row; no-Bryce global timing reports `wrong_session`.
- Autoreview found that the Bryce timing guard accepted too little evidence from the global timing feed. API readiness, race-poller archive capture, source audit, and pressure-test tooling now share one predicate from `scripts/live-source-endpoints.mjs`: an INDY NXT heartbeat plus car `9` and either Race Control `DriverID=2143` or exact Bryce Aron timing-row identity.
- Autoreview found the archived fallback SQLite prefilter was narrower than the shared Bryce predicate. It now scans candidates by either `DriverID=2143` or exact Bryce Aron name plus car `9`, then still verifies the parsed row through the shared predicate before using it.
- Autoreview found NWS HTTP-200 but unparsable/schema-empty weather payloads could still look live. Weather probes now fail parse errors and required-shape gaps before calculating `sourceState`.
- `/api/sources` also originally allowed the NXT driver profile feed to look app-available from HTTP success alone. It now verifies Bryce's profile row and radio metadata before reporting profile readiness.
- Current source JSON date strings for track activity and schedule lack explicit timezone offsets. UI should not silently convert them without a normalization rule.
- The global timing feed currently points to a top-series cold session. This is expected between INDY NXT windows and must remain a first-class UI state.
- Missing NWS numeric values originally normalized to `0` because `Number(null) === 0`. The live-weather normalizer now preserves missing values as `null`.
- The live race poller had the same JavaScript coercion risk for optional fields such as running points, lap distance, overtake, and pit context. Its numeric parser now preserves `null`, `undefined`, and empty strings as `null` before numeric parsing.
- The replay API had a sibling coercion risk because SQLite `NULL` values were normalized with `Number(value)`. Replay now uses the same null-preserving parser, so missing rank/pass/pit/speed values stay unavailable and derived replay metrics do not calculate from absent values.
- The race poller originally captured expanded live timing fields in JSON but did not persist them into `bryce_samples`. SQLite replay now stores and reads best-lap number, average speed, pit recency, tire/overtake, lap distance, live diff ahead/behind, running/total points, and radio metadata. Replay reads tolerate older SQLite archives by returning `null` for additive columns that are not present yet.
- Autoreview found that snapshot/timing routes still waited for non-critical Race Control enrichment feeds, then found the first cache design could hide later source failures behind older successful payloads. Core live routes now block only on timing, while driver profile, config, schedule, and track activity use cached/background enrichment that preserves the latest result, including explicit failures, so a slow supporting feed cannot break the 1-second race-day cadence or lie about source health.
- Autoreview found that weather subrequest failures could collapse the route into a 500, and that `/api/weather/upcoming` performed uncached multi-request fan-out on each client call. Weather requests now use bounded probe results, per-track cache, and in-flight request reuse; `npm run api:smoke` checks repeat-call cache reuse.
- Autoreview later found that a cold upcoming-weather refresh could still serialize NWS timeouts across venues. `/api/weather/upcoming` now fetches unique tracks with bounded concurrency and a per-track deadline fallback that returns an explicit error weather payload for a missed venue instead of hanging the full route.
- Autoreview found that valid live Bryce timing could still 502 if the NXT driver-profile feed timed out. The live snapshot now treats the driver profile as enrichment: timing can return with fallback identity fields and an explicit stale/error profile probe.
- Autoreview found the stale archive fallback still depended on profile enrichment. Archived Bryce timing fallback now uses the same fallback identity rule as live timing, so a profile outage cannot take down valid archived timing.
- Autoreview found the archived fallback could use archived profile fields while marking the current driver-profile feed as live. Archived profile fields may still render as fallback identity/enrichment, but the driver-profile source probe is now evaluated only against the current `drivers_nxt` response so profile/radio readiness cannot be claimed from archived data.
- Autoreview found that a successful NWS station-list response with zero stations could be labeled as fully live weather. Missing station/current-observation data is now recorded as a failed observation probe, so the weather response is partial/error instead of live.
- Autoreview found missing NWS forecast URLs could be skipped and still produce `sourceState: live`. Missing hourly or daily forecast URLs now become explicit failed probes, making the weather response partial.
- Autoreview also found that the stale archive fallback only scanned the latest 50 raw rows, which a 1-second wrong-series poll could evict in under a minute. The fallback now searches archived payloads containing Bryce's live timing `DriverID=2143`, verifies the parsed timing row, and preserves the selected archive row's original `checked_at` timestamp instead of labeling stale data as freshly checked.
- Expanded live-source probes originally had no upstream timeout. They now use a bounded 5-second timeout so one slow Race Control/reference/candidate endpoint becomes an error probe rather than a hung API route.
- `npm run audit:sources` now uses the same bounded 5-second timeout by default, with `--timeout-ms=...` available for operator checks.
- API proxy routes for Race Control/reference/candidate source JSON now use the same bounded 5-second upstream timeout, so smoke checks and local clients do not hang indefinitely on one slow proxied source.
- Autoreview found the pressure-test helper had the same no-timeout failure mode. `scripts/live-source-pressure-test.mjs` now has a default 5-second fetch timeout and records timed-out endpoints as failed samples.
- Autoreview found pressure-test candidate-field summaries still coerced `null` to zero. The pressure-test numeric parser now preserves `null`, `undefined`, and empty strings as unavailable.
- Autoreview found source proxy routes had no upstream timeout, and that `api:smoke` still required radio metadata even when the driver-profile feed is intentionally treated as enrichment. Proxy routes now time out after 5 seconds, and smoke validates the profile fallback contract when the driver-profile probe is stale/error.
- Autoreview found that `npm run poll:race:watch -- --interval-ms=1000` was ignored because `scripts/race-poller.mjs` read the first repeated argument, leaving the package default at 15 seconds. The poller now reads the last repeated argument, and a direct two-iteration smoke showed samples about 1.1 seconds apart.
- Autoreview found the race poller also lacked upstream timeouts. `scripts/race-poller.mjs` now has a default 5-second fetch timeout so one slow Race Control/reference/candidate endpoint does not block SQLite/JSONL archive writes.
- Autoreview found the race poller wrote timing fetch outages as stale wrong-session snapshots. Poller summaries now use `sourceState: error` when timing fetch fails or no timing heartbeat exists, reserving `stale` for successful no-Bryce/wrong-series timing payloads or explicit archive fallback.
- Autoreview found that watch mode waited the full interval after each fetch/write cycle. Watch mode now compensates for elapsed time so slow upstream calls degrade cadence explicitly instead of silently turning a 1-second target into `fetch duration + 1 second`.
- Autoreview found replay still coerced SQLite `NULL` live-sample fields into zero. Replay now shares the null-preserving numeric contract used by live timing and the poller.
