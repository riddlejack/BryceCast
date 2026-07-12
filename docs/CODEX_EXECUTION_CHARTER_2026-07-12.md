# Codex Execution Charter — 2026-07-12

Written by Fable (Claude Fable 5, lead product/design/engineering agent) so
that Codex (gpt-5.6-sol, reasoning xhigh — already the default in
`~/.codex/config.toml`) can execute the next wave of BryceCast work at the
established quality bar with Fable's design judgment embedded, while Fable's
usage is reserved for review checkpoints and course corrections.

**How to run these briefs:**

- One brief at a time in this checkout (they share files; parallel runs will
  collide). Exception: Brief F (Live page) runs in its own git worktree and
  may proceed in parallel — see F.
- Via the Claude Code plugin: `/codex:rescue --background <paste the brief +
  the Global Rules section>`. Via the Codex app/CLI: paste the same.
- Every brief's prompt = **Global Rules + Reading Order + that brief's text.**
  Never send a brief without the rules.

---

## Reading Order (mandatory, before any code)

1. `CLAUDE.md` — data contracts, guardrails, validation baseline.
2. `docs/CREATIVE_DIRECTION.md` — the design constitution: locked decisions,
   editorial POV, shipped patterns, McKinsey chart lessons, magic backlog.
3. `docs/DESIGN_TASTE.md` — the visual system + the AI-slop blacklist. If a
   pattern on the blacklist appears in your diff, the diff is wrong.
4. `docs/PAGECRAFT_HANDOFF_2026-07-12.md` — §4 working method, §5 gotchas
   (read every gotcha; they were learned the hard way).
5. `docs/reference/dataviz-skill/SKILL.md` (+ its references when charting).
6. `docs/reference/emil-skills/` — apple-design + emil-design-eng for any
   motion or interaction work. Exact values: strong ease-out
   `cubic-bezier(0.23,1,0.32,1)`, UI motion < 300ms, 30–80ms staggers,
   GPU-only properties, reduced-motion always handled.
7. The code that carries the house language before writing any UI:
   `src/app/charts.tsx`, `src/app/components.tsx`, `src/app/theme.css`,
   `src/screens/careerExplorer.tsx` (the reference implementation for every
   pattern: measured-width SVG, ChartTipCard, nearest-target hover, focus
   fade, chapter tints, Reveal/scroll-linked motion, source pills).

## Global Rules (non-negotiable)

**Data discipline**
- UI reads `analysis/ui-data-package/ui-data-package.json`, context packs,
  and `/api/*` through typed adapters. **No raw-CSV parsing in React.**
- To add data: extend `scripts/build-ui-data-package.mjs` +
  `scripts/validate-ui-data-package.mjs` + types in
  `src/data/uiDataPackage.ts` + assertions in
  `tests/uiContextAdapter.test.ts`, then
  `npm run analytics:ui-data-package:refresh-validate`.
- Page-scale data uses a sha256-integrity pack lane like
  `analysis/race-story/output/context-packs/` (vite glob in
  `src/data/packModules.ts` matches only
  `analysis/**/output/context-packs/**/*.json`).
- `data/live/brycecast.sqlite` is ~5 GB: never hash/summarize it; screen
  sourceRefs must be `/api/*` or sourceInventory-backed.
- **Never invent data.** No live GPS, no official-weather claims, no
  pit/tire strategy, no calibrated predictions, no karting-era results. If a
  number can't be traced to a source file, it does not render.

**Editorial (Bryce and his family read this site)**
- No negative framing, ever. Facts + context. Hard days get dignity
  (see Portland 2025 on the race pages).
