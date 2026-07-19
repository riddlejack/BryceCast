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

---

## Addendum (2026-07-18, later): historical high-frequency audit — adopted verdicts

The research at `analysis/historical-high-frequency-data-audit/` (merged to
master, 3176905) is adopted PROVISIONALLY — its technical characterizations
stand, but its no-go verdicts are challenged in §6 below (house rule: never
accept a limitation as final; a blocker is real only after the ideal path
has been explicitly attempted and failed). Consequences for the queue:

1. **Brief I upgrade — the grain question is half-answered.** The audit's
   source table confirms Section Results PDFs parse to **car / lap / named
   section time and speed** grain (159 parsed). Step 0 therefore narrows to
   one question per venue/race: do the named sections CHAIN to tile the full
   lap (S/F → … → S/F)? Where they tile, cumulative reconstruction derives
   absolute loop-crossing timestamps and pass placement per the brief; where
   they are isolated stretches, only relative section comparison is honest.
   Verify tiling against the venue debug renders and the three existing
   race_lap_section_context venues first.
2. **Brief J rescope.** The pairwise corner-collision predictor is DEAD
   (very-high-confidence no-go: no 2-D position, overlap, heading, or
   contact labels — tell Bryce the honest version). Stage 3 becomes exactly
   the audit's defensible concept: experimental full-course-yellow onset
   within the next lap / next 60 seconds while green, with explicit
   abstention and no named-driver blame — double-gated on (a) written
   permission below and (b) a calibration harness; expectations tempered by
   only 72 official caution episodes; guard the C2 leakage trap (flag time
   lags physical incident time).
3. **Permission lane (new, non-engineering).** No downloading, ingesting,
   or training against RaceTools/INDYCAR archives before written
   permission. The realistic route is through Bryce/CGR: a driver
   requesting his own competition timing for private preparation is a
   different conversation than a fan site's bulk ingest. Draft the request
   (Fable-level writing task, ties into docs/OUTREACH.md): ask for full
   2024–25 weekends INCLUDING practice/qualifying, private analytical use +
   internal model research; public display rights are a separate, later
   ask. If rights arrive restricted to non-public use, the team-depth layer
   can become an authenticated view — plan for that split, don't build it
   preemptively.
4. **Coverage-tier law.** All second-by-second analytics must respect three
   permanent tiers: (A) 2024–25 — RaceTools replay logs, rights-gated, 1s
   heartbeats + event-driven timing, not per-car synchronous; (B) early
   2026 pre-Mid-Ohio — official per-lap/section grain only, forever; (C)
   Mid-Ohio 2026 onward — our own capture, the only source, sacred. The
   audit's source-coverage-matrix.json is the reference; any YoY
   second-level comparison states its tier on screen per house denominator
   rules.
5. **Storage follow-through.** Capture growth ~1.3 GB/hour with 94% duplicate
   enrichment bytes; adopt LIVE_ARCHIVE_V2_PLAN's content-addressed storage
   before the Mac mini migration (post-weekend, with Jack's go).

6. **The challenge list — reopened limitations (assign as cheap probes).**
   The audit swept public and third-party sources only. Routes it never
   tried, in priority order:
   - **The first-party route (the ideal path, untried).** Bryce drives for
     Chip Ganassi Racing. CGR holds the team-tier timing feed the audit
     itself says exists ("archived for teams"), and CGR holds BRYCE'S OWN
     CAR TELEMETRY — GPS, speed, the works. A driver asking his team's
     timing engineer for exports of his own sessions is a conversation,
     not a licensing negotiation. This potentially dissolves at once: the
     2024–25 backfill question, the early-2026 "permanent" gap, the
     practice/qualifying coverage question, and the "no GPS" limitation
     for Bryce's own car (which would transform Section Intelligence from
     loop-grain to true line-and-speed grain for the gold line). Jack +
     Bryce task, not engineering; the charter's permission-lane draft
     should be reframed around this channel first, RaceTools second.
   - **Community archive sweep.** Fans have run INDYCAR timing
     scrapers/loggers for years (GitHub, community dashboards). Someone
     may hold complete 2024–26 NXT session logs and be happy to share.
     One worker-day sweep of GitHub/communities before conceding
     anything.
   - **Wayback/Common Crawl spot-check** of the public timing endpoints —
     low odds for high-frequency history, near-zero cost to check; any
     recovered mid-race states help validation.
   - **Auxiliary caution data for Brief J's power problem.** 72 NXT
     episodes is thin — but INDYCAR (senior series) cautions at the SAME
     venues, plus pre-2024 NXT/Lights seasons in the official PDF
     archives, could multiply N via pooling/transfer. Reopens the
     small-data concession without new rights questions for the official
     PDF lane.
   - **`lapDistance` probe.** Zero in audited Bryce records — verify it's
     zero across all venues/sessions/series before treating the field as
     dead; if the senior series populates it, ask (via CGR) whether NXT
     can be enabled.
   - **Reframe, not limitation:** "event-driven, not synchronous" is
     BETTER for Brief I, not worse — loop-crossing events are exactly the
     grain reconstruction wants; the audit undersold its own best find.
   The legal stance stands unchanged: no downloads or training against
   third-party archives before written permission. Challenging the
   blocker means trying the untried routes, not ignoring the law.

