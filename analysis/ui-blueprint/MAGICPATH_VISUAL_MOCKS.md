# BryceCast MagicPath Visual Mocks

Generated: 2026-06-17

Status: legacy/rejected after the June 18 context-pack analytics baseline. Preserve this file for links and design-history context only. Do not use it as the current frontend starting point; start from `analysis/ui-blueprint/README.md`, `analysis/ui-blueprint/UI_BLUEPRINT.md`, `analysis/ui-blueprint/COMPONENT_FIELD_MATRIX.md`, and `analysis/ui-data-package/ui-data-package.json`.

Project: [BryceCast UI Directions](https://www.magicpath.ai/files/418122821135405056)

These MagicPath mocks translate the committed UI blueprint into reviewable visual targets only. They do not implement the production React frontend, alter ingestion, edit backend contracts, or change generated data.

## Components

| Mock | MagicPath link | Component ID | What it tests |
| --- | --- | --- | --- |
| BryceCast Mobile Race Week Prep | [smart-storm-6637](https://api.magicpath.ai/v1/smart-storm-6637) | `418123725905481728` | Trackside Brief mobile hierarchy for race-week prep: Road America event facts, same-track and road-course context, runtime-only weather caveat, compact source drawer entry. |
| BryceCast Mobile Live Ready | [clever-air-1224](https://api.magicpath.ai/v1/clever-air-1224) | `418123746440794112` | Main mobile live state: Bryce `P1`, car `9`, `GREEN`, lap `12/20`, guarded identity, Race Control running points, NWS weather strip, and replay sufficiency. |
| BryceCast Mobile Wrong-Series Guard | [steady-autumn-1464](https://api.magicpath.ai/v1/steady-autumn-1464) | `418123763524206592` | Red guarded fallback when `/api/readiness.state=wrong_series`: no Bryce live values, visible failed gates, safe historical/prep fallback, and explicit same-car-number identity protection. |
| BryceCast Desktop Expanded Live | [serene-shadow-5906](https://api.magicpath.ai/v1/serene-shadow-5906) | `418123780368519168` | Desktop expansion of the mobile live hierarchy: main timing/Bryce band, points/weather module, source rail, Road America context, and Racecraft Atlas debrief chart language. |
| BryceCast Source Drawer State Inspector | [friendly-cave-6852](https://api.magicpath.ai/v1/friendly-cave-6852) | `418123806998167552` | Readiness Console drawer model for `ready`, `degraded`, `wrong_series`, and `blocked`: gates, source refs, metric IDs, Source Ops validation, and missing backend contracts. |

## Direction Choices Used

- **Trackside Brief as the default mobile shell.** The mobile mocks lead with the answer Jack/family/friends need first: race week context, live Bryce state, or a clear guardrail. Source detail stays one tap away except in guarded states.
- **Racecraft Atlas for analytics language.** Track history, points, and debrief modules use restrained chart/ledger patterns with denominators and source labels. The desktop mock uses WWTR and Monterey debrief seeds without promoting review-only archetype language as public copy.
- **Readiness Console for trust states.** Wrong-series, degraded, blocked, gates, endpoint states, and missing contracts are treated as product states, not generic errors. State color is used for meaning only: green ready, amber partial/degraded, red blocked/wrong-series.
- **No unsupported racing fantasy.** The mocks avoid neon, war-room/cockpit styling, fake maps or moving dots, POV/radio, official weather claims, local points math, and engineering-root-cause claims.
- **No fake timing field.** The committed docs provide a guarded Bryce row and field coverage, but not production competitor rows for the live fixture. The mocks show Bryce plus field coverage instead of inventing driver names.

## Source-Backed Values Used

- Road America prep: `Grand Prix at Road America Race 1`, `2026-06-19`, Road America, road course, `4.048 mi`, `14 corners`.
- Track history: Road America `2 races`, average finish `8.5`, average gain `0`, top-10 `100%`; road courses average finish `12.6`, average gain `-2.45`, top-10 `40%`.
- Ready live fixture: Bryce `P1`, car `9`, `GREEN`, lap `12/20`, status `Running`, `matchedBy=driver_id`, `seriesOk=true`.
- Points: `race_control_live`, running driver points `25`, total driver points `143`, total entrant points `160`, historical baseline `131`, historical rank `14`, reconciliation required.
- Degraded fixture: points mode `partial`, running points `12`, coverage `8/25`, total driver/entrant points unavailable, weather `partial`.
- Weather: `NWS API`, `72 F`, clear, wind `9 mph`, gust `16 mph`, direction `220`.
- Debrief seeds: WWTR `P12` to `P23`, gain `-11`, points `7`, cumulative points `131`, rank `14`, confidence `medium`; Monterey `P5` to `P3`, finish percentile `90`, points `35`.
- Source Ops: validation `ok=true`, `errorCount=0`, `warningCount=1`, open gaps `9`, priority gaps `0`.

## Limitations And Follow-Up Decisions

- MagicPath preview thumbnails are standardized images and may crop the 1440px desktop component; open the project canvas or component link for full-width review.
- The source drawer mock is interactive in MagicPath code, but this is still a visual target. Production state wiring belongs in the frontend implementation lane later.
- The live timing tower needs real runtime `/api/timing` rows before showing named nearby competitors.
- Jack should decide whether first-screen source pills should stay family-readable (`source backed`, `Race Control mismatch`) or move closer to machine terms (`available/high`, `wrong_series`) in the final app.
- Jack should decide how much Racecraft Atlas density belongs on the mobile home versus one tap down.
- Post-session reconciled UI remains blocked until the backend provides an official reconciliation report path.
- Countdown polish remains blocked until schedule and track-activity timestamps have timezone-normalized semantics.