- Archetype labels from packs NEVER render.
- Denominators are chosen deliberately and labeled on screen ("11 clean
  races · mechanical DNFs excluded", "76 of 141 races carry a sourced
  report").
- Rivals appear by name with neutral framing. Records read Bryce-first
  ("Bryce ahead in 23 of 40") — never a bare "ahead" (ambiguous).

**Design bar**
- Apple-grade light minimalism. White page, quiet `#f5f5f7` cards, system
  font, tabular numerals, near-monochrome + the chapter tints + gold.
- **Gold = Bryce's marker. One meaning per chart, keyed in a caption.**
- Every module: a SourcePill, an honest empty state (why + when it
  resolves), hover = focus (subject full ink, siblings fade to ~0.22,
  150ms), white tooltip card (ChartTipCard, no delay), click-through to race
  pages wherever a race is a mark (`raceHref()` handles NXT vs light pages).
- Charts: hand-rolled SVG in pixel space via `useMeasuredWidth`. Never
  recharts for new work. Never scale text through viewBox. Validate any new
  colors with `node docs/reference/dataviz-skill/scripts/validate_palette.js`.
- Copy is plain sentences, facts first; it sings only when the data does.
- Motion: fast, crisp, few; scroll reveals use the existing `.reveal` /
  `Reveal` machinery; one-time assembly moments use `useInViewOnce`.

**QA ritual (before reporting done)**
- Playwright (`channel: 'chrome'`, headless) against `http://localhost:5173`
  — NOT the in-app browser. Screenshot 1440 and 390, full page + module
  close-ups. Full-page captures need `reducedMotion: 'reduce'` in the
  browser context or scroll-linked reveals photograph at opacity 0.
- `npx tsc --noEmit` clean, then the validation baseline:
  `npm run analytics:ui-data-package:validate` (or `:refresh-validate` if the
  package changed) · `analytics:view-models:validate` ·
  `test:ui-context-adapter` · `test:live-readiness` · `npm run build`.
  If live/API behavior changed: `npm run api:smoke` and `npm run audit:sources`.
- `npm run build` matters: the LaunchAgent on :8787 serves the BUILT bundle.

**Report format (every brief ends with this)**
- What shipped, mapped to the brief's acceptance criteria.
- Changed files; validation output (pass/fail per command); screenshot paths.
- **Deviations from the brief and why** — deviations are allowed when the
  data resists the spec, but they must be reported, never silent.
- Open questions parked for Fable review — do not guess on taste calls; park
  them.
- Commit with a story-shaped message (see `git log` for the voice). One
  commit per brief unless the brief says otherwise.

**Hard NOs**
- Don't touch the live runner, LaunchAgents, or ingestion configs.
- Don't restructure pages or navigation beyond the brief.
- Don't add dependencies without a parked question (exception: none needed
  in these briefs; Brief B explicitly avoids map libraries).
- Don't relitigate locked decisions in CREATIVE_DIRECTION.md.

---

## Brief A — The odometer: career life-stats research + data lane

**Goal.** Sourced career-scale numbers: miles raced, miles traveled between
events, countries and venues visited — the "surrounding life" of the career.

**Research (do this first, write it down).**
1. Track length per venue for ALL venues in
   `analysis/career-parity/output/tables/career_result_conversion.csv`
   (INDY NXT venues already carry `trackLengthMi` in canonical events; other
   series need a curated table). Each length needs a named source (official
   circuit site, series media guide). Write
   `analysis/career-life-stats/data/venue_facts.csv`:
   `trackId,trackName,lengthMi,lengthSource,lat,lon,country,coordsSource`.
2. Laps completed per race: prefer official laps from
   `data/career/career.dataset.json` results rows where present; where
   absent, mark the race uncovered — do NOT estimate laps.
3. Event coordinates double for Brief B — curate them once here.

**Build.** New lane `analysis/career-life-stats/` following the house lane
pattern (build script + output tables + summary.json + validator script +
npm scripts `analytics:career-life-stats[:validate]`). Outputs:
- `miles_raced.csv` — per race: sessionId, laps, lengthMi, miles, covered
  (bool). Career total counts ONLY covered races; report coverage.
- `travel_legs.csv` — consecutive sourced events (by eventStartDate across
  the whole career): from→to venue, great-circle miles (haversine), plus a
  home-base assumption ONLY if Fable/Jack supply one — otherwise legs are
  venue-to-venue and labeled as such.
