# Data

This folder holds the manifests, reports, catalogs and schema that are tracked in Git. The row-level source data — the canonical career dataset and the raw career archive — arrives with `npm run data:restore`, which unpacks the [data release](../DATA_RELEASE.md) into `career/raw/` and `career/career.dataset.json.gz`. Sources are credited in [DATA_SOURCES.md](../DATA_SOURCES.md).

## Tracked here

- [`career/reports/`](career/reports/) contains dated ingestion, coverage, validation, weather, session-window, and research outputs. [`career/sources.manifest.json`](career/sources.manifest.json) records each source file's origin and hash.
- [`historical-data-lake/catalog/`](historical-data-lake/catalog/) contains timing-coverage ledgers, session and track-map catalogs, source-quality summaries, and validation results. [`historical-data-lake/manifests/`](historical-data-lake/manifests/) contains the source-file manifest for the wider research archive.
- [`schema/archive-v2.sql`](schema/archive-v2.sql) is the content-addressed archive schema. Run `npm run data:schema` to print it without opening a database; `npm run example:sqlite` exercises it with temporary synthetic fixtures.

## Not in Git

- `career/raw/` and `career/career.dataset.json.gz` come from the data release.
- The wider research archive (`historical-data-lake/raw/`, about 7 GB) and the production `brycecast.sqlite` are not published. The catalogs above describe them.

A missing file is therefore not a broken checkout: the build and the demo use the tracked derived analysis. Never commit source data or SQLite into this tree to make a command pass.
