# Scripts

Run the named `npm` commands from the repository root; [`package.json`](../package.json) is the command registry. The default public path is safe and offline: `npm run build`, `npm run demo`, `npm run test:publication`, `npm run portfolio:stats`, `npm run example:timing`, and `npm run example:sqlite`. Start with the [root guide](../README.md) or [documentation index](../docs/README.md).

## Browser map

- **Demo and development:** [`serve-demo.mjs`](serve-demo.mjs), [`write-release.mjs`](write-release.mjs), and `qa-render.mjs` support the local historical build. `api-server.mjs` is part of the operational architecture, not the offline demo.
- **Ingest and weather:** `import-*.mjs`, `backfill-*.mjs`, `ingest-history.mjs`, and `crosscheck-*.mjs` build the career corpus. `live-weather*.mjs` handles current-source weather. Refresh and live-weather commands may use external services and require an approved source workflow.
- **Analytics and packaging:** [`build-ui-data-package.mjs`](build-ui-data-package.mjs), `compute-*anchors.mjs`, `derive-section-anchors.mjs`, `build-track-outline.mjs`, and [`repack-live-context.py`](repack-live-context.py) transform approved inputs. Builders are opt-in when the full corpus is restored; package validators remain useful on included artifacts.
- **Live and archive operations:** `live-runner.mjs`, `race-poller.mjs`, `live-replay.mjs`, `postrace-*.mjs`, and `archive-v2-migrate.mjs` can read or mutate runtime state. Do not run them against production from a public checkout. Shared implementations live in [`lib/`](lib/).
- **Validation:** `test-*.mjs`, `validate-*.mjs`, `qa-*.mjs`, and `audit-*.mjs` hold regression, integrity, visual, and source checks. Prefer `npm run test:publication`; some historical live audits require withheld captures or an active service.

Safe commands never need feed credentials or polling. Treat commands containing `refresh`, `poll`, `live`, `postrace`, `migrate`, or process-control actions as explicit maintainer operations.
