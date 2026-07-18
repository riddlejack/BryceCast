# Historical high-frequency INDY NXT data audit

- Audit date: 2026-07-18
- Repository baseline: canonical `master` at `03eb8ab9f54817fe76b537c9e9bbc86671283c43`
- Scope: research artifacts only; no production runner, SQLite archive, schema, service, or capture change

## Outcome

The original question splits into three different questions with different answers:

1. **Can the exact public Race Control JSON snapshots be backfilled?** No demonstrated route. The endpoint is one mutable live object; historical-looking query parameters are ignored and guessed archive paths return `404`.
2. **Does comparable historical high-frequency timing exist?** Yes, conditionally. RaceTools publicly lists third-party replay captures of the official pit-lane timing feed. Every 2024 and 2025 Bryce INDY NXT race is represented in the archive inventory. Two bounded samples contain consecutive one-second heartbeat records plus event-driven timing-loop, flag, order, and weather messages.
3. **Can BryceCast lawfully turn those files into a public collision model now?** No. Format semantics still need validation, 2026 is absent, and INDYCAR/RaceTools reuse and model-training rights are unresolved. Public downloadability is not a license.

The high-frequency archive supports a serious **loop-level caution-hazard experiment** if rights are cleared. It does not supply the continuous 2-D car geometry, lateral overlap, or exact contact labels required for a turn-level pairwise collision model.

## Package map

- `FEASIBILITY_REPORT.md` — controlling findings, verdicts, acquisition ladder, and next experiment.
- `source-coverage-matrix.json` — machine-readable source comparison and access/licensing state.
- `FIELD_GRANULARITY_DICTIONARY.md` — current-live, current-historical, and candidate-archive field semantics.
- `access-tests.json` — representative endpoint, PDF, archive, Wayback, and local-archive tests.
- `INDY_NXT_CAREER_COVERAGE.csv` — race-by-race 2024–2026 completed-race backfill estimate.
- `racetools-race-inventory.json` — exact 2024 ZIP entries and 2025 session URLs/sizes.
- `STORAGE_COST_LICENSING.md` — volume scenarios, storage costs, rights, and stop gates.
- `YELLOW_FLAG_MODEL_FEASIBILITY.md` — explicit targets, observability, leakage, validation, and product limits.
- `ADJACENT_SOURCE_AUDIT.md` — adjacent Bryce-career sources, open datasets, and paid-provider leads.
- `probe-racetools.mjs` — bounded proof-of-access validator; it does not bulk-download a season or retain payloads.

## Reproduce the bounded proof

Requirements: Node.js 20+ and network access.

```bash
node analysis/historical-high-frequency-data-audit/probe-racetools.mjs all
```

The 2024 test fetches only the final 2 MiB ZIP directory plus one 669,161-byte stored race ZIP via HTTP ranges. The 2025 test fetches one 643,073-byte race ZIP. Both remain in memory. The script verifies fixed audit checksums, enumerates message families, validates one-second heartbeat continuity, extracts track timing-point labels, and reports derived CSV columns.

This is a technical access test only. Do not expand it into a bulk downloader until written permissions cover acquisition, decoding, model training, publication, and redistribution.

## Evidence vocabulary

- **Observed** — reproduced by repository, SQLite, HTTP, or archive inspection in this audit.
- **Documented** — stated by the source owner or an authoritative technical document.
- **Derived** — calculated from observed records; not source-native measurement.
- **Inference** — best explanation consistent with evidence, not directly verified.
- **Unknown** — a stop condition, not permission to assume a favorable answer.
