# Publication status

Updated September 20, 2026.

BryceCast is published as a public repository with an accompanying source-data release. This page records what was decided and what was checked.

## Decisions

1. **Publish the source data, credit every source, and remove on request.** Everything in the corpus was collected from pages, files and feeds its publishers make openly available. The owner chose to publish it for auditability rather than wait on individual permissions, to credit each source in [DATA_SOURCES.md](../../DATA_SOURCES.md), to notify the main timing sources after launch, and to honor any removal request. No publisher has granted written redistribution permission; the [rights register](../evidence/rights-register.csv) keeps every row open until one does. RaceTools' July 2026 verbal approval covered the BryceCast site for the driver, friends and family, and is recorded as exactly that.
2. **Ship source data as a release asset, not in Git history**, so a correction or withdrawal is one step. See [DATA_RELEASE.md](../../DATA_RELEASE.md).
3. **Keep deployment tooling private.** The scripts and service definitions for the production Mac mini live in a private companion repository. The production SQLite archive and the wider research archive are unpublished for size and operational reasons.

## Checked before launch

- Full-history secret scan of every reachable ref with Gitleaks 8.30.1: findings were public timing session keys and series identifiers, no credentials.
- Secret scan of the data release contents, including 2.6 GB of decompressed gzip payloads: no credentials. Seventeen saved third-party web pages contain those sites' own public browser API keys as served in their page source; they are source evidence read by the importers and are retained unmodified.
- No private-overlay path, SQLite file, environment file or key in any ref.
- Generated reports no longer record home-directory paths: the producers now write portable paths. One career validation report keeps its old value until the next post-race roll regenerates it, because 54 dependent files hash it.
- Build, publication checks and the data-release round-trip test in CI.

[Verification](RELEASE_VERIFICATION.md) records the September 19 preparation pass in detail. [THIRD_PARTY.md](THIRD_PARTY.md) covers licensing boundaries.

## Runtime boundary

The public repository is what production builds, but publishing it changes nothing about the running site. Credentials, host configuration and the operator token live outside Git. The local demo needs none of them.
