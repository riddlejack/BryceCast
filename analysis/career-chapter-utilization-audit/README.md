# Career chapter utilization audit

Audit date: 2026-07-18  
Audited baseline: `5599bfc53ac34776f6cd40d582f0fffa60283815`  
Canonical dataset SHA-256: `900ddfcb701b1977f16e33501302742c328980f5ffcccd190d2e433bba0b5681`  
Machine-readable companion: `career-chapter-utilization-matrix.json`

## Verdict

The website uses materially more than finishing position across all seven canonical series, but most deep non-INDY-NXT analytics are not rendered. The strongest correction to the working premise is GB3: the current UI already shows 42 classified races through percentile and summary metrics, season/track/condition groupings, 2021 start-to-finish rows, venue atlas entries, and per-race sheets. What is missing is qualifying, within-team order, explicit event/season progression, and the source-family-aware context needed to combine 2021 TSL and 2022 JSON safely.

Artifact existence is not website utilization. `src/data/uiContextAdapter.ts` can load several deep packs, but no screen calls `loadBryceCastUiContext` or `buildBryceCastUiContext`. Cross-series result conversion is visible; INDY NXT depth is visible; IMSA depth is partially visible; most other deep packs are generated or branch-preserved but unused.

## Authority and grain

The canonical dataset reports 7 series, 87 events, 483 sessions, 8,494 results, 1,739 qualifying rows, and 70,061 lap samples. Validation is `ok=true`, with one warning for nine sessions without an exact or date start.

The current UI uses two intentionally different race grains:

- 141 classified `sessionType=race` rows drive result conversion and percentile views.
- 145 physical race/heat rows drive the atlas and life-stats layers; these include two Formula Ford heats and two unclassified DNS/DNF rows.

The canonical seven chapters are F1600/FRP F1600, Formula Ford, GB3, Euroformula Open, FROC, IMSA Daytona, and INDY NXT. Sparse karting and Team USA facts are context milestones, not an eighth statistical chapter.

## Current website utilization

The `/career` experience visibly consumes:

- `seriesSummary` and `resultConversion` for chapter cards, percentile timeline, start-to-finish explorer, and season/series/track/condition groupings;
- `headToHead` and `lapPositionMix` for INDY NXT;
- career atlas and life-stats packages for 145 physical race/heat rows, 34 venues, mileage, travel ranges, and lower-bound semantics;
- five named moments;
- context-event conditions joined into result-conversion rows;
- the IMSA context pack for the Daytona chapter summary.

Primary render evidence is in `src/screens/CareerScreen.tsx`, `src/screens/careerExplorer.tsx`, and `src/screens/CareerRaceScreen.tsx`. Adapter evidence is in `src/data/uiContextAdapter.ts`.

## Chapter findings

### F1600 / FRP F1600 — 2019

Visible now: 20 classified races; percentile chapter; average finish, field beaten, and top-10 rate; explorer and race sheets; atlas and odometer. Start-to-finish is correctly unavailable.

Available: 37 sessions; 315 full-field race rows; 21 Bryce race rows, 20 classified; six Bryce qualifying classifications stored in session `results`; best-lap/result/points fields; two non-Bryce penalty rows; seven tracks; P3 in the season with 639 points and eight podiums.

Productized: generic parity and UI-package result/track context. Unused priorities: season/points progression (high value, high evidence), qualifying/event cards (medium, high), and sparse penalty callouts (low, medium).

Limits: no race starts, lap samples, weather, incidents, or section pace. Pittsburgh qualifying has an official-archive link mismatch. Team mapping is too thin for teammate claims.

### Formula Ford — 2020

Visible now: 15 normal-race rows with starts and condition labels; first-car-win moment; rain/condition grouping; race sheets. Two heat results do not enter the result-conversion layer.

Available: 46 sessions; 762 full-field race/heat rows; 17 Bryce race/heat rows; seven Bryce qualifying rows stored in session `results`; 282 Bryce-only lap samples over 24 sessions, 279 timed; 46 official condition rows; four non-Bryce penalties; five tracks.

Productized: generic results plus a specialized Formula Ford lap-shape pack. The specialized pack is stale against the current dataset hash and is not rendered. Unused priorities: lap-shape/event progression (high, high after regeneration), explicit heat inclusion (medium, high), qualifying-to-race context (medium, high), and condition comparison (medium, medium).

