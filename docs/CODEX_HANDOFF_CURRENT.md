# BryceCast Current Codex Handoff

Updated: 2026-07-19 13:30 EDT (post-race).

## July 19 Post-Race — Controlling State

`docs/PHASE3_HANDOFF_2026-07-19.md` is now the controlling state document
and supersedes the July 18 sections below (kept for provenance). Headlines:
production hosting moved to the Mac mini (Codex runs there; deploy via
`npm run deploy:mini` → mini runs `update-mini.sh`); the original family
URL forwards via a redirect relay on the MacBook; master is `40a75d0`
(per-client replay); the Music City roll-forward and the mini's bundle
update are the next session's first actions. All July 12 Global Rules and
the Phase 3 charter remain binding.

## July 18 Repository Consolidation — Controlling State

The canonical code branch is now `master`, promoted from the independently
verified integrated A2 + B + C + F2-F6 baseline. Brief D remains intentionally
excluded. Use `git worktree list` to resolve the canonical worktree; do not use
the dirty ordinary checkpoint checkout as the frontend source.

The ordinary path `/Users/example/Documents/Bryce POV access` remains the
active one-second runner and canonical live SQLite archive location. Repository
organization must not reset that checkout, alter its LaunchAgents, or mutate
the archive. Its Bryce No. 9 car work is independently preserved at tag
`brycecast-car-art-recovered-20260718` and was not silently introduced into the
approved UI.

The prior UI-package validator exception is repaired through the predictive
pack generator plus the narrow UI-package refresh path. The current
`scripts/api-server.mjs` reference is 87,266 bytes with SHA-256
`c15f43bd89f36e6fd2a1b12638159de721128fa8a6bac9ca44e7b462dfb85a78`.
See `analysis/career-chapter-utilization-audit/` for the source-backed career
utilization matrix. Older sections below are historical unless this section
explicitly incorporates them.

## July 18 Nashville Official-Live Baseline

This section supersedes the July 13 cold-runtime instructions for the current
race weekend.

- The canonical capture runner is `/Users/example/Documents/Bryce POV access/scripts/live-runner.mjs`, owned by LaunchAgent `com.brycecast.live-runner`.
- It began Nashville Practice 1 capture at `2026-07-18T15:39:15Z`, about nine minutes after the official session began, and then sustained one successful write per second with no endpoint failures.
- The authoritative integrated UI remains this worktree/branch. A production build is served locally at `http://127.0.0.1:5181/live` against the canonical runner database and status file.
- The app process must use `BRYCECAST_API_RUNNER_ONLY=1`; this prevents a second upstream ingestor while preserving real, non-replay trust semantics.
- The runner-backed archive lookup now uses append-only primary-key order instead of sorting all JSON snapshots by timestamp.
- Live weather metadata now comes from the compact track metadata plus upcoming-event context packs. The prior path reparsed the 306 MB career dataset on every readiness request and drove the API above 2 GB RSS.
- Production measurement with one one-second browser client: app/API about 111 MB RSS, runner about 114 MB RSS, combined about 225 MB; 35/35 capture writes succeeded in 35 seconds.
- Observed archive growth was about 1.3 GB/hour. Storage retention, not compute, is the main Mac mini deployment constraint.
- The July 18 ten-minute Nashville guard automation was deleted after it created 11 duplicate standalone tasks while the self-scheduling LaunchAgent was healthy. Those duplicate tasks were archived; the original `019f75e0-44e7-7fa3-adb2-4ca6202825b9` setup task remains the canonical record. Do not recreate a continuous Codex monitor for this weekend.
- The post-weekend content-addressed archive redesign is specified in `docs/LIVE_ARCHIVE_V2_PLAN.md`. Keep one-second timing, version enrichment payloads by content hash, migrate through a sidecar database, and do not modify or vacuum the active legacy archive.

Practice 1 proved the data path and page motion, but the page remains semantically
race-shaped: practice order is best-lap order, race laps are unavailable, and
race-completion/championship/battle labels are inappropriate. Do not interpret
those cards as a validated practice design. The observation-gated practice-mode
and 8 GB Mac mini ideas are recorded in `docs/LIVE_PRODUCT_IDEAS.md`; do not
implement them before the July 18-19 weekend review.

For the current local production runtime:

```bash
cd '/Users/example/.codex/worktrees/ac78/Bryce POV access'
BRYCECAST_API_RUNNER_ONLY=1 \
BRYCECAST_SQLITE_PATH='/Users/example/Documents/Bryce POV access/data/live/brycecast.sqlite' \
BRYCECAST_RUNNER_STATUS_PATH='/Users/example/Documents/Bryce POV access/data/live/live-runner-status.json' \
npm run serve:app -- --host 127.0.0.1 --port 5181
```

This is a local production preview, not yet a public internet deployment. The
existing Mac mini/Cloudflare migration outline remains in `docs/DEPLOY_RUNBOOK.md`.

## July 13 Night Closeout — Current Controlling State

This section supersedes older branch/runtime instructions below. The historical
material remains for provenance.

### Authoritative integrated review branch

- Worktree: `/Users/example/.codex/worktrees/ac78/Bryce POV access`
- Branch: `codex/integrate-brief-c-live-f6`
- Current implementation commit: `581925f62d86e39470fd63acbe6aab18bd41b9fc`
  (`Improve running-order line clarity`)
- Integration parent: `95d280e4dd8b2e2b9ee132bd5c858be636e9befb`
  (`Integrate named Career moments with Live F6`)
- F6 source commit: `a7fcf7e` (`feat(live): chart the running order in rank space`)
- This branch is saved locally and clean. It has not been merged, pushed, or
  deployed.

