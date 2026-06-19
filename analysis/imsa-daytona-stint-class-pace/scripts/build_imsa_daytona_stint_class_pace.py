#!/usr/bin/env python3
"""Build IMSA Daytona stint/class pace artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/imsa-daytona-stint-class-pace"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
IMSA_ID = "series_imsa_weathertech"
SESSION_ID = "session_imsa_2025_daytona_rolex_24_race"
CAR_85_ID = "car_imsa_2025_jdc_miller_motorsports_85"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def dataset_hash() -> str:
    h = hashlib.sha256()
    with DATASET_PATH.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_dataset() -> dict[str, Any]:
    with DATASET_PATH.open() as f:
        return json.load(f)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def fmt(value: Any, digits: int = 4) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return round(value, digits)
    return value


def fmt_seconds(value: Any, digits: int = 3) -> str:
    formatted = fmt(value, digits)
    return f"{formatted}s" if formatted != "" else "n/a"


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: fmt(row.get(field)) for field in fields})


def parse_time_seconds(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    try:
        parts = text.split(":")
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return None
    return None


def median(values: Iterable[float | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def quantile(values: Iterable[float | None], q: float) -> float | None:
    clean = sorted(float(value) for value in values if value is not None)
    if not clean:
        return None
    if len(clean) == 1:
        return clean[0]
    idx = (len(clean) - 1) * q
    lo = math.floor(idx)
    hi = math.ceil(idx)
    if lo == hi:
        return clean[lo]
    return clean[lo] + (clean[hi] - clean[lo]) * (idx - lo)


def percentile_lower_is_better(values: list[float], value: float) -> tuple[int | None, float | None]:
    if len(values) < 8:
        return None, None
    ordered = sorted(values)
    rank = 1 + sum(1 for item in ordered if item < value)
    return rank, 1 - ((rank - 1) / (len(ordered) - 1))


def best_window_average(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    best = min(sum(values[i : i + window]) / window for i in range(0, len(values) - window + 1))
    return float(best)


def yes_no(value: Any) -> str:
    return "yes" if value is True or value == "yes" else "no"


def driver_name(driver: dict[str, Any] | None, driver_id: str) -> str:
    if not driver:
        return driver_id
    return driver.get("displayName") or " ".join(part for part in [driver.get("givenName"), driver.get("familyName")] if part) or driver_id


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "events": {row["id"]: row for row in data["events"]},
        "sessions": {row["id"]: row for row in data["sessions"]},
        "tracks": {row["id"]: row for row in data["tracks"]},
        "drivers": {row["id"]: row for row in data["drivers"]},
        "cars": {row["id"]: row for row in data["cars"]},
        "teams": {row["id"]: row for row in data["teams"]},
    }


def event_context(idx: dict[str, Any]) -> dict[str, Any]:
    session = idx["sessions"][SESSION_ID]
    event = idx["events"][session["eventId"]]
    track = idx["tracks"][event["trackId"]]
    return {
        "sessionId": SESSION_ID,
        "eventId": event["id"],
        "seasonYear": event["seasonYear"],
        "raceLabel": f"{event['seasonYear']} {event['name']}",
        "trackName": track.get("name") or "Daytona International Speedway",
    }


def imsa_laps(data: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    session = idx["sessions"].get(SESSION_ID)
    if not session or session.get("sessionType") != "race" or idx["events"].get(session.get("eventId"), {}).get("seriesId") != IMSA_ID:
        raise ValueError(f"{SESSION_ID} is not an IMSA race session in the canonical dataset")
    return sorted(
        [row for row in data["lapSamples"] if row.get("sessionId") == SESSION_ID],
        key=lambda row: (str(row.get("carNumber") or ""), int(row.get("lapNumber") or 0), str(row.get("driverId") or "")),
    )


def build_lap_observations(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    context = event_context(idx)
    raw_laps = imsa_laps(data, idx)
    class_hour_values: dict[tuple[str, int], list[float]] = defaultdict(list)
    overall_hour_values: dict[int, list[float]] = defaultdict(list)
    parsed_rows: list[dict[str, Any]] = []

    for lap in raw_laps:
        lap_time = parse_time_seconds(lap.get("lapTime"))
        elapsed = parse_time_seconds(lap.get("sessionElapsed"))
        hour = int(elapsed // 3600) if elapsed is not None else None
        is_valid = lap.get("isValid") is True
        pit_in = lap.get("pitIn") is True
        pit_out = lap.get("pitOut") is True
        valid_nonpit = bool(is_valid and not pit_in and not pit_out and lap_time is not None)
        parsed = {
            **context,
            "carId": lap.get("carId"),
            "carNumber": lap.get("carNumber"),
            "class": lap.get("class") or "",
            "driverId": lap.get("driverId") or "",
            "driverName": driver_name(idx["drivers"].get(lap.get("driverId")), lap.get("driverId") or ""),
            "lapNumber": int(lap.get("lapNumber") or 0),
            "sessionHour": hour,
            "lapTimeSeconds": lap_time,
            "sector1Seconds": parse_time_seconds(lap.get("sector1")),
            "sector2Seconds": parse_time_seconds(lap.get("sector2")),
            "sector3Seconds": parse_time_seconds(lap.get("sector3")),
            "averageSpeedKph": lap.get("averageSpeedKph"),
            "isValid": yes_no(is_valid),
            "pitIn": yes_no(pit_in),
            "pitOut": yes_no(pit_out),
            "validNonPitLap": yes_no(valid_nonpit),
            "sourceState": "official_alkamel_time_cards",
            "sourceHash": source_hash,
        }
        parsed_rows.append(parsed)
        if valid_nonpit and hour is not None and lap_time is not None:
            class_hour_values[(parsed["class"], hour)].append(lap_time)
            overall_hour_values[hour].append(lap_time)

    for row in parsed_rows:
        hour = row["sessionHour"]
        lap_time = row["lapTimeSeconds"]
        class_values = class_hour_values.get((row["class"], hour), []) if hour is not None else []
        overall_values = overall_hour_values.get(hour, []) if hour is not None else []
        class_median = median(class_values)
        overall_median = median(overall_values)
        class_rank, class_pct = percentile_lower_is_better(class_values, lap_time) if row["validNonPitLap"] == "yes" and lap_time is not None else (None, None)
        _overall_rank, overall_pct = percentile_lower_is_better(overall_values, lap_time) if row["validNonPitLap"] == "yes" and lap_time is not None else (None, None)
        row.update(
            {
                "classHourMedianLapSeconds": class_median,
                "deltaToClassHourMedianSeconds": lap_time - class_median if row["validNonPitLap"] == "yes" and class_median is not None and lap_time is not None else None,
                "deltaToOverallHourMedianSeconds": lap_time - overall_median if row["validNonPitLap"] == "yes" and overall_median is not None and lap_time is not None else None,
                "classHourRank": class_rank,
                "classHourPercentile": class_pct,
                "overallHourPercentile": overall_pct,
            }
        )
    return parsed_rows


def summarize_stint(rows: list[dict[str, Any]], stint_index: int, driver_stint_index: int, source_hash: str) -> dict[str, Any]:
    valid_laps = [row for row in rows if row["isValid"] == "yes"]
    valid_nonpit = [row for row in rows if row["validNonPitLap"] == "yes"]
    valid_times = [row["lapTimeSeconds"] for row in valid_laps if row.get("lapTimeSeconds") is not None]
    valid_nonpit_times = [row["lapTimeSeconds"] for row in valid_nonpit if row.get("lapTimeSeconds") is not None]
    deltas_class = [row.get("deltaToClassHourMedianSeconds") for row in valid_nonpit if row.get("deltaToClassHourMedianSeconds") is not None]
    deltas_overall = [row.get("deltaToOverallHourMedianSeconds") for row in valid_nonpit if row.get("deltaToOverallHourMedianSeconds") is not None]
    first = rows[0]
    last = rows[-1]
    return {
        "sessionId": first["sessionId"],
        "stintId": f"imsa_2025_daytona_{first['carNumber']}_stint_{stint_index:03d}",
        "carId": first["carId"],
        "carNumber": first["carNumber"],
        "class": first["class"],
        "driverId": first["driverId"],
        "driverName": first["driverName"],
        "stintIndexForCar": stint_index,
        "driverStintIndex": driver_stint_index,
        "startLap": first["lapNumber"],
        "endLap": last["lapNumber"],
        "lapCount": len(rows),
        "validLapCount": len(valid_laps),
        "validNonPitLapCount": len(valid_nonpit),
        "pitInLapCount": sum(1 for row in rows if row["pitIn"] == "yes"),
        "pitOutLapCount": sum(1 for row in rows if row["pitOut"] == "yes"),
        "startSessionHour": first["sessionHour"],
        "endSessionHour": last["sessionHour"],
        "medianValidLapSeconds": median(valid_times),
        "medianValidNonPitLapSeconds": median(valid_nonpit_times),
        "bestValidLapSeconds": min(valid_times) if valid_times else None,
        "best20LapAverageSeconds": best_window_average(valid_nonpit_times, 20),
        "medianDeltaToClassHourSeconds": median(deltas_class),
        "medianDeltaToOverallHourSeconds": median(deltas_overall),
        "medianSector1Seconds": median(row.get("sector1Seconds") for row in valid_nonpit),
        "medianSector2Seconds": median(row.get("sector2Seconds") for row in valid_nonpit),
        "medianSector3Seconds": median(row.get("sector3Seconds") for row in valid_nonpit),
        "sourceState": "official_alkamel_time_cards_driver_stint",
        "sourceHash": source_hash,
    }


def build_stints(observations: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_car: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        by_car[row["carId"]].append(row)

    stint_rows: list[dict[str, Any]] = []
    for car_id, rows in sorted(by_car.items()):
        ordered = sorted(rows, key=lambda row: int(row["lapNumber"]))
        current: list[dict[str, Any]] = []
        car_stint_index = 0
        driver_stint_counts: dict[str, int] = defaultdict(int)
        previous: dict[str, Any] | None = None
        for row in ordered:
            new_stint = False
            if not current:
                new_stint = True
            elif previous is not None:
                if row["driverId"] != previous["driverId"]:
                    new_stint = True
                if previous["pitIn"] == "yes":
                    new_stint = True
                if int(row["lapNumber"]) != int(previous["lapNumber"]) + 1:
                    new_stint = True
            if new_stint and current:
                car_stint_index += 1
                driver_id = current[0]["driverId"]
                driver_stint_counts[driver_id] += 1
                stint_rows.append(summarize_stint(current, car_stint_index, driver_stint_counts[driver_id], source_hash))
                current = []
            current.append(row)
            previous = row
        if current:
            car_stint_index += 1
            driver_id = current[0]["driverId"]
            driver_stint_counts[driver_id] += 1
            stint_rows.append(summarize_stint(current, car_stint_index, driver_stint_counts[driver_id], source_hash))
    return stint_rows


def class_rank(rows: list[dict[str, Any]], value_field: str, rank_field: str, pct_field: str, count_field: str) -> None:
    by_class: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row.get(value_field) is not None and int(row.get("validNonPitLapCount") or 0) >= 10:
            by_class[row["class"]].append(row)
    for class_rows in by_class.values():
        ordered = sorted(class_rows, key=lambda row: float(row[value_field]))
        denominator = len(ordered)
        for index, row in enumerate(ordered, start=1):
            if denominator >= 8:
                row[rank_field] = index
                row[pct_field] = 1 - ((index - 1) / (denominator - 1))
                row[count_field] = denominator


def build_driver_summaries(
    observations: list[dict[str, Any]],
    stints: list[dict[str, Any]],
    idx: dict[str, Any],
    source_hash: str,
) -> list[dict[str, Any]]:
    by_driver_car: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    stint_count_by_driver_car: dict[tuple[str, str], int] = defaultdict(int)
    stint_best20_by_driver_car: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in observations:
        by_driver_car[(row["driverId"], row["carId"])].append(row)
    for row in stints:
        key = (row["driverId"], row["carId"])
        stint_count_by_driver_car[key] += 1
        if row.get("best20LapAverageSeconds") is not None:
            stint_best20_by_driver_car[key].append(row["best20LapAverageSeconds"])

    summaries: list[dict[str, Any]] = []
    for (driver_id, car_id), rows in sorted(by_driver_car.items(), key=lambda item: (item[0][1], item[0][0])):
        first = rows[0]
        car = idx["cars"].get(car_id, {})
        team = idx["teams"].get(car.get("teamId"), {})
        driver = idx["drivers"].get(driver_id, {})
        valid = [row for row in rows if row["isValid"] == "yes"]
        valid_nonpit = [row for row in rows if row["validNonPitLap"] == "yes"]
        valid_times = [row["lapTimeSeconds"] for row in valid if row.get("lapTimeSeconds") is not None]
        valid_nonpit_times = [row["lapTimeSeconds"] for row in valid_nonpit if row.get("lapTimeSeconds") is not None]
        summaries.append(
            {
                "driverId": driver_id,
                "driverName": first["driverName"],
                "driverLicense": (driver.get("externalIds") or {}).get("imsaLicense") or "",
                "carId": car_id,
                "carNumber": first["carNumber"],
                "teamId": car.get("teamId") or "",
                "teamName": team.get("name") or car.get("entrant") or "",
                "class": first["class"],
                "vehicle": car.get("chassis") or "",
                "lapCount": len(rows),
                "validLapCount": len(valid),
                "validNonPitLapCount": len(valid_nonpit),
                "stintCount": stint_count_by_driver_car[(driver_id, car_id)],
                "bestValidLapSeconds": min(valid_times) if valid_times else None,
                "medianValidNonPitLapSeconds": median(valid_nonpit_times),
                "best20LapAverageSeconds": min(stint_best20_by_driver_car[(driver_id, car_id)], default=None),
                "medianDeltaToClassHourSeconds": median(row.get("deltaToClassHourMedianSeconds") for row in valid_nonpit),
                "medianDeltaToOverallHourSeconds": median(row.get("deltaToOverallHourMedianSeconds") for row in valid_nonpit),
                "medianSector1Seconds": median(row.get("sector1Seconds") for row in valid_nonpit),
                "medianSector2Seconds": median(row.get("sector2Seconds") for row in valid_nonpit),
                "medianSector3Seconds": median(row.get("sector3Seconds") for row in valid_nonpit),
                "classDriverCount": None,
                "classMedianDriverCount": None,
                "classMedianRank": None,
                "classMedianPercentile": None,
                "classBest20DriverCount": None,
                "classBest20Rank": None,
                "classBest20Percentile": None,
                "sourceState": "official_alkamel_time_cards_driver_summary",
                "sourceHash": source_hash,
            }
        )
    class_rank(summaries, "medianValidNonPitLapSeconds", "classMedianRank", "classMedianPercentile", "classMedianDriverCount")
    class_rank(summaries, "best20LapAverageSeconds", "classBest20Rank", "classBest20Percentile", "classBest20DriverCount")
    for row in summaries:
        row["classDriverCount"] = row.get("classMedianDriverCount")
    return summaries


def build_car85_codriver_rows(driver_summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = [dict(row) for row in driver_summaries if row["carId"] == CAR_85_ID]
    ordered_by_median = sorted([row for row in rows if row.get("medianValidNonPitLapSeconds") is not None], key=lambda row: row["medianValidNonPitLapSeconds"])
    best_median = ordered_by_median[0]["medianValidNonPitLapSeconds"] if ordered_by_median else None
    total_laps = sum(int(row.get("lapCount") or 0) for row in rows)
    for index, row in enumerate(ordered_by_median, start=1):
        row["car85MedianRank"] = index
        row["car85MedianDeltaToBestSeconds"] = row["medianValidNonPitLapSeconds"] - best_median if best_median is not None else None
    median_rank_by_driver = {row["driverId"]: row for row in ordered_by_median}
    ordered_by_best20 = sorted([row for row in rows if row.get("best20LapAverageSeconds") is not None], key=lambda row: row["best20LapAverageSeconds"])
    best20_rank = {row["driverId"]: index for index, row in enumerate(ordered_by_best20, start=1)}
    for row in rows:
        ranked = median_rank_by_driver.get(row["driverId"], row)
        row.update(
            {
                "role": "Bryce" if row["driverId"] == BRYCE_ID else "co-driver",
                "lapShareOfCar85": (int(row.get("lapCount") or 0) / total_laps) if total_laps else None,
                "car85MedianRank": ranked.get("car85MedianRank"),
                "car85MedianDeltaToBestSeconds": ranked.get("car85MedianDeltaToBestSeconds"),
                "car85Best20Rank": best20_rank.get(row["driverId"]),
                "sourceState": "official_alkamel_time_cards_car85_codriver_summary",
            }
        )
    rows.sort(key=lambda row: (row.get("car85MedianRank") or 99, row["driverName"]))
    return rows


def build_hourly_class_pace(observations: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_class_hour: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    by_hour: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        if row["validNonPitLap"] != "yes" or row.get("sessionHour") is None:
            continue
        by_class_hour[(row["class"], int(row["sessionHour"]))].append(row)
        by_hour[int(row["sessionHour"])].append(row)

    rows: list[dict[str, Any]] = []
    for (class_name, hour), lap_rows in sorted(by_class_hour.items(), key=lambda item: (item[0][1], item[0][0])):
        times = [row["lapTimeSeconds"] for row in lap_rows if row.get("lapTimeSeconds") is not None]
        if len(times) < 8:
            continue
        overall_times = [row["lapTimeSeconds"] for row in by_hour[hour] if row.get("lapTimeSeconds") is not None]
        class_median = median(times)
        overall_median = median(overall_times)
        rows.append(
            {
                "sessionId": SESSION_ID,
                "sessionHour": hour,
                "class": class_name,
                "validNonPitLapCount": len(times),
                "driverCount": len({row["driverId"] for row in lap_rows}),
                "carCount": len({row["carId"] for row in lap_rows}),
                "medianLapSeconds": class_median,
                "p25LapSeconds": quantile(times, 0.25),
                "p75LapSeconds": quantile(times, 0.75),
                "bestLapSeconds": min(times),
                "overallHourMedianLapSeconds": overall_median,
                "classToOverallMedianDeltaSeconds": class_median - overall_median if class_median is not None and overall_median is not None else None,
                "sourceState": "official_alkamel_time_cards_hourly_class_pace",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_bryce_stint_context(stints: list[dict[str, Any]], car85_rows: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    codriver_medians = [
        row.get("medianValidNonPitLapSeconds")
        for row in car85_rows
        if row.get("driverId") != BRYCE_ID and row.get("medianValidNonPitLapSeconds") is not None
    ]
    codriver_median = median(codriver_medians)
    rows = []
    for row in stints:
        if row["driverId"] != BRYCE_ID:
            continue
        out = dict(row)
        out["bryceMedianMinusCar85CoDriverMedianSeconds"] = (
            row.get("medianValidNonPitLapSeconds") - codriver_median
            if row.get("medianValidNonPitLapSeconds") is not None and codriver_median is not None
            else None
        )
        out["sourceState"] = "official_alkamel_time_cards_bryce_stint_context"
        out["sourceHash"] = source_hash
        rows.append(out)
    rows.sort(key=lambda row: int(row["startLap"]))
    return rows


def stint_hours(stints: list[dict[str, Any]]) -> set[int]:
    hours: set[int] = set()
    for row in stints:
        start = row.get("startSessionHour")
        end = row.get("endSessionHour")
        if start in (None, "") or end in (None, ""):
            continue
        for hour in range(int(start), int(end) + 1):
            hours.add(hour)
    return hours


def official_weather(data: dict[str, Any]) -> dict[str, Any]:
    for row in data.get("weatherObservations", []):
        if row.get("sessionId") == SESSION_ID:
            return {
                "ambientTempC": row.get("ambientTempC"),
                "trackTempC": row.get("trackTempC"),
                "trackCondition": row.get("trackCondition"),
                "wetDry": row.get("wetDry"),
                "source": row.get("source"),
                "confidence": row.get("confidence"),
            }
    return {}


def car85_result(data: dict[str, Any], idx: dict[str, Any]) -> dict[str, Any]:
    result = next((row for row in data["results"] if row.get("carId") == CAR_85_ID and row.get("driverId") == BRYCE_ID), {})
    car = idx["cars"].get(CAR_85_ID, {})
    team = idx["teams"].get(car.get("teamId"), {})
    return {
        "carNumber": car.get("carNumber"),
        "teamName": team.get("name") or car.get("entrant"),
        "class": car.get("class"),
        "vehicle": car.get("chassis"),
        "finishPosition": result.get("finishPosition"),
        "classFinishPosition": result.get("classFinishPosition"),
        "lapsCompleted": result.get("lapsCompleted"),
        "status": result.get("status"),
        "bestLapTime": result.get("bestLapTime"),
        "bestLapNumber": result.get("bestLapNumber"),
        "pitStops": result.get("pitStops"),
    }


def build_context_pack(
    generated_at: str,
    source_hash: str,
    counts: dict[str, int],
    weather: dict[str, Any],
    result_context: dict[str, Any],
    car85_rows: list[dict[str, Any]],
    bryce_stints: list[dict[str, Any]],
    hourly_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    bryce_hours = stint_hours(bryce_stints)
    relevant_hourly = [
        row
        for row in hourly_rows
        if row["class"] == "GTP" and int(row["sessionHour"]) in bryce_hours
    ]
    return {
        "id": "imsa-daytona-stint-class-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_descriptive_stint_class_pace",
        "publicPointPrediction": False,
        "positionTraceAvailable": False,
        "artifacts": [
            "imsa_lap_observations.csv",
            "imsa_stint_summary.csv",
            "imsa_driver_class_pace_summary.csv",
            "imsa_car85_codriver_pace.csv",
            "imsa_hourly_class_pace.csv",
            "bryce_imsa_stint_context.csv",
        ],
        "counts": counts,
        "officialWeather": weather,
        "car85Result": result_context,
        "car85CodriverPace": car85_rows,
        "bryceStintContext": bryce_stints,
        "gtpClassHoursDuringBryceStints": relevant_hourly,
        "displayRules": [
            "Use these artifacts for descriptive Daytona stint, co-driver, class, and hour-of-race pace context.",
            "Do not present lap-time pace as live telemetry, strategy root cause, or future race forecast.",
            "Use class-hour deltas before cross-class comparison because IMSA classes have different performance envelopes.",
            "Rows labeled validNonPitLap exclude Al Kamel invalid and pit laps but do not prove green-flag traffic-free conditions.",
        ],
    }


def render_report(
    generated_at: str,
    source_hash: str,
    counts: dict[str, int],
    weather: dict[str, Any],
    result_context: dict[str, Any],
    car85_rows: list[dict[str, Any]],
    bryce_stints: list[dict[str, Any]],
    hourly_rows: list[dict[str, Any]],
) -> str:
    codriver_lines = "\n".join(
        f"- {row['driverName']}: median {fmt_seconds(row.get('medianValidNonPitLapSeconds'))}, best 20-lap avg {fmt_seconds(row.get('best20LapAverageSeconds'))}, valid non-pit laps {row.get('validNonPitLapCount')}."
        for row in car85_rows
    )
    stint_lines = "\n".join(
        f"- L{row['startLap']}-{row['endLap']}: median {fmt_seconds(row.get('medianValidNonPitLapSeconds'))}, class-hour delta {fmt_seconds(row.get('medianDeltaToClassHourSeconds'))}, valid non-pit laps {row.get('validNonPitLapCount')}."
        for row in bryce_stints
    )
    bryce_hours = stint_hours(bryce_stints)
    class_lines = "\n".join(
        f"- Hour {row['sessionHour']} GTP: median {fmt_seconds(row.get('medianLapSeconds'))}, p25-p75 {fmt_seconds(row.get('p25LapSeconds'))}-{fmt_seconds(row.get('p75LapSeconds'))}, laps n={row.get('validNonPitLapCount')}."
        for row in hourly_rows
        if row["class"] == "GTP" and int(row["sessionHour"]) in bryce_hours
    )
    weather_line = (
        f"Official condition row: air {weather.get('ambientTempC')}C, track {weather.get('trackTempC')}C, "
        f"{weather.get('trackCondition') or weather.get('wetDry')}, confidence {weather.get('confidence')}."
        if weather
        else "No official IMSA weather row was available."
    )
    return f"""# IMSA Daytona Stint/Class Pace

