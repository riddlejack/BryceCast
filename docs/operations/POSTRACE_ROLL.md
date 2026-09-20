# postrace:roll — the guarded post-race roll-forward (Brief T)

`npm run postrace:roll` codifies the manual post-race chain from
`docs/archive/handoffs/PHASE3_HANDOFF_2026-07-19.md` §4.2 and `docs/archive/handoffs/PHASE3_BRIEFS_O_T_2026-07-19.md`
Brief T into one command that hard-stops on any failure and writes a run report.

It **never deploys** and **never touches LaunchAgents or the live runner**.
Deploy stays separate and gated: push `main`, then run the release driver from
the private companion repo (see
[Release and data refresh](RELEASE_AND_DATA_REFRESH.md)).

## Usage

```bash
# Point at a capture archive so standings bake into the package (required):
export BRYCECAST_SQLITE_PATH="$HOME/BryceCast/site/data/live/brycecast.sqlite"

npm run postrace:roll:dry     # validate preflight only — runs no pipeline steps
npm run postrace:roll         # run the full chain (hard-stops on any failure)
```

The archive is read **read-only** (SQLite header check + best-effort immutable
read); the roll-forward writes canonical data, analysis outputs, and the UI data
package into the working tree — never the live archive.

## Pipeline order

History runs **before** the package (the package inventories `history-bryce.json`).
The package step is the **only** step that carries `BRYCECAST_ALLOW_EVENT_ROLL=1`,
and the script sets it only after preflight passes.

1. `career:import:indy-nxt:refresh`
2. `career:backfill:indy-nxt-report-details:refresh`
3. `career:backfill:indy-nxt-session-windows:refresh`
4. `career:backfill:indy-nxt-weather:refresh`
5. `career:validate`
6. `career:summary`
7. `career:coverage`
8. `postrace:lake-sync`  ← acquire + validate timing archives and replay feeds
9. `analytics:timing-coverage`
10. `analytics:timing-coverage:validate`
11. `ingest:history`  ← standings, before the package
12. `analytics:ui-data-package:refresh-validate`  ← `BRYCECAST_ALLOW_EVENT_ROLL=1`

`PIPELINE_STEPS` in `scripts/lib/postrace-roll-core.mjs` is the authority; this
list mirrors it.

## Preflight (what `--dry-run` validates)

- The working directory is a BryceCast repo root with all 12 pipeline scripts.
- `BRYCECAST_SQLITE_PATH` is set, the file exists, and its header is a real
  SQLite database; `race_snapshots` is present (row count reported).
- `npm` is on PATH.
- Roll intent: reports the committed `asOfDate`, the next upcoming event, and how
  many events roll out of the upcoming set today.

Any blocking preflight check fails the run **before any pipeline step executes**.

## Hard-stop

Any nonzero step exit halts the chain immediately: the failing step is recorded,
every later step is marked `skipped-after-failure`, and the command exits with the
failing step's exit code. Network-dependent steps (the `:refresh` imports,
backfills, `ingest:history`) run for real — run this where the network is
reachable, not inside a sandbox without DNS.

## Manual follow-ups (the script deliberately does NOT do these)

- **Live-readiness upcoming-fixture migration** — the upcoming-event fixture in
  `scripts/test-live-readiness.mjs` pins the next venue (e.g. Portland → Milwaukee).
  A roll-forward moves it every time. Edit it by hand and re-run
  `npm run test:live-readiness`. The run report flags this every run; it is
  never auto-edited.
- **Deploy** — still separate and reviewed: push `main`, then the release
  driver in the private companion repo.

## Run reports

Written to `analysis/postrace-roll-reports/postrace-roll-<mode>-<timestamp>.{json,md}`
(git-ignored run logs). Each report carries preflight results, roll intent, per-step
status and exit codes, the upcoming-set diff (what rolled), the manual follow-ups,
and an explicit "never did" list.

## Phase 2 (later, not built here)

Brief T's phase 2 — auto-trigger on race-went-COLD + official-results-detected,
same gates, notify either way — is intentionally out of scope. This command is the
one-command manual spec; automating its trigger is a separate gated change.