The branch contains the approved A2, B, C, and F6 work in one site. Brief D is
intentionally excluded and must not be integrated without a separate decision.

- A2: all 145 canonical personal race rows; 3,019 personal race laps and
  6,924.4 personal race miles; confidence-aware mileage/travel semantics.
- B: the 34-venue / 145-race career atlas experience. The rejected venue-finder
  interaction is not present.
- C: the five named Career moments and their source-backed presentation.
- F6: the Bryce-centered live corridor plus a running-order history chart in
  rank space, the separate distance-to-leader view, and the full live field.
- July 13 follow-up: nearby running-order traces now use stable neutral
  solid/dashed/dotted/dash-dot identities, matching right-edge swatches, and
  touch/focus affordances. Bryce remains the only gold trace.

### Validation and known deviation

The integrated branch passed the running-order suite (44 assertions), live
motion suite (56), replay suite (16), TypeScript, production build, and
`git diff --check`. The only build output is the existing Vite chunk-size
advisory.

`npm run analytics:ui-data-package:validate` still has the inherited F6-baseline
failure: the generated package contains a stale source-reference hash for the
unchanged `scripts/api-server.mjs`. Do not describe that validator as passing
until the analytics package is regenerated or the reference is otherwise
reconciled.

### Runtime closeout and restart

The July 13 review runtime was deliberately made cold before shutdown: the
5179/5180/5181 Vite previews, 8793/8794/8795/8798 replay APIs, tmux preview,
production live runner/API, `caffeinate`, and process-pressure guard were
stopped. The three BryceCast LaunchAgents were unloaded for the current login
session only; their plist files and configuration were not deleted or disabled.
They may load again on a future login.

Important: immediately before closeout, the older production API on port 8787
was using approximately one full CPU core. Investigate that busy process before
restoring the always-on production LaunchAgent for an extended run.

To review the integrated branch tomorrow without restoring production, run:

```bash
cd '/Users/example/.codex/worktrees/ac78/Bryce POV access'
BRYCECAST_SQLITE_PATH='/Users/example/Documents/Bryce POV access/data/live/brycecast.sqlite' \
BRYCECAST_RUNNER_STATUS_PATH='/tmp/brycecast-integrated-live-runner-status.json' \
npm run live:replay -- --port=8795 --host=127.0.0.1
```

In a second terminal:

```bash
cd '/Users/example/.codex/worktrees/ac78/Bryce POV access'
BRYCECAST_API_PROXY=http://127.0.0.1:8795 \
npm run dev -- --host 127.0.0.1 --port 5181
```

Optional deterministic replay window:

```bash
curl -fsS 'http://127.0.0.1:8795/api/replay/control?session=5544-6761&t0=2026-07-04T17%3A20%3A20.000Z&speed=1'
```

Open `http://127.0.0.1:5181/live`.

### Promotion gate

Review and promote from this branch/worktree. The main checkout is not the
authoritative integrated build and contains unrelated user edits. Preserve
those edits. Do not merge Brief D as part of this promotion.

## July 2 Fable / Post-Road America Note

For the current Claude Fable 5 / Codex GPT-5.5 handoff, read
`../CLAUDE.md` and `FABLE_HANDOFF.md` before this file. The Codex plugin
for Claude Code is installed/enabled, Codex CLI is updated, and the local Codex
default model is `gpt-5.5`.

The June 21 Road America live drill now supersedes the pre-race statement that
active INDY NXT green-flag proof was still blocked. Read
`../LIVE_DRILL_CLOSEOUT_2026-06-21.md` and
`../LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md` for current live-readiness
truth: the upstream Race Control data and 1-second ingestion path worked; the
remaining fix is a one-ingestor/cache-backed runtime that avoids local process
exhaustion.

## Current Chat / Thread Label

- Current parent/orchestrator Codex thread: `Build Bryce race dashboard`
- Current parent/orchestrator thread id: `019ea567-6e10-73f2-80eb-717ba7bfbc2b`
- Workspace: `/Users/example/Documents/Bryce POV access`

Use this file as the first stop for a fresh Codex instance. The chat context has compacted repeatedly, and the project has multiple same-directory worker threads whose work must be audited from disk.

## Product Direction

BryceCast is now a Bryce Aron racing analytics product. Live Bryce in-car POV is out of scope unless Bryce/team later provides authorized access. Team radio is also out of scope for now unless reliable authorized access is later established.

Current highest-value path: build a rigorous, source-backed career/session analytics foundation and then design the website/mobile experience around verified data.

June 18 productization update: the analytics foundation is now context-pack backed, not just a set of CSV/report artifacts. Fresh UI agents should start from `analysis/ui-data-package/ui-data-package.json`, `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`, `analysis/ANALYTICS_UI_ARTIFACT_INDEX.md`, and `analysis/ui-blueprint/README.md` before opening older blueprint, worker-note, or MagicPath files.

The live/race-day data lane is separate from the career ingestion lane. Career facts live in `data/career/career.dataset.json` and generated reports; live timing/source/weather readiness lives in `scripts/api-server.mjs`, `scripts/race-poller.mjs`, `scripts/live-source-endpoints.mjs`, `scripts/live-source-pressure-test.mjs`, `scripts/live-weather-service.mjs`, `scripts/live-weather.mjs`, `docs/LIVE_DATA_READINESS_AUDIT.md`, `docs/API_SERVICE.md`, and `docs/SOURCE-INVENTORY.md`.

## Current Validation Baseline

Current analytics/UI productization baseline verified in this cleanup lane:

