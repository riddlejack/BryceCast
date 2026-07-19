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

## Slice 2 — design notes (do NOT build here)

Slice 2 extends the same table shapes to the **Timing71 2026 replays** and adds the
**identity crosswalk**. Design intent, not implementation:

1. **Timing71 rows** carry `sourceTier: timing71_normalized`. Timing71 exposes
   reconstructed display-state frames (running order, gaps, sectors, laps, pits,
   flags) at a 1–2 s cadence — an *event-observation* grain with real archive
   timestamps, never interpolated. Loop-crossing grain is not directly available;
   the crosswalk maps Timing71 sector/lap observations onto the same `laps`/`flags`
   tables, with `loop_crossings` left sparse (or absent) for 2026 until/unless a
   loop-level source appears.
2. **Identity crosswalk** (the correctness gate for any 2026 UI use, per the ledger):
   a committed, validated per-`(season, event, session)` map of
   `(car number, source name string) → canonical driverId`, built from decoded
   segment rosters. It must be event-scoped (car numbers are reused across seasons —
   #14 Pierson→de Tullio, #28 Hauger→Taylor), tolerate name-format divergence
   ("JM Correa" vs "Juan Manuel Correa" vs `driver_juan_manuel_correa`), fail hard on
   unmatched/ambiguous entries, and be human-reviewed once per season. Silent-failure
   modes to guard: stale rosters at recording boundaries, mid-season car swaps, and
   cross-series number collisions inside a single recording (a car #9 that is Bryce in
   the NXT segment and a different driver in an adjacent INDYCAR segment).
3. **Unification**: with the crosswalk, `laps`/`flags`/`classification` unify across
   `racetools_capture` (2024–25 loop-grain) and `timing71_normalized` (2026 event-grain)
   under one `driverId`, so downstream consumers read one interface with a per-row
   `sourceTier` (the adapter-contract law: v2 swaps sources with no UI rework).
