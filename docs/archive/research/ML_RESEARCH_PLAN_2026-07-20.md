> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# ML Research Plan v2 — Caution Hazard + Pace (2026-07-20, post-adversarial-review)

Written by Fable; REWRITTEN after the gpt-5.6-sol xhigh adversarial review
(verdict on v1: rewrite; full findings at
`~/.brycecast/reports/codex-results/ml-plan-review.md` — the executing agent
MUST read it alongside this plan; every fix below traces to it). Read also
`docs/archive/handoffs/EXECUTION_CHARTER_2026-07-20.md`, `docs/publication/DATA_PERMISSIONS.md`,
`analysis/historical-high-frequency-data-audit/YELLOW_FLAG_MODEL_FEASIBILITY.md`
and `FEASIBILITY_REPORT.md` (the audit's gates are binding).

## Structure: four SEPARATE gated goals, not one run

Jack fires these as separate /goal sessions in order; each has a hard stop
gate. A negative result TERMINATES the lane's computation (and is a fully
successful outcome), it does not merely block UI promotion.

---

## GOAL 0 — The census (blocking everything)

No model code until these artifacts exist, generated (not prose):

1. **Label/source census**: season × series × venue × race × source ×
   label-type table with label completeness, clock semantics, positive
   caution episodes, and per-race exclusion reasons. The "16 years of
   cautions" is a HYPOTHESIS to be tested by this census, not an input.
2. **Schema census** of the semantic layer as it actually exists
   (documented tables: session_meta, geometry, loop_crossings, laps, flags,
   classification — there is NO validated pit-event or located-incident
   table; treat both as unavailable).
3. **Session clock contract**: RaceTools local seconds-of-day (timezone
   unvalidated, midnight rollover) vs Timing71 UTC quantized 1–2s. Reject
   any session without a validated monotone mapping.
4. **Mask→action matrix**: for every quality-mask kind (header-only,
   mixed-session, full-day, heartbeat-gap, missing-flag, Timing71
   segmentation/thin) → exclude / truncate risk interval / retain with
   covariate / sensitivity-only. Applied before any feature generation.
5. **Labelability study** (the audit's prescribed 8–12-race experiment):
   for races with independently verifiable physical onset, estimate the
   incident→flag delay distribution and buffer sensitivity. HARD STOP for
   the sub-lap grain if delay cannot be bounded.

Data roots: repo-managed lake docs at `data/historical-data-lake/` (NOT
analysis/); pass the actual data root via `BRYCECAST_LAKE_DATA_ROOT`
(7,506,746,405 bytes). Compute benchmark: one-season fit with peak RAM,
wall time, convergence diagnostics, and an aggregation fallback, before
any full fit.

## GOAL 1 — Caution hazard (only after Goal 0 gates pass)

- **Primary estimand: next-lap FCY hazard.** Green stints as start–stop
  recurrent-event risk intervals; inference clustered by race; restart
  regime, red flags, aborted starts modeled explicitly. ~72 NXT positive
  episodes is the information count — never confuse row count with it.
- **Secondary (only if labelability passed + simulation-based power calc
  supports it): 10-second-landmark FLAG-ONSET hazard** — named honestly
  (flag decision, not physical onset). No per-second feature-rich model.
  No boosted trees at this n. Logistic hazard with preregistered, capped
  degrees of freedom; venue partial pooling with fold-internal priors and
  a specified unseen-venue backoff hierarchy (global → track type → venue).
- **INDYCAR/Lights = auxiliary data, transfer TESTED not assumed**:
  NXT-only vs fully pooled vs partially pooled, series-specific baselines,
  series×venue interactions; pooling adopted only if it beats NXT-only on
  NXT forward holds.
- **All-cause FCY primary endpoint**; cause composition preregistered;
  cause-specific analyses as sensitivity only.
- **Features**: as-of contract (source time, observation kind, transform
  version, availability time per feature); freshness/age carried — 1s
  serialization is NOT synchronous measurement; risk intervals truncated
  at source gaps, never forward-filled. NO pit-phase features in v1. No
  named-driver features ever. Loop-grain features are a 2024–25-only
  experiment (Timing71 2026 has no sub-lap loops); the source-common model
  uses lap/display-state features so 2026 can evaluate it.
- **Splits**: forward-chaining primary (train old → validate next → test
  newest eligible); whole-race grouping everywhere; venue-support matrix
  published; recurrent-venue vs unseen-venue performance reported
  separately; source-regime and post-May-2026 policy-regime strata
  reported; LOSO demoted to a stability diagnostic.
- **Gates (preregistered)**: signed ΔBrier / Brier skill vs the
  fold-internal venue-pooled baseline with RACE-CLUSTER bootstrap CIs and
  a preregistered minimum improvement; calibration intercept + slope with
  event-bootstrap intervals (no naked 0.8–1.2 window); log loss, AUPRC,
  false alerts per green hour, lead time, precision at a fixed alert
  budget. **Abstention operationally defined** by three conditions:
  unsupported source/feature state, out-of-support covariates, bootstrap
  predictive uncertainty above a preregistered bound — tuned once on
  validation; coverage and per-venue/source abstention reported.
- **2026+ own-capture races are SHADOW evaluation only**; promotion timing
  set by a simulated required-event count, not a calendar date.

## GOAL 2 — Pace model, v1 scoped to 2024–26 NXT

- Corpus: the ACTUAL current volume (~57k RaceTools + ~18k Timing71 lap
  rows). Sparse REML is the primary machinery; Bayesian only on
  aggregated driver×stint/session summaries if used at all.
- **Identifiability first**: build the driver ↔ team-season bipartite
  graph + design-matrix rank BEFORE fitting. Where separation is weak,
  fit a single entrant effect, or report driver-only and team-only
  sensitivity fits — never both as independently measured.
- Specification: driver-SEASON effects (not `(1|driver)` career
  intercepts), event/session effects, car-session or stint effects,
  residual autocorrelation handled (or block-resampled aggregates).
  Source-common covariate set only; source-specific extras as sensitivity
  models with missingness indicators.
- Outputs named honestly: "pace deviations conditional on the model and
  observed context" — no causal or responsibility language. Validation by
  held-out lap prediction, within-driver transfers, posterior predictive
  checks. Champion association reported post hoc only, never a gate.
- Cross-series/era "field strength" is OUT OF SCOPE for v1: without an
  anchor (repeat drivers, graduates, common configurations, or an explicit
  transition model) the estimand is within-season competitive compression,
  and must be called that.

## GOAL 3 — 16-year semantic expansion (separate ETL program, later)

Decoding + identity crosswalk + team mapping + track-config mapping +
lap-time parity checks for 2008–2023, season by season, each with a row
census. Only after this exists can Goals 1–2 extend beyond 2024–26.

## Standing rules for every goal

Fresh worktree from master (`ml/...` branches); code under
`analysis/ml-research/` with validators + one-command reproducibility;
read-only on all data (sqlite via immutable URI); no UI, no package, no
CLAUDE.md changes; seeds pinned; deterministic. Report shape per goal:
census/artifacts produced, per-gate verdicts with intervals, honest limits,
a family-legible paragraph on what the result can and cannot say, and
Deviations. Fable gates every report; Jack + Fable sign-off before anything
approaches the UI. Negative results are deliverables.
