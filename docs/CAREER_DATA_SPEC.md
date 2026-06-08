# Bryce Aron Career Data Spec

Status: initial schema foundation.

This spec defines the durable data model for the BryceCast career analytics warehouse. The goal is to preserve every public, source-backed fact about Bryce Aron's racing career without flattening away provenance, uncertainty, or grain.

## Product Bar

BryceCast career analytics should be useful to three audiences:

- Bryce/team: teammate-adjusted performance, qualifying-to-race conversion, reliability-adjusted results, track/weather tendencies, racecraft patterns, and upcoming-event comps.
- Friends/family: career timeline, best drives, track history, podium/win map, clips/photos/articles, and clear race-day context.
- Engineering/research: reproducible datasets with source evidence, confidence, validation checks, and enough structure for regression-style analysis.

Long-term product end state: BryceCast should become a polished app/website that Bryce's friends, family, and close supporters can actually use. The app should combine automatic race-weekend ingestion, live Bryce analytics, lifetime career analytics, schedule-aware reminders, customizable push notifications, official viewing-route links, and a career-stat playground. The data foundation must support that end state from the start.

Every rendered stat must be traceable to one of:

- official source
- team/driver-provided source with permission
- reputable aggregator cross-check
- manual extraction with explicit provenance
- derived calculation from source-backed rows

No career stat should be treated as production-ready unless its provenance and confidence are stored.

## API-First Collection Rule

Prefer APIs, JSON feeds, CSVs, public data services, and official machine-readable endpoints over HTML/PDF scraping whenever possible. Scraping and PDF extraction are allowed only when a machine-readable path is unavailable or incomplete.

Collection should be aggressively parallelized with bounded concurrency:

- Discover all independent URLs/IDs first.
- Fetch details in parallel with configurable concurrency.
- Preserve raw artifacts before normalization.
- Retry transient failures with backoff.
- Cache raw payloads so reruns validate and normalize quickly.
- Increase concurrency until errors/rate limits appear, then back off without sacrificing provenance or validation.

Speed is a product requirement, but not a reason to lower data quality.

## Data Integrity Gates

This dataset should be treated like a research dataset, not a loose app seed file. The main risk is a confident-looking stat built from a subtle bad join: wrong session, wrong race number, wrong track layout, wrong local date, wrong timezone, or wrong weather window.

Hard rules:

- No weather observation may enter production analytics unless it is tied to `sessionId`, `trackId`, `observedAt`, source coordinates, distance from track, and provenance.
- No weather join may be trusted until the session has a timezone-aware start/window and the track has stable coordinates.
- Track/surface temperature is not the same as ambient air temperature. If a series, timing sheet, broadcast graphic, official report, or trackside source exposes track temperature, surface condition, grip, humidity, wind, pressure, or similar motorsport condition data, collect it as official/trackside condition data rather than replacing it with generic weather API data.
- No result row may be imported from an aggregator when an official row exists for the same session unless the aggregator row is kept only as a cross-check.
- No derived metric may be rendered without provenance pointing to the source rows or calculation source.
- No start/finish/race-number mapping may be inferred from array position alone unless the source explicitly defines that ordering and the assumption is documented.
- No source conflict should be overwritten silently. Preserve both pieces of evidence, choose a controlling value, and explain why.
- No live analytics screen may render a fact as live unless it comes from a current live feed or a local archive sample from the same session. Seed, stale, cold, date-only, or reference-map data must be labeled that way.
- No "interesting" derived metric belongs in the product until its input rows, join assumptions, calculation version, exclusions, and confidence are stored.

Validation should fail on broken references, duplicate IDs, invalid required timestamps, weather/session track mismatches, missing weather coordinates, and derived metrics without provenance. Validation may warn on incomplete enrichment, such as sessions that are official result rows but still need timezone or track-coordinate backfill.

## Automatic Update Requirement

The historical dataset and live race-day dataset are the same product system at different time horizons. Any category collected for past races should also be collected automatically for future practice, qualifying, race, test, and special-event sessions when a public/authorized source exists.

Required automation model:

