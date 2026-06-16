# BryceCast UI Analytics Product Contract

Generated: 2026-06-16

Baseline lane: `e24edd0 Plan UI readiness execution lanes`

## Contract Position

This is the product and analytics contract the frontend should build against before any redesign work starts. It is not a UI implementation plan and it does not change ingestion. The controlling rule is source-backed specificity: every v1 surface either names an existing dataset artifact/API endpoint or renders an explicit unavailable/deferred state.

INDY NXT is the reference-rich product surface. Career-wide views are still valuable, but they must be metric-family views with coverage badges because older series do not expose the same lap, section, incident, pit, weather, or live timing fields.

## Source Precedence

1. `data/career/career.dataset.json`
2. Generated reports under `data/career/reports/`
3. UI analytics artifacts under `analysis/indy-nxt-discovery/output/` and `analysis/career-parity/output/`
4. Live/local API routes from `scripts/api-server.mjs`
5. Prose docs only after the generated artifacts above

Current generated-report facts:

- `data/career/reports/validation-report.json`: `errorCount` is `0`; warning count is `1` for 9 physical sessions without exact `scheduledStart` or `actualStart`.
- `data/career/reports/ingestion-summary.json`: generated `2026-06-16T18:12:35.595Z`; 9 open gaps; no priority gaps.
- `data/career/reports/career-coverage-matrix.json`: generated `2026-06-16T18:12:36.313Z`; INDY NXT has 45 events, 189 sessions, 36 completed race sessions, 738 race rows, 87 qualifying sessions, and no priority gaps.
- INDY NXT retains `gap_indy_nxt_qualifying_lap_reports` as a caveat ledger, not a dashboard blocker.

## Global UI Rules

- Every metric exposes a source drawer entry with artifact/API path, source family, confidence, caveat IDs when applicable, denominator, and last-generated or fetched time when available.
- Front-page caveats stay compact: confidence pills, availability badges, and a drawer/table. The drawer carries the audit detail.
- Live Race Control fields are not historical official result fields. UI gating and live points mode come from `/api/readiness`; live rank/gap/pit/tire/overtake detail can use `/api/timing`, `/api/bryce`, and upstream Race Control timing as underlying source/provenance. Historical results come from the career dataset and generated analytics artifacts.
- Points projection is required for live race v1 as a guarded card. The frontend must render the `/api/readiness.points` contract, not recompute or promote raw timing fields locally. The live source exposes `runningDriverPoints`, `totalDriverPoints`, and `totalEntrantPoints`; the card must render `race_control_live` only when `/api/readiness.points.mode` says so, `partial` when field coverage is sparse, and `historical_fallback`/`unavailable` when not populated or not reconciled. It is not blocked from the v1 product, but it must not invent points from local standings math until the live race contract proves the rule.
- Unsupported features are not hidden as if forgotten. Live GPS/moving-dot track map, live POV, team radio audio, detailed pit sequence, official INDY NXT weather, sector timing, tire/fuel strategy, and derived teammate/field-strength claims render as unavailable/deferred unless a later backend contract proves them.

## Screen Contract

