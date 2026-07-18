# Field and granularity dictionary

“Present in a row” is not the same as “newly measured at that row.” Cadence below describes observed change/measurement semantics, not serialization frequency.

## Current BryceCast live archive

Observed poll cadence: median about 1.002 seconds in the two complete Mid-Ohio races and 1.001 seconds in Nashville Practice 1.

| Field/family | Source-native or derived | Observed update behavior | Safe meaning | Unsafe interpretation |
|---|---|---|---|---|
| `checked_at` | BryceCast receive timestamp | each poll | when BryceCast observed the payload | source measurement time |
| event/session IDs and names | source metadata | session/asynchronous | active public-feed identity | requested historical session |
| `trackFlag` / session status | source state | flag event; repeated each poll | currently published session flag | physical incident time |
| `overallTimeToGo`, flag clocks | source state | about once per second while active | session/flag clock state | car movement |
| `rank`, `liveRank` | source state | event/lap driven; semantics vary by practice/qualifying/race | published session order when source context is valid | physical on-track order in all session types |
| `gap` | source state | mostly lap/event driven | published classification gap | continuous adjacent proximity |
| `liveGap` | source state | about every 3–6 seconds in audited sessions | adjacent timing gap proxy | GPS, distance, turn separation |
| `liveDiffs` | source state | about every 3–4 seconds where populated | feed-provided adjacent interval objects; identity must be checked | automatically reliable `diff` semantics |
| `diff` | source state | asynchronous/bursty; semantics not fully validated | preserve raw only pending contract | stable closing rate |
| laps, last/best/average lap time and speed | source state | lap-line driven | completed-lap timing | instantaneous speed |
| pit stops / last pit lap | source state | pit/lap event | published pit-state summary | fuel load or tire age |
| tire / overtake fields | source state | asynchronous and sparsely changing | published categorical state if independently validated | complete tire/fuel strategy |
| `lapDistance` | source field | zero in all audited NXT Bryce records | unavailable/disabled | longitudinal track position |
| point fields | source state | static in-session in audited races | supplied points context | real-time risk feature |
| drivers/config/schedule/trackactivity payloads | source enrichment | usually unchanged for long spans | metadata as last fetched | per-second new information |

Representative Bryce field change intervals:

| Session | Poll rows | `liveGap` changes / median interval | laps changes / median interval | rank changes / median interval | `lapDistance` |
|---|---:|---:|---:|---:|---|
| 2026 Mid-Ohio Race 1 (`5544-6761`) | 3,317 | 688 / 4.029 s | 35 / 75.060 s | 7 / 76.208 s | always zero |
| 2026 Mid-Ohio Race 2 (`5543-6760`) | 3,086 | comparable ~4 s | lap driven | event driven | always zero |
| 2026 Nashville Practice 1 (`5538-6924`) | 2,783 | 418 / 3.004 s | 47 / 27.029 s | 31 / 30.017 s | always zero |
| 2026 Road America Race 2 (`5537-6754`) | 1,175, partial | 250 / 6.002 s | 13 / 117.241 s | 8 / 176.119 s | always zero |

The Road America archive has a 1,602.864-second gap and is partial. It must not be forward-filled as a continuous race.

## Current canonical historical INDY NXT dataset

| Field/family | Lineage | Grain | Timestamp/location support | Model role |
|---|---|---|---|---|
| event/session metadata | official `SeasonDropDown` | event/session | scheduled date/time where published | grouping/split keys |
| start, finish, laps, final gap, points, status | official `EventsSessionDetails` | final car/session | no point-in-time chronology | outcomes and stable identities; never pre-event features |
| lap position | official Lap Chart PDF | car/completed lap | lap number only | lap-boundary order and movement |
| full-field lap time/speed | not populated by Lap Chart parser | unavailable there | none | unavailable |
| leader lap time/speed/gap/flag | Leader Lap Summary PDF | leader/completed lap | lap number; not wall-clock | leader pace and lap-level flag context |
| named section time/speed | Section Results PDF | car/lap/section | section name and lap; no absolute crossing time or coordinates | section pace; possible loop-level aggregates |
| best section time/speed | Top Section Times PDF | car/section best | best-lap reference only | descriptive pace, not chronology |
| position/total passes | Event Summary PDF | session aggregate | none | post-race description only |
| penalty | Results PDF | incident/penalty row | lap where published | post-race label/context |
| caution | Results PDF | one caution episode | start/end lap; textual turn/cause sometimes | next-lap label; not precise onset |
| terminal incident | final API status | car/session | no event time or pair | outcome only; can overlap cautions |
| weather | Open-Meteo model | session window | modeled hourly/sub-hourly time | contextual prior only with point-in-time cutoff |

