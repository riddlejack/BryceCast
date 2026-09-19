# Weather and wind with temporal and spatial honesty

BryceCast joins historical weather only when a session has a source-backed clock window, then rotates live wind correctly onto track art. The engineering challenge is provenance and coordinate semantics, not icon selection.

## Problem

Official INDY NXT sources do not provide session weather observations. Many qualifying rows have a date but no defensible group-level start time. Assigning an hourly observation to those sessions would introduce false precision.

Wind adds a second problem. Meteorological bearings describe where wind comes **from**. An arrow that shows airflow must point 180 degrees away from that bearing. Track outlines also have their own screen orientation, so screen-up cannot be treated as north.

## Historical method

The historical backfill uses Open-Meteo archive observations only for sessions with exact source-backed windows. It records the modeled source and variables, and skips date-only sessions instead of guessing an hour. The retained [backfill report](../../data/career/reports/indy-nxt-weather-backfill-report.json) lists temperature, apparent temperature, humidity, dew point, precipitation, rain, weather code, cloud cover, pressure, wind speed, gust, direction, solar radiation, and shallow soil temperature.

A separate NOAA GHCN-H check compares a sample against nearby station observations within disclosed time and distance limits. That cross-check is a reasonableness test; it does not turn modeled archive weather into official track weather. See the [station cross-check](../../data/career/reports/indy-nxt-weather-station-crosscheck-report.json) and the broader [weather audit](../INDY_NXT_WEATHER_ENRICHMENT_AUDIT.md).

The career schema preserves unlike source families rather than forcing them into one complete table. The September 2026 validation report contains 201 weather observations, but older Formula Ford and GB3 records often carry official condition text without numeric wind, while INDY NXT carries modeled numeric fields. See the [career validation report](../../data/career/reports/validation-report.json).

## Live method

The [live weather service](../../scripts/live-weather-service.mjs) fetches near-track NWS observations, applies a five-minute cache/poll policy, retries bounded failures, and can return a persisted prior reading with its age. The React hook preserves observation time and treats calm wind as directionless; see [useEventWeather.ts](../../src/app/useEventWeather.ts).

Direction formatting uses a 16-point compass in [format.ts](../../src/app/format.ts). The compact wind glyph rotates the meteorological **from** bearing by `+180°` to show travel direction. The track overlay applies `bearing + 180° + northOffsetDeg`, so the arrow is oriented against true north on that specific outline. See [weatherGlyphs.tsx](../../src/app/weatherGlyphs.tsx) and [trackArt.tsx](../../src/app/trackArt.tsx). A visit-to-visit swing appears only after at least 22.5°, one compass point. Calm conditions suppress the directional arrow and north marker.

## Evidence

The historical report, generated 2026-07-19 with a 2026-07-18 archive cutoff, joined **115 of 115 eligible exact-window sessions**: 40 race, 51 practice, and 24 qualifying sessions. It skipped **78 date-only sessions** and **20 future sessions**.

The NOAA cross-check, generated 2026-07-11, matched **six of six requested samples**, with zero unmatched samples and zero material conflicts within the stated maximums of 75 minutes and 75 km.

## Limits

Modeled hourly weather is not official track weather, and six station comparisons are not a calibration study. A nearby station can differ from conditions at the racing surface. The live implementation does not establish current service availability. BryceCast does not compute or claim a headwind, tailwind, or aerodynamic-effect metric; it displays sourced speed and direction in a correctly oriented frame.
