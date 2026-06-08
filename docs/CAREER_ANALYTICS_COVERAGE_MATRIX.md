# Career Analytics Coverage Matrix

Generated: 2026-06-08T15:13:45.361Z

This report is generated from the canonical dataset and importer reports. It covers the production analytics window starting with 2019 FRP F1600 and running through current 2026 INDY NXT. Pre-2019 karting remains narrative/context only.

## Status Definitions

- complete: Canonical coverage is internally consistent for the category in this series/source family.
- partial: Some source-backed coverage exists, but comparable rows or sessions are incomplete or held out.
- blocked: The category is expected or high-value, but exact source evidence/import logic is missing or source-broken.
- unavailable: Current official source family does not expose this category consistently enough to require it.
- out_of_scope: Category is outside the production analytics scope for this series/source family.

## Series Summary

| Series | Years | Events | Sessions | Priority Gaps | Open Gap IDs |
| --- | ---: | ---: | ---: | --- | --- |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | 5 | 52 | grid_start_positions, exact_session_windows | gap_froc_2024_round_4_date_conflict, gap_froc_2024_session_times_missing, gap_froc_2024_start_positions_partial |
| Euroformula Open | 2023 | 7 | 28 | none | gap_euroformula_2023_championship_classification_pdf_current_mismatch |
| F1600 Championship Series | 2019 | 7 | 37 | penalties_decisions | gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch |
| Formula Ford | 2020 | 7 | 46 | grid_start_positions, lap_samples, penalties_decisions | none |
| GB3 Championship | 2021, 2022 | 15 | 116 | grid_start_positions, official_weather_conditions, pit_stop_counts | gap_gb3_2022_session_1248_missing_json |
| IMSA WeatherTech SportsCar Championship | 2025 | 1 | 1 | none | none |
| INDY NXT | 2024, 2025, 2026 | 45 | 189 | exact_session_windows, lap_samples, indy_section_data, detailed_pit_context | gap_indy_nxt_qualifying_lap_reports |

## Category Matrix

| Series | Events and sessions | Race/heat classifications | Qualifying classifications | Grid/start positions | Exact session windows | Track metadata | Official weather/track conditions | Lap samples | INDY NXT section data | Penalties/decisions | Incidents/cautions | Racecraft summary | Pit-stop counts | Detailed pit context | Derived benchmarks |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Castrol Toyota Formula Regional Oceania Championship | complete | complete | complete | partial | partial | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked |
| Euroformula Open | complete | complete | complete | complete | complete | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked |
| F1600 Championship Series | complete | complete | complete | unavailable | complete | complete | unavailable | unavailable | unavailable | partial | unavailable | unavailable | unavailable | unavailable | blocked |
| Formula Ford | complete | complete | complete | partial | complete | complete | complete | partial | unavailable | partial | unavailable | unavailable | unavailable | unavailable | blocked |
| GB3 Championship | complete | complete | complete | partial | complete | complete | partial | unavailable | unavailable | unavailable | unavailable | unavailable | partial | unavailable | blocked |
| IMSA WeatherTech SportsCar Championship | complete | complete | unavailable | unavailable | complete | complete | complete | complete | unavailable | unavailable | unavailable | unavailable | complete | unavailable | blocked |
| INDY NXT | complete | complete | complete | complete | partial | complete | unavailable | partial | partial | complete | complete | complete | complete | blocked | blocked |

## Season Diagnostics

| Series | Year | Events | Sessions | Race Rows | Qual Sessions | Exact Window Sessions | Grid/Start Race Rows | Pit-Stop Count Rows | Lap-Sample Sessions | Weather Sessions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | 5 | 52 | 246 | 11 | 43/52 | 229/246 | 0/246 | 0 | 0 |
| Euroformula Open | 2023 | 7 | 28 | 178 | 7 | 28/28 | 178/178 | 0/178 | 0 | 0 |
| F1600 Championship Series | 2019 | 7 | 37 | 315 | 6 | 36/36 | 0/315 | 0/315 | 0 | 0 |
| Formula Ford | 2020 | 7 | 46 | 782 | 14 | 46/46 | 760/782 | 0/782 | 24 | 46 |
| GB3 Championship | 2021 | 7 | 39 | 369 | 14 | 39/39 | 369/369 | 0/369 | 0 | 39 |
| GB3 Championship | 2022 | 8 | 77 | 513 | 8 | 77/77 | 0/513 | 513/513 | 0 | 0 |
| IMSA WeatherTech SportsCar Championship | 2025 | 1 | 1 | 236 | 0 | 1/1 | 0/236 | 236/236 | 1 | 1 |
| INDY NXT | 2024 | 14 | 68 | 274 | 34 | 0/68 | 274/274 | 274/274 | 14 | 0 |
| INDY NXT | 2025 | 14 | 66 | 272 | 33 | 0/66 | 272/272 | 272/272 | 14 | 0 |
| INDY NXT | 2026 | 17 | 55 | 192 | 28 | 37/55 | 192/192 | 192/192 | 8 | 0 |

## Recommended Patch Order

