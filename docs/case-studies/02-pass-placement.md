# Pass placement between timing loops

BryceCast locates running-order changes without GPS and without a trustworthy live-position field. The output is deliberately an interval: a pass occurred between two named timing loops.

## Problem

RaceTools `$S` records provide physical loop crossings with source timestamps, but their position value is a starting-grid seed rather than changing live order. Official lap charts provide order once per completed lap. Neither source identifies an exact on-track coordinate for a pass.

This creates two risks. Sorting by the wrong field would manufacture a live order. Treating every rank shift as an overtake would confuse pit cycles, retirement attrition, caution behavior, and missing crossings with green on-track passes.

## Method

The [pass-placement builder](../../analysis/track-position/build-pass-placement.mjs) reconstructs the field order independently at each physical loop by sorting crossing timestamps. For every pair of cars, it compares relative order at consecutive loops. A pairwise reversal brackets the order change between loop A and loop B.

The logic separates green on-track intervals from pit and caution movement. It requires observations on both sides of the interval and carries source-quality masks rather than filling gaps. A separate pass-mark adapter packages only the bounded result for the UI. The full measurement contract is documented in the [track-position README](../../analysis/track-position/README.md), with implementation in the [pass-placement library](../../analysis/track-position/lib/pass-placement.mjs).

Validation uses two different checks, because they answer different questions:

- **Stable-set closure** asks whether the derived pass ledger exactly explains start/finish order changes among cars fully observed through a green lap. This is a consistency proof and is expected to approach 100% by construction.
- **Pairwise concordance** compares reconstructed start/finish order against the independent official lap chart. This is the external accuracy measure.

Strict full-field closure is also reported. Its misses include field attrition, where a car disappears through pit or retirement and shifts every trailing rank without an on-track pass.

## Evidence

The stored [accuracy report](../../analysis/track-position/output/validation/accuracy.json), generated 2026-07-19, covers **28 races**. It records **26 `GO`, two `CONDITIONAL`, and zero `NO-GO`** verdicts.

Across those races:

- stable-set closure was **100% over 17,966 car-laps**;
- strict full-field closure was **98.27% over 18,884 car-laps**; and
- mean pairwise concordance with official lap-chart order was **99.65%**.

The two conditional races were Iowa events with lower external concordance than the main `GO` bar. One 2025 Indianapolis capture was excluded because it carried both `full_day_capture` and `heartbeat_gap` masks. The validator and thresholds are available in [validate-pass-placement.mjs](../../analysis/track-position/validate-pass-placement.mjs).

The same report records **21 of 45 official incidents located** to a timing-loop interval. That denominator is useful precisely because it prevents a successful order reconstruction from being overstated as comprehensive incident location.

## Result

The method turns sparse timing geometry into a useful spatial statement without inventing a trajectory. A user can see where along the circuit an order change was bracketed and inspect the race-wide pattern on the same track outline used for section timing.

## Limits

“Between loop A and loop B” is the full supported precision. The method does not establish the exact corner, physical distance between cars, contact, intent, or cause. Pairwise concordance validates order at completed-lap boundaries; it does not prove continuous position between loops. Masked captures and pit/caution movement remain separate rather than being coerced into pass counts.
