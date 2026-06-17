# BryceCast Visual Direction Options

Generated: 2026-06-17

Source baseline:

- `analysis/ui-blueprint/UI_BLUEPRINT.md`
- `analysis/ui-blueprint/COMPONENT_FIELD_MATRIX.md`
- `analysis/ui-blueprint/STATE_FIXTURE_QA.md`
- `analysis/ui-blueprint/DECISIONS_FOR_JACK.md`
- `analysis/product-definition/PRODUCT_DEFINITION_PACKET.md`
- `analysis/ui-data-package/ui-data-package.json`, `schemaVersion=brycecast.uiDataPackage.v1`, `generatedAt=2026-06-16T22:26:08.630Z`, `baselineCommit=5636bb6`

This document is visual direction only. It does not choose the final style, implement frontend code, change ingestion, change backend contracts, or modify source data.

## Product Design Brief

Create three polished visual systems for an analytics-first BryceCast UI. The selected direction must support a mobile-first dynamic homepage that can become Race Weekend Prep, Session Imminent, Live Companion, guarded fallback, Race Debrief, Career Lab, or Off-Week without changing the underlying source rules.

The source contract is the design anchor:

- Live truth starts at `/api/readiness`, not raw endpoint reachability.
- Road America prep can use static package values as prep context only.
- Live timing, live points, and live weather must come from runtime APIs.
- Weather is NWS context, not official INDY NXT weather or track temperature.
- Points render from `/api/readiness.points`; the UI must not compute points locally.
- Wrong-series, stale, blocked, partial, replay-only, and unavailable states must look intentional, not broken.
- Source detail belongs behind compact source affordances except when the state itself is blocked.

## Source-Backed Content For Direction Work

These values should appear in design mocks and reviews instead of placeholder data:

- Race week prep: `Grand Prix at Road America Race 1`, `2026-06-19`, Road America, road course, `4.048 mi`, `14 corners`.
- Road America same-track history: `2 races`, average finish `8.5`, average gain `0`, top-10 rate `100%`.
- Road-course history: average finish `12.6`, average gain `-2.45`, top-10 rate `40%`.
- Ready live fixture: Road America Race 1, `GREEN`, lap `12/20`, guarded Bryce row, Bryce `P1`, car `9`, status `Running`.
- Ready points fixture: `race_control_live`, running driver points `25`, total driver points `143`, total entrant points `160`, historical baseline `131`, historical rank `14`, reconciliation required.
- Degraded fixture: Bryce timing still guarded, points mode `partial`, running points `12`, running-points coverage `8/25`, total driver/entrant points unavailable, weather `partial`.
- NWS weather fixture: `72 F`, clear, wind `9 mph`, gust `16 mph`, direction `220`, source `NWS API`.
- Latest completed debrief seed: `2026 INDY NXT by Firestone at World Wide Technology Raceway`, start `P12`, finish `P23`, gain `-11`, points `7`, cumulative points `131`, standing rank `14`, confidence `medium`.
- Lap story seed: official lap chart, Bryce net lap-chart gain `0`, best running position `21`, worst running position `22`, field lap drivers `24`, top mover Myles Rowe `+18`.
- Best finish seed: `2024 Grand Prix of Monterey Race 2 R2`, start `P5`, finish `P3`, gain `+2`, finish percentile `90`, points `35`.
- Career context: INDY NXT has `36` race rows, average finish `12.22`, average gain `-0.97`, top-10 rate `47.2%`; Formula Ford has `15` race rows, average finish `4.73`, top-10 rate `100%`.
- Source Ops: validation `ok=true`, `errorCount=0`, `warningCount=1`, open gaps `9`, priority gaps `0`.

## Shared Visual Rules

- Avoid neon, dark mission-control styling, fake cockpit elements, fake maps, moving dots, telemetry fantasies, and generic SaaS card grids.
- Use a restrained product type scale. Charts and timing rows need information density, but the first viewport must still answer one question.
- Use color as state language, not decoration: green/pass, amber/partial or degraded, red/wrong-series or blocked, gray/unavailable or replay-only.
- Keep cards to actual modules. Do not put cards inside cards. Use row grouping, dividers, and surface tint before elevation.
- Put source/confidence in the same visual grammar as the data, not as afterthought footnotes.
- Let mobile define priority. Desktop expands the same hierarchy rather than becoming a separate command-center product.

