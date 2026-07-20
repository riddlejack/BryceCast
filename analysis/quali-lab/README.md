# Quali & Practice Lab — run-by-run qualifying timeline (Brief M, first slice)

The Friday-signal-deepening foundation. For every INDY NXT qualifying session
2024–2026 the semantic layer covers, one question: **how did his qualifying
build?** — Bryce's laps in session order, his best-lap staircase, when the
session's fastest lap settled, and where his qualifying landed.

## The two-substrate discipline (never blended within a number)

- **The run-by-run BUILD** — laps, the best-lap staircase, the session-best
  evolution — comes **only from the semantic layer** (its strength: lap grain).
- **The final RANK** — on-track group rank and combined grid position — comes
  **only from the canonical official qualifying classification**
  (`qualifyingResults`), per the semantic-layer SCHEMA law: *"UI classification
  must always come from canonical results."*

## Sources

- `analysis/semantic-layer/output/sessions/*.ndjson.gz` — 2024–25 **RaceTools**
  loop-crossing grain (`sourceTier: racetools_capture`).
- `analysis/semantic-layer/output/sessions-2026/*.ndjson.gz` — 2026 **Timing71**
  event grain (`sourceTier: timing71_normalized`).
- `analysis/semantic-layer/output/crosswalk/crosswalk-validation.json` +
  `identity-crosswalk-2026.json` — the 2026 correctness gate and identity.
- `data/career/career.dataset.json` — canonical `qualifyingResults` / `sessions`
  / `events` (rank, grid, field size, gap to pole). Override with
  `BRYCECAST_CAREER_DATASET`.

## Source tiers on screen (the ledger's labelling law)

Every session carries its tier and a plain label: **"RaceTools race-weekend
capture"** (2024–25) or **"third-party normalized (Timing71)"** (2026). Neither
is official timing — derived analytics over third-party captures.

## The 2026 crosswalk gate

Every 2026 Timing71 session is included **only** if its identity crosswalk
verdict is `GO` (`crosswalk-validation.json`). All 9 covered 2026 qualifying
sessions are GO; the verdict rides each session and is named on screen. A
non-GO session is excluded and listed in the census.

## Method

1. **Identify Bryce.** 2024–25: the "Bryce Aron" classification row (his car
   number varies — #27 in 2024, #9 in 2025, #39 at St Pete 2025). 2026: the
   validated crosswalk mapping (`driver_bryce_aron` → car).
2. **His group is the capture that holds his laps.** Road/street weekends split
   the field into two groups; a Group 2 capture also lists the combined
   classification but carries laps only for Group 2 cars. The session where
   Bryce has timed laps is his on-track session; the duplicate combined-only
   capture is excluded (`no_bryce_laps`).
3. **Build the run.** Laps in crossing-clock order; the best-lap staircase is
   the running minimum. `isFirstRacingLap` partials (measured from the
   start-line instant — an implausibly fast lap 1) never count as the best;
   session-start / red-flag crossing-clock artifacts (`> best × 2.5`) are
   dropped from the run and counted (`droppedNoiseLaps`).
4. **Session best.** The fastest full flying lap among all lap-holders in the
   capture, with when it moved (`sessionBestSteps`) and whether Bryce held it.
5. **Rank from canonical.** The event joins by (year, venue→track); 2026 uses
   the crosswalk's `canonicalEventId` directly. The group-component row gives
   the on-track group rank + group field; the Combined row gives the grid
   position + full field + gap to pole (an oval's single row is grid-setting).
   **Doubleheaders** (two group rows per weekend) are attributed to the race
   whose official best lap matches the captured best flying lap — the 2024–25
   attributions are then confirmed by the feed-position cross-check below.

## Validation (`validate_quali_lab.mjs`, exit-coded)

- **2026 crosswalk gate** — every 2026 session is verdict `GO` (hard).
- **Join-correctness invariant** — for RaceTools **road** sessions the feed
  classification position equals the canonical group rank (21/21 match). Ovals
  are advisory: the oval feed carries capture-time running order, not the
  official aggregate (Nashville 2025 diverges — canonical wins).
- **Staircase** — running best monotonic non-increasing and equal to the run
  minimum; gap-to-session-best internally consistent.
- **Validation axis** — captured best flying lap vs canonical official best
  (road). ~0 confirms the capture holds his fastest lap; a moderate gap
  (max 0.81 s, Detroit 2024) is a capture miss of one lap and is advisory — the
  UI headlines the official best. An egregious residual (> 1.5 s) is fatal
  (partial artifact / wrong join).

## Coverage census (`output/coverage-census.json`)

31 covered (2024: 11 RaceTools · 2025: 11 RaceTools · 2026: 9 Timing71),
5 excluded:

- 4× `no_bryce_laps` — Group 2 combined-classification captures whose lap grain
  lives in the Group 1 capture (Mid-Ohio 2024, Barber 2025, Mid-Ohio 2025,
  Laguna 2025). The Group 1 capture is the covered session for those weekends.
- 1× `no_canonical_qualifying_classification` — **Nashville 2024**: no official
  Bryce qualifying row in the canonical dataset, so the rank is unverifiable.
  The run exists but the session is held out rather than shown without an
  authoritative rank.

## Outputs

```
output/
  context-packs/quali-lab-context.json   # the UI context pack (id: quali_lab_run_by_run)
  coverage-census.json                    # covered + excluded (with reasons)
  tables/quali_lab_sessions.csv           # flat review table (denominators, ranks, tiers)
```

## Adapter-contract law (sized for the full Lab)

The pack shape carries `trafficContext`, `theoreticalBestSeconds`, and
`trackEvolutionCurve` as null v2 fields. A later lake-grain producer fills the
same shape (traffic on quali laps, theoretical-best composites, track-evolution
curves) with **no UI rework** — the surface reads this one interface.

## Commands

```bash
npm run analytics:quali-lab            # build
npm run analytics:quali-lab:validate   # validate (exit non-zero on failure)
```
