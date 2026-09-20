# Source notices and contacts

Status: **no notice has been sent yet.** The plan is to notify the three timing sources first, shortly after launch, then the career-results publishers.

BryceCast publishes its source data with credit and removes anything a publisher asks to have removed ([policy](../../DATA_RELEASE.md)). These notices are a courtesy and an open door: they tell each publisher what is being used, how it was collected, where it is credited, and how to ask for changes. Use the [rights register](../evidence/rights-register.csv) to record replies. A blank field means unknown, never approved.

## First three contacts

1. **RaceTools / Realtime Software Development** — `info@racetools.com`, with sales/support routes and phone details on the official [RaceTools contact page](https://racetools.com/contact/). Existing approval is verbal, from July 2026, and scoped to the BryceCast site for the driver, friends and family; say plainly that the repository now includes the recordings.
2. **Timing71** — `info@timing71.org` on the current [Timing71 site](https://www.timing71.org/). Older official [Timing71 documentation](https://info.timing71.org/) identifies James Muscat and `james@timing71.org`. Ask about archive recordings, analyses, and normalized timing data. The AGPL license for Timing71 software and the license for its documentation do not establish rights in archived race data.
3. **INDYCAR / INDY NXT / Race Control** — `indycar@indycar.com` and `marketing@indycar.com` on the official [INDYCAR contact page](https://www.indycar.com/Contact-Us). Ask the recipient to route the request to timing/data licensing. Specify official results JSON, PDFs, Race Control captures, track maps, and media separately.

## Career-family follow-up tier

Contact the publisher or promoter named on each source item. A promoter may need to route timing-delivery material to its timing contractor.

| Career/source family | First official route | Material to identify in the request |
| --- | --- | --- |
| IMSA / Al Kamel | [IMSA contact](https://www.imsa.com/contactus/), then `info@alkamelsystems.com` via [Al Kamel contact](https://alkamelsystems.com/contact/) if IMSA directs | Official result JSON/CSV, time cards, PDFs, and normalized derivatives. |
| GB3 / MSVR / TSL | [GB3 contact](https://www.gb-3.net/contact-us), [MSVR](https://www.msvr.co.uk/car/about), and [TSL Timing](https://www.tsl-timing.com/) | 2021 timing books, grids, weather/conditions, 2022 data, and derived rows. Ask who controls each document class. |
| Euroformula Open | `info@gtsport.es`; official promoter identity on [Euroformula's GT Sport page](https://euroformula.gtsport.es/about-us) | Classification PDFs, extracted tables, and derived analytics. |
| Formula Regional Oceania | `racing@toyota.co.nz` on the official [Toyota Gazoo Racing New Zealand page](https://www.toyota.co.nz/toyota-racing/toyota-gazoo-racing/) | Official pages, result/grid tables, PDFs, and images. |
| FRP F1600 | `clayh@racefrp.com` and `Media@racefrp.com` on the official [Formula Race Promotions site](https://www.racefrp.com/) | 2019 results/standings PDFs, extracted classifications, and public display. |
| Formula Ford / UK club sources | [BRSCC contacts](https://brscc.co.uk/centres-and-contacts/), [BARC contact](https://www.barc.net/contact/), [Castle Combe contact](https://castlecombecircuit.co.uk/contact-us/), and [TSL Timing](https://www.tsl-timing.com/) | Result books, lap charts, grids, and source-specific derived outputs. Do not assume one organizer controls another publisher's timing book. |
| Team USA / karting | The publisher of each Team USA Scholarship page; [Badger Kart Club contact](https://badgerkartclub.com/contact-us/) for its records | Article text/images, historical results, fast-time records, and factual extracts as separate classes. |

OpenStreetMap and Open-Meteo have published license terms rather than ad hoc permission routes. Follow the [OpenStreetMap Legal FAQ](https://wiki.openstreetmap.org/wiki/Legal_FAQ) for ODbL attribution/share-alike analysis and [Open-Meteo terms](https://open-meteo.com/en/terms) for CC BY 4.0 attribution and endpoint-use conditions. Government weather sources should retain their notices; non-U.S. sources need source-specific review.

## Notice template

**Subject:** BryceCast — an open-source fan project that uses your public timing data

```text
Hello [name/team],

I built BryceCast (https://brycecast.com), a non-commercial site that follows my
friend Bryce Aron's racing career. I have just open-sourced it:
https://github.com/riddlejack/brycecast

It uses [exact material: e.g. the session replay and map files on your public
downloads page, 2024-2026 INDY NXT], which I collected from [URL] without any
login or payment. With it, the project [what it produces: e.g. reconstructs laps
and section times to draw track heat maps].

You are credited here: https://github.com/riddlejack/brycecast/blob/main/DATA_SOURCES.md

Because I want the analysis to be checkable, the repository's data release
includes a copy of those source files. If you would prefer a different credit,
want any of it removed, or would rather I link to your site instead of
including the files, tell me and I will change it promptly.

Thank you for publishing this data in the first place. The project would not
exist without it.

Jack Riddle
[contact]
```

Record each reply in the rights register with the date, what was asked for, and what was changed. Silence is not permission; it leaves the row open.