## Option 1: Trackside Brief

### Visual Principles And Reference Inspirations

Trackside Brief is the most public-facing direction. It treats BryceCast like a serious race-week companion for family, friends, and serious fans who need the next useful answer first.

Reference inspirations:

- Apple Sports-style scoreboard clarity: one primary state, short labels, fast scanning.
- The Athletic live-blog pacing: readable event context with analytics nearby but not shouting.
- Financial Times/Datawrapper chart restraint: precise bars and lines with visible denominators.
- NWS forecast strip discipline: weather as source-backed conditions, not drama.
- Printed race program hierarchy: event, session, track, then supporting history.

Visual feel:

- Light base surface with crisp dark text, slate dividers, one restrained Bryce accent, and state colors only where state changes meaning.
- Rounded corners stay modest. Modules feel like pieces of a race brief, not dashboard tiles.
- Typography is confident but plain: large session/result numbers, compact explanatory copy, no theatrical labels.

### Mobile-First Race-Week/Live Homepage Composition

First viewport:

1. Thin product state band: `Race week`, `Live ready`, `Race Control is showing another series`, or `Source blocked`, with last checked and source pill.
2. Primary answer card:
   - Race week: `Grand Prix at Road America Race 1`, `Fri Jun 19`, Road America, `4.048 mi`, `14 corners`.
   - Live ready: `Bryce P1`, `GREEN`, lap `12/20`, `Running`.
   - Wrong-series: plain red guard, no Bryce live values, next safe context.
3. One action row: refresh, watch/listen only if runtime API supplies it, source drawer.
4. One supporting module visible below the fold hint: track history during prep, timing tower during live, or debrief result post-session.

Second stack:

- Track history comparison, weather strip, points card, and debrief seed appear as calm stacked modules.
- Source and caveat pills sit inline in each module header and open a bottom sheet.
- Source Ops appears only as a compact blocked-state checklist or explicit operator link.

### Desktop Expanded Layout Composition

- 12-column layout.
- Main 7-8 columns: active state surface with the same first-answer hierarchy.
- Right 4-5 columns: compact briefing rail with source state, track history, weather, points, and one debrief/career context module.
- Desktop live mode keeps the timing tower readable without promoting raw source logs above the family layer.
- Source drawer becomes a right-side sheet with a summary top, then source paths, gates, denominators, and missing contracts.

### Chart And Component Treatment

| Component | Treatment |
| --- | --- |
| `TimingTowerFocus` | Mobile shows Bryce plus nearby rows, not the full field. Bryce row is a horizontal driver band with car `9`, `P1`, `Running`, `12 laps`. Desktop can show a wider table with rank, car, driver, team, status, laps, and points fields when populated. Wrong-series hides live labels and sends timing detail to diagnostics only. |
| `LapPositionStory` | Narrative chart card with an inverted y-axis line and short caption. For WWTR, show `P12 -> P23`, gain `-11`, lap-chart best/worst `21/22`, and a badge for official lap chart. Partial charts get a badge before the chart title, not buried in the drawer. |
| `TrackHistoryComparison` | Two stat bands: Road America and road courses. Each band shows finish, gain, top-10 rate, and denominator. Example: `Road America: 2 races, avg finish 8.5, top-10 100%`; `Road courses: avg finish 12.6, avg gain -2.45, top-10 40%`. |
| `LivePointsCard` | Plain points ledger. Header says `Race Control running points` or `Historical points baseline`. Ready state shows running `25`, driver total `143`, entrant total `160`, historical baseline `131`, rank `14`, and a visible `Provisional until reconciled` label. Partial state shows only running `12` and coverage `8/25`; null totals render unavailable. |
| `RuntimeWeatherStrip` | Compact horizontal strip: source, observed condition, temp, wind, gust, alert count. Example: `NWS API`, `Clear`, `72 F`, `Wind 9 mph`, `Gust 16 mph`. In partial state, hide missing legs and show `partial` plus failed-probe detail in drawer. |
| `SourcePill` / `SourceDrawer` | First-screen source pill uses translated labels: `Source backed`, `Partial`, `Live only`, `Replay only`, `Unavailable`, `Race Control mismatch`. Drawer starts with plain explanation, then exact source path/API, confidence, denominator, gates, and caveats. |

