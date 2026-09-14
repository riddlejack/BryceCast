# BryceCast Documentation Map

Updated: 2026-07-18

Use this map before starting UI work. The canonical `master` branch and its
integrated A2 + B + C + F2-F6 website are the approved baseline. The active
direction is analytics-first: source-backed INDY NXT and career analytics, live
race-day readiness, explicit unavailable states, and a web/mobile surface.
Brief D is excluded. Legacy POV, isolated-radio, native tvOS, frontend-reset,
and outreach material remains evidence, not current execution direction.

## Project Entry Point

Start with [../AGENTS.md](../AGENTS.md). Resolve the current checkout from
`git worktree list`, its branch and dirty state, and the local `master` ref.
`CLAUDE.md` imports that same guide. Use the guide's task map rather than reading
this entire document list for every change.

## Task-Specific Documents

Use these when the task affects their subject:

| Document | Use |
| --- | --- |
| [UI_ANALYTICS_PRODUCT_CONTRACT.md](UI_ANALYTICS_PRODUCT_CONTRACT.md) | UI screens, metrics, caveats, unavailable states, and source drawers. |
| [LIVE_RACE_DAY_PRODUCT_CONTRACT.md](LIVE_RACE_DAY_PRODUCT_CONTRACT.md) | Live timing, readiness, points, weather, replay, and wrong-series guards. |
| [API_SERVICE.md](API_SERVICE.md) | Cache-backed `/api/*` service behavior and API verification. |
| [../analysis/ui-data-package/README.md](../analysis/ui-data-package/README.md) | UI data package schema, relevant records, context-pack refs, and validators. |
| [ANALYTICS_SOURCE_AUDIT.md](ANALYTICS_SOURCE_AUDIT.md) | Source-backed live, archived, and historical analytics truth table. |
| [INDY_NXT_DASHBOARD_READINESS.md](INDY_NXT_DASHBOARD_READINESS.md) | Production-safe INDY NXT dashboard categories and caveats. |
| [CAREER_ANALYTICS_COVERAGE_MATRIX.md](CAREER_ANALYTICS_COVERAGE_MATRIX.md) and [CAREER_DATA_SPEC.md](CAREER_DATA_SPEC.md) | Career coverage, data model, and provenance. |
| [../LIVE_DRILL_CLOSEOUT_2026-06-21.md](../LIVE_DRILL_CLOSEOUT_2026-06-21.md) and [../LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md](../LIVE_DRILL_PROCESS_EXHAUSTION_RCA_2026-06-21.md) | Live-ingestor design, recovery, or incident analysis. |
| [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md) | Source inventory for official, live, and candidate feeds. |
| [FABLE_HANDOFF.md](FABLE_HANDOFF.md), [CODEX_HANDOFF_CURRENT.md](CODEX_HANDOFF_CURRENT.md), and [PHASE3_HANDOFF_2026-07-19.md](PHASE3_HANDOFF_2026-07-19.md) | Dated takeover, branch, and runtime evidence only; verify current Git, production, URL, and runtime state separately. |

Other analytics indexes and dated reviews in this directory remain available as
evidence. A filename containing “current” does not override `AGENTS.md` or a
fresh state check.

## Legacy Research Boundary

The following files are preserved evidence, not active product direction. They explain why live POV, Bryce-specific team radio, and native tvOS/video integration are out of scope unless a rights-holder or team-approved route appears later:

- [LIVE_POV_ACCESS_FINDINGS.md](LIVE_POV_ACCESS_FINDINGS.md)
- [POV_ESCALATION_LADDER.md](POV_ESCALATION_LADDER.md)
- [RADIO_AUDIO_PLAN.md](RADIO_AUDIO_PLAN.md)
- [AUDIO_RADIO_FINDINGS.md](AUDIO_RADIO_FINDINGS.md)
- [APPLE_TV_TVOS_ROADMAP.md](APPLE_TV_TVOS_ROADMAP.md)
- [OUTREACH.md](OUTREACH.md)
- [legacy/README.md](legacy/README.md)

Do not copy their POV/radio/tvOS surfaces as design references for the next UI. If the active contracts mention audio, onboard, maps, or video, render them as official route links, unavailable states, frequency metadata, or future/replay lanes exactly as specified in the active contracts.

## Artifact Boundary

Screenshot/mockup artifacts are not active design taste references unless they were produced after this analytics-first contract set and are labeled as current. See [../artifacts/screenshots/README.md](../artifacts/screenshots/README.md) for the screenshot boundary.

June 17 MagicPath files under `analysis/ui-blueprint/` are preserved as legacy/rejected visual attempts. They are not a current frontend starting point after the June 18 context-pack baseline.

## Deferred Cleanup

`src/App.tsx` is now an analytics-first contract shell for the next UI lane. Legacy POV/radio proof modules remain in `src/data/pov.ts` and `src/data/audio.ts` only as inactive research/proof utilities; do not reintroduce them as product navigation without a new permissioned-source decision. The active frontend should build from `/api/readiness`, `src/data/analyticsViewModels.ts`, `src/data/uiDataPackage.ts`, [UI_ANALYTICS_PRODUCT_CONTRACT.md](UI_ANALYTICS_PRODUCT_CONTRACT.md), and [LIVE_RACE_DAY_PRODUCT_CONTRACT.md](LIVE_RACE_DAY_PRODUCT_CONTRACT.md).
