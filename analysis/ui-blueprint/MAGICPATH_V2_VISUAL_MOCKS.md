# BryceCast MagicPath V2 Visual Mocks

Generated: 2026-06-17

Project: [BryceCast UI Directions](https://www.magicpath.ai/files/418122821135405056)

V2 treats the first MagicPath pass as rejected. The new mocks are consumer-facing visual targets: source honesty remains present, but the primary screen language is race-week context, live race position, and debrief analytics.

## V2 Components

| Mock | MagicPath link | Component ID | What it tests |
| --- | --- | --- | --- |
| BryceCast V2 Mobile Race Week Prep | [sturdy-autumn-9050](https://api.magicpath.ai/v1/sturdy-autumn-9050) | `418131157692063744` | A race-week home where the Road America track-history comparison is the hero. Event facts, top-10 bars, average-finish comparison, gain baseline, and weather context are visible without backend labels. |
| BryceCast V2 Mobile Live Companion | [soft-evening-7772](https://api.magicpath.ai/v1/soft-evening-7772) | `418131181964509184` | A consumer live screen for Bryce leading at Road America: large live position, lap progress ring, compact timing tower, points movement ledger, and weather strip. Trust detail is a quiet drawer. |
| BryceCast V2 Race Debrief Analytics Story | [sweetly-meadow-6940](https://api.magicpath.ai/v1/sweetly-meadow-6940) | `418131204857012224` | An analytics-story debrief using start-finish slope, lap-position range, outcome ledger, top-mover bar, and Road America carryover context. Includes an interactive switch between latest WWTR debrief and Monterey best-finish example. |

## What Changed From V1

- V1 exposed too much backend/source plumbing: gate summaries, raw readiness labels, API names, generated timestamps, identity guard fields, and source-row mechanics appeared too prominently.
- V2 makes the normal screen consumer-first. Trust appears as small pills such as `trusted`, `live trusted`, `source backed`, `context`, and `provisional`; deeper source explanation lives in drawers or review copy.
- V1 covered broad state inventory. V2 narrows to three polished artifacts that communicate the product: prep, live companion, and debrief analytics.
- V1 used source state as the main visual system. V2 uses visual analysis as the main system: top-10 bars, zero-centered gain context, lap progress, timing ladder, points movement, start-finish slope, lap-position line, and top-mover bars.
- V1 looked closer to an operator/status surface. V2 is closer to a serious motorsport analytics companion: warmer race-program structure, stronger data storytelling, and restrained but visible race context.

## Source-Backed Values Used

- Road America prep: `Grand Prix at Road America Race 1`, `2026-06-19`, Road America, road course, `4.048 mi`, `14 corners`.
- Track history: Road America `2 races`, average finish `8.5`, average gain `0`, top-10 `100%`; road courses average finish `12.6`, average gain `-2.45`, top-10 `40%`.
- Live companion: Bryce `P1`, car `9`, `GREEN`, lap `12/20`, status `Running`, running points `25`, live driver total `143`, entrant total `160`, historical baseline `131`, historical rank `14`.
- Weather context: clear, `72 F`, wind `9 mph`, gust `16 mph`. The visible UI does not label this as official INDY NXT weather.
- Latest debrief: `2026 INDY NXT by Firestone at World Wide Technology Raceway`, start `P12`, finish `P23`, gain `-11`, points `7`, cumulative points `131`, standing rank `14`, finish percentile `8.3`, best/worst running positions `P21/P22`, top mover Myles Rowe `+18`.
- Best-finish comparison: `2024 Grand Prix of Monterey Race 2 R2`, start `P5`, finish `P3`, gain `+2`, finish percentile `90`, points `35`.

## Design Rationale

- **Race Week Prep:** The main product question is not "is the source valid?" but "what does this weekend look like?" The mock leads with Road America history and keeps source confidence as a tap target.
- **Live Companion:** The first screen communicates the race in one glance: Bryce is P1, the race is green, lap progress is 12/20, and points movement is provisional. It avoids raw `matchedBy`, `seriesOk`, row counts, and API language.
- **Race Debrief / Analytics Story:** The debrief should feel like an analysis article, not a results table. The slope and lap-position visuals separate the finish result from the lap-chart story and avoid unreviewed archetype copy.

## Guardrails Preserved

- No neon, war-room, cockpit, fake map, moving dot, POV/radio, official weather, local points math, or engineering-root-cause claims.
- No fake driver names were added. The live tower shows Bryce plus car/rank rows from the fixture shape without pretending competitor identities are production facts.
- Points remain visibly provisional where appropriate.
- Weather is presented as race-day context, not official series weather or track temperature.
- Debrief labels stay factual; archetype language remains out of public copy until reviewed.

## Follow-Up Decisions For Jack

- Decide whether the V2 warm race-program palette is the right base, or whether it should shift slightly more editorial/technical for serious fans.
- Decide how much of the Race Debrief analytics-story treatment should be promoted into mobile post-session home versus living on a dedicated debrief route.
- Decide whether timing tower competitor rows should stay car/rank only until runtime driver identities are fully source-backed.
- Decide final copy for trust pills: V2 uses consumer language, while drawers can preserve exact machine/source details later.
