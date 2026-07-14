# F6 validation results

Run from the isolated `codex/live-f6-running-order` worktree.

| Command | Result | Evidence |
| --- | --- | --- |
| `npx tsc --noEmit` | PASS | No diagnostics. |
| `npm run analytics:ui-data-package:validate` | **FAIL — inherited** | Stale embedded source reference for unchanged `scripts/api-server.mjs`; detailed in `AUDIT_REPORT.md`. |
| `npm run analytics:view-models:validate` | PASS | 24 manifest items across 5 UI surfaces. |
| `npm run test:ui-context-adapter` | PASS | Adapter hydration tests passed. |
| `npm run test:live-readiness` | PASS | 63 assertions. |
| `npm run test:live-replay` | PASS | 16 assertions; replay payload shape is live-compatible. |
| `npm run test:live-motion` | PASS | 56 assertions. |
| `npm run test:live-camera` | PASS | 39 F5 regression assertions. |
| `npm run test:live-running-order` | PASS | 37 F6 assertions, including both critical regressions. |
| `npm run test:live-runner` | PASS | 43 assertions. |
| `npm run audit:live-f6:running-order -- --sqlite=…` | PASS | 6,403 snapshots; 153,672 rank checks; zero violations. |
| `npm run qa:live-f6:running-order` | PASS | All replay/browser assertions; zero console errors. |
| `npm run audit:sources` | PASS | All nine current source probes returned 200. |
| `BRYCECAST_REPLAY=1 … npm run api:smoke -- --port=8799` | PASS | Ready/green replay; 13 API routes checked; built static app served. |
| `npm run build` | PASS | TypeScript and Vite production build completed. |
| `git diff --check` | PASS | No whitespace errors. |

The API smoke used the canonical archive read-only and a non-production temporary runner-status path. Its ignored proof fixtures were deleted after the run.
