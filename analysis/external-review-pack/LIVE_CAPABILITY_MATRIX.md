# Live Capability Matrix

Live race-day mode has real API/view-model plumbing and fixture states, but it is not production-proven until an active INDY NXT session rehearsal and official post-session reconciliation exist.

## Post-Road America Update

This matrix was generated before the June 21, 2026 Road America Race 2 live
drill. For current live-readiness interpretation, read
`../../LIVE_DRILL_CLOSEOUT_2026-06-21.md` and
`../../LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md`.

The Road America closeout proves the public Race Control source and BryceCast
ingestion path can support 1-second live polling, guarded Bryce identity,
SQLite/JSONL archive capture, latest snapshot publication, API smoke/readiness,
and post-race COLD-state handling. The remaining blocker is runtime architecture:
the next race setup must avoid the ad hoc multi-monitor process explosion and
use one quiet ingestor/cache-backed API flow.

## Runtime Boundary

- /api/readiness
- /api/session
- /api/timing
- /api/bryce
- /api/weather/live
- /api/weather/upcoming
- /api/replay/bryce
- /api/sources
- /api/history/bryce?compact=1

## Fixture States In UI Data Package

| Fixture | State | Severity | Reason | Points mode | Weather | Replay |
| --- | --- | --- | --- | --- | --- | --- |
|  | wrong_series | red | Current Race Control feed is not Bryce INDY NXT. | historical_fallback | live | tiny |
|  | pre_session | amber | INDY NXT context exists, but green/yellow live Bryce timing is not active. | historical_fallback | live | tiny |
|  | ready | green | Fresh INDY NXT timing has a guarded Bryce row. | race_control_live | live | ready |
|  | degraded | amber | Core timing is usable, but one enrichment source is partial. | partial | partial | tiny |
|  | stale | amber | Timing data is too old for live Bryce display. | stale | live | ready |
|  | blocked | red | Required live timing context is unavailable. | historical_fallback | error | missing |
|  | blocked | red | Active INDY NXT timing is available, but no guarded Bryce car #9 row is present. | historical_fallback | live | ready |
|  | blocked | red | Active INDY NXT timing is available, but no guarded Bryce car #9 row is present and no usable archive is available. | historical_fallback | live | missing |
|  | pre_session | amber | INDY NXT context exists, but the replay archive is empty. | historical_fallback | live | empty |
|  | pre_session | amber | INDY NXT context exists, but replay samples are repeated cold-state rows. | historical_fallback | live | tiny |

## Live Proof Gates

| Gate | Status | Requirement |
| --- | --- | --- |
| active_indy_nxt_rehearsal | blocked_by_live_proof | 20 minutes at 1-second polling during active INDY NXT running. |
| fresh_bryce_identity | blocked_by_live_proof | INDY NXT heartbeat plus car 9 and DriverID 2143 or exact Bryce Aron. |
| replay_trend_ready | blocked_by_live_proof | Archive has enough live samples, changing payloads, and chronological rows. |
| points_reconciliation | blocked_by_live_proof | Race Control running points reconcile to official result after publish. |

Note: prior docs record cold/post-session pressure checks, but this worktree does not contain `data/live/live-source-pressure-latest.json` as a current generated artifact. Fresh live-readiness evaluation should rerun `/api/readiness`, `/api/sources`, pressure, poller, and replay checks.

## Safe To Design Now

- Readiness/source health shell.
- Schedule, weather readiness, watch/listen routing, and stale/wrong-series states.
- Bryce focus tile and timing tower only when `/api/readiness` proves the session/identity.
- Guarded points card that displays Race Control point fields only when `/api/readiness.points.mode` permits it.
- Replay/debrief shell that clearly reports missing/empty/tiny archive states.

## Do Not Claim Without Later Proof

- Live green-flag INDY NXT proof.
- Official points reconciliation.
- Live GPS/moving dots.
- Team radio audio or live POV.
- Tire/overtake strategy, pit prediction, detailed pit sequence, or causal strategy claims.
- NWS weather as official INDY NXT weather or track temperature.
