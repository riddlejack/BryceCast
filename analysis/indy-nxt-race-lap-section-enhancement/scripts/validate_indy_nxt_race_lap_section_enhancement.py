#!/usr/bin/env python3
"""Validate INDY NXT race lap/section enhancement artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/indy-nxt-race-lap-section-enhancement"
OUTPUT_DIR = LANE_DIR / "output"

BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"

REQUIRED_FILES = [
    "race_lap_microstates.csv",
    "race_lap_segments.csv",
    "race_lap_inflection_points.csv",
    "race_section_lap_observations.csv",
    "race_section_session_summary.csv",
    "road_america_race_lap_section_context.csv",
    "summary.json",
    "INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md",
    "context-packs/indy-nxt-race-lap-section-context.json",
    "context-packs/road-america-race-context.json",
]

MICROSTATE_FIELDS = {
    "sessionId",
    "eventId",
    "seasonYear",
    "raceLabel",
    "trackName",
    "lapNumber",
    "position",
    "previousPosition",
    "positionDelta",
    "netFromLapOne",
    "fieldSizeAtLap",
    "runningPositionPercentile",
    "cautionState",
    "sourceCompleteness",
    "sourceState",
    "sourceHash",
}

SEGMENT_FIELDS = {
    "sessionId",
    "raceLabel",
    "segmentId",
    "segmentType",
    "startLap",
    "endLap",
    "lapCount",
    "startPosition",
    "endPosition",
    "netGain",
    "bestPosition",
    "worstPosition",
    "volatility",
    "medianRunningPositionPercentile",
    "sourceCompleteness",
    "sourceHash",
}

INFLECTION_FIELDS = {
    "sessionId",
    "raceLabel",
    "lapNumber",
    "previousPosition",
    "position",
    "positionDelta",
    "trigger",
    "cautionState",
    "magnitude",
    "sourceHash",
}

SECTION_FIELDS = {
    "sessionId",
    "raceLabel",
    "lapNumber",
    "sectionName",
    "sectionType",
    "timeSeconds",
    "fieldComparisonCount",
    "fieldRank",
    "fieldPercentile",
    "cleanRaceLapCandidate",
    "cautionState",
    "sourceState",
    "sourceMetricId",
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


def source_time_seconds(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def section_observation_identity(metric_id: Any, session_id: Any, lap_number: Any, section_name: Any, time_seconds: Any) -> tuple[Any, ...] | None:
    time_value = source_time_seconds(time_seconds)
    if lap_number is None or not section_name or time_value is None:
        return None
    return (metric_id, session_id, int(lap_number), section_name, round(float(time_value), 6))


def require_fields(rows: list[dict[str, str]], fields: set[str], artifact: str) -> None:
    if not rows:
        fail(f"{artifact} is empty")
    missing = fields - set(rows[0])
    if missing:
        fail(f"{artifact} missing fields: {sorted(missing)}")


def is_bryce(row: dict[str, Any]) -> bool:
    return row.get("driverId") == BRYCE_ID or "aron, bryce" in str(row.get("driverName", "")).lower()


def expected_counts(dataset: dict[str, Any]) -> dict[str, int]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    race_session_ids = {
        session["id"]
        for session in dataset["sessions"]
        if session.get("sessionType") == "race"
        and events.get(session.get("eventId"), {}).get("seriesId") == INDY_NXT_ID
    }
    bryce_lap_source_rows = [
        row
        for row in dataset["lapSamples"]
        if row.get("driverId") == BRYCE_ID and row.get("sessionId") in race_session_ids
    ]
    bryce_lap_rows = len(bryce_lap_source_rows)
    bryce_lap_sessions = {row.get("sessionId") for row in bryce_lap_source_rows}
    bryce_lap_pairs = {
        (row.get("sessionId"), int(row.get("lapNumber")))
        for row in bryce_lap_source_rows
        if row.get("lapNumber") is not None
    }
    bryce_race_sessions = {
        row.get("sessionId")
        for row in dataset["results"]
        if row.get("driverId") == BRYCE_ID and row.get("sessionId") in race_session_ids
    }
    section_sessions_with_bryce = 0
    section_observation_keys: set[tuple[Any, ...]] = set()
    for metric in dataset["derivedMetrics"]:
        if metric.get("seriesId") != INDY_NXT_ID or metric.get("metricType") != "official_section_results":
            continue
        if sessions.get(metric.get("sessionId"), {}).get("sessionType") != "race":
            continue
        if any(is_bryce(car) for car in metric.get("metrics", {}).get("cars", [])):
            section_sessions_with_bryce += 1
        seen_bryce_rows: set[tuple[Any, ...]] = set()
        for car in metric.get("metrics", {}).get("cars", []):
            if not is_bryce(car):
                continue
            for lap in car.get("laps", []):
                for section in lap.get("sections", []):
                    key = section_observation_identity(
                        metric.get("id"),
                        metric.get("sessionId"),
                        lap.get("lapNumber"),
                        section.get("name"),
                        section.get("timeSeconds"),
                    )
                    if key is None or key in seen_bryce_rows:
                        continue
                    seen_bryce_rows.add(key)
                    section_observation_keys.add(key)
    return {
        "bryceLapRows": bryce_lap_rows,
        "bryceLapSessions": len(bryce_lap_sessions),
        "bryceRaceLapPairs": bryce_lap_pairs,
        "bryceRaceSessions": len(bryce_race_sessions),
        "sectionSessionsWithBryce": section_sessions_with_bryce,
        "sectionObservationKeys": section_observation_keys,
    }


def require_no_low_denominator_strings(value: Any, context: str) -> None:
    text = value if isinstance(value, str) else json.dumps(value)
    for match in re.finditer(r"\bn=(\d+)\b", text):
        if int(match.group(1)) < 8:
            fail(f"{context} exposes denominator below 8: n={match.group(1)}")


def validate_microstates(expected_hash: str, counts: dict[str, int]) -> None:
    rows = read_csv(OUTPUT_DIR / "race_lap_microstates.csv")
    require_fields(rows, MICROSTATE_FIELDS, "race_lap_microstates.csv")
    if len(rows) != counts["bryceLapRows"]:
        fail(f"race_lap_microstates row count mismatch: expected {counts['bryceLapRows']}, got {len(rows)}")
    if len({row["sessionId"] for row in rows}) != counts["bryceLapSessions"]:
        fail("race_lap_microstates missing source-visible Bryce lap sessions")
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("race_lap_microstates sourceHash does not match canonical dataset")
        pct = parse_float(row["runningPositionPercentile"], "race_lap_microstates.csv", "runningPositionPercentile")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"runningPositionPercentile out of range: {pct}")
        if row["cautionState"] not in {"green", "caution", "restart_lap", "unknown"}:
            fail(f"invalid cautionState {row['cautionState']!r}")


def validate_segments_and_inflections(expected_hash: str, counts: dict[str, int]) -> None:
    segments = read_csv(OUTPUT_DIR / "race_lap_segments.csv")
    require_fields(segments, SEGMENT_FIELDS, "race_lap_segments.csv")
    if len(segments) < counts["bryceLapSessions"]:
        fail("race_lap_segments must include at least one segment per Bryce race")
    for row in segments:
        if row["sourceHash"] != expected_hash:
            fail("race_lap_segments sourceHash does not match canonical dataset")
        if row["segmentType"] not in {"green_run", "caution_window", "restart_window", "unknown"}:
            fail(f"invalid segmentType {row['segmentType']!r}")
        if not row.get("sourceCompleteness"):
            fail("race_lap_segments row missing sourceCompleteness")
        pct = parse_float(row["medianRunningPositionPercentile"], "race_lap_segments.csv", "medianRunningPositionPercentile")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"segment median percentile out of range: {pct}")

    inflections = read_csv(OUTPUT_DIR / "race_lap_inflection_points.csv")
    require_fields(inflections, INFLECTION_FIELDS, "race_lap_inflection_points.csv")
    if len(inflections) < 50:
        fail("race_lap_inflection_points must include meaningful movement events")
    for row in inflections:
        if row["sourceHash"] != expected_hash:
            fail("race_lap_inflection_points sourceHash does not match canonical dataset")
        if (parse_int(row["magnitude"], "race_lap_inflection_points.csv", "magnitude") or 0) < 1:
            fail("inflection magnitude must be positive")


def validate_sections(expected_hash: str, counts: dict[str, int]) -> None:
    rows = read_csv(OUTPUT_DIR / "race_section_lap_observations.csv")
    require_fields(rows, SECTION_FIELDS, "race_section_lap_observations.csv")
    expected_keys = counts["sectionObservationKeys"]
    if len(rows) != len(expected_keys):
        fail(f"race_section_lap_observations row count mismatch: expected {len(expected_keys)}, got {len(rows)}")
    if len({row["sessionId"] for row in rows}) != counts["sectionSessionsWithBryce"]:
        fail("race_section_lap_observations missing source-visible section sessions")
    if "track_section" not in {row["sectionType"] for row in rows}:
        fail("race_section_lap_observations missing track_section rows")
    clean_comparable = 0
    lap_chart_source_state = "official_section_results+official_lap_chart+official_incident_caution_context"
    section_only_source_state = "official_section_results_only"
    lap_chart_pairs = counts["bryceRaceLapPairs"]
    observed_keys: set[tuple[Any, ...]] = set()
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("race_section_lap_observations sourceHash does not match canonical dataset")
        if row["sourceState"] not in {lap_chart_source_state, section_only_source_state}:
            fail(f"unexpected section sourceState {row['sourceState']!r}")
        lap_number = parse_int(row["lapNumber"], "race_section_lap_observations.csv", "lapNumber")
        key = section_observation_identity(row["sourceMetricId"], row["sessionId"], lap_number, row["sectionName"], row["timeSeconds"])
        if key is None:
            fail("race section observation row has invalid identity fields")
        if key in observed_keys:
            fail(f"duplicate race section observation identity: {key}")
        observed_keys.add(key)
        has_lap_chart = (row["sessionId"], lap_number) in lap_chart_pairs
        if row["sourceState"] == lap_chart_source_state and not has_lap_chart:
            fail(f"section row claims lap-chart backing without same-lap Bryce lap row: {row['sessionId']} L{lap_number}")
        if row["sourceState"] == section_only_source_state and has_lap_chart:
            fail(f"section row downgraded despite same-lap Bryce lap row: {row['sessionId']} L{lap_number}")
        if row["sourceState"] == section_only_source_state:
            if row["cleanRaceLapCandidate"] != "unknown" or row["cautionState"] != "unknown":
                fail("section-only row must not expose clean-lap or caution labels")
        pct = parse_float(row["fieldPercentile"], "race_section_lap_observations.csv", "fieldPercentile")
        rank = parse_int(row["fieldRank"], "race_section_lap_observations.csv", "fieldRank")
        count = parse_int(row["fieldComparisonCount"], "race_section_lap_observations.csv", "fieldComparisonCount") or 0
        if count < 8 and (pct is not None or rank is not None):
            fail(f"section rank/percentile must be suppressed below denominator 8, got {count}")
        if count >= 8 and ((pct is None) != (rank is None)):
            fail("section fieldRank and fieldPercentile must be populated together")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"section percentile out of range: {pct}")
        if row["cleanRaceLapCandidate"] == "yes" and row["sectionType"] == "track_section" and pct is not None:
            clean_comparable += 1
    if clean_comparable < 500:
        fail(f"too few clean comparable race section rows: {clean_comparable}")
    if observed_keys != expected_keys:
        missing = sorted(expected_keys - observed_keys)[:5]
        extra = sorted(observed_keys - expected_keys)[:5]
        fail(f"race section observation identity mismatch; missing={missing} extra={extra}")

    summary = read_csv(OUTPUT_DIR / "race_section_session_summary.csv")
    if len(summary) != counts["sectionSessionsWithBryce"]:
        fail("race_section_session_summary row count mismatch")
    expected_summary_states = {
        "official_section_results+official_lap_chart+official_incident_caution_context_clean_lap_filtered",
        "official_section_results+official_lap_chart+official_incident_caution_context_clean_lap_filtered+section_only_rows_excluded",
        "official_section_results+official_lap_chart+official_incident_caution_context_no_clean_comparable_rows",
        "official_section_results_only_no_lap_chart_clean_filter_unavailable",
    }
    for row in summary:
        if row.get("sourceHash") != expected_hash:
            fail("race_section_session_summary sourceHash does not match canonical dataset")
        if row.get("sourceState") not in expected_summary_states:
            fail(f"unexpected race section summary sourceState {row.get('sourceState')!r}")
        require_no_low_denominator_strings(row.get("bestCleanSectionFamilies", ""), "race section summary bestCleanSectionFamilies")
        require_no_low_denominator_strings(row.get("weakestCleanSectionFamilies", ""), "race section summary weakestCleanSectionFamilies")


def validate_context_and_report(expected_hash: str) -> None:
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") != "post_race_descriptive_only":
        fail("summary.json must be post_race_descriptive_only")

    for name in [
        "context-packs/indy-nxt-race-lap-section-context.json",
        "context-packs/road-america-race-context.json",
    ]:
        pack = load_json(OUTPUT_DIR / name)
        if pack.get("sourceHash") != expected_hash:
            fail(f"{name} sourceHash does not match canonical dataset")
        if pack.get("claimStrength") != "post_race_descriptive_only":
            fail(f"{name} must be post_race_descriptive_only")
        require_no_low_denominator_strings(pack, name)
        text = json.dumps(pack).lower()
        forbidden = ["point_prediction", "win probability", "predicted finish", "expected finish"]
        hits = [phrase for phrase in forbidden if phrase in text]
        if hits:
            fail(f"{name} contains forbidden predictive claim text: {hits}")

    report = OUTPUT_DIR / "INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md"
    require_file(report)
    text = report.read_text()
    if expected_hash not in text:
        fail("report missing current source hash")
    require_no_low_denominator_strings(text, "INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Lap Microstates",
        "Caution-Aware Segments",
        "Race Section Shape",
        "Road America Context",
        "Caveats",
    ]:
        if phrase not in text:
            fail(f"report missing section: {phrase}")


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        expected_hash = dataset_hash()
        counts = expected_counts(dataset)
        validate_microstates(expected_hash, counts)
        validate_segments_and_inflections(expected_hash, counts)
        validate_sections(expected_hash, counts)
        validate_context_and_report(expected_hash)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
