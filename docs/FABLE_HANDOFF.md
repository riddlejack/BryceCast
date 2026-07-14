# Fable Handoff For BryceCast

Updated: 2026-07-13 21:22 CDT.

## July 13 Night Closeout — Read This First

The current authoritative review build is no longer the older branch described
later in this historical handoff.

- Worktree: `/Users/example/.codex/worktrees/ac78/Bryce POV access`
- Branch: `codex/integrate-brief-c-live-f6`
- Current implementation commit: `581925f62d86e39470fd63acbe6aab18bd41b9fc`
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
for the night. LaunchAgent plist files remain installed but were unloaded only
for the current login session, so they may load on a future login. The old
production API on port 8787 was consuming approximately one full CPU core at
closeout; investigate that before restoring it for an extended run.

Tomorrow's isolated review commands are:

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

Open `http://127.0.0.1:5181/live`. Review/promote this branch; preserve the
unrelated edits in the main checkout and do not integrate Brief D by default.

This is the entry document for dropping Claude Fable 5 into this repo through
Claude Code and letting it drive the next product/build phase while using Codex
GPT-5.5 as the execution and verification worker.

## Verbatim Vision

Jack's current direction:

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

Interpretation for Fable: own the product direction and visual design, but keep
the backend/data contracts strict. The current frontend can be replaced. The
source-backed data system cannot be hand-waved.

## Local Setup Verified

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

Practical conclusion: use the official plugin first. Do not invent a copy/paste
workflow. The plugin is already installed and now current enough to transfer a
Claude session into Codex when needed.

## Fable Operating Pattern

Use Fable as:

- Product owner and design lead.
- Long-context project reader.
- UI taste arbiter.
- Final synthesizer over worker outputs.
- Source-claim reviewer.

Use Codex GPT-5.5 as:

- Execution worker for well-scoped implementation tasks.
- Backend/test runner.
- UI verification and computer-use worker.
- Independent senior review of Fable's plans and diffs.
- Rescue worker when Claude Code is stuck or the task is terminal-heavy.

Do not use Codex as a vague planner. Give it a bounded prompt with exact files,
commands, and acceptance criteria.

## Claude Code Commands

Start Fable in this repo:

```bash
cd "/Users/example/Documents/Bryce POV access"
env -u CLAUDE_CODE_EFFORT_LEVEL claude --model fable --effort high --dangerously-skip-permissions
```

Use `--effort max` only for major irreversible architecture/product decisions
or if the session has enough Fable quota. Recent high-signal X workflow posts
generally prefer Fable on `high` for sustained work and escalate only when the
output needs it. If an existing Claude session says
`CLAUDE_CODE_EFFORT_LEVEL=max overrides this session`, exit and relaunch; `/clear`
does not change a running process environment.

Inside Claude Code:

```text
/codex:setup
/codex:rescue --background implement the bounded task described below...
/codex:status
/codex:result
/codex:review
/codex:adversarial-review --background review this plan for source/data risks...
/codex:transfer
```

For large frontend work, Fable should write the product/design brief and
component contract, then delegate discrete implementation slices to Codex.
Fable should review screenshots, source states, and final UX itself before
declaring the UI good.

## Reading Order For Fable

Read these first:

1. `CLAUDE.md`
2. `docs/FABLE_HANDOFF.md`
3. `README.md`
4. `docs/README.md`
5. `docs/CODEX_HANDOFF_CURRENT.md`
6. `LIVE_DRILL_CLOSEOUT_2026-06-21.md`
7. `LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md`
8. `docs/API_SERVICE.md`
9. `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`
10. `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`
11. `analysis/ui-data-package/README.md`
12. `analysis/ui-data-package/ui-data-package.json`
13. `analysis/ui-blueprint/README.md`
14. `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`
15. `analysis/external-review-pack/PROJECT_BRIEF.md`
16. `analysis/external-review-pack/DATA_CAPABILITY_CATALOG.md`
17. `analysis/external-review-pack/ANALYTICS_INVENTORY.md`
18. `analysis/external-review-pack/VISUALIZATION_OPPORTUNITY_MATRIX.md`

Treat older MagicPath visual docs as rejected/legacy unless Jack explicitly asks
to revive them.

## Current Product Truth

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

- Fable may replace the current frontend design.
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

## Delegation Recipes

Implementation task:

```text
/codex:rescue --background Read CLAUDE.md, docs/FABLE_HANDOFF.md, docs/UI_ANALYTICS_PRODUCT_CONTRACT.md, and src/data/uiContextAdapter.ts. Implement <specific slice>. Preserve source-state semantics. Do not parse raw CSVs in React. Run <commands>. Return changed files, verification output, and any unresolved risks.
```

Independent review:

```text
/codex:adversarial-review --background Review the current plan/diff for source-backed-data regressions, unsupported live claims, frontend state gaps, and missing tests. Prioritize bugs and behavioral risks with file/line references.
```

Final pre-ship review:

```text
/codex:review
```

Continue Codex work in Codex directly:

```text
/codex:result
/codex:transfer
```

Then resume the returned Codex session with:

```bash
codex resume <session-id>
```

## Starter Prompt For Fable

Paste this into Claude Code after starting with `env -u CLAUDE_CODE_EFFORT_LEVEL claude --model fable --effort high --dangerously-skip-permissions`:

```text
You are Claude Fable 5 leading BryceCast. Read CLAUDE.md and docs/FABLE_HANDOFF.md first, then follow their reading order.

Your job is to take over the project direction and build the next BryceCast product. Use your own frontend taste and discretion. The current React UI is not sacred and can be redesigned or replaced. The data/source contracts are sacred.

Preserve the product truth: BryceCast is a Bryce Aron INDY NXT and career analytics/live companion app. Build source-backed race-week prep, live companion/readiness, post-race debrief, Career Lab, and Source Ops surfaces. Do not invent live POV, team radio audio, GPS, official weather, pit/tire/overtake strategy, or calibrated predictions.

Use Codex GPT-5.5 through the official Claude Code Codex plugin as your execution/review worker. When you would normally spawn a subagent for implementation, tests, computer-use verification, or independent review, use /codex:rescue, /codex:review, or /codex:adversarial-review with a self-contained prompt. You own final synthesis and final product judgment.

First, produce a concise plan for the next frontend/backend architecture pass. Then execute it end to end, delegating bounded tasks to Codex where useful. Validate with the relevant npm scripts and screenshots/QA for frontend work.
```

## X MCP Notes

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

Current blocker for first-run `xurl mcp` auth on this Mac:

- `127.0.0.1:8765` is occupied by an ArcWiki Python server.
- The auto-improvement `.env.local` has X OAuth app/token values.
- Direct X API recent search works with the existing token.
- To make `xurl mcp` cleanly available to Claude Code, either stop the process
  on port 8765 before first auth or configure/use a registered redirect URI on
  an open localhost port, then run `xurl auth oauth2 --headless` or complete the
  browser flow once.

Do not commit secrets into this repo. Use environment variables or user-level
Claude/X config.
