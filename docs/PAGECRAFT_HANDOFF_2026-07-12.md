# Page-craft Handoff — 2026-07-12

Written by the Fable session that built Race Week, Race detail, Races archive,
and Career Lab v1 (commits `c8daf12` → `ebb4e1c` on
`codex/brycecast-ui-v2-checkpoint`). Jack rated this the strongest UI work of
any session on this project; this document captures **why it worked, exactly
what he said, what he asked for next, and every open thread** so the next
session continues seamlessly. Read this AFTER `CLAUDE.md`,
`docs/CREATIVE_DIRECTION.md`, and `docs/DESIGN_TASTE.md` — those still rule.

---

## 1. Current state (all committed, working tree clean)

- **Pages done to Jack's approval:** Race Week (Nashville, Jul 18), Race
  detail (3 review rounds), Races archive, Career Lab v1 (feedback below
  pending). Remaining pages: **Live**, then **Home** (per the locked order),
  plus the Career Lab v2 revisions in §3.
- Validation baseline green: `analytics:ui-data-package:refresh-validate`,
  `analytics:view-models:validate`, `test:ui-context-adapter`,
  `test:live-readiness`, `npm run build`. `tsc --noEmit` clean.
- The LaunchAgent serves the **built** bundle on :8787 — rebuild (`npm run
  build`) after changes or Jack sees stale UI there. Dev server on :5173.

## 2. Jack's Career Lab / race-page review (2026-07-12, verbatim-condensed)

This is the immediate work queue. His overall verdict: "Overall, great job…
the part that you just built fresh is great."

### Race pages (track-art evolution)
1. **Street circuits lack the gold start/finish tick** (OSM-traced venues
   have it; image-traced St. Pete / Detroit / Arlington don't). Add S/F
   markers — likely manual per-venue anchor points; do not invent if unsure.
2. **Corner labels on every venue** like Nashville's ("1·2 / 3 / 4"). Ovals:
   pass `--corner-labels` to `scripts/build-track-outline.mjs` after visually
   verifying arc order from the debug render. Road courses need curated
   corner positions — official sector maps can anchor them; never guess names.
3. **THE BIG IDEA — make the hero track shape the interface for section
   data.** Hover behavior on the track outline itself: e.g. gold dots on his
   strongest stretches, quiet marks on the rest, tooltips carrying the
   percentile ("Where the lap time lived" card may stay, but the shape should
   stop being decorative). Requires mapping section families ("Turn 5",
   "I4 to I5", "Pit-out straight") to outline geometry per venue — start with
   ovals (arc-detected corners exist), then curated road courses. He invited
   pushback on mechanism but wants the direction pursued.

### Career Lab v2
4. **Move The Explorer directly under "The climb, race by race"** (above the
   chapter cards) — the interactive thing should hook people before the
   scroll gets long.
5. **Scrap the start→finish scatter view entirely** (it predates this
   session; recharts). His bugs, all real: F1600 and IMSA show **zero dots**
   (those series' rows have no sourced `startPosition`, and the view silently
   drops them); axes don't rescale to the filtered data (Formula Ford dots
   huddle in the top quarter); blue/green/orange dots off-theme. Rebuild as a
   house-SVG view or replace the form outright — full discretion.
6. **The percentiles-grouped view is approved as-is** ("You nailed that").
   Keep it, its filters, and its hover/click behavior.