```bash
npm run analytics:ui-data-package:validate
npm run analytics:view-models:validate
python3 analysis/predictive-race-intelligence/scripts/validate_predictive_race_intelligence.py
python3 analysis/data-utilization-audit/scripts/validate_data_utilization_audit.py
python3 analysis/indy-nxt-section-lap-deep-dive/scripts/validate_indy_nxt_section_lap_deep_dive.py
python3 analysis/indy-nxt-race-lap-section-enhancement/scripts/validate_indy_nxt_race_lap_section_enhancement.py
python3 analysis/imsa-daytona-stint-class-pace/scripts/validate_imsa_daytona_stint_class_pace.py
python3 analysis/formula-ford-lap-shape/scripts/validate_formula_ford_lap_shape.py
python3 analysis/context-event-narrative-layer/scripts/validate_context_event_narrative_layer.py
python3 analysis/career-dimension-context-layer/scripts/validate_career_dimension_context_layer.py
npm run build
git diff --check
```

Result: all listed gates pass. `npm run build` still has the existing Vite chunk-size warning only. This cleanup lane did not rerun ingestion import/summary because those commands mutate ingestion-owned generated reports; the current canonical ingestion reports remain the June 16 source of truth below.

Last verified with:

```bash
npm run career:import:all
npm run career:test
npm run build
```

`npm run career:import:all` includes `career:validate`, `career:summary`, and `career:coverage`.

The import chain was also idempotency-checked earlier in this pass with:

```bash
npm run career:import:all
npm run career:import:all
npm run career:test
npm run build
```

Validation result: `ok: true`.

Live/API verification from the current UI/product lane:

```bash
npm run audit:sources
npm run weather:live
npm run weather:live:upcoming
npm run audit:live:pressure
npm run audit:live:pressure:primary
npm run api:smoke
npm run build
git diff --check
```

Live/API result: full cold/post-session pressure checks passed on June 8, 2026, and source/weather quick checks passed again on June 13, 2026. `npm run build` has the existing Vite chunk-size warning only.

Live/API current state:

- `scripts/live-source-endpoints.mjs` is the source catalog for all public/candidate/reference live endpoints. Primary BryceCast snapshots use timing, NXT drivers, config, NXT schedule, and NXT track activity. Top-series feeds and the NTT prediction blob are guard/candidate probes only.
- `npm run audit:live:pressure` sustained 270 requests across 9 endpoints at 1-second cadence with 0 errors. Highest p95 latency was 75 ms.
- `npm run audit:live:pressure:primary` sustained 300 requests across the 5 primary BryceCast feeds at 1-second cadence with 0 errors. Endpoint p95 latencies were 41-51 ms.
- `npm run audit:live:pressure:primary -- --iterations=3 --no-write` passed repeatedly on June 13, 2026 with 15 primary-feed requests, 0 errors, and highest endpoint p95 latency roughly in the 160-180 ms range during quick checks.
- These are cold/post-session proofs. Road America green-flag INDY NXT proof is still required before calling live mode production-ready.
- `scripts/live-weather-service.mjs` and `scripts/live-weather.mjs` implement NWS live weather. `/api/weather/live?trackId=track_road_america` and `/api/weather/upcoming` expose current venue weather and forecast-readiness labels to clients.
- Weather routes use per-track cache, in-flight request reuse, NWS request timeouts, bounded concurrent upcoming-track refresh, per-track deadline fallbacks, and partial probe reporting. Operator refreshes force cache refresh but must not disable in-flight reuse. Missing observation-station, hourly-forecast, or daily-forecast URLs are failed probes, so weather should be `partial` rather than `live` when current observation or forecast legs are unavailable.
- NWS HTTP success is not enough for `sourceState: live`; weather probes fail JSON parse errors and schema-empty observation/hourly/daily payloads before source state is calculated.
- Source probes, `npm run audit:sources`, and API proxy routes use a bounded 5-second upstream timeout so one slow Race Control/reference/candidate endpoint should become an error probe or 502 response rather than a hung readiness check.
- `/api/sources` separates HTTP reachability from readiness. NTT prediction data reports payload datetime/age and `readinessState: candidate_unavailable` while the public blob remains the stale 2024 heartbeat. Top-series feeds report `reference_only` so they cannot be mistaken for Bryce sources. Global timing reports `wrong_session` unless the shared Bryce timing predicate sees an INDY NXT heartbeat plus car `9` and either `DriverID=2143` or exact Bryce Aron identity. The NXT driver feed reports `profile_unavailable` when Bryce is absent and `profile_partial` when radio metadata is missing.
- Stale archive fallback searches archived payloads containing Bryce's live timing `DriverID=2143`, verifies the parsed timing row, and preserves the selected archive row's `checked_at` timestamp before using a sample; wrong-series top-series samples should not evict Bryce fallback after only a short 1-second polling window or make stale data look freshly checked.
- The stale archive fallback SQLite prefilter also scans exact Bryce Aron name plus car `9` candidates, then verifies each parsed row through the shared Bryce timing predicate. Do not narrow fallback lookup to only `DriverID=2143`.
- Live timing and archived Bryce timing fallback are allowed to survive NXT driver-profile failure. If the timing feed has Bryce but the profile feed fails or omits him, the API returns fallback Bryce identity fields, leaves enrichment fields empty, and marks the profile probe stale/error instead of 502ing the snapshot.
- Archived profile fields may be used as fallback identity/enrichment while serving stale archived timing, but current driver-profile source health must be evaluated only against the current `drivers_nxt` response. Do not mark profile/radio readiness live from archived profile data.
- Core live routes block only on the critical Race Control timing feed. NXT driver profile, config, schedule, and track-activity feeds are enrichment for `/api/snapshot`, `/api/session`, `/api/bryce`, and `/api/timing`; they are served from a short in-memory cache and refreshed in the background so a slow support feed cannot break the 1-second race-day cadence. The cache stores the latest result, including explicit failures, so later source outages are not hidden behind older successful payloads.
- `npm run api:smoke` treats driver-profile data as enrichment too: radio frequency is required only when the driver-profile source probe is live; fallback identity is required otherwise.
- `scripts/race-poller.mjs` now reads the last repeated CLI argument, so `npm run poll:race:watch -- --interval-ms=1000` overrides the package default. Poller endpoint fetches use a bounded 5-second timeout, optional live timing numbers preserve missing values as `null`, replay keeps SQLite `NULL` values as unavailable, and watch mode compensates for fetch/write elapsed time before sleeping.
- Race-poller snapshots use `sourceState: error` for timing fetch failure or missing timing heartbeat; `stale` is reserved for successful wrong-series/no-Bryce timing payloads or explicit archived fallback.
- SQLite replay now persists expanded live timing fields from the poller, including best-lap number, average speed, pit recency, tire/overtake, lap distance, live diff ahead/behind, running/total points, and radio metadata. Replay queries tolerate older archives by returning `null` for additive columns that do not exist yet.
- `scripts/live-source-pressure-test.mjs` uses the same null-preserving numeric parser for optional candidate timing fields, so null lap-distance/overtake fields are not counted as real zeroes.
- `npm run weather:live:upcoming` found 9 remaining 2026 INDY NXT events. In the June 13 final sweep, Road America Race 1 and Race 2 were `forecast_window_open`; Mid-Ohio, Nashville, Portland, Milwaukee, and Monterey remained `too_far_for_event_forecast` until their NWS forecast windows open.
- NWS weather is a live/prep overlay, not official series weather, radar, track temperature, or a long-range event forecast.
- The NTT prediction blob is accessible but stale: one 2024 heartbeat row only. Keep pit prediction unavailable unless it wakes up during a live session and proves INDY NXT relevance.
- The current global timing feed points to the top-series WWTR race, flag `COLD`, lap `260/260`, with no Bryce row. API readiness, race-poller archive capture, source audit, and pressure-test tooling share the Bryce timing predicate from `scripts/live-source-endpoints.mjs`: require an INDY NXT heartbeat plus Bryce car `9` and either `DriverID=2143` or exact Bryce Aron timing-row identity before treating timing as Bryce data. Archived INDY NXT samples use heartbeat `Series: "L"`.

