# Live State Worker Note

Scope: read-only review of current live/race-day state sources and frontend data contracts. No pollers, API server, generators, or frontend edits were run.

## Source-State Model

- Low-level live source state is `SourceState = 'live' | 'cold' | 'stale' | 'seed' | 'error'` in `src/data/types.ts`.
- Product readiness state is `LiveReadinessPayload.state = 'ready' | 'pre_session' | 'degraded' | 'wrong_series' | 'stale' | 'blocked'` in `src/data/analyticsContracts.ts`, mirrored by `UiLiveFixture` in `src/data/uiDataPackage.ts`.
- Current `public/data/live-snapshot.json` is not Bryce-live-ready:
  - `checkedAt=2026-06-09T00:52:42.349Z`
  - `eventName=10th Annual Bommarito Automotive Group 500`
  - `sessionStatus=COLD`
  - `sourceState=stale`
  - `lap=260`, `totalLaps=260`
  - `rowCount=25`
  - `bryce=null`
  - `bryceUnavailableReason` says the active Race Control timing feed is Series I and contains a different car #9.
- Current SQLite archive is proof-of-path only:
  - `race_snapshots=13`
  - `bryce_samples=6`
  - `source_probes=93`
  - `5524-6741`: 7 stale snapshots, no Bryce samples.
  - `5546-6763`: 6 cold snapshots, all 6 Bryce samples.

## First Screen Vs Drawer

First-screen live companion can safely show:

- Product readiness state from `/api/readiness`, not raw endpoint reachability.
- Source/readiness banner: `checkedAt`, `sourceState`, `sessionStatus`, `flag`, `lap/totalLaps`, `eventName`, `trackName`, and `rowCount`.
- Wrong-series/unavailable copy from `bryceUnavailableReason` or readiness `reason`.
- Bryce status tile only when a guarded Bryce row exists.
- Timing tower only when readiness is `ready` or `degraded`; otherwise disabled or historical/stale-labeled.
- Points card only from `/api/readiness.points`.

Drawer/drilldown should hold:

- Full endpoint provenance, freshness, etags, byte counts, source summaries, and candidate/reference feed distinctions.
- Replay session selector and archive sufficiency.
- Source/caveat drawer entries from the analytics manifest.

## Ban Or Label Unavailable

- Do not show current Bryce live rank, gap, pass, point, pit, or lap trend from `public/data/live-snapshot.json`; it has `bryce=null`.
- Do not label the current active Race Control feed as INDY NXT/Bryce data; it is stale Series I evidence.
- Do not promote `ntt_data_polling` to pit prediction; it is candidate-only and stale.
- Do not claim live GPS, moving-dot track position, POV, team radio audio, tire strategy, overtake strategy, or pit strategy from the current live archive/snapshot.
- Do not treat the current archive as enough for replay trend analytics. Full-session capture is still required.

## Useful Source Handles

- `public/data/live-snapshot.json`
- `data/live/brycecast.sqlite`
- `src/data/types.ts`
- `src/data/adapters.ts`
- `src/data/analyticsContracts.ts`
- `src/data/analyticsViewModels.ts`
- `src/data/uiDataPackage.ts`
- SQLite tables: `race_snapshots`, `bryce_samples`, `source_probes`
