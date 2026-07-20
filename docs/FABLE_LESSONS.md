# Fable Lessons — the design-judgment inheritance

Written 2026-07-18 by the July 2026 Fable lead session at handoff. This is
the context that lived only in that session's chat and memory. It is
deliberately IN-REPO because Fable's auto-memory is keyed to the project
*path*: a session started in a different worktree gets an empty memory
namespace. Until the post-Nashville relocation puts `master` at the
ordinary path, THIS FILE is the memory. Read it with
`docs/PHASE3_EXECUTION_CHARTER_2026-07-18.md` (the queue) and
`docs/CODEX_EXECUTION_CHARTER_2026-07-12.md` (the worker rules).

## Working with Jack

- His prompts are **directional ideas from a colleague, not specs** — often
  dictated, sometimes self-contradicting mid-message. Pick the version that
  serves his intent; say where and why you deviated. He explicitly trusts
  Fable's taste over his own literal words and credits the site's quality
  to that.
- **Push back and expand.** Standing mandate (his words, condensed): if his
  idea is off, say so; if it gestures at something bigger, name the bigger
  thing and build that; add your own ideas. He wants a partner, not a
  contractor.
- **Never accept a limitation as final.** Any no-go verdict — especially
  "we can't get access to X" — is provisional until the ideal path has been
  explicitly tried. The RaceTools saga proved it: a "hard permission
  blocker" dissolved with one phone call, and a "permanent 2026 gap" fell
  to a public archive nobody had searched. Enumerate untried routes
  (first-party/relationship channels first — Bryce/CGR can request what's
  impossible publicly) before adopting any concession.
- Screenshots are the acceptance gate. Present leading with what he'd ask
  first. He reads warmth: story-shaped commits, modules that feel loved.
- Whimsy is welcome; slop is banned (`docs/DESIGN_TASTE.md` blacklist is
  law; diff every UI change against it).

## The audience (editorial law)

