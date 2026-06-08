# BryceCast Readiness Brief

## Current Status

BryceCast has a working React/Vite prototype with five modes: TV, Engineer, Phone, Sources, and Race Ops. A shared room-status strip now appears across all modes and is the canonical readiness contract for timing, session route, local archive, video boundary, and audio/frequency status. The app uses Race Control timing, driver, config, schedule, and track-activity feeds for live session context and session-specific route cards, writes Bryce season history from official INDY NXT results APIs, derives Engineer-mode track-type splits, qualifying-to-finish gains/losses, best-lap-rank signals, and CGR teammate benchmarks from that history payload, has a phone companion surface for compact season context, has a local race poller that persists Race Control, schedule, config, track activity, source freshness, and Bryce samples, has SQLite-backed Bryce replay analytics in Engineer mode, has an official INDYCAR LIVE catalog monitor for historical onboard metadata research, tracks audio/radio state separately, and now has a local Node API service for production-style serving.

The active product focus is now analytics. `docs/ANALYTICS_SOURCE_AUDIT.md` is the detailed truth table for what live, archived, and historical analytics are source-backed.

Confidence: high for timing connectivity and driver profile data. High for official historical rows that are published in `EventsSessionDetails`. Medium for current-race history before official results publish, because that row is provisional timing data. Live Bryce onboard is unavailable for this product per Bryce and should not be represented as a pending readiness blocker.

Production bar: every active surface should be live, functional, source-backed, and polished. Seed data, decorative maps, stale route assumptions, fake radio activity, and placeholder analytics should fail race-day readiness unless they are explicitly labeled as demo, static-cache, stale, cold, or unavailable. Live POV is out of scope. Isolated team radio is frequency-only until a legal, reliable route is proven.

## Confirmed Source Matrix

| Area | Source | Status | Evidence |
| --- | --- | --- | --- |
| Live timing | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Working | Exposes heartbeat, flag, lap, rows, Bryce #9 row. |
| Driver profile | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Working | Exposes Bryce profile, assets, CGR team, and radio `452.7000`. |
| Track/config | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Working | Exposes track map and official watch links. |
| Schedule/activity | `schedulefeed_nxt.json`, `trackactivityleaderboardfeed_nxt.json` | Working | Resolves current-session video/audio route from `EventID` and `EventSessionID`; WWTR race maps to FS1 plus INDYCAR Radio/SiriusXM and INDYCAR LIVE delay-risk. |
| History | `/api/results/YearPointSummary`, `/api/results/EventsSessionDetails`, `/api/results/DriverYearDetails`, `/api/history/bryce?compact=1` | Working | Writes `public/data/history-bryce.json`; powers season pulse, track-type splits, gain/loss moments, best-lap-rank signal, source confidence, and CGR teammate benchmark. The API now exposes schema metadata plus a compact iPhone/mobile-ready analytics projection. Current unpublished race is marked provisional. |
| Local logging | `npm run poll:race`, `npm run poll:race:watch` | Working | Writes `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl`, and `public/data/live-snapshot.json` with per-endpoint freshness labels. |
| Local API service | `npm run serve:api`, `npm run serve:app`, `npm run api:smoke` | Working | Serves normalized `/api/*` routes, proof persistence, Race Control proxying, latest local logs, source freshness, history, onboard catalog, replay analytics, and built React assets. |
| Replay analytics | `/api/replay/bryce`, Engineer mode | First pass working | Current archive has 6 WWTR samples and is correctly labeled `tiny`; full trend quality needs `npm run poll:race:watch` through a live session. |
| Onboard catalog monitor | `npm run probe:pov`, `npm run probe:pov:watch` | Research only | Checks official INDYCAR LIVE Staylive `Onboards` and `Indy NXT` catalog metadata for strict Bryce/Aron matches; current findings show top-series onboards only, no Bryce object. Not part of active readiness because Bryce confirmed no usable live POV. |
| Broadcast | Hulu Live TV, FOX Sports/FOX One, Xfinity | External | Keep video in authorized app/browser windows. |
| Onboard | Live #9 POV | Unavailable | Bryce confirmed there is no live POV feed available for BryceCast to include. Keep out of active UI except unavailable-state disclosure. |
| Radio | INDYCAR app, official radio, published frequency | Frequency-only for Bryce | Official race-call audio is the reliable baseline; Bryce-specific team frequency may be available but is not a reliable no-scanner stream. |
| Apple TV/tvOS | Native companion app | Deferred | Do not prioritize until integrated authorized video exists. Active target is web on Mac/PC plus iPhone/mobile web. |

