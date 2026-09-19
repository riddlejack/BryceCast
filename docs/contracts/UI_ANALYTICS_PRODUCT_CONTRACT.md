# BryceCast UI Analytics Product Contract

Generated: 2026-06-18

Baseline: `ce904af`

## Contract Position

This is the product and analytics contract the frontend should build against before any redesign work starts. It is not a UI implementation plan and it does not change ingestion. The controlling rule is source-backed specificity: every v1 surface either names an existing dataset artifact/API endpoint/context pack or renders an explicit unavailable/deferred state.

INDY NXT is the reference-rich product surface. Career-wide views are now productized beyond summary tables through source-hash checked context layers, but they still need coverage badges because older series do not expose the same lap, section, incident, pit, weather, or live timing fields.

## Source Precedence

1. `data/career/career.dataset.json`
2. Generated reports under `data/career/reports/`
3. `analysis/ui-data-package/ui-data-package.json`
4. Context-pack manifests and packs under `analysis/predictive-race-intelligence/output/context-packs/`
5. Validator-backed analysis lanes under `analysis/indy-nxt-section-lap-deep-dive/`, `analysis/indy-nxt-race-lap-section-enhancement/`, `analysis/career-dimension-context-layer/`, `analysis/context-event-narrative-layer/`, `analysis/imsa-daytona-stint-class-pace/`, and `analysis/formula-ford-lap-shape/`
6. UI analytics artifacts under `analysis/indy-nxt-discovery/output/` and `analysis/career-parity/output/`
7. Live/local API routes from `scripts/api-server.mjs`
8. Prose docs only after the generated artifacts above

Current generated-report facts:

- `data/career/reports/validation-report.json`: `errorCount` is `0`; warning count is `1` for 9 physical sessions without exact `scheduledStart` or `actualStart`.
- `data/career/reports/ingestion-summary.json`: generated `2026-06-16T18:12:35.595Z`; 9 open gaps; no priority gaps.
- `data/career/reports/career-coverage-matrix.json`: generated `2026-06-16T18:12:36.313Z`; INDY NXT has 45 events, 189 sessions, 36 completed race sessions, 738 race rows, 87 qualifying sessions, and no priority gaps.
- INDY NXT retains `gap_indy_nxt_qualifying_lap_reports` as a caveat ledger, not a dashboard blocker.

Current UI/package facts:

- `analysis/ui-data-package/ui-data-package.json`: generated `2026-06-18T17:52:13.930Z`, `asOfDate=2026-06-18`, `baselineCommit=ce904af`, source hash `da557a1af2c2d83acf33ad62680a7a78f908f9fa26babf66f711beddd4d5cabc`.
- Predictive race intelligence: generated `2026-06-18T17:52:08Z`; 76 inventory items, 68 career prior rows, 36 INDY NXT race feature rows, 14 model scorecard rows, 9 upcoming-event packs, 36 race-debrief packs, 1 Career Lab pack, 1 live race-day pack.
- Context-pack manifest: `analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json`, with pack counts `upcoming_event=9`, `race_debrief=36`, `career_lab=1`, and `live_race_day=1`.
- Data-utilization audit: `analysis/data-utilization-audit/output/DATA_UTILIZATION_AUDIT.md` records no remaining generated utilization backlog rows; 25 non-empty canonical collections are productized as context packs and the 3 empty collections are marked not worth analyzing with rationale.

## June 18 Context-Pack Productization Baseline

The frontend should not consume raw CSV files directly when a matching context pack or package field exists. Raw CSVs remain audit/debug inputs. UI-facing code should first load `analysis/ui-data-package/ui-data-package.json`, then follow `contextPackRef.path` or the context-pack manifest to hydrate the deeper source-backed layer.

Productized analysis families:

