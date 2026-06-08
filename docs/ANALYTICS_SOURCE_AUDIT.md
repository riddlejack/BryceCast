# BryceCast Analytics Source Audit

Current audit timestamp: June 8, 2026.

This is the source-of-truth document for what BryceCast can actually power now that live #9 POV is out of scope. The product goal is the best Bryce-centric live analytics companion possible, but every surface must trace back to a verified source, a logged local archive, or a clearly labeled candidate.

## Bottom Line

BryceCast can already support a strong live timing and race-context analytics product. It can read official Race Control timing/scoring, NXT driver metadata, schedule/broadcast routing, track activity/session metadata, official INDY NXT results history, and a local SQLite/JSONL race archive.

BryceCast does not currently have a validated live GPS/car-coordinate feed for Bryce. The track map is a static reference image. Do not build a live moving-dot map unless an official nonzero `lapDistance` stream, Race Control websocket, or another licensed telemetry source is discovered and proven during a live INDY NXT session.

Weather is a high-value candidate feature but is not implemented in the current data stack. It should be added through an official weather source such as NWS using event coordinates, with timestamp and station/forecast metadata visible.

## Verified Live / Near-Live Sources

| Source | Endpoint / file | Status | Fields BryceCast can trust | Product uses |
| --- | --- | --- | --- | --- |
| Race Control timing/scoring | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Working, but can point at the active top-series session instead of INDY NXT between NXT windows. | Heartbeat, event/session IDs, flag, lap, total laps, track name/type/length, timing rows, rank, liveRank, start position, laps, status/comment, diff/gap/liveGap, last/best lap, best/last/average speed, pit stops, passes/passed, points fields. | Live leaderboard, Bryce focus metrics, gap/lap charts, pass delta, status alerts, source freshness, archive samples. |
| NXT driver feed | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Working. | Bryce identity, RC driver ID `2143`, car #9, team, car/headshot assets, hometown/residence/site, season stats, event radio frequency. | Driver identity guard, profile panel, car art, frequency metadata, season stat context. |
| Race Control config | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Working. | Static track map URL, generic ways-to-watch links, possible track-map config fields. Current known config has static map; live websocket fields have not been proven usable. | Reference track map, source routing, future telemetry discovery. |
| NXT schedule feed | `https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json` | Working. | Event schedule, race/session metadata, TV listings, broadcasts, spotter guide links, grids/results references depending on event payload. | Upcoming/current route cards, race-day checklist, broadcast/audio links, event context. |
| NXT track activity feed | `https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json` | Working. | Event/session records keyed by EventID/EventSessionID, broadcast networks, start/end/estimated green, session labels/types, imported result metadata. | Best current-session broadcast routing, session status, route fallback, event context. |
| Official INDY NXT results APIs | `https://www.indynxt.com/api/results/...` | Working through `scripts/ingest-history.mjs`. | Standings, driver-year details, event/session result rows, starts/finishes, points, statuses, best-lap rank derived from official speed rows, teammate rows. | Season analytics, track-type splits, qualifying-to-finish deltas, teammate benchmark, historical context. |
| Local race archive | `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl`, `public/data/live-snapshot.json` | Working first pass; current archive is tiny. | Timestamped source probes plus Bryce timing samples: rank, liveRank, laps, gap, liveGap, lap times, speeds, passes/passed, pit stops, status/comment. | Replay analytics, gap/rank trends, source-freshness overlays, post-race review. Needs full-session capture for real trend quality. |
| Local API service | `npm run serve:app`, `/api/*` | Working. | Normalized RaceSnapshot, session, Bryce, timing, sources, history, compact history, latest race log, replay analytics, audio/frequency state. | Production-style web/mobile data boundary and render QA target. |

## Current Verification Snapshot

