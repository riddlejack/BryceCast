# BryceCast Current Codex Handoff

Updated: 2026-06-08 08:20 CDT.

## Current Chat / Thread Label

- Current parent/orchestrator Codex thread: `Build Bryce race dashboard`
- Current parent/orchestrator thread id: `019ea567-6e10-73f2-80eb-717ba7bfbc2b`
- Workspace: `/Users/example/Documents/Bryce POV access`

Use this file as the first stop for a fresh Codex instance. The chat context has compacted repeatedly, and the project has multiple same-directory worker threads whose work must be audited from disk.

## Product Direction

BryceCast is now a Bryce Aron racing analytics product. Live Bryce in-car POV is out of scope unless Bryce/team later provides authorized access. Team radio is also out of scope for now unless reliable authorized access is later established.

Current highest-value path: build a rigorous, source-backed career/session analytics foundation and then design the website/mobile experience around verified data.

## Current Validation Baseline

Last verified with:

```bash
npm run career:import:all
npm run career:validate && npm run career:summary
npm run career:test
npm run build
```

The import chain was also idempotency-checked earlier in this pass with:

```bash
npm run career:import:all
npm run career:import:all
npm run career:test
npm run build
```

Validation result: `ok: true`.

Current canonical counts:

| Entity | Count |
| --- | ---: |
| Drivers | 558 |
| Series | 7 |
| Teams | 75 |
| Cars | 512 |
| Tracks | 42 |
| Seasons | 10 |
| Events | 87 |
| Sessions | 469 |
| Results | 8,194 |
| Qualifying results | 1,547 |
| Lap samples | 67,668 |
| Racecraft events | 35 |
| Penalties | 82 |
| Incidents | 132 |
| Derived metrics | 370 |
| Weather / track-condition observations | 86 |
| Media assets | 940 |
| Source evidence rows | 1,093 |
| Open gaps | 8 |

Validation warnings:

- `sessions.timeCoverage`: 9 physical FROC test sessions lack `scheduledStart` or `actualStart`; hour-level weather/live joins must wait for an official exact clock-time source for those rows. Euroformula 2023 now has 28 official Cronococa PDF-derived actual session starts from internally consistent `Time of Day` minus `Session Time` rows. FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs, and the other nine FROC test sessions now carry cached official Toyota test-day article context without fabricated exact starts. 37 2026 INDY NXT sessions are backfilled from official Race Control feeds: 9 result-backed trackactivity direct-ID matches, 11 schedulefeed practice/race exact event/label matches, 1 event-level schedulefeed green-flag race window, and 16 future schedule-only trackactivity sessions across 9 future canonical events. Race Control feed datetime strings are treated as source UTC and converted to canonical event-local timestamps. The FRP Road Atlanta combined qualifying classification is intentionally marked as an aggregate classification with no separate on-track window.

Track metadata:

- Direction coverage is complete for all 42 currently imported tracks. Arlington remains medium-confidence because direction is inferred from the official INDYCAR track-map turn sequence pending stronger future-circuit GIS or supplemental-regulation data.
- `npm run career:backfill:track-metadata:verify` reports `ok: true` and all track metadata quality gates pass. Its live source URL probe checked 61 URLs and returned 14 warnings from 403/404/429/timeout responses, mostly on existing venue/reference pages and IMSA-hosted PDFs that are otherwise readable through browser/search surfaces. Treat those as source-access caveats, not canonical validation errors.

## Imported Source Families

The current dataset includes these source-backed imports:

