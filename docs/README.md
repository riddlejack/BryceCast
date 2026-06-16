# BryceCast Documentation Map

Generated: 2026-06-16

Use this map before starting UI work. The active product direction is analytics-first: source-backed INDY NXT and career analytics, live race-day readiness, explicit unavailable states, and a web/mobile surface. Legacy POV, isolated-radio, native tvOS, and outreach research remains preserved as evidence, but it is not the active UI direction.

## Active Build Contracts

Read these first for frontend, view-model, and product work:

| Order | Document | Role |
| ---: | --- | --- |
| 1 | [CODEX_HANDOFF_CURRENT.md](CODEX_HANDOFF_CURRENT.md) | Current repo handoff, validation baseline, source families, and known coordination risk. |
| 2 | [UI_READINESS_EXECUTION_PLAN.md](UI_READINESS_EXECUTION_PLAN.md) | Lane plan and integration gates for analytics-first frontend readiness. |
| 3 | [UI_ANALYTICS_PRODUCT_CONTRACT.md](UI_ANALYTICS_PRODUCT_CONTRACT.md) | Controlling UI product contract for screens, metrics, caveats, unavailable states, and source drawers. |
| 4 | [LIVE_RACE_DAY_PRODUCT_CONTRACT.md](LIVE_RACE_DAY_PRODUCT_CONTRACT.md) | Live timing/readiness/points/weather/replay contract and wrong-series guard rules. |
| 5 | [READINESS.md](READINESS.md) | Current product readiness brief and the no-POV/no-scanner baseline. |
| 6 | [API_SERVICE.md](API_SERVICE.md) | Local `/api/*` service contract and API-mode verification commands. |
| 7 | [ANALYTICS_SOURCE_AUDIT.md](ANALYTICS_SOURCE_AUDIT.md) | Source-backed live, archived, and historical analytics truth table. |
| 8 | [LIVE_DATA_READINESS_AUDIT.md](LIVE_DATA_READINESS_AUDIT.md) | Live-source audit, weather readiness, and Race Control pressure-test context. |
| 9 | [INDY_NXT_DASHBOARD_READINESS.md](INDY_NXT_DASHBOARD_READINESS.md) | Production-safe INDY NXT dashboard categories and caveats. |
| 10 | [CAREER_ANALYTICS_COVERAGE_MATRIX.md](CAREER_ANALYTICS_COVERAGE_MATRIX.md) | Generated career coverage status and source-bounded gaps. |
| 11 | [CAREER_DATA_SPEC.md](CAREER_DATA_SPEC.md) | Durable career analytics data model and provenance rules. |
| 12 | [SOURCE-INVENTORY.md](SOURCE-INVENTORY.md) | Source inventory for official/live/candidate feeds. |

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

## Deferred Cleanup

`src/App.tsx` and `src/data/pov.ts` still contain legacy POV/radio proof surfaces and copy. They were read in this cleanup lane but intentionally not edited because API/view-model/UI implementation lanes own source changes. After the active API/view-model lanes land, replace those assumptions with the readiness, analytics, unavailable-state, and source-drawer model from [UI_ANALYTICS_PRODUCT_CONTRACT.md](UI_ANALYTICS_PRODUCT_CONTRACT.md) and [LIVE_RACE_DAY_PRODUCT_CONTRACT.md](LIVE_RACE_DAY_PRODUCT_CONTRACT.md).
