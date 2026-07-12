# BryceCast Creative Direction

Written by Fable, 2026-07-11, after a long working session with Jack. This is
the inheritance document for page-craft sessions: read this, DESIGN_TASTE.md,
and CLAUDE.md, then build. Treat older UI docs (MagicPath mocks, UI blueprint
visual options, V3 brief visual sections) as history, not instruction — they
were useful once and are superseded by this file plus DESIGN_TASTE.md.

## What this is

A companion app for one driver: Bryce Aron, No. 9, Chip Ganassi Racing,
INDY NXT. Built by Jack for Bryce, his family, and friends. The bar is not
"good dashboard" — it's *the site Bryce would screenshot and send to the
group chat*. Personal, warm, meticulous, quietly funny where it can be.

## The one sentence

**The analysis is the interface.** Jack has said this three times in three
forms (June 17 MagicPath feedback, July 11 V4 feedback, July 11 content
feedback). Paragraphs about data are failure; the chart IS the sentence.
If a module is text-only, either find its visual form or ask whether it
deserves to exist.

## Locked decisions (Jack, 2026-07-11 — do not relitigate)

1. **Visual style**: Apple-grade light minimalism per DESIGN_TASTE.md. He is
   happy with the V5 look — "the UI looks great now… much happier." Keep it.
2. **Rivals appear by name** — head-to-head records, neutral framing.
3. **Result-vs-expectation is shown** (field-strength adjusted), copy shaped
   by the no-negative-framing rule.
4. **Family-first density** with a "more" layer one tap down for depth.
5. **Track maps**: outline-only line art from OpenStreetMap geometry (ODbL —
   keep the attribution line on the Data page). Apple-style: thin ink line,
   no fills, no fake GPS dots. Build once into src/assets/tracks/.
6. **Order of work, one page per session**: Race Week → Race detail →
   Races archive → Live → Career → Home. Each session: build the page to
   done, screenshot phone + desktop, show Jack, iterate on his reaction
   before starting the next page.
7. Whimsy is welcome. Slop is not. Whimsy = a lovely detail that rewards
   attention (a countdown that reads "6 days to green", the plate glyph, a
   season strip that feels like a flipbook). Decoration for its own sake is
   the enemy; see the DESIGN_TASTE blacklist.

## The editorial point of view

The site sees the season **through Bryce's eyes** — the version of the story
he'd show a team principal, honestly. This is not lying with statistics; it
is choosing denominators deliberately and labeling them:

- **"When the car finished"** views: 2026 has one official Mechanical DNF
  (WWTR, June 6, P23 — it broke a genuinely strong points run). Stats that
  exclude mechanical failures are fair IF the on-screen label says so
  ("11 clean races · mechanical DNFs excluded").
- **Intra-team framing**: Ganassi runs 4 cars (Aron, Etter, Roe, Koolen).
  Per-race teamContext + career head-to-head exist (e.g., Bryce ahead of
  Roe in 23 of 40 shared races). "Strongest Ganassi car this season" must be
  COMPUTED before it is shown — if the data says it, show it proudly; if it's
  mixed, show the specific cuts where it's true (qualifying, road courses,
  clean races) and stay quiet where it isn't. Never assert unverified.
- **Field-strength adjustment**: field_strength_by_race gives result-vs-
  expectation per race — several of Bryce's mid-pack finishes came in the
  season's deepest fields and OVER-performed expectation. That's the framing.
- The INDYCAR test / points-threshold storyline (Jack mentioned Bryce was on
  track for it before WWTR): **verify against official INDY NXT/INDYCAR
  sources before any on-screen claim**. If verifiable, a "points pace vs
  threshold" line chart with the WWTR gap annotated is a killer module.
- Hard rules that never bend: no fabricated data, no archetype labels,
  no negative editorial copy (facts + context only), guardrails in CLAUDE.md.

## The data goldmine (mostly unused — this is the whole point)

| Data | Where | Size |
|---|---|---|
| Head-to-head vs every rival | analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv | 50 drivers |
| Field strength + result vs expectation | .../deep_dive/tables/field_strength_by_race.csv | 41 races |
| Driver strength ratings (whole grid) | .../deep_dive/tables/driver_strength_ratings.csv | 51 drivers |
| Practice/qual → race signals | .../deep_dive/tables/prep_session_signals.csv (+ _correlations) | 41 weekends |
| Full-field lap-by-lap positions | .../tables/indy_nxt_lap_timeline.csv (Bryce), .../deep_dive/tables/full_field_lap_dynamics_by_* | 29.5k samples |
| Race inflection points (lap, trigger, magnitude) | analysis/indy-nxt-race-lap-section-enhancement/output/race_lap_inflection_points.csv | 165 moments |
| Section timing percentiles per weekend | .../race_section_lap_observations.csv + section context packs | 159 sessions |
| Our 1s live capture (gaps, points, per second) | data/live/brycecast.sqlite via /api/replay/bryce | 13.7k Bryce samples |
| Leader dominance, cautions w/ causes, penalties, pit counts, most-improved | debrief packs + deep_dive tables | 36–40 races |
| Career percentiles across 7 series, conversion scatter | career-lab pack + career_result_conversion.csv | 141 races |