- INDY NXT 2024-2026 official API/session results, 1,238 official INDY NXT qualifyingResults rows from SessionType=Q records, 68 official terminal-status incident rows from contact/mechanical/DNS result statuses, 76 official Results PDF penalty/decision-summary rows, 64 official Results PDF caution-summary causal incident rows, 29,501 official lap-by-lap position samples from all 36 Race Lap Chart PDFs, 36 official Event Summary race-stat metric rows, 35 official Event Summary most-improved racecraft rows, 36 official Leader Lap Summary metric rows with leader timing/margins/flag states, 146 official Top Section Times metric rows across practice, qualifying, and race sessions, 145 official Section Results metric rows with lap-by-lap section times/speeds, plus 37 2026 session windows from official Race Control feeds, including 16 future schedule-only sessions that carry no result rows.
- GB3/BRDC British F3 2021 official TSL/BRSCC event pages and timing PDFs: 7 events, 39 sessions, 684 result rows, 248 qualifying rows, 38 Bryce result rows, 39 official weather/track-condition observations, 67 media/PDF assets, all 369 race start/grid positions sourced from official TSL grid PDFs, plus archived official GB3 championship standings showing Bryce P12 with 238 points.
- GB3 2022 official JSON route, plus one official-manifest-only session for source-broken session `1248`; row-level results for `1248` remain blocked by the official JSON 404.
- IMSA Daytona 2025 official Al Kamel classification/time-card data, including 37,885 lap samples and official air/track-condition fields.
- Euroformula Open 2023 official race PDFs, including race grid/start positions parsed from official position-chart `Grid` columns, 28 official PDF-derived actual session starts from internally consistent fastest-lap sequence timing rows, plus RFEDA final-classification standings showing Bryce P4 with 238 points.
- Formula Regional Oceania 2024 Toyota NZ HTML result tables, HTML grid tabs, linked official grid PDFs where present, the official Taupo Qualifying 1/2 articles for Round 1 Race 1/Race 3 grid derivation, the official Taupo Race 2 article for Round 1 Race 2 source-backed rows, the official Euromarque Qualifying 1 article for Round 4 Race 1 grid derivation, the official Highlands Grand Prix qualifying-format article for Round 5 Race 1/Grand Prix grid derivation, the official Highlands Race 2 article for the Round 5 Race 2 top-eight grid rows, and four official Toyota test-day articles that support date-level context for the nine exact-time-unsourced test sessions.
- FRP F1600 2019 official PDFs, season points, and 2 official qualifying grid-position penalties.
- Formula Ford 2020 official TSL/BRSCC/BARC/MSVR-hosted PDFs for National FF1600, Formula Ford Festival, Walter Hayes Trophy, Champion of Cadwell, and Champion of Brands, including 746 official grid/start rows, 282 source-labeled Bryce lap-analysis samples, and 4 official WHT penalty notes linked to affected result rows.
- Team USA Scholarship 2020 official pages as link-only media/source evidence plus four structured career milestones covering scholarship selection, 2018 BKC TaG Jr champion context, 2018 Yamaha KT100 runner-up context, and 2019 FRP F1600 P3/eight-podium context.
- Badger Kart Club archived official 2016/2017 fast-time and track-record pages, stored as source-backed career/achievement metrics for 2016 Yamaha Junior fast time, 2017 TaG Junior Classic Track fast time, and 2017 TaG Junior Bus Stop track record.
- FROC 2024 official Toyota schedule images plus Round 2 official Toyota timing PDFs for source-supported session-window backfill; Round 2 Race 2 start positions import from the official Toyota Grid R2 PDF; Round 1 Race 1 and Round 4 Race 1 start positions import from official Toyota Qualifying 1 articles plus qualifying tables; Round 1 Race 2 has 9 source-backed starts from the official Taupo Race 2 reverse-grid article plus Race 1 results and a direct Woods-Toth P16 statement; Round 1 Race 3 start positions import from the official Taupo Qualifying 2 adjusted grid table; Round 5 Race 1 and Grand Prix start positions import from the official Highlands qualifying-format article plus qualifying tables; Round 5 Race 2 top-eight start positions import from the official Highlands Race 2 article.
- INDY NXT official Race Control trackactivity and schedulefeed JSON for source-supported 2026 session-window backfill.
- Track metadata/weather-readiness backfill for the 42 currently imported tracks.

## Known Thread Map

These are Codex threads, not subagents.

| Thread id | Current status from direct read | Real lane / note |
| --- | --- | --- |
| `019ea567-6e10-73f2-80eb-717ba7bfbc2b` | Active parent | Orchestrator/current chat. |
| `019ea5b6-5624-7e33-a29c-283944415d7a` | Idle after course correction | Productive FRP F1600 2019 lane. Originally labels/prompts drifted, but actual useful work is FRP. |
| `019ea5b6-69ba-7541-8b2c-7eed7cf5f595` | Idle after course correction | Productive track metadata/weather-readiness lane. Scope expanded through the current 42-track metadata pack. |
| `019ea5b9-5dc8-7181-95be-0c5939584a0b` | Idle after course correction | Productive Formula Ford 2020 lane. It found/fixed an importer idempotency issue. |
| `019ea5b6-6371-71d2-a108-03e539620e16` | Idle after course correction | Coordination-risk/router thread. It received multiple lane prompts; audit any outputs carefully before trusting them. |
| `019ea5b6-5bb2-7da2-b67a-e1c2b209d5cb` | Idle router shell | Do not treat as an importer owner without later evidence. |
| `019ea5b7-d927-7fe3-b16c-f329a20ef5ef` | Idle router shell | Superseded by actual FRP work in `019ea5b6-5624...`. |
| `019ea5b8-5cb5-7a22-9d75-44a5fb80ccae` | Idle router shell | Superseded by actual track metadata work in `019ea5b6-69ba...` / related parent work. |
| `019ea5b8-e158-77b1-afaf-a9eccda00bea` | Idle router shell | Spawned/forwarded Formula Ford 2020 to `019ea5b9-5dc8...`. |

Course-correction messages were sent to the four active/important threads:

- Productive lanes were told to finish lane-owned work, stop broad shared-file edits, and report changed files/counts/validation.
- The overloaded router thread was told to pause broad behavior, avoid shared edits, and hand off only unique artifacts/status.
- All were reminded that future explicit forks should use `gpt-5.5` with reasoning `high`, not `xhigh`.

## Coordination Risk

The parallelization was useful, but messy. Multiple same-directory threads edited shared files:

