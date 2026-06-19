# BryceCast Documentation Map

Generated: 2026-06-18

Use this map before starting UI work. The active product direction is analytics-first: source-backed INDY NXT and career analytics, live race-day readiness, explicit unavailable states, and a web/mobile surface. Legacy POV, isolated-radio, native tvOS, and outreach research remains preserved as evidence, but it is not the active UI direction.

## Active Build Contracts

Read these first for frontend, view-model, and product work:

| Order | Document | Role |
| ---: | --- | --- |
| 1 | [CODEX_HANDOFF_CURRENT.md](CODEX_HANDOFF_CURRENT.md) | Current repo handoff, validation baseline, source families, and known coordination risk. |
| 2 | [../analysis/ui-blueprint/README.md](../analysis/ui-blueprint/README.md) | Current UI V2 navigation map, active blueprint files, and legacy MagicPath boundary. |
| 3 | [../analysis/ui-data-package/README.md](../analysis/ui-data-package/README.md) | Generated UI data package: hydrated screen seeds, context-pack refs, live fixtures, source refs, and validation commands. |
| 4 | [../analysis/ANALYTICS_UI_ARTIFACT_INDEX.md](../analysis/ANALYTICS_UI_ARTIFACT_INDEX.md) | Current stable analytics artifact index after the June 18 productization sprint. |
| 5 | [../analysis/predictive-race-intelligence/output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md](../analysis/predictive-race-intelligence/output/PREDICTIVE_RACE_INTELLIGENCE_REPORT.md) | Predictive race-intelligence decision, feasibility, context packs, and chart artifacts. |
| 6 | [../analysis/data-utilization-audit/output/DATA_UTILIZATION_AUDIT.md](../analysis/data-utilization-audit/output/DATA_UTILIZATION_AUDIT.md) | Data-utilization audit proving the current generated utilization backlog is closed. |
| 7 | [UI_ANALYTICS_PRODUCT_CONTRACT.md](UI_ANALYTICS_PRODUCT_CONTRACT.md) | Controlling UI product contract for screens, metrics, caveats, unavailable states, and source drawers. |
| 8 | [LIVE_RACE_DAY_PRODUCT_CONTRACT.md](LIVE_RACE_DAY_PRODUCT_CONTRACT.md) | Live timing/readiness/points/weather/replay contract and wrong-series guard rules. |
| 9 | [READINESS.md](READINESS.md) | Current product readiness brief and the no-POV/no-scanner baseline. |
| 10 | [API_SERVICE.md](API_SERVICE.md) | Local `/api/*` service contract and API-mode verification commands. |
| 11 | [ANALYTICS_SOURCE_AUDIT.md](ANALYTICS_SOURCE_AUDIT.md) | Source-backed live, archived, and historical analytics truth table. |
| 12 | [LIVE_DATA_READINESS_AUDIT.md](LIVE_DATA_READINESS_AUDIT.md) | Live-source audit, weather readiness, and Race Control pressure-test context. |
| 13 | [INDY_NXT_DASHBOARD_READINESS.md](INDY_NXT_DASHBOARD_READINESS.md) | Production-safe INDY NXT dashboard categories and caveats. |
| 14 | [CAREER_ANALYTICS_COVERAGE_MATRIX.md](CAREER_ANALYTICS_COVERAGE_MATRIX.md) | Generated career coverage status and source-bounded gaps. |
| 15 | [CAREER_DATA_SPEC.md](CAREER_DATA_SPEC.md) | Durable career analytics data model and provenance rules. |
| 16 | [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md) | Source inventory for official/live/candidate feeds. |

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
