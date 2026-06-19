# BryceCast Predictive Race Intelligence

This lane productizes existing BryceCast analytics into source-backed race
intelligence artifacts before frontend visual work resumes.

It reads generated analytics outputs from:

- `analysis/indy-nxt-discovery/output`
- `analysis/indy-nxt-discovery/output/deep_dive`
- `analysis/career-parity/output`
- `analysis/ui-contract`
- generated career reports under `data/career/reports`

It writes only under `analysis/predictive-race-intelligence/output`.

## Commands

Use the npm command for normal productization runs. It preflights `numpy` and
`pandas`, then builds and validates the lane.

```bash
npm run analytics:predictive-race-intelligence
```

The command uses `BRYCECAST_ANALYTICS_PYTHON` when set, otherwise the bundled
workspace Python when present, otherwise `python3`. If neither available Python
has the scientific packages, install:

```bash
python3 -m pip install -r analysis/predictive-race-intelligence/requirements.txt
```

Direct script runs are still useful for focused debugging:

```bash
/Users/example/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 analysis/predictive-race-intelligence/scripts/build_predictive_race_intelligence.py
/Users/example/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 analysis/predictive-race-intelligence/scripts/validate_predictive_race_intelligence.py
```

## Outputs

- `output/analytics_inventory_registry.json`: canonical inventory of productized,
  context-ready, analyst-only, deferred, and blocked analytics.
- `output/career_prior_matrix.csv`: full-career, parity-aware priors.
- `output/indy_nxt_feature_matrix.csv`: 36-row INDY NXT race feature matrix
  with leakage labels.
- `output/model_scorecard.json`: baseline and candidate model backtests with
  product-use rules.
- `output/context-packs/`: source-backed packs for upcoming events, race
  debriefs, Career Lab, and live race-day readiness.
- `output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md`: reader-facing synthesis.
- `output/charts/`: analysis chart artifacts for model and prior inspection.

## Product Rules

- No point predictions from the current small INDY NXT sample.
- Full-career data can inform priors, but INDY NXT controls target-domain race
  intelligence.
- Pre-race models cannot use post-race outcome, lap, section, team-outcome,
  incident, penalty, or archetype fields.
- Live race trend analytics remain blocked until active INDY NXT replay proof
  exists.
- UI work should consume context packs or runtime APIs, not raw analytics CSVs.
