#!/usr/bin/env python3
"""Build BryceCast data-utilization audit artifacts.

This script reads canonical generated data and analysis artifacts, then emits a
machine-readable utilization map. It does not modify ingestion-owned files.
"""

from __future__ import annotations

import csv
import hashlib
import json
import subprocess
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/data-utilization-audit"
OUTPUT_DIR = LANE_DIR / "output"

DATASET_PATH = ROOT / "data/career/career.dataset.json"
INGESTION_SUMMARY_PATH = ROOT / "data/career/reports/ingestion-summary.json"
VALIDATION_REPORT_PATH = ROOT / "data/career/reports/validation-report.json"
COVERAGE_MATRIX_PATH = ROOT / "data/career/reports/career-coverage-matrix.json"

REQUIRED_COLLECTIONS = [
    "drivers",
    "series",
    "teams",
    "cars",
    "tracks",
    "seasons",
    "events",
    "sessions",
    "results",
    "qualifyingResults",
    "lapSamples",
    "racecraftEvents",
    "penalties",
    "incidents",
    "weatherObservations",
    "mediaAssets",
    "derivedMetrics",
    "sourceEvidence",
    "gaps",
    "broadcastRoutes",
    "notificationEvents",
    "notificationRules",
]

PARTIAL = "partially_analyzed_more_value_remaining"
PRODUCTIZED = "productized_context_pack"
DEEP = "deeply_analyzed"
INVENTORIED = "inventoried_only"
BLOCKED = "blocked_by_source_shape"
INGESTION = "requires_ingestion_approval"
NOT_WORTH = "not_worth_analyzing_with_rationale"

ZERO_ROW_ONLY_NOT_WORTH = {"broadcastRoutes", "notificationEvents", "notificationRules"}

ARTIFACTS = {
    "ui_package": "analysis/ui-data-package/ui-data-package.json",
    "predictive_manifest": "analysis/predictive-race-intelligence/output/context-packs/context-pack-manifest.json",
    "predictive_summary": "analysis/predictive-race-intelligence/output/summary.json",
    "predictive_scorecard": "analysis/predictive-race-intelligence/output/model_scorecard.json",
    "career_lab_pack": "analysis/predictive-race-intelligence/output/context-packs/career-lab-context.json",
    "career_prior_matrix": "analysis/predictive-race-intelligence/output/career_prior_matrix.csv",
    "indy_feature_matrix": "analysis/predictive-race-intelligence/output/indy_nxt_feature_matrix.csv",
    "race_debrief_pack_dir": "analysis/predictive-race-intelligence/output/context-packs/race-debriefs",
    "upcoming_pack_dir": "analysis/predictive-race-intelligence/output/context-packs/upcoming-events",
    "career_parity": "analysis/career-parity/output/tables/career_metric_family_parity.csv",
    "career_result_conversion": "analysis/career-parity/output/tables/career_result_conversion.csv",
    "prep_signals": "analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv",
    "race_debrief_scores": "analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv",
    "lap_dynamics_race": "analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_race.csv",
    "lap_dynamics_driver": "analysis/indy-nxt-discovery/output/deep_dive/tables/full_field_lap_dynamics_by_driver.csv",
    "lap_timeline": "analysis/indy-nxt-discovery/output/tables/indy_nxt_lap_timeline.csv",
    "section_race": "analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv",
    "section_section": "analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_section.csv",
    "section_lap_report": "analysis/indy-nxt-section-lap-deep-dive/output/INDY_NXT_SECTION_LAP_DEEP_DIVE.md",
    "section_lap_summary": "analysis/indy-nxt-section-lap-deep-dive/output/summary.json",
    "section_lap_context": "analysis/indy-nxt-section-lap-deep-dive/output/context-packs/indy-nxt-section-lap-context.json",
    "section_lap_road_america": "analysis/indy-nxt-section-lap-deep-dive/output/context-packs/road-america-prep-context.json",
    "section_lap_observations": "analysis/indy-nxt-section-lap-deep-dive/output/practice_qualifying_bryce_section_observations.csv",
    "section_lap_top_sections": "analysis/indy-nxt-section-lap-deep-dive/output/practice_qualifying_top_section_times.csv",
    "race_lap_section_report": "analysis/indy-nxt-race-lap-section-enhancement/output/INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md",
    "race_lap_section_summary": "analysis/indy-nxt-race-lap-section-enhancement/output/summary.json",
    "race_lap_section_context": "analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/indy-nxt-race-lap-section-context.json",
    "race_lap_section_road_america": "analysis/indy-nxt-race-lap-section-enhancement/output/context-packs/road-america-race-context.json",
    "race_lap_microstates": "analysis/indy-nxt-race-lap-section-enhancement/output/race_lap_microstates.csv",
    "race_section_observations": "analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv",
    "imsa_report": "analysis/imsa-daytona-stint-class-pace/output/IMSA_DAYTONA_STINT_CLASS_PACE.md",
    "imsa_summary": "analysis/imsa-daytona-stint-class-pace/output/summary.json",
    "imsa_context": "analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json",
    "imsa_lap_observations": "analysis/imsa-daytona-stint-class-pace/output/imsa_lap_observations.csv",
    "imsa_stints": "analysis/imsa-daytona-stint-class-pace/output/imsa_stint_summary.csv",
    "imsa_codriver": "analysis/imsa-daytona-stint-class-pace/output/imsa_car85_codriver_pace.csv",
    "imsa_bryce_stints": "analysis/imsa-daytona-stint-class-pace/output/bryce_imsa_stint_context.csv",
    "formula_ford_report": "analysis/formula-ford-lap-shape/output/FORMULA_FORD_LAP_SHAPE.md",
    "formula_ford_summary": "analysis/formula-ford-lap-shape/output/summary.json",
    "formula_ford_context": "analysis/formula-ford-lap-shape/output/context-packs/formula-ford-lap-shape-context.json",
    "formula_ford_lap_observations": "analysis/formula-ford-lap-shape/output/formula_ford_lap_observations.csv",
    "formula_ford_session_shape": "analysis/formula-ford-lap-shape/output/formula_ford_session_lap_shape.csv",
    "formula_ford_event_progression": "analysis/formula-ford-lap-shape/output/formula_ford_event_progression.csv",
    "context_event_report": "analysis/context-event-narrative-layer/output/CONTEXT_EVENT_NARRATIVE_LAYER.md",
    "context_event_summary": "analysis/context-event-narrative-layer/output/summary.json",
    "context_event_pack": "analysis/context-event-narrative-layer/output/context-packs/context-event-narrative-context.json",
    "context_event_timeline": "analysis/context-event-narrative-layer/output/context_event_timeline.csv",
    "context_event_session_rollups": "analysis/context-event-narrative-layer/output/session_context_rollups.csv",
    "context_event_series_coverage": "analysis/context-event-narrative-layer/output/series_context_coverage.csv",
    "context_event_weather": "analysis/context-event-narrative-layer/output/weather_condition_context.csv",
    "context_event_media": "analysis/context-event-narrative-layer/output/media_narrative_index.csv",
    "context_event_source_lineage": "analysis/context-event-narrative-layer/output/source_evidence_lineage.csv",
    "context_event_derived": "analysis/context-event-narrative-layer/output/derived_metric_context.csv",
    "context_event_gap_boundary": "analysis/context-event-narrative-layer/output/gap_source_boundary_context.csv",
    "dimension_report": "analysis/career-dimension-context-layer/output/CAREER_DIMENSION_CONTEXT_LAYER.md",
    "dimension_summary": "analysis/career-dimension-context-layer/output/summary.json",
    "dimension_pack": "analysis/career-dimension-context-layer/output/context-packs/career-dimension-context.json",
    "dimension_result": "analysis/career-dimension-context-layer/output/result_context.csv",
    "dimension_qualifying_result": "analysis/career-dimension-context-layer/output/qualifying_result_context.csv",
    "dimension_qualifying_session": "analysis/career-dimension-context-layer/output/qualifying_session_conversion_summary.csv",
    "dimension_team": "analysis/career-dimension-context-layer/output/team_dimension_context.csv",
    "dimension_team_era": "analysis/career-dimension-context-layer/output/team_era_context.csv",
    "dimension_track": "analysis/career-dimension-context-layer/output/track_venue_context.csv",
    "dimension_track_analog": "analysis/career-dimension-context-layer/output/track_archetype_analog_context.csv",
    "dimension_driver": "analysis/career-dimension-context-layer/output/driver_cohort_context.csv",
    "dimension_car": "analysis/career-dimension-context-layer/output/car_entrant_context.csv",
    "incident_penalty": "analysis/indy-nxt-discovery/output/deep_dive/tables/incident_penalty_context.csv",
    "racecraft_race": "analysis/indy-nxt-discovery/output/deep_dive/tables/racecraft_context_by_race.csv",
    "racecraft_driver": "analysis/indy-nxt-discovery/output/deep_dive/tables/racecraft_context_by_driver.csv",
    "team_race": "analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv",
    "team_year": "analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_year.csv",
    "source_audit": "analysis/indy-nxt-discovery/output/deep_dive/tables/indy_nxt_source_family_audit.csv",
    "ui_contract": "analysis/ui-contract/ui-metric-manifest.json",
    "artifact_index": "analysis/ANALYTICS_UI_ARTIFACT_INDEX.md",
}

