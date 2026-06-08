# Bryce Aron Career Research Workstreams

Status: active research plan.

This document coordinates parallel research for the Bryce Aron career data foundation. Each workstream should return structured source-backed rows or a clear gap report. Official sources come first; aggregators are cross-checks.

## Intake Format

Each research worker should return or stage data using this shape:

```json
{
  "workstream": "indy_nxt_official",
  "checkedAt": "2026-06-08T00:00:00.000Z",
  "sourceEvidence": [],
  "entitiesFound": {
    "series": [],
    "teams": [],
    "tracks": [],
    "events": [],
    "sessions": [],
    "results": [],
    "qualifyingResults": [],
    "lapSamples": [],
    "racecraftEvents": [],
    "mediaAssets": []
  },
  "coverage": [],
  "gaps": [],
  "normalizationNotes": []
}
```

Do not blend unsupported assumptions into extracted rows. Put assumptions in `normalizationNotes` or `gaps`.

## Workstreams

### 1. INDY NXT Official

Scope:

- 2024, 2025, 2026 Bryce Aron INDY NXT rows.
- Official APIs and PDFs for races, qualifying, standings, event/session details, lap charts, pit summaries, penalties if available.
- Teammates and field-strength context.

Known starting points:

- `https://www.indynxt.com/api/results/DriverYearDetails?year=2024&series=09341e09-3216-4f89-a45f-db697d72ee13&driverID=4959`
- `https://www.indynxt.com/api/results/DriverYearDetails?year=2025&series=09341e09-3216-4f89-a45f-db697d72ee13&driverID=4959`
- `https://www.indynxt.com/api/results/DriverYearDetails?year=2026&series=09341e09-3216-4f89-a45f-db697d72ee13&driverID=4959`
- `YearPointSummary`, `EventsSessionDetails`, `DriversByYear` under the same API namespace.

Desired output:

- Complete race/session rows with official provenance.
- List of additional official endpoint patterns.
- Coverage table by year/session type.
- Current import status: API rows, linked report assets, and qualifyingResults are imported. Official Race Lap Chart PDF backfill imports 29,501 lap-by-lap position samples from all 36 charts, including 1,389 Bryce samples; 26 charts are complete and 10 charts are clean partial visible-sample imports with explicit missing car-lap or official result/chart conflict diagnostics. Official Leader Lap Summary PDFs import 36 race-session metric rows with leader timing, margin, and flag state. Official Results PDFs import 76 penalty/decision rows and 64 caution-summary causal incident rows. No INDY NXT report-detail parser failures remain in `data/career/reports/indy-nxt-report-details-backfill-report.json`.

### 2. GB3 / British F3 Pathway

Scope:

- Bryce's GB3/BRDC British F3-style records, especially 2021 and 2022.
- Official GB3 driver pages, results pages, calendars, race reports, PDFs.
- Team, car number, track, race-by-race results, qualifying, fastest laps if available.

Desired output:

- Official results rows where possible.
- Aggregator cross-check for missing races.
- Track metadata seeds for UK/European venues.

Verified 2022 machine-readable route:

- `https://www.gb-3.net/json/results/2022/22/_rounds.json`
- `https://www.gb-3.net/json/results/2022/22/_standings.json`
- `https://www.gb-3.net/json/results/2022/{sessionId}.json`

Use `_rounds.json` as the session manifest, then fetch session JSON by `Series[].Sessions[].Id`. Bryce appears in every working full-field 2022 session payload. Session `1248` is retained from official `_rounds.json` as a manifest-only session with exact local start time, but the row-level JSON endpoint returns 404 and no PDF fallback is present. Join Bryce by `DriverUrl` first, since session rows and standings rows use different numeric IDs.

### 3. Euroformula Open

Scope:

- Bryce's Euroformula Open season/events.
- Official results, race reports, timing sheets, standings.
- Team/car/equipment context.

Desired output:

- Race/session result rows.
- Series/car context.
- Source reliability notes.

### 4. Formula Regional Oceania / Toyota Racing Series

Scope:

- 2024 Formula Regional Oceania races.
- Official Toyota Racing / Castrol Toyota FR Oceania results and articles.
- Track metadata for New Zealand venues.

Desired output:

- Race/session rows, including wins/podiums.
- Weather/track enrichment opportunities.
- Official source URLs.

### 5. IMSA / Sports Car One-Offs

Scope:

- Daytona/GTP or other sports car appearances.
- Entry lists, session/race result, class, co-drivers, car, team, laps/stints if public.

Desired output:

- Session/result rows at driver/team/car class grain.
- Notes on comparing multi-driver endurance results to single-driver formula results.

