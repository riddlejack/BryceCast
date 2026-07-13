# Live F3 field dictionary and change-cadence matrix

Evidence: read-only `race_snapshots.payload_json` from Mid-Ohio Race 1 (`5544-6761`, 3,317 samples) and Race 2 (`5543-6760`, 3,086 samples), normalized through the production `/api/timing` row adapter. Median archive interval was 1.002 seconds in both sessions. Cadences below describe Bryce unless marked field-wide. `Exact` means the meaning is explicit in the field or existing source contract; `derived` means the UI transformation is ours; `inferred` means archive relationships support a meaning but no official schema documentation was found; `unknown` means the archive is insufficient.

## `/api/readiness` top level

| Field | Source | Semantics / unit | Observed cadence | Confidence | Safe Live use |
| --- | --- | --- | --- | --- | --- |
| `schemaVersion` | BryceCast reducer | Contract version (`live-readiness.v1`) | Static | Exact | Compatibility gate. |
| `checkedAt` | Replay/runtime reducer | ISO timestamp for the selected source record, wall-clock-shifted in replay | New archive record at approximately 1s | Exact | Freshness, deduplication, timestamped history. |
| `state` | BryceCast reducer | `ready`, `degraded`, `pre_session`, `wrong_series`, `stale`, `blocked` | Only on source/gate changes | Derived, exact contract | Hard render gate; do not animate in stale/wrong-session states. |
| `severity` | BryceCast reducer | Green/amber/red presentation class | With `state` | Derived | Status copy/color with text. |
| `reason` | BryceCast reducer | Human-readable reason for state | With `state` | Derived | Trust rail and unavailable state. |
| `raceWeekend` | Heartbeat + track activity/schedule | Session identity, track, flag/lap, route | Identity/route static; flag event-driven; lap about 71–72s | Mixed | Race identity, flag, lap completion, official watch links. |
| `liveTiming` | Race Control timing | Normalized heartbeat + field rows | Payload every ~1s; individual fields vary | Exact normalization | Primary Live state. |
| `bryce` | Timing + drivers feed | Guarded car 9 row, profile, identity result, route | Row varies by field; profile/guard static | Exact guard | Bryce hero and identity/provenance. |
| `points` | Race Control points fields + historical fallback | Published running/total values and coverage mode | Rank/points events, not every loop | Exact source; ordered, not locally scored | Provisional championship window with reconciliation warning. |
| `weather` | Weather service; not captured in replay | Conditions/probes/cache state | Replay: unavailable/static | Exact unavailability | Render only when source state is live/partial and labeled. Never infer from archive. |
| `replay` | Read-only SQLite archive | Archive coverage, rows, selected session, simulation label | Coverage static; selected tail advances | Exact | Replay trust state and time-series history. |
| `sources` | Source health reducer | Endpoint role, status, freshness, readiness | Timing per record; enrichment by its own cadence | Exact/derived | Source drawer and diagnostics, not primary visual motion. |
| `gates[]` | Readiness reducer | Reachability, series, identity, freshness, enrichment, points, weather, replay | With underlying source state | Derived | Explain why Live is/is not eligible. |

## Normalized heartbeat in `/api/readiness.liveTiming.heartbeat` and `/api/timing.heartbeat`

| Field | Semantics | Race 1 / Race 2 cadence | Confidence | Safe use |
| --- | --- | --- | --- | --- |
| `eventName`, `eventId`, `eventSessionId` | Official active event/session identity | Static in each session | Exact | Session key and title. |
| `sessionName`, `sessionType` | `Race 1`/`Race 2`, `R` | Static | Exact | Context label. |
| `sessionStatus`, `flag` | WARM/GREEN/YELLOW/CHECKERED/COLD state | 10 / 5 changes | Exact | Status chip, caution/red treatment, event tape. |
| `series` | Race Control series code (`L` for this INDY NXT feed) | Static | Exact within guard | Series gate only; do not expose the code without a label. |
| `lap` | Leader/session lap number | Median 72.145s / 71.127s | Exact | Lap label and explicit race-completion bar. Not car location. |
| `totalLaps` | Scheduled race laps | Static (35 / 30) | Exact | Completion denominator. |
| `trackName`, `trackType` | Circuit and Race Control type (`RC`) | Static | Exact | Static outline selection and context. |

Raw heartbeat fields retained in the archive but omitted by the compact API: `preamble`, `trackLength`, `flagTimes`, `flagCounts`, `isDoubleHeaderQualifying`, `overallTimeToGo`, `leadChanges`, `raceLeaders`, `SecondEventID`, `SecondEventSessionID`, and `EventSessionLabel`. `overallTimeToGo` and `flagTimes` changed at ~1.003s and are promising for a sourced race-clock/event-tape enhancement; they require an intentional typed API addition. The remaining identity/config fields are static or event-driven.

