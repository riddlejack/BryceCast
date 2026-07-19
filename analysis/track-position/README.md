# analysis/track-position — pass placement over the loop-crossing tables

The lane that locates every position change in Bryce Aron's 2024–25 INDY NXT
races to the **between-loop interval** where it happened, from the semantic
layer's validated timing-loop crossings. Analysis only — no UI. A director gate
reviews the accuracy report (`output/validation/accuracy.json`) before anything
renders.

Nothing here is an official BryceCast fact. Every row carries
`sourceTier: racetools_capture` (a third-party capture; derived analytics only).

## The idea, and the one thing the feed does NOT give us

Track position is fully determined by timing-loop crossings: order the field by
crossing time at each physical loop and you have the running order at that loop;
a pair of cars whose relative order flips between two consecutive loops was
overtaken **in that between-loop interval**.

The RaceTools `$S` records carry **no live running order** — their position
field is the constant **starting-grid seed** (verified: each car holds a single
value the whole race, equal to its grid slot). So running order and passes here
are derived **geometrically from the crossing timestamps**, never read from the
feed. This is exactly the grain the method wants.

Bryce's car number is **not** hardcoded: it is #27 (2024), #39 (2025 St Pete),
and #9 (rest of 2025). He is resolved **by name** (Aron) from each session's
classification records — the number is per-session.

## Method

Per race (`lib/pass-placement.mjs`):

1. **Gates.** The mainline physical end-loops that tile the lap, ordered by
   cumulative loop distance (S/F at 0). Pit loops (PI/PO/SFP) are excluded — they
   carry only pitting cars. Multiple named sections can end at the same physical
   loop; those are de-duplicated to one crossing per car/lap/gate.
2. **Snapshots.** Within each lap the chronological gate chain is
   `[S/F-start, inter-gates…, S/F-end]` (S/F bounds come from the semantic laps
   table). Ordering the cars by crossing time at each snapshot gives the running
   order there.
3. **Passes.** A pairwise relative-order flip between two consecutive snapshots
   is a pass, bracketed to `[loopA → loopB]` and labelled with the official loop
   names from the crossings tables. Each pass is classed:
   - `on_track_green` — the headline class (green flag, neither car pitting),
   - `pit_cycle` — either car pitted that lap,
   - `caution` — the lap overlaps a yellow/red interval,
   - `start_lap` — lap 1 (the standing-start shuffle),
   - `unresolved` — lap context missing.
   These classes are **never mixed**; pit-cycle and caution reshuffles are
   labelled as such.
4. **Located-incident candidates.** For each official incident (lap + car), the
   between-loop interval where the mentioned car lost the most time versus its own
   green median that lap — descriptive only. The official turn text stays the
   authority for *where*; the interval is the data-derived companion.

Placement language is always "between the `<A>` and `<B>` loops". No
sub-interval precision, no GPS/proximity, no causal copy.

## Validation (`validate-pass-placement.mjs`) — the credibility step

Three axes, then a **GO / CONDITIONAL / NO-GO** verdict per race and overall:

- **(a) Stable-set S/F closure (the stated GO bar, ≥97%).** Among cars fully
  observed through a green, non-pit lap (all mainline gates present), the change
  in S/F running order is reproduced *exactly* by the located passes — the pass
  ledger balances (no pass lost or double-counted). Near-construction; expected
  ~100%.
- **(a′) Strict field closure (transparency).** The same check over every green
  non-pit car in the full field. Its shortfall from 100% is **field-attrition**
  — a car leaving the running order (pit/retirement) shifts everyone behind it by
  one place with no on-track pass — counted as an unresolved event, not a
  detector error.
- **(b) Lap-chart agreement (the external accuracy claim).** My per-lap S/F order
  vs the **official lap chart** (canonical `lapSamples`, all 28 races). Reported
  as **pairwise order concordance** (fraction of car-pairs whose relative order
  matches — drift-robust) and exact-position match, at a single disclosed global
  lap-index offset. Exact match is degraded by the semantic layer's known ±1
  per-car lap-count drift on pit/caution laps (one misplaced car cascades a rank
  shift); pairwise concordance isolates true order error. **The verdict is
  driven by concordance.**
