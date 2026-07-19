# Semantic layer — canonical schema (slice 1)

The semantic layer normalizes historical timing captures into canonical per-session
tables. Slice 1 covers the **2024–25 INDY NXT RaceTools captures**; slice 2 (design
notes at the end) adds Timing71 2026 and the identity crosswalk.

Every row carries `sourceTier`. Nothing here is an official BryceCast fact — these
are derived analytics over immutable third-party captures, per the permissions
ledger (`docs/DATA_PERMISSIONS.md`).

## Source-tier vocabulary (the ledger's labelling law)

| tier | meaning |
| --- | --- |
| `racetools_capture` | third-party capture of the sanctioning series' pit-lane timing feed (RaceTools). **All slice-1 rows.** |
| `timing71_normalized` | third-party normalized display-state replay (Timing71). *slice 2.* |
| `official_timing_document` | official published Section Results / lap charts (used only as a validation reference here, never emitted as a row). |
| `brycecast_capture` | BryceCast's own one-second Race Control capture. *not in this lane.* |

## Time semantics (read before using timestamps)

The authoritative crossing clock is **local seconds-of-day** (`timeOfDaySeconds` =
raw `$S` time-of-day ticks ÷ 10,000). The 0.0001 s tick scale is the Wave-0 audit's
verified inference (99.4% of `$S` records align within 1 s of the adjacent
one-second heartbeat, and full-lap section times reproduce official PDFs to
0.0000 s — see `output/validation/section-time-residuals.json`).

The feed heartbeat epoch (`$H`) is retained only as a coarse **date anchor**
(`dateAnchorEpoch`); its encoded timezone is **not validated** and does not align
with the local crossing clock, so it must never be rendered as UTC without a
track/session timezone join. This is the same caveat the lake readers carry.

## Tables

Per-session grain is one gzipped NDJSON pack per session under
`output/sessions/<sessionId>.ndjson.gz`, with a `record` discriminator. A compact
index over all sessions is `output/loop-crossings-summary.json`.

### `session_meta` (one row/pack)
`id, year, date, venue, event, sessionType, sessionCode, sessionLabel, series, access, sourceTier, qualityMasks`.
`sessionType ∈ {race, qualifying, practice, warmup, test, other}`. `series = INDY_NXT`.

### `geometry` (one row/pack)
Static timing geometry decoded from the feed's `$T`/`$U` records.
`venue, trackType, lapBoundarySection, lapBoundarySections[], sectionCount, sections[], loopDistances{}`.
- `sections[]`: `{name, startLoop, endLoop, lengthUnits}` — each named section spans
  `startLoop → endLoop`; the `$S` crossing for a section is emitted when the car
  crosses its **end loop**.
- `lapBoundarySections`: mainline sections whose end loop is the S/F line
  (usually one; venues with an alternate S/F line — e.g. St Petersburg — have two).
- `loopDistances{}`: cumulative distance (feed units, ~1/12 ft) of each loop
  around the lap; the S/F loop is at 0.

### `loop_crossings` — `loop_crossing` records (the grain)
One row per `$S` named section/timing-loop crossing.

| field | meaning |
| --- | --- |
| `car` | car number (feed) |
| `lapIndex` | per-car lap index (increments at each S/F-line crossing; 1-based) |
| `sectionLabel` | feed section label (e.g. `S1`, `S2A`, `I3`, `T2`) |
| `endLoop` / `startLoop` | the physical loops this section spans (from geometry) |
| `timeOfDaySeconds` | crossing time at the end loop, local seconds-of-day (÷10,000 tick) |
| `sectionSeconds` | feed-reported traversal time of this section (÷10,000 tick) |
| `feedPosition` | running position stamped on the crossing record |
| `isLapBoundary` | true when this crossing is an S/F-line lap completion |
| `dateAnchorEpoch` | nearest preceding `$H` epoch (date anchor only; tz unvalidated) |
| `sourceTier` | `racetools_capture` |

### `laps` — `lap` records
Per car, per completed racing lap, derived from S/F-line crossings.

| field | meaning |
| --- | --- |
| `car`, `lap` | car number, racing lap number (1-based, after the start) |
| `startTimeOfDaySeconds` / `endTimeOfDaySeconds` | S/F crossing bounds (local) |
| `lapSeconds` | full lap time = S/F→S/F crossing delta (matches official "Lap") |
| `sfSectionSeconds` | the feed's own duration for the final S/F section (audit aid) |
| `positionAtSF` | running position stamped on the S/F crossing that closed the lap |
| `isFirstRacingLap` | lap 1, measured from the start-line instant (may be partial) |

Lap counting excludes formation, start-line, and cool-down crossings; the checkered
lap is detected as the cool-down participation cliff. Absolute counts can differ
from official `lapsCompleted` by ±1 on start/cool-down/timed/red-flag procedure the
official system resolves with pit/timed logic; order is unaffected (see below).

### `flags` — `flag` records
Green/yellow/red/checkered intervals from `$A`/`$M` messages (precise local clock +
incident reason), cross-checked with `$F` state records.
`{state, startTimeOfDaySeconds, endTimeOfDaySeconds, reason, sourceTier}`.
`state ∈ {green, yellow, red, checkered, white}`. `reason` carries the feed's incident
text (e.g. "Contact: Cars 2 and 3 in Turn 3") when present.

### `classification` — `classification` records
The feed's own final classification per car (`$O` preferred, `$C` fallback): a
completeness cross-check, **not** a crossing derivation.
`{car, position, laps, totalTimeSeconds, statusCode, classified, firstName, lastName, team, source, sourceTier}`.
`classified = ($O status field == 4)`.

