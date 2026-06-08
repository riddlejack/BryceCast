# Career Analytics Coverage Matrix

Generated: 2026-06-08T15:32:45.816Z

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
| F1600 Championship Series | 2019 | 7 | 37 | none | gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch |
| Formula Ford | 2020 | 7 | 46 | grid_start_positions, lap_samples | none |
| GB3 Championship | 2021, 2022 | 15 | 116 | none | gap_gb3_2022_session_1248_missing_json |
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

## Season Category Matrix

| Series | Year | Priority Gaps | Events and sessions | Race/heat classifications | Qualifying classifications | Grid/start positions | Exact session windows | Track metadata | Official weather/track conditions | Lap samples | INDY NXT section data | Penalties/decisions | Incidents/cautions | Racecraft summary | Pit-stop counts | Detailed pit context | Derived benchmarks |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | grid_start_positions, exact_session_windows | complete | complete | complete | partial | partial | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked |
| Euroformula Open | 2023 | none | complete | complete | complete | complete | complete | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked |
| F1600 Championship Series | 2019 | none | complete | complete | complete | unavailable | complete | complete | unavailable | unavailable | unavailable | partial | unavailable | unavailable | unavailable | unavailable | blocked |
| Formula Ford | 2020 | grid_start_positions, lap_samples | complete | complete | complete | partial | complete | complete | complete | partial | unavailable | partial | unavailable | unavailable | unavailable | unavailable | blocked |
| GB3 Championship | 2021 | none | complete | complete | complete | complete | complete | complete | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | blocked |
| GB3 Championship | 2022 | none | complete | complete | complete | unavailable | complete | complete | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | complete | unavailable | blocked |
| IMSA WeatherTech SportsCar Championship | 2025 | none | complete | complete | unavailable | unavailable | complete | complete | complete | complete | unavailable | unavailable | unavailable | unavailable | complete | unavailable | blocked |
| INDY NXT | 2024 | exact_session_windows, lap_samples, indy_section_data, detailed_pit_context | complete | complete | complete | complete | partial | complete | unavailable | partial | partial | complete | complete | complete | complete | blocked | blocked |
| INDY NXT | 2025 | exact_session_windows, lap_samples, indy_section_data, detailed_pit_context | complete | complete | complete | complete | partial | complete | unavailable | partial | partial | complete | complete | complete | complete | blocked | blocked |
| INDY NXT | 2026 | exact_session_windows, lap_samples, indy_section_data, detailed_pit_context | complete | complete | complete | complete | partial | complete | unavailable | partial | partial | complete | complete | complete | complete | blocked | blocked |

## Session Gap Diagnostics

This table lists sessions that still have partial or blocked coverage in that series priority categories. The JSON report contains all session/category rows.