- Poll official schedule/event APIs for new Bryce sessions.
- Detect upcoming sessions and create event/session skeleton rows before race day.
- Start race-weekend source polling before practice/qualifying/race windows.
- Ingest Race Control/source rows during live sessions.
- Archive raw payloads and normalized rows after every polling interval.
- Reconcile live/provisional rows against official results after session reports publish.
- Update career analytics automatically when a new official row is available.
- Preserve source freshness, ingestion timestamp, and whether a row is `scheduled`, `live`, `provisional`, `official`, or `corrected`.

Do not require manual app edits for new race weekends. Manual review is acceptable for low-confidence sources, early-career backfills, and one-off correction approval, but the normal INDY NXT race-weekend path should be automated.

## App and Notification End State

The full product should be able to support:

- Mac/PC web app and mobile app/PWA initially.
- Later downloadable app distribution for friends/family when the product is stable.
- Push notifications for upcoming Bryce sessions, configurable by user.
- Pre-session reminder, e.g. five minutes before green/practice/qualifying/race start.
- Official viewing-route link in reminders, such as FOX, FS1, Hulu Live TV, Xfinity, or another authorized provider route.
- Live event notifications: green flag, major position gain/loss, pit stop, DNF/status change, podium/win, checkered flag, official result posted.
- User notification preferences: race only, all sessions, result-only, major moments, quiet mode, series filters, time-zone handling.
- Live Bryce analytics screen during sessions.
- Lifetime analytics playground where users can filter by series, year, track, track type, team, weather, start position, finish range, status, teammate, and field strength.
- Family/friends story mode: best drives, wins/podiums, career timeline, track map, articles/photos/clips that are link-only or permissioned.

This spec is not only for historical research. It is also the data contract for a continuously updating BryceCast product.

## Grain Rules

Do not mix grains in one table.

| Grain | Meaning | Examples |
| --- | --- | --- |
| Career | Cross-season driver facts. | Birthplace, public biography, awards. |
| Season | One driver in one series/year/team context. | 2025 INDY NXT with HMD/CGR context. |
| Event | One race weekend at a venue. | 2026 WWTR INDY NXT. |
| Session | Practice, qualifying, race 1, race 2, heat, test. | Alabama Race 2, Qualifying 1. |
| Result | One entrant/driver classified in one session. | Bryce P7 from P11. |
| Lap | One driver on one lap. | Lap 14, 1:22.556, P8. |
| Event annotation | Incident/penalty/overtake/weather/narrative. | Contact DNF, restart gain, rain. |
| Asset | A linked media/report object. | Result PDF, article, allowed clip. |

Sports-car/endurance results need an explicit car-driver distinction. A car classification such as the Rolex 24 result belongs to the car/class entry, while driver participation belongs to each co-driver on that entry. Store `resultGrain: car_driver`, preserve co-drivers in `raw.coDrivers`, and keep `finishPosition`/`fieldSize` separate from `classFinishPosition`/`classFieldSize`.

## Canonical Entities

### `drivers`

Required fields:

- `id`: stable slug, e.g. `driver_bryce_aron`
- `displayName`
- `givenName`
- `familyName`
- `nationality`
- `hometown`
- `dateOfBirth`
- `externalIds`: object keyed by source, e.g. `indynxtDriverId`, `raceControlDriverId`, `driverDbId`
- `provenanceRefs`

### `series`

Fields:

- `id`
- `name`
- `category`: `karting`, `formula`, `sports_car`, `other`
- `ladderLevel`
- `governingBody`
- `countryScope`
- `officialWebsite`
- `provenanceRefs`

Examples: INDY NXT, GB3, Euroformula Open, Formula Regional Oceania, IMSA WeatherTech, F1600, Formula Ford, karting championships.

### `teams`

Fields:

- `id`
- `name`
- `seriesIds`
- `country`
- `officialWebsite`
- `provenanceRefs`

### `cars`

Fields:

- `id`
- `seriesId`
- `seasonYear`
- `chassis`
- `engine`
- `tireSupplier`
- `class`
- `carNumber`
- `entrant`
- `teamId`
- `liveryNotes`
- `provenanceRefs`

Use this to avoid comparing cars/series as if all equipment were equivalent.

### `tracks`

Fields:

