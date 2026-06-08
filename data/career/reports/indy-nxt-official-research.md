# INDY NXT Official Research Report

Status: completed research intake from parallel workstream.

## Bottom Line

Official INDY NXT coverage is strong enough to build Bryce Aron's 2024-2026 dataset from official sources only. Use public `/api/results/*` JSON endpoints as the primary source, then attach official PDFs and event pages for lap charts, lineups, track metadata, and provenance.

## Primary API Sources

| Source | Years | Fields | Extraction | Tier | Gaps |
| --- | --- | --- | --- | --- | --- |
| `SeasonDropDown?id=09341e09-3216-4f89-a45f-db697d72ee13` | 2024-2026 | Year, event ID/name, session IDs/names | API GET | Tier 1 | Future sessions appear only as posted. |
| `EventsSessionDetails?id={EventsSessionID}` | 2024-2026 | Full field session results, team, car no., start/finish, laps, speeds, status, points, qualifying laps, report PDFs | Use IDs from SeasonDropDown | Tier 1 | Lap-by-lap is PDF, not JSON. |
| `DriverEventDetails?driverID=4959&eventID={EventID}` | 2024-2026 | Bryce event session rows | Use event IDs from SeasonDropDown | Tier 1 | Good Bryce view, but `EventsSessionDetails` is canonical. |
| `YearPointSummary?year={YYYY}&id={seriesGuid}` | 2024-2026 | Rank, points, road/oval points, wins, poles, top 5s, best finish, per-race points | API GET | Tier 1 | Points only. |
| `DriversByYear?year={YYYY}&id={seriesGuid}` | 2024-2026 | Driver summaries | API GET | Tier 1 | Summary only. |
| `SessionReports[].Url` via `http://www.imscdn.com/{Url}` | Posted sessions | Official PDFs: results, lap chart, box score, leader lap summary, section results, top section times | Build from EventsSessionDetails | Tier 1 | Report types vary. |

## Bryce Coverage Confirmed

| Year | Coverage | Bryce Identifier | Notes |
| --- | --- | --- | --- |
| 2024 | 14 completed race result sessions plus practice/qualifying sessions/PDFs | `DriverOverrideID=4959` | API summary: 9th, 302 points, best finish 3rd. |
| 2025 | 14 completed race result sessions plus practice/qualifying sessions/PDFs | `DriverOverrideID=4959` | API summary: 11th, 260 points, best finish 5th. Session rows capture team changes. |
| 2026 | 8 completed race result sessions as of June 8, 2026, plus future schedule pages | `DriverOverrideID=4959` | API/standings show 14th, 131 points, 8 starts after WWTR. |

## Best Extraction Plan

1. Use `YearsBySeries?series=...` to validate available years.
2. Use `SeasonDropDown?id=...` for event IDs and session IDs.
3. For each `EventsSessionID`, call `EventsSessionDetails?id=...`.
4. Store every `records[]` row for teammate and field context; flag Bryce rows by `DriverOverrideID=4959`.
5. Store `SessionReports[]` as link-only media/PDF assets.
6. Call `YearPointSummary` per year for standings and per-race points.
7. Scrape event pages only for metadata not available through APIs.

## Gaps

The largest gap is lap-by-lap structure. Official lap charts exist as PDFs through `SessionReports`, but no official public JSON lap-chart endpoint has been found. Starting grids and spotter-guide data appear page/PDF based rather than JSON. The public APIs are production website APIs, not documented developer APIs; preserve raw payloads and source URLs.
