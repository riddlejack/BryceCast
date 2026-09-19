# BryceCast Product Definition Packet

This directory is the analytics-first product definition handoff for BryceCast UI/design work. It does not implement frontend visuals and does not change ingestion data.

Status after June 18: this packet remains useful background, but the active UI baseline has moved to the source-hash checked context-pack layer. Fresh UI agents should read `analysis/ui-blueprint/README.md`, `analysis/ui-data-package/ui-data-package.json`, and `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json` before relying on older worker notes in this directory.

## Contents

- `PRODUCT_DEFINITION_PACKET.md`: the final source-backed product packet for screen states, metric menu, stakeholder jobs, visualization inventory, claim ladder, release cut, and unresolved product decisions.
- `worker-notes/`: read-only evidence notes split by source lane.

## Source Precedence

Use this precedence when a future UI/design agent sees conflicting facts:

1. `analysis/ui-data-package/ui-data-package.json`
2. `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json` and the referenced context packs
3. Generated career reports: `data/career/reports/validation-report.json`, `data/career/reports/ingestion-summary.json`, `data/career/reports/career-coverage-matrix.json`
4. `analysis/ui-ready-artifacts.json`
5. Generated machine-readable contracts: `analysis/ui-contract/ui-metric-manifest.json`, `analysis/live-contract/live-api-contract.json`
6. Reader-facing docs: `docs/contracts/UI_ANALYTICS_PRODUCT_CONTRACT.md`, `docs/contracts/LIVE_RACE_DAY_PRODUCT_CONTRACT.md`, `analysis/ANALYTICS_UI_ARTIFACT_INDEX.md`
7. Frontend TypeScript contracts under `src/data/`
8. Prose summaries, worker notes, and chat context

Generated artifacts and package fields win over prose docs. If a prose doc names a capability that the package/manifest does not formalize, record the mismatch and use the package/manifest state.

## Future UI Agent Rules

- Build product behavior from the metric IDs and states in the packet before choosing visual style.
- Keep live Race Control data separate from historical career artifacts unless a documented join key exists.
- Use `/api/readiness` as the live product gate. Do not infer live readiness from HTTP 200 or raw timing rows.
- Do not show unsupported weather, team, points, live GPS, POV, radio, pit-sequence, tire, or engineering-cause claims.
- Put source detail in compact pills/drawers so the family-readable layer stays clean without hiding caveats.
- Treat Road America static prep as historical/schedule context only. Static prep is not a forecast, strategy predictor, or live timing source.

## Validation Commands

The packet was built from read-only inspection. Useful non-ingestion validation commands for future packet refreshes:

```bash
npm run analytics:ui-data-package:validate
npm run analytics:view-models:validate
npm run test:live-readiness
git diff --check
```

Do not run ingestion refresh commands for a UI/product packet unless Jack explicitly asks.