Current canonical counts:

| Entity | Count |
| --- | ---: |
| Drivers | 555 |
| Series | 7 |
| Teams | 75 |
| Cars | 472 |
| Tracks | 42 |
| Seasons | 10 |
| Events | 87 |
| Sessions | 469 |
| Results | 8,158 |
| Qualifying results | 1,547 |
| Lap samples | 67,686 |
| Racecraft events | 35 |
| Penalties | 82 |
| Incidents | 132 |
| Derived metrics | 370 |
| Weather / track-condition observations | 181 |
| Media assets | 940 |
| Source evidence rows | 1,199 |
| Open gaps | 9 |

## June 18 Analytics Productization Baseline

The active UI/product baseline now includes these generated, source-hash checked artifacts:

| Artifact family | Current state |
| --- | --- |
| UI data package | `analysis/ui-data-package/ui-data-package.json`, generated `2026-06-18T17:52:13.930Z`, `asOfDate=2026-06-18`, source hash `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`, 5 screen payloads. |
| Predictive race intelligence | 76 inventory items, 36 INDY NXT feature rows, 68 career-prior rows, 14 model rows, 9 upcoming-event packs, 36 race-debrief packs, 1 Career Lab pack, 1 live race-day pack. Use bands/paths/analogs only; no public point forecasts. |
| Data utilization audit | No remaining generated utilization backlog rows for the current canonical dataset. The 25 non-empty collections are productized; 3 empty notification/broadcast collections are marked not worth analyzing with rationale. |
| INDY NXT section-lap deep dive | 21,044 practice/qualifying Bryce section observations, 83 session summaries, 2,678 Top Section Times rows, 248 section-family aggregates, Road America prep context pack. |
| INDY NXT race lap/section enhancement | 1,390 race lap microstates, 159 caution-aware lap segments, 151 inflection points, 16,001 race section observations, Road America race context pack. |
| Career dimension context | 8,158 result rows, 1,547 qualifying rows, 75 teams, 42 tracks, 555 drivers, 472 cars, full-field result and qualifying conversion context. |
| Context event narrative | 1,370 context timeline rows, 181 weather rows, 940 media rows, 1,199 source-evidence rows, 9 source-boundary gap rows. |
| IMSA Daytona stint/class pace | 37,885 official time-card lap rows, 1,680 stints, 10 Bryce stint rows, car 85 co-driver/class-hour pace context. |
| Formula Ford lap shape | 282 Bryce-labeled lap-analysis rows, 24 session lap-shape summaries, 7 event progression rows, 9 condition rows. |

Road America Race 1 and Race 2 context packs are the first upcoming-event UI sources:

- Race 1: `analysis/predictive-race-intelligence/output/context-packs/upcoming-events/upcoming_event_indy_nxt_2026_5545_grand_prix_at_road_america_race_1.json`
- Race 2: `analysis/predictive-race-intelligence/output/context-packs/upcoming-events/upcoming_event_indy_nxt_2026_5537_grand_prix_at_road_america_race_2.json`

Key Road America prep facts in the package:

- Same-track INDY NXT history: 2 races, average finish `8.5`, average gain `0`, top-10 rate `100%`.
- INDY NXT road-course history: 20 races, average finish `12.6`, average gain `-2.45`, finish-percentile median `0.401`, top-10 rate `40%`.
- Finish-percentile prior band: p25 `0.223`, median `0.401`, p75 `0.667`, n `20`, `claimStrength=source_bounded_historical_prior_band`.
- Static prep weather remains `future_unavailable_in_historical_dataset`; runtime NWS routes own current/forecast weather.

Predictive policy:

- Promote a race-intelligence workbench, not betting-style predictions.
- Pre-race-safe models provide only modest lift over baseline. The strongest candidate in the scorecard is useful for internal context bands, not public finish copy.
- Any model using team outcome, lap dynamics, section results, incident/penalty, or archetype fields is post-race only and barred from pre-race predictions.
- Top-10 probabilities remain path language until calibration/Brier gates beat baseline.

Frontend rule after June 18: React components should consume `analysis/ui-data-package/ui-data-package.json`, runtime `/api/*` routes, and referenced context packs through a typed adapter. Do not parse raw CSV files directly inside UI components.

Validation warnings:

- `sessions.timeCoverage`: 9 physical FROC test sessions lack `scheduledStart` or `actualStart`; hour-level weather/live joins must wait for an official exact clock-time source for those rows. Euroformula 2023 now has 28 official Cronococa PDF-derived actual session starts from internally consistent `Time of Day` minus `Session Time` rows. FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs, and the other nine FROC test sessions now carry cached official Toyota test-day article context without fabricated exact starts. INDY NXT has 111 exact physical-session windows: 74 from cached official 2024-2025 weekend schedule PDFs and 37 from 2026 Race Control feeds. The remaining 78 date-only INDY NXT rows are qualifying/group/combined qualifying sessions where official sources expose only coarse qualifying blocks or no exact qualifying row. Race Control feed datetime strings are treated as source UTC and converted to canonical event-local timestamps. The FRP Road Atlanta combined qualifying classification is intentionally marked as an aggregate classification with no separate on-track window.

Track metadata:

- Direction coverage is complete for all 42 currently imported tracks. Arlington remains medium-confidence because direction is inferred from the official INDYCAR track-map turn sequence pending stronger future-circuit GIS or supplemental-regulation data.
- `npm run career:backfill:track-metadata:verify` reports `ok: true` and all track metadata quality gates pass. Its live source URL probe checked 61 URLs and returned 14 warnings from 403/404/429/timeout responses, mostly on existing venue/reference pages and IMSA-hosted PDFs that are otherwise readable through browser/search surfaces. Treat those as source-access caveats, not canonical validation errors.

## Imported Source Families

The current dataset includes these source-backed imports:

- INDY NXT 2024-2026 official API/session results, 1,238 official INDY NXT qualifyingResults rows from SessionType=Q records, 738 race/heat result rows with official/API pit-stop counts, 68 official terminal-status incident rows from contact/mechanical/DNS result statuses, 76 official Results PDF penalty/decision-summary rows, 64 official Results PDF caution-summary causal incident rows, 29,519 official lap-by-lap position samples from all 36 Race Lap Chart PDFs, 36 official Event Summary race-stat metric rows, 35 official Event Summary most-improved racecraft rows, 36 official Leader Lap Summary metric rows with leader timing/margins/flag states, 146 official Top Section Times metric rows across practice, qualifying, and race sessions, 145 official Section Results metric rows with lap-by-lap section time/speed metrics, 95 non-official modeled ambient weather rows from Open-Meteo for exact-window archive-eligible sessions with representative NOAA/NCEI station cross-checks, plus 111 source-backed exact physical-session windows: 74 from cached official 2024-2025 weekend schedule PDFs and 37 from 2026 Race Control feeds, including 16 future schedule-only sessions that carry no result rows. The remaining 78 date-only INDY NXT rows are source-reviewed unavailable for hour-level weather joins because official sources expose only coarse qualifying blocks or no exact qualifying row. Detailed pit context is source-limited: the official report inventory exposes counts and lap-chart position samples, but no dedicated pit-summary, pit-lane sequence, stop-lap, tire/service, or pit-time report was found across cached official reports.
- GB3/BRDC British F3 2021 official TSL/BRSCC event pages and timing PDFs: 7 events, 39 sessions, 684 result rows, 248 qualifying rows, 38 Bryce result rows, 39 official weather/track-condition observations, 67 media/PDF assets, all 369 race start/grid positions sourced from official TSL grid PDFs, plus archived official GB3 championship standings showing Bryce P12 with 238 points.
- GB3 2022 official JSON route, plus one official-manifest-only session for source-broken session `1248`; row-level results for `1248` remain blocked by the official JSON 404.
- IMSA Daytona 2025 official Al Kamel classification/time-card data, including 37,885 lap samples and official air/track-condition fields.
- Euroformula Open 2023 official race PDFs, including race grid/start positions parsed from official position-chart `Grid` columns, 28 official PDF-derived actual session starts from internally consistent fastest-lap sequence timing rows, plus RFEDA final-classification standings showing Bryce P4 with 238 points.
- Formula Regional Oceania 2024 Toyota NZ HTML result tables, HTML grid tabs, linked official grid PDFs where present, the official Taupo Qualifying 1/2 articles for Round 1 Race 1/Race 3 grid derivation, the official Taupo Race 2 article for Round 1 Race 2 source-backed rows, the official Euromarque Qualifying 1 article for Round 4 Race 1 grid derivation, the official Highlands Grand Prix qualifying-format article for Round 5 Race 1/Grand Prix grid derivation, the official Highlands Race 2 article for the Round 5 Race 2 top-eight grid rows, and four official Toyota test-day articles that support date-level context for the nine exact-time-unsourced test sessions.
- FRP F1600 2019 official PDFs, season points, and 2 official qualifying grid-position penalties.
- Formula Ford 2020 official TSL/BRSCC/BARC/MSVR-hosted PDFs for National FF1600, Formula Ford Festival, Walter Hayes Trophy, Champion of Cadwell, and Champion of Brands, including 755 official grid/start rows, 282 source-labeled Bryce lap-analysis samples, and 4 official WHT penalty notes linked to affected result rows. The importer now owns/replaces its 2020 result/car slice on rerun, removes stale class-token parser rows, exact-name matches the Colin Lawson Oulton Park Race 1 grid row where the official grid page uses car 169 and the classification uses car 69, and preserves the remaining 7 grid/start rows in `gap_formula_ford_2020_grid_start_source_asymmetry_holdouts` instead of guessing reserve-only/restart-only/source-asymmetric starts.
- Team USA Scholarship 2020 official pages as link-only media/source evidence plus four structured career milestones covering scholarship selection, 2018 BKC TaG Jr champion context, 2018 Yamaha KT100 runner-up context, and 2019 FRP F1600 P3/eight-podium context.
- Badger Kart Club archived official 2016/2017 fast-time and track-record pages, stored as source-backed career/achievement metrics for 2016 Yamaha Junior fast time, 2017 TaG Junior Classic Track fast time, and 2017 TaG Junior Bus Stop track record.
- FROC 2024 official Toyota schedule images plus Round 2 official Toyota timing PDFs for source-supported session-window backfill; Round 2 Race 2 start positions import from the official Toyota Grid R2 PDF; Round 1 Race 1 and Round 4 Race 1 start positions import from official Toyota Qualifying 1 articles plus qualifying tables; Round 1 Race 2 has 9 source-backed starts from the official Taupo Race 2 reverse-grid article plus Race 1 results and a direct Woods-Toth P16 statement; Round 1 Race 3 start positions import from the official Taupo Qualifying 2 adjusted grid table; Round 5 Race 1 and Grand Prix start positions import from the official Highlands qualifying-format article plus qualifying tables; Round 5 Race 2 top-eight start positions import from the official Highlands Race 2 article.
- INDY NXT official Race Control trackactivity/schedulefeed JSON for source-supported 2026 session-window backfill, plus cached official 2024-2026 weekend schedule PDFs for unambiguous historical exact-window review.
- Track metadata/weather-readiness backfill for the 42 currently imported tracks.

