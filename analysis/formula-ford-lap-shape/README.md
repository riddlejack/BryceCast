# Formula Ford Lap Shape

Source-bounded analysis lane for Bryce Aron's 2020 Formula Ford lap-analysis rows.

The canonical lap samples are official TSL/BRSCC/BARC/MSVR-hosted lap-analysis rows where the extracted text repeats Bryce's block label. This supports Bryce-only lap-shape, improvement, consistency, and condition context. It does not support full-field lap pace or unlabeled continuation-page expansion without ingestion/parser approval.

Run:

```bash
python3 analysis/formula-ford-lap-shape/scripts/build_formula_ford_lap_shape.py
python3 analysis/formula-ford-lap-shape/scripts/validate_formula_ford_lap_shape.py
```
