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
| Physical-session mileage | driver × physical session | canonical result or qualifying result | Race, practice, qualifying, heat, and official test only. INDY NXT combined classifications are excluded as summaries. Euroformula qualifying uses `qualifyingResults.laps`. F1600 `bestLapNumber` is an observed lower bound. FROC non-race rows do not expose completed laps and remain unknown. |
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
  (DNF, 9 laps), Watkins Glen 2019 Race 3 (DNS, 0), GB3 Silverstone 2022
  session 1305 (DSQ, 0), and GB3 Silverstone 2022 session 1376 (DNF, 7).
- Daytona's canonical `lapsCompleted=780` is `resultGrain=car_driver` and is
  the No. 85 shared-car total. The ten Bryce rows in
  `bryce_imsa_stint_context.csv` sum to 142 laps.
- The Barber 2025 INDY NXT `Combined Qualifications` row repeats the nine laps
  already represented by Bryce's physical Group 1 session. All INDY NXT
  combined qualifying classifications are excluded deterministically by
  session label, including zero-lap summaries.
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