| Family | UI-ready artifact | Current coverage | Frontend use |
| --- | --- | --- | --- |
| Road America / upcoming events | `screens.roadAmericaPrep.events[]` plus upcoming-event context packs | 9 future INDY NXT packs | Race-week prep, finish-percentile bands, top-10 path language, analog race table, same-track vs track-type chart specs. |
| Predictive/model scorecard | `analysis/predictive-race-intelligence/output/model_scorecard.json` | 14 baseline/candidate rows | Source-drawer transparency and internal policy; no public point forecast. |
| Race debrief context | `context-packs/race-debriefs/*.json` | 36 completed INDY NXT race packs | Debrief pages can open with source-backed result, lap story, incident/penalty, team, championship, and section context. |
| INDY NXT practice/qualifying section laps | `analysis/indy-nxt-section-lap-deep-dive/output/context-packs/*` | 21,044 section observations, 83 session summaries, 2,678 top-section rows, 248 section-family rows | Prep/debrief drilldowns, section-family visualizations, transfer caveats. |
| INDY NXT race lap/section enhancement | `analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/*` | 1,390 race microstates, 159 segments, 151 inflection points, 16,001 section-lap observations | Race shape visualizations, lap-segment stories, inflection/timing overlays. |
| Career dimension context | `analysis/career-dimension-context-layer/output/context-packs/career-dimension-context.json` | 8,158 result rows, 1,547 qualifying rows, 75 teams, 42 tracks, 555 drivers, 472 cars | Career Lab filters, analogs, team/era/track/driver/cohort context. |
| Context/event narrative | `analysis/context-event-narrative-layer/output/context-packs/context-event-narrative-context.json` | 1,370 timeline rows, 181 weather rows, 940 media rows, 1,199 evidence rows, 9 gap-boundary rows | Event timelines, source drawers, media/source lineage, weather/context caveats. |
| IMSA Daytona stint/class pace | `analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json` | 37,885 lap rows, 1,680 stints, 10 Bryce stints | Career Lab special story and co-driver/class pace module. |
| Formula Ford lap shape | `analysis/formula-ford-lap-shape/output/context-packs/formula-ford-lap-shape-context.json` | 282 lap rows, 24 session summaries, 7 event progression rows, 9 condition rows | Career Lab early-career lap-shape module. |

Predictive policy:

- Use `predictionBand`, `top10Path`, `analogRaces`, and `chartSpecs` as source-backed context. They are valid UI material.
- Do not show a single expected finish, win probability, top-10 probability, or betting-style line. The model scorecard does not clear calibration/promotion gates for public point predictions.
- Safe phrasing: "historical prior band", "what needs to go right", "analog races", "after qualifying, compare start position to this band".
- Unsafe phrasing: "projected finish", "expected P__", "top-10 probability", "should finish", or any claim that implies a calibrated forecast.

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
| `prep_race_intelligence_band` | v1 | Bryce, family/friends, serious fans | What range does the historical context suggest, and what should I watch after qualifying? | `screens.roadAmericaPrep.events[].predictionBand`, upcoming-event context pack, `model_scorecard.json` | event/model-policy | `finishPercentileBand.p25`, `finishPercentileBand.median`, `finishPercentileBand.p75`, `finishPercentileBand.n`, `claimStrength`, `confidence`, `modelPolicy`, `scorecardRef` | source_bounded | This is a historical prior band, not a calibrated point prediction. | interval band + model-policy/source drawer | If model policy is absent or calibration status changes to failed, hide band and show same-track/track-type context only. | predictive analytics |
| `prep_top10_path` | v1 | Bryce, family/friends, serious fans | What needs to go right for a strong Road America result? | `screens.roadAmericaPrep.events[].top10Path`, upcoming-event context pack | event/story-factor | `factor`, `currentState`, `whyItMatters`, `actionableRead`, `contextPackRef.path`, `sourceRefs[]` | available | Path language only; do not state a top-10 probability. | ordered factor list + analog race table | If top-10 path is missing, fall back to track-history comparison and debrief analogs. | predictive analytics |
| `prep_analog_race_table` | v1 | Bryce, team/engineering, serious fans | Which prior races are the most useful analogs? | `screens.roadAmericaPrep.events[].analogRaces`, upcoming-event context pack | event/session | `raceLabel`, `trackName`, `trackType`, `analogType`, `confidence`, `finishPosition`, `startPosition`, `positionGain`, `finishPercentile`, `sourceRefs[]` | available | Analog rows are explanatory comparables, not nearest-neighbor forecasts unless the context pack explicitly says so. | ranked table with confidence/source labels | If analog rows are unavailable, show same-track and track-type aggregates only. | predictive analytics |
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
| `debrief_header` | v1 | Bryce, family/friends | What happened in the race? | race-debrief context pack, `race_debrief_scores.csv`, `career_result_conversion.csv`, `championship_progression.csv` | session/result | `sessionId`, `raceLabel`, `seasonYear`, `trackName`, `trackType`, `teamName`, `startPosition`, `finishPosition`, `positionGain`, `finishPercentile`, `points`, `status`, `sourceState`, `confidence`, `caveat`, `contextPackRef.path` | available | Derived archetype labels are review aids until manually approved. | outcome KPI strip + concise narrative | If context pack is missing, fall back to official result fields only and mark debrief deep context unavailable. | historical analytics |
| `debrief_qualifying_conversion` | v1 | Bryce, team/engineering, family/friends | Did qualifying translate into race result? | `prep_session_signals.csv`, `career_result_conversion.csv`, canonical result rows | session/result | `bestQualifyingRank`, `avgQualifyingRank`, `raceStart`, `raceFinish`, `raceGain`, `startPosition`, `finishPosition`, `positionGain` | available | Group/combined qualifying formats need source/session caveats. | slope/dumbbell chart | If qualifying row absent, show start-to-finish only. | historical analytics |
| `debrief_lap_position_story` | v1 | Bryce, team/engineering, serious fans | Where did the race turn? | `full_field_lap_dynamics_by_race.csv`, `full_field_lap_dynamics_by_driver.csv`, official Race Lap Chart PDFs via canonical lap samples | lap/driver/session | `lapSamples`, `firstLapPosition`, `finalLapPosition`, `bestRunningPosition`, `worstRunningPosition`, `netLapChartGain`, `positionVolatility`, `sourceState`, `brycePrimaryStory` | source_bounded | 36/36 INDY NXT completed races have lap samples; 26 fully validate and 10 are clean partial visible-sample imports. Use `gap_indy_nxt_qualifying_lap_reports` in drawer when relevant. | inverted y-axis lap-position line | If chart is partial, badge it and avoid missing-lap inference. | historical analytics |
| `debrief_section_strengths` | v1 | Bryce, team/engineering | Where was Bryce fast or weak by section? | race-debrief context pack, `analysis/indy-nxt-section-lap-deep-dive/output/context-packs/`, `analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/` | session/lap/section | `sectionComparisonRows`, `medianSectionPercentile`, `topQuartileShare`, `bottomQuartileShare`, `bestSectionFamilies`, `weakestSectionFamilies`, `sourceState`, `caveat`, section-lap observations, segment/inflection summaries | source_bounded | Valid as source-bounded drilldown after June 18 validators; do not convert into engineering root-cause claims. `session_indy_nxt_2024_6325` remains source-broken where section data is absent. | ranked bars, segment strip, section heatmap | If section pack missing or session is source-broken, show lap-position story and source caveat only. | historical analytics |
| `debrief_incidents_penalties` | v1.5 | Bryce, family/friends, serious fans | Were cautions, penalties, or status events part of the story? | `incident_penalty_context.csv`, `leader_lap_context.csv`, coverage matrix | event/session | `sessionIncidentCount`, `sessionPenaltyCount`, `flagState`, `leader`, `margin`, `status`, `sourceState` | available | Rows exist when official PDFs/API expose them; absence is not proof nothing happened unless source family has complete no-event semantics. | event chips + caution timeline | If no rows, say no imported official rows, not "none occurred." | historical analytics |
| `debrief_team_context` | v1.5 | Bryce, team/engineering, serious fans | How did Bryce compare inside the team? | `team_context_by_race.csv`, `team_context_by_year.csv` | team/result | `teamName`, `bryceFinish`, `teamCars`, `teammates`, `teamBestFinish`, `teamAverageFinish`, `bryceVsTeamAvgFinish`, `bryceTeamFinishRank`, `statusCaveat` | source_bounded | Descriptive only; no engineering root-cause claims. | ranked dot plot/table | If team rows missing, show official result only. | historical analytics |
| `debrief_source_drawer` | v1 | all | Why should I trust this screen? | `indy_nxt_source_family_audit.csv`, all module CSVs, coverage matrix, validation report | source | `sourceFamily`, `sourceRows`, `analysisStatus`, `primaryArtifacts`, `auditConclusion`, `openGapIds`, validation warning | available | Drawer owns detail so main screen stays clean. | drawer/table | Always available for v1 screens; if artifact missing, block frontend build for that module. | UI only |

