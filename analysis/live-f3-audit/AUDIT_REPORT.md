# Brief F3 — Live data wiring, motion, and product audit

## Decision

The one-second reducer was already reaching the Live screen; the failure was field selection and render geometry, not polling. The UI attached motion to lap-line values (`diff`, `gap`, lap completion) while ignoring the only validated sub-lap interval (`liveGap`). It also recreated spatial layout from sorted values and index-scaled histories, so the screen alternated between frozen and globally jumpy.

This change uses localized motion only when a sourced value changes:

- a full static circuit outline, plus a separately labeled completed-lap progress bar;
- a Bryce-centered battle frame built by cumulatively walking contiguous numeric `liveGap` intervals in `liveRank` order;
- stable driver IDs, identity-seeded collision-aware label lanes, and ~one-update-interval x transitions;
- timestamp-scaled neighbor and full-session histories with fixed windows/scales;
- stable-key field rows with reduced-motion-aware FLIP reorder/highlight only on rank changes;
- no UI use of `lapDistance`, `liveDiffAhead`, `liveDiffBehind`, GPS, or physical track position.

## Reproduction and root-cause ledger

| Root cause | Evidence | User-visible effect | Resolution |
| --- | --- | --- | --- |
| Track stroke was `lap / totalLaps` passed to `strokeDashoffset` | `TrackArt progress`; baseline DOM had one unchanged dash value for 31 seconds | One black segment, frozen until lap boundary; easily misread as car activity | Live now renders the complete outline. Lap completion is an explicit progress bar. |
| Corridor used lap-line `diff` | Race 1 lap-7 probe: `diff=4.4808`, `gap=0.3500` stayed fixed while `liveGap` changed; baseline identities had 1 x coordinate across 31 samples | Dots looked dead | Cumulative numeric `liveGap` drives x. |
| Corridor sorted by offset and assigned `labelY` by render index | Baseline 31-s DOM trace: stable identities changed label lane 2–4 times during a rank window | Names jumped vertically and reassigned lanes | Stable ID key + identity-seeded lane assignment; nearby rendered labels walk to a clear lane without depending on rank/render order. |
| No SVG x/y transition | Circles/text received new coordinates directly | Changed states snapped | Stable `<g>` identity transitions `transform` over 900ms; unchanged transform does nothing. |
| Neighbor history used `sampleIndex / (n - 1)` and dynamic y max | Baseline first path rewrote from `M908...` to a 29-point path starting `M68...`; 30 distinct paths in 31 samples | Every append relocated all history | Real timestamps, fixed five-minute x domain, fixed ±4s y scale, missing-value segment breaks. |
| Full-session gap history also used array index and growing extent | Source audit | Whole session trace rescaled on append | Real timestamps and a fixed one-hour session domain; y changes only at explicit 10-second domain thresholds. |
| Field row key included rank (`no-rank`) | Source audit | Rank change remounted identities, defeating coherent reorder | Stable `driverId`; FLIP on actual top delta; changed rows alone highlight. |
| Polling was not the blocker | `useReadiness` schedules 1,000ms for ready/degraded; archive median 1.002s; baseline browser state updated P16→P17 inside the rank window | Data arrived but wrong components appeared stagnant | Preserve polling; prove endpoint arrivals and component coordinates separately. |

Baseline Browser console errors/warnings: none. Baseline mobile geometry did not horizontally overflow the measured document, but a full-page screenshot exposed sticky-tabbar stitching artifacts; final proof uses viewport/module captures plus explicit layout measurements.

## Acceptance validation

The final Browser/API probes exercise the built implementation against the read-only Race 1 replay:

1. **Fresh payloads:** 45/45 one-second polls selected distinct archive records; median archive step was 1.002s.
2. **Localized motion:** the 30-frame desktop trace contained 153 changed and 195 unchanged consecutive interval pairs. Every unchanged pair retained the same x transform within one micro-pixel; changed interval pairs updated the corridor.
3. **Stable identity:** the same 24-row `driverId` keys persisted while Bryce and three neighbors reordered. Four drivers changed official rank, with no identity-key remount strategy and no label-lane changes.
4. **Stable history:** four continuously observed neighbor segments retained an identical first timestamp coordinate through every append. A new sample extended the tail instead of rescaling old x positions.
5. **Truthful track:** through the P17→P18 rank change, lap stayed 9 and the track path, dash state, and explicit lap-progress state each had exactly one value.
6. **Desktop/mobile stability:** 30 seconds at each viewport produced zero horizontal-overflow frames. The mobile collision probe produced zero overlapping-label frames.
7. **Accessibility/diagnostics:** emulated reduced motion collapsed transitions to 0.01ms and disabled row animation. Source-drawer interaction passed. Final console errors/warnings: zero.

