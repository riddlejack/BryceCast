# IMSA Daytona Stint/Class Pace

Generated: `2026-07-20T11:31:34Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `64c2452b244d1c2ecb1db01df0735b1a0f631db0d4e74397ed7fa3a89b845978`

## Source Scope

This lane uses the official IMSA/Al Kamel Daytona time-card lap table, canonical IMSA car/team/driver metadata, the official race classification for car 85, and the official session condition row. The source supports lap-time, sector, pit, driver, car, class, and hour-of-race pace context. It does not expose live telemetry, setup, strategy notes, or lap-by-lap running order.

## What Became Productized

- `imsa_lap_observations.csv`: 37885 official IMSA time-card laps with parsed lap/sector seconds and class-hour deltas.
- `imsa_stint_summary.csv`: 1680 full-field driver stint windows.
- `imsa_driver_class_pace_summary.csv`: 231 driver/car pace summaries with class-denominator ranks.
- `imsa_car85_codriver_pace.csv`: car 85 co-driver pace summary for Bryce Aron, Gianmaria Bruni, Pascal Wehrlein, and Tijmen van der Helm.
- `bryce_imsa_stint_context.csv`: 10 Bryce stint rows.
- Context pack: `context-packs/imsa-daytona-stint-class-context.json`.

## Car 85 Co-Driver Pace

Car 85 context: JDC Miller MotorSports Porsche 963, GTP, finished overall P6 / class P6 with 780 laps and 34 pit stops.

- Gianmaria Bruni: median 99.244s, best 20-lap avg 98.15s, valid non-pit laps 221.
- Tijmen van der Helm: median 99.339s, best 20-lap avg 98.585s, valid non-pit laps 180.
- Pascal Wehrlein: median 99.476s, best 20-lap avg 98.985s, valid non-pit laps 188.
- Bryce Aron: median 101.017s, best 20-lap avg 99.033s, valid non-pit laps 122.

## Bryce Stint Shape

- L172-190: median 101.185s, class-hour delta 1.636s, valid non-pit laps 17.
- L191-220: median 101.204s, class-hour delta 2.141s, valid non-pit laps 28.
- L388-396: median 145.149s, class-hour delta 45.411s, valid non-pit laps 7.
- L397-399: median 169.256s, class-hour delta 69.518s, valid non-pit laps 1.
- L400-407: median 119.982s, class-hour delta 20.244s, valid non-pit laps 6.
- L408-426: median 99.55s, class-hour delta 0.377s, valid non-pit laps 17.
- L427-446: median 101.374s, class-hour delta 2.201s, valid non-pit laps 18.
- L599-600: median n/a, class-hour delta n/a, valid non-pit laps 0.
- L601-602: median n/a, class-hour delta n/a, valid non-pit laps 0.
- L603-632: median 99.339s, class-hour delta 0.832s, valid non-pit laps 28.

## Class-Hour Context

- Hour 5 GTP: median 99.549s, p25-p75 98.788s-110.149s, laps n=277.
- Hour 6 GTP: median 99.064s, p25-p75 98.38s-100.054s, laps n=370.
- Hour 12 GTP: median 99.738s, p25-p75 98.099s-165.68s, laps n=227.
- Hour 13 GTP: median 99.173s, p25-p75 98.291s-100.355s, laps n=249.
- Hour 14 GTP: median 98.489s, p25-p75 97.864s-100.087s, laps n=266.
- Hour 18 GTP: median 101.909s, p25-p75 98.801s-174.621s, laps n=205.
- Hour 19 GTP: median 98.312s, p25-p75 97.584s-99.017s, laps n=299.

## Official Conditions

Official condition row: air 17.5C, track 34.6C, dry, confidence official.

## Caveats

- Valid non-pit laps exclude Al Kamel invalid and pit laps but are not a claim of traffic-free or green-flag conditions.
- Class-hour deltas are descriptive within the Daytona source. They are not a future performance forecast.
- Cross-class pace comparisons need class labels because GTP, LMP2, GTD PRO, and GTD have different performance envelopes.
- Co-driver comparisons are descriptive sports-car context, not a single-driver formula-series ranking.
