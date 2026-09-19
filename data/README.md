# Data

This publication edition includes compact reports, catalogs, manifests, and schema definitions. It does not include the licensed normalized career dataset, raw timing recordings, or operational database. See the [root guide](../README.md) and [documentation index](../docs/README.md) before treating any file as current or independently reproducible.

## Included

- [`career/reports/`](career/reports/) contains dated ingestion, coverage, validation, weather, session-window, and research outputs. [`career/sources.manifest.json`](career/sources.manifest.json) records source metadata. These are derived evidence; the normalized row-level dataset they summarize is withheld.
- [`historical-data-lake/catalog/`](historical-data-lake/catalog/) contains timing-coverage ledgers, session and track-map catalogs, source-quality summaries, and validation results. [`historical-data-lake/manifests/`](historical-data-lake/manifests/) contains the retained source-file manifest. These inventories do not include the underlying recordings.
- [`schema/archive-v2.sql`](schema/archive-v2.sql) is the public content-addressed archive schema. Run `npm run data:schema` to print the schema without opening a database; `npm run example:sqlite` exercises it with temporary synthetic fixtures.

## Withheld

The following are intentionally absent pending source-family permission and release review:

- `career/career.dataset.json` and the raw career archive;
- RaceTools and Timing71 recordings, official API payloads, mirrored documents, and weather observation downloads;
- the full timing lake and operational `brycecast.sqlite`, including WAL/SHM and runtime state.

A missing file is therefore not a broken checkout. The offline build consumes versioned derived artifacts elsewhere in the repository. Do not copy private data into this tree to make a historical command pass. Full-corpus regeneration is an opt-in maintainer workflow with an approved immutable snapshot, provenance receipt, and rights record; public validation should use `npm run test:publication`.
