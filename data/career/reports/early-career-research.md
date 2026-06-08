# Early Career Research Report

Status: completed research intake from parallel workstream.

## Bottom Line

Confidence is high for 2019 FRP F1600 and 2020 UK Formula Ford. Confidence is medium for SCCA/club karting. Confidence is low for any claimed Lucas Oil participation by Bryce Aron because no public source directly tied him to Lucas Oil race entries before 2021.

## Best Source Set

| Source | Years / Events | Fields | Reliability | Use |
| --- | --- | --- | --- | --- |
| FRP F1600 Results Archive: `https://www.racefrp.com/results-archive/f1600` | 2019 F1600 full season; 2020/2021 archive present | Event dates, track, session PDFs: practice, qualifying, races | Tier 1 official | Normalize session/event results, grid, finish, laps, fastest lap, car/team when PDFs include it. |
| FRP Standings: `https://www.racefrp.com/standings` | 2019 F1600 points | Season points PDFs | Tier 1 official | Normalize championship table and final rank. |
| FRP 2019 Season Recap: `https://www.racefrp.com/f1600-news/2019-season-news-and-recap` | 2019 F1600 | Confirms Bryce P3 overall | Tier 1 official | Cross-check season rank. |
| FRP K-Hill 2019 Entry News | 2019 pre-season | Car #81, Mygale/Honda, K-Hill/Imperial Motors Jaguar, karting championship context | Tier 1 official | Entrant/team/car/sponsor context. |
| Team USA 2020 Winners Announcement: `https://teamusascholarship.org/?p=5355` | 2020 Team USA Scholarship | Recipient status, age/hometown, intended UK FF events | Tier 1 official | Scholarship award and planned event participation. |
| Team USA Bryce Aron Blog: `https://teamusascholarship.org/?p=5362` | Karting through 2020 | First-person history, 2018 BKC Tag Jr champion, Yamaha KT100 runner-up, 2019 FRP P3/8 podiums, 2020 UK summary | Tier 1/2 | Biographical milestones and pointers. |
| Team USA Walter Hayes Report: `https://teamusascholarship.org/?p=5614` | 2020 Walter Hayes Trophy | Grand Final P3, starting position, field size, narrative | Tier 1/2 | Normalize WHT result with TSL technical source. |
| TSL Walter Hayes event: `https://www.tsl-timing.com/event/204456` | 2020 Walter Hayes Trophy | Full PDF book, qualifying, heats, progression, semifinals, final | Tier 1 official timing | Normalize full WHT event path. |
| BRSCC 2020 Formula Ford Festival TSL PDF | 2020 Formula Ford Festival | Full timing book; Bryce Heat 1 P4 with fastest lap, Grand Final P5 | Tier 1 official timing | Normalize Festival progression and session fields. |
| GB3 Bryce profile: `https://www.gb-3.net/drivers/2022/bryce-aron` | Career summary through 2021/2022 | Confirms 2021 GB3 P12 and 10 top-10 finishes | Tier 1 official profile | Season-level cross-check. |
| Badger Kart Club 2016/2017 fast-time pages | 2016-2017 karting | Official fast-time/track-record entries | Tier 1 club official | Normalize karting records as achievements, not race starts. |
| Bryce Aron karting page: `https://www.brycearon.com/news/karting` | 2015-2018 karting | Self-published accomplishments | Tier 3 self source | Gap map unless matched to official records. |
| DriverDB Bryce Aron: `https://www.driverdb.com/drivers/bryce-aron` | 2017 onward | Aggregated yearly series, teams, starts, wins, podiums, poles, fastest laps, points/rank | Tier 2 aggregator | Cross-check and missing-event index. |
| Formula Scout 2020 review | 2020 UK/US FF context | Narrative cross-check | Tier 2 media | Context and anomaly detection. |
| Team USA alumni page | Career summary | Broad path from karting to F1600, UK FF, GB3 | Tier 1 organization summary | Biographical ladder milestones. |

## Coverage Findings

Earliest reliable public records are karting-adjacent rather than complete karting results. Badger Kart Club has official track-record/fast-time pages showing Bryce Aron in 2016 Yamaha Junior and 2017 TaG Junior. Team USA and Bryce's own site fill in 2015-2018 class progression, but full race-by-race karting records are fragmented.

2019 is the first year with strong event-level normalization. FRP's official archive and standings can support a clean F1600 Championship Series dataset: events, sessions, grids, results, laps, times, fastest laps, and final championship rank.

2020 UK Formula Ford is well covered but spread across organizers. The strongest technical sources are BRSCC/TSL for Formula Ford Festival and TSL for Walter Hayes Trophy. Castle Combe, Champion of Brands, Champion of Cadwell, and BRSCC National FF1600 need event-by-event TSL/BRSCC harvesting.

Lucas Oil/Formula Car Challenge should be treated as negative/unchecked for Bryce unless a direct timing sheet appears.

## Priority Harvest Order

1. FRP 2019 archive PDFs plus 2019 points PDF.
2. BRSCC/TSL 2020 Formula Ford Festival PDF and TSL Walter Hayes Trophy event book.
3. TSL/BRSCC/Castle Combe pages for 2020 National FF1600, Champion of Brands, Champion of Cadwell, Castle Combe FF1600.
4. Badger Kart Club records plus WKA/SKUSA/Route 66 official archives where available.
5. DriverDB only after official sheets, as cross-check and missing-event index.
