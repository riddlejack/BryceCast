# BryceCast historical data lake

This directory is the repository-managed access point for historical INDYCAR and INDY NXT timing data.

The acquisition verdict, exact coverage, exceptions, field semantics, and ML
readiness are in
[`analysis/historical-data-lake/TECHNICAL_REPORT.md`](../../analysis/historical-data-lake/TECHNICAL_REPORT.md).

- `raw/` is Git-ignored and contains immutable source objects plus human-readable hardlinked views.
- `manifests/` contains committed source URLs, hashes, sizes, provenance, and local object/view paths.
- `catalog/` contains committed session and coverage indexes generated from the raw sources.
- generated SQLite/Parquet analytical stores stay Git-ignored and can be rebuilt from the manifests and raw objects.

The archive is content-addressed by SHA-256. A source payload is stored once even if it is listed or downloaded more than once. The hardlinked `raw/views/` tree does not consume a second copy of the bytes.

Quality catalogs are intentionally compact: they retain source identity,
validation status, cadence/count metrics, and coverage fields, but not repeated
rosters, schemas, or representative raw records. Those details remain losslessly
available in the source objects and are decoded on demand.

The durable primary checkout also exposes the same raw object inodes at
`/Users/example/Documents/Bryce POV access/data/historical-data-lake/raw`.
That is a second hardlink, not a second 7.51 GB payload copy.

No file in this data lake is automatically an official BryceCast fact. RaceTools files are third-party captures of the official pit-lane timing feed; Timing71 files are normalized display-state replays. Canonical consumers must preserve source, grain, identity, and derivation metadata.

## Commands

```bash
node analysis/historical-data-lake/archive-sync.mjs plan
node analysis/historical-data-lake/archive-sync.mjs acquire --concurrency 2
node analysis/historical-data-lake/archive-sync.mjs status
node analysis/historical-data-lake/archive-sync.mjs normalize
node analysis/historical-data-lake/build-catalog.mjs validate --deep --concurrency 2
node analysis/historical-data-lake/build-catalog.mjs build
node analysis/historical-data-lake/analyze-racetools-sessions.mjs --scope bryce --concurrency 2
node analysis/historical-data-lake/analyze-racetools-sessions.mjs --scope all --concurrency 2
node analysis/historical-data-lake/analyze-timing71-sessions.mjs --series INDY_NXT --concurrency 2
node analysis/historical-data-lake/analyze-track-maps.mjs
node analysis/historical-data-lake/build-coverage.mjs --through-date 2026-07-18
node analysis/historical-data-lake/session-tool.mjs list --year 2025 --series INDY_NXT
node analysis/historical-data-lake/session-tool.mjs info SESSION_ID
node analysis/historical-data-lake/session-tool.mjs extract SESSION_ID --output /tmp/session.zip
node analysis/historical-data-lake/session-tool.mjs export TIMING71_SESSION_ID --output /tmp/session.ndjson --interval 1
node analysis/historical-data-lake/session-tool.mjs sections RACETOOLS_SESSION_ID --output /tmp/sections.ndjson --car 27
```

The acquisition command is resumable. It reuses matching files already present in `~/Downloads`, then downloads only missing source payloads.

`session-tool.mjs export` reconstructs Timing71's incremental replay changes at
observed archive timestamps. It does not interpolate missing timestamps. Exported
rows are intentionally generated on demand rather than committed as a giant,
duplicative per-car/per-second table.

Timing71 recordings can include stale states from an adjacent INDYCAR session.
For catalog rows classified as INDY NXT, `session-tool.mjs export` therefore
defaults to the contiguous roster state containing Bryce Aron. Pass
`--segment all` only when intentionally auditing the entire untrimmed capture.