## Quality-mask semantics

Masks annotate; they never hide. A masked session still ships all its rows plus the
reason. Vocabulary aligned to the Wave-0 audit's known-defect classes:

| mask | meaning |
| --- | --- |
| `log_header_only` | the `.log` is a session header only, no timing (e.g. 2025 IMS P1; Timing71 supplies it) |
| `mixed_session_requires_segmentation` | >1 session header / multiple series in one capture; needs segmentation |
| `full_day_capture` | a capture spanning >6 h (a day-capture published under a session label; e.g. the contaminated 2025 IMS Race 1 duplicate) |
| `heartbeat_gap` | a sanitized heartbeat gap ≥120 s (e.g. a red-flag stoppage or recorder dropout); implausible epochs are dropped per audit Condition 3 |
| `no_green_flag_detected` / `no_checkered_flag_detected` | a race capture missing the expected flag transition |

Validation excludes `log_header_only`, `mixed_session_requires_segmentation`, and
`full_day_capture` from the clean-race checks (they are known-defective captures) and
lists them separately; `heartbeat_gap` alone is a valid race and kept.

## Validation (two independent axes)

- **(a) `output/validation/finishing-order.json`** — winner/podium/order/lap counts
  derived from the crossing tables vs canonical `career.dataset.json`.
- **(b) `output/validation/section-time-residuals.json`** — Bryce's section times
  (differences of his crossing timestamps) vs parsed official Section Results.
- **Nashville proof** — `output/nashville/loop-inventory.json` + per-race interval packs.

## Slice 2 — Timing71 2026 event-grain + the identity crosswalk (BUILT)

Slice 2 extends the same canonical shapes to the **33 validated 2026 Timing71
replays** (selected by the audit-validated coverage matrix committed on this
branch at `data/historical-data-lake/catalog/coverage-2024-through-today.csv`)
and builds the **identity crosswalk**.

### Timing71 2026 tables (`output/sessions-2026/<id>.ndjson.gz` + `output/timing71-2026-summary.json`)

Every row carries `sourceTier: timing71_normalized`. Grain is EVENT OBSERVATION
at real archive timestamps (`observedAtEpoch`, UTC epoch seconds, 1-2 s cadence,
no interpolation) — a different clock domain from slice 1's local seconds-of-day.

- `session_meta` / `roster` — identity as displayed by the source (car, name
  string, team), plus the recording description and quality masks.
- `lap` — a car's Laps counter incrementing between frames: `{car, lap,
  endObservedAtEpoch (quantized), lapSeconds (the state's own precise "Last"
  lap time), positionAtSF (running order at the increment), lapDelta}`.
- `loop_crossing` — the same events as S/F-only crossings (`sectionLabel: LAP`,
  `endLoop: SF`, `quantized: true`). No sub-lap loop grain exists in this source.
- `sector_observation` — S1/S2/S3 completions where the display carries sector
  values (road-course practice/quali; race displays carry only styling flags).
- `flag` — `session.flagState` transitions with observed timestamps.
- `classification` — the final NXT-segment frame's running order (see caveat
  below: this is the AS-DISPLAYED final state, not official classification).

Additional masks: `cross_session_recording_segmented` (NXT session extracted
from a recording that also holds an adjacent INDYCAR session; the parser ends
the segment at the field-wide lap-counter reset — the stale-roster hazard),
`thin_capture`, `sparse_lap_observation`, `no_bryce_roster_segment`.

### The identity crosswalk (`output/crosswalk/identity-crosswalk-2026.json`)

Per 2026 session: `(car number, source name string) -> canonical driverId`,
**event-scoped**. The number join proposes candidates; the name check disposes
(exact / `given_prefix` "Seb~Sebastian" / `given_initials` "JM~Juan Manuel" /
suffix-tolerant families "de Alba Jr"). Statuses: `mapped_exact`,
`mapped_name_variant`, `mapped_swap_resolved` (mid-season same-car driver swaps
— #76 Allaer/Escotto, #15 Stati/Sundaramoorthy — resolved by name),
`mapped_season_scope` (event has no canonical results yet, e.g. the pre-race
Nashville 2026 weekend; never a strict UI GO), `ambiguous` / `unmapped` (HARD
failures — nothing passes silently).

Validation (`validate-crosswalk.mjs`, artifact `crosswalk-validation.json`):
the three audit trap classes as explicit test cases (same-season name variants;
season-to-season number reuse #14/#27/#28 plus every other reused number;
cross-series recordings where #9 is two different drivers), Timing71 final
order vs canonical for all 12 races, a TWO-SOURCE cross-check vs BryceCast's
own capture (official Race Control feed, `output/cross-check/`) for every
overlapping session, and a GO / CONDITIONAL / NO-GO verdict per session.

**Classification caveat (proven by the gate):** Timing71's final state is the
as-crossed order. Road America R2 2026 diverges from canonical because #14 de
Tullio was disqualified post-race (canonical P23) after winning on the road —
both live sources agree 24/24 with each other. UI classification must always
come from canonical results; the timing/lap/identity tables remain valid.

### Unification (slice 3+, not built)

With the crosswalk, `laps`/`flags`/`classification` unify across
`racetools_capture` (2024-25 loop grain) and `timing71_normalized` (2026 event
grain) under one `driverId`, so downstream consumers read one interface with a
per-row `sourceTier` (the adapter-contract law: v2 swaps sources with no UI
rework). The variant name rules are the carrier for joining 2024-25 RaceTools
name strings ("Juan Manuel Correa") to the same driverIds.
