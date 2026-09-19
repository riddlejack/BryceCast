# Live reliability after a process-exhaustion failure

BryceCast's live architecture was redesigned after a Road America drill exposed a process-ownership failure. The retained evidence includes both the recovery path and a major capture gap.

## Failure

The drill exhausted process slots through overlapping collectors and monitors. CPU and memory were not the primary constraint. At the same time, the normal capture path stopped recording for more than 26 minutes. The [root-cause analysis](../archive/live-drills/LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md) treats those as architectural findings rather than isolated operator errors.

The key change was ownership: one long-running ingestor now owns upstream polling, normalization, raw persistence, SQLite/JSONL writes, latest-snapshot publication, and health state for a source family. API viewers read cache or archive by default instead of starting another upstream poller.

## Method

The [runner core](../../scripts/lib/live-runner-core.mjs) uses explicit lifecycle phases: `IDLE` at roughly five-minute cadence, `ARMED` near 15 seconds, `LIVE` at one second, and `COOLDOWN` at 15 seconds for approximately ten minutes. It combines lock aging, heartbeat checks, a minimum process budget, and runner-only ownership. The operating rules are in the [live runner runbook](../operations/LIVE_RUNNER_RUNBOOK.md).

The [API server](../../scripts/api-server.mjs) also guards identity and series. A current timing row must match Bryce's stable identity. If it does not, the API returns a labeled archived fallback or an error rather than presenting another series as current. Direct upstream refresh remains an explicit operator/debug action.

Replay is treated as a reliability tool as well as a feature. The archive reader hydrates stored snapshots into the same contract used by live views. Separate audits test payload identity, running-order invariants, motion coordinates, lapped-car handling, and route persistence.

The design also distinguishes arrival from change. Repeated one-second responses remain observations, while camera motion and rank transitions follow source-backed value changes instead of manufacturing continuous vehicle movement.

## Drill evidence

The [final Road America validation summary](../../analysis/live-drill-2026-06-21/final-validation-summary-2026-06-21.json), generated 2026-06-21, records:

- normal capture: 1,188 total rows, 1,175 race rows, zero endpoint errors, and a **1,602.864-second maximum gap**;
- emergency capture: 599 rows, zero endpoint errors, 206,254,265 raw bytes, and a **1.310-second maximum gap**;
- combined race evidence: 1,774 rows, but still an **851.078-second gap** before the final state; and
- API read pressure: 720 route requests, zero errors, `p95=488 ms`, `max=645 ms`.

The final state was captured. The race was not captured continuously, and the documentation preserves that distinction.

## Later replay evidence

The read-only [replay consistency proof](../../analysis/live-f4-audit/replay-consistency-proof.json), generated 2026-07-13, checks **6,403 snapshots**, 153,672 driver rows, 147,110 battle-car rows, and 151,503 coordinates across two sessions with zero invariant violations. It also records 1,805 snapshots where source `liveRank` differs from published rank because upstream fields update asynchronously; both views still use the same payload and ordering rules.

The [automated-camera proof](../../analysis/live-f5-audit/automated-camera-proof.json) checks 14 Bryce crossings and 130,056 coordinates with zero violations. The [running-order proof](../../analysis/live-f6-audit/automated-running-order-proof.json) checks 153,672 official ranks and 804 lapped-upstream samples with zero violations.

## Limits

Approximately one-second arrival cadence is not one-second value motion or telemetry. Stored replay proofs establish deterministic behavior for retained sessions; they do not prove that a runner, tunnel, or deployment is healthy now. Licensed raw captures and live SQLite remain withheld operational evidence.
