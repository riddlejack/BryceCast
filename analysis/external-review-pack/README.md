# BryceCast External Review Pack

Generated: 2026-06-19T21:18:40.734Z

Purpose: give an outside model a clean, source-backed view of what BryceCast is, what data exists, what analytics have already been run, what live capabilities are proven or still gated, and what UI/product questions remain open.

Use this in two passes:

1. Start with `PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_A.md` and the Envelope A files. This is the clean-room data and analytics review. It intentionally avoids current UI screenshots and current component taste so the reviewer is not anchored by the first UI pass.
2. After Envelope A returns recommendations, use `PROMPT_FOR_GPT_5_5_PRO_ENVELOPE_B.md` and the current-UI files for a critique against the independent recommendations.

Core files:

- `PROJECT_BRIEF.md`: project goal, audiences, guardrails, and source hierarchy.
- `DATA_CAPABILITY_CATALOG.md`: category and granularity inventory by career chapter/series.
- `ANALYTICS_INVENTORY.md`: generated analysis lanes, counts, context packs, and product uses.
- `LIVE_CAPABILITY_MATRIX.md`: what live mode can show now versus what remains fixture-backed, unproven, or unavailable.
- `VISUALIZATION_OPPORTUNITY_MATRIX.md`: candidate screen questions and visualization forms.
- `CURRENT_UI_REVIEW_CONTEXT.md`: only for Envelope B after the clean-room pass.
- `sample-payloads/`: bounded JSON excerpts for Road America prep, debrief, Career Lab, live fixtures, and source/capability summaries.
- `SOURCE_MANIFEST.json` and `SOURCE_MANIFEST.md`: exact source files and hashes used by the pack.
- `PACK_VALIDATION_REPORT.json`: automated completeness checks.
- `DEVSPACE_AUDIT.md`: preinstall/runtime audit of `@waishnav/devspace@1.0.1` and the recommended containment stance.
- `DEVSPACE_SETUP.md`: exact copied-pack sandbox setup recipe for a DevSpace run.

Validation status: ok. Checks: 12.
