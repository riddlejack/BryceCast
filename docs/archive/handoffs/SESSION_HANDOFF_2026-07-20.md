> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# Session Handoff — 2026-07-20, the full-vision run

Written by Fable at the close of the autonomous execution session that began
the night of July 19 (post-Music-City) and ran ~14 hours. This is BOTH
Jack's review artifact AND the next agent's map. Read with
`docs/archive/handoffs/EXECUTION_CHARTER_2026-07-20.md` (the operating contract),
`docs/archive/handoffs/FABLE_LESSONS.md` (updated), and the task board in this session.

## Where things stand

- **master = `cd71611`, LIVE on https://brycecast.com** (mini deploy
  verified; runner + tunnel never interrupted all session).
- Every task on the board is complete except four deliberately-held items
  (§Blocked below). ~30 features/fixes shipped, each through the pipeline:
  Opus build → gpt-5.6-sol design review → fix round → Fable gate → serial
  merge → full baseline (14 suites) → batch deploy → live verification.

## What shipped, in order (feature → merge commit)

**Post-race pipeline night (July 19):** Music City roll-forward (eaadeeb),
street-circuit geometry + sections (95eec2e), replay year toggle (6930647),
semantic pit-lane lap fix + Portland pass promotion (a151fec, f15549c),
card/label/dignity polish (2790077→), brycecast.com + named tunnel + SSH
deploys (runbook 558828a), Wave-1 quick wins: Brief O rank-history seed,
live odometer, lap-speed line, season placeholders (4bada5a), taste-audit
blockers ×6 (9ee6bd9) and should-fixes ×21 (bf9d650), /data 404 +
speed deep-links (e7a208a), weather midnight honesty (#45).

**The full-vision run (July 20):** caution atlas + K v2 restart baselines
(fe88d1d), cross-series campaigns + qualifying layer (dedbe33), guardrail
revision (e0ae3ec), drafts + handoff reconciliation (8de804b), live race
page design doc (42122e0), ML plan v2 post-adversarial-rewrite (b87fe4e),
Archive V2 + postrace:roll (159acb2), runner S-tier dedup + GPS watcher
(f4c955b re-stamp), anchor derivation + Mid-Ohio/Milwaukee feed pinning
(41e6fc9), session-aware Live + stale-pack depth ×4 + small-series
stories + live race page (6133144), field-compression ticker (ec8a363),
Quali Lab run-by-run slice (cd71611).

## The honest-scoping record (decisions that shaped the data)

- **Graduates (Brief N) RULED descriptive-only**: "The company he keeps" —
  full-field reframe kills survivorship at the source; predictive version
  is both editorially forbidden and statistically unbuildable. Build =
  task #48, blocked on ML Goal 3. Memo: task output a7d0d1cb01fc9287a.
- **K v2 baselines scoped to 2024–26** (no pre-2024 official anchor
  exists in-repo); 16-year extension = task #47.
- **RaceTools 2026 logs: 404** — no public loop-grain for 2026; asked in
  the email draft. Music City 2026 heat stays PDF-grain honestly.
- **$P telemetry decode report** saved at
  `~/.brycecast/reports/codex-results/p-decode-report.md` — read before
  any segment-risk work.
- **Corridor liveGap-basis bug (#49, GATED)**: lake feeds publish
  cumulative gap-to-leader; the battle corridor sums it as intervals —
  over-stretched on all 40 replays. Needs ONE green-flag production
  sample (Portland practice Aug 7) before reconciling; the
  field-compression ticker's monotonicity normalizer is the reference.
- **Barber 2025 "Combined Qualifications" is a fake sheet** (byte-copy of
  Group 1) — the quali lane's genuine-merge discriminator rejects it.
- Portland 2025 = lap-1 contact (0 laps): every "missing data" question
  there is honest absence, handled with dignity copy.

## Blocked / waiting (the whole remaining backlog)

- **#34 Brief D** (points-pace vs INDYCAR-test threshold): HARD-GATED on
  official verification of the 2026 benefit structure. No claim without it.
- **#47** 16-year restart decode + **#48** Graduates build: blocked on the
  ML plan's Goal 3 (2008–2023 semantic expansion).
- **#49** corridor basis: gated on the Portland-practice sample.
- **GitHub lean-mirror** (the #8 residue): Jack's decision — the repo
  exceeds GitHub's 100MB file limit (career.dataset.json ~300MB/commit);
  options: stop materializing the dataset in git + slim history (my
  recommendation), LFS + paid data pack, or keep bundle-to-iCloud as the
  standing backup (currently in place: BryceCast-backups/, verified).
- **Whimsy parking lot**: hover car-dot; tricolor placements (Jack call).

## Waiting on Jack (deliverables ready)

1. **docs/archive/outreach/RACETOOLS_EMAIL_2026-07-20.md** — send it (provenance
   line, 3 defect replacements, both map asks, the 2026-logs question).
2. **docs/archive/outreach/CGR_OUTREACH_2026-07-20.md** — the text for Bryce.
3. **docs/archive/research/ML_RESEARCH_PLAN_2026-07-20.md** — adversarially reviewed and
   rewritten; fire Goal 0 (the census) as a Codex /goal first; Goals 1/2
   as separate sessions; Goal 3 later.
4. GitHub lean-mirror decision (above).

## Operational truths for the next session

Deploy = `npm run deploy:mini` then ssh with the MINI-SIDE sync wait:
`until git -C ~/BryceCast/site bundle list-heads "<iCloud bundle>" | grep
-q <tip>; do sleep 10; done` then PATH export + update-mini.sh — never
trust a timed sleep. Codex plugin jobs NEVER notify — poll
`codex-companion.mjs status` directly in Bash. Pinned package regens:
AS_OF 2026-07-19 (move the pin at the next roll) + BRYCECAST_SQLITE_PATH
at the main checkout; expect the mid-build validator chicken-and-egg on
multi-lane merges (bootstrap the on-disk package with all lanes' blocks
first). Never chain `git add -A && git commit` after a merge command.
Validator pins now: 146 races / 3,084 laps / 7,010.9 mi / 55,029.6
travel / 26 GO pass races / 41 debriefs — move only with regenerated
evidence, and `postrace:roll` (Brief T, shipped) is how the next race
rolls in. The run survived a host crash mid-flight: worktrees + agent
transcripts persist; resume agents by id, re-arm the loop, re-poll Codex.
