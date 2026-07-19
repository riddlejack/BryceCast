# Historical high-frequency INDY NXT data audit

- Audit date: 2026-07-18
- Repository baseline: audit branch rebased onto canonical `master` at `c6dba948ad21465bc10157c3df21845e83f1d751`
- Scope: research artifacts only; no production runner, SQLite archive, schema, service, or capture change

## Outcome

The original question splits into three different questions with different answers:

1. **Can the exact public Race Control JSON snapshots be backfilled?** No demonstrated route. The endpoint is one mutable live object; historical-looking query parameters are ignored and guessed archive paths return `404`.
2. **Does comparable historical high-frequency timing exist?** Yes. RaceTools supplies source-feed replay logs for 2024–2025, and the newly discovered Timing71 archive supplies normalized 1–2-second replays for all 12 completed 2026 races through Mid-Ohio. Timing71 also has candidates for all 21 completed 2026 practice and qualifying sessions through Nashville qualifying on July 18.
3. **Does that enable the proposed model?** It enables a serious coarse caution-hazard experiment after replay reduction and label validation. It still does not provide GPS, lateral overlap, physical car-to-car distance, or exact contact onset, so it does not enable a credible turn-level pairwise collision model.

The user reports that RaceTools' owner approved the described private educational use. That clears the previously open RaceTools-owner gate for this project as described; provenance, transformation, and underlying-source attribution still need to remain explicit.

## Package map

- `FEASIBILITY_REPORT.md` — controlling findings, verdicts, acquisition ladder, and next experiment.
- `source-coverage-matrix.json` — machine-readable source comparison and access/licensing state.
- `FIELD_GRANULARITY_DICTIONARY.md` — current-live, current-historical, and candidate-archive field semantics.
- `access-tests.json` — representative endpoint, PDF, archive, Wayback, and local-archive tests.
- `INDY_NXT_CAREER_COVERAGE.csv` — race-by-race 2024–2026 completed-race backfill estimate.
- `racetools-race-inventory.json` — exact 2024 ZIP entries and 2025 session URLs/sizes.
- `TIMING71_2026_DISCOVERY.md` — controlling 2026 discovery, hidden-session recovery, cadence validation, and import stop gates.
- `timing71-2026-coverage.json` — exact replay IDs, official-session mapping, exclusions, and local acquisition evidence.
- `STORAGE_COST_LICENSING.md` — volume scenarios, storage costs, rights, and stop gates.
- `YELLOW_FLAG_MODEL_FEASIBILITY.md` — explicit targets, observability, leakage, validation, and product limits.
- `ADJACENT_SOURCE_AUDIT.md` — adjacent Bryce-career sources, open datasets, and paid-provider leads.
- `probe-racetools.mjs` — bounded proof-of-access validator; it does not bulk-download a season or retain payloads.
- `probe-timing71.mjs` — public API coverage check; optional `--sample` downloads one replay to a temporary directory, validates its fixed size and ZIP integrity, then deletes it.

## Reproduce the bounded proof

Requirements: Node.js 20+ and network access.

```bash
node analysis/historical-high-frequency-data-audit/probe-racetools.mjs all
node analysis/historical-high-frequency-data-audit/probe-timing71.mjs
node analysis/historical-high-frequency-data-audit/probe-timing71.mjs --sample
```

The 2024 test fetches only the final 2 MiB ZIP directory plus one 669,161-byte stored race ZIP via HTTP ranges. The 2025 test fetches one 643,073-byte race ZIP. Both remain in memory. The script verifies fixed audit checksums, enumerates message families, validates one-second heartbeat continuity, extracts track timing-point labels, and reports derived CSV columns.

This reproducer remains bounded because the full 2024–2026 acquisitions are stored outside Git. The user reports project-specific RaceTools approval; no raw replay payload is committed or placed in the production archive.

## Evidence vocabulary

- **Observed** — reproduced by repository, SQLite, HTTP, or archive inspection in this audit.
- **Documented** — stated by the source owner or an authoritative technical document.
- **Derived** — calculated from observed records; not source-native measurement.
- **Inference** — best explanation consistent with evidence, not directly verified.
- **Unknown** — a stop condition, not permission to assume a favorable answer.
