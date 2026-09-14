# BryceCast Project Guide

## Canonical Product State

- `master` is the canonical product branch. Resolve its current checkout with
  `git worktree list` and confirm branch, HEAD, and dirty state before editing.
- The approved website baseline is exactly A2 + B + C + F2-F6. Brief D is
  intentionally excluded. Extend that baseline unless the owner explicitly
  authorizes a redesign.
- `/Users/example/Documents/Bryce POV access` is a saved checkpoint checkout
  and the operational home of the live runner and archive. Preserve its local
  edits and runtime state. Do not reset, stash, or use it as the frontend source
  merely because it is the familiar path.
- A matching Git commit does not prove that the public site, Mac mini checkout,
  SQLite archive, capture runner, or source data is current. Verify the state
  relevant to the task.

## Read By Task

Read this guide first, then only the contracts needed for the change:

| Work | Required context |
| --- | --- |
| Current product or branch status | `README.md`, `git worktree list`, `git status --short --branch`, and the local `master` ref; treat dated handoffs as evidence rather than current authority |
| UI metric, adapter, or displayed-state change | `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md` and `analysis/ui-data-package/README.md`; inspect the schema, relevant keys, and representative records rather than loading the full JSON package by default |
| API, cache, service, or ingestion change | `docs/API_SERVICE.md` and `docs/LIVE_RUNNER_RUNBOOK.md` |
| Live-race behavior or runtime recovery | `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`, `LIVE_DRILL_CLOSEOUT_2026-06-21.md`, and `LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md` |
| Source use, attribution, or redistribution | `docs/DATA_PERMISSIONS.md` |
| Predictive or calibration work | `docs/ML_RESEARCH_PLAN_2026-07-20.md` |
| Release or data refresh | `docs/operations/RELEASE_AND_DATA_REFRESH.md` |

`docs/FABLE_HANDOFF.md`, `docs/CODEX_HANDOFF_CURRENT.md`, and
`docs/PHASE3_HANDOFF_2026-07-19.md` are dated takeover/status provenance. They
are not startup checklists or current branch, deployment, or model-routing
authority.

## Product And Evidence Rules

- BryceCast is a Bryce Aron INDY NXT career analytics and live companion app.
- Keep typed package and adapter seams, source drawers, confidence and caveat
  labels, wrong-series guards, and explicit stale and unavailable states.
- Use `analysis/ui-data-package/ui-data-package.json`, referenced context packs,
  and runtime `/api/*` routes through typed adapters. Do not parse raw CSVs in
  React components when a package or context pack exists.
- Source capability is lane- and season-specific. Label the source tier on
  screen and follow `docs/DATA_PERMISSIONS.md` for use and redistribution.
  For 2024+, source-backed lanes include pit stop counts and laps, pit-lane
  start/finish crossings, historic per-second or event-driven timing,
  trackside weather and incident messages, incidents located between named
  timing loops, and timing-loop section times.
- Do not infer GPS or position between loops, instantaneous speed, physical
  proximity or contact, official series weather, or broad tire strategy. The
  `lapDistance` field is not GPS, payload speed is a per-lap average, and tire
  compounds are limited to the supported 2020-23 telemetry-variant seasons.
- Live #9 POV and isolated team-radio audio remain unavailable unless a later
  permissioned source proves otherwise.
- Do not publish calibrated finish, top-10, win, or probability claims until
  the complete gate chain in `docs/ML_RESEARCH_PLAN_2026-07-20.md` passes and
  the recorded owner and independent-review sign-offs are complete. Preserve
  model identities when a frozen experiment or comparison contract requires
  them.

## Live Runtime And Release Boundaries

- One long-running ingestor owns upstream polling, normalization, raw capture,
  SQLite and JSONL writes, latest-snapshot publication, and health status for a
  source family. API viewers read cached, latest, or archived state; direct
  upstream refresh is explicit operator or debug behavior.
- Do not add continuous duplicate pollers or monitors. For affected live work,
  retain lock, heartbeat, process-budget, quiet-log, and runner-only guards and
  use the Road America closeout and process-exhaustion RCA above.
- SQLite archives, raw captures, the durable data lake, credentials, and
  LaunchAgent state are operational data outside the Git release. Do not
  delete, overwrite, commit, or relocate them as part of repository cleanup.
- Releases use `docs/operations/RELEASE_AND_DATA_REFRESH.md`. The guarded path
  validates a candidate, exact release identity, rollback, and preservation of
  the runner, archive, and tunnel. Use its bundle-only mode before a real
  release when a dry preparation is needed. Never infer deployment from Git
  state alone.

## Execution And Verification

Use the configured capable model directly. Delegate bounded work when it
improves independence, capability, context management, or elapsed time. Give a
helper the objective, relevant contracts, constraints, and acceptance checks;
do not impose a stale product/model org chart. Use independent review for
consequential changes when it adds evidence.

Route checks by impact and keep these command names exact:

| Change class | Checks |
| --- | --- |
| Documentation only | `git diff --check` plus relevant path, link, and command-existence checks; no automatic app build |
| UI or data adapter | `npm run analytics:ui-data-package:validate`, `npm run analytics:view-models:validate`, `npm run test:ui-context-adapter`, and the affected tests; run `npm run build` for executable app changes |
| Broad app or live-readiness behavior | `npm run test:live-readiness` plus the relevant UI/data checks and `npm run build` |
| Live or API behavior | `npm run api:smoke`, `npm run audit:sources`, the affected live checks, and `npm run build` |

Before staging, inspect `git status --short` and include only task-owned files.
Do not deploy, push, change jobs, or mutate live state unless the task explicitly
authorizes that action.