Verified machine-readable route:

- Index: `https://imsa.results.alkamelcloud.com/index.php?season=25_2025&evvent=02_Daytona%20International%20Speedway`
- Official race JSON: `https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/03_Results_Race_Official.JSON`
- Official race CSV: `https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/03_Results_Race_Official.CSV`
- Time cards JSON: `https://imsa.results.alkamelcloud.com/Results/25_2025/02_Daytona%20International%20Speedway/01_IMSA%20WeatherTech%20SportsCar%20Championship/202501251340_Race/24_Hour%2024/23_Time%20Cards_Race.JSON`

Import status: Daytona 2025 is imported from official Al Kamel JSON/CSV. It verifies Bryce in car `85`, JDC Miller MotorSports, GTP, Porsche 963. Time Cards JSON is imported at lap-sample grain. Official race report weather fields are imported as a source-backed session condition row: air temperature, track temperature, and dry track status.

Model IMSA with car/class/co-driver grain rather than forcing it into a single-driver formula result shape. Overall classification and class classification are separate fields.

### 6. F1600 / Formula Ford / Team USA Scholarship / Early Career

Scope:

- Earliest public Bryce Aron data through 2020/2021.
- F1600, Formula Ford Festival, Team USA Scholarship, karting and other junior events.

Desired output:

- Event/result rows where source-backed.
- Career timeline milestones.
- Gaps and low-confidence areas clearly separated.

Verified/imported Formula Ford 2020 route:

- TSL Walter Hayes Trophy event page: `https://www.tsl-timing.com/event/204456`
- TSL Walter Hayes Trophy result book: `https://www.tsl-timing.com/file/?f=HSCC/2020/204456wht.pdf`
- TSL Walter Hayes Trophy Grand Final cross-check: `https://www.tsl-timing.com/file/?f=HSCC/2020/204456finwht.pdf`
- BRSCC Formula Ford Festival result book: `https://brscc.co.uk/wp-content/uploads/2021/04/2020-BRSCC-Formula-Ford-Festival-TSL-Results.pdf`
- TSL/BRSCC National FF1600 Oulton Park result book: `https://www.tsl-timing.com/file/?f=BRSCC/2020/202931ffn.pdf`
- TSL/BRSCC National FF1600 Brands Hatch result book: `https://www.tsl-timing.com/file/?f=BRSCC/2020/203931ffn.pdf`
- TSL/BARC-hosted National FF1600 Silverstone International result book: `https://www.tsl-timing.com/file/?f=BARC/2020/204121ffn.pdf`
- TSL/MSVR Champion of Cadwell result book: `https://www.tsl-timing.com/file/?f=MSVR/2020/203452hef.pdf`
- TSL/MSVR Champion of Brands result book: `https://www.tsl-timing.com/file/?f=MSVR/2020/203752cob.pdf`

Import status: National FF1600 2020, Formula Ford Festival 2020, Walter Hayes Trophy 2020, Champion of Cadwell 2020, and Champion of Brands 2020 classification sessions are imported from official TSL/BRSCC/BARC/MSVR-hosted PDFs. Current coverage is 46 classification sessions, 1,094 result rows, 746 official grid/start rows, 24 Bryce rows, 17 Bryce rows with starts, 282 Bryce-only lap-analysis samples from 24 official lap/sector-analysis pages with explicit Bryce block labels, 4 official WHT penalty notes, 46 official weather/track-condition rows, and a standalone Walter Hayes Grand Final cross-check confirming Bryce P3 in car 21. FRP F1600 2019 now imports 2 official qualifying grid-position penalties from PDF announcements. Team USA Scholarship 2020 context pages are imported as link-only media/source evidence plus four structured official career milestones for Bryce's scholarship selection, karting achievements, and FRP F1600 podium context. Archived official Badger Kart Club pages import three Bryce fast-time/track-record facts at career/achievement grain. Formula Ford continuation lap-analysis rows without a repeated Bryce label, broader sector-field parsing, unmatched grid rows, broader penalty semantics, karting race-by-race sheets, and remaining early-career Formula Ford appearances outside imported National FF1600/Festival/Walter Hayes Trophy/Champion books remain separate work.

### 7. Track Metadata

Scope:

- Every track found in workstreams.
- Type, length, coordinates, timezone, elevation, direction, corner count, temporary/permanent, surface, country/region.

Desired output:

- Normalized track rows.
- Source priority per track.
- Alias table for matching event names to canonical tracks.

Current status:

