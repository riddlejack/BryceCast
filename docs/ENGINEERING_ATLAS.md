# BryceCast engineering atlas

This atlas maps the public candidate's engineering and analytical capability families to their implementation, retained evidence, and claim limits. It indexes code and generated reports; it is not a statement that a current deployment, runner, or live archive is operating.

The candidate was derived from canonical source commit `94afeda3ef4ebbaff964c833cd970360efeab32c`. The compact [portfolio evidence summary](evidence/portfolio-stats.json) was recomputed from included generated reports. Acquisition jobs and full-corpus validations were not rerun for that summary. Licensed source objects, raw captures, and operational SQLite archives are withheld pending a separate permissioned release.

## Evidence states

| State | Meaning |
|---|---|
| **Implemented** | Current candidate code contains the behavior or contract. |
| **Stored validation** | An included generated artifact records a check at its stated timestamp and grain. It was not necessarily rerun during publication preparation. |
| **Synthetic validation** | A runnable fixture verifies mechanics without using the licensed production corpus. |
| **Research** | Analysis exists, but interpretation or product use remains restricted. |
| **Blocked / unavailable** | The repository explicitly withholds a capability because source, validation, or permission is insufficient. |

## Primary case studies

| Case | Core question | Best evidence |
|---|---|---|
| [Heat maps without GPS](case-studies/01-heatmaps-without-gps.md) | How can timing loops become a spatial interface without claiming a vehicle trajectory? | 2,613,292 loop crossings; 21/25 race medians reproduce official lap time to 0.0000 s; 13 anchored venues. |
| [Pass placement](case-studies/02-pass-placement.md) | Can order changes be bracketed between physical loops? | 28 races; 99.65% mean pairwise concordance with official lap charts. |
| [Qualifying](case-studies/03-qualifying.md) | How can incompatible qualifying formats share one product model? | 122 career appearances; 69 exact grid conversions; 35/40 inspected lap captures usable. |
| [Weather and wind](case-studies/04-weather-and-wind.md) | How can modeled weather and track-relative wind remain source-honest? | 115/115 exact-window sessions joined; 78 date-only sessions skipped; north-aware arrow transform. |
| [Models and leakage](case-studies/05-models-and-leakage.md) | What happens when failed models and an invalid apparent winner remain visible? | Separate `n=45`, `n=43`, and `n=34` cohorts; post-race team model rejected for leakage. |
| [Live reliability](case-studies/06-live-reliability.md) | How did a process-exhaustion failure change capture architecture? | Explicit 1,602.864 s normal gap and 851.078 s combined gap; later replay invariants. |
| [Career and competitors](case-studies/07-career-and-competitors.md) | How can seven unequal series support comparison without fake completeness? | 146 finished-race parity rows plus series-specific GB3, IMSA, Formula Ford, and INDY NXT modules. |
| [Content-addressed SQLite](case-studies/08-sqlite-archive.md) | Can observation timestamps survive payload deduplication? | Eleven synthetic checks; 600/600 byte-identical hydrations; 9.61% fixture byte ratio. |

## 1. Source governance and provenance

BryceCast treats source eligibility as part of each metric. The [data-permissions contract](DATA_PERMISSIONS.md) separates analysis, redistribution, and operational access. The [source inventory](SOURCE-INVENTORY.md), [analytics source audit](ANALYTICS_SOURCE_AUDIT.md), and [career feasibility matrix](CAREER_DATA_FEASIBILITY_MATRIX.md) record what each source family can support.

The broader research archive is summarized, not published. Through 2026-09-10, the evidence summary records **1,136 source objects and 7,623,690,114 unique bytes** across a wider INDYCAR/INDY NXT research archive. Its 5,301 catalog entries are source/session candidates, not a deduplicated race count. See [portfolio-stats.json](evidence/portfolio-stats.json), the [historical-lake technical report](../analysis/historical-data-lake/TECHNICAL_REPORT.md), and the [storage/licensing audit](../analysis/historical-high-frequency-data-audit/STORAGE_COST_LICENSING.md).

The candidate includes readers, schemas, generated summaries, and sanitized examples. It does not include the durable raw lake, licensed capture ZIPs, operational SQLite, credentials, or LaunchAgent state.

