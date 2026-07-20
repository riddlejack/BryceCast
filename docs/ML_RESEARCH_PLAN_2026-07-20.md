# ML Research Plan — Caution Hazard + Pace Backbone (2026-07-20)

Written by Fable (director) for a long-running Codex gpt-5.6-sol session at
xhigh/max effort, launched by Jack via /goal. This document is the complete
brief: mission, data, method, gates, and the exact shape of what comes back.
Read `docs/EXECUTION_CHARTER_2026-07-20.md`, `docs/DATA_PERMISSIONS.md`, and
`docs/PHASE3_EXECUTION_CHARTER_2026-07-18.md` Addenda 1–4 before any code.

## Mission

Two research lanes, one calibration culture:

- **Lane 1 — Caution hazard.** An experimental model of full-course-yellow
  onset ("FCY within the next lap / next 60 seconds while green") for INDY
  NXT races, trained on 16 years of INDYCAR + Indy Lights/NXT cautions at
  the same venues. Output: a calibrated, abstention-capable hazard estimate
  with honest uncertainty — never a prediction product until it earns it.
- **Lane 2 — Pace & field-strength backbone.** A hierarchical pace model
  across the same 16 years that puts real uncertainty bars under the
  field-strength framing the site already uses descriptively (driver/team/
  season/venue effects on green-flag pace).

Both lanes are RESEARCH. Nothing reaches the UI without (a) the calibration
gates below, (b) Fable's model-output gate, (c) Jack's sign-off. The site's
no-unvalidated-probabilities law is absolute for the duration.

## Data inventory (all local, all permissioned — see DATA_PERMISSIONS.md)

- **The historical data lake** (`analysis/historical-data-lake/` in the a534
  worktree; 7.1 GB raw, content-addressed): RaceTools replay logs for 2024–25
  NXT full weekends (1s heartbeats + event-driven `$S` timing-loop crossings
  + `$P` position variants for four telemetry seasons 2020–23) and 2008–2023
  INDYCAR/Lights annual archives; Timing71 display-state replays covering
  2026 races 1–12 (1–2s state grain, NO loop crossings — recon 2026-07-19).
- **The semantic layer** (`analysis/semantic-layer/`): normalized loop
  crossings, laps, flag states, located incidents, pit events with quality
  masks; 98/98 validation checks green; lap numbering pit-lane-corrected
  (master @ f15549c+). Use THIS, not raw logs, wherever it covers a session.
- **Canonical career dataset** (`data/career/career.dataset.json`): official
  results, lap charts (29,519 official position samples), caution-summary
  causal incident rows from official PDFs, penalties, section results.
- **Our own capture** (read-only sqlite, `file:...?immutable=1` URI —
  `-readonly` fails on this host): 1s full-field state snapshots for
  Mid-Ohio 2026 onward. Ground truth for any 2026 validation.
- **Official incident messages** in RaceTools logs carry millisecond
  timestamps and turn numbers — these are the LABEL source for incident
  time and location, NOT the flag-state transitions (see leakage, below).

Known defects to mask, never impute silently: IMS'25 P1 gap, Mid-Ohio'25
race 7-minute gap, Milwaukee'25 quali gap (replacements pending).

## Lane 1 — Caution hazard

