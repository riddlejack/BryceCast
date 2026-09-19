> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# Fable Handoff For BryceCast

Archived takeover packet. Last updated 2026-07-18 15:15 EDT. This document
records the July product takeover, setup, and incident history; it is not the
current startup checklist or model-routing contract. Current work starts from
`AGENTS.md` and follows its task map.

## July 18 Canonical Baseline Ruling

Repository consolidation supersedes the old July 13 branch and frontend-reset
instructions below.

- Canonical branch: `master`.
- Approved baseline: the integrated A2 + B + C + F2-F6 website; Brief D remains
  intentionally excluded.
- Pre-consolidation baseline tag:
  `brycecast-pre-consolidation-20260718T184926Z`.
- Resolve the current canonical worktree with `git worktree list`; do not assume
  the former `ac78` feature worktree or the dirty ordinary checkout is the
  development source.
- `/Users/example/Documents/Bryce POV access` remains the live runner and
  canonical archive path. Its checkpoint branch and dirty state are preserved
  operational state, not the frontend baseline.
- Extend and refine the approved UI. Do not “disregard,” replace, or restart the
  frontend unless Jack makes a new explicit product decision.
- Continue to preserve typed package/adapter seams, source drawers, confidence
  language, wrong-series guards, stale states, and unavailable states.

The historical verbatim vision and July 13 commands later in this file explain
how the integrated site was reached; they are provenance, not current execution
instructions.

## July 13 Night Closeout — Historical Provenance

The review build described below was authoritative on July 13 and was later
superseded.

- Worktree: `/Users/example/.codex/worktrees/ac78/Bryce POV access`
- Branch: `codex/integrate-brief-c-live-f6`
- July 13 implementation commit: `581925f62d86e39470fd63acbe6aab18bd41b9fc`
- Integration parent: `95d280e4dd8b2e2b9ee132bd5c858be636e9befb`
- State: saved locally and clean; not merged, pushed, or deployed.

This is the cohesive A2 + B + C + F6 site. Brief D is intentionally excluded.
The final July 13 live-view follow-up gives the nearby running-order lines
stable neutral solid/dashed/dotted/dash-dot identities, matching right-edge
swatches, and touch/focus affordances while keeping Bryce as the only gold
trace. Validation passed for running-order (44 assertions), live motion (56),
replay (16), TypeScript, production build, and `git diff --check`.

The one inherited exception is
`npm run analytics:ui-data-package:validate`: the F6 baseline already contains
a stale generated source-reference hash for unchanged `scripts/api-server.mjs`.

All local BryceCast production/review/replay/monitoring processes were stopped
for the night. The July record says the LaunchAgent plist files remained
installed but were unloaded for that login session. This is not a current
runtime claim. The old production API on port 8787 was consuming approximately
one full CPU core at closeout.

The July 14 planned isolated review commands were:

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

Then optionally pin the deterministic window with:

```bash
curl -fsS 'http://127.0.0.1:8795/api/replay/control?session=5544-6761&t0=2026-07-04T17%3A20%3A20.000Z&speed=1'
```

The July note then directed the reviewer to open
`http://127.0.0.1:5181/live` and review that branch. The URL, worktree, and
promotion instruction are historical. The durable rules are to preserve
unrelated edits and keep Brief D excluded.

The sections below record the July takeover context. Current product and
execution decisions come from `AGENTS.md` and the affected contract.

## Historical Verbatim Vision

Jack's July takeover direction:

> What I want to do is to give Fable key documents to read and just have it take
> over and drive and build out the project from here. Get from where we're at
> with all of the data and everything and just use its discretion to decide how
> to design the UI, which key figures to show, how to design everything on the
> front end, etc., and just kind of take over and drive the project.

> I still want it to utilize u/gpt5.5 as the execution agent. What I want you to
> do first is to figure out how to allow or enable Fable to utilize Codex inside
> of the Codex plug-in for Claude Code.

> I'm fine if Fable is the one doing the coding because it has better front-end
> taste. Also it should be prompted to just basically disregard the current
> front-end work that we've done because I don't really love it as is. Also it
> should be prompted to use its own discretion. I'm basically just having it use
> 5.5 agents as execution for any tasks that it would normally use a subagent for.

The July interpretation allowed a frontend replacement while keeping the
backend and source contracts strict. The replacement authorization is now
superseded by the approved A2 + B + C + F2-F6 baseline in `AGENTS.md`.

## Historical Local Setup Snapshot

The versions, aliases, plugin state, and model defaults in this section were
observed on 2026-07-02. They are preserved as provenance and must not be used as
current routing instructions without a fresh check.

Verified on this Mac on 2026-07-02:

| Item | State |
| --- | --- |
| Claude Code | `2.1.198` |
| Claude model alias | CLI supports `--model fable` / `claude-fable-5` |
| Claude default effort | `high`; no `CLAUDE_CODE_EFFORT_LEVEL=max` override |
| Claude bypass launch | Use `--dangerously-skip-permissions`; dangerous-mode prompt skip is enabled in user settings |
| OpenAI Codex plugin for Claude Code | `codex@openai-codex`, user scope, enabled |
| Codex plugin version | Updated from `1.0.4` to `1.0.5` |
| Codex plugin commands | `review`, `adversarial-review`, `rescue`, `status`, `result`, `cancel`, `setup`, `transfer` |
| Codex CLI | Updated to `0.142.5` |
| Codex auth | Configured through ChatGPT auth |
| Codex default model | `gpt-5.5` |
| Codex default access | `sandbox_mode = "danger-full-access"`, `approval_policy = "never"` in user config |

The plugin uses the local Codex CLI/app-server runtime, local Codex auth, local
Codex config, and the same repo checkout. A separate OpenAI account is not
needed when Codex is already signed in.

## Research Findings

Primary sources:

- OpenAI's `openai/codex-plugin-cc` repository says the plugin lets Claude Code
  users use Codex for reviews and delegated tasks. Its documented commands
  include `/codex:review`, `/codex:adversarial-review`, `/codex:rescue`,
  `/codex:transfer`, `/codex:status`, `/codex:result`, and `/codex:cancel`.
- OpenAI's developer community announcement says the plugin delegates through
  the local Codex CLI and Codex app server, using the same local auth, config,
  environment, and MCP setup.
- Anthropic's Fable 5 docs describe Fable as the generally available
  Mythos-class model for long-horizon agentic work, available in Claude Code,
  with 1M context and up to 128k output.

X research:

- X MCP was not exposed as a callable tool in this Codex session. I attempted
  `npx -y @xdevplatform/xurl mcp https://api.x.com/mcp` using the existing X
  OAuth app credentials from the auto-improvement env. The bridge reached the
  OAuth path but failed because `127.0.0.1:8765` is already occupied by an
  unrelated ArcWiki Python server:
  `surfaces/atlas/server.py --port 8765`.
- The existing X OAuth access token works directly against X API read endpoints.
  Recent X search was used for live workflow research; full-archive direct
  search failed with user-context OAuth because that endpoint requires
  application-only auth.
- Highest-signal X result: Theo (`@theo`, about 351k followers on 2026-07-02)
  posted that he uses Fable with Codex for the things Codex is better at:
  computer use, UI/UX verification, and efficient execution on well-specified
  work. His attached `CLAUDE.md` screenshot routes bulk/mechanical work to
  GPT-5.5 through `codex exec` / `codex review`, keeps user-facing UI/copy/API
  design on higher-taste models, and treats Codex as a strong independent
  perspective.
- Other recent X posts broadly repeat the same pattern: Fable as orchestrator,
  Opus/Sonnet for Claude-native subagents, and Codex/GPT-5.5 as a peer senior
  engineer or execution worker. Most low-follower posts should be treated as
  weak corroboration, not source of truth.

At the time, the official plugin was selected over a copy/paste workflow. That
setup conclusion is not current configuration evidence.

## Historical Fable Operating Pattern

The July takeover assigned product/design synthesis to one model and bounded
implementation, test, UI verification, and independent review to another. That
fixed model pairing is retired. Current work uses capability-based routing from
`AGENTS.md`; frozen experiment and independent-review identities remain governed
by their own contracts.

## Historical Claude Code Commands

The July launch flags and plugin commands were environment-specific. They are
available in Git history if the takeover setup itself must be reconstructed;
they are intentionally absent from the current operating route.

## Conditional Reading Map

Use `AGENTS.md` as the maintained map. Read `README.md` for product orientation
and use relevant sections of `docs/archive/handoffs/CODEX_HANDOFF_CURRENT.md` only as dated
evidence. Read the UI analytics contract for metric or adapter work;
`docs/operations/API_SERVICE.md` and
`docs/operations/LIVE_RUNNER_RUNBOOK.md` for API or ingestion work; and the live product
contract plus `docs/archive/live-drills/LIVE_DRILL_CLOSEOUT_2026-06-21.md` and
`docs/archive/live-drills/LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md` when changing live behavior.
Use `docs/publication/DATA_PERMISSIONS.md` for source use and the ML research plan for
prediction or calibration work. Inspect the UI package schema, relevant keys,
and representative records instead of loading the full payload by default.

Older MagicPath visual docs remain rejected or legacy unless Jack explicitly
asks to revive them.

## Maintained Product Baseline

BryceCast is a Bryce Aron racing analytics and live companion product. The core
app should cover:

- Race-week prep.
- Live companion/source readiness.
- Bryce-focused timing and race state.
- Post-race debrief.
- Career Lab.
- Source Ops / provenance.

