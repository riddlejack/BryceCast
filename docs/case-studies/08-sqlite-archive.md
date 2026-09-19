# Content-addressed SQLite archive

BryceCast's archive design separates observation cadence from payload duplication. Repeated source checks retain their timestamps while immutable endpoint payloads are stored once by content hash.

## Problem

The legacy live writer embedded timing plus driver profiles, schedule, track activity, and configuration inside every snapshot. Most enrichment payloads changed far less often than the one-second timing observation, so preserving cadence also copied large stable documents repeatedly.

A historical read-only audit reported **16,474 snapshots**, **5.866 GB of embedded source data**, and **5.523 GB—94.15%—duplicate content**. A separate observation at `2026-07-18T16:35:02Z` recorded a 5.99 GB database and roughly 1.3 GB/hour legacy growth during Nashville Practice 1. These are historical audit baselines, not measurements reproduced from the licensed archive in this repository. See the [Archive V2 plan](../archive/research/LIVE_ARCHIVE_V2_PLAN.md) and [high-frequency feasibility report](../../analysis/historical-high-frequency-data-audit/FEASIBILITY_REPORT.md).

## Method

The [Archive V2 implementation](../../scripts/lib/archive-v2.mjs) stores one immutable version per endpoint and SHA-256 content hash. A lightweight observation row records when a fetch occurred and points to that version. Snapshot rows retain session indexes and a reference to the timing observation rather than embedding unchanged enrichment JSON.

This preserves two distinct facts:

1. the source was checked at a particular time; and
2. the returned bytes were identical to an existing payload version.

The archive reader hydrates either legacy or V2 storage back into the same `{summary, raw}` application contract. Migration works from a copied legacy database into a sidecar and refuses the live archive path. Retention planning is inert: it proposes candidates but does not delete or vacuum data. See the [reader](../../scripts/lib/archive-reader.mjs), [acceptance gates](../../scripts/lib/archive-v2-gates.mjs), and [retention contract](../operations/ARCHIVE_V2_RETENTION.md).

## Reproducible synthetic validation

The runnable command `npm run test:archive-v2` builds temporary synthetic SQLite databases, migrates them, checks invariants, and removes them. The fixture contains two sessions, changing one-second timing payloads, stable enrichments, exact repeated timing responses, a failed enrichment, and rare flag, pit, DNF, mechanical, comment, and session-boundary transitions. The source is [test-archive-v2.mjs](../../scripts/test-archive-v2.mjs).

The publication-preparation run passed **all 11 checks**:

- **600 legacy snapshots and 600 V2 observations** survived;
- **604 distinct content versions** were created with **zero dangling references and zero hash mismatches**;
- hydration was byte-identical for **600 of 600 snapshots**;
- **64 of 64 rare transition rows** survived;
- legacy embedded payload bytes were **8,845,153**, versus **849,706** in V2, a **9.61% ratio**;
- legacy/V2 reader equivalence, repeatable migration, single-session extraction, and inert retention all passed.

These values describe the tiny synthetic fixture only. They demonstrate storage semantics and acceptance gates, not the savings achieved on the withheld live archive.

## Result

The design makes storage efficiency compatible with evidence retention. Timing can remain at its source cadence, exact repeated observations keep their timestamps, rare state changes remain reconstructable, and readers do not need separate application code for legacy and V2 data.

## Limits

The historical 94.15% duplication estimate is reported stored evidence and was not rerun here. The 9.61% result is synthetic and cannot be substituted for a production migration measurement. The licensed raw corpus and live SQLite archive are withheld pending a separate permissioned release. Archive V2 code and synthetic behavior are verified; production migration, live dual-write, and retention deletion are not claimed.
