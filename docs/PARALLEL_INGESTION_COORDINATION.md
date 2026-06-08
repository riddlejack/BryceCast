# Parallel Ingestion Coordination

Status: active coordination log.

This file tracks independent research/import lanes so the project does not lose work across Codex threads or duplicate source extraction.

## Thread Policy

- Future forked Codex threads should use `gpt-5.5` with reasoning set to `high`.
- Do not use `xhigh` unless the user explicitly asks for it again. It resets the cache and materially increases token cost.
- Fork only when a lane has an independent source family, write scope, and verification path.
- Every child thread should return source URLs, raw-artifact paths, import status, validation status, conflicts, and unresolved gaps.
- Child threads may use their own subagents when their lane has independent source probes.

## Active Forked Lanes

Several forks were spawned before the reasoning policy changed from `xhigh` to `high`. Preserve their thread IDs and evaluate their final outputs before starting duplicate work. Direct thread reads after compaction showed that some forks were repurposed by queued delegation prompts, so the table below records observed state rather than the original intended map.

| Thread ID | Observed State | Lane / Ownership | Integration Note |
| --- | --- | --- | --- |
| `019ea5b6-5624-7e33-a29c-283944415d7a` | Integrated. | FRP F1600 2019 PDF lane. | Added `scripts/import-frp-f1600-career.mjs`, `data/career/raw/frp-f1600/**`, and `data/career/reports/frp-f1600-import-report.json`. Imports 37 source-validated sessions, 564 full-field rows, 37 Bryce rows, 21 Bryce race rows, and official season points P3/639. One Pittsburgh qualifying archive link is staged only because the PDF header/date identify Summit Point. |
| `019ea5b6-5bb2-7da2-b67a-e1c2b209d5cb` | Idle as of direct read. | Delegation/orchestration residue. | Direct read showed it mainly sent lane prompts elsewhere. Do not treat it as having completed an importer without a later final output. |
| `019ea5b6-6371-71d2-a108-03e539620e16` | Idle after later direct read. | Coordination-risk/router thread. | Received multiple lane prompts and should not be treated as a clean importer owner. Any unique output from it must be reconciled against disk reports before use. |
| `019ea5b6-69ba-7541-8b2c-7eed7cf5f595` | Integrated. | Track Metadata / Weather Readiness. | Track metadata source pack and backfill now cover all 42 imported tracks. `career:backfill:track-metadata:verify` reports `ok: true`; prior live URL warnings are source-access caveats, not validation failures. |
| `019ea5bd-c3a8-72c3-b70e-92ac3a7a90a6` | Empty/in-progress shell as of direct read. | Intended GB3 2021 replacement lane. | No useful output in the thread read. Treat as redundant because GB3 2021 is already present on disk, covered by importer reports and regression checks. |
| `019ea5bd-c479-74b1-98f3-ee20d5420350` | Integrated. | FROC 2024 Toyota NZ lane. | Imported Toyota NZ HTML tables, grid evidence, 52 sessions, 832 results, and preserved the Round 4 date conflict. Later integrated backfills add schedule-image/test-PDF session windows, official Taupo/Euromarque Race 1 starts, and official Highlands grid-rule starts. |
| `019ea5bd-c568-7663-a960-c8bb25fc817c` | Integrated. | Euroformula 2023 lane. | Imported official GT Sport/Euroformula 2023 PDFs: 28 sessions, 178 race rows, 61 qualifying rows, 18 Bryce race rows, plus RFEDA final-classification standings showing Bryce P4/238. Official API had no 2023 rows; mutable 2026 classification URL caveat is recorded. |

## Additional Active / Recent Threads To Check

The recent thread list also showed BryceCast forks beyond the first four. These were read in the fresh audit; keep the notes below as routing context before new lane assignment:

- `019ea567-6e10-73f2-80eb-717ba7bfbc2b`: parent/orchestrator thread, active.
- `019ea5b9-5dc8-7181-95be-0c5939584a0b`: Formula Ford 2020 lane, integrated.
- `019ea5b8-e158-77b1-afaf-a9eccda00bea`: router shell that forwarded Formula Ford 2020 to `019ea5b9-5dc8...`.
- `019ea5b8-a0ab-7d01-9339-3e643066c7f6`: idle, older BryceCast thread.

Known referenced shells:

- `019ea5b7-d927-7fe3-b16c-f329a20ef5ef`: router shell that forwarded FRP/F1600 work elsewhere. Treat as superseded unless it returns a distinct final output.
- `019ea5b8-5cb5-7a22-9d75-44a5fb80ccae`: referenced as track metadata/weather-prep lane in prior thread messages, but current track-metadata truth should be taken from disk reports.

Before spawning new workers, read active thread state and decide whether the lane is already owned. Future new forks should use `gpt-5.5` with `thinking: high`.

## Integration Rules

- Treat `data/career/career.dataset.json` as canonical only after `npm run career:validate` passes.
- Raw artifacts belong under `data/career/raw/<source-family>/`.
- Source reports belong under `data/career/reports/`.
- Importers should not silently overwrite unrelated source-family fields.
- Weather enrichment remains blocked for production analytics until each joined session has a track, timezone, session window, coordinates, source coordinates, distance, and provenance. Current track/timezone metadata is ready; exact session-window quality is still the gating field for historical INDY NXT date-only rows and remaining FROC test-session hour-level weather.
- Track temperature and surface condition must remain separate from ambient weather. Use official timing/report/broadcast/trackside evidence when available.

## Current Verified Baseline

See `docs/CODEX_HANDOFF_CURRENT.md` for the latest verified baseline and fresh-thread audit prompt.

