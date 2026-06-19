#!/usr/bin/env python3
"""Validate BryceCast data-utilization audit artifacts."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/data-utilization-audit"
OUTPUT_DIR = LANE_DIR / "output"

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

ALLOWED_STATUSES = {
    "deeply_analyzed",
    "productized_context_pack",
    "partially_analyzed_more_value_remaining",
    "inventoried_only",
    "not_worth_analyzing_with_rationale",
    "blocked_by_source_shape",
    "requires_ingestion_approval",
}

ZERO_ROW_ONLY_NOT_WORTH = {"broadcastRoutes", "notificationEvents", "notificationRules"}

FOCUS_VALIDATORS = {
    "focus:indy_nxt_practice_qualifying_section_lap": "analysis/indy-nxt-section-lap-deep-dive/scripts/validate_indy_nxt_section_lap_deep_dive.py",
    "focus:indy_nxt_race_lap_section_enhancement": "analysis/indy-nxt-race-lap-section-enhancement/scripts/validate_indy_nxt_race_lap_section_enhancement.py",
    "focus:imsa_daytona_stint_class_pace": "analysis/imsa-daytona-stint-class-pace/scripts/validate_imsa_daytona_stint_class_pace.py",
    "focus:formula_ford_lap_shape": "analysis/formula-ford-lap-shape/scripts/validate_formula_ford_lap_shape.py",
    "focus:non_lap_context_events": "analysis/context-event-narrative-layer/scripts/validate_context_event_narrative_layer.py",
    "focus:career_dimension_qualifying_context": "analysis/career-dimension-context-layer/scripts/validate_career_dimension_context_layer.py",
}

ARTIFACT_DIR_EXPECTED_JSON_COUNTS = {
    "race_debrief_pack_dir": 36,
    "upcoming_pack_dir": 9,
}


def load_builder_contract() -> Any:
    path = LANE_DIR / "scripts/build_data_utilization_audit.py"
    spec = importlib.util.spec_from_file_location("build_data_utilization_audit_contract", path)
    if spec is None or spec.loader is None:
        fail("unable to load data-utilization audit builder contract")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def missing_declared_artifacts(builder: Any, keys: list[str]) -> list[str]:
    missing = []
    for key in keys:
        if hasattr(builder, "artifact_key_complete"):
            if not builder.artifact_key_complete(key):
                missing.append(key)
        else:
            relative = builder.ARTIFACTS.get(key)
            path = ROOT / relative if relative else None
            if not path or not path.exists():
                missing.append(key)
                continue
            if path.is_dir():
                json_count = len(list(path.glob("*.json")))
                expected = ARTIFACT_DIR_EXPECTED_JSON_COUNTS.get(key)
                if (expected is not None and json_count != expected) or (expected is None and json_count == 0):
                    missing.append(key)
    return missing


def validate_focus_lane_outputs(audit_id: str) -> None:
    relative = FOCUS_VALIDATORS.get(audit_id)
    if not relative:
        return
    result = subprocess.run([sys.executable, str(ROOT / relative)], cwd=ROOT, text=True, capture_output=True)
    if result.returncode != 0:
        output = (result.stdout + "\n" + result.stderr).strip()
        fail(f"productized focus row validator failed for {audit_id}: {output[:1200]}")


def fail(message: str) -> None:
    raise AssertionError(message)


def require_file(path: Path) -> None:
    if not path.exists():
        fail(f"Missing required artifact: {path.relative_to(ROOT)}")
    if path.is_file() and path.stat().st_size == 0:
        fail(f"Empty required artifact: {path.relative_to(ROOT)}")


def read_csv(path: Path) -> list[dict[str, str]]:
    require_file(path)
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def load_json(path: Path) -> Any:
    require_file(path)
    with path.open() as f:
        return json.load(f)


def dataset_hash() -> str:
    h = hashlib.sha256()
    with (ROOT / "data/career/career.dataset.json").open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def split_artifacts(value: str) -> list[Path]:
    return [ROOT / part for part in value.split(";") if part]


def validate_collection_inventory(dataset: dict[str, Any]) -> None:
    builder = load_builder_contract()
    rows = read_csv(OUTPUT_DIR / "dataset_collection_inventory.csv")
    by_collection = {row.get("collection"): row for row in rows}
    dataset_collections = {key for key, value in dataset.items() if isinstance(value, list)}
    required = set(REQUIRED_COLLECTIONS) | dataset_collections
    missing_policy = sorted(dataset_collections - set(REQUIRED_COLLECTIONS))
    if missing_policy:
        fail(f"validator REQUIRED_COLLECTIONS missing top-level dataset collections: {missing_policy}")
    missing = [name for name in sorted(required) if name not in by_collection]
    if missing:
        fail(f"collection inventory missing canonical collections: {missing}")
    for name in sorted(required):
        row = by_collection[name]
        expected_count = len(dataset.get(name, []))
        try:
            observed_count = int(row.get("rowCount") or "-1")
        except ValueError:
            fail(f"collection {name} has non-integer rowCount")
        if observed_count != expected_count:
            fail(f"collection {name} rowCount mismatch: expected {expected_count}, got {observed_count}")
        status = row.get("utilizationStatus")
        if status not in ALLOWED_STATUSES:
            fail(f"collection {name} has invalid utilizationStatus {status!r}")
        if expected_count > 0 and not status:
            fail(f"collection {name} has rows but no utilizationStatus")
        if name in ZERO_ROW_ONLY_NOT_WORTH and expected_count > 0 and status == "not_worth_analyzing_with_rationale":
            fail(f"collection {name} has rows and cannot remain not_worth_analyzing_with_rationale")
        if status in {"productized_context_pack", "deeply_analyzed"}:
            policy = builder.COLLECTION_POLICY.get(name, {})
            missing_artifacts = missing_declared_artifacts(builder, policy.get("artifacts", []))
            if missing_artifacts:
                fail(f"productized collection {name} missing declared artifacts: {missing_artifacts}")
        if status in {"not_worth_analyzing_with_rationale", "blocked_by_source_shape", "requires_ingestion_approval"} and not row.get("rationale"):
            fail(f"collection {name} status {status} requires a rationale")


def validate_series_grain_inventory() -> None:
    builder = load_builder_contract()
    dataset = load_json(ROOT / "data/career/career.dataset.json")
    rows = read_csv(OUTPUT_DIR / "series_grain_inventory.csv")
    if not rows:
        fail("series_grain_inventory.csv is empty")
    required_fields = {
        "seriesId",
        "seriesName",
        "seasonYear",
        "sessionType",
        "collection",
        "rowCount",
        "utilizationStatus",
        "currentAnalyticsArtifacts",
        "unusedOrUnderusedSignal",
    }
    missing = required_fields - set(rows[0])
    if missing:
        fail(f"series_grain_inventory.csv missing fields: {sorted(missing)}")
    statuses = {row.get("utilizationStatus") for row in rows}
    invalid = statuses - ALLOWED_STATUSES
    if invalid:
        fail(f"series_grain_inventory.csv has invalid statuses: {sorted(invalid)}")
    expected_rows = builder.series_grain_inventory(dataset, builder.indexes(dataset))
    key_fields = ("seriesId", "seasonYear", "sessionType", "collection")
    observed_by_key = {tuple(row.get(field, "") for field in key_fields): row for row in rows}
    expected_by_key = {tuple(str(row.get(field, "")) for field in key_fields): row for row in expected_rows}
    if set(observed_by_key) != set(expected_by_key):
        missing = sorted(set(expected_by_key) - set(observed_by_key))[:20]
        extra = sorted(set(observed_by_key) - set(expected_by_key))[:20]
        fail(f"series_grain_inventory.csv key set mismatch: missing={missing} extra={extra}")
    for key, expected in expected_by_key.items():
        try:
            observed_count = int(observed_by_key[key].get("rowCount") or "-1")
        except ValueError:
            fail(f"series_grain_inventory.csv has non-integer rowCount for {key}")
        if observed_count != expected["rowCount"]:
            fail(f"series_grain_inventory.csv rowCount mismatch for {key}: expected {expected['rowCount']}, got {observed_count}")


def validate_utilization_matrix_and_backlog() -> None:
    builder = load_builder_contract()
    rows = read_csv(OUTPUT_DIR / "analytics_utilization_matrix.csv")
    backlog = read_csv(OUTPUT_DIR / "underused_data_opportunity_backlog.csv")
    current_source_hash = dataset_hash()
    if not rows:
        fail("analytics_utilization_matrix.csv is empty")
    required_fields = {
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
    }
    missing = required_fields - set(rows[0])
    if missing:
        fail(f"analytics_utilization_matrix.csv missing fields: {sorted(missing)}")
    invalid = {row.get("utilizationStatus") for row in rows} - ALLOWED_STATUSES
    if invalid:
        fail(f"analytics_utilization_matrix.csv has invalid statuses: {sorted(invalid)}")
    collections = {row.get("dataCollection") for row in rows}
    dataset = load_json(ROOT / "data/career/career.dataset.json")
    dataset_collections = {key for key, value in dataset.items() if isinstance(value, list)}
    missing_collections = (set(REQUIRED_COLLECTIONS) | dataset_collections) - collections
    if missing_collections:
        fail(f"analytics_utilization_matrix.csv missing collections: {sorted(missing_collections)}")
    expected_rows = builder.utilization_matrix(dataset, builder.indexes(dataset))
    expected_by_audit_id = {row.get("auditId"): row for row in expected_rows}
    observed_by_audit_id = {row.get("auditId"): row for row in rows}
    if len(observed_by_audit_id) != len(rows):
        fail("analytics_utilization_matrix.csv has duplicate auditId rows")
    if set(observed_by_audit_id) != set(expected_by_audit_id):
        missing = sorted(set(expected_by_audit_id) - set(observed_by_audit_id))[:20]
        extra = sorted(set(observed_by_audit_id) - set(expected_by_audit_id))[:20]
        fail(f"analytics_utilization_matrix.csv auditId set mismatch: missing={missing} extra={extra}")
    reconciled_fields = [
        "seriesId",
        "seriesName",
        "seasonYear",
        "sessionType",
        "dataCollection",
        "metricFamily",
        "sourceFamily",
        "currentAnalyticsArtifacts",
        "currentUiOrContextExposure",
        "unusedOrUnderusedSignal",
        "proposedAnalysis",
        "confidence",
        "sourceCaveat",
        "utilizationStatus",
        "rationale",
    ]
    for audit_id, expected in expected_by_audit_id.items():
        observed = observed_by_audit_id[audit_id]
        try:
            observed_count = int(observed.get("rowCount") or "-1")
        except ValueError:
            fail(f"analytics_utilization_matrix.csv has non-integer rowCount for {audit_id}")
        if observed_count != expected["rowCount"]:
            fail(f"analytics_utilization_matrix.csv rowCount mismatch for {audit_id}: expected {expected['rowCount']}, got {observed_count}")
        if str(observed.get("valueScore")) != str(expected["valueScore"]):
            fail(f"analytics_utilization_matrix.csv valueScore mismatch for {audit_id}")
        for field in reconciled_fields:
            if str(observed.get(field, "")) != str(expected.get(field, "")):
                fail(f"analytics_utilization_matrix.csv {field} mismatch for {audit_id}")
    backlog_ids = {row.get("auditId") for row in backlog}
    for row in rows:
        if row.get("utilizationStatus") in {"partially_analyzed_more_value_remaining", "inventoried_only"} and row.get("auditId") not in backlog_ids:
            fail(f"underused matrix row missing backlog entry: {row.get('auditId')}")
    focus_opportunities = {
        "focus:indy_nxt_practice_qualifying_section_lap": "indy_nxt_practice_qualifying_section_lap",
        "focus:indy_nxt_race_lap_section_enhancement": "indy_nxt_race_lap_section_enhancement",
        "focus:imsa_daytona_stint_class_pace": "imsa_daytona_stint_class_pace",
        "focus:formula_ford_lap_shape": "formula_ford_lap_shape",
        "focus:non_lap_context_events": "non_lap_context_events",
        "focus:career_dimension_qualifying_context": "career_dimension_qualifying_context",
    }
    by_audit_id = {row.get("auditId"): row for row in rows}
    by_opportunity_id = {row.get("opportunityId"): row for row in backlog}
    for audit_id, opportunity_id in focus_opportunities.items():
        row = by_audit_id.get(audit_id)
        if not row:
            fail(f"analytics_utilization_matrix.csv missing focus row {audit_id}")
        if row.get("utilizationStatus") == "partially_analyzed_more_value_remaining":
            if opportunity_id not in by_opportunity_id:
                fail(f"underused backlog missing focus opportunity {opportunity_id}")
        elif row.get("utilizationStatus") in {"productized_context_pack", "deeply_analyzed"}:
            if not row.get("currentAnalyticsArtifacts"):
                fail(f"productized focus row lacks artifacts: {audit_id}")
            missing_artifacts = missing_declared_artifacts(builder, builder.FOCUS_ARTIFACT_KEYS.get(audit_id, []))
            if missing_artifacts:
                fail(f"productized focus row missing declared artifacts: {audit_id} {missing_artifacts}")
            validate_focus_lane_outputs(audit_id)
            if opportunity_id in by_opportunity_id:
                fail(f"productized focus row still appears in underused backlog: {opportunity_id}")
            if audit_id in {
                "focus:indy_nxt_practice_qualifying_section_lap",
                "focus:indy_nxt_race_lap_section_enhancement",
                "focus:imsa_daytona_stint_class_pace",
                "focus:formula_ford_lap_shape",
                "focus:non_lap_context_events",
                "focus:career_dimension_qualifying_context",
            }:
                hash_checked = 0
                for path in split_artifacts(row.get("currentAnalyticsArtifacts", "")):
                    if path.suffix != ".json":
                        continue
                    require_file(path)
                    payload = load_json(path)
                    if payload.get("sourceHash") != current_source_hash:
                        fail(f"stale sourceHash in {path.relative_to(ROOT)}")
                    hash_checked += 1
                if hash_checked < 2:
                    fail(f"productized focus row must include source-hash checked context JSON artifacts: {audit_id}")
        else:
            if not row.get("rationale"):
                fail(f"non-partial focus row lacks rationale: {audit_id}")


def validate_report() -> None:
    require_file(OUTPUT_DIR / "DATA_UTILIZATION_AUDIT.md")
    text = (OUTPUT_DIR / "DATA_UTILIZATION_AUDIT.md").read_text()
    current_source_hash = dataset_hash()
    if current_source_hash not in text:
        fail("DATA_UTILIZATION_AUDIT.md missing current canonical dataset hash")
    for phrase in [
        "Canonical Collection Coverage",
        "Highest-Value Underused Data",
        "Phase 2 Priority Order",
        "Frontend Gate",
    ]:
        if phrase not in text:
            fail(f"DATA_UTILIZATION_AUDIT.md missing section: {phrase}")
    backlog = read_csv(OUTPUT_DIR / "underused_data_opportunity_backlog.csv")
    if backlog:
        if "still has" not in text or "should not proceed" not in text:
            fail("DATA_UTILIZATION_AUDIT.md must state that frontend visuals are blocked when backlog rows exist")
    elif "no remaining generated utilization backlog rows" not in text:
        fail("DATA_UTILIZATION_AUDIT.md must state zero backlog when backlog table is empty")


def main() -> int:
    try:
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        validate_collection_inventory(dataset)
        validate_series_grain_inventory()
        validate_utilization_matrix_and_backlog()
        validate_report()
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
