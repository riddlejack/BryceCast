# IMSA Daytona Stint/Class Pace

Source-bounded analysis lane for Bryce Aron's 2025 Rolex 24 at Daytona IMSA time-card data.

This lane is analysis-owned. It reads `data/career/career.dataset.json` and writes generated artifacts under `analysis/imsa-daytona-stint-class-pace/output/`. It does not edit ingestion-owned files.

Run:

```bash
python3 analysis/imsa-daytona-stint-class-pace/scripts/build_imsa_daytona_stint_class_pace.py
python3 analysis/imsa-daytona-stint-class-pace/scripts/validate_imsa_daytona_stint_class_pace.py
```