---

## Addendum 2 (2026-07-18, evening): the data lake changes the ceiling

RaceTools granted permission (2024–25 NXT full weekends + 2008–2023
INDYCAR/Lights annual archives incl. four telemetry variants + 39
timing-map archives); Timing71's public archive fills 2026 (12/12 races,
21/21 practice/quali through Nashville quali). Codex is building the
content-addressed warehouse (`analysis/historical-data-lake/`). The
challenge list worked — the coverage-tier law in Addendum 1 is OBSOLETE:

**New coverage truth:** per-second/event-driven full-field timing for every
Bryce NXT session 2024→present (3 flagged defects with replacement
requests pending: IMS'25 P1, Mid-Ohio'25 race 7-min gap, Milwaukee'25
quali gap), plus 2008–2023 INDYCAR/Lights as reference corpus. Our own
capture remains the only source for future sessions — still sacred.

**Brief consequences:**
- **Brief I collapses from reconstruction to extraction.** The RaceTools
  logs carry event-driven timing-loop crossings directly — no chaining
  needed for 2024–25; Timing71 frames cover 2026. Keep the validation
  harness (score against our capture + official lap charts) but re-scope
  the brief: decode → normalize → validate → pass/incident placement.
  The 39 timing-map archives likely contain PHYSICAL LOOP LOCATIONS —
  if so, Brief H's section anchors come from data, not curation. Check
  this first; it may delete H's hardest manual step.
- **Brief J stage 3 is unblocked for real.** Training power (16 years of
  cautions across both series, same venues) + labels (millisecond
  incident messages with turn numbers) + permission = a legitimate
  discrete-time caution-hazard research project. Calibration harness,
  abstention, no named-driver blame, experimental label, team-depth
  layer — all gates stand. Turn-level *descriptive* caution/incident
  atlases (where yellows historically start, per venue) are buildable
  immediately with zero modeling risk.
- **Brief G/H/K unblocked-but-unchanged**: do not wait for the lake.
  H v2 gets located passes/incidents; K gets a field-baseline
  ("restart outcomes at this venue across 16 years") when the lake lands.
- **New brief sketches for the director to shape:**
  - **L — The Time Machine:** every Bryce race 2024–2026 replayable
    through the F6 Live page (reducer normalizes historic logs to our
    capture shape; race pages gain "watch this race unfold"). The single
    highest-delight feature the lake enables.
  - **M — Quali & Practice Lab:** run-by-run session timelines,
    traffic-context on quali laps, theoretical-best composites, track
    evolution curves, Friday-signal deepening — for every weekend.
  - **N — The Graduates:** Bryce's NXT metrics vs eventual INDYCAR
    drivers' junior-series signatures at the same venues (2008–2023
    Lights data) — computed-before-shown, no-negative-framing, the
    "road to INDYCAR" made quantitative.
  - **Pace & field-strength backbone:** hierarchical pace modeling across
    16 years to put real uncertainty bars under the field-strength
    framing we already use.

