# Data sources and credits

BryceCast is a non-commercial fan project. It exists because racing series, timing providers and volunteers publish their data openly, and this page is where they get the credit.

Everything below was collected from pages, files and feeds that each organization makes publicly available without a login or a payment. Nothing was purchased, and nothing came from behind an account. The data remains the property of its publishers. The MIT license on this repository covers the BryceCast software only.

**If you represent a source listed here and want something changed or removed, [open an issue](https://github.com/riddlejack/brycecast/issues) or contact me through my [GitHub profile](https://github.com/riddlejack). I'll take it down.**

## Timing

| Source | What BryceCast uses | How it was collected |
| --- | --- | --- |
| **[INDYCAR](https://www.indycar.com) / INDY NXT Race Control** | Live timing and scoring during sessions; official results, section reports and schedules | The public Race Control timing feed, sampled once a second while a session is live; official result documents downloaded from the series site |
| **[RaceTools](https://racetools.com)** (Realtime Software Development) | Recorded timing sessions with loop-by-loop crossing clocks, and track loop geometry. This is the source behind the section heat maps and pass placement | Replay and map files from the public [RaceTools downloads page](https://racetools.com/downloads/) |
| **[Timing71](https://www.timing71.org)** | Archived race replays for the 2026 INDY NXT season | The public [Timing71 replay archive](https://archive.timing71.org/). BryceCast reads the archive format with its own small interpreter; no Timing71 code is included |

## Career results

| Series | Publisher | What BryceCast uses |
| --- | --- | --- |
| INDY NXT (2024–2026) | INDYCAR | Results, qualifying, lap charts, section reports, penalties |
| IMSA WeatherTech (2025) | [IMSA](https://www.imsa.com), timing by Al Kamel Systems | Results, time cards, stint and lap data |
| Formula Regional Oceania (2024) | [Toyota Gazoo Racing New Zealand](https://www.toyota.co.nz/toyota-racing/toyota-gazoo-racing/) | Results pages, grids, timing PDFs, event articles |
| Euroformula Open (2023) | [GT Sport](https://euroformula.gtsport.es) | Classification PDFs |
| GB3 (2021–2022) | [GB3](https://www.gb-3.net) / MSVR, timing by TSL Timing | Timing books, grids, classifications, conditions |
| Formula Ford (2019–2020) | BRSCC, BARC, MSVR, Castle Combe Racing Club, TSL Timing and individual circuits | Result books, lap charts, grids, classifications, conditions |
| F1600 Championship Series (2019) | [Formula Race Promotions](https://www.racefrp.com) | Results and standings PDFs |
| SCCA U.S. Majors Tour / Hoosier Super Tour (2019) | [SCCA](https://www.scca.com), timing on [growtiming.scca.com](https://growtiming.scca.com) (Orbits) | Race results and grids for Sebring, Circuit of the Americas and Road Atlanta; the Southeast Conference standings report |
| Right Coast Formula F Series (2019) | Right Coast Formula F Series, at the FRP All Formula Weekend | Mid-Ohio race classification (Orbits) |
| USF Pro 2000 (2024) | USF Pro Championships, timing by INDYCAR | Freedom 90 classification and qualifying at Lucas Oil Indianapolis Raceway Park |
| Euroformula Open 2023, Mugello (reported only) | [Speedsport Magazine](https://www.speedsport-magazine.com), [Formula Scout](https://www.formulascout.com) | Press results for two races whose official classification was not found; recorded as gaps, not results |
| Track lengths and turn counts | Circuit sites (Circuit of the Americas, Castle Combe), official timing sheets, and [Wikipedia](https://en.wikipedia.org) infoboxes (Sebring, Castle Combe turns, Lucas Oil IRP) | Length, turns, direction and coordinates for circuits without an official turn count in the data |
| Karting and scholarship context | Team USA Scholarship, [Badger Kart Club](https://badgerkartclub.com) | Published results, records and articles |

## Weather, maps and geography

| Source | License | Use |
| --- | --- | --- |
| **[Open-Meteo](https://open-meteo.com)** | [CC BY 4.0](https://open-meteo.com/en/terms) | Modeled hourly weather joined to session windows and shown on the live site |
| **NOAA / National Weather Service** | U.S. public domain | Near-track observations where available |
| **[OpenStreetMap](https://www.openstreetmap.org/copyright)** contributors | ODbL | Circuit outlines and track geometry are derived from OSM data. © OpenStreetMap contributors |
| **[Natural Earth](https://www.naturalearthdata.com)** | Public domain | Land texture for the career map ([source record](analysis/career-atlas/data/SOURCE.md)) |

## Fonts

| Font | License | Use |
| --- | --- | --- |
| **[Schibsted Grotesk](https://github.com/schibsted/schibsted-grotesk)**, © 2023 The Schibsted-Grotesk Project Authors | [SIL Open Font License 1.1](public/fonts/OFL.txt) | The site's typeface, served from `public/fonts/SchibstedGrotesk-VF-tnum-digits.woff2`: `SchibstedGrotesk-VF.woff2` modified so its tabular-figures feature (`tnum`) changes only the digits 0-9 (OFL 1.1 permits modification; the license declares no Reserved Font Name) |

Photos, logos and series marks that appear in the corpus or on the site belong to their respective owners and are used for identification only. BryceCast is not affiliated with or endorsed by any series, team, broadcaster or data provider.

## Where the data lives

- **In this repository:** the derived analysis the app reads — context packs, coverage and validation reports, section observations — along with source manifests that record each file's URL and hash.
- **In the data release:** the raw career corpus, timing captures and replay feeds, published as a release asset on this repository and installed with `npm run data:restore`. Keeping it out of Git history means it can be corrected or withdrawn cleanly if a publisher asks.
- **Not published:** the live site's SQLite archive and the wider multi-gigabyte research archive, which are too large to distribute this way. [DATA_RELEASE.md](DATA_RELEASE.md) has the details.

The per-source working notes — contacts, what was asked of whom, and the status of each — are in the [rights register](docs/evidence/rights-register.csv) and [source-use record](data/historical-data-lake/PERMISSIONS_AND_SOURCE_TERMS.md).
