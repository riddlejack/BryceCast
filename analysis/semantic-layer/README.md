# analysis/semantic-layer — slice 1: loop-crossing extraction

The first lane to consume the cleared historical data lake. It normalizes the
2024–25 INDY NXT **RaceTools captures** into canonical timing tables
(`loop_crossings`, `laps`, `flags`, `classification`) and validates them along two
independent axes plus the Nashville loop-inventory proof.

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
npm run analytics:semantic-layer                 # build all per-session tables
npm run analytics:semantic-layer:finishing-order # axis (a) vs canonical
npm run analytics:semantic-layer:section-times   # axis (b) vs official PDFs
npm run analytics:semantic-layer:nashville       # the Nashville loop-inventory proof
npm run analytics:semantic-layer:validate        # lane gate (exits non-zero on failure)
```

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

See the lane report / commit history for the full tables and named deviations.
