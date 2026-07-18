# BryceCast Live Archive V2 Plan

Updated: 2026-07-18. Status: approved architecture direction; implementation and migration deferred until after the Nashville race weekend.

## Decision

Keep one-second official timing observation. Stop embedding unchanged driver profiles, schedule, track activity, and config payloads inside every timing snapshot.

The current runner already reuses enrichment responses in memory, but `writeStorage` serializes the cached responses into every `race_snapshots.payload_json` row. A read-only audit of 16,474 snapshots reported 5.866 GB of embedded source data, of which 5.523 GB (94.15%) was duplicate content. Schedule, track activity, driver profiles, and config were 99.7-99.94% redundant. Reproduce those measurements before migration; treat them as the acceptance baseline, not as a reason to mutate the live archive in place.

## Collection contract

### Phase 1: change storage, not source cadence

Preserve the proven phase machine and network cadence while introducing content-addressed storage:

- Timing: observe every second in `LIVE`; retain every observation timestamp.
- Driver profiles, schedule, track activity, and config: keep the current fetch behavior initially, but store a new payload only when its content hash changes.
- Exact repeated timing responses: retain the observation timestamp and reference the existing timing payload version.
- Rare timing changes such as DNF/status/comment/pit/flag transitions remain first-class evidence even when most adjacent observations are identical.
- Preserve current source probes, HTTP status, ETag, last-modified value, fetched time, byte count, and errors.

This isolates the large storage win from fetch-cadence changes and makes the migration easier to validate.

### Phase 2: tune enrichment fetch cadence after V2 is proven

Use separate per-endpoint clocks rather than the current all-enrichment timer:

| Source | Proposed active cadence | Forced refreshes |
| --- | --- | --- |
| Timing | 1 second | Every live observation |
| Driver profiles | 1-5 minutes | Session start, session end, manual roster refresh |
| Track activity/results | 30-60 seconds | Session transition and after checkered |
| Schedule | 5 minutes while armed/live; slower while idle | Event/session transition |
| Config | Session start and 5-minute conditional check | Session transition |

Do not weaken timing cadence to save space. Storage deduplication, not slower timing, is the primary fix.

## Proposed schema

### `source_payload_versions`

One immutable row per distinct endpoint payload:

- `id`
- `endpoint_id`
- `content_hash` (SHA-256 of the original response bytes when available)
- `payload_json`
- `payload_bytes`
- `etag`
- `last_modified`
- `first_seen_at`
- `last_seen_at`
- unique constraint on `(endpoint_id, content_hash)`

### `source_observations`

One lightweight row per fetch/observation, including repeated content:

- `id`
- `checked_at`
- `session_key`
- `endpoint_id`
- `payload_version_id`
- `ok`, `status`, `bytes`, `note`, and source-state fields

This table preserves evidence that a payload was checked at a particular instant without copying the payload.

### `race_snapshots_v2`

One lightweight session/timing observation row:

- current summary/index fields used by readiness and replay;
- reference to the timing `source_observations` row;
- no embedded enrichment JSON;
- stable session/event IDs and source state.

Keep `bryce_samples` as the compact per-second Bryce projection until a separate change-event model proves replay-equivalent. A later driver/session dimension may version stable identity, roster, radio, and livery fields, but it must be derived from the retained raw profile versions rather than replacing lineage.

## API and replay changes

Add one archive reader abstraction that can hydrate the current `{summary, raw}` contract from either legacy `race_snapshots.payload_json` or V2 references. Route all of these through it before retiring legacy rows:

- latest runner-backed snapshot;
- `/api/readiness` and `/api/snapshot`;
- archived Bryce fallback search;
- replay session queries and browser simulation;
- source/provenance drawers.

The current fallback in `api-server.mjs` searches and parses legacy `payload_json` directly. It must be replaced before any legacy payload can be removed.

## Safe migration

1. Finish Nashville capture with the current writer. Do not change schema mid-weekend.
2. Build a new sidecar database from fixtures and copied/raw archives; never `DELETE` or `VACUUM` the active database.
3. Backfill legacy rows into content-addressed V2 tables and record counts/hashes.
4. Compare hydrated V2 output against legacy output for every session boundary, all rare status/comment transitions, and a representative timestamp sample.
5. Shadow dual-write legacy and V2 during one bounded non-critical test session.
6. Run live/replay/readiness/browser validation from V2 while keeping legacy read-only.
7. Promote V2 only after the acceptance gates pass; compress and retain the legacy database as rollback evidence.
8. Decide whether timing JSONL or the content-addressed database is the long-term immutable raw copy. Do not retain two full raw copies indefinitely without a stated recovery purpose.

## Acceptance gates

- Every legacy observation timestamp is represented in V2.
- Every distinct endpoint payload is hash-addressable and reconstructable.
- Hydrated latest/replay payloads are contract-equivalent to legacy output.
- DNF, mechanical, status, comment, pit, flag, and session-transition events survive migration.
- One-second live cadence remains intact with no new capture gaps.
- The audited archive slice uses no more than 15% of its legacy embedded-payload bytes.
- `/api/readiness`, `/api/snapshot`, replay, live-motion, live-running-order, and browser validation pass.
- Recovery from a deliberately stopped writer succeeds without duplicate ownership or orphaned references.

## Automation decision

Do not restore the July 18 ten-minute Nashville capture guard. The LaunchAgent is already `KeepAlive`, and the runner independently polls while idle, arms before sourced session windows, and enters live capture from the official timing heartbeat. An automation on the same physical Mac cannot recover power, lid, or network loss and should not create a new task every ten minutes while Bryce is not on track.

If an external check is desired later, make it a one-shot preflight near each sourced session window plus a failure-only alert. It should auto-archive on success, never start a second ingestor, and remain separate from the capture process itself.