- Current imported tracks are backfilled from `data/career/raw/track-metadata/track-metadata.v1.json`.
- Coverage is 42/42 imported tracks with coordinates, timezone, layout length, surface, corner count, temporary/permanent flag, source evidence, and `weatherJoinReady`.
- Known direction coverage is 40/40. New Jersey Motorsports Park Thunderbolt, Arlington, Detroit, and St. Petersburg now have source-backed clockwise/counterclockwise direction values.
- Arlington is intentionally medium confidence because the future street circuit uses centroid-style coordinates and direction is inferred from the official INDYCAR track-map turn sequence pending stronger official GIS or supplemental-regulation data.
- Future series imports must add track metadata rows before their events are eligible for weather joins.

### 8. Weather Enrichment

Scope:

- Historical weather strategy for each event/session date/time/track.
- Public APIs/sources for US, UK/Europe, New Zealand.
- Official or trackside motorsport condition data when exposed: air temp, track temp, humidity, pressure, wind, track condition, wet/dry state, grip/rubbering notes, race-control weather flags, and any equivalent field a timing sheet or broadcast source publishes.

Desired output:

- Weather source plan and API candidates.
- Required session-time precision rules.
- Confidence handling for approximated weather windows.
- Separate ambient-weather fields from track/surface condition fields, with source priority and confidence.

Verified source plan:

- Open-Meteo archive is the default fast historical backfill: `https://archive-api.open-meteo.com/v1/archive`.
- NCEI Global Hourly is the U.S. official station cross-check through `https://www.ncei.noaa.gov/access/services/search/v1/data` and `https://www.ncei.noaa.gov/access/services/data/v1`.
- NWS should be used for live/current forecast, alerts, station discovery, and race-day monitoring, not historical backfill.

Current track coordinates and session timezones are backfilled for imported tracks. Euroformula 2023 has 28 official PDF-derived actual session starts from internally consistent Cronococa fastest-lap sequence timing rows. INDY NXT has 37 2026 sessions with official Race Control-backed local windows: 9 result-backed trackactivity direct-ID matches, 11 schedulefeed practice/race exact event/label matches, 1 event-level schedulefeed green-flag race window, and 16 future schedule-only trackactivity sessions. Remaining historical INDY NXT date-only sessions support event-day weather context only until precise official windows are imported.

Track temperature and surface state must come from official timing/report/broadcast/trackside evidence when available. Public weather APIs can backfill ambient context, but they should not overwrite official track condition readings.

### 9. Media / Narrative

Scope:

- Official articles, team releases, Bryce quotes, race reports, photos, allowed clips, and race-context public posts only when they source a concrete racing fact.

Desired output:

- Link-only media asset rows.
- Notable race/storyline tags.
- Rights notes.
- No broad social-media or popularity scrape unless the item is needed as evidence for a racing result, career milestone, team/sponsor context, or permissioned media asset.

## Coverage Report Requirements

Each source family should report:

- `complete`: official row-level data found.
- `partial`: some official rows, gaps remain.
- `aggregator_only`: no official row-level data found yet.
- `not_found`: no reliable source found.
- `blocked`: source exists but inaccessible or requires credentials.

## Immediate Merge Order

1. Maintain INDY NXT official ingest for all available years.
2. Maintain GB3 2022 official JSON ingest.
3. Maintain IMSA Daytona 2025 official Al Kamel JSON/CSV/time-card ingest.
4. Maintain Formula Regional Oceania 2024 official Toyota table ingest, including HTML grid tabs and linked official grid PDFs where present.
5. Maintain FRP F1600 2019 and Formula Ford 2020 official PDF ingests.
6. Maintain track metadata backfill for every newly imported track.
7. Add remaining early-career rows with confidence labels.
8. Add ambient weather enrichment first for precise-window sessions, including the 28 Euroformula PDF-derived windows and 37 Race Control-backed INDY NXT window rows, then extend to remaining historical INDY NXT only after exact session windows are imported.

## Future Automation Requirement

The career warehouse must support automatic updates for every future Bryce race weekend. For categories collected historically, the system should also attempt to collect the same category for future practice, qualifying, race, and official-result sessions.

Automation workstreams to add after the historical schema stabilizes:

- Schedule watcher: discovers upcoming Bryce events/sessions and creates scheduled session rows.
- Race-weekend poller: starts before each session and archives live Race Control/source payloads.
- Official-results reconciler: converts provisional live rows into official results once APIs/PDFs publish.
- Broadcast-route resolver: records authorized viewing links for notifications and race-day launch buttons.
- Notification planner: emits pre-session reminder events and live-result/moment triggers.
- Coverage monitor: reports which expected session artifacts are missing after a weekend.

This matters for the final user-facing app: friends/family should not need to manually refresh datasets or know when official APIs update.