### Source/Confidence State Treatment

- First-screen labels are family-readable by default: `Live ready`, `Partial source`, `Race Control mismatch`, `Stale timing`, `Source blocked`.
- Drawer preserves exact machine terms: `ready`, `degraded`, `wrong_series`, `stale`, `blocked`, `race_control_live`, `historical_fallback`, `partial`.
- Confidence appears as a small text+dot pair, not a badge wall: `high`, `medium`, `medium_low`.
- Denominators are visible in the main UI when they change interpretation: `2 races`, `8/25 point rows`, `36/36 completed races have lap samples`.

### Best For And Sacrifices

Best for public sharing, family/friends, and race-week usability. This is the safest choice if BryceCast needs to feel immediately useful on a phone without explaining the data system first.

Sacrifices some analyst density. Serious fans may need one more tap to reach lap dynamics, parity matrices, and source audit detail.

## Option 2: Racecraft Atlas

### Visual Principles And Reference Inspirations

Racecraft Atlas is the most analytics-forward direction. It frames BryceCast as a living race notebook: charts, comparisons, debrief evidence, and source caveats are central, but still source-disciplined.

Reference inspirations:

- Observable notebook clarity: analytical sections with visible method boundaries.
- NYT Upshot and Financial Times chart essays: restrained annotation, not dashboard decoration.
- Motorsport timing sheets: rank and lap movement as compact evidence, not fantasy telemetry.
- Datawrapper chart cards: small multiples, strong labels, direct denominators.
- Field guide or atlas composition: maps are not needed; the "atlas" is a source-backed library of racing contexts.

Visual feel:

- Clean white and cool gray surfaces with chart-first modules and precise annotations.
- Typography can pair a crisp sans for UI with a slightly more editorial display style for section titles, but body and tables stay utilitarian.
- Accent colors differentiate data families: readiness, track history, points, weather, source confidence. State colors still override family color when safety matters.

### Mobile-First Race-Week/Live Homepage Composition

First viewport:

1. Compact state strip with readiness and source confidence.
2. Chart-led primary card:
   - Prep: Road America history comparison is the hero because it answers "what kind of weekend is this?"
   - Live: Bryce status and timing tower share the hero, with a tiny lap `12/20` progress rail.
   - Post-session: result and lap-position story become the hero.
3. A "Why this matters" line using only source-backed descriptive insight, such as "Road America sample is small: 2 races, avg finish 8.5."
4. Drawer affordance stays visible because this direction expects users to inspect evidence.

Second stack:

- Small chart modules for points, weather, and source readiness.
- Debrief and career modules are promoted earlier than Option 1 because the direction assumes a serious fan or Bryce/team-adjacent reader.
- In blocked states, the homepage shows a source-state chart instead of a friendly generic error.

### Desktop Expanded Layout Composition

- 12-column layout with a chart canvas feel.
- Main 8 columns: active analytical story, such as live rank/timing, lap-position story, or track history.
- Right 4 columns: source rail plus compact points/weather cards.
- Career Lab can use the full width for series summary and metric parity, with the source drawer docked.
- Desktop debrief reads like a data story: result header, start-to-finish slope, lap-position line, source/caveat rail.

### Chart And Component Treatment

