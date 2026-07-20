# Predictive Race Intelligence Productization Pass

Generated: `2026-07-20T09:25:42Z`
Repo head: `d987e85`

## Decision

BryceCast should promote a predictive race-intelligence workbench, not a point-forecast UI. Existing data supports source-bounded historical prior bands, top-10 paths, analog races, debrief explainers, and career priors. It does not yet support public betting-style finish predictions.

## Ground Truth Inventory

- Inventory items: `76`.
- Productization statuses: `{'analyst_only': 5, 'blocked': 4, 'context_pack_ready': 29, 'deferred': 2, 'productized': 36}`.
- INDY NXT feature rows: `41`.
- Career prior rows: `68`.
- Context packs: `{'career_lab': 1, 'live_race_day': 1, 'race_debrief': 41, 'upcoming_event': 4}`.

## Predictive Feasibility

- Overall finish-percentile baseline MAE: `0.218`.
- Best observed finish-percentile MAE: `0.207` from `start_position_ridge`.
- Any model using team outcome, lap, section, incident, penalty, or archetype fields is post-race only and barred from pre-race predictions.
- Top-10 grouped rates did not beat the base-rate Brier score in the first scorecard, so top-10 should stay as a path/probability-band concept.

## Portland International Raceway Intelligence

- `2024 Grand Prix of Portland`: start P6.0, finish P3.0, gain `3.0`, finish percentile `0.882`.
- `2025 Grand Prix of Portland`: start P5.0, finish P19.0, gain `-14.0`, finish percentile `0.053`.

The generated upcoming-event packs add top-10 path factors, analog races, prediction bands, and prep-update hooks. They intentionally avoid point predictions.

## Context Pack Surfaces

- Upcoming event packs: all 4 remaining INDY NXT events in the current future-prep window.
- Race debrief packs: all 41 analyzable Bryce INDY NXT races.
- Career Lab pack: series summary, metric-family parity, prior matrix, source-family rules.
- Live race-day pack: runtime boundary, replay quality, current local proof state, and blocked live proof gates.

## Validation Gates

- Every metric or artifact must map to one inventory item.
- Predictive claims must beat an appropriate baseline out of sample and pass leakage checks.
- Full-career priors must be metric-family eligible and source-family labeled.
- Live race trend analytics remain blocked until active INDY NXT replay proof exists.
- UI work should consume context packs or runtime APIs, not raw CSVs.

## Chart Artifacts

- `analysis/predictive-race-intelligence/output/charts/finish_percentile_model_mae.svg`
- `analysis/predictive-race-intelligence/output/charts/career_track_type_priors.svg`
- `analysis/predictive-race-intelligence/output/charts/upcoming_track_indy_nxt_history.svg`