Generated: `{generated_at}`
Source dataset: `data/career/career.dataset.json`
Source hash: `{source_hash}`

## Source Scope

This lane uses the official IMSA/Al Kamel Daytona time-card lap table, canonical IMSA car/team/driver metadata, the official race classification for car 85, and the official session condition row. The source supports lap-time, sector, pit, driver, car, class, and hour-of-race pace context. It does not expose live telemetry, setup, strategy notes, or lap-by-lap running order.

## What Became Productized

- `imsa_lap_observations.csv`: {counts['lapObservations']} official IMSA time-card laps with parsed lap/sector seconds and class-hour deltas.
- `imsa_stint_summary.csv`: {counts['stints']} full-field driver stint windows.
- `imsa_driver_class_pace_summary.csv`: {counts['driverSummaries']} driver/car pace summaries with class-denominator ranks.
- `imsa_car85_codriver_pace.csv`: car 85 co-driver pace summary for Bryce Aron, Gianmaria Bruni, Pascal Wehrlein, and Tijmen van der Helm.
- `bryce_imsa_stint_context.csv`: {counts['bryceStints']} Bryce stint rows.
- Context pack: `context-packs/imsa-daytona-stint-class-context.json`.

## Car 85 Co-Driver Pace

Car 85 context: JDC Miller MotorSports Porsche 963, GTP, finished overall P{result_context.get('finishPosition')} / class P{result_context.get('classFinishPosition')} with {result_context.get('lapsCompleted')} laps and {result_context.get('pitStops')} pit stops.