## Known Thread Map

These are Codex threads, not subagents.

| Thread id | Current status from direct read | Real lane / note |
| --- | --- | --- |
| `019ea567-6e10-73f2-80eb-717ba7bfbc2b` | Active parent | Orchestrator/current chat. |
| `019ea5b6-5624-7e33-a29c-283944415d7a` | Idle after course correction | Productive FRP F1600 2019 lane. Originally labels/prompts drifted, but actual useful work is FRP. |
| `019ea5b6-69ba-7541-8b2c-7eed7cf5f595` | Idle after course correction | Productive track metadata/weather-readiness lane. Scope expanded through the current 42-track metadata pack. |
| `019ea5b9-5dc8-7181-95be-0c5939584a0b` | Idle after course correction | Productive Formula Ford 2020 lane. It found/fixed an importer idempotency issue. |
| `019ea5b6-6371-71d2-a108-03e539620e16` | Idle after course correction | Coordination-risk/router thread. It received multiple lane prompts; audit any outputs carefully before trusting them. |
| `019ea5b6-5bb2-7da2-b67a-e1c2b209d5cb` | Idle router shell | Do not treat as an importer owner without later evidence. |
| `019ea5b7-d927-7fe3-b16c-f329a20ef5ef` | Idle router shell | Superseded by actual FRP work in `019ea5b6-5624...`. |
| `019ea5b8-5cb5-7a22-9d75-44a5fb80ccae` | Idle router shell | Superseded by actual track metadata work in `019ea5b6-69ba...` / related parent work. |
| `019ea5b8-e158-77b1-afaf-a9eccda00bea` | Idle router shell | Spawned/forwarded Formula Ford 2020 to `019ea5b9-5dc8...`. |

Course-correction messages were sent to the four active/important threads:

- Productive lanes were told to finish lane-owned work, stop broad shared-file edits, and report changed files/counts/validation.
- The overloaded router thread was told to pause broad behavior, avoid shared edits, and hand off only unique artifacts/status.
- All were reminded that future explicit forks should use `gpt-5.5` with reasoning `high`, not `xhigh`.

## Coordination Risk

The parallelization was useful, but messy. Multiple same-directory threads edited shared files:

- `package.json`
- `data/career/sources.manifest.json`
- `data/career/README.md`
- `docs/CAREER_DATA_FEASIBILITY_MATRIX.md`
- `docs/CAREER_RESEARCH_WORKSTREAMS.md`
- `docs/PARALLEL_INGESTION_COORDINATION.md`
- `scripts/validate-career-data.mjs`
- `scripts/backfill-track-metadata.mjs`

Any fresh agent should assume same-file churn happened and audit final file contents against actual dataset/reports, not against chat summaries.

## Navigation And Ambiguity Register

Project rule: if a future agent finds contradictory docs or cannot prove the ground truth from generated reports, source files, live checks, raw artifacts, tests, or official sources, record the ambiguity here or in the most specific audit doc. Do not choose a convenient value just to make prose consistent.

