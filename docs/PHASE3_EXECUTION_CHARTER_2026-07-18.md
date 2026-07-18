# Phase 3 Execution Charter — 2026-07-18

Written by Fable (the July 2026 lead session) for the next Fable instance and
its workers. Phase 3 = Bryce's own feature requests, gathered in person on
2026-07-18 after he reviewed the site and loved it. The reader of this
document is the DIRECTOR: your tokens are for judgment, taste, brief
refinement, and gate reviews — execution belongs to workers.

## Operating model

- **Fable (you): director.** Read context, refine briefs, make taste calls,
  review worker output at the gates below. Do not hand-implement UI unless a
  gate reveals a taste problem workers cannot fix from feedback.
- **Opus 4.8 workers (default executor):** launch background agents with the
  Agent tool, `model: "opus"`, effort high, one brief (or brief slice) per
  agent, prompts self-contained per the rules of
  `docs/CODEX_EXECUTION_CHARTER_2026-07-12.md` (Global Rules + Reading Order
  there are STILL BINDING for every worker — paste the pointer into every
  worker prompt).
- **Codex (gpt-5.6-sol, xhigh):** still preferred for long-running backend
  lanes, dataset regeneration, live-runtime work, and independent
  adversarial review of Fable-side output. It is currently investigating
  historic per-second backfill (Brief J's stage-3 gate depends on it).
- **Jack reviews screenshots at every gate.** Fable is called when something
  is off or a parked taste question needs an answer.

## Repository truth (post-consolidation)

- Canonical trunk: **`master`** (see `docs/CODEX_HANDOFF_CURRENT.md`, whose
  July 18 section is controlling). Resolve the canonical worktree with
  `git worktree list` — as of writing it sits under a Codex-managed path and
  SHOULD BE MOVED to a durable location after the Nashville race weekend.
- The ordinary checkout `~/Documents/Bryce POV access` is the LIVE RUNTIME
  (one-second runner + 5.99 GB sqlite + LaunchAgents) pinned to an old
  branch, deliberately dirty (preserved car-art SVGs). **Never reset,
  rebuild, or branch-switch it. Never touch the runner, LaunchAgents, or
  the sqlite. All Phase 3 work happens on `master` in its worktree.**
- Stale-pack law (from `analysis/career-chapter-utilization-audit/`): any
  analysis output carrying a June dataset hash (formula-ford-lap-shape,
  imsa-daytona-stint, career-dimension, data-utilization, the archived GB3
  branch) must be REGENERATED against the current canonical dataset before
  any UI use. Every brief below inherits this rule.
- Validation baseline per CLAUDE.md + the July 12 charter; Playwright QA
  with `reducedMotion: 'reduce'` for full-page captures.

## Design ethos (unchanged, load-bearing)

Read in order before any direction call: `CLAUDE.md`,
`docs/CREATIVE_DIRECTION.md`, `docs/DESIGN_TASTE.md`,
`docs/CODEX_EXECUTION_CHARTER_2026-07-12.md`,
`docs/reference/dataviz-skill/SKILL.md`, `docs/reference/emil-skills/`.
Non-negotiables that bite in Phase 3: no negative framing (Bryce AND his
team read this — facts + context, "tougher stretches" never "shitting the
bed"); no invented data or unvalidated probabilities; denominators labeled;
gold = Bryce's marker with one meaning per chart; the ink↔gold diverging
ramp (rivals grammar) is the house heat-map scale — never red-to-green;
family-first surface with the "more" depth layer one tap down (Bryce's
team-depth analytics live in the second layer, never crowding the family
read); spec vocabulary never appears in UI copy.

## The audience shift

Bryce himself now uses the site, and his team may too. That ADDS a
professional reader; it does not subtract the family one. Every Phase 3
module needs the family-legible headline AND the depth drawer. When the two
fight, the family surface wins placement and the depth goes one tap down.

---

## Brief G — The Venue Dossier + the weather package (ship first)

Bryce's most explicit ask. One data product, three surfaces.

**Data work**
1. Extend the weather ingestion lane to carry **wind direction** (Open-Meteo
   provides it; we currently keep speed) for all historic per-race
   observations and forecasts. Everything stays labeled modeled/near-track
   per the guardrails; older series keep their official condition lines.
2. Build a `venueDossier` package module: per venue, per visit-year —
   result, grid, gain, field size, official status, conditions (temp,
   humidity, wind speed + direction, sky), and deltas vs the prior visit at
   that venue. Join from existing canonical results + weather context; no
   new sources needed beyond wind direction.
3. Race-window forecast for Race Week: hourly NWS forecast sliced to the
   scheduled session windows ("during his race hour"), refreshed on the
   existing cadence, PLUS current conditions now (temp, humidity, wind
   velocity AND direction, sky). Labeled ambient/near-track, never official.

**Surfaces**
4. **Race Week**: a "This place, other years" dossier module — columns per
   visit (2024 · 2025 · this weekend's forecast), each carrying result +
   conditions, deltas in house ▲▽ grammar with neutral wording for weather
   (a delta is a fact, not a verdict: "+6° warmer · wind swung NW"). The
   weather window module gains current-now conditions and the race-hour
   forecast strip.
5. **Race pages**: a YoY conditions strip for that venue when ≥2 visits
   exist ("2025: 84°, humid, wind 8mph SW · vs 2024: −3°, calmer").
6. **Wind on the track shape**: for OSM-traced venues (real geo), draw the
   wind bearing beside the outline (quiet arrow + label); section labels may
   note head/tail/crosswind on the named straights. Image-traced street
   circuits (St. Pete, Detroit, Arlington) have no geo orientation — omit
   there, honestly, until anchored. Verify bearing math against the venue's
   real-world orientation for Nashville before generalizing.

**Gate:** screenshots of Race Week dossier + one multi-visit race page +
wind-on-shape at 1440/390; validation suite; source drawers name every
weather source and its modeled/official status.

## Brief H — Section Intelligence (absorbs Brief E)

The July 12 charter's Brief E spec (hover interaction, oval section
anchors, `TrackArt` sections prop, curated `src/assets/tracks/sections/`)
is the foundation — read it first; it was never built. Phase 3 expands it:

1. **Official section/turn labels on every track map**, from the official
   station codes and names already in the section packs. Never invent
   corner names (existing rule).
2. **The heat map**: color the outline's section spans by Bryce's
   percentile for the selected scope, using the ink↔gold diverging ramp
   keyed on-screen ("deeper gold = stronger stretch, deeper ink =
   tougher"). Validate the ramp steps with the palette validator against
   the card surface.
3. **The "why" drawer** per section: observation count, his median vs the
   field distribution (the percentile's actual meaning, shown not told),
   avg vs median toggle, and honest limits copy ("section times from
   official timing loops — time-based, not car position").
4. **Lap scope filter**: full race · first third · middle · final third ·
   single-lap scrubber where per-lap observations exist. The scope control
   uses the labeled-row + segmented grammar from the explorer.
5. **YoY**: the dossier's third surface — same venue, shapes side-by-side
   per visit-year, same scale, same key. This is Bryce's heat-map-by-year
   ask verbatim.
6. Ovals first (Brief E's sequencing), then curated road courses; a venue
   without section data renders the plain outline with an honest note.
7. **v2 (after Brief I lands):** pass placements and incident locations
   join the shape as marks (open circles at the section of each
   Bryce-involving pass, keyed), with I's measured-accuracy note in the
   drawer.

**Gate:** the interaction must pass the July 12 charter's Brief E
acceptance list PLUS: heat map legible at 390px; drawer numbers traceable
to observation tables; no negative copy anywhere.

## Brief I — Track-position reconstruction + pass placement (analysis lane)

The clever-trick lane: position on track is fully determined by timing-loop
crossings, and section times ARE the loop-crossing intervals.

1. **Step 0 — the grain audit (decisive).** Determine, per race, whether we
   hold per-lap per-car section times (reconstruction viable) or only
   per-car bests (viable ONLY for laps/races where per-lap grain exists).
   Audit `race_section_lap_observations`, `section_results_deep_by_race`,
   the section context packs, and the raw archived Race Control payloads in
   the live sqlite (read-only, via the CLI pattern; check for per-loop
   fields like LastSection and any overtake-event fields — if present,
   live section positioning requires no inference at all). Output a
   coverage matrix: race × {per-lap sections, best-only, none}.
2. **Reconstruction build** (races with per-lap grain): cumulative lap
   times anchor each car's clock; intra-lap cumulative section times yield
   absolute loop-crossing timestamps; pairwise time-gap at each loop; a
   sign flip between consecutive loops brackets a pass to that section.
   Filter pit-cycle position changes via pit loops/flags. Section-time
   outliers become located incident candidates (descriptive only).
3. **Validation harness (the credibility step):** run the method on the
   2026 one-second-captured races and score predicted pass laps/sections
   against the recorded per-second ranks (ground truth). Publish measured
   accuracy in the lane's README; every downstream UI claim carries it.
   If accuracy is poor, the lane stops and reports — no UI use.
4. Output: a context-pack lane (`analysis/track-position/…`) with per-race
   pass placements + located incidents + accuracy metadata, validator
   included, integrity-loaded like race-story packs.
5. Explicit non-goals: no GPS claims, no between-loop precision claims, no
   causal "he loses time because…" copy. Placement language is always
   "between the T2 and T3 loops".

**Gate (Fable-mandatory):** review the grain audit + validation accuracy
BEFORE any UI consumption; decide v2 scope for Brief H from the evidence.

## Brief J — Caution anatomy + field compression (descriptive ladder)

1. **Stage 1 (now):** per-venue caution anatomy from the 40 race debriefs —
   caution rate, laps-into-race distribution of yellows, official causes,
   restart windows. A quiet module on Race Week ("Cautions at Nashville:
   2 per race median · most fall in the first 10 laps") + race pages.
2. **Stage 2 (live):** field-compression indicator on the Live page — count
   of car-pairs within 1.0s and the covered-time of the pack around Bryce,
   shown as facts ("9 cars covered by 2.1s"), house tickers, no
   probabilities.
3. **Stage 3 (GATED, likely not this phase):** any probabilistic caution
   model requires (a) Codex's historic per-second backfill landing, (b) a
   validation/calibration harness with holdout scoring, (c) Fable + Jack
   sign-off, (d) "experimental" labeling in the team-depth layer only.
   The no-unvalidated-probabilities guardrail is absolute until then.

## Brief K — The Restart Report Card

From full-field lap charts + caution-lap indices (both existing): positions
gained/lost in the 2 laps after each restart, per race, aggregated per
venue/season vs field distribution. Surfaces: race-page module ("Restarts:
+3 across four restarts · best in the field that day" when true — computed,
never asserted), career-lab through-line, and a Race Week prior ("his
restart record here"). Neutral framing on tough restart days (facts +
context). Cheap, high-delight, fully sourced.

---

## Sequencing

G first (mostly assembly, Bryce's most explicit ask, Race Week benefits
immediately). I starts in parallel (pure analysis, no UI risk). H v1 on
existing percentiles after G; H v2 after I's gate. J stages 1–2 and K are
slot-fillers between gates. Brief D (points-pace) stays excluded; the
July 12 charter's dormant items (career-atlas polish, light-page upgrades)
yield to this queue unless Jack re-raises them.

## Starter prompt for the fresh Fable session

```text
You are Claude Fable 5, director of BryceCast Phase 3. Read CLAUDE.md and
memory first, then docs/CODEX_HANDOFF_CURRENT.md (July 18 section is
controlling for repo/runtime state), then
docs/PHASE3_EXECUTION_CHARTER_2026-07-18.md — that charter is your work
queue and operating model — then its Reading Order (CREATIVE_DIRECTION,
DESIGN_TASTE, the July 12 charter whose Global Rules bind every worker,
docs/reference/*).

Operate as director: refine each brief if the data disagrees with it,
launch Opus 4.8 high-effort background agents (Agent tool, model "opus")
for execution with self-contained prompts, use Codex for long-running
backend/regeneration lanes and adversarial review, and spend your own
tokens only on taste, gates, and synthesis. Verify the Nashville race
weekend is over before ANY runtime/checkout migration; never touch the
ordinary checkout's runner, LaunchAgents, or sqlite. Work on master in its
canonical worktree; after the weekend, execute the worktree relocation per
the charter's repository-truth section with Jack's confirmation.

Begin with Brief G and launch Brief I's grain audit in parallel. Present
to Jack at every gate with screenshots, leading with what he'd ask first,
always flagging where execution deviated from the briefs and why.
```