| Component | Treatment |
| --- | --- |
| `TimingTowerFocus` | Treat as a ranked ladder with Bryce highlighted, not as a generic table. Mobile shows top rows plus Bryce context; desktop shows rank, car, driver, team, status, laps, liveRank, and points fields when present. If fields are null, the column remains visually absent or unavailable, not zero. |
| `LapPositionStory` | Core visual asset. Inverted y-axis line with start/finish markers, best/worst range, and partial-source overlays. WWTR can show `Start P12`, `Finish P23`, `Best running P21`, `Worst running P22`, field lap drivers `24`, and top mover `Myles Rowe +18`. Monterey can show the positive case: `P5 -> P3`, finish percentile `90`. |
| `TrackHistoryComparison` | Compact bar pair with aligned scales: same-track vs road-course. Denominators are part of the axis label, not a footnote. Top-10 rates use small horizontal bars; average gain uses a zero-centered bar to make `0` vs `-2.45` readable. |
| `LivePointsCard` | Ledger chart, not a KPI tile. Show source mode, populated fields, and coverage. Ready state can show `running 25`, `driver total 143`, `entrant total 160`, `historical 131`, rank `14`, with `reconciliationRequired=true` as a visible annotation. Partial state visibly gaps missing totals. |
| `RuntimeWeatherStrip` | Micro-chart strip: current condition, temp, wind, gust, forecast leg, alerts. NWS source label sits in the strip, and partial probes create a small broken segment rather than hiding the weather card. |
| `SourcePill` / `SourceDrawer` | Source pill is more technical than Option 1: `available/high`, `partial/medium`, `live_only`, `source_bounded`, `replay_only`. Drawer is a methods panel with source paths, metric IDs, confidence, caveat copy, denominator, and gate history. |

### Source/Confidence State Treatment

- Confidence is integrated into charts: line opacity, hatch/fill patterns, and explicit source labels show whether a value is live, partial, source-bounded, or replay-only.
- Partial and unavailable states remain visible as chart gaps, not blank cards.
- The drawer reads like methods documentation. It should make exact source families easy to audit: `official_lap_chart`, `race_control_timing`, `history_compact`, `futureWeekendPrep`, `careerMetricParity`.
- Machine labels are acceptable in first-screen pills when paired with readable copy.

### Best For And Sacrifices

Best for serious fans, Bryce, and post-race analysis. This direction makes debrief, lap story, track history, career parity, and source boundaries feel like the actual product rather than secondary detail.

Sacrifices some immediate family readability. It can feel more like an analytical publication than a fast race-day companion if copy and density are not tightly edited.

## Option 3: Readiness Console

### Visual Principles And Reference Inspirations

Readiness Console is the most trust-forward direction. It is not a dark war-room or fake cockpit; it is a light, precise source-readiness surface where the interface shows why BryceCast is or is not safe to believe.

Reference inspirations:

- Stripe status page discipline: calm state language, clear incident/status hierarchy.
- GitHub Actions check summaries: pass/warn/fail gate visibility without drama.
- Aviation dispatch boards: source readiness, route/session status, and weather treated as operational facts.
- Linear issue panels: dense but orderly detail in side rails and drawers.
- Professional timing sheets: tables that privilege row clarity over decoration.

Visual feel:

- Light operational surface with high-contrast text, compact rows, clear dividers, and state color only on narrow rails, chips, and gate icons.
- A stronger monospace/numeric treatment is allowed for rank, lap, points, and source states, but body copy remains readable.
- The brand comes from reliability and precision, not racing theatrics.

### Mobile-First Race-Week/Live Homepage Composition

First viewport:

1. Product readiness banner with state, reason, and checked time.
2. Gate summary row: timing, INDY NXT heartbeat, Bryce identity, freshness, points, weather, replay.
3. Primary state module:
   - Ready/degraded: Bryce live status and timing tower.
   - Pre-session: countdown/session and readiness gates.
   - Wrong-series/blocked: recovery/source checklist first, no live values.
4. Compact source drawer button is always present because source state is part of the main product promise.

Second stack:

- Points mode card, weather probes, track history, and archive state.
- Debrief and career modules stay below active operational truth unless the route is post-session/off-week.
- Source Ops has a clear operator mode, but blocked states can expose its checklist directly.

### Desktop Expanded Layout Composition

- 12-column operational layout.
- Main 7 columns: active state module and timing/debrief chart.
- Right 3 columns: fixed source rail with gates, endpoints, points mode, weather probes, replay archive.
- Left or top compact nav: Home, Weekend, Live, Debrief, Career, Sources.
- Source drawer can become a docked inspector on desktop. It should not obscure the timing tower during live mode.

