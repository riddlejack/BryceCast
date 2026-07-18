# Historical high-frequency timing and caution-risk feasibility

Audit date: 2026-07-18

## Decision

| Tier | Verdict | Confidence | Controlling reason |
|---|---|---:|---|
| A. Exact historical public Race Control JSON backfill | **No-go** | High | The public blob is mutable/live; session query strings are ignored; guessed archive objects are absent. |
| A2. Comparable source-native high-frequency timing | **Conditional technical go for 2024–2025** | Medium-high | RaceTools replay logs contain exact one-second heartbeats and event-driven official timing-feed messages, but are not identical to BryceCast snapshots. Rights and full decoding remain open. |
| B. Turn-level pairwise collision risk | **No-go** | Very high | No validated continuous 2-D position, lateral overlap, heading, pair geometry, or second-level pairwise contact labels. |
| C. Next-lap caution risk | **Conditional internal research go** | Medium | Existing official lap-range labels align with a lap-level hazard target; only 72 caution episodes limit power. |
| C2. Next-minute caution risk | **Conditional experiment only** | Medium | Replay logs may supply flag-onset time, but physical incident time can precede the flag and create leakage. |
| D. Future-only model from BryceCast captures | **Go for prospective collection and shadow evaluation; no-go for public production now** | High | Point-in-time features can be retained, but independent positive events accumulate slowly and current data rights remain a gate. |

The defensible product concept is not “collision prediction.” It is an experimental estimate of **full-course-yellow onset within the next lap or next 60 seconds while currently green**, with explicit abstention and no named-driver blame.

## The premise corrections

1. **Polling cadence is not measurement cadence.** BryceCast writes a row near once per second. At Mid-Ohio, adjacent `liveGap` changed about every four seconds; rank, lap, ordinary gap, and lap-time fields were event/lap driven. In Nashville practice, `liveGap` changed about every three seconds while lap and ranking fields changed about every 27–30 seconds.
2. **A timing gap is not physical proximity.** The current NXT archive contains no validated latitude/longitude, track coordinate, lateral position, heading, or turn occupancy. `lapDistance` remained zero in all audited Bryce records.
3. **A one-second RaceTools heartbeat is not a one-second measurement for every car.** The replay log preserves a one-second clock/heartbeat plus event-driven timing-line activity. Between-loop track-map movement is projected/interpolated, according to RaceTools documentation.
4. **Richer historical data does exist—but the official source says it is archived for teams, manufacturers, and officials.** That does not establish public access. The Andretti anecdote is technically plausible because team timing loops and telemetry exist, but it does not identify which feed or model was used.
5. **A public archive already exists in a different form.** RaceTools exposes replay captures of the official pit-lane timing feed. They are the best technical lead found, not an authorization to bulk ingest or publish INDYCAR-derived data.

## Repository reconstruction

### Current live path

The live runner polls five public objects and stores the full raw payload in `race_snapshots.payload_json` plus a compact Bryce row in `bryce_samples`:

- timing/scoring;
- event configuration;
- driver metadata;
- schedule;
- track activity.

Replay is read-only over timestamps already stored in SQLite. It does not fetch old sessions from INDYCAR. The public timing URL is a single global active-session object; the repository has no event/session parameter in the live-source contract.

Read-only SQLite observation at `2026-07-18T16:35:02Z`:

- 16,534 `race_snapshots`;
- 16,527 `bryce_samples`;
- 82,702 `source_probes`;
- 5.99 GB database size;
- observed legacy growth near 1.3 GB/hour during Nashville Practice 1.

The size is mostly repeated enrichment content, not timing novelty. The repository’s V2 plan measured 94.15% duplicate bytes across a 16,474-snapshot audit and correctly proposes content-addressed enrichment storage while preserving timing observations.

### Current historical INDY NXT lineage

The generated canonical dataset is broad but predominantly final-, lap-, or section-grain:

