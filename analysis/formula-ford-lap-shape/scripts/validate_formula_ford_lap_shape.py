#!/usr/bin/env python3
"""Validate Formula Ford lap-shape artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/formula-ford-lap-shape"
OUTPUT_DIR = LANE_DIR / "output"

BRYCE_ID = "driver_bryce_aron"
FORMULA_FORD_ID = "series_formula_ford"

REQUIRED_FILES = [
    "formula_ford_lap_observations.csv",
    "formula_ford_session_lap_shape.csv",
    "formula_ford_event_progression.csv",
    "formula_ford_condition_lap_shape.csv",
    "summary.json",
    "FORMULA_FORD_LAP_SHAPE.md",
    "context-packs/formula-ford-lap-shape-context.json",
]

LAP_FIELDS = {
    "sessionId",
    "eventId",
    "eventName",
    "sessionType",
    "sessionName",
    "trackName",
    "wetDry",
    "lapNumber",
    "lapTimeSeconds",
    "averageSpeedKph",
    "isValid",
    "deltaToSessionBestSeconds",
    "lapPctOfSession",
    "lapPhase",
    "outlierSlowLap",
    "sourceState",
    "sourceHash",
}

SESSION_FIELDS = {
    "sessionId",
    "eventId",
    "eventName",
    "sessionType",
    "sessionName",
    "trackName",
    "wetDry",
    "sourceLapRows",
    "validLapCount",
    "bestLapSeconds",
    "bestLapNumber",
    "medianValidLapSeconds",
    "medianDeltaToBestSeconds",
    "lapTimeStdDevSeconds",
    "firstToBestImprovementSeconds",
    "lateMedianDeltaToBestSeconds",
    "slowOutlierCount",
    "shapeArchetype",
    "sourceState",
    "sourceHash",
}


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


def parse_int(value: Any, artifact: str, field: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        fail(f"{artifact} has non-integer {field}: {value!r}")


def parse_float(value: Any, artifact: str, field: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        fail(f"{artifact} has non-numeric {field}: {value!r}")


def require_fields(rows: list[dict[str, str]], fields: set[str], artifact: str) -> None:
    if not rows:
        fail(f"{artifact} is empty")
    missing = fields - set(rows[0])
    if missing:
        fail(f"{artifact} missing fields: {sorted(missing)}")


def expected_counts(dataset: dict[str, Any]) -> dict[str, Any]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    formula_sessions = {
        session["id"]
        for session in dataset["sessions"]
        if events.get(session.get("eventId"), {}).get("seriesId") == FORMULA_FORD_ID
    }
    lap_rows = [
        row
        for row in dataset["lapSamples"]
        if row.get("sessionId") in formula_sessions and row.get("driverId") == BRYCE_ID
    ]
    result_sessions = {
        row.get("sessionId")
        for row in dataset["results"]
        if row.get("driverId") == BRYCE_ID and row.get("sessionId") in formula_sessions
    }
    return {
        "lapRows": len(lap_rows),
        "lapSessions": {row.get("sessionId") for row in lap_rows},
        "lapSessionCount": len({row.get("sessionId") for row in lap_rows}),
        "eventCount": len({sessions[row.get("sessionId")].get("eventId") for row in lap_rows}),
        "bryceResultSessions": len(result_sessions),
    }


def validate_laps(expected_hash: str, counts: dict[str, Any]) -> None:
    rows = read_csv(OUTPUT_DIR / "formula_ford_lap_observations.csv")
    require_fields(rows, LAP_FIELDS, "formula_ford_lap_observations.csv")
    if len(rows) != counts["lapRows"]:
        fail(f"formula_ford_lap_observations row count mismatch: expected {counts['lapRows']}, got {len(rows)}")
    if {row["sessionId"] for row in rows} != counts["lapSessions"]:
        fail("formula_ford_lap_observations session coverage mismatch")
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("formula_ford_lap_observations sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_lap_analysis_bryce_labeled_block":
            fail(f"unexpected Formula Ford lap sourceState {row['sourceState']!r}")
        if row["isValid"] not in {"yes", "no"} or row["outlierSlowLap"] not in {"yes", "no"}:
            fail("boolean lap fields must use yes/no")
        lap_time = parse_float(row["lapTimeSeconds"], "formula_ford_lap_observations.csv", "lapTimeSeconds")
        if row["isValid"] == "yes" and (lap_time is None or lap_time <= 0):
            fail("valid Formula Ford lap row missing positive lapTimeSeconds")
        pct = parse_float(row["lapPctOfSession"], "formula_ford_lap_observations.csv", "lapPctOfSession")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"lapPctOfSession out of range: {pct}")


def validate_sessions(expected_hash: str, counts: dict[str, Any]) -> None:
    sessions = read_csv(OUTPUT_DIR / "formula_ford_session_lap_shape.csv")
    require_fields(sessions, SESSION_FIELDS, "formula_ford_session_lap_shape.csv")
    if len(sessions) != counts["lapSessionCount"]:
        fail("formula_ford_session_lap_shape row count mismatch")
    archetypes = {row["shapeArchetype"] for row in sessions}
    if len(archetypes) < 3:
        fail("formula_ford_session_lap_shape should classify varied lap-shape archetypes")
    for row in sessions:
        if row["sourceHash"] != expected_hash:
            fail("formula_ford_session_lap_shape sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_lap_analysis_bryce_only_session_shape":
            fail(f"unexpected session sourceState {row['sourceState']!r}")
        valid_count = parse_int(row["validLapCount"], "formula_ford_session_lap_shape.csv", "validLapCount") or 0
        source_rows = parse_int(row["sourceLapRows"], "formula_ford_session_lap_shape.csv", "sourceLapRows") or 0
        if source_rows < valid_count:
            fail("session sourceLapRows cannot be below validLapCount")
        if valid_count >= 3 and not row.get("bestLapSeconds"):
            fail("session with >=3 valid laps must have bestLapSeconds")

    events = read_csv(OUTPUT_DIR / "formula_ford_event_progression.csv")
    if len(events) != counts["eventCount"]:
        fail("formula_ford_event_progression row count mismatch")
    for row in events:
        if row["sourceHash"] != expected_hash:
            fail("formula_ford_event_progression sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_lap_analysis_bryce_only_event_progression":
            fail(f"unexpected event sourceState {row['sourceState']!r}")

    conditions = read_csv(OUTPUT_DIR / "formula_ford_condition_lap_shape.csv")
    if len(conditions) < 5:
        fail("formula_ford_condition_lap_shape should include weather/session groups")
    for row in conditions:
        if row["sourceHash"] != expected_hash:
            fail("formula_ford_condition_lap_shape sourceHash does not match canonical dataset")
        session_count = parse_int(row.get("sessionCount"), "formula_ford_condition_lap_shape.csv", "sessionCount") or 0
        if session_count < 1:
            fail("condition rows need at least one session")


def validate_context(expected_hash: str, counts: dict[str, Any]) -> None:
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") != "source_bounded_bryce_only_lap_shape":
        fail("summary.json claimStrength mismatch")
    if summary.get("fieldRelativePaceAvailable") is not False or summary.get("publicPointPrediction") is not False:
        fail("summary.json must forbid field-relative and point-prediction claims")
    if summary.get("counts", {}).get("lapObservations") != counts["lapRows"]:
        fail("summary.json lapObservations count mismatch")

    pack = load_json(OUTPUT_DIR / "context-packs/formula-ford-lap-shape-context.json")
    if pack.get("sourceHash") != expected_hash:
        fail("context pack sourceHash does not match canonical dataset")
    if pack.get("claimStrength") != "source_bounded_bryce_only_lap_shape":
        fail("context pack claimStrength mismatch")
    text = json.dumps(pack).lower()
    forbidden = ["field rank", "field-relative", "full-field", "win probability", "predicted finish", "expected finish"]
    hits = [phrase for phrase in forbidden if phrase in text]
    if hits:
        fail(f"context pack contains unsupported claim text: {hits}")
    if "continuation" not in text or "bryce-only" not in text:
        fail("context pack must expose Formula Ford source-shape caveats")

    report = OUTPUT_DIR / "FORMULA_FORD_LAP_SHAPE.md"
    require_file(report)
    report_text = report.read_text()
    if expected_hash not in report_text:
        fail("report missing current source hash")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Session Lap Shape",
        "Event Progression",
        "Condition Context",
        "Caveats",
    ]:
        if phrase not in report_text:
            fail(f"report missing section: {phrase}")
    if "median s" in report_text or "delta s" in report_text:
        fail("report contains unformatted missing second values")
    if re.search(r"\b(field rank|field-relative|full-field)\b", report_text.lower()):
        fail("report contains unsupported field-relative language")


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        expected_hash = dataset_hash()
        counts = expected_counts(dataset)
        validate_laps(expected_hash, counts)
        validate_sessions(expected_hash, counts)
        validate_context(expected_hash, counts)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