**Guardrail revision task (deliberate, not silent):** several CLAUDE.md
"unavailable" lanes were absence-based and are now source-backed for
2024+: pit timing/sequence, per-second historic gaps, trackside weather
messages, located incidents. Revise the guardrails doc to per-lane
source-state (available-with-source vs still-absent: GPS, physical
proximity, tire compounds/telemetry outside the telemetry seasons).
Prediction guardrails unchanged.

**Provenance tasks:** obtain the short confirming email from RaceTools
(name, date, approved uses — analysis vs public display of DERIVED
analytics; raw data never redistributed via the site); Timing71 data
labeled third-party-normalized per its state format docs; identity
mapping (no official driver/session IDs in Timing71) needs a validated
crosswalk before any UI use.

---

## Addendum 3 (2026-07-18, night): the execution plan — two tracks, waves

Read with `docs/FABLE_LESSONS.md` (the design-judgment inheritance; it is
the in-repo carrier of the lead session's context — treat it as memory).

**The adapter-contract law.** Every Track-1 feature consumes a typed
interface sized for the lake (e.g., `sectionObservations`,
`restartEvents`, `venueDossier`), with v1 fed by today's sources (parsed
PDFs, canonical results, Open-Meteo/NWS) and v2 swapping in lake-derived
data with NO UI rework. Workers design the contract first, then the v1
source. The Timing71 1–2s cadence is a semantic-layer concern (event
observations with real timestamps), never a UI concern.

**Wave 0 — immediate (race weekend; zero runtime disturbance):**
- Family-tunnel check (Jack): what does the public link serve on race day?
- RaceTools provenance email (Jack).
- Lake adversarial audit (Codex autoreview or Opus-xhigh, READ-ONLY):
  verify manifests/checksums/coverage of `1e61227`
  (`codex/historical-high-frequency-audit`), spot-decode sessions against
  official lap charts, review reducer code. GATE: merge to master only
  after this passes. Nothing consumes the lake before the gate.

**Wave 1 — Bryce's features, lake-independent (parallel Opus-high
workers, start now):**
- Brief G (dossier + weather): G-data slice then G-ui slice.
- Brief H v1 (heat map): FIRST the timing-map check (do the 49 map
  packages carry physical loop locations? if yes, anchors come from data
  and the curation step dies), then labels → heat map → drawer → scopes
  on existing section data, behind the v2-ready contract. Fable gates:
  anchor geometry + first heat-map render.
- Brief K v1 (restart card): one worker, one gate.

**Wave 2 — the platform (Codex lanes, begin after Wave 0 gate):**
- Semantic layer: normalize all sessions to canonical timing tables
  (loop crossings, laps, flags, located incidents, pits, weather) with
  quality masks + Timing71 identity crosswalk; validate against official
  lap charts AND our own capture where both exist. Rulebook: the
  `brycecast-semantic-layer` Codex skill.
- `$P` telemetry decode experiment (2020–23) vs `$S` crossings + static
  maps — decides segment-risk defensibility and between-loop positioning.
- Guardrail revision doc once scope is known (small Opus task).

**Wave 3 — lake-powered, in delight order (after Wave 2 validation):**
1. **L Time Machine** first — reducer → replay adapter → race-page
   "watch this race unfold" button; its FIRST customer is our own
   Nashville 2026 capture (the post-race auto-debrief moment).
2. H v2 (multi-year heat maps, full lap scopes, located passes/incidents
   via Brief I extraction — I is now decode+validate, not
   reconstruction).
3. M Quali/Practice Lab; K v2 (16-year restart baselines); J stage 1
   (incident atlas = counting) + stage 2 (live compression).
4. N Graduates + pace/field-strength backbone — research first,
   Fable-gated on framing before any UI.
- J stage 3 (caution model): patient research lane; calibration harness,
  abstention, experimental label, team-depth layer only.

**Delegation topology:** ONE Fable director (taste must not fragment);
many parallel Opus workers (high for UI, xhigh for adversarial
review/decode, medium for mechanical chores); Codex owns Track-2 lanes.
Jack reviews screenshots at gates; Fable-mandatory gates: lake audit
verdict, H anchor geometry, first heat-map render, Graduates framing,
any model output, Time Machine merge.

**Owed taste pass:** one screenshot review of the A2/B/C surfaces
(odometer, atlas, moments) against the DESIGN_TASTE blacklist — they
shipped during consolidation without a Fable gate.
