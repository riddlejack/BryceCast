> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# BryceCast Readiness Brief

## Current Status

BryceCast has a working React/Vite prototype with five current modes: TV, Engineer, Phone, Sources, and Race Ops. Treat those modes as implementation context, not as the locked design for the next UI. A shared room-status strip now appears across all modes and is the canonical readiness contract for timing, session route, local archive, video boundary, and audio/frequency status. The app uses Race Control timing, driver, config, schedule, and track-activity feeds for live session context and session-specific route cards, writes Bryce season history from official INDY NXT results APIs, derives Engineer-mode track-type splits, qualifying-to-finish gains/losses, best-lap-rank signals, and CGR teammate benchmarks from that history payload, has a phone companion surface for compact season context, has a local race poller that persists Race Control, schedule, config, track activity, source freshness, and Bryce samples, has SQLite-backed Bryce replay analytics in Engineer mode, has an official INDYCAR LIVE catalog monitor for historical onboard metadata research, tracks audio/radio state separately, and has a local Node API service for production-style serving.

The live data lane now has a centralized endpoint catalog, 1-second pressure-test tooling, source probes for all discovered public/candidate feeds, and a separate NWS live-weather adapter for Road America plus all remaining 2026 INDY NXT venues. Use `docs/archive/audits/LIVE_DATA_READINESS_AUDIT.md` for the current live-source audit, pressure-test results, weather contract, Road America acceptance gates, and issues found.

The active product focus is now analytics. `docs/archive/audits/ANALYTICS_SOURCE_AUDIT.md` is the detailed truth table for what live, archived, and historical analytics are source-backed.

Confidence: high for endpoint connectivity, driver profile data, official historical rows published in `EventsSessionDetails`, and NWS current-observation/forecast API access. Medium for current-race history before official results publish, because that row is provisional timing data. Live Bryce onboard is unavailable for this product per Bryce and should not be represented as a pending readiness blocker. Full live race-day readiness remains unproven until a live INDY NXT Road America session verifies feed cadence, Bryce row presence, points fields, and broadcast lag.

Production bar: every active surface should be live, functional, source-backed, and polished. Seed data, decorative maps, stale route assumptions, fake radio activity, and placeholder analytics should fail race-day readiness unless they are explicitly labeled as demo, static-cache, stale, cold, or unavailable. Live POV is out of scope. Isolated team radio is frequency-only until a legal, reliable route is proven.

## Confirmed Source Matrix

