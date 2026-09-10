#!/usr/bin/env python3
"""Build INDY NXT practice/qualifying section-lap analytics artifacts."""

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
LANE_DIR = ROOT / "analysis/indy-nxt-section-lap-deep-dive"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"
PREP_SESSION_TYPES = {"practice", "qualifying"}


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


def time_to_seconds(value: Any) -> float | None:
    number = clean_float(value)
    if number is not None:
        return number
    if value is None:
        return None
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    parts = text.split(":")
    try:
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return None
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
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def mean(values: Iterable[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(sum(clean) / len(clean))


def pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3 or len(xs) != len(ys):
        return None
    mx = sum(xs) / len(xs)
    my = sum(ys) / len(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den_x = math.sqrt(sum((x - mx) ** 2 for x in xs))
    den_y = math.sqrt(sum((y - my) ** 2 for y in ys))
    if not den_x or not den_y:
        return None
    return num / (den_x * den_y)


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


def car_key(car: dict[str, Any], fallback: int) -> tuple[str, str, str]:
    return (
        str(car.get("driverId") or car.get("driverName") or f"driver_{fallback}"),
        str(car.get("carNumber") or ""),
        str(car.get("carId") or ""),
    )


def event_context(
    metric: dict[str, Any],
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    session = sessions.get(metric.get("sessionId"), {})
    event = events.get(metric.get("eventId") or session.get("eventId"), {})
    track = tracks.get(event.get("trackId"), {})
    return {
        "session": session,
        "event": event,
        "track": track,
        "sessionId": session.get("id") or metric.get("sessionId"),
        "eventId": event.get("id") or metric.get("eventId") or session.get("eventId"),
        "seasonYear": event.get("seasonYear") or metric.get("seasonYear"),
        "eventName": event.get("name") or "",
        "trackName": track.get("name") or "",
        "trackType": track.get("trackType") or "",
        "sessionType": session.get("sessionType") or "",
        "sessionName": session.get("sessionName") or "",
    }


def comparable_percentile(field_times: list[float], bryce_time: float) -> tuple[int | None, float | None]:
    if len(field_times) < 8:
        return None, None
    rank = 1 + sum(1 for t in field_times if t < bryce_time)
    if len(field_times) == 1:
        return rank, None
    return rank, 1 - ((rank - 1) / (len(field_times) - 1))


def build_section_observations(
    data: dict[str, Any],
    source_hash: str,
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    observations: list[dict[str, Any]] = []
    metrics = [
        metric
        for metric in data["derivedMetrics"]
        if metric.get("seriesId") == INDY_NXT_ID
        and metric.get("metricType") == "official_section_results"
        and sessions.get(metric.get("sessionId"), {}).get("sessionType") in PREP_SESSION_TYPES
    ]
    for metric in sorted(metrics, key=lambda m: (m.get("eventId") or "", m.get("sessionId") or "")):
        context = event_context(metric, sessions, events, tracks)
        cars = metric.get("metrics", {}).get("cars", [])
        field_by_lap_section: dict[tuple[int, str], dict[tuple[str, str, str], float]] = defaultdict(dict)
        bryce_lap_totals: dict[int, float] = {}

        for idx, car in enumerate(cars):
            key = car_key(car, idx)
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                for section in lap.get("sections", []):
                    section_name = section.get("name")
                    section_time = clean_float(section.get("timeSeconds"))
                    if not section_name or section_time is None:
                        continue
                    field_by_lap_section[(int(lap_no), section_name)][key] = section_time
                    if is_bryce(car) and section_name == "Lap":
                        prior = bryce_lap_totals.get(int(lap_no))
                        bryce_lap_totals[int(lap_no)] = section_time if prior is None else min(prior, section_time)

        median_lap = median(bryce_lap_totals.values())
        clean_lap_by_number: dict[int, str] = {}
        for lap_no, lap_time in bryce_lap_totals.items():
            if lap_no <= 0 or median_lap is None:
                clean_lap_by_number[lap_no] = "unknown"
            elif lap_time <= median_lap * 1.10:
                clean_lap_by_number[lap_no] = "yes"
            else:
                clean_lap_by_number[lap_no] = "no"

        seen_bryce_rows: set[tuple[int, str, float]] = set()
        for car in cars:
            if not is_bryce(car):
                continue
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    section_name = section.get("name")
                    section_time = clean_float(section.get("timeSeconds"))
                    if not section_name or section_time is None:
                        continue
                    unique = (lap_no_int, section_name, round(section_time, 6))
                    if unique in seen_bryce_rows:
                        continue
                    seen_bryce_rows.add(unique)
                    field_times = list(field_by_lap_section.get((lap_no_int, section_name), {}).values())
                    rank, percentile = comparable_percentile(field_times, section_time)
                    observations.append(
                        {
                            **{key: context[key] for key in [
                                "sessionId",
                                "eventId",
                                "seasonYear",
                                "eventName",
                                "trackName",
                                "trackType",
                                "sessionType",
                                "sessionName",
                            ]},
                            "lapNumber": lap_no_int,
                            "sectionName": section_name,
                            "sectionFamily": section_family(section_name),
                            "sectionType": classify_section(section_name),
                            "timeSeconds": section_time,
                            "speedMph": clean_float(section.get("speedMph")),
                            "fieldComparisonCount": len(field_times),
                            "fieldRank": rank,
                            "fieldPercentile": percentile,
                            "cleanLapCandidate": clean_lap_by_number.get(lap_no_int, "unknown"),
                            "sourceState": "official_section_results",
                            "sourceMetricId": metric.get("id"),
                            "sourceHash": source_hash,
                        }
                    )
    return observations


def build_top_section_rows(
    data: dict[str, Any],
    source_hash: str,
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    metrics = [
        metric
        for metric in data["derivedMetrics"]
        if metric.get("seriesId") == INDY_NXT_ID
        and metric.get("metricType") == "official_top_section_times"
        and sessions.get(metric.get("sessionId"), {}).get("sessionType") in PREP_SESSION_TYPES
    ]
    for metric in sorted(metrics, key=lambda m: (m.get("eventId") or "", m.get("sessionId") or "")):
        context = event_context(metric, sessions, events, tracks)
        sections_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for section in metric.get("metrics", {}).get("sections", []):
            section_name = section.get("name") or ""
            sections_by_name[section_name].extend(section.get("rows", []))
        for section_name, section_rows in sections_by_name.items():
            unique_rows: dict[tuple[Any, ...], dict[str, Any]] = {}
            for row in section_rows:
                physical_key = (
                    row.get("driverId") or row.get("driverName"),
                    row.get("carNumber"),
                    row.get("time"),
                    row.get("lapNumber"),
                    row.get("speedMph"),
                )
                if physical_key not in unique_rows:
                    unique_rows[physical_key] = row
            timed_rows = [
                (row, time_to_seconds(row.get("time")))
                for row in unique_rows.values()
                if time_to_seconds(row.get("time")) is not None
            ]
            field_size = len(timed_rows)
            for row, row_time_seconds in timed_rows:
                if not is_bryce(row):
                    continue
                rank = row.get("rank")
                rank_int = int(rank) if rank is not None else None
                percentile = None
                if rank_int is not None and field_size >= 8:
                    percentile = 1 - ((rank_int - 1) / (field_size - 1))
                rows.append(
                    {
                        **{key: context[key] for key in [
                            "sessionId",
                            "eventId",
                            "seasonYear",
                            "eventName",
                            "trackName",
                            "trackType",
                            "sessionType",
                            "sessionName",
                        ]},
                        "sectionName": section_name,
                        "sectionType": classify_section(section_name),
                        "rank": rank_int,
                        "fieldSize": field_size,
                        "percentile": percentile,
                        "time": row.get("time") or "",
                        "timeSeconds": row_time_seconds,
                        "speedMph": clean_float(row.get("speedMph")),
                        "lapNumber": row.get("lapNumber"),
                        "sourceState": "official_top_section_times",
                        "sourceMetricId": metric.get("id"),
                        "sourceHash": source_hash,
                    }
                )
    return rows


def format_section_list(groups: dict[str, list[float]], reverse: bool) -> str:
    ranked = [
        (name, median(values), len(values))
        for name, values in groups.items()
        if len(values) >= 8 and median(values) is not None
    ]
    ranked.sort(key=lambda item: item[1], reverse=reverse)
    return "; ".join(f"{name}:{value:.2f} n={count}" for name, value, count in ranked[:4])


def build_session_summary(
    observations: list[dict[str, Any]],
    top_sections: list[dict[str, Any]],
    source_hash: str,
) -> list[dict[str, Any]]:
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    top_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        by_session[row["sessionId"]].append(row)
    for row in top_sections:
        top_by_session[row["sessionId"]].append(row)

    summaries: list[dict[str, Any]] = []
    for session_id in sorted(by_session):
        rows = by_session[session_id]
        first = rows[0]
        track_rows = [
            row
            for row in rows
            if row["sectionType"] == "track_section"
            and row.get("fieldPercentile") is not None
            and row.get("cleanLapCandidate") == "yes"
        ]
        percentiles = [float(row["fieldPercentile"]) for row in track_rows]
        groups: dict[str, list[float]] = defaultdict(list)
        for row in track_rows:
            groups[row["sectionFamily"]].append(float(row["fieldPercentile"]))
        lap_top_rows = [row for row in top_by_session.get(session_id, []) if row.get("sectionName") == "Lap" and row.get("rank")]
        best_lap_rank = min((int(row["rank"]) for row in lap_top_rows), default=None)
        summaries.append(
            {
                **{key: first[key] for key in [
                    "sessionId",
                    "eventId",
                    "seasonYear",
                    "eventName",
                    "trackName",
                    "trackType",
                    "sessionType",
                    "sessionName",
                ]},
                "bryceLapCount": len(
                    {
                        row["lapNumber"]
                        for row in rows
                        if int(row["lapNumber"]) > 0 and row.get("cleanLapCandidate") == "yes"
                    }
                ),
                "bryceSectionObservations": len(rows),
                "comparisonRows": len(track_rows),
                "medianTrackSectionPercentile": median(percentiles),
                "topQuartileTrackSectionShare": sum(1 for p in percentiles if p >= 0.75) / len(percentiles) if percentiles else None,
                "bottomQuartileTrackSectionShare": sum(1 for p in percentiles if p <= 0.25) / len(percentiles) if percentiles else None,
                "bestSectionFamilies": format_section_list(groups, reverse=True),
                "weakestSectionFamilies": format_section_list(groups, reverse=False),
                "bestLapRank": best_lap_rank,
                "topSectionBryceRows": len(top_by_session.get(session_id, [])),
                "sourceState": "official_section_results+official_top_section_times",
                "sourceHash": source_hash,
            }
        )
    return summaries


def build_section_family_strengths(observations: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for row in observations:
        if row["sectionType"] != "track_section" or row.get("fieldPercentile") is None:
            continue
        if row.get("cleanLapCandidate") != "yes":
            continue
        groups[(row["sectionFamily"], row["sessionType"], row["trackName"])].append(float(row["fieldPercentile"]))
    rows = []
    for (family, session_type, track_name), values in sorted(groups.items(), key=lambda item: (item[0][2], item[0][1], item[0][0])):
        if len(values) < 8:
            continue
        rows.append(
            {
                "sectionFamily": family,
                "sessionType": session_type,
                "trackName": track_name,
                "observationRows": len(values),
                "medianPercentile": median(values),
                "meanPercentile": mean(values),
                "topQuartileShare": sum(1 for v in values if v >= 0.75) / len(values),
                "bottomQuartileShare": sum(1 for v in values if v <= 0.25) / len(values),
                "sourceHash": source_hash,
            }
        )
    return rows


def build_transfer_rows(
    session_summaries: list[dict[str, Any]],
    observations: list[dict[str, Any]],
    data: dict[str, Any],
    source_hash: str,
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    summaries_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    obs_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in session_summaries:
        summaries_by_event[row["eventId"]].append(row)
    for row in observations:
        if (
            row["sectionType"] == "track_section"
            and row.get("fieldPercentile") is not None
            and row.get("cleanLapCandidate") == "yes"
        ):
            obs_by_event[row["eventId"]].append(row)

    rows: list[dict[str, Any]] = []
    for result in sorted(data["results"], key=lambda r: r.get("sessionId") or ""):
        if result.get("driverId") != BRYCE_ID:
            continue
        race_session = sessions.get(result.get("sessionId"), {})
        if race_session.get("sessionType") != "race":
            continue
        event = events.get(race_session.get("eventId"), {})
        if event.get("seriesId") != INDY_NXT_ID:
            continue
        event_id = event.get("id")
        prep_rows = summaries_by_event.get(event_id, [])
        if not prep_rows:
            continue
        track = tracks.get(event.get("trackId"), {})
        practice_values = [
            row["medianTrackSectionPercentile"]
            for row in prep_rows
            if row["sessionType"] == "practice" and row.get("medianTrackSectionPercentile") is not None
        ]
        qualifying_values = [
            row["medianTrackSectionPercentile"]
            for row in prep_rows
            if row["sessionType"] == "qualifying" and row.get("medianTrackSectionPercentile") is not None
        ]
        family_groups: dict[str, list[float]] = defaultdict(list)
        for obs in obs_by_event.get(event_id, []):
            family_groups[obs["sectionFamily"]].append(float(obs["fieldPercentile"]))
        rows.append(
            {
                "eventId": event_id,
                "seasonYear": event.get("seasonYear"),
                "eventName": event.get("name"),
                "trackName": track.get("name") or "",
                "raceSessionId": race_session.get("id"),
                "raceSessionName": race_session.get("sessionName") or "Race",
                "raceFinish": result.get("finishPosition"),
                "raceStart": result.get("startPosition") or result.get("gridPosition"),
                "finishPercentile": result.get("finishPercentile"),
                "prepSessionCount": len(prep_rows),
                "practiceMedianTrackSectionPercentile": median(practice_values),
                "qualifyingMedianTrackSectionPercentile": median(qualifying_values),
                "bestPrepSectionFamilies": format_section_list(family_groups, reverse=True),
                "transferClaimStrength": "historical_backtest_only",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_track_prep_rows(session_summaries: list[dict[str, Any]], source_hash: str, track_name: str) -> list[dict[str, Any]]:
    rows = []
    track_match = track_name.lower()
    for row in session_summaries:
        if track_match not in row["trackName"].lower():
            continue
        rows.append(
            {
                "eventId": row["eventId"],
                "seasonYear": row["seasonYear"],
                "eventName": row["eventName"],
                "trackName": row["trackName"],
                "sessionId": row["sessionId"],
                "sessionType": row["sessionType"],
                "sessionName": row["sessionName"],
                "bryceLapCount": row["bryceLapCount"],
                "comparisonRows": row["comparisonRows"],
                "medianTrackSectionPercentile": row["medianTrackSectionPercentile"],
                "topQuartileTrackSectionShare": row["topQuartileTrackSectionShare"],
                "bottomQuartileTrackSectionShare": row["bottomQuartileTrackSectionShare"],
                "bestSectionFamilies": row["bestSectionFamilies"],
                "weakestSectionFamilies": row["weakestSectionFamilies"],
                "topSectionBryceRows": row["topSectionBryceRows"],
                "sourceState": "official_section_results+official_top_section_times",
                "sourceHash": source_hash,
                "caveat": f"Historical {track_name} prep sessions only; future sessions need live/current data before claims update.",
            }
        )
    return rows


def top_strengths(strengths: list[dict[str, Any]], *, reverse: bool, limit: int = 5) -> list[dict[str, Any]]:
    eligible = [row for row in strengths if int(row["observationRows"]) >= 8 and row.get("medianPercentile") is not None]
    eligible.sort(key=lambda row: (float(row["medianPercentile"]), int(row["observationRows"])), reverse=reverse)
    return eligible[:limit]


def transfer_correlations(transfer_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs = [
        ("practiceMedianTrackSectionPercentile", "finishPercentile", "Practice section median vs race finish percentile"),
        ("qualifyingMedianTrackSectionPercentile", "finishPercentile", "Qualifying section median vs race finish percentile"),
    ]
    out = []
    for x_field, y_field, label in pairs:
        xs: list[float] = []
        ys: list[float] = []
        for row in transfer_rows:
            x = clean_float(row.get(x_field))
            y = clean_float(row.get(y_field))
            if x is None or y is None:
                continue
            xs.append(x)
            ys.append(y)
        out.append(
            {
                "x": x_field,
                "y": y_field,
                "label": label,
                "n": len(xs),
                "pearson": pearson(xs, ys),
                "claimStrength": "historical_backtest_only",
                "caveat": "Exploratory association only; no public point prediction and no post-race leakage for upcoming events.",
            }
        )
    return out


def build_context_packs(
    source_hash: str,
    generated_at: str,
    observations: list[dict[str, Any]],
    top_sections: list[dict[str, Any]],
    session_summaries: list[dict[str, Any]],
    strengths: list[dict[str, Any]],
    transfer_rows: list[dict[str, Any]],
    road_america_rows: list[dict[str, Any]],
    upcoming_track_name: str | None,
    upcoming_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    best = top_strengths(strengths, reverse=True)
    weakest = top_strengths(strengths, reverse=False)
    top_lap_rows = [
        row
        for row in top_sections
        if row["sectionName"] == "Lap" and row.get("rank") and int(row.get("fieldSize") or 0) >= 8
    ]
    best_top_ranks = sorted(top_lap_rows, key=lambda row: (int(row["rank"]), row["eventName"], row["sessionName"]))[:8]
    correlations = transfer_correlations(transfer_rows)
    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "historical_backtest_only",
        "publicPointPrediction": False,
        "counts": {
            "sectionObservations": len(observations),
            "sessionSummaries": len(session_summaries),
            "topSectionRows": len(top_sections),
            "sectionFamilyRows": len(strengths),
            "sessionToRaceTransferRows": len(transfer_rows),
            "roadAmericaPrepRows": len(road_america_rows),
            "upcomingVenuePrepRows": len(upcoming_rows),
        },
        "upcomingVenue": {
            "asOfDate": RUN_DATE.isoformat(),
            "status": "available" if upcoming_track_name else "season_complete",
            "trackName": upcoming_track_name,
            "artifactSlug": venue_slug(upcoming_track_name) if upcoming_track_name else None,
        },
        "correlations": correlations,
        "caveats": [
            "Practice and qualifying section data are official PDF-derived historical rows, not telemetry.",
            "Section percentiles are source-visible field comparisons with low-denominator suppression.",
            "Transfer rows are historical backtests only and should not be shown as public finish forecasts.",
        ],
    }
    section_pack = {
        "id": "indy-nxt-section-lap-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "historical_backtest_only",
        "publicPointPrediction": False,
        "primaryUseCases": [
            "race_week_prep",
            "session_debrief",
            "career_lab_drilldown",
            "analyst_model_feature_review",
        ],
        "counts": summary["counts"],
        "artifacts": [
            "practice_qualifying_bryce_section_observations.csv",
            "practice_qualifying_session_summary.csv",
            "practice_qualifying_top_section_times.csv",
            "section_family_strengths.csv",
            "session_to_race_transfer.csv",
        ],
        "bestTrackSectionContexts": best,
        "weakestTrackSectionContexts": weakest,
        "bestTopLapRanks": [
            {
                "eventName": row["eventName"],
                "sessionName": row["sessionName"],
                "sessionType": row["sessionType"],
                "rank": row["rank"],
                "fieldSize": row["fieldSize"],
                "percentile": row["percentile"],
            }
            for row in best_top_ranks
        ],
        "transferCorrelations": correlations,
        "displayRules": [
            "Use section percentiles as drilldown and prep context, not as deterministic race forecasts.",
            "Suppress rows with low comparison counts or show denominator badges.",
            "Keep pit/timing-line sections separate from true track sections.",
        ],
    }
    road_pack = {
        "id": "road-america-prep-section-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "descriptive_context_only",
        "publicPointPrediction": False,
        "trackName": "Road America",
        "historicalPrepRows": road_america_rows,
        "displayRules": [
            "Use completed Road America practice/qualifying section rows as historical context.",
            "Do not update future race-week claims until live/current session rows exist.",
            "Show session type and source caveat with every Road America prep comparison.",
        ],
    }
    upcoming_pack = None
    if upcoming_track_name:
        upcoming_slug = venue_slug(upcoming_track_name).replace("_", "-")
        upcoming_pack = {
            "id": f"next-venue-{upcoming_slug}-prep-section-context",
            "generatedAt": generated_at,
            "sourceDataset": "data/career/career.dataset.json",
            "sourceHash": source_hash,
            "claimStrength": "descriptive_context_only",
            "publicPointPrediction": False,
            "asOfDate": RUN_DATE.isoformat(),
            "trackName": upcoming_track_name,
            "historicalPrepRows": upcoming_rows,
            "displayRules": [
                f"Use completed {upcoming_track_name} practice/qualifying section rows as historical context.",
                "Do not update future race-week claims until live/current session rows exist.",
                f"Show session type and source caveat with every {upcoming_track_name} prep comparison.",
            ],
        }
    return summary, section_pack, road_pack, upcoming_pack


def render_report(
    generated_at: str,
    summary: dict[str, Any],
    best: list[dict[str, Any]],
    weakest: list[dict[str, Any]],
    road_america_rows: list[dict[str, Any]],
    upcoming_track_name: str | None,
    upcoming_rows: list[dict[str, Any]],
) -> str:
    counts = summary["counts"]
    correlations = summary["correlations"]
    best_lines = "\n".join(
        f"- {row['trackName']} {row['sessionType']} {row['sectionFamily']}: median {float(row['medianPercentile']):.2f} across {row['observationRows']} comparable rows."
        for row in best[:5]
    ) or "- No high-denominator best-section rows passed filters."
    weak_lines = "\n".join(
        f"- {row['trackName']} {row['sessionType']} {row['sectionFamily']}: median {float(row['medianPercentile']):.2f} across {row['observationRows']} comparable rows."
        for row in weakest[:5]
    ) or "- No high-denominator weak-section rows passed filters."
    corr_lines = "\n".join(
        f"- {row['label']}: n={row['n']}, Pearson={'' if row['pearson'] is None else round(row['pearson'], 3)}, claim={row['claimStrength']}."
        for row in correlations
    )
    road_lines = "\n".join(
        f"- {row['seasonYear']} {row['sessionName']}: median section percentile {fmt(row['medianTrackSectionPercentile'], 3)}, best {row['bestSectionFamilies'] or 'n/a'}."
        for row in road_america_rows[:10]
    ) or "- No completed Road America practice/qualifying section rows were source-visible."
    if upcoming_track_name:
        upcoming_lines = "\n".join(
            f"- {row['seasonYear']} {row['sessionName']}: median section percentile {fmt(row['medianTrackSectionPercentile'], 3)}, best {row['bestSectionFamilies'] or 'n/a'}."
            for row in upcoming_rows[:10]
        ) or f"- No completed {upcoming_track_name} practice/qualifying section rows were source-visible."
        upcoming_heading = f"Track: `{upcoming_track_name}`"
        context_pack_line = "and the current next-venue prep pack."
    else:
        upcoming_lines = "- No future INDY NXT venue remains on the canonical schedule as of the analysis date."
        upcoming_heading = "Season complete; no next-venue prep artifact is emitted."
        context_pack_line = "The next-venue pack is omitted when the canonical schedule has no future event."
    return f"""# INDY NXT Section-Lap Deep Dive

Generated: `{generated_at}`
Source dataset: `data/career/career.dataset.json`
Source hash: `{summary['sourceHash']}`

## Source Scope

This lane uses INDY NXT official `official_section_results` and `official_top_section_times` derived metrics for practice and qualifying sessions. It does not use live timing, telemetry, setup notes, or post-race outcomes for public upcoming-event claims.

## What Became Productized

- `practice_qualifying_bryce_section_observations.csv`: {counts['sectionObservations']} Bryce section/lap observations with field-relative percentiles and clean-lap flags.
- `practice_qualifying_session_summary.csv`: {counts['sessionSummaries']} session summaries across practice and qualifying.
- `practice_qualifying_top_section_times.csv`: {counts['topSectionRows']} Bryce rows from official Top Section Times.
- `section_family_strengths.csv`: {counts['sectionFamilyRows']} track/session/section-family aggregates.
- `session_to_race_transfer.csv`: {counts['sessionToRaceTransferRows']} historical prep-to-race rows.
- Context packs: `context-packs/indy-nxt-section-lap-context.json` and the permanent historical `context-packs/road-america-prep-context.json`; {context_pack_line}

## Practice/Qualifying Section-Lap Findings

Highest source-visible section contexts:

{best_lines}

Weakest source-visible section contexts:

{weak_lines}

## Top Section Times

The Top Section Times table is now mined separately from per-lap Section Results. This matters because it captures official best-section ranks even when a full per-lap story is too noisy for a headline.

## Session-To-Race Transfer

These rows are historical backtests only. They are suitable for analyst features and prep-context language, not public finish forecasts.

{corr_lines}

## Road America Context

{road_lines}

## Upcoming Venue Context

{upcoming_heading}

{upcoming_lines}

## Caveats

- Section Results rows compare only source-visible field rows, with low-denominator comparisons suppressed.
- Pit/timing-line sections are retained but separated from true track-section aggregates.
- Practice and qualifying formats are not equivalent across sessions or years.
- The context packs intentionally avoid point-prediction language.
"""


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    data = load_dataset()
    source_hash = dataset_hash()
    generated_at = now_iso()
    sessions = {row["id"]: row for row in data["sessions"]}
    events = {row["id"]: row for row in data["events"]}
    tracks = {row["id"]: row for row in data["tracks"]}

    observations = build_section_observations(data, source_hash, sessions, events, tracks)
    top_sections = build_top_section_rows(data, source_hash, sessions, events, tracks)
    session_summaries = build_session_summary(observations, top_sections, source_hash)
    strengths = build_section_family_strengths(observations, source_hash)
    transfer_rows = build_transfer_rows(session_summaries, observations, data, source_hash, sessions, events, tracks)
    road_america_rows = build_track_prep_rows(session_summaries, source_hash, "Road America")
    upcoming_track_name = next_upcoming_track_name(data)
    upcoming_rows = (
        build_track_prep_rows(session_summaries, source_hash, upcoming_track_name)
        if upcoming_track_name
        else []
    )
    summary, section_pack, road_pack, upcoming_pack = build_context_packs(
        source_hash,
        generated_at,
        observations,
        top_sections,
        session_summaries,
        strengths,
        transfer_rows,
        road_america_rows,
        upcoming_track_name,
        upcoming_rows,
    )

    write_csv(
        OUTPUT_DIR / "practice_qualifying_bryce_section_observations.csv",
        observations,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "eventName",
            "trackName",
            "trackType",
            "sessionType",
            "sessionName",
            "lapNumber",
            "sectionName",
            "sectionFamily",
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "practice_qualifying_session_summary.csv",
        session_summaries,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "eventName",
            "trackName",
            "trackType",
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "practice_qualifying_top_section_times.csv",
        top_sections,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "eventName",
            "trackName",
            "trackType",
            "sessionType",
            "sessionName",
            "sectionName",
            "sectionType",
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "section_family_strengths.csv",
        strengths,
        [
            "sectionFamily",
            "sessionType",
            "trackName",
            "observationRows",
            "medianPercentile",
            "meanPercentile",
            "topQuartileShare",
            "bottomQuartileShare",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "session_to_race_transfer.csv",
        transfer_rows,
        [
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
        ],
    )
    write_csv(
        OUTPUT_DIR / "road_america_prep_section_context.csv",
        road_america_rows,
        [
            "eventId",
            "seasonYear",
            "eventName",
            "trackName",
            "sessionId",
            "sessionType",
            "sessionName",
            "bryceLapCount",
            "comparisonRows",
            "medianTrackSectionPercentile",
            "topQuartileTrackSectionShare",
            "bottomQuartileTrackSectionShare",
            "bestSectionFamilies",
            "weakestSectionFamilies",
            "topSectionBryceRows",
            "sourceState",
            "sourceHash",
            "caveat",
        ],
    )
    for stale_path in OUTPUT_DIR.glob("next_venue_*_prep_section_context.csv"):
        stale_path.unlink()
    for stale_path in PACK_DIR.glob("next-venue-*-prep-context.json"):
        stale_path.unlink()
    if upcoming_track_name:
        upcoming_slug = venue_slug(upcoming_track_name)
        write_csv(
            OUTPUT_DIR / f"next_venue_{upcoming_slug}_prep_section_context.csv",
            upcoming_rows,
            [
                "eventId",
                "seasonYear",
                "eventName",
                "trackName",
                "sessionId",
                "sessionType",
                "sessionName",
                "bryceLapCount",
                "comparisonRows",
                "medianTrackSectionPercentile",
                "topQuartileTrackSectionShare",
                "bottomQuartileTrackSectionShare",
                "bestSectionFamilies",
                "weakestSectionFamilies",
                "topSectionBryceRows",
                "sourceState",
                "sourceHash",
                "caveat",
            ],
        )
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "indy-nxt-section-lap-context.json", section_pack)
    write_json(PACK_DIR / "road-america-prep-context.json", road_pack)
    if upcoming_track_name and upcoming_pack:
        write_json(PACK_DIR / f"next-venue-{upcoming_slug.replace('_', '-')}-prep-context.json", upcoming_pack)

    best = top_strengths(strengths, reverse=True)
    weakest = top_strengths(strengths, reverse=False)
    (OUTPUT_DIR / "INDY_NXT_SECTION_LAP_DEEP_DIVE.md").write_text(
        render_report(generated_at, summary, best, weakest, road_america_rows, upcoming_track_name, upcoming_rows)
    )

    print(json.dumps({"ok": True, "output": str(OUTPUT_DIR.relative_to(ROOT)), "counts": summary["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
