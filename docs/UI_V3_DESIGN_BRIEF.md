# BryceCast V3 Design Brief

Author: Claude Fable 5 (lead product/design). Date: 2026-07-02.
Status: product structure, data contracts, and editorial rules remain binding.
The VISUAL SYSTEM sections below (dark-first theme, Archivo/Inter, gold-as-text)
were superseded on 2026-07-11 by docs/DESIGN_TASTE.md — light, system-font,
near-monochrome, gold as a mark only. Supersedes all prior
UI direction (MagicPath mocks, UI blueprint visual options, V2 scaffold layout).
Data contracts, source guardrails, and live-state gates from
`docs/UI_ANALYTICS_PRODUCT_CONTRACT.md` and `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`
remain binding.

## What BryceCast is

A companion app for one driver. Not a racing dashboard, not a stats site — the
app Bryce's family opens on race day, the app Bryce opens on a Tuesday to poke
at his career data, the app a friend opens when the TV graphics won't show car #9.
The quality bar: INDYCAR could ship this as an official single-driver companion
and be proud of it.

Three moods it must nail:

1. **Race day electricity** — live position, gaps, the points picture, zero doubt
   about whether the data is trustworthy right now.
2. **Race week anticipation** — countdown, how to watch, what history says about
   this track, what needs to go right.
3. **Quiet-week depth** — the career playground, the season story, the archive.

## Editorial voice (hard rule)

Bryce reads this app. His mother reads this app.

- Lead with gains, context, and effort. "P11 · up 4 from the start" not "outside
  the top 10 again."
- Bad days are facts with context, never editorial. Status chips stay neutral
  ("Contact, lap 12"), narrative copy stays factual-warm, and no auto-generated
  archetype labels appear anywhere until manually reviewed.
- Percentiles and field-size context wherever raw finishing positions would
  mislead (a P12 in a 27-car INDY NXT field ≠ P12 in a 10-car field).
- Never fake, never pad: unavailable data states are designed, honest, and calm —
  not error-red walls, not hidden.

## Information architecture

Five surfaces + a dynamic home state. Mobile: bottom tab bar. Desktop: top nav,
density expands.

```
Home ("Now")   — state router: answers "what's happening with Bryce right now?"
Live           — race-day companion (readiness-gated)
Race Week      — next-event HQ (prep intelligence)
Races          — every race debrief, newest first (the archive)
Career         — Career Lab: the analytics playground
Data           — sources/trust/ops (footer-level nav, operator styling)
```

### Home state machine (drives the first screen)

| State | Trigger | Hero |
| --- | --- | --- |
| LIVE | `/api/readiness` = ready/degraded | Live Bryce tile + tower + points projection, one tap to full Live |
| Imminent | pre_session near known session | Countdown, watch route, weather, readiness gates |
| Race week | upcoming event within ~5 days | Event hero, countdown, prep intelligence stack |
| Post-race | completed race within ~3 days, debrief pack exists | Debrief headline + championship movement |
| Off-week | otherwise | Season story card, next event, career highlight rotation |
| Guard states | wrong_series / stale / blocked | Family-readable trust banner + fallback content |