### Chart And Component Treatment

| Component | Treatment |
| --- | --- |
| `TimingTowerFocus` | Table-first. Rows are compact, stable-height, and source-aware. Bryce row gets a left rail and lock icon treatment when identity guard passes by `driver_id` or `exact_name`. Wrong-series car `9` appears only in diagnostics with `seriesOk=false`; never as Bryce. |
| `LapPositionStory` | Evidence panel. Chart appears only when source state supports it. Partial lap charts show a visible validation strip, sample coverage, and unavailable spans. Debrief labels stay factual unless manually reviewed. |
| `TrackHistoryComparison` | Fact ledger with two rows and visible denominators. It reads like an audited source table: Road America `2 races`, avg finish `8.5`, gain `0`, top-10 `100%`; road courses avg finish `12.6`, gain `-2.45`, top-10 `40%`. |
| `LivePointsCard` | Contract-state panel. Top line is `points.mode`; fields render only if source-present. Ready state shows `race_control_live`, running `25`, total driver `143`, total entrant `160`, coverage `25/25/25`, reconciliation required. Partial state shows `partial`, running `12`, coverage `8/25`, totals unavailable. |
| `RuntimeWeatherStrip` | Probe-aware weather module. Top line: `NWS API`, sourceState, checkedAt. Values: `72 F`, `clear`, wind `9 mph`, gust `16 mph`. Partial state shows failed probe list in the rail and suppresses missing gust instead of showing zero. |
| `SourcePill` / `SourceDrawer` | Source pill can use exact terms because this direction is source-literate: `ready`, `degraded`, `wrong_series`, `stale`, `blocked`, `live_only`, `replay_only`. Drawer is an inspector with gates, endpoints, source refs, caveats, field coverage, and missing backend contracts. |

### Source/Confidence State Treatment

- State is the primary visual grammar. Every module has a narrow state rail and a source label.
- Pass/warn/fail gates use consistent symbols and text labels; color is secondary to wording.
- Blocked and wrong-series states are treated as successful protection, not errors to disguise.
- The drawer surfaces the exact reason a value is unavailable: source missing, source stale, wrong series, no guarded Bryce row, no official reconciliation path, replay archive not ready, or weather probe partial.

### Best For And Sacrifices

Best for live-mode credibility, operator confidence, and preventing accidental overclaims. This direction is strongest if the main risk is public trust during messy Race Control/source states.

Sacrifices warmth and shareability. Family/friends may find it more technical, and the product can feel more like an operations tool unless the first-answer copy is carefully softened.

## Decision Frame For Jack

Choose by the primary product posture, not by color preference:

| If Jack wants... | Strongest direction |
| --- | --- |
| A race-day companion friends can open without explanation | Trackside Brief |
| A serious analytics product that makes debrief and career context feel premium | Racecraft Atlas |
| Maximum trust, guarded live behavior, and source-state clarity | Readiness Console |

Open taste decisions that each direction handles differently:

- Homepage aggressiveness: Trackside Brief is most family-readable; Racecraft Atlas promotes analytics earlier; Readiness Console promotes gates earlier.
- Source-pill tone: Trackside Brief translates terms; Racecraft Atlas mixes readable and machine terms; Readiness Console keeps exact state language.
- Debrief archetype copy: Trackside Brief keeps v1 factual; Racecraft Atlas can introduce reviewed labels later; Readiness Console keeps labels internal until approved.
- Desktop priority: Trackside Brief is a density expansion; Racecraft Atlas is an analytical workspace; Readiness Console is an inspector-led live surface.

## Next Design Step After Selection

After Jack selects a direction, the next lane should create a visual target before frontend implementation:

1. Mobile home for Race Week Prep.
2. Mobile home for Live Ready.
3. Mobile home for Wrong-Series or Blocked.
4. Desktop expanded live layout.
5. Source drawer state.

Those mocks should use the source-backed values listed above and must preserve the blueprint's source/confidence rules.