Last verified in this thread on 2026-06-08 at roughly 08:20 CDT:

- `npm run career:import:all` was run twice consecutively and passed with stable collection counts.
- `npm run career:test`: passes.
- `npm run build`: passes with the existing Vite chunk-size warning only.
- Current canonical counts: 558 drivers, 7 series, 42 tracks, 10 seasons, 87 events, 469 sessions, 8,194 result rows, 1,547 qualifying rows, 67,668 lap samples, 35 racecraft events, 82 official penalties/decisions, 132 official incidents, 370 derived metrics, 86 weather/track-condition rows, 940 media assets, 1,093 source-evidence rows, and 8 open or partial gaps. GB3 2021 now imports 21 official TSL grid PDFs and all 369 race start/grid positions. Euroformula 2023 now has 28 official Cronococa PDF-derived actual session starts. FROC Round 1 Race 2 now has 9 source-backed starts, and FROC Round 1 Race 3 now has all 17 official Toyota Q2 article-backed starts. FROC session-window backfill now caches four official Toyota test-day articles as date-level context for the nine exact-time-unsourced FROC test sessions, without filling scheduledStart/actualStart. INDY NXT Race Lap Chart PDFs now add 29,501 official position-by-lap samples across 26 complete charts and 10 clean partial charts. INDY NXT Top Section Times PDFs now add 146 official practice/qualifying/race section-rank metric rows. INDY NXT Section Results PDFs now add 145 official lap-by-lap section time/speed metric rows, with two documented official-PDF holdouts and no parser failures. INDY NXT Results PDFs now add 76 official penalty/decision rows and 64 official caution-summary causal incident rows. INDY NXT 2026 now includes 16 future schedule-only sessions across 9 future Race Control events without fabricating result rows. Formula Ford 2020 now includes official National FF1600 Oulton Park, Brands Hatch, Silverstone International, Formula Ford Festival, Walter Hayes Trophy, Champion of Cadwell, and Champion of Brands books, plus 282 source-labeled Bryce lap-analysis samples from official Formula Ford PDFs. Team USA now contributes four structured official career milestones from verified scholarship pages. Badger Kart Club now contributes three archived official fast-time/track-record facts at career/achievement grain.
- Track metadata backfill report now covers 42 raw tracks and 42 dataset tracks.
- Track metadata source URL verification reports `ok: true` overall but 14 live URL warnings from 403/404/429/timeout responses, mostly on existing venue/reference pages and IMSA-hosted PDFs that are otherwise readable through browser/search surfaces.
- Validation warnings: 9 physical FROC test sessions lack `scheduledStart` or `actualStart`. Track direction coverage is complete for all 42 currently imported tracks. Euroformula 2023 has 28 official Cronococa PDF-derived actual session starts, FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs, the other nine FROC test sessions now carry cached official Toyota test-day article context while exact clock time remains unsourced, and 37 2026 INDY NXT sessions are backfilled from official Race Control feeds: 9 result-backed trackactivity direct-ID matches, 11 schedulefeed practice/race exact event/label matches, 1 event-level schedulefeed green-flag race window, and 16 future schedule-only trackactivity sessions. The FRP Road Atlanta combined qualifying row is explicitly non-windowed aggregate classification, not a missing physical session window.
- Imported source families: INDY NXT 2024-2026 official API plus 1,238 official INDY NXT qualifyingResults rows, 68 official terminal-status incident rows, 76 official Results PDF penalty/decision rows, 64 official Results PDF caution incident rows, 29,501 lap-by-lap position samples from 36 official Race Lap Chart PDFs, 36 official Event Summary race-stat metric rows, 35 official Event Summary most-improved racecraft rows, 36 official Leader Lap Summary metric rows, 146 official Top Section Times metric rows and 145 official Section Results metric rows across practice, qualifying, and race sessions, and 2026 Race Control session windows including future schedule-only rows; GB3/BRDC British F3 2021 official TSL/BRSCC PDFs plus official grid PDFs and archived official 2021 championship standings; GB3 2022 official JSON plus one official-manifest-only session for source-broken `1248`; IMSA Daytona 2025 official Al Kamel JSON/CSV/time-card data; Euroformula 2023 official PDFs with race grid/start positions, 28 official PDF-derived actual session starts, and RFEDA final-classification standings for Bryce P4/238; FROC 2024 Toyota NZ HTML tables plus official schedule-image, HTML/PDF grid, official Taupo and Euromarque Qualifying 1 articles, official Highlands grid-rule articles, four official Toyota test-day articles, and Round 2 timing-PDF session-window rows; FRP F1600 2019 official PDFs/points plus 2 official qualifying grid-position penalties; Formula Ford 2020 official National FF1600/Festival/Walter Hayes Trophy/Champion of Cadwell/Champion of Brands PDFs plus 746 official grid/start rows, 282 source-labeled Bryce lap-analysis samples, and 4 official WHT penalty notes; Team USA Scholarship 2020 context pages plus four structured official career milestones; and the current 42-track metadata source pack.
- INDY NXT report-detail backfill imports all 36 Race Lap Chart PDFs: 26 complete charts and 10 clean partial charts with missing car-lap or official result/chart conflict diagnostics. Official Event Summary, Leader Lap Summary, expanded Top Section Times, Section Results, and race Results PDFs imported cleanly with no parser failures; one canceled Iowa 2025 qualifying Top Section PDF is held out because the official report has no section rows, one malformed 2024 Road America Section Results PDF is held out because official PDF text extraction produces no usable rows, and one canceled Iowa 2025 qualifying Section Results PDF is held out because the official report has no section rows. See `data/career/reports/indy-nxt-report-details-backfill-report.json`.
