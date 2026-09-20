# How BryceCast publishes its data

BryceCast publishes its code, its analysis, and the source data behind them, so that anyone can check a number by running the pipeline that produced it. Sources are credited in [DATA_SOURCES.md](DATA_SOURCES.md). The data stays the property of its publishers, and anything will be removed at a publisher's request.

## Three tiers

| Tier | What it holds | Where it lives |
| --- | --- | --- |
| **Derived analysis** | Context packs, the UI data package, coverage and validation reports, section observations, source manifests with URLs and hashes | Tracked in this repository |
| **Source data** | The raw career corpus (results, timing PDFs, official JSON, saved pages), the canonical career dataset, RaceTools-derived timing sessions, Timing71-derived replay feeds, BryceCast's own live captures, and per-race pass-placement packs | A versioned **data release** attached to this repository; installed with `npm run data:restore` |
| **Operational** | The live site's SQLite archive (about 6 GB), the wider INDYCAR research archive (about 7 GB), runtime state, deployment configuration | Not published |

Source data ships as a release asset rather than in Git history for a practical reason: a release can be corrected, re-versioned or withdrawn in one step, and Git history cannot. That is what makes "I'll take it down if you ask" a promise that can actually be kept.

The operational tier is unpublished because of size and because the SQLite archive is a working production database, not because of what it contains. A compact, freshly exported SQLite sample is a possible later release; the [archive schema](data/schema/archive-v2.sql) and a synthetic migration test are public now.

## Installing the source data

```bash
npm run data:restore
```

The script finds the latest `data-*` release, downloads the archive and its manifest, verifies the archive's SHA-256 and then every file's SHA-256, and unpacks into the git-ignored paths the pipeline reads. It never overwrites a differing file unless you pass `--force`. `--dry-run` shows what it would do; `--tag` pins a specific release.

Each release (about 855 MB, mostly mirrored timing PDFs) carries a manifest listing every file with its size and hash, the code commit it was packed against, and the archive's own checksum. Releases are immutable: a correction is a new tag, not a replaced asset.

## What each checkout can reproduce

| Command | Needs the data release? | Reproduces |
| --- | --- | --- |
| `npm run build` | No | TypeScript check and the application bundle from the tracked derived analysis |
| `npm run demo` | No | The real app serving the dated snapshot; live APIs report unavailable |
| `npm run test:publication` | No | Synthetic timing example, guarded API behavior, demo HTTP behavior, view-model checks, context-pack integrity, archive migration, data-release round trip |
| `npm run example:timing`, `npm run example:sqlite` | No | The lap decoder and archive migration on invented fixtures |
| `npm run portfolio:stats` | No | The README's headline figures, from tracked reports and their hashes |
| Full-corpus validation and regeneration ([development guide](docs/engineering/DEVELOPMENT.md)) | Yes | The career dataset checks, semantic-layer extraction, context packs and the UI data package from source |
| `BRYCECAST_REPLAY=1 npm run serve:app` | Yes | The app with RaceTools and Timing71 race replays |
| Capture replays, `/api/timing-archive/*`, standings snapshot | Needs the unpublished production archive | — |

Re-acquiring data from upstream — polling Race Control, pulling a new RaceTools or Timing71 recording — is a separate, deliberate operator action and is not part of any default command.

## Claims and receipts

A headline number should always be traceable. The [evidence receipt](docs/evidence/portfolio-stats.json) records, for each figure: its definition and grain, the generator, input and output hashes, the as-of date, and the stored validation result. Figures computed from the operational tier, which is not published, say so.

## Takedown

A publisher who wants material removed can [open an issue](https://github.com/riddlejack/brycecast/issues) or contact the maintainer through GitHub. Removal means deleting the affected files from the next data release, withdrawing earlier releases that contain them, and removing or reducing any tracked derived output that reproduces the material. The [rights register](docs/evidence/rights-register.csv) records each source family, its contact, and the status of any conversation.
