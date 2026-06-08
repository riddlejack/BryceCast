# INDY NXT UI Analytics Contract

This contract defines the stable analytics modules the UI should consume. Each module has an explicit grain, artifact, source state, and display rule so the app can stay caveat-aware.

| module | grain | primaryArtifact | sourceState | uiReadiness | displayRule |
| --- | --- | --- | --- | --- | --- |
| Race Debrief Score | one Bryce INDY NXT race | race_debrief_scores.csv | derived_from_official_results_lap_chart_sections_and_modeled_weather | ready_after_manual_label_review | Show as debrief card with source/caveat drawer; keep archetype as reviewable label. |
| Prep Funnel | race event | prep_session_signals.csv | official_api_session_results | ready | Show practice and qualifying as context signals with session-format caveat. |
| Full-Field Lap Dynamics | race and driver-race | full_field_lap_dynamics_by_race.csv; full_field_lap_dynamics_by_driver.csv | official_lap_chart | ready_with_partial_chart_badges | Use inverted lap-position trace plus percentile badges; expose lap-chart completeness. |
| Team Context | race and team-season | team_context_by_race.csv; team_context_by_year.csv | official_results | ready_descriptive_only | Show result context only; no engineering-root-cause language. |
| Track-Type Profile | track type | race_track_type_summary.csv | official_results_derived_summary | ready | Use as compact comparison panel and upcoming-race prep context. |
| Future Weekend Prep | future event | future_weekend_prep_inputs.csv | schedule_plus_historical_results | ready_no_forecast | Show historical same-track and track-type context; future weather remains unavailable until separate forecast source is added. |
| Weather Context | session/race | race_debrief_scores.csv | modeled_non_official | ready_context_only | Visually secondary context strip; no causal performance claims. |
| Source/Caveat State | every metric/module | indy_nxt_source_family_audit.csv; all module CSVs | mixed_explicit | ready | Every stat must expose source state and caveat drawer entry. |
| Opponent Strength Context | driver and race | driver_strength_ratings.csv; field_strength_by_race.csv | official_results_empirical_bayes | ready_descriptive_only | Use as field-quality context; suppress predictive/scouting language. |
| Championship Progression | season race checkpoint | championship_progression.csv | official_results_points_progression | ready | Use as season arc timeline and race weekend stakes context. |

## Contract Rules

- Every displayed metric must carry a source state, confidence or readiness label, and caveat when applicable.
- Derived labels are internal analytics labels until manually reviewed.
- Modeled weather is context only.
- Team context cannot imply engineering root cause without new source-backed engineering data.
- Sparse section samples and partial lap charts must show denominators.