- `id`
- `name`
- `canonicalName`
- `country`
- `region`
- `city`
- `latitude`
- `longitude`
- `timezone`
- `trackType`: `street`, `road`, `oval`, `karting`, `mixed`, `unknown`
- `configuration`
- `lengthKm`
- `lengthMi`
- `direction`: `clockwise`, `counterclockwise`, `mixed`, `unknown`
- `surface`
- `elevationM`
- `cornerCount`
- `passingDifficulty`
- `brakingSeverity`
- `temporary`
- `altitudeM`
- `metadataSourceUrl`
- `coordinateSourceUrl`
- `metadataConfidenceTier`
- `metadataNotes`
- `weatherJoinReady`
- `weatherJoinReadiness`
- `provenanceRefs`

Optional analysis tags:

- `layoutFamily`
- `cornerSpeedProfile`
- `gripProfile`
- `runoffProfile`
- `pitLaneDeltaSeconds`
- `historicalCautionRate`

### `seasons`

Fields:

- `id`
- `year`
- `seriesId`
- `driverId`
- `teamIds`
- `carIds`
- `championshipPosition`
- `points`
- `starts`
- `wins`
- `poles`
- `podiums`
- `top5`
- `top10`
- `dnfs`
- `provenanceRefs`

### `events`

Fields:

- `id`
- `seriesId`
- `seasonYear`
- `name`
- `round`
- `eventStartDate`
- `eventEndDate`
- `trackId`
- `country`
- `officialEventId`
- `provenanceRefs`

### `sessions`

Fields:

- `id`
- `eventId`
- `sessionType`: `practice`, `qualifying`, `race`, `heat`, `warmup`, `test`, `unknown`
- `sessionName`
- `raceNumber`
- `scheduledStart`
- `actualStart`
- `timezone`
- `timezoneSource`
- `timezoneProvenanceRef`
- `timePrecision`: `date_only`, `local_datetime`, `utc_datetime`, `not_applicable`, `unknown`
- `timeWindowApplicability`: `physical_session`, `not_applicable_aggregate_classification`
- `weatherJoinEligible`
- `derivedFromSessionIds`
- `lapsScheduled`
- `distanceScheduled`
- `status`
- `officialSessionId`
- `weatherObservationRefs`
- `ingestionState`: `scheduled`, `live`, `provisional`, `official`, `corrected`, `archived`
- `broadcastRouteRefs`
- `notificationRefs`
- `provenanceRefs`

### `results`

This is the most important table.

Fields:

- `id`
- `sessionId`
- `driverId`
- `teamId`
- `carId`
- `carNumber`
- `class`
- `gridPosition`
- `startPosition`
- `finishPosition`
- `classifiedPosition`
- `finishPercentile`
- `fieldSize`
- `classFinishPosition`
- `classFieldSize`
- `lapsCompleted`
- `lapsScheduled`
- `lapsLed`
- `points`
- `status`: `running`, `dnf`, `dns`, `dsq`, `crash`, `contact`, `mechanical`, `penalty`, `unknown`
- `statusRaw`
- `totalTime`
- `gapToLeader`
- `gapToAhead`
- `averageSpeed`
- `bestLapTime`
- `bestLapNumber`
- `bestLapRank`
- `pitStops`
- `penaltyRefs`
- `incidentRefs`
- `sourceResultId`
- `resultGrain`: `driver`, `car_driver`, `team_car`, `unknown`
- `provenanceRefs`

Derived fields may be generated later:

- `startToFinishDelta`
- `teammateFinishDelta`
- `teammateQualifyingDelta`
- `reliabilityAdjustedFinish`
- `fieldStrengthAdjustedScore`

### `qualifyingResults`

Some sources keep qualifying separate from race results.

Fields:

- `id`
- `sessionId`
- `driverId`
- `teamId`
- `carId`
- `position`
- `bestLapTime`
- `gapToPole`
- `laps`
- `sessionSegment`
- `penaltyApplied`
- `gridPositionResulting`
- `provenanceRefs`

### `lapSamples`

Fields:

- `id`
- `sessionId`
- `driverId`
- `lapNumber`
- `lapTime`
- `position`
- `gapToLeader`
- `gapToAhead`
- `sector1`
- `sector2`
- `sector3`
- `speedTrap`
- `flagState`
- `pitIn`
- `pitOut`
- `tireAge`
- `sourceTimestamp`
- `carId`
- `carNumber`
- `class`
- `averageSpeedKph`
- `sessionElapsed`
- `isValid`
- `isSessionBest`
- `isPersonalBest`
- `provenanceRefs`

Store only when a source genuinely provides lap-level data.

### `racecraftEvents`

Fields:

- `id`
- `sessionId`
- `driverId`
- `lapNumber`
- `eventType`: `start_gain`, `start_loss`, `overtake`, `passed`, `restart_gain`, `restart_loss`, `pit_stop`, `incident`, `avoidance`, `penalty`, `mechanical`, `strategy`, `flag_change`, `note`
- `positionBefore`
- `positionAfter`
- `otherDriverIds`
- `description`
- `confidence`
- `provenanceRefs`

Manual race-report extraction is acceptable if marked manual and source-backed.

### `penalties`

Fields:

- `id`
- `sessionId`
- `driverId`
- `lapNumber`
- `penaltyType`
- `reason`
- `served`
- `positionImpact`
- `timeImpactSeconds`
- `provenanceRefs`

### `incidents`

Fields:

- `id`
- `sessionId`
- `driverId`
- `lapNumber`
- `incidentType`
- `description`
- `outcome`
- `otherDriverIds`
- `provenanceRefs`

### `weatherObservations`

Fields:

- `id`
- `trackId`
- `sessionId`
- `observedAt`
- `source`
- `stationId`
- `latitude`
- `longitude`
- `distanceFromTrackKm`
- `ambientTempC`
- `trackTempC`
- `trackTempSource`: `official_timing`, `broadcast_graphic`, `trackside_station`, `team_note`, `weather_api_surface_model`, `unknown`
- `trackCondition`: `dry`, `damp`, `wet`, `mixed`, `rubbering_in`, `unknown`
- `gripLevel`: `high`, `medium`, `low`, `unknown`
- `airDensityKgM3`
- `relativeHumidityPct`
- `dewPointC`
- `windSpeedKph`
- `windGustKph`
- `windDirectionDeg`
- `precipitationMm`
- `precipitationType`
- `pressureHpa`
- `cloudCoverPct`
- `wetDry`: `dry`, `damp`, `wet`, `mixed`, `unknown`
- `confidence`
- `provenanceRefs`

Historical weather must be tied to session time and timezone. If exact session time is unknown, record the approximation window.

Source priority for conditions:

1. Official timing/scoring or session report track/air condition fields.
2. Official race-control or trackside station readings.
3. Broadcast graphics only when timestamped or clearly tied to the session.
4. Team/driver notes with permission.
5. Public station observations, e.g. NCEI, for ambient weather.
6. Reanalysis/grid APIs, e.g. Open-Meteo, for broad historical context.

Track temperature, track condition, wet/dry state, and grip tags should never be inferred from ambient temperature alone. If inferred from precipitation, reports, or visual/broadcast evidence, mark the confidence and source type accordingly.

Weather quality fields should be added when enrichment begins:

- `timeWindowStart`
- `timeWindowEnd`
- `timeWindowReason`: `exact_session`, `scheduled_session`, `event_day_midpoint`, `manual_estimate`
- `trackCoordinateSource`
- `weatherSourceType`: `station_observed`, `grid_reanalysis`, `series_report`, `manual_inference`
- `timeConfidence`: `exact`, `high`, `medium`, `low`
- `locationConfidence`: `track_exact`, `nearby_station`, `regional_grid`, `low`
- `joinNotes`

### `mediaAssets`

Fields:

- `id`
- `assetType`: `article`, `photo`, `video`, `pdf`, `timing_sheet`, `result_sheet`, `social_post`, `quote`, `track_map`
- `title`
- `url`
- `rightsStatus`: `link_only`, `embeddable`, `permissioned`, `owned`, `unknown`
- `publishedAt`
- `eventId`
- `sessionId`
- `driverId`
- `summary`
- `quoteText`
- `provenanceRefs`

### `broadcastRoutes`

Fields:

