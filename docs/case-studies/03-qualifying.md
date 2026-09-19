# One qualifying model across incompatible formats

BryceCast treats qualifying as a semantic-integration problem. The career spans dedicated classifications, result-table substitutes, split groups, combined grids, reverse-grid races, oval averages, canceled sessions, and partial lap captures.

## Problem

A single “qualifying position” field would erase important differences. A group result may not be the final grid. A captured lap is not an official classification. A reverse-grid race should not be credited to the preceding qualifying rank. Some older series expose qualifying results but no race grid column, so conversion cannot be confirmed. Ovals can use a two-lap average that does not behave like a road-course best-lap session.

## Method

The [career qualifying layer](../../analysis/qualifying-layer/README.md) selects exactly one source family per session. Dedicated `qualifyingResults` rows take precedence; qualifying-session result rows are used only when the dedicated family is absent. Group sessions remain `group_component` records, while the official combined classification becomes grid-setting only when the source says it sets the grid.

Race conversion is intentionally strict: a qualifying result is linked to a race only when the same-event race grid equals the qualifying rank. Reverse-grid and unmatched races are excluded rather than estimated. Best-lap times and gaps remain context strings and are not differenced into unsupported pace claims. The generated method and exclusions are in the [qualifying summary](../../analysis/qualifying-layer/output/summary.json).

The [run-by-run lab](../../analysis/quali-lab/README.md) forms a separate layer beneath the official headline. Its builder reads RaceTools captures, normalized Timing71 display states, or official section results while preserving the source tier. The UI keeps official best/grid position above the observed lap staircase, highlights only the fastest observed lap, supports oval two-lap-average context, and uses the same section contract as race heat maps. See [qualiLab.ts](../../src/data/qualiLab.ts), [qualifyingRunByRun.tsx](../../src/screens/qualifyingRunByRun.tsx), and [qualifyingHeat.ts](../../src/screens/qualifyingHeat.ts).

Canceled sessions are data, not missing-value noise. The career coverage matrix retains two official canceled qualifying session IDs. Nashville 2024 has two official section-result laps but no canonical qualifying classification; it remains visible as canceled and receives no invented rank or grid.

## Evidence

The career layer, generated 2026-09-11 from the 2026-09-10 dataset, contains **122 Bryce qualifying appearances across six series**: 97 dedicated official qualifying rows and 25 qualifying-session result rows. It confirms **69 same-event grid conversions across five series** from 150 Bryce races.

The other 81 races are explicitly accounted for: four without a finish, 37 without a grid column, eight without qualifying in the event, and 32 reverse-grid or no-rank-match cases. These are stored in the [summary](../../analysis/qualifying-layer/output/summary.json) and [excluded-race table](../../analysis/qualifying-layer/output/tables/excluded_races.csv).

The lap-level [coverage census](../../analysis/quali-lab/output/coverage-census.json), generated 2026-09-11, covers **35 of 40 inspected physical sessions**: 12 in 2024, 11 in 2025, and 12 in 2026. The source mix is 22 RaceTools captures, 11 normalized Timing71 sessions, and two official section-result sessions. Twenty-one position cross-checks match, one mismatches, and 13 are not applicable. Five captures are excluded: four have no Bryce laps; Nashville has no verifiable official classification.

## Limits

The layers answer different questions. Official classification establishes result and grid; captured laps describe the observed run. A match between grid and rank supports conversion, but no match does not authorize an inference. Short sessions can produce honest one-lap views, while two-lap oval runs omit meaningless thirds. The result is one interface with several explicit source meanings, not one blended number.
