> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# BryceCast Analytics Source Audit

Current audit timestamp: June 13, 2026.

This is the source-of-truth document for what BryceCast can actually power now that live #9 POV is out of scope. The product goal is the best Bryce-centric live analytics companion possible, but every surface must trace back to a verified source, a logged local archive, or a clearly labeled candidate.

## Bottom Line

BryceCast can already support a strong live timing and race-context analytics product. It can read official Race Control timing/scoring, NXT driver metadata, schedule/broadcast routing, track activity/session metadata, official INDY NXT results history, and a local SQLite/JSONL race archive.

BryceCast does not currently have a validated live GPS/car-coordinate feed for Bryce. The track map is a static reference image. Do not build a live moving-dot map unless an official nonzero `lapDistance` stream, Race Control websocket, or another licensed telemetry source is discovered and proven during a live INDY NXT session.

Historical INDY NXT modeled ambient weather is implemented for the exact-window career slice through Open-Meteo Historical Weather API, with representative NOAA/NCEI GHCNh station cross-checks. Live race-weekend weather is now implemented separately through the NWS API using track coordinates from the canonical career dataset. It can power current observations, hourly forecast, daily forecast, alerts, station/grid metadata, source state, and forecast-readiness labels. It does not provide official series weather, track temperature, radar, or trustworthy long-range event-specific forecasts outside the NWS forecast window.

## Verified Live / Near-Live Sources

| Source | Endpoint / file | Status | Fields BryceCast can trust | Product uses |
| --- | --- | --- | --- | --- |
| Race Control timing/scoring | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Working, but can point at the active top-series session instead of INDY NXT between NXT windows. | Heartbeat, event/session IDs, flag, lap, total laps, track name/type/length, timing rows, rank, liveRank, start position, laps, status/comment, diff/gap/liveGap, last/best lap, best/last/average speed, pit stops, passes/passed, points fields. | Live leaderboard, Bryce focus metrics, gap/lap charts, pass delta, status alerts, source freshness, archive samples. |
| NXT driver feed | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Working. | Bryce identity, RC driver ID `2143`, car #9, team, car/headshot assets, hometown/residence/site, season stats, event radio frequency. | Driver identity guard, profile panel, car art, frequency metadata, season stat context. |
| Race Control config | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Working. | Static track map URL, generic ways-to-watch links, possible track-map config fields. Current known config has static map; live websocket fields have not been proven usable. | Reference track map, source routing, future telemetry discovery. |
| NXT schedule feed | `https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json` | Working. | Event schedule, race/session metadata, TV listings, broadcasts, spotter guide links, grids/results references depending on event payload. | Upcoming/current route cards, race-day checklist, broadcast/audio links, event context. |
| NXT track activity feed | `https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json` | Working. | Event/session records keyed by EventID/EventSessionID, broadcast networks, start/end/estimated green, session labels/types, imported result metadata. | Best current-session broadcast routing, session status, route fallback, event context. |
| Top-series reference feeds | `driversfeed.json`, `schedulefeed.json`, `trackactivityleaderboardfeed.json` | Working as reference/guard feeds. | Top-series driver/schedule/activity data. | Wrong-series guard and source diagnostics only. Do not mix into Bryce NXT timing or history. |
| NTT prediction candidate | `https://indycar.blob.core.windows.net/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json` | Accessible but stale. | Current public payload is a single 2024 heartbeat row. | Candidate/unavailable for pit prediction unless it wakes up during live INDY NXT running and proves relevant fields. |
| Live weather | NWS API through `scripts/live-weather-service.mjs`, `/api/weather/live`, `/api/weather/upcoming` | Working. | Current observation, hourly forecast, daily forecast, active alerts, station/grid metadata, cache state, probe status, and forecast-readiness labels for remaining 2026 INDY NXT venues. | Race-weekend preparation and live weather context. Not official series weather, radar, track temperature, or long-range event forecast. Degrade to partial on individual NWS leg failures. |
| Official INDY NXT results APIs | `https://www.indynxt.com/api/results/...` | Working through `scripts/ingest-history.mjs`. | Standings, driver-year details, event/session result rows, starts/finishes, points, statuses, best-lap rank derived from official speed rows, teammate rows. | Season analytics, track-type splits, qualifying-to-finish deltas, teammate benchmark, historical context. |
| Local race archive | `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl`, `public/data/live-snapshot.json` | Working first pass; current archive is tiny. | Timestamped source probes plus Bryce timing samples: rank, liveRank, laps, gap, liveGap, lap times, speeds, passes/passed, pit stops, status/comment. | Replay analytics, gap/rank trends, source-freshness overlays, post-race review. Needs full-session capture for real trend quality. |
| Local API service | `npm run serve:app`, `/api/*` | Working. | Normalized RaceSnapshot, session, Bryce, timing, sources, live weather, upcoming-event weather readiness, history, compact history, latest race log, replay analytics, audio/frequency state. | Production-style web/mobile data boundary and render QA target. |