1. audit_and_patch_indy_nxt_detail_categories: INDY NXT is the richest and most UI-relevant source family. Lap charts, section data, penalties, cautions, racecraft, and pit-stop counts are already present; detailed pit context remains blocked unless official report availability is confirmed.
2. patch_froc_grid_and_exact_test_windows_where_source_exists: FROC has known partial grid/start and exact test-window gaps. Date-only article context is present; exact times should stay null until official timing evidence appears.
3. resolve_or_preserve_gb3_2022_source_broken_rows: GB3 2021 is strong; GB3 2022 has one official manifest session with a row-level JSON 404 and broader start/grid asymmetry versus 2021.
4. harden_formula_ford_lap_and_grid_diagnostics: Formula Ford 2020 has rich official PDFs, but grid rows and Bryce-only lap-analysis continuation pages remain partial by parser confidence.

## Official Canceled Sessions

| Session | Evidence | Files |
| --- | --- | --- |
| session_indy_nxt_2024_6489 | Qualifications - Cancelled                                                                                                         September 14, 2024 | data/career/raw/indy-nxt/report-details/2024-6489-section_results.layout.txt, data/career/raw/indy-nxt/report-details/2024-6489-top_section_times.raw.txt |
| session_indy_nxt_2025_6596 | Qualifications - Canceled | data/career/raw/indy-nxt/report-details/2025-6596-section_results.layout.txt, data/career/raw/indy-nxt/report-details/2025-6596-top_section_times.raw.txt |

## Notes By Series

### Castrol Toyota Formula Regional Oceania Championship
- Grid/start positions: partial. 229/246 race/heat rows have gridPosition or startPosition.
- Exact session windows: partial. 43/52 physical sessions have clock-time starts; 43/52 have at least date-level starts.
- Official weather/track conditions: unavailable. 0/52 sessions have official weather/track-condition observations.
- Lap samples: unavailable. 0 sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.
- INDY NXT section data: unavailable.
- Penalties/decisions: unavailable. 0 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Pit-stop counts: unavailable. 0/246 race/heat result rows have pit-stop counts.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### Euroformula Open
- Official weather/track conditions: unavailable. 0/28 sessions have official weather/track-condition observations.
- Lap samples: unavailable. 0 sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.
- INDY NXT section data: unavailable.
- Penalties/decisions: unavailable. 0 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Pit-stop counts: unavailable. 0/178 race/heat result rows have pit-stop counts.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### F1600 Championship Series
- Grid/start positions: unavailable. 0/315 race/heat rows have gridPosition or startPosition.
- Official weather/track conditions: unavailable. 0/37 sessions have official weather/track-condition observations.
- Lap samples: unavailable. 0 sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.
- INDY NXT section data: unavailable.
- Penalties/decisions: partial. 2 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Pit-stop counts: unavailable. 0/315 race/heat result rows have pit-stop counts.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### Formula Ford
- Grid/start positions: partial. 760/782 race/heat rows have gridPosition or startPosition.
- Lap samples: partial. 24 sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.
- INDY NXT section data: unavailable.
- Penalties/decisions: partial. 4 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Pit-stop counts: unavailable. 0/782 race/heat result rows have pit-stop counts.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### GB3 Championship
- Grid/start positions: partial. 369/882 race/heat rows have gridPosition or startPosition.
- Official weather/track conditions: partial. 39/116 sessions have official weather/track-condition observations.
- Lap samples: unavailable. 0 sessions have lap samples; Formula Ford rows are Bryce-only labeled lap-analysis samples.
- INDY NXT section data: unavailable.
- Penalties/decisions: unavailable. 0 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Pit-stop counts: partial. 513/882 race/heat result rows have pit-stop counts.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### IMSA WeatherTech SportsCar Championship
- One-event sports-car slice until additional official Bryce IMSA starts are confirmed.
- Qualifying classifications: unavailable. 0 result-bearing qualifying sessions; qualifying classifications may live in results for PDF source families. 0 schedule-only future sessions and 0 official canceled qualifying sessions excluded from result completeness.
- Grid/start positions: unavailable. 0/236 race/heat rows have gridPosition or startPosition.
- INDY NXT section data: unavailable.
- Penalties/decisions: unavailable. 0 sessions have official penalty/decision rows.
- Incidents/cautions: unavailable. 0 sessions have official incident/caution rows.
- Racecraft summary: unavailable. 0 race sessions have official most-improved/racecraft summary rows.
- Detailed pit context: unavailable.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

### INDY NXT
- Exact session windows: partial. 37/189 physical sessions have clock-time starts; 189/189 have at least date-level starts.
- Official weather/track conditions: unavailable. 0/189 sessions have official weather/track-condition observations.
- Lap samples: partial. 36/36 completed race sessions have lap-chart samples; 26 charts fully validate and 10 are clean partial visible-sample imports.
- INDY NXT section data: partial. 146/146 comparable Top Section reports parsed after excluding 1 official canceled session; 145/146 comparable Section Results reports parsed after excluding 1 official canceled session. True held-outs: session_indy_nxt_2024_6325 (official_pdf_has_no_extractable_text).
- Detailed pit context: blocked. INDY NXT has official/API pit-stop counts, but no detailed pit-summary or pit-lane sequence importer yet.
- Derived benchmarks: blocked. 0 non-report derived metrics exist for this series. Teammate/field-strength analytics are not production-ready yet.