Limits: lap data is Bryce-only labeled blocks, not a full-field position trace or field-relative pace source. Continuation pages remain held out. No incidents or sections. Team IDs are insufficient.

### GB3 — 2021–2022

Visible now: 42 classified races; percentile chapter; average finish, field beaten, and top-10 rate; explorer by season, track, and conditions; 20 source-backed 2021 start-to-finish rows; 20 condition-labeled race rows; per-race sheets; six venue profiles.

Available: 116 sessions, 45 races, 882 full-field race rows; 44 Bryce race rows, 42 classified. All 22 qualifying sessions have usable context after joining 14 dedicated 2021 rows with eight 2022 qualifying-session result rows. All 20 2021 Bryce starts and 39 official 2021 session condition rows exist. All 24 2022 Bryce race rows have pit counts. Full-field team and track context exists across six tracks.

Productized: generic result conversion only. The unique `codex/gb3-historic-analytics` history contains event, qualifying, team, track, weather, and source-family analyses, but was generated from the older June dataset and must be regenerated before incorporation. It is preserved at `refs/archive/20260718T184926Z/heads/codex/gb3-historic-analytics`.

Unused priorities: source-family-aware GB3 module (highest overall value, high evidence), qualifying/event progression (high, high), within-team result order (high, medium), venue/season progression (high, high), 2021 conditions (medium, medium), and a tightly labeled 2022 pit-count callout (low, high).

Limits: 2021 TSL and 2022 JSON expose different fields. There are no GB3 lap samples, sections, penalties, incidents, pit sequences, telemetry, GPS, tire/service, strategy, or causal weather evidence. Session 1248 is manifest-preserved but its official JSON is now 404.

### Euroformula Open — 2023

Visible now: 17 classified races, all with starts; percentile and track explorer; race sheets. No qualifying, championship, or team module is rendered.

Available: 28 sessions; 178 full-field race rows; 18 Bryce race rows, 17 classified; 61 dedicated qualifying rows, six Bryce; result-level best laps, speed, and gaps; six race teams; seven tracks; season P4, 238 points, three wins, five podiums.

Productized: generic parity marks result and qualifying conversion production-safe. The old dimension pack contains team/track context but is not current-hash verified. Unused priorities: championship/season progression (high, high), qualifying-to-race conversion (high, high), event/venue profile (medium, high), and descriptive team order (medium, medium).

Limits: no laps, weather, penalties, incidents, pit data, or sections. The mutable championship PDF now serves 2026; the preserved RFEDA final classification is the stable season source.

### FROC — 2024

Visible now: six Bryce race rows, all with starts; percentile/start-to-finish and track context. No qualifying, season arc, weather, or team module is rendered.

Available: 52 sessions comprising 15 practice, 11 qualifying, 15 race, and 11 test sessions; 246 full-field race rows but only six Bryce race rows; five Bryce qualifying classifications stored in session `results`; result-level best laps; five tracks.

Productized: generic result/start/track conversion. Unused priorities: a lightweight six-race campaign and qualifying story (medium, high), venue/event context (medium, high), and a source-coverage panel (medium, high).

Limits: no laps, weather, penalties, incidents, sections, or reliable team mapping. Nine test sessions lack exact clock time. Full-field starts cover 229/246 rows; Bryce's six are sourced. Two reverse-grid tails remain held out.

### IMSA Daytona — 2025

Visible now: a custom chapter shows GTP P6, 780 car laps, ten Bryce stints, car/team, best lap, and 34 pit stops. The generic explorer/race sheet also shows finish percentile and official condition.

Available: one event/race; 236 car-driver result rows across 61 cars; 37,885 full-field time-card laps, 142 Bryce laps; sector times, speed trap, average speed, pit-in/out, elapsed time; 1,680 derived stints; co-driver pace and class-hour context; official dry conditions.

Productized: a specialized stint/class pack is partially visible, but its embedded canonical dataset hash is stale and the direct import path does not enforce integrity. Unused priorities: Bryce stint timeline and sector/pace profile (high, high after regeneration), co-driver/car-85 comparison (high, medium), and class-hour context (medium, medium).

Limits: sports-car car-driver grain differs from formula results. No running-position trace, telemetry, tire/service details, strategy notes, penalties, incidents, or causal pace claims.

### INDY NXT — 2024–2026 control chapter

