# Career life-stats semantic research

This lane separates source facts from metric facts. A canonical result row is
not automatically a personally attributable distance: the Daytona result is a
car-level classification, while the Al Kamel-derived stint table is at driver
stint grain. Likewise, a classification labelled `Combined Qualifications` is
not a second physical INDY NXT qualifying session, and an F1600 best lap on lap
N proves only that at least N laps were started.

## Metric contracts

| Metric | Metric grain | Source grain | Rule |
| --- | --- | --- | --- |
| Personally attributable race mileage | driver × physical race | canonical driver result, except Daytona driver stints | Every canonical Bryce race row. Daytona uses the sum of Bryce's Al Kamel-derived stint `lapCount`, not the shared-car classification. Sourced DNF/DSQ laps count; DNS and genuine zero-lap results remain zero. |
| Physical-session mileage | driver × physical session | canonical result or qualifying result | Race, practice, qualifying, heat, and official test only. INDY NXT combined classifications, GB3 2021 "Qualifying 2nd Fastest" re-rankings and GB3 2022 "Thursday/Friday combined" practice sums are excluded as repeats. A session whose field lap speeds imply a different layout of the same circuit is measured on that layout. Euroformula qualifying uses `qualifyingResults.laps`. F1600 `bestLapNumber` is an observed lower bound. FROC non-race rows do not expose completed laps and remain unknown. |
| Minimum travel displacement | consecutive race event pair | event venue coordinates | Great-circle venue-to-venue distance. It is a mathematical minimum, not an itinerary. |
| Route-adjusted minimum proxy | consecutive race event pair | great-circle leg plus explicit proxy | Same-country legs no longer than 750 great-circle miles use a 1.18 road-circuity factor; all other non-zero legs use a 1.08 flight-path factor; same-venue legs remain zero. This is still not actual travel. |
| Actual travel | person × itinerary | home/base and return pattern | Blocked until `seasonBase` and `returnHomeFrequency` are supplied season by season. |
| Fuel burned | series/chassis × observed mileage | mileage ledger plus assumption table | Low/base/high model only. `liters = miles × 1.609344 × litersPer100Km / 100`. These are not fuel-flow measurements. |
| Unique tires used | series/year × physical session | session lap floor plus assumption table | Low/base/high model only. Per non-zero observed session, sets are `ceil(laps / assumedLifeLaps)` and unique tires are sets × 4. Unknown-lap sessions are excluded and reported. |

Every output aggregate is labelled `observed_exact`,
`observed_lower_bound`, `modeled_range`, or `unknown`. Exact and lower-bound
components remain separate even when a floor is useful for display.

## Source audit notes

- The Career Lab conversion table excludes four unclassified canonical rows:
  Monza 2023 Race 2
  (DNF, 9 laps), Watkins Glen 2019 Race 3 (DNS, 0), GB3 Snetterton 2022
  Race 3, session 1305 (DSQ, 0), and GB3 Silverstone 2022 Race 2, session 1376
  (DNF, 7).
- Daytona's canonical `lapsCompleted=780` is `resultGrain=car_driver` and is
  the No. 85 shared-car total. The ten Bryce rows in
  `bryce_imsa_stint_context.csv` sum to 142 laps.
- The Barber 2025 INDY NXT `Combined Qualifications` row repeats the nine laps
  already represented by Bryce's physical Group 1 session. All INDY NXT
  combined qualifying classifications are excluded deterministically by
  session label, including zero-lap summaries.
- GB3 repeats (fixed November 14, 2026, career ledger discrepancy 2). Seven
  GB3 2021 "Qualifying 2nd Fastest" rows (83 laps) are the same qualifying
  session re-ranked by second-fastest lap for the Race 2 grid: same start time,
  same laps. Three GB3 2022 practice rows named "Friday combined" or "Thursday
  combined" (108 laps) are sums of that day's sessions (Silverstone 28 = 15 + 13;
  Snetterton 45 = 10 + 16 + 19 and 35 = 17 + 18). The builder checks each against
  the sessions it repeats and stops if they disagree, then lists them in
  `excluded_aggregate_sessions.csv`. Before the fix the ledger counted 191 laps
  (585.7 miles) twice.
