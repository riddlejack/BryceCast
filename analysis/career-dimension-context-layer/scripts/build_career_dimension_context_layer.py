#!/usr/bin/env python3
"""Build qualifying/team/track/driver/car dimension context artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/career-dimension-context-layer"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"


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


def csv_value(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return round(value, 4)
    if isinstance(value, (list, dict)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"))
    return value


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: csv_value(row.get(field)) for field in fields})


def text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def yes_no(value: Any) -> str:
    return "yes" if value is True or value == "yes" else "no"


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def parse_time_seconds(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    clean = str(value).strip().replace("+", "")
    if not clean or clean in {"-", "--"}:
        return None
    try:
        parts = clean.split(":")
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return None
    return None


def median(values: Iterable[float | int | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def provenance_count(row: dict[str, Any]) -> int:
    refs = row.get("provenanceRefs") or []
    return len(refs) if isinstance(refs, list) else 0


def index_by_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {row["id"]: row for row in rows}


def build_indexes(data: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "cars": index_by_id(data.get("cars", [])),
        "drivers": index_by_id(data.get("drivers", [])),
        "events": index_by_id(data.get("events", [])),
        "sessions": index_by_id(data.get("sessions", [])),
        "series": index_by_id(data.get("series", [])),
        "teams": index_by_id(data.get("teams", [])),
        "tracks": index_by_id(data.get("tracks", [])),
    }


def driver_name(idx: dict[str, Any], driver_id: str | None) -> str:
    if not driver_id:
        return ""
    driver = idx["drivers"].get(driver_id)
    if not driver:
        return driver_id
    return driver.get("displayName") or " ".join(part for part in [driver.get("givenName"), driver.get("familyName")] if part) or driver_id


def team_name(idx: dict[str, Any], team_id: str | None) -> str:
    if not team_id:
        return ""
    return idx["teams"].get(team_id, {}).get("name") or team_id


def series_name(idx: dict[str, Any], series_id: str | None) -> str:
    if not series_id:
        return ""
    return idx["series"].get(series_id, {}).get("name") or series_id


def session_context(idx: dict[str, Any], session_id: str | None) -> dict[str, Any]:
    session = idx["sessions"].get(session_id or "", {})
    event = idx["events"].get(session.get("eventId") or "", {})
    track = idx["tracks"].get(event.get("trackId") or "", {})
    return {
        "sessionId": session_id or "",
        "sessionName": session.get("sessionName") or "",
        "sessionType": session.get("sessionType") or "",
        "raceNumber": session.get("raceNumber"),
        "eventId": event.get("id") or "",
        "eventName": event.get("name") or "",
        "seasonYear": event.get("seasonYear") or "",
        "seriesId": event.get("seriesId") or "",
        "seriesName": series_name(idx, event.get("seriesId")),
        "trackId": event.get("trackId") or "",
        "trackName": track.get("name") or "",
        "trackType": track.get("trackType") or "",
    }


def track_archetype(track: dict[str, Any]) -> str:
    track_type = track.get("trackType") or "unknown"
    if track.get("temporary") is True:
        track_type = f"temporary_{track_type}"
    length = track.get("lengthKm")
    if isinstance(length, (int, float)):
        if length < 2.5:
            length_bucket = "short"
        elif length < 4.5:
            length_bucket = "medium"
        else:
            length_bucket = "long"
    else:
        length_bucket = "unknown_length"
    corners = track.get("cornerCount")
    if isinstance(corners, (int, float)):
        if corners <= 8:
            corner_bucket = "low_corner_count"
        elif corners <= 14:
            corner_bucket = "medium_corner_count"
        else:
            corner_bucket = "high_corner_count"
    else:
        corner_bucket = "unknown_corners"
    return f"{track_type}_{length_bucket}_{corner_bucket}"


def result_sort_key(row: dict[str, Any], idx: dict[str, Any]) -> tuple[int, str]:
    session = idx["sessions"].get(row.get("sessionId") or "", {})
    race_number = safe_int(session.get("raceNumber"))
    return (race_number if race_number is not None else 99, row.get("sessionId") or "")


def build_event_driver_race_results(data: dict[str, Any], idx: dict[str, Any]) -> dict[tuple[str, str], list[dict[str, Any]]]:
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for result in data.get("results", []):
        ctx = session_context(idx, result.get("sessionId"))
        if ctx["sessionType"] != "race" or not ctx["eventId"] or not result.get("driverId"):
            continue
        grouped[(ctx["eventId"], result["driverId"])].append(result)
    for key, rows in grouped.items():
        rows.sort(key=lambda row: result_sort_key(row, idx))
    return grouped


def build_result_context(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for row in data.get("results", []):
        ctx = session_context(idx, row.get("sessionId"))
        car = idx["cars"].get(row.get("carId") or "", {})
        start = safe_int(row.get("startPosition") or row.get("gridPosition"))
        finish = safe_int(row.get("finishPosition"))
        finish_percentile = row.get("finishPercentile")
        finish_percentile_state = "missing_finish_percentile"
        if finish_percentile not in (None, ""):
            try:
                finish_percentile_value = float(finish_percentile)
                finish_percentile_state = "finish_percentile_bounded_0_1" if 0 <= finish_percentile_value <= 1 else "finish_percentile_source_value_out_of_range"
            except (TypeError, ValueError):
                finish_percentile_state = "finish_percentile_non_numeric_source_value"
        rows.append(
            {
                "resultId": row.get("id"),
                **ctx,
                "driverId": row.get("driverId") or "",
                "driverName": driver_name(idx, row.get("driverId")),
                "teamId": row.get("teamId") or "",
                "teamName": team_name(idx, row.get("teamId")),
                "carId": row.get("carId") or "",
                "carNumber": car.get("carNumber") or row.get("carNumber") or "",
                "class": row.get("class") or "",
                "resultGrain": row.get("resultGrain") or "driver",
                "gridPosition": row.get("gridPosition"),
                "startPosition": row.get("startPosition"),
                "finishPosition": row.get("finishPosition"),
                "classifiedPosition": row.get("classifiedPosition"),
                "finishPercentile": finish_percentile,
                "finishPercentileSourceState": finish_percentile_state,
                "fieldSize": row.get("fieldSize"),
                "classFieldSize": row.get("classFieldSize"),
                "classFinishPosition": row.get("classFinishPosition"),
                "classFinishPercentile": row.get("classFinishPercentile"),
                "startToFinishDelta": (start - finish) if start is not None and finish is not None else "",
                "lapsCompleted": row.get("lapsCompleted"),
                "lapsScheduled": row.get("lapsScheduled"),
                "lapsLed": row.get("lapsLed"),
                "points": row.get("points"),
                "status": row.get("status") or "",
                "statusRaw": row.get("statusRaw") or "",
                "bestLapRank": row.get("bestLapRank"),
                "pitStops": row.get("pitStops"),
                "penaltyRefCount": len(row.get("penaltyRefs") or []),
                "incidentRefCount": len(row.get("incidentRefs") or []),
                "provenanceRefCount": provenance_count(row),
                "sourceResultId": row.get("sourceResultId") or "",
                "sourceState": "canonical_full_field_result_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(
        rows,
        key=lambda item: (
            item.get("seriesName") or "",
            str(item.get("seasonYear") or ""),
            item.get("eventName") or "",
            item.get("sessionId") or "",
            safe_int(item.get("finishPosition")) if safe_int(item.get("finishPosition")) is not None else 9999,
            item.get("driverName") or "",
        ),
    )


def build_qualifying_context(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    race_results = build_event_driver_race_results(data, idx)
    field_sizes = Counter((row.get("sessionId"), row.get("sessionSegment") or "") for row in data.get("qualifyingResults", []))
    max_positions: dict[tuple[str | None, str], int] = defaultdict(int)
    for row in data.get("qualifyingResults", []):
        key = (row.get("sessionId"), row.get("sessionSegment") or "")
        position = safe_int(row.get("position"))
        if position is not None:
            max_positions[key] = max(max_positions[key], position)
    rows = []
    for row in data.get("qualifyingResults", []):
        ctx = session_context(idx, row.get("sessionId"))
        position = safe_int(row.get("position"))
        group_key = (row.get("sessionId"), row.get("sessionSegment") or "")
        field_size = max(field_sizes[group_key], max_positions[group_key])
        percentile = 1 - ((position - 1) / (field_size - 1)) if position and field_size > 1 else None
        linked = race_results.get((ctx["eventId"], row.get("driverId") or ""), [])
        direct_conversion = len(linked) == 1
        numeric_finish_rows = [result for result in linked if safe_int(result.get("finishPosition")) is not None] if direct_conversion else []
        best_result = linked[0] if direct_conversion and linked else None
        if direct_conversion and numeric_finish_rows:
            best_result = numeric_finish_rows[0]
        best_finish = safe_int(best_result.get("finishPosition")) if best_result else None
        best_start = safe_int(best_result.get("startPosition") or best_result.get("gridPosition")) if best_result else None
        best_delta = (best_start - best_finish) if best_start is not None and best_finish is not None else None
        qual_to_finish = (position - best_finish) if position is not None and best_finish is not None else None
        if direct_conversion:
            conversion_state = "same_event_driver_race_result_one_to_one"
        elif len(linked) > 1:
            conversion_state = "same_event_multi_race_result_ambiguous"
        else:
            conversion_state = "no_same_event_race_result"
        if position is None:
            conversion_state = "missing_qualifying_position"
        car = idx["cars"].get(row.get("carId") or "", {})
        track = idx["tracks"].get(ctx["trackId"] or "", {})
        rows.append(
            {
                "qualifyingId": row.get("id"),
                **ctx,
                "driverId": row.get("driverId") or "",
                "driverName": driver_name(idx, row.get("driverId")),
                "teamId": row.get("teamId") or "",
                "teamName": team_name(idx, row.get("teamId")),
                "carId": row.get("carId") or "",
                "carNumber": car.get("carNumber") or (row.get("raw") or {}).get("carNumber") or "",
                "trackArchetype": track_archetype(track) if track else "",
                "position": position,
                "fieldSize": field_size,
                "qualifyingPercentile": percentile,
                "bestLapTimeSeconds": parse_time_seconds(row.get("bestLapTime")),
                "gapToPoleSeconds": parse_time_seconds(row.get("gapToPole")),
                "laps": row.get("laps"),
                "sessionSegment": row.get("sessionSegment") or "",
                "penaltyApplied": yes_no(row.get("penaltyApplied")),
                "gridPositionResulting": row.get("gridPositionResulting"),
                "linkedRaceResultCount": len(linked),
                "linkedRaceSessionIds": ";".join(result.get("sessionId") or "" for result in linked),
                "bestRaceSessionId": best_result.get("sessionId") if best_result else "",
                "bestRaceFinishPosition": best_finish,
                "bestRaceStartPosition": best_start,
                "bestStartToFinishDelta": best_delta,
                "qualifyToBestRaceFinishDelta": qual_to_finish,
                "bestRaceFieldSize": best_result.get("fieldSize") if best_result else "",
                "bestRaceFinishPercentile": best_result.get("finishPercentile") if best_result else "",
                "conversionSourceState": conversion_state,
                "conversionCaveat": "one-to-one same-event race result joined" if direct_conversion else "multiple same-event race results; direct qualifying conversion ambiguous" if len(linked) > 1 else "no same-event race result joined",
                "provenanceRefCount": provenance_count(row),
                "sourceHash": source_hash,
            }
        )
    return rows


def build_qualifying_session_summary(qual_rows: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in qual_rows:
        grouped[row["sessionId"]].append(row)
    rows = []
    for session_id, items in sorted(grouped.items()):
        first = items[0]
        positions = [safe_int(item.get("position")) for item in items if safe_int(item.get("position")) is not None]
        linked = [item for item in items if item.get("conversionSourceState") == "same_event_driver_race_result_one_to_one"]
        ambiguous = [item for item in items if item.get("conversionSourceState") == "same_event_multi_race_result_ambiguous"]
        bryce = [item for item in items if item.get("driverId") == BRYCE_ID]
        deltas = [item.get("qualifyToBestRaceFinishDelta") for item in linked if item.get("qualifyToBestRaceFinishDelta") not in ("", None)]
        rows.append(
            {
                "sessionId": session_id,
                "eventId": first.get("eventId"),
                "eventName": first.get("eventName"),
                "seriesId": first.get("seriesId"),
                "seriesName": first.get("seriesName"),
                "seasonYear": first.get("seasonYear"),
                "trackId": first.get("trackId"),
                "trackName": first.get("trackName"),
                "sessionName": first.get("sessionName"),
                "fieldSize": len(items),
                "positionMin": min(positions) if positions else "",
                "positionMax": max(positions) if positions else "",
                "sameEventRaceJoinRows": len(linked),
                "ambiguousSameEventRaceJoinRows": len(ambiguous),
                "sameEventRaceJoinShare": len(linked) / len(items) if items else "",
                "medianQualifyToBestRaceFinishDelta": median(deltas),
                "bryceQualifyingRows": len(bryce),
                "bryceBestQualifyingPosition": min([safe_int(item.get("position")) for item in bryce if safe_int(item.get("position")) is not None], default=""),
                "sourceHash": source_hash,
            }
        )
    return rows


def event_id_for_session(idx: dict[str, Any], session_id: str | None) -> str:
    return idx["sessions"].get(session_id or "", {}).get("eventId") or ""


def build_dimension_counts(data: dict[str, Any], idx: dict[str, Any]) -> dict[str, Any]:
    counts: dict[str, Any] = {
        "team_results": Counter(),
        "team_qual": Counter(),
        "team_cars": Counter(),
        "team_drivers": defaultdict(set),
        "team_bryce_results": Counter(),
        "team_bryce_qual": Counter(),
        "team_years": defaultdict(set),
        "team_series": defaultdict(set),
        "team_best_finish": defaultdict(list),
        "car_results": Counter(),
        "car_qual": Counter(),
        "car_laps": Counter(),
        "car_drivers": defaultdict(set),
        "car_sessions": defaultdict(set),
        "car_bryce": Counter(),
        "driver_results": Counter(),
        "driver_qual": Counter(),
        "driver_laps": Counter(),
        "driver_teams": defaultdict(set),
        "driver_cars": defaultdict(set),
        "driver_sessions": defaultdict(set),
        "driver_events": defaultdict(set),
        "driver_series": defaultdict(set),
        "driver_years": defaultdict(set),
        "driver_finishes": defaultdict(list),
        "track_events": Counter(),
        "track_sessions": Counter(),
        "track_results": Counter(),
        "track_qual": Counter(),
        "track_laps": Counter(),
        "track_weather": Counter(),
        "track_media": Counter(),
        "track_bryce_results": Counter(),
        "track_bryce_qual": Counter(),
        "track_bryce_finishes": defaultdict(list),
    }

    bryce_race_sessions = {
        result.get("sessionId")
        for result in data.get("results", [])
        if result.get("driverId") == BRYCE_ID and session_context(idx, result.get("sessionId"))["sessionType"] == "race"
    }
    bryce_event_team = {
        (event_id_for_session(idx, result.get("sessionId")), result.get("teamId"))
        for result in data.get("results", [])
        if result.get("driverId") == BRYCE_ID and result.get("teamId")
    } | {
        (event_id_for_session(idx, result.get("sessionId")), result.get("teamId"))
        for result in data.get("qualifyingResults", [])
        if result.get("driverId") == BRYCE_ID and result.get("teamId")
    }
    counts["bryce_race_sessions"] = bryce_race_sessions
    counts["bryce_event_team"] = bryce_event_team

    for car in data.get("cars", []):
        team_id = car.get("teamId")
        if team_id:
            counts["team_cars"][team_id] += 1
            counts["team_years"][team_id].add(car.get("seasonYear"))
            counts["team_series"][team_id].add(car.get("seriesId"))

    for result in data.get("results", []):
        ctx = session_context(idx, result.get("sessionId"))
        team_id = result.get("teamId")
        car_id = result.get("carId")
        driver_id = result.get("driverId")
        if team_id:
            counts["team_results"][team_id] += 1
            counts["team_drivers"][team_id].add(driver_id)
            counts["team_years"][team_id].add(ctx["seasonYear"])
            counts["team_series"][team_id].add(ctx["seriesId"])
            if result.get("driverId") == BRYCE_ID:
                counts["team_bryce_results"][team_id] += 1
            finish = safe_int(result.get("finishPosition"))
            if finish is not None:
                counts["team_best_finish"][team_id].append(finish)
        if car_id:
            counts["car_results"][car_id] += 1
            counts["car_drivers"][car_id].add(driver_id)
            counts["car_sessions"][car_id].add(result.get("sessionId"))
            if result.get("driverId") == BRYCE_ID:
                counts["car_bryce"][car_id] += 1
        if driver_id:
            counts["driver_results"][driver_id] += 1
            counts["driver_teams"][driver_id].add(team_id)
            counts["driver_cars"][driver_id].add(car_id)
            counts["driver_sessions"][driver_id].add(result.get("sessionId"))
            counts["driver_events"][driver_id].add(ctx["eventId"])
            counts["driver_series"][driver_id].add(ctx["seriesId"])
            counts["driver_years"][driver_id].add(ctx["seasonYear"])
            finish = safe_int(result.get("finishPosition"))
            if finish is not None:
                counts["driver_finishes"][driver_id].append(finish)
        if ctx["trackId"]:
            counts["track_results"][ctx["trackId"]] += 1
            if result.get("driverId") == BRYCE_ID:
                counts["track_bryce_results"][ctx["trackId"]] += 1
                finish = safe_int(result.get("finishPosition"))
                if finish is not None:
                    counts["track_bryce_finishes"][ctx["trackId"]].append(finish)

    for result in data.get("qualifyingResults", []):
        ctx = session_context(idx, result.get("sessionId"))
        team_id = result.get("teamId")
        car_id = result.get("carId")
        driver_id = result.get("driverId")
        if team_id:
            counts["team_qual"][team_id] += 1
            counts["team_drivers"][team_id].add(driver_id)
            counts["team_years"][team_id].add(ctx["seasonYear"])
            counts["team_series"][team_id].add(ctx["seriesId"])
            if driver_id == BRYCE_ID:
                counts["team_bryce_qual"][team_id] += 1
        if car_id:
            counts["car_qual"][car_id] += 1
            counts["car_drivers"][car_id].add(driver_id)
            counts["car_sessions"][car_id].add(result.get("sessionId"))
            if driver_id == BRYCE_ID:
                counts["car_bryce"][car_id] += 1
        if driver_id:
            counts["driver_qual"][driver_id] += 1
            counts["driver_teams"][driver_id].add(team_id)
            counts["driver_cars"][driver_id].add(car_id)
            counts["driver_sessions"][driver_id].add(result.get("sessionId"))
            counts["driver_events"][driver_id].add(ctx["eventId"])
            counts["driver_series"][driver_id].add(ctx["seriesId"])
            counts["driver_years"][driver_id].add(ctx["seasonYear"])
        if ctx["trackId"]:
            counts["track_qual"][ctx["trackId"]] += 1
            if driver_id == BRYCE_ID:
                counts["track_bryce_qual"][ctx["trackId"]] += 1

    for lap in data.get("lapSamples", []):
        ctx = session_context(idx, lap.get("sessionId"))
        car_id = lap.get("carId")
        driver_id = lap.get("driverId")
        if car_id:
            counts["car_laps"][car_id] += 1
            counts["car_sessions"][car_id].add(lap.get("sessionId"))
            if driver_id == BRYCE_ID:
                counts["car_bryce"][car_id] += 1
        if driver_id:
            counts["driver_laps"][driver_id] += 1
            counts["driver_sessions"][driver_id].add(lap.get("sessionId"))
            counts["driver_events"][driver_id].add(ctx["eventId"])
            counts["driver_series"][driver_id].add(ctx["seriesId"])
            counts["driver_years"][driver_id].add(ctx["seasonYear"])
        if ctx["trackId"]:
            counts["track_laps"][ctx["trackId"]] += 1

    for event in data.get("events", []):
        if event.get("trackId"):
            counts["track_events"][event["trackId"]] += 1
    for session in data.get("sessions", []):
        ctx = session_context(idx, session.get("id"))
        if ctx["trackId"]:
            counts["track_sessions"][ctx["trackId"]] += 1
    for weather in data.get("weatherObservations", []):
        track_id = weather.get("trackId") or session_context(idx, weather.get("sessionId"))["trackId"]
        if track_id:
            counts["track_weather"][track_id] += 1
    for media in data.get("mediaAssets", []):
        ctx = session_context(idx, media.get("sessionId"))
        if not ctx["trackId"] and media.get("eventId"):
            event = idx["events"].get(media.get("eventId"), {})
            ctx["trackId"] = event.get("trackId") or ""
        if ctx["trackId"]:
            counts["track_media"][ctx["trackId"]] += 1

    return counts


def semi(values: Iterable[Any]) -> str:
    return ";".join(str(value) for value in sorted({value for value in values if value not in (None, "")}))


def build_team_dimension(data: dict[str, Any], idx: dict[str, Any], counts: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for team in data.get("teams", []):
        team_id = team["id"]
        rows.append(
            {
                "teamId": team_id,
                "teamName": team.get("name") or "",
                "declaredSeriesIds": semi(team.get("seriesIds") or []),
                "observedSeriesIds": semi(counts["team_series"][team_id]),
                "seasonYears": semi(counts["team_years"][team_id]),
                "country": team.get("country") or "",
                "officialWebsite": team.get("officialWebsite") or "",
                "carCount": counts["team_cars"][team_id],
                "driverCount": len({driver for driver in counts["team_drivers"][team_id] if driver}),
                "qualifyingRows": counts["team_qual"][team_id],
                "resultRows": counts["team_results"][team_id],
                "bryceQualifyingRows": counts["team_bryce_qual"][team_id],
                "bryceResultRows": counts["team_bryce_results"][team_id],
                "bryceObserved": yes_no(counts["team_bryce_qual"][team_id] or counts["team_bryce_results"][team_id]),
                "bestObservedFinish": min(counts["team_best_finish"][team_id]) if counts["team_best_finish"][team_id] else "",
                "medianObservedFinish": median(counts["team_best_finish"][team_id]),
                "provenanceRefCount": provenance_count(team),
                "sourceState": "canonical_team_dimension_with_observed_result_qualifying_car_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: row["teamName"])


def build_team_era(team_rows: list[dict[str, Any]], data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, str], dict[str, Any]] = {}
    for car in data.get("cars", []):
        key = (car.get("teamId") or "", car.get("seriesId") or "", str(car.get("seasonYear") or ""))
        if not key[0]:
            continue
        grouped.setdefault(key, {"teamId": key[0], "seriesId": key[1], "seasonYear": key[2], "carIds": set(), "drivers": set(), "qualRows": 0, "resultRows": 0, "bryceRows": 0})
        grouped[key]["carIds"].add(car.get("id"))
    for source_name, collection in [("qualRows", data.get("qualifyingResults", [])), ("resultRows", data.get("results", []))]:
        for row in collection:
            ctx = session_context(idx, row.get("sessionId"))
            key = (row.get("teamId") or "", ctx["seriesId"], str(ctx["seasonYear"]))
            if not key[0]:
                continue
            grouped.setdefault(key, {"teamId": key[0], "seriesId": key[1], "seasonYear": key[2], "carIds": set(), "drivers": set(), "qualRows": 0, "resultRows": 0, "bryceRows": 0})
            grouped[key][source_name] += 1
            grouped[key]["drivers"].add(row.get("driverId"))
            if row.get("driverId") == BRYCE_ID:
                grouped[key]["bryceRows"] += 1
    rows = []
    for key, item in sorted(grouped.items()):
        rows.append(
            {
                "teamId": item["teamId"],
                "teamName": team_name(idx, item["teamId"]),
                "seriesId": item["seriesId"],
                "seriesName": series_name(idx, item["seriesId"]),
                "seasonYear": item["seasonYear"],
                "carCount": len(item["carIds"]),
                "driverCount": len({driver for driver in item["drivers"] if driver}),
                "qualifyingRows": item["qualRows"],
                "resultRows": item["resultRows"],
                "bryceRows": item["bryceRows"],
                "sourceState": "team_series_season_observed_context",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_track_venue(data: dict[str, Any], idx: dict[str, Any], counts: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for track in data.get("tracks", []):
        track_id = track["id"]
        rows.append(
            {
                "trackId": track_id,
                "trackName": track.get("name") or "",
                "canonicalName": track.get("canonicalName") or track.get("name") or "",
                "country": track.get("country") or "",
                "region": track.get("region") or "",
                "city": track.get("city") or "",
                "trackType": track.get("trackType") or "",
                "configuration": track.get("configuration") or "",
                "lengthKm": track.get("lengthKm"),
                "lengthMi": track.get("lengthMi"),
                "cornerCount": track.get("cornerCount"),
                "direction": track.get("direction") or "",
                "temporary": yes_no(track.get("temporary")),
                "archetype": track_archetype(track),
                "weatherJoinReady": yes_no(track.get("weatherJoinReady")),
                "metadataConfidenceTier": track.get("metadataConfidenceTier") or "",
                "eventCount": counts["track_events"][track_id],
                "sessionCount": counts["track_sessions"][track_id],
                "qualifyingRows": counts["track_qual"][track_id],
                "resultRows": counts["track_results"][track_id],
                "lapRows": counts["track_laps"][track_id],
                "weatherRows": counts["track_weather"][track_id],
                "mediaRows": counts["track_media"][track_id],
                "bryceQualifyingRows": counts["track_bryce_qual"][track_id],
                "bryceResultRows": counts["track_bryce_results"][track_id],
                "bryceBestFinish": min(counts["track_bryce_finishes"][track_id]) if counts["track_bryce_finishes"][track_id] else "",
                "isRoadAmerica": yes_no(track_id == "track_road_america"),
                "provenanceRefCount": provenance_count(track),
                "sourceState": "canonical_track_dimension_with_observed_event_session_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: row["trackName"])


def track_similarity(target: dict[str, Any], other: dict[str, Any]) -> tuple[float, list[str]]:
    score = 0.0
    weight = 0.0
    shared = []
    checks = [
        ("trackType", 0.3),
        ("temporary", 0.15),
        ("direction", 0.1),
        ("surface", 0.1),
    ]
    for field, field_weight in checks:
        if target.get(field) not in (None, "") and other.get(field) not in (None, ""):
            weight += field_weight
            if target.get(field) == other.get(field):
                score += field_weight
                shared.append(f"{field}={target.get(field)}")
    for field, field_weight in [("lengthKm", 0.25), ("cornerCount", 0.1)]:
        a = target.get(field)
        b = other.get(field)
        if isinstance(a, (int, float)) and isinstance(b, (int, float)) and max(abs(a), abs(b), 1) > 0:
            weight += field_weight
            closeness = 1 - min(abs(a - b) / max(abs(a), abs(b), 1), 1)
            score += field_weight * closeness
            if closeness >= 0.8:
                shared.append(f"similar_{field}")
    if weight == 0:
        return 0.0, []
    return score / weight, shared


def build_track_analogs(data: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    tracks = data.get("tracks", [])
    for target in tracks:
        scored = []
        for other in tracks:
            if other["id"] == target["id"]:
                continue
            score, shared = track_similarity(target, other)
            scored.append((score, shared, other))
        for rank, (score, shared, other) in enumerate(sorted(scored, key=lambda item: item[0], reverse=True)[:5], start=1):
            rows.append(
                {
                    "targetTrackId": target["id"],
                    "targetTrackName": target.get("name") or "",
                    "targetArchetype": track_archetype(target),
                    "analogTrackId": other["id"],
                    "analogTrackName": other.get("name") or "",
                    "analogArchetype": track_archetype(other),
                    "similarityRank": rank,
                    "similarityScore": score,
                    "sharedFeatures": ";".join(shared),
                    "sourceState": "metadata_archetype_similarity_not_setup_or_performance_causality",
                    "sourceHash": source_hash,
                }
            )
    return rows


def build_driver_cohorts(data: dict[str, Any], idx: dict[str, Any], counts: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    bryce_sessions = counts["bryce_race_sessions"]
    bryce_event_team = counts["bryce_event_team"]
    for driver in data.get("drivers", []):
        driver_id = driver["id"]
        shared_sessions = counts["driver_sessions"][driver_id] & bryce_sessions
        driver_event_team = set()
        for row in data.get("results", []) + data.get("qualifyingResults", []):
            if row.get("driverId") == driver_id and row.get("teamId"):
                driver_event_team.add((event_id_for_session(idx, row.get("sessionId")), row.get("teamId")))
        same_team_events = driver_event_team & bryce_event_team
        if driver_id == BRYCE_ID:
            cohort = "bryce"
        elif same_team_events:
            cohort = "teammate_overlap"
        elif shared_sessions:
            cohort = "shared_race_field"
        elif counts["driver_results"][driver_id] or counts["driver_qual"][driver_id] or counts["driver_laps"][driver_id]:
            cohort = "observed_competitor_or_codriver"
        else:
            cohort = "identity_only"
        rows.append(
            {
                "driverId": driver_id,
                "driverName": driver_name(idx, driver_id),
                "nationality": driver.get("nationality") or "",
                "hometown": driver.get("hometown") or "",
                "seriesIds": semi(counts["driver_series"][driver_id]),
                "seasonYears": semi(counts["driver_years"][driver_id]),
                "teamCount": len({team for team in counts["driver_teams"][driver_id] if team}),
                "carCount": len({car for car in counts["driver_cars"][driver_id] if car}),
                "eventCount": len({event for event in counts["driver_events"][driver_id] if event}),
                "sessionCount": len({session for session in counts["driver_sessions"][driver_id] if session}),
                "qualifyingRows": counts["driver_qual"][driver_id],
                "resultRows": counts["driver_results"][driver_id],
                "lapRows": counts["driver_laps"][driver_id],
                "bestObservedFinish": min(counts["driver_finishes"][driver_id]) if counts["driver_finishes"][driver_id] else "",
                "medianObservedFinish": median(counts["driver_finishes"][driver_id]),
                "sharedRaceSessionWithBryceCount": len(shared_sessions) if driver_id != BRYCE_ID else "",
                "sameTeamAsBryceEventCount": len(same_team_events) if driver_id != BRYCE_ID else "",
                "cohortLabel": cohort,
                "provenanceRefCount": provenance_count(driver),
                "sourceState": "canonical_driver_dimension_with_observed_cohort_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: row["driverName"])


def build_car_entrants(data: dict[str, Any], idx: dict[str, Any], counts: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for car in data.get("cars", []):
        car_id = car["id"]
        rows.append(
            {
                "carId": car_id,
                "seriesId": car.get("seriesId") or "",
                "seriesName": series_name(idx, car.get("seriesId")),
                "seasonYear": car.get("seasonYear") or "",
                "teamId": car.get("teamId") or "",
                "teamName": team_name(idx, car.get("teamId")),
                "entrant": car.get("entrant") or "",
                "carNumber": car.get("carNumber") or "",
                "class": car.get("class") or "",
                "chassis": car.get("chassis") or "",
                "engine": car.get("engine") or "",
                "tireSupplier": car.get("tireSupplier") or "",
                "driverCount": len({driver for driver in counts["car_drivers"][car_id] if driver}),
                "sessionCount": len({session for session in counts["car_sessions"][car_id] if session}),
                "qualifyingRows": counts["car_qual"][car_id],
                "resultRows": counts["car_results"][car_id],
                "lapRows": counts["car_laps"][car_id],
                "bryceObservedRows": counts["car_bryce"][car_id],
                "bryceObserved": yes_no(bool(counts["car_bryce"][car_id])),
                "provenanceRefCount": provenance_count(car),
                "sourceState": "canonical_car_dimension_with_entrant_and_observed_usage_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (row["seriesName"], str(row["seasonYear"]), row["teamName"], row["carNumber"]))


def compact_counter(counter: Counter[str], limit: int = 12) -> list[dict[str, Any]]:
    return [{"label": key, "count": value} for key, value in counter.most_common(limit)]


def top_rows(rows: Iterable[dict[str, Any]], key: str, limit: int = 10) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: float(row.get(key) or 0), reverse=True)[:limit]


def build_pack(
    result_rows: list[dict[str, Any]],
    qualifying_rows: list[dict[str, Any]],
    session_rows: list[dict[str, Any]],
    team_rows: list[dict[str, Any]],
    team_era_rows: list[dict[str, Any]],
    track_rows: list[dict[str, Any]],
    analog_rows: list[dict[str, Any]],
    driver_rows: list[dict[str, Any]],
    car_rows: list[dict[str, Any]],
    source_hash: str,
) -> dict[str, Any]:
    joined = [row for row in qualifying_rows if row["conversionSourceState"] == "same_event_driver_race_result_one_to_one"]
    ambiguous = [row for row in qualifying_rows if row["conversionSourceState"] == "same_event_multi_race_result_ambiguous"]
    bryce_qual = [row for row in qualifying_rows if row["driverId"] == BRYCE_ID]
    bryce_results = [row for row in result_rows if row["driverId"] == BRYCE_ID]
    road_america_analogs = [row for row in analog_rows if row["targetTrackId"] == "track_road_america"][:8]
    return {
        "generatedAt": now_iso(),
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_dimension_context_not_rating_or_forecast",
        "publicPointPrediction": False,
        "causalAttribution": False,
        "sourceScope": {
            "resultRows": len(result_rows),
            "qualifyingRows": len(qualifying_rows),
            "qualifyingSessions": len(session_rows),
            "qualifyingSessionRows": len(session_rows),
            "teamRows": len(team_rows),
            "teamEraRows": len(team_era_rows),
            "trackRows": len(track_rows),
            "trackAnalogRows": len(analog_rows),
            "driverRows": len(driver_rows),
            "carRows": len(car_rows),
        },
        "resultContext": {
            "rows": len(result_rows),
            "seriesCounts": compact_counter(Counter(row["seriesName"] for row in result_rows)),
            "resultGrainCounts": compact_counter(Counter(row["resultGrain"] for row in result_rows)),
            "bryceResultRows": len(bryce_results),
            "bryceExamples": [
                {
                    "seriesName": row["seriesName"],
                    "eventName": row["eventName"],
                    "sessionName": row["sessionName"],
                    "startPosition": row["startPosition"],
                    "finishPosition": row["finishPosition"],
                    "finishPercentile": row["finishPercentile"],
                    "status": row["status"],
                }
                for row in bryce_results[:12]
            ],
        },
        "qualifyingConversion": {
            "sameEventRaceJoinRows": len(joined),
            "sameEventRaceJoinShare": len(joined) / len(qualifying_rows) if qualifying_rows else 0,
            "ambiguousSameEventRaceJoinRows": len(ambiguous),
            "bryceQualifyingRows": len(bryce_qual),
            "bryceExamples": [
                {
                    "seriesName": row["seriesName"],
                    "eventName": row["eventName"],
                    "position": row["position"],
                    "fieldSize": row["fieldSize"],
                    "bestRaceFinishPosition": row["bestRaceFinishPosition"],
                    "qualifyToBestRaceFinishDelta": row["qualifyToBestRaceFinishDelta"],
                    "conversionSourceState": row["conversionSourceState"],
                }
                for row in bryce_qual[:12]
            ],
        },
        "teamAndEntrantContext": {
            "bryceTeams": [
                {
                    "teamName": row["teamName"],
                    "seasonYears": row["seasonYears"],
                    "qualifyingRows": row["bryceQualifyingRows"],
                    "resultRows": row["bryceResultRows"],
                }
                for row in team_rows
                if row["bryceObserved"] == "yes"
            ],
            "largestObservedTeams": top_rows(team_rows, "resultRows", 10),
        },
        "trackArchetypes": {
            "archetypeCounts": compact_counter(Counter(row["archetype"] for row in track_rows)),
            "roadAmericaAnalogs": road_america_analogs,
        },
        "driverCohorts": {
            "cohortCounts": compact_counter(Counter(row["cohortLabel"] for row in driver_rows)),
            "teammateOverlapExamples": [row for row in driver_rows if row["cohortLabel"] == "teammate_overlap"][:12],
        },
        "carEntrants": {
            "bryceCars": [row for row in car_rows if row["bryceObserved"] == "yes"][:16],
            "seriesCounts": compact_counter(Counter(row["seriesName"] for row in car_rows)),
        },
        "caveats": [
            "Qualifying conversion counts only one-to-one same-event race-result joins as direct conversions; double/triple-header same-event joins stay linked but ambiguous.",
            "Team, driver, and car context is descriptive source context; it is not engineering setup data.",
            "Track analogs use public/canonical venue metadata only and are meant for browsing and prep framing.",
            "Field and format differences remain visible through session, series, and source-state fields.",
        ],
    }


def markdown_table(rows: list[dict[str, Any]], fields: list[str], limit: int = 12) -> str:
    shown = rows[:limit]
    header = "| " + " | ".join(fields) + " |"
    sep = "| " + " | ".join("---" for _ in fields) + " |"
    body = []
    for row in shown:
        body.append("| " + " | ".join(text(csv_value(row.get(field))).replace("|", "\\|") for field in fields) + " |")
    return "\n".join([header, sep, *body])


def write_report(
    path: Path,
    result_rows: list[dict[str, Any]],
    qualifying_rows: list[dict[str, Any]],
    session_rows: list[dict[str, Any]],
    team_rows: list[dict[str, Any]],
    team_era_rows: list[dict[str, Any]],
    track_rows: list[dict[str, Any]],
    analog_rows: list[dict[str, Any]],
    driver_rows: list[dict[str, Any]],
    car_rows: list[dict[str, Any]],
    source_hash: str,
) -> None:
    joined = [row for row in qualifying_rows if row["conversionSourceState"] == "same_event_driver_race_result_one_to_one"]
    ambiguous = [row for row in qualifying_rows if row["conversionSourceState"] == "same_event_multi_race_result_ambiguous"]
    lines = [
        "# Career Dimension Context Layer",
        "",
        f"Generated: {now_iso()}",
        f"Source hash: `{source_hash}`",
        "",
        "## Source Scope",
        "",
        f"This lane covers {len(result_rows)} result rows, {len(qualifying_rows)} qualifying rows, {len(team_rows)} team rows, {len(track_rows)} tracks, {len(driver_rows)} drivers, and {len(car_rows)} cars from the canonical dataset.",
        "",
        "## What Became Productized",
        "",
        "- Full-field result rows with driver, team, car, series, track, field-size, finish-percentile, status, penalty, incident, and provenance context.",
        "- Qualifying-result rows with same-event race-result conversion joins and source-state labels.",
        "- Team and team-era context across observed cars, qualifying rows, result rows, drivers, and Bryce usage.",
        "- Track venue context, weather/readiness metadata, and metadata-based analog rows.",
        "- Driver cohort context for Bryce, teammate overlap, shared race fields, competitors, co-drivers, and identity-only rows.",
        "- Car/entrant context across series, season, team, class, usage rows, and Bryce observation flags.",
        "",
        "## Qualifying Conversion",
        "",
        f"- One-to-one same-event race-result joins: {len(joined)} of {len(qualifying_rows)} qualifying rows.",
        f"- Ambiguous multi-race same-event joins: {len(ambiguous)} qualifying rows.",
        f"- Full-field result context rows: {len(result_rows)}.",
        "",
        markdown_table(top_rows(session_rows, "sameEventRaceJoinRows", 12), ["seriesName", "seasonYear", "eventName", "sessionName", "fieldSize", "sameEventRaceJoinRows", "bryceBestQualifyingPosition"], limit=12),
        "",
        "## Team And Entrant Context",
        "",
        markdown_table(top_rows(team_rows, "resultRows", 12), ["teamName", "observedSeriesIds", "seasonYears", "carCount", "driverCount", "qualifyingRows", "resultRows", "bryceObserved"], limit=12),
        "",
        markdown_table(top_rows(team_era_rows, "resultRows", 12), ["teamName", "seriesName", "seasonYear", "carCount", "driverCount", "qualifyingRows", "resultRows", "bryceRows"], limit=12),
        "",
        "## Track Archetypes",
        "",
        markdown_table([row for row in analog_rows if row["targetTrackId"] == "track_road_america"], ["targetTrackName", "analogTrackName", "similarityRank", "similarityScore", "sharedFeatures"], limit=8),
        "",
        "## Driver Cohorts",
        "",
        markdown_table([row for row in driver_rows if row["cohortLabel"] in {"bryce", "teammate_overlap", "shared_race_field"}], ["driverName", "cohortLabel", "seriesIds", "teamCount", "resultRows", "qualifyingRows", "sharedRaceSessionWithBryceCount", "sameTeamAsBryceEventCount"], limit=16),
        "",
        "## Caveats",
        "",
        "- Qualifying conversion is descriptive and source-bounded; one qualifying session can map to multiple same-event race sessions.",
        "- Team, driver, and car context should not be used as private setup or engineering attribution.",
        "- Track analogs use metadata similarity only; they are a browsing/prep aid, not a performance-causality model.",
        "- Source format differences remain relevant across series and should stay visible in UI copy and filters.",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))


def main() -> int:
    data = load_dataset()
    source_hash = dataset_hash()
    idx = build_indexes(data)
    counts = build_dimension_counts(data, idx)

    qualifying_rows = build_qualifying_context(data, idx, source_hash)
    result_rows = build_result_context(data, idx, source_hash)
    session_rows = build_qualifying_session_summary(qualifying_rows, source_hash)
    team_rows = build_team_dimension(data, idx, counts, source_hash)
    team_era_rows = build_team_era(team_rows, data, idx, source_hash)
    track_rows = build_track_venue(data, idx, counts, source_hash)
    analog_rows = build_track_analogs(data, source_hash)
    driver_rows = build_driver_cohorts(data, idx, counts, source_hash)
    car_rows = build_car_entrants(data, idx, counts, source_hash)

    write_csv(
        OUTPUT_DIR / "result_context.csv",
        result_rows,
        [
            "resultId",
            "sessionId",
            "sessionName",
            "sessionType",
            "raceNumber",
            "eventId",
            "eventName",
            "seasonYear",
            "seriesId",
            "seriesName",
            "trackId",
            "trackName",
            "trackType",
            "driverId",
            "driverName",
            "teamId",
            "teamName",
            "carId",
            "carNumber",
            "class",
            "resultGrain",
            "gridPosition",
            "startPosition",
            "finishPosition",
            "classifiedPosition",
            "finishPercentile",
            "finishPercentileSourceState",
            "fieldSize",
            "classFieldSize",
            "classFinishPosition",
            "classFinishPercentile",
            "startToFinishDelta",
            "lapsCompleted",
            "lapsScheduled",
            "lapsLed",
            "points",
            "status",
            "statusRaw",
            "bestLapRank",
            "pitStops",
            "penaltyRefCount",
            "incidentRefCount",
            "provenanceRefCount",
            "sourceResultId",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "qualifying_result_context.csv",
        qualifying_rows,
        [
            "qualifyingId",
            "sessionId",
            "sessionName",
            "sessionType",
            "eventId",
            "eventName",
            "seasonYear",
            "seriesId",
            "seriesName",
            "trackId",
            "trackName",
            "trackType",
            "trackArchetype",
            "driverId",
            "driverName",
            "teamId",
            "teamName",
            "carId",
            "carNumber",
            "position",
            "fieldSize",
            "qualifyingPercentile",
            "bestLapTimeSeconds",
            "gapToPoleSeconds",
            "laps",
            "sessionSegment",
            "penaltyApplied",
            "gridPositionResulting",
            "linkedRaceResultCount",
            "linkedRaceSessionIds",
            "bestRaceSessionId",
            "bestRaceFinishPosition",
            "bestRaceStartPosition",
            "bestStartToFinishDelta",
            "qualifyToBestRaceFinishDelta",
            "bestRaceFieldSize",
            "bestRaceFinishPercentile",
            "conversionSourceState",
            "conversionCaveat",
            "provenanceRefCount",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "qualifying_session_conversion_summary.csv",
        session_rows,
        [
            "sessionId",
            "eventId",
            "eventName",
            "seriesId",
            "seriesName",
            "seasonYear",
            "trackId",
            "trackName",
            "sessionName",
            "fieldSize",
            "positionMin",
            "positionMax",
            "sameEventRaceJoinRows",
            "ambiguousSameEventRaceJoinRows",
            "sameEventRaceJoinShare",
            "medianQualifyToBestRaceFinishDelta",
            "bryceQualifyingRows",
            "bryceBestQualifyingPosition",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "team_dimension_context.csv",
        team_rows,
        [
            "teamId",
            "teamName",
            "declaredSeriesIds",
            "observedSeriesIds",
            "seasonYears",
            "country",
            "officialWebsite",
            "carCount",
            "driverCount",
            "qualifyingRows",
            "resultRows",
            "bryceQualifyingRows",
            "bryceResultRows",
            "bryceObserved",
            "bestObservedFinish",
            "medianObservedFinish",
            "provenanceRefCount",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "team_era_context.csv",
        team_era_rows,
        ["teamId", "teamName", "seriesId", "seriesName", "seasonYear", "carCount", "driverCount", "qualifyingRows", "resultRows", "bryceRows", "sourceState", "sourceHash"],
    )
    write_csv(
        OUTPUT_DIR / "track_venue_context.csv",
        track_rows,
        [
            "trackId",
            "trackName",
            "canonicalName",
            "country",
            "region",
            "city",
            "trackType",
            "configuration",
            "lengthKm",
            "lengthMi",
            "cornerCount",
            "direction",
            "temporary",
            "archetype",
            "weatherJoinReady",
            "metadataConfidenceTier",
            "eventCount",
            "sessionCount",
            "qualifyingRows",
            "resultRows",
            "lapRows",
            "weatherRows",
            "mediaRows",
            "bryceQualifyingRows",
            "bryceResultRows",
            "bryceBestFinish",
            "isRoadAmerica",
            "provenanceRefCount",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "track_archetype_analog_context.csv",
        analog_rows,
        [
            "targetTrackId",
            "targetTrackName",
            "targetArchetype",
            "analogTrackId",
            "analogTrackName",
            "analogArchetype",
            "similarityRank",
            "similarityScore",
            "sharedFeatures",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "driver_cohort_context.csv",
        driver_rows,
        [
            "driverId",
            "driverName",
            "nationality",
            "hometown",
            "seriesIds",
            "seasonYears",
            "teamCount",
            "carCount",
            "eventCount",
            "sessionCount",
            "qualifyingRows",
            "resultRows",
            "lapRows",
            "bestObservedFinish",
            "medianObservedFinish",
            "sharedRaceSessionWithBryceCount",
            "sameTeamAsBryceEventCount",
            "cohortLabel",
            "provenanceRefCount",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "car_entrant_context.csv",
        car_rows,
        [
            "carId",
            "seriesId",
            "seriesName",
            "seasonYear",
            "teamId",
            "teamName",
            "entrant",
            "carNumber",
            "class",
            "chassis",
            "engine",
            "tireSupplier",
            "driverCount",
            "sessionCount",
            "qualifyingRows",
            "resultRows",
            "lapRows",
            "bryceObservedRows",
            "bryceObserved",
            "provenanceRefCount",
            "sourceState",
            "sourceHash",
        ],
    )

    summary = {
        "ok": True,
        "generatedAt": now_iso(),
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_dimension_context_not_rating_or_forecast",
        "publicPointPrediction": False,
        "causalAttribution": False,
        "counts": {
            "resultRows": len(result_rows),
            "qualifyingRows": len(qualifying_rows),
            "teamRows": len(team_rows),
            "trackRows": len(track_rows),
            "driverRows": len(driver_rows),
            "carRows": len(car_rows),
            "qualifyingSessionRows": len(session_rows),
            "teamEraRows": len(team_era_rows),
            "trackAnalogRows": len(analog_rows),
        },
        "conversionSourceStateCounts": dict(Counter(row["conversionSourceState"] for row in qualifying_rows)),
        "driverCohortCounts": dict(Counter(row["cohortLabel"] for row in driver_rows)),
        "trackArchetypeCounts": dict(Counter(row["archetype"] for row in track_rows)),
        "artifacts": [
            "qualifying_result_context.csv",
            "result_context.csv",
            "qualifying_session_conversion_summary.csv",
            "team_dimension_context.csv",
            "team_era_context.csv",
            "track_venue_context.csv",
            "track_archetype_analog_context.csv",
            "driver_cohort_context.csv",
            "car_entrant_context.csv",
            "context-packs/career-dimension-context.json",
            "CAREER_DIMENSION_CONTEXT_LAYER.md",
        ],
    }
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "career-dimension-context.json", build_pack(result_rows, qualifying_rows, session_rows, team_rows, team_era_rows, track_rows, analog_rows, driver_rows, car_rows, source_hash))
    write_report(OUTPUT_DIR / "CAREER_DIMENSION_CONTEXT_LAYER.md", result_rows, qualifying_rows, session_rows, team_rows, team_era_rows, track_rows, analog_rows, driver_rows, car_rows, source_hash)

    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT)), "counts": summary["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
