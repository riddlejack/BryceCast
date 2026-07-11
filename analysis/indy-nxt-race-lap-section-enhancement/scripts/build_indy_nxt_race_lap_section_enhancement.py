#!/usr/bin/env python3
"""Build INDY NXT race lap/section enhancement artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/indy-nxt-race-lap-section-enhancement"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"


def resolve_run_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    return date.today()


RUN_DATE = resolve_run_date()


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


def clean_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if math.isnan(float(value)):
            return None
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def slug(value: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return out or "track"


def venue_slug(track_name: str) -> str:
    normalized = track_name.lower()
    if "mid-ohio" in normalized:
        return "mid_ohio"
    return slug(track_name)


def parse_event_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def next_upcoming_track_name(data: dict[str, Any]) -> str | None:
    tracks = {row["id"]: row for row in data.get("tracks", [])}
    candidates: list[tuple[date, str, str]] = []
    for event in data.get("events", []):
        if event.get("seriesId") != INDY_NXT_ID:
            continue
        event_date = parse_event_date(event.get("eventStartDate"))
        if event_date is None or event_date < RUN_DATE:
            continue
        track = tracks.get(event.get("trackId") or "", {})
        track_name = track.get("name") or event.get("trackName") or ""
        if track_name:
            candidates.append((event_date, str(event.get("id") or ""), str(track_name)))
    if not candidates:
        return None
    candidates.sort(key=lambda row: (row[0], row[1]))
    return candidates[0][2]


def median(values: Iterable[float]) -> float | None:
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def mean(values: Iterable[float]) -> float | None:
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    return float(sum(clean) / len(clean))


def fmt(value: Any, digits: int = 4) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        return round(value, digits)
    return value


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: fmt(row.get(field)) for field in fields})


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def is_bryce(row: dict[str, Any]) -> bool:
    return row.get("driverId") == BRYCE_ID or "aron, bryce" in str(row.get("driverName", "")).lower()


def classify_section(name: str) -> str:
    cleaned = name.strip()
    if cleaned == "Lap":
        return "lap_total"
    upper = cleaned.upper()
    if re.search(r"(^|[^A-Z])(PI|PO|SF|S/F)([^A-Z]|$)", upper) or "ALT START" in upper:
        return "pit_or_timing_line"
    return "track_section"


def section_family(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


def race_label(event: dict[str, Any], session: dict[str, Any]) -> str:
    year = event.get("seasonYear") or ""
    name = event.get("name") or session.get("sessionName") or session.get("id")
    session_name = session.get("sessionName") or ""
    if session_name and session_name.lower() not in {"race", "race 1"} and session_name not in name:
        return f"{year} {name} {session_name}".strip()
    return f"{year} {name}".strip()


def event_context(
    session_id: str,
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    session = sessions.get(session_id, {})
    event = events.get(session.get("eventId"), {})
    track = tracks.get(event.get("trackId"), {})
    return {
        "session": session,
        "event": event,
        "track": track,
        "sessionId": session_id,
        "eventId": event.get("id") or session.get("eventId"),
        "seasonYear": event.get("seasonYear"),
        "raceLabel": race_label(event, session),
        "trackName": track.get("name") or "",
        "trackType": track.get("trackType") or "",
    }


def comparable_percentile(field_times: list[float], bryce_time: float) -> tuple[int | None, float | None]:
    if len(field_times) < 8:
        return None, None
    rank = 1 + sum(1 for value in field_times if value < bryce_time)
    return rank, 1 - ((rank - 1) / (len(field_times) - 1))


def position_percentile(position: float | None, field_size: int) -> float | None:
    if position is None or field_size <= 1:
        return None
    return 1 - ((position - 1) / (field_size - 1))


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "events": {row["id"]: row for row in data["events"]},
        "sessions": {row["id"]: row for row in data["sessions"]},
        "tracks": {row["id"]: row for row in data["tracks"]},
        "results": {row["sessionId"]: row for row in data["results"] if row.get("driverId") == BRYCE_ID},
    }


def indy_nxt_race_session_ids(data: dict[str, Any], idx: dict[str, Any]) -> set[str]:
    out = set()
    for session in data["sessions"]:
        event = idx["events"].get(session.get("eventId"), {})
        if event.get("seriesId") == INDY_NXT_ID and session.get("sessionType") == "race":
            out.add(session["id"])
    return out


def caution_laps_by_session(data: dict[str, Any]) -> dict[str, set[int]]:
    out: dict[str, set[int]] = defaultdict(set)
    for incident in data["incidents"]:
        raw = incident.get("raw", {})
        start = int(raw.get("startLap") or incident.get("lapNumber") or 0)
        end = int(raw.get("endLap") or raw.get("startLap") or incident.get("lapNumber") or 0)
        if start <= 0 or end <= 0:
            continue
        if "caution" not in str(incident.get("incidentType", "")).lower() and "caution" not in str(incident.get("description", "")).lower():
            continue
        for lap_no in range(start, end + 1):
            out[incident["sessionId"]].add(lap_no)
    return out


def lap_caution_state(lap_no: int, caution_laps: set[int]) -> str:
    if lap_no in caution_laps:
        return "caution"
    if lap_no - 1 in caution_laps:
        return "restart_lap"
    return "green"


def segment_type(caution_state: str) -> str:
    if caution_state == "caution":
        return "caution_window"
    if caution_state == "restart_lap":
        return "restart_window"
    if caution_state == "green":
        return "green_run"
    return "unknown"


def build_lap_microstates(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    race_session_ids = indy_nxt_race_session_ids(data, idx)
    caution_by_session = caution_laps_by_session(data)
    field_by_session_lap: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    bryce_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lap in data["lapSamples"]:
        session_id = lap.get("sessionId")
        lap_no = lap.get("lapNumber")
        if session_id not in race_session_ids or lap_no is None:
            continue
        if clean_float(lap.get("position")) is None:
            continue
        field_by_session_lap[(session_id, int(lap_no))].append(lap)
        if lap.get("driverId") == BRYCE_ID:
            bryce_by_session[session_id].append(lap)

    rows: list[dict[str, Any]] = []
    for session_id in sorted(bryce_by_session):
        context = event_context(session_id, idx["sessions"], idx["events"], idx["tracks"])
        ordered = sorted(bryce_by_session[session_id], key=lambda row: int(row["lapNumber"]))
        first_position = clean_float(ordered[0].get("position")) if ordered else None
        previous_position = None
        for lap in ordered:
            lap_no = int(lap["lapNumber"])
            position = clean_float(lap.get("position"))
            field_rows = field_by_session_lap[(session_id, lap_no)]
            field_size = len(field_rows)
            caution_state = lap_caution_state(lap_no, caution_by_session.get(session_id, set()))
            delta = previous_position - position if previous_position is not None and position is not None else None
            rows.append(
                {
                    **{key: context[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                    "lapNumber": lap_no,
                    "position": position,
                    "previousPosition": previous_position,
                    "positionDelta": delta,
                    "netFromLapOne": first_position - position if first_position is not None and position is not None else None,
                    "fieldSizeAtLap": field_size,
                    "runningPositionPercentile": position_percentile(position, field_size),
                    "cautionState": caution_state,
                    "sourceCompleteness": lap.get("raw", {}).get("chartCompleteness") or "unknown",
                    "sourceState": "official_lap_chart",
                    "sourceHash": source_hash,
                }
            )
            previous_position = position
    return rows


def build_lap_segments(microstates: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in microstates:
        by_session[row["sessionId"]].append(row)
    for session_id, session_rows in sorted(by_session.items()):
        ordered = sorted(session_rows, key=lambda row: int(row["lapNumber"]))
        current: list[dict[str, Any]] = []
        current_type = None
        segment_index = 0
        for row in ordered:
            row_type = segment_type(row["cautionState"])
            if current and row_type != current_type:
                segment_index += 1
                rows.append(segment_summary(current, segment_index, current_type or "unknown", source_hash))
                current = []
            current.append(row)
            current_type = row_type
        if current:
            segment_index += 1
            rows.append(segment_summary(current, segment_index, current_type or "unknown", source_hash))
    return rows


def segment_summary(rows: list[dict[str, Any]], segment_index: int, current_type: str, source_hash: str) -> dict[str, Any]:
    positions = [clean_float(row["position"]) for row in rows if clean_float(row["position"]) is not None]
    deltas = [abs(clean_float(row.get("positionDelta")) or 0) for row in rows[1:]]
    percentiles = [clean_float(row.get("runningPositionPercentile")) for row in rows if clean_float(row.get("runningPositionPercentile")) is not None]
    start_position = clean_float(rows[0].get("position"))
    end_position = clean_float(rows[-1].get("position"))
    return {
        "sessionId": rows[0]["sessionId"],
        "raceLabel": rows[0]["raceLabel"],
        "trackName": rows[0]["trackName"],
        "segmentId": f"{rows[0]['sessionId']}_segment_{segment_index:02d}",
        "segmentType": current_type,
        "startLap": rows[0]["lapNumber"],
        "endLap": rows[-1]["lapNumber"],
        "lapCount": len(rows),
        "startPosition": start_position,
        "endPosition": end_position,
        "netGain": start_position - end_position if start_position is not None and end_position is not None else None,
        "bestPosition": min(positions) if positions else None,
        "worstPosition": max(positions) if positions else None,
        "volatility": sum(deltas),
        "medianRunningPositionPercentile": median(percentiles),
        "sourceCompleteness": ";".join(sorted({row.get("sourceCompleteness") or "unknown" for row in rows})),
        "sourceHash": source_hash,
    }


def build_inflections(microstates: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for row in microstates:
        delta = clean_float(row.get("positionDelta"))
        if delta is None or abs(delta) < 1:
            continue
        direction = "gain" if delta > 0 else "loss"
        caution = row["cautionState"]
        if caution == "restart_lap":
            trigger = f"restart_{direction}"
        elif caution == "caution":
            trigger = f"caution_reorder_{direction}"
        else:
            trigger = f"green_flag_{direction}"
        rows.append(
            {
                "sessionId": row["sessionId"],
                "raceLabel": row["raceLabel"],
                "lapNumber": row["lapNumber"],
                "previousPosition": row["previousPosition"],
                "position": row["position"],
                "positionDelta": delta,
                "trigger": trigger,
                "cautionState": caution,
                "magnitude": abs(delta),
                "sourceHash": source_hash,
            }
        )
    rows.sort(key=lambda row: (row["sessionId"], int(row["lapNumber"])))
    return rows


def build_race_section_observations(
    data: dict[str, Any],
    idx: dict[str, Any],
    source_hash: str,
    microstates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    race_session_ids = indy_nxt_race_session_ids(data, idx)
    caution_by_session = caution_laps_by_session(data)
    caution_state_by_lap = {(row["sessionId"], int(row["lapNumber"])): row["cautionState"] for row in microstates}
    lap_chart_laps_by_session: dict[str, set[int]] = defaultdict(set)
    for row in microstates:
        lap_chart_laps_by_session[row["sessionId"]].add(int(row["lapNumber"]))
    observations: list[dict[str, Any]] = []

    metrics = [
        metric
        for metric in data["derivedMetrics"]
        if metric.get("seriesId") == INDY_NXT_ID
        and metric.get("metricType") == "official_section_results"
        and metric.get("sessionId") in race_session_ids
    ]
    for metric in sorted(metrics, key=lambda row: row.get("sessionId") or ""):
        session_id = metric["sessionId"]
        context = event_context(session_id, idx["sessions"], idx["events"], idx["tracks"])
        cars = metric.get("metrics", {}).get("cars", [])
        field_by_lap_section: dict[tuple[int, str], dict[tuple[str, str, str], float]] = defaultdict(dict)
        bryce_lap_totals: dict[int, float] = {}
        for car_index, car in enumerate(cars):
            key = (
                str(car.get("driverId") or car.get("driverName") or f"driver_{car_index}"),
                str(car.get("carNumber") or ""),
                str(car.get("carId") or ""),
            )
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    name = section.get("name")
                    time_seconds = clean_float(section.get("timeSeconds"))
                    if not name or time_seconds is None:
                        continue
                    field_by_lap_section[(lap_no_int, name)][key] = time_seconds
                    if is_bryce(car) and name == "Lap":
                        previous = bryce_lap_totals.get(lap_no_int)
                        bryce_lap_totals[lap_no_int] = time_seconds if previous is None else min(previous, time_seconds)
        green_lap_times = [
            lap_time
            for lap_no, lap_time in bryce_lap_totals.items()
            if lap_no > 0
            and lap_no not in caution_by_session.get(session_id, set())
            and (lap_no - 1) not in caution_by_session.get(session_id, set())
        ]
        median_green_lap = median(green_lap_times)
        clean_by_lap: dict[int, str] = {}
        for lap_no, lap_time in bryce_lap_totals.items():
            if lap_no <= 0 or median_green_lap is None:
                clean_by_lap[lap_no] = "unknown"
            elif lap_no in caution_by_session.get(session_id, set()) or (lap_no - 1) in caution_by_session.get(session_id, set()):
                clean_by_lap[lap_no] = "no"
            elif lap_time <= median_green_lap * 1.10:
                clean_by_lap[lap_no] = "yes"
            else:
                clean_by_lap[lap_no] = "no"

        seen: set[tuple[int, str, float]] = set()
        for car in cars:
            if not is_bryce(car):
                continue
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    name = section.get("name")
                    time_seconds = clean_float(section.get("timeSeconds"))
                    if not name or time_seconds is None:
                        continue
                    dedupe_key = (lap_no_int, name, round(time_seconds, 6))
                    if dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)
                    has_lap_chart_row = lap_no_int in lap_chart_laps_by_session.get(session_id, set())
                    if has_lap_chart_row:
                        clean_candidate = clean_by_lap.get(lap_no_int, "unknown")
                        caution_state = caution_state_by_lap.get(
                            (session_id, lap_no_int),
                            lap_caution_state(lap_no_int, caution_by_session.get(session_id, set())),
                        )
                        source_state = "official_section_results+official_lap_chart+official_incident_caution_context"
                    else:
                        clean_candidate = "unknown"
                        caution_state = "unknown"
                        source_state = "official_section_results_only"
                    field_times = list(field_by_lap_section.get((lap_no_int, name), {}).values())
                    rank, percentile = comparable_percentile(field_times, time_seconds)
                    observations.append(
                        {
                            **{key: context[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                            "lapNumber": lap_no_int,
                            "sectionName": name,
                            "sectionFamily": section_family(name),
                            "sectionType": classify_section(name),
                            "timeSeconds": time_seconds,
                            "speedMph": clean_float(section.get("speedMph")),
                            "fieldComparisonCount": len(field_times),
                            "fieldRank": rank,
                            "fieldPercentile": percentile,
                            "cleanRaceLapCandidate": clean_candidate,
                            "cautionState": caution_state,
                            "sourceState": source_state,
                            "sourceMetricId": metric.get("id"),
                            "sourceHash": source_hash,
                        }
                    )
    return observations


def format_section_list(groups: dict[str, list[float]], reverse: bool) -> str:
    ranked = [
        (name, median(values), len(values))
        for name, values in groups.items()
        if len(values) >= 8 and median(values) is not None
    ]
    ranked.sort(key=lambda item: item[1], reverse=reverse)
    return "; ".join(f"{name}:{value:.2f} n={count}" for name, value, count in ranked[:4])


def build_section_session_summary(observations: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        by_session[row["sessionId"]].append(row)
    summaries = []
    for session_id, rows in sorted(by_session.items()):
        first = rows[0]
        clean_track = [
            row
            for row in rows
            if row["sectionType"] == "track_section"
            and row.get("cleanRaceLapCandidate") == "yes"
            and row.get("fieldPercentile") is not None
        ]
        percentiles = [float(row["fieldPercentile"]) for row in clean_track]
        groups: dict[str, list[float]] = defaultdict(list)
        for row in clean_track:
            groups[row["sectionFamily"]].append(float(row["fieldPercentile"]))
        clean_laps = {
            int(row["lapNumber"])
            for row in rows
            if row.get("cleanRaceLapCandidate") == "yes" and row["sectionType"] == "lap_total"
        }
        source_states = {row.get("sourceState") for row in rows}
        has_lap_chart_backing = "official_section_results+official_lap_chart+official_incident_caution_context" in source_states
        if clean_track:
            source_state = "official_section_results+official_lap_chart+official_incident_caution_context_clean_lap_filtered"
            if "official_section_results_only" in source_states:
                source_state += "+section_only_rows_excluded"
        elif has_lap_chart_backing:
            source_state = "official_section_results+official_lap_chart+official_incident_caution_context_no_clean_comparable_rows"
        else:
            source_state = "official_section_results_only_no_lap_chart_clean_filter_unavailable"
        summaries.append(
            {
                **{key: first[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                "cleanRaceLapCount": len(clean_laps),
                "cleanSectionComparisonRows": len(clean_track),
                "medianCleanTrackSectionPercentile": median(percentiles),
                "topQuartileCleanSectionShare": sum(1 for value in percentiles if value >= 0.75) / len(percentiles) if percentiles else None,
                "bottomQuartileCleanSectionShare": sum(1 for value in percentiles if value <= 0.25) / len(percentiles) if percentiles else None,
                "bestCleanSectionFamilies": format_section_list(groups, reverse=True),
                "weakestCleanSectionFamilies": format_section_list(groups, reverse=False),
                "sourceState": source_state,
                "sourceHash": source_hash,
            }
        )
    return summaries


def build_track_race_rows(
    microstates: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    source_hash: str,
    track_name: str,
) -> list[dict[str, Any]]:
    micro_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    segment_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    section_by_session = {row["sessionId"]: row for row in section_summaries}
    track_match = track_name.lower()
    for row in microstates:
        if track_match in row["trackName"].lower():
            micro_by_session[row["sessionId"]].append(row)
    for row in segments:
        if track_match in row.get("trackName", "").lower():
            segment_by_session[row["sessionId"]].append(row)
    rows = []
    for session_id, laps in sorted(micro_by_session.items()):
        ordered = sorted(laps, key=lambda row: int(row["lapNumber"]))
        section = section_by_session.get(session_id, {})
        gain_segments = sorted(segment_by_session.get(session_id, []), key=lambda row: clean_float(row.get("netGain")) or 0, reverse=True)
        rows.append(
            {
                "sessionId": session_id,
                "raceLabel": ordered[0]["raceLabel"],
                "seasonYear": ordered[0]["seasonYear"],
                "trackName": ordered[0]["trackName"],
                "lapRows": len(ordered),
                "startPosition": ordered[0]["position"],
                "finishPosition": ordered[-1]["position"],
                "netLapChartGain": clean_float(ordered[0]["position"]) - clean_float(ordered[-1]["position"]) if clean_float(ordered[0]["position"]) is not None and clean_float(ordered[-1]["position"]) is not None else None,
                "bestRunningPosition": min(clean_float(row["position"]) for row in ordered if clean_float(row["position"]) is not None),
                "worstRunningPosition": max(clean_float(row["position"]) for row in ordered if clean_float(row["position"]) is not None),
                "bestSegment": f"{gain_segments[0]['segmentType']} L{gain_segments[0]['startLap']}-{gain_segments[0]['endLap']} gain {fmt(gain_segments[0]['netGain'], 2)}" if gain_segments else "",
                "medianCleanTrackSectionPercentile": section.get("medianCleanTrackSectionPercentile"),
                "bestCleanSectionFamilies": section.get("bestCleanSectionFamilies"),
                "weakestCleanSectionFamilies": section.get("weakestCleanSectionFamilies"),
                "sourceHash": source_hash,
            }
        )
    return rows


def build_context_packs(
    generated_at: str,
    source_hash: str,
    microstates: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    inflections: list[dict[str, Any]],
    section_observations: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    road_america_rows: list[dict[str, Any]],
    upcoming_track_name: str,
    upcoming_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    best_segments = sorted(segments, key=lambda row: clean_float(row.get("netGain")) or -999, reverse=True)[:8]
    biggest_inflections = sorted(inflections, key=lambda row: clean_float(row.get("magnitude")) or -999, reverse=True)[:12]
    best_sections = sorted(
        [row for row in section_summaries if clean_float(row.get("medianCleanTrackSectionPercentile")) is not None],
        key=lambda row: clean_float(row.get("medianCleanTrackSectionPercentile")) or -999,
        reverse=True,
    )[:8]
    counts = {
        "raceLapMicrostates": len(microstates),
        "raceLapSegments": len(segments),
        "raceLapInflectionPoints": len(inflections),
        "raceSectionLapObservations": len(section_observations),
        "raceSectionSessionSummaries": len(section_summaries),
        "roadAmericaRows": len(road_america_rows),
        "upcomingVenueRows": len(upcoming_rows),
    }
    section_source_state_counts = {
        state: sum(1 for row in section_observations if row.get("sourceState") == state)
        for state in sorted({row.get("sourceState") for row in section_observations})
    }
    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "counts": counts,
        "upcomingVenue": {
            "asOfDate": RUN_DATE.isoformat(),
            "trackName": upcoming_track_name,
            "artifactSlug": venue_slug(upcoming_track_name),
        },
        "sectionSourceStateCounts": section_source_state_counts,
        "caveats": [
            "Lap microstates are official race lap chart positions, not telemetry or lap-time pace.",
            "Race section aggregates use clean-lap filters and low-denominator suppression.",
            "Race section rows without a same-session/same-lap Bryce lap chart row are retained as official_section_results_only and do not receive clean-lap or caution labels.",
            "Context packs are for post-race debrief and Career Lab exploration, not future finish forecasting.",
        ],
    }
    pack = {
        "id": "indy-nxt-race-lap-section-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "artifacts": [
            "race_lap_microstates.csv",
            "race_lap_segments.csv",
            "race_lap_inflection_points.csv",
            "race_section_lap_observations.csv",
            "race_section_session_summary.csv",
        ],
        "counts": counts,
        "sectionSourceStateCounts": section_source_state_counts,
        "bestLapChartSegments": best_segments,
        "largestPositionInflections": biggest_inflections,
        "bestCleanRaceSectionSessions": best_sections,
        "displayRules": [
            "Use lap-position microstates as a race story trace, not telemetry pace.",
            "Use clean section percentiles only with denominator labels and source drawers.",
            "Treat official_section_results_only rows as raw section comparisons, not clean-lap or caution-aware race shape.",
            "Keep caution/restart segments visually distinct from green-flag movement.",
        ],
    }
    road_pack = {
        "id": "road-america-race-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "trackName": "Road America",
        "historicalRaceRows": road_america_rows,
        "displayRules": [
            "Use these rows as completed Road America race history only.",
            "Do not blend with future session claims without live/current source rows.",
        ],
    }
    upcoming_slug = venue_slug(upcoming_track_name).replace("_", "-")
    upcoming_pack = {
        "id": f"{upcoming_slug}-race-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "asOfDate": RUN_DATE.isoformat(),
        "trackName": upcoming_track_name,
        "historicalRaceRows": upcoming_rows,
        "displayRules": [
            f"Use these rows as completed {upcoming_track_name} race history only.",
            "Do not blend with future session claims without live/current source rows.",
        ],
    }
    return summary, pack, road_pack, upcoming_pack


def render_report(
    generated_at: str,
    summary: dict[str, Any],
    road_america_rows: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    upcoming_track_name: str,
    upcoming_rows: list[dict[str, Any]],
) -> str:
    counts = summary["counts"]
    road_lines = "\n".join(
        f"- {row['raceLabel']}: start {fmt(row['startPosition'])}, finish {fmt(row['finishPosition'])}, best running {fmt(row['bestRunningPosition'])}, section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}."
        for row in road_america_rows
    ) or "- No Road America race lap rows were available."
    upcoming_lines = "\n".join(
        f"- {row['raceLabel']}: start {fmt(row['startPosition'])}, finish {fmt(row['finishPosition'])}, best running {fmt(row['bestRunningPosition'])}, section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}."
        for row in upcoming_rows
    ) or f"- No {upcoming_track_name} race lap rows were available."
    section_lines = "\n".join(
        f"- {row['raceLabel']}: clean section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}, best {row['bestCleanSectionFamilies'] or 'n/a'}."
        for row in sorted(section_summaries, key=lambda r: clean_float(r.get("medianCleanTrackSectionPercentile")) or -999, reverse=True)[:6]
    )
    return f"""# INDY NXT Race Lap/Section Enhancement