Family-readable state labels everywhere ("Race Control is showing the IndyCar
session right now — Bryce's session hasn't started"), operator codes live in
the source drawer.

### Live surface

- **Bryce hero tile**: position (huge), delta vs start, gap ahead/behind with
  names, last/best lap, pit count, flag chip. The single most important screen
  in the product.
- **Championship projection** (Bryce's requested feature): full-field table of
  Race Control `totalDriverPoints` — "if the race ended now" season standings
  with movement arrows vs pre-race standing. Labeled "Race Control running
  points · provisional". Bryce row pinned/highlighted. Requires the new
  full-field points route; degrades to Bryce-only card, then to historical
  standing fallback per contract.
- **Timing tower**: full field, Bryce band highlighted, gaps, pit chips.
- **Race trend**: Bryce position by lap from the live archive once `ready`.
- **Weather strip** (NWS-labeled), **flag/lap header**, **trust banner**.
- All states from the 10 live fixtures are first-class designed screens.

### Race Week surface

- Event hero: venue, dates, session schedule (source-timezone caveat handled),
  countdown, watch/listen routes from the schedule feed.
- "The shape of the weekend": historical prior band (n, p25/median/p75) rendered
  as an honest interval — explicitly "history, not a prediction".
- "What needs to go right": top-10 path factor cards.
- Track history: same-track + track-type records with denominators.
- Analog races: linked to their debrief pages.
- Weather window: NWS current + forecast readiness.

### Races (debrief archive)

- Reverse-chron race cards: outcome, start→finish, points earned.
- Race page: headline KPI strip, start→finish slope, lap position story
  (inverted-y line, partial-data badges), race context chips (cautions,
  incidents — neutral), team context, championship progression after the race,
  source drawer.

### Career (Career Lab)

The playground. Two layers:

1. **Story layer** (default): season chapters 2019→2026 as a horizontal journey,
   series summary cards with percentile framing, career milestones, special
   modules (IMSA Daytona 24 stint story, Formula Ford lap-shape, F1600 podium
   run) as richly designed feature cards.
2. **Explorer layer**: result-conversion explorer — every career race as a
   filterable scatter/table (series, year, track type, start position → finish
   percentile), qualifying→finish conversion view, head-to-head/teammate
   benches where source-backed. Powered by the career-lab context pack +
   career-dimension pack. Coverage/parity surfaced as availability badges,
   the full parity matrix lives one tap down.

### Data surface

Validation status, live source console, archive state, gap ledger. Operator
styling (denser, monospace accents). Reachable from footer + source drawers.

## Visual system

- **Dark-first, dark-only v1.** Broadcast/night-race feel; the app should look
  at home next to a race broadcast and feel premium on a phone at the track.
- **Surfaces**: near-black blue-tinted stack (`#0B0E14` base, `#12161F` raised,
  `#1A2029` overlay), 1px hairline borders (`rgba(255,255,255,0.08)`).
- **Ink**: `#F2F5F9` primary, `#9AA5B5` secondary, `#5C6675` muted.
- **Bryce gold**: `#F5B63F` — reserved identity color. Bryce's row, Bryce's
  line, Bryce's dot, in every chart and table, always and only this color.
  Nothing else may use it.
- **Status** (readiness semantics from contract): green `#3FB96B`, amber
  `#E0A93E`, red `#E05D5D` — chips always carry icon + label, never color alone.
- **Categorical palette** (charts, non-Bryce series): validate with the dataviz
  six-checks script against `#12161F` before shipping; candidates
  `#5B9BD5` blue, `#8B7BD8` violet, `#4FBFA3` teal, `#D08770` clay.
- **Type**: Archivo (display, condensed feel for numbers/headers) + Inter
  (body/UI), bundled locally via @fontsource — no CDN. `tabular-nums` on all
  timing/points figures.
- **Marks**: per dataviz skill — thin bars with 4px rounded data-ends, 2px
  lines, ≥8px markers, 2px surface gaps, selective direct labels, recessive
  grid. Tooltips/crosshair on all plots. Legend for ≥2 series.
- **Number-first hierarchy**: the position/points/gap figures are the heroes;
  labels are quiet caps-tracking captions.
- **Motion**: subtle — position-change pulses in the tower, countdown ticks,
  live-dot breathing on the trust banner. No gratuitous animation.

## Engineering shape

- React 19 + Vite + TS, react-router for real URLs (`/live`, `/race-week`,
  `/races/:sessionId`, `/career`, `/data`).
- `src/data/uiContextAdapter.ts` rewritten for the `upcomingPrep` package shape
  (post roll-forward), context packs loaded via `import.meta.glob` so new packs
  need no hand-registered imports; keep sha256 integrity checks.
- Runtime hooks: `useReadiness()` polling `/api/readiness` with adaptive cadence
  (1s live, 15s imminent, 60s otherwise, backoff on wrong_series/stale/blocked
  per contract).
- Charts: recharts, wrapped in house components (`<BandInterval>`, `<LapStory>`,
  `<SlopeChart>`, `<TowerList>`, `<PointsProjection>`) so mark specs are
  enforced once.
- Screens code-split by route; context packs lazy-loaded per screen.

## Delivery order

1. Theme + shell + nav + state fixtures (home router skeleton).
2. Live surface against the 10 fixtures (works before Mid-Ohio!).
3. Race Week against Mid-Ohio packs (after data roll-forward lands).
4. Races archive + race page.
5. Career story layer, then explorer layer.
6. Data surface, source drawers everywhere, QA pass, visual QA screenshots.

## Build status (2026-07-02, end of first Fable session)

Done and verified:

- Live runner installed as LaunchAgent (`com.brycecast.live-runner`), IDLE and
  auto-arming for Mid-Ohio practice July 3 18:00 UTC. Cache-backed API landed.
- Data estate rolled forward: Road America 2026 imported (R1 P21, R2 **P10 ▲5**),
  standing P17/160, 38 debrief packs, 7 upcoming packs, `screens.upcomingPrep`.
- V3 app shell: theme (validated palette), custom router, Home, Live (all
  fixture states + runtime polling), Race Week (Mid-Ohio), Races archive (all
  38 via manifest+glob adapter), Race detail (slope chart, neutral framing),
  Career Lab (series cards + conversion scatter explorer + biggest climbs),
  Data/trust page. `qa-screenshots.mjs` captures all routes both viewports.

Known issues / next up:

- Debrief `roundIndex` is session-ID-ordered, not chronological (task #8) —
  Home "last race" shows WWTR instead of Road America R2 until fixed.
- Career regression pins being updated by Codex lane (task in flight).
- Race Week lacks runtime session schedule/watch-route/weather cards
  (needs `/api/session` + `/api/weather` wiring on that screen).
- Live surface unproven against a real green flag until Mid-Ohio.
- Career Lab explorer should gain qualifying-conversion + percentile views;
  deep modules (IMSA/Formula Ford/F1600 stories) not yet built.
- Legacy `src/App.tsx`/`styles.css` deleted; `analyticsViewModels.ts`,
  `adapters.ts`, `audio.ts`, `pov.ts`, `seed.ts` remain unused by V3 (candidates
  for cleanup once nothing references them).
- Deploy lane (Mac mini + Cloudflare Tunnel, fully public) not started.

## Out of scope (unchanged guardrails)

Live GPS/moving dot, POV video, team radio audio, pit/tire/fuel strategy,
official-weather claims, calibrated finish predictions, local points math,
media gallery (deferred to v1.5), iOS native (post-web).
