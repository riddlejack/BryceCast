# BryceCast Data Utilization Audit

This lane audits whether the canonical BryceCast dataset is fully used by the
analytics/product layer. It writes only under
`analysis/data-utilization-audit/output` and does not mutate ingestion-owned
files.

## Commands

Use the bundled workspace Python for consistency with the other analysis lanes:

```bash
/Users/example/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 analysis/data-utilization-audit/scripts/build_data_utilization_audit.py
/Users/example/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 analysis/data-utilization-audit/scripts/validate_data_utilization_audit.py
```

## Outputs

- `output/dataset_collection_inventory.csv`: one row per canonical dataset
  collection with row counts and utilization status.
- `output/series_grain_inventory.csv`: series/season/session-type collection
  counts with current artifact usage.
- `output/analytics_utilization_matrix.csv`: canonical utilization matrix across
  collections and high-value grains.
- `output/underused_data_opportunity_backlog.csv`: required follow-up analysis
  lanes for any data that remains partially analyzed.
- `output/DATA_UTILIZATION_AUDIT.md`: reader-facing audit summary.

The validator fails if any canonical collection is unclassified, any partial row
has no backlog entry, or the required high-value opportunity lanes are missing.
