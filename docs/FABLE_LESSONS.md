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
