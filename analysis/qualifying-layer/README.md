# Qualifying layer lane

One qualifying model spanning every canonical series: where Bryce qualified,
against how big a field, and — where the source carries a grid column — how
that qualifying converted to the flag. Backlog item #6 from the career-chapter
utilization audit ("normalized historic qualifying layer spanning
`qualifyingResults` and qualifying-session `results`; source-family rules
required").

## The source-family discipline (the audit's core requirement)

A qualifying session is read from exactly **one** of two families, and the two
are **never blended within a session**:

- **`official_qualifying`** — rows from the dedicated `qualifyingResults` table
  (position, best lap, gap to pole). The purpose-built qualifying classification.
- **`qualifying_session_result`** — rows from the `results` table for a session
  whose `sessionType` is `qualifying`, used only where the dedicated table is
  not populated.

Precedence is per session: if `qualifyingResults` has rows for a session, the
whole session is read from it and the `results` rows for that same session are
never touched; otherwise the whole session is read from `results`. GB3 2021
carries **both** families in the raw data — the layer reads it entirely from
`official_qualifying` (14 dedicated rows) and never mixes in the duplicate
result rows. The validator re-derives the family per session and proves every
session resolves to one family with its denominator taken from that one family.

| Season | Family | Why |
|---|---|---|
| F1600 2019, Formula Ford 2020, FROC 2024, GB3 2022 | `qualifying_session_result` | No dedicated `qualifyingResults` rows exist |
| Euroformula 2023, GB3 2021, INDY NXT 2024–2026 | `official_qualifying` | Dedicated `qualifyingResults` rows exist |

## Quali → race linkage (read from the data, never assumed)

A qualifying session set a race's grid when Bryce's **race grid equals his
qualifying rank** in the same event. That race is the linked race and the pair
is a **`grid_confirmed`** conversion row. This is non-circular: the grid is read
from the race result, the rank from the qualifying source, and they are checked
for equality — it also naturally selects INDY NXT's merged *Combined*
qualifying over the group sessions (only the combined rank matches the grid).

- **Reverse-grid races** (Race 2/3 grids set by a prior race's classification)
  carry no matching qualifying rank and fall out of the conversion set by
  construction — recorded in `excluded_races.csv`, never estimated.
- **No grid column** (F1600 2019, GB3 2022): the qualifying position is still
  recorded in the inventory, but the linkage is left unconfirmed and **no
  conversion figure is invented**.
- One qualifying can grid several races in a weekend (GB3 Race 1 and Race 2 both
  start from the qualifying order), so a session links to a list of races.

Everything is grid positions and place counts. Qualifying best-lap times and
gaps are carried as **context strings only** — the layer never differences them
into a pace or margin claim.

## Coverage (AS_OF 2026-07-19 dataset)

- **115** Bryce qualifying appearances across **6** series (IMSA Daytona is
  endurance — no qualifying appearance).
- **65** grid-confirmed conversion races across **5** series: finished ahead of
  his grid slot in **32**, held station in **5**, gave ground in **28**.
- **81** races outside the conversion set, each with a reason: 37 no grid column
  (F1600, GB3 2022), 32 reverse-grid (no matching qualifying rank), 8 no
  qualifying in the event, 4 no classified finish.

## Outputs

- `output/tables/quali_sessions.csv` — the normalized inventory: one row per
  Bryce qualifying appearance, with source family, rank, field-size denominator,
  session role, linkage tier, and the races it gridded.
- `output/tables/quali_race_conversion.csv` — one row per grid-confirmed
  conversion: qualifying rank → grid → finish, with spatial outcome.
- `output/tables/quali_by_series_season.csv` — per (series, season, family)
  rollup: qualifying sessions, grid-setting sessions, average/best qualifying
  rank, average field size, and the conversion counts with denominators.
- `output/tables/excluded_races.csv` — every race outside the conversion set,
  with its reason.
- `output/summary.json` — method, coverage, career totals, the per-season
  source-family map, and the caveats.

## Commands

```bash
npm run analytics:qualifying-layer
npm run analytics:qualifying-layer:validate
```

The build honors `BRYCECAST_ANALYTICS_AS_OF_DATE=YYYY-MM-DD`; the validator
re-derives everything straight from `data/career/career.dataset.json` (the same
canonical source `npm run career:validate` checks) and exits non-zero on the
first disagreement.
