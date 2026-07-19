# GB3 Analytics Adversarial Review

This review stress-tests the GB3 deep dive against the canonical source shape.

## Completion Matrix

| sourceFamily | bryceRaceRows | qualifyingContextRows | gridStartRaceRows | weatherConditionRows | pitStopCountRaceRows | lapSampleRows | sectionMetricRows | analysisStatus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2021 TSL official PDFs | 20 | 14 | 369 | 39 | 0 | 0 | 0 | complete_source_bounded |
| 2022 GB3 official JSON | 24 | 8 | 0 | 0 | 513 | 0 | 0 | complete_source_bounded |
| GB3 combined | 44 | 22 | 369 | 39 | 513 | 0 | 0 | complete_with_source_family_split |

## Unsupported Or Constrained Claim Families

| claimFamily | supportRows | reviewConclusion | safeAlternative |
| --- | --- | --- | --- |
| lap_shape | 0 | unsupported | Use result conversion and event summaries only. |
| section_pace | 0 | unsupported | Omit section pace modules for GB3. |
| weather_causality | 39 | context_only | Show official 2021 condition labels without causal language. |
| team_engineering_root_cause | 44 | unsupported | Use within-team result order and denominator labels. |
| 2022_start_conversion | 0 | unsupported | Show 2022 qualifying rank to finish context, with start unavailable. |

## Structural Issues

| severity | issue | evidence | required display behavior |
| --- | --- | --- | --- |
| high | GB3 source families expose different fields. | 2021 has official TSL grids and condition rows; 2022 has official JSON pit count rows and no source-backed starts or weather. | Every detailed metric needs a source-family badge. |
| high | Lap and section modules have no GB3 support. | 0 GB3 lap samples and 0 GB3 section metric rows. | Omit lap trace, stint-shape, sector-shape, and section-pace UI for GB3. |
| medium | Qualifying context spans two canonical shapes. | 2021 context is in `qualifyingResults`; 2022 context is in qualifying session result rows. | Label 2022 qualifying context as medium confidence source-family normalization. |
| medium | Team context can be overread. | Full-field rows support team result order only. | Use result order language only, with no engineering or setup attribution. |
| medium | Weather context is 2021-only. | 39 official condition rows, all from the 2021 TSL source family. | Show 2022 weather as unavailable, not blank or inferred. |

## Acceptance Tests Applied

- Result conversion uses only Bryce race rows from GB3 race sessions.
- Start-to-finish gain is populated only when `startPosition` or `gridPosition` is source-backed.
- Qualifying context includes 2021 `qualifyingResults` and 2022 qualifying session result rows, with source-table labels.
- Weather rows preserve official TSL categorical conditions and avoid ambient-weather inference.
- Roadmap ranks follow current canonical support, with IMSA held as a standalone Daytona feature.

## Final Assessment

GB3 is ready for a source-bounded historic analytics module after this pass. The main product risk is overclaiming detail parity with INDY NXT. The safe UI surface is result conversion, qualifying context, event/track summaries, team-result context, source-family coverage badges, and 2021 official condition context.