| Field family | Actual source | Actual grain | Not supported |
|---|---|---|---|
| Event/session catalog | `SeasonDropDown` API | one event/session definition | timing history |
| Final classification/result | `EventsSessionDetails` API | one final car/session row | point-in-time running order |
| Standings | `YearPointSummary`, `DriverYearDetails` APIs | season/final | live state |
| Lap position | official Race Lap Chart PDF | one car/completed lap | lap time, crossing time, GPS |
| Race totals and passes | Event Summary PDF | session aggregate | pass timestamps/locations |
| Leader lap | Leader Lap Summary PDF | leader/completed lap | full-field location |
| Section bests | Top Section Times PDF | best observation per car/section | continuous chronology |
| Section timing | Section Results PDF | car/lap/named section time and speed | absolute crossing timestamp, coordinates |
| Penalties/cautions | Results PDF | penalty lap; caution start/end lap and text | precise incident/flag second, complete pair labels |
| Terminal incidents | final API `Status` | final car/session outcome | event time, cause, other car |
| Weather | Open-Meteo reconstruction | modeled session-window weather | official surface/weather telemetry |
| Current derived analytics | canonical transformations over the above | derived | new measurement precision |

Generated report totals on the audited master baseline include 191 INDY NXT sessions, 3,286 final result rows, 1,430 qualifying rows, 31,894 parsed lap-chart samples, 40 race lap charts, 40 Event Summaries, 39 Leader Lap Summaries, 159 parsed Section Results, 80 official penalty rows, and 72 official caution episodes. Those counts must not be mistaken for high-frequency observations.

## Source-acquisition findings

### 1. Official public Race Control blob: live only in observed behavior

`https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json` returned the current active session. Adding `EventID`, `EventSessionID`, `id`, or lower-case variants returned byte-identical current content and the same ETag. Guessed session-specific object names returned Azure `BlobNotFound`; anonymous container listing returned `ResourceNotFound`.

This proves only that the tested query parameters do not select history. It does not prove INDYCAR has no internal archive.