### Race Weekend Prep

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prep_event_command_center` | v1 | Bryce, family/friends, serious fans | What weekend is coming up and how do I follow it? | `/api/session`, `/api/weather/upcoming`, `analysis/indy-nxt-discovery/output/deep_dive/tables/future_weekend_prep_inputs.csv` | event/session | `eventId`, `eventName`, `sessionId`, `sessionName`, `startsAt`, `estimatedGreenFlag`, `trackName`, `trackType`, `trackLengthMi`, `cornerCount`, `primaryVideo`, `audio`, `readiness`, `weatherState` | partial | Schedule feed timestamps lack explicit offsets; weather forecast readiness is live NWS, not official series weather. | schedule timeline + venue facts + watch/listen actions | Show source timestamp and "time needs normalization" badge when offset is missing; show weather readiness only when NWS route returns data. | view model |
| `prep_track_history` | v1 | Bryce, team/engineering, serious fans | What has Bryce done at this track or track type? | `future_weekend_prep_inputs.csv`, `race_track_type_summary.csv`, `career_result_conversion.csv` | event/session/series | `trackName`, `trackType`, `bryceIndyNxtRacesAtTrack`, `sameTrackAvgFinish`, `sameTrackAvgGain`, `sameTrackTop10Rate`, `trackTypeAvgFinish`, `trackTypeAvgGain`, `trackTypeTop10Rate` | available | Same-track counts can be small; use denominators in the drawer. | compact comparison cards + small bar set | If no same-track rows exist, fall back to track-type only. | historical analytics |
| `prep_practice_qualifying_funnel` | v1.5 | Bryce, team/engineering | Did practice and qualifying point toward a good race? | `prep_session_signals.csv`, `prep_session_correlations.csv` | session/result | `practiceSessionsWithBryce`, `qualifyingSessionsWithBryce`, `bestPracticeRank`, `avgPracticeRank`, `bestQualifyingRank`, `avgQualifyingRank`, `raceStart`, `raceFinish`, `raceGain`, `practiceFieldMedian` | source_bounded | Practice and group qualifying are context signals, not equivalent sessions. | funnel/slope card | Hide the correlation claim; show raw signals only when prep rows exist. | historical analytics |
| `prep_weather_window` | v1 | Bryce, family/friends, operator | What conditions may frame the session? | `/api/weather/live?trackId=...`, `/api/weather/upcoming` | event/session/source | `sourceState`, `readiness`, `station.id`, `observation.timestamp`, `temperature`, `windSpeed`, `windGust`, `windDirection`, `alerts`, `hourlyForecast`, `dailyForecast`, `cache.status`, `probes` | live_only | NWS weather is current/forecast context, not official series weather or track temperature. | weather strip + readiness badge | If one NWS leg fails, render partial with failed probe; if outside forecast window, show `too_far_for_event_forecast`. | live API |

### Live Race Companion

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `live_source_readiness` | v1 | operator, serious fans | Is this actually the right live INDY NXT session? | `/api/readiness`, `/api/sources` | source/session | `state`, `severity`, `reason`, `gates[]`, `sources.endpoints[]`, `raceWeekend.heartbeat`, `liveTiming.heartbeat`, `bryce.identityGuard`, Bryce row identity | live_only | Timing endpoint can point to top-series; require `/api/readiness` to prove INDY NXT heartbeat plus car 9 and `DriverID=2143` or exact Bryce identity. | source health banner + drawer | If `wrong_series`, `blocked`, or `stale`, show schedule/watch context and latest archived sample only as stale. | live API |
| `live_bryce_status_tile` | v1 | Bryce, family/friends | Where is Bryce right now and what changed? | `/api/bryce`, `/api/snapshot` | driver/session | `rank`, `liveRank`, `startPosition`, `status`, `comment`, `laps`, `gap`, `liveGap`, `diff`, `lastLapTime`, `bestLapTime`, `BestSpeed`, `LastSpeed`, `Passes`, `Passed`, `pitStops`, `onTrack` | live_only | Gap strings need label discipline; null and zero are different. | KPI tile + delta strip | If Bryce row missing, render wrong-session/no-Bryce state, not zeros. | view model |
| `live_timing_tower` | v1 | family/friends, serious fans | Who is around Bryce on track? | `/api/timing` | driver/session | `rows[].rank`, `liveRank`, `no`, `firstName`, `lastName`, `team`, `gap`, `liveGap`, `diff`, `status`, `laps`, `bryce` | live_only | Top-series car-number collisions must be guarded by Bryce identity predicate. | timing tower with Bryce focus band | If timing rows exist but Bryce is absent, show wrong-session tower disabled. | UI only |
| `live_gap_lap_trend` | v1.5 | Bryce, team/engineering, serious fans | Is the race trending toward or away from Bryce? | `/api/replay/bryce`, `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl` | lap/driver/source | `checkedAt`, `elapsedSeconds`, `rank`, `liveRank`, `startPosition`, `positionDelta`, `gap`, `liveGap`, `lastLapTime`, `passes`, `passed`, `netPasses`, `pitStops`, `sourceState` | replay_only | Current archive is tiny; full-session trend quality requires race watch capture. | rank/gap trend lines with source-state overlay | If archive state is missing/empty/tiny, show live tile only and a capture-needed state. | live API |
| `live_points_projection` | v1 | Bryce, family/friends, serious fans | What does the current running order mean for points? | `/api/readiness`; `/api/timing`/upstream `timingscoring-ris.json` only as underlying provenance | driver/session | `points.mode`, `points.source`, `points.bryce.runningDriverPoints`, `points.bryce.totalDriverPoints`, `points.bryce.totalEntrantPoints`, `points.bryce.historicalDriverPoints`, `points.fieldCoverage`, `points.warnings`, `state`, `liveTiming.heartbeat.EventSessionID` | live_only | Required v1 card. Display only the `/api/readiness.points` state; reconcile against official standings after session. Do not fabricate from local formula or promote raw timing fields outside the readiness reducer. | points delta card + compact field context | If point fields are null, missing, sparse, or stale, show the readiness fallback/warning and retain historical championship context separately. | live API |
| `live_weather_strip` | v1 | Bryce, family/friends | What is the current venue weather? | `/api/weather/live?trackId=...` | source/event | `sourceState`, `observation.timestamp`, `condition`, `temperature`, `windSpeed`, `windGust`, `windDirection`, `alerts`, `station.id`, `probes` | live_only | NWS only; no official track temp/radar. | compact weather strip | If partial, suppress missing numeric fields rather than rendering zero. | live API |

### Race Debrief

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `debrief_header` | v1 | Bryce, family/friends | What happened in the race? | `race_debrief_scores.csv`, `career_result_conversion.csv`, `championship_progression.csv` | session/result | `sessionId`, `raceLabel`, `seasonYear`, `trackName`, `trackType`, `teamName`, `startPosition`, `finishPosition`, `positionGain`, `finishPercentile`, `points`, `status`, `sourceState`, `confidence`, `caveat` | available | Derived archetype labels are review aids until manually approved. | outcome KPI strip + concise narrative | If derived score missing, fall back to official result fields only. | historical analytics |
| `debrief_qualifying_conversion` | v1 | Bryce, team/engineering, family/friends | Did qualifying translate into race result? | `prep_session_signals.csv`, `career_result_conversion.csv`, canonical result rows | session/result | `bestQualifyingRank`, `avgQualifyingRank`, `raceStart`, `raceFinish`, `raceGain`, `startPosition`, `finishPosition`, `positionGain` | available | Group/combined qualifying formats need source/session caveats. | slope/dumbbell chart | If qualifying row absent, show start-to-finish only. | historical analytics |
| `debrief_lap_position_story` | v1 | Bryce, team/engineering, serious fans | Where did the race turn? | `full_field_lap_dynamics_by_race.csv`, `full_field_lap_dynamics_by_driver.csv`, official Race Lap Chart PDFs via canonical lap samples | lap/driver/session | `lapSamples`, `firstLapPosition`, `finalLapPosition`, `bestRunningPosition`, `worstRunningPosition`, `netLapChartGain`, `positionVolatility`, `sourceState`, `brycePrimaryStory` | source_bounded | 36/36 INDY NXT completed races have lap samples; 26 fully validate and 10 are clean partial visible-sample imports. Use `gap_indy_nxt_qualifying_lap_reports` in drawer when relevant. | inverted y-axis lap-position line | If chart is partial, badge it and avoid missing-lap inference. | historical analytics |
| `debrief_section_strengths` | v1.5 | Bryce, team/engineering | Where was Bryce fast or weak by section? | `section_results_deep_by_race.csv`, `section_results_deep_by_section.csv` | session/lap | `sectionComparisonRows`, `medianSectionPercentile`, `topQuartileShare`, `bottomQuartileShare`, `bestSectionFamilies`, `weakestSectionFamilies`, `sourceState`, `caveat` | source_bounded | Useful as a drilldown only. The section artifacts still need denominator QA and display filtering before headline claims; `session_indy_nxt_2024_6325` remains source-broken. | ranked bars or segment heatmap | Hide from v1 debrief until denominator QA/display filtering is implemented; keep source-bounded caveat in drawer. | historical analytics |
| `debrief_incidents_penalties` | v1.5 | Bryce, family/friends, serious fans | Were cautions, penalties, or status events part of the story? | `incident_penalty_context.csv`, `leader_lap_context.csv`, coverage matrix | event/session | `sessionIncidentCount`, `sessionPenaltyCount`, `flagState`, `leader`, `margin`, `status`, `sourceState` | available | Rows exist when official PDFs/API expose them; absence is not proof nothing happened unless source family has complete no-event semantics. | event chips + caution timeline | If no rows, say no imported official rows, not "none occurred." | historical analytics |
| `debrief_team_context` | v1.5 | Bryce, team/engineering, serious fans | How did Bryce compare inside the team? | `team_context_by_race.csv`, `team_context_by_year.csv` | team/result | `teamName`, `bryceFinish`, `teamCars`, `teammates`, `teamBestFinish`, `teamAverageFinish`, `bryceVsTeamAvgFinish`, `bryceTeamFinishRank`, `statusCaveat` | source_bounded | Descriptive only; no engineering root-cause claims. | ranked dot plot/table | If team rows missing, show official result only. | historical analytics |
| `debrief_source_drawer` | v1 | all | Why should I trust this screen? | `indy_nxt_source_family_audit.csv`, all module CSVs, coverage matrix, validation report | source | `sourceFamily`, `sourceRows`, `analysisStatus`, `primaryArtifacts`, `auditConclusion`, `openGapIds`, validation warning | available | Drawer owns detail so main screen stays clean. | drawer/table | Always available for v1 screens; if artifact missing, block frontend build for that module. | UI only |

### Career Lab

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `career_series_summary` | v1 | Bryce, serious fans | How has Bryce performed across series? | `career_series_result_summary.csv`, `career_result_conversion.csv` | series/result | `seriesId`, `seriesName`, `raceRows`, `avgFinish`, `medianFinish`, `avgGain`, `avgFinishPercentile`, `top5Rate`, `top10Rate`, `issueLikeStatusRate` | available | Use percentiles with raw finish because field sizes differ. | sortable series table + small multiples | If a series has too few rows, show row count and suppress trend claims. | historical analytics |
| `career_metric_parity_matrix` | v1 | operator, serious fans | Which analyses are safe beyond INDY NXT? | `career_metric_family_parity.csv`, `career-coverage-matrix.json` | series/source | `seriesName`, `metricFamily`, `sourceRowsOrSessions`, `parityStatus`, `uiUse`, `caveat`, `openGapIds`, category status | available | Prevent weak source families from poisoning INDY NXT-grade views. | matrix heatmap | If metric family is unavailable, show unavailable cell and omit chart affordance. | historical analytics |
| `career_result_conversion_explorer` | v1.5 | Bryce, serious fans | Which races were gains, losses, or standout finishes? | `career_result_conversion.csv` | result/session | `seriesName`, `seasonYear`, `eventName`, `sessionId`, `raceLabel`, `trackName`, `trackType`, `teamName`, `startPosition`, `finishPosition`, `positionGain`, `finishPercentile`, `points`, `status`, `sourceState` | source_bounded | Start/gain unavailable for series without grid/start source; do not compute gain from missing start. | filterable scatter/table | If `startPosition` is missing, show finish percentile only. | historical analytics |
| `career_gap_ledger` | v1 | operator, serious fans | What is known, partial, blocked, or unavailable? | `career-coverage-matrix.json`, `docs/CAREER_ANALYTICS_COVERAGE_MATRIX.md` | series/source | `seriesId`, `seriesName`, `categories[].id`, `status`, `covered`, `total`, `coverage`, `openGapIds`, `priorityGaps` | available | Open gaps can be caveats, not blockers. Priority gaps drive blocked UI calls. | coverage matrix + source drawer | If generated matrix missing, block career lab build. | view model |

### Source Ops

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ops_validation_status` | v1 | operator | Is the backend baseline safe to build from? | `validation-report.json`, `ingestion-summary.json` | source | `errorCount`, `warningCount`, `issues`, `generatedAt`, `openGaps`, `readiness` | available | Warning about 9 sessions without exact starts blocks weather/live joins for those sessions only. | status checklist | If `errorCount > 0`, block frontend analytics work. | UI only |
| `ops_live_source_console` | v1 | operator | Which live sources are reachable and app-ready? | `/api/sources`, `docs/LIVE_DATA_READINESS_AUDIT.md` | source | `endpoints[].id`, `sourceState`, `readinessState`, `ok`, `freshnessLabel`, `checkedAgeSeconds`, `modifiedAgeSeconds`, `bytes`, `lastModified`, `etag`, `note`, `local.sqlite` | live_only | HTTP 200 is not readiness; candidate/reference feeds must not become Bryce data. | source table + filters | If API unavailable, show docs-backed checklist and a command hint. | live API |
| `ops_replay_archive_state` | v1.5 | operator, team/engineering | Is there enough archived data to debrief trends? | `/api/replay/bryce`, `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl` | source/session | `available`, `archiveState`, `sessions`, `summary`, `warnings`, `rows`, `storage` | replay_only | Tiny archive is proof of plumbing, not full-session analysis. | archive state card + sample count trend | If `archiveState` is `missing`, `empty`, or `tiny`, disable replay analytics and show capture procedure. | live API |