7. **More diverse, more engaging visuals + unused data.** His words: "there's
   no pie chart… the stock-market winners/losers rectangle [a treemap]… think
   through all the clever visualization types." Data he named as unused:
   per-lap data, battle/competitor data ("his most fierce competitors race by
   race" career-wide — `indy_nxt_head_to_head.csv` has 50 rivals), weather
   (career dry-vs-wet splits from per-race observations), through-lines from
   2019→now by track type / conditions. Forms are Fable's call — variety
   yes, gimmicks no.
8. **Click-through for non-INDY NXT dots** — wants race pages (even light
   ones) for Euroformula/GB3/Formula Ford/F1600 races. A reduced template is
   fine; data depth varies by series (check `parityBySeries`).
9. **Chapter cards:** scroll-in reveal animation opportunity (blocked on the
   animations repo he keeps meaning to link — ASK HIM FOR IT AGAIN). Don't
   apply the percentile-strip template rigidly: the one-race IMSA chapter
   with a single dot "doesn't really make sense" — vary small-chapter cards.
10. Fact check he asked about: **F1600 (2019) is cars, not karting**; sourced
    data starts 2019. He believes earlier (karting-era) data might exist —
    that's an *ingestion* question to raise with him, not a UI task.

## 3. The outstanding queues

### Magic backlog (also in CREATIVE_DIRECTION.md — keep both in sync)
- **Bryce's car as an SVG mark.** Verified: No. 9 Jaguar Land Rover
  Chesterfield CGR entry, livery **black with red trim** (spotter guide
  "BlackRedTrim"; official render:
  `indynxt-cdn.azureedge.net/-/media/IndyCar/Cars/2026/INDY-NXT/Liveries/9-JaguarRangeRover.png`).
  Suit: black with white/red stripe.
- **Team-brand accents** (black/white/red) — decide WITH Jack after core
  pages; red already means "down" in our status language; middle path = keep
  gold №9 plate, add one tricolor suit-stripe detail in exactly one place.
- **Hover car dot following the cursor around track outlines** (whimsy
  candidate, only if it stays out of the way).
- **Scroll-assembled charts** (McKinsey-style) — pending Jack's animations
  repo link (never arrived; requested twice).
- **Per-race standout dynamic charts**; **richer battle viz** (who/when on
  the lap axis).
- Full-career archive expansion — provisionally answered by Career Lab
  holding all 141 races; revisit only if Jack re-raises after using it.

### Live + Home pages (unbuilt)
- **Live** per seeds: gap-trend sparklines from the 1s capture
  (`/api/replay/bryce`), points projection movement, KEEP all trust states
  (fixtures cover wrong_series/pre_session/ready/degraded/stale/blocked).
  It's "the page his parents will have open during the race" — treat with
  that weight. Guardrails in CLAUDE.md are hard constraints (no GPS, no
  invented predictions…).
- **Home**: digest inheriting each page's hero visual in miniature.

## 4. What made this session work (Jack: "more than any other model or
   even any other Fable instance") — DO THESE AGAIN

**Process ritual per page:** read the data estate first and list every fact
worth communicating → pick the FORM per fact (dataviz skill; kill anything
hollow) → build → verify in the real browser (Playwright at 1440 and 390,
element screenshots for close-ups) → a deliberate "last-5%" pass over every
element (copy warmth, alignment, easter eggs) → audit against ALL of Jack's
accumulated feedback before presenting → full validation suite → commit with
story-shaped messages → present leading with what he'd ask first, always
flagging where execution deviated from his words and why.

**Jack interpretation rules (memory: jack-feedback-style):** his prompts are
directional ideas, not specs; his taste trusts yours; he flip-flops mid-
message and expects you to pick the right version; when he asks for X
literally (e.g., "click to bold, click again to navigate") ship the canonical
pattern instead and say so. Editorial rules never bend: no negative framing
(facts + context), archetype labels never render, no invented data, honest
labeled denominators ("mechanical DNF shown dashed, excluded from these
averages"), hard days get dignity (Portland 2025 pattern).

**House visual language (now load-bearing; reuse, don't reinvent):**
- `src/app/charts.tsx`: `ChartTipCard` (white tooltip card, no delay,
  mark-anchored, `action` line in link blue), `useMeasuredWidth` (pixel-space
  SVG so chart text stays crisp — never scale text through viewBox),
  `chartFont`, `inkConnector`, `focusFade` (0.22).
- Interaction pattern everywhere: hover = focus (subject full ink, siblings
  fade, 150ms), nearest-target hit-testing on dense charts (no fat invisible
  strokes), click-through to race pages when a debrief exists, tooltips carry
  "open the race page".
- Gold = Bryce's marker, ONE meaning per chart, always keyed in a caption
  ("gold marks a top-5 finish", "gold ticks mark each group's median").
- Open circle ○ = a day that ended early (chart key language), official
  status in tooltips ("out on lap 6 · contact"; bare "out on lap N" when
  status is 'unknown').
- Red ▽ / green ▲ mirrored deltas sitewide (`.stat__delta--down` is
  status-red by Jack's explicit request).
- Every module has a SourcePill; every empty state says why and when it
  resolves; fixed-zone layouts so nothing wanders between pages
  (`.hero-race` symmetric 1fr|300px|1fr — track box measured dead-center);
  paired cards share intro/caption baselines via `.card--flex` +
  margin-top:auto; every stat tile row stays level (notes on ALL tiles).
- Copy sings when the data does ("Nobody climbed further up the lap chart
  than Bryce: 8 spots"; "If you liked practice, you'll love the race" — that
  one is Jack's line, he loved having it used).

**Data discipline:** UI reads the package/context packs/`/api/*` through
typed adapters only. To add data: extend `scripts/build-ui-data-package.mjs`
+ `scripts/validate-ui-data-package.mjs` + types in `src/data/uiDataPackage.ts`
+ assertions in `tests/uiContextAdapter.test.ts`, then
`npm run analytics:ui-data-package:refresh-validate` (reruns the Python
lanes; ~2 min). For page-scale data use a sha256-integrity pack lane like
`analysis/race-story/output/context-packs/` (loaded via the vite glob in
`src/data/packModules.ts`, which only matches
`analysis/**/output/context-packs/**/*.json`).

## 5. Gotchas the hard way (do not relearn these)

- **Overpass**: needs a User-Agent; 429/504 need backoff; big venues need a
  wider bbox (`pad`); circuits split into segments — junction-split then DFS
  with longest-first bias (`scripts/trace-track-outlines.mjs`); keep 2-node
  connector ways (Road America broke without them); exclude
  kart/motocross/rallycross/dragstrip by TAGS not just names (WWTR's 1761m
  motocross loop nearly shipped).
- **Street circuits aren't OSM raceways** — traced from official INDYCAR
  Black outline PNGs via `scripts/trace-track-from-image.mjs` (largest dark
  component, Moore contour, RDP). Images cached in `src/assets/tracks/maps/`.
- **Track name aliases**: packs vs canonical disagree ("Detroit Downtown
  Street Circuit" vs "Streets of Detroit") — `aliasSlugs` in
  `src/assets/tracks/index.ts`. New assets MUST be registered in that file's
  imports or they silently don't render.
- **`data/live/brycecast.sqlite` is ~5 GB** — never `summarizeArtifact` it;
  screen sourceRefs must be `/api/*` or sourceInventory-backed (validator
  enforces; point at `/api/timing` and carry the sqlite path inside module
  payloads).
- **qa-screenshots.mjs** waits for 'load' + settle, NOT networkidle (live
  routes poll every second). API-backed cards (weather/broadcast) need a
  `waitForSelector` or long settle before full-page captures.
- The in-app Browser pane's paint is flaky for scrolled screenshots — use
  Playwright (`channel: 'chrome'`) against :5173 for all visual QA.
- `.tower__row.race-row` needed double-class specificity; archive rows drop
  mini+date columns under 640px.
- Career conversion rows have `eventStartDate` (package-enriched); the climb
  and any chronological career work must sort by it — raw pack order is NOT
  chronological.
- Non-INDY NXT series lack `startPosition` on many rows — any start-based
  view must state the exclusion or handle it (this is what broke the old
  scatter for F1600/IMSA).
- `raceOrder` in debrief packs can be a number or `{roundIndex}` — use
  `roundIndexOf` from `src/data/debriefArchive.ts`.

## 6. Starter prompt for the next session (handoff-skill shape)

```text
I want to continue the BryceCast page-craft series: Career Lab v2, the
interactive track-shape idea, then the Live page.

Context:
- Repo: the BryceCast working copy (Bryce Aron INDY NXT companion app), branch
  codex/brycecast-ui-v2-checkpoint. Start by reading CLAUDE.md,
  docs/CREATIVE_DIRECTION.md, docs/DESIGN_TASTE.md, then
  docs/PAGECRAFT_HANDOFF_2026-07-12.md (the full state + Jack's latest
  feedback + method notes live there).
- Race Week, Race detail, Races archive, and Career Lab v1 are shipped and
  approved; Jack's Career Lab review items are queued in the handoff doc §2.
- Hard constraints: data/source contracts, editorial rules (no negative
  framing, no invented data, archetype labels never render), and the
  DESIGN_TASTE blacklist. Jack's feedback is directional — your taste decides
  execution, and you report deviations.

Before doing any implementation:
- Read the four docs above and the auto-loaded memory.
- Run the validation baseline and open localhost:5173 to see current state.
- Independently review the queued feedback: decide order, push back where an
  idea has a better form, and check nothing is already stale.

Task:
- Work the §2 queue top to bottom at the established quality bar: per-page
  ritual, last-5% pass, audit against all accumulated feedback before
  presenting, screenshots at 1440/390, full validation, commit per page.

Validation:
- npm run analytics:ui-data-package:refresh-validate · analytics:view-models:validate
  · test:ui-context-adapter · test:live-readiness · npm run build, plus
  Playwright screenshots as proof.
```
