# Adjacent series, open datasets, and commercial providers

Adjacent series answer two narrower questions: what historical grain can be recovered elsewhere in Bryce’s career, and what a mature timing archive can look like. Their schemas, identities, rule regimes, and rights are not interchangeable with INDY NXT.

## Bryce-career adjacent sources

| Source | Tested/current repository coverage | Actual grain | Useful fields | Limitation/rights |
|---|---|---|---|---|
| [MYLAPS Speedhive](https://mylaps.com/motorsports/services/speedhive/) and [API docs](https://api2.mylaps.com/v3/api-docs) | all 15 FROC 2024 races; 4,861 field car-laps; all six Bryce races and 128 Bryce laps | lap completion and up to three sections, epoch-ms timestamps | rank, car/name, lap/section times, status, pits, speed, lap chart | crossing/lap grain, no coordinates; [MYLAPS app terms](https://mylaps.com/wp-content/uploads/2025/07/Terms-of-Use-MYLAPS-Apps.pdf) restrict copying/publishing/commercial reuse; robots disallow crawling |
| Euroformula official PDFs | 2023: 21 race reports and seven qualifying reports; 23.5 MB cached in canonical source package | driver/lap/sector and report | three sectors, trap speed, elapsed/time-of-day, lap chart, pit analysis | no one-second state/GPS or affirmative reuse grant; representative [Portimão report](https://gtsports-media.s3.eu-west-3.amazonaws.com/Race%201%20-%20Portimao.pdf) |
| [TSL GB3 2021 archive](https://www.tsl-timing.com/Results/bf3gt/2021) | seven events / 21 races; representative PDF reproduced | classification/report, sometimes lap/sector | total time, gaps, best lap, weather/track metadata | mainly report grain; [TSL terms](https://www.tsl-timing.com/About/Terms) restrict crawling, copying/downloading, and commercial republication without consent |
| Formula Ford 2020 / FRP F1600 2019 | canonical imports cover 46 Formula Ford sessions with 282 Bryce lap samples and 21 FRP Bryce race classifications | classification and some lap-analysis tables | results and lap summaries | report/PDF grain; provider-specific reuse rights |

FROC’s complete classification/all-laps/lap-chart/announcement payloads total only about 1.68 MB for 15 races. Lap/sector archives are inexpensive; access rights and semantic consistency remain the constraint.

## Timing-archive comparators

| Source | Tested/documented coverage | Actual grain | What it establishes | Why it is not INDY NXT backfill |
|---|---|---|---|---|
| [IMSA/Al Kamel noticeboard](https://imsa.results.alkamelcloud.com/noticeBoard.php) | 2025 Rolex 24 Time Cards JSON: 61 cars, 37,885 car-laps, 56.3 MB | lap/three-sector, elapsed/time-of-day, driver stint, pit crossing; separate millisecond flag timeline | public detailed historical result packages can be structured and timestamped | no public telemetry/GPS in tested package; noticeboard prohibits redistribution without Al Kamel consent |
| [Al Kamel V2 documentation](https://help.hhtiming.com/timekeeper-specific-info/alkamel-v2) | credentialed history/live feed | JSON timing plus explicit `rgps` real, `gps` estimated, or no GPS modes | provenance should distinguish measured and estimated position | licensed IMSA/WEC/FE protocol, not NXT |
| [OpenF1](https://openf1.org/docs/) / [FastF1 telemetry docs](https://docs.fastf1.dev/api_reference/telemetry.html) | F1 history, source dependent | multi-Hz car/location and explicit interpolated samples | raw-versus-interpolated state is a necessary schema distinction | different championship and unofficial toolchain |
| [RACECAR dataset](https://arxiv.org/abs/2306.03252) | 27 autonomous-racing sessions / 6.5+ hours | LiDAR, radar, camera, localization | physical collision geometry requires real spatial sensors | autonomous cars/scenarios, not human INDY NXT |

## Public/open INDYCAR leads tested

| Lead | Coverage | Verdict |
|---|---|---|
| [RankPredictor code](https://github.com/DSC-SPIDAL/rankpredictor), [paper](https://arxiv.org/abs/2010.01707), and [Kaggle mirror](https://www.kaggle.com/datasets/arashnic/car-racing-dataset) | academic work reports 25 IndyCar oval races; derived Kaggle main CSV has 19,426 rows | lap-level rank/gap/pit/track-status research data, not high-frequency; repository has no source-data license, and an uploader-applied label cannot clear INDYCAR rights |
| [Single 2022 Portland GitHub capture](https://github.com/neherdata/IndyCar-RaceControl-2022-Portland) | one saved Race Control snapshot, 25 cars | endpoint/field provenance only; not a time series; no license |
| Internet Archive CDX | no capture returned for canonical timing blob in bounded test | no evidence overwritten blobs can be reconstructed |

No reproducible academic or open dataset supplies INDY NXT one-second history, continuous GPS, or exact collision labels with clear reusable rights.

## Commercial/provider candidates

| Provider | Public claim/test | What must be proven before consideration |
|---|---|---|
| [Sportradar Racing API](https://developer.sportradar.com/racing/reference/overview) | expressly covers INDYCAR and INDY NXT; unauthenticated test returned `403`; published stage-summary material is lap/caution/session oriented | historical sample, update cadence, loop/coordinate fields, incident timestamps, retention, model-training/public-display/redistribution rights, price |
| [Data Sports Group](https://datasportsgroup.com/coverage/motorsports/) | markets IndyCar real-time lap-by-lap and historical season archives | actual INDY NXT coverage, schema, cadence, raw vs derived position, sample, rights, price |
| RaceTools/VFX | public replay archive plus licensed analysis software | whether replay downloads and decoded/derived use are authorized; whether INDYCAR must separately consent |
| INDYCAR / timing operations | official archived loop and telemetry data documented for internal/team users | exact 2024–2026 availability, export format, timestamps, GPS/loop semantics, data-sharing/model/display terms |
| MYLAPS, TSL, Al Kamel | capable timing operators for adjacent series | series-specific licensed export and reuse rights; no schema transfer assumption |

Any vendor evaluation should require one historical INDY NXT race sample and written answers on:

- observed versus interpolated fields;
- per-field update cadence;
- loop/sector geometry and coordinates;
- stable identity keys and corrections;
- flag versus physical-incident timestamp;
- incident participants/location completeness;
- archive retention and missing sessions;
- research, model training, derived-output display, raw retention, and redistribution rights.
