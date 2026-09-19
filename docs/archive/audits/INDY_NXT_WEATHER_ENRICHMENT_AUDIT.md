> Historical record — see the [current documentation](../../README.md). Dates, plans, and status below describe the original investigation.

# INDY NXT Weather Enrichment Audit

Updated: 2026-06-08 14:13 CDT.

This lane adds non-official ambient weather for BryceCast UI context. It does not change the official INDY NXT readiness decision, and it does not promote modeled weather into official race-control or timing-report weather.

Authoritative files:

- `data/career/career.dataset.json`
- `data/career/reports/indy-nxt-weather-backfill-report.json`
- `data/career/reports/indy-nxt-weather-station-crosscheck-report.json`
- `data/career/reports/career-coverage-matrix.json`
- `scripts/backfill-indy-nxt-weather.mjs`
- `scripts/crosscheck-indy-nxt-weather-stations.mjs`
- `scripts/test-career-data-regressions.mjs`

## Source Decision

INDY NXT official reports expose results, starts, pit-stop counts, lap charts, Event Summary metrics, Leader Lap Summary metrics, section reports, penalties, and caution summaries, but they do not expose official session weather. Open-Meteo Historical Weather API is therefore used only as non-official modeled ambient context.

Open-Meteo endpoint:

- `https://archive-api.open-meteo.com/v1/archive`

Requested hourly variables:

- `temperature_2m`
- `apparent_temperature`
- `relative_humidity_2m`
- `dew_point_2m`
- `precipitation`
- `rain`
- `weather_code`
- `cloud_cover`
- `pressure_msl`
- `wind_speed_10m`
- `wind_gusts_10m`
- `wind_direction_10m`
- `shortwave_radiation`
- `soil_temperature_0_to_7cm`

Raw request/response cache:

- `data/career/raw/weather/open-meteo/indy-nxt/<track-id>/<date>.json`

Representative station cross-check source:

- NOAA/NCEI Global Historical Climatology Network hourly (GHCNh)
- Station list: `https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/doc/ghcnh-station-list.csv`
- Station-year files: `https://www.ncei.noaa.gov/oa/global-historical-climatology-network/hourly/access/by-year/<year>/psv/GHCNh_<station-id>_<year>.psv`

Station cross-check raw cache:

- `data/career/raw/weather/noaa-ghcnh/indy-nxt/doc/ghcnh-station-list.csv`
- `data/career/raw/weather/noaa-ghcnh/indy-nxt/stations/<year>/GHCNh_<station-id>_<year>.psv`

## Join Rules

Weather rows are joined only when all of these are true:

- The session belongs to INDY NXT.
- The session has `scheduledStart` or `actualStart` with a clock time.
- The session date is at or before the archive cutoff date.
- The event track has latitude, longitude, and timezone metadata.
- Open-Meteo returns the matching local hourly row.

Date-only sessions are not joined. Future sessions are not joined. Track temperature is not inferred.

The importer rounds the source session start to the nearest local hour for the Open-Meteo hourly row. Existing career dataset timestamps are local wall-clock strings with a session timezone, so the API request uses the session or track timezone rather than machine-local UTC reinterpretation.

## Current Result

Archive cutoff date: `2026-06-07`.

| Outcome | Count |
| --- | ---: |
| Joined INDY NXT sessions | 95 |
| Joined race sessions | 36 |
| Joined practice sessions | 48 |
| Joined qualifying sessions | 11 |
| Skipped date-only sessions | 78 |
| Skipped future exact-window sessions | 16 |
| Raw Open-Meteo cache artifacts | 78 |
| Open-Meteo source-evidence rows | 78 |
| Representative NOAA/NCEI station samples matched | 6 |
| Representative station samples with material conflicts | 0 |

All 36 archive-eligible INDY NXT race sessions now have non-official ambient weather rows. Exact-window practice and qualifying sessions are also joined when archive-eligible.

Representative station cross-check:

| Session | Track | Station | Distance | Observation offset | Result |
| --- | --- | --- | ---: | ---: | --- |
| `session_indy_nxt_2024_6314` | Barber Motorsports Park | KBHM | 12.3 km | -12 min | no material conflict |
| `session_indy_nxt_2024_6317` | WeatherTech Raceway Laguna Seca | KMRY | 8.5 km | +29 min | no material conflict |
| `session_indy_nxt_2024_6319` | Iowa Speedway | KTNU | 0.7 km | -10 min | no material conflict |
| `session_indy_nxt_2024_6326` | Streets of Detroit | KDET | 9.0 km | -27 min | no material conflict |
| `session_indy_nxt_2025_6446` | Streets of St. Petersburg | KSPG | 0.6 km | -7 min | no material conflict |
| `session_indy_nxt_2025_6454` | World Wide Technology Raceway | KCPS | 9.7 km | +23 min | no material conflict |

## Field Contract

Production-safe fields:

- `ambientTempC`
- `apparentTempC`
- `relativeHumidityPct`
- `dewPointC`
- `pressureHpa`
- `windSpeedKph`
- `windGustKph`
- `windDirectionDeg`
- `precipitationMm`
- `rainMm`
- `cloudCoverPct`
- `ambientConditionRaw`
- `weatherCode`
- `wetDry`
- `thermalStress`
- `windRisk`
- `shortwaveRadiationWm2`

Weak proxy field:

- `soilTemp0To7CmC`, labeled with `soilTempProxyForTrackTemp: true`

Fields intentionally unavailable:

- `trackTempC`
- `trackTempSource`
- `trackConditionRaw`
- `gripLevel` beyond `unknown`

Every INDY NXT Open-Meteo row carries:

