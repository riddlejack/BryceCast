# BryceCast

This repository is the single BryceCast codebase. Production fetches `main` from here and builds it; there is no separate live-site source.

What cannot be published — the raw career corpus, the canonical dataset, the timing captures and replay feeds, and the deployment tooling — lives in a **private companion repository** that operators overlay onto a checkout of this one (git dir `<checkout>/.private.git`, work tree the checkout). Every path it tracks is matched by this repository's `.gitignore`, so a production checkout with the overlay present still reports a clean `git status`. See `docs/operations/RELEASE_AND_DATA_REFRESH.md`.

`ops/` and `scripts/deploy-to-mini.mjs` are therefore ignored here and absent from a plain clone. Nothing in `package.json` invokes them.

A checkout without the overlay builds and serves the demo, but has no inputs for `/api/weather/*`, replay playback, or the post-race data roll.

Start with README.md, docs/engineering/ARCHITECTURE.md, docs/engineering/DEVELOPMENT.md, and DATA_RELEASE.md. Existing dated internal documents are historical evidence; their deployment commands, worktree paths, "current" labels, and old coverage counts do not override this guide.

Preserve source tiers, missing states, measured-versus-derived distinctions, metric denominators, and the no-GPS boundary. Do not promote historical model diagnostics to validated forecasts. Regenerate hashes through their owning producers; do not bypass integrity checks.

Use `npm ci --ignore-scripts`, `npm run build`, `npm run demo`, and `npm run test:publication` for the default no-source-data path. Full corpus checks require separately restored source data and are documented explicitly. `npm run demo` never imports the operational API.

Do not start source pollers, touch a production SQLite file, deploy, change jobs, send permission requests, commit anything private to this repository, or change this repository's visibility unless the user explicitly authorizes that action. Raw archives and SQLite remain candidates for later permissioned data releases. Never copy them into Git merely to make a test pass.

Keep credentials outside Git. Scan all reachable historical blobs as well as the working tree when preparing a public release: `.gitattributes` can hide file contents from diff-based scanning. Preserve original author dates if history is filtered and document rewritten identities.

For ordinary documentation changes, check links and `git diff --check`. For executable changes, run the affected tests and build. For rendered changes, verify actual desktop/mobile behavior. Keep testing source/data claims separate from current deployment claims.
