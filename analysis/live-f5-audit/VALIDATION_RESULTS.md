# F5 validation results

| Command | Result | Evidence |
|---|---|---|
| `npx tsc --noEmit` | PASS | No diagnostics. |
| `npm run analytics:ui-data-package:validate` | BASELINE FAIL | Stale embedded source ref for unchanged `scripts/api-server.mjs`. Reproduced at exact F4 base `d6e0a85f4ba109a7c7374509fbc13fcab3ae99e0`; F5 does not change the package or API server. |
| `npm run analytics:view-models:validate` | PASS | 24 manifest items across 5 view-model surfaces. |
| `npm run test:ui-context-adapter` | PASS | Adapter hydration tests passed. |
| `npm run test:live-readiness` | PASS | 63 assertions. |
| `npm run build` | PASS | TypeScript and Vite production build; 2,478 modules transformed. Existing large-chunk warning only. |
| `npm run api:smoke -- --port=8799` | PASS | 13 endpoints; isolated port; static build served. |
| `npm run audit:sources -- --timeout-ms=15000` | PASS | All nine official-source probes returned 200. |
| `npm run test:live-motion` | PASS | 56 assertions. |
| `npm run test:live-camera` | PASS | 39 assertions covering camera, membership, styling, statuses, crossing, collision, caution, breaks, and session/leader changes. |
| `npm run test:live-replay` | PASS | 16 payload-shape assertions. |
| `npm run test:live-runner` | PASS | 43 assertions. |
| `npm run audit:live-f4:consistency -- --sqlite=… --out=analysis/live-f5-audit/f4-regression-proof.json` | PASS | 6,403 snapshots; no violations. |
| `npm run audit:live-f5:camera -- --sqlite=…` | PASS | 6,403 snapshots; 130,056 coordinates; clean Allaer pass; no violations. |
| `node docs/reference/dataviz-skill/scripts/validate_palette.js '#5581c2,#2f9377' --mode light --pairs all` | PASS | Lightness, chroma, CVD, and contrast checks pass; direct text labels provide the secondary encoding. |
| `node scripts/qa-live-f5-camera.mjs --base=http://127.0.0.1:5185 --api=http://127.0.0.1:8795` | PASS | Chrome-channel desktop/mobile green, mid-race, caution, COLD, and lap-10 Allaer pass proof; no console errors, overflow, identity disagreement, label collision, or camera lurch. |
| `git diff --check` | PASS | No whitespace errors at the validation checkpoint. |

The UI data package validator failure is not waived as an F5 result: it is explicitly recorded as a baseline defect and was re-run in the untouched F4 worktree at the required base, where it fails with the identical source-ref message.