- `summary.json` — totals: milesRaced (+ coveredRaces/141), travelMiles
  (labeled "between consecutive race venues, great-circle"), countries,
  venues, longestLeg, farthestVenuePair.
Then package module `careerLab.lifeStats` (builder + validator + types +
adapter tests), and a UI card **"The odometer"** on the Career page (place
between The rivals and The chapters): stat row — Miles raced · Venues ·
Countries · Miles between venues (est.) — every stat with a label note, one
caption line for method ("great-circle between consecutive race venues —
flights don't fly straight, so the real number is larger"), SourcePill
listing venue_facts sources. No map here (that's Brief B).

**Acceptance.** Every number traceable to venue_facts.csv + canonical laps;
coverage stated on screen; validation suite green; screenshots.

## Brief B — The career atlas (world map)

**Goal.** Everywhere he's raced, one quiet map. New Career page section
"The map" directly after The chapters.

**Geometry.** No map libraries, no tiles, no external fetches at runtime.
Vendor Natural Earth 110m land polygons (public domain) into
`analysis/career-atlas/data/`, and write a build script that projects them
(natural-earth or equirectangular projection, hand-rolled math is fine) into
a single simplified SVG path string exported as a build artifact the app
imports (follow the pattern of `src/assets/tracks/`; register asset imports
explicitly). Land = `#ececee` fill, no strokes, white sea (the page).
- Crop to the career's bounding box + padding (roughly Americas + Europe +
  NZ — compute from venue coords, don't hardcode).
- Venue dots from Brief A's `venue_facts.csv` via the package (extend
  `careerLab.lifeStats` or a small `careerLab.atlas` module): position by
  projected lat/lon, radius by √races, fill by chapter tint of the series
  most raced there (ties → most recent), 0.65 opacity, hover → ChartTipCard
  ("Circuit de Spa-Francorchamps · 4 races · GB3 '21–'22 · best P4"), click
  → most recent race there via `raceHref`.
- Caption: "Every venue a dot · sized by races · colored by chapter ·
  click to open the latest race there". SourcePill: venue_facts + conversion
  table. Phone: map spans full width, dots keep ≥8px hit targets via
  nearest-dot hover on the svg (reuse the climb's pattern).

**Acceptance.** Renders crisp at 1440/390 (pixel-space, measured width);
no runtime network; all dots hoverable/clickable; validation green;
screenshots desktop+phone.

## Brief C — Named moments on the climb

**Goal.** The climb gains McKinsey-style annotated moments: circled dots +
short labels + hairline leader lines for career milestones.

**Moments (derive, don't editorialize).** Build the list programmatically in
the package builder (new `careerLab.moments`): first car win (earliest
finish==1), each series debut is NOT a moment (too many) — include: first
win; first INDY NXT race; best INDY NXT finish (lowest finishPosition,
earliest if tied); the Daytona 24 (the IMSA row); the WWTR June 2026
mechanical (sessionId from the 2026 season index, official status
Mechanical) labeled neutrally "Mechanical DNF, WWTR — broke a points run"
→ label text exactly: "WWTR · mechanical". Max 6 moments; each carries
sessionId, shortLabel (≤ 22 chars), kind. Validator: every moment's
sessionId must exist in resultConversion.
- Render in `TheClimb`: ring (r≈6, stroke ink 1.5, no fill) around the dot,
  label in `chartFont` 10.5px `--ink-secondary` with a 1px hairline leader,
  alternating above/below placement, collision-nudged horizontally; labels
  hidden < 640px width (rings stay; tooltips already tell the story).
  Moments must not obstruct hover (pointer-events: none).

**Acceptance.** Six or fewer moments, all derived; no label collisions at
1440 and 1024 (screenshot both); phone shows rings only; validation green.

## Brief D — Points pace vs the INDYCAR-test threshold (verify first)

**Goal.** The two-scenario fan: his 2026 cumulative points vs the pace
needed for the INDY NXT scholarship/test threshold, gap shaded, one big
number, WWTR annotated.

**Step 0 — verification gate (this is the brief's core).** Research official
INDY NXT / INDYCAR sources (series rulebook, indycar.com, official press)
for the exact 2026 benefit structure (e.g., champion's INDYCAR ride funding,
top-N test awards). Write findings + citations to
`analysis/points-pace/RESEARCH.md`. **If no official source nails the
threshold, STOP after the research doc and park it for Fable — do not build
the chart on a guessed threshold.**
- If verified: data from `championshipProgression` (already in the builder's
  sources) — Bryce's cumulative points by round vs the threshold-holder's
  (e.g., P3 driver's) cumulative line, or vs required-average pace, whichever
  the verified rule implies. Shade the gap (`#f5b63f` at 0.12 — gold wash is
  acceptable ONLY as this shaded gap, keyed), annotate WWTR with the house
  open-circle + "mechanical" note, headline the current gap as one big
  number. Lives on the Races archive page above the season spines.
  SourcePill cites the research doc + progression table. Copy frames
  honestly: distance to the mark, never "falling short".

**Acceptance.** RESEARCH.md with citations; chart only if verified; wrong-
data impossible (validator asserts threshold source string present);
validation green; screenshots.

## Brief E — The track shape as the interface (race heroes)

**Goal.** Jack's big idea: on race-detail heroes, the venue outline stops
being decoration — hovering along the shape surfaces where the lap time
lived.

**Scope this run: the four ovals only** (Nashville, WWTR, Iowa, Milwaukee;
Gateway=WWTR). Road/street curated anchors are a later pass.
- Data: section families per race live in the race-story/section context
  packs (`analysis/indy-nxt-race-lap-section-enhancement/output/` and the
  per-race section observations already surfaced on race pages via
  SectionStory — read `src/screens/RaceDetailScreen.tsx` first).
- Geometry: oval outlines in `src/assets/tracks/` carry the traced path +
  S/F anchor + corner labels (see `scripts/build-track-outline.mjs` and the
  debug renders). Map section families to path segments: ovals have
  arc-detected corners — assign "Turn N" families to their arc spans, pit/
  front straight to the S/F-adjacent span, back straight between 2 and 3.
  Encode as fractional path ranges per venue in a curated file
  `src/assets/tracks/sections/<slug>.ts` (start/end t along the path,
  familyId, humanized name) — verified visually against the venue's debug
  render; NEVER guess corner names beyond official station codes already in
  packs.
- Interaction (spec, exactly): pointer near the outline → nearest point on
  path (sample the path at ~200 points, hit radius 18px) → the section span
  under the cursor lifts to full ink (rest of outline fades to 0.35) and a
  ChartTipCard anchors at the span midpoint: "Turn 3 · his strongest section
  · 82nd percentile this race" (percentile from the race's section
  observations; wording follows SectionStory's existing humanization). Gold
  dots (r 4) sit on his top-2 section families for that race; quiet 2.5px
  ink ticks mark the other family anchors. Touch: tap cycles sections.
  Caption under the hero art: "section timing from official observations —
  not GPS". Reduced-motion: no transition, states still switch.
- Keep the hero's fixed 150px art box; the interactive layer must not shift
  layout. Race Week's big Nashville art gets the same layer via the same
  component (`TrackArt` gains an optional `sections` prop — do not fork it).

**Acceptance.** Works on all four ovals' race pages + Race Week; hover never
obstructs reading; a race with no section data renders the plain outline
(honest absence, no empty tooltip); validation green; screenshots + a short
screen recording (Playwright video) of the hover pass.

## Brief F — The Live page + replay simulator (run in its own worktree)

**Setup.** `git worktree add ../brycecast-live live-page-replay` and work
there; Jack may run this in the Codex app in parallel with A–E. Merge only
after Fable review.

**Goal 1 — replay mode (test harness + demo).** A time-shifted playback of
our real Road America capture so the site behaves exactly as it will live.
- Server: a replay module in the API service (`docs/API_SERVICE.md` first).
  `GET /api/replay/control?session=<key>&t0=<iso>&speed=1|2|4` (admin/debug,
  env-gated `BRYCECAST_REPLAY=1`, NEVER on in the deployed LaunchAgent
  config) starts a virtual clock; while active, `/api/timing` (and the other
  live routes the Live screen reads) serve archived rows from
  `data/live/brycecast.sqlite` whose `checked_at` maps to the virtual now —
  same payload shapes, byte-compatible, so the frontend cannot tell. Read
  the sqlite via the existing CLI pattern (never load it whole). The
  single-ingestor architecture is untouched: replay is a read-only overlay
  and refuses to start if the real runner reports a live session
  (`test:live-readiness` fixtures explain the states).
- A dev convenience: `npm run live:replay` boots the API server in replay
  mode at Road America Race 2, speed 1.

**Goal 2 — the Live page itself** (`src/screens/LiveScreen.tsx` rebuild to
the pagecraft bar; current V5 content is the baseline, not the ceiling).
This is the page his parents will have open during the race — family-first
density, everything legible at a glance:
1. **Hero: the race, now.** Flag state chip (existing status language),
   "Lap 12 of 20", Bryce's position as the hero number with the №9 plate,
   gap to the car ahead and behind BY NAME ("+0.8s to Pierson"), each with a
   30-sample sparkline trend (1s capture) — trend arrows use house ▲▽.
2. **"If the race ended now" — the jumbotron module** (Bryce personally
   asked for this): championship standing projection straight from Race
   Control's `runningDriverPoints`/`totalDriverPoints` — NO local math —
   labeled "provisional · official Race Control feed", showing his current
   points, projected standing, and the neighbors one spot up/down.
3. **The field tower**: full running order, Bryce's row white with the
   plate, teammates marked quietly, leader gap column, nearest-rivals rows
   carry head-to-head context on hover (from the package's standings
   snapshot join).
4. **Gap-trend chart**: his gap to the leader over the session from the 1s
   capture, ink line, gold current-point marker, caution periods shaded
   (flag states from the capture), ChartTipCard hover.
5. **Trust rail**: capture age ("data 2s old"), source state chip, and the
   full fixture-state system preserved EXACTLY — wrong_series, pre_session,
   ready, degraded, stale, blocked all render their honest states
   (`getLiveReadinessFixture`; `npm run test:live-readiness` must stay
   green; every state screenshot-tested via `/live?fixture=` URLs).
6. No GPS dots, no pit/tire guesses, no predictions beyond the official
   points feed. Every module carries a SourcePill.
- Layout: single column of full-width modules on phone (the race-day
  device), two-column desktop with the tower on the right. Fast: the page
  polls; keep renders cheap (no re-layout per tick; sparklines append).
- QA: Playwright against replay mode — screenshots at green flag, mid-race,
  caution, and post-checkered COLD, at 390 AND 1440, plus every fixture
  state. `npm run api:smoke` + full baseline.

**Acceptance.** Replay indistinguishable from live at the API boundary
(assert payload-shape equality in a test); all six trust states render; the
jumbotron module matches Race Control fields exactly; validation + api:smoke
green; the screenshot set above; NO changes to runner/LaunchAgent configs.

---

## Review loop (how Fable's usage stays reserved)

1. Codex executes a brief end-to-end, self-reviews against
   `docs/DESIGN_TASTE.md` blacklist + this charter, runs
   `/codex:adversarial-review` style self-critique (source-claim regressions,
   contract gaps, missing tests) before reporting.
2. The report lands with screenshots + validation output + deviations +
   parked questions.
3. Jack eyeballs the screenshots. If it looks right → merge/keep. If
   something's off or a parked question needs taste → THEN bring in Fable
   with the report + screenshots (cheap: review, not re-derivation).
4. Fable-mandatory checkpoints regardless: Brief D's verification verdict
   (before any chart ships), Brief E's section-anchor curation (before the
   interaction ships), Brief F's merge into main.

Recommended order: **A → C → B → D → E** in the main checkout (A feeds B;
C and B are independent of each other; D is research-gated; E is the most
delicate — last). **F in parallel in its worktree** whenever Jack wants to
fire it.