Machine-readable totals are in [motion-proof-summary.json](motion-proof-summary.json); raw frames are in `after-motion-dom.json` and `after-motion-mobile.json`.

## Data findings

- Race 1: 3,317 samples, median 1.002s, p95 1.222s. Race 2: 3,086 samples, median 1.002s, p95 1.211s.
- Bryce `liveGap` changed 688 times (median 4.030s) in Race 1 and 598 times (4.010s) in Race 2.
- Bryce `gap` changed 54/51 times at roughly lap cadence (72.359s/70.882s). `laps` changed at 75.060s/72.129s.
- `lapDistance` was exactly zero for every Bryce sample in both sessions.
- `liveGap` matched the adjacent `liveRank` rows' `liveDiffAhead` delta after microsecond conversion for 93.0%/90.6% of newly changed, active, same-lap samples. The residual mismatch is consistent with asynchronous row-field updates. That validates the direct adjacent-interval field with a transition caveat; it does not validate direct product use of `liveDiff*`.
- `liveDiffBehind` target semantics remain unresolved and it is excluded.

See [FIELD_DICTIONARY.md](FIELD_DICTIONARY.md) and [traces/manifest.json](traces/manifest.json).

## Product recommendation

The Live screen should behave like a race-state instrument, not a fake track map:

1. **Now:** official flag, lap, live rank, source freshness, and a truthful full circuit reference.
2. **Battle:** Bryce-centered adjacent intervals, neighbor identities, and a five-minute time trace. Motion communicates changed official timing states, not a continuous car trajectory.
3. **Events:** rank/pass/marker/pit/overtake/flag changes as a timestamped tape. This is the strongest next addition because those are discrete sourced events and explain why rank moved.
4. **Field:** stable running order with lap-line gap-to-leader values and localized reorder motion. It is a table first, animation second.
5. **Race clock:** expose raw heartbeat `overallTimeToGo`/`flagTimes` through a small typed contract after validation; both updated near 1s and would make Live feel current without fabricating telemetry.

Do not animate every payload. A one-second HTTP arrival with unchanged source values should only advance freshness; no battle dot, row, or track mark should move.

## Performance and accessibility

- The new interval model is linear in field size (24 rows in the fixtures); no layout-wide animation runs each second.
- Corridor x motion uses compositor-friendly transforms on stable SVG groups.
- Field FLIP measures `offsetTop` once per payload and invokes Web Animations only for rows whose layout position changed.
- Numbers retain tabular numerals and fixed layout containers.
- SVGs keep descriptive `role=img` labels; the lap bar exposes `role=progressbar` and lap-valued ARIA attributes.
- Missing intervals create unavailable/segment-break states rather than zero-length flat lines.
- `prefers-reduced-motion` disables CSS animations/transitions, and the field FLIP hook skips Web Animations when reduced motion is active.

## Evidence map

- `traces/race1-green.jsonl`: 120 source samples.
- `traces/race1-yellow-neighbor-change.jsonl`: 121 samples.
- `traces/race1-rank-change.jsonl`: 61 samples.
- `traces/race1-lap-boundary.jsonl`: 61 samples.
- `traces/race2-yellow-green-boundary.jsonl`: 121 samples.
- `traces/race2-rank-change.jsonl`: 121 samples.
- `traces/cadence-summary.json`: complete heartbeat/Bryce field cadence and interval validation.
- `before-motion-dom.json`: 31-s rendered pre-change coordinate/path trace.
- `api-arrivals.json`: final one-second HTTP arrival proof (generated during validation).
- `after-motion-dom.json`: final 30-second desktop identity/coordinate/history proof.
- `after-motion-mobile.json`: final 30-second responsive collision/layout proof.
- `reduced-motion-check.json`: emulated reduced-motion computed styles.
- `motion-proof-summary.json`: acceptance assertions distilled from the raw probes.
- `screenshots/`: desktop/mobile before/after viewport captures, plus the mobile battle-module frame.

## Known limitations

- `liveGap` is source-honest but the feed updates row fields asynchronously. The UI holds the last sourced position until the next valid interval; it does not interpolate a physical car trajectory.
- The full-session gap-to-leader trace still represents lap-line timing, deliberately shown as a stepped/history context rather than sub-lap motion.
- `liveDiffBehind`, tire-code meaning, non-empty `overtakeActive`, and physical `lapDistance` semantics remain unproven.
- Replay weather is unavailable by design; no weather was invented.
