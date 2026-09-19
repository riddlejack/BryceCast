# Data permissions ledger

The durable answer to "are we allowed to use this?" — one entry per
source, with scope and provenance. Maintained since 2026-07-18. Rule of
the house: RAW third-party data never ships or redistributes; the site
shows DERIVED analytics with source labels. This ledger governs use;
data QUALITY gates live in the execution charters.

## 1. Official INDYCAR/INDY NXT published materials
- What: public timing documents (Section Results, lap charts, event
  summaries), public schedule/results APIs, the public Race Control
  timing object our live runner polls.
- Basis: publicly published official materials; the site's foundation
  since inception. Attribution: source drawers name each document/route.
- Status: in use. No restrictions beyond honest labeling.

## 2. RaceTools archives (racetools.com)
- What: 2024–2025 INDY NXT race-weekend capture logs (practice,
  qualifying, races); 2008–2024 INDYCAR/Lights annual archives including
  telemetry variants (2020–2023); 2026 root captures; 49 static
  track-map packages.
- Basis: **explicit permission from RaceTools, granted 2026-07-18**
  (reported by Jack; verbal). Approved use as requested: download/bulk
  ingest for BryceCast — Bryce Aron's own analytics site — analysis,
  model research, and derived analytics display. Raw files are
  content-addressed, git-ignored, never redistributed.
- Provenance TODO (Jack): confirming email or call record — contact
  name, date, approved-use wording — attach reference here and in the
  lake manifest when received. This is documentation hardening, NOT a
  precondition for use: Jack has directed that use proceed on the
  granted permission.
- Status: **cleared for use** (ingest, analysis, modeling, derived
  display). Quality gates per charter still apply before UI numbers.

## 3. Timing71 public archive (archive.timing71.org)
- What: 2024–2026 INDYCAR/INDY NXT replay recordings + analyses; fills
  the 2026 NXT season (12 races, 21 practice/quali through Nashville).
- Basis: a public archive with a documented public API, OpenAPI spec,
  and published state format, operated for open consumption of recorded
  timing states. Used as third-party normalized observations.
- Obligations (correctness + honesty, not legal): label as third-party
  normalized (never "official snapshots"); the identity crosswalk
  (no official driver/session IDs in the format) must validate before
  any UI reads 2026 lake data; state cadence (1–2s) handled at the
  semantic layer.
- Status: **cleared for use** with the labeling + crosswalk obligations.

## 4. BryceCast's own live capture
- What: our one-second full-field Race Control capture, Mid-Ohio 2026
  onward (the runner records every session, including Nashville
  2026-07-18/19).
- Basis: ours. Status: unrestricted within the site's own guardrails.

## 5. Everything else
- Open-Meteo / NWS weather: public APIs, labeled modeled/near-track.
- OpenStreetMap geometry: ODbL, attribution on the Data page.
- Sportradar trial: returned aggregates only; not adopted; no data
  retained beyond evaluation.