`npm run audit:sources` on June 8, 2026 returned HTTP 200 for all five Race Control blob endpoints. The timing blob was live for `10th Annual Bommarito Automotive Group 500`, flag `GREEN`, lap `259/260`, with 25 timing rows and no Bryce row. This proves the source is live but also proves the app needs the Bryce-row guard because the global timing endpoint can be pointed at a non-NXT session.

The NXT driver feed returned 25 drivers and did include Bryce with `rc_driver_id: 2143`, Chip Ganassi Racing, radio frequency `452.7000`, and 131 points. The current `public/data/history-bryce.json` has eight 2026 rows through WWTR, all official session results, with Bryce P14 on 131 points.

The local SQLite archive currently has six WWTR race snapshots from June 7-8, 2026. It is useful as proof that the archive path works, but it is not enough for full race analytics because every current sample is a cold/post-race DNF state.

## Analytics We Can Build Now

These features are source-backed now:

- Live Bryce position, liveRank, start position, net place delta, status/comment, laps completed, lap/total lap context.
- Last lap, best lap, best lap number, best speed, last speed, average speed when present.
- Gap/diff/liveGap views, with clear labeling because Race Control gap fields are strings and may represent intervals or lap deficits.
- Passes, times passed, net racecraft delta, pit stops, last pit lap, laps since pit.
- Timing tower with Bryce highlight and surrounding competitors.
- Race alerts derived from timing row changes, flags, gaps, status/comment changes, pit changes, and source freshness.
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
- Weather/radar until a weather source is implemented and tied to event coordinates.

## High-Value Sources To Add Next

| Candidate | Why it matters | Acceptance rule |
| --- | --- | --- |
| NWS forecast/observations/alerts by track coordinates | Track temperature/weather context affects pace, cautions, and strategy; easy high-value analytics layer. | Show source station/office, observed/forecast timestamp, checked age, and event coordinates. |
| Official PDF/session reports | Lap charts, pit summaries, qualifying sheets, section reports, penalties, and official post-race facts can enrich replay/history. | Parser must cite report URL and extracted fields; no manual-only numbers in production screens. |
| Race Control track-map websocket or `lapDistance` field | Could enable real moving map or lap-progress strip. | Only ship if live INDY NXT data is nonzero, refreshes during green laps, maps to Bryce/driver ID, and matches timing lap progression. |
| Historical clips / delayed onboard provided by Bryce/team/rights holder | Adds context and personality without pretending live POV exists. | Must be explicitly delayed, permissioned, and linked to lap/session metadata. |
| Additional official timing fields found in payload spelunking | May unlock sectors, penalties, pit lane, on-track state, or richer deltas. | Add to schema only after inspecting live payloads and documenting field freshness/meaning. |

## Race-Day Data Procedure

1. Run `npm run serve:app`.
2. Run `npm run poll:race:watch -- --interval-ms=15000` before the session and leave it running through checkered.
3. Run `npm run audit:sources` at T-minus 30, green, mid-race, and post-race if anything looks stale.
4. Trust `/api/snapshot` only when Bryce is present in the timing feed and source state is live/cold for the intended INDY NXT session.
5. If the timing endpoint is live but Bryce is absent, treat it as a wrong-series or wrong-session state and use the latest archived NXT sample only with stale labeling.
6. After the race, run `npm run ingest:history` once official results publish, then compare official rows with the local archive.

## Design Implication

The redesigned BryceCast should feel like an analytics product, not a video substitute. The hero value should be Bryce timing, race state, deltas, trends, alerts, source freshness, and historical context. Any unsupported surface must either be removed or visibly labeled as unavailable/candidate.

## Long-Term Product Note

The final BryceCast should automatically ingest every new Bryce practice, qualifying, race, and official result for the rest of the season and beyond. The same categories collected for historical races should become recurring live/future data categories where sources allow it.

The app should eventually support a downloadable/mobile experience for friends and family, including schedule-aware push notifications, pre-session reminders with official viewing-route links, live Bryce analytics, major-moment alerts, and a lifetime stats playground powered by the career warehouse.
