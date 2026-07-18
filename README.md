# BryceCast

BryceCast is a web-first INDY NXT watch dashboard centered on Bryce Aron, car #9. It combines the authorized race broadcast workflow with Bryce-specific timing, gaps, race status, alerts, source health, official/frequency-only audio context, and season analytics.

June 2026 product reset: Bryce has confirmed that there is no live #9 POV feed available for BryceCast to include during races. Treat live Bryce POV as out of scope until a rights-holder-controlled stream is explicitly offered later. Bryce also said the team frequency may be available, but reliability without a scanner or receiver at the track is unknown, so isolated team radio is frequency metadata only until a proven legal receiver or official app route exists.

## Run

Race-day / watch-party mode:

```bash
npm install
npm run build
npm run serve:app
```

Open `http://localhost:8787`. In this mode, the Node service serves the built React app and the dashboard reads normalized `/api/*` routes for timing, history, replay, proof state, source freshness, and race-day readiness.

The top room-status strip is the shared readiness contract across TV, Engineer, Phone, Sources, and Race Ops. It summarizes timing state, authorized session route, local archive health, video boundary, and audio/frequency status so the room can tell at a glance whether the app is race-ready, stale/cold, or operating with known unavailable access.

Development-only mode:

```bash
npm install
npm run dev
```

Open the Vite URL, usually `http://localhost:5173`, only for UI development. TV mode is designed for AirPlay or HDMI from the MacBook. Engineer mode is denser for laptop viewing.

## Verify Sources

```bash
npm run audit:sources
npm run audit:live:pressure:primary
npm run weather:live
npm run weather:live:upcoming
npm run ingest:history
npm run probe:pov
npm run poll:race
npm run api:smoke
```

For race day, `scripts/api-server.mjs` fetches official/public INDYCAR Race Control blob feeds server-side and exposes normalized `/api/*` routes:

- `/racecontrol/timingscoring-ris.json`
- `/racecontrol/driversfeed_nxt.json`
- `/racecontrol/tsconfig.json`
- `/racecontrol/schedulefeed_nxt.json`
- `/racecontrol/trackactivityleaderboardfeed_nxt.json`
- `/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json`
- top-series reference feeds for wrong-series guard checks

Timing and driver feeds power Bryce status. Schedule and track-activity feeds now resolve the current session's authorized video/audio route, such as FS1 plus INDYCAR Radio, from the current `EventID` and `EventSessionID`.

Live source URLs are centralized in `scripts/live-source-endpoints.mjs`. The API service, source audit, race poller, and pressure-test tool all consume that catalog so endpoint changes do not drift across files. The primary BryceCast race snapshot still uses only timing, NXT driver, config, NXT schedule, and NXT track-activity feeds; top-series feeds and the NTT prediction blob are reference/candidate probes only.

The history ingest writes `public/data/history-bryce.json` from the INDY NXT official results API. If the current race has timing data but official results are not published, that row is marked provisional and race points are left `null`.

The race poller writes a local race-day archive:

- `data/live/brycecast.sqlite` for durable queryable snapshots.
- `data/live/snapshots.jsonl` for easy inspection and archival.
- `public/data/live-snapshot.json` so the dashboard can show the latest persisted logger sample.

On race day, run `npm run poll:race:watch -- --interval-ms=1000` beside `npm run serve:app` to capture timing, source health, schedule, config, track activity, and Bryce samples at the current race-day target cadence. The default watch cadence remains slower for casual development, so pass the explicit interval during live-session proof. Watch mode compensates for fetch/write elapsed time before sleeping; slow upstream probes become explicit errors or cadence degradation rather than hidden extra delay.

Live race-weekend weather uses the NWS API through `scripts/live-weather-service.mjs`. `npm run weather:live` checks current Road America observations/forecast/alerts, and `npm run weather:live:upcoming` loads the remaining 2026 INDY NXT events from the canonical career dataset and reports each venue's current weather plus forecast-readiness state. Long-range event forecasts stay labeled unavailable until the forecast window opens.

The local API service exposes `GET /api/health`, `/api/snapshot`, `/api/session`, `/api/bryce`, `/api/timing`, `/api/sources`, `/api/weather/live`, `/api/weather/upcoming`, `/api/history/bryce`, `/api/history/bryce?compact=1`, `/api/onboard-catalog`, `/api/race-log/latest`, `/api/replay/bryce`, plus legacy `GET`/`POST` proof routes for POV and audio. `/api/sources` and the in-app Source Health panel include checked age, Last-Modified age, byte counts, source role/cadence, proxy paths, and local artifact status. The compact history route is the first iPhone-ready season analytics projection.

