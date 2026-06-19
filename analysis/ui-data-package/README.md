# BryceCast UI Data Package

Generated package: `ui-data-package.json`

This folder is the design/build handoff between source-backed analytics artifacts and the future polished UI. It is intentionally not a final visual design.

Current package baseline: generated `2026-06-18T17:52:13.930Z`, `asOfDate=2026-06-18`, source hash `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`.

## Purpose

- Hydrate canonical analytics outputs into screen-ready objects for Road America Prep, Live Companion fixtures, Race Debrief seeds, Career Lab, and Source Ops.
- Link each screen to source-hash checked predictive/context packs where full analytics depth lives: 9 upcoming-event packs, 36 race-debrief packs, 1 Career Lab pack, and 1 live race-day pack.
- Preserve source refs, caveats, confidence, and unavailable/deferred states before component work begins.
- Give design and QA threads stable fixture states and edge-case variants without waiting for a live INDY NXT session.
- Expose `sourceInventory` as the package's file-backed provenance manifest. Screen `sourceRefs` should either match a `sourceInventory` path or explicitly point at a runtime `/api/*` endpoint.
- Include representative `sources.endpoints`, readiness `gates`, and `live-points.v1` payloads in every live fixture so UI state handling can be tested before a live session.
- Cover the six top-level readiness states plus no-Bryce archive ready/missing, replay empty, and repeated-cold replay warning variants.

## Commands

```bash
npm run analytics:ui-data-package
npm run analytics:ui-data-package:validate
npm run analytics:ui-data-package:refresh-validate
```

## Rules

- Do not treat static package values as live timing, live weather, or live points.
- Live timing, weather, and points still come from `/api/readiness`, `/api/weather/*`, and the local API service at runtime.
- Design may change presentation, but component code should not rewrite source/confidence/availability states from this package.
- If a UI metric needs a new field, add it through the package builder and validator rather than parsing raw CSV/JSON inside a React component.
- Treat `contextPackRef.path` values as first-class UI data sources. Frontend code should load those JSON packs through an adapter when it needs the deeper analytics behind a screen summary.
