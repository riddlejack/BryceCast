# BryceCast data release policy

BryceCast separates code, derived portfolio artifacts, reproducibility samples, and source-data releases. The default source candidate is designed to build and explain the historical application without publishing the full source corpus or an operational database.

Raw archives and a sanitized SQLite release are **permission pending, not permanently excluded**. They may be added later as versioned, source-family-specific assets when written redistribution rights and privacy checks are complete.

## Current candidate

Included:

- application, transformation, validation, and synthetic-test code selected for public review;
- compact dated UI aggregates and context packs required by the React build;
- generated coverage and validation reports;
- compact track outlines and public static assets under review;
- a synthetic timing-loop example;
- an offline demo server that cannot poll upstream sources or open a database.

Withheld from the default clone:

- the canonical career dataset and raw career archive;
- raw RaceTools and Timing71 recordings;
- raw official API responses and mirrored PDFs/media unless separately cleared;
- the private timing lake and observation downloads;
- the operational SQLite database, WAL/SHM files, and runtime status;
- deployment credentials, host configuration, and private operational artifacts.

The website already exists online. The source-code repository remains private during publication review. This policy describes the candidate and future release path; it does not claim that a production process or feed is currently running.

## What the default clone can reproduce

After `npm ci`, the following commands use included files or temporary synthetic fixtures:

| Command | Reproduces | Does not prove |
| --- | --- | --- |
| `npm run build` | TypeScript check, Vite application bundle, and release metadata from included derived artifacts | Regeneration of those artifacts from raw source data |
| `npm run test:publication` | Synthetic timing example, guarded local API behavior, offline demo HTTP behavior, view-model checks, and included context-pack integrity | Live-source availability or production deployment |
| `npm run example:timing` | Timing-loop decoding, pit-lane finish crossing, and a missing-crossing negative control using invented drivers/laps | Historical race coverage or GPS telemetry |
| `npm run test:archive-v2` | Temporary synthetic legacy/V2 SQLite creation, migration, reconstruction, reader compatibility, and inert retention policy | Integrity, size, or contents of the operational database |
| `npm run portfolio:stats` | Headline evidence JSON from included generated reports and their hashes | Full-corpus recomputation or reacquisition |
| `npm run demo` | Historical browser snapshot with unavailable live APIs and visible data-as-of status | A live race, current weather, current schedule, or replay access |

The publication-prep Archive V2 synthetic run reported 11/11 checks passing: 600 fixture snapshots represented, all 600 reconstructed byte-identically, 64 transition rows retained, and V2 embedded payload bytes at 9.61% of the synthetic legacy fixture. Those are fixture-only software tests. They do not describe or validate the operational archive.

Full analytics regeneration still requires permissioned source files, the canonical normalized dataset, acquisition manifests, and the relevant language/runtime dependencies. A published aggregate derived from a withheld input must say so.

## Truthful claims while source rows are withheld

Every headline number should ship with a claim receipt containing:

- exact wording and metric definition;
- grain, filters, numerator, and denominator;
- source family and provenance tier;
- code commit and generator command;
- input snapshot and output hashes;
- `dataAsOf`, generation time, and validation result;
- one reproduction state: `reproduced_from_included_data`, `verified_against_withheld_snapshot`, `reported_by_source`, or `open`;
- withheld reason and permission record when applicable.

Use this wording for a result checked against nonpublic inputs: “Computed by BryceCast from the identified source snapshot; aggregate and validation receipt included; source corpus withheld pending redistribution permission.” Do not call it independently reproducible until the relevant source rows are released.

## Versioned release layout

Code releases and data releases should have independent versions. A data release should be immutable:

```text
brycecast-data-v0.1.0/
  README.md
  RIGHTS.csv
  DATA_DICTIONARY.md
  CLAIMS.jsonl
  PROVENANCE.jsonl
  MANIFEST.sha256
  LICENSES/
  sample/
  derived/
  schema/sqlite-schema.sql
  withheld-sources.json
```

Later source bundles should be separate assets, for example `indycar-official-v0.1.0`, `racetools-v0.1.0`, `timing71-v0.1.0`, and `brycecast-capture-v0.1.0`. Permission for one family never transfers to another. Do not replace a published asset in place; issue a new version and changelog.

`RIGHTS.csv` should record source family, owner, material class, seasons, audience, allowed use, raw/derived scope, redistribution, modification, commercial use, attribution, share-alike, permission date, evidence locator, expiry/revocation terms, and reviewer.

## Future SQLite and raw-data gate

A raw or SQLite asset may be released only after:

1. written permission covers the exact source family, years, fields, audience, and redistribution mode;
2. the export is built fresh from an explicit table/column projection rather than copied from operations;
3. full payload JSON, disallowed rosters/media, radio-frequency fields, source URLs/query material, machine paths, notes, and other operational metadata are reviewed;
4. logical rows and file bytes pass privacy, secret, and source-family scans;
5. the database contains no WAL/SHM or deleted/freelist remnants;
6. schema version, dictionary, row counts, time bounds, source composition, withheld columns, hashes, and permission receipts ship with the asset;
7. representative rows reconstruct claimed analytics and negative controls reject broken joins.

A schema-only release can be prepared from the writer/migration source without opening the operational database. Storage deduplication or `VACUUM` does not resolve data rights.

## Release sequence

1. **Code and offline historical demo:** after code, dependency, history, media, and derived-output rights review.
2. **Small sample:** one source-cleared real race, or an explicitly synthetic method demonstration with expected output and negative control.
3. **Derived data releases:** source family by source family with claim receipts and rights manifests.
4. **Raw and sanitized SQLite releases:** added when the extra written permissions and export/privacy gates above are satisfied.

See the [architecture](docs/engineering/ARCHITECTURE.md), [public data dictionary](docs/engineering/DATA_DICTIONARY.md), and [permission-request drafts](docs/publication/PERMISSIONS_OUTREACH.md).
