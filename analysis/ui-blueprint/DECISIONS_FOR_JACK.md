# Decisions For Jack

Generated: 2026-06-17

These are the product/taste decisions that remain after applying the committed packet and current source contracts. Implementation details, unsupported data requests, and backend proof gaps are intentionally excluded.

## Decisions

1. Homepage aggressiveness during race week/live windows
   - Default: family-readable top layer with analytics one tap down.
   - Decision needed: during active race week, should the home screen stay strictly companion-first, or should it surface more analytics/debrief/career modules above the fold for serious fans?

2. Source-pill language tone
   - Default: compact family-readable labels backed by exact state in the drawer.
   - Decision needed: should first-screen labels say operator terms like `wrong_series`, `stale`, `partial`, or translated labels like "Race Control is showing another series"?

3. Debrief archetype copy
   - Default: v1 stays factual unless labels are manually reviewed.
   - Decision needed: should reviewed archetype labels appear on the debrief first screen, or should v1 avoid archetype labels entirely and keep them internal?

4. Incident/team context promotion
   - Default: incident/penalty and team context stay drawer/v1.5.
   - Decision needed only if overriding default: should reviewed incident/team detail become v1 debrief content while still staying out of headline copy?

5. Public sharing gate for live mode
   - Default: ship the static/live-state shell, but do not claim production live mode until real INDY NXT green/yellow rehearsal proof exists.
   - Decision needed: should public sharing wait for Road America live proof, or is it acceptable to share the companion shell earlier with explicit "live proof pending" labels?

6. Desktop/TV priority after mobile
   - Default: mobile-first race companion; desktop is density expansion, TV mode is not v1.
   - Decision needed only if priority changes: should MacBook dashboard or TV mode become a near-term product posture instead of v1.5/later?

## Not Decisions

- Do not choose final visual style in this lane.
- Do not promote live GPS/moving-dot, POV, radio audio, detailed pit sequence, tire/fuel/overtake strategy, official INDY NXT weather, or engineering root-cause claims without new source contracts.
- Do not compute live points locally; render `/api/readiness.points`.
- Do not treat post-session reconciled as implemented until the reconciliation report path exists.
