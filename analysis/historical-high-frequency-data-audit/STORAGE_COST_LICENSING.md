# Storage, cost, and licensing estimate

## Storage is not the binding constraint

Rights, decoding, and label quality dominate storage cost.

### BryceCast public JSON capture

Observed Nashville Practice 1 values:

- embedded legacy snapshot payload: about 358.9 KB per poll, consistent with approximately **1.3 GB/hour** database growth;
- timing object alone: about 23.9 KB per poll, approximately **86 MB/hour** before database/index overhead;
- repository V2 acceptance ceiling: no more than 15% of legacy embedded bytes, approximately **195 MB/hour** at the observed legacy rate.

Scenario assumptions:

- 75 minutes of retained green/caution capture per race;
- 17-race season;
- 40 completed Bryce INDY NXT races through 2026 Mid-Ohio;
- 45-race 2024–2026 career after the full 17-race 2026 schedule;
- race-only capture, excluding practice, qualifying, tests, retries, and warm-up.

| Scope | Capture hours | Legacy embedded snapshots | Timing object only | V2 ceiling |
|---|---:|---:|---:|---:|
| one 75-minute race | 1.25 | 1.63 GB | 0.108 GB | 0.244 GB |
| 17-race season | 21.25 | 27.6 GB | 1.83 GB | 4.14 GB |
| 40 completed races | 50.0 | 65.0 GB | 4.30 GB | 9.75 GB |
| 45-race full 2024–2026 schedule | 56.25 | 73.1 GB | 4.84 GB | 10.97 GB |

These are planning estimates, not promises. Full-weekend retention can multiply them several times; source failures and a content-addressed implementation change overhead.

At Cloudflare R2’s documented Standard price of $0.015/GB-month, the 45-race scenarios are roughly $1.10/month legacy, $0.07/month timing-only, or $0.16/month at the V2 ceiling before operation charges and free tier. R2 includes 10 GB-month of Standard storage in its current free tier. [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)

The engineering reason to implement V2 is not the dollar amount alone. It is portable archives, faster replay/backup, lower local-disk pressure, and elimination of repeated 100–160 KB enrichment blobs in every second.

### RaceTools replay capture

Two tested NXT race ZIPs:

| Event | ZIP | Raw replay log | Derived CSV |
|---|---:|---:|---:|
| 2024 Barber | 669,161 B | 3,609,775 B | 99,761 B |
| 2025 Barber | 643,073 B | 3,472,467 B | 124,986 B |
| average | 656,117 B | 3,541,121 B | 112,374 B |

Inventory plus simple raw-size extrapolation:

- 2024: 14 race ZIPs totaling 9,763,471 bytes;
- 2025: 14 canonical race ZIPs totaling 10,033,009 bytes after excluding one 1,210,763-byte mixed-session duplicate;
- 28 inventoried 2024–2025 races: 19,796,480 bytes compressed or about 99.2 MB raw replay logs at the two-sample average;
- 40 completed races: about 26.2 MB compressed or 141.6 MB raw logs;
- 45-race full schedule: about 29.5 MB compressed or 159.4 MB raw logs.

Those estimates exclude practices, qualifying, tests, telemetry variants, decoded normalized tables, indexes, and immutable source copies. The complete 2024 RaceTools annual ZIP is 187,952,207 bytes because it contains many INDYCAR and INDY NXT sessions. Even a conservative 10× processing/index expansion remains operationally small.

Do not use the small size as justification for a bulk download. The stop gate is legal/contractual permission.

## Licensing and terms matrix

| Source | Technical access | Documented rights state | Current action |
|---|---|---|---|
| official public Race Control blob | unauthenticated mutable live object | INDYCAR terms restrict automated copying/network monitoring and public/commercial exploitation | continue only current authorized operational behavior; obtain written scope before expansion |
| official historical APIs/PDFs | unauthenticated public results endpoints/files | same site terms and rulebook ownership language apply | retain factual lineage; legal review before public redistribution at scale |
| RaceTools replay ZIPs | unauthenticated directory/ZIP downloads observed | RaceTools software requires a license; no archive reuse/model/redistribution grant found; underlying INDYCAR data ownership separately asserted | bounded proof only; no bulk ingest |
| INDYCAR/team IRIS/RIS/telemetry | authenticated/credentialed according to vendor docs | INDYCAR owns and controls dissemination; data-sharing route requires approval | request a written license/data-sharing agreement if project proceeds |
| HH Timing/RaceTools software | paid/licensed product | software license is not necessarily a data/content license | clarify both software and underlying-data permissions |
| TSL Timing / Al Kamel adjacent archives | public reports or credentialed feeds depending product | series/provider-specific terms | use only for their own series after separate rights review; never assume transfer to NXT |
| OpenF1/FastF1/RACECAR | public/open under their own stated terms | different series/datasets/licenses | requirements/provenance comparison only |

The 2026 INDY NXT rulebook says official timing/scoring and technical information are INDYCAR property and use requires express consent. It separately gives INDYCAR control over telemetry dissemination and includes a data-sharing approval route. [2026 INDY NXT rulebook](https://epaddock.indycar.com/docs/default-source/rules-regulations-and-policies/2026-indy-nxt-rulebook.pdf?sfvrsn=f77d165b_20)

The [INDYCAR Terms of Use](https://www.indycar.com/terms-of-use) and [INDY NXT Terms of Use](https://www.indynxt.com/terms-of-use) restrict personal/non-commercial use and prohibit scraping, network monitoring, reverse engineering, and public exploitation without permission. The [RaceTools downloads page](https://racetools.com/downloads/) identifies replay files but does not grant BryceCast model-training or redistribution rights.

This is a technical risk assessment, not legal advice.

## Permission questions that must be answered in writing

For INDYCAR:

1. May BryceCast download and retain archived INDY NXT timing-loop/RIS/IRIS data for 2024–2026?
2. May it decode and derive features for internal research and model training?
3. May it publish aggregate predictions or descriptive analytics without raw-data redistribution?
4. Which fields may be displayed, cached, replayed, or redistributed?
5. Are driver/car telemetry, GPS, timing-loop coordinates, weather, and race-control messages separately licensed?
6. What retention, attribution, rate, security, audit, and deletion obligations apply?

For RaceTools/VFX:

1. Who is authorized to download and decode public replay ZIPs?
2. Does a RaceTools software license cover the replay data, or only the executable?
3. May raw replay logs be used for internal modeling?
4. May derived non-reconstructive features or probabilities be published?
5. Does RaceTools have authority to grant those rights, or is separate INDYCAR consent mandatory?
6. May BryceCast retain source ZIP checksums and small evidence excerpts for reproducibility?

## Hard stop

Until both ownership layers are resolved, do not:

- crawl or bulk-download the RaceTools archive;
- reverse engineer the complete protocol for production use;
- add replay files to Git or the canonical SQLite archive;
- train or publish a model from the files;
- redistribute raw or normalized records;
- represent the files as open data.