## Explicitly Deferred Or Unavailable

| Feature | Availability | Rationale | Required proof before promotion |
| --- | --- | --- | --- |
| Live moving-dot/GPS track map | unavailable | No validated live GPS or car-coordinate feed. Static track map exists only as reference. | Official nonzero live `lapDistance`, websocket, or licensed telemetry that maps to Bryce and refreshes during green laps. |
| Tire/overtake strategy UI | deferred | Race Control fields exist but cold samples are not enough to prove live INDY NXT meaning. | Live INDY NXT session where `Tire` and `OverTake_Remain` are populated and meaningful. |
| Detailed pit sequence | unavailable | Official INDY NXT sources expose pit-stop counts, not pit lane time, stop lap sequence, service, tire, or pit time. | Official source/parser with sequence fields. |
| Official INDY NXT weather | unavailable | 0/189 official weather rows in current career coverage. | Official series timing/report weather rows. |
| Team radio audio or live POV | unavailable | Radio frequency metadata is not audio; POV is out of scope without permissioned stream. | Permissioned source plus explicit delayed/live labeling. |
| Predictive field-strength/teammate model | deferred | Derived benchmarks are blocked in coverage matrix; existing context is descriptive only. | Reviewed derived benchmark package with denominators and validation. |

## Self-Check

