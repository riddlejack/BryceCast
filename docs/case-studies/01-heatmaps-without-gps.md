# Heat maps without GPS

BryceCast draws section-performance heat maps from timing-loop evidence, not vehicle coordinates. That distinction drives the data model, validation, and visual language.

## Problem

The available timing sources expose named physical loops, crossing clocks, completed-lap values, and official section reports. They do not expose GPS trajectories, instantaneous speed, or reliable map origins. A conventional telemetry heat map would therefore claim precision the source does not contain.

The harder problem is reconciliation. RaceTools loop messages use source clocks and loop distances in inches. Static track configuration records can expose section distances in meters. Official reports use named section families. Track art uses curated SVG paths whose screen orientation is independent of geographic north. The same interface must also work for long races and short qualifying runs.

## Method

The [RaceTools semantic decoder](../../analysis/semantic-layer/lib/racetools-semantic.mjs) converts hexadecimal timing ticks to seconds, reconstructs laps from physical start/finish crossings, removes formation and cool-down regions, and keeps mainline and pit-lane crossings semantically distinct. The [anchor builder](../../scripts/derive-section-anchors.mjs) reconciles loop distances, requires the exact track name and a lap-length guard, and maps each official section family to distance along a curated outline. Thirteen venue anchor sets are retained under [track sections](../../src/assets/tracks/sections/).

The UI reads both race and qualifying data through one [section-observation contract](../../src/data/sectionObservations.ts). Each observation carries its official section name, source tier, denominator, representative time, field distribution, and whether it is directly measured or a derived untimed remainder. Missing observations leave the outline uncolored. A derived remainder cannot receive the top measured-section emphasis.

Scope rules follow the source population:

- `lapScopesFor` offers race thirds only when the race has at least nine scheduled laps. Aggregate section color still requires eight clean green-flag observations in the selected scope; thinner sections remain blank.
- `lapScopesForObservedLaps` creates qualifying thirds only from at least three distinct observed lap indexes. A two-lap oval run therefore stays a full-session view. Qualifying explicitly permits one valid observed lap, while labeling the thin denominator.
- A single-lap view remains a snapshot and retains caution context rather than being presented as a trend.

The renderer and controls live in [section intelligence](../../src/screens/sectionIntelligence.tsx) and [qualifying heat](../../src/screens/qualifyingHeat.ts).

## Evidence

The stored semantic summary contains **2,613,292 normalized loop crossings across 143 RaceTools sessions**—41 practice, 40 qualifying, 29 race, and 33 test sessions—generated on 2026-09-10. It also retains 17 full-day-capture masks, nine heartbeat-gap masks, and one header-only mask. See the [loop-crossing summary](../../analysis/semantic-layer/output/loop-crossings-summary.json).

A retained validator compared reconstructed start/finish deltas with official section-report lap times for 25 races. **Twenty-one of 25 races reproduced the official lap time to a median residual of 0.0000 seconds**, at the source's 0.0001-second tick. Larger residuals were confined to caution, red-flag, pit, or limited lap-alignment cases. See the [section-time residuals](../../analysis/semantic-layer/output/validation/section-time-residuals.json), generated 2026-07-19.

The current race enhancement, generated 2026-09-10, contains **522,687 field section observations**, **22,333 race car-lap-section observations**, and 44 race-session summaries. See its [summary](../../analysis/indy-nxt-race-lap-section-enhancement/output/summary.json).

## Limits

The visualization locates a named timing interval along an approximate track outline. It does not reconstruct the car's path, claim a precise turn coordinate, or infer proximity. Capture masks, sparse scopes, caution laps, and a source-broken session remain exclusions or visible caveats. The defensible term is **timing-loop-derived section map**, not GPS telemetry heat map.
