# BryceCast public data dictionary

This dictionary describes the data shipped with the source candidate and the schemas needed to interpret it. It does not imply that the complete source corpus or operational database is included. Publication scope and future release gates are in [DATA_RELEASE.md](../../DATA_RELEASE.md).

## Evidence labels

| Label | Meaning |
| --- | --- |
| `Verified` | Checked directly against an included artifact, deterministic validation, or identified primary source. |
| `Reported` | Recorded from an owner/provider statement that is not independently established by the public clone. |
| `Derived` | Computed from identified inputs by versioned code. |
| `Open` | Unresolved, unavailable, or awaiting source/permission evidence. |

Unavailable values remain `null`, an empty collection, or an explicit unavailable state. They are not filled from a different source merely to complete a chart.

## Included artifact families

| Artifact | Grain | Role | Reproduction boundary |
| --- | --- | --- | --- |
| [UI data package](../../analysis/ui-data-package/ui-data-package.json) | One dated application snapshot containing multiple screen contracts | Main aggregate consumed by React | Included and hashable; its withheld canonical input is not included. |
| [Career ingestion summary](../../data/career/reports/ingestion-summary.json) | Source-family and entity counts | Coverage receipt | Recomputable from included report, not from original source rows. |
| [Career validation report](../../data/career/reports/validation-report.json) | Validation run | Error/warning receipt | Included result; full rerun needs the canonical dataset. |
| [Career coverage matrix](../../data/career/reports/career-coverage-matrix.json) | Series/season/metric coverage | Documents observed and missing fields | Included derived report. |
| [Timing coverage ledger](../../data/historical-data-lake/catalog/timing-coverage-ledger.json) | One canonical session plus zero or more source candidates | Maps timing availability and source tier | Included catalog; raw timing observations are withheld. |
| Context packs under `analysis/**/output/context-packs/` | Typed screen-specific aggregate | Race stories, section laps, pass marks, model context, and chapter context | Included with hashes; source rows may be withheld. |
| [`public/data/history-bryce.json`](../../public/data/history-bryce.json) | Season/race history projection | Static browser fallback | Included derived output. |
| Track outlines under `src/assets/tracks/` | One normalized display polyline per circuit | Map rendering | Included compact geometry; source-family obligations still apply. |
| [Portfolio evidence receipt](../evidence/portfolio-stats.json) | One publication-prep snapshot | Headline counts plus source hashes and caveats | Recomputed from included generated reports by `npm run portfolio:stats`. |
| [Synthetic timing example](../../examples/timing-sections/README.md) | Invented drivers, laps, and loop crossings | Demonstrates decoder semantics and a negative control | Fully reproducible; it is not historical evidence. |

## Shared identifiers and timestamps

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Version of an artifact's structural contract. A change in meaning requires a version change. |
| `dataAsOf` / `asOfDate` | Latest date the snapshot claims to cover. It is the public freshness boundary. |
| `generatedAt` | Time a derived artifact was created. It does not mean its sources were live then. |
| `checkedAt` | Time a source observation or test fixture was evaluated. Demo responses use the frozen package time, not the current clock. |
| `sourceHash` / `sha256` | Content identity of an input or output. A hash identifies bytes; it does not grant redistribution rights. |
| `sessionId` / `canonicalSessionId` | Stable BryceCast identity, commonly `session_<series>_<year>_<official-session-id>`. |
| `eventSessionId` | Provider's session identifier where available. It is not interchangeable with a canonical ID. |
| `sourceSessionId` / `sessionKey` | Source/archive identity. It can differ from the canonical session and requires an explicit crosswalk. |
| `sourceTier` | Provenance class, such as official result, BryceCast capture, RaceTools capture, or Timing71 normalized observation. |
| `sourceState` | Observation state such as `live`, `cold`, `stale`, `error`, or `unavailable`. |
| `readiness` / `state` | Product decision such as `ready`, `pre_session`, `degraded`, `wrong_series`, `stale`, or `blocked`. This is not the same as source reachability. |

## Analytical grains

| Grain | Unit | Join rule |
| --- | --- | --- |
| Career | One driver across all series | Never infer missing seasons from result counts. |
| Season | Driver × series × year | Preserve team/equipment context. |
| Event | One race weekend at one venue | Event identity does not identify a particular race in a doubleheader. |
| Session | Practice, qualifying, race, heat, or test | Join by canonical/source crosswalk, not names alone. |
| Result | Entrant/driver classified in a session | Preserve official classification separately from as-raced timing. |
| Lap | Driver × session × lap | Missing laps remain missing; partial observation is not full coverage. |
| Timing-loop crossing | Driver × named loop × source timestamp | A loop is a timing line, not GPS or pedal telemetry. |
| Section observation | Driver × lap × supported section | Measured sections and derived remainders remain distinct. |
| Event annotation | Incident, penalty, caution, weather, or narrative item | Keep source, time precision, and interpretation separate. |

For endurance racing, classification may be car-level while participation is driver-level. `finishPosition` and `classFinishPosition` therefore have different denominators and must not be merged.

## Important metric semantics

- `startPosition` and `finishPosition` are official classification fields when an official source exists.
- `liveRank` is a source observation during a session; `rank` may be a published or fallback rank. Neither becomes an official result until reconciliation.
- `gap` and `liveGap` preserve the source representation. A blank or nonnumeric gap is unavailable, not zero.
- `bestLapTime`, `lastLapTime`, and section times are source timing values. An untimed remainder may be derived as lap time minus measured sections only when labeled derived.
- `runningDriverPoints` is a live projection field. `totalDriverPoints` and historical championship points have different bases.
- `weather` is either official/trackside as explicitly identified or modeled near-track context. Open-Meteo/NWS air conditions are not official track temperature.
- `fieldSize`, `top5`, `top10`, and averages must state their filters and denominator. Catalog entries, source candidates, sessions, races, and training examples are not interchangeable counts.

## Live archive schemas

No operational SQLite file is part of the default source candidate. The repository contains schema and reader code so behavior can be tested with temporary synthetic databases.

Legacy V1 uses:

| Table | Grain | Sensitive/rights-relevant fields |
| --- | --- | --- |
| `race_snapshots` | One poll observation | `payload_json` can contain full third-party timing and enrichment payloads. |
| `source_probes` | Snapshot × endpoint | URLs, ETags, HTTP metadata, notes, and source availability patterns. |
| `bryce_samples` | Snapshot × Bryce | Timing, position, pit, points, lap-distance, and radio-frequency fields. |

Archive V2 adds `archive_meta`, content-addressed `source_payload_versions`, `snapshots_v2`, and `snapshot_payload_refs`, while retaining probe and Bryce-sample projections. V2 deduplicates storage; it does not change ownership or publication rights in the reconstructed payload.

A future public SQLite artifact must be newly exported from an explicit column allowlist. It must exclude disallowed payload families, credentials or signed URLs, machine paths, operational notes, WAL/SHM/freelist remnants, and other deleted data. A schema-only release can be generated from source without opening the operational database.

## Claim receipts

Each public headline should record: displayed wording, metric definition and grain, numerator/denominator, filters, source family/tier, code commit, input and output hashes, `dataAsOf`, validation result, and one reproduction status:

- `reproduced_from_included_data`;
- `verified_against_withheld_snapshot`;
- `reported_by_source`;
- `open`.

`verified_against_withheld_snapshot` should be phrased as: “Computed by BryceCast from the identified source snapshot; aggregate and validation receipt included; source corpus withheld pending redistribution permission.”
