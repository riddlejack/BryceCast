# BryceCast UI Analytics Insight Inventory

This inventory turns the INDY NXT discovery pass into product-ready analysis modules. These are chart contracts for the design phase, not final visual designs.

## Product Principle

Build around race intelligence, not generic stats. Each module should answer a real debrief question, expose its denominator, and carry source/confidence state without visually overwhelming the user.

## Priority Modules

| Module | Primary question | Stakeholders | Best visual family | Required fields | Caveats |
| --- | --- | --- | --- | --- | --- |
| Race Debrief Header | What happened in this race? | Bryce, family, team | KPI strip + concise narrative | start, finish, gain, status, points, track, weather, caveats | Keep modeled weather visually secondary |
| Qualifying Conversion | Did qualifying translate into result? | Bryce, team, family | slope/dumbbell from qualifying/start to finish | qualifyingPosition, startPosition, finishPosition, status | Use combined field-wide qualifying where possible |
| Lap Position Story | Where did the race turn? | Bryce, team, serious fans | inverted y-axis lap-position line with caution markers | lapNumber, position, flagState, lap chart caveat | Partial charts need explicit badge |
| Race Shape Classifier | What kind of race was it? | all | filter chips + compact cards | primaryStory, storyDrivers, volatility, gain, status | First-pass labels need race-by-race review |
| Section Strengths | Where was he fast? | Bryce, team | ranked bars or track-segment heatmap | sectionName, rankPercentile, fieldRows, lapNumber, speed/time | Suppress low-denominator odd rows in headline UI |
| Teammate Context | How did he compare locally? | Bryce, Ganassi/team | ranked dot plot/table | bestTeammateFinish, deltaToBestTeammateFinish, teammateFinishRank | Denominator and teammate count required |
| Repeated Rival Context | Who is a meaningful comparison cohort? | team, serious fans | head-to-head bars with n labels | racesTogether, headToHeadWinRate, avgFinishDeltaVsRival | Avoid field-strength claims until benchmark model exists |
| Weather Context | What conditions framed the race? | Bryce, family, team | weather strip + condition badges | temp, wind, wetDry, thermalStress, windRisk, confidence | Non-official modeled only; no causal claims |
| Source Confidence Drawer | Why should I trust this? | all | drawer/table | provenanceRefs, confidence, caveatIds, source type | Every stat needs source state |
| Career Parity Matrix | Which analyses can extend beyond INDY NXT? | product owner, team | matrix heatmap | series, metric family, status, caveats | Prevent weak series from poisoning strong INDY NXT data |

## First Vertical Slice

Build one complete Race Debrief for an INDY NXT race with all states wired: outcome, qualifying conversion, lap-position story, section strengths, teammate context, modeled weather, and source drawer. Once one race works, generalize across the 36 analyzable races.

Recommended first slice candidates:

1. 2024 Grand Prix of Portland: clean podium conversion and low-volatility execution.
2. 2026 Indianapolis Grand Prix Race 1: high-volatility race shape and poor late movement.
3. 2025 Grand Prix of Portland: strong qualifying position but contact-limited result.
4. 2026 Detroit Grand Prix: recovery result plus strong same-team context.

## Career Extension Strategy

After INDY NXT, extend by metric family rather than by series. First migrate analyses that have honest parity: result basics, start/finish deltas, qualifying conversion where field-wide qualifying exists, and weather/context where exact windows exist. Then add lap-shape and section-strength only for series/source families that expose comparable lap or section data.

## Design Notes For The Polished UI Pass

- Visual tone should be clean motorsport intelligence: restrained palette, high typographic quality, generous spacing, precise labels, no neon panels.
- Avoid charts that look impressive but answer no debrief question.
- Favor annotated race stories over dense standalone dashboards.
- Put caveats close to the metric, but make them elegant: small confidence pills, hover/source drawers, and section-level availability labels.
- Treat weather as a context strip, not a hero chart.
- Use tables only for exact audit or lookup; the default evidence should be charts/cards with narrative interpretation.
