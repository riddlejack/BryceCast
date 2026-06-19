#!/usr/bin/env python3
"""Validate career dimension context layer artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/career-dimension-context-layer"
OUTPUT_DIR = LANE_DIR / "output"

REQUIRED_FILES = [
    "result_context.csv",
    "qualifying_result_context.csv",
    "qualifying_session_conversion_summary.csv",
    "team_dimension_context.csv",
    "team_era_context.csv",
    "track_venue_context.csv",
    "track_archetype_analog_context.csv",
    "driver_cohort_context.csv",
    "car_entrant_context.csv",
    "summary.json",
    "CAREER_DIMENSION_CONTEXT_LAYER.md",
    "context-packs/career-dimension-context.json",
]

QUALIFYING_FIELDS = {
    "qualifyingId",
    "sessionId",
    "eventId",
    "seriesId",
    "seasonYear",
    "driverId",
    "teamId",
    "carId",
    "trackId",
    "position",
    "fieldSize",
    "qualifyingPercentile",
    "linkedRaceResultCount",
    "bestRaceFinishPosition",
    "qualifyToBestRaceFinishDelta",
    "conversionSourceState",
    "sourceHash",
}


RESULT_FIELDS = {
    "resultId",
    "sessionId",
    "eventId",
    "seriesId",
    "seasonYear",
    "driverId",
    "teamId",
    "carId",
    "trackId",
    "startPosition",
    "finishPosition",
    "classifiedPosition",
    "finishPercentile",
    "finishPercentileSourceState",
    "fieldSize",
    "startToFinishDelta",
    "status",
    "penaltyRefCount",
    "incidentRefCount",
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


def build_indexes(dataset: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "events": {row["id"]: row for row in dataset.get("events", [])},
        "sessions": {row["id"]: row for row in dataset.get("sessions", [])},
    }


def session_context(idx: dict[str, dict[str, dict[str, Any]]], session_id: str | None) -> dict[str, Any]:
    session = idx["sessions"].get(session_id or "", {})
    event = idx["events"].get(session.get("eventId") or "", {})
    return {
        "seriesId": event.get("seriesId") or "",
        "seasonYear": event.get("seasonYear") or "",
    }


def expected_team_era_rows(dataset: dict[str, Any], idx: dict[str, dict[str, dict[str, Any]]]) -> int:
    keys = set()
    for car in dataset.get("cars", []):
        team_id = car.get("teamId") or ""
        if team_id:
            keys.add((team_id, car.get("seriesId") or "", str(car.get("seasonYear") or "")))
    for collection in [dataset.get("qualifyingResults", []), dataset.get("results", [])]:
        for row in collection:
            team_id = row.get("teamId") or ""
            if not team_id:
                continue
            ctx = session_context(idx, row.get("sessionId"))
            keys.add((team_id, ctx["seriesId"], str(ctx["seasonYear"])))
    return len(keys)


def expected_track_analog_rows(dataset: dict[str, Any]) -> int:
    track_count = len(dataset.get("tracks", []))
    if track_count <= 1:
        return 0
    return track_count * min(5, track_count - 1)


def expected_counts(dataset: dict[str, Any]) -> dict[str, int]:
    idx = build_indexes(dataset)
    return {
        "resultRows": len(dataset.get("results", [])),
        "resultIds": sorted(str(row.get("id") or "") for row in dataset.get("results", [])),
        "qualifyingRows": len(dataset.get("qualifyingResults", [])),
        "qualifyingIds": sorted(str(row.get("id") or "") for row in dataset.get("qualifyingResults", [])),
        "teamRows": len(dataset.get("teams", [])),
        "trackRows": len(dataset.get("tracks", [])),
        "driverRows": len(dataset.get("drivers", [])),
        "carRows": len(dataset.get("cars", [])),
        "qualifyingSessionRows": len({row.get("sessionId") or "" for row in dataset.get("qualifyingResults", [])}),
        "teamEraRows": expected_team_era_rows(dataset, idx),
        "trackAnalogRows": expected_track_analog_rows(dataset),
    }


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


def validate_hash(rows: list[dict[str, str]], expected_hash: str, artifact: str) -> None:
    if not rows:
        fail(f"{artifact} is empty")
    if "sourceHash" not in rows[0]:
        fail(f"{artifact} missing sourceHash")
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail(f"{artifact} sourceHash does not match canonical dataset")


def validate_csv_artifacts(expected_hash: str, counts: dict[str, int]) -> None:
    results = read_csv(OUTPUT_DIR / "result_context.csv")
    if len(results) != counts["resultRows"]:
        fail(f"result_context row count mismatch: expected {counts['resultRows']}, got {len(results)}")
    missing_result_fields = RESULT_FIELDS - set(results[0])
    if missing_result_fields:
        fail(f"result_context missing fields: {sorted(missing_result_fields)}")
    observed_result_ids = sorted(row.get("resultId") or "" for row in results)
    if observed_result_ids != counts["resultIds"]:
        fail("result_context resultId coverage does not match canonical results")
    validate_hash(results, expected_hash, "result_context.csv")
    if not any(row.get("driverId") == "driver_bryce_aron" for row in results):
        fail("result_context lacks Bryce result rows")
    for row in results:
        parse_int(row.get("fieldSize"), "result_context.csv", "fieldSize")
        percentile = parse_float(row.get("finishPercentile"), "result_context.csv", "finishPercentile")
        percentile_state = row.get("finishPercentileSourceState")
        if percentile is None:
            if percentile_state != "missing_finish_percentile":
                fail("missing finishPercentile must be labeled missing_finish_percentile")
        elif 0 <= percentile <= 1:
            if percentile_state != "finish_percentile_bounded_0_1":
                fail("bounded finishPercentile must be labeled finish_percentile_bounded_0_1")
        elif percentile_state != "finish_percentile_source_value_out_of_range":
            fail("out-of-range finishPercentile must be labeled finish_percentile_source_value_out_of_range")

    qualifying = read_csv(OUTPUT_DIR / "qualifying_result_context.csv")
    if len(qualifying) != counts["qualifyingRows"]:
        fail(f"qualifying_result_context row count mismatch: expected {counts['qualifyingRows']}, got {len(qualifying)}")
    missing = QUALIFYING_FIELDS - set(qualifying[0])
    if missing:
        fail(f"qualifying_result_context missing fields: {sorted(missing)}")
    observed_qualifying_ids = sorted(row.get("qualifyingId") or "" for row in qualifying)
    if observed_qualifying_ids != counts["qualifyingIds"]:
        fail("qualifying_result_context qualifyingId coverage does not match canonical qualifyingResults")
    validate_hash(qualifying, expected_hash, "qualifying_result_context.csv")
    conversion_states = {row["conversionSourceState"] for row in qualifying}
    if "same_event_driver_race_result_one_to_one" not in conversion_states:
        fail("qualifying_result_context lacks one-to-one same-event race conversion joins")
    if "same_event_multi_race_result_ambiguous" not in conversion_states:
        fail("qualifying_result_context lacks ambiguous multi-race conversion rows")
    for row in qualifying:
        parse_int(row.get("position"), "qualifying_result_context.csv", "position")
        parse_int(row.get("fieldSize"), "qualifying_result_context.csv", "fieldSize")
        percentile = parse_float(row.get("qualifyingPercentile"), "qualifying_result_context.csv", "qualifyingPercentile")
        if percentile is not None and not 0 <= percentile <= 1:
            fail("qualifyingPercentile must be between 0 and 1")

    expected_rows = {
        "team_dimension_context.csv": counts["teamRows"],
        "track_venue_context.csv": counts["trackRows"],
        "driver_cohort_context.csv": counts["driverRows"],
        "car_entrant_context.csv": counts["carRows"],
        "qualifying_session_conversion_summary.csv": counts["qualifyingSessionRows"],
        "team_era_context.csv": counts["teamEraRows"],
        "track_archetype_analog_context.csv": counts["trackAnalogRows"],
    }
    for artifact, expected in expected_rows.items():
        rows = read_csv(OUTPUT_DIR / artifact)
        if len(rows) != expected:
            fail(f"{artifact} row count mismatch: expected {expected}, got {len(rows)}")
        validate_hash(rows, expected_hash, artifact)
        if artifact == "qualifying_session_conversion_summary.csv":
            if "ambiguousSameEventRaceJoinRows" not in rows[0]:
                fail("qualifying_session_conversion_summary.csv missing ambiguousSameEventRaceJoinRows")
            for row in rows:
                parse_int(row.get("sameEventRaceJoinRows"), artifact, "sameEventRaceJoinRows")
                parse_int(row.get("ambiguousSameEventRaceJoinRows"), artifact, "ambiguousSameEventRaceJoinRows")

    analogs = read_csv(OUTPUT_DIR / "track_archetype_analog_context.csv")
    if not any(row.get("targetTrackId") == "track_road_america" for row in analogs):
        fail("track_archetype_analog_context.csv missing Road America analog rows")
    expected_per_track = min(5, max(counts["trackRows"] - 1, 0))
    per_target: dict[str, list[int]] = {}
    for row in analogs:
        rank = parse_int(row.get("similarityRank"), "track_archetype_analog_context.csv", "similarityRank")
        if rank is None:
            fail("track_archetype_analog_context.csv missing similarityRank")
        per_target.setdefault(row.get("targetTrackId") or "", []).append(rank)
    for target_id, ranks in per_target.items():
        if sorted(ranks) != list(range(1, expected_per_track + 1)):
            fail(f"track_archetype_analog_context.csv has incomplete analog ranks for {target_id}")


def validate_context(expected_hash: str, counts: dict[str, int]) -> None:
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") != "source_bounded_dimension_context_not_rating_or_forecast":
        fail("summary.json claimStrength mismatch")
    if summary.get("publicPointPrediction") is not False or summary.get("causalAttribution") is not False:
        fail("summary.json must forbid point prediction and causal attribution")
    for key, expected in counts.items():
        if key.endswith("Ids"):
            continue
        if summary.get("counts", {}).get(key) != expected:
            fail(f"summary.json count mismatch for {key}")

    pack = load_json(OUTPUT_DIR / "context-packs/career-dimension-context.json")
    if pack.get("sourceHash") != expected_hash:
        fail("context pack sourceHash does not match canonical dataset")
    if pack.get("claimStrength") != "source_bounded_dimension_context_not_rating_or_forecast":
        fail("context pack claimStrength mismatch")
    for key, expected in counts.items():
        if key.endswith("Ids"):
            continue
        if pack.get("sourceScope", {}).get(key) != expected:
            fail(f"context pack sourceScope count mismatch for {key}")
    text = json.dumps(pack).lower()
    forbidden = ["win probability", "predicted finish", "expected finish", "driver rating", "team strength score", "setup advantage", "proved caused"]
    hits = [phrase for phrase in forbidden if phrase in text]
    if hits:
        fail(f"context pack contains unsupported claim text: {hits}")

    report = OUTPUT_DIR / "CAREER_DIMENSION_CONTEXT_LAYER.md"
    require_file(report)
    report_text = report.read_text()
    if expected_hash not in report_text:
        fail("report missing current source hash")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Qualifying Conversion",
        "Team And Entrant Context",
        "Track Archetypes",
        "Driver Cohorts",
        "Caveats",
    ]:
        if phrase not in report_text:
            fail(f"report missing section: {phrase}")
    if re.search(r"\b(win probability|predicted finish|expected finish|driver rating|team strength score|setup advantage|proved caused)\b", report_text.lower()):
        fail("report contains unsupported rating/forecast/causal language")


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        expected_hash = dataset_hash()
        counts = expected_counts(dataset)
        validate_csv_artifacts(expected_hash, counts)
        validate_context(expected_hash, counts)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