## 2. Normalized career data and coverage

The normalized career schema and provenance rules are documented in [CAREER_DATA_SPEC.md](CAREER_DATA_SPEC.md). The September 2026 [validation report](../data/career/reports/validation-report.json) passed with zero errors and one warning. It contains:

- 556 drivers, seven series, 75 teams, 472 cars, and 42 tracks;
- ten seasons, 87 events, and 493 sessions;
- 8,943 results, 1,929 qualifying results, and 75,589 lap samples;
- 166 incidents, 94 penalties, 201 weather observations, 453 derived metrics, and 1,347 source-evidence records.

The warning is material: nine physical sessions lack a scheduled or actual start, so weather/live joins must wait. The [coverage matrix](../data/career/reports/career-coverage-matrix.json) carries category-specific states rather than converting unavailable values to zero.

For 2024–2026 INDY NXT, the matrix records 45 events and 213 sessions, all 45 completed race classifications, all 110 result-bearing qualifying classifications, 952 race-result rows with a grid/start position, and lap-chart samples for all 45 races. Twelve lap charts are honest partial visible-sample imports. Section reports cover 177 of 178 comparable sessions; one Indianapolis source returns corrupt/truncated bytes. Exact clock starts cover 135 of 213 sessions. Detailed pit sequence and official session weather are unavailable.

Two official canceled qualifying session IDs are retained and excluded from completeness denominators. Canceled sessions remain explicit records. Nashville 2024 is also represented in the qualifying lab by two section-result laps with no invented classification.

## 3. Raw-format investigation and semantic timing

The [field-granularity dictionary](../analysis/historical-high-frequency-data-audit/FIELD_GRANULARITY_DICTIONARY.md) separates final classification, completed-lap charts, car/lap/section reports, physical crossing events, and near-one-second display snapshots. It explicitly rejects the shortcut “one-second snapshots = one-second telemetry.”

The [RaceTools decoder](../analysis/semantic-layer/lib/racetools-semantic.mjs) interprets `$S` hexadecimal ticks at 0.0001-second source resolution, handles mainline and pit-lane start/finish planes, removes non-race regions, and reconstructs car-laps. The [Timing71 decoder](../analysis/semantic-layer/lib/timing71-semantic.mjs) treats its input as quantized display state: lap completion comes from a lap-counter increment, the source `Last` field supplies lap time, and no interpolation is added.

The [loop summary](../analysis/semantic-layer/output/loop-crossings-summary.json), generated 2026-09-10, contains 2,613,292 normalized crossing records across 143 sessions. Quality masks include 17 full-day captures, nine heartbeat gaps, and one header-only log. The [identity crosswalk validation](../analysis/semantic-layer/output/crosswalk/crosswalk-validation.json) records 43 `GO`, one `CONDITIONAL`, zero `NO-GO`, and zero hard failures as of 2026-09-10.

The high-frequency source investigation also retains contaminated-duplicate and source-preamble failure cases in the [feasibility report](../analysis/historical-high-frequency-data-audit/FEASIBILITY_REPORT.md) and [race inventory](../analysis/historical-high-frequency-data-audit/racetools-race-inventory.json). Those records prevent a larger or later file from automatically replacing a cleaner session capture.

## 4. Track geometry, sections, and race phases

The track library contains real-geometry and image-traced outlines plus 13 curated INDY NXT section-anchor sets under [track assets](../src/assets/tracks/). The [anchor builder](../scripts/derive-section-anchors.mjs) reconciles distance units and protects track configuration with name and lap-length checks.

The shared [section contract](../src/data/sectionObservations.ts) supports official aggregate sections and per-lap loop evidence, median/mean summaries, field distributions, clean-lap denominators, direct measurements, and derived untimed remainders. Race thirds appear only for races with at least nine laps; qualifying thirds use at least three distinct observed lap indexes. Race aggregates need eight clean green laps in the selected scope; qualifying explicitly permits one valid observed lap. See the [heat-map case study](case-studies/01-heatmaps-without-gps.md).

