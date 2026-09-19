# analysis/semantic-layer — canonical timing tables over the historical lake

The first lane to consume the cleared historical data lake.

- **Slice 1** normalizes the 2024–25 INDY NXT **RaceTools captures** into canonical
  timing tables (`loop_crossings`, `laps`, `flags`, `classification`) and validates
  them along two independent axes plus the Nashville loop-inventory proof.
- **Slice 2** normalizes the 34 currently validated **Timing71 2026 replays** to the same
  shapes (event-observation grain) and builds the **identity crosswalk** — the
  correctness gate for any 2026 lake data reaching the UI — validated against the
  audit's three trap classes plus a two-source cross-check vs BryceCast's own
  live capture.

Nothing here is user-visible and nothing ships: this lane is upstream of both the
lake→master merge and any UI. All rows are labelled `sourceTier: racetools_capture`
per the permissions ledger. See [`SCHEMA.md`](SCHEMA.md) for the table shapes,
time semantics, quality-mask vocabulary, and slice-2 design notes.

## Data access

Raw bytes live **only** in the git-ignored lake archive. The durable default is
`~/.brycecast/data-lake`; override it only when intentionally using another lake:

```bash
export BRYCECAST_LAKE_DATA_ROOT="$HOME/.brycecast/data-lake"
# validation references (read-only), also env-overridable:
#   BRYCECAST_CAREER_DATASET  -> data/career/career.dataset.json
#   BRYCECAST_SECTION_OBS     -> analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv
```

Only `raw/` is read (content-addressed, immutable). The lake `catalog/` is **not**
read or depended on; sessions are enumerated directly from the self-describing
`raw/views` tree (`.L` filename suffix = INDY NXT). This keeps the lane independent
of catalog regeneration.

## Commands

```bash
# slice 1 (RaceTools 2024-25)
npm run analytics:semantic-layer                 # build all per-session tables
npm run analytics:semantic-layer:finishing-order # axis (a) vs canonical
npm run analytics:semantic-layer:section-times   # axis (b) vs official PDFs
npm run analytics:semantic-layer:nashville       # the Nashville loop-inventory proof
# slice 2 (Timing71 2026 + crosswalk)
npm run analytics:semantic-layer:timing71        # build 2026 event-grain tables
npm run analytics:semantic-layer:crosswalk       # build the identity crosswalk
npm run analytics:semantic-layer:crosswalk:validate # traps + two-source + GO/NO-GO
# gate
npm run analytics:semantic-layer:validate        # lane gate (exits non-zero on failure)
```

The capture cross-check input (`output/cross-check/capture-final-states.json`)
is regenerated with `node analysis/semantic-layer/extract-capture-states.mjs
--db <APFS clone of data/live/brycecast.sqlite>`; make the clone with `cp -c`
(instant, copy-on-write, no lock contention) and NEVER read the live runtime
during a race window.

## Outputs

```
output/
  loop-crossings-summary.json          # compact index over all 143 sessions
  sessions/<id>.ndjson.gz              # per-session grain (crossings/laps/flags/classification)
  validation/finishing-order.json      # axis (a)
  validation/section-time-residuals.json # axis (b)
  nashville/loop-inventory.json        # the verdict
  nashville/<id>.intervals.ndjson.gz   # full per-lap per-car unpublished interval set
```

## Storage choice

Per-session grain is committed as gzipped NDJSON (level 9): **~42 MB** total for all
143 sessions × 2.6 M crossings — well under the lane's <100 MB budget — plus a
~240 KB summary index. Full grain is deterministically regenerable from raw via
`build-loop-crossings.mjs`, so the pack/summary pattern keeps the committed footprint
small while still shipping the complete grain.

## Results (headline)

- **Nashville proof: YES.** Both 2024 and 2025 Nashville NXT race feeds carry 8
  physical timing loops (SF, T1, SS1, T2, BS, T3, SS2, T4) tiling the whole lap into
  8 fine sub-sections — the feed publishes far more than the **3** official track
  sections (which cover ~43.8% of the lap). The tables contain the unpublished ~56%;
  the heat-map blanks can be filled from RaceTools capture. ~9k interval rows/race.
- **Axis (a):** winner + podium derived from crossings match canonical **28/28**;
  full finishing order exact **19/28**; lap counts cars-exact **513/538** (~95%),
  within-1 **533/538**; feed-classification cross-check **27/28**. The exact-order
  and lap-count gains come from the **pit-lane lap-numbering alignment**: a lap
  completed through the pit lane crosses the pit start/finish line (`SFP`, distance
  0), not the mainline S/F, so counting only mainline crossings dropped a lap per
  pit stop. The `laps` table now counts both S/F-plane crossings (with the same
  3 s de-dup); `isLapBoundary` on the emitted crossing rows stays mainline-only so
  the finishing-order derivation is unchanged. Residual lap-count drift is confined
  to caution/red-flag laps race control resolves with its own yellow-lap accounting.
- **Axis (b):** derived full-lap section times reproduce the official PDF per-lap
  "Lap" time to **0.0000 s** (median) for **21/25** races; residuals are confined to
  caution/red-flag/pit laps. Nashville's 3 published sub-sections map to feed spans
  within ~0.08–0.10 s median.
- **Slice 2 — Timing71 2026:** all 44 sessions decode with max-lap agreement
  **44/44** vs the audit coverage matrix; race classification matches canonical
  exactly for **16/17** races — the 17th
  (Road America R2) is a capture-confirmed as-raced vs official divergence
  (post-race DQ of the on-road winner).
- **Identity crosswalk:** **44/44** sessions fully mapped, zero ambiguous/unmapped,
  all event-scoped. All audit trap classes are covered by explicit tests.
  Two-source cross-check vs our own capture: identity **100%** on all 10
  overlapping sessions.
- **GO/NO-GO:** **43 GO / 1 CONDITIONAL / 0 NO-GO** (the CONDITIONAL is Road
  America R2's as-raced vs official-DQ semantics, by design) —
  `output/crosswalk/crosswalk-validation.json`.

See the lane report / commit history for the full tables and named deviations.