The strongest product opportunity is not a generic racing dashboard. It is a
polished Bryce-centric product that makes race weekends legible: what matters
before the session, what is happening live, how Bryce is trending, what changed,
and why the user should trust each number.

Frontend direction:

- Preserve the approved A2 + B + C + F2-F6 frontend. A redesign requires a new
  explicit owner decision; Brief D remains excluded.
- The first screen should be the actual BryceCast experience, not a marketing
  landing page.
- Use the existing data package, context packs, and runtime API contracts as the
  foundation.
- Keep the UI dense enough for real race use, but polished enough for family,
  serious fans, and Bryce-facing users.
- Build explicit source states and unavailability states into the visual system.

## Live Data Truth After Road America

Older live docs from June 13 say active green-flag proof was still blocked.
That is stale after the June 21 Road America live drill. The post-race closeout
now controls the live-readiness interpretation.

High-confidence live capabilities proven at Road America Race 2:

- 1-second Race Control polling can work.
- Primary Race Control pressure: 300/300 requests successful.
- All-source live pressure: 270/270 requests successful.
- Normal poller captured 1,175 Race 2 rows.
- Emergency 1-second capture captured 599 rows with 0 endpoint failures.
- SQLite archive and JSONL/latest snapshot publication worked.
- Bryce identity guard worked for car #9 / DriverID `2143`.
- Live rank/lap/gap/best-lap/overtake/points fields were observed.
- Post-race final COLD state was captured: Bryce P11, lap 18/18, running points
  159.

Critical caveat:

- The upstream data did not fail. The local operator setup did. macOS hit a
  process creation limit (`Resource temporarily unavailable (os error 35)`)
  while CPU/RAM were fine.
- There is an 851.078 second combined archive gap from lap 17 live to the later
  final COLD snapshot, so we do not have a continuous final-lap micro-timeline.
- The next live architecture must use one quiet ingestor/cache process, not many
  terminal sessions, browser monitors, REPL monitors, and pressure tests.

Required next backend/live architecture before the next race weekend:

- One long-running ingestor owns upstream polling, raw capture, normalization,
  SQLite writes, JSONL writes, latest snapshot publication, and health/status.
- API routes read cached/latest/archive state by default.
- Direct upstream refresh is explicit admin/debug behavior.
- Add lockfile, heartbeat/status file, process-budget preflight, and quiet logs.
- Keep pressure tests finite and scheduled.

## Data Guardrails

Hard constraints:

- Live #9 POV is out of scope unless a rights-holder/team-approved stream is
  explicitly offered later.
- Isolated team radio audio is unavailable unless a reliable legal receiver/app
  route is proven. Radio frequency metadata alone is not audio.
- NWS weather is ambient near-track weather, not official INDY NXT weather or
  track temperature.
- No live GPS/moving-dot UI unless a validated coordinate/lap-distance mapping
  exists.
- No detailed pit sequence, tire strategy, fuel strategy, or overtake strategy
  unless Race Control or another official source proves fields are populated and
  semantically meaningful for INDY NXT.
- Predictive content is historical prior bands, top-10 path language, analog
  races, and source-bounded context. Do not publish expected finish, win/top-10
  probability, betting line, or causal model claims.

## Maintained Delegation Rule

Use the capability-based rule in `AGENTS.md`. When delegation is useful, give
the helper a bounded objective, the affected contracts, preserved source-state
semantics, exact acceptance checks, and the paths it must not change. Select an
independent reviewer when the decision benefits from independent evidence.

## Retired Starter Prompt

The July starter prompt is retired because it required the full takeover reading
cascade, fixed model roles, and permission to replace the frontend. Start from
`AGENTS.md` and the affected contract instead.

## Historical X MCP Notes

The pasted attachment in this Codex task is the X MCP documentation index.
Relevant setup path:

```json
{
  "mcpServers": {
    "xapi": {
      "command": "npx",
      "args": ["-y", "@xdevplatform/xurl", "mcp", "https://api.x.com/mcp"],
      "env": {
        "CLIENT_ID": "YOUR_X_APP_CLIENT_ID",
        "CLIENT_SECRET": "YOUR_X_APP_CLIENT_SECRET"
      }
    }
  }
}
```

The July blocker for first-run `xurl mcp` auth on this Mac was:

- `127.0.0.1:8765` is occupied by an ArcWiki Python server.
- The auto-improvement `.env.local` has X OAuth app/token values.
- Direct X API recent search works with the existing token.
- To make `xurl mcp` cleanly available to Claude Code, either stop the process
  on port 8765 before first auth or configure/use a registered redirect URI on
  an open localhost port, then run `xurl auth oauth2 --headless` or complete the
  browser flow once.

Do not commit secrets into this repo. Use environment variables or user-level
Claude/X config.