Current resolved cleanup from the June 13 documentation audit:

- The handoff had stale generated counts after INDY NXT weather enrichment. Generated reports now control the count: `data/career/reports/ingestion-summary.json` and `validation-report.json` show 181 weather/track-condition observations and 1,199 source evidence rows.
- Live-weather docs still described June 8 as the current state. June 13 checks now control the live-weather snapshot: Road America Race 1 and Race 2 are `forecast_window_open`; later 2026 INDY NXT events remain `too_far_for_event_forecast`.
- The local archive description needed a sharper split. `race_snapshots` contains newer stale top-series snapshots, but `bryce_samples` currently contains only six Bryce-valid INDY NXT WWTR samples from June 7-8, 2026.
- The timing feed description needed a stronger guard. Live timing is not Bryce data unless the shared predicate sees an INDY NXT heartbeat plus car `9` and either Race Control `DriverID=2143` or exact `Bryce Aron` timing-row identity.

Current unresolved or live-session-gated ambiguities:

- Race Control schedule and track-activity datetime strings lack explicit timezone offsets in the source JSON. Career importers have a documented normalization rule for imported canonical rows, but live UI route cards should continue to display/source-label times carefully until the Road America live-session proof confirms the intended live display semantics.
- Race Control exposes candidate fields such as `lapDistance`, `Tire`, `OverTake_Remain`, live diff fields, and running points. Cold samples do not prove these are meaningful for INDY NXT green-flag use. Keep moving-dot, tire/overtake strategy, and points-projection UI behind live Road America verification.
- The NTT prediction blob is reachable but currently a stale 2024 heartbeat. Its true live-race behavior is unknown until it wakes up during a relevant session; do not infer pit-prediction support from HTTP 200.
- Bryce-specific radio remains frequency metadata unless a legal, reliable live receiver/app route is proven per event/session. Do not generalize one successful future check across qualifying, Race 1, Race 2, or later venues.
- Arlington track direction is medium-confidence because it is inferred from official track-map turn sequence for a future temporary circuit. Keep that confidence label until stronger GIS or supplemental-regulation evidence exists.

## Audit Items Before More Feature Work

1. Re-run `npm run career:validate && npm run career:summary`.
2. Check `data/career/reports/validation-report.json` and `data/career/reports/ingestion-summary.json`.
3. Audit the 9 current gaps. The stale broad `gap_remaining_career_rows_*` entries have been collapsed to one current broad remaining-work row, and Formula Ford grid/start asymmetries are now a dedicated source-held-out gap. GB3 2021 Race 3 reverse-grid start positions are source-backed from official TSL grid PDFs, so the remaining gaps are source-specific or partial-source gaps outside that closed lane.
4. `npm run career:import:all` has been run twice consecutively and produced stable collection counts with validation passing. Keep this as a regression gate after importer changes.
5. Verify no importer silently drops cross-series Bryce identifiers or overwrites unrelated source-family rows.
6. Verify track metadata source provenance for all 42 tracks after future track imports. Current direction coverage is complete; Arlington remains medium-confidence because it is a future temporary circuit.
7. Session-time coverage is improved from 53 missing starts to 9 physical sessions, and weather-readiness now reports 307 precise-window sessions. Euroformula 2023 has 28 precise-window sessions from official Cronococa PDF timing rows; FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs; the other nine FROC test sessions have cached official Toyota test-day article context but still lack exact clock-time sources; INDY NXT has 111 source-backed exact physical-session windows, with 74 from cached official 2024-2025 weekend schedule PDFs and 37 from 2026 Race Control feeds. Race Control feed datetime strings are source UTC, then converted to canonical event-local timestamps. The remaining blocked rows in validation are FROC test sessions outside Round 2 that are absent from Toyota race-weekend schedule images and extracted official PDF links. `session_frp_f1600_2019_r1_03_qualifying` is not a missing window; it is a combined P1/P2 classification derived from `session_frp_f1600_2019_r1_01_practice_1` and `session_frp_f1600_2019_r1_02_practice_2`.
8. Audit reports/importers for stale counts in docs after future parallel edits.
9. `data/career/reports/indy-nxt-report-details-backfill-report.json` imports all 36 INDY NXT Race Lap Chart PDFs: 26 complete charts and 10 clean partial Race Lap Chart PDFs with explicit missing car-lap or official result/chart conflict diagnostics. The lap-chart parser now imports source-visible unlabeled lap-1 position-column samples when official chart headers begin at lap 2; this recovered 17 Portland 2024 Race samples and reduced that chart from 18 missing samples to 1. It also safely supplements selected partial chart parses with unique missing expected car-lap samples from alternate official PDF extraction candidates; this recovered Detroit 2024 Race 1 car 39 lap 2 from raw text while keeping the car 75 official result/chart conflict explicit. Remaining partial Race Lap Chart rows are mostly terminal-lap/result-count disagreements or cells not cleanly source-visible to the current raw/XML parser; do not fabricate them from result lap counts. Official Event Summary PDFs add 36 race-stat metric rows plus 35 most-improved racecraft rows with no Event Summary parser failures. Official Leader Lap Summary PDFs add 36 leader timing/margin/flag-state metric rows with no Leader Lap parser failures. Official Top Section Times PDFs now add 146 section-rank timing metric rows across practice, qualifying, and race sessions with no parser failures; one canceled 2025 Iowa qualifying PDF is held out because the official report has no section rows. Official Section Results PDFs now add 145 lap-by-lap section time/speed metric rows with no parser failures; `session_indy_nxt_2024_6325` Indianapolis Grand Prix Race 2 is held out because the official Section Results PDF URL returns corrupt non-PDF bytes, and one canceled 2025 Iowa qualifying PDF is held out because the official report has no section rows. Source-visible rows without canonical API timing rows remain unmapped diagnostics. Official race Results PDFs add 76 penalty/decision-summary rows and 64 caution-summary causal incident rows with no Results parser failures.
10. INDY NXT official EventsSessionDetails status labels now add 68 terminal-status incident rows: 55 contact, 11 mechanical, and 2 DNS. INDY NXT Results PDF caution summaries add 64 source-causal caution incident rows with official lap ranges and narrative text. Terminal-status rows intentionally do not infer lap number, causal narrative, or other-driver attribution.
11. INDY NXT detailed pit context is no longer a priority importer gap unless a new official source appears. Cached official SessionReports titles are Box Score, Combined Results, Event Summary, Lap Chart, Leader Lap Summary, Overall Results, Results, Section Results, and Top Section Times; none exposes a dedicated pit-summary or pit-lane sequence. Keep `pit_stop_counts` as production-safe counts and keep detailed pit context marked unavailable.
12. INDY NXT exact session windows are no longer a priority importer gap unless a new official source appears. Coverage remains partial at 111/189 exact physical-session windows, but all 78 remaining date-only rows are source-reviewed qualifying/group/combined qualifying sessions where official Race Control/weekend schedule sources expose only coarse qualifying blocks or no exact qualifying row. Keep these date-only and exclude them from session-hour weather/live-context joins.
13. INDY NXT Race Lap Chart partials are no longer a priority importer gap unless a better official PDF extraction/OCR path can recover source-visible cells without guessing. The coverage matrix keeps `lap_samples` partial for fidelity, but excludes it from `priorityGaps` because all 36 completed Race Lap Chart PDFs are imported and the remaining 10 partials are explicit missing car-lap or official result/chart conflict diagnostics.
14. The canonical INDY NXT detail gap now describes the residual Race Lap Chart partials precisely and marks detailed pit-lane sequence context source-unavailable. Use official/API pit-stop counts as the production-safe pit metric unless a new official pit-summary source appears.
15. `docs/INDY_NXT_DASHBOARD_READINESS.md` is the current UI-facing contract. It lists production-safe INDY NXT analytics, caveats, and categories that must stay out of production copy.
16. For live UI work, read `docs/LIVE_DATA_READINESS_AUDIT.md`, `docs/API_SERVICE.md`, `docs/SOURCE-INVENTORY.md`, and `docs/ANALYTICS_SOURCE_AUDIT.md` before designing screens. They define the live-source catalog, `/api/*` contracts, weather readiness, wrong-series guards, and fields that remain unavailable.
17. Do not use live weather to imply official series weather, track temperature, radar, or long-range event forecasts. Missing NWS numeric fields must remain `null`; do not coerce missing values to zero.
18. Do not build moving-dot, live track-map, tire/overtake strategy, or pit-prediction UI until Road America live-session proof shows populated INDY NXT fields. Current cold samples have `lapDistance=0`, tire `P`, overtake `0`, and no sector keys.