### Career Lab

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `career_series_summary` | v1 | Bryce, serious fans | How has Bryce performed across series? | career-lab context pack, `career_series_result_summary.csv`, `career_result_conversion.csv` | series/result | `seriesId`, `seriesName`, `raceRows`, `avgFinish`, `medianFinish`, `avgGain`, `avgFinishPercentile`, `top5Rate`, `top10Rate`, `issueLikeStatusRate`, `careerPriorRows`, `sourceRefs[]` | available | Use percentiles with raw finish because field sizes differ. | sortable series table + small multiples | If a series has too few rows, show row count and suppress trend claims. | historical analytics |
| `career_deep_context_modules` | v1 | Bryce, team/engineering, serious fans | What parts of Bryce's career have deeper lap/team/track context? | career-lab context pack; career dimension, IMSA, Formula Ford context packs | series/session/lap/context | `trackArchetype`, `teamEra`, `driverCohort`, `qualifyingConversion`, `imsaStint`, `formulaFordLapShape`, `sourceRefs[]`, `sourceState`, `coverage` | source_bounded | Modules render only for the series/source family where validators prove coverage; do not project INDY NXT lap depth onto older series. | module menu + drilldown cards | If a series lacks a module, keep the parity matrix cell unavailable with rationale. | historical analytics |
| `career_metric_parity_matrix` | v1 | operator, serious fans | Which analyses are safe beyond INDY NXT? | `career_metric_family_parity.csv`, `career-coverage-matrix.json` | series/source | `seriesName`, `metricFamily`, `sourceRowsOrSessions`, `parityStatus`, `uiUse`, `caveat`, `openGapIds`, category status | available | Prevent weak source families from poisoning INDY NXT-grade views. | matrix heatmap | If metric family is unavailable, show unavailable cell and omit chart affordance. | historical analytics |
| `career_result_conversion_explorer` | v1.5 | Bryce, serious fans | Which races were gains, losses, or standout finishes? | `career_result_conversion.csv` | result/session | `seriesName`, `seasonYear`, `eventName`, `sessionId`, `raceLabel`, `trackName`, `trackType`, `teamName`, `startPosition`, `finishPosition`, `positionGain`, `finishPercentile`, `points`, `status`, `sourceState` | source_bounded | Start/gain unavailable for series without grid/start source; do not compute gain from missing start. | filterable scatter/table | If `startPosition` is missing, show finish percentile only. | historical analytics |
| `career_gap_ledger` | v1 | operator, serious fans | What is known, partial, blocked, or unavailable? | `career-coverage-matrix.json`, `docs/archive/audits/CAREER_ANALYTICS_COVERAGE_MATRIX.md` | series/source | `seriesId`, `seriesName`, `categories[].id`, `status`, `covered`, `total`, `coverage`, `openGapIds`, `priorityGaps` | available | Open gaps can be caveats, not blockers. Priority gaps drive blocked UI calls. | coverage matrix + source drawer | If generated matrix missing, block career lab build. | view model |

### Source Ops

