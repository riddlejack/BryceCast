# Track Metadata and Weather Research Report

Status: completed research intake from parallel workstream.

## Recommended Track Metadata

Collect track metadata as a durable reference table, with layout-specific facts stored on the layout/configuration grain.

Fields:

- Track identity: `track_id`, `canonical_name`, `aliases`, `venue_name`, `layout_name`, `configuration_name`, `series_track_name`, `country`, `region`, `city`, `address`, `official_url`
- Geography: `latitude`, `longitude`, `coordinate_source`, `coordinate_confidence`, `elevation_m`, `timezone_iana`, `osm_id`, `wikidata_qid`
- Classification: `track_type`, `surface`, `indoor_outdoor`, `permanent_temporary`, `direction`, `series_category`
- Layout facts: `length_km`, `length_mi`, `length_source`, `turn_count`, `width_m`, `banking_notes`, `pit_lane_side`, `start_finish_latlon`, `valid_from`, `valid_to`
- Certification: `fia_grade`, `fia_license_expiry`, `cik_fia_homologation_id`, `homologation_expiry`, `sanctioning_body`, `license_source_url`
- Media/maps: `track_map_url`, `satellite_map_url`, `layout_geojson`, `racingcircuits_url`, `source_urls`
- Provenance: `metadata_tier`, `field_confidence`, `last_verified_at`, `notes`, `known_limitations`

## Recommended Weather Fields

Weather should attach to `session_id + track_layout_id + time_window`, and store both raw provider fields and normalized motorsport fields.

Fields:

- Join keys: `weather_enrichment_id`, `session_id`, `track_id`, `track_layout_id`, `event_id`, `provider`, `dataset`, `source_url`
- Time: `session_start_utc`, `session_end_utc`, `session_timezone`, `weather_time_utc`, `weather_time_local`, `time_match_method`, `time_confidence`
- Location: `request_latitude`, `request_longitude`, `grid_latitude`, `grid_longitude`, `station_id`, `station_name`, `station_distance_km`, `station_elevation_m`
- Core weather: `air_temp_c`, `dew_point_c`, `relative_humidity_pct`, `pressure_hpa`, `wind_speed_ms`, `wind_gust_ms`, `wind_direction_deg`, `precip_mm`, `rain_mm`, `snowfall_mm`, `cloud_cover_pct`, `visibility_m`, `weather_code`, `condition_text`
- Derived fields: `density_altitude_m`, `heat_index_c`, `wind_chill_c`, `wet_track_risk`, `precip_last_1h_mm`, `precip_last_3h_mm`, `temp_delta_session_c`, `wind_cross_component_ms`, `wind_head_tail_component_ms`
- Alerts/risk: `alert_ids`, `alert_event`, `alert_severity`, `alert_effective_utc`, `alert_expires_utc`, `lightning_available`, `radar_available`
- Provenance: `provider_confidence`, `spatial_resolution_km`, `temporal_resolution`, `raw_payload_hash`, `fetched_at`, `quality_flags`, `limitations`

## Weather Sources

| Tier | Source | Use | Limits |
| --- | --- | --- | --- |
| A | Open-Meteo Historical Weather API: `https://open-meteo.com/en/docs/historical-weather-api` | Default global historical point enrichment by track/date/time. | Reanalysis/model data, not trackside observation. |
| A | NOAA NCEI CDO/API: `https://www.ncei.noaa.gov/cdo-web/webservices/v2` | U.S. official historical observations. | Token often needed; station selection work. |
| A | NWS API: `https://www.weather.gov/documentation/services-web-api` | U.S. live forecast, alerts, recent observations. | Not the main historical archive. |
| A | NASA POWER hourly API: `https://power.larc.nasa.gov/docs/services/api/temporal/hourly/` | Global fallback, scientific gridded data. | Local solar time handling needs care. |
| B | Meteostat: `https://dev.meteostat.net/index.html` | Practical historical station data. | Less official than national agencies. |
| B | UK Met Office MIDAS Open via CEDA | UK official historical station archive. | Flat-file workflow. |
| B | DWD Climate Data Center | German official station/grid datasets. | Complex file-index workflow. |
| B | NIWA CliFlo | New Zealand official historical weather. | Registration/query workflow and limits. |
| C | Visual Crossing / Tomorrow.io / OpenWeather paid products | Convenience fallback. | Cost and licensing vary. |

## Track Metadata Sources

| Tier | Source | Use | Limits |
| --- | --- | --- | --- |
| A | Existing INDY NXT/Race Control feeds | Event-specific track/session context. | Not enough global venue metadata. |
| A | INDY NXT official results/schedule | Official Bryce session context. | Website/API behavior can change. |
| A | FIA licensed circuit list | FIA grade, lap distance, license fields. | PDF parsing; car circuits only. |
| A | CIK-FIA homologated kart circuits | Karting circuit name/country/place/length/homologation. | PDF; limited metadata. |
| B | RacingCircuits.info | Aliases, maps, configuration histories. | No obvious public API. |
| B | OpenStreetMap Overpass API | Coordinates, polygons, addresses, obscure venues. | Community quality varies. |
| B | Wikidata SPARQL | Coordinates, aliases, official links, IDs. | Incomplete motorsport fields. |
| B | MotorsportReg API | Grassroots venue discovery. | Event/organization-centric. |
| C | MYLAPS Speedhive | Karting/club timing ecosystem. | Public API access unclear. |
| C | Track official sites / club pages | Obscure venue tie-breaker. | Manual verification required. |

## Enrichment Workflow

1. Build tracks and track layouts from official series feeds first.
2. Normalize aliases such as `WWTR`, `World Wide Technology Raceway`, `Gateway`, and `St. Louis`.
3. Resolve coordinates using official track site, OSM, and Wikidata; store candidates and selected canonical coordinates.
4. Assign IANA timezone from coordinates.
5. Store scheduled and actual session times separately.
6. Weather backfill order: official U.S. station data, national official data where practical, Open-Meteo global historical, Meteostat fallback.
7. Query hourly data for session window plus 3h lookback and 1h after.
8. Aggregate temperature/humidity/pressure by time-weighted average, wind by vector average plus max gust, precipitation by session and lookback sums.
9. Attach quality flags: `exact_time`, `nearest_hour`, `interpolated`, `station_far`, `modeled_grid`, `schedule_only`, `time_uncertain`.

## Timezone Rules

Store all session joins in UTC. Display in track local time using IANA timezone. For uncertain session times, store a confidence window and mark `schedule_only`, `date_only`, or `time_uncertain`.
