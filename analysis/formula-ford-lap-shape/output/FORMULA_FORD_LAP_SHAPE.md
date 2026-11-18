# Formula Ford Lap Shape

Generated: `2026-11-18T03:48:24Z`
Source dataset: `data/career/career.dataset.json`
Source hash: `53bd858eb450e79897bd6c8dc6b47dac5c118e726ae5507bd98f7af9341ed161`

## Source Scope

This lane uses official 2020 Formula Ford lap-analysis rows where the imported source block is explicitly labeled for Bryce Aron. It supports Bryce-only lap shape, warm-up, consistency, slow-spike, event progression, and official wet/dry condition context. It does not support opponent lap comparisons or unlabeled continuation-page expansion.

## What Became Productized

- `formula_ford_lap_observations.csv`: 433 Bryce-labeled lap-analysis rows.
- `formula_ford_session_lap_shape.csv`: 39 session lap-shape summaries.
- `formula_ford_event_progression.csv`: 13 event progression rows.
- `formula_ford_condition_lap_shape.csv`: 10 wet/damp/drying/dry session-context rows.
- Context pack: `context-packs/formula-ford-lap-shape-context.json`.

## Session Lap Shape

- BRSCC Formula Ford Festival 2019 QUALIFYING - RACE 5-HEAT 2 Sponsored by Wiz Wheels: best 50.987s, median delta 0.473s, tight_consistent_run, laps 18.
- BRSCC Formula Ford Festival 2019 RACE 19 - LAST CHANCE RACE in recognition of 'Diz: best 50.998s, median delta 1.157s, large_ramp_to_pace, laps 5.
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

## Event Progression

- BRSCC Formula Ford Festival 2019: 2 lap-analysis sessions, event best 50.987s in QUALIFYING - RACE 5-HEAT 2 Sponsored by Wiz Wheels, conditions dry.
- Castle Combe Racing Club FF1600 2020 - 2020-07-04: 3 lap-analysis sessions, event best 71.896s in RACE 2, conditions damp;drying;wet.
- Castle Combe Racing Club FF1600 2020 - 2020-08-01: 3 lap-analysis sessions, event best 70.667s in QUALIFYING - RACE 4 & 8, conditions dry.
- Castle Combe Racing Club FF1600 2020 - 2020-08-31: 3 lap-analysis sessions, event best 70.427s in QUALIFYING - RACE 3 & 8, conditions dry.
- Champion of Brands 2020: 3 lap-analysis sessions, event best 50.651s in RACE 11, conditions dry.
- Champion of Brands 2020 - Brands Hatch GP (British GT support): 2 lap-analysis sessions, event best 95.657s in RACE 10, conditions dry.
- Champion of Brands 2020 - Brands Hatch Indy, September 20: 2 lap-analysis sessions, event best 50.388s in QUALIFYING - RACE 16, conditions dry.
- The Champion of Cadwell for FF1600 2020: 3 lap-analysis sessions, event best 92.371s in QUALIFYING - RACE 2, conditions dry.
- BRSCC Formula Ford Festival 2020: 4 lap-analysis sessions, event best 50.556s in QUALIFYING - HEAT 1 (RACE 4), conditions damp;dry;drying;wet.
- BRSCC National FF1600 2020 - Brands Hatch: 4 lap-analysis sessions, event best 50.136s in QUALIFYING - RACE 2, conditions dry.
- BRSCC National FF1600 2020 - Oulton Park: 3 lap-analysis sessions, event best 125.857s in RACE 8, conditions dry;wet.
- BRSCC National FF1600 2020 - Silverstone International: 3 lap-analysis sessions, event best 71.191s in QUALIFYING - RACE 3, conditions drying;unknown;wet.
- Walter Hayes Trophy 2020: 4 lap-analysis sessions, event best 65.787s in SEMI FINAL 2, conditions damp;wet.

## Condition Context

- damp heat: sessions 1, valid laps 5, median best 62.212s, shape large_ramp_to_pace.
- damp qualifying: sessions 1, valid laps 9, median best 69.442s, shape tight_consistent_run.
- damp race: sessions 2, valid laps 22, median best 68.841s, shape interrupted_or_variable;progressive_session_shape.
- dry qualifying: sessions 10, valid laps 127, median best 60.707s, shape interrupted_or_variable;large_ramp_to_pace;late_fade_or_conditions;progressive_session_shape;tight_consistent_run.
- dry race: sessions 14, valid laps 165, median best 60.861s, shape large_ramp_to_pace;sparse_source_window.
- drying qualifying: sessions 1, valid laps 9, median best 81.657s, shape progressive_session_shape.
- drying race: sessions 2, valid laps 22, median best 67.23s, shape large_ramp_to_pace;sparse_source_window.
- unknown qualifying: sessions 1, valid laps 12, median best 71.191s, shape progressive_session_shape.
- wet heat: sessions 1, valid laps 8, median best 69.257s, shape tight_consistent_run.
- wet race: sessions 6, valid laps 50, median best 82.368s, shape interrupted_or_variable;large_ramp_to_pace;tight_consistent_run.

## Caveats

- The source is Bryce-only labeled lap-analysis, so use it for personal lap shape rather than opponent pace comparison.
- Continuation pages without a repeated Bryce label remain outside this lane until ingestion/parser ownership approves expansion.
- Sparse source windows are retained with lap counts; they should not be used for broad conclusions.
- Session condition labels are official timing/report rows, but they are context rather than causal proof.
