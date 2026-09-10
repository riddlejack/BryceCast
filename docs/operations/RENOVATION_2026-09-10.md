# BryceCast renovation — September 10, 2026

## Data now included

The canonical INDY NXT career contains 45 Bryce Aron race results: 14 in 2024, 14 in 2025 and 17 in 2026. The 2026 season ended September 6 with zero races remaining. The official season summary is P14, 298 points, eight top-ten finishes and a best finish of sixth.

| Newly imported race | Date | Start | Finish | Laps | Points |
| --- | --- | ---: | ---: | ---: | ---: |
| Portland | August 9 | 15 | 16 | 35 | 14 |
| Milwaukee | August 30 | 14 | 8 | 90 | 24 |
| Monterey Race 1 | September 5 | 7 | 6 | 35 | 28 |
| Monterey Race 2 | September 6 | 10 | 9 | 30 | 22 |

The official driver-history endpoint omitted Monterey Race 1. The importer now reconciles the schedule, session results and championship points before declaring the career current. Non-INDY NXT result and qualifying records were preserved.

Official section-report evidence supports qualifying analysis for all 43 races where qualifying was completed. Nashville 2024's interrupted/cancelled run remains available without an official qualifying classification. Iowa 2025 qualifying was cancelled before any laps occurred. Doubleheaders retain one physical qualifying run with separate official grid classifications: fastest versus second-fastest lap for road/street doubleheaders, and two-lap averages for ovals.

Every career race has an observed timing recording and a replay. The coverage ledger distinguishes 28 RaceTools race captures, 12 Timing71 normalized race archives and five direct Race Control race captures. Download links return the original published observation artifact as gzipped NDJSON, independently of the derived replay. The verified local database backup also yielded native Nashville 2026 race, Portland qualifying and Milwaukee qualifying recordings; those now take precedence over their supplemental Timing71 archives.

## What “second by second” means

Recorded timing/display updates are not GPS, steering, brake or throttle telemetry. Native observations retain source timestamps. RaceTools uses a session-local feed clock; its legacy ISO-shaped timestamps do not establish UTC. Reconstructed replay frames are labelled as derived observations, with no more than a five-second source hold.

The latest four races have roughly one-second active-racing capture cadence; the largest active gaps are 1.389 seconds at Portland, 2.153 at Milwaukee, 2.214 at Monterey Race 1 and 2.157 at Monterey Race 2. Slower terminal/checkered polling is identified separately.

Mid-Ohio 2025 has a 436-second primary-source gap during a red flag. A separate Timing71 recording covers that interval at a two-second median/four-second maximum cadence, but does not cover the full race. It remains supplemental evidence. The primary replay withholds 430 seconds after its five-second hold; both the API and player expose the gap instead of inventing position changes.

Monterey 2026 qualifying Group 2 has sparse early observations: the old recorder remained in Group 1's cooldown when Group 2 started. The recorder now exits cooldown immediately on a new live session ID. The historical 15-second observations cannot be retroactively upgraded into measured one-second samples.

## Product and runtime repairs

- Permanent track/year browsing exposes historical visits independently of the current-season upcoming list.
- Qualifying lap selection uses the actual official lap numbers and displays section times, comparison denominators and source limitations.
- Physical qualifying lap maps now cover 44 of the 45 race pages, including Nashville’s interrupted run. Iowa 2025 has no map because no qualifying laps occurred. Indianapolis uses a corrected trace of the official 2.439-mile timing map, with all 13 section boundaries. The timing matrix remains available alongside the map.
- The championship panel uses the official standings rather than a stale captured leaderboard.
- Visible result counts and freshness identify what season has been loaded.
- An empty upcoming schedule is a valid completed-season state throughout analytics and validation. Historical Road America context remains historical.
- Runtime weather uses a compact canonical calendar and the event venue's timezone, including the final event day.
- An idle but healthy recorder returns normal pre-session readiness; a missing/overdue recorder remains distinguishable.
- Public mutation routes require operator authorization. Cloudflare's loopback connection does not confer local operator access.
- Replay source gaps produce structured HTTP 409 responses with the next observed timestamp. They cannot fall through to stale or unrelated live data.
- Canonical race replay links resolve to the preferred watchable recording, including native database captures with a different internal session key.
- Native replay exports have distinct artifact paths, so a reconstructed archive cannot overwrite a captured feed. Validation checks source hashes, timestamp windows and every replay row's source/interpolation labels.
- Parsed replay rows use a small LRU cache rather than retaining all 45 expanded race feeds indefinitely.
- A missing optional capture database does not take down the server or disable committed historical replay feeds.

## Update and release workflow

See [Release and data refresh](RELEASE_AND_DATA_REFRESH.md). `postrace:roll` now includes archive acquisition, source identity gates, replay rebuilding, the coverage ledger, official standings/history and final UI package generation in dependency order. Missing newly published archives remain explicit rather than blocking otherwise valid official results.

The deployment path uses SSH, verified Git bundles, locks on both machines, a candidate build, source/data validation, exact release identity checks and rollback. Recorder code changes are loaded only after checking that the recorder is idle. The existing Cloudflare tunnel and capture database are retained.

## Local recovery and branch state

The working release branch is `codex/brycecast-season-refresh`, based on production `d9a4128651c6f79a1f7b1b6fc064a1f856be6367`. Production remains `master`. Before release, all 54 local branches were inventoried: only the old `codex/brycecast-ui-v2-checkpoint` contained unique commits relative to that production base. Its unfinished changes and untracked car art were preserved.

Recovery files live at `~/.brycecast/backups/2026-09-10`. They include a verified all-ref Git bundle and the old UI patch/art. Those Git recovery files also reside on the Mini. A consistent SQLite online backup of the Mini's 12,807,802,880-byte database is now local, with 34,735 snapshots and a successful SQLite quick-check. Its SHA-256 is recorded in `mini-capture-verification.json`.

The historical raw lake is local at `~/.brycecast/data-lake`. The prepared analytics runtime is at `~/.brycecast/runtime/analytics`.

GitHub is not the current production source of truth: the configured private remote was empty and local GitHub authentication was invalid at audit time. The existing history also contains blobs above GitHub's normal 100 MB file limit. Publishing that history requires a deliberate large-file migration and valid Git authentication; the verified local/Mini release and recovery bundles preserve it meanwhile.

## Declared source limitations

The official Section Results PDF for 2024 session 6325 is corrupt; the pipeline records that condition. Twelve lap charts carry partial-source diagnostics. Sixty-three ambiguous post-limit report rows are retained as unresolved evidence; proven repeated/sparse terminal rows are excluded from completed-lap facts. Source-visible names without matching canonical API rows retain null IDs rather than guessed identities.

The per-session coverage ledger and source evidence are the detailed authority; a session being present does not imply uninterrupted one-Hz coverage.