- Brands Hatch 2022 Friday layout (fixed November 14, 2026, ledger discrepancy
  3). The four Friday sessions (56 laps) ran the 1.208-mile Indy loop, not the
  2.433-mile Grand Prix layout of that weekend's races. The field's official
  best-lap speeds give it away (101.8 mph on a 42.683 s lap is 1.207 miles). The
  builder now takes every result row that has a best lap and its official
  average speed (`raw.fastestLapAvgSpeedMph`, GB3 2022 only), and when the median
  implied lap length misses the event's track by more than 3% and matches one
  other layout of the same circuit in `venue_facts.csv` within 2%, it measures
  the session on that layout and records why in `layoutEvidence`. This removed
  68.6 miles. Corrected totals: exact 6,164 laps / 13,786.4 miles in 315
  sessions; floor 6,313 laps / 14,146.9 miles in 329 sessions; fuel
  6,396.7 / 8,699.8 / 11,482.6 litres.
- A Bryce session on a track with no `venue_facts.csv` row stops the build and
  names the track. That file is hand-kept; add the row from a named source.
- Euroformula qualifying classifications expose a real `laps` field at driver
  grain and are preferred over generic result rows.
- F1600 timing rows expose `bestLapNumber`, not total completed laps. Positive
  values are preserved only as `observed_lower_bound`; zero does not prove a
  zero-lap session.
- FROC HTML classifications expose position and best time but no lap count for
  the imported non-race rows. Those practice, qualifying, and test sessions are
  explicit unknown coverage. The canonical collection also does not contain a
  complete private-test archive; private tests beyond imported official
  sessions remain unknown.

## Resource-model source register

The numeric consumption and tire-life bands in
`data/resource_model_assumptions.csv` are declared analytical assumptions.
The URLs below support chassis, engine, or tire-supplier identity only; they do
not turn the modeled outputs into measurements.

- INDY NXT official car specification: https://www.indynxt.com/Fan-Info/INDY-NXT-101/What-to-Know
- GB3 official MSV-022 introduction: https://www.gb-3.net/news/roberto-faria-joins-carlin-for-2022-gb3-title-challenge
- Toyota FT-60/Hankook official supplier announcement: https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2019/july/hankook-tire-confirmed-as-castrol-toyota-racing-series-tyre-supplier/
- Toyota 2024 FT-60 series guide: https://www.toyota.co.nz/globalassets/toyota-racing-website/new-website/castrol-toyota-racing-series/register-your-interest/2024-ctfroc-series-guide-web.pdf
- Hoosier/FRP official supply announcement: https://www.hoosiertire.com/news/article/65598/Hoosier_Tire_and_FRP_Ink_Multi-Year_Deal
- BRSCC official 2020 Formula Ford class/tire notice: https://brscc.co.uk/brscc-revives-super-classic-name-and-classes-for-northern-and-national-formula-ford-championships/
- IMSA 2025 GTP entry context for the No. 85 Porsche 963: https://www.imsa.com/news/2025/01/21/charting-the-2025-gtp-changes/
- IMSA/Michelin official partnership: https://www.imsa.com/news/2025/10/09/imsa-and-michelin-finalize-long-term-partnership-extension-poised-to-last-until-2035/
- Euroformula official result PDFs, including Dallara F320 vehicle identity:
  https://gtsports-media.s3.eu-west-3.amazonaws.com/Qualifying%20-%20Portimao.pdf

Euroformula's 2023 tire supplier changed after the opening round. Because a
stable primary 2023 supplier notice is not present in the repository, the tire
identity is recorded as `mixed/unknown` and is not used in the numeric model.

## Career page figures

`output/career_figures.json` (built by `scripts/career_figures.py`) carries the
figures the Career page shows, each with a class (`counted`, `lower_bound`,
`modelled_range`), a unit, a display string and a one-sentence plain "how". It
also holds the share-of-his-life figures, one weeks-grid cell per ISO week from
his first race meeting to his latest, and the travel legs in date order with
coordinates and a running total. They are checked against the career ledger of
November 14, 2026 (`Portfolio/builds/project-brycecast/CAREER-LEDGER-2026-11-14.md`).

- Time: official `totalTime` where it exists (four formats parsed), his own
  Daytona lap times, and laps × best lap as a floor where there is no time.
- People: distinct other `driverId` on his race results. The range of people
  subtracts the parsing artifact and the possible duplicate spellings listed in
  `data/driver_record_variants.csv`, a hand-kept list.
- Days and weeks: the span runs from the first event's start date to the last
  event's end date, inclusive. Weeks are ISO weeks (Monday to Sunday).
- Share of his life uses a birth date that is not in the dataset (its
  `dateOfBirth` is null). It is the `BIRTH_DATE` constant in
  `scripts/career_figures.py`, given by Jack on November 14, 2026, year to
  confirm. Days alive count both the birth day and the last race day.
- Fuel is the same modelled range as above, in US gallons, for races only and
  for all official sessions. Tyres are not on the page (no honest range yet).