| Series | Year | Event | Session | Type | Gaps |
| --- | ---: | --- | --- | --- | --- |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 1 - Taupo International Motorsport Park | Race 2 (session_froc_2024_r1_race_2) | race | grid_start_positions:partial |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 1 - Taupo International Motorsport Park | Test 1 (session_froc_2024_r1_test_1) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 1 - Taupo International Motorsport Park | Test 2 (session_froc_2024_r1_test_2) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 1 - Taupo International Motorsport Park | Test 3 (session_froc_2024_r1_test_3) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 3 - Hampton Downs Motorsport Park | Test 1 (session_froc_2024_r3_test_1) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 3 - Hampton Downs Motorsport Park | Test 2 (session_froc_2024_r3_test_2) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 4 - Euromarque Motorsport Park | Test 1 (session_froc_2024_r4_test_1) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 4 - Euromarque Motorsport Park | Test 2 (session_froc_2024_r4_test_2) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 5 - Highlands Motorsport Park | Race 2 (session_froc_2024_r5_race_2) | race | grid_start_positions:partial |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 5 - Highlands Motorsport Park | Test 1 (session_froc_2024_r5_test_1) | test | exact_session_windows:blocked |
| Castrol Toyota Formula Regional Oceania Championship | 2024 | FROC 2024 Round 5 - Highlands Motorsport Park | Test 2 (session_froc_2024_r5_test_2) | test | exact_session_windows:blocked |
| Formula Ford | 2020 | Champion of Brands 2020 | QUALIFYING - RACE 5 (session_formula_ford_2020_champion_brands_qualifying_race_5) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | Champion of Brands 2020 | RACE 11 (session_formula_ford_2020_champion_brands_race_11) | race | grid_start_positions:partial, lap_samples:partial |
| Formula Ford | 2020 | Champion of Brands 2020 | RACE 5 (session_formula_ford_2020_champion_brands_race_5) | race | grid_start_positions:partial, lap_samples:partial |
| Formula Ford | 2020 | The Champion of Cadwell for FF1600 2020 | QUALIFYING - RACE 2 (session_formula_ford_2020_champion_cadwell_qualifying_race_2) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | The Champion of Cadwell for FF1600 2020 | RACE 2 (session_formula_ford_2020_champion_cadwell_race_2) | race | lap_samples:partial |
| Formula Ford | 2020 | The Champion of Cadwell for FF1600 2020 | RACE 5 (session_formula_ford_2020_champion_cadwell_race_5) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | GRAND FINAL (RACE 21) (session_formula_ford_2020_festival_grand_final_race_21) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | HEAT 1 (RACE 4) (session_formula_ford_2020_festival_heat_1_race_4) | heat | lap_samples:partial |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | HEAT 2 (RACE 5) (session_formula_ford_2020_festival_heat_2_race_5) | heat | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | HEAT 3 (RACE 6) (session_formula_ford_2020_festival_heat_3_race_6) | heat | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | HISTORIC FINAL - RACE 17 (session_formula_ford_2020_festival_historic_final_race_17) | race | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | LAST CHANCE RACE (RACE 19) (session_formula_ford_2020_festival_last_chance_race_race_19) | race | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | QUALIFYING - HEAT 1 (RACE 4) (session_formula_ford_2020_festival_qualifying_heat_1_race_4) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | QUALIFYING - HEAT 2 (RACE 5) (session_formula_ford_2020_festival_qualifying_heat_2_race_5) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | QUALIFYING - HEAT 3 (RACE 6) (session_formula_ford_2020_festival_qualifying_heat_3_race_6) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | SEMI FINAL 1 (RACE 13) (session_formula_ford_2020_festival_semi_final_1_race_13) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC Formula Ford Festival 2020 | SEMI FINAL 2 (RACE 15) (session_formula_ford_2020_festival_semi_final_2_race_15) | race | lap_samples:blocked |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Brands Hatch | QUALIFYING - RACE 2 (session_formula_ford_2020_national_brands_hatch_qualifying_race_2) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Brands Hatch | RACE 11 (session_formula_ford_2020_national_brands_hatch_race_11) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Brands Hatch | RACE 18 (session_formula_ford_2020_national_brands_hatch_race_18) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Brands Hatch | RACE 2 (session_formula_ford_2020_national_brands_hatch_race_2) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Oulton Park | QUALIFYING - RACE 1 (session_formula_ford_2020_national_oulton_park_qualifying_race_1) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Oulton Park | RACE 1 (session_formula_ford_2020_national_oulton_park_race_1) | race | grid_start_positions:partial, lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Oulton Park | RACE 8 (session_formula_ford_2020_national_oulton_park_race_8) | race | grid_start_positions:partial, lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Silverstone International | QUALIFYING - RACE 3 (session_formula_ford_2020_national_silverstone_qualifying_race_3) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Silverstone International | RACE 3 (session_formula_ford_2020_national_silverstone_race_3) | race | lap_samples:partial |
| Formula Ford | 2020 | BRSCC National FF1600 2020 - Silverstone International | RACE 7 (session_formula_ford_2020_national_silverstone_race_7) | race | lap_samples:partial |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | GRAND FINAL (session_formula_ford_2020_wht_grand_final) | race | grid_start_positions:partial, lap_samples:partial |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 1 (session_formula_ford_2020_wht_heat_1) | heat | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 1 QUALIFYING (session_formula_ford_2020_wht_heat_1_qualifying) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 2 (session_formula_ford_2020_wht_heat_2) | heat | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 2 QUALIFYING (session_formula_ford_2020_wht_heat_2_qualifying) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 3 (session_formula_ford_2020_wht_heat_3) | heat | lap_samples:partial |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 3 QUALIFYING (session_formula_ford_2020_wht_heat_3_qualifying) | qualifying | lap_samples:partial |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 4 (session_formula_ford_2020_wht_heat_4) | heat | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | HEAT 4 QUALIFYING (session_formula_ford_2020_wht_heat_4_qualifying) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | LAST CHANCE RACE (session_formula_ford_2020_wht_last_chance_race) | race | grid_start_positions:partial, lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | PROGRESSION RACE (session_formula_ford_2020_wht_progression_race) | race | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | QUALIFYING - RACE 7 (session_formula_ford_2020_wht_qualifying_race_7) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | QUALIFYING - RACE 8 (session_formula_ford_2020_wht_qualifying_race_8) | qualifying | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | RACE 15 (session_formula_ford_2020_wht_race_15) | race | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | RACE 16 (session_formula_ford_2020_wht_race_16) | race | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | RACE 7 (session_formula_ford_2020_wht_race_7) | race | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | RACE 8 (session_formula_ford_2020_wht_race_8) | race | lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | SEMI FINAL 1 (session_formula_ford_2020_wht_semi_final_1) | race | grid_start_positions:partial, lap_samples:blocked |
| Formula Ford | 2020 | Walter Hayes Trophy 2020 | SEMI FINAL 2 (session_formula_ford_2020_wht_semi_final_2) | race | grid_start_positions:partial, lap_samples:partial |
| INDY NXT | 2024 | Grand Prix of Alabama | Race (session_indy_nxt_2024_6314) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | Race (session_indy_nxt_2024_6315) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix at Road America | Race (session_indy_nxt_2024_6316) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Race (session_indy_nxt_2024_6317) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Race (session_indy_nxt_2024_6318) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | INDY NXT by Firestone at Iowa Speedway | Race (session_indy_nxt_2024_6319) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | OUTFRONT Showdown | Race (session_indy_nxt_2024_6320) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix of Portland | Race (session_indy_nxt_2024_6321) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | INDY NXT By Firestone at The Milwaukee Mile | Race (session_indy_nxt_2024_6322) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Music City Grand Prix | Race (session_indy_nxt_2024_6323) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Race (session_indy_nxt_2024_6324) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 2 | Race (session_indy_nxt_2024_6325) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Detroit Grand Prix | Race (session_indy_nxt_2024_6326) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix of Monterey Race 2 | Race (session_indy_nxt_2024_6327) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Practice 1 (session_indy_nxt_2024_6328) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Practice 2 (session_indy_nxt_2024_6329) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Qualifications - Group 1 (session_indy_nxt_2024_6330) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Qualifications - Group 2 (session_indy_nxt_2024_6346) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Alabama | Practice 1 (session_indy_nxt_2024_6354) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Alabama | Practice 2 (session_indy_nxt_2024_6355) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Alabama | Qualifications - Group 1 (session_indy_nxt_2024_6356) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Alabama | Qualifications - Group 2 (session_indy_nxt_2024_6357) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | Practice (session_indy_nxt_2024_6365) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | Qualifications - Race 1 Group 1 (session_indy_nxt_2024_6366) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | Qualifications - Race 1 Group 2 (session_indy_nxt_2024_6367) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 2 | Qualifications - Race 2 Group 1 (session_indy_nxt_2024_6389) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 2 | Qualifications - Race 2 Group 2 (session_indy_nxt_2024_6390) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Detroit Grand Prix | Practice 1 (session_indy_nxt_2024_6391) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Detroit Grand Prix | Practice 2 (session_indy_nxt_2024_6392) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Detroit Grand Prix | Qualifications - Group 1 (session_indy_nxt_2024_6393) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Detroit Grand Prix | Qualifications - Group 2 (session_indy_nxt_2024_6394) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Road America | Practice 1 (session_indy_nxt_2024_6402) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Road America | Practice 2 (session_indy_nxt_2024_6403) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Road America | Qualifications - Group 1 (session_indy_nxt_2024_6404) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Road America | Qualifications - Group 2 (session_indy_nxt_2024_6405) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Practice 1 (session_indy_nxt_2024_6413) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Practice-2 (session_indy_nxt_2024_6414) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Qualifications - Race 1 Group 1 (session_indy_nxt_2024_6415) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Qualifications - Race 1 Group 2 (session_indy_nxt_2024_6416) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 2 | Qualifications - Race 2 Group 1 (session_indy_nxt_2024_6417) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Monterey Race 2 | Qualifications - Race 2 Group 2 (session_indy_nxt_2024_6418) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Practice 1 (session_indy_nxt_2024_6426) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Practice 2 (session_indy_nxt_2024_6427) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Qualifications - Group 1 (session_indy_nxt_2024_6428) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Qualifications - Group 2 (session_indy_nxt_2024_6429) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | INDY NXT by Firestone at Iowa Speedway | Practice (session_indy_nxt_2024_6437) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | INDY NXT by Firestone at Iowa Speedway | Qualifications (session_indy_nxt_2024_6438) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | OUTFRONT Showdown | Practice (session_indy_nxt_2024_6480) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | OUTFRONT Showdown | Qualifications (session_indy_nxt_2024_6481) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Music City Grand Prix | Practice 1 (session_indy_nxt_2024_6488) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Music City Grand Prix | Qualifications (session_indy_nxt_2024_6489) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Music City Grand Prix | Practice 2 (session_indy_nxt_2024_6490) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Portland | Practice 1 (session_indy_nxt_2024_6494) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Portland | Practice 2 (session_indy_nxt_2024_6495) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Portland | Qualifications - Group 1 (session_indy_nxt_2024_6496) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | INDY NXT By Firestone at The Milwaukee Mile | Practice (session_indy_nxt_2024_6505) | practice | exact_session_windows:partial |
| INDY NXT | 2024 | INDY NXT By Firestone at The Milwaukee Mile | Qualifications (session_indy_nxt_2024_6506) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of Portland | Qualifications - Group 2 (session_indy_nxt_2024_6513) | qualifying | exact_session_windows:partial |
| INDY NXT | 2024 | Grand Prix of St. Petersburg | Combined Qualifications (session_indy_nxt_2024_6536) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix of Alabama | Combined Qualifications (session_indy_nxt_2024_6537) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 1 | Combined Qualifications (session_indy_nxt_2024_6538) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Indianapolis Grand Prix Race 2 | Combined Qualifications (session_indy_nxt_2024_6539) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Detroit Grand Prix | Combined Qualifications (session_indy_nxt_2024_6540) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix at Road America | Combined Qualifications (session_indy_nxt_2024_6541) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix of Monterey Race 1 | Combined Qualifications (session_indy_nxt_2024_6542) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix of Monterey Race 2 | Combined Qualifications (session_indy_nxt_2024_6543) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix at Mid-Ohio | Combined Qualifications (session_indy_nxt_2024_6544) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2024 | Grand Prix of Portland | Combined Qualifications (session_indy_nxt_2024_6545) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Race (session_indy_nxt_2025_6442) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 2 | Race (session_indy_nxt_2025_6443) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Race (session_indy_nxt_2025_6444) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix of Alabama | Race (session_indy_nxt_2025_6445) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | Race (session_indy_nxt_2025_6446) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Music City Grand Prix | Race (session_indy_nxt_2025_6447) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | INDY NXT by Firestone at the Milwaukee Mile | Race (session_indy_nxt_2025_6448) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix of Portland | Race (session_indy_nxt_2025_6449) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix of Monterey Race 2 | Race (session_indy_nxt_2025_6450) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | INDY NXT by Firestone at Iowa Speedway | Race (session_indy_nxt_2025_6451) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Race (session_indy_nxt_2025_6452) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix at Road America | Race (session_indy_nxt_2025_6453) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | INDY NXT by Firestone at World Wide Technology Raceway | Race (session_indy_nxt_2025_6454) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Detroit Grand Prix | Race (session_indy_nxt_2025_6455) | race | exact_session_windows:partial, lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | Practice 1 (session_indy_nxt_2025_6515) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | Practice 2 (session_indy_nxt_2025_6516) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | Qualifications - Group 1 (session_indy_nxt_2025_6517) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of St. Petersburg | Qualifications - Group 2 (session_indy_nxt_2025_6518) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | INDY NXT by Firestone at the Milwaukee Mile | Qualifications (session_indy_nxt_2025_6588) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Combined Qualifications (session_indy_nxt_2025_6589) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 2 | Combined Qualifications - Race 2 (session_indy_nxt_2025_6590) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Combined Qualifications - Race 1 (session_indy_nxt_2025_6591) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Grand Prix of Alabama | Combined Qualifications (session_indy_nxt_2025_6592) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Music City Grand Prix | Qualifications (session_indy_nxt_2025_6593) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Portland | Combined Qualifications (session_indy_nxt_2025_6594) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Grand Prix of Monterey Race 2 | Combined Qualifications (session_indy_nxt_2025_6595) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | INDY NXT by Firestone at Iowa Speedway | Qualifications (session_indy_nxt_2025_6596) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Combined Qualifications (session_indy_nxt_2025_6597) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Grand Prix at Road America | Combined Qualifications (session_indy_nxt_2025_6598) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | INDY NXT by Firestone at World Wide Technology Raceway | Qualifications (session_indy_nxt_2025_6599) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Detroit Grand Prix | Combined Qualifications (session_indy_nxt_2025_6600) | qualifying | exact_session_windows:partial, indy_section_data:blocked |
| INDY NXT | 2025 | Grand Prix of Alabama | Practice 1 (session_indy_nxt_2025_6611) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Alabama | Practice 2 (session_indy_nxt_2025_6612) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Alabama | Qualifications - Group 1 (session_indy_nxt_2025_6613) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Alabama | Qualifications - Group 2 (session_indy_nxt_2025_6614) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Practice (session_indy_nxt_2025_6627) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Qualifications - Race 1 Group 1 (session_indy_nxt_2025_6628) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 1 | Qualifications - Race 1 Group 2 (session_indy_nxt_2025_6629) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 2 | Qualifications - Race 2 Group 1 (session_indy_nxt_2025_6630) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Indianapolis Grand Prix Race 2 | Qualifications - Race 2 Group 2 (session_indy_nxt_2025_6631) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Detroit Grand Prix | Practice 1 (session_indy_nxt_2025_6639) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Detroit Grand Prix | Practice 2 (session_indy_nxt_2025_6640) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Detroit Grand Prix | Qualifications - Group 1 (session_indy_nxt_2025_6641) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Detroit Grand Prix | Qualifications - Group 2 (session_indy_nxt_2025_6642) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | INDY NXT by Firestone at World Wide Technology Raceway | Practice (session_indy_nxt_2025_6667) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Road America | Practice 1 (session_indy_nxt_2025_6675) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Road America | Practice 2 (session_indy_nxt_2025_6676) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Road America | Qualifications - Group 1 (session_indy_nxt_2025_6677) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Road America | Qualifications - Group 2 (session_indy_nxt_2025_6678) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Practice 1 (session_indy_nxt_2025_6679) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Practice 2 (session_indy_nxt_2025_6680) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Qualifications - Group 1 (session_indy_nxt_2025_6681) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix at Mid-Ohio | Qualifications - Group 2 (session_indy_nxt_2025_6682) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | INDY NXT by Firestone at Iowa Speedway | Practice (session_indy_nxt_2025_6690) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Practice 1 (session_indy_nxt_2025_6707) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Practice 2 (session_indy_nxt_2025_6708) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Qualifications - Race 1 Group 1 (session_indy_nxt_2025_6709) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 1 | Qualifications - Race 1 Group 2 (session_indy_nxt_2025_6710) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 2 | Qualifications - Race 2 Group 1 (session_indy_nxt_2025_6711) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Monterey Race 2 | Qualifications - Race 2 Group 2 (session_indy_nxt_2025_6712) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Portland | Practice 1 (session_indy_nxt_2025_6713) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Portland | Practice 2 (session_indy_nxt_2025_6714) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Portland | Qualifications - Group 1 (session_indy_nxt_2025_6715) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | Grand Prix of Portland | Qualifications - Group 2 (session_indy_nxt_2025_6716) | qualifying | exact_session_windows:partial |
| INDY NXT | 2025 | INDY NXT by Firestone at the Milwaukee Mile | Practice (session_indy_nxt_2025_6727) | practice | exact_session_windows:partial |
| INDY NXT | 2025 | Music City Grand Prix | Practice (session_indy_nxt_2025_6731) | practice | exact_session_windows:partial |
| INDY NXT | 2026 | Detroit Grand Prix | Race (session_indy_nxt_2026_6749) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | Grand Prix of Alabama Race 1 | Race (session_indy_nxt_2026_6750) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | Grand Prix of St. Petersburg | Race (session_indy_nxt_2026_6751) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | Grand Prix of Alabama Race 2 | Race (session_indy_nxt_2026_6752) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | Grand Prix of Arlington | Race (session_indy_nxt_2026_6753) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | Grand Prix at Road America Race 2 | Race (session_indy_nxt_2026_6754) | race | indy_section_data:blocked |
| INDY NXT | 2026 | Music City Grand Prix | Race (session_indy_nxt_2026_6755) | race | indy_section_data:blocked |
| INDY NXT | 2026 | Indianapolis Grand Prix Race 1 | Race (session_indy_nxt_2026_6756) | race | lap_samples:partial, detailed_pit_context:blocked |
| INDY NXT | 2026 | INDY NXT by Firestone at Milwaukee Mile | Race (session_indy_nxt_2026_6757) | race | indy_section_data:blocked |
| ... |  |  |  |  | 34 additional rows omitted from Markdown; inspect data/career/reports/career-coverage-matrix.json. |