Visible now: career chapter, rivals, lap-position mix, 40 race archive pages, season finish/standing spine, result/start/gain/status, weekend practice/qualifying/grid/finish arc, points and standings, full-field lap charts, inflections, battle adjacency, leader/incident/weather context, team order, section percentiles, and Race Week track/prep modules.

Available: 203 sessions; 40 completed races; 834 full-field race rows; 69 Bryce qualifying rows; 31,894 lap-position samples, 1,493 Bryce; 30 fully parsed and ten partial race charts; 398 official report metrics; 80 penalties, three Bryce; 144 incidents, nine Bryce; 39 racecraft summaries; 113 modeled weather rows; 13 tracks.

Productized: current-hash predictive, section, race-lap, debrief, race-story, package, and typed-loader paths are actively consumed. Unused priorities: a broader 89-session practice/qualifying section explorer (medium, high), explicit penalty/incident timeline (medium, high), and deeper season comparison (medium, high).

Limits: weather is modeled ambient context, not official race-control weather. Pit counts have no stop sequence. One section-results PDF is corrupt. Ten lap charts are clean partials. Field-strength is same-sample descriptive context, not prediction. Seventy-eight sessions remain date-only.

## Freshness and utilization warnings

These artifacts must not be called current without regeneration or explicit archival treatment:

| Artifact | Embedded dataset state | Decision |
|---|---|---|
| `analysis/data-utilization-audit/output/*` | June hash `da557a...` | Historical. “Productized” means a pack exists, not that a screen renders it. |
| `analysis/career-dimension-context-layer/output/*` | June hash `da557a...` | Preserve; regenerate before current use. |
| `analysis/formula-ford-lap-shape/output/*` | June hash `da557a...` | Preserve; regenerate and inventory before UI use. |
| `analysis/imsa-daytona-stint-class-pace/output/*` | June hash `da557a...` | Preserve; regenerate and add integrity validation before expanding UI use. |
| `codex/gb3-historic-analytics` | June 8 dataset | Unique and valuable; archived, not merged. |

## Prioritized opportunity backlog

1. GB3 source-family-aware deep dive — highest value, high evidence.
2. Formula Ford lap-shape and condition module — high value, high evidence after regeneration.
3. Cross-series championship/season progression for F1600, GB3, Euroformula, and INDY NXT — high value, high evidence.
4. Expanded Daytona stint/co-driver story — high value, high-to-medium evidence after refresh.
5. Euroformula qualifying and season module — high value, high evidence.
6. Normalized historic qualifying layer spanning `qualifyingResults` and qualifying-session `results` — high value, medium-to-high evidence; source-family rules required.
7. F1600 season/points story — medium value, high evidence.
8. FROC lightweight campaign/qualifying story — medium value, high evidence.
9. Pre-F1600 milestone timeline — medium narrative value, high evidence but sparse.
10. INDY NXT practice/qualifying section explorer — medium incremental value, high evidence.

## Judgment log

| Judgment | Evidence | Rollback/provenance handle |
|---|---|---|
| Seven statistical chapters; karting is context only | Canonical `series` collection has exactly seven rows | Dataset SHA `900ddf...` |
| Website use requires a rendered/imported screen path | No screen calls the hydrated deep-pack adapter | Integrated baseline `5599bfc` |
| Current generated artifacts outrank readiness prose | July 11 dataset and current parity/package versus June documents | Current reports and package |
| 141 and 145 are distinct grains, not an error | Result conversion filters classified `race`; atlas/life-stats include physical race/heats | `analysis/career-parity/career_parity_analytics.py` |
| Generic team counts do not prove teammate readiness | Formula Ford and FROC lack reliable race team IDs | Canonical dataset and source gaps |
| GB3 branch is valuable but stale | June output reports 44 race rows; current public conversion has 42 classified rows | Archive ref plus verified bundle |
| No absent telemetry or causal story was inferred | Coverage and source-family gaps mark unavailable lanes explicitly | Canonical gap/evidence rows |

## Reproduction

Use the canonical dataset and generated reports, then verify render paths:

```bash
shasum -a 256 data/career/career.dataset.json
npm run career:validate
rg -n "loadBryceCastUiContext|buildBryceCastUiContext|deepContextPacks" src
git show refs/archive/20260718T184926Z/heads/codex/gb3-historic-analytics:analysis/gb3-discovery/output/summary.json
git show refs/archive/20260718T184926Z/heads/codex/gb3-historic-analytics:analysis/historic-career-discovery/output/summary.json
```
