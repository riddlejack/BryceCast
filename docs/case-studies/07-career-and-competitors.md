# Career and competitor analysis across unequal sources

BryceCast spans seven series whose timing systems expose different grains. The career layer creates comparable outcomes without pretending that Formula Ford, GB3, Euroformula, FROC, IMSA, and INDY NXT contain the same evidence.

## Problem

Cross-series analysis breaks when missing fields are treated as zero or when a rich series silently donates its metrics to a thin one. Some seasons contain completed laps and section timing. Others contain only classification, qualifying context, or condition text. IMSA is a shared-car endurance setting; INDY NXT is a single-seater race series. Team and opponent results are also associations, not causal measures of engineering or driver contribution.

## Method

The normalized career layer preserves source family, metric grain, source evidence, and gaps. Its [coverage matrix](../../data/career/reports/career-coverage-matrix.json) marks each category complete, partial, unavailable, or blocked. The [career parity layer](../../analysis/career-parity/output/CAREER_ANALYTICS_PARITY_PASS.md) uses finish percentile as a common outcome and attaches metric-family eligibility rather than filling unavailable inputs.

Series-specific modules then work at their natural grain:

- [GB3](../../analysis/gb3-deep-dive/output/GB3_DEEP_DIVE_ANALYTICS.md) keeps the 2021 TSL and 2022 JSON source families distinct and does not invent laps or sections.
- [IMSA Daytona](../../analysis/imsa-daytona-stint-class-pace/output/IMSA_DAYTONA_STINT_CLASS_PACE.md) analyzes class and stint pace, attributes only Bryce's own stints, and keeps shared-car totals separate.
- [Formula Ford](../../analysis/formula-ford-lap-shape/output/FORMULA_FORD_LAP_SHAPE.md) uses observed Bryce laps and condition rows without assuming complete timing for every session.
- INDY NXT adds full-field race dynamics, section timing, caution, restart, incident, and team context, while marking the source-broken section session explicitly.

Opponent-strength and team-context ratings use same-sample descriptive shrinkage. They remain context, not independent predictions or causal responsibility estimates.

This design allows a series to become richer when new evidence arrives without rewriting the meaning of older, thinner seasons.

## Evidence

The [career validation report](../../data/career/reports/validation-report.json), checked 2026-09-10, passes with zero errors and one warning. It records **seven series, ten seasons, 87 events, 493 sessions, 8,943 results, 1,929 qualifying results, 75,589 lap samples, 166 incidents, 94 penalties, 201 weather observations, 453 derived metrics, and 1,347 source-evidence records**. The warning identifies nine physical sessions without exact start times, blocking weather/live joins for those rows.

The current [parity summary](../../analysis/career-parity/output/summary.json), based on the dataset updated 2026-09-10, contains **146 finished Bryce race rows**, 49 metric-family rows, and seven series summaries.

The specialized stored outputs show why separate lanes matter:

- GB3: **44 race rows**, 22 qualifying-context rows, 44 team-context rows, 39 weather rows, and **zero lap or section rows**; generated 2026-07-20.
- IMSA Daytona: **37,885 lap observations**, 1,680 stints, ten Bryce stints, and four car-85 codriver rows; generated 2026-07-20.
- Formula Ford: **282 Bryce lap observations across 24 sessions** and nine condition rows; generated 2026-07-20.

Racecraft layers add source-bounded comparisons. The [caution atlas](../../analysis/caution-atlas/output/summary.json), generated 2026-09-11, contains 83 official episodes across 45 INDY NXT races. The [restart report](../../analysis/restart-report/output/summary.json) covers 76 restart episodes and 1,492 car-restart observations using official lap-chart positions.

## Limits

Finish percentile is a shared outcome scale, not proof of equal field strength, machinery, or source quality. IMSA stint pace is not telemetry or setup attribution. Restart movement can include green-flag pit cycles. Same-sample competitor and team scores are descriptive. The system's strength is preserving those differences while still making the career navigable.
