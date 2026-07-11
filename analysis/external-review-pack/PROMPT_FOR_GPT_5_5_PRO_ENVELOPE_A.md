# Prompt For GPT-5.5 Pro: Envelope A

You are an independent product/data/visualization reviewer. You have not seen the current UI. Do a clean-room review of BryceCast from the files in this pack.

Project: BryceCast is a source-backed racing analytics app for Bryce Aron. It should support race-week prep, live companion readiness, race debriefs, and a Career Lab. The app is general across races, not Road-America-only; Road America is the current concrete slice because the June 18 data package has upcoming-event packs for that weekend.

Read these files first:

1. `PROJECT_BRIEF.md`
2. `DATA_CAPABILITY_CATALOG.md`
3. `ANALYTICS_INVENTORY.md`
4. `LIVE_CAPABILITY_MATRIX.md`
5. `VISUALIZATION_OPPORTUNITY_MATRIX.md`
6. `sample-payloads/*.json` as needed
7. `SOURCE_MANIFEST.md` only for provenance

Your tasks:

1. Identify the strongest product structure: tabs/screens, user jobs, and what each should contain for v1 versus later.
2. Rank existing analytics by display value. For each high-value item, say whether it should be a chart, stat, table, narrative card, source drawer detail, or omitted.
3. Suggest additional analyses that could plausibly be run from the listed available data. Separate easy derived summaries from heavier regressions/models. Flag sample-size/leakage/causality risks.
4. Propose visualization patterns for Race Weekend Prep, Live Companion, Race Debrief, Career Lab, and Source/Confidence. Be specific about axes, denominators, filters, and what not to chart.
5. Identify vacuous or low-value material to remove or demote.
6. Identify missing data/capability proof that should block a UI claim.
7. Brainstorm features not yet considered, including replay/media/article workflows, but keep them source/permission bounded.

Scoring rubric for each recommendation:

- User value
- Evidence strength
- Visual clarity
- Implementation effort
- Race-week relevance
- Caveat burden
- Novelty or memorability

Hard constraints:

- Do not propose public expected finish, top-10 probability, betting line, or causal model claims from the current predictive artifacts.
- Do not claim live green-flag proof, live GPS, team radio audio, live POV, official points reconciliation, tire/overtake strategy, or detailed pit sequence.
- Do not assume older series have INDY NXT-level lap/section/live data.
- Do not use current UI assumptions; this is a clean-room recommendation pass.

Return format:

1. Executive recommendation.
2. Proposed app architecture and tab contents.
3. Ranked analytics/visualization menu.
4. Additional analysis ideas with feasibility and risk.
5. Live-mode readiness and proof gates.
6. Career Lab structure.
7. What to cut/defer.
8. Questions for Jack/Bryce/team before final UI design.
