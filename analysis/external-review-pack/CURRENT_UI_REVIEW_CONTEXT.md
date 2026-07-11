# Current UI Review Context

Use this file only for Envelope B, after the clean-room Envelope A recommendations are complete.

Current status: a first UI V2 scaffold exists in React/Vite. It is not the final design. It was built to prove a source-backed adapter-first path and to make the generated analytics visible enough for review.

What exists now:

- Typed frontend adapter in `src/data/uiContextAdapter.ts` loads `analysis/ui-data-package/ui-data-package.json`, validates referenced raw JSON by SHA-256/byte size, and hydrates context packs before React renders analytics.
- React app in `src/App.tsx` has tabs for Race Intel, Live, Debrief, Career Lab, and Sources.
- The first screen is the app experience, not a marketing landing page.
- UI is mobile-first and guarded around live claims.
- Adapter tests verify Road America Race 1/Race 2 prep payloads, debrief incident/penalty race context, and Career Lab context-pack depth.

Known limitations:

- This pass is a scaffold and review surface, not the final tab-by-tab product design.
- Road America is the concrete current event slice because the generated package includes it; the final BryceCast app should generalize across races.
- Chart choices and information hierarchy still need a dedicated design/visualization pass with user oversight.
- Live mode remains fixture/API-plumbed but not production-proven.

UI package screens currently available:

| Screen key | Payload summary |
| --- | --- |
| roadAmericaPrep | title, readiness, events, contextPackRefs, runtimeApiRequirements, caveats, sourceRefs |
| liveCompanionFixtures | title, requiredStates, requiredVariants, contextPackRef, fixtures, caveats, sourceRefs |
| raceDebrief | title, readiness, featuredDebriefs, contextPackCoverage, contextPackRefs, chartFamilies, caveats, sourceRefs |
| careerLab | title, readiness, sourcePayload, contextPackRef, careerPriorMatrixPath, seriesSummary, parityBySeries, sourceFamilyRules, topCareerStories, chartSpecs, resultConversionRows, resultConversion, resultConversionSample, caveats, sourceRefs |
| sourceOps | title, predictiveRaceIntelligence, validation, ingestion, gapBoundary, coverage, historyStanding, sourceFamilyAudit, caveats, sourceRefs |