- `package.json`
- `data/career/sources.manifest.json`
- `data/career/README.md`
- `docs/CAREER_DATA_FEASIBILITY_MATRIX.md`
- `docs/CAREER_RESEARCH_WORKSTREAMS.md`
- `docs/PARALLEL_INGESTION_COORDINATION.md`
- `scripts/validate-career-data.mjs`
- `scripts/backfill-track-metadata.mjs`

Any fresh agent should assume same-file churn happened and audit final file contents against actual dataset/reports, not against chat summaries.

## Audit Items Before More Feature Work

1. Re-run `npm run career:validate && npm run career:summary`.
2. Check `data/career/reports/validation-report.json` and `data/career/reports/ingestion-summary.json`.
3. Audit the 8 current gaps. The stale broad `gap_remaining_career_rows_*` entries have been collapsed to one current broad remaining-work row. GB3 2021 Race 3 reverse-grid start positions are now source-backed from official TSL grid PDFs, so the remaining gaps are source-specific or partial-source gaps outside that closed lane.
4. `npm run career:import:all` has been run twice consecutively and produced stable collection counts with validation passing. Keep this as a regression gate after importer changes.
5. Verify no importer silently drops cross-series Bryce identifiers or overwrites unrelated source-family rows.
6. Verify track metadata source provenance for all 42 tracks after future track imports. Current direction coverage is complete; Arlington remains medium-confidence because it is a future temporary circuit.
7. Session-time coverage is improved from 53 missing starts to 9 physical sessions, and weather-readiness now reports 307 precise-window sessions. Euroformula 2023 has 28 precise-window sessions from official Cronococa PDF timing rows; FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs; the other nine FROC test sessions have cached official Toyota test-day article context but still lack exact clock-time sources; 37 2026 INDY NXT sessions are precise-window-ready from official Race Control feeds, including 16 future schedule-only rows across Road America, Mid-Ohio, Nashville, Portland, Milwaukee, and Laguna Seca event IDs. Race Control feed datetime strings are source UTC, then converted to canonical event-local timestamps. The remaining blocked rows are FROC test sessions outside Round 2 that are absent from Toyota race-weekend schedule images and extracted official PDF links. `session_frp_f1600_2019_r1_03_qualifying` is not a missing window; it is a combined P1/P2 classification derived from `session_frp_f1600_2019_r1_01_practice_1` and `session_frp_f1600_2019_r1_02_practice_2`.
8. Audit reports/importers for stale counts in docs after future parallel edits.
9. `data/career/reports/indy-nxt-report-details-backfill-report.json` imports all 36 INDY NXT Race Lap Chart PDFs: 26 complete charts and 10 clean partial Race Lap Chart PDFs with explicit missing car-lap or official result/chart conflict diagnostics. Official Event Summary PDFs add 36 race-stat metric rows plus 35 most-improved racecraft rows with no Event Summary parser failures. Official Leader Lap Summary PDFs add 36 leader timing/margin/flag-state metric rows with no Leader Lap parser failures. Official Top Section Times PDFs now add 146 section-rank timing metric rows across practice, qualifying, and race sessions with no parser failures; one canceled 2025 Iowa qualifying PDF is held out because the official report has no section rows. Official Section Results PDFs now add 145 lap-by-lap section time/speed metric rows with no parser failures; one malformed 2024 Road America Race PDF is held out because official PDF text extraction produces no usable rows, and one canceled 2025 Iowa qualifying PDF is held out because the official report has no section rows. Source-visible rows without canonical API timing rows remain unmapped diagnostics. Official race Results PDFs add 76 penalty/decision-summary rows and 64 caution-summary causal incident rows with no Results parser failures.
10. INDY NXT official EventsSessionDetails status labels now add 68 terminal-status incident rows: 55 contact, 11 mechanical, and 2 DNS. INDY NXT Results PDF caution summaries add 64 source-causal caution incident rows with official lap ranges and narrative text. Terminal-status rows intentionally do not infer lap number, causal narrative, or other-driver attribution.

## Recommended Next Step

For the next implementation pass, prioritize one of these source-backed gaps before UI work:

- parse pit/deeper detail, lap-specific incident timing beyond caution-summary rows, or other official report rows from already cached/discoverable INDY NXT PDFs,
- backfill historical INDY NXT date-only session windows only where an official source supports exact matching without fuzzy inference.

Suggested fresh-thread prompt:

```text
You are continuing the BryceCast career-data project in /Users/example/Documents/Bryce POV access. Start by reading docs/CODEX_HANDOFF_CURRENT.md, docs/PARALLEL_INGESTION_COORDINATION.md, package.json, data/career/reports/validation-report.json, data/career/reports/ingestion-summary.json, and the import reports under data/career/reports. Verify the true current dataset state from disk before editing. Treat chat summaries as lower authority than files, validation output, importer reports, raw artifacts, and rerunnable commands. Preserve source provenance and rerun npm run career:import:all, npm run career:test, and npm run build after importer changes.
```