The race enhancement contains 522,687 field section observations, 22,333 race car-lap-section observations, 1,748 lap microstates, and 189 inflection points as of 2026-09-10. The [practice/qualifying deep dive](../analysis/indy-nxt-section-lap-deep-dive/output/summary.json) contains 26,304 section observations and labels its weak session-to-race associations as historical only.

## 5. Running order, passes, cautions, and restarts

The [pass-placement lane](../analysis/track-position/README.md) derives loop-by-loop order from crossing timestamps and brackets pairwise order reversals. Its stored validation covers 28 races, with 26 `GO`, two `CONDITIONAL`, zero `NO-GO`, and 99.65% mean pairwise concordance. It does not claim GPS, exact corner, contact, or cause. See the [case study](case-studies/02-pass-placement.md).

The [caution atlas](../analysis/caution-atlas/output/summary.json), generated 2026-09-11, contains 83 official caution episodes across 45 INDY NXT races: 35 begin in the opening third, 23 in the middle, and 25 in the final third. It preserves official reason text while grouping leading reason terms.

The [restart report](../analysis/restart-report/output/summary.json) contains 76 restart episodes and 1,492 car-restart observations. It measures positions over the next two green laps, truncating for a new caution or finish. It does not call that movement an on-track pass; green pit cycles can remain in the window. Two races are uncovered and six end-of-race cautions correctly produce no restart.

## 6. Qualifying

The career qualifying layer enforces one source family per session, separates group components from grid-setting classifications, and confirms conversion only when same-event grid equals qualifying rank. The lap lab keeps official classification and observed laps separate, supports two-lap oval context, and leaves canceled or unverifiable ranks blank. See the [qualifying case study](case-studies/03-qualifying.md), [career summary](../analysis/qualifying-layer/output/summary.json), and [lap census](../analysis/quali-lab/output/coverage-census.json).

Current stored coverage is 122 career qualifying appearances across six series, 69 exact grid-confirmed conversions, and 35 usable lap-level sessions out of 40 inspected captures. The five excluded captures and the single cross-check mismatch remain in the evidence.

## 7. Weather and wind

The historical lane joins modeled hourly observations only to exact session windows. Its [backfill report](../data/career/reports/indy-nxt-weather-backfill-report.json) records 115 joined sessions and 78 date-only skips. A six-sample [station cross-check](../data/career/reports/indy-nxt-weather-station-crosscheck-report.json) found no material conflicts within disclosed bounds but does not upgrade modeled data to official weather.

The live lane retains observation age, calm/no-direction semantics, a 16-point compass, meteorological `from` bearing, and track north. The track arrow uses `bearing + 180° + northOffsetDeg`; no headwind or aerodynamic-effect metric exists. See [weather and wind](case-studies/04-weather-and-wind.md).

## 8. Career parity and specialized series analyses

The [career parity pass](../analysis/career-parity/output/CAREER_ANALYTICS_PARITY_PASS.md) uses a common finish-percentile outcome while preserving metric-family eligibility. It contains 146 finished-race rows and 49 metric-family rows across seven series from the dataset updated 2026-09-10.

Specialized lanes avoid a lowest-common-denominator analysis:

- [GB3 deep dive](../analysis/gb3-deep-dive/output/GB3_DEEP_DIVE_ANALYTICS.md): 44 race rows and 22 qualifying-context rows, with zero lap or section rows.
- [IMSA Daytona stint/class pace](../analysis/imsa-daytona-stint-class-pace/output/IMSA_DAYTONA_STINT_CLASS_PACE.md): 37,885 lap observations, 1,680 stints, ten Bryce stints, and four car-85 codriver rows.
- [Formula Ford lap shape](../analysis/formula-ford-lap-shape/output/FORMULA_FORD_LAP_SHAPE.md): 282 Bryce lap observations across 24 sessions plus nine condition rows.
- [Career dimension context](../analysis/career-dimension-context-layer/output/CAREER_DIMENSION_CONTEXT_LAYER.md): driver, team, entrant, qualifying, venue, and track-archetype lookup layers. Its July counts are historical and superseded by the September validation report.
- Euroformula, FROC, F1600, IMSA, Formula Ford, and GB3 import provenance remains in [career reports](../data/career/reports/); not every series supports the same downstream module.

