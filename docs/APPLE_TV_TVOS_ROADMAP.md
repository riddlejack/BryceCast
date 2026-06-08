# Apple TV and tvOS Roadmap

Status: deferred. Do not prioritize Apple TV/tvOS for the active BryceCast build. The active target is a polished website/PWA for Mac/PC plus iPhone/mobile web. Revisit Apple TV only after an authorized integrated race-video path exists or the web/mobile product is already production-grade.

## Recommendation

Previously, tvOS was considered as a native BryceCast companion for timing, Bryce status, proof logging, alerts, schedule routing, radio links, and season history. That is no longer the near-term recommendation. Without live Bryce POV, without reliable team radio, and without integrated authorized race video, a native Apple TV app is likely to distract from the core product.

Best practical season-long setup:

1. Keep the authorized broadcast or onboard video in the official app, TV provider app, browser, or approved monitor route.
2. Make BryceCast the data and operations layer.
3. Use HDMI or AirPlay for race-day rooms immediately.
4. Do not build a native tvOS app now. Use the website on Mac/PC and iPhone/mobile web; mirror or AirPlay only when useful.

Confidence: high for tvOS dashboard feasibility, but low near-term value relative to web/mobile polish. High that unauthorized embedded video is a rights and App Review risk. Low for native tvOS solving anything material without a rights-holder stream.

## Licensed Video Boundary

A native tvOS app can:

- Play owned or licensed video through Apple media frameworks when the app has rights to the content and a compatible delivery path, typically HLS, with FairPlay Streaming if DRM is required.
- Present links, instructions, and source status for authorized broadcast paths.
- Display BryceCast data beside a separate official broadcast device or after the user switches from an official Apple TV app.
- Play team-approved delayed clips only inside the exact permission granted.

A native tvOS app cannot safely:

- Embed Hulu, FOX Sports, Xfinity, INDYCAR App, INDYCAR LIVE, YouTube, or other third-party protected streams without explicit permission under their terms.
- Circumvent DRM, screen-capture protected video, re-stream another app, or record a licensed feed for replay.
- Treat delayed AiM, SmartyCam, social, or highlight clips as live POV.
- Wrap a web player as a shortcut around rights. Apple TV should be treated as a native app target.
- Overlay BryceCast on top of another tvOS app. Apple TV app switching breaks the single-screen dream unless the licensed provider itself exposes the video to BryceCast.

Apple's App Review legal guidance is the controlling practical constraint: apps need the rights to content they include, third-party service access must be permitted by the service terms, and audio/video streaming can violate terms even when technically possible.

## Data Model for tvOS

The tvOS app should consume BryceCast data through a small HTTPS JSON API. Duplicating web-app scraping or direct feed logic inside Swift would create drift and weak source control.

Minimum API contract:

- `GET /api/session`: event name, session type, flag, lap, total laps, track type, updated timestamp, stale status.
- `GET /api/bryce`: car #9 row, position, start, gap, last lap, best lap, speed, status, comment, source confidence.
- `GET /api/timing`: compact leaderboard rows, sorted order, deltas, pit/status markers.
- `GET /api/sources`: Race Control, driver feed, config, schedule, track activity, history, broadcast route, POV route, radio route, last checked, error notes.
- `GET /api/history/bryce`: full season points, starts, finishes, best finish, top 5s, top 10s, teammate comparisons, official/provisional source labels, and schema/freshness metadata.
- `GET /api/history/bryce?compact=1`: compact season widgets for tvOS and iPhone, including latest race, track-type splits, best gain/loss, best-lap-rank signal, and CGR teammate benchmark.
- `POST /api/pov-proof`: live POV state, source, device, timestamp, evidence note, 60-second proof result.

Implementation shape:

- Keep the existing React/Vite app as the web front end.
- Add a local or hosted Node service that owns polling, caching, stale detection, feed normalization, and source logging.
- Store season and session snapshots in SQLite or another small durable store.
- Generate one shared schema file for web and mobile clients so `RaceSnapshot`, source probes, and history rows stay aligned. tvOS should only be considered after the deferred status changes.
- Have tvOS poll the normalized BryceCast API every 10 to 15 seconds during live sessions and back off when cold.
- Treat direct INDYCAR/Race Control access from tvOS as a fallback only. The service should absorb CORS differences, API drift, rate limits, and provisional-versus-official labeling.

## Alternatives

| Path | Practical value | Main weakness | Use now? |
| --- | --- | --- | --- |
| MacBook HDMI to TV | Most reliable local setup. Works with browser BryceCast and official broadcast windows. Lowest latency and simplest debugging. | Requires a Mac near the TV and manual window layout. | Yes, primary race-day path. |
| AirPlay from Mac, iPad, or iPhone | Fastest wireless room setup. Good for BryceCast dashboard or official app surfaces that allow AirPlay. | Latency, Wi-Fi dependence, app-level AirPlay restrictions, and occasional protected-video blocking. | Yes, secondary path. |
| Browser on Mac or smart TV | Keeps current BryceCast usable without a new app. | Apple TV has no normal Safari-style living-room browser target, and TV browsers are inconsistent. | Yes on Mac, weak as an Apple TV plan. |
| Native tvOS BryceCast | Best polished living-room dashboard once data is stable. Remote-friendly, full-screen, TestFlight-able, and season-long maintainable. | Does not solve licensed video by itself and cannot overlay other apps. | Build after API service. |
| Native tvOS video player | Excellent only with a rights-holder HLS/FairPlay contract. | Rights, DRM, review, support, and live-entitlement complexity. | Defer until a licensed stream exists. |

