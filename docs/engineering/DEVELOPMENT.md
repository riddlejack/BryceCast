# Development

BryceCast has two development modes. The default public workflow builds and tests the application from the dated derived artifacts already in Git. It needs Node.js 24 and no credentials, database, source-data restoration, network feed, or poller. The full-corpus workflow is a maintainer operation for an approved private source snapshot; it is intentionally unavailable from a fresh public clone.

## Default public workflow

Use Node.js 24. The package declares `>=22.13.0`, but Node 24 is the publication baseline used for the commands below.

```bash
nvm install 24
nvm use 24
node --version
npm ci --ignore-scripts
npm run build
npm run test:publication
```

`npm run build` runs the TypeScript compiler, creates the Vite bundle, and writes release metadata. It reads the compact aggregates and context packs included in the repository. It does not regenerate those artifacts from the withheld career corpus.

`npm run test:publication` is the default release gate. It runs the synthetic timing example, an idle local API guard, repository security checks, offline-demo HTTP checks, UI view-model validation, publication adapter checks, and the synthetic Archive V2 test. These checks do not contact a live timing or weather source. A passing run demonstrates the behavior covered by the included fixtures and derived artifacts; it does not establish live-feed availability or production deployment health.

Build the application before starting the demo:

```bash
npm run build
npm run demo
```

Open `http://127.0.0.1:4173`. The demo server binds to localhost and serves the included historical snapshot. Its API responses identify live timing, current weather, replay, and source polling as unavailable. It does not import the operational API, open SQLite, or poll upstream systems. The package currently carries a `dataAsOf` value of **2026-09-10**; the demo presents that boundary instead of implying that the snapshot is current.

## Focused reproducibility commands

The following commands are useful when reviewing one claim family without running the entire publication gate:

| Command | What it checks |
| --- | --- |
| `npm run portfolio:stats` | Prints a claim receipt assembled from included generated reports and their hashes. It does not acquire source rows or infer freshness. |
| `npm run portfolio:stats -- --write` | Rewrites [`docs/evidence/portfolio-stats.json`](../evidence/portfolio-stats.json) after an intentional evidence update. Review the diff. |
| `npm run example:timing` | Runs the production timing-section decoder on invented laps, including a pit-lane finish crossing and a missing-crossing negative control. |
| `npm run example:sqlite` | Creates temporary synthetic legacy and V2 SQLite fixtures and checks migration, reconstruction, reader compatibility, and retention behavior. |
| `npm run data:schema` | Prints the public archive schema from code without opening an operational database. |
| `npm run analytics:ui-data-package:validate` | Validates the included UI package and its context-pack references without rebuilding the source analytics. |

`npm run example:timing` and `npm run example:sqlite` are already part of `npm run test:publication`; the direct commands make those demonstrations easier to inspect. The SQLite size result is a synthetic-fixture result and must not be described as measured production storage savings. See the [data release policy](../../DATA_RELEASE.md) for the boundary between reproducible public examples and results verified against withheld inputs.

## No-source-data boundary

The default workflow intentionally requires none of the following:

- the canonical career dataset or raw career archive;
- RaceTools or Timing71 recordings;
- the timing lake, weather observation downloads, or operational SQLite files;
- API keys, cookies, host configuration, deployment credentials, or live-source access;
- a running BryceCast service, LaunchAgent, feed poller, or replay controller.

Commands whose names include `poll`, `live`, `weather`, `refresh`, `postrace`, migration, deployment, or release operations are retained because they document the application architecture. They are not part of the public development loop. Do not run them from a public clone as a way to make missing data appear. Historical operational documents also contain commands from their original context; the [publication guide](../../AGENTS.md) and [data policy](../../DATA_RELEASE.md) control this edition.

## Full-corpus workflow

The source data is published as a release asset rather than in Git ([why](../../DATA_RELEASE.md)). Install it with:

```bash
npm run data:restore
```

The script downloads the latest `data-*` release (about 855 MB, mostly mirrored timing PDFs), verifies the archive and then every file against the release manifest, unpacks into git-ignored paths, and expands the canonical dataset to `data/career/career.dataset.json` after checking its recorded SHA-256. It refuses to overwrite a differing file without `--force`; `--dry-run` previews and `--tag` pins a release. Operators with the private overlay already have these files, and the script says so and exits.

With the data restored:

```bash
npm run career:validate                   # referential integrity of the canonical dataset
npm run career:coverage                   # source coverage against the raw corpus
npm run analytics:replay-feeds:validate   # replay feed packs against their committed manifest
npm run build && BRYCECAST_REPLAY=1 npm run serve:app   # the app with replay enabled
```

From there the career corpus, semantic layer, pass-placement packs, context packs and UI data package can all be validated and regenerated, and the 2024–2025 RaceTools and 2026 Timing71 replays play in the app.

What the data release does not unlock, because it depends on the unpublished production archive or on a live operator environment: BryceCast's own Race Control capture replays and the `/api/timing-archive/*` routes (they read `data/live/brycecast.sqlite`), the standings snapshot inside the UI data package, current-conditions weather (it fetches upstream), and the `postrace:*` automation, which expects the operator's local data lake. Never point any command at a live writer database.

The optional analytics environment uses Python 3.10 or newer and may download Python packages. It is separate from the Node-only public workflow:

```bash
npm run analytics:setup
```

After restoring the data, an API-source change that affects the live context pack must flow through its owning producer. Repack the live context and manifest first, then rebuild the UI package with the committed cutoff pinned and upstream refresh disabled:

```bash
BRYCECAST_ANALYTICS_AS_OF_DATE=2026-09-10 \
~/.brycecast/runtime/analytics/bin/python scripts/repack-live-context.py

BRYCECAST_ANALYTICS_AS_OF_DATE=2026-09-10 \
BRYCECAST_SKIP_UPSTREAM_REFRESH=1 \
npm run analytics:ui-data-package

npm run analytics:ui-data-package:validate
npm run build
```

Do not run that sequence blindly. `scripts/repack-live-context.py` rewrites the live context through the owning Python producer and updates its manifest; it requires the canonical dataset and deliberately does not refresh sources or fit models. `BRYCECAST_SKIP_UPSTREAM_REFRESH=1` prevents the package builder from invoking the broader Python refresh. `BRYCECAST_ANALYTICS_AS_OF_DATE=2026-09-10` reproduces the committed analytical cutoff and prevents an accidental calendar roll. A deliberate post-race roll uses a new reviewed cutoff and its own release procedure; it is not a routine local build.

Inspect all regenerated files and claim receipts before accepting them. A package validation proves internal consistency. Full-corpus provenance and the data-as-of boundary come from the release manifest and the stored receipts. Architecture and ownership details are indexed in the [engineering atlas](ENGINEERING_ATLAS.md), and the repository lineage is described in [development history](../project/DEVELOPMENT_HISTORY.md).

The historical `analytics:external-review-pack` commands additionally require the withheld `analysis/devspace-audit/devspace-audit-evidence.json` and their declared private inputs. They are not publication checks and cannot run from this clone alone; use `test:publication` for the supported self-contained validation.
