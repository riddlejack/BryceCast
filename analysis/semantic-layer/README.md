# analysis/semantic-layer — canonical timing tables over the historical lake

The first lane to consume the cleared historical data lake.

- **Slice 1** normalizes the 2024–25 INDY NXT **RaceTools captures** into canonical
  timing tables (`loop_crossings`, `laps`, `flags`, `classification`) and validates
  them along two independent axes plus the Nashville loop-inventory proof.
- **Slice 2** normalizes the 33 validated **Timing71 2026 replays** to the same
  shapes (event-observation grain) and builds the **identity crosswalk** — the
  correctness gate for any 2026 lake data reaching the UI — validated against the
  audit's three trap classes plus a two-source cross-check vs BryceCast's own
  live capture.

Nothing here is user-visible and nothing ships: this lane is upstream of both the
lake→master merge and any UI. All rows are labelled `sourceTier: racetools_capture`
per the permissions ledger. See [`SCHEMA.md`](./SCHEMA.md) for the table shapes,
time semantics, quality-mask vocabulary, and slice-2 design notes.

## Data access

Raw bytes live **only** in the git-ignored lake archive. Point at it via an env var
(a documented absolute default is baked in):

```bash
export BRYCECAST_LAKE_DATA_ROOT="/Users/.../a534/Bryce POV access/data/historical-data-lake"
# validation references (read-only), also env-overridable:
#   BRYCECAST_CAREER_DATASET  -> data/career/career.dataset.json (ac78)
#   BRYCECAST_SECTION_OBS     -> analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv (ac78)
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
  full finishing order exact **11/28**; lap counts within-1 **~93%**; feed-classification
  cross-check **27/28**.
- **Axis (b):** derived full-lap section times reproduce the official PDF per-lap
  "Lap" time to **0.0000 s** (median) for **21/25** races; residuals are confined to
  caution/red-flag/pit laps. Nashville's 3 published sub-sections map to feed spans
  within ~0.08–0.10 s median.
- **Slice 2 — Timing71 2026:** all 33 sessions decode with max-lap agreement
  **33/33** vs the audit coverage matrix; race classification matches canonical
  exactly (positions **24/24** and lap counts **24/24**) for **11/12** races — the 12th
  (Road America R2) is a capture-confirmed as-raced vs official divergence
  (post-race DQ of the on-road winner).
- **Identity crosswalk:** **33/33** sessions fully mapped, zero ambiguous/unmapped
  (31 strict event scope; the 2 pre-race Nashville 2026 sessions via labelled
  season fallback). All three audit trap classes covered by explicit tests.
  Two-source cross-check vs our own capture: identity **100%** on all 9
  overlapping sessions, laps exact on 201/202 car-results.
- **GO/NO-GO:** **30 GO / 3 CONDITIONAL / 0 NO-GO** —
  `output/crosswalk/crosswalk-validation.json`.

See the lane report / commit history for the full tables and named deviations.