## Every normalized `/api/timing.rows[]` field

| Field | Source semantics / unit | Race 1 cadence | Race 2 cadence | Confidence | Safe Live use |
| --- | --- | ---: | ---: | --- | --- |
| `driverId` | Race Control `DriverID`, string | Static | Static | Exact | Stable React/DOM identity across rank changes. |
| `no`, `firstName`, `lastName`, `name`, `team` | Driver/session identity | Static | Static | Exact | Labels, teammate context. |
| `bryce` | DriverID/name/car-9 guard result | Static | Static | Derived, exact contract | Bryce highlighting; never match car number alone. |
| `rank` | Published running rank | 7 changes | 3 changes | Exact field, event-driven | Position, official reorder. |
| `liveRank` | More immediate published running rank | 11 changes | 5 changes | Exact field name; event-driven | Battle ordering and FLIP reorder; retain `rank` for audit comparison. |
| `startPosition` | Grid/start position | Static | Static | Exact | Start-to-current delta, not motion. |
| `status`, `comment` | Active/retired/penalty-style state and detail | Bryce stayed Active; comment empty | Same | Exact when present | Replace numeric gap when not running; incident/event tape. |
| `diff` | Published gap to leader at timing/lap-line updates, seconds or lap/status text | 338 bursty changes; frozen in representative green loops | 315 bursty changes | Exact display field, cadence not continuous | Full-session lap-line trace and field gap. Not smooth motion. |
| `gap` | Published interval to preceding ranked car at timing/lap-line update, seconds or status text | 54 changes; median 72.359s | 51; median 70.882s | Exact display field | Lap-line interval/table annotation. Not neighbor animation. |
| `liveGap` | Live interval to preceding `liveRank` row, decimal seconds when usable | 688 changes; median 4.030s | 598; median 4.010s | High-confidence inferred | Highest-frequency safe battle field. Cumulatively walk adjacent rows around Bryce; missing/non-decimal stops that side. |
| `laps` | Driver completed laps | 35 changes; median 75.060s | 30; median 72.129s | Exact | Driver lap/status context and same-lap validation. |
| `bestLapTime`, `bestSpeed` | Best lap time and mph | Lap/event driven; 10 changes | 16 changes | Exact | Compact performance stat; not interpolated. |
| `lastLapTime`, `lastSpeed`, `averageSpeed` | Latest completed-lap time and mph / running average mph | 35 changes; median 75.060s | 30; median 72.129s | Exact | Lap card and trend points at lap boundaries. Not instantaneous telemetry. |
| `passes`, `passed` | Race Control pass counters | 2 / 5 changes | 2 / 1 changes | Exact counters | Event highlights and net-pass context, with source label. |
| `pitStops`, `lastPitLap`, `sincePitLap` | Stop count / lap of last stop / laps since | Bryce 0/0; `sincePitLap` followed lap | Same | Exact fields; no pit sequence detail | Show only when nonzero; do not invent tire/service duration. |
| `tire` | Published code (`P` throughout both Bryce traces) | Static | Static | Exact code, display meaning not proven | Diagnostics only until code legend is sourced. |
| `overtakeRemain` | Published remaining push-to-pass/overtake count | 12 changes; median 77.349s | 13; median 77.316s | Exact count name | Discrete resource counter, not continuous animation. |
| `overtakeActive` | Published active state | Empty in captured rows | Empty | Unknown | Do not display until a non-empty state validates representation. |
| `lapDistance` | Published numeric field | Zero in all 3,317 + 3,086 Bryce samples | Zero | Unknown/unusable | Excluded. Never treat as physical progress or GPS. |
| `liveDiffAhead` | Integer that internally behaves like cumulative live gap-to-leader in microseconds in synchronized same-lap rows | 638 changes; median 4.026s | 544; median 4.007s | Inferred, semantically unsafe direct | Audit cross-check only. Not used by UI. |
| `liveDiffBehind` | Large integer, apparent live timing delta in microseconds but reference target is unproven | 641 changes; median 4.014s | 551; median 4.006s | Unknown | Excluded from product UI. |
| `runningDriverPoints` | Race Control provisional running points | 7 changes | 4 changes | Exact published field | Provisional championship ordering. |
| `totalDriverPoints` | Published driver points field; zero in these captures | Static | Static | Exact field, feed behavior caveat | Coverage/debug, not headline when zero conflicts with historical total. |
| `totalEntrantPoints` | Published entrant/running points field | 7 changes | 3 changes | Exact published field | Source comparison; UI uses `runningDriverPoints`. |

### `liveGap` validation decision

