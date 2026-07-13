# Brief F4 — Live battle continuity, chart repair, and accuracy audit

## Decision

F4 replaces independent route-local histories with one bounded, typed, session-keyed store above the route switch. The battle corridor, nearby-driver chart, and Bryce distance chart now consume the same normalized timing snapshots and the same live-ranked ordering. A route remount retains the current session's recent window; a session change selects an isolated history before the next paint can expose the prior event.

The two line charts use one shared, source-honest coordinate: cumulative adjacent `liveGap` seconds from the live-ranked leader. For a driver at live position `n`, the displayed coordinate is `sum(liveGap[2...n])`. Bryce therefore moves instead of being pinned to zero, selected comparison drivers remain fixed by `DriverID`, and any missing/non-running interval breaks that driver's value and every downstream value. This is timing separation, not GPS or physical track position. `lapDistance` and both `liveDiff*` fields remain excluded.

The one-second poll remains intact. A poll arrival and a source-value change are separate facts: arrivals advance source status and history statistics; unchanged interval values do not move a dot or trace.

## Root causes and repairs

| Failure | Actual cause | Repair |
| --- | --- | --- |
| Battle labels did not read as part of their dots | Dot and label shared an x transform but had no visible relationship across collision lanes | Each stable driver `<g>` now contains its dot, label, and a translucent dashed vertical connector. Connector endpoints are derived from label lane and axis geometry and move in the same transform. |
| Distance chart x-axis was crushed | The old archive chart forced its domain to at least one hour even when only seconds/minutes were visible, then placed lap labels on the same sparse baseline | Both charts use the latest sourced five-minute timestamp window and pixel-aware time ticks. Lap markers occupy a separate top rail. |
| Distance chart wasted y-space | The old domain was `0..ceil(max/10)*10`, anchoring the plot at leader zero even when the observed series occupied a narrow range | The y-domain is the finite observed range with 12% honest padding, a 0.25 s minimum half-span for a constant series, non-negative floor, and pixel-aware nice-number ticks with seconds units. |
| It was unclear whether the distance chart updated | The old trace exposed no distinction between API arrivals and changed values | The chart shows current sourced value/time, latest poll time, poll count, changed-payload count, unchanged count, and a gold current marker. |
| Route navigation erased history | `useGapSamples` lived inside `LiveScreen`; leaving `/live` unmounted it. A second independent archive hook fed the full chart | `useLiveSessionHistory` is owned by `AppV3` above route rendering and feeds all three motion/history surfaces. |
| Replay could manufacture duplicate motion | Replay freshness shifts top-level `checkedAt` to wall time, so treating it as record identity can append the same archive record repeatedly | Replay history keys samples by `replay.simulation.archiveCheckedAt`; live mode uses payload `checkedAt`. Samples are timestamp-unique, replacement-safe, chronologically sorted, and capped to 300 per session/four sessions. |
| Blue/green chart made Bryce a fixed origin and could churn neighbors | The F3 chart plotted ahead/behind offsets around a hard-coded Bryce zero and selected whichever identities were adjacent on each render | The chart plots Bryce plus the two drivers adjacent when the session history begins on the same leader-relative frame. That comparison set is stable for the session and explicitly labeled as initially ahead/behind. |
| Published `diff` could not support the requested shared live chart | Replay inspection found `diff` is bursty/lap-line data and can be temporarily non-monotonic against newer `liveRank` during asynchronous row updates; non-leader zero sentinels also occur | Neither line chart uses `diff`. Both derive leader-relative seconds from contiguous adjacent `liveGap`. The field table retains the published `diff` display contract from F3, labels unavailable non-leader zero sentinels as `gap pending`, and does not use that field to position the corridor or charts. |
| Startup/event changes could “spaz out” | First-frame arbitrary SVG transforms, unconditional CSS transitions/pulses, local-state remounts, field-row FLIP showing the prior order over the new order, and React's effect-after-render session handoff could combine; a changed payload was not distinguished from an unchanged coordinate | First render and session changes have no motion class; animation is allowed only between two samples of the same session when the stable driver's sourced offset changed. Perpetual pulse/fade effects and positional field-row interpolation were removed; rank changes snap to the latest payload and retain only a non-positional highlight. SVG identity remains stable, reduced motion disables transitions/animations, and the payload session key prevents a mixed-session chart frame. |
| Battle and field order could diverge structurally | F3 used separate sort expressions | `sortRowsForLiveDisplay` is now the single ordering function used by both models and the field render: numeric `liveRank`, then published `rank`, then stable `DriverID`. |

## Source and display semantics

| Surface | Identity/order | Numeric coordinate | Missing data behavior |
| --- | --- | --- | --- |
| Battle corridor | Stable `DriverID`; same `liveRank`-first rows as field | Bryce-centered cumulative adjacent `rows[].liveGap`; positive is ahead of Bryce, negative behind | A missing/non-numeric adjacent interval stops that side of the corridor |
| Shared nearby-driver chart | Bryce plus initially adjacent ahead/behind IDs, fixed for the session | Cumulative adjacent `rows[].liveGap` from live-ranked P1, seconds, latest five minutes | Missing/non-running interval breaks that driver and every downstream line; identities are never substituted |
| Distance to the leader | Bryce's stable ID in the same session store | Same cumulative adjacent `rows[].liveGap` from P1, seconds, latest five minutes | Missing chain creates a line break; no zero fill or interpolation |
| Full field | Stable `DriverID`; same `liveRank`-first order | Published `diff` remains the F3 lap-line gap display; the adjacent battle bracket uses the same row `liveGap` semantics as the corridor | Non-running status replaces a number; contradictory non-leader `diff=0` renders `gap pending` |

