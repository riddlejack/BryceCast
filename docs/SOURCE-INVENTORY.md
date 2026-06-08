# BryceCast Source Inventory

## Principle

Build around verified sources. Official Race Control and official results are the timing truth. Weather, broadcast routes, official audio, frequency metadata, and social/news cues are overlays. Live #9 onboard is unavailable for the active product, and isolated Bryce team radio is frequency-only until a legal reliable listening route is proven. Every active BryceCast surface should be live, source-backed, and production-ready, with no placeholders presented as operational data.

For the detailed analytics truth table, current audit output, and design implications, use `docs/ANALYTICS_SOURCE_AUDIT.md`.

## Confirmed Accessible Now

| Source | URL or path | What it gives | Use |
| --- | --- | --- | --- |
| Live timing/scoring | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Heartbeat, flag, lap, rank, gaps, lap times, speed, pit stops, passes, Bryce status/comment. | TV, Engineer, alerts. |
| NXT drivers | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Bryce profile, car assets, team, radio frequency, stats. | Driver panel, radio tile. |
| Race Control config | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Static track map, official watch links, track-map websocket config when enabled. | Source routing, track map. |
| NXT schedule | `https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json` | Event schedule, broadcasts, spotter guide, starting grid, pit assignments, previous results, track assets. | Fallback session route, Race Ops, pre-race cards. |
| NXT track activity/results | `https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json` | Session metadata, current session networks, imported results across practice, qualifying, race. No car coordinates. | Primary current-session route, Engineer history, session status. |
| Official results APIs | `https://www.indynxt.com/api/results/...` | Standings, driver-year results, session details, official post-session records. | Season analytics. |
| Local race poller | `scripts/race-poller.mjs` | SQLite, JSONL, and latest public snapshot for Race Control, schedule, track activity, config, source freshness, and Bryce samples. | Season archive and race-day source proof. |
| Local API service | `scripts/api-server.mjs`, `/api/*` | Normalized BryceCast snapshot, session, Bryce row, timing tower, source probes with freshness metadata, local logs, history, onboard catalog, replay analytics, and proof persistence. | Web, iPhone/mobile web, production-style local serving. |
| INDYCAR LIVE catalog monitor | `scripts/probe-onboards.mjs`, `https://api.staylive.tv/platforms/by-domain/www.indycarlive.com`, `https://api.staylive.tv/livestreams/feed?limit=100&page=1` | Official INDYCAR LIVE channel metadata for `Onboards` and `Indy NXT`. Current probe found top-series in-car entries and INDY NXT session entries, with no strict Bryce/Aron match. | Historical research/audit only. Bryce confirmed no usable live POV for BryceCast. |
| INDYCAR Radio | `https://www.indycar.com/Radio`, Mixlr/TuneIn/SiriusXM paths | Official race call and session context. | Audio baseline when Bryce-specific radio is absent. |
| INDYCAR App radio | INDYCAR App | Official sources say fans can listen to driver radio streams free during each race. #9 selection is not currently proven. | Candidate only; official race-call audio plus frequency metadata are the dependable baseline. |
## High-Value Candidate Sources

| Source | Status | Next step |
| --- | --- | --- |
| Weather via NWS or another official weather source | Not implemented. Weather is a high-value target, not a confirmed BryceCast source. | Add adapter using event coordinates; show observation/forecast timestamp, checked age, station/office, and alert source. |
| Live #9 onboard in INDYCAR App | Bryce has confirmed no live POV feed is available for BryceCast to include. | Out of active scope. |
| Live #9 onboard through INDYCAR/FOX/CGR/production | Current product has no access. | Out of active scope unless a rights holder explicitly offers a feed later. |
| INDYCAR LIVE Onboards catalog | Official metadata exposes an `Onboards` channel. Current checked entries are top-series in-car objects, with INDY NXT appearing as session-level objects only. | Optional audit only, not a product dependency. |
| Track-map telemetry websocket | The leaderboard bundle contains telemetry/map logic, but current `tsconfig.track_map.wss_uri` and `wss_key` are blank. | Poll config during live green sessions; animate only if official values appear. |
| Session PDF reports and official statuses | Available through official result metadata, EventsSessionDetails status fields, and `imscdn.com` URLs. INDY NXT result statuses now add official terminal-status incidents for contact, mechanical, and DNS outcomes; Race Lap Chart PDFs add complete and clean partial position-by-lap samples with missing car-lap or official result/chart conflict diagnostics where needed; Event Summary PDFs add race-stat metrics plus official most-improved racecraft rows; Leader Lap Summary PDFs add leader timing, margin, and flag-state metrics; Top Section Times PDFs add practice/qualifying/race field-wide section-rank timing metrics; Section Results PDFs add lap-by-lap section time/speed metrics; Results PDFs add official penalty/decision-summary rows and caution-summary causal incident rows. | Add parsers for pit summaries, deeper race-control detail, and lap-specific incident timing beyond official caution-summary rows. |
| Published #9 RF frequency | Current WWTR frequency is `452.7000`; Bryce says the exact team frequency may be obtainable, but remote audio requires official app or a legal receiver near the venue. | Display as event-scoped metadata. Do not assume it is listenable without scanner/receiver access. |
| Official social/news | Useful for incident notes, penalties, race narratives, sponsor/team media. | Add as operator cue layer only. |

## Unresolved Access Gaps

1. Live #9 POV during the same live race window as the official broadcast.
   - Requirement status: unavailable and out of active scope.
   - Bryce confirmed there is no live POV feed available for BryceCast to include during races.
   - Delayed AiM/SmartyCam, highlights, and normal broadcast cutaways remain possible future replay inputs only if rights/permission are granted.

2. Live GPS-grade car coordinates.
   - Current public timing has `lapDistance`, but WWTR cold sample returns `0`.
   - Current config has track-map websocket fields, but `wss_uri` and `wss_key` are blank.
   - Use static map until live official position data appears.

3. Isolated Bryce team radio without hardware.
   - Requirement status: not reliable for active product.
   - Official race-call audio is the usable room baseline.
   - Published or Bryce-provided frequency is metadata, not a no-hardware stream.
   - Public SDR/scanner networks are weak unless a legal UHF receiver exists near the track and is allowed to tune the event frequency.

4. Route timing and upcoming-session switching.
   - Current-session routing now consumes track activity and schedule feeds.
   - Future work: timezone-polished display, preview cards for upcoming Road America sessions, and friend-facing route instructions for FS1/FS2/FOX One changes.

## Build Order

1. Soak-test the local API service, source freshness scoring, and replay analytics through a full live session.
2. Replace live POV verification surfaces with a concise unavailable-state and remove POV as a readiness blocker.
3. Keep audio/frequency status first-class: official race audio, frequency metadata, permission bucket, and evidence/source freshness.
4. Add timezone-aware upcoming-session route previews.
5. Add weather and alert context from NWS or another official weather source.
6. Add PDF/session-report ingestion.
7. Add track animation only when `lapDistance` or official websocket data is live and nonzero.