- **(c) Incident cross-check.** Fraction of official incidents (lap + car) for
  which a between-loop slowdown candidate was located.

## Headline results (28 clean races)

- **Verdict: 26 GO · 2 CONDITIONAL · 0 NO-GO.** The 2 conditionals are
  lapping-heavy ovals (Iowa 2024, Iowa 2025) where pairwise concordance is
  95.8–96.5% — the running order agrees, but exact per-lap rank is limited by
  inherited **caution/red-flag** lap-count drift on a handful of cars (Iowa 2024
  #23; Iowa 2025 #3, #39), which race control resolves with its own yellow-lap
  bookkeeping that raw crossings cannot replicate. Portland 2025 was promoted to
  GO by the semantic layer's pit-lane lap-numbering alignment (see below); its
  concordance rose from 92.83% to 100.00%.
- **Pit-lane lap-numbering alignment (upstream fix).** The semantic layer now
  counts a lap completed **through the pit lane** — a crossing of the pit
  start/finish line (`SFP`, cumulative distance 0, the pit twin of the mainline
  S/F) — toward each car's lap number, not just mainline S/F crossings. A car
  that pits otherwise drops one lap in the count from that stop onward and runs a
  lap behind the official lap chart for the rest of the race; this was the sole
  cause of Portland 2025's CONDITIONAL and a large share of the drift elsewhere.
  The alignment corrects 119 car lap-counts across the 28 races (axis (a)
  cars-exact rose 11→19 races full-order-exact; lap-count cars-exact to
  513/538), with zero verdict regressions.
- **Stable-set closure: 100.00%** (17,966 green car-laps) — the ledger balances.
- **Strict field closure: 98.27%** (18,884 green car-laps) — the ~1.7% residual
  is field-attrition (now including correctly-counted pit re-entries), confirmed
  by the stable-set 100%.
- **Pairwise concordance vs the official lap chart: 99.65% mean** (≥98% on 26/28,
  ≥95.8% on all).
- **Incidents located: 21/45** — a descriptive-only signal (many official
  incidents are minor offs with no lasting slowdown).

The one contaminated capture (2025-05-10 IMS R1, a `full_day_capture`
duplicate) is excluded, leaving the 28 clean races; see `excludedCaptures` in
the summary.

## Commands

```bash
npm run analytics:track-position           # build per-race packs + summary
npm run analytics:track-position:validate  # closure + lap-chart + incidents + GO/NO-GO
```

## Data access

- **Input:** the semantic layer's committed loop-crossing packs
  (`analysis/semantic-layer/output/sessions/*.ndjson.gz`) — the only data source
  for the extraction. This lane does not read raw lake bytes.
- **Ground truth (read-only, validation):** the canonical career dataset
  (`data/career/career.dataset.json` in the master worktree; override with
  `BRYCECAST_CAREER_DATASET`) — the official per-lap lap chart (`lapSamples`),
  incidents, and finishing results.

## Outputs

```
output/
  pass-placement-summary.json           # per-race index + excluded captures
  races/<feedId>.passes.ndjson.gz       # per-race grain (below)
  validation/accuracy.json              # the gate: per-race + overall metrics, verdicts
```

Per-race pack records: `race_meta` (Bryce car/driver, gates, pass totals by
class, Bryce green/all gains-losses), `pass` (every field pass with interval +
class), `bryce_pass` (every Bryce-involving change), `incident_candidate`
(located slowdowns cross-checked to official incidents), `bryce_position`
(per-lap derived + official S/F position). All 28 races: ~160 KB gzipped.

## Non-goals

No UI. No 2026 races (Timing71 carries no sub-lap loop grain). No probability of
anything. No GPS, between-loop precision, or causal claims.