| ID | Priority | Stakeholder | User question | Data source | Grain | Required fields | Availability | Caveat behavior | Visualization | Fallback | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ops_validation_status` | v1 | operator | Is the backend baseline safe to build from? | `validation-report.json`, `ingestion-summary.json` | source | `errorCount`, `warningCount`, `issues`, `generatedAt`, `openGaps`, `readiness` | available | Warning about 9 sessions without exact starts blocks weather/live joins for those sessions only. | status checklist | If `errorCount > 0`, block frontend analytics work. | UI only |
| `ops_live_source_console` | v1 | operator | Which live sources are reachable and app-ready? | `/api/sources`, `docs/archive/audits/LIVE_DATA_READINESS_AUDIT.md` | source | `endpoints[].id`, `sourceState`, `readinessState`, `ok`, `freshnessLabel`, `checkedAgeSeconds`, `modifiedAgeSeconds`, `bytes`, `lastModified`, `etag`, `note`, `local.sqlite` | live_only | HTTP 200 is not readiness; candidate/reference feeds must not become Bryce data. | source table + filters | If API unavailable, show docs-backed checklist and a command hint. | live API |
| `ops_replay_archive_state` | v1.5 | operator, team/engineering | Is there enough archived data to debrief trends? | `/api/replay/bryce`, `data/live/brycecast.sqlite`, `data/live/snapshots.jsonl` | source/session | `available`, `archiveState`, `sessions`, `summary`, `warnings`, `rows`, `storage` | replay_only | Tiny archive is proof of plumbing, not full-session analysis. | archive state card + sample count trend | If `archiveState` is `missing`, `empty`, or `tiny`, disable replay analytics and show capture procedure. | live API |

## Explicitly Deferred Or Unavailable

| Feature | Availability | Rationale | Required proof before promotion |
| --- | --- | --- | --- |
| Live moving-dot/GPS track map | unavailable | No validated live GPS or car-coordinate feed. Static track map exists only as reference. | Official nonzero live `lapDistance`, websocket, or licensed telemetry that maps to Bryce and refreshes during green laps. |
| Tire/overtake strategy UI | deferred | Race Control fields exist but cold samples are not enough to prove live INDY NXT meaning. | Live INDY NXT session where `Tire` and `OverTake_Remain` are populated and meaningful. |
| Detailed pit sequence | unavailable | Official INDY NXT sources expose pit-stop counts, not pit lane time, stop lap sequence, service, tire, or pit time. | Official source/parser with sequence fields. |
| Official INDY NXT weather | unavailable | 0/189 official weather rows in current career coverage. | Official series timing/report weather rows. |
| Team radio audio or live POV | unavailable | Radio frequency metadata is not audio; POV is out of scope without permissioned stream. | Permissioned source plus explicit delayed/live labeling. |
| Public expected-finish / top-10 probability model | deferred | June 18 scorecard supports historical bands and path language, not calibrated point predictions. Several candidate models are analyst-only, and the strongest lift uses post-race leakage. | Calibration gates, time-aware validation, leakage controls, and product review language. |
| Predictive field-strength/teammate headline claims | deferred | Field/team context is now descriptive and source-bounded, but not approved for causal or predictive headline claims. | Reviewed derived benchmark package with denominators, leakage controls, and validation. |

## Self-Check

Ready v1 screens:

- Race Weekend Prep can build event/session command center, track history, historical-prior band, top-10 path, analog race table, live weather readiness, and watch/listen routing.
- Live Race Companion can build source readiness, Bryce status, timing tower, live weather, and the guarded points-projection card.
- Race Debrief can build the header, qualifying conversion, lap-position story, section/lap drilldowns, incident/penalty context, team context, and source drawer from race-debrief context packs.
- Career Lab can build series summary, metric parity matrix, coverage/gap ledger, result conversion, career dimension filters, and source-bounded IMSA/Formula Ford deep modules.
- Source Ops can build validation status and live source console.

Blocking backend contracts:

- Live points projection needs a live INDY NXT rehearsal proving point fields are populated and reconcilable. The UI card remains v1 required but must degrade to unavailable when Race Control does not populate the fields.
- Full replay trend analytics need a full-session archive; current archive is tiny/cold.
- Live race readiness now has `/api/readiness`, and `analysis/ui-data-package/ui-data-package.json` carries runtime-shaped static UI fixtures for ready, wrong-series, pre-session, degraded, stale, blocked, weather partial, replay, and historical-fallback states. Runtime hardening still needs green-flag INDY NXT proof, reducer/API edge-case rehearsal, and post-session reconciliation.
- Timezone normalization is still needed for schedule/track-activity feed strings before polished session countdowns ship.

Frontend can safely build first:

1. Race Weekend Prep v2 using `screens.roadAmericaPrep.events[]`, `contextPackRef.path`, `predictionBand`, `top10Path`, `analogRaces`, and runtime weather/readiness.
2. Race Debrief v1 for one INDY NXT completed race using the race-debrief context pack, lap dynamics, section/race-lap context, incident/penalty context, championship progression, and source drawer.
3. Career Lab v1 metric parity, source-bounded deep modules, career dimension filters, and coverage matrix.
4. Live Race Companion static/live-state shell with strong wrong-series and unavailable states before green-flag proof.