## Recommended Patch Order

1. audit_and_patch_indy_nxt_detail_categories: INDY NXT is the richest and most UI-relevant source family. Lap charts, section data, penalties, cautions, racecraft, and pit-stop counts are already present; detailed pit context remains blocked unless official report availability is confirmed.
2. patch_froc_grid_and_exact_test_windows_where_source_exists: FROC has known partial grid/start and exact test-window gaps. Date-only article context is present; exact times should stay null until official timing evidence appears.
3. resolve_or_preserve_gb3_2022_source_broken_rows: GB3 2021 TSL PDFs and GB3 2022 JSON expose different detail categories; after preserving that source-family split, the remaining hard GB3 gap is the official 2022 session 1248 JSON 404.
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
- Penalties/decisions: source-family split, not a priority gap. FRP F1600 2019 archive PDFs expose explicit penalty announcements where present, but no complete official no-penalty decisions ledger was found for every session.
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
- Penalties/decisions: source-family split, not a priority gap. Formula Ford 2020 event books expose explicit penalty-note rows where present, but no complete official no-penalty decisions ledger was found for every session.
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
- Grid/start positions: source-family split, not a priority gap. GB3 2021 official TSL PDFs expose race grid sheets and are complete; GB3 2022 official JSON result payloads do not expose grid/start fields.
- Official weather/track conditions: source-family split, not a priority gap. GB3 2021 official TSL PDFs expose weather/track-condition rows and are complete; GB3 2022 official JSON payloads do not expose comparable weather/track-condition fields.
- Pit-stop counts: source-family split, not a priority gap. GB3 2022 official JSON payloads expose pit-stop count fields and are complete; GB3 2021 official TSL PDFs do not expose comparable pit-stop count fields.
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

