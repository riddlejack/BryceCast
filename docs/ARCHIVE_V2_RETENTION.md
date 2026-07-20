# Live Archive V2 — Retention Policy (config only, NOT activated)

Status: 2026-07-20. This document + the exported config in
`scripts/lib/archive-v2.mjs` (`DEFAULT_RETENTION_POLICY`, `planRetention`) exist so
the retention *shape* is code-reviewable and versioned. **Nothing in the codebase
activates it.** No runtime path calls `planRetention`; it issues no `DELETE`, no
`VACUUM`, and never touches the live archive. Activation is a separate, gated
decision that comes only after the V2 acceptance gates pass on a real migration
(see `docs/LIVE_ARCHIVE_V2_PLAN.md`).

## Why retention is deferred, not designed-in

The plan is explicit (Safe migration §8, Automation decision): the long-term
immutable-raw-copy question is open, and the live archive must never be mutated
in place. Deduplication — not deletion — is the storage win. Retention is only
worth activating once V2 is promoted and the raw timing JSONL's role as the
immutable copy is settled.

## Policy shape

| Field | Default | Meaning |
| --- | --- | --- |
| `hotSessionCount` | `8` | The N most-recent sessions stay fully hydratable and uncompacted. |
| `compaction.minAgeDays` | `30` | Never compact a session younger than this. |
| `compaction.keepTimingBreakpointsOnly` | `true` | After compaction, retain timing observations only at change breakpoints (rank / flag / status / comment / pit transitions), not every 1s row. Enrichment payload versions are already deduped. |
| `compaction.dropUnreferencedVersions` | `true` | A payload version may be dropped only when no retained observation references it. |

### Guardrails (any future activation MUST honor these)

- `neverDeleteRawTimingJsonl` — the per-session `data/live/raw/timing-*.jsonl`
  files are the append-only raw record; compaction never removes them.
- `neverMutateLiveArchive` — compaction runs against a promoted/copied V2
  database, never the active runner's SQLite.
- `requireContentEquivalenceGatePass` — no compaction may run until the
  contract-equivalence gate has passed on the target database.

## What compaction would (eventually) do

`keepTimingBreakpointsOnly` is the one lossy step, and it is deliberately scoped:
the rare timing transitions the plan enumerates as first-class evidence
(DNF / status / comment / pit / flag / session-transition) are breakpoints and are
always retained. The bytes it would reclaim are the long runs of identical
one-second timing observations between breakpoints — and even those keep their
observation timestamps in `source_observations`-style rows in a future revision;
only the redundant payload reference is dropped, never the fact that the source
was checked at that instant.

`planRetention(sessions, policy, nowMs)` returns a plan object
(`{ hotSessions, compactCandidates, withheldTooYoung, activated: false }`) for
inspection and testing. It performs no I/O. Turning a plan into action is
out of scope for this change and would land as its own gated tool.

## Testing

`scripts/test-archive-v2.mjs` asserts the planner is inert: `activated` is always
`false`, the hot window is respected, and the `neverMutateLiveArchive` guardrail
is set. It never exercises a delete path because none exists.