## Current Verification Snapshot

`npm run audit:sources` on June 13, 2026 returned HTTP 200 for all nine discovered live/candidate/reference endpoints. The timing blob currently points to the top-series `10th Annual Bommarito Automotive Group 500`, flag `COLD`, lap `260/260`, with 25 timing rows and no Bryce row. This proves the source is accessible and proves the app needs the Bryce-row guard because the global timing endpoint can be pointed at a non-NXT session.

The NXT driver feed returned 25 drivers and did include Bryce with `rc_driver_id: 2143`, Chip Ganassi Racing, radio frequency `452.7000`, and 131 points. The current `public/data/history-bryce.json` has eight 2026 rows through WWTR, all official session results, with Bryce P14 on 131 points.

The local SQLite archive currently has six Bryce-valid INDY NXT WWTR `bryce_samples` from June 7-8, 2026, plus newer stale top-series race snapshots that are useful only as wrong-session guard evidence. The Bryce-valid archive is useful as proof that the archive path works, but it is not enough for full race analytics because every current Bryce sample is a cold/post-race DNF state.

Live-source pressure tests sustained 1-second polling from this machine:

| Scope | Requests | Errors | Highest p95 latency | Caveat |
| --- | ---: | ---: | ---: | --- |
| All discovered endpoints, June 8 | 270 | 0 | 75 ms | Cold/post-session proof only. |
| Primary BryceCast feeds, June 8 | 300 | 0 | 51 ms | Cold/post-session proof only. |
| Primary BryceCast feeds, June 13 quick checks | 15 per run | 0 | roughly 160-180 ms | Still pointed at top-series WWTR; verifies reachability and wrong-series guard only. |

Live weather on June 13, 2026 returned Road America current conditions through NWS station `KSBM` and loaded all nine remaining 2026 INDY NXT events. In the final verification sweep, Road America Race 1 and Race 2 were `forecast_window_open`; Mid-Ohio, Nashville, Portland, Milwaukee, and Monterey remained `too_far_for_event_forecast` because those weekends were outside the useful NWS forecast window. Current venue observations remain available.

## Analytics We Can Build Now

These features are source-backed now:

- Live Bryce position, liveRank, start position, net place delta, status/comment, laps completed, lap/total lap context.
- Last lap, best lap, best lap number, best speed, last speed, average speed when present.
- Gap/diff/liveGap views, with clear labeling because Race Control gap fields are strings and may represent intervals or lap deficits.
- Passes, times passed, net racecraft delta, pit stops, last pit lap, laps since pit.
- Timing tower with Bryce highlight and surrounding competitors.
- Race alerts derived from timing row changes, flags, gaps, status/comment changes, pit changes, and source freshness.
- Current race-weekend weather context from NWS: observation timestamp, condition, ambient temperature, dew point, humidity, pressure, wind speed/gust/direction, hourly forecast, daily forecast, alerts, station/grid metadata, and forecast-readiness labels.
- Full-session replay analytics after `npm run poll:race:watch` captures a live session: rank trend, gap trend, pass-threat windows, pit/status events, source-health overlays.
- Season and track-type analytics: average start/finish, qualifying-to-finish delta, best/worst gain/loss, best-lap-rank signal, top-10 count, points, teammate benchmark.
- Session route and broadcast/audio launcher using schedule and track-activity feeds.

