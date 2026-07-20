# Formula Ford Lap Shape

Generated: `2026-07-20T11:25:41Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `64c2452b244d1c2ecb1db01df0735b1a0f631db0d4e74397ed7fa3a89b845978`

## Source Scope

This lane uses official 2020 Formula Ford lap-analysis rows where the imported source block is explicitly labeled for Bryce Aron. It supports Bryce-only lap shape, warm-up, consistency, slow-spike, event progression, and official wet/dry condition context. It does not support opponent lap comparisons or unlabeled continuation-page expansion.

## What Became Productized

- `formula_ford_lap_observations.csv`: 282 Bryce-labeled lap-analysis rows.
- `formula_ford_session_lap_shape.csv`: 24 session lap-shape summaries.
- `formula_ford_event_progression.csv`: 7 event progression rows.
- `formula_ford_condition_lap_shape.csv`: 9 wet/damp/drying/dry session-context rows.
- Context pack: `context-packs/formula-ford-lap-shape-context.json`.

## Session Lap Shape

- BRSCC Formula Ford Festival 2020 GRAND FINAL (RACE 21): best 55.248s, median delta 0.623s, large_ramp_to_pace, laps 20.
- BRSCC Formula Ford Festival 2020 HEAT 1 (RACE 4): best 62.212s, median delta 0.344s, large_ramp_to_pace, laps 5.
- BRSCC Formula Ford Festival 2020 QUALIFYING - HEAT 1 (RACE 4): best 50.556s, median delta 0.516s, large_ramp_to_pace, laps 14.
- BRSCC Formula Ford Festival 2020 SEMI FINAL 1 (RACE 13): best 61.583s, median delta 0.974s, large_ramp_to_pace, laps 15.
- BRSCC National FF1600 2020 - Brands Hatch QUALIFYING - RACE 2: best 50.136s, median delta 0.603s, large_ramp_to_pace, laps 17.
- BRSCC National FF1600 2020 - Brands Hatch RACE 11: best 50.782s, median delta 0.752s, large_ramp_to_pace, laps 18.
- BRSCC National FF1600 2020 - Brands Hatch RACE 18: best 50.764s, median delta 0.896s, large_ramp_to_pace, laps 18.
- BRSCC National FF1600 2020 - Brands Hatch RACE 2: best 50.575s, median delta 0.536s, large_ramp_to_pace, laps 18.
- BRSCC National FF1600 2020 - Oulton Park QUALIFYING - RACE 1: best 127.969s, median delta 2.572s, large_ramp_to_pace, laps 5.
- BRSCC National FF1600 2020 - Oulton Park RACE 1: best 127.037s, median delta 1.587s, interrupted_or_variable, laps 5.
- BRSCC National FF1600 2020 - Oulton Park RACE 8: best 125.857s, median delta 0.709s, large_ramp_to_pace, laps 7.
- BRSCC National FF1600 2020 - Silverstone International QUALIFYING - RACE 3: best 71.191s, median delta 0.946s, progressive_session_shape, laps 12.

## Event Progression

- Champion of Brands 2020: 3 lap-analysis sessions, event best 50.651s in RACE 11, conditions dry.
- The Champion of Cadwell for FF1600 2020: 3 lap-analysis sessions, event best 92.371s in QUALIFYING - RACE 2, conditions dry.
- BRSCC Formula Ford Festival 2020: 4 lap-analysis sessions, event best 50.556s in QUALIFYING - HEAT 1 (RACE 4), conditions damp;dry;drying;wet.
- BRSCC National FF1600 2020 - Brands Hatch: 4 lap-analysis sessions, event best 50.136s in QUALIFYING - RACE 2, conditions dry.
- BRSCC National FF1600 2020 - Oulton Park: 3 lap-analysis sessions, event best 125.857s in RACE 8, conditions dry;wet.
- BRSCC National FF1600 2020 - Silverstone International: 3 lap-analysis sessions, event best 71.191s in QUALIFYING - RACE 3, conditions drying;unknown;wet.
- Walter Hayes Trophy 2020: 4 lap-analysis sessions, event best 65.787s in SEMI FINAL 2, conditions damp;wet.

## Condition Context

- damp heat: sessions 1, valid laps 5, median best 62.212s, shape large_ramp_to_pace.
- damp qualifying: sessions 1, valid laps 9, median best 69.442s, shape tight_consistent_run.
- damp race: sessions 1, valid laps 12, median best 65.787s, shape progressive_session_shape.
- dry qualifying: sessions 5, valid laps 57, median best 50.913s, shape interrupted_or_variable;large_ramp_to_pace;tight_consistent_run.
- dry race: sessions 7, valid laps 110, median best 50.782s, shape large_ramp_to_pace.
- drying race: sessions 2, valid laps 22, median best 67.23s, shape large_ramp_to_pace;sparse_source_window.
- unknown qualifying: sessions 1, valid laps 12, median best 71.191s, shape progressive_session_shape.
- wet heat: sessions 1, valid laps 8, median best 69.257s, shape tight_consistent_run.
- wet race: sessions 5, valid laps 44, median best 79.895s, shape interrupted_or_variable;large_ramp_to_pace;tight_consistent_run.

## Caveats

- The source is Bryce-only labeled lap-analysis, so use it for personal lap shape rather than opponent pace comparison.
- Continuation pages without a repeated Bryce label remain outside this lane until ingestion/parser ownership approves expansion.
- Sparse source windows are retained with lap counts; they should not be used for broad conclusions.
- Session condition labels are official timing/report rows, but they are context rather than causal proof.