Bryce, his family, and now his team read this site. No negative framing
ever — facts + context; hard days get dignity (Portland 2025 pattern).
Archetype labels never render. Denominators chosen deliberately and
labeled on screen. Claims computed before shown. Rivals by name, neutral
framing, records read Bryce-first ("Bryce ahead in 23 of 40" — never a
bare "ahead", never signed numbers where spatial words work: "0.6s
ahead"). Family-legible headline + team-depth drawer one tap down; when
they fight, family wins placement.

## Design judgment — lessons earned the hard way

1. **The data votes.** (The F5 failure.) Stress-test a chart's data
   substrate — uptime, grain, failure modes — BEFORE designing the
   visualization. F5's camera chart died because its y-value depended on a
   P1→Bryce interval chain that went dark for minutes whenever lapped
   traffic sat upstream, while every rank-fed element on the same page
   worked all night. If mixed substrates disagree on reliability, the
   reliable one wins the design.
2. **The protagonist principle.** Reference frames are editorial choices.
   A Bryce-pinned axis freezes the protagonist: his overtakes render as
   rivals drifting backward. Bryce must visibly MOVE — prefer a camera
   that follows him over a frame that pins him. (This is why the battle
   history lives in rank space with a following window.)
3. **One question per chart.** Every failed chart in this project failed
   by fusing questions (F5 mixed history, now-state, and fallback state in
   one frame — "a polygraph"). Decompose until each surface answers
   exactly one question a family member would actually ask.
4. **Two currencies.** Seconds and places diverge — maximally under
   caution, when gaps compress while positions churn. Every racing chart
   declares its currency (time vs position) and never lets a reader
   assume one while showing the other.
5. **Color budget.** (McKinsey distillation, proven here.) Color goes only
   where the story lives; everything else is gray. Gold = Bryce, one
   meaning per chart, always keyed. Chapter tints = identity (validated
   set in theme.css). Ink↔gold diverging ramp = the house heat/record
   scale — never red-to-green (red is reserved for status-down). Team
   tricolor is BRAND TRIM only (red conflicts with status, black is ink,
   white is the page) — the CarMark, not chart marks. PENDING product
   decision: the detailed No. 9 car SVGs preserved at tag
   `brycecast-car-art-recovered-20260718`.
6. **Copy is family copy.** Spec vocabulary leaks from briefs into UI text
   if not explicitly banned ("approved upper corridor" shipped to screen
   once). Method sentences live in source drawers; captions speak human
   ("gaps in seconds, from official Race Control timing"). Copy sings only
   when the data does — "If you liked practice, you'll love the race"
   (Jack's line, beloved), "Nobody climbed further up the lap chart than
   Bryce: 8 spots."
7. **Interaction grammar** (house, everywhere): hover = focus, 150ms,
   siblings fade to 0.22 (0.45 in dense list rows; the protagonist row is
   ALWAYS exempt from fading). Hit-testing requires proximity to an actual
   rendered mark in both axes — never nearest-column-then-vertical. White
   ChartTipCard tooltips, no delay, action line for click-through; every
   race-mark navigates via `raceHref`. Motion: Emil Kowalski values
   (vendored under docs/reference/) — strong ease-out, sub-300ms UI,
   30–80ms staggers, GPU-only, reduced-motion always.
8. **QA gotchas** (each cost us a round): Playwright against the dev
   server, never the in-app browser pane. Full-page captures need
   `reducedMotion: 'reduce'` or scroll-linked reveals photograph at
   opacity 0. Wait 'load' + settle, never networkidle (live routes poll).
   Test hover over empty plot space (should highlight nothing). Check for
   clipped geometry at plot boundaries (reserve gutters OUTSIDE the
   clip). Live charts use ONE clock for traces and now-markers. Two gates
   that would have caught F5 sooner: an append-through-data-degradation
   test, and a startup-window test (no reserved empty spans; newest point
   touches "now").
9. **The adapter-contract principle.** (Phase 3 architecture.) UI features
   consume interfaces sized for the richest future source, with v1 fed by
   today's data — the heat map reads `sectionObservations` whether they
   came from 159 parsed PDFs or millions of lake loop-crossings. Ship
   Bryce's features now; swap sources later; never rebuild UI for a data
   upgrade.
10. **Managing workers.** Briefs must be self-contained with exact values
    (curves, hexes, thresholds) — workers have no taste and will guess.
    Require a deviations-named report; deviations are fine, silence isn't.
    Treat adversarial-review verdicts as provisional (see the
    never-accept-limitations rule). Codex excels at long-running
    data/validation lanes; Opus workers at bounded UI slices; Fable's
    tokens go to gates: first render of anything new, anchor geometry,
    research framing, model outputs.

## Race-day lessons (2026-07-19, the Music City sprint — added at handoff)

11. **Trust, but count.** Two workers reported committed work that was
    sitting uncommitted in their worktrees. Verify `git log` and watch
    assertion-count deltas before merging — a no-op merge that still
    shows green tests is the tell (the count doesn't move).
12. **Empty string is not null.** RaceTools-derived feeds carry `''`
    ids; `??` fallbacks treat `''` as present, which erased every rival
    from the battle corridor. Identity resolvers trip on
    empty/whitespace, always.
13. **QA must drive the exact user path.** The replay button was broken
    while 51 assertions passed, because the harness hand-rolled its own
    request params. The regression test now sends the button's literal
    request shape. "End-to-end" means the user's bytes.
14. **No server-global mutable state on a family site.** One person's
    replay became everyone's Live page. Stateless per-request design
    (client owns the clock, params carry intent, absent params = the
    untouched live path) fixed it and made the live-guard stricter.
15. **Composition review after module gates.** The full-page pass caught
    a stale footer source-claim and a race-date off-by-one ("−1 days to
    green" on race morning) that no module-level gate could see. Review
    the assembled page as a reader, not as a diff.
16. **The data votes, again, at the geometry layer.** Measured section
    lengths (time × speed) beat hand-placed ticks twice (both oval S/F
    ticks were ~0.12 lap wrong); the wrong-config guard refused a
    plausible IMS map that was a different 3.41-mi layout. When
    measurement and curation disagree, measurement wins or nothing ships.
17. **Infrastructure is a feature.** The family URL surviving the host
    migration (quick tunnels are process-bound → the old host became a
    1KB redirect relay) mattered as much as any chart. Design handoffs
    so the family never has to re-learn a link.

## Open debts (small, known)

- A2/B/C surfaces (odometer, atlas, moments) shipped without a Fable taste
  pass — one screenshot review against the blacklist is owed.
- Family tunnel target: confirm what the public link serves (old :8787
  build vs the integrated :5181 build) — matters most on race days.
- RaceTools provenance email (name, date, approved uses incl. public
  display of derived analytics).
- Post-Nashville: worktree relocation to a durable path + runtime
  migration per DEPLOY_RUNBOOK (restores memory-namespace continuity too).
- `formatGain` flat deltas rendered in the down/red class until
  2026-07-18; fixed with `.stat__delta--flat` — pattern note: `Stat`'s
  delta class must handle all three directions.

## The full-vision run (2026-07-20) — lessons 18–25

18. **Pipes eat exit codes.** `npm run x | tail` reports tail's success,
    not the command's. Twice this run a "green" baseline hid failures.
    Run validators bare, echo `$?`, never through a pipe.
19. **Never chain a commit behind a merge.** `git merge && git add -A &&
    git commit` once committed conflict markers to master. Check the
    merge's exit, resolve, and only then commit.
20. **Generated artifacts merge by regeneration, not resolution.** For
    package/summary conflicts: take either side, bootstrap the on-disk
    package with every lane's blocks (the mid-build validators check the
    PREVIOUS package — the chicken-and-egg), then run the pinned rebuild.
21. **iCloud deploys race.** A too-fast mini update applies the STALE
    bundle silently. The fix is a mini-side until-loop on `git bundle
    list-heads` matching the tip — proof, not timing.
22. **Codex plugin jobs never notify; Opus agents always do.** Poll the
    companion CLI directly in Bash. And a crash can leave a job record
    "running" forever, or "done" with only a preamble — verify the
    payload, cancel and relaunch wedged reviews.
23. **Workers stall by narrating.** When a final message is a progress
    note, don't resume-loop more than once — inspect the worktree and
    land the work directly. Post-crash, transcripts + worktrees survive:
    resume agents by id and count their commits before believing them.
24. **The dual-review pipeline earns its tokens.** The 5.6-sol pass
    caught, among others: a career-total double-count, a sign-inverted
    "improved" claim, a false off-air state, an incomplete integrity
    chain, a fake combined-quali sheet, and the corridor's gap-basis
    bug. Build → independent review → fix round → director gate is the
    standing shape for anything family-visible.
25. **Rule on framing before anyone computes.** The Graduates memo
    pattern: a read-only framing study with the survivorship problem
    addressed head-on, ONE gate question, and the ruling recorded on the
    task board — before a single number is derived. "Descriptive company,
    never forecast" is the house answer to comparison features.
