# F6 — The running order audit report

## Outcome

F6 replaces only F5's lower battle-history chart. The approved Bryce-centered corridor remains in place. The new lower chart uses official running rank as its vertical coordinate and a single source/replay clock for both samples and the live right edge.

The product behavior, replay proof, payload-shape contract, readiness reducer, API smoke, source audit, TypeScript, and production build pass. One inherited analytics-package validator remains red because its committed `live-race-day-context.json` still fingerprints an older `scripts/api-server.mjs`; neither file was changed by F6. See `VALIDATION_RESULTS.md`.

## Data semantics

- Y: official integer `livePosition` (`liveRank`, with the existing official `rank` fallback), P1 at the top. Published ranks persist for lapped, pitted, or retired cars.
- X: `[first active timing sample, source now]` until five minutes exist, then the exact trailing five minutes. The latest published point of every current line uses the same timestamp as the right edge.
- Marks: sparse step-after paths. Only rank changes create vertical steps. Bryce is 2.5px gold; current-place proximity controls neutral line weight and opacity.
- Missing timing: a cadence gap breaks every series; a current source clock ahead of the last ordering sample exposes `waiting on live timing…` instead of extending a stale line.
- Crossings: observed rank swaps involving Bryce create open markers at the step. The archived Allaer event resolves to `ahead of Allaer · lap 10` at `2026-07-04T17:22:05.680Z`.
- Ladder texture: pairwise corridor intervals produce spatial `ahead` / `behind` language; unavailable intervals remain visible as `—`.

## Critical regression proof

The read-only archive audit checked 6,403 snapshots and 153,672 official ranks across Race 1 and Race 2.

1. **Lapped car upstream:** 804 archive samples contain at least one lapped car ranked upstream of Bryce. The proof includes 117 multi-sample spans. Examples include Allaer for 5 consecutive samples in Race 1 and Beeton for 12 consecutive samples in Race 2. Rank history remains present and continues appending throughout.
2. **No startup gulf:** both archived races pass t+10s and t+60s. Race 1 uses 12 samples over 11.012s and 61 samples over 60.049s; Race 2 uses 11 samples over 10.224s and 61 samples over 60.114s. In all four cases the domain starts at the first active timing sample, ends at real source now, remains in growing mode, and every current line endpoint equals the now edge.

Machine-readable proof: `automated-running-order-proof.json`.

## Browser QA

Google Chrome was driven headlessly through Playwright at 1440×900 and 390×844. Full-page captures used reduced motion; the separate motion proof used normal motion and observed the exact `transform 400ms cubic-bezier(0.23, 1, 0.32, 1)` lane transition.

The replay report proves:

- green, caution, and COLD states at both widths;
- whole, round ladder dots and no permanent label collisions or horizontal overflow;
- exact 130px gutter, seven whole rank lanes, Bryce 2.5px stroke, nearest-ahead/behind colors and copy;
- caution shading only during caution;
- upper-corridor accessible hover labels with wording aligned to the ladder;
- t+10s and t+60s growing-window captures at both widths, with lines touching now;
- history count and source clock both advancing while a lapped car remains upstream;
- Bryce P18→P17 overtake, exact Allaer/lap-10 marker, and field/chart rank agreement;
- empty plot space leaves no focused line, with the cursor position rendered into the screenshot;
- method sentences live in the source drawer, not the card body;
- zero browser console or page errors.

Machine-readable proof: `replay-visual-proof.json`.

## Screenshot index

- State full pages: `screenshots/green--{desktop,mobile}.png`, `caution--{desktop,mobile}.png`, `cold--{desktop,mobile}.png`
- State module close-ups: `screenshots/green-running-order--{desktop,mobile}.png`, `caution-running-order--{desktop,mobile}.png`
- Startup: `screenshots/startup-tplus{10s,60s}--{desktop,mobile}.png`
- Lapped upstream: `screenshots/lapped-upstream-{start,end}--desktop.png`
- Overtake: `screenshots/overtake-{before,during,after}--desktop.png`
- Hover: `screenshots/empty-hover-visible-cursor--desktop.png`
- Source method: `screenshots/source-method--desktop.png`

## Deviations and blockers

- **Product deviations from F6:** none.
- **Validation blocker inherited from F5:** `npm run analytics:ui-data-package:validate` fails because `analysis/predictive-race-intelligence/output/context-packs/live-race-day-context.json` records `scripts/api-server.mjs` as 86,737 bytes / SHA-256 `4bb3…`, while the unchanged F5 source is 86,832 bytes / SHA-256 `d1a6…`. F6 does not change either path (`git diff b3725fc --` is empty for both). Refreshing predictive/UI analytics artifacts would expand this brief beyond the lower-chart boundary, so the stale reference is reported rather than silently rewritten.
- The canonical 4.6GB archive was opened read-only because isolated worktrees intentionally do not carry it. No canonical SQLite row, live runner, LaunchAgent, production runtime file, or ingestion configuration was mutated.

## Review gate

Do not merge yet. Jack should inspect the screenshot set first. Fable review remains mandatory before the F6 branch is merged into main; this report and the machine-readable proofs are the review packet.