- `id`
- `eventId`
- `sessionId`
- `providerName`
- `providerType`: `tv`, `streaming`, `radio`, `app`, `international`, `other`
- `url`
- `requiresSubscription`
- `territory`
- `source`
- `validFrom`
- `validTo`
- `provenanceRefs`

### `notificationRules`

Fields:

- `id`
- `userScope`: `default`, `friend_group`, `individual`
- `triggerType`: `session_reminder`, `green_flag`, `position_change`, `pit_stop`, `status_change`, `win`, `podium`, `checkered`, `official_result_posted`
- `leadTimeMinutes`
- `enabled`
- `deliveryChannels`: `push`, `email`, `sms`, `in_app`
- `deepLinkTarget`
- `provenanceRefs`

### `notificationEvents`

Fields:

- `id`
- `sessionId`
- `triggerType`
- `createdAt`
- `title`
- `body`
- `deepLinkUrl`
- `broadcastRouteId`
- `sourceSnapshotId`
- `sentAt`
- `status`
- `provenanceRefs`

Do not store copyrighted article bodies or protected video. Store links and short summaries.

### `sourceEvidence`

Every extracted fact should point here.

Fields:

- `id`
- `sourceType`: `official_api`, `official_page`, `official_pdf`, `team_page`, `driver_page`, `aggregator`, `news`, `manual_note`, `social`, `weather_api`
- `sourceName`
- `url`
- `retrievedAt`
- `publishedAt`
- `accessedBy`
- `licenseNotes`
- `confidenceTier`: `official`, `high`, `medium`, `low`
- `coverage`
- `parser`
- `rawArtifactPath`
- `notes`

## Confidence Rules

| Tier | Meaning | Examples |
| --- | --- | --- |
| `official` | Series/team/driver/results-system source. | INDY NXT API, official PDF, GB3 results page. |
| `high` | Reputable source corroborated by official or multiple independent sources. | Racing database matching official rows. |
| `medium` | Aggregator or article with plausible but unverified details. | DriverDB career totals before row-level verification. |
| `low` | Manual inference, incomplete article, or uncorroborated detail. | Track condition inferred from race report wording. |

Conflict resolution:

1. Prefer official session result over aggregator.
2. Prefer official PDF/API row over article text.
3. Keep conflicting values as separate `sourceEvidence` entries until resolved.
4. Never delete a conflicting source; mark the chosen value and explain why.

## Duplicate Matching

Canonical IDs should be deterministic slugs:

- `driver_bryce_aron`
- `series_indy_nxt`
- `track_wwtr`
- `event_indy_nxt_2026_wwtr`
- `session_indy_nxt_2026_wwtr_race`
- `result_indy_nxt_2026_wwtr_race_bryce_aron`

Match events by:

1. series + season + official event/session ID
2. series + date + track + race number
3. normalized event/session name fallback

Match tracks by:

1. official venue ID if available
2. normalized name + country/region
3. coordinates within a tight tolerance

## Validation Gates

Minimum dataset validation:

- All IDs are unique within each collection.
- All references point to existing IDs.
- Every result has at least one provenance reference.
- Every official result row has source URL and retrieved timestamp.
- Every session belongs to an event and every event belongs to a series and track.
- Every weather row has either exact session link or approximation notes.
- Derived metrics must declare inputs and formula.
- Unsupported data categories stay empty rather than seeded with fake data.

## File Layout

```text
data/career/
  career.dataset.json          canonical normalized dataset
  sources.manifest.json        known source inventory and workstream status
  raw/                         fetched raw artifacts, grouped by source
  staging/                     per-agent extracted JSON before normalization
  reports/                     validation reports and coverage summaries

docs/
  CAREER_DATA_SPEC.md
  CAREER_RESEARCH_WORKSTREAMS.md
```

Future app-facing data can later be split into a database, but the canonical JSON shape should remain exportable so research, validation, and UI integration stay reproducible.

## Analytics Targets

Once populated, the dataset should support:

- career timeline
- all races/sessions by year/series
- track-type splits
- weather-adjusted performance
- teammate-adjusted performance
- field-strength-adjusted finish score
- qualifying-to-race conversion
- start/restart performance
- reliability-adjusted finish distribution
- DNF/incident taxonomy
- best drives and worst-luck races
- upcoming-track similarity comps
- media-rich career story mode
