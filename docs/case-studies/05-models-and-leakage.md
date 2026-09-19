# Models, negative controls, and leakage

The predictive workbench is most useful as a record of model discipline. It retains weak results, failed candidates, and a deliberately invalid high-performing model rather than presenting the best-looking number as a forecast.

## Problem

INDY NXT race history is small, features arrive at different points in the weekend, and post-race context can easily leak the answer. A model that includes team finish outcomes can look excellent while being unusable before the race. Comparisons can also become misleading when one feature family reduces the eligible sample.

## Method

The [model scorecard](../../analysis/predictive-race-intelligence/output/model_scorecard.json) records feature set, target, validation method, leakage status, sample size, absolute error, and allowed product use for every candidate. Finish-percentile models use leave-one-race-out evaluation. Top-10 experiments use Brier score, but remain diagnostics without adequate calibration evidence.

Promotion gates require a relevant out-of-sample baseline, no post-race leakage, visible denominator and source family, calibration before probability claims, and full-career source eligibility. Weather and field-strength features remain analyst-only without validated incremental value. The narrative contract is in the [research report](../../analysis/predictive-race-intelligence/output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md), and the longer-horizon requirements are in the [ML research plan](../ML_RESEARCH_PLAN_2026-07-20.md).

The scorecard's prose still names an older 36-row sample. The current model rows and [coverage summary](../../analysis/predictive-race-intelligence/output/summary.json), both generated 2026-09-11, are authoritative: the completed INDY NXT race universe is 45, with smaller cohorts where features are absent.

## Evidence by comparable cohort

Comparisons stay within a common `n`:

**45-race cohort.** The constant overall-mean baseline has MAE **0.217**. Track-type mean has MAE **0.206**. Start-position ridge has MAE **0.202** and is the strongest pre-race-safe candidate in this cohort, but is allowed only as an internal context band. A season-mean control has MAE **0.229** and is marked non-time-aware.

**43-race cohort.** Candidates requiring qualifying context include qualifying-rank ridge at MAE **0.227**, start-plus-qualifying ridge at **0.208**, track/start/qualifying ridge at **0.209**, and field-context ridge at **0.213**. These absolute errors describe the shared 43-row cohort; they should not be turned into blanket percentage lifts against the 45-row baseline. The post-race team-context ridge reaches MAE **0.175**, the lowest stored error in this cohort, and is rejected for post-race leakage.

**34-race cohort.** Practice-plus-qualifying ridge has MAE **0.216**; a five-neighbor version has MAE **0.218**. The more complex neighbor model did not improve on the ridge candidate within the same eligible rows.

The 45-race top-10 diagnostics tell a similar story. The overall-rate baseline has Brier **0.250**, the track-type rate **0.243**, and the non-time-aware season rate **0.283**. None is promoted: the scorecard requires calibration evidence, not a small numerical difference alone.

The section-transfer research independently records weak historical associations: practice section median versus finish percentile has Pearson `r=0.198` at `n=36`; qualifying section median has `r=0.160` at `n=44`. The artifact labels both historical backtests, not forecasts. See the [section deep-dive summary](../../analysis/indy-nxt-section-lap-deep-dive/output/summary.json).

## Result and limits

The workbench supports source-bounded historical bands, paths, and analog races. It does not support a public point forecast or calibrated finish/top-10/win probability. The apparent winner is a leakage control, qualifying alone underperforms within its cohort, and race-week features do not establish robust lift. A future model must pass forward, calibration, source-regime, and review gates before product promotion.
