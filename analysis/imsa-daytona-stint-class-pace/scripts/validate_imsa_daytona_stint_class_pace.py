#!/usr/bin/env python3
"""Validate IMSA Daytona stint/class pace artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/imsa-daytona-stint-class-pace"
OUTPUT_DIR = LANE_DIR / "output"

BRYCE_ID = "driver_bryce_aron"
IMSA_ID = "series_imsa_weathertech"
SESSION_ID = "session_imsa_2025_daytona_rolex_24_race"
CAR_85_ID = "car_imsa_2025_jdc_miller_motorsports_85"

REQUIRED_FILES = [
    "imsa_lap_observations.csv",
    "imsa_stint_summary.csv",
    "imsa_driver_class_pace_summary.csv",
    "imsa_car85_codriver_pace.csv",
    "imsa_hourly_class_pace.csv",
    "bryce_imsa_stint_context.csv",
    "summary.json",
    "IMSA_DAYTONA_STINT_CLASS_PACE.md",
    "context-packs/imsa-daytona-stint-class-context.json",
]

LAP_FIELDS = {
    "sessionId",
    "eventId",
    "seasonYear",
    "raceLabel",
    "trackName",
    "carId",
    "carNumber",
    "class",
    "driverId",
    "driverName",
    "lapNumber",
    "sessionHour",
    "lapTimeSeconds",
    "sector1Seconds",
    "sector2Seconds",
    "sector3Seconds",
    "averageSpeedKph",
    "isValid",
    "pitIn",
    "pitOut",
    "validNonPitLap",
    "classHourMedianLapSeconds",
    "deltaToClassHourMedianSeconds",
    "deltaToOverallHourMedianSeconds",
    "classHourPercentile",
    "overallHourPercentile",
    "sourceState",
    "sourceHash",
}

STINT_FIELDS = {
    "sessionId",
    "stintId",
    "carId",
    "carNumber",
    "class",
    "driverId",
    "driverName",
    "stintIndexForCar",
    "driverStintIndex",
    "startLap",
    "endLap",
    "lapCount",
    "validLapCount",
    "validNonPitLapCount",
    "pitInLapCount",
    "pitOutLapCount",
    "startSessionHour",
    "endSessionHour",
    "medianValidLapSeconds",
    "medianValidNonPitLapSeconds",
    "bestValidLapSeconds",
    "best20LapAverageSeconds",
    "medianDeltaToClassHourSeconds",
    "medianDeltaToOverallHourSeconds",
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


def parse_float(value: Any, artifact: str, field: str) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        fail(f"{artifact} has non-numeric {field}: {value!r}")


def parse_int(value: Any, artifact: str, field: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        fail(f"{artifact} has non-integer {field}: {value!r}")


def require_fields(rows: list[dict[str, str]], fields: set[str], artifact: str) -> None:
    if not rows:
        fail(f"{artifact} is empty")
    missing = fields - set(rows[0])
    if missing:
        fail(f"{artifact} missing fields: {sorted(missing)}")


def expected_counts(dataset: dict[str, Any]) -> dict[str, Any]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    session = sessions.get(SESSION_ID)
    if not session or session.get("sessionType") != "race" or events.get(session.get("eventId"), {}).get("seriesId") != IMSA_ID:
        fail(f"{SESSION_ID} is not an IMSA race session in the canonical dataset")
    laps = [row for row in dataset["lapSamples"] if row.get("sessionId") == SESSION_ID]
    bryce_laps = [row for row in laps if row.get("driverId") == BRYCE_ID]
    car85_laps = [row for row in laps if row.get("carId") == CAR_85_ID]
    car85_drivers = {row.get("driverId") for row in car85_laps}
    classes = {row.get("class") for row in laps if row.get("class")}
    return {
        "lapRows": len(laps),
        "bryceLapRows": len(bryce_laps),
        "car85LapRows": len(car85_laps),
        "car85Drivers": car85_drivers,
        "classes": classes,
        "sessionIds": {SESSION_ID},
        "sessionCount": 1,
        "eventCount": len({sessions[row.get("sessionId")].get("eventId") for row in laps}),
    }


def validate_laps(expected_hash: str, counts: dict[str, Any]) -> None:
    rows = read_csv(OUTPUT_DIR / "imsa_lap_observations.csv")
    require_fields(rows, LAP_FIELDS, "imsa_lap_observations.csv")
    if len(rows) != counts["lapRows"]:
        fail(f"imsa_lap_observations row count mismatch: expected {counts['lapRows']}, got {len(rows)}")
    if len([row for row in rows if row["driverId"] == BRYCE_ID]) != counts["bryceLapRows"]:
        fail("imsa_lap_observations missing Bryce lap rows")
    if {row["class"] for row in rows if row.get("class")} != counts["classes"]:
        fail("imsa_lap_observations class coverage mismatch")
    if {row["sessionId"] for row in rows} != {SESSION_ID}:
        fail("imsa_lap_observations must be scoped to the Daytona session only")
    bryce_valid_nonpit = 0
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("imsa_lap_observations sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_alkamel_time_cards":
            fail(f"unexpected lap sourceState {row['sourceState']!r}")
        lap_time = parse_float(row["lapTimeSeconds"], "imsa_lap_observations.csv", "lapTimeSeconds")
        if lap_time is None or lap_time <= 0:
            fail("IMSA lap observation missing positive lapTimeSeconds")
        if row["isValid"] not in {"yes", "no"} or row["pitIn"] not in {"yes", "no"} or row["pitOut"] not in {"yes", "no"}:
            fail("boolean lap fields must use yes/no")
        if row["validNonPitLap"] == "yes":
            if row["isValid"] != "yes" or row["pitIn"] != "no" or row["pitOut"] != "no":
                fail("validNonPitLap must be valid and non-pit")
            pct = parse_float(row["classHourPercentile"], "imsa_lap_observations.csv", "classHourPercentile")
            if pct is not None and not 0 <= pct <= 1:
                fail(f"classHourPercentile out of range: {pct}")
            if row["driverId"] == BRYCE_ID:
                bryce_valid_nonpit += 1
    if bryce_valid_nonpit < 100:
        fail(f"Bryce valid non-pit IMSA lap count unexpectedly low: {bryce_valid_nonpit}")


def validate_stints_and_drivers(expected_hash: str, counts: dict[str, Any]) -> None:
    stints = read_csv(OUTPUT_DIR / "imsa_stint_summary.csv")
    require_fields(stints, STINT_FIELDS, "imsa_stint_summary.csv")
    if len(stints) < 200:
        fail("imsa_stint_summary should include full-field stint rows")
    seen_stints = set()
    bryce_stints = 0
    for row in stints:
        if row["sourceHash"] != expected_hash:
            fail("imsa_stint_summary sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_alkamel_time_cards_driver_stint":
            fail(f"unexpected stint sourceState {row['sourceState']!r}")
        start = parse_int(row["startLap"], "imsa_stint_summary.csv", "startLap")
        end = parse_int(row["endLap"], "imsa_stint_summary.csv", "endLap")
        laps = parse_int(row["lapCount"], "imsa_stint_summary.csv", "lapCount")
        if start is None or end is None or laps is None or start > end or laps < 1:
            fail("stint has invalid lap range")
        key = row["stintId"]
        if key in seen_stints:
            fail(f"duplicate stintId {key}")
        seen_stints.add(key)
        if row["driverId"] == BRYCE_ID:
            bryce_stints += 1
    if bryce_stints < 3:
        fail(f"expected at least three Bryce IMSA stints, got {bryce_stints}")

    drivers = read_csv(OUTPUT_DIR / "imsa_driver_class_pace_summary.csv")
    stint_best20_by_driver_car: dict[tuple[str, str], list[float]] = {}
    for stint in stints:
        best20 = parse_float(stint.get("best20LapAverageSeconds"), "imsa_stint_summary.csv", "best20LapAverageSeconds")
        if best20 is not None:
            stint_best20_by_driver_car.setdefault((stint["driverId"], stint["carId"]), []).append(best20)
    if len(drivers) < 200:
        fail("imsa_driver_class_pace_summary should include full-field driver rows")
    for row in drivers:
        if row["sourceHash"] != expected_hash:
            fail("imsa_driver_class_pace_summary sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_alkamel_time_cards_driver_summary":
            fail(f"unexpected driver sourceState {row['sourceState']!r}")
        median_count = parse_int(row.get("classMedianDriverCount"), "imsa_driver_class_pace_summary.csv", "classMedianDriverCount")
        median_rank = parse_int(row.get("classMedianRank"), "imsa_driver_class_pace_summary.csv", "classMedianRank")
        median_pct = parse_float(row.get("classMedianPercentile"), "imsa_driver_class_pace_summary.csv", "classMedianPercentile")
        best20_count = parse_int(row.get("classBest20DriverCount"), "imsa_driver_class_pace_summary.csv", "classBest20DriverCount")
        best20_rank = parse_int(row.get("classBest20Rank"), "imsa_driver_class_pace_summary.csv", "classBest20Rank")
        best20_pct = parse_float(row.get("classBest20Percentile"), "imsa_driver_class_pace_summary.csv", "classBest20Percentile")
        for label, count, rank, pct in [
            ("median", median_count, median_rank, median_pct),
            ("best20", best20_count, best20_rank, best20_pct),
        ]:
            if count is not None and count < 8 and (rank is not None or pct is not None):
                fail(f"{label} driver class ranks must be suppressed below denominator 8")
            if rank is not None and count is None:
                fail(f"{label} driver class rank missing denominator")
            if rank is not None and count is not None and rank > count:
                fail(f"{label} driver class rank exceeds denominator: rank {rank}, denominator {count}")
            if pct is not None and not 0 <= pct <= 1:
                fail(f"{label} driver class percentile out of range: {pct}")
        driver_best20 = parse_float(row.get("best20LapAverageSeconds"), "imsa_driver_class_pace_summary.csv", "best20LapAverageSeconds")
        stint_best20_values = stint_best20_by_driver_car.get((row["driverId"], row["carId"]), [])
        expected_best20 = min(stint_best20_values) if stint_best20_values else None
        if (driver_best20 is None) != (expected_best20 is None):
            fail("driver best20LapAverageSeconds must be present only when a bounded stint best-20 exists")
        if driver_best20 is not None and expected_best20 is not None and abs(driver_best20 - expected_best20) > 1e-6:
            fail("driver best20LapAverageSeconds must equal the best bounded stint-level 20-lap average")

    car85 = read_csv(OUTPUT_DIR / "imsa_car85_codriver_pace.csv")
    driver_by_id = {row["driverId"]: row for row in drivers if row["carId"] == CAR_85_ID}
    if len(car85) != len(driver_by_id):
        fail("imsa_car85_codriver_pace row count must match car 85 driver summaries")
    if {row["driverId"] for row in car85} != counts["car85Drivers"]:
        fail("imsa_car85_codriver_pace missing car 85 co-driver rows")
    if len([row for row in car85 if row["driverId"] == BRYCE_ID]) != 1:
        fail("imsa_car85_codriver_pace must include exactly one Bryce row")
    passthrough_fields = [
        "driverName",
        "driverLicense",
        "carNumber",
        "teamName",
        "class",
        "vehicle",
        "lapCount",
        "validLapCount",
        "validNonPitLapCount",
        "stintCount",
        "bestValidLapSeconds",
        "medianValidNonPitLapSeconds",
        "best20LapAverageSeconds",
        "medianDeltaToClassHourSeconds",
        "medianDeltaToOverallHourSeconds",
        "classDriverCount",
        "classMedianDriverCount",
        "classMedianRank",
        "classMedianPercentile",
        "classBest20DriverCount",
        "classBest20Rank",
        "classBest20Percentile",
        "sourceHash",
    ]
    for row in car85:
        if row["sourceHash"] != expected_hash:
            fail("imsa_car85_codriver_pace sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_alkamel_time_cards_car85_codriver_summary":
            fail(f"unexpected car85 sourceState {row['sourceState']!r}")
        source_row = driver_by_id.get(row["driverId"])
        if source_row is None:
            fail(f"car85 row has no matching driver summary: {row['driverId']}")
        for field in passthrough_fields:
            if row.get(field, "") != source_row.get(field, ""):
                fail(f"car85 field {field} does not reconcile for {row['driverId']}")

    bryce = read_csv(OUTPUT_DIR / "bryce_imsa_stint_context.csv")
    if not bryce or len(bryce) != bryce_stints:
        fail("bryce_imsa_stint_context must mirror Bryce stint rows")
    for row in bryce:
        if row.get("driverId") != BRYCE_ID:
            fail("bryce_imsa_stint_context contains non-Bryce row")
        if row.get("sourceHash") != expected_hash:
            fail("bryce_imsa_stint_context sourceHash does not match canonical dataset")


def validate_hourly_and_context(expected_hash: str, counts: dict[str, Any]) -> None:
    hourly = read_csv(OUTPUT_DIR / "imsa_hourly_class_pace.csv")
    if len(hourly) < 80:
        fail("imsa_hourly_class_pace should include class-hour rows across the 24-hour race")
    for row in hourly:
        if row["sourceHash"] != expected_hash:
            fail("imsa_hourly_class_pace sourceHash does not match canonical dataset")
        if row["sourceState"] != "official_alkamel_time_cards_hourly_class_pace":
            fail(f"unexpected hourly sourceState {row['sourceState']!r}")
        lap_count = parse_int(row.get("validNonPitLapCount"), "imsa_hourly_class_pace.csv", "validNonPitLapCount") or 0
        if lap_count < 8:
            fail("hourly class pace rows must have denominator >= 8")

    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") != "source_bounded_descriptive_stint_class_pace":
        fail("summary.json must identify source-bounded descriptive stint/class pace")
    if summary.get("publicPointPrediction") is not False or summary.get("positionTraceAvailable") is not False:
        fail("summary.json must forbid public point prediction and position trace claims")
    if summary.get("counts", {}).get("lapObservations") != counts["lapRows"]:
        fail("summary.json lapObservations count mismatch")

    pack = load_json(OUTPUT_DIR / "context-packs/imsa-daytona-stint-class-context.json")
    if pack.get("sourceHash") != expected_hash:
        fail("context pack sourceHash does not match canonical dataset")
    if pack.get("claimStrength") != "source_bounded_descriptive_stint_class_pace":
        fail("context pack claimStrength mismatch")
    bryce_stints = read_csv(OUTPUT_DIR / "bryce_imsa_stint_context.csv")
    expected_hours: set[int] = set()
    for row in bryce_stints:
        start = parse_int(row.get("startSessionHour"), "bryce_imsa_stint_context.csv", "startSessionHour")
        end = parse_int(row.get("endSessionHour"), "bryce_imsa_stint_context.csv", "endSessionHour")
        if start is None or end is None:
            continue
        expected_hours.update(range(start, end + 1))
    observed_hours = {
        parse_int(row.get("sessionHour"), "context pack gtpClassHoursDuringBryceStints", "sessionHour")
        for row in pack.get("gtpClassHoursDuringBryceStints", [])
    }
    observed_hours.discard(None)
    missing_hours = expected_hours - observed_hours
    if missing_hours:
        fail(f"context pack missing GTP class-hour rows for Bryce stint hours: {sorted(missing_hours)}")
    text = json.dumps(pack).lower()
    forbidden = ["win probability", "predicted finish", "expected finish", "position trace", "running order by lap"]
    hits = [phrase for phrase in forbidden if phrase in text]
    if hits:
        fail(f"context pack contains unsupported claim text: {hits}")

    report = OUTPUT_DIR / "IMSA_DAYTONA_STINT_CLASS_PACE.md"
    require_file(report)
    report_text = report.read_text()
    if expected_hash not in report_text:
        fail("report missing current source hash")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Car 85 Co-Driver Pace",
        "Bryce Stint Shape",
        "Class-Hour Context",
        "Caveats",
    ]:
        if phrase not in report_text:
            fail(f"report missing section: {phrase}")
    if re.search(r"\bn=([0-7])\b", report_text):
        fail("report exposes low denominator n<8")
    if "median s" in report_text or "delta s" in report_text or "avg s" in report_text:
        fail("report contains unformatted missing second values")


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        expected_hash = dataset_hash()
        counts = expected_counts(dataset)
        validate_laps(expected_hash, counts)
        validate_stints_and_drivers(expected_hash, counts)
        validate_hourly_and_context(expected_hash, counts)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
