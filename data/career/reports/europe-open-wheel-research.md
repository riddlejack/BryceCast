# Europe and Formula Regional Research Report

Status: completed research intake from parallel workstream.

## Bottom Line

Bryce Aron's pre-INDY NXT pathway is best covered by official sources for GB3 2022 and Formula Regional Oceania 2024. GB3 2021 is official but PDF-first via BRSCC/TSL rather than current GB3 JSON. Euroformula Open 2023 is the weakest official coverage found so far; use aggregators only as cross-checks until official 2023 classifications are discovered.

## Coverage Matrix

| Series / Year | Best Sources | Fields | Extraction | Tier | Gaps |
| --- | --- | --- | --- | --- | --- |
| GB3 / BRDC British F3 style 2021 | BRSCC noticeboard PDFs, TSL Timing pages/PDF books, GB3 driver page | Classification, car no., name, nationality, team, laps, gap, diff, time, mph, best lap, penalties, weather | Crawl BRSCC/TSL PDFs and parse tables | Tier 1 PDFs | Need full 2021 PDF inventory. |
| GB3 2022 | Official GB3 JSON and MSV/TSL PDFs | Position, no., driver/team, laps, total time, gap, diff, best lap, avg speed, standings points/wins/round points | API-first: `_rounds.json`, session JSON, `_standings.json`, PDF validation | Tier 1 | JSON omits penalties/weather; use PDFs. |
| Euroformula Open 2023 | Motorsport Stats, DriverDB, SpeedSport, Racing Years, Motorsport Magazine; Motopark calendar context | Race winners, poles, fastest laps, team, standings, points, starts, wins, podiums | Aggregator scrape/cross-check | Tier 3 until official found | No stable official 2023 detailed classification API/PDF found. |
| Formula Regional Oceania 2024 | Toyota NZ round pages/news/articles/globalassets PDFs | Practice/qualifying/race tables, position, country, name, no., best time, diff, laps, track length/direction | Scrape official round pages; use PDFs as validation | Tier 1 | HTML rendered, not clean API; PDFs inconsistent. |

## Key Source URLs

GB3:

- Results shell: `https://www.gb-3.net/results`
- 2022 rounds JSON: `https://www.gb-3.net/json/results/2022/22/_rounds.json`
- 2022 standings JSON: `https://www.gb-3.net/json/results/2022/22/_standings.json`
- Session JSON pattern: `https://www.gb-3.net/json/results/2022/{sessionId}.json`
- Example official PDF pattern: `https://msvstatic.blob.core.windows.net/championship-results/Session-1084.pdf`
- GB3 profile: `https://www.gb-3.net/drivers/2022/bryce-aron`

Euroformula:

- Current official site: `https://euroformula.gtsport.es`
- Old official domain: `https://www.euroformulaopen.net`
- Motopark calendar/context: `https://en.motopark.com/euroformula-open/`
- DriverDB 2023 standings: `https://www.driverdb.com/championships/european-f3-open/2023`
- SpeedSport 2023 results: `https://www.speedsport-magazine.com/motorsport/formula-level3/european-f3-open-spanish-formula-3/2023-results.html`

Formula Regional Oceania:

- Toyota article: `https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/aron-to-begin-exciting-2024-by-racing-in-the-new-zealand-grand-prix/`
- Round 4 official page: `https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-04/`
- Round 5 official page: `https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-052/`

## Recommended Fields

Use one row per driver-session result:

`source_id`, `source_url`, `source_tier`, `series`, `season_year`, `event_round`, `race_number_global`, `race_number_event`, `event_name`, `venue`, `circuit_layout`, `country`, `track_length_km`, `track_length_miles`, `direction`, `session_id`, `session_name`, `session_type`, `session_datetime_local`, `classification_status`, `driver_name`, `driver_nationality`, `car_number`, `team`, `chassis`, `engine`, `tyre`, `position`, `start_position`, `laps`, `total_time`, `gap`, `diff`, `best_lap_time`, `best_lap_number`, `best_lap_speed_kph`, `best_lap_speed_mph`, `points`, `status`, `penalty_notes`, `weather`, `track_condition`, `printed_at`, `extracted_at`.

## Priority Harvest Order

1. GB3 2022 official JSON.
2. FROC 2024 official Toyota round pages.
3. GB3 2021 TSL/BRSCC PDF inventory.
4. Euroformula 2023 official-source discovery; only then aggregator normalization.
