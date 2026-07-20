# Execution Charter — 2026-07-20 (the full-vision run)

Jack's standing directive, recorded verbatim in intent. This document is the
controlling contract for the long-running execution phase. A Fable session
resuming mid-run reads THIS, the task board, and `docs/FABLE_LESSONS.md`
before acting. It supersedes nothing in the constitution (charters, laws,
DESIGN_TASTE) — it adds the operating mode.

## Approvals (all granted 2026-07-20, do not re-ask)

- **Every open task and idea on the board is APPROVED.** All workstreams.
  Assume approval for anything already recorded as project vision. Do not
  re-litigate direction that prior Fable sessions established.
- **Brief O relaunch: approved.**
- **RaceTools: fully cleared.** Jack personally called the published contact
  number, explained the use (a site for one of the INDY NXT racers), and was
  enthusiastically approved — "this is the exact reason they post this stuff
  publicly." Verbal permission confirmed by Jack directly; contact email/phone
  available from Jack for the documentation email (task #38 = hygiene, not a
  gate). RaceTools-related follow-through is approved, including checking
  2026 log coverage.
- Token spend: generous. Redundant review passes are explicitly desired.

## The operating pipeline (every feature, no exceptions)

1. **Opus 4.8 worker builds** in an isolated worktree from a self-contained
   brief (July 12 charter Global Rules bind every worker; brief must carry
   exact values — curves, hexes, thresholds).
2. **Codex (gpt-5.6-sol, xhigh) design-review pass** on the work product —
   diff + screenshots — BEFORE the director gate. Not framed as adversarial;
   framed as a second set of taste eyes. Review against: `docs/DESIGN_TASTE.md`
   (the blacklist is law), `docs/CREATIVE_DIRECTION.md`, the dataviz skill
   under `docs/reference/`, Emil Kowalski motion values, **Apple-grade
   restraint** (clarity, deference, depth; no decoration without information),
   and **McKinsey communication discipline** (one message per chart, labeled
   denominators, color only where the story lives).
3. **Fable gate**: screenshots reviewed as a reader; composition review on
   assembled pages after module gates. Trust-but-count on every worker claim
   (verify git log, run validators with EXIT CODES — never pipe through tail).
4. Merge serially to master in the ac78 worktree; full baseline after each
   merge; deploy in batches via `npm run deploy:mini` + SSH update
   (`export PATH=/opt/homebrew/bin:...` first — see live-runtime memory).

## Quality mandate (Jack, verbatim intent)

"Many of the features that slipped into the website today were not built with
care and clearly weren't reviewed thoroughly enough or with enough taste."
Therefore: a **dedicated taste-refactor sweep** of recently shipped surfaces
is IN SCOPE as its own workstream — Codex 5.6-sol reviews the live pages
against the standards above, the defect list becomes fix briefs. Insane
attention to detail is the bar for everything in this run.

## Reporting contract

- NO intermediate "workstream complete" reports to Jack.
- Surface to Jack ONLY: final blockers (things only he can do — purchases,
  account auth, permission calls) and the single final report when the
  entire board + vision is delivered.
- Push notifications: sparing — final blockers only.

## Scope

Everything on the task board (this chat, tasks #8–#40) EXCEPT ML execution:
the ML plan (`docs/ML_RESEARCH_PLAN_2026-07-20.md`) is handed to a
long-running Codex 5.6-sol xhigh/max session that Jack fires via /goal;
Fable gates its outputs but does not execute it. Sequencing lives on the
task board; the director re-sequences freely as gates and data dictate.

## Standing cautions that survive summarization

- The live-runtime checkout (`~/Documents/Bryce POV access`) stays
  untouchable: runner, LaunchAgents, sqlite. Read-only sqlite via
  `file:...?immutable=1` (plain -readonly fails on this Mac).
- No server-global mutable state; per-client replay laws; empty-string ids
  trip resolvers; QA drives the literal user request shape.
- Regeneration pin law: `BRYCECAST_ANALYTICS_AS_OF_DATE` pins; deliberate
  rolls need `BRYCECAST_ALLOW_EVENT_ROLL=1`; package builds need
  `BRYCECAST_SQLITE_PATH` (standings) and run AFTER ingest:history.
- Deliberately pinned validator counts (146 races / 3,084 laps / 7,010.9 mi /
  55,029.6 travel-mi / 26 GO pass races / 41 debriefs) move only with
  regenerated evidence, updated at every roll.
- Codex plugin sandbox has NO network — network steps run in the main
  session or Opus workers.
- Opus workers sometimes stop with a progress note instead of finishing:
  inspect the worktree and land the work directly rather than resume-looping.
- NXT's public feed carries no loop/section/GPS data (recon 2026-07-19,
  authoritative). Loop grain comes from RaceTools post-session logs
  (permissioned) or licensed feeds only. Don't rebuild this conclusion.
