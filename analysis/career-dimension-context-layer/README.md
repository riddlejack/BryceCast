# Career Dimension Context Layer

Source-bounded qualifying, team, track, driver, and car context layer for BryceCast.

This lane turns the remaining canonical dimension collections into generated artifacts and context packs without editing ingestion-owned files. It productizes qualifying conversion joins, team eras, track/venue archetypes, driver cohorts, and car/entrant context while preserving source-shape caveats.

Run:

```bash
python3 analysis/career-dimension-context-layer/scripts/build_career_dimension_context_layer.py
python3 analysis/career-dimension-context-layer/scripts/validate_career_dimension_context_layer.py
```
