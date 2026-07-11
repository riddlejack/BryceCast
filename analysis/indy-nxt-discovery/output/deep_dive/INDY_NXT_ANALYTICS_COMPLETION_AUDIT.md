# INDY NXT Analytics Completion And Adversarial Review

This review audits the INDY NXT analytics layer against source families available in the canonical career dataset and the generated analysis artifacts.

## Completion Matrix

| sourceFamily | sourceRows | analysisStatus | primaryArtifacts | auditConclusion |
| --- | --- | --- | --- | --- |
| race_results | 38 | complete | race_debrief_scores.csv | Core result, conversion, points, and status analysis. |
| full_field_results | 786 | complete | driver_strength_ratings.csv; field_strength_by_race.csv; team_context_by_year.csv | Full-field context, team context, and descriptive opponent strength. |
| practice_results | 49 | complete_source_bounded | prep_session_signals.csv | Practice is represented as rank context; no absolute pace claims. |
| qualifying_results | 1334 | complete_source_bounded | prep_session_signals.csv | Qualifying is used for start/prep context; group/combined caveats remain. |
| lap_samples | 30366 | complete_source_bounded | full_field_lap_dynamics_by_driver.csv | Full-field lap movement and volatility analysis with partial-chart caveats. |
| section_results | 37 | complete_source_bounded | section_results_deep_by_race.csv | Per-lap section percentiles with sparse-row suppression. |
| top_section_times | 38 | partial | section_results_deep_by_section.csv | Top-section facts were useful earlier; final pass favors per-lap section results. |
| event_summary_stats | 38 | complete | race_debrief_scores.csv | Cautions, passes, lead-change context folded into debrief scores. |
| leader_lap_summary | 37 | complete | leader_lap_context.csv | Leader entropy and dominance context. |
| incidents | 140 | complete | incident_penalty_context.csv | Incident exposure and type summaries. |
| penalties | 80 | complete | incident_penalty_context.csv | Penalty exposure and type summaries. |
| racecraft_events | 37 | complete_source_bounded | racecraft_context_by_race.csv | Official most-improved badges only; no inferred overtake log. |
| weather_observations | 104 | complete_context_only | race_debrief_scores.csv; future_weekend_prep_inputs.csv | Modeled non-official weather used as context, not causality. |
| future_schedule | 82 | complete_context_only | future_weekend_prep_inputs.csv | Future prep rows exclude forecast claims until current weather source is added. |
| pit_stop_counts | 38 | complete_low_signal | race_debrief_scores.csv | Pit counts are present but low-signal; no pit sequence/tire/service analysis exists. |
| telemetry_or_car_engineering | 0 | unavailable |  | No telemetry or engineering-root-cause data in canonical sources. |

## Structural Issues

| severity | issue | evidence | recommendedFix |
| --- | --- | --- | --- |
| medium | Derived race debrief labels are useful but not final copy. | 36 race labels are generated from thresholds and need manual source review before UI narrative copy. | Keep labels as internal archetypes; add source drawer and manual-review status in UI contract. |
| medium | Opponent strength uses same-sample outcomes. | 50 driver ratings use imported INDY NXT race rows with empirical shrinkage. | Use it as descriptive field context. Avoid predictive claims until a larger model with season controls is built. |
| medium | Weather is modeled and non-official. | INDY NXT official weather is unavailable; exact-window modeled rows exist for historical sessions. | Show weather as context and confidence state. Do not headline causal weather effects. |
| medium | Section rows have uneven density. | Sparse section-result sessions are preserved but suppressed from headline rankings below 50 comparison rows. | Keep the denominator visible on every section visualization. |
| high | Engineering claims are unsupported. | Team context has official result statuses but no telemetry, setup notes, reliability root-cause feed, or engineering logs. | Limit Ganassi analysis to result/team/status context unless new source-backed engineering evidence is added. |

## Remaining Partial Or Unavailable Areas

| sourceFamily | sourceRows | analysisStatus | auditConclusion |
| --- | --- | --- | --- |
| top_section_times | 38 | partial | Top-section facts were useful earlier; final pass favors per-lap section results. |
| pit_stop_counts | 38 | complete_low_signal | Pit counts are present but low-signal; no pit sequence/tire/service analysis exists. |
| telemetry_or_car_engineering | 0 | unavailable | No telemetry or engineering-root-cause data in canonical sources. |

## Final Assessment

- Race debrief coverage: 38 Bryce INDY NXT race rows.
- Driver strength context: 50 rated drivers.
- Championship progression rows: 38 race checkpoints.
- The analysis layer is broad enough for a UI contract after manual review of labels and section denominators.
- The main unsafe area is overclaiming causality: weather, team engineering, and opponent strength must remain context unless new source families are added.

## Analyses Considered And Rejected For Now

- Causal weather regression: rejected because modeled weather plus small sample makes causal inference weak.
- Engineering reliability model: rejected because official result statuses do not expose engineering root causes.
- Pit strategy model: rejected because INDY NXT has counts only, not pit sequence, tire, service, or pit-time detail.
- Public scouting model: deferred because opponent strength needs more seasons and shrinkage before being fair as a public-facing claim.

## Agent Navigation Notes

- Use the bundled workspace Python for this analytics script in the current Codex environment; the machine default `python3` may not include numpy/pandas.
- Pit-stop counts are populated for all 36 Bryce INDY NXT race rows, but the source only supports count-level context.
- Team context is race-result based in the INDY NXT debrief layer; do not mix it with practice/qualifying session context without a visible grain label.
- Future weekend prep rows use historical same-track and track-type context only. Forecast weather needs a separate current-weather source before UI display.