- `confidence: modeled_medium`
- `weatherSourceType: grid_reanalysis`
- `timeConfidence: exact_session_hour`
- `locationConfidence: track_coordinate`
- `source`
- `rawArtifactPath`
- `provenanceRefs`
- caveats including `non_official_modeled_weather` and `track_temperature_unavailable`

## Confidence

Current canonical weather-row confidence tier remains `modeled_medium`. The Open-Meteo rows are exact-time plus track-coordinate modeled weather, and the representative NOAA/NCEI GHCNh station cross-check found no material conflicts in 6 sampled race sessions. This is enough to keep the modeled ambient weather lane production-safe with labels, but it is not a systematic row-level station check across all 95 rows.

Do not label INDY NXT weather rows as `official` or `series_report`. Do not promote canonical rows to `modeled_high` or `observed_nearby_high` until a systematic row-level station cross-check exists for the promoted row set.

NOAA/NCEI GHCNh provided the practical no-auth station-observation route for this lane. Visual Crossing remains out of scope unless an API key and cost approval are provided.

## UI Guidance

Safe UI labels:

- Modeled ambient temperature
- Modeled feels-like temperature
- Modeled humidity/dew point
- Modeled wind and gust risk
- Modeled rain/precipitation context
- Modeled dry/damp/wet context

Unsafe UI labels:

- Official INDY NXT weather
- Official track condition
- Track temperature
- Crosswind
- Grip level
- Pit strategy weather adjustment

## Metric-Parity Audit

Classifications:

- `production-safe`: safe for UI if caveats are displayed where needed.
- `source-bounded partial`: imported where official/source-visible data exists, with explicit holdouts.
- `possible with one focused source`: one narrow source check could improve it.
- `unavailable without guessing`: current source family does not expose the category safely.
- `out-of-scope`: low UI value or outside the bounded lane.

| Family | INDY NXT | GB3 | Euroformula | FROC | FRP F1600 | Formula Ford | IMSA |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Core events/sessions/results | production-safe | production-safe | production-safe | production-safe | production-safe | production-safe | production-safe |
| Qualifying | production-safe | production-safe | production-safe | production-safe | production-safe | production-safe | unavailable without guessing |
| Grid/start | production-safe | source-bounded partial | production-safe | source-bounded partial | unavailable without guessing | source-bounded partial | unavailable without guessing |
| Exact windows | source-bounded partial | production-safe | production-safe | source-bounded partial | production-safe | production-safe | production-safe |
| Official weather | unavailable without guessing | source-bounded partial | unavailable without guessing | unavailable without guessing | unavailable without guessing | production-safe | production-safe |
| Modeled ambient weather | production-safe for exact historical windows | possible with one focused source | possible with one focused source | possible except nine test sessions | possible with one focused source | lower priority, official weather already exists | not needed, official weather exists |
| Lap samples | source-bounded partial | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | possible with one focused source | production-safe |
| Penalties/decisions | production-safe | unavailable without guessing | unavailable without guessing | unavailable without guessing | source-bounded partial | source-bounded partial | unavailable without guessing |
| Incidents/cautions | production-safe | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing |
| Racecraft summary | production-safe | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing |
| Pit counts | production-safe | source-bounded partial | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | production-safe |
| Detailed pit context | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing | unavailable without guessing |
| Derived benchmarks | possible with one focused source | possible with one focused source | possible with one focused source | possible with one focused source | possible with one focused source | possible with one focused source | out-of-scope for one-event slice |

## Open Gap Classification

| Gap ID | Classification | UI impact | Decision |
| --- | --- | --- | --- |
| `gap_indy_nxt_qualifying_lap_reports` | preserved source limit | Not a weather blocker or dashboard blocker. | Keep as caveat ledger for partial lap charts, one corrupt Section Results URL, unavailable detailed pit context. |
| `gap_gb3_2022_session_1248_missing_json` | preserved source limit | Affects GB3 row-level parity for one official manifest session. | Focused retry checked the official JSON URL plus plausible `championship-results` and `bsb-results` PDF blob paths for `Session-1248.pdf`; all returned 404, so preserve unavailable. |
| `gap_formula_ford_2020_grid_start_source_asymmetry_holdouts` | preserved source limit | Minor historical start-position caveat. | Keep holdouts unless a direct official source matches the seven classified rows. |
| `gap_froc_2024_start_positions_partial` | preserved source limit | Affects FROC grid/start parity for race tails. | Do not infer tail starts from reverse-grid rules beyond source-visible rows. |
| `gap_froc_2024_session_times_missing` | weather blocker for FROC only | Blocks exact-hour weather for nine FROC test sessions. | Keep unavailable unless official timing PDFs or equivalent exact clocks appear. |
| `gap_froc_2024_round_4_date_conflict` | preserved source limit | No immediate UI blocker if date conflict is caveated. | Preserve conflict between Toyota page title and date announcement. |
| `gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch` | preserved source limit | Isolated FRP qualifying source mismatch. | Do not import mismatched PDF rows. |
| `gap_euroformula_2023_championship_classification_pdf_current_mismatch` | possible with one focused source | Affects season championship summary, not session UI. | Search for archived 2023 standings PDF or official classification page. |
| `gap_remaining_career_rows_after_track_metadata` | out-of-scope for this lane | Broad historical tail. | Replace with narrower future gaps when specific UI metrics require them. |

## Ranked Next Work

1. Decide Formula Ford lap-sample scope. Expand only if official lap-analysis pages materially improve cross-career UI metrics.
2. Add systematic station cross-checks only for rows the UI wants to promote above `modeled_medium`.
3. Add modeled ambient weather to non-INDY exact-window series only if the UI actually needs cross-series weather filters.
4. Replace `gap_remaining_career_rows_after_track_metadata` with narrower future gaps once a specific UI metric needs them.