Ready v1 screens:

- Race Weekend Prep can build event/session command center, track history, live weather readiness, and watch/listen routing.
- Live Race Companion can build source readiness, Bryce status, timing tower, live weather, and the guarded points-projection card.
- Race Debrief can build the header, qualifying conversion, lap-position story, incident/penalty context, and source drawer. Section strengths are a v1.5 drilldown pending denominator QA/display filtering.
- Career Lab can build series summary, metric parity matrix, and coverage/gap ledger.
- Source Ops can build validation status and live source console.

Blocking backend contracts:

- Live points projection needs a live INDY NXT rehearsal proving point fields are populated and reconcilable. The UI card remains v1 required but must degrade to unavailable when Race Control does not populate the fields.
- Full replay trend analytics need a full-session archive; current archive is tiny/cold.
- Live race readiness now has `/api/readiness`; remaining backend hardening is green-flag INDY NXT proof plus reducer fixtures for pre-session, degraded, stale, blocked, weather partial, replay states, and no-Bryce archived fallback.
- Timezone normalization is still needed for schedule/track-activity feed strings before polished session countdowns ship.

Frontend can safely build first:

1. Race Debrief v1 for one INDY NXT completed race using `race_debrief_scores.csv`, lap dynamics, incident/penalty context, championship progression, and source drawer.
2. Career Lab v1 metric parity and coverage matrix.
3. Race Weekend Prep shell using `/api/readiness`, `/api/weather/upcoming`, and `future_weekend_prep_inputs.csv`.
4. Live Race Companion static/live-state shell with strong wrong-series and unavailable states before green-flag proof.
