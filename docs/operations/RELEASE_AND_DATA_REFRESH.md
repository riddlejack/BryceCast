# BryceCast data refresh and release

The live website is https://brycecast.com. The production host serves a committed `main` checkout; its capture database is separate runtime state at `data/live/brycecast.sqlite`. The app, capture runner, and Cloudflare tunnel are separate LaunchAgents.

## Repository topology

This repository is the single BryceCast codebase. There is no second source of truth: production fetches `main` from here and builds it.

Some of what the running site and the data pipeline need cannot be published — the raw career corpus, the canonical dataset, the timing captures and replay feeds, and the deployment tooling that names real hosts. Operators keep that material in a **private companion repository** which is *overlaid* onto a checkout of this one: its git directory lives at `<checkout>/.private.git` while its work tree is the checkout itself, so both repositories see the same files and neither tracks the other's.

Every path the private repo tracks is matched by this repository's `.gitignore` — the entries under "Private companion repo", plus the publication boundary above them. That is what keeps `git status` clean on a production checkout, which the release process requires.

Consequences for a reader of this repository:

- `npm run build` needs nothing private (verified: the three files `src/` imports from outside `src/` are all tracked here).
- Running the API server and refreshing the data do need private files. Without them the site builds and serves, but `/api/weather/*`, replay playback and the post-race roll have no inputs.
- **Deployment tooling is not here.** `ops/` and `scripts/deploy-to-mini.mjs` live in the private repo; they are ignored by this one. Nothing in `package.json` invokes them.

## Refresh data

Run `npm ci` and `npm run analytics:setup` once to prepare local dependencies. The Python runtime lives at `~/.brycecast/runtime/analytics`, with versions recorded in `analysis/requirements.txt`. Use a clean worktree based on the current production commit. Preserve any unfinished user work in other checkouts.

1. `npm run postrace:roll:dry` checks the environment. SQLite is optional because official championship standings are authoritative. An explicit `BRYCECAST_SQLITE_PATH` is validated and read only.
2. `npm run postrace:roll` runs the complete chain: official results and reports, weather, timing archive acquisition and validation, replay feeds, timing coverage, history, and the final UI artifact graph. The importer reconciles completed scheduled race sessions against the official session endpoint; the driver's year-history endpoint alone can omit races.
3. Review the source coverage ledger. Export new direct captures with `npm run analytics:live-captures:export` where appropriate, then repeat the refresh. A source label containing “NXT” is insufficient: some mislabeled archives contain INDYCAR drivers. Qualifying group size is not a whole-field race-size gate.
4. Build and run the relevant regression checks. Verify desktop and mobile race navigation, qualifying lap selection, doubleheader grids, historical track access, and source limitations.

For a targeted UI-only rebuild, use `BRYCECAST_ALLOW_EVENT_ROLL=1 npm run analytics:ui-data-package:refresh-validate`. History and timing coverage must already be current. Never patch an integrity hash by hand.

The durable lake default is `~/.brycecast/data-lake`; `BRYCECAST_LAKE_DATA_ROOT` can override it. Keep raw timing archives private and outside Git. Content-addressed manifests preserve their identities. A missing source is recorded as missing, not replaced with invented observations.

## Publish

Commit the reviewed change, merge it into `main`, and push. The push *is* the release candidate: production fetches this repository rather than receiving a bundle.

An operator with the private companion repo then runs its release driver, which refuses unless the local branch is `main`, the tree is clean, and `HEAD` already equals the pushed `main` — so nothing unreviewed or unpushed can ever reach production. It reports CI status for the commit as a warning, then runs the updater on the production host pinned to that exact sha (`--expect <sha>`, which replaced bundle verification as the integrity guard). The updater:

- takes a release lock and refuses an uncommitted or divergent production checkout;
- preserves a backup Git ref;
- builds and validates the incoming commit in a temporary worktree;
- publishes only after the candidate passes;
- restarts `com.brycecast.app-server`; when recorder code changed, it also restarts `com.brycecast.live-runner` after verifying a fresh idle status;
- verifies the exact commit through `/api/health.release` and restores the prior commit/build if that check fails.

The previous built release is retained under `.dist-before-<timestamp>` beside the checkout. Live SQLite, raw captures, and tunnel credentials are preserved. The tunnel process is left running. An idle recorder restart loads recorder fixes without waiting for a reboot. A Git backup does not back up the SQLite database.

After the health check passes, the updater refreshes the private overlay on the production checkout. A failure there is reported loudly and carried in the exit code, but never rolls back a site that is already healthy on the new commit.

Successful releases also back up and replace the operator's copy of the updater. Direct host-side use requires an explicit `--expect <sha>`; `--latest` exists but must be passed deliberately.

### Automated publication

`scripts/postrace-auto.mjs` accepts `--publish=github`: after the gates pass and the working tree is clean outside the generated-data allowlist, it fetches, proves the push would fast-forward, commits the allowlisted paths on `main`, pushes, pushes the private overlay if one is attached, and finally runs `BRYCECAST_PRODUCTION_UPDATE_CMD` with the pushed sha. It refuses to publish from any branch but `main` and never force-pushes. `--publish=none` remains the default and is what the installed LaunchAgent uses.

## Runtime safeguards

An idle runner polls every five minutes. `/api/readiness` returns a normal pre-session state while its idle status is fresh, with no stale timing rows promoted to live data. A missing or overdue runner remains an error.

Public POST requests require `BRYCECAST_OPERATOR_TOKEN` as a bearer token. Direct command-line requests on the machine can use a loopback host without a token. Browser requests and proxied requests—including Cloudflare's loopback connection—do not receive local operator privileges. Runner-only mode refuses a competing API upstream refresh even for an operator.

The compact canonical calendar at `public/data/indy-nxt-calendar.json` is independent of the date-filtered upcoming analytics list. Runtime weather keeps an event available through its final day in the venue's timezone.

## Interpreting timing and qualifying

Native observations are downloadable from `/api/timing-archive/<canonicalSessionId>/observations` as gzipped NDJSON. The endpoint resolves only published artifacts from the coverage ledger. Native observations retain their original timestamps. A one-second replay frame created between source observations is interpolated and explicitly labeled; it is not another measured sample. Timing-loop section times and display-state recordings are not GPS or pedal/speed telemetry.

Supplemental recordings use the same endpoint with `?source=<sourceSessionId>`. The selector resolves only an exact source listed for that canonical session; unknown, cross-session, or path-like selectors are refused. Supplemental recordings remain separate files with their original clock basis.

Each physical doubleheader qualifying run links to both races, with each race's own official grid classification. Road/street doubleheaders use the fastest lap for Race 1 and second-fastest for Race 2. Oval two-lap classification stays distinct. Qualifying cancellation is not a missing-results error: interrupted Nashville 2024 lap evidence is retained without a qualifying rank, while Iowa 2025 has no qualifying run.

Qualifying section comparisons rank Bryce's selected section against each other driver's best comparable section on a lap within 6% of that driver's fastest recorded lap in the same group. This is a section benchmark across laps, not a single hypothetical opponent lap. The lap-time filter does not prove green flags or clear air. Track shading requires supported geometry; source gaps remain visible.