## Recommended Next Step

The next implementation pass should be UI V2 architecture and frontend data-adapter work, not another backend analytics sprint. Start by reading:

1. `analysis/ui-blueprint/README.md`
2. `analysis/ui-data-package/README.md`
3. `analysis/ui-data-package/ui-data-package.json`
4. `analysis/predictive-race-intelligence/output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md`
5. `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`
6. `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`
7. `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`

Highest-leverage next work:

- build a typed frontend adapter for the UI data package and context-pack refs,
- refresh the dynamic homepage around Road America Race Intelligence, Live Companion readiness, Race Debrief, Career Lab, and Source Ops,
- render visualizations from chart specs and context packs: prior-band interval, same-track vs road-course bars, analog race table, top-10 path checklist, lap-position line, caution-aware segment timeline, section-strength bars/heatmap, career parity heatmap, result-conversion scatter, and source/gap ledger,
- keep live mode fixture-backed until active INDY NXT green/yellow proof exists,
- rehearse Road America live proof with `npm run audit:live:pressure:primary` and `npm run poll:race:watch -- --interval-ms=1000` during practice/qualifying/race windows,
- after the session, add official-result/points reconciliation before calling any post-race points/replay state reconciled.

Suggested fresh-thread prompt:

```text
You are continuing BryceCast in /Users/example/Documents/Bryce POV access. Start by reading docs/CODEX_HANDOFF_CURRENT.md, README.md, docs/READINESS.md, docs/SOURCE-INVENTORY.md, docs/API_SERVICE.md, docs/ANALYTICS_SOURCE_AUDIT.md, and docs/LIVE_DATA_READINESS_AUDIT.md. For career-data or ingestion work, also read docs/PARALLEL_INGESTION_COORDINATION.md, docs/CAREER_DATA_SPEC.md, data/career/README.md, data/career/reports/validation-report.json, data/career/reports/ingestion-summary.json, and the relevant import reports under data/career/reports. Verify the true current dataset/live-source state from disk before editing. Treat chat summaries as lower authority than files, validation output, importer reports, raw artifacts, and rerunnable commands. Keep live Race Control/API/weather work separate from career ingestion. Preserve source provenance and rerun npm run career:import:all, npm run career:test, and npm run build after importer changes. For live/API changes, run npm run audit:sources, npm run weather:live, npm run weather:live:upcoming, npm run api:smoke, npm run build, and git diff --check; run npm run audit:live:pressure:primary when source cadence/reliability changes.
```
