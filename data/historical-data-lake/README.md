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

The durable primary archive is `~/.brycecast/data-lake`. A checkout may expose
the same objects through hardlinks, but consumers do not depend on a worktree or
iCloud-managed Documents path.

No file in this data lake is automatically an official BryceCast fact. RaceTools files are third-party captures of the official pit-lane timing feed; Timing71 files are normalized display-state replays. Canonical consumers must preserve source, grain, identity, and derivation metadata.

## Consumer guards

These are hard rules for anything reading the lake. They exist because the raw
sources lie in specific, verified ways.

- **Track maps: join by INI `Track.Name` + package SHA-256, never by archive
  filename.** RaceTools filenames are unreliable — standalone `Mid-Ohio.zip`
  contains Streets of Toronto, `Arlington.zip` contains Phoenix Raceway,
  `IndyCarMaps.zip/Portland_2018.zip` contains Gateway. The confirmed cases are
  annotated in `catalog/track-map-definitions.json` (`filenameMismatches`, and a
  `filenameMismatch` field on each map row).
- **Track maps: `[GPS]` origins are untrusted for geographic projection.** The
  trusted spatial frame is the local polyline + `LapDistance` distance-along-track.
  At least one package has correct local geometry but a wrong-venue `[GPS]` origin
  (Toronto coordinates on a non-Toronto map). See `gpsOriginGuard` and the per-origin
  `trust` field.
- **Track maps: check `venueSectionStatus.sectionAnchorable` before a per-section
  join.** Several venues (Nashville Superspeedway, Milwaukee Mile, St. Petersburg,
  Arlington, Miami, Thermal) have no anchorable section map; Mid-Ohio has only 2.
- **Coverage: the completeness claim is reconciled against the official session
  list**, not just the source indexes. See `catalog/coverage-reconciliation.json`;
  the one documented gap is 2025 Iowa Qualifications (evidence consistent with a
  cancelled session).
- **Provenance: prefer `provenanceGrade: "verified_fetch"`.** The 70
  `reused_download_basename_only` objects (all Timing71) were matched on basename
  alone and are listed in `catalog/provenance-grades.json` for hash re-verification
  at the next sync.
- **Heartbeat gaps:** `heartbeatGapMax` is computed after dropping implausible feed
  epochs. Genuine in-session gaps are surfaced in the RaceTools quality catalog
  `issues` array (`category: "heartbeat_gap"`), some with benign annotations.

## Commands

```bash
node analysis/historical-data-lake/archive-sync.mjs plan
node analysis/historical-data-lake/archive-sync.mjs acquire --concurrency 2
node analysis/historical-data-lake/archive-sync.mjs status
node analysis/historical-data-lake/archive-sync.mjs grade
node analysis/historical-data-lake/archive-sync.mjs normalize
node analysis/historical-data-lake/build-catalog.mjs validate --deep --concurrency 2
node analysis/historical-data-lake/build-catalog.mjs build
node analysis/historical-data-lake/analyze-racetools-sessions.mjs --scope bryce --concurrency 2
node analysis/historical-data-lake/analyze-racetools-sessions.mjs --scope all --concurrency 2
node analysis/historical-data-lake/analyze-timing71-sessions.mjs --series INDY_NXT --concurrency 2
node analysis/historical-data-lake/analyze-track-maps.mjs
node analysis/historical-data-lake/reconcile-coverage.mjs --through-date 2026-07-18
node analysis/historical-data-lake/build-coverage.mjs --through-date 2026-07-18
node analysis/historical-data-lake/session-tool.mjs list --year 2025 --series INDY_NXT
node analysis/historical-data-lake/session-tool.mjs info SESSION_ID
node analysis/historical-data-lake/session-tool.mjs extract SESSION_ID --output /tmp/session.zip
node analysis/historical-data-lake/session-tool.mjs export TIMING71_SESSION_ID --output /tmp/session.ndjson --interval 1
node analysis/historical-data-lake/session-tool.mjs sections RACETOOLS_SESSION_ID --output /tmp/sections.ndjson --car 27
npm run analytics:timing-coverage
npm run analytics:timing-coverage:validate
```

The acquisition command is resumable. It reuses matching files already present in `~/Downloads`, then downloads only missing source payloads.

`session-tool.mjs export` reconstructs Timing71's incremental replay changes at
observed archive timestamps. It does not interpolate missing timestamps. Exported
rows are intentionally generated on demand rather than committed as a giant,
duplicative per-car/per-second table.

`catalog/timing-coverage-ledger.json` is the UI-facing coverage contract for
every canonical Bryce INDY NXT race and its qualifying link. `observed` means
the source contains actual observations; it does not claim an unbroken 1 Hz
recording. Cadence, gaps, active-window coverage, clock basis, native artifact,
and bounded replay interpolation are separate fields. RaceTools timestamps use
the session-local feed clock even though their ISO container is labelled `Z`.

Timing71 recordings can include stale states from an adjacent INDYCAR session.
For catalog rows classified as INDY NXT, `session-tool.mjs export` therefore
defaults to the contiguous roster state containing Bryce Aron. Pass
`--segment all` only when intentionally auditing the entire untrimmed capture.