### Formulation
Discrete-time hazard. Unit of observation: (race, green-flag second) or
(race, green-flag lap) — build BOTH grains, compare honestly. Target:
FCY onset within the next 60s (second grain) / next lap (lap grain).
Right-censor at checkered flag; exclude laps already under caution or
restart transients (first 2 green laps after a restart are their own
regime — model them with an indicator, don't drop them).

### The leakage traps (each has bitten a real project — engineer against them)
1. **C2 flag-lag leakage:** the flag state flips AFTER the physical incident.
   Any feature computed in the window between incident time (millisecond
   message) and flag time is contaminated. Label time = INCIDENT time from
   official/RaceTools incident messages; all features must be computed from
   data strictly BEFORE incident time, with an explicit embargo buffer
   (test 5s/10s/30s sensitivity).
2. **Pit-cycle confounding:** pit windows change gaps and ranks without
   racing meaning; pit-phase features must come from the semantic layer's
   pit events, not inferred from position jumps.
3. **Season/venue leakage in splits:** never split within a race. Primary
   split: leave-one-SEASON-out. Secondary: leave-one-VENUE-out. Report both.
4. **Class imbalance vanity:** ~72 NXT episodes + pooled INDYCAR/Lights
   cautions at shared venues. Report base rates alongside every metric.

### Features (descriptive, computable pre-incident, no driver blame)
Field compression (pairs within 1.0s, pack covered-time), restart recency,
laps since green, lap-time variance trends, traffic density around lapped
cars, venue caution priors (the Brief J stage-1 atlas is the descriptive
twin — build it as a byproduct), series indicator, field size, race
fraction elapsed. NO named-driver features of any kind — the model must be
structurally incapable of assigning blame.

### Model ladder (stop at the first rung that calibrates)
1. Venue-pooled empirical hazard curves (the honest baseline — may win).
2. Regularized logistic hazard with hierarchical venue/series partial pooling.
3. Gradient-boosted trees ONLY if (2) is materially beaten on held-out
   calibration, and with monotonicity constraints where physics demands.
No deep learning: n does not support it and interpretability is a gate.

### Calibration harness (the deliverable IS the harness)
- Reliability diagrams + Brier score + log-loss vs the empirical baseline,
  per split regime, with bootstrap CIs.
- **Abstention:** the model must emit "no signal" whenever its CI is wide;
  the abstention rule is part of the model spec, tuned on validation only.
- Acceptance gates for ANY promotion talk: beats venue-pooled baseline on
  Brier with CI excluding zero across BOTH split regimes; reliability slope
  within [0.8, 1.2]; abstention behavior verified on the 2026 holdout
  (races 13+ as they accrue, starting with Music City).
- If gates fail: the lane STOPS and reports. A well-documented negative
  result is a fully successful outcome of this plan.

## Lane 2 — Pace & field-strength backbone

Hierarchical mixed model on clean green-flag lap times from the semantic
layer: lap_time ~ venue + season + (1|driver) + (1|team/season) + fuel/tire
proxy (laps into stint where derivable) + traffic state. Fit with honest
ML machinery (REML/Bayesian — partial pooling is the point). Outputs:
- Driver/season pace effects WITH intervals, suitable for replacing the
  site's current descriptive field-strength framing (which claims ±0.05
  thresholds without formal uncertainty).
- A season-strength index per series-year (feeds The Graduates, Brief N,
  later — do not build N's UI here).
Validation: posterior predictive checks per venue; stability under
leave-one-season-out; comparison against known ground truths (champions'
effects should dominate; rookies' intervals should be wide). Same report
culture: intervals or it didn't happen.

## Operational contract

- Work in a fresh worktree branched from master (`git worktree add -b
  ml/research-lanes ...` from the ac78 canonical worktree). All code under
  `analysis/ml-research/` with its own README, validators, and
  reproducible entry points (`npm run ml:...` or python with pinned env).
- Read-only on every data source. The lake is read-only. The live-runtime
  checkout is untouchable. No network needed; everything is local.
- Deterministic: seeds pinned, environment recorded, every figure
  regenerable from one command.
- Compute is local (M-series Macs) — size methods accordingly.
- NO UI code, NO ui-data-package changes, NO CLAUDE.md edits. The output
  is research artifacts + the report.

## Report shape (the final message of the /goal run)

1. Data census actually used (sessions, laps, cautions, masks applied).
2. Lane 1: per-rung results, calibration plots (paths), gate verdicts,
   the abstention rule, and a plain-English paragraph a family member
   could read about what the model can and cannot say.
3. Lane 2: effect estimates with intervals for 2024–26 NXT drivers,
   season-strength indices, diagnostics.
4. Honest limits + what additional data would change (the RaceTools 2026
   logs question; CGR telemetry).
5. Deviations from this plan, every one.

Fable gates the report before anything moves toward the UI. Expected
wall-clock: days, not hours. Patience is the method.
