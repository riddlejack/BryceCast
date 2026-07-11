#!/usr/bin/env python3
"""Validate BryceCast predictive race-intelligence artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/predictive-race-intelligence"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
CHART_DIR = OUTPUT_DIR / "charts"
DATASET_PATH = ROOT / "data/career/career.dataset.json"
DEEP_TABLES = ROOT / "analysis/indy-nxt-discovery/output/deep_dive/tables"
CAREER_TABLES = ROOT / "analysis/career-parity/output/tables"
SECTION_RACE_ALLOWED_HOLDOUTS = {"session_indy_nxt_2024_6325"}
UPSTREAM_ANALYTICS_SCRIPTS = [
    ROOT / "analysis/indy-nxt-discovery/analyze_indy_nxt.py",
    ROOT / "analysis/indy-nxt-discovery/deep_indy_nxt_analytics.py",
    ROOT / "analysis/career-parity/career_parity_analytics.py",
]


def resolve_run_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    for path in [
        OUTPUT_DIR / "summary.json",
        PACK_DIR / "context-pack-manifest.json",
        OUTPUT_DIR / "analytics_inventory_registry.json",
    ]:
        if not path.exists():
            continue
        try:
            payload = json.loads(path.read_text())
            as_of_date = payload.get("asOfDate")
            if as_of_date:
                return date.fromisoformat(str(as_of_date))
        except (OSError, ValueError, TypeError):
            continue
    return date.today()


RUN_DATE = resolve_run_date()


def load_json(path: Path) -> Any:
    def reject_constant(value: str) -> None:
        raise ValueError(f"non-standard JSON constant {value}")

    try:
        return json.loads(path.read_text(), parse_constant=reject_constant)
    except ValueError as exc:
        fail(f"Invalid standards-compliant JSON in {path.relative_to(ROOT)}: {exc}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def source_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def current_dataset_hash() -> str:
    return source_hash(DATASET_PATH)


def dataset_indexes(data: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    return (
        {row["id"]: row for row in data.get("sessions", [])},
        {row["id"]: row for row in data.get("events", [])},
    )


def canonical_indy_bryce_race_sessions(data: dict[str, Any]) -> set[str]:
    sessions, events = dataset_indexes(data)
    out: set[str] = set()
    for result in data.get("results", []):
        if result.get("driverId") != "driver_bryce_aron":
            continue
        session = sessions.get(result.get("sessionId") or "")
        event = events.get((session or {}).get("eventId") or "")
        if session and event and session.get("sessionType") == "race" and event.get("seriesId") == "series_indy_nxt":
            out.add(result["sessionId"])
    return out


def canonical_future_indy_events(data: dict[str, Any]) -> set[str]:
    sessions, events = dataset_indexes(data)
    bryce_result_events = {
        sessions[result["sessionId"]]["eventId"]
        for result in data.get("results", [])
        if result.get("driverId") == "driver_bryce_aron"
        and result.get("sessionId") in sessions
        and sessions[result["sessionId"]].get("sessionType") == "race"
    }
    out: set[str] = set()
    for event in events.values():
        if event.get("seriesId") != "series_indy_nxt" or event["id"] in bryce_result_events:
            continue
        try:
            event_date = date.fromisoformat(str(event.get("eventStartDate") or "")[:10])
        except ValueError:
            continue
        if event_date >= RUN_DATE:
            out.add(event["id"])
    return out


def canonical_bryce_finished_race_sessions(data: dict[str, Any]) -> set[str]:
    sessions, _ = dataset_indexes(data)
    return {
        result["sessionId"]
        for result in data.get("results", [])
        if result.get("driverId") == "driver_bryce_aron"
        and result.get("sessionId") in sessions
        and sessions[result["sessionId"]].get("sessionType") == "race"
        and result.get("finishPosition") is not None
    }


def iso_date_prefix(value: Any) -> str | None:
    candidate = str(value or "").strip()[:10]
    try:
        date.fromisoformat(candidate)
        return candidate
    except ValueError:
        return None


def race_session_chronology(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    sessions, events = dataset_indexes(data)
    by_year: dict[int, list[dict[str, Any]]] = {}
    for session_id in canonical_indy_bryce_race_sessions(data):
        session = sessions.get(session_id) or {}
        event = events.get(session.get("eventId") or "") or {}
        event_start_date = iso_date_prefix(event.get("eventStartDate"))
        if not event_start_date:
            fail(f"{session_id} missing ISO eventStartDate in canonical dataset")
        session_start = session.get("actualStart") or session.get("scheduledStart") or event_start_date
        session_start_date = iso_date_prefix(session_start) or event_start_date
        try:
            season_year = int(event.get("seasonYear"))
        except (TypeError, ValueError):
            season_year = 0
        by_year.setdefault(season_year, []).append(
            {
                "sessionId": session_id,
                "seasonYear": season_year,
                "eventStartDate": event_start_date,
                "sessionStart": session_start,
                "sessionStartDate": session_start_date,
            }
        )

    by_session: dict[str, dict[str, Any]] = {}
    for _, rows in by_year.items():
        rows.sort(key=lambda row: (row["sessionStartDate"], str(row["sessionStart"] or ""), row["eventStartDate"], row["sessionId"]))
        for index, row in enumerate(rows, start=1):
            by_session[row["sessionId"]] = {**row, "roundIndex": index}
    return by_session


def csv_id_set(path: Path, field: str) -> set[str]:
    return {row[field] for row in read_csv(path) if row.get(field)}


def require_exact_ids(label: str, observed: set[str], expected: set[str]) -> None:
    if observed != expected:
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        fail(f"{label} upstream coverage mismatch: missing={missing[:8]} extra={extra[:8]}")


def validate_upstream_coverage_payload(payload: dict[str, Any], context: str, expected_check_count: int) -> None:
    if payload.get("datasetSourceHash") != current_dataset_hash():
        fail(f"{context} upstreamCoverage datasetSourceHash does not match canonical dataset")
    if payload.get("asOfDate") != RUN_DATE.isoformat():
        fail(f"{context} upstreamCoverage asOfDate must match recorded future-event boundary")
    checks = payload.get("checks")
    if not isinstance(checks, list) or len(checks) != expected_check_count:
        fail(f"{context} upstreamCoverage checks must contain {expected_check_count} reconciliations")
    refreshed = payload.get("refreshedBy")
    expected_scripts = {str(path.relative_to(ROOT)) for path in UPSTREAM_ANALYTICS_SCRIPTS}
    if not isinstance(refreshed, list):
        fail(f"{context} upstreamCoverage must record refreshedBy upstream scripts")
    observed_scripts = {ref.get("path") for ref in refreshed if isinstance(ref, dict)}
    if observed_scripts != expected_scripts:
        fail(f"{context} upstreamCoverage refreshedBy mismatch: expected={sorted(expected_scripts)} observed={sorted(observed_scripts)}")
    for index, ref in enumerate(refreshed):
        validate_source_ref(ref, f"{context} upstreamCoverage refreshedBy[{index}]")
    for ref in payload.get("sourceRefs", []):
        validate_source_ref(ref, f"{context} upstreamCoverage")


def validate_upstream_coverage() -> int:
    data = load_json(DATASET_PATH)
    indy_sessions = canonical_indy_bryce_race_sessions(data)
    future_events = canonical_future_indy_events(data)
    finished_race_sessions = canonical_bryce_finished_race_sessions(data)

    for label, path in [
        ("race_debrief_scores", DEEP_TABLES / "race_debrief_scores.csv"),
        ("full_field_lap_dynamics_by_race", DEEP_TABLES / "full_field_lap_dynamics_by_race.csv"),
        ("incident_penalty_context", DEEP_TABLES / "incident_penalty_context.csv"),
        ("team_context_by_race", DEEP_TABLES / "team_context_by_race.csv"),
        ("championship_progression", DEEP_TABLES / "championship_progression.csv"),
    ]:
        require_exact_ids(label, csv_id_set(path, "sessionId"), indy_sessions)
    require_exact_ids(
        "section_results_deep_by_race",
        csv_id_set(DEEP_TABLES / "section_results_deep_by_race.csv", "sessionId"),
        indy_sessions - SECTION_RACE_ALLOWED_HOLDOUTS,
    )
    require_exact_ids("future_weekend_prep_inputs", csv_id_set(DEEP_TABLES / "future_weekend_prep_inputs.csv", "eventId"), future_events)
    require_exact_ids("career_result_conversion", csv_id_set(CAREER_TABLES / "career_result_conversion.csv", "sessionId"), finished_race_sessions)
    return 8


def validate_source_ref(ref: dict[str, Any], context: str) -> None:
    source_path = ref.get("path")
    if not source_path:
        fail(f"{context} source ref missing path")
    if str(source_path).startswith("/api/"):
        return
    absolute = ROOT / source_path
    if not absolute.exists() or not absolute.is_file():
        fail(f"{context} source ref points to missing file: {source_path}")
    expected_bytes = ref.get("bytes")
    if expected_bytes != absolute.stat().st_size:
        fail(f"{context} source ref bytes stale for {source_path}")
    expected_hash = ref.get("sha256")
    if expected_hash != source_hash(absolute):
        fail(f"{context} source ref sha256 stale for {source_path}")


def validate_source_path(source_path: str, context: str) -> None:
    if source_path.startswith("/api/"):
        return
    if not (ROOT / source_path).exists():
        fail(f"{context} source path is missing: {source_path}")


def fail(message: str) -> None:
    raise AssertionError(message)


def require_file(path: Path) -> None:
    if not path.exists():
        fail(f"Missing required artifact: {path.relative_to(ROOT)}")
    if path.is_file() and path.stat().st_size == 0:
        fail(f"Empty required artifact: {path.relative_to(ROOT)}")


def validate_registry() -> None:
    path = OUTPUT_DIR / "analytics_inventory_registry.json"
    require_file(path)
    registry = load_json(path)
    if registry.get("sourceHash") != current_dataset_hash():
        fail("analytics_inventory_registry.json sourceHash does not match canonical dataset")
    if registry.get("asOfDate") != RUN_DATE.isoformat():
        fail("analytics_inventory_registry.json asOfDate must match recorded future-event boundary")
    items = registry.get("items")
    if not isinstance(items, list) or len(items) < 40:
        fail("analytics_inventory_registry.json must contain at least 40 inventoried items")
    ids = [item.get("id") for item in items]
    if len(ids) != len(set(ids)):
        fail("analytics inventory ids must be unique")
    statuses = {item.get("productizationStatus") for item in items}
    required = {"productized", "context_pack_ready", "analyst_only", "deferred", "blocked"}
    missing = required - statuses
    if missing:
        fail(f"analytics inventory missing status categories: {sorted(missing)}")
    for item in items:
        if not item.get("sourcePath"):
            fail(f"inventory item {item.get('id')} missing sourcePath")
        item_source = ROOT / item["sourcePath"]
        if not item_source.exists() or not item_source.is_file():
            fail(f"inventory item {item.get('id')} sourcePath is missing: {item.get('sourcePath')}")
        if item.get("bytes") != item_source.stat().st_size:
            fail(f"inventory item {item.get('id')} has stale bytes for {item.get('sourcePath')}")
        if item.get("sha256") != source_hash(item_source):
            fail(f"inventory item {item.get('id')} has stale sha256 for {item.get('sourcePath')}")
        if not item.get("recommendedAction"):
            fail(f"inventory item {item.get('id')} missing recommendedAction")


def validate_feature_matrices() -> None:
    data = load_json(DATASET_PATH)
    expected_indy_races = len(canonical_indy_bryce_race_sessions(data))
    career = read_csv(OUTPUT_DIR / "career_prior_matrix.csv")
    indy = read_csv(OUTPUT_DIR / "indy_nxt_feature_matrix.csv")
    expected_hash = current_dataset_hash()
    if len(career) < 25:
        fail("career_prior_matrix.csv must include broad career prior rows")
    if len(indy) != expected_indy_races:
        fail(f"indy_nxt_feature_matrix.csv must include {expected_indy_races} INDY NXT race rows")
    if "sourceHash" not in career[0] or any(row.get("sourceHash") != expected_hash for row in career):
        fail("career_prior_matrix.csv sourceHash does not match canonical dataset")
    if "sourceHash" not in indy[0] or any(row.get("sourceHash") != expected_hash for row in indy):
        fail("indy_nxt_feature_matrix.csv sourceHash does not match canonical dataset")
    required_indy = {
        "sessionId",
        "raceLabel",
        "trackType",
        "finishPercentile",
        "top10",
        "preRaceEligible",
        "postRaceOnlyFields",
        "sourceState",
    }
    missing = required_indy - set(indy[0])
    if missing:
        fail(f"indy_nxt_feature_matrix.csv missing fields: {sorted(missing)}")
    leakage_rows = [row for row in indy if row.get("postRaceOnlyFields")]
    if not leakage_rows:
        fail("feature matrix must label post-race-only leakage fields")
    unsafe_pre_race = [row.get("sessionId") for row in leakage_rows if str(row.get("preRaceEligible")).lower() == "true"]
    if unsafe_pre_race:
        fail(f"post-race feature rows cannot be preRaceEligible: {unsafe_pre_race[:8]}")


def validate_model_scorecard() -> None:
    path = OUTPUT_DIR / "model_scorecard.json"
    require_file(path)
    scorecard = load_json(path)
    if scorecard.get("sourceHash") != current_dataset_hash():
        fail("model_scorecard.json sourceHash does not match canonical dataset")
    models = scorecard.get("models")
    if not isinstance(models, list) or len(models) < 8:
        fail("model_scorecard.json must contain baseline and candidate models")
    model_ids = {m.get("id") for m in models}
    for required in {"overall_mean", "track_type_mean", "start_position_ridge"}:
        if required not in model_ids:
            fail(f"model scorecard missing {required}")
    for model in models:
        if model.get("target") == "finish_percentile" and model.get("mae") is None:
            fail(f"finish-percentile model {model.get('id')} missing mae")
        if not model.get("productUse"):
            fail(f"model {model.get('id')} missing productUse")
        if "season" in str(model.get("id")) and (model.get("allowedInContextPacks") is True or model.get("leakageStatus") != "time_leakage_control"):
            fail(f"{model.get('id')} must stay out of context packs because season-grouped LOO validation is not time-aware")
    disallowed_chart_ids = {
        model.get("id")
        for model in models
        if model.get("target") == "finish_percentile"
        and (model.get("allowedInContextPacks") is not True or model.get("leakageStatus") != "pre_race_safe")
    }
    model_chart = CHART_DIR / "finish_percentile_model_mae.svg"
    require_file(model_chart)
    chart_text = model_chart.read_text()
    leaked = sorted(model_id for model_id in disallowed_chart_ids if model_id and model_id in chart_text)
    if leaked:
        fail(f"model chart includes disallowed or leakage-control models: {leaked}")
    gates = scorecard.get("promotionGates")
    if not isinstance(gates, list) or len(gates) < 5:
        fail("model_scorecard.json must define promotion gates")


def validate_context_packs() -> None:
    expected_hash = current_dataset_hash()
    data = load_json(DATASET_PATH)
    expected_check_count = validate_upstream_coverage()
    manifest = load_json(PACK_DIR / "context-pack-manifest.json")
    if manifest.get("sourceHash") != expected_hash:
        fail("context-pack-manifest.json sourceHash does not match canonical dataset")
    if manifest.get("asOfDate") != RUN_DATE.isoformat():
        fail("context-pack-manifest.json asOfDate must match recorded future-event boundary")
    validate_upstream_coverage_payload(manifest.get("upstreamCoverage") or {}, "context-pack-manifest.json", expected_check_count)
    packs = manifest.get("packs")
    if not isinstance(packs, list):
        fail("context-pack-manifest.json packs must be a list")
    for ref in manifest.get("sourceRefs", []):
        validate_source_ref(ref, "context-pack manifest")
    by_type: dict[str, int] = {}
    parsed_packs: list[dict[str, Any]] = []
    expected_pack_paths: set[Path] = set()
    for pack in packs:
        for source_path in pack.get("sourceRefs", []):
            validate_source_path(source_path, f"context-pack manifest entry {pack.get('id')}")
        pack_path = ROOT / pack["path"]
        require_file(pack_path)
        expected_pack_paths.add(pack_path.resolve())
        if pack.get("bytes") != pack_path.stat().st_size:
            fail(f"context-pack manifest entry {pack.get('id')} has stale bytes for {pack.get('path')}")
        if pack.get("sha256") != source_hash(pack_path):
            fail(f"context-pack manifest entry {pack.get('id')} has stale sha256 for {pack.get('path')}")
        pack_obj = load_json(pack_path)
        if not isinstance(pack_obj, dict):
            fail(f"context pack {pack.get('id')} must be a JSON object")
        if pack_obj.get("sourceHash") != expected_hash:
            fail(f"context pack {pack.get('id')} sourceHash does not match canonical dataset")
        if pack_obj.get("type") == "upcoming_event" and pack_obj.get("asOfDate") != RUN_DATE.isoformat():
            fail(f"upcoming context pack {pack.get('id')} asOfDate must match recorded future-event boundary")
        for field in ["id", "type"]:
            if pack_obj.get(field) != pack.get(field):
                fail(f"context-pack manifest entry {pack.get('id')} has {field} mismatch with pack file")
        for field in ["eventId", "sessionId"]:
            if field in pack and str(pack_obj.get(field, "")) != str(pack.get(field, "")):
                fail(f"context-pack manifest entry {pack.get('id')} has {field} mismatch with pack file")
        for ref in pack_obj.get("sourceRefs", []):
            validate_source_ref(ref, f"context pack {pack_obj.get('id')}")
        pack_source_paths = {ref.get("path") for ref in pack_obj.get("sourceRefs", []) if isinstance(ref, dict)}
        file_backed_pack_source_paths = {source_path for source_path in pack_source_paths if source_path and not str(source_path).startswith("/api/")}
        manifest_source_paths = set(pack.get("sourceRefs", []))
        missing_manifest_sources = sorted(file_backed_pack_source_paths - manifest_source_paths)
        if missing_manifest_sources:
            fail(f"context-pack manifest entry {pack.get('id')} omits pack sourceRefs: {missing_manifest_sources}")
        for chart in pack_obj.get("chartSpecs", []):
            chart_source = chart.get("source")
            file_backed_source = isinstance(chart_source, str) and (
                chart_source.startswith("analysis/") or chart_source.endswith((".csv", ".json", ".svg"))
            )
            if file_backed_source and chart_source not in pack_source_paths:
                fail(f"context pack {pack_obj.get('id')} chartSpec {chart.get('id')} source is not covered by sourceRefs: {chart_source}")
        by_type[pack_obj.get("type", "")] = by_type.get(pack_obj.get("type", ""), 0) + 1
        parsed_packs.append(pack_obj)
    actual_pack_paths = {path.resolve() for path in PACK_DIR.rglob("*.json") if path.name != "context-pack-manifest.json"}
    if actual_pack_paths != expected_pack_paths:
        extra = sorted(str(path.relative_to(ROOT)) for path in actual_pack_paths - expected_pack_paths)
        missing = sorted(str(path.relative_to(ROOT)) for path in expected_pack_paths - actual_pack_paths)
        fail(f"context-pack filesystem set must match manifest; extra={extra} missing={missing}")
    expected = {
        "upcoming_event": len(canonical_future_indy_events(data)),
        "race_debrief": len(canonical_indy_bryce_race_sessions(data)),
        "career_lab": 1,
        "live_race_day": 1,
    }
    for pack_type, count in expected.items():
        if by_type.get(pack_type) != count:
            fail(f"context packs for {pack_type}: expected {count}, got {by_type.get(pack_type)}")
    require_exact_ids(
        "context-pack-manifest upcoming_event eventIds",
        {str(pack.get("eventId") or "") for pack in parsed_packs if pack.get("type") == "upcoming_event"},
        canonical_future_indy_events(data),
    )
    require_exact_ids(
        "context-pack-manifest race_debrief sessionIds",
        {str(pack.get("sessionId") or "") for pack in parsed_packs if pack.get("type") == "race_debrief"},
        canonical_indy_bryce_race_sessions(data),
    )

    race_debriefs = [pack for pack in parsed_packs if pack.get("type") == "race_debrief"]
    chronology = race_session_chronology(data)
    dataset_source = str(DATASET_PATH.relative_to(ROOT))
    for pack in race_debriefs:
        expected_chronology = chronology.get(str(pack.get("sessionId") or ""))
        if not expected_chronology:
            fail(f"race debrief pack {pack.get('id')} does not map to canonical chronology")
        if pack.get("eventStartDate") != expected_chronology["eventStartDate"]:
            fail(f"race debrief pack {pack.get('id')} must include canonical eventStartDate")
        race_order = pack.get("raceOrder")
        if not isinstance(race_order, dict) or not isinstance(race_order.get("roundIndex"), int) or not race_order.get("source"):
            fail(f"race debrief pack {pack.get('id')} must include source-backed raceOrder.roundIndex")
        if race_order.get("roundIndex") != expected_chronology["roundIndex"]:
            fail(
                f"race debrief pack {pack.get('id')} roundIndex must be chronological from canonical dataset: "
                f"expected {expected_chronology['roundIndex']}, got {race_order.get('roundIndex')}"
            )
        if race_order.get("source") != dataset_source:
            fail(f"race debrief pack {pack.get('id')} raceOrder.source must be canonical dataset")
        if dataset_source not in {ref.get("path") for ref in pack.get("sourceRefs", []) if isinstance(ref, dict)}:
            fail(f"race debrief pack {pack.get('id')} sourceRefs must include canonical dataset chronology source")

    upcoming = [pack for pack in parsed_packs if pack.get("type") == "upcoming_event"]
    expected_future_events = canonical_future_indy_events(data)
    if expected_future_events and not upcoming:
        fail("future INDY NXT events exist but no upcoming-event context packs were generated")
    for pack in upcoming:
        text = json.dumps(pack.get("top10Path", []))
        analog_text = json.dumps(pack.get("analogRaces", []))
        track = pack.get("track", {})
        track_type = track.get("type", "")
        if track_type != "road" and "road-course" in text:
            fail(f"upcoming pack {pack.get('id')} contains road-course copy for non-road track")
        required_fields = ["eventId", "eventName", "eventStartDate", "track", "sameTrackHistory", "trackTypeHistory", "top10Path", "predictionBand", "analogRaces", "sourceRefs", "chartSpecs"]
        for field in required_fields:
            if field not in pack:
                fail(f"upcoming pack {pack.get('id')} missing {field}")
        if pack.get("eventId") not in expected_future_events:
            fail(f"upcoming pack {pack.get('id')} eventId is not a future INDY NXT event as of {RUN_DATE.isoformat()}")
        if not isinstance(pack.get("track"), dict) or not pack["track"].get("name") or not pack["track"].get("type"):
            fail(f"upcoming pack {pack.get('id')} must carry track name/type")
        for field in ["top10Path", "analogRaces", "sourceRefs", "chartSpecs"]:
            if not isinstance(pack.get(field), list):
                fail(f"upcoming pack {pack.get('id')} field {field} must be a list")
        band = pack.get("predictionBand", {})
        if not isinstance(band, dict) or not isinstance(band.get("finishPercentileBand"), dict):
            fail(f"upcoming pack {pack.get('id')} must carry predictionBand.finishPercentileBand")
        if "weatherState" not in pack:
            fail(f"upcoming pack {pack.get('id')} must carry the source weatherState for UI package compatibility")
        if band.get("claimStrength") == "point_prediction":
            fail(f"upcoming pack {pack.get('id')} exposes unsupported point prediction")
        if band.get("claimStrength") == "calibrated_band":
            fail(f"upcoming pack {pack.get('id')} overstates historical priors as calibrated bands")
        if band.get("claimStrength") != "source_bounded_historical_prior_band":
            fail(f"upcoming pack {pack.get('id')} has unexpected predictionBand claimStrength")
        if band.get("calibrationState") != "not_calibrated_for_point_probability":
            fail(f"upcoming pack {pack.get('id')} must expose not-calibrated calibrationState")
        if pack.get("analogSelectionPolicy") != "pre_race_track_match_then_recency_no_outcome_sort":
            fail(f"upcoming pack {pack.get('id')} must use pre-race analog selection policy")
        forbidden_probability_fields = {"shrunkTop10Rate", "top10Probability", "top10Prob", "top10Prediction", "calibratedTop10Rate"}
        leaked_probability_fields = forbidden_probability_fields & set(band)
        if leaked_probability_fields:
            fail(f"upcoming pack {pack.get('id')} exposes uncalibrated top-10 probability fields: {sorted(leaked_probability_fields)}")
        forbidden_analog_fields = {"finishPosition", "positionGain", "finishPercentile", "archetype"}
        for analog in pack.get("analogRaces", []):
            leaked_fields = forbidden_analog_fields & set(analog)
            if leaked_fields:
                fail(f"upcoming pack {pack.get('id')} analogRaces leaks post-race fields: {sorted(leaked_fields)}")
        if any(field in analog_text for field in forbidden_analog_fields):
            fail(f"upcoming pack {pack.get('id')} analogRaces text contains post-race field names")

    career_packs = [pack for pack in parsed_packs if pack.get("type") == "career_lab"]
    if len(career_packs) != 1:
        fail("expected one Career Lab context pack")
    career_pack = career_packs[0]
    result_conversion = career_pack.get("resultConversion")
    expected_finished_races = len(canonical_bryce_finished_race_sessions(data))
    if not isinstance(result_conversion, list) or len(result_conversion) != expected_finished_races:
        fail(f"Career Lab pack must include all {expected_finished_races} result-conversion rows")
    required_conversion_fields = {"startPosition", "finishPosition", "finishPercentile", "seriesName"}
    if result_conversion:
        missing = required_conversion_fields - set(result_conversion[0])
        if missing:
            fail(f"Career Lab resultConversion rows missing fields: {sorted(missing)}")
    if career_pack.get("resultConversionRows") != len(result_conversion):
        fail("Career Lab resultConversionRows must match resultConversion length")


def validate_report_and_summary() -> None:
    require_file(OUTPUT_DIR / "PREDICTIVE_RACE_INTELLIGENCE_REPORT.md")
    data = load_json(DATASET_PATH)
    expected_indy_races = len(canonical_indy_bryce_race_sessions(data))
    expected_upcoming_events = len(canonical_future_indy_events(data))
    expected_check_count = validate_upstream_coverage()
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("sourceHash") != current_dataset_hash():
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("asOfDate") != RUN_DATE.isoformat():
        fail("summary.json asOfDate must match recorded future-event boundary")
    validate_upstream_coverage_payload(summary.get("upstreamCoverage") or {}, "summary.json", expected_check_count)
    if summary.get("indyNxtRaceRows") != expected_indy_races:
        fail(f"summary must report {expected_indy_races} INDY NXT race rows")
    if summary.get("upcomingEventPacks") != expected_upcoming_events:
        fail(f"summary must report {expected_upcoming_events} upcoming event packs")
    if summary.get("raceDebriefPacks") != expected_indy_races:
        fail(f"summary must report {expected_indy_races} race debrief packs")
    gates = summary.get("validationGates")
    if not isinstance(gates, list) or not all(g.get("status") in {"pass", "blocked_by_live_proof"} for g in gates):
        fail("summary validation gates must be explicit pass or blocked_by_live_proof states")


def main() -> int:
    try:
        validate_registry()
        validate_feature_matrices()
        validate_model_scorecard()
        validate_context_packs()
        validate_report_and_summary()
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