FOCUS_ARTIFACT_KEYS = {
    "focus:indy_nxt_practice_qualifying_section_lap": ["section_lap_context", "section_lap_road_america", "section_lap_observations", "section_lap_top_sections", "section_lap_report"],
    "focus:indy_nxt_race_lap_section_enhancement": ["race_lap_section_context", "race_lap_section_road_america", "race_lap_microstates", "race_section_observations", "race_lap_section_report"],
    "focus:imsa_daytona_stint_class_pace": ["imsa_context", "imsa_summary", "imsa_lap_observations", "imsa_stints", "imsa_codriver", "imsa_bryce_stints", "imsa_report"],
    "focus:formula_ford_lap_shape": ["formula_ford_context", "formula_ford_summary", "formula_ford_lap_observations", "formula_ford_session_shape", "formula_ford_event_progression", "formula_ford_report"],
    "focus:non_lap_context_events": ["context_event_pack", "context_event_summary", "context_event_timeline", "context_event_session_rollups", "context_event_series_coverage", "context_event_weather", "context_event_media", "context_event_source_lineage", "context_event_derived", "context_event_gap_boundary", "context_event_report"],
    "focus:career_dimension_qualifying_context": ["dimension_pack", "dimension_summary", "dimension_result", "dimension_qualifying_result", "dimension_qualifying_session", "dimension_team", "dimension_team_era", "dimension_track", "dimension_track_analog", "dimension_driver", "dimension_car", "dimension_report"],
}

ARTIFACT_DIR_EXPECTED_JSON_COUNTS = {
    "race_debrief_pack_dir": 36,
    "upcoming_pack_dir": 9,
}

