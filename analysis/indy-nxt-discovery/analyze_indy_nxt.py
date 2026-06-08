#!/usr/bin/env python3
"""INDY NXT analytics discovery for BryceCast UI planning.

This script intentionally reads canonical career data and writes only into the
analysis workspace. It does not mutate ingestion-owned files.
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean, median
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "data/career/career.dataset.json"
COVERAGE_PATH = ROOT / "data/career/reports/career-coverage-matrix.json"
OUT_DIR = ROOT / "analysis/indy-nxt-discovery/output"
CHART_DIR = OUT_DIR / "charts"
TABLE_DIR = OUT_DIR / "tables"

BRYCE_ID = "driver_bryce_aron"
INDY_SERIES_ID = "series_indy_nxt"


def clean_num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "DNS", "DNF"}:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def safe_div(a: float | int | None, b: float | int | None) -> float | None:
    if a is None or b in (None, 0):
        return None
    return float(a) / float(b)


def to_records(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_csv(path, index=False)


def json_dump(obj: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, sort_keys=True) + "\n")


def percentile_rank(values: list[float], value: float, higher_is_better: bool = True) -> float | None:
    clean = [v for v in values if v is not None and math.isfinite(v)]
    if not clean:
        return None
    if higher_is_better:
        return sum(v <= value for v in clean) / len(clean)
    return sum(v >= value for v in clean) / len(clean)


def linear_corr(xs: list[float], ys: list[float]) -> float | None:
    pairs = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None and math.isfinite(x) and math.isfinite(y)]
    if len(pairs) < 3:
        return None
    arr = np.array(pairs, dtype=float)
    if np.std(arr[:, 0]) == 0 or np.std(arr[:, 1]) == 0:
        return None
    return float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])


def zscore(values: list[float]) -> list[float]:
    arr = np.array(values, dtype=float)
    sd = np.std(arr)
    if sd == 0:
        return [0.0 for _ in values]
    return ((arr - np.mean(arr)) / sd).tolist()


def fmt(value: Any, digits: int = 2) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        if math.isnan(value):
            return "n/a"
        return f"{value:.{digits}f}"
    return str(value)


def md_table_from_rows(rows: list[dict[str, Any]], cols: list[str], n: int = 8) -> str:
    rows = rows[:n]
    if not rows:
        return "_No rows._"
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    body = []
    for row in rows:
        values = []
        for col in cols:
            value = row.get(col)
            if isinstance(value, float):
                value = fmt(value, 2)
            if value is None:
                value = ""
            values.append(str(value).replace("|", "/"))
        body.append("| " + " | ".join(values) + " |")
    return "\n".join([header, sep, *body])


def simple_bar_svg(rows: list[dict[str, Any]], label_key: str, value_key: str, title: str, path: Path, width: int = 960) -> None:
    height = max(220, 36 * len(rows) + 70)
    left = 240
    right = 40
    top = 44
    bar_h = 20
    gap = 14
    vals = [abs(clean_num(r.get(value_key)) or 0) for r in rows]
    max_v = max(vals) if vals else 1
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fbfaf7"/>',
        f'<text x="28" y="28" font-family="Inter, Arial" font-size="18" font-weight="700" fill="#1f2933">{title}</text>',
    ]
    zero_x = left
    usable = width - left - right
    for i, row in enumerate(rows):
        y = top + i * (bar_h + gap)
        val = clean_num(row.get(value_key)) or 0
        w = (abs(val) / max_v) * usable if max_v else 0
        color = "#1f77b4" if val >= 0 else "#c35d3d"
        label = str(row.get(label_key, ""))
        lines.append(f'<text x="28" y="{y+15}" font-family="Inter, Arial" font-size="12" fill="#39434d">{label}</text>')
        lines.append(f'<rect x="{zero_x}" y="{y}" width="{w:.1f}" height="{bar_h}" rx="3" fill="{color}" opacity="0.86"/>')
        lines.append(f'<text x="{zero_x+w+8}" y="{y+15}" font-family="Inter, Arial" font-size="12" fill="#1f2933">{val:g}</text>')
    lines.append("</svg>")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))


def line_svg(series: list[dict[str, Any]], x_key: str, y_key: str, title: str, path: Path, width: int = 980, height: int = 360) -> None:
    pts = [(i, clean_num(r.get(y_key))) for i, r in enumerate(series)]
    pts = [(i, v) for i, v in pts if v is not None]
    path.parent.mkdir(parents=True, exist_ok=True)
    if len(pts) < 2:
        path.write_text(f"<svg><text>{title}: insufficient data</text></svg>")
        return
    top, right, bottom, left = 48, 32, 54, 62
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    min_y, max_y = min(ys), max(ys)
    if min_y == max_y:
        min_y -= 1
        max_y += 1
    def sx(i: int) -> float:
        return left + (i - min(xs)) / max(1, max(xs) - min(xs)) * (width - left - right)
    def sy(v: float) -> float:
        return top + (max_y - v) / (max_y - min_y) * (height - top - bottom)
    points = " ".join(f"{sx(i):.1f},{sy(v):.1f}" for i, v in pts)
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fbfaf7"/>',
        f'<text x="28" y="28" font-family="Inter, Arial" font-size="18" font-weight="700" fill="#1f2933">{title}</text>',
        f'<line x1="{left}" y1="{top}" x2="{left}" y2="{height-bottom}" stroke="#aab2bd"/>',
        f'<line x1="{left}" y1="{height-bottom}" x2="{width-right}" y2="{height-bottom}" stroke="#aab2bd"/>',
        f'<polyline fill="none" stroke="#1f77b4" stroke-width="3" points="{points}"/>',
    ]
    for i, v in pts:
        lines.append(f'<circle cx="{sx(i):.1f}" cy="{sy(v):.1f}" r="3.5" fill="#1f77b4"/>')
    for tick in [min_y, (min_y + max_y) / 2, max_y]:
        y = sy(tick)
        lines.append(f'<line x1="{left-4}" y1="{y:.1f}" x2="{width-right}" y2="{y:.1f}" stroke="#e6e2dc"/>')
        lines.append(f'<text x="12" y="{y+4:.1f}" font-family="Inter, Arial" font-size="11" fill="#56616f">{tick:.1f}</text>')
    # Sparse x labels.
    for idx in np.linspace(0, len(series) - 1, min(6, len(series)), dtype=int):
        label = str(series[idx].get(x_key, idx))[:18]
        x = sx(idx)
        lines.append(f'<text x="{x:.1f}" y="{height-22}" text-anchor="middle" font-family="Inter, Arial" font-size="10" fill="#56616f">{label}</text>')
    lines.append("</svg>")
    path.write_text("\n".join(lines))


@dataclass
class Context:
    data: dict[str, Any]
    events: dict[str, dict[str, Any]]
    sessions: dict[str, dict[str, Any]]
    tracks: dict[str, dict[str, Any]]
    drivers: dict[str, dict[str, Any]]
    teams: dict[str, dict[str, Any]]
    indy_event_ids: set[str]
    indy_session_ids: set[str]


def load_context() -> Context:
    data = json.loads(DATASET_PATH.read_text())
    events = {r["id"]: r for r in data["events"]}
    sessions = {r["id"]: r for r in data["sessions"]}
    tracks = {r["id"]: r for r in data["tracks"]}
    drivers = {r["id"]: r for r in data["drivers"]}
    teams = {r["id"]: r for r in data["teams"]}
    indy_event_ids = {e["id"] for e in data["events"] if e.get("seriesId") == INDY_SERIES_ID}
    indy_session_ids = {s["id"] for s in data["sessions"] if s.get("eventId") in indy_event_ids}
    return Context(data, events, sessions, tracks, drivers, teams, indy_event_ids, indy_session_ids)


def race_label(ctx: Context, session_id: str) -> str:
    session = ctx.sessions[session_id]
    event = ctx.events[session["eventId"]]
    suffix = f" R{session.get('raceNumber')}" if session.get("raceNumber") else ""
    return f"{event.get('seasonYear')} {event.get('name')}{suffix}"


def build_race_dataset(ctx: Context) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    race_sessions = [
        s for s in ctx.data["sessions"]
        if s["id"] in ctx.indy_session_ids and s.get("sessionType") == "race"
    ]
    race_session_ids = {s["id"] for s in race_sessions}
    results_by_session = defaultdict(list)
    for result in ctx.data["results"]:
        if result.get("sessionId") in race_session_ids:
            results_by_session[result["sessionId"]].append(result)

    weather_by_session = {w.get("sessionId"): w for w in ctx.data["weatherObservations"] if w.get("sessionId") in race_session_ids}
    qualifying_by_event = defaultdict(list)
    for q in ctx.data["qualifyingResults"]:
        sess = ctx.sessions.get(q.get("sessionId"))
        if not sess or sess.get("eventId") not in ctx.indy_event_ids or q.get("driverId") != BRYCE_ID:
            continue
        qualifying_by_event[sess["eventId"]].append({**q, "_session": sess})
    stats_by_session = {}
    leader_by_session = {}
    for metric in ctx.data["derivedMetrics"]:
        sid = metric.get("sessionId")
        if sid not in race_session_ids:
            continue
        if metric.get("metricType") == "official_event_summary_race_stats":
            stats_by_session[sid] = metric
        if metric.get("metricType") == "official_leader_lap_summary":
            leader_by_session[sid] = metric

    incidents_by_session = defaultdict(list)
    for inc in ctx.data["incidents"]:
        if inc.get("sessionId") in race_session_ids:
            incidents_by_session[inc["sessionId"]].append(inc)
    penalties_by_session = defaultdict(list)
    for pen in ctx.data["penalties"]:
        if pen.get("sessionId") in race_session_ids:
            penalties_by_session[pen["sessionId"]].append(pen)

    rows: list[dict[str, Any]] = []
    all_result_rows: dict[str, list[dict[str, Any]]] = {}
    for session in sorted(race_sessions, key=lambda s: (ctx.events[s["eventId"]].get("seasonYear") or 0, s.get("scheduledStart") or "", s["id"])):
        sid = session["id"]
        event = ctx.events[session["eventId"]]
        track = ctx.tracks.get(event.get("trackId"), {})
        results = results_by_session.get(sid, [])
        bryce = next((r for r in results if r.get("driverId") == BRYCE_ID), None)
        if not bryce:
            continue
        all_result_rows[sid] = results
        start = bryce.get("startPosition") or bryce.get("gridPosition")
        finish = bryce.get("finishPosition")
        q_candidates = qualifying_by_event.get(event["id"], [])
        race_no = session.get("raceNumber")
        if race_no:
            race_token = f"Race {int(race_no)}"
            q_candidates = sorted(
                q_candidates,
                key=lambda q: (
                    0 if "Combined" in (q["_session"].get("sessionName") or "") else 1,
                    0 if race_token in (q["_session"].get("sessionName") or "") else 1,
                    q["_session"].get("sessionName") or "",
                ),
            )
        else:
            q_candidates = sorted(
                q_candidates,
                key=lambda q: (
                    0 if "Combined" in (q["_session"].get("sessionName") or "") else 1,
                    0 if "Qualifications" == (q["_session"].get("sessionName") or "") else 1,
                    q["_session"].get("sessionName") or "",
                ),
            )
        q_context = q_candidates[0] if q_candidates else None
        qualifying_position = q_context.get("position") if q_context else None
        qualifying_source = q_context["_session"].get("sessionName") if q_context else None
        qualifying_context_state = "combined_or_direct" if q_context and ("Combined" in (qualifying_source or "") or qualifying_source == "Qualifications") else ("group_fallback" if q_context else "unavailable")
        field = bryce.get("fieldSize") or len(results) or None
        teammate_results = [
            r for r in results
            if r.get("driverId") != BRYCE_ID
            and r.get("teamId") == bryce.get("teamId")
            and r.get("finishPosition") is not None
        ]
        teammate_finishes = [r.get("finishPosition") for r in teammate_results if r.get("finishPosition") is not None]
        best_teammate_finish = min(teammate_finishes) if teammate_finishes else None
        teammate_rank_pool = teammate_finishes + ([finish] if finish is not None else [])
        teammate_rank = sorted(teammate_rank_pool).index(finish) + 1 if finish is not None and teammate_rank_pool else None
        gain = (start - finish) if start is not None and finish is not None else None
        normalized_gain = safe_div(gain, max(1, field - 1) if field else None)
        start_percentile = 1 - ((start - 1) / (field - 1)) if start and field and field > 1 else None
        finish_percentile = bryce.get("finishPercentile")
        if finish_percentile is None and finish and field and field > 1:
            finish_percentile = 1 - ((finish - 1) / (field - 1))
        row = {
            "sessionId": sid,
            "eventId": event["id"],
            "seasonYear": event.get("seasonYear"),
            "eventName": event.get("name"),
            "sessionName": session.get("sessionName"),
            "raceNumber": session.get("raceNumber"),
            "raceLabel": race_label(ctx, sid),
            "scheduledStart": session.get("scheduledStart"),
            "timezone": session.get("timezone"),
            "trackId": track.get("id"),
            "trackName": track.get("canonicalName") or track.get("name"),
            "trackType": track.get("trackType"),
            "trackLengthMi": track.get("lengthMi"),
            "cornerCount": track.get("cornerCount"),
            "fieldSize": field,
            "qualifyingPosition": qualifying_position,
            "qualifyingSource": qualifying_source,
            "qualifyingContextState": qualifying_context_state,
            "startPosition": start,
            "gridPosition": bryce.get("gridPosition"),
            "finishPosition": finish,
            "positionGain": gain,
            "qualifyingToFinishDelta": (qualifying_position - finish) if qualifying_position is not None and finish is not None else None,
            "qualifyingToStartDelta": (qualifying_position - start) if qualifying_position is not None and start is not None else None,
            "normalizedGain": normalized_gain,
            "startPercentile": start_percentile,
            "finishPercentile": finish_percentile,
            "percentileDelta": (finish_percentile - start_percentile) if finish_percentile is not None and start_percentile is not None else None,
            "status": bryce.get("status"),
            "statusRaw": bryce.get("statusRaw"),
            "points": bryce.get("points"),
            "lapsCompleted": bryce.get("lapsCompleted"),
            "lapsLed": bryce.get("lapsLed"),
            "pitStops": bryce.get("pitStops"),
            "bestLapRank": bryce.get("bestLapRank"),
            "averageSpeed": bryce.get("averageSpeed"),
            "gapToLeader": bryce.get("gapToLeader"),
            "teamName": ctx.teams.get(bryce.get("teamId"), {}).get("name"),
            "teammateCount": len(teammate_results),
            "bestTeammateFinish": best_teammate_finish,
            "deltaToBestTeammateFinish": (finish - best_teammate_finish) if finish is not None and best_teammate_finish is not None else None,
            "teammateFinishRank": teammate_rank,
            "brycePenaltyCount": len(bryce.get("penaltyRefs") or []),
            "bryceIncidentCount": len(bryce.get("incidentRefs") or []),
            "sessionPenaltyCount": len(penalties_by_session.get(sid, [])),
            "sessionIncidentCount": len(incidents_by_session.get(sid, [])),
        }
        stats = stats_by_session.get(sid, {}).get("metrics", {})
        row.update({
            "totalLaps": stats.get("totalLaps"),
            "greenLaps": stats.get("greenLaps"),
            "cautionLaps": stats.get("cautionLaps"),
            "cautionShare": safe_div(stats.get("cautionLaps"), stats.get("totalLaps")),
            "leadChanges": stats.get("leadChanges"),
            "totalPasses": stats.get("totalPasses"),
            "positionPasses": stats.get("positionPasses"),
            "passesPerLap": safe_div(stats.get("positionPasses"), stats.get("greenLaps") or stats.get("totalLaps")),
        })
        leader_laps = leader_by_session.get(sid, {}).get("metrics", {}).get("laps", [])
        leader_counts = Counter(l.get("driverId") or l.get("driverName") for l in leader_laps)
        row["leaderDominanceShare"] = safe_div(max(leader_counts.values()) if leader_counts else None, len(leader_laps) or None)
        row["leaderCount"] = len([k for k in leader_counts if k])
        weather = weather_by_session.get(sid)
        if weather:
            row.update({
                "weatherId": weather.get("id"),
                "weatherConfidence": weather.get("confidence"),
                "weatherSourceType": weather.get("weatherSourceType"),
                "ambientTempC": weather.get("ambientTempC"),
                "apparentTempC": weather.get("apparentTempC") or weather.get("raw", {}).get("apparentTempC"),
                "relativeHumidityPct": weather.get("relativeHumidityPct"),
                "dewPointC": weather.get("dewPointC"),
                "windSpeedKph": weather.get("windSpeedKph"),
                "windGustKph": weather.get("windGustKph"),
                "windDirectionDeg": weather.get("windDirectionDeg"),
                "precipitationMm": weather.get("precipitationMm"),
                "cloudCoverPct": weather.get("cloudCoverPct"),
                "wetDry": weather.get("wetDry"),
                "timeConfidence": weather.get("timeConfidence"),
                "locationConfidence": weather.get("locationConfidence"),
            })
        else:
            row.update({
                "weatherId": None,
                "weatherConfidence": "unavailable",
                "weatherSourceType": None,
                "ambientTempC": None,
                "apparentTempC": None,
                "relativeHumidityPct": None,
                "dewPointC": None,
                "windSpeedKph": None,
                "windGustKph": None,
                "windDirectionDeg": None,
                "precipitationMm": None,
                "cloudCoverPct": None,
                "wetDry": "unknown",
                "timeConfidence": None,
                "locationConfidence": None,
            })
        rows.append(row)
    return rows, all_result_rows


def add_weather_labels(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        temp = clean_num(row.get("apparentTempC") if row.get("apparentTempC") is not None else row.get("ambientTempC"))
        gust = clean_num(row.get("windGustKph") if row.get("windGustKph") is not None else row.get("windSpeedKph"))
        precip = clean_num(row.get("precipitationMm")) or 0
        if row.get("wetDry") in (None, "", "unknown"):
            row["wetDry"] = "wet" if precip > 0 else "dry"
        if temp is None:
            row["thermalStress"] = "unknown"
        elif temp < 10:
            row["thermalStress"] = "cold"
        elif temp < 18:
            row["thermalStress"] = "cool"
        elif temp < 29:
            row["thermalStress"] = "moderate"
        else:
            row["thermalStress"] = "hot"
        if gust is None:
            row["windRisk"] = "unknown"
        elif gust >= 45:
            row["windRisk"] = "high"
        elif gust >= 25:
            row["windRisk"] = "medium"
        else:
            row["windRisk"] = "low"


def add_race_stories(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        status = str(row.get("status") or "").lower()
        gain = clean_num(row.get("positionGain"))
        finish = clean_num(row.get("finishPosition"))
        start = clean_num(row.get("startPosition"))
        best_lap_rank = clean_num(row.get("bestLapRank"))
        field = clean_num(row.get("fieldSize")) or 0
        volatility = clean_num(row.get("positionVolatility")) or 0
        story_drivers = []
        if status and status != "running":
            primary = "incident_or_reliability_limited"
            story_drivers.append(f"status={row.get('statusRaw') or row.get('status')}")
        elif finish is not None and finish <= 5 and gain is not None and gain >= 1:
            primary = "front_running_conversion"
            story_drivers.append("top_5_finish_with_positive_conversion")
        elif gain is not None and gain >= 5:
            primary = "recovery_drive"
            story_drivers.append("gained_5_plus_positions")
        elif gain is not None and gain <= -7:
            primary = "position_loss_race"
            story_drivers.append("lost_7_plus_positions")
        elif volatility >= 10:
            primary = "volatile_race_shape"
            story_drivers.append("high_lap_position_volatility")
        elif best_lap_rank is not None and field and best_lap_rank <= max(3, field * 0.25) and finish and finish > 10:
            primary = "hidden_pace_bad_outcome"
            story_drivers.append("strong_best_lap_rank_but_midpack_finish")
        elif start is not None and finish is not None and start <= 8 and finish <= 8:
            primary = "steady_conversion"
            story_drivers.append("started_and_finished_inside_top_8")
        else:
            primary = "steady_context_race"
        if clean_num(row.get("cautionShare")) and row["cautionShare"] >= 0.25:
            story_drivers.append("high_caution_share")
        if clean_num(row.get("windGustKph")) and row["windGustKph"] >= 45:
            story_drivers.append("high_wind_gust_context")
        if row.get("wetDry") == "wet":
            story_drivers.append("wet_context")
        if clean_num(row.get("deltaToBestTeammateFinish")) is not None and row["deltaToBestTeammateFinish"] <= 0:
            story_drivers.append("matched_or_led_teammate_finish")
        row["primaryStory"] = primary
        row["storyDrivers"] = "|".join(story_drivers)


def analyze_laps(ctx: Context, race_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    race_session_ids = {r["sessionId"] for r in race_rows}
    laps_by_session_driver: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for lap in ctx.data["lapSamples"]:
        if lap.get("sessionId") in race_session_ids and lap.get("position") is not None:
            laps_by_session_driver[(lap["sessionId"], lap.get("driverId"))].append(lap)
    lap_rows: list[dict[str, Any]] = []
    timeline_rows: list[dict[str, Any]] = []
    race_by_id = {r["sessionId"]: r for r in race_rows}
    for sid in sorted(
        race_session_ids,
        key=lambda session_id: (
            race_by_id[session_id].get("seasonYear") or 0,
            race_by_id[session_id].get("scheduledStart") or "",
            session_id,
        ),
    ):
        bryce_laps = sorted(laps_by_session_driver.get((sid, BRYCE_ID), []), key=lambda x: x.get("lapNumber") or 0)
        if not bryce_laps:
            lap_rows.append({"sessionId": sid, "raceLabel": race_by_id[sid]["raceLabel"], "lapDataState": "unavailable"})
            continue
        pos = [clean_num(l.get("position")) for l in bryce_laps if clean_num(l.get("position")) is not None]
        lap_nums = [int(l.get("lapNumber")) for l in bryce_laps if l.get("lapNumber") is not None]
        deltas = [pos[i - 1] - pos[i] for i in range(1, len(pos))]
        thirds = np.array_split(list(range(len(pos))), 3)
        third_deltas = []
        for idxs in thirds:
            if len(idxs) < 2:
                third_deltas.append(None)
            else:
                third_deltas.append(pos[int(idxs[0])] - pos[int(idxs[-1])])
        lap_rows.append({
            "sessionId": sid,
            "raceLabel": race_by_id[sid]["raceLabel"],
            "lapDataState": "available",
            "lapSamples": len(pos),
            "firstLapPosition": pos[0],
            "finalLapPosition": pos[-1],
            "bestRunningPosition": min(pos),
            "worstRunningPosition": max(pos),
            "runningPositionRange": max(pos) - min(pos),
            "netLapChartGain": pos[0] - pos[-1],
            "positionVolatility": sum(abs(d) for d in deltas),
            "positiveLapMoves": sum(1 for d in deltas if d > 0),
            "negativeLapMoves": sum(1 for d in deltas if d < 0),
            "largestLapGain": max(deltas) if deltas else 0,
            "largestLapLoss": min(deltas) if deltas else 0,
            "earlyDelta": third_deltas[0],
            "middleDelta": third_deltas[1],
            "lateDelta": third_deltas[2],
        })
        for lap in bryce_laps:
            timeline_rows.append({
                "sessionId": sid,
                "raceLabel": race_by_id[sid]["raceLabel"],
                "lapNumber": lap.get("lapNumber"),
                "position": lap.get("position"),
                "flagState": lap.get("flagState"),
                "provenanceRefs": "|".join(lap.get("provenanceRefs") or []),
            })
    return lap_rows, timeline_rows


def analyze_sections(ctx: Context, race_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    race_session_ids = {r["sessionId"] for r in race_rows}
    race_by_id = {r["sessionId"]: r for r in race_rows}
    section_rows: list[dict[str, Any]] = []
    for metric in ctx.data["derivedMetrics"]:
        if metric.get("sessionId") not in race_session_ids:
            continue
        if metric.get("metricType") != "official_top_section_times":
            continue
        sid = metric["sessionId"]
        for section in metric.get("metrics", {}).get("sections", []):
            rows = section.get("rows") or []
            bryce = next((r for r in rows if r.get("driverId") == BRYCE_ID), None)
            if not bryce:
                continue
            ranks = [clean_num(r.get("rank")) for r in rows if clean_num(r.get("rank")) is not None]
            rank = clean_num(bryce.get("rank"))
            field = len(ranks)
            section_rows.append({
                "sessionId": sid,
                "raceLabel": race_by_id[sid]["raceLabel"],
                "sectionName": section.get("name"),
                "sectionLengthMi": section.get("lengthMi"),
                "bryceRank": rank,
                "fieldRows": field,
                "rankPercentile": 1 - ((rank - 1) / (field - 1)) if rank is not None and field > 1 else None,
                "time": bryce.get("time"),
                "speedMph": bryce.get("speedMph"),
                "lapNumber": bryce.get("lapNumber"),
                "confidence": metric.get("confidence"),
                "provenanceRefs": "|".join(metric.get("provenanceRefs") or []),
            })
    return section_rows


def analyze_head_to_head(ctx: Context, race_rows: list[dict[str, Any]], all_results: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    race_by_id = {r["sessionId"]: r for r in race_rows}
    rivals: dict[str, dict[str, Any]] = {}
    for sid, results in all_results.items():
        bryce = next((r for r in results if r.get("driverId") == BRYCE_ID), None)
        if not bryce or bryce.get("finishPosition") is None:
            continue
        for result in results:
            did = result.get("driverId")
            if not did or did == BRYCE_ID or result.get("finishPosition") is None:
                continue
            row = rivals.setdefault(did, {
                "driverId": did,
                "driverName": ctx.drivers.get(did, {}).get("displayName", did),
                "racesTogether": 0,
                "bryceAhead": 0,
                "bryceBehind": 0,
                "sameTeamRaces": 0,
                "avgFinishDelta": [],
                "avgStartDelta": [],
                "notableRaces": [],
            })
            row["racesTogether"] += 1
            finish_delta = bryce["finishPosition"] - result["finishPosition"]
            row["avgFinishDelta"].append(finish_delta)
            if bryce.get("startPosition") is not None and result.get("startPosition") is not None:
                row["avgStartDelta"].append(bryce["startPosition"] - result["startPosition"])
            if finish_delta < 0:
                row["bryceAhead"] += 1
            elif finish_delta > 0:
                row["bryceBehind"] += 1
            if bryce.get("teamId") == result.get("teamId"):
                row["sameTeamRaces"] += 1
            if abs(finish_delta) >= 8:
                row["notableRaces"].append(f"{race_by_id[sid]['raceLabel']} ({finish_delta:+g})")
    out = []
    for row in rivals.values():
        n = row["racesTogether"]
        out.append({
            "driverId": row["driverId"],
            "driverName": row["driverName"],
            "racesTogether": n,
            "bryceAhead": row["bryceAhead"],
            "bryceBehind": row["bryceBehind"],
            "headToHeadWinRate": safe_div(row["bryceAhead"], n),
            "avgFinishDeltaVsRival": mean(row["avgFinishDelta"]) if row["avgFinishDelta"] else None,
            "avgStartDeltaVsRival": mean(row["avgStartDelta"]) if row["avgStartDelta"] else None,
            "sameTeamRaces": row["sameTeamRaces"],
            "notableRaces": " | ".join(row["notableRaces"][:4]),
        })
    return sorted(out, key=lambda r: (-r["racesTogether"], r["avgFinishDeltaVsRival"] if r["avgFinishDeltaVsRival"] is not None else 999))


def analyze_weather_segments(race_df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    for dim in ["wetDry", "thermalStress", "windRisk", "weatherConfidence"]:
        if dim not in race_df:
            continue
        for segment, group in race_df.groupby(dim, dropna=False):
            rows.append({
                "dimension": dim,
                "segment": segment or "unknown",
                "races": int(len(group)),
                "avgFinish": float(group["finishPosition"].mean()),
                "avgGain": float(group["positionGain"].mean()),
                "top10Rate": float((group["finishPosition"] <= 10).mean()),
                "dnfOrIssueRate": float((group["status"] != "running").mean()),
                "avgCautionShare": float(group["cautionShare"].mean()),
            })
    return rows


def exploratory_model(race_df: pd.DataFrame) -> list[dict[str, Any]]:
    feature_cols = ["qualifyingPosition", "startPosition", "bestLapRank", "cautionShare", "pitStops", "ambientTempC", "windGustKph"]
    df = race_df[["finishPosition", *feature_cols, "trackType"]].dropna().copy()
    if len(df) < 12:
        return []
    track_dummies = pd.get_dummies(df["trackType"], prefix="track", dtype=float)
    # Drop one track type so the intercept remains interpretable.
    if len(track_dummies.columns) > 1:
        track_dummies = track_dummies.drop(columns=sorted(track_dummies.columns)[0])
    x_df = pd.concat([df[feature_cols].astype(float), track_dummies], axis=1)
    y = df["finishPosition"].astype(float).to_numpy()
    x_scaled_cols = {}
    for col in x_df.columns:
        vals = x_df[col].astype(float).tolist()
        if col.startswith("track_"):
            x_scaled_cols[col] = vals
        else:
            x_scaled_cols[col] = zscore(vals)
    X = np.column_stack([np.ones(len(df)), *[x_scaled_cols[col] for col in x_df.columns]])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    pred = X @ beta
    ss_res = float(np.sum((y - pred) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = 1 - ss_res / ss_tot if ss_tot else None
    out = [{
        "feature": "model",
        "coefficient": None,
        "sampleSize": int(len(df)),
        "rSquared": r2,
        "interpretation": "Exploratory OLS; finishPosition lower is better; continuous fields are standardized; coefficients are directional, not causal.",
    }]
    for col, coef in zip(x_df.columns, beta[1:]):
        out.append({
            "feature": col,
            "coefficient": float(coef),
            "sampleSize": int(len(df)),
            "rSquared": r2,
            "interpretation": "Negative coefficient means associated with better finishing position after included controls.",
        })
    return out


def summarize_groups(race_df: pd.DataFrame) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for group_name, group in race_df.groupby("trackType", dropna=False):
        rows.append({
            "dimension": "trackType",
            "segment": group_name or "unknown",
            "races": int(len(group)),
            "avgFinish": float(group["finishPosition"].mean()),
            "avgStart": float(group["startPosition"].mean()),
            "avgGain": float(group["positionGain"].mean()),
            "avgPoints": float(group["points"].mean()),
            "top5Rate": float((group["finishPosition"] <= 5).mean()),
            "top10Rate": float((group["finishPosition"] <= 10).mean()),
            "runningRate": float((group["status"] == "running").mean()),
        })
    for year, group in race_df.groupby("seasonYear", dropna=False):
        rows.append({
            "dimension": "seasonYear",
            "segment": str(int(year)),
            "races": int(len(group)),
            "avgFinish": float(group["finishPosition"].mean()),
            "avgStart": float(group["startPosition"].mean()),
            "avgGain": float(group["positionGain"].mean()),
            "avgPoints": float(group["points"].mean()),
            "top5Rate": float((group["finishPosition"] <= 5).mean()),
            "top10Rate": float((group["finishPosition"] <= 10).mean()),
            "runningRate": float((group["status"] == "running").mean()),
        })
    return rows


def run_correlations(df: pd.DataFrame) -> list[dict[str, Any]]:
    candidates = [
        ("startPosition", "finishPosition", "Lower start vs lower finish"),
        ("qualifyingPosition", "finishPosition", "Qualifying rank vs finish"),
        ("qualifyingToFinishDelta", "finishPosition", "Qualifying conversion vs finish"),
        ("positionGain", "finishPosition", "Position gain vs finish"),
        ("bestLapRank", "finishPosition", "Best-lap rank vs finish"),
        ("cautionShare", "positionGain", "Caution share vs gain"),
        ("passesPerLap", "positionGain", "Race passing density vs gain"),
        ("ambientTempC", "finishPosition", "Ambient temp vs finish"),
        ("windGustKph", "positionGain", "Wind gust vs gain"),
        ("precipitationMm", "positionGain", "Precipitation vs gain"),
        ("pitStops", "finishPosition", "Pit stops vs finish"),
    ]
    rows = []
    for x, y, label in candidates:
        if x not in df or y not in df:
            continue
        sub = df[[x, y]].dropna()
        rows.append({
            "x": x,
            "y": y,
            "label": label,
            "n": int(len(sub)),
            "pearson": linear_corr(sub[x].astype(float).tolist(), sub[y].astype(float).tolist()) if len(sub) >= 3 else None,
            "caution": "exploratory_correlation_not_causal",
        })
    return rows


def make_report(ctx: Context, outputs: dict[str, Any]) -> str:
    race = pd.DataFrame(outputs["race_rows"])
    lap = pd.DataFrame(outputs["lap_rows"])
    sections = pd.DataFrame(outputs["section_rows"])
    correlations = outputs["correlations"]
    head_to_head = pd.DataFrame(outputs["head_to_head"])
    weather_segments = pd.DataFrame(outputs["weather_segments"])
    model_rows = pd.DataFrame(outputs["model_rows"])
    race_count = len(race)
    weather_count = int(race["weatherId"].notna().sum()) if "weatherId" in race else 0
    top_gains = race.sort_values(["positionGain", "finishPosition"], ascending=[False, True]).head(5)
    top_qualifying_conversions = race.sort_values(["qualifyingToFinishDelta", "finishPosition"], ascending=[False, True]).head(8)
    weakest_qualifying_conversions = race.sort_values(["qualifyingToFinishDelta", "finishPosition"], ascending=[True, True]).head(8)
    top_finishes = race.sort_values(["finishPosition", "positionGain"]).head(5)
    biggest_drops = race.sort_values(["positionGain", "finishPosition"]).head(5)
    quality_sections = sections[(sections["fieldRows"] >= 10) & (sections["lapNumber"].fillna(0) > 0)] if not sections.empty else sections
    best_sections = quality_sections.sort_values("rankPercentile", ascending=False).head(10) if not quality_sections.empty else pd.DataFrame()
    worst_sections = quality_sections.sort_values("rankPercentile", ascending=True).head(10) if not quality_sections.empty else pd.DataFrame()
    volatile = lap[lap["lapDataState"] == "available"].sort_values("positionVolatility", ascending=False).head(5) if not lap.empty else pd.DataFrame()
    stable = lap[lap["lapDataState"] == "available"].sort_values("positionVolatility", ascending=True).head(5) if not lap.empty else pd.DataFrame()

    def table_md(df: pd.DataFrame, cols: list[str], n: int = 8) -> str:
        if df.empty:
            return "_No rows._"
        use = df[cols].head(n).copy()
        return md_table_from_rows(use.to_dict(orient="records"), cols, n)

    lines = [
        "# INDY NXT Analytics Discovery",
        "",
        f"Generated from `{DATASET_PATH.relative_to(ROOT)}` at repo head `f3e5e32` after the INDY NXT weather enrichment commit.",
        "",
        "## Executive Readout",
        "",
        f"- Analyzable Bryce INDY NXT race rows: **{race_count}**. Weather-enriched race rows: **{weather_count}** of 36 race rows, all modeled/non-official.",
        f"- Mean start: **{fmt(race['startPosition'].mean(), 1)}**. Mean finish: **{fmt(race['finishPosition'].mean(), 1)}**. Mean position gain: **{fmt(race['positionGain'].mean(), 1)}**.",
        f"- Top-10 rate: **{fmt((race['finishPosition'] <= 10).mean() * 100, 0)}%**. Top-5 rate: **{fmt((race['finishPosition'] <= 5).mean() * 100, 0)}%**. Running/classified rate: **{fmt((race['status'] == 'running').mean() * 100, 0)}%**.",
        f"- Races where Bryce finished ahead of or tied his best same-team comparison: **{fmt((race['deltaToBestTeammateFinish'].fillna(999) <= 0).mean() * 100, 0)}%** of races with teammate rows.",
        "- Causal regression should stay out of the headline product for now. The useful near-term product is decomposition, race-shape analysis, context-aware comparisons, and confidence-labeled modeled weather.",
        "",
        "## Most UI-Worthy Findings To Build Around",
        "",
        "1. **Race debrief should be the spine.** The data supports race-level stories that combine start/finish, lap-position shape, cautions, penalties, pit count, section timing, and weather.",
        "2. **Position-gain alone is too shallow.** The lap chart adds separate dimensions: volatility, early/mid/late movement, best/worst running position, and whether the result was a steady conversion or chaotic recovery.",
        "3. **Section timing is a premium analysis layer.** Top Section Times can identify where Bryce had standout micro-sectors even when the finish result is ordinary.",
        "4. **Head-to-head context is UI-worthy when labeled carefully.** Same-team and repeated-rival comparisons are source-backed and useful, but they need cohort counts beside every claim.",
        "5. **Weather belongs as context, not causality.** Modeled weather can make race cards richer, but claims like 'hot weather caused X' need much more evidence.",
        "6. **The app needs denominators everywhere.** Race-only, completed-race, weather-enriched, section-comparable, lap-chart-available, and exact-window cohorts must be visible.",
        "",
        "## Best Finish Results",
        "",
        table_md(top_finishes, ["raceLabel", "trackType", "startPosition", "finishPosition", "positionGain", "points", "status"], 8),
        "",
        "## Biggest Position Gains",
        "",
        table_md(top_gains, ["raceLabel", "trackType", "startPosition", "finishPosition", "positionGain", "points", "cautionLaps", "pitStops"], 8),
        "",
        "## Qualifying-To-Race Conversion",
        "",
        "Use this as a core debrief module. It is stronger than a generic result card because it answers whether qualifying was converted, rescued, or squandered.",
        "",
        "### Best conversions",
        "",
        table_md(top_qualifying_conversions, ["raceLabel", "qualifyingPosition", "qualifyingSource", "startPosition", "finishPosition", "qualifyingToFinishDelta", "positionGain", "status"], 8),
        "",
        "### Weakest conversions",
        "",
        table_md(weakest_qualifying_conversions, ["raceLabel", "qualifyingPosition", "qualifyingSource", "startPosition", "finishPosition", "qualifyingToFinishDelta", "positionGain", "status"], 8),
        "",
        "## Biggest Position Losses",
        "",
        table_md(biggest_drops, ["raceLabel", "trackType", "startPosition", "finishPosition", "positionGain", "status", "pitStops", "sessionIncidentCount"], 8),
        "",
        "## Race Shape Extremes",
        "",
        "High-volatility races are the best candidates for annotated lap-position storytelling.",
        "",
        table_md(volatile, ["raceLabel", "lapSamples", "netLapChartGain", "positionVolatility", "bestRunningPosition", "worstRunningPosition", "earlyDelta", "middleDelta", "lateDelta"], 8),
        "",
        "Low-volatility races are good examples of steady execution or limited passing opportunity.",
        "",
        table_md(stable, ["raceLabel", "lapSamples", "netLapChartGain", "positionVolatility", "bestRunningPosition", "worstRunningPosition"], 8),
        "",
        "## Race Story Classifier",
        "",
        "This is a first-pass product classifier for UI copy and filtering. It should be reviewed race-by-race before becoming a shipped label.",
        "",
        table_md(race.groupby("primaryStory").agg(races=("sessionId", "count"), avgFinish=("finishPosition", "mean"), avgGain=("positionGain", "mean"), top10Rate=("finishPosition", lambda s: (s <= 10).mean())).reset_index().sort_values("races", ascending=False), ["primaryStory", "races", "avgFinish", "avgGain", "top10Rate"], 12),
        "",
        "## Teammate And Rival Context",
        "",
        "These rows are useful for serious users because they put results into local competitive context without inventing a field-strength model.",
        "",
        "### Same-team race context",
        "",
        table_md(race.sort_values("deltaToBestTeammateFinish").dropna(subset=["deltaToBestTeammateFinish"]), ["raceLabel", "teamName", "finishPosition", "bestTeammateFinish", "deltaToBestTeammateFinish", "teammateFinishRank"], 10),
        "",
        "### Repeated head-to-head rivals",
        "",
        table_md(head_to_head[head_to_head["racesTogether"] >= 10].sort_values(["headToHeadWinRate", "racesTogether"], ascending=[False, False]), ["driverName", "racesTogether", "bryceAhead", "bryceBehind", "headToHeadWinRate", "avgFinishDeltaVsRival", "sameTeamRaces"], 12),
        "",
        "## Section Timing Signals",
        "",
        "Best section percentiles can become a 'where he was fast' module. Worst section percentiles can become a preparation/debrief module, but should be handled carefully because section availability and session comparability vary.",
        "",
        "### Strongest section rows",
        "",
        table_md(best_sections, ["raceLabel", "sectionName", "bryceRank", "fieldRows", "rankPercentile", "time", "speedMph", "lapNumber"], 10),
        "",
        "### Weakest section rows",
        "",
        table_md(worst_sections, ["raceLabel", "sectionName", "bryceRank", "fieldRows", "rankPercentile", "time", "speedMph", "lapNumber"], 10),
        "",
        "## Weather Context Segments",
        "",
        "Weather rows are modeled/non-official, so this should inform UI context rather than driver-performance claims.",
        "",
        table_md(weather_segments, ["dimension", "segment", "races", "avgFinish", "avgGain", "top10Rate", "dnfOrIssueRate", "avgCautionShare"], 20),
        "",
        "## Exploratory Relationship Checks",
        "",
        "These are scan lines for product ideation, not causal evidence.",
        "",
        md_table_from_rows(correlations, ["x", "y", "label", "n", "pearson", "caution"], len(correlations)),
        "",
        "## Exploratory Multivariate Model",
        "",
        "This is intentionally framed as a scan, not a claim engine. It is useful for product ideation because it tells us which fields belong in a debrief card together.",
        "",
        table_md(model_rows, ["feature", "coefficient", "sampleSize", "rSquared", "interpretation"], 20),
        "",
        "## Chart-Ready Output Inventory",
        "",
        "- `tables/indy_nxt_race_outcomes.csv`: one Bryce row per analyzable INDY NXT race.",
        "- `tables/indy_nxt_lap_shape.csv`: one race-shape row per race with lap-chart availability.",
        "- `tables/indy_nxt_lap_timeline.csv`: lap-position timeline rows for Bryce.",
        "- `tables/indy_nxt_section_strengths.csv`: top-section rank rows for Bryce.",
        "- `tables/indy_nxt_group_summary.csv`: season and track-type rollups.",
        "- `tables/indy_nxt_correlations.csv`: exploratory correlation checks.",
        "- `tables/indy_nxt_head_to_head.csv`: repeated-rival and teammate comparison rows.",
        "- `tables/indy_nxt_weather_segments.csv`: weather-context segment summaries.",
        "- `tables/indy_nxt_exploratory_model.csv`: small-N multivariate scan.",
        "",
        "## UI Implications",
        "",
        "- Build `RaceDebriefViewModel` before a broad shell: outcome, race shape, section strengths, event context, weather, source states, caveats.",
        "- Use compact fixture extracts rather than loading the full career dataset into the browser.",
        "- Design chart slots around actual analytical jobs: outcome decomposition, lap-position trace, section-strength ranked bars, weather context strip, and source/caveat drawer.",
        "- Keep modeled weather visually distinct from official timing/results. Its value is context; it should never visually compete with official classifications.",
        "- Save teammate/field-strength modeling for a later benchmark model with explicit cohorts and validation.",
        "",
        "## Next Deep-Analysis Backlog",
        "",
        "1. Build an automated race debrief scorer: classify each race as conversion, recovery, fade, chaos, reliability-limited, or context-heavy.",
        "2. Build a race-shape clustering pass using lap-position features after verifying lap chart completeness labels.",
        "3. Build section archetypes by track and session type: where Bryce tends to over-index by micro-sector.",
        "4. Convert repeated-rival and teammate context into a careful benchmark module with denominator-first language.",
        "5. Add session-level weather cards for race, practice, and qualifying, but keep date-only qualifying rows excluded from hour-level context.",
        "6. Extend the same framework to GB3 and Formula Ford only where metric parity says the comparison is honest.",
    ]
    return "\n".join(lines) + "\n"


def make_insight_inventory() -> str:
    lines = [
        "# BryceCast UI Analytics Insight Inventory",
        "",
        "This inventory turns the INDY NXT discovery pass into product-ready analysis modules. These are chart contracts for the design phase, not final visual designs.",
        "",
        "## Product Principle",
        "",
        "Build around race intelligence, not generic stats. Each module should answer a real debrief question, expose its denominator, and carry source/confidence state without visually overwhelming the user.",
        "",
        "## Priority Modules",
        "",
        "| Module | Primary question | Stakeholders | Best visual family | Required fields | Caveats |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Race Debrief Header | What happened in this race? | Bryce, family, team | KPI strip + concise narrative | start, finish, gain, status, points, track, weather, caveats | Keep modeled weather visually secondary |",
        "| Qualifying Conversion | Did qualifying translate into result? | Bryce, team, family | slope/dumbbell from qualifying/start to finish | qualifyingPosition, startPosition, finishPosition, status | Use combined field-wide qualifying where possible |",
        "| Lap Position Story | Where did the race turn? | Bryce, team, serious fans | inverted y-axis lap-position line with caution markers | lapNumber, position, flagState, lap chart caveat | Partial charts need explicit badge |",
        "| Race Shape Classifier | What kind of race was it? | all | filter chips + compact cards | primaryStory, storyDrivers, volatility, gain, status | First-pass labels need race-by-race review |",
        "| Section Strengths | Where was he fast? | Bryce, team | ranked bars or track-segment heatmap | sectionName, rankPercentile, fieldRows, lapNumber, speed/time | Suppress low-denominator odd rows in headline UI |",
        "| Teammate Context | How did he compare locally? | Bryce, Ganassi/team | ranked dot plot/table | bestTeammateFinish, deltaToBestTeammateFinish, teammateFinishRank | Denominator and teammate count required |",
        "| Repeated Rival Context | Who is a meaningful comparison cohort? | team, serious fans | head-to-head bars with n labels | racesTogether, headToHeadWinRate, avgFinishDeltaVsRival | Avoid field-strength claims until benchmark model exists |",
        "| Weather Context | What conditions framed the race? | Bryce, family, team | weather strip + condition badges | temp, wind, wetDry, thermalStress, windRisk, confidence | Non-official modeled only; no causal claims |",
        "| Source Confidence Drawer | Why should I trust this? | all | drawer/table | provenanceRefs, confidence, caveatIds, source type | Every stat needs source state |",
        "| Career Parity Matrix | Which analyses can extend beyond INDY NXT? | product owner, team | matrix heatmap | series, metric family, status, caveats | Prevent weak series from poisoning strong INDY NXT data |",
        "",
        "## First Vertical Slice",
        "",
        "Build one complete Race Debrief for an INDY NXT race with all states wired: outcome, qualifying conversion, lap-position story, section strengths, teammate context, modeled weather, and source drawer. Once one race works, generalize across the 36 analyzable races.",
        "",
        "Recommended first slice candidates:",
        "",
        "1. 2024 Grand Prix of Portland: clean podium conversion and low-volatility execution.",
        "2. 2026 Indianapolis Grand Prix Race 1: high-volatility race shape and poor late movement.",
        "3. 2025 Grand Prix of Portland: strong qualifying position but contact-limited result.",
        "4. 2026 Detroit Grand Prix: recovery result plus strong same-team context.",
        "",
        "## Career Extension Strategy",
        "",
        "After INDY NXT, extend by metric family rather than by series. First migrate analyses that have honest parity: result basics, start/finish deltas, qualifying conversion where field-wide qualifying exists, and weather/context where exact windows exist. Then add lap-shape and section-strength only for series/source families that expose comparable lap or section data.",
        "",
        "## Design Notes For The Polished UI Pass",
        "",
        "- Visual tone should be clean motorsport intelligence: restrained palette, high typographic quality, generous spacing, precise labels, no neon panels.",
        "- Avoid charts that look impressive but answer no debrief question.",
        "- Favor annotated race stories over dense standalone dashboards.",
        "- Put caveats close to the metric, but make them elegant: small confidence pills, hover/source drawers, and section-level availability labels.",
        "- Treat weather as a context strip, not a hero chart.",
        "- Use tables only for exact audit or lookup; the default evidence should be charts/cards with narrative interpretation.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    TABLE_DIR.mkdir(parents=True, exist_ok=True)
    ctx = load_context()

    race_rows, all_results = build_race_dataset(ctx)
    lap_rows, timeline_rows = analyze_laps(ctx, race_rows)
    lap_by_session = {row["sessionId"]: row for row in lap_rows}
    for row in race_rows:
        row.update({k: v for k, v in lap_by_session.get(row["sessionId"], {}).items() if k not in {"raceLabel", "sessionId"}})
    add_weather_labels(race_rows)
    add_race_stories(race_rows)
    section_rows = analyze_sections(ctx, race_rows)
    head_to_head = analyze_head_to_head(ctx, race_rows, all_results)

    race_df = pd.DataFrame(race_rows)
    lap_df = pd.DataFrame(lap_rows)
    section_df = pd.DataFrame(section_rows)
    group_rows = summarize_groups(race_df)
    correlations = run_correlations(race_df)
    weather_segments = analyze_weather_segments(race_df)
    model_rows = exploratory_model(race_df)

    race_rows_enriched = race_df.to_dict(orient="records")

    to_records(race_rows_enriched, TABLE_DIR / "indy_nxt_race_outcomes.csv")
    to_records(lap_rows, TABLE_DIR / "indy_nxt_lap_shape.csv")
    to_records(timeline_rows, TABLE_DIR / "indy_nxt_lap_timeline.csv")
    to_records(section_rows, TABLE_DIR / "indy_nxt_section_strengths.csv")
    to_records(group_rows, TABLE_DIR / "indy_nxt_group_summary.csv")
    to_records(correlations, TABLE_DIR / "indy_nxt_correlations.csv")
    to_records(head_to_head, TABLE_DIR / "indy_nxt_head_to_head.csv")
    to_records(weather_segments, TABLE_DIR / "indy_nxt_weather_segments.csv")
    to_records(model_rows, TABLE_DIR / "indy_nxt_exploratory_model.csv")

    # Rough charts. These are intentionally functional, not final UI design.
    top_gains = sorted(race_rows_enriched, key=lambda r: (r.get("positionGain") if r.get("positionGain") is not None else -999), reverse=True)[:10]
    simple_bar_svg(top_gains, "raceLabel", "positionGain", "Largest Bryce INDY NXT Position Gains", CHART_DIR / "largest_position_gains.svg")
    top_section = sorted(section_rows, key=lambda r: (r.get("rankPercentile") if r.get("rankPercentile") is not None else -1), reverse=True)[:12]
    simple_bar_svg(top_section, "sectionName", "rankPercentile", "Best Bryce Top-Section Percentiles", CHART_DIR / "best_section_percentiles.svg")
    h2h = [r for r in head_to_head if r.get("racesTogether", 0) >= 10]
    h2h = sorted(h2h, key=lambda r: r.get("headToHeadWinRate") or 0, reverse=True)[:12]
    simple_bar_svg(h2h, "driverName", "headToHeadWinRate", "Bryce Repeated-Rival Head-to-Head Win Rate", CHART_DIR / "head_to_head_win_rate.svg")
    by_date = sorted(race_rows_enriched, key=lambda r: r.get("scheduledStart") or "")
    line_svg(by_date, "raceLabel", "finishPosition", "Bryce INDY NXT Finish Position Over Time", CHART_DIR / "finish_position_over_time.svg")
    if timeline_rows:
        # Use the highest-volatility race as a sample lap-position story.
        available_laps = [r for r in lap_rows if r.get("lapDataState") == "available"]
        if available_laps:
            featured = max(available_laps, key=lambda r: r.get("positionVolatility") or 0)
            tl = [r for r in timeline_rows if r["sessionId"] == featured["sessionId"]]
            line_svg(tl, "lapNumber", "position", f"Lap Position Trace: {featured['raceLabel']}", CHART_DIR / "featured_lap_position_trace.svg")

    report = make_report(ctx, {
        "race_rows": race_rows_enriched,
        "lap_rows": lap_rows,
        "section_rows": section_rows,
        "correlations": correlations,
        "head_to_head": head_to_head,
        "weather_segments": weather_segments,
        "model_rows": model_rows,
    })
    (OUT_DIR / "INDY_NXT_ANALYTICS_DISCOVERY.md").write_text(report)
    (OUT_DIR / "UI_ANALYTICS_INSIGHT_INVENTORY.md").write_text(make_insight_inventory())

    summary = {
        "datasetPath": str(DATASET_PATH.relative_to(ROOT)),
        "datasetUpdatedAt": ctx.data.get("updatedAt"),
        "repoHead": "f3e5e32",
        "indyNxtEvents": len(ctx.indy_event_ids),
        "indyNxtSessions": len(ctx.indy_session_ids),
        "analyzableBryceRaceRows": len(race_rows),
        "weatherRowsInRaceSet": int(race_df["weatherId"].notna().sum()) if "weatherId" in race_df else 0,
        "lapShapeRows": len(lap_rows),
        "lapTimelineRows": len(timeline_rows),
        "sectionStrengthRows": len(section_rows),
        "headToHeadRows": len(head_to_head),
        "weatherSegmentRows": len(weather_segments),
        "outputs": {
            "report": "analysis/indy-nxt-discovery/output/INDY_NXT_ANALYTICS_DISCOVERY.md",
            "insightInventory": "analysis/indy-nxt-discovery/output/UI_ANALYTICS_INSIGHT_INVENTORY.md",
            "tables": [str(p.relative_to(ROOT)) for p in sorted(TABLE_DIR.glob("*.csv"))],
            "charts": [str(p.relative_to(ROOT)) for p in sorted(CHART_DIR.glob("*.svg"))],
        },
    }
    json_dump(summary, OUT_DIR / "summary.json")

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
