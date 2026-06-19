#!/usr/bin/env python3
"""Validate INDY NXT practice/qualifying section-lap deep-dive artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/indy-nxt-section-lap-deep-dive"
OUTPUT_DIR = LANE_DIR / "output"
BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"
PREP_SESSION_TYPES = {"practice", "qualifying"}

REQUIRED_FILES = [
    "practice_qualifying_bryce_section_observations.csv",
    "practice_qualifying_session_summary.csv",
    "practice_qualifying_top_section_times.csv",
    "section_family_strengths.csv",
    "session_to_race_transfer.csv",
    "road_america_prep_section_context.csv",
    "summary.json",
    "INDY_NXT_SECTION_LAP_DEEP_DIVE.md",
    "context-packs/indy-nxt-section-lap-context.json",
    "context-packs/road-america-prep-context.json",
]

OBSERVATION_FIELDS = {
    "sessionId",
    "eventId",
    "seasonYear",
    "eventName",
    "trackName",
    "sessionType",
    "sessionName",
    "lapNumber",
    "sectionName",
    "sectionType",
    "timeSeconds",
    "speedMph",
    "fieldComparisonCount",
    "fieldRank",
    "fieldPercentile",
    "cleanLapCandidate",
    "sourceState",
    "sourceMetricId",
    "sourceHash",
}

SESSION_FIELDS = {
    "sessionId",
    "eventId",
    "seasonYear",
    "eventName",
    "trackName",
    "sessionType",
    "sessionName",
    "bryceLapCount",
    "bryceSectionObservations",
    "comparisonRows",
    "medianTrackSectionPercentile",
    "topQuartileTrackSectionShare",
    "bottomQuartileTrackSectionShare",
    "bestSectionFamilies",
    "weakestSectionFamilies",
    "bestLapRank",
    "topSectionBryceRows",
    "sourceState",
    "sourceHash",
}

TOP_SECTION_FIELDS = {
    "sessionId",
    "eventId",
    "seasonYear",
    "eventName",
    "trackName",
    "sessionType",
    "sectionName",
    "rank",
    "fieldSize",
    "percentile",
    "time",
    "timeSeconds",
    "speedMph",
    "lapNumber",
    "sourceState",
    "sourceMetricId",
    "sourceHash",
}

TRANSFER_FIELDS = {
    "eventId",
    "seasonYear",
    "eventName",
    "trackName",
    "raceSessionId",
    "raceSessionName",
    "raceFinish",
    "raceStart",
    "finishPercentile",
    "prepSessionCount",
    "practiceMedianTrackSectionPercentile",
    "qualifyingMedianTrackSectionPercentile",
    "bestPrepSectionFamilies",
    "transferClaimStrength",
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


def is_bryce(row: dict[str, Any]) -> bool:
    return row.get("driverId") == BRYCE_ID or "aron, bryce" in str(row.get("driverName", "")).lower()


def source_time_seconds(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        pass
    parts = str(value).strip().split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return None
    return None


def top_section_identity(metric_id: Any, section_name: Any, time_value: Any, lap_number: Any, speed_mph: Any) -> tuple[Any, ...]:
    speed = None
    if speed_mph not in (None, ""):
        try:
            speed = round(float(speed_mph), 4)
        except (TypeError, ValueError):
            speed = str(speed_mph)
    normalized_lap_number = "" if lap_number is None else str(lap_number)
    return (metric_id, section_name or "", str(time_value or ""), normalized_lap_number, speed)


def section_observation_identity(metric_id: Any, session_id: Any, lap_number: Any, section_name: Any, time_seconds: Any) -> tuple[Any, ...] | None:
    time_value = source_time_seconds(time_seconds)
    if lap_number is None or not section_name or time_value is None:
        return None
    return (metric_id, session_id, int(lap_number), section_name, round(float(time_value), 6))


def expected_source_counts(dataset: dict[str, Any]) -> dict[str, Any]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    section_session_ids: set[str] = set()
    section_observation_keys: set[tuple[Any, ...]] = set()
    top_section_keys: set[tuple[Any, ...]] = set()
    top_section_ranks: dict[tuple[Any, ...], int] = {}
    for metric in dataset["derivedMetrics"]:
        if metric.get("seriesId") != INDY_NXT_ID:
            continue
        session_type = sessions.get(metric.get("sessionId"), {}).get("sessionType")
        if session_type not in PREP_SESSION_TYPES:
            continue
        if metric.get("metricType") == "official_section_results":
            has_bryce = any(is_bryce(car) for car in metric.get("metrics", {}).get("cars", []))
            if has_bryce:
                section_session_ids.add(metric.get("sessionId"))
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
        if metric.get("metricType") == "official_top_section_times":
            for section in metric.get("metrics", {}).get("sections", []):
                section_name = section.get("name") or ""
                for row in section.get("rows", []):
                    if not is_bryce(row):
                        continue
                    if source_time_seconds(row.get("time")) is None:
                        continue
                    key = top_section_identity(
                        metric.get("id"),
                        section_name,
                        row.get("time"),
                        row.get("lapNumber"),
                        row.get("speedMph"),
                    )
                    top_section_keys.add(key)
                    if key not in top_section_ranks and row.get("rank") is not None:
                        top_section_ranks[key] = int(row["rank"])
    return {
        "sectionSessionsWithBryce": len(section_session_ids),
        "sectionObservationKeys": section_observation_keys,
        "topSectionBryceRows": len(top_section_keys),
        "topSectionKeys": top_section_keys,
        "topSectionRanks": top_section_ranks,
    }


def require_fields(rows: list[dict[str, str]], fields: set[str], artifact: str) -> None:
    if not rows:
        fail(f"{artifact} is empty")
    missing = fields - set(rows[0])
    if missing:
        fail(f"{artifact} missing fields: {sorted(missing)}")


def parse_float(value: str, artifact: str, field: str) -> float | None:
    if value == "" or value is None:
        return None
    try:
        return float(value)
    except ValueError:
        fail(f"{artifact} has non-numeric {field}: {value!r}")


def parse_int(value: str, artifact: str, field: str) -> int | None:
    if value == "" or value is None:
        return None
    try:
        return int(float(value))
    except ValueError:
        fail(f"{artifact} has non-integer {field}: {value!r}")


def require_no_low_denominator_strings(value: Any, context: str) -> None:
    text = value if isinstance(value, str) else json.dumps(value)
    for match in re.finditer(r"\bn=(\d+)\b", text):
        if int(match.group(1)) < 8:
            fail(f"{context} exposes section-family denominator below 8: n={match.group(1)}")


def validate_observations(expected_hash: str, source_counts: dict[str, Any]) -> None:
    rows = read_csv(OUTPUT_DIR / "practice_qualifying_bryce_section_observations.csv")
    require_fields(rows, OBSERVATION_FIELDS, "practice_qualifying_bryce_section_observations.csv")
    expected_keys = source_counts["sectionObservationKeys"]
    if len(rows) != len(expected_keys):
        fail(f"section observation row count mismatch: expected {len(expected_keys)}, got {len(rows)}")
    session_types = {row["sessionType"] for row in rows}
    if not {"practice", "qualifying"}.issubset(session_types):
        fail(f"section observations missing practice or qualifying rows: {sorted(session_types)}")
    section_types = {row["sectionType"] for row in rows}
    if "track_section" not in section_types or "lap_total" not in section_types:
        fail(f"section observations must include track_section and lap_total rows, got {sorted(section_types)}")
    comparable = 0
    observed_keys: set[tuple[Any, ...]] = set()
    for row in rows:
        if row["sourceState"] != "official_section_results":
            fail(f"unexpected observation sourceState {row['sourceState']!r}")
        if row["sourceHash"] != expected_hash:
            fail("section observation sourceHash does not match canonical dataset")
        pct = parse_float(row["fieldPercentile"], "practice_qualifying_bryce_section_observations.csv", "fieldPercentile")
        key = section_observation_identity(
            row["sourceMetricId"],
            row["sessionId"],
            parse_int(row["lapNumber"], "practice_qualifying_bryce_section_observations.csv", "lapNumber"),
            row["sectionName"],
            row["timeSeconds"],
        )
        if key is None:
            fail("section observation row has invalid identity fields")
        if key in observed_keys:
            fail(f"duplicate section observation identity: {key}")
        observed_keys.add(key)
        if pct is not None and not 0 <= pct <= 1:
            fail(f"fieldPercentile out of range: {pct}")
        count = parse_int(row["fieldComparisonCount"], "practice_qualifying_bryce_section_observations.csv", "fieldComparisonCount")
        rank = parse_int(row["fieldRank"], "practice_qualifying_bryce_section_observations.csv", "fieldRank")
        if count is not None and count < 8 and (pct is not None or rank is not None):
            fail(f"section observation rank/percentile must be suppressed below denominator 8, got fieldComparisonCount={count}")
        if count is not None and count >= 8 and ((pct is None) != (rank is None)):
            fail("section observation fieldRank and fieldPercentile must be populated together")
        if count is not None and count >= 8 and pct is not None:
            comparable += 1
    if comparable < 500:
        fail(f"not enough comparable section rows: {comparable}")
    if observed_keys != expected_keys:
        missing = sorted(expected_keys - observed_keys)[:5]
        extra = sorted(observed_keys - expected_keys)[:5]
        fail(f"section observation identity mismatch; missing={missing} extra={extra}")


def validate_session_summary(expected_hash: str, source_counts: dict[str, int]) -> None:
    rows = read_csv(OUTPUT_DIR / "practice_qualifying_session_summary.csv")
    observations = read_csv(OUTPUT_DIR / "practice_qualifying_bryce_section_observations.csv")
    clean_laps_by_session: dict[str, set[int]] = {}
    for observation in observations:
        if observation.get("cleanLapCandidate") != "yes":
            continue
        lap_number = parse_int(observation.get("lapNumber", ""), "practice_qualifying_bryce_section_observations.csv", "lapNumber")
        if lap_number is None or lap_number <= 0:
            continue
        clean_laps_by_session.setdefault(observation["sessionId"], set()).add(lap_number)
    require_fields(rows, SESSION_FIELDS, "practice_qualifying_session_summary.csv")
    expected_sessions = source_counts["sectionSessionsWithBryce"]
    if len(rows) != expected_sessions:
        fail(f"session summary row count mismatch: expected {expected_sessions}, got {len(rows)}")
    session_types = {row["sessionType"] for row in rows}
    if not {"practice", "qualifying"}.issubset(session_types):
        fail(f"session summary missing practice or qualifying rows: {sorted(session_types)}")
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("session summary sourceHash does not match canonical dataset")
        pct = parse_float(row["medianTrackSectionPercentile"], "practice_qualifying_session_summary.csv", "medianTrackSectionPercentile")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"medianTrackSectionPercentile out of range: {pct}")
        if row["sourceState"] != "official_section_results+official_top_section_times":
            fail(f"unexpected session sourceState {row['sourceState']!r}")
        expected_laps = len(clean_laps_by_session.get(row["sessionId"], set()))
        observed_laps = parse_int(row["bryceLapCount"], "practice_qualifying_session_summary.csv", "bryceLapCount")
        if observed_laps != expected_laps:
            fail(f"bryceLapCount mismatch for {row['sessionId']}: expected {expected_laps}, got {observed_laps}")
        require_no_low_denominator_strings(row.get("bestSectionFamilies", ""), "session summary bestSectionFamilies")
        require_no_low_denominator_strings(row.get("weakestSectionFamilies", ""), "session summary weakestSectionFamilies")
    useful = [
        row
        for row in rows
        if (parse_int(row["comparisonRows"], "practice_qualifying_session_summary.csv", "comparisonRows") or 0) >= 20
    ]
    if len(useful) < 40:
        fail(f"too few sessions have meaningful section comparisons: {len(useful)}")


def validate_top_sections(expected_hash: str, source_counts: dict[str, int]) -> None:
    rows = read_csv(OUTPUT_DIR / "practice_qualifying_top_section_times.csv")
    require_fields(rows, TOP_SECTION_FIELDS, "practice_qualifying_top_section_times.csv")
    expected_rows = source_counts["topSectionBryceRows"]
    if len(rows) != expected_rows:
        fail(f"top-section row count mismatch: expected {expected_rows}, got {len(rows)}")
    if not {"practice", "qualifying"}.issubset({row["sessionType"] for row in rows}):
        fail("top-section table missing practice or qualifying rows")
    seen: set[tuple[Any, ...]] = set()
    expected_keys = source_counts["topSectionKeys"]
    expected_ranks = source_counts["topSectionRanks"]
    for row in rows:
        duplicate_key = top_section_identity(
            row["sourceMetricId"],
            row["sectionName"],
            row.get("time"),
            row.get("lapNumber"),
            row.get("speedMph"),
        )
        if duplicate_key in seen:
            fail(f"duplicate top-section output row: {duplicate_key}")
        seen.add(duplicate_key)
        if row["sourceState"] != "official_top_section_times":
            fail(f"unexpected top-section sourceState {row['sourceState']!r}")
        if row["sourceHash"] != expected_hash:
            fail("top-section sourceHash does not match canonical dataset")
        pct = parse_float(row["percentile"], "practice_qualifying_top_section_times.csv", "percentile")
        field_size = parse_int(row["fieldSize"], "practice_qualifying_top_section_times.csv", "fieldSize") or 0
        rank = parse_int(row["rank"], "practice_qualifying_top_section_times.csv", "rank")
        expected_rank = expected_ranks.get(duplicate_key)
        if expected_rank is not None and rank != expected_rank:
            fail(f"top-section rank changed for {duplicate_key}: expected {expected_rank}, got {rank}")
        if field_size < 8 and pct is not None:
            fail(f"top-section percentile must be suppressed below denominator 8, got fieldSize={field_size}")
        if pct is not None and not 0 <= pct <= 1:
            fail(f"top-section percentile out of range: {pct}")
    if seen != expected_keys:
        missing = sorted(expected_keys - seen)[:5]
        extra = sorted(seen - expected_keys)[:5]
        fail(f"top-section identity mismatch; missing={missing} extra={extra}")


def validate_strengths_and_transfer(expected_hash: str) -> None:
    strengths = read_csv(OUTPUT_DIR / "section_family_strengths.csv")
    require_fields(
        strengths,
        {
            "sectionFamily",
            "sessionType",
            "trackName",
            "observationRows",
            "medianPercentile",
            "topQuartileShare",
            "bottomQuartileShare",
            "sourceHash",
        },
        "section_family_strengths.csv",
    )
    if len(strengths) < 25:
        fail(f"section_family_strengths.csv is too small: {len(strengths)} rows")
    if any(row["sourceHash"] != expected_hash for row in strengths):
        fail("section family sourceHash does not match canonical dataset")
    for row in strengths:
        if (parse_int(row["observationRows"], "section_family_strengths.csv", "observationRows") or 0) < 8:
            fail("section family rows must have at least 8 observations")

    transfer = read_csv(OUTPUT_DIR / "session_to_race_transfer.csv")
    require_fields(transfer, TRANSFER_FIELDS, "session_to_race_transfer.csv")
    if len(transfer) < 20:
        fail(f"session_to_race_transfer.csv is too small: {len(transfer)} rows")
    for row in transfer:
        if row["sourceHash"] != expected_hash:
            fail("session-to-race transfer sourceHash does not match canonical dataset")
        if row["transferClaimStrength"] not in {"historical_backtest_only", "descriptive_context_only"}:
            fail(f"invalid transferClaimStrength {row['transferClaimStrength']!r}")

    road_america = read_csv(OUTPUT_DIR / "road_america_prep_section_context.csv")
    if len(road_america) < 5:
        fail(f"road_america_prep_section_context.csv is too small: {len(road_america)} rows")
    if any(row.get("sourceHash") != expected_hash for row in road_america):
        fail("Road America context sourceHash does not match canonical dataset")


def validate_json_and_report(expected_hash: str) -> None:
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") not in {"historical_backtest_only", "descriptive_context_only"}:
        fail("summary.json must avoid point-prediction claim strength")
    if summary.get("publicPointPrediction") not in (False, None):
        fail("summary.json must not expose public point predictions")

    for name in [
        "context-packs/indy-nxt-section-lap-context.json",
        "context-packs/road-america-prep-context.json",
    ]:
        pack = load_json(OUTPUT_DIR / name)
        if pack.get("sourceHash") != expected_hash:
            fail(f"{name} sourceHash does not match canonical dataset")
        if pack.get("claimStrength") not in {"historical_backtest_only", "descriptive_context_only"}:
            fail(f"{name} must avoid point-prediction claim strength")
        require_no_low_denominator_strings(pack, name)
        text = json.dumps(pack).lower()
        forbidden = ["point_prediction", "expected finish", "predicted finish", "win probability"]
        hits = [phrase for phrase in forbidden if phrase in text]
        if hits:
            fail(f"{name} contains forbidden predictive claim text: {hits}")

    report = OUTPUT_DIR / "INDY_NXT_SECTION_LAP_DEEP_DIVE.md"
    require_file(report)
    text = report.read_text()
    if expected_hash not in text:
        fail("report missing current source hash")
    require_no_low_denominator_strings(text, "INDY_NXT_SECTION_LAP_DEEP_DIVE.md")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Practice/Qualifying Section-Lap Findings",
        "Top Section Times",
        "Session-To-Race Transfer",
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
        source_counts = expected_source_counts(dataset)
        validate_observations(expected_hash, source_counts)
        validate_session_summary(expected_hash, source_counts)
        validate_top_sections(expected_hash, source_counts)
        validate_strengths_and_transfer(expected_hash)
        validate_json_and_report(expected_hash)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