ARTIFACT_VALIDATOR_BY_KEY: dict[str, str] = {}
for key in [
    "predictive_manifest",
    "predictive_summary",
    "predictive_scorecard",
    "career_lab_pack",
    "career_prior_matrix",
    "indy_feature_matrix",
    "race_debrief_pack_dir",
    "upcoming_pack_dir",
]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/predictive-race-intelligence/scripts/validate_predictive_race_intelligence.py"
for key in ["section_lap_report", "section_lap_summary", "section_lap_context", "section_lap_road_america", "section_lap_observations", "section_lap_top_sections"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/indy-nxt-section-lap-deep-dive/scripts/validate_indy_nxt_section_lap_deep_dive.py"
for key in ["race_lap_section_report", "race_lap_section_summary", "race_lap_section_context", "race_lap_section_road_america", "race_lap_microstates", "race_section_observations"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/indy-nxt-race-lap-section-enhancement/scripts/validate_indy_nxt_race_lap_section_enhancement.py"
for key in ["imsa_report", "imsa_summary", "imsa_context", "imsa_lap_observations", "imsa_stints", "imsa_codriver", "imsa_bryce_stints"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/imsa-daytona-stint-class-pace/scripts/validate_imsa_daytona_stint_class_pace.py"
for key in ["formula_ford_report", "formula_ford_summary", "formula_ford_context", "formula_ford_lap_observations", "formula_ford_session_shape", "formula_ford_event_progression"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/formula-ford-lap-shape/scripts/validate_formula_ford_lap_shape.py"
for key in ["context_event_report", "context_event_summary", "context_event_pack", "context_event_timeline", "context_event_session_rollups", "context_event_series_coverage", "context_event_weather", "context_event_media", "context_event_source_lineage", "context_event_derived", "context_event_gap_boundary"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/context-event-narrative-layer/scripts/validate_context_event_narrative_layer.py"
for key in ["dimension_report", "dimension_summary", "dimension_pack", "dimension_result", "dimension_qualifying_result", "dimension_qualifying_session", "dimension_team", "dimension_team_era", "dimension_track", "dimension_track_analog", "dimension_driver", "dimension_car"]:
    ARTIFACT_VALIDATOR_BY_KEY[key] = "analysis/career-dimension-context-layer/scripts/validate_career_dimension_context_layer.py"

_VALIDATOR_CACHE: dict[str, bool] = {}
_ARTIFACT_COMPLETE_CACHE: dict[str, bool] = {}

_DATASET_HASH: str | None = None


def current_dataset_hash() -> str:
    global _DATASET_HASH
    if _DATASET_HASH is None:
        h = hashlib.sha256()
        with DATASET_PATH.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        _DATASET_HASH = h.hexdigest()
    return _DATASET_HASH


def json_payload_has_fresh_sources(payload: Any) -> bool:
    if not isinstance(payload, dict):
        return False
    return payload.get("sourceHash") == current_dataset_hash()


def json_file_has_fresh_sources(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text())
    except json.JSONDecodeError:
        return False
    return json_payload_has_fresh_sources(payload)


def csv_file_has_current_source_hash(path: Path) -> bool:
    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "sourceHash" not in reader.fieldnames:
            return False
        rows = list(reader)
    if not rows:
        return False
    return all(row.get("sourceHash") == current_dataset_hash() for row in rows)


def validator_passes(relative_script: str) -> bool:
    if relative_script not in _VALIDATOR_CACHE:
        result = subprocess.run([sys.executable, str(ROOT / relative_script)], cwd=ROOT, text=True, capture_output=True)
        _VALIDATOR_CACHE[relative_script] = result.returncode == 0
    return _VALIDATOR_CACHE[relative_script]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def existing(paths: list[str]) -> str:
    return ";".join(path for path in paths if (ROOT / path).exists())


def series_name(series_by_id: dict[str, dict[str, Any]], series_id: str | None) -> str:
    if not series_id:
        return "global"
    return series_by_id.get(series_id, {}).get("name", series_id)


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def indexes(dataset: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in dataset["events"]}
    sessions = {row["id"]: row for row in dataset["sessions"]}
    series = {row["id"]: row for row in dataset["series"]}
    tracks = {row["id"]: row for row in dataset["tracks"]}
    seasons = {row["id"]: row for row in dataset["seasons"]}
    return {"events": events, "sessions": sessions, "series": series, "tracks": tracks, "seasons": seasons}


def row_context(row: dict[str, Any], collection: str, idx: dict[str, Any]) -> tuple[str, int | None, str]:
    events = idx["events"]
    sessions = idx["sessions"]
    event = None
    session = None

    if collection == "series":
        return row.get("id", "global"), None, "series"
    if collection == "seasons":
        return row.get("seriesId", "global"), safe_int(row.get("year")), "season"
    if collection == "events":
        return row.get("seriesId", "global"), safe_int(row.get("seasonYear")), "event"
    if collection == "sessions":
        event = events.get(row.get("eventId"))
        return (event or {}).get("seriesId", "global"), safe_int((event or {}).get("seasonYear")), row.get("sessionType") or "session"
    if collection == "cars":
        return row.get("seriesId", "global"), safe_int(row.get("seasonYear")), "car"
    if collection in {"results", "qualifyingResults", "lapSamples", "racecraftEvents", "penalties", "incidents", "derivedMetrics"}:
        session = sessions.get(row.get("sessionId"))
        event = events.get((session or {}).get("eventId") or row.get("eventId"))
        return (event or {}).get("seriesId") or row.get("seriesId") or "global", safe_int((event or {}).get("seasonYear")), (session or {}).get("sessionType") or "session"
    if collection == "weatherObservations":
        session = sessions.get(row.get("sessionId"))
        event = events.get((session or {}).get("eventId"))
        if event:
            return event.get("seriesId", "global"), safe_int(event.get("seasonYear")), (session or {}).get("sessionType") or "session"
        return "global", None, "track_weather"
    if collection == "mediaAssets":
        session = sessions.get(row.get("sessionId"))
        event = events.get(row.get("eventId") or (session or {}).get("eventId"))
        if event:
            return event.get("seriesId", "global"), safe_int(event.get("seasonYear")), (session or {}).get("sessionType") or "event_media"
        return "global", None, row.get("assetType") or "media"
    if collection == "teams":
        return "global", None, "team_dimension"
    if collection == "tracks":
        return "global", None, "track_dimension"
    if collection == "drivers":
        return "global", None, "driver_dimension"
    if collection in {"sourceEvidence", "gaps"}:
        return "global", None, collection
    if collection in {"broadcastRoutes", "notificationEvents", "notificationRules"}:
        return "global", None, collection
    return "global", None, collection


COLLECTION_POLICY: dict[str, dict[str, Any]] = {
    "drivers": {
        "status": PRODUCTIZED,
        "metricFamily": "field_context",
        "valueScore": 7.0,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_driver", "dimension_report", "imsa_codriver"],
        "ui": "Productized as driver cohort context with Bryce, teammate-overlap, shared-field, competitor/co-driver, and identity-only labels.",
        "underused": "Driver identity is now queryable for cohorts, teammate overlap, shared fields, and source-bounded Career Lab filtering.",
        "proposed": "Use generated driver cohort context with denominator badges and no causal driver-strength claims.",
        "caveat": "Driver rows mix Bryce, teammates, opponents, and one-off sports-car co-drivers; avoid unsupported cross-series driver ratings.",
    },
    "series": {
        "status": PRODUCTIZED,
        "metricFamily": "source_confidence",
        "valueScore": 4.0,
        "artifacts": ["career_lab_pack", "career_prior_matrix"],
        "ui": "Career Lab series summaries and parity badges.",
        "underused": "No major standalone series-dimension signal beyond routing and source-family labels.",
        "proposed": "Use as taxonomy, not as a standalone analytics target.",
        "caveat": "Series depth is intentionally uneven.",
    },
    "teams": {
        "status": PRODUCTIZED,
        "metricFamily": "team_teammate_context",
        "valueScore": 8.0,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_team", "dimension_team_era", "dimension_report", "imsa_context"],
        "ui": "Productized as team dimension and team-era rows with car, driver, qualifying, result, and Bryce-observed counts.",
        "underused": "Team/era context is now addressable for debrief and Career Lab stories with source-family guards.",
        "proposed": "Use generated team and team-era context for source-bounded team/teammate storylines.",
        "caveat": "No engineering setup or root-cause data; keep descriptive.",
    },
    "cars": {
        "status": PRODUCTIZED,
        "metricFamily": "car_context",
        "valueScore": 6.5,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_car", "dimension_report", "imsa_context", "imsa_codriver"],
        "ui": "Productized as car/entrant context with team, series, season, class, usage rows, and Bryce-observed flags.",
        "underused": "Car number, entrant, class, and co-driver/usage context are now addressable across canonical cars.",
        "proposed": "Use generated car/entrant context for class, entrant, and team-era storytelling without setup attribution.",
        "caveat": "Car metadata is not setup telemetry.",
    },
    "tracks": {
        "status": PRODUCTIZED,
        "metricFamily": "track_venue_history",
        "valueScore": 8.0,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_track", "dimension_track_analog", "dimension_report", "career_prior_matrix", "upcoming_pack_dir", "section_lap_road_america"],
        "ui": "Productized as track venue context and metadata-based analog rows, including Road America analogs.",
        "underused": "Track configuration, corner count, length, weather readiness, repeat venue history, and analogs are now queryable.",
        "proposed": "Use generated venue/archetype context as prep framing; use specialized lap/section packs for pace detail.",
        "caveat": "Track metadata cannot substitute for telemetry or setup notes.",
    },
    "seasons": {
        "status": PRODUCTIZED,
        "metricFamily": "championship_progression",
        "valueScore": 5.0,
        "artifacts": ["career_lab_pack", "career_prior_matrix"],
        "ui": "Career Lab and championship context.",
        "underused": "Season summaries are useful but lower value than session/lap grains.",
        "proposed": "Keep as grouping context and season-era filters.",
        "caveat": "Season-level aggregates can hide source-family differences.",
    },
    "events": {
        "status": PRODUCTIZED,
        "metricFamily": "event_context",
        "valueScore": 6.0,
        "artifacts": ["upcoming_pack_dir", "predictive_manifest", "career_lab_pack"],
        "ui": "Upcoming event and race-debrief context packs.",
        "underused": "Event rows are mostly routing; value comes through linked sessions/results/laps.",
        "proposed": "Use event grain as package identity and weekend grouping.",
        "caveat": "Future schedule rows lack result/lap truth until sessions complete.",
    },
    "sessions": {
        "status": PRODUCTIZED,
        "metricFamily": "session_context",
        "valueScore": 7.0,
        "artifacts": ["race_debrief_pack_dir", "predictive_manifest"],
        "ui": "Prep, debrief, live-readiness, and Career Lab routing.",
        "underused": "Session windows and session-type structure still matter for live joins and practice/qualifying context.",
        "proposed": "Use as a join grain; do not run unsupported hour-level weather joins for date-only sessions.",
        "caveat": "Some exact INDY NXT qualifying windows remain unavailable by source shape.",
    },
    "results": {
        "status": PRODUCTIZED,
        "metricFamily": "result_conversion",
        "valueScore": 8.0,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_result", "dimension_report", "career_lab_pack", "race_debrief_pack_dir"],
        "ui": "Full-field result context plus Career Lab result conversion and debrief context packs.",
        "underused": "Every canonical result row is now productized through source-hash validated full-field result context, with Bryce-facing conversion/debrief slices layered on top.",
        "proposed": "Use result_context.csv as the semantic source for full-field result exploration; keep Career Lab and debrief packs for curated Bryce-facing slices.",
        "caveat": "Raw finish is not comparable across field sizes without percentiles.",
    },
    "qualifyingResults": {
        "status": PRODUCTIZED,
        "metricFamily": "qualifying_conversion",
        "valueScore": 8.5,
        "artifacts": ["dimension_pack", "dimension_summary", "dimension_qualifying_result", "dimension_qualifying_session", "dimension_report", "indy_feature_matrix", "predictive_scorecard"],
        "ui": "Productized as qualifying-result context and qualifying-session conversion summaries with same-event race-result joins.",
        "underused": "Qualifying rows are now addressable by session format, track type, team era, car, driver, and source-bounded race conversion joins.",
        "proposed": "Use generated qualifying context for prep/Career Lab conversion analysis with session-format caveats.",
        "caveat": "Group and combined qualifying formats are not fully equivalent.",
    },
    "lapSamples": {
        "status": PRODUCTIZED,
        "metricFamily": "lap_shape",
        "valueScore": 10.0,
        "artifacts": ["race_debrief_pack_dir", "race_lap_section_context", "race_lap_section_report", "imsa_context", "imsa_report", "formula_ford_context", "formula_ford_report"],
        "ui": "INDY NXT race lap microstates/segments, IMSA Daytona stint/class pace, and Formula Ford Bryce-only lap shape are productized.",
        "underused": "No canonical lapSample source family remains unproductized; future value is through joins to context, incidents, qualifying, and track analogs.",
        "proposed": "Use generated lap context packs with source-shape labels; keep cross-series displays separated by source grain.",
        "caveat": "Lap sample grain differs by source: IMSA time cards, INDY NXT race lap charts, and Formula Ford Bryce-only lap-analysis blocks are not interchangeable.",
    },
    "racecraftEvents": {
        "status": PRODUCTIZED,
        "metricFamily": "racecraft_context",
        "valueScore": 7.5,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_timeline", "context_event_session_rollups", "context_event_report", "race_debrief_pack_dir"],
        "ui": "Productized in the context-event timeline, session rollups, and context pack, plus existing debrief/source drawer tables.",
        "underused": "Racecraft rows are now addressable as source-bounded context facts; remaining value comes from UI storytelling and lap/context joins.",
        "proposed": "Use the generated context-event pack for momentum/recovery narratives without unsupported overtake reconstruction.",
        "caveat": "Not a full pass-by-pass telemetry feed.",
    },
    "penalties": {
        "status": PRODUCTIZED,
        "metricFamily": "incident_penalty_context",
        "valueScore": 7.0,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_timeline", "context_event_session_rollups", "context_event_report", "race_debrief_pack_dir"],
        "ui": "Productized as penalty rows in the context-event timeline and session rollups, with debrief/source drawer support.",
        "underused": "Penalty type, lap, and position/time impact are now productized; downstream displays should keep no-row/source-coverage caveats visible.",
        "proposed": "Use generated context rows for debrief/event timelines and join to lap-shape deltas only where lap numbers exist.",
        "caveat": "Penalty ledgers are uneven by series; absence is not proof of clean session unless source exposes no-penalty decisions.",
    },
    "incidents": {
        "status": PRODUCTIZED,
        "metricFamily": "incident_penalty_context",
        "valueScore": 7.5,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_timeline", "context_event_session_rollups", "context_event_report", "race_debrief_pack_dir"],
        "ui": "Productized as incident rows in the context-event timeline and session rollups, with debrief/source drawer support.",
        "underused": "Caution/contact/mechanical context is now productized; remaining value is presentation and source-backed lap-position joins.",
        "proposed": "Use generated context rows for session storylines and only join to lap-position swings when both sources support it.",
        "caveat": "Incident rows are official summary/context, not video-confirmed root cause.",
    },
    "weatherObservations": {
        "status": PRODUCTIZED,
        "metricFamily": "weather_context",
        "valueScore": 7.0,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_weather", "context_event_timeline", "context_event_report", "career_lab_pack", "imsa_context"],
        "ui": "Productized as weather/condition context rows with source, time, location, and join-confidence fields preserved.",
        "underused": "Weather rows are now queryable by series/session/source family; future value is visual comparison, not additional backend extraction.",
        "proposed": "Use generated condition context with explicit source-confidence labels and avoid causal weather effects unless a later model validates them.",
        "caveat": "INDY NXT has no official weather observations; non-official ambient weather needs labels.",
    },
    "mediaAssets": {
        "status": PRODUCTIZED,
        "metricFamily": "narrative_context",
        "valueScore": 6.5,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_media", "context_event_timeline", "context_event_report", "career_lab_pack"],
        "ui": "Productized as a media narrative index and event/session context timeline with rights-status fields preserved.",
        "underused": "Media rows are now source-indexed for narrative and source-drawer use; UI must still apply rights-status display rules.",
        "proposed": "Use generated media index for storylines, source drawers, and milestone context while respecting rightsStatus.",
        "caveat": "Narrative evidence should support, not override, official result data.",
    },
    "derivedMetrics": {
        "status": PRODUCTIZED,
        "metricFamily": "section_pace",
        "valueScore": 10.0,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_derived", "context_event_report", "indy_feature_matrix", "section_lap_context", "section_lap_report", "race_lap_section_context", "race_lap_section_report"],
        "ui": "Productized through section-lap/race-section context packs and a full derived metric context index covering the {rowCount} derivedMetric rows represented by this audit row.",
        "underused": "All canonical derivedMetric rows are now addressable; deeper interpretation remains in the specialized section/race-lap lanes.",
        "proposed": "Route UI and analytics queries through generated context packs and specialized deep-dive artifacts rather than raw derivedMetric blobs.",
        "caveat": "One INDY NXT Section Results holdout is source-corrupt; sparse denominators need suppression or badges.",
    },
    "sourceEvidence": {
        "status": PRODUCTIZED,
        "metricFamily": "source_confidence",
        "valueScore": 6.0,
        "artifacts": ["context_event_pack", "context_event_summary", "context_event_source_lineage", "context_event_report"],
        "ui": "Productized as source-evidence lineage with source type, confidence tier, parser, raw-artifact, and license fields.",
        "underused": "Source-family quality is now queryable; remaining value is visual/source-ops presentation.",
        "proposed": "Use generated source lineage for confidence badges, source drawers, and review routing.",
        "caveat": "Source evidence is provenance metadata, not performance signal by itself.",
    },
    "gaps": {
        "status": PRODUCTIZED,
        "metricFamily": "source_confidence",
        "valueScore": 5.0,
        "artifacts": ["context_event_gap_boundary", "context_event_pack", "context_event_summary", "ui_package"],
        "ui": "Source Ops unavailable/deferred states plus context-pack-backed source-boundary rows.",
        "underused": "All canonical gap rows are now productized as explicit source-boundary truth with row-level IDs and source states preserved.",
        "proposed": "Use gap_source_boundary_context.csv and the context-event pack for explicit blockers; do not turn gaps into inferred metrics.",
        "caveat": "A gap is a source-state fact, not a data failure by itself.",
    },
    "broadcastRoutes": {
        "status": NOT_WORTH,
        "metricFamily": "live_broadcast_context",
        "valueScore": 2.0,
        "artifacts": [],
        "ui": "No canonical broadcast-route rows currently exist.",
        "underused": "No current rows to analyze.",
        "proposed": "Keep classified as empty until ingestion populates broadcast-route rows.",
        "caveat": "Zero-row collection in the current canonical dataset; future rows should be reclassified by the audit.",
    },
    "notificationEvents": {
        "status": NOT_WORTH,
        "metricFamily": "notification_context",
        "valueScore": 2.0,
        "artifacts": [],
        "ui": "No canonical notification-event rows currently exist.",
        "underused": "No current rows to analyze.",
        "proposed": "Keep classified as empty until ingestion/live systems populate notification-event rows.",
        "caveat": "Zero-row collection in the current canonical dataset; future rows should be reclassified by the audit.",
    },
    "notificationRules": {
        "status": NOT_WORTH,
        "metricFamily": "notification_context",
        "valueScore": 2.0,
        "artifacts": [],
        "ui": "No canonical notification-rule rows currently exist.",
        "underused": "No current rows to analyze.",
        "proposed": "Keep classified as empty until product rules are represented in canonical data.",
        "caveat": "Zero-row collection in the current canonical dataset; future rows should be reclassified by the audit.",
    },
}


def artifact_string(keys: list[str]) -> str:
    return existing([ARTIFACTS[key] for key in keys if key in ARTIFACTS])


def artifact_key_complete(key: str) -> bool:
    if key in _ARTIFACT_COMPLETE_CACHE:
        return _ARTIFACT_COMPLETE_CACHE[key]
    complete = artifact_key_complete_uncached(key)
    _ARTIFACT_COMPLETE_CACHE[key] = complete
    return complete


def artifact_key_complete_uncached(key: str) -> bool:
    validator = ARTIFACT_VALIDATOR_BY_KEY.get(key)
    if validator and not validator_passes(validator):
        return False
    relative = ARTIFACTS.get(key)
    if not relative:
        return False
    path = ROOT / relative
    if not path.exists():
        return False
    if path.is_dir():
        json_files = list(path.glob("*.json"))
        json_count = len(json_files)
        expected = ARTIFACT_DIR_EXPECTED_JSON_COUNTS.get(key)
        if expected is not None and json_count != expected:
            return False
        if expected is None and json_count == 0:
            return False
        if not all(file.stat().st_size > 0 for file in json_files):
            return False
        return all(json_file_has_fresh_sources(file) for file in json_files)
    if path.stat().st_size == 0:
        return False
    if path.suffix == ".json":
        return json_file_has_fresh_sources(path)
    if path.suffix == ".csv":
        return csv_file_has_current_source_hash(path)
    if path.suffix == ".md" and validator:
        return current_dataset_hash() in path.read_text()
    return False


def all_artifacts_exist(keys: list[str]) -> bool:
    return bool(keys) and all(artifact_key_complete(key) for key in keys)


def apply_focus_artifact_status(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for row in rows:
        keys = FOCUS_ARTIFACT_KEYS.get(row["auditId"])
        if keys and not all_artifacts_exist(keys):
            row["utilizationStatus"] = PARTIAL
            row["confidence"] = "source_backed_artifacts_missing"
            row["rationale"] = "Expected generated artifacts are missing; keep this focus lane in the backlog until its build and validation gates regenerate the full artifact set."
    return rows


def policy_artifacts_complete(policy: dict[str, Any]) -> bool:
    keys = policy.get("artifacts", [])
    if not keys:
        return False
    return all_artifacts_exist(keys)


def effective_status(policy: dict[str, Any], artifacts: str, *, collection: str | None = None, row_count: int | None = None) -> str:
    status = policy["status"]
    if status == NOT_WORTH and collection in ZERO_ROW_ONLY_NOT_WORTH and row_count and row_count > 0:
        return PARTIAL
    if status in {PRODUCTIZED, DEEP}:
        if not artifacts:
            return INVENTORIED
        if not policy_artifacts_complete(policy):
            return PARTIAL
    return status


def policy_text(policy: dict[str, Any], field: str, row_count: int) -> str:
    return str(policy[field]).format(rowCount=row_count)


def collection_inventory(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for name in REQUIRED_COLLECTIONS:
        policy = COLLECTION_POLICY[name]
        artifacts = artifact_string(policy.get("artifacts", []))
        row_count = len(dataset.get(name, []))
        status = effective_status(policy, artifacts, collection=name, row_count=row_count)
        confidence = "source_backed" if status in {PRODUCTIZED, DEEP} else "source_backed_partial_artifacts" if artifacts else "inventory_only"
        rows.append(
            {
                "collection": name,
                "rowCount": row_count,
                "primaryGrain": policy["metricFamily"],
                "metricFamilies": policy["metricFamily"],
                "currentAnalyticsArtifacts": artifacts,
                "currentUiOrContextExposure": policy_text(policy, "ui", row_count),
                "utilizationStatus": status,
                "valueScore": policy["valueScore"],
                "unusedOrUnderusedSignal": policy_text(policy, "underused", row_count),
                "proposedAnalysis": policy_text(policy, "proposed", row_count),
                "confidence": confidence,
                "rationale": policy_text(policy, "proposed" if status != PRODUCTIZED else "underused", row_count),
                "sourceCaveat": policy_text(policy, "caveat", row_count),
            }
        )
    return rows


def series_grain_inventory(dataset: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    counters: dict[tuple[str, str, str, str, str], int] = Counter()
    for collection in REQUIRED_COLLECTIONS:
        for row in dataset.get(collection, []):
            series_id, season_year, session_type = row_context(row, collection, idx)
            key = (series_id, series_name(idx["series"], series_id), str(season_year or "all"), session_type, collection)
            counters[key] += 1
    rows = []
    for (series_id, name, season_year, session_type, collection), count in sorted(counters.items()):
        policy = COLLECTION_POLICY[collection]
        artifacts = artifact_string(policy.get("artifacts", []))
        status = effective_status(policy, artifacts, collection=collection, row_count=count)
        rows.append(
            {
                "seriesId": series_id,
                "seriesName": name,
                "seasonYear": season_year,
                "sessionType": session_type,
                "collection": collection,
                "rowCount": count,
                "utilizationStatus": status,
                "metricFamily": policy["metricFamily"],
                "currentAnalyticsArtifacts": artifacts,
                "currentUiOrContextExposure": policy_text(policy, "ui", count),
                "unusedOrUnderusedSignal": policy_text(policy, "underused", count),
                "sourceCaveat": policy_text(policy, "caveat", count),
            }
        )
    return rows


def base_matrix_rows(dataset: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for row in collection_inventory(dataset):
        rows.append(
            matrix_row(
                audit_id=f"collection:{row['collection']}",
                series_id="global",
                series="global",
                season="all",
                session_type="collection",
                collection=row["collection"],
                metric=row["metricFamilies"],
                source_family="canonical_dataset",
                row_count=row["rowCount"],
                artifacts=row["currentAnalyticsArtifacts"],
                exposure=row["currentUiOrContextExposure"],
                underused=row["unusedOrUnderusedSignal"],
                proposed=row["proposedAnalysis"],
                value=row["valueScore"],
                confidence=row["confidence"],
                caveat=row["sourceCaveat"],
                status=row["utilizationStatus"],
                rationale=row["rationale"],
            )
        )
    return rows


def matrix_row(
    *,
    audit_id: str,
    series_id: str,
    series: str,
    season: str,
    session_type: str,
    collection: str,
    metric: str,
    source_family: str,
    row_count: int,
    artifacts: str,
    exposure: str,
    underused: str,
    proposed: str,
    value: float,
    confidence: str,
    caveat: str,
    status: str,
    rationale: str,
) -> dict[str, Any]:
    return {
        "auditId": audit_id,
        "seriesId": series_id,
        "seriesName": series,
        "seasonYear": season,
        "sessionType": session_type,
        "dataCollection": collection,
        "metricFamily": metric,
        "sourceFamily": source_family,
        "rowCount": row_count,
        "currentAnalyticsArtifacts": artifacts,
        "currentUiOrContextExposure": exposure,
        "unusedOrUnderusedSignal": underused,
        "proposedAnalysis": proposed,
        "valueScore": value,
        "confidence": confidence,
        "sourceCaveat": caveat,
        "utilizationStatus": status,
        "rationale": rationale,
    }


def count_laps(dataset: dict[str, Any], idx: dict[str, Any], series_id: str, session_type: str | None = None) -> int:
    total = 0
    for lap in dataset["lapSamples"]:
        sid, _, stype = row_context(lap, "lapSamples", idx)
        if sid == series_id and (session_type is None or stype == session_type):
            total += 1
    return total


def indy_nxt_bryce_lap_chart_completeness(dataset: dict[str, Any], idx: dict[str, Any]) -> dict[str, int]:
    race_session_ids = {
        session["id"]
        for session in dataset["sessions"]
        if session.get("sessionType") == "race"
        and idx["events"].get(session.get("eventId"), {}).get("seriesId") == "series_indy_nxt"
    }
    result_sessions = {
        row.get("sessionId")
        for row in dataset["results"]
        if row.get("driverId") == "driver_bryce_aron" and row.get("sessionId") in race_session_ids
    }
    visible_states: dict[str, str] = {}
    for row in dataset["lapSamples"]:
        session_id = row.get("sessionId")
        if row.get("driverId") != "driver_bryce_aron" or session_id not in race_session_ids:
            continue
        visible_states.setdefault(session_id, row.get("raw", {}).get("chartCompleteness") or "unknown")
    counts = Counter(visible_states.values())
    counts["resultSessions"] = len(result_sessions)
    counts["sourceVisibleSessions"] = len(visible_states)
    counts["missingBryceLapRows"] = len(result_sessions - set(visible_states))
    return dict(counts)


def count_derived_sections(dataset: dict[str, Any], idx: dict[str, Any], session_types: set[str], metric_type: str | None = None) -> tuple[int, int, int]:
    metric_rows = 0
    lap_entries = 0
    section_entries = 0
    for metric in dataset["derivedMetrics"]:
        sid, _, stype = row_context(metric, "derivedMetrics", idx)
        if sid != "series_indy_nxt" or stype not in session_types:
            continue
        if metric_type and metric.get("metricType") != metric_type:
            continue
        metric_rows += 1
        for car in metric.get("metrics", {}).get("cars", []) or []:
            for lap in car.get("laps", []) or []:
                lap_entries += 1
                section_entries += len(lap.get("sections", []) or [])
    return metric_rows, lap_entries, section_entries


def count_top_section_times(dataset: dict[str, Any], idx: dict[str, Any], session_types: set[str]) -> tuple[int, int, int]:
    metric_rows = 0
    section_blocks = 0
    nested_rows = 0
    for metric in dataset["derivedMetrics"]:
        sid, _, stype = row_context(metric, "derivedMetrics", idx)
        if sid != "series_indy_nxt" or stype not in session_types:
            continue
        if metric.get("metricType") != "official_top_section_times":
            continue
        metric_rows += 1
        for section in metric.get("metrics", {}).get("sections", []) or []:
            section_blocks += 1
            nested_rows += len(section.get("rows", []) or [])
    return metric_rows, section_blocks, nested_rows


def count_collection_by_series(dataset: dict[str, Any], idx: dict[str, Any], collection: str, series_id: str) -> int:
    total = 0
    for row in dataset.get(collection, []):
        sid, _, _ = row_context(row, collection, idx)
        if sid == series_id:
            total += 1
    return total


def focus_rows(dataset: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    practice_metrics, practice_laps, practice_sections = count_derived_sections(dataset, idx, {"practice"}, "official_section_results")
    qualifying_metrics, qualifying_laps, qualifying_sections = count_derived_sections(dataset, idx, {"qualifying"}, "official_section_results")
    top_section_metrics, top_section_blocks, top_section_rows = count_top_section_times(dataset, idx, {"practice", "qualifying"})
    race_metrics, race_laps, race_sections = count_derived_sections(dataset, idx, {"race"}, "official_section_results")
    lap_chart_completeness = indy_nxt_bryce_lap_chart_completeness(dataset, idx)
    indy_laps = count_laps(dataset, idx, "series_indy_nxt", "race")
    imsa_laps = count_laps(dataset, idx, "series_imsa_weathertech", "race")
    formula_ford_laps = count_laps(dataset, idx, "series_formula_ford")
    non_lap_count = sum(
        len(dataset.get(collection, []))
        for collection in ["racecraftEvents", "penalties", "incidents", "weatherObservations", "mediaAssets"]
    )
    rows = [
        matrix_row(
            audit_id="focus:indy_nxt_practice_qualifying_section_lap",
            series_id="series_indy_nxt",
            series="INDY NXT",
            season="2024-2026",
            session_type="practice+qualifying",
            collection="derivedMetrics",
            metric="section_pace",
            source_family="official_section_results_pdf+official_top_section_times_pdf",
            row_count=practice_laps + qualifying_laps + top_section_rows,
            artifacts=artifact_string(["section_lap_context", "section_lap_road_america", "section_lap_observations", "section_lap_top_sections", "section_lap_report"]),
            exposure="Productized as source-hash validated section-lap and Road America context packs.",
            underused=f"Executed: practice/qualifying section-result payload had {practice_laps + qualifying_laps} car-lap entries and {practice_sections + qualifying_sections} section entries; Top Section Times added {top_section_metrics} metrics, {top_section_blocks} section blocks, and {top_section_rows} nested rows.",
            proposed="Use the generated context packs for prep/debrief/career-lab queries; keep low-denominator and no-point-prediction display rules.",
            value=10.0,
            confidence="source_backed_productized",
            caveat="Section rows are official PDFs but sparse/format-specific; low denominators are suppressed and context packs avoid point predictions.",
            status=PRODUCTIZED,
            rationale="Executed by analysis/indy-nxt-section-lap-deep-dive with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
        matrix_row(
            audit_id="focus:indy_nxt_race_lap_section_enhancement",
            series_id="series_indy_nxt",
            series="INDY NXT",
            season="2024-2026",
            session_type="race",
            collection="lapSamples+derivedMetrics",
            metric="lap_shape+section_pace",
            source_family="official_lap_chart_pdf+official_section_results_pdf",
            row_count=indy_laps + race_laps,
            artifacts=artifact_string(["race_lap_section_context", "race_lap_section_road_america", "race_lap_microstates", "race_section_observations", "race_lap_section_report"]),
            exposure="Productized as source-hash validated lap microstates, caution-aware segments, inflection points, clean race-section summaries, and Road America race context packs.",
            underused=f"Executed: official race lap/section data covered {indy_laps} lap samples and {race_laps} section car-lap rows; generated lap microstates, caution-aware segments, inflection points, and clean race-section context.",
            proposed="Use the generated post-race context packs for debrief and Career Lab drilldowns; keep live/future claims separate.",
            value=9.5,
            confidence="source_backed_productized",
            caveat=(
                f"{lap_chart_completeness.get('complete_validated_against_result_lap_counts', 0)}/"
                f"{lap_chart_completeness.get('resultSessions', 0)} Bryce result races have complete validated lap charts; "
                f"{lap_chart_completeness.get('partial_visible_laps_only', 0)} partial-visible sessions; "
                f"{lap_chart_completeness.get('missingBryceLapRows', 0)} result sessions have no Bryce lap rows in canonical lapSamples; "
                "context packs are post-race descriptive only."
            ),
            status=PRODUCTIZED,
            rationale="Executed by analysis/indy-nxt-race-lap-section-enhancement with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
        matrix_row(
            audit_id="focus:imsa_daytona_stint_class_pace",
            series_id="series_imsa_weathertech",
            series="IMSA WeatherTech SportsCar Championship",
            season="2025",
            session_type="race",
            collection="lapSamples",
            metric="stint_class_pace",
            source_family="official_alkamel_time_cards",
            row_count=imsa_laps,
            artifacts=artifact_string(["imsa_context", "imsa_summary", "imsa_lap_observations", "imsa_stints", "imsa_codriver", "imsa_bryce_stints", "imsa_report"]),
            exposure="Productized as source-hash validated Daytona time-card lap observations, stint summaries, car 85 co-driver pace, Bryce stint context, and class-hour context pack.",
            underused=f"Executed: official IMSA time cards have {imsa_laps} race lap samples; generated stint/class/co-driver pace artifacts with source-bounded display rules.",
            proposed="Use generated Daytona stint/class/co-driver context pack for Career Lab and standalone IMSA storytelling; do not claim telemetry, strategy root cause, or future forecast.",
            value=8.5,
            confidence="source_backed_productized",
            caveat="Sports-car co-driver grain differs from formula single-driver race rows; time cards do not expose running order, telemetry, or strategy notes.",
            status=PRODUCTIZED,
            rationale="Executed by analysis/imsa-daytona-stint-class-pace with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
        matrix_row(
            audit_id="focus:formula_ford_lap_shape",
            series_id="series_formula_ford",
            series="Formula Ford",
            season="2020",
            session_type="qualifying+heat+race",
            collection="lapSamples",
            metric="lap_shape",
            source_family="official_tsl_lap_analysis_pdf",
            row_count=formula_ford_laps,
            artifacts=artifact_string(["formula_ford_context", "formula_ford_summary", "formula_ford_lap_observations", "formula_ford_session_shape", "formula_ford_event_progression", "formula_ford_report"]),
            exposure="Productized as source-hash validated Bryce-only lap observations, session lap-shape summaries, event progression, condition context, and context pack.",
            underused=f"Executed: Formula Ford has {formula_ford_laps} Bryce-only lap samples across 24 sessions; generated lap-shape, consistency, event, and condition-context artifacts.",
            proposed="Use generated Formula Ford lap-shape context pack for Career Lab with Bryce-only and continuation-page caveats.",
            value=7.5,
            confidence="source_backed_productized",
            caveat="Bryce-only labeled blocks; continuation pages without repeated Bryce label require ingestion/parser approval before expansion.",
            status=PRODUCTIZED,
            rationale="Executed by analysis/formula-ford-lap-shape with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
        matrix_row(
            audit_id="focus:non_lap_context_events",
            series_id="multi",
            series="Multi-series",
            season="2019-2026",
            session_type="race+event",
            collection="racecraftEvents+penalties+incidents+weatherObservations+mediaAssets",
            metric="race_context+narrative_context",
            source_family="official_reports+media_sources+source_evidence_lineage",
            row_count=non_lap_count,
            artifacts=artifact_string(["context_event_pack", "context_event_summary", "context_event_timeline", "context_event_session_rollups", "context_event_series_coverage", "context_event_weather", "context_event_media", "context_event_source_lineage", "context_event_derived", "context_event_gap_boundary", "context_event_report"]),
            exposure="Productized as source-hash validated context timeline, session/series rollups, weather context, media index, source lineage, derived metric index, and context pack.",
            underused="Executed: non-lap contextual data is now queryable for race-weekend prep, debrief timelines, Career Lab source drawers, and narrative context without inventing telemetry.",
            proposed="Use generated context-event/narrative artifacts for source-backed storylines, source drawers, rights-aware media displays, and condition context.",
            value=8.0,
            confidence="source_backed_productized",
            caveat="Official source coverage differs by series; absence is not proof unless no-row source is explicit.",
            status=PRODUCTIZED,
            rationale="Executed by analysis/context-event-narrative-layer with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
        matrix_row(
            audit_id="focus:career_dimension_qualifying_context",
            series_id="multi",
            series="Multi-series",
            season="2019-2026",
            session_type="result+qualifying+dimension",
            collection="results+qualifyingResults+teams+tracks+drivers+cars",
            metric="result_context+qualifying_conversion+team_track_driver_car_context",
            source_family="canonical_results+canonical_qualifying_results+canonical_dimensions+same_event_race_results",
            row_count=len(dataset.get("results", [])) + len(dataset.get("qualifyingResults", [])) + len(dataset.get("teams", [])) + len(dataset.get("tracks", [])) + len(dataset.get("drivers", [])) + len(dataset.get("cars", [])),
            artifacts=artifact_string(["dimension_pack", "dimension_summary", "dimension_result", "dimension_qualifying_result", "dimension_qualifying_session", "dimension_team", "dimension_team_era", "dimension_track", "dimension_track_analog", "dimension_driver", "dimension_car", "dimension_report"]),
            exposure="Productized as source-hash validated full-field result context, qualifying conversion context, team/team-era context, track venue/analog context, driver cohort context, and car/entrant context.",
            underused="Executed: the remaining result, qualifying, and dimension collections are now queryable without creating unsupported ratings, setup conclusions, or point forecasts.",
            proposed="Use generated dimension context pack and result_context.csv for prep, Career Lab filters, source-backed analogs, teammate overlap, result exploration, and qualifying conversion analysis.",
            value=8.8,
            confidence="source_backed_productized",
            caveat="Qualifying formats, cross-series fields, and venue metadata differ; outputs are descriptive context and source-bounded conversion joins.",
            status=PRODUCTIZED,
            rationale="Executed by analysis/career-dimension-context-layer with validator-backed CSV, JSON, report, and context-pack artifacts.",
        ),
    ]
    return apply_focus_artifact_status(rows)


def utilization_matrix(dataset: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    return base_matrix_rows(dataset) + focus_rows(dataset, idx)


def backlog_rows(matrix: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    priority_by_id = {
        "focus:indy_nxt_practice_qualifying_section_lap": 1,
        "focus:indy_nxt_race_lap_section_enhancement": 2,
        "focus:imsa_daytona_stint_class_pace": 3,
        "focus:formula_ford_lap_shape": 4,
        "focus:non_lap_context_events": 5,
        "focus:career_dimension_qualifying_context": 6,
    }
    opportunity_by_id = {
        "focus:indy_nxt_practice_qualifying_section_lap": "indy_nxt_practice_qualifying_section_lap",
        "focus:indy_nxt_race_lap_section_enhancement": "indy_nxt_race_lap_section_enhancement",
        "focus:imsa_daytona_stint_class_pace": "imsa_daytona_stint_class_pace",
        "focus:formula_ford_lap_shape": "formula_ford_lap_shape",
        "focus:non_lap_context_events": "non_lap_context_events",
        "focus:career_dimension_qualifying_context": "career_dimension_qualifying_context",
    }
    for row in matrix:
        if row["utilizationStatus"] not in {PARTIAL, INVENTORIED}:
            continue
        audit_id = row["auditId"]
        opportunity_id = opportunity_by_id.get(audit_id, audit_id.replace(":", "_"))
        rows.append(
            {
                "opportunityId": opportunity_id,
                "auditId": audit_id,
                "priority": priority_by_id.get(audit_id, 50),
                "seriesId": row["seriesId"],
                "seriesName": row["seriesName"],
                "dataCollection": row["dataCollection"],
                "metricFamily": row["metricFamily"],
                "rowCount": row["rowCount"],
                "valueScore": row["valueScore"],
                "recommendedLane": lane_for(row),
                "proposedAnalysis": row["proposedAnalysis"],
                "sourceCaveat": row["sourceCaveat"],
                "requiresIngestionApproval": "yes" if "ingestion" in row["sourceCaveat"].lower() or "approval" in row["sourceCaveat"].lower() else "no",
            }
        )
    rows.sort(key=lambda r: (float(r["priority"]), -float(r["valueScore"]), r["auditId"]))
    return rows


def lane_for(row: dict[str, Any]) -> str:
    audit_id = row["auditId"]
    if audit_id == "focus:indy_nxt_practice_qualifying_section_lap":
        return "analysis/indy-nxt-section-lap-deep-dive"
    if audit_id == "focus:indy_nxt_race_lap_section_enhancement":
        return "analysis/indy-nxt-race-lap-section-enhancement"
    if audit_id == "focus:imsa_daytona_stint_class_pace":
        return "analysis/imsa-daytona-stint-class-pace"
    if audit_id == "focus:formula_ford_lap_shape":
        return "analysis/formula-ford-lap-shape"
    if audit_id == "focus:non_lap_context_events":
        return "analysis/context-event-narrative-layer"
    if audit_id == "focus:career_dimension_qualifying_context":
        return "analysis/career-dimension-context-layer"
    return "analysis/data-utilization-audit/backlog"


def report(dataset: dict[str, Any], matrix: list[dict[str, Any]], backlog: list[dict[str, Any]], ingestion: dict[str, Any], validation: dict[str, Any]) -> str:
    status_counts = Counter(row["utilizationStatus"] for row in matrix)
    top_backlog = backlog[:10]
    collection_lines = []
    for row in collection_inventory(dataset):
        collection_lines.append(
            f"| {row['collection']} | {row['rowCount']} | {row['utilizationStatus']} | {row['valueScore']} | {row['unusedOrUnderusedSignal']} |"
        )
    backlog_lines = [
        f"| {row['priority']} | {row['opportunityId']} | {row['seriesName']} | {row['dataCollection']} | {row['rowCount']} | {row['valueScore']} | {row['recommendedLane']} |"
        for row in top_backlog
    ]
    focus_specs = [
        ("focus:indy_nxt_practice_qualifying_section_lap", "indy_nxt_practice_qualifying_section_lap", "analysis/indy-nxt-section-lap-deep-dive", "INDY NXT practice/qualifying section-lap deep dive"),
        ("focus:indy_nxt_race_lap_section_enhancement", "indy_nxt_race_lap_section_enhancement", "analysis/indy-nxt-race-lap-section-enhancement", "INDY NXT race lap/section enhancement beyond current aggregates"),
        ("focus:imsa_daytona_stint_class_pace", "imsa_daytona_stint_class_pace", "analysis/imsa-daytona-stint-class-pace", "IMSA Daytona stint/class/co-driver pace feature"),
        ("focus:formula_ford_lap_shape", "formula_ford_lap_shape", "analysis/formula-ford-lap-shape", "Formula Ford source-bounded lap-shape pass"),
        ("focus:non_lap_context_events", "non_lap_context_events", "analysis/context-event-narrative-layer", "Non-lap context layer: incidents, penalties, racecraft, weather, media/source narrative"),
        ("focus:career_dimension_qualifying_context", "career_dimension_qualifying_context", "analysis/career-dimension-context-layer", "Full-field result context, qualifying conversion, plus team/track/driver/car context dimensions"),
    ]
    focus_by_id = {row["auditId"]: row for row in matrix if row["auditId"].startswith("focus:")}
    backlog_empty = len(backlog) == 0
    decision_text = (
        "The backend analytics layer has no remaining generated utilization backlog rows. All major focus lanes are productized with validators and source-hash checked context packs."
        if backlog_empty
        else f"The backend analytics layer still has {len(backlog)} generated utilization backlog rows. Do not treat backend productization as complete until the backlog table is empty and focus rows are productized."
    )
    executed_lines = []
    phase_lines = []
    for index, (audit_id, opportunity, lane, label) in enumerate(focus_specs, start=1):
        status = focus_by_id.get(audit_id, {}).get("utilizationStatus", "missing")
        if status == PRODUCTIZED:
            executed_lines.append(f"- `{opportunity}`: productized under `{lane}` with validator-backed artifacts and source-hash checked context-pack coverage.")
            phase_lines.append(f"{index}. Completed: {label}.")
        else:
            executed_lines.append(f"- `{opportunity}`: not productized in this run (`{status}`); see `underused_data_opportunity_backlog.csv`.")
            phase_lines.append(f"{index}. Pending: {label}.")
    frontend_gate_text = (
        "Frontend visuals may proceed against generated context packs once all lane validators and autoreview pass. Raw CSVs remain analysis artifacts; UI should consume source-hash checked context packs/manifests and keep the unsupported-claim caveats visible."
        if backlog_empty
        else "Frontend visuals should not proceed as data-exhaustive while `underused_data_opportunity_backlog.csv` contains rows. Use the backlog and matrix to route remaining backend analytics work first."
    )
    return "\n".join(
        [
            "# BryceCast Data Utilization Audit",
            "",
            f"Generated: `{now_iso()}`",
            f"Canonical dataset hash: `{current_dataset_hash()}`",
            f"Canonical dataset updated: `{dataset.get('updatedAt')}`",
            f"Ingestion summary generated: `{ingestion.get('generatedAt')}`",
            f"Validation: `ok={validation.get('ok')}`, errors `{validation.get('errorCount')}`, warnings `{validation.get('warningCount')}`",
            "",
            "## Decision",
            "",
            decision_text,
            "",
            "## Canonical Collection Coverage",
            "",
            "| Collection | Rows | Utilization status | Value score | Signal |",
            "| --- | ---: | --- | ---: | --- |",
            *collection_lines,
            "",
            "## Highest-Value Underused Data",
            "",
            "| Priority | Opportunity | Series | Collection | Rows | Value | Recommended lane |",
            "| ---: | --- | --- | --- | ---: | ---: | --- |",
            *backlog_lines,
            "",
            "## Executed Data-Exhaustion Lanes",
            "",
            *executed_lines,
            "",
            "## Phase 2 Priority Order",
            "",
            *phase_lines,
            "",
            "## Frontend Gate",
            "",
            frontend_gate_text,
            "",
            "## Status Counts",
            "",
            "```json",
            json.dumps(dict(sorted(status_counts.items())), indent=2),
            "```",
            "",
        ]
    )


def main() -> int:
    dataset = load_json(DATASET_PATH)
    ingestion = load_json(INGESTION_SUMMARY_PATH)
    validation = load_json(VALIDATION_REPORT_PATH)
    _coverage = load_json(COVERAGE_MATRIX_PATH)
    idx = indexes(dataset)

    collection_rows = collection_inventory(dataset)
    grain_rows = series_grain_inventory(dataset, idx)
    matrix = utilization_matrix(dataset, idx)
    backlog = backlog_rows(matrix)

    collection_fields = [
        "collection",
        "rowCount",
        "primaryGrain",
        "metricFamilies",
        "currentAnalyticsArtifacts",
        "currentUiOrContextExposure",
        "utilizationStatus",
        "valueScore",
        "unusedOrUnderusedSignal",
        "proposedAnalysis",
        "confidence",
        "rationale",
        "sourceCaveat",
    ]
    grain_fields = [
        "seriesId",
        "seriesName",
        "seasonYear",
        "sessionType",
        "collection",
        "rowCount",
        "utilizationStatus",
        "metricFamily",
        "currentAnalyticsArtifacts",
        "currentUiOrContextExposure",
        "unusedOrUnderusedSignal",
        "sourceCaveat",
    ]
    matrix_fields = [
        "auditId",
        "seriesId",
        "seriesName",
        "seasonYear",
        "sessionType",
        "dataCollection",
        "metricFamily",
        "sourceFamily",
        "rowCount",
        "currentAnalyticsArtifacts",
        "currentUiOrContextExposure",
        "unusedOrUnderusedSignal",
        "proposedAnalysis",
        "valueScore",
        "confidence",
        "sourceCaveat",
        "utilizationStatus",
        "rationale",
    ]
    backlog_fields = [
        "opportunityId",
        "auditId",
        "priority",
        "seriesId",
        "seriesName",
        "dataCollection",
        "metricFamily",
        "rowCount",
        "valueScore",
        "recommendedLane",
        "proposedAnalysis",
        "sourceCaveat",
        "requiresIngestionApproval",
    ]

    write_csv(OUTPUT_DIR / "dataset_collection_inventory.csv", collection_rows, collection_fields)
    write_csv(OUTPUT_DIR / "series_grain_inventory.csv", grain_rows, grain_fields)
    write_csv(OUTPUT_DIR / "analytics_utilization_matrix.csv", matrix, matrix_fields)
    write_csv(OUTPUT_DIR / "underused_data_opportunity_backlog.csv", backlog, backlog_fields)
    write_text(OUTPUT_DIR / "DATA_UTILIZATION_AUDIT.md", report(dataset, matrix, backlog, ingestion, validation))

    print(
        json.dumps(
            {
                "ok": True,
                "collections": len(collection_rows),
                "seriesGrainRows": len(grain_rows),
                "matrixRows": len(matrix),
                "backlogRows": len(backlog),
                "output": rel(OUTPUT_DIR),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