Because Race Control row fields can update asynchronously, `liveRank` may lead published `rank` or `diff` at a checked timestamp. F4 does not reconcile that lag by inventing a value. It uses `liveRank` consistently for live ordering and derives both live charts only from the corresponding adjacent `liveGap` chain.

## Persistence and lifecycle guarantees

- State lives above the route component, so normal app navigation does not unmount it.
- Histories are keyed by `eventId-eventSessionId`; samples from different sessions never share an array or comparison cohort.
- The render selects history through the current payload's session identity, not the reducer's previous active key. During an event switch, the chart is absent until that event's first sample is committed.
- Duplicate source timestamps replace only a changed record at that timestamp and never append a second point. Late arrivals are sorted by source timestamp. The latest 300 samples preserve the requested five-minute window at one-second cadence.
- Comparison identities are selected once from the first eligible session sample and remain stable through rank changes.

This is in-memory route persistence, not browser-reload persistence. A hard document reload begins a new bounded window unless a future API/store enhancement rehydrates it. Replay starts at the selected archived source record and then reconstructs the same source-timestamp window deterministically; it does not use shifted wall-clock timestamps as historical identity.

## Replay-wide accuracy audit

The production normalization path was replayed against the canonical SQLite archive in read-only mode for Race 1 (`5544-6761`) and Race 2 (`5543-6760`). The proof checked 6,403 snapshots, 153,672 field rows, 147,110 corridor cars, and 151,503 available leader-relative coordinates. There were **zero invariant violations** for stable identity, duplicate identity, live-rank ordering, battle/field membership, battle/field live rank, adjacent neighbor identity, cumulative corridor offsets, or the shared leader-relative coordinate.

`liveRank` order legitimately differed from published `rank` order in 1,805 snapshots (836 Race 2; 969 Race 1). Inspection shows asynchronous handoffs where Race Control's `liveRank` changed before `rank`; F4 intentionally makes no visual-order claim based on the older rank field. Battle and field used the same live order from the same normalized payload in every audited snapshot.

Machine-readable evidence: [replay-consistency-proof.json](replay-consistency-proof.json).

## Browser and motion validation

The built UI was exercised against the real F3 replay database through the production API in read-only mode.

- **43-second coordinate proof:** 31 captured source timestamps/signatures; 211 changed and 150 unchanged consecutive driver-offset pairs. Changed offsets produced coordinate changes; unchanged offsets stayed still. Unjustified moves: 0. Missed moves: 0.
- **Connector coherence:** 0 geometry failures; maximum measured dot/connector/label x-center error 0.000137 px; 0 label-overlap frames; 0 overflow frames.
- **Stable chart identity/axes:** comparison set stayed `2086,2120,2143`; both charts reported `cumulative-live-gap-from-live-ranked-leader`; valid adaptive axes in 31/31 frames; no missing downstream points in this particular capture.
- **Startup:** one source sample, 13 corridor cars, 0 motion classes, 0 overflow. No arbitrary first-frame transition.
- **Route persistence:** history had 100 samples before leaving `/live` and 109 after returning. Session key, first timestamp, and driver IDs were unchanged; the store continued polling while another route rendered.
- **Event change:** Race 1's one-sample startup switched to an isolated one-sample Race 2 history. Every observed frame matched payload and history session identity; first new-session frame had 0 motion classes and no prior-session chart.
- **Mobile:** measured 469×1,055 CSS viewport, 0 horizontal overflow, 0 battle-label collisions, four adaptive time ticks, valid observed seconds domains for both charts.
- **Console:** a fresh final page load produced no console warnings or errors.

Evidence:

- [motion-coordinate-proof.json](motion-coordinate-proof.json)
- [route-persistence-proof.json](route-persistence-proof.json)
- [event-change-proof.json](event-change-proof.json)
- [mobile-layout-proof.json](mobile-layout-proof.json)
- [desktop battle and shared chart](screenshots/live-desktop.png)
- [mobile live screen](screenshots/live-mobile.png)

## Automated validation

| Check | Result |
| --- | --- |
| `npm run test:live-motion` | Pass — 56 model/unit assertions covering connectors, axes/domains, persistence, session isolation, de-duplication/order, missing segments, animation gates, and reduced-motion CSS |
| `npm run audit:live-f4:consistency -- --sqlite=... --out=...` | Pass — replay-wide proof above, read-only |
| `npm run test:live-replay` | Pass — 16 assertions |
| `npm run test:live-readiness` | Pass — 63 assertions |
| `npm run test:live-runner` | Pass — 43 assertions |
| `npm run test:ui-context-adapter` | Pass |
| `npm run analytics:view-models:validate` | Pass |
| `npm run api:smoke` | Pass |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass; Vite reports only the pre-existing >500 kB bundle advisory |
| `git diff --check` | Pass |

`npm run analytics:ui-data-package:validate` remains red on the unchanged F3 baseline because the committed generated package contains a stale source hash for unchanged `scripts/api-server.mjs`. F4 did not modify that source, package, or validator and did not regenerate an unrelated product-data artifact. This is the only validation deviation.

## Remaining limitations

- The API exposes no validated GPS/track coordinate. These charts show timing separation only.
- Cumulative `liveGap` is the closest truthful shared frame, but one unavailable upstream interval makes all downstream leader-relative coordinates unavailable for that sample. That is deliberately visible as a break.
- Row fields can be internally asynchronous at a single checked timestamp. The replay invariant proves F4 uses one payload consistently; it cannot make the upstream fields atomic.
- The in-memory store survives route remounts, not a browser process/document reload. It retains 300 source samples per session and four sessions to bound memory.
- The stable comparison cohort describes who was adjacent when the history began. If those drivers later leave the nearby battle, their identity is retained rather than silently replaced.