Rules of the road: UI reads the ui-data-package + context packs + /api routes
through typed adapters (src/data/uiContextAdapter.ts). **No raw-CSV parsing in
React.** If a table above isn't in a pack yet, extend the package build
(scripts/build-ui-data-package.mjs) — that's the sanctioned path, then
`npm run analytics:ui-data-package:refresh-validate`.

What we genuinely do NOT have (don't promise): telemetry traces, live GPS,
tire/pit strategy, official weather, historical lap TIMES (lap charts are
positions; true pace traces exist only for 2026 live-captured races).

## Per-page seeds (starting points, not fences — taste wins)

- **Race Week**: track outline hero; start→finish conversion viz for this
  track type (every past race a dot); "Friday signal" (what practice rank has
  meant for Sunday); rivals-nearby-in-points strip; weather; every "what needs
  to go right" card anchored on a real number.
- **Race detail**: the race as a story — full-field lap chart (rivals gray,
  Bryce ink), inflection callouts on the line, section strengths with human
  corner names, result-vs-field-strength verdict, teammate comparison.
- **Races archive**: season bump chart (position by round) + points-vs-leader
  accumulation line; the list becomes the index, the chart the spine.
- **Live**: gap-trend sparklines from the 1s capture; points projection
  movement; keep the trust states.
- **Career**: each chapter gets a results strip (every race a dot on a
  percentile scale); the climb should be VISIBLE.
- **Home**: digest that inherits each page's hero visual in miniature.

## Process per page (the quality ritual)

1. Read the page's packs/tables; list every fact worth communicating.
2. For each fact: what's the best FORM? (dataviz skill: chart, stat tile,
   text, icon — form follows the data's job.) Kill anything hollow.
3. Build with the existing component/token system; validate any new chart
   colors with the dataviz six-checks script.
4. Screenshot phone (390px) AND desktop (1440px) via scripts/qa-screenshots.mjs.
5. Self-review against DESIGN_TASTE blacklist + the screenshot test
   ("would Bryce send this to the group chat?").
6. Show Jack. His reaction is the acceptance gate. Iterate, then next page.
7. `npm run build` + test:ui-context-adapter before calling any page done.

## Jack's Race Week reaction (2026-07-11) — binding for every page

Verdict: "overall very, very strong… the analysis-as-visuals is exactly it."
His notes are DIRECTIONAL — Fable's taste decides the execution and reports
deviations (see memory: jack-feedback-style). What his reaction locked in:

1. **Interactivity is now house chart behavior, not a nice-to-have.** The
   pattern shipped on Race Week is the standard: hover = focus (subject full
   ink, everything else fades to ~0.2, 150ms ease), a white tooltip card
   (no delay, anchored to the mark), and click-through to the race page when
   a debrief exists ("open the race page" action line in the tooltip).
   Never let hover behavior obstruct reading; touch devices just get the
   click-through.
2. **No hollow text modules.** The prior band ("67th percentile" = "you're
   doing fine") and the top10Path card (truisms without numbers) were cut.
   A text module must carry a number that changes what the reader knows.
   The intended comeback for "what needs to go right": post-qualifying,
   with his actual start position against the historical conversion rows.
3. **Track art is a compact signature, not a poster** (~380px max on
   desktop; the shape isn't intricate enough to earn more). Corner labels
   stay quiet; the section insight lives in a hover tooltip on the gold
   corner dot.
4. **Motion backlog (deferred, needs the animations repo Jack keeps meaning
   to link):** scroll-assembled charts (McKinsey-insights style) and possibly
   a track draw-in; a mouse-follows-track car dot was floated — treat as
   whimsy candidate, only if it stays out of the way. All within
   DESIGN_TASTE motion rules (fast, crisp, few; reduced-motion respected).
5. **Desktop first while page content settles.** Keep phone layouts working,
   but don't dual-optimize until the content of each page is approved.

## Session bootstrap

New session should read: CLAUDE.md (auto), memory (auto), this file,
docs/DESIGN_TASTE.md. App runs at localhost:8787 (LaunchAgent) or
`npm run dev` (5173) + the brycecast-api launch config. Everything is
committed on codex/brycecast-ui-v2-checkpoint.
