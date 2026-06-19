# BryceCast UI Blueprint Map

Generated: 2026-06-18

This directory is the active UI architecture handoff after the June 18 analytics productization sprint. It does not implement frontend visuals and does not change ingestion-owned files.

## Active Starting Point

Read in this order for UI V2 work:

1. `docs/CODEX_HANDOFF_CURRENT.md`
2. `analysis/ui-data-package/README.md`
3. `analysis/ui-data-package/ui-data-package.json`
4. `analysis/predictive-race-intelligence/output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md`
5. `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`
6. `docs/UI_ANALYTICS_PRODUCT_CONTRACT.md`
7. `docs/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`
8. `analysis/ui-blueprint/UI_BLUEPRINT.md`
9. `analysis/ui-blueprint/COMPONENT_FIELD_MATRIX.md`
10. `analysis/ui-blueprint/STATE_FIXTURE_QA.md`
11. `analysis/ui-blueprint/DECISIONS_FOR_JACK.md`
12. `analysis/ui-blueprint/VISUAL_DIRECTION_OPTIONS.md`

## Current Baseline

- UI package generated: `2026-06-18T17:52:13.930Z`
- UI package `asOfDate`: `2026-06-18`
- Source hash: `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`
- Baseline commit recorded by package: `ce904af`
- Predictive context packs: 9 upcoming-event, 36 race-debrief, 1 Career Lab, 1 live race-day
- Live race-day proof state: fixture-backed and API-plumbed, but active INDY NXT green/yellow proof is still blocked

## Active Blueprint Files

| File | Status | Use |
| --- | --- | --- |
| `UI_BLUEPRINT.md` | Active V2 architecture | Route map, homepage state router, screen hierarchy, component inventory, context-pack-first rules. |
| `COMPONENT_FIELD_MATRIX.md` | Active V2 field contract | Exact package/context-pack/runtime fields for each component. |
| `STATE_FIXTURE_QA.md` | Active live-state QA map | Required static live fixtures and product-state behavior. |
| `DECISIONS_FOR_JACK.md` | Active decision list | Product/taste decisions still open after the June 18 analytics pass. |
| `VISUAL_DIRECTION_OPTIONS.md` | Active visual strategy input | Direction options updated to the context-pack data baseline. Not final UI styling. |

## Legacy Or Superseded Files

| File | Status | Why Preserved |
| --- | --- | --- |
| `MAGICPATH_VISUAL_MOCKS.md` | Legacy/rejected June 17 visual attempt | Preserves links and lessons from the first MagicPath pass; do not use as current UI direction. |
| `MAGICPATH_V2_VISUAL_MOCKS.md` | Legacy/rejected June 17 visual attempt | Preserves links and lessons from the second MagicPath pass; it still predates the June 18 context-pack baseline. |

## UI Implementation Rules

- Build a typed adapter around `analysis/ui-data-package/ui-data-package.json` and referenced context-pack JSON. Do not parse raw CSVs directly inside React components.
- Use runtime `/api/readiness`, `/api/timing`, `/api/bryce`, `/api/weather/*`, `/api/replay/bryce`, `/api/sources`, and `/api/history/bryce?compact=1` for live/current state.
- Static context packs can drive prep, debrief, Career Lab, Source Ops, and QA fixtures. They are not live timing, live weather, or official points reconciliation.
- Predictive surfaces must use prior bands, top-10 path language, analog races, and update hooks. Do not publish point finish predictions or betting-style probabilities.
- Keep unsupported lanes explicit: live POV, team radio audio, live GPS/moving dots, detailed pit sequence, tire/overtake strategy, official INDY NXT weather, and engineering root-cause claims remain unavailable or deferred until a later source contract proves them.