## Not Proven / Do Not Fake

These features are not currently source-backed:

- Live moving track map / GPS dot for Bryce.
- Sector-by-sector mini-sector timing unless a sector field is later found in a live payload or official PDF/session report.
- Tire compound or fuel state unless Race Control fields are live and meaningful for the specific session. Current tire/fuel UI should be treated skeptically unless backed by a current field.
- Team radio audio stream. Frequency metadata is not live audio.
- Live POV or onboard video.
- Predictive strategy, undercut windows, fuel windows, or tire degradation models unless they are explicitly derived from captured timing history and labeled as estimates.
- Official series weather, live track temperature, live radar, and long-range event-specific weather forecasts. NWS live weather is available, but unsupported weather fields must remain unavailable.

## High-Value Sources To Add Next

| Candidate | Why it matters | Acceptance rule |
| --- | --- | --- |
| Production weather cache backend | The local in-process cache works for the current local API server, but a deployed/multi-process service would need shared cache semantics. | Preserve per-track TTL, in-flight request reuse, probe/source-state metadata, and explicit refresh controls. |
| Official PDF/session reports | Lap charts, pit summaries, qualifying sheets, section reports, penalties, and official post-race facts can enrich replay/history. | Parser must cite report URL and extracted fields; no manual-only numbers in production screens. |
| Race Control track-map websocket or `lapDistance` field | Could enable real moving map or lap-progress strip. | Only ship if live INDY NXT data is nonzero, refreshes during green laps, maps to Bryce/driver ID, and matches timing lap progression. |
| Historical clips / delayed onboard provided by Bryce/team/rights holder | Adds context and personality without pretending live POV exists. | Must be explicitly delayed, permissioned, and linked to lap/session metadata. |
| Additional official timing fields found in payload spelunking | May unlock sectors, penalties, pit lane, on-track state, or richer deltas. | Add to schema only after inspecting live payloads and documenting field freshness/meaning. |

## Race-Day Data Procedure

1. Run `npm run serve:app`.
2. Run `npm run weather:live` and `npm run weather:live:upcoming` before the session to verify venue weather and forecast-readiness state.
3. Run `npm run audit:live:pressure:primary` to prove current primary-feed reliability when needed.
4. Run `npm run poll:race:watch -- --interval-ms=1000` before the session and leave it running through checkered.
5. Run `npm run audit:sources` at T-minus 30, green, mid-race, and post-race if anything looks stale.
6. Trust `/api/snapshot` only when Bryce is present in the timing feed and source state is live/cold for the intended INDY NXT session.
7. If the timing endpoint is live but Bryce is absent, treat it as a wrong-series or wrong-session state and use the latest archived NXT sample only with stale labeling.
8. After the race, run `npm run ingest:history` once official results publish, then compare official rows with the local archive.

## Design Implication

The redesigned BryceCast should feel like an analytics product, not a video substitute. The hero value should be Bryce timing, race state, deltas, trends, alerts, source freshness, and historical context. Any unsupported surface must either be removed or visibly labeled as unavailable/candidate.

## Long-Term Product Note

The final BryceCast should automatically ingest every new Bryce practice, qualifying, race, and official result for the rest of the season and beyond. The same categories collected for historical races should become recurring live/future data categories where sources allow it.

The app should eventually support a downloadable/mobile experience for friends and family, including schedule-aware push notifications, pre-session reminders with official viewing-route links, live Bryce analytics, major-moment alerts, and a lifetime stats playground powered by the career warehouse.
