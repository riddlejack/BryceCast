# Visualization Opportunity Matrix

This is a starting menu for the outside reviewer, not the final UI spec. The reviewer should rank, cut, combine, and propose alternatives.

| Surface | Question | Data | Candidate visual | Caveat |
| --- | --- | --- | --- | --- |
| Race Weekend Prep | What range does the historical context suggest before qualifying? | predictionBand.finishPercentileBand plus same-track and road-course denominators | Interval band with denominator and confidence drawer | Historical prior band only; no expected finish or top-10 probability. |
| Race Weekend Prep | What needs to go right for a strong Road America result? | top10Path, analogRaces, same-track and track-type history | Ordered path cards plus analog race table | Path language only; analogs are comparables, not forecasts. |
| Race Weekend Prep | Where does Road America historically stress Bryce by section? | section lap deep dive Road America prep context | Section-family profile and top/weak family ranked bars | Official PDF-derived historical rows, not telemetry. |
| Live Companion | Can we trust the current live session? | /api/readiness, /api/sources, live race-day context pack | Readiness banner, gates checklist, source drawer | Fixture/API-plumbed until an active INDY NXT rehearsal proves it. |
| Live Companion | Where is Bryce and what changed? | /api/bryce, /api/timing, /api/replay/bryce | Bryce status tile, timing tower focus band, guarded replay trend shell | No GPS/moving dots, team radio audio, live POV, or tire/overtake strategy without proof. |
| Race Debrief | Where did the race turn? | race-debrief pack, lapStory, raceContext, sectionSignal | Lap-position line, segment strip, inflection callouts, incident/penalty chips | Race debrief labels require review before public copy. |
| Race Debrief | How did qualifying convert into result? | career_result_conversion, prep_session_signals, race_debrief_scores | Start-finish slope/dumbbell and conversion percentile badge | Group/combined qualifying formats need explicit source caveats. |
| Career Lab | What can we compare across series without overclaiming? | career metric parity, career series summary, coverage matrix | Parity heatmap, sortable series table, available/unavailable cells | Do not project INDY NXT lap depth onto older series. |
| Career Lab | What deep career modules are actually source-backed? | career dimension, IMSA stint/class pace, Formula Ford lap-shape context packs | Module menu with source badges and drilldowns | Descriptive only; no telemetry, setup, or causal root-cause claims. |
| Source/Confidence | Why should a user trust or distrust a screen? | sourceInventory, sourceRefs, validation-report, gap ledger | Global source drawer and compact confidence/availability affordances | Absence of imported rows is not proof nothing happened unless source semantics prove it. |
