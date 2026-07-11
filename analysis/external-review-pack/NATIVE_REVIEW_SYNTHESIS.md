# Native Review Synthesis

Generated: 2026-06-19

Purpose: consolidate the saved GPT-5.5 Pro Extended result with three native Codex GPT-5.5 xHigh review passes run against the bounded external review pack. This is a planning artifact for Jack's UI/content brainstorming session, not an implementation spec.

## Recommendation

Keep the Pro result as a strategic first pass, but do not treat it as final UI direction. It correctly found the evidence-first five-surface product shape:

- Race Week / Race Intelligence
- Live Companion
- Race Debrief
- Career Lab
- Sources / Confidence

The native reviews agree that the Pro result was not payload-level enough. The next UI decisions should be made from concrete data contracts and source proof, not broad tab names.

## What The Current Scaffold Is For

The current React UI V2 scaffold is a first review surface. It proves that the app can load the generated UI data package through a typed adapter, hydrate referenced context packs, and render guarded analytics without React components parsing raw CSVs.

It is not the final design. Road America is the current selected event slice because the June 18 package includes Road America Race 1 and Race 2 prep payloads. BryceCast remains a general race-week, live companion, debrief, and Career Lab app across Bryce's career.

## Pro Output: Useful But Incomplete

Useful Pro findings to keep:

- Treat BryceCast as an evidence-first race companion, not a prediction dashboard.
- Keep Road America as a concrete event slice, not the whole app.
- Put live trust/readiness ahead of live race claims.
- Use Career Lab as a parity-aware evidence browser, not a raw trophy/stat page.
- Keep source/confidence visible across the product.

Important Pro gaps:

- It did not sufficiently walk the Road America Race 1 and Race 2 payloads separately.
- It handled `predictionBand` conceptually but not as a UI contract with `n`, `p25`, `median`, `p75`, confidence, and policy.
- It underused `top10Path`, `chartSpecs`, `contextPackRef`, and `sourceRefs`.
- It mentioned debrief incident/penalty context but did not bind UI decisions to the exemplar counts.
- It mentioned IMSA and Formula Ford modules but did not mine their concrete generated depth.
- It overstated GB3 as a deep generated module. GB3 is a strong next historic drilldown candidate, but the generated special modules are IMSA Daytona and Formula Ford.

## Payload Anchors For The Next UI Session

Road America prep:

- Two distinct events: Race 1 on 2026-06-19 and Race 2 on 2026-06-20.
- Each has its own `contextPackRef`.
- `predictionBand.finishPercentileBand`: `n=20`, `p25=0.223`, `median=0.401`, `p75=0.667`, confidence `medium_low`.
- Same-track history is only `n=2`; do not hero the 100% top-10 rate without the denominator.
- `top10Path` has five concrete watch factors: qualifying/start, road-course conversion, same-track execution, avoiding chaos, recent Road America analog.
- Candidate chart IDs: `finish_percentile_band`, `same_track_vs_track_type`, `analog_race_table`.

Live Companion:

- Design against all live fixture states, not only the happy path.
- V1 starts with "Can we trust this session?" using readiness gates and source health.
- Show Bryce live claims only after INDY NXT heartbeat plus car 9 and DriverID 2143 or exact Bryce identity.
- Replay trend is a shell until archive quality is proven.
- Points are guarded readiness state only; no local formula or official reconciliation claim.

Race Debrief:

- Start with outcome, start-finish conversion, lap-position story, incident/penalty chips, and source drawer.
- The exemplar debrief has Bryce incidents `2`, Bryce penalties `0`, session incidents `8`, session penalties `6`, top leader Caio Collet, and dry/cool/medium context.
- `sectionSignal.sectionComparisonRows=6` in the sample, while policy says headline section claims need at least 50 comparison rows. Keep section strengths in drawer/later unless denominator gates pass.
- Derived archetype labels require review before public copy.

Career Lab:

- V1 should lead with parity and denominators: series overview, metric parity heatmap, result conversion explorer, coverage/gap drawer.
- Show unavailable metric families as unavailable, not inferred.
- Deep modules with generated support: INDY NXT, IMSA Daytona, Formula Ford.
- GB3 should be labeled as a strong next historic drilldown, not as equivalent generated depth to the special modules.

Sources / Confidence:

- Per-screen source affordances matter more than a generic source count.
- Use `sourceRefs`, hashes, source states, validation status, open gaps, and live proof gates as reusable UI infrastructure.
- Absence of rows is not proof that nothing happened unless the source family has complete no-event semantics.

## Chart Promotion Guidance

Promote to v1:

- Historical prior band as an interval with denominator and caveat.
- Ordered `top10Path` cards.
- Analog race table.
- Live readiness gates and source health table.
- Debrief lap-position story.
- Debrief start-finish conversion.
- Incident/penalty chips.
- Career metric parity heatmap.
- Career result conversion explorer.
- Per-screen source/confidence drawers.

Demote or defer:

- Same-track vs track-type bar, because same-track `n=2` is fragile. Use a compact comparison table/stat row.
- Weather performance charts. Weather can be context, not causal performance explanation.
- Public model scorecard. Keep in source/policy detail if shown at all.
- Team-context dotplot. Use descriptive table/drawer unless the user decides it is useful.
- Section strengths as a headline until denominator QA supports it.
- Raw correlation/head-to-head galleries unless tied to a clear user question.

Omit until proof exists:

- Public expected finish, public top-10 probability, betting-style lines.
- Live GPS/moving dots.
- Team radio or live POV.
- Tire/overtake strategy.
- Detailed pit sequence.
- Official points reconciliation.
- Unsupported causal weather, team, setup, or engineering claims.

## Suggested Brainstorming Agenda

1. Decide the v1 audience split: Bryce/team, family/friends, serious fans, and operator.
2. Decide what is public versus private, especially predictive priors, debrief labels, points, and team context.
3. For each tab, pick the top 3 to 5 user questions the screen must answer.
4. For each selected question, choose chart, stat, table, narrative card, drawer detail, or omit.
5. Decide whether Race Week is more Bryce-facing prep, fan-facing "what to watch," or two modes.
6. Decide Career Lab's v1 priority: INDY NXT depth, cross-series overview, or source-backed module tour.
7. Define the live proof bar before any live race claim is considered production-ready.

## Bottom Line

Proceed with the current adapter-first architecture. Do not treat the current UI scaffold as approved final design. The next product step should be a human-led UI/content selection session using this synthesis plus the review pack, with decisions bound to concrete payload fields, denominators, source refs, caveats, and live proof gates.
