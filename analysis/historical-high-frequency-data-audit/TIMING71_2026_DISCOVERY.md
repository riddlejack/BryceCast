# Timing71 2026 INDY NXT replay discovery

Audit date: 2026-07-18

## Finding

[Timing71's public replay archive](https://archive.timing71.org/) is the missing 2026 source. Its [OpenAPI index](https://archive.timing71.org/openapi.json) exposes searchable replay metadata and direct Backblaze download URLs. The archive currently contains near-one-second normalized timing recordings for every completed 2026 INDY NXT race through Mid-Ohio, plus every practice and qualifying session through Nashville qualifying on July 18.

This changes the 2026 technical verdict:

- all **12/12 completed races** have a complete high-frequency replay candidate;
- all **21/21 completed practice and qualifying sessions** through Nashville qualifying have a replay candidate;
- Nashville's race is not a historical candidate yet because it is scheduled for July 19;
- the files are Timing71 display-state recordings derived from the live INDYCAR feed, not byte-for-byte Race Control JSON snapshots;
- they contain no GPS, track coordinates, lateral position, official `DriverID`, or `EventSessionID`.

## Why ordinary search missed three races

Timing71 recordings can span consecutive INDY NXT and INDYCAR sessions. The ZIP generator names a replay from the final manifest in the capture. Therefore a file that begins with a complete NXT race and later switches to INDYCAR can be indexed under the later INDYCAR session.

Searching only `description like "%INDY NXT%"` finds 32 2026 records but produces two false positives and misses three complete races:

- exclude `d4d03566-91a1-4772-a12b-f61cd00c35ed`: it is labelled Road America Race 1 but contains only stale/pre-race NXT states around an INDYCAR session and no NXT race checkered state;
- exclude `dd951383-eb15-4242-a985-96c426ea8ab8`: it is the first WWT qualifying-labelled capture but is overwhelmingly a different session; use `7955b89c-7029-4a9f-bea0-769925a47c36` for NXT qualifying;
- recover Barber Race 1, IMS Race 1, and Road America Race 1 by querying every `series = IndyCar` replay in the expected time window and inspecting the roster, lap count, and flag state inside the ZIP.

## Complete race coverage

| Official session | Timing71 replay ID | Discovery path | Validation |
|---|---|---|---|
| 6751 — St. Petersburg | `a3fdd8d2-ac20-4398-ba8b-6e78fa1c1b1a` | NXT-labelled | 24-car NXT roster; checkered; max lap 42 |
| 6753 — Arlington | `a1cfa8d9-ce92-4424-95b9-e1cec62a7bc3` | NXT-labelled | 24-car NXT roster; checkered; max lap 15 |
| 6750 — Barber Race 1 | `1522fa4d-cb20-46fa-8e97-3769480327b8` | hidden inside INDYCAR-labelled capture | NXT segment 13:03:58–14:26:09 ET; checkered 13:54:56; max lap 35 |
| 6752 — Barber Race 2 | `d364ad8e-831f-493e-8549-30e6a05231cb` | NXT-labelled | 24-car NXT roster; checkered; max lap 30 |
| 6756 — IMS Race 1 | `323a79f6-8cba-4cd6-bbc0-e1ed1650ae64` | hidden inside INDYCAR-labelled capture | NXT segment 16:03:11–17:30:48 ET; checkered 17:03:41; max lap 29 |
| 6765 — IMS Race 2 | `e17a3b10-889c-40d5-aba7-3c5648d13216` | NXT-labelled | 24-car NXT roster; checkered; max lap 30 |
| 6749 — Detroit | `4b5590b2-499f-424d-9898-e250a0c1a129` | NXT-labelled | 24-car NXT roster; checkered; max lap 42 |
| 6763 — WWT Raceway | `d8efcb85-3eed-4410-b514-714b64f3eb85` | NXT-labelled after a short stale INDYCAR prefix | 24-car NXT roster; checkered; leader max lap 75 |
| 6762 — Road America Race 1 | `089a8c49-ab69-4f6e-a4e4-c01793d07075` | hidden inside INDYCAR-labelled capture | NXT segment 11:33:24–12:55:28 CT; checkered 12:25:38; max lap 20 |
| 6754 — Road America Race 2 | `5aa5070d-23ff-495d-887c-6f83717b2cc9` | NXT-labelled | 24-car NXT roster; checkered; max lap 18 |
| 6761 — Mid-Ohio Race 1 | `88bfc2e9-33d3-44f5-b3ca-98900e65d95e` | NXT-labelled | 24-car NXT roster; checkered; max lap 35 |
| 6760 — Mid-Ohio Race 2 | `ed6dcdbd-befc-4136-95c6-e300f761f0ac` | NXT-labelled | 24-car NXT roster; checkered; max lap 30 |

The three hidden candidates contain 5,369, 5,430, and 5,432 recorded states over 6,124, 6,179, and 6,188 seconds respectively. Their median timestamp gap is one second, p95 is two seconds, and maximum is two seconds.

## Recording format and grain

The [Timing71 recorder implementation](https://github.com/timing71/chrome/blob/master/src/replay.js) stores at most the latest state in each wall-clock second. It writes a complete state every tenth observation and an `i.json` incremental frame otherwise. The [service-state documentation](https://info.timing71.org/reference/state.html) explicitly describes the data as display-oriented.

Representative Road America Race 2 replay:

- 5,421 timestamped state files across 6,183 seconds;
- 543 full states and 4,878 incremental states;
- 4,657 one-second gaps and 763 two-second gaps;
- median gap one second, p95 two seconds, maximum two seconds;
- 24 stable NXT car/name identities in the clean session;
- full and incremental flag states plus timestamped messages;
- no `trackDataSpec` fields and no physical position coordinates.

Normalized car columns are:

`Num`, `State`, `Driver`, `Team`, `Laps`, `T`, `PTP`, `Gap`, `Int`, `S1`, `BS1`, `S2`, `BS2`, `S3`, `BS3`, `Last`, `Spd`, `Best`, `B.Spd`, and `Pits`.

These are strong inputs for a coarse next-minute/next-lap caution experiment. `Gap` and `Int` remain timing gaps, not metres. Sector values remain timing fields, not turn occupancy. The archive does not support a turn-level pairwise collision model.

## Local acquisition evidence

The bounded season acquisition is stored outside Git at:

`/Users/example/Downloads/BryceCast-Timing71-INDYNXT-2026-through-2026-07-18`

It contains:

- 32 NXT-labelled replay ZIPs and 32 analysis JSON files;
- three additional cross-session ZIPs and three analysis JSON files for the hidden Race 1 captures;
- the replay API metadata manifest;
- 71 files totalling 66,286,392 bytes;
- 35 ZIPs that all pass `unzip -tq` integrity validation.

The raw replay ZIPs are the acquisition source. Timing71 analysis JSON is derived output. Neither has been added to Git, the production SQLite archive, or any deployed service.

## Import stop gates

Before a BryceCast importer is written:

1. build a reducer for Timing71 full states and incremental frames;
2. require an NXT roster/session gate rather than trusting the archive description;
3. trim cross-session files at validated series/session boundaries;
4. validate final lap counts and flag transitions against official reports;
5. retain Timing71 replay ID, original URL, source timestamp, and transformation version;
6. mark the source as a third-party normalized replay of the live timing feed, not an official archived Race Control snapshot;
7. keep all raw files outside the production database until the importer and provenance contract pass review.

The best next experiment is to reduce one clean replay and one cross-session replay into the existing BryceCast snapshot shape, then compare ranks, gaps, laps, and flag transitions against the official lap chart and caution summary. Expected information gain is high because it tests the only remaining technical risk: faithful replay reduction and session segmentation.
