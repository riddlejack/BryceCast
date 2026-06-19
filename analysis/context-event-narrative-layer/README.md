# Context Event Narrative Layer

Source-bounded non-lap context layer for BryceCast.

This lane normalizes canonical incidents, penalties, racecraft events, weather observations, media assets, source evidence, and remaining derived metric context into generated analysis artifacts and context packs. It is analysis-owned and does not edit ingestion-owned files.

Run:

```bash
python3 analysis/context-event-narrative-layer/scripts/build_context_event_narrative_layer.py
python3 analysis/context-event-narrative-layer/scripts/validate_context_event_narrative_layer.py
```