Generated: `{generated_at}`
Source dataset: `data/career/career.dataset.json`
Source hash: `{summary['sourceHash']}`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: {counts['raceLapMicrostates']} Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: {counts['raceLapSegments']} caution-aware lap segments.
- `race_lap_inflection_points.csv`: {counts['raceLapInflectionPoints']} position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations.
- `race_section_session_summary.csv`: {counts['raceSectionSessionSummaries']} race section summaries.
- Context packs: `context-packs/indy-nxt-race-lap-section-context.json`, `context-packs/road-america-race-context.json`, and the current next-venue race context pack.
- Source split: {summary.get('sectionSourceStateCounts', {})}.

## Lap Microstates

Each Bryce lap row now carries previous position, position delta, net movement from lap one, field-size denominator, running-position percentile, and caution/restart state.

## Caution-Aware Segments

Segments split green runs, caution windows, and restart laps so movement is not presented as generic pace when it happened under race-control context.

## Race Section Shape

Clean-lap race section highlights:

{section_lines}

## Road America Context

{road_lines}

## Upcoming Venue Race Context

Track: `{upcoming_track_name}`

{upcoming_lines}

## Caveats

- Lap chart position is race order, not telemetry speed or lap-time pace.
- Caution windows are official incident/caution rows where source-visible; absence of a caution row is not proof of a fully green race in non-INDY NXT series.
- Section percentiles suppress low denominators and aggregate only clean race-lap candidates.
- Context packs are post-race descriptive only.
"""


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    data = load_dataset()
    idx = build_indexes(data)
    source_hash = dataset_hash()
    generated_at = now_iso()

    microstates = build_lap_microstates(data, idx, source_hash)
    segments = build_lap_segments(microstates, source_hash)
    inflections = build_inflections(microstates, source_hash)
    section_observations = build_race_section_observations(data, idx, source_hash, microstates)
    section_summaries = build_section_session_summary(section_observations, source_hash)
    road_america_rows = build_track_race_rows(microstates, segments, section_summaries, source_hash, "Road America")
    upcoming_track_name = next_upcoming_track_name(data) or "Road America"
    upcoming_rows = build_track_race_rows(microstates, segments, section_summaries, source_hash, upcoming_track_name)
    summary, pack, road_pack, upcoming_pack = build_context_packs(
        generated_at,
        source_hash,
        microstates,
        segments,
        inflections,
        section_observations,
        section_summaries,
        road_america_rows,
        upcoming_track_name,
        upcoming_rows,
    )

    write_csv(
        OUTPUT_DIR / "race_lap_microstates.csv",
        microstates,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_lap_segments.csv",
        segments,
        [
            "sessionId",
            "raceLabel",
            "trackName",
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_lap_inflection_points.csv",
        inflections,
        [
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_section_lap_observations.csv",
        section_observations,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
            "lapNumber",
            "sectionName",
            "sectionFamily",
            "sectionType",
            "timeSeconds",
            "speedMph",
            "fieldComparisonCount",
            "fieldRank",
            "fieldPercentile",
            "cleanRaceLapCandidate",
            "cautionState",
            "sourceState",
            "sourceMetricId",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_section_session_summary.csv",
        section_summaries,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
            "cleanRaceLapCount",
            "cleanSectionComparisonRows",
            "medianCleanTrackSectionPercentile",
            "topQuartileCleanSectionShare",
            "bottomQuartileCleanSectionShare",
            "bestCleanSectionFamilies",
            "weakestCleanSectionFamilies",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "road_america_race_lap_section_context.csv",
        road_america_rows,
        [
            "sessionId",
            "raceLabel",
            "seasonYear",
            "trackName",
            "lapRows",
            "startPosition",
            "finishPosition",
            "netLapChartGain",
            "bestRunningPosition",
            "worstRunningPosition",
            "bestSegment",
            "medianCleanTrackSectionPercentile",
            "bestCleanSectionFamilies",
            "weakestCleanSectionFamilies",
            "sourceHash",
        ],
    )
    upcoming_slug = venue_slug(upcoming_track_name)
    write_csv(
        OUTPUT_DIR / f"{upcoming_slug}_race_lap_section_context.csv",
        upcoming_rows,
        [
            "sessionId",
            "raceLabel",
            "seasonYear",
            "trackName",
            "lapRows",
            "startPosition",
            "finishPosition",
            "netLapChartGain",
            "bestRunningPosition",
            "worstRunningPosition",
            "bestSegment",
            "medianCleanTrackSectionPercentile",
            "bestCleanSectionFamilies",
            "weakestCleanSectionFamilies",
            "sourceHash",
        ],
    )
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "indy-nxt-race-lap-section-context.json", pack)
    write_json(PACK_DIR / "road-america-race-context.json", road_pack)
    write_json(PACK_DIR / f"{upcoming_slug.replace('_', '-')}-race-context.json", upcoming_pack)
    (OUTPUT_DIR / "INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md").write_text(
        render_report(generated_at, summary, road_america_rows, section_summaries, upcoming_track_name, upcoming_rows)
    )

    print(json.dumps({"ok": True, "output": str(OUTPUT_DIR.relative_to(ROOT)), "counts": summary["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