{codriver_lines}

## Bryce Stint Shape

{stint_lines}

## Class-Hour Context

{class_lines}

## Official Conditions

{weather_line}

## Caveats

- Valid non-pit laps exclude Al Kamel invalid and pit laps but are not a claim of traffic-free or green-flag conditions.
- Class-hour deltas are descriptive within the Daytona source. They are not a future performance forecast.
- Cross-class pace comparisons need class labels because GTP, LMP2, GTD PRO, and GTD have different performance envelopes.
- Co-driver comparisons are descriptive sports-car context, not a single-driver formula-series ranking.
"""


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    data = load_dataset()
    idx = build_indexes(data)
    source_hash = dataset_hash()
    generated_at = now_iso()

    observations = build_lap_observations(data, idx, source_hash)
    stints = build_stints(observations, source_hash)
    driver_summaries = build_driver_summaries(observations, stints, idx, source_hash)
    car85_rows = build_car85_codriver_rows(driver_summaries)
    bryce_stints = build_bryce_stint_context(stints, car85_rows, source_hash)
    hourly_rows = build_hourly_class_pace(observations, source_hash)
    weather = official_weather(data)
    result_context = car85_result(data, idx)
    counts = {
        "lapObservations": len(observations),
        "stints": len(stints),
        "driverSummaries": len(driver_summaries),
        "car85CodriverRows": len(car85_rows),
        "hourlyClassRows": len(hourly_rows),
        "bryceStints": len(bryce_stints),
    }
    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_descriptive_stint_class_pace",
        "publicPointPrediction": False,
        "positionTraceAvailable": False,
        "counts": counts,
        "officialWeather": weather,
        "car85Result": result_context,
        "caveats": [
            "Time-card laps expose timing, sectors, pit flags, driver, car, and class context, not live telemetry or setup.",
            "validNonPitLap excludes invalid and pit laps but does not certify green-flag or traffic-free conditions.",
            "Class-hour deltas are descriptive and source-bounded, not predictive.",
        ],
    }
    pack = build_context_pack(generated_at, source_hash, counts, weather, result_context, car85_rows, bryce_stints, hourly_rows)

    write_csv(
        OUTPUT_DIR / "imsa_lap_observations.csv",
        observations,
        [
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
            "classHourRank",
            "classHourPercentile",
            "overallHourPercentile",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "imsa_stint_summary.csv",
        stints,
        [
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
            "medianSector1Seconds",
            "medianSector2Seconds",
            "medianSector3Seconds",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "imsa_driver_class_pace_summary.csv",
        driver_summaries,
        [
            "driverId",
            "driverName",
            "driverLicense",
            "carId",
            "carNumber",
            "teamId",
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
            "medianSector1Seconds",
            "medianSector2Seconds",
            "medianSector3Seconds",
            "classDriverCount",
            "classMedianDriverCount",
            "classMedianRank",
            "classMedianPercentile",
            "classBest20DriverCount",
            "classBest20Rank",
            "classBest20Percentile",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "imsa_car85_codriver_pace.csv",
        car85_rows,
        [
            "role",
            "driverId",
            "driverName",
            "driverLicense",
            "carNumber",
            "teamName",
            "class",
            "vehicle",
            "lapCount",
            "lapShareOfCar85",
            "validLapCount",
            "validNonPitLapCount",
            "stintCount",
            "bestValidLapSeconds",
            "medianValidNonPitLapSeconds",
            "best20LapAverageSeconds",
            "medianDeltaToClassHourSeconds",
            "medianDeltaToOverallHourSeconds",
            "car85MedianRank",
            "car85MedianDeltaToBestSeconds",
            "car85Best20Rank",
            "classDriverCount",
            "classMedianDriverCount",
            "classMedianRank",
            "classMedianPercentile",
            "classBest20DriverCount",
            "classBest20Rank",
            "classBest20Percentile",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "imsa_hourly_class_pace.csv",
        hourly_rows,
        [
            "sessionId",
            "sessionHour",
            "class",
            "validNonPitLapCount",
            "driverCount",
            "carCount",
            "medianLapSeconds",
            "p25LapSeconds",
            "p75LapSeconds",
            "bestLapSeconds",
            "overallHourMedianLapSeconds",
            "classToOverallMedianDeltaSeconds",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "bryce_imsa_stint_context.csv",
        bryce_stints,
        [
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
            "startSessionHour",
            "endSessionHour",
            "medianValidLapSeconds",
            "medianValidNonPitLapSeconds",
            "bestValidLapSeconds",
            "best20LapAverageSeconds",
            "medianDeltaToClassHourSeconds",
            "medianDeltaToOverallHourSeconds",
            "bryceMedianMinusCar85CoDriverMedianSeconds",
            "sourceState",
            "sourceHash",
        ],
    )
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "imsa-daytona-stint-class-context.json", pack)
    (OUTPUT_DIR / "IMSA_DAYTONA_STINT_CLASS_PACE.md").write_text(
        render_report(generated_at, source_hash, counts, weather, result_context, car85_rows, bryce_stints, hourly_rows)
    )
    print(json.dumps({"ok": True, "output": str(OUTPUT_DIR.relative_to(ROOT)), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