Canonical caution-label inventory:

- 72 official caution-summary episodes across 34 race sessions;
- 50 contact, 8 off-course, 4 debris, and 10 generic;
- 65 name a turn in the official text;
- only 27 name two or more cars;
- start/end labels are laps, not seconds;
- the broader 144 incident rows include terminal statuses that may overlap caution episodes.

These are approximately 72 positive episodes, not 70,061 independent positive/negative lap-sample rows and not millions of independent one-second training examples.

## RaceTools candidate replay archive

Provenance label: **third-party replay capture of the official pit-lane timing-and-scoring feed**.

| Record/family | Observed/documented cadence | Source or derived | Safe meaning | Validation still required |
|---|---|---|---|---|
| `$H` heartbeat | exact consecutive 1-second epochs in both Barber samples | source log message | replay clock/heartbeat continuity | session start/end boundaries and drop behavior across more tracks |
| timing-line/section messages (`$S`, `$L`, `$T`, others) | event driven | source log messages | transponder/timing activity at defined points | message schema, car key, timestamp unit, duplicate semantics |
| order/car messages (`$O`, `$C`) | asynchronous/event driven | mixed source state | published competitor/order state | exact field mapping and whether any fields are RaceTools-calculated |
| flag/control messages (`$F`, `$A`, `$R`, `$M`) | event driven | source log messages | candidate flag/restart/control events; tested samples include millisecond `Yellow Flag at` text with reason/car/turn | align every transition to official reports; distinguish flag time from physical incident time; identify message gaps |
| track definition (`$U`) | session/config | source/log configuration | track length and named timing-point labels | physical coordinates and turn mapping; labels alone are not geometry |
| weather (`$W`) | asynchronous | source log message | candidate point-in-time weather feed | units, station, completeness, source lineage |
| `$P` position/telemetry-like messages | present in 2024 sample, absent from top 2025 families | unknown | preserve raw only | whether loop projection, lap distance, or real telemetry; do not call GPS |
| one-row-per-lap CSV | lap completion | RaceTools derived/exported | convenient lap/section/TOD/weather summary | calculation method and missingness |
| `GapOnTrack`, projected track-map position | crossing/event updates plus interpolation | RaceTools calculated | derived timing-loop estimate | never label as observed GPS or Euclidean separation |

Observed sample field drift matters. The 2024 derived CSV contains lap/section/TOD/tire/overtake fields; the 2025 CSV additionally contains start-finish time, trap speeds, pit-in crossing, track/ambient temperature, humidity, pressure, wind speed, and wind direction. A single cross-season schema must retain presence/missingness and source version.

Archive filenames are not sufficient identity. One 2025 Indianapolis Race 1-labelled ZIP is a 22-session mixed NXT/INDYCAR capture. Ingestion must reject any file whose preamble/session markers do not resolve to exactly the expected event, series, and session window.

## Candidate adjacent archives: non-transferable lessons

| Source/series | Useful lesson | Why it cannot be substituted for INDY NXT |
|---|---|---|
| TSL Timing / GB3 | official PDFs and lap/sector result exports can establish lap/sector coverage for Bryce’s earlier career | different timing operator, identifiers, sections, reports, rules, and rights |
| IMSA / Al Kamel | public result archives and licensed JSON/GPS products show that replay/history can be a provider feature | different protocol, multiclass semantics, GPS options, and licensing |
| OpenF1 / FastF1 | explicit raw-versus-interpolated telemetry provenance is the right design standard | different championship, sensors, cadence, vehicle/rule regimes, and unofficial API status |
| RACECAR autonomous-racing dataset | shows the 2-D/3-D sensors needed for genuine collision geometry | autonomous cars, limited scenarios, different tracks and behavior; not training data for INDY NXT humans |

## Non-negotiable provenance fields for any future normalized table

Every normalized observation should carry:

- `source_id` and immutable source checksum;
- `event_id`, `session_id`, series, season, session type;
- source timestamp and BryceCast receive timestamp separately;
- `observation_kind` (`heartbeat`, `loop_crossing`, `state_update`, `derived_snapshot`, `interpolated_position`, `final_result`);
- stable source car/driver key plus crosswalk version;
- timing point/loop identifier and mapping version;
- `source_state` (`official`, `third_party_capture`, `derived`, `modeled`, `manual`);
- `confidence` and explicit missingness reason;
- derivation code/version for gap, closing rate, snapshot, or interpolation;
- licensing/use-status tag.

No normalized row may upgrade event-driven loop data to “observed one-second car position.”