## Architecture

V1 uses a browser app because it is the fastest path to a polished MacBook and TV-watch-party experience. Vite remains useful for development, and the Node API service now owns the production-style local route for Race Control fetches, normalized snapshots, local persistence, and proof writes.

Recommended next architecture:

1. Keep the current React UI.
2. Keep using the local Node poller for polling, caching, source logs, and SQLite persistence.
3. Use `scripts/api-server.mjs` as the local API service so built/preview deployments do not depend on Vite proxy behavior.
4. Add historical ingestion from official PDFs and richer session reports.
5. Add optional local-only scene support for friends who want a composed personal setup without recording, rebroadcasting, capturing, or redistributing licensed video.
6. Defer tvOS and Apple TV work until an authorized integrated video path exists; focus on web/PWA desktop and iPhone.

## Best Race-Day Setup

1. TV or MacBook opens the authorized broadcast through Hulu Live TV, FOX Sports/FOX One, or Xfinity.
2. MacBook runs BryceCast from the local API service at `http://localhost:8787`.
3. Run `npm run poll:race:watch` in a second terminal to preserve the session.
4. AirPlay or HDMI the MacBook if the room wants BryceCast on the TV.
6. Check the room-status strip in any mode. If it is red, fix the named live-data blocker before room use. If it is amber, keep the listed stale/cold/access-gated limits visible while the room watches.
7. Use Sources mode for the detailed checklist. If Race Control, Session Route, Data Capture, Staylive Onboards Monitor, and Audio / Radio Gate are fresh, keep TV, Engineer, or Phone mode active.
8. Use Phone/mobile mode for compact Bryce context and room checks from an iPhone or MacBook.
9. Log audio/frequency state separately: official race audio if active, published frequency source/freshness, and any future proven receiver or app route.

## Known Gaps

- Live Bryce onboard is unavailable for BryceCast per Bryce. It is no longer an access-gated active requirement.
- INDYCAR LIVE public catalog metadata currently exposes an `Onboards` channel, but current entries are top-series driver onboards, not Bryce/INDY NXT.
- No actual video embedding, by design.
- Track map is a reference image only; no live car-coordinate feed has been mapped. It must stay labeled as reference-only until official live position data is available.
- Weather is not implemented yet. Do not show live weather, track temperature, radar, or forecast cards until a source adapter is added and verified.
- The global Race Control timing endpoint can be live for a non-NXT session. If Bryce is absent from timing rows, the app must treat timing as wrong-series/wrong-session and fall back only with stale labeling.
- Bryce-specific team radio is not reliable without a scanner/receiver path. Official race audio and frequency metadata are modeled separately.
- Local API service is first-pass complete and now has history schema metadata; it still needs long-session soak testing and LAN/mobile smoke coverage.
- Replay analytics are archive-backed, but current local samples are a tiny repeated cold/post-race slice. A full live session archive is needed before trend quality can be trusted.
- Season analytics are source-backed from official INDY NXT history plus any provisional current timing row, but they depend on the official results API publishing session details after each race.
- Session route times are rendered from Race Control feed strings; timezone polishing and upcoming-session switching are future work.
- Race-day automation does not yet arrange windows or sync delays automatically.
- The room-status strip is implemented and tested in API mode; direct Vite development mode can still have weaker source-freshness context and should not be treated as the race-day path.
- The UI still needs redesign around the new product reality: no POV promise, no scanner-dependent radio assumption, desktop web plus iPhone/mobile web as primary clients.

## Next Build Steps

1. Soak-test `npm run serve:app` through a full live session and keep API-mode render QA in the verification loop.
2. Extend replay analytics after a full live session: stint windows, gap swings, pass-threat intervals, and source-freshness overlays.
3. Add timezone-aware upcoming-session switching and route preview cards for future race weekends.
4. Redesign the product surfaces around the no-POV/no-scanner baseline.
5. Add a weather adapter only after documenting event coordinates and source timestamps.
6. Use Sources mode to record official race audio and frequency-source checks.
7. Add a window-layout helper for broadcast plus BryceCast.
8. Harden Phone/mobile web mode for LAN/mobile use: QR join route, local-host instructions for friends on the same network, and compact season analytics from `/api/history/bryce?compact=1`.