The [career and competitors case study](case-studies/07-career-and-competitors.md) explains the comparison boundary. Same-sample opponent and team context is descriptive, not causal or independently predictive.

## 9. Historical models and gated research

The [predictive workbench](../analysis/predictive-race-intelligence/output/model_scorecard.json) stores 14 model rows and keeps cohort size, leakage status, and allowed use visible. Results are interpreted within `n=45`, `n=43`, and `n=34` cohorts; the lowest-error candidate uses post-race team outcomes and is retained only as a leakage control. See [models and leakage](case-studies/05-models-and-leakage.md).

The [ML research plan](ML_RESEARCH_PLAN_2026-07-20.md) gates future work behind a source/label census, session-clock contract, mask-action matrix, and labelability study. Caution hazard uses race-clustered, forward validation and does not treat one-second rows as independent events. Pace modeling requires driver/team-season identifiability before fitting. Negative results terminate a lane and remain deliverables.

Public calibrated finish, top-10, win, or probability claims are blocked. Causal weather regression, engineering reliability attribution, pit-strategy modeling from counts alone, and public scouting scores remain rejected or deferred.

## 10. Live system and replay

The live architecture assigns one upstream owner per source family. The [runner](../scripts/live-runner.mjs), [runner core](../scripts/lib/live-runner-core.mjs), [API](../scripts/api-server.mjs), and [runbook](LIVE_RUNNER_RUNBOOK.md) define lifecycle phases, lock and process-budget guards, cache/archive-first readers, and wrong-series protection.

The Road America drill is a retained failure case. Its [final summary](../analysis/live-drill-2026-06-21/final-validation-summary-2026-06-21.json) records a 1,602.864-second normal-capture gap and an 851.078-second combined gap even though the final state was captured. Later read-only replay proofs cover 6,403 snapshots and more than 150,000 driver/order checks with zero invariant violations. See [live reliability](case-studies/06-live-reliability.md).

Those proofs apply to retained sessions. They do not establish current runner, tunnel, power, network, or deployment health. Raw drill streams and operational SQLite are withheld.

## 11. Content-addressed storage

Archive V2 stores immutable endpoint payload versions by SHA-256 and keeps lightweight timestamped observations. The [implementation](../scripts/lib/archive-v2.mjs), [dual-format reader](../scripts/lib/archive-reader.mjs), and [acceptance gates](../scripts/lib/archive-v2-gates.mjs) preserve legacy application contracts.

`npm run test:archive-v2` passed eleven synthetic checks during publication preparation: 600 legacy and 600 V2 observations, 604 distinct versions, no dangling references or hash mismatches, byte-identical hydration for all 600 snapshots, all 64 rare transition rows retained, and a 9.61% embedded-byte ratio. This is a synthetic result, not a production migration result. See [content-addressed SQLite](case-studies/08-sqlite-archive.md).

Retention remains inert, and production migration/live dual-write are not claimed.

## 12. Career geography, mileage, travel, and resource approximations

The [career life-stats research contract](../analysis/career-life-stats/RESEARCH.md) separates `observed_exact`, `observed_lower_bound`, `modeled_range`, and `unknown`.

The [generated summary](../analysis/career-life-stats/output/summary.json), dated 2026-09-10, reports:

- **7,316.4 observed race miles** across 150 driver-physical-race rows and 3,274 laps;
- **14,440.7 exact physical-session miles** across 325 sessions and 6,355 laps;
- a lower-bound component of 360.5 miles across 14 sessions, plus 26 unknown-lap sessions;
- **60,561.1 miles** as the exact minimum venue-to-venue great-circle displacement between consecutive race events; and
- a route-adjusted modeled minimum of **63,670.6–71,512.1 miles**.

Actual travel is unknown because season base and return-home frequency are unavailable. Fuel and tire outputs are low/base/high assumption models, not measurements; they are generated from the explicit [assumption register](../analysis/career-life-stats/data/resource_model_assumptions.csv). F1600 best-lap numbers remain lower bounds, FROC non-race laps remain unknown, aggregate qualifying duplicates are excluded, and shared-car Daytona laps are assigned from Bryce stint evidence rather than the car total.

The [career atlas](../analysis/career-atlas/output/atlas.json) and its [source register](../analysis/career-atlas/data/SOURCE.md) support geographic presentation. They do not turn modeled route distance into an actual itinerary.