## Phased Implementation

### Phase 0: Race-Day Continuity

- Use current BryceCast browser app on MacBook.
- Put official broadcast or onboard path on the licensed device/app.
- Use HDMI as the default room display route; AirPlay when convenience beats latency.
- Log live #9 POV availability in Sources mode for each session.

Exit criterion: every race has a working operational setup with official video plus BryceCast timing, analytics, alerts, and source/frequency status. Live #9 POV is not part of the active exit criterion.

### Phase 1: BryceCast Data Service

- Use the current Node service as the API boundary for polling, source normalization, and client reads.
- Add durable session snapshots and source logs.
- Add stale-feed detection and official/provisional labels.
- Expose the API routes listed above.
- Keep all licensed-video fields as routing metadata unless rights are confirmed for playable stream URLs.

Exit criterion: the web app can run against the service in dev and production-style builds without depending on Vite proxy behavior, and API-mode render QA proves the browser only uses `/api/*` for BryceCast data.

### Phase 2: tvOS Dashboard MVP

- Create a SwiftUI tvOS app with four remote-friendly surfaces: TV, Engineer, Sources, Race Ops. Keep the existing web Phone mode as the faster proof-entry companion unless tvOS remote entry becomes ergonomic enough.
- Consume the BryceCast API.
- Show source confidence, stale states, current session, #9 focus card, leaderboard, alerts, radio frequency, and POV proof status.
- Add TestFlight distribution for the private watch group.
- Do not include video playback in the MVP.

Exit criterion: Apple TV can show a useful BryceCast dashboard for an entire live session while the official broadcast plays on another screen or after app switching.

### Phase 3: Race-Day Controls and Companion Flow

- Add simple remote actions: refresh source probes, switch dashboard density, mark official audio/frequency checks, and acknowledge race-day alerts.
- Adapt the existing web Phone mode for proof entry when Apple TV text entry is too slow.
- Add schedule-aware prompts for T-minus checks, live checks, post-race delayed footage requests, and escalation ownership.

Exit criterion: the room can operate the watch system without opening developer tools or editing files.

### Phase 4: Licensed Video Integration, Only If Rights Exist

- Require written rights-holder approval, terms of use clearance, playable stream details, DRM requirements, and App Review notes before implementation.
- Use AVKit/AVFoundation for HLS playback.
- Use FairPlay Streaming only if the rights-holder requires DRM and provides key-delivery infrastructure or a vendor.
- Keep replay, recording, download, and redistribution disabled unless separately licensed.

Exit criterion: a rights-approved test stream plays on Apple TV for a full live session and the authorization packet is ready for Apple review.

## Developer and Account Requirements

- Mac with current Xcode and tvOS SDK.
- Physical Apple TV 4K for race-room testing. Simulator is useful for layout, but remote behavior, network reliability, and living-room legibility need hardware.
- Apple Developer Program membership for TestFlight, App Store Connect, signing, and broad tester distribution. Apple currently lists the program at 99 USD per membership year.
- App Store Connect app record, bundle ID, signing certificates, provisioning profiles, and TestFlight test information.
- A support/contact path and review notes explaining that BryceCast is a dashboard and source-routing app, with no unauthorized video embedding.
- If video is ever added: rights documents, demo account or demo mode, stream availability during review, DRM/key-server description if relevant, and export/compliance answers for encryption.

## Risks

| Risk | Likelihood | Impact | Control |
| --- | --- | --- | --- |
| No live #9 onboard is available publicly | High | High | Keep POV proof logging and escalation as first-class product state. |
| Rights-holder video cannot be embedded | High | High | Keep tvOS MVP data-only. Treat video as a separately licensed Phase 4. |
| Apple Review rejects unclear third-party service use | Medium | High | Avoid embedded third-party streams and include review notes plus source permissions. |
| Apple TV app switching prevents one-screen broadcast plus dashboard | High | Medium | Use second screen, HDMI Mac layout, or AirPlay dashboard. |
| Race Control feed shape changes | Medium | Medium | Normalize through BryceCast service, log raw probes, version schemas. |
| Live data goes stale during a race | Medium | High | Surface stale state loudly, cache last good snapshot, preserve source timestamps. |
| Remote text entry slows proof logging | High | Medium | Use preset proof states and optional iPhone/web companion entry. |
| A tvOS app distracts from the immediate season goal | Medium | Medium | Gate tvOS work behind the data-service exit criterion. |

## Primary References

- Apple App Review Guidelines, section 5.2 Intellectual Property: `https://developer.apple.com/app-store/review/guidelines/`
- Apple media streaming overview, HLS, AirPlay, AVFoundation, AVKit, FairPlay: `https://developer.apple.com/airplay/`
- Apple Developer Program membership details: `https://developer.apple.com/programs/whats-included/`
- TestFlight overview for tvOS beta distribution: `https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview`
- BryceCast source boundary and current architecture: `docs/READINESS.md`, `docs/SOURCE-INVENTORY.md`, `docs/POV_ESCALATION_LADDER.md`
