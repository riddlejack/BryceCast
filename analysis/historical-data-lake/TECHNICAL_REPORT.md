# BryceCast historical timing data lake: acquisition and readiness report

Audit and acquisition date: 2026-07-18
Coverage cutoff: end of completed sessions on 2026-07-18

## Decision

BryceCast now has a repository-managed, content-addressed local mirror of every
source object exposed by the tested RaceTools and Timing71 indexes that is
material to this project, plus the full public RaceTools INDYCAR history offered
for model research.

For Bryce's INDY NXT career, every completed championship-weekend session from
2024 through the cutoff has a high-frequency source, with exactly one documented
exception (2025 Iowa Qualifications, below):

- all 68 RaceTools INDY NXT source captures from 2024 are usable;
- 2025 has 73 usable RaceTools captures, one lower-grain CSV-only practice, and
  one contaminated duplicate; Timing71 supplies a 2,278-frame replay for the
  CSV-only practice, and the clean RaceTools copy supersedes the duplicate;
- Timing71 supplies a validated canonical replay for all 33 completed 2026
  physical sessions through Nashville qualifying: 12 practice, 9 qualifying,
  and 12 races;
- the Nashville race on 2026-07-19 and the rest of the season are future data,
  not historical gaps.

### How the completeness claim is verified

The claim is established two independent ways, so it does not survive by luck:

1. **Source-index completeness** — every file exposed by the tested RaceTools
   indexes and Timing71 IndyCar archive for 2024 through the cutoff is mirrored.
2. **Official-schedule reconciliation** — every completed canonical INDY NXT
   championship-weekend session (practice/qualifying/race, status "official") in
   `data/career/career.dataset.json` is collapsed to a physical (event, date,
   type) session and matched by date and type against a lake high-frequency
   capture. The check is repeatable:
   `node analysis/historical-data-lake/reconcile-coverage.mjs`, output at
   `catalog/coverage-reconciliation.json`. Of 129 past championship physical
   sessions, 128 match a lake capture.

**The one exception — 2025 Iowa Qualifications** (`session_indy_nxt_2025_6596`,
2025-07-11): the canonical dataset marks it "official" but it carries **zero
qualifying results** (every other 2025 quali session has 9–21), has **no
official-schedule window** and **no weather observation**, and has **no RaceTools
or Timing71 capture** (two same-day "Practice 1" recordings exist instead). All
evidence is consistent with a cancelled or converted session; it is recorded as
unmapped-with-evidence rather than assumed present.

The completeness claim is therefore bounded and stated by method: every file
visible in the tested public source indexes is mirrored, and every completed
canonical championship session is reconciled to a lake capture except the Iowa
qualifying session above. It cannot prove that an unlisted private test or
private recording never existed. No publicly indexed 2026 NXT test replay was
found.

No paid Sportradar upgrade is needed to close the current high-frequency
archive. The tested Indy Lights API provides post-event schedules and aggregate
results, not timelines, timing-loop crossings, or one-second states.

## What was acquired

The archive contains 1,046 source files and 1,046 unique SHA-256 objects,
totalling 7,506,746,405 bytes (7.51 GB decimal; approximately 6.99 GiB). Raw
payloads remain compressed and Git-ignored. Committed manifests and catalogs
make them discoverable and reproducible without expanding every session into a
second per-car/per-second copy.

| Source group | Files | Compressed bytes | Role |
| --- | ---: | ---: | --- |
| RaceTools annual archives, 2008–2024 | 17 | 2,957,791,934 | Full public INDYCAR archive, including classified NXT sessions |
| RaceTools telemetry archives, 2020–2023 | 4 | 3,471,684,850 | Highest-grain historical research pool; `$P` semantics still require validation |
| RaceTools 2025 session files | 230 | 182,193,929 | Per-session INDYCAR and NXT replay coverage |
| RaceTools 2026 root files | 2 | 2,011,406 | One valid INDYCAR file and one invalid 22-byte NXT listing |
| RaceTools INDYCAR/NXT map archives | 39 | 7,106,263 | Static track geometry and timing-section definitions |
| Timing71 replay ZIPs, 2024–2026 | 377 | 824,842,113 | Normalized full/incremental display-state history |
| Timing71 analysis files, 2024–2026 | 377 | 61,115,910 | Source-provided replay metadata and diagnostics |

Sources:

- [RaceTools annual and 2025 archive](https://racetools.com/logfiles/IndyCar/)
- [RaceTools map archive](https://racetools.com/maps/INDYCAR/)
- [RaceTools downloads page](https://racetools.com/downloads/)
- [Timing71 archive OpenAPI](https://archive.timing71.org/openapi.json)
- [Timing71 state documentation](https://info.timing71.org/reference/state.html)
- [Timing71 recording/network architecture](https://info.timing71.org/reference/network_architecture.html)

The source manifest records the URL, source grouping, year, byte size, SHA-256,
immutable object path, and human-readable view path for every payload. The
archive manager is resumable: it validates existing hashes and fetches only
missing objects. It also checks matching browser downloads before making a
network request.

Each manifest row also carries a **`provenanceGrade`** so the weakest objects are
queryable for re-verification at the next sync:

- `verified_fetch` (745 objects) — streamed directly from the source URL;
- `reused_download_verified_size` (231) — reused a local file whose byte size
  matched the source-index `expectedBytes`;
- `reused_download_basename_only` (70, all Timing71) — reused a local file matched
  on basename alone, because the Timing71 index exposes no `expectedBytes`; no
  server-side size or hash reference existed at acquisition.

All 70 basename-only objects re-hash correctly locally and passed structural
validation, but their provenance is "whatever was on this Mac", not "verified
fetch from source". They are listed in `catalog/provenance-grades.json` under
`reverifyOnNextSync` and should have their SHA-256 compared against a fresh source
fetch at the next sync. Run `node analysis/historical-data-lake/archive-sync.mjs
grade` (no network) to refresh the grades and summary.

## Validation outcome

Deep validation checked local existence, byte size, SHA-256, JSON parsing, and
ZIP structure for all 1,046 source files:

- 1,045 passed;
- one failed structurally: RaceTools' publicly listed
  `Barber Motorsports Park(Barber)-Race 2_(R2.L)_2026-03-29.zip` is exactly 22
  bytes;
- the broken object is retained as source evidence and quarantined;
- the corresponding clean Timing71 replay closes the session coverage gap.

The catalog expands the compressed sources into 5,258 replay/session
candidates without expanding their payloads on disk:

- 4,881 RaceTools candidates, of which 4,408 are standard/direct replay
  candidates and 473 are telemetry-archive candidates;
- 377 Timing71 replay candidates;
- 839 RaceTools candidates explicitly classified as INDY NXT, 2,273 as
  INDYCAR, and 1,769 older candidates retained as ambiguous rather than guessed.

Across the 839 classified RaceTools NXT candidates, 790 are immediately usable,
43 older captures require session segmentation, four cannot be analyzed as raw
logs, one is a true series mismatch, and one is the 2025 CSV-only practice.
This is a raw research pool, not a claim that all 839 rows are distinct official
sessions.

Across all 377 Timing71 replays, 371 decode cleanly. The six exceptions are
cataloged: one corrupt incremental frame in an INDYCAR practice, three
NXT-labelled stale/wrong recordings, one cross-session recording, and one false
positive. Coverage logic uses validated session segments and canonical replay
IDs, not labels alone.

## Bryce coverage, 2024 through the cutoff

RaceTools counts below are source captures. Separate qualifying groups and test
sessions can create more captures than a simple weekend-session count.

| Season | Test | Practice | Qualifying/group | Race-labelled | High-frequency resolution |
| --- | ---: | ---: | ---: | ---: | --- |
| 2024 RaceTools | 14 | 20 | 20 | 14 | 68/68 usable |
| 2025 RaceTools | 19 | 21 | 20 | 15 | 73 usable; one CSV-only practice replaced by Timing71; one contaminated race duplicate excluded |
| 2026 Timing71 canonical physical sessions | 0 indexed | 12 | 9 | 12 | 33/33 completed championship-weekend sessions present |

The material exceptions are resolved as follows:

1. **2025 IMS Practice 1:** the RaceTools raw log contains only a session
   header, although its CSV has 522 lower-grain rows. Timing71 replay
   `1be17234-2d3c-4413-94b1-e3f9a51603c6` reconstructs 2,278 source-timestamped
   Bryce-roster states.
2. **2025 IMS Race 1:** a second Race 1-labelled RaceTools capture contains
   mixed NXT and INDYCAR markers. It is quarantined; the clean 2025-05-09 Race 1
   replay is retained.
3. **2026 Barber Race 2:** the 22-byte RaceTools ZIP is invalid. The validated
   Timing71 replay supplies the session.
4. **2026 stale/cross-session recordings:** two plausible NXT labels are false
   positives, while three NXT races are embedded in recordings whose final
   manifests name a subsequent INDYCAR session. The decoder identifies and
   retains the contiguous NXT roster segment rather than trusting the filename.

The machine-readable coverage file contains 176 source/session reconciliation
rows. The 2026 list is backed by manually validated canonical replay IDs, not by
the weaker rule “Bryce appears somewhere in the recording,” because stale
rosters can persist into adjacent captures.

## What the data actually measures

### RaceTools

RaceTools is a third-party capture of the sanctioning series' pit-lane
timing-and-scoring feed. Its raw logs preserve a one-second `$H` heartbeat plus
event-driven timing, section/loop, order, flag, message, and weather families.
The heartbeat does not mean that every field or car receives a new observation
every second.

A representative 2024 Barber NXT race contains:

- 3,320 exactly one-second `$H` heartbeats;
- 14,671 named `$S` timing-section/loop records;
- 704 `$S` records for Bryce's car;
- flag/control messages, timing-point labels, order, lap, and weather families.

Heartbeat epochs are sanitized before any timing metric is derived. A corrupt or
merged log line can parse the epoch field into an absurd value (e.g. `0x39` = 57
next to real ~1.71e9 epochs, which produced a spurious 1,709,974,043-second "gap"
for 2024 St. Petersburg Practice 2). The analyzer drops feed epochs outside a
plausible Unix-second window before computing gaps and spans; `heartbeatGapMax`,
span, and count are reported after that removal, with the excluded epochs recorded
in `heartbeatEpochSanitization`. Genuine in-session gaps (e.g. Milwaukee 2025
qualifying, 635 s) are surfaced in the per-scope quality catalog's `issues` array
(`category: "heartbeat_gap"`), and known-benign gaps are annotated (the Mid-Ohio
2025 race 436 s gap is pre-green — before lap 1 completes — so no race data is
missing). A large surviving gap in a raw research file is genuine (e.g. a capture
concatenating two real test days) and is flagged rather than deleted.

The `$S` time ticks support 0.0001-second relative resolution with strong format
evidence, consistent with INDYCAR's description of timing-loop crossings. The
timezone/epoch meaning is not yet fully validated. These are precise crossing
events, not continuous car positions. The [official INDYCAR timing
explainer](https://www.indycar.com/Fan-Info/INDYCAR-101/Additional-Updates)
describes multiple embedded loops and crossings recorded to ten-thousandths of
a second.

The telemetry archives contain a much denser `$P` family. One representative
2022 St. Petersburg race expands to 105,224,091 raw bytes and contains
1,687,362 `$P` records, 7,689 heartbeats, and 48,843 named section records.
RaceTools documents telemetry logging when available, and its [version 2.56
notes](https://racetools.com/racetools-v2-56/) say `$P` lap-distance can be used
to position cars on a map. That establishes a high-value lap-distance or
telemetry-family lead; it does **not** establish observed vehicle GPS, lateral
position, heading, or unprojected physical coordinates. `$P` remains
quarantined from turn-level claims until decoded against loop crossings and
static maps.

### Timing71

Timing71 stores a display-oriented state followed by timestamped incremental
changes. BryceCast's reader applies only the recorded `add`, `change`, and
`remove` operations and can emit states at archive timestamps. It does not
interpolate missing seconds. A representative Road America race exports 5,421
observed-state rows for 24 cars.

The source normally updates at one- or two-second intervals and contains
running order, gaps, laps, sectors, lap times, pits, flags, and messages. It
does not expose validated GPS, lateral position, heading, official DriverID, or
official EventSessionID. It is comparable high-frequency timing state, not a
byte-for-byte archive of BryceCast's current Race Control JSON.

### Track maps

The 39 map archives expand to 89 static map definitions representing 49 unique
packages; 40 definitions are exact logical duplicates. They include track/pit
polylines, control-line labels, lap-distance anchors, and sometimes a geographic
reference origin. These are static geometry. They do not show where a car was
at a historical instant and must never be described as vehicle GPS.

**Consumer guard (required).** Join map packages to sessions and venues by INI
`Track.Name` **+ package SHA-256**, never by archive filename. RaceTools archive
filenames are unreliable: standalone `Mid-Ohio.zip` contains **Streets of
Toronto**, `Arlington.zip` contains **Phoenix Raceway**, and
`IndyCarMaps.zip/Portland_2018.zip` contains **Gateway**. The seven confirmed and
heuristically-flagged cases are annotated in
`catalog/track-map-definitions.json` under `filenameMismatches`, and each map row
carries a `filenameMismatch` field.

**`[GPS]` origins are untrusted for projection.** The trusted spatial frame is the
local polyline + `LapDistance` distance-along-track. Map `[GPS]` origins
(`SF_Latitude/SF_Longitude` and scales) require per-venue validation against
real-world geography before use: the `$P` telemetry probe (2026-07-19) confirmed
at least one package whose local geometry is correct but whose `[GPS]` origin
carries the wrong venue's coordinates (Toronto 43.6339, -79.4122 on a non-Toronto
map), the same class as the filename mislabels. See `gpsOriginGuard` in the
catalog and the `trust` field on every `geographicReferenceOrigin`.

**Per-venue section status.** `catalog/track-map-definitions.json` →
`venueSectionStatus` records, per INI `Track.Name`, the maximum section count,
GPS origin/scale availability, and a `sectionAnchorable` flag (max sections ≥ 10)
so a consumer can ask "can this venue be section-anchored from lake maps?" without
re-parsing archives. Venues with **no anchorable section map** include Nashville
Superspeedway (the 2026-07-19 race), Milwaukee Mile, St. Petersburg, Arlington,
Miami, and Thermal; Mid-Ohio has only 2 loop sections despite its timing feed
emitting far more section labels (its full 36-section package exists only under
the mislabeled "Streets of Toronto" name).

### Sportradar

The user's trial credential was tested in memory and was neither printed nor
persisted. The 2024, 2025, and 2026 season/schedule endpoints and representative
practice and race summaries returned HTTP 200. Results expose fields such as
position, laps, gap, speed, best speed, grid, status, and car number. No response
contained a timeline or snapshot collection.

Sportradar's [official FAQ](https://developer.sportradar.com/racing/reference/indycar-faq)
states that this product is not real-time and that practice, qualifying, and
race results are added after completion. Its [stage schedule
documentation](https://developer.sportradar.com/racing/reference/indy-lights-stage-schedule)
is useful for ID and schedule cross-checks. It cannot backfill historical
one-second state, timing loops, or coordinates, and it does not justify a paid
upgrade for the present goal.

## Storage and access design

Raw source ZIP/JSON payloads live under the Git-ignored durable archive at
`~/.brycecast/data-lake/raw`. The same bytes are exposed through human-readable
hardlinked views, so there is one physical payload per SHA-256 object. A checkout
may expose additional hardlinks, but no consumer depends on a worktree or
iCloud-managed Documents path. The committed source manifest and
catalogs are portable; another machine can reconstruct the archive by running
the resumable acquisition command.

The archive intentionally does not commit expanded per-second state tables.
Session extraction and one-second views are generated on demand, which keeps the
canonical raw evidence compact and prevents source/derived copies from drifting.
The committed quality indexes similarly retain counts, cadence, quality, and
coverage fields without repeating every roster, schema, or sample already
present in the immutable source objects.

This design also follows the attached live-storage audit without mutating
production. The existing live SQLite audit found 5.866 GB of embedded source
payloads across 16,474 snapshots, of which 5.523 GB (94.15%) was repeated
content. The approved V2 plan preserves every timing observation while storing
unchanged enrichment bodies once by content hash. The production live runner,
SQLite schema, current database, LaunchAgents, and capture behavior were not
changed by this acquisition.

## ML inventory and honest feasibility

The archive is now large enough to support data-engineering and labelability
experiments. It does not make every proposed model scientifically defensible.

| Data/model tier | Verdict | Confidence | Reason |
| --- | --- | ---: | --- |
| Exact historical official Race Control JSON | No-go | High | The observed public blob is live/mutable; neither archive is byte-identical historical JSON |
| Comparable historical high-frequency timing/loop state | Go | High | RaceTools and Timing71 close all completed Bryce sessions and provide a much broader training pool |
| Turn-level pairwise collision probability | No-go now | Very high | No validated continuous 2-D position, lateral overlap, heading, contact instant, or complete pair labels |
| Timing-loop/section pairwise congestion experiment | Conditional go | Medium-high | Section crossings permit loop-level order, gaps, and closing rates after loop/map semantics are validated |
| Next-lap full-course-yellow likelihood | Experimental go | Medium | Official caution lap ranges provide a target, but only 72 current official caution episodes and track/season dependence limit power |
| Next-minute full-course-yellow likelihood | Experimental go | Medium | Replay flag timestamps are usable, but physical incident onset can precede the flag and create leakage |
| Future-only model from BryceCast's own captures | Go for collection/shadow evaluation | High | First-party point-in-time features accumulate prospectively, but positives accrue slowly |

The broader raw training pool includes 790 immediately usable classified NXT
RaceTools candidates, 371 clean Timing71 recordings across NXT/INDYCAR, full
RaceTools INDYCAR annual archives back to 2008, and telemetry archives for
2020–2023. Older ambiguous and mixed-session files remain available but must be
segmented and series-validated before training.

The product target should be `P(FCY onset in the next lap or next 60 seconds |
currently green)`, not “which driver will collide.” Candidate features include
loop-level pairwise time gap and closing rate, order change, field compression,
lap/race phase, time since restart, track/section, driver and pair history, and
weather only when its source timestamp is honest. Tire, fuel, continuous car
position, and exact incident onset must be marked unavailable unless a source
actually supplies them.

Evaluation must hold out entire events, tracks, and later seasons; use
precision-recall, Brier/log loss, calibration, lead time, and false alerts per
race; and compare against race-phase/time-since-green baselines. Random rows from
the same event cannot be split across train and test. A public named-driver
collision score is not supportable from this archive.

## Acquisition ladder after this mirror

1. **Already local:** official lower-grain APIs/PDFs; RaceTools public annual,
   telemetry, 2025 session, 2026 root, and map objects; Timing71 2024–2026
   replay/analysis objects.
2. **Reproducible future archives:** rerun the manifest planner after each 2026
   weekend to add newly published Timing71/RaceTools objects without refetching
   existing hashes.
3. **Future BryceCast capture:** retain the official one-second poller as the
   highest-lineage source and insurance against a third-party recorder missing a
   future session.
4. **Authorized/licensed route:** request official IRIS/RIS loop/telemetry
   history only if `$P` validation or label studies show a clear missing feature.
5. **Not presently public:** exact pre-capture Race Control JSON, continuous NXT
   vehicle GPS/lateral position, and reliable second-level physical-contact
   labels.

The phrase “never fetch historical data again” is achieved for the historical
objects published through the cutoff: all are local, hashed, indexed, and
reproducible. It cannot apply to the five future 2026 races or later seasons.
Those require a small incremental sync after they occur. No already mirrored
object needs to be downloaded again.

## Best next experiment

Decode `$P` on a bounded 2022/2023 telemetry sample and align it with named `$S`
loop crossings and the static map packages:

1. determine whether `$P` is directly observed lap distance, a projected map
   position, or a mixture;
2. measure cadence, missingness, monotonicity, resets, and per-car identity
   stability;
3. verify whether `$P` crosses each named loop at the raw `$S` timestamp within
   a pre-registered tolerance;
4. reject any GPS/turn claim unless the values independently validate against
   source-documented semantics;
5. if it passes, build a loop-event table and test whether field compression and
   closing rates add held-out predictive value over a race-phase caution
   baseline.

This has the highest information gain because `$P` is the one acquired field
family capable of changing the turn/segment-level feasibility verdict. If it is
only interpolation, the correct product remains next-lap/next-minute caution
risk. If it is stable observed lap distance, a stronger segment-level internal
experiment becomes defensible—still not a true 2-D collision model.

## Reproduction and evidence

- `data/historical-data-lake/manifests/source-files.json`: source acquisition
  manifest and hashes
- `data/historical-data-lake/catalog/file-validation.json`: deep validation
  results
- `data/historical-data-lake/catalog/session-catalog.json`: 5,258 source/session
  candidates
- `data/historical-data-lake/catalog/coverage-summary.json`: completion decision
  and exceptions
- `data/historical-data-lake/catalog/coverage-reconciliation.json`:
  official-schedule reconciliation against the canonical dataset (Iowa exception)
- `data/historical-data-lake/catalog/provenance-grades.json`: per-object
  provenance grade and the basename-only objects to re-verify on the next sync
- `data/historical-data-lake/catalog/coverage-2024-through-today.csv`: row-level
  coverage matrix
- `data/historical-data-lake/catalog/racetools-session-quality-nxt.json`: all
  classified NXT RaceTools quality results
- `data/historical-data-lake/catalog/timing71-session-quality-all.json`: all
  Timing71 decoder results
- `data/historical-data-lake/catalog/track-map-definitions.json`: static map and
  timing-section definitions, filename-mismatch annotations, `[GPS]`-origin trust
  guard, and per-venue section-anchor status
- `data/historical-data-lake/catalog/sportradar-access-test.json`: credential-free
  access-test record
- `analysis/historical-high-frequency-data-audit/FEASIBILITY_REPORT.md`: original
  source feasibility audit
- `analysis/historical-high-frequency-data-audit/YELLOW_FLAG_MODEL_FEASIBILITY.md`:
  target, features, leakage, split, and evaluation memo
- `docs/LIVE_ARCHIVE_V2_PLAN.md`: safe production-storage normalization plan

Run `node analysis/historical-data-lake/archive-sync.mjs status` to prove all
manifested objects are present. The remaining validation and extraction commands
are documented in `data/historical-data-lake/README.md`.