## 13. Narrative, media, and utilization layers

Several supporting layers organize evidence rather than create new performance claims:

- The [context-event narrative layer](../analysis/context-event-narrative-layer/output/CONTEXT_EVENT_NARRATIVE_LAYER.md) indexes session context, media, source lineage, weather, derived metrics, and gaps.
- The [data-utilization audit](../analysis/data-utilization-audit/output/DATA_UTILIZATION_AUDIT.md) inventories collection grain and underused opportunities.
- The [career chapter audit](../analysis/career-chapter-utilization-audit/README.md) checks whether normalized fields reach the product.
- The [UI data package](../analysis/ui-data-package/ui-data-package.json), [typed contracts](../src/data/analyticsContracts.ts), [view models](../src/data/analyticsViewModels.ts), and [context adapter](../src/data/uiContextAdapter.ts) keep React screens from parsing raw analytical tables directly.

Media, broadcast, and source-evidence records can enrich chronology. They do not independently validate a performance interpretation.

## 14. Explicit non-capabilities and deferred lanes

| Capability | Current boundary | Evidence |
|---|---|---|
| GPS trajectory, exact position between loops, instantaneous speed, proximity, contact | Unavailable | [Granularity dictionary](../analysis/historical-high-frequency-data-audit/FIELD_GRANULARITY_DICTIONARY.md) |
| Official INDY NXT session weather | Unavailable; modeled archive weather is labeled | [Coverage matrix](../data/career/reports/career-coverage-matrix.json) |
| Detailed pit sequence, service, tire, and pit time | Unavailable in the official report family | [Coverage matrix](../data/career/reports/career-coverage-matrix.json) |
| Isolated live team radio and live #9 POV | Unavailable pending permissioned source | [Audio findings](AUDIO_RADIO_FINDINGS.md), [POV findings](LIVE_POV_ACCESS_FINDINGS.md) |
| Public race probabilities | Blocked by calibration, forward-validation, and review gates | [ML plan](ML_RESEARCH_PLAN_2026-07-20.md) |
| Causal team, weather, reliability, or setup attribution | Blocked by input and identification limits | [Analytics source audit](ANALYTICS_SOURCE_AUDIT.md) |
| Archive deletion/compaction policy | Inert configuration; no live deletion | [Retention contract](ARCHIVE_V2_RETENTION.md) |
| Apple TV/tvOS product | Roadmap only | [tvOS roadmap](APPLE_TV_TVOS_ROADMAP.md) |
| Current public deployment or live runner health | Not established by this repository | [Release contract](operations/RELEASE_AND_DATA_REFRESH.md) |

## 15. Failure cases worth preserving

- **Process exhaustion:** overlapping collectors motivated single-ingestor ownership; see the [RCA](../LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md).
- **Capture discontinuity:** the final live state exists, but an 851.078-second combined gap prevents a continuous-race claim.
- **Contaminated duplicate:** a larger Indianapolis archive object contained mixed NXT/INDYCAR session markers and is excluded by source checks.
- **Source-broken PDF:** one official section-result URL returns corrupt/truncated bytes; section coverage remains 177/178.
- **Missing qualifying laps:** four inspected captures contain no Bryce laps; Nashville has no canonical classification.
- **Model leakage:** the lowest-error stored model uses post-race team outcomes and is disqualified from pre-race use.
- **Negative model results:** qualifying-only and five-neighbor candidates do not outperform their relevant alternatives.
- **Stale prose:** one scorecard methodology string says 36 rows; current row-level denominators and coverage manifest show 45 or the applicable subset.
- **Unresolved session times:** nine career sessions cannot safely join to hourly weather/live context.

These are part of the engineering record. Removing them would make the project look more certain while making its claims less reliable.

## Claim language

Use “timing-loop-derived section map,” “between-loop pass interval,” “completed-lap value,” “approximately one-second display snapshot,” “modeled hourly weather,” “historical experiment,” and “stored validation.” Avoid “GPS telemetry,” “instantaneous speed,” “exact pass location,” “official weather,” “production prediction,” or “currently running” unless a new source or live verification supports the term.