| Area | Source | Status | Evidence |
| --- | --- | --- | --- |
| Live timing | `https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` | Working, but global | Exposes heartbeat, flag, lap, timing rows, and Bryce #9 when the active feed is an INDY NXT Bryce session. Between NXT windows it can point to top-series timing with no Bryce row and must be treated as wrong-session. |
| Driver profile | `https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json` | Working | Exposes Bryce profile, assets, CGR team, and radio `452.7000`. |
| Track/config | `https://indycar.blob.core.windows.net/racecontrol/tsconfig.json` | Working | Exposes track map and official watch links. |
| Schedule/activity | `schedulefeed_nxt.json`, `trackactivityleaderboardfeed_nxt.json` | Working | Resolves current-session video/audio route from `EventID` and `EventSessionID`; WWTR race maps to FS1 plus INDYCAR Radio/SiriusXM and INDYCAR LIVE delay-risk. |
| Live source catalog | `scripts/live-source-endpoints.mjs` | Working | Centralizes primary Race Control feeds, top-series wrong-series guard feeds, and the NTT prediction candidate path for API, poller, source audit, and pressure-test tooling. |
| Live source pressure tests | `npm run audit:live:pressure`, `npm run audit:live:pressure:primary` | Working cold/post-session | June 8 tests sustained 1-second polling with zero errors: 270 all-source requests and 300 primary-feed requests. A June 13 quick primary check also returned 15 requests, 0 errors. Green-flag INDY NXT proof is still required. |
| Live weather | NWS API through `scripts/live-weather-service.mjs`, `/api/weather/live`, `/api/weather/upcoming` | Working | Road America and all remaining 2026 INDY NXT venues can return current observation, hourly forecast, daily forecast, alerts, station/grid metadata, source state, cache state, probe status, and forecast-readiness labels. As of June 13, Road America Race 1 and Race 2 are inside the forecast window; later venues remain unavailable for event-specific forecasts until their windows open. NWS leg failures should degrade to `partial`. |
| History | `/api/results/YearPointSummary`, `/api/results/EventsSessionDetails`, `/api/results/DriverYearDetails`, `/api/history/bryce?compact=1` | Working | Writes `public/data/history-bryce.json`; powers season pulse, track-type splits, gain/loss moments, best-lap-rank signal, source confidence, and CGR teammate benchmark. The API now exposes schema metadata plus a compact iPhone/mobile-ready analytics projection. Current unpublished race is marked provisional. |
| Local logging | `npm run poll:race`, `npm run poll:race:watch` | Working | Writes `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl`, and `public/data/live-snapshot.json` with per-endpoint freshness labels. `--all-sources` captures reference/candidate feeds too, while API fallback guards against top-series no-Bryce samples. |
| Local API service | `npm run serve:api`, `npm run serve:app`, `npm run api:smoke` | Working | Serves normalized `/api/*` routes, proof persistence, Race Control proxying, live weather, latest local logs, source freshness, history, onboard catalog, replay analytics, and built React assets. |
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
3. Run `npm run poll:race:watch -- --interval-ms=1000` in a second terminal to preserve the session.
4. AirPlay or HDMI the MacBook if the room wants BryceCast on the TV.
5. Run `npm run audit:live:pressure:primary` before or during a live session when source reliability needs proof.
6. Run `npm run weather:live` for Road America weather and `npm run weather:live:upcoming` for the remaining 2026 INDY NXT event-weather readiness check.
7. Check the room-status strip in any mode. If it is red, fix the named live-data blocker before room use. If it is amber, keep the listed stale/cold/access-gated limits visible while the room watches.
8. Use Sources mode for the detailed checklist. If Race Control, Session Route, Data Capture, live weather, Staylive Onboards Monitor, and Audio / Radio Gate are fresh, keep TV, Engineer, or Phone mode active.
9. Use Phone/mobile mode for compact Bryce context and room checks from an iPhone or MacBook.
10. Log audio/frequency state separately: official race audio if active, published frequency source/freshness, and any future proven receiver or app route.

## Known Gaps

- Live Bryce onboard is unavailable for BryceCast per Bryce. It is no longer an access-gated active requirement.
- INDYCAR LIVE public catalog metadata currently exposes an `Onboards` channel, but current entries are top-series driver onboards, not Bryce/INDY NXT.
- No actual video embedding, by design.
- Track map is a reference image only; no live car-coordinate feed has been mapped. The public timing sample includes `lapDistance`, but current cold samples are zero. It must stay labeled as reference-only until official live position data is nonzero and verified during green INDY NXT running.
- Live weather is implemented through NWS for observations, forecasts, and alerts. Do not show official series weather, track temperature, radar, or event-specific long-range forecasts unless those exact sources exist. For future events outside the forecast horizon, show forecast readiness rather than a forecast.
- The global Race Control timing endpoint can be live for a non-NXT session. If Bryce is absent from timing rows, the app must treat timing as wrong-series/wrong-session and fall back only with stale labeling.
- The NTT prediction blob is publicly exposed but currently only a stale 2024 heartbeat. Keep pit prediction unavailable unless it wakes up during a live session and proves INDY NXT relevance.
- Bryce-specific team radio is not reliable without a scanner/receiver path. Official race audio and frequency metadata are modeled separately.
- Local API service is first-pass complete and now has history schema metadata, live source probes, live weather, and weather-upcoming routes; it still needs green-flag Road America soak testing and LAN/mobile smoke coverage.
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
5. Keep hardening weather/source caching and rate limits before production deployment, including external-cache options if this moves beyond local use.
6. Use Sources mode to record official race audio and frequency-source checks.
7. Add a window-layout helper for broadcast plus BryceCast.
8. Harden Phone/mobile web mode for LAN/mobile use: QR join route, local-host instructions for friends on the same network, compact season analytics from `/api/history/bryce?compact=1`, and weather/source status from the API.
