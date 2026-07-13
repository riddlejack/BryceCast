# Brief F5 — battle camera audit

## Decision

F5 is supported by the archived Race Control feed with one required source-honest deviation: the requested leader-change continuity offset is not implemented. A nonzero offset would move the active leader away from zero while the axis still claimed absolute “seconds behind the leader.” The camera instead preserves absolute coordinates and begins a new path segment whenever leader identity changes.

The fixed F4 three-driver lower chart has been replaced by a full-field, leader-referenced camera. The approved upper Bryce-centered corridor remains unchanged. The separate Distance to the leader chart now uses the same valence: smaller gaps plot higher.

## Root cause and design

F4 fixed the lower chart’s identities when session history began. That prevented remapping, but it could not follow the actual battle as different cars entered Bryce’s timing neighborhood. It also assigned historical blue/green identity colors to roles that can reverse.

F5 derives every classified DriverID from the existing session-keyed full-field history. A 12-second vertical frame follows the trailing-60-second median of Bryce’s absolute gap to the live-ranked leader. Bryce remains a 2.5px gold line and moves inside the frame. Other historical lines remain neutral; only the current nearest-ahead and nearest-behind ladder marks receive role color and explicit text.

## Exact chart semantics

| Surface | Contract |
|---|---|
| Y coordinate | Cumulative contiguous numeric `liveGap` intervals in `liveRank` order from P1. The leader is 0. Smaller seconds behind plot higher. |
| Camera | 12.0 seconds tall. Target center is Bryce’s trailing-60-second median. The rendered center eases slowly; a 0.5-second edge guard hard-clamps Bryce into view. Reduced motion snaps to the target. |
| X coordinate | Trailing five minutes, step-after at archived source timestamps. Relative minute labels and lap boundaries are primary; wall-clock time is confined to diagnostics/tooltips. |
| Membership | Any sourced series intersecting the viewport can render. Current membership retains an identity until it clears the frame by 0.5 seconds. Paths retain their pre-window predecessor and enter/exit through clipping edges. |
| Styling | Bryce: gold, 2.5px. Others per segment by sourced gap to Bryce: ≤1.5s is 2px/0.9; ≤3.5s is 1.5px/0.5; otherwise 1px/0.28. |
| Ladder | Every current in-frame car gets a dot. Bryce gets the №9 plate. Bryce plus the nearest four receive persistent collision-resolved labels; other in-frame identities are available through nearest-line hover. |
| Crossings | A stable-rank relationship flip between consecutive comparable samples creates an open marker on Bryce’s observed source point. The proof target is `2143` passing `2147` (Allaer) at `2026-07-04T17:22:05.680Z`, lap 10. |
| Caution | Contiguous caution samples create warning-token spans; the existing caution banner is preserved. |
| Unavailable | Missing/non-numeric intervals, non-running status, pit/off-track state, or sourced lap-status text break that row and every downstream coordinate. If Bryce is unavailable, the camera holds his last valid coordinate and reports the state. |

No `lapDistance`, `liveDiffAhead`, `liveDiffBehind`, GPS claim, zero fill, smoothing, or fabricated intermediate telemetry is used.

## Source-field lineage

| UI fact | Source | Treatment |
|---|---|---|
| Stable identity | `rows[].driverId` | Race Control DriverID throughout history, paths, ladder, crossing markers, upper corridor, and field. |
| Ordering and neighbors | `rows[].liveRank`, then published `rank` fallback | One canonical sort shared with F4 field/corridor. Published-rank lag is retained as a disclosed source limitation. |
| Absolute gap coordinate | `rows[].liveGap` | Adjacent numeric intervals are cumulatively summed from P1 until the first unavailable/non-comparable row. |
| Lap labels and crossing copy | `heartbeat.lap` / normalized `lapNumber` | Discrete source label only. |
| Caution spans | `heartbeat.flag` / normalized `currentFlag` | Discrete source state; warning token only. |
| Off-scale state | `status`, `comment`, `onTrack`, lap text in `diff`/`gap` | Status gate only; never substituted into a numeric coordinate. |
| Sample identity | replay `archiveCheckedAt`, otherwise payload `checkedAt` | Deduplicated, chronological, session-isolated history. |

## Automated proof

`automated-camera-proof.json` is a streaming, read-only audit of the two canonical Mid-Ohio sessions:

- 6,403 archived snapshots checked.
- 130,056 comparable absolute coordinates checked.
- 4 leader changes found; each becomes a path break with no continuity offset.
- 1,041 one-second arrivals retained unchanged source values, proving arrival cadence is not treated as value motion.
- 14 comparable Bryce rank crossings detected.
- The clean lap-10 Allaer crossing is present with Bryce P18 → P17 and absolute coordinates on both sides.
- No audit violations.

`f4-regression-proof.json` re-runs the F4 agreement audit over the same 6,403 snapshots: 153,672 field rows and 147,110 corridor cars, no violations.

`replay-visual-proof.json` records DOM-level timestamp, DriverID, rank, ladder, corridor, camera-domain, collision, overflow, caution, and console assertions for the Chrome captures.

## Visual proof

The required pass sequence:

- `screenshots/overtake-before--desktop.png`
- `screenshots/overtake-during--desktop.png`
- `screenshots/overtake-after--desktop.png`
- `screenshots/overtake-during-full--desktop.png`

State and responsive coverage:

- `screenshots/green--desktop.png`, `screenshots/green--mobile.png`
- `screenshots/mid-race--desktop.png`, `screenshots/mid-race--mobile.png`
- `screenshots/caution--desktop.png`, `screenshots/caution--mobile.png`
- `screenshots/cold--desktop.png`, `screenshots/cold--mobile.png`

All full-page captures use Chrome headless with `reducedMotion: 'reduce'`. The COLD state correctly renders the existing guarded waiting surface rather than a stale camera.

## Deviations and feed limitations

1. **No leader continuity offset.** Absolute labeling and a nonzero continuity transform are mutually incompatible. Leader changes break paths instead.
2. **No interpolated point motion.** Underlying paths are step-after source samples. Camera easing is a render transform only; reduced motion removes it. The optional 200ms newest-point easing was not needed.
3. **Explicit lap-status gate.** A numeric `liveGap` can briefly coexist with published lap-status text during asynchronous row updates. F5 chooses the conservative result: the lap-status row and downstream seconds coordinates leave the scale until comparable again.
4. **Published-field lag remains visible.** `liveRank`, published `rank`, `diff`, and `gap` do not update atomically. The camera and upper corridor consistently use the live-ranked numeric interval chain; the field retains its documented published-gap contract.
5. **History is in memory.** Route navigation preserves it; a hard reload starts a new five-minute window. The source drawer discloses this limitation.

## Parked Jack/Fable decisions

- Keep the upper Bryce-centered corridor in F5, as directed. After real-use review, Jack/Fable can decide whether the right-edge ladder is sufficient to replace it in a later brief.
- Hero, title-card, and unrelated copy cleanup remain parked. No Fable side-lane observations were implemented here.