Engineer mode uses `/api/replay/bryce` for SQLite-backed replay analytics. A tiny archive is labeled as coverage proof; a full race trend requires `npm run poll:race:watch` through a live session.

`npm run probe:pov:watch` remains available as a research/audit tool, but it is no longer on the critical race-day path. Do not design product screens around a live #9 POV gate unless new access is granted.

When those feeds are stale, blocked, or between sessions, BryceCast must label the state as stale, cold, static-cache, or seed. Seed data is a demo/development fallback only and does not satisfy race-day readiness.

## Production Contract

Everything in the core BryceCast experience should be live, functional, and source-backed except explicitly unavailable access lanes. The app should not ship fake track position, fake audio activity, placeholder analytics, hardcoded broadcast routing, or seed-only data as if it were operational.

Live #9 POV is currently unavailable for this project and must not be presented as a pending feature or implied feed. Isolated team radio is frequency-only until a legal, reliable live audio route is proven. These unavailable lanes should not block the rest of BryceCast from being production-grade.

## Current Shape

The integrated A2 + B + C + F2-F6 website on `master` is the approved product
baseline. New work should extend or refine it through the existing typed data
packages, adapters, and live contracts. Replacing its information architecture
or visual system requires a new explicit product decision; preserving source
state and live-readiness semantics is mandatory in every case.

- `TV Mode`: shared room-status strip, session-specific broadcast launcher, Bryce focus stack, timing ribbon, compact room layout, reference map, frequency/official-audio tile, and timing notes.
- `Engineer`: shared room-status strip, timing tower, pace chart, pass delta chart, source health, season pulse, source-backed track-type splits, qualifying-to-finish gains/losses, CGR teammate benchmark, and gated SQLite replay analytics.
- `Phone`: compact iPhone companion surface with Bryce race pulse, authorized route links, alerts, source-backed track-form lens, and room checks.
- `Sources`: shared room-status strip, adapter status, detailed race-day readiness, source freshness, unavailable POV documentation, frequency/official-audio status, session route, local data capture status, and links to official viewing/data surfaces.
- `Race Ops`: shared room-status strip, session route, MacBook/TV/iPhone runbook, data logger status, audio/frequency notes, and Bryce/team follow-up questions.

## Product Critical Path

The core requirement is now a polished Bryce-centric companion surface for desktop web and iPhone: live timing, source freshness, official broadcast routing, Bryce-focused analytics, alerts, race context, historical benchmarks, and clear unavailable-state handling for POV and isolated radio. Use `docs/LIVE_POV_ACCESS_FINDINGS.md` and `docs/POV_ESCALATION_LADDER.md` only as historical research unless new access appears.

Use `CLAUDE.md` and `docs/FABLE_HANDOFF.md` first. Their July 18 controlling
sections establish `master` and the approved integrated UI as the baseline; old
frontend-reset language later in those documents is historical provenance.

Use `docs/CODEX_HANDOFF_CURRENT.md` next for current lane boundaries, canonical generated counts, known same-file churn, live/career split, and the ambiguity register. If a contradiction cannot be resolved from source files, generated reports, live checks, tests, or official sources, record it there rather than guessing.

Use `docs/SOURCE-INVENTORY.md` for the current source map, confirmed feeds, candidate sources, and unresolved access gaps.

Use `docs/ANALYTICS_SOURCE_AUDIT.md` as the product truth for what live and historical analytics can be built now, what is not proven, and what needs new source discovery.

Use `docs/LIVE_DATA_READINESS_AUDIT.md` for the live-source endpoint catalog, 1-second pressure-test results, Road America acceptance gates, live-weather contract, and remaining live-session proof checklist.

Use `docs/CAREER_DATA_SPEC.md`, `docs/CAREER_RESEARCH_WORKSTREAMS.md`, and `docs/CAREER_DATA_FEASIBILITY_MATRIX.md` for the full Bryce Aron career warehouse: schema, provenance rules, validation gates, source workstreams, feasibility by data category, and import layout.

Use `docs/AUDIO_RADIO_FINDINGS.md` and `docs/RADIO_AUDIO_PLAN.md` for the official-audio and frequency-only architecture. Use `docs/APPLE_TV_TVOS_ROADMAP.md` only for deferred future reference; the active build target is web on Mac/PC plus iPhone/mobile web.

Use `docs/API_SERVICE.md` for the local API contract that web and iPhone/mobile clients should consume.

## Important Boundary

BryceCast is a companion and viewing-orchestration system. The licensed race video stays in Hulu Live TV, FOX Sports/FOX One, Xfinity, the INDYCAR app, or another authorized viewing surface. The app can launch and annotate around those surfaces locally; it does not embed, record, rebroadcast, capture, or redistribute protected broadcast video.
