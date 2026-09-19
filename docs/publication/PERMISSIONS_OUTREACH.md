# BryceCast permissions outreach

Status: **draft only; no message has been sent**.

Use the [rights register](../evidence/rights-register.csv) to record responses. Blank permission fields mean unknown, never approved.

BryceCast is an existing online website. Its source-code repository remains private while public-release review is underway. Existing permission for internal use, analysis, or display does not automatically cover a public code repository, downloadable sample, raw archive, or SQLite export. Requests must separate those uses.

## First three contacts

1. **RaceTools / Realtime Software Development** — `info@racetools.com`, with sales/support routes and phone details on the official [RaceTools contact page](https://racetools.com/contact/). Ask for written scope covering public derived display, public transformation code, a small sample, compact map derivatives, and raw archives as separate decisions. Existing approval is reported as verbal and scoped to BryceCast use; raw redistribution remains open.
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

## Written request template

**Subject:** Permission request — BryceCast public portfolio and versioned data release

```text
Hello [name/team],

I maintain BryceCast, an existing online, non-commercial analytics website about
driver Bryce Aron's racing career. Its source-code repository remains private
while I review a possible public code release.

BryceCast currently uses [exact source/material, years, file classes, and URLs]
to produce [specific charts, statistics, or derived outputs]. I am requesting
written permission for these separately scoped uses:

1. Continue publicly displaying the derived charts/statistics listed in
   [attached manifest or URL].
2. Publish the transformation and validation code in a public repository, with
   source citations but without your raw files.
3. Publish a small reproducibility sample containing [exact fields/rows/files].
4. Optional and separate: redistribute [exact raw files] or a newly created,
   sanitized database export described in [manifest].

Audience and access: [online website / public portfolio / public code repository /
downloadable data release].
Commercial status: [non-commercial today; describe any contemplated future use].
Attribution proposed: "[exact credit and link]."
Transformations: [normalization, validation, aggregation, derived metrics].
Volume: [years, file count, row count, and approximate bytes].
Security/privacy: no credentials, private communications, or access-control
bypass material; operational captures remain offline unless specifically approved.

Please confirm which numbered uses you approve, required attribution, limits on
modification, redistribution, or commercial use, and whether another rights
holder must approve the underlying timing, results, map, or media material. If
raw redistribution is not permitted, permission for derived public display and
public transformation code would still be useful.

Thank you,
Jack Riddle
[contact]
```

Attach a concrete manifest. Record the response per source family with allowed audience, raw-versus-derived scope, modification, commercial use, attribution, share-alike, permission date, evidence locator, expiry/revocation terms, and reviewer. Silence leaves the requested scope `Open`; it is not permission.
