# BryceCast

**A driver-centered motorsport data system: from inconsistent historical records and live timing feeds to source-backed race analysis.**

BryceCast follows Bryce Aron's career across junior single-seaters, INDY NXT, and endurance racing. It brings together historical research, timing reconstruction, weather context, competitor comparisons, and a web companion designed around real race weekends.

[Website](https://brycecast.com) · [Engineering atlas](docs/ENGINEERING_ATLAS.md) · [Architecture](docs/ARCHITECTURE.md) · [Run locally](#run-the-historical-demo) · [Data release plan](DATA_RELEASE.md)

> **Publication candidate:** the code repository is being prepared privately. Included historical outputs and third-party visual/data assets remain under source-specific review. Raw archives and production SQLite are candidates for a separate permissioned release; they are not included in this Git checkout. See [release status](docs/RELEASE_STATUS.md).

![Qualifying section analysis in the local historical demo](docs/evidence/qualifying-heat-map.png)

## What went into it

The figures below describe the source corpus and stored analytical outputs, **not the volume shipped in this repository**. Dates and denominators are part of every claim.

| Scale | Meaning |
| --- | --- |
| **7 series · 10 series-season records · 2019–2026** | Unequal source coverage across Bryce's career; 87 events and 493 sessions |
| **8,943 session-result records · 75,589 lap samples** | Full-field/session records and source-bounded lap observations; not 8,943 races |
| **2,613,292 timing-loop crossing rows** | Normalized RaceTools output across 143 source captures; not GPS telemetry |
| **45/45 INDY NXT races with observed timing and replay coverage** | 2024–2026 career ledger; does not imply uninterrupted one-second capture |
| **115 exact-window historical weather joins** | Modeled hourly weather for eligible INDY NXT sessions through July 18, 2026; date-only sessions were withheld |
| **7.62 GB · 1,136 source objects** | Indexed historical archive including a broader INDYCAR research pool; permission-pending source files |

Career counts are from September 10, 2026; timing coverage is recorded September 11. The [machine-readable evidence receipt](docs/evidence/portfolio-stats.json) includes source paths, hashes, dates, caveats, and stored validation results. Run `npm run portfolio:stats` to recompute that receipt from the included reports. See the [weather case study](docs/case-studies/04-weather-and-wind.md) for the older weather cutoff and source-family differences.

## Engineering stories

| Problem | What the project does | Evidence and limits |
| --- | --- | --- |
| No GPS trace for section heat maps | Decode timing clocks, reconcile loop geometry, and map named intervals onto track outlines | [Heat maps without GPS](docs/case-studies/01-heatmaps-without-gps.md); 21/25 stored race comparisons have tick-exact median lap-time residuals |
| A lap chart cannot tell you where order changed | Reconstruct relative crossing order and bound a change between named loops | [Pass placement](docs/case-studies/02-pass-placement.md); no exact pass coordinate or physical proximity claim |
| Qualifying formats disagree | Separate capture laps, official group rank, combined grid, doubleheader rules, and oval averages | [Qualifying](docs/case-studies/03-qualifying.md); cancellation and missing ranks remain visible |
| Weather is not a date-only join | Join source-backed session windows and track locations; rotate meteorological wind bearing into the map frame | [Weather and wind](docs/case-studies/04-weather-and-wind.md); modeled/near-track weather stays distinct from official conditions |
| A more accurate backtest can still be invalid | Compare baseline, ridge, and nearest-neighbor models; retain null results and reject post-race leakage | [Models and leakage](docs/case-studies/05-models-and-leakage.md); no validated public prediction claim |
| Multiple race-day monitors exhausted the process budget | Centralize polling/persistence in one supervised ingestor and make viewers read cached state | [Live reliability](docs/case-studies/06-live-reliability.md); the original capture gaps remain documented |
| Career data has very different depth by series | Normalize outcomes while preserving source-family eligibility; build series-specific analyses | [Career and competitors](docs/case-studies/07-career-and-competitors.md); descriptive comparisons, not causal driver/team attribution |
| One-second captures repeat slow-changing payloads | Store immutable payload versions by content hash and reconstruct observations through references | [SQLite archive](docs/case-studies/08-sqlite-archive.md); runnable synthetic migration and byte-equivalence checks |

The [engineering atlas](docs/ENGINEERING_ATLAS.md) also covers cautions, restarts, race narratives, archive discovery, source contamination, career mileage/travel estimates, and the less visible integrity controls.

## Run the historical demo

Use **Node.js 24** and npm:

```bash
npm ci --ignore-scripts
npm run build
npm run demo
```

Open **http://127.0.0.1:4173**. The demo serves the actual React application and included historical packages. Its banner identifies the snapshot date. It has **no upstream polling, production database access, operator writes, or simulated live race**. Historical Race, Tracks, and Career pages work from the included outputs; live weather, live capture, and timing downloads are explicitly unavailable.

The website linked above is a separate deployment. Running this demo does not connect to or update it.

## Reproduce a method without licensed source data

```bash
npm run example:timing  # Actual decoder, invented source-format records
npm run example:sqlite  # Actual archive migration, synthetic 600-observation database
npm run test:publication
```

The [timing example](examples/timing-sections/README.md) demonstrates a subtle bug: ignoring a pit-lane start/finish crossing loses a completed lap. The SQLite example verifies timestamps, rare transitions, idempotent migration, and byte-identical reconstruction.

These examples are small and fully runnable. Reproducing every historical chart or refitting the stored models requires the withheld canonical/source corpus. The [data release plan](DATA_RELEASE.md) describes that boundary and the intended raw/SQLite releases.

## Repository map

- `src/` — React/TypeScript application, typed adapters, track geometry, and section rendering.
- `scripts/` — ingestion, live service, validation, archive, and release/demo utilities. Live/ingestion commands are opt-in and require their documented inputs.
- `analysis/` — analytical producers, retained reports, generated context packs, and research results.
- `data/` — source manifests, coverage/validation reports, and schema definitions. Full raw/runtime datasets are withheld.
- `examples/` — synthetic, reproducible method demonstrations.
- `docs/` — architecture, case studies, data dictionary, permissions, limitations, and verification.

[Development guide](docs/DEVELOPMENT.md) · [Data dictionary](docs/DATA_DICTIONARY.md) · [Security](SECURITY.md) · [Licensing boundaries](THIRD_PARTY.md)

## Development history and AI assistance

This edition preserves the maintained branch's **301 original development commits**, beginning June 8, 2026, followed by publication-preparation changes. Historical paths/data were filtered and commit identities changed; original author dates remain. The initial commit was already a substantial baseline, so it is not a claim that all earlier work was committed. See [history provenance](docs/DEVELOPMENT_HISTORY.md).

Jack Riddle directed the product, design, features, and collaboration with Bryce. Implementation used primarily OpenAI Codex, with additional Claude Code work. The fuller owner-authored workflow narrative is pending; see [AI-use disclosure status](AI_USE.md). Commit author labels alone are not treated as a measurement of AI contribution.

Original software is offered under the [MIT license](LICENSE). That license does not grant rights to third-party data, photographs, logos, track-map source material, or restricted archives. Their status is recorded separately.