For active, same-lap samples where Bryce's `liveGap` had just changed, the relationship `(Bryce.liveDiffAhead - preceding-liveRank.liveDiffAhead) / 1,000,000 == Bryce.liveGap` held for 575/618 values (93.0%) in Race 1 and 475/524 (90.6%) in Race 2. The mismatches cluster around asynchronous per-row updates and state transitions. This is enough to validate the stated adjacent-interval meaning of the directly published `liveGap`, not enough to promote either `liveDiff*` field to the UI. The implementation therefore trusts a numeric `liveGap` as one sourced interval, cumulatively walks only contiguous valid intervals, and pauses a side on missing/non-numeric data.

## Raw timing fields captured but not exposed by the compact row

| Fields | Cadence / interpretation | Decision |
| --- | --- | --- |
| `resultID`, `EntrantID`, `TeamID`, `DriverID` | Static identifiers; `DriverID` is now exposed as `driverId` | Use `driverId` for identity; keep remaining IDs backend-only. |
| `marker` | 16 Race 1 / 23 Race 2 changes for Bryce | Potential incident/pit/status event marker after value dictionary audit. |
| `overallRank` | Mirrored `rank` in captures | Redundant. |
| `race2Rank` | Zero/static | Unusable here. |
| `bestLap`, `qualSpeed`, `qualTime` | Best-lap event cadence; qualifying fields mirrored best-lap data during race | Prefer normalized best-lap fields; do not label race `qual*` without a source contract. |
| `secondQualSpeed`, `secondQualTime` | Empty | Unavailable. |
| `lapsLed` | Zero/static for Bryce | Safe discrete stat when nonzero. |
| `totalTime` | Lap-line/burst updates | Backend/replay audit; not continuous clock. |
| `onTrack` | Four changes in each race | Useful discrete pit/on-track state if exposed with `status`; no location implication. |
| `flagStatus` | Session/event changes | Redundant with heartbeat flag for Bryce UI. |
| `equipment`, `license` | Static codes/text | Profile/source drawer only. |
| `NTRank`, `QualAttempts` | Zero/static | Unavailable in these races. |

## Bryce profile, route, points, weather, replay, sources, and gates

| Group | Fields | Source/cadence | Safe product use / caveat |
| --- | --- | --- | --- |
| Identity guard | `carNumber`, `rcDriverId`, `matchedBy`, `seriesOk` | Reducer; static per selected session | Mandatory eligibility proof. DriverID 2143 or exact-name guard; car 9 alone is insufficient. |
| Driver profile | `seriesid`, `name`, `firstname`, `lastname`, `driverid`, `rc_driver_id`, `team`, `teamid`, `rookie`, `number`, imagery, `radiofrequency`, flag, birth/size/hometown/residence/site/social fields, `stats`, `career_stats` | `drivers_nxt`; effectively static during race | Identity art/bio/source drawer. Frequency is metadata, not a radio stream. Profile stats can lag live points. |
| Broadcast route | Event/session IDs, names/types/times, `primaryVideo`, `alternates`, `audio`, `international`, `source`, `note` | Trackactivity matched by EventSessionID; static during session | Official deep links only. Availability/territory/PiP remain external. |
| Points payload | `mode`, `source`, `label`, Bryce values, `fieldCoverage`, `officialModelAvailable`, `reconciliationRequired`, warnings | Timing fields; changes on rank/points events | Order published running points only; label provisional; reconcile after official result. |
| Weather | Schema/check time, source state, track, probes, cache, warnings | Not captured in replay | `unavailable` is the correct replay state. Never reconstruct conditions from race timing. |
| Replay | Availability/archive state/counts/session list/summary/rows/warnings + simulation metadata | Read-only SQLite; selected tail advances | History and deterministic QA. Always label simulated replay as non-live. |
| Sources | Endpoint IDs/roles/series/cadence/status/source/readiness/freshness/source summary/note + checkedAt | Timing ~1s; enrichment medium/slow | Diagnostics and trust drawer. Source freshness gates animation. |
| Gates | `timing_reachable`, `indy_nxt_heartbeat`, `bryce_identity`, `timing_freshness`, `enrichment_sources`, `points_fields`, `weather`, `replay_archive` | Reducer over source state | Explain readiness. Weather/replay warnings do not override valid core timing unless contract says so. |

## Unsafe/static summary

- Static between timing loops: session/track identity, driver identity/team/start position, total laps, profile, route, tire code, most pit fields, and many raw IDs.
- Lap/event cadence: `rank`, `liveRank`, `gap`, laps, lap times/speeds, pass counters, overtake remaining, points, flags.
- Useful sub-lap cadence: `liveGap` (about every 4s), with missing-value breaks. `overallTimeToGo`/`flagTimes` are ~1s raw heartbeat candidates but are not in the current compact API.
- Semantically unsafe: `liveDiffBehind`; direct UI use of either `liveDiff*`; `lapDistance`; empty `overtakeActive`; tire code meaning without a legend; any inferred physical position, GPS path, car speed between completed laps, or radio/POV claim.