The official timing explainer says transponders are read at multiple embedded loops and crossings are recorded to ten-thousandths of a second. It also says event timing data is archived for teams, manufacturers, and officials. The documented archive is therefore richer than the public blob, but public availability is not stated. [INDYCAR timing and scoring explainer](https://www.indycar.com/Fan-Info/INDYCAR-101/Additional-Updates)

### 2. Official public historical APIs and PDFs: broad but lower-grain

The INDY NXT `SeasonDropDown` API spans 2002–2026 in the tested response (346 events, 928 sessions). `EventsSessionDetails?id=...` reproduced final rows and report links for 2024 session 6314, 2025 session 6442, and 2026 session 6761. Official PDF URLs were immutable enough to reproduce old reports directly.

The key opportunity is **section crossings by lap**, not one-second snapshots. Section Results may support section-level pace and congestion summaries once loop ordering is mapped, but they lack absolute crossing times in the public PDF representation and cannot recreate an observed one-second state.

### 3. RaceTools replay archive: the strongest technical lead

The [RaceTools archive index](https://racetools.com/logfiles/IndyCar/) lists annual INDYCAR ZIPs for 2008–2024 and a browsable [2025 event directory](https://racetools.com/logfiles/IndyCar/2025/). Its [downloads page](https://racetools.com/downloads/) explicitly describes “INDYCAR (including NXT) replay files” and separately says RaceTools software requires a license.

Central-directory inventory found a RaceTools race ZIP for all 14 completed 2024 Bryce races (9,763,471 compressed bytes total). The 2025 event directories contain all 14 completed 2025 Bryce races (10,033,009 bytes after deduplication). A second Indianapolis Race 1-labelled object is contaminated: it contains 45,923 heartbeats and 22 mixed NXT/INDYCAR session markers, so it must be excluded by a manifest/preamble gate. No 2026 directory or season ZIP existed on 2026-07-18.

Bounded access tests:

| Sample | Retrieval | Raw replay | Heartbeat evidence | Other observed content |
|---|---|---:|---|---|
| 2024 Barber race | HTTP ranges extracted one 669,161-byte inner ZIP from the 188 MB season ZIP | 44,644 lines / 3.61 MB | 3,320 consecutive epochs, exactly 1 second apart, 10:05:08–11:00:27 UTC | 19 timing-point labels, loop/section/order/flag/weather families, millisecond `Yellow Flag at` message with car/turn reason, 729-row per-lap CSV, Bryce feed ID 2143 |
| 2025 Barber race | direct 643,073-byte ZIP | 42,185 lines / 3.47 MB | 3,667 consecutive epochs, exactly 1 second apart, 10:22:15–11:23:21 UTC | same 19 timing-point labels, loop/section/order/flag/weather families, millisecond flag/reason/turn messages, 662-row per-lap CSV, Bryce feed ID 2143 |

The fixed SHA-256 checksums and a bounded reproducer are in `probe-racetools.mjs` and `access-tests.json`.

RaceTools documents that its software ingests the sanctioning series’ pit-lane real-time feed, logs it, and replays a log as an emulator of live input. [RaceTools manual](https://racetools.com/racetools/Documentation/Race%20Tools%20Manual%20v2.b.pdf) Its IRIS import documentation separates line crossings and track definitions from final results, and says RaceTools calculates fields such as gap-on-track and rank-after-lap. [RaceTools IRIS import manual](https://racetools.com/racetools/Documentation/IRIS%20Import%20Module.pdf)

Therefore:

- call the source **“third-party replay capture of the official pit-lane timing-and-scoring feed”**;
- preserve the raw `.log` as source evidence;
- validate session preamble, expected series/session, heartbeat span, and duplicate/contamination state before accepting any ZIP;
- label RaceTools CSVs, projected map positions, `GapOnTrack`, and reconstructed snapshots as derived;
- do not call these archived Race Control JSON snapshots;
- do not infer GPS from timing-point labels or projected track maps.

The two tested races also preserve control text such as `Yellow Flag at: 10:20:51.384 Off Course: Car 22 in Turn 14`. This is a strong candidate label for **flag announcement/onset**, cause, car, and reported turn. It is not automatically the physical off-course or contact onset; the incident can precede Race Control's flag decision.

### 4. Team/licensed timing products

HH Timing’s current INDYCAR configuration requires credentials supplied by INDYCAR, distinguishes timing history from telemetry, and documents separate telemetry/GPS settings. It can build custom sectors from timing-loop pairs and replay sessions. This strongly supports a paid/authorized route but not a public route. [HH Timing INDYCAR documentation](https://help.hhtiming.com/series-specific-info/indycar/)

RaceTools itself is a licensed analysis product used by teams and supports historical replay. A paid software license would not automatically grant BryceCast rights to republish or train on INDYCAR data; those rights must be stated separately.

### 5. Internet Archive, GitHub, and broadcast reconstruction

- Wayback CDX returned no successful JSON capture for the tested live blob; a second race-control query timed out. Even successful sporadic captures would be too sparse and selection-biased for a race hazard model.
- No reproducible GitHub or academic INDY NXT high-frequency archive with primary provenance was found.
- Broadcast timing extraction would be OCR of displayed, delayed, selectively shown values. It cannot recover the full field at one-second cadence and would add synchronization, rights, and label error. It is a last-resort annotation aid, not observed timing data.

### 6. Adjacent series and commercial providers

Adjacent Bryce-career sources are useful at their honest grain: MYLAPS covers all 15 FROC 2024 races with epoch-ms lap completion and section records; Euroformula, GB3/TSL, Formula Ford, and FRP sources supply final/lap/sector reports. None supplies transferable INDY NXT one-second data or continuous car coordinates, and each has separate reuse terms.

The strongest comparator is IMSA/Al Kamel: public historical Time Cards can include car/lap/sector, elapsed/time-of-day, stint, pit, and a separate millisecond flag timeline, while the licensed feed explicitly distinguishes real, estimated, or absent GPS. That is the provenance discipline BryceCast needs, not a source it can substitute for NXT.

Commercial leads include Sportradar's INDYCAR/INDY NXT Racing API and Data Sports Group's claimed real-time/historical IndyCar coverage. Public materials do not establish one-second history, loop/GPS fields, model rights, or prices. One historical NXT sample and a written rights matrix are mandatory before evaluation. See `ADJACENT_SOURCE_AUDIT.md`.

## Bryce INDY NXT career coverage

The audited canonical matrix contains 40 completed races through the 2026 Mid-Ohio doubleheader:

| Season | Completed races in canonical matrix | Official lower-grain coverage | RaceTools raw replay inventory | Own high-frequency capture | Exact/comparable backfill available now |
|---|---:|---:|---:|---:|---:|
| 2024 | 14 | 14 | 14 inventoried; Barber validated | 0 | 14 conditional on rights/decoder |
| 2025 | 14 | 14 | 14 inventoried; Barber validated | 0 | 14 conditional on rights/decoder |
| 2026 through Mid-Ohio | 12 | 12 | 0 | Mid-Ohio R1/R2 complete; Road America R2 partial | 2 complete + 1 partial; 9 unavailable now |
| **Total** | **40** | **40** | **28 inventoried** | **2 complete + 1 partial** | **30 complete candidates + 1 partial** |

The official 2026 schedule contains 17 races, so five future races were not historical backfill candidates on the audit date. [Official 2026 INDY NXT schedule](https://www.indycar.com/news/2025/09/09-25-2026-nxt-schedule)

The race-by-race file is `INDY_NXT_CAREER_COVERAGE.csv`. “RaceTools inventoried” means the named session ZIP exists in a public directory/ZIP central directory; it is not a claim that every log has been decoded or licensed.

## Prioritized acquisition ladder

1. **Immediately downloadable public data** — continue using official final APIs/PDFs for final, lap, section, caution, and penalty facts. These are not high-frequency.
2. **Reproducible high-frequency archive** — RaceTools 2024–2025 replay files. Freeze at bounded technical validation until rights are written. Then validate 8–12 races before any season ingest.
3. **Lawful third-party archives** — only archives with provenance, stable identities, and explicit research/model/redistribution rights. No second INDY NXT candidate met that bar.
4. **Paid/licensed provider options** — ask INDYCAR for archived IRIS/RIS timing-loop and telemetry availability, retention, fields, timestamps, 2024–2026 coverage, and model/public-display rights; separately ask RaceTools/VFX what its license and replay-file permissions cover. Do not contact or purchase under this task.
5. **Future BryceCast capture** — preserve current one-second timing snapshots prospectively, with point-in-time flag onset and content-addressed enrichments. This remains necessary for 2026 unless a licensed archive appears.
6. **Appears unobtainable publicly** — exact pre-capture Race Control JSON snapshots, continuous NXT GPS/lateral position, exact pairwise contact geometry, and consistently second-level incident labels.

## Legal and operational stop gates

The 2026 INDY NXT rulebook states that official timing/scoring and technical information are INDYCAR property and require express consent for use; it also reserves telemetry dissemination control to INDYCAR. [2026 INDY NXT rulebook](https://epaddock.indycar.com/docs/default-source/rules-regulations-and-policies/2026-indy-nxt-rulebook.pdf?sfvrsn=f77d165b_20)

The [INDYCAR Terms of Use](https://www.indycar.com/terms-of-use) and [INDY NXT Terms of Use](https://www.indynxt.com/terms-of-use) restrict service use and prohibit automated copying/network monitoring and public/commercial exploitation without permission. This report is not legal advice, but it creates a hard project gate:

**Do not bulk-download, decode at scale, train a public model, publish derived feeds, or redistribute source-derived data until written permissions cover those acts.** Clarify rights with both INDYCAR and RaceTools/VFX because technical hosting and underlying-data ownership may be separate.

Additional stop conditions:

- no production schema or runner change until message semantics and identity mapping are validated;
- no “GPS,” “turn location,” or “distance between cars” language from timing-loop/projected data;
- no interpolation described as observation;
- no random timestamp train/test split;
- no driver-level collision score from 27 ambiguously pair-labeled multi-car caution rows;
- no public probability until held-out calibration and false-alert limits are met.

## Best next experiment

Run an **eight-to-twelve-race labelability and incremental-signal study**, after rights clearance, using the bounded raw-log parser as the seed:

1. Select road, street, and oval races across 2024 and 2025.
2. Decode only source-native timestamps, car identities, timing-line crossings, order/gap messages, flag transitions, and weather messages; retain provenance per field.
3. Align every raw flag onset to the official Results PDF caution lap range. Independently record the physical incident time when a primary source provides it; otherwise mark it unknown.
4. Pre-register `P(FCY in t+10s to t+70s | green at t)` at 10-second landmarks and a separate next-lap target.
5. Compare a race-phase/time-since-green baseline against the same model plus loop-level field compression and closing-rate features.
6. Hold out entire newest events and at least one track. Require better log loss, Brier score, AUPRC, calibration, at least 30 seconds median lead time, and no more than one false alert per race.

Expected information gain is high because one experiment resolves four uncertainties: whether the replay format is semantically decodable without proprietary software, whether flags and loop crossings align cleanly, whether pre-caution gap compression adds signal beyond naive race-phase priors, and whether physical-incident/flag delay makes the next-minute target unusably leaky.

If the replay format or rights gate fails, stop high-frequency backfill and pursue a next-lap model using official section/lap reports plus future BryceCast capture. If the incremental-signal test fails, ship descriptive caution hotspots and live field-compression context instead of a predictive score.
