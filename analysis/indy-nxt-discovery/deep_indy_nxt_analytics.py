#!/usr/bin/env python3
"""Second-pass INDY NXT analytics for BryceCast.

Reads canonical career data and first-pass discovery tables. Writes only inside
analysis/indy-nxt-discovery/output/deep_dive.
"""

from __future__ import annotations

import csv
import json
import math
import os
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from statistics import mean, median
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "data/career/career.dataset.json"
FIRST_PASS_TABLES = ROOT / "analysis/indy-nxt-discovery/output/tables"
OUT_DIR = ROOT / "analysis/indy-nxt-discovery/output/deep_dive"
TABLE_DIR = OUT_DIR / "tables"
CHART_DIR = OUT_DIR / "charts"

BRYCE_ID = "driver_bryce_aron"
INDY_SERIES_ID = "series_indy_nxt"


def resolve_run_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    return date.today()


RUN_DATE = resolve_run_date()


def clean_num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "DNS", "DNF", "nan", "None"}:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def safe_div(a: float | int | None, b: float | int | None) -> float | None:
    if a is None or b in (None, 0):
        return None
    return float(a) / float(b)


def pct_rank(values: list[float], value: float, higher_is_better: bool = True) -> float | None:
    clean = [v for v in values if v is not None and math.isfinite(v)]
    if not clean:
        return None
    if higher_is_better:
        return sum(v <= value for v in clean) / len(clean)
    return sum(v >= value for v in clean) / len(clean)


def corr(x: list[float], y: list[float]) -> float | None:
    pairs = [(a, b) for a, b in zip(x, y) if a is not None and b is not None and math.isfinite(a) and math.isfinite(b)]
    if len(pairs) < 4:
        return None
    arr = np.array(pairs, dtype=float)
    if np.std(arr[:, 0]) == 0 or np.std(arr[:, 1]) == 0:
        return None
    return float(np.corrcoef(arr[:, 0], arr[:, 1])[0, 1])


def gini(values: list[float]) -> float | None:
    vals = sorted(v for v in values if v is not None and math.isfinite(v) and v >= 0)
    if not vals:
        return None
    total = sum(vals)
    if total == 0:
        return 0.0
    n = len(vals)
    return sum((2 * i - n - 1) * v for i, v in enumerate(vals, 1)) / (n * total)


def entropy_share(counts: Counter[str]) -> float | None:
    total = sum(counts.values())
    if total <= 0 or len(counts) <= 1:
        return 0.0 if total else None
    ent = 0.0
    for count in counts.values():
        p = count / total
        ent -= p * math.log(p)
    return ent / math.log(len(counts))


def write_csv(rows: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("")
        return
    keys: list[str] = []
    for row in rows:
        for key in row:
            if key not in keys:
                keys.append(key)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=keys, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


def table_md(rows: list[dict[str, Any]] | pd.DataFrame, cols: list[str], limit: int = 12) -> str:
    if isinstance(rows, pd.DataFrame):
        rows = rows.to_dict("records")
    rows = rows[:limit]
    if not rows:
        return "_No rows._"
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    body = ["| " + " | ".join(fmt(row.get(c)) for c in cols) + " |" for row in rows]
    return "\n".join([header, sep, *body])


@dataclass
class Context:
    data: dict[str, Any]
    events: dict[str, dict[str, Any]]
    sessions: dict[str, dict[str, Any]]
    tracks: dict[str, dict[str, Any]]
    teams: dict[str, dict[str, Any]]
    drivers: dict[str, dict[str, Any]]
    indy_event_ids: set[str]
    indy_session_ids: set[str]


def load_context() -> Context:
    data = json.loads(DATASET_PATH.read_text())
    events = {r["id"]: r for r in data["events"]}
    sessions = {r["id"]: r for r in data["sessions"]}
    tracks = {r["id"]: r for r in data["tracks"]}
    teams = {r["id"]: r for r in data["teams"]}
    drivers = {r["id"]: r for r in data["drivers"]}
    indy_event_ids = {e["id"] for e in data["events"] if e.get("seriesId") == INDY_SERIES_ID}
    indy_session_ids = {s["id"] for s in data["sessions"] if s.get("eventId") in indy_event_ids}
    return Context(data, events, sessions, tracks, teams, drivers, indy_event_ids, indy_session_ids)


def race_label(ctx: Context, session_id: str) -> str:
    session = ctx.sessions[session_id]
    event = ctx.events[session["eventId"]]
    race_no = session.get("raceNumber")
    suffix = f" R{int(race_no)}" if race_no else ""
    return f"{event.get('seasonYear')} {event.get('name')}{suffix}"


def driver_name(ctx: Context, driver_id: str | None) -> str:
    if not driver_id:
        return ""
    return ctx.drivers.get(driver_id, {}).get("displayName") or ctx.drivers.get(driver_id, {}).get("name") or driver_id


def team_name(ctx: Context, team_id: str | None) -> str:
    if not team_id:
        return ""
    return ctx.teams.get(team_id, {}).get("name") or team_id


def session_sort_key(ctx: Context, session_id: str) -> tuple[Any, ...]:
    s = ctx.sessions[session_id]
    e = ctx.events[s["eventId"]]
    return (e.get("seasonYear") or 0, s.get("scheduledStart") or "", session_id)


def build_indexes(ctx: Context) -> dict[str, Any]:
    race_sessions = [
        s for s in ctx.sessions.values()
        if s["id"] in ctx.indy_session_ids and s.get("sessionType") == "race"
    ]
    race_session_ids = {s["id"] for s in race_sessions}
    results_by_session = defaultdict(list)
    for r in ctx.data["results"]:
        if r.get("sessionId") in ctx.indy_session_ids:
            results_by_session[r["sessionId"]].append(r)
    weather_by_session = {w.get("sessionId"): w for w in ctx.data["weatherObservations"] if w.get("sessionId") in ctx.indy_session_ids}
    penalties_by_session = defaultdict(list)
    for p in ctx.data["penalties"]:
        if p.get("sessionId") in race_session_ids:
            penalties_by_session[p["sessionId"]].append(p)
    incidents_by_session = defaultdict(list)
    for i in ctx.data["incidents"]:
        if i.get("sessionId") in race_session_ids:
            incidents_by_session[i["sessionId"]].append(i)
    metrics_by_session_type = defaultdict(dict)
    for m in ctx.data["derivedMetrics"]:
        sid = m.get("sessionId")
        if sid in ctx.indy_session_ids:
            metrics_by_session_type[sid][m.get("metricType")] = m
    return {
        "race_sessions": race_sessions,
        "race_session_ids": race_session_ids,
        "results_by_session": results_by_session,
        "weather_by_session": weather_by_session,
        "penalties_by_session": penalties_by_session,
        "incidents_by_session": incidents_by_session,
        "metrics_by_session_type": metrics_by_session_type,
    }


def read_first_pass_races() -> pd.DataFrame:
    path = FIRST_PASS_TABLES / "indy_nxt_race_outcomes.csv"
    return pd.read_csv(path)


def lap_dynamics(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    race_session_ids = idx["race_session_ids"]
    laps_by_session_driver: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for lap in ctx.data["lapSamples"]:
        sid = lap.get("sessionId")
        if sid in race_session_ids and lap.get("driverId") and clean_num(lap.get("position")) is not None:
            laps_by_session_driver[(sid, lap["driverId"])].append(lap)

    race_rows = {r["sessionId"]: r for r in race_df.to_dict("records")}
    driver_rows: list[dict[str, Any]] = []
    race_rows_out: list[dict[str, Any]] = []
    for sid in sorted(race_session_ids, key=lambda s: session_sort_key(ctx, s)):
        rows_for_race = []
        for (lap_sid, did), laps in laps_by_session_driver.items():
            if lap_sid != sid:
                continue
            ordered = sorted(laps, key=lambda x: x.get("lapNumber") or 0)
            pos = [clean_num(l.get("position")) for l in ordered if clean_num(l.get("position")) is not None]
            if len(pos) < 2:
                continue
            deltas = [pos[i - 1] - pos[i] for i in range(1, len(pos))]
            row = {
                "sessionId": sid,
                "raceLabel": race_label(ctx, sid),
                "driverId": did,
                "driverName": driver_name(ctx, did),
                "lapSamples": len(pos),
                "firstLapPosition": pos[0],
                "finalLapPosition": pos[-1],
                "bestRunningPosition": min(pos),
                "worstRunningPosition": max(pos),
                "netLapChartGain": pos[0] - pos[-1],
                "positionVolatility": sum(abs(d) for d in deltas),
                "positiveLapMoves": sum(1 for d in deltas if d > 0),
                "negativeLapMoves": sum(1 for d in deltas if d < 0),
                "sourceState": "available",
            }
            rows_for_race.append(row)
            driver_rows.append(row)
        if not rows_for_race:
            continue
        gains = [r["netLapChartGain"] for r in rows_for_race]
        vols = [r["positionVolatility"] for r in rows_for_race]
        bryce = next((r for r in rows_for_race if r["driverId"] == BRYCE_ID), None)
        field_top_gain = max(rows_for_race, key=lambda r: r["netLapChartGain"])
        field_most_volatile = max(rows_for_race, key=lambda r: r["positionVolatility"])
        race_rows_out.append({
            "sessionId": sid,
            "raceLabel": race_label(ctx, sid),
            "fieldLapDrivers": len(rows_for_race),
            "fieldMeanLapGain": mean(gains),
            "fieldMedianVolatility": median(vols),
            "fieldMeanVolatility": mean(vols),
            "fieldVolatilityGini": gini(vols),
            "topLapChartMover": field_top_gain["driverName"],
            "topLapChartGain": field_top_gain["netLapChartGain"],
            "mostVolatileDriver": field_most_volatile["driverName"],
            "mostVolatileScore": field_most_volatile["positionVolatility"],
            "bryceNetLapChartGain": bryce["netLapChartGain"] if bryce else None,
            "bryceLapGainPercentile": pct_rank(gains, bryce["netLapChartGain"]) if bryce else None,
            "bryceVolatility": bryce["positionVolatility"] if bryce else None,
            "bryceStabilityPercentile": pct_rank(vols, bryce["positionVolatility"], higher_is_better=False) if bryce else None,
            "bryceBestRunningPosition": bryce["bestRunningPosition"] if bryce else None,
            "bryceWorstRunningPosition": bryce["worstRunningPosition"] if bryce else None,
            "bryceFinishPosition": race_rows.get(sid, {}).get("finishPosition"),
            "brycePrimaryStory": race_rows.get(sid, {}).get("primaryStory"),
            "sourceState": "official_lap_chart",
        })
    return race_rows_out, driver_rows


def leader_context(ctx: Context, idx: dict[str, Any], completed_race_sids: set[str]) -> list[dict[str, Any]]:
    out = []
    for sid in sorted(completed_race_sids, key=lambda s: session_sort_key(ctx, s)):
        metric = idx["metrics_by_session_type"].get(sid, {}).get("official_leader_lap_summary")
        laps = (metric or {}).get("metrics", {}).get("laps", [])
        if not laps:
            continue
        leaders = [l.get("driverId") or l.get("driverName") for l in laps if l.get("driverId") or l.get("driverName")]
        counts = Counter(leaders)
        leader_changes = sum(1 for i in range(1, len(leaders)) if leaders[i] != leaders[i - 1])
        top_driver, top_laps = counts.most_common(1)[0]
        bryce_laps = counts.get(BRYCE_ID, 0)
        out.append({
            "sessionId": sid,
            "raceLabel": race_label(ctx, sid),
            "leaderLapRows": len(laps),
            "leaderCount": len(counts),
            "leaderChangesFromLapRows": leader_changes,
            "topLeader": driver_name(ctx, top_driver) if top_driver.startswith("driver_") else top_driver,
            "topLeaderLaps": top_laps,
            "topLeaderShare": safe_div(top_laps, len(laps)),
            "leaderEntropy": entropy_share(counts),
            "bryceLapsLedFromLeaderSummary": bryce_laps,
            "sourceState": "official_leader_lap_summary",
        })
    return out


def incident_penalty_context(ctx: Context, idx: dict[str, Any], completed_race_sids: set[str]) -> list[dict[str, Any]]:
    out = []
    for sid in sorted(completed_race_sids, key=lambda s: session_sort_key(ctx, s)):
        penalties = idx["penalties_by_session"].get(sid, [])
        incidents = idx["incidents_by_session"].get(sid, [])
        bryce_penalties = [p for p in penalties if p.get("driverId") == BRYCE_ID or BRYCE_ID in (p.get("otherDriverIds") or [])]
        bryce_incidents = [i for i in incidents if i.get("driverId") == BRYCE_ID or BRYCE_ID in (i.get("otherDriverIds") or [])]
        incident_drivers = Counter()
        for inc in incidents:
            if inc.get("driverId"):
                incident_drivers[inc["driverId"]] += 1
            for did in inc.get("otherDriverIds") or []:
                incident_drivers[did] += 1
        penalty_drivers = Counter(p.get("driverId") for p in penalties if p.get("driverId"))
        out.append({
            "sessionId": sid,
            "raceLabel": race_label(ctx, sid),
            "sessionPenaltyCount": len(penalties),
            "sessionIncidentCount": len(incidents),
            "brycePenaltyCount": len(bryce_penalties),
            "bryceIncidentCount": len(bryce_incidents),
            "penaltyTypes": "; ".join(f"{k}:{v}" for k, v in Counter(p.get("penaltyType") for p in penalties).most_common()),
            "incidentTypes": "; ".join(f"{k}:{v}" for k, v in Counter(i.get("incidentType") for i in incidents).most_common()),
            "mostIncidentExposedDriver": driver_name(ctx, incident_drivers.most_common(1)[0][0]) if incident_drivers else "",
            "mostPenaltyExposedDriver": driver_name(ctx, penalty_drivers.most_common(1)[0][0]) if penalty_drivers else "",
            "bryceIncidentDescriptions": " | ".join(i.get("description", "") for i in bryce_incidents[:3]),
            "brycePenaltyDescriptions": " | ".join(f"{p.get('penaltyType')} {p.get('reason')}" for p in bryce_penalties[:3]),
            "sourceState": "official_results_pdf_summaries",
        })
    return out


def team_context(ctx: Context, idx: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    race_rows = []
    by_team_year: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for sid in sorted(idx["race_session_ids"], key=lambda s: session_sort_key(ctx, s)):
        session = ctx.sessions[sid]
        event = ctx.events[session["eventId"]]
        results = [r for r in idx["results_by_session"].get(sid, []) if r.get("finishPosition") is not None]
        bryce = next((r for r in results if r.get("driverId") == BRYCE_ID), None)
        if not bryce:
            continue
        for r in results:
            by_team_year[(event.get("seasonYear"), r.get("teamId"))].append({**r, "_sessionId": sid})
        team_results = [r for r in results if r.get("teamId") == bryce.get("teamId")]
        teammate_results = [r for r in team_results if r.get("driverId") != BRYCE_ID]
        finishes = [r["finishPosition"] for r in team_results]
        bryce_finish = bryce.get("finishPosition")
        statuses = [str(r.get("status") or r.get("statusRaw") or "").lower() for r in team_results]
        issue_like = sum(1 for s in statuses if s and s not in {"running", "unknown"})
        race_rows.append({
            "sessionId": sid,
            "raceLabel": race_label(ctx, sid),
            "seasonYear": event.get("seasonYear"),
            "teamId": bryce.get("teamId"),
            "teamName": team_name(ctx, bryce.get("teamId")),
            "bryceFinish": bryce_finish,
            "teamCars": len(team_results),
            "teammates": "; ".join(driver_name(ctx, r.get("driverId")) for r in teammate_results),
            "teamBestFinish": min(finishes) if finishes else None,
            "teamWorstFinish": max(finishes) if finishes else None,
            "teamAverageFinish": mean(finishes) if finishes else None,
            "bryceVsTeamAvgFinish": bryce_finish - mean(finishes) if bryce_finish is not None and finishes else None,
            "bryceTeamFinishRank": sorted(finishes).index(bryce_finish) + 1 if bryce_finish in finishes else None,
            "teamTop10Count": sum(1 for f in finishes if f <= 10),
            "teamIssueLikeStatuses": issue_like,
            "statusCaveat": "status taxonomy is official result status, not engineering root-cause attribution",
            "sourceState": "official_results",
        })
    year_rows = []
    for (year, tid), rows in sorted(by_team_year.items()):
        finishes = [r.get("finishPosition") for r in rows if r.get("finishPosition") is not None]
        statuses = [str(r.get("status") or r.get("statusRaw") or "").lower() for r in rows]
        bryce_rows = [r for r in rows if r.get("driverId") == BRYCE_ID]
        if not finishes:
            continue
        year_rows.append({
            "seasonYear": year,
            "teamId": tid,
            "teamName": team_name(ctx, tid),
            "raceResultRows": len(rows),
            "avgFinish": mean(finishes),
            "medianFinish": median(finishes),
            "top5Rate": safe_div(sum(1 for f in finishes if f <= 5), len(finishes)),
            "top10Rate": safe_div(sum(1 for f in finishes if f <= 10), len(finishes)),
            "issueLikeStatusRate": safe_div(sum(1 for s in statuses if s and s not in {"running", "unknown"}), len(statuses)),
            "bryceRows": len(bryce_rows),
            "bryceAvgFinish": mean([r["finishPosition"] for r in bryce_rows]) if bryce_rows else None,
            "sourceState": "official_results",
            "caveat": "team aggregates are descriptive and field-position based; no engineering telemetry is present",
        })
    return race_rows, year_rows


def prep_session_context(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    event_sessions = defaultdict(list)
    for s in ctx.sessions.values():
        if s["id"] in ctx.indy_session_ids:
            event_sessions[s["eventId"]].append(s)
    out = []
    for race in race_df.to_dict("records"):
        event_id = race["eventId"]
        sessions = event_sessions[event_id]
        practice_sids = [s["id"] for s in sessions if s.get("sessionType") == "practice"]
        qual_sids = [s["id"] for s in sessions if s.get("sessionType") == "qualifying"]
        practice_rows = [
            r for sid in practice_sids for r in idx["results_by_session"].get(sid, [])
            if r.get("driverId") == BRYCE_ID and clean_num(r.get("finishPosition")) is not None
        ]
        qual_rows = [
            q for q in ctx.data["qualifyingResults"]
            if q.get("sessionId") in qual_sids and q.get("driverId") == BRYCE_ID and clean_num(q.get("position")) is not None
        ]
        field_practice = [len(idx["results_by_session"].get(sid, [])) for sid in practice_sids if idx["results_by_session"].get(sid)]
        best_practice = min([r.get("finishPosition") for r in practice_rows], default=None)
        avg_practice = mean([r.get("finishPosition") for r in practice_rows]) if practice_rows else None
        best_qual = min([q.get("position") for q in qual_rows], default=None)
        avg_qual = mean([q.get("position") for q in qual_rows]) if qual_rows else None
        out.append({
            "sessionId": race["sessionId"],
            "eventId": event_id,
            "raceLabel": race["raceLabel"],
            "practiceSessionsWithBryce": len(practice_rows),
            "qualifyingSessionsWithBryce": len(qual_rows),
            "bestPracticeRank": best_practice,
            "avgPracticeRank": avg_practice,
            "bestQualifyingRank": best_qual,
            "avgQualifyingRank": avg_qual,
            "raceStart": race.get("startPosition"),
            "raceFinish": race.get("finishPosition"),
            "raceGain": race.get("positionGain"),
            "bestLapRank": race.get("bestLapRank"),
            "practiceFieldMedian": median(field_practice) if field_practice else None,
            "sourceState": "official_api_session_results",
            "caveat": "practice and group qualifying are rank/context signals; session formats are not fully equivalent",
        })
    correlations = []
    df = pd.DataFrame(out)
    pairs = [
        ("bestPracticeRank", "raceFinish", "Best practice rank vs race finish"),
        ("bestPracticeRank", "bestLapRank", "Best practice rank vs race best-lap rank"),
        ("bestQualifyingRank", "raceStart", "Best qualifying rank vs race start"),
        ("bestQualifyingRank", "raceFinish", "Best qualifying rank vs race finish"),
        ("avgQualifyingRank", "raceFinish", "Average qualifying rank vs race finish"),
    ]
    for x, y, label in pairs:
        sub = df[[x, y]].dropna()
        correlations.append({
            "x": x,
            "y": y,
            "label": label,
            "n": int(len(sub)),
            "pearson": corr(sub[x].astype(float).tolist(), sub[y].astype(float).tolist()),
            "interpretation": "Exploratory correlation; lower ranks are better; direction only.",
        })
    return out, correlations


def section_results_deep(ctx: Context, idx: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    session_rows = []
    section_rows = []
    for sid in sorted(idx["race_session_ids"], key=lambda s: session_sort_key(ctx, s)):
        metric = idx["metrics_by_session_type"].get(sid, {}).get("official_section_results")
        if not metric:
            continue
        bryce_result = next((r for r in idx["results_by_session"].get(sid, []) if r.get("driverId") == BRYCE_ID), None)
        if not bryce_result:
            continue
        bryce_car = str(bryce_result.get("carNumber"))
        cars = metric.get("metrics", {}).get("cars", [])
        bryce_car_row = next((c for c in cars if str(c.get("carNumber")) == bryce_car), None)
        if not bryce_car_row:
            continue
        comparisons = []
        by_section: dict[str, list[float]] = defaultdict(list)
        all_laps = sorted({lap.get("lapNumber") for c in cars for lap in c.get("laps", []) if lap.get("lapNumber") is not None})
        max_lap = max(all_laps) if all_laps else None
        for lap in bryce_car_row.get("laps", []):
            lap_no = lap.get("lapNumber")
            for sec in lap.get("sections", []):
                name = sec.get("name")
                if not name or name == "Lap":
                    continue
                bryce_time = clean_num(sec.get("timeSeconds"))
                if bryce_time is None:
                    continue
                field_times = []
                for car in cars:
                    matching_lap = next((l for l in car.get("laps", []) if l.get("lapNumber") == lap_no), None)
                    if not matching_lap:
                        continue
                    matching_sec = next((s for s in matching_lap.get("sections", []) if s.get("name") == name), None)
                    t = clean_num((matching_sec or {}).get("timeSeconds"))
                    if t is not None:
                        field_times.append(t)
                if len(field_times) < 8:
                    continue
                rank = 1 + sum(1 for t in field_times if t < bryce_time)
                percentile = 1 - ((rank - 1) / (len(field_times) - 1))
                comparisons.append(percentile)
                by_section[name].append(percentile)
        if not comparisons:
            continue
        top_quartile = sum(1 for p in comparisons if p >= 0.75)
        bottom_quartile = sum(1 for p in comparisons if p <= 0.25)
        best_sections = sorted(by_section.items(), key=lambda kv: mean(kv[1]), reverse=True)[:4]
        weakest_sections = sorted(by_section.items(), key=lambda kv: mean(kv[1]))[:4]
        session_rows.append({
            "sessionId": sid,
            "raceLabel": race_label(ctx, sid),
            "sectionComparisonRows": len(comparisons),
            "medianSectionPercentile": median(comparisons),
            "topQuartileShare": top_quartile / len(comparisons),
            "bottomQuartileShare": bottom_quartile / len(comparisons),
            "bestSectionFamilies": "; ".join(f"{name}:{mean(vals):.2f}" for name, vals in best_sections),
            "weakestSectionFamilies": "; ".join(f"{name}:{mean(vals):.2f}" for name, vals in weakest_sections),
            "sourceState": "official_section_results",
            "caveat": "per-lap section percentile compares source-visible rows only; low-denominator comparisons suppressed",
        })
        for name, vals in by_section.items():
            section_rows.append({
                "sessionId": sid,
                "raceLabel": race_label(ctx, sid),
                "sectionName": name,
                "comparisonRows": len(vals),
                "meanPercentile": mean(vals),
                "medianPercentile": median(vals),
                "topQuartileShare": sum(1 for v in vals if v >= 0.75) / len(vals),
                "bottomQuartileShare": sum(1 for v in vals if v <= 0.25) / len(vals),
                "sourceState": "official_section_results",
            })
    return session_rows, section_rows


def outcome_scores(
    race_df: pd.DataFrame,
    lap_race_rows: list[dict[str, Any]],
    team_race_rows: list[dict[str, Any]],
    section_session_rows: list[dict[str, Any]],
    incident_rows: list[dict[str, Any]],
    leader_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    lap_by = {r["sessionId"]: r for r in lap_race_rows}
    team_by = {r["sessionId"]: r for r in team_race_rows}
    section_by = {r["sessionId"]: r for r in section_session_rows}
    incident_by = {r["sessionId"]: r for r in incident_rows}
    leader_by = {r["sessionId"]: r for r in leader_rows}
    rows = []
    for race in race_df.to_dict("records"):
        sid = race["sessionId"]
        finish = clean_num(race.get("finishPosition"))
        start = clean_num(race.get("startPosition"))
        gain = clean_num(race.get("positionGain"))
        field = clean_num(race.get("fieldSize")) or 0
        finish_pct = clean_num(race.get("finishPercentile"))
        start_pct = clean_num(race.get("startPercentile"))
        status = str(race.get("status") or "").lower()
        lap = lap_by.get(sid, {})
        team = team_by.get(sid, {})
        section = section_by.get(sid, {})
        section_is_comparable = (clean_num(section.get("sectionComparisonRows")) or 0) >= 50
        incidents = incident_by.get(sid, {})
        leader = leader_by.get(sid, {})
        pace_components = [
            1 - ((clean_num(race.get("bestLapRank")) - 1) / (field - 1)) if clean_num(race.get("bestLapRank")) and field > 1 else None,
            clean_num(section.get("medianSectionPercentile")) if section_is_comparable else None,
        ]
        pace_components = [p for p in pace_components if p is not None]
        pace_index = mean(pace_components) if pace_components else None
        conversion = finish_pct - start_pct if finish_pct is not None and start_pct is not None else None
        teammate_delta = clean_num(team.get("bryceVsTeamAvgFinish"))
        chaos_exposure = mean([
            min(clean_num(race.get("cautionShare")) or 0, 0.5) / 0.5,
            min((clean_num(race.get("sessionIncidentCount")) or 0) / 6, 1),
            min((clean_num(race.get("sessionPenaltyCount")) or 0) / 8, 1),
            min((clean_num(lap.get("fieldMedianVolatility")) or 0) / 20, 1),
            clean_num(leader.get("leaderEntropy")) or 0,
        ])
        if status and status not in {"running", "unknown"}:
            archetype = "incident_or_reliability_limited"
        elif finish is not None and finish <= 5:
            archetype = "podium_top5_conversion" if gain is not None and gain >= 0 else "front_result_from_track_position"
        elif gain is not None and gain >= 5:
            archetype = "recovery_drive"
        elif pace_index is not None and pace_index >= 0.72 and finish is not None and finish > 10:
            archetype = "hidden_pace_bad_result"
        elif chaos_exposure >= 0.6 and gain is not None and gain < 0:
            archetype = "chaos_lost_position"
        elif teammate_delta is not None and teammate_delta <= 0 and finish is not None and finish > 10:
            archetype = "team_context_outperformed_teammates"
        elif gain is not None and gain <= -5:
            archetype = "conversion_loss"
        else:
            archetype = "baseline_execution"
        rows.append({
            "sessionId": sid,
            "raceLabel": race.get("raceLabel"),
            "seasonYear": race.get("seasonYear"),
            "trackName": race.get("trackName"),
            "trackType": race.get("trackType"),
            "teamName": race.get("teamName"),
            "startPosition": start,
            "finishPosition": finish,
            "positionGain": gain,
            "finishPercentile": finish_pct,
            "conversionPercentileDelta": conversion,
            "paceIndex": pace_index,
            "bestLapRank": race.get("bestLapRank"),
            "medianSectionPercentile": section.get("medianSectionPercentile") if section_is_comparable else None,
            "sectionComparisonRows": section.get("sectionComparisonRows"),
            "bryceLapGainPercentile": lap.get("bryceLapGainPercentile"),
            "bryceStabilityPercentile": lap.get("bryceStabilityPercentile"),
            "chaosExposureIndex": chaos_exposure,
            "cautionShare": race.get("cautionShare"),
            "sessionIncidentCount": race.get("sessionIncidentCount"),
            "sessionPenaltyCount": race.get("sessionPenaltyCount"),
            "bryceVsTeamAvgFinish": teammate_delta,
            "teamFinishRank": team.get("bryceTeamFinishRank"),
            "leaderEntropy": leader.get("leaderEntropy"),
            "weatherContext": f"{race.get('wetDry')}/{race.get('thermalStress')}/{race.get('windRisk')}",
            "archetype": archetype,
            "sourceState": "derived_from_official_results_lap_chart_sections_and_modeled_weather",
            "confidence": "medium" if pace_index is not None else "medium_low",
            "caveat": "derived score for product discovery; review labels before public UI copy",
        })
    return rows


def future_weekend_prep(ctx: Context, race_df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = []
    race_history = race_df.to_dict("records")
    for event in sorted([e for e in ctx.events.values() if e.get("seriesId") == INDY_SERIES_ID], key=lambda e: e.get("eventStartDate") or ""):
        start = event.get("eventStartDate")
        if not start:
            continue
        try:
            start_date = date.fromisoformat(start[:10])
        except ValueError:
            continue
        if start_date < RUN_DATE:
            continue
        track = ctx.tracks.get(event.get("trackId"), {})
        same_track = [r for r in race_history if r.get("trackId") == track.get("id")]
        same_type = [r for r in race_history if r.get("trackType") == track.get("trackType")]
        rows.append({
            "eventId": event["id"],
            "eventName": event.get("name"),
            "eventStartDate": event.get("eventStartDate"),
            "trackName": track.get("canonicalName") or track.get("name"),
            "trackType": track.get("trackType"),
            "trackLengthMi": track.get("lengthMi"),
            "cornerCount": track.get("cornerCount"),
            "bryceIndyNxtRacesAtTrack": len(same_track),
            "sameTrackAvgFinish": mean([r["finishPosition"] for r in same_track]) if same_track else None,
            "sameTrackAvgGain": mean([r["positionGain"] for r in same_track]) if same_track else None,
            "sameTrackTop10Rate": safe_div(sum(1 for r in same_track if r["finishPosition"] <= 10), len(same_track)) if same_track else None,
            "trackTypeAvgFinish": mean([r["finishPosition"] for r in same_type]) if same_type else None,
            "trackTypeAvgGain": mean([r["positionGain"] for r in same_type]) if same_type else None,
            "trackTypeTop10Rate": safe_div(sum(1 for r in same_type if r["finishPosition"] <= 10), len(same_type)) if same_type else None,
            "weatherState": "future_unavailable_in_historical_dataset",
            "prepUse": "race_weekend_preview_contract",
            "sourceState": "schedule_plus_historical_results",
        })
    return rows


def driver_strength_context(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    completed_sids = set(race_df["sessionId"].astype(str).tolist())
    all_rows = [
        r for sid in completed_sids for r in idx["results_by_session"].get(sid, [])
        if r.get("driverId") and clean_num(r.get("finishPosition")) is not None
    ]
    driver_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in all_rows:
        driver_groups[row["driverId"]].append(row)
    all_finish_pct = []
    for row in all_rows:
        finish = clean_num(row.get("finishPosition"))
        field = clean_num(row.get("fieldSize"))
        if finish is not None and field and field > 1:
            all_finish_pct.append(1 - ((finish - 1) / (field - 1)))
    global_mean = mean(all_finish_pct) if all_finish_pct else 0.5
    prior_n = 8

    rating_rows = []
    raw_rating_by_driver = {}
    for did, rows in driver_groups.items():
        finish_pct = []
        start_pct = []
        points = []
        issue_like = 0
        for row in rows:
            field = clean_num(row.get("fieldSize"))
            finish = clean_num(row.get("finishPosition"))
            start = clean_num(row.get("startPosition") or row.get("gridPosition"))
            if finish is not None and field and field > 1:
                finish_pct.append(1 - ((finish - 1) / (field - 1)))
            if start is not None and start > 0 and field and field > 1:
                start_pct.append(1 - ((start - 1) / (field - 1)))
            if clean_num(row.get("points")) is not None:
                points.append(clean_num(row.get("points")))
            status = str(row.get("status") or "").lower()
            if status and status not in {"running", "unknown"}:
                issue_like += 1
        n = len(finish_pct)
        if not n:
            continue
        raw = mean(finish_pct)
        shrunk = ((raw * n) + (global_mean * prior_n)) / (n + prior_n)
        raw_rating_by_driver[did] = shrunk
        rating_rows.append({
            "driverId": did,
            "driverName": driver_name(ctx, did),
            "raceRows": len(rows),
            "finishPercentileMean": raw,
            "finishPercentileMedian": median(finish_pct),
            "shrunkStrengthRating": shrunk,
            "avgStartPercentile": mean(start_pct) if start_pct else None,
            "avgPoints": mean(points) if points else None,
            "top5Rate": safe_div(sum(1 for r in rows if clean_num(r.get("finishPosition")) is not None and clean_num(r.get("finishPosition")) <= 5), len(rows)),
            "top10Rate": safe_div(sum(1 for r in rows if clean_num(r.get("finishPosition")) is not None and clean_num(r.get("finishPosition")) <= 10), len(rows)),
            "issueLikeStatusRate": safe_div(issue_like, len(rows)),
            "sourceState": "official_results_empirical_bayes",
            "caveat": "Descriptive strength context with shrinkage toward field mean; not a causal or scouting model.",
        })

    race_rows = []
    for race in race_df.to_dict("records"):
        sid = race["sessionId"]
        results = [r for r in idx["results_by_session"].get(sid, []) if r.get("driverId") and clean_num(r.get("finishPosition")) is not None]
        rivals = [r for r in results if r.get("driverId") != BRYCE_ID]
        field_ratings = [raw_rating_by_driver.get(r.get("driverId")) for r in rivals if raw_rating_by_driver.get(r.get("driverId")) is not None]
        bryce_result = next((r for r in results if r.get("driverId") == BRYCE_ID), None)
        top_rivals = sorted(
            [
                {
                    "driverName": driver_name(ctx, r.get("driverId")),
                    "rating": raw_rating_by_driver.get(r.get("driverId")),
                    "finish": r.get("finishPosition"),
                }
                for r in rivals
                if raw_rating_by_driver.get(r.get("driverId")) is not None
            ],
            key=lambda r: r["rating"],
            reverse=True,
        )[:5]
        race_rows.append({
            "sessionId": sid,
            "raceLabel": race["raceLabel"],
            "fieldRatedRivals": len(field_ratings),
            "fieldStrengthMean": mean(field_ratings) if field_ratings else None,
            "fieldStrengthMedian": median(field_ratings) if field_ratings else None,
            "topRatedRivals": "; ".join(f"{r['driverName']}:{r['rating']:.2f}" for r in top_rivals),
            "bryceFinish": bryce_result.get("finishPosition") if bryce_result else None,
            "bryceFinishPercentile": race.get("finishPercentile"),
            "resultVsFieldStrength": (clean_num(race.get("finishPercentile")) - mean(field_ratings)) if field_ratings and clean_num(race.get("finishPercentile")) is not None else None,
            "sourceState": "official_results_descriptive_strength",
            "caveat": "Field strength uses same-sample outcome history and should be read as context, not predictive truth.",
        })
    return (
        sorted(
            rating_rows,
            key=lambda r: (-(r["shrunkStrengthRating"] or 0), -(r["raceRows"] or 0), r["driverName"]),
        ),
        sorted(race_rows, key=lambda r: session_sort_key(ctx, r["sessionId"])),
    )


def championship_progression(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame) -> list[dict[str, Any]]:
    completed_sids = set(race_df["sessionId"].astype(str).tolist())
    by_year_sids: dict[int, list[str]] = defaultdict(list)
    for sid in completed_sids:
        year = ctx.events[ctx.sessions[sid]["eventId"]].get("seasonYear")
        if year:
            by_year_sids[int(year)].append(sid)
    rows = []
    for year, sids in sorted(by_year_sids.items()):
        points_by_driver: Counter[str] = Counter()
        for round_index, sid in enumerate(sorted(sids, key=lambda s: session_sort_key(ctx, s)), 1):
            for result in idx["results_by_session"].get(sid, []):
                did = result.get("driverId")
                pts = clean_num(result.get("points"))
                if did and pts is not None:
                    points_by_driver[did] += pts
            sorted_points = sorted(points_by_driver.items(), key=lambda kv: (-kv[1], driver_name(ctx, kv[0])))
            bryce_points = points_by_driver.get(BRYCE_ID, 0)
            bryce_rank = next((i + 1 for i, (did, _) in enumerate(sorted_points) if did == BRYCE_ID), None)
            leader_id, leader_points = sorted_points[0] if sorted_points else (None, None)
            rows.append({
                "seasonYear": year,
                "roundIndex": round_index,
                "sessionId": sid,
                "raceLabel": race_label(ctx, sid),
                "bryceRacePoints": next((r.get("points") for r in idx["results_by_session"].get(sid, []) if r.get("driverId") == BRYCE_ID), None),
                "bryceCumulativePoints": bryce_points,
                "bryceStandingRank": bryce_rank,
                "leaderDriver": driver_name(ctx, leader_id),
                "leaderPoints": leader_points,
                "pointsBehindLeader": leader_points - bryce_points if leader_points is not None else None,
                "sourceState": "official_results_points_progression",
                "caveat": "Progression uses imported INDY NXT race rows available in the canonical dataset; future 2026 sessions are excluded.",
            })
    return rows


def racecraft_context(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    completed_sids = set(race_df["sessionId"].astype(str).tolist())
    racecraft = [r for r in ctx.data["racecraftEvents"] if r.get("sessionId") in completed_sids]
    by_driver = Counter(r.get("driverId") for r in racecraft if r.get("driverId"))
    race_rows = []
    for race in race_df.to_dict("records"):
        sid = race["sessionId"]
        rows = [r for r in racecraft if r.get("sessionId") == sid]
        bryce_rows = [r for r in rows if r.get("driverId") == BRYCE_ID]
        top = max(rows, key=lambda r: clean_num(r.get("raw", {}).get("positionsImproved")) or -999) if rows else None
        race_rows.append({
            "sessionId": sid,
            "raceLabel": race["raceLabel"],
            "officialRacecraftRows": len(rows),
            "bryceRacecraftRows": len(bryce_rows),
            "bryceMostImprovedFlag": bool(bryce_rows),
            "bryceRacecraftDescription": " | ".join(r.get("description", "") for r in bryce_rows),
            "sessionMostImprovedDriver": driver_name(ctx, top.get("driverId")) if top else "",
            "sessionMostImprovedPositions": top.get("raw", {}).get("positionsImproved") if top else None,
            "sourceState": "official_event_summary_racecraft",
            "caveat": "Racecraft rows are official Event Summary most-improved facts, not a complete overtake log.",
        })
    driver_rows = [
        {
            "driverId": did,
            "driverName": driver_name(ctx, did),
            "officialMostImprovedCount": count,
            "sourceState": "official_event_summary_racecraft",
        }
        for did, count in by_driver.most_common()
    ]
    return race_rows, driver_rows


def source_family_audit(ctx: Context, idx: dict[str, Any], race_df: pd.DataFrame, outputs: dict[str, Any]) -> list[dict[str, Any]]:
    completed_sids = set(race_df["sessionId"].astype(str).tolist())
    indy_events = [e for e in ctx.events.values() if e.get("seriesId") == INDY_SERIES_ID]
    indy_sessions = [s for s in ctx.sessions.values() if s.get("eventId") in {e["id"] for e in indy_events}]
    family_counts = {
        "race_results": sum(1 for sid in completed_sids for r in idx["results_by_session"].get(sid, []) if r.get("driverId") == BRYCE_ID),
        "full_field_results": sum(len(idx["results_by_session"].get(sid, [])) for sid in completed_sids),
        "practice_results": sum(1 for s in indy_sessions if s.get("sessionType") == "practice"),
        "qualifying_results": sum(1 for q in ctx.data["qualifyingResults"] if q.get("sessionId") in ctx.indy_session_ids),
        "lap_samples": sum(1 for l in ctx.data["lapSamples"] if l.get("sessionId") in completed_sids),
        "section_results": sum(1 for m in ctx.data["derivedMetrics"] if m.get("sessionId") in completed_sids and m.get("metricType") == "official_section_results"),
        "top_section_times": sum(1 for m in ctx.data["derivedMetrics"] if m.get("sessionId") in completed_sids and m.get("metricType") == "official_top_section_times"),
        "event_summary_stats": sum(1 for m in ctx.data["derivedMetrics"] if m.get("sessionId") in completed_sids and m.get("metricType") == "official_event_summary_race_stats"),
        "leader_lap_summary": sum(1 for m in ctx.data["derivedMetrics"] if m.get("sessionId") in completed_sids and m.get("metricType") == "official_leader_lap_summary"),
        "incidents": sum(1 for i in ctx.data["incidents"] if i.get("sessionId") in completed_sids),
        "penalties": sum(1 for p in ctx.data["penalties"] if p.get("sessionId") in completed_sids),
        "racecraft_events": sum(1 for r in ctx.data["racecraftEvents"] if r.get("sessionId") in completed_sids),
        "weather_observations": sum(1 for w in ctx.data["weatherObservations"] if w.get("sessionId") in ctx.indy_session_ids),
        "future_schedule": sum(1 for s in indy_sessions if s.get("scheduledStart") and str(s.get("scheduledStart"))[:10] >= str(RUN_DATE)),
        "pit_stop_counts": sum(
            1 for sid in completed_sids
            for r in idx["results_by_session"].get(sid, [])
            if r.get("driverId") == BRYCE_ID and r.get("pitStops") is not None
        ),
        "telemetry_or_car_engineering": 0,
    }
    mapping = [
        ("race_results", "complete", "race_debrief_scores.csv", "Core result, conversion, points, and status analysis."),
        ("full_field_results", "complete", "driver_strength_ratings.csv; field_strength_by_race.csv; team_context_by_year.csv", "Full-field context, team context, and descriptive opponent strength."),
        ("practice_results", "complete_source_bounded", "prep_session_signals.csv", "Practice is represented as rank context; no absolute pace claims."),
        ("qualifying_results", "complete_source_bounded", "prep_session_signals.csv", "Qualifying is used for start/prep context; group/combined caveats remain."),
        ("lap_samples", "complete_source_bounded", "full_field_lap_dynamics_by_driver.csv", "Full-field lap movement and volatility analysis with partial-chart caveats."),
        ("section_results", "complete_source_bounded", "section_results_deep_by_race.csv", "Per-lap section percentiles with sparse-row suppression."),
        ("top_section_times", "partial", "section_results_deep_by_section.csv", "Top-section facts were useful earlier; final pass favors per-lap section results."),
        ("event_summary_stats", "complete", "race_debrief_scores.csv", "Cautions, passes, lead-change context folded into debrief scores."),
        ("leader_lap_summary", "complete", "leader_lap_context.csv", "Leader entropy and dominance context."),
        ("incidents", "complete", "incident_penalty_context.csv", "Incident exposure and type summaries."),
        ("penalties", "complete", "incident_penalty_context.csv", "Penalty exposure and type summaries."),
        ("racecraft_events", "complete_source_bounded", "racecraft_context_by_race.csv", "Official most-improved badges only; no inferred overtake log."),
        ("weather_observations", "complete_context_only", "race_debrief_scores.csv; future_weekend_prep_inputs.csv", "Modeled non-official weather used as context, not causality."),
        ("future_schedule", "complete_context_only", "future_weekend_prep_inputs.csv", "Future prep rows exclude forecast claims until current weather source is added."),
        ("pit_stop_counts", "complete_low_signal", "race_debrief_scores.csv", "Pit counts are present but low-signal; no pit sequence/tire/service analysis exists."),
        ("telemetry_or_car_engineering", "unavailable", "", "No telemetry or engineering-root-cause data in canonical sources."),
    ]
    return [
        {
            "sourceFamily": family,
            "sourceRows": family_counts.get(family),
            "analysisStatus": status,
            "primaryArtifacts": artifacts,
            "auditConclusion": conclusion,
        }
        for family, status, artifacts, conclusion in mapping
    ]


def make_adversarial_review(
    audit_rows: list[dict[str, Any]],
    race_scores: list[dict[str, Any]],
    driver_strength_rows: list[dict[str, Any]],
    championship_rows: list[dict[str, Any]],
) -> str:
    audit_df = pd.DataFrame(audit_rows)
    race_df = pd.DataFrame(race_scores)
    strength_df = pd.DataFrame(driver_strength_rows)
    champ_df = pd.DataFrame(championship_rows)
    incomplete = audit_df[audit_df["analysisStatus"].isin(["partial", "unavailable", "complete_low_signal"])]
    issue_rows = [
        {
            "issue": "Derived race debrief labels are useful but not final copy.",
            "severity": "medium",
            "evidence": "36 race labels are generated from thresholds and need manual source review before UI narrative copy.",
            "recommendedFix": "Keep labels as internal archetypes; add source drawer and manual-review status in UI contract.",
        },
        {
            "issue": "Opponent strength uses same-sample outcomes.",
            "severity": "medium",
            "evidence": f"{len(strength_df)} driver ratings use imported INDY NXT race rows with empirical shrinkage.",
            "recommendedFix": "Use it as descriptive field context. Avoid predictive claims until a larger model with season controls is built.",
        },
        {
            "issue": "Weather is modeled and non-official.",
            "severity": "medium",
            "evidence": "INDY NXT official weather is unavailable; exact-window modeled rows exist for historical sessions.",
            "recommendedFix": "Show weather as context and confidence state. Do not headline causal weather effects.",
        },
        {
            "issue": "Section rows have uneven density.",
            "severity": "medium",
            "evidence": "Sparse section-result sessions are preserved but suppressed from headline rankings below 50 comparison rows.",
            "recommendedFix": "Keep the denominator visible on every section visualization.",
        },
        {
            "issue": "Engineering claims are unsupported.",
            "severity": "high",
            "evidence": "Team context has official result statuses but no telemetry, setup notes, reliability root-cause feed, or engineering logs.",
            "recommendedFix": "Limit Ganassi analysis to result/team/status context unless new source-backed engineering evidence is added.",
        },
    ]
    lines = [
        "# INDY NXT Analytics Completion And Adversarial Review",
        "",
        "This review audits the INDY NXT analytics layer against source families available in the canonical career dataset and the generated analysis artifacts.",
        "",
        "## Completion Matrix",
        "",
        table_md(audit_rows, ["sourceFamily", "sourceRows", "analysisStatus", "primaryArtifacts", "auditConclusion"], 30),
        "",
        "## Structural Issues",
        "",
        table_md(issue_rows, ["severity", "issue", "evidence", "recommendedFix"], 10),
        "",
        "## Remaining Partial Or Unavailable Areas",
        "",
        table_md(incomplete, ["sourceFamily", "sourceRows", "analysisStatus", "auditConclusion"], 20),
        "",
        "## Final Assessment",
        "",
        f"- Race debrief coverage: {len(race_df)} Bryce INDY NXT race rows.",
        f"- Driver strength context: {len(strength_df)} rated drivers.",
        f"- Championship progression rows: {len(champ_df)} race checkpoints.",
        "- The analysis layer is broad enough for a UI contract after manual review of labels and section denominators.",
        "- The main unsafe area is overclaiming causality: weather, team engineering, and opponent strength must remain context unless new source families are added.",
        "",
        "## Analyses Considered And Rejected For Now",
        "",
        "- Causal weather regression: rejected because modeled weather plus small sample makes causal inference weak.",
        "- Engineering reliability model: rejected because official result statuses do not expose engineering root causes.",
        "- Pit strategy model: rejected because INDY NXT has counts only, not pit sequence, tire, service, or pit-time detail.",
        "- Public scouting model: deferred because opponent strength needs more seasons and shrinkage before being fair as a public-facing claim.",
        "",
        "## Agent Navigation Notes",
        "",
        "- Use the bundled workspace Python for this analytics script in the current Codex environment; the machine default `python3` may not include numpy/pandas.",
        "- Pit-stop counts are populated for all 36 Bryce INDY NXT race rows, but the source only supports count-level context.",
        "- Team context is race-result based in the INDY NXT debrief layer; do not mix it with practice/qualifying session context without a visible grain label.",
        "- Future weekend prep rows use historical same-track and track-type context only. Forecast weather needs a separate current-weather source before UI display.",
        "",
    ]
    return "\n".join(lines)


def ui_analytics_contract() -> tuple[list[dict[str, Any]], str]:
    rows = [
        {
            "module": "Race Debrief Score",
            "grain": "one Bryce INDY NXT race",
            "primaryArtifact": "race_debrief_scores.csv",
            "requiredFields": "sessionId, raceLabel, startPosition, finishPosition, positionGain, paceIndex, chaosExposureIndex, archetype, sourceState, confidence, caveat",
            "sourceState": "derived_from_official_results_lap_chart_sections_and_modeled_weather",
            "uiReadiness": "ready_after_manual_label_review",
            "displayRule": "Show as debrief card with source/caveat drawer; keep archetype as reviewable label.",
        },
        {
            "module": "Prep Funnel",
            "grain": "race event",
            "primaryArtifact": "prep_session_signals.csv",
            "requiredFields": "bestPracticeRank, avgPracticeRank, bestQualifyingRank, avgQualifyingRank, raceStart, raceFinish, caveat",
            "sourceState": "official_api_session_results",
            "uiReadiness": "ready",
            "displayRule": "Show practice and qualifying as context signals with session-format caveat.",
        },
        {
            "module": "Full-Field Lap Dynamics",
            "grain": "race and driver-race",
            "primaryArtifact": "full_field_lap_dynamics_by_race.csv; full_field_lap_dynamics_by_driver.csv",
            "requiredFields": "fieldLapDrivers, bryceNetLapChartGain, bryceLapGainPercentile, bryceVolatility, bryceStabilityPercentile",
            "sourceState": "official_lap_chart",
            "uiReadiness": "ready_with_partial_chart_badges",
            "displayRule": "Use inverted lap-position trace plus percentile badges; expose lap-chart completeness.",
        },
        {
            "module": "Team Context",
            "grain": "race and team-season",
            "primaryArtifact": "team_context_by_race.csv; team_context_by_year.csv",
            "requiredFields": "teamName, bryceVsTeamAvgFinish, bryceTeamFinishRank, issueLikeStatusRate, caveat",
            "sourceState": "official_results",
            "uiReadiness": "ready_descriptive_only",
            "displayRule": "Show result context only; no engineering-root-cause language.",
        },
        {
            "module": "Track-Type Profile",
            "grain": "track type",
            "primaryArtifact": "race_track_type_summary.csv",
            "requiredFields": "trackType, races, avgFinish, avgGain, top5Rate, top10Rate",
            "sourceState": "official_results_derived_summary",
            "uiReadiness": "ready",
            "displayRule": "Use as compact comparison panel and upcoming-race prep context.",
        },
        {
            "module": "Future Weekend Prep",
            "grain": "future event",
            "primaryArtifact": "future_weekend_prep_inputs.csv",
            "requiredFields": "eventName, eventStartDate, trackName, trackType, sameTrackAvgFinish, trackTypeAvgFinish, weatherState",
            "sourceState": "schedule_plus_historical_results",
            "uiReadiness": "ready_no_forecast",
            "displayRule": "Show historical same-track and track-type context; future weather remains unavailable until separate forecast source is added.",
        },
        {
            "module": "Weather Context",
            "grain": "session/race",
            "primaryArtifact": "race_debrief_scores.csv",
            "requiredFields": "weatherContext, weatherConfidence, wetDry, thermalStress, windRisk",
            "sourceState": "modeled_non_official",
            "uiReadiness": "ready_context_only",
            "displayRule": "Visually secondary context strip; no causal performance claims.",
        },
        {
            "module": "Source/Caveat State",
            "grain": "every metric/module",
            "primaryArtifact": "indy_nxt_source_family_audit.csv; all module CSVs",
            "requiredFields": "sourceState, confidence, caveat, analysisStatus, primaryArtifacts",
            "sourceState": "mixed_explicit",
            "uiReadiness": "ready",
            "displayRule": "Every stat must expose source state and caveat drawer entry.",
        },
        {
            "module": "Opponent Strength Context",
            "grain": "driver and race",
            "primaryArtifact": "driver_strength_ratings.csv; field_strength_by_race.csv",
            "requiredFields": "shrunkStrengthRating, fieldStrengthMean, resultVsFieldStrength, caveat",
            "sourceState": "official_results_empirical_bayes",
            "uiReadiness": "ready_descriptive_only",
            "displayRule": "Use as field-quality context; suppress predictive/scouting language.",
        },
        {
            "module": "Championship Progression",
            "grain": "season race checkpoint",
            "primaryArtifact": "championship_progression.csv",
            "requiredFields": "bryceCumulativePoints, bryceStandingRank, leaderDriver, pointsBehindLeader",
            "sourceState": "official_results_points_progression",
            "uiReadiness": "ready",
            "displayRule": "Use as season arc timeline and race weekend stakes context.",
        },
    ]
    lines = [
        "# INDY NXT UI Analytics Contract",
        "",
        "This contract defines the stable analytics modules the UI should consume. Each module has an explicit grain, artifact, source state, and display rule so the app can stay caveat-aware.",
        "",
        table_md(rows, ["module", "grain", "primaryArtifact", "sourceState", "uiReadiness", "displayRule"], 20),
        "",
        "## Contract Rules",
        "",
        "- Every displayed metric must carry a source state, confidence or readiness label, and caveat when applicable.",
        "- Derived labels are internal analytics labels until manually reviewed.",
        "- Modeled weather is context only.",
        "- Team context cannot imply engineering root cause without new source-backed engineering data.",
        "- Sparse section samples and partial lap charts must show denominators.",
    ]
    return rows, "\n".join(lines) + "\n"


def analysis_backlog() -> list[dict[str, Any]]:
    return [
        {
            "analysis": "Race Debrief Scoring",
            "status": "build_now",
            "reason": "Combines official result, lap chart, section, incident, teammate, and weather context at the race grain.",
            "uiImpact": "Core INDY NXT debrief screen.",
            "risk": "Derived labels need manual review before public-facing copy.",
        },
        {
            "analysis": "Practice to Qualifying to Race Funnel",
            "status": "build_now",
            "reason": "Practice and qualifying ranks are available and underused.",
            "uiImpact": "Race weekend prep and debrief preparation panel.",
            "risk": "Session formats vary; use rank/context signal instead of absolute pace claim.",
        },
        {
            "analysis": "Full Field Lap Dynamics",
            "status": "build_now",
            "reason": "Lap chart covers field movement and lets us quantify chaos and stability.",
            "uiImpact": "Lap-position story with Bryce percentile versus field.",
            "risk": "Partial chart caveats need propagation.",
        },
        {
            "analysis": "Team Baseline",
            "status": "build_now_descriptive_only",
            "reason": "Team rows and teammate rows exist for every race result.",
            "uiImpact": "Ganassi and Andretti context cards.",
            "risk": "No engineering telemetry, so do not claim mechanical root causes beyond official statuses.",
        },
        {
            "analysis": "Section Results Deep Pace",
            "status": "prototype_now_then_filter",
            "reason": "Official section results expose per-lap micro-sector comparisons.",
            "uiImpact": "Where was he fast, where did the race get away.",
            "risk": "Large table, odd section names, and suppressed low denominator comparisons need QA.",
        },
        {
            "analysis": "Opponent Strength Model",
            "status": "later",
            "reason": "Full-field results allow a strength model, but the sample is small and repeated-driver balance is imperfect.",
            "uiImpact": "More credible rival and team context.",
            "risk": "Requires careful shrinkage and season controls to avoid fake precision.",
        },
        {
            "analysis": "Causal Weather Effects",
            "status": "do_not_headline",
            "reason": "Weather rows are modeled and the sample is too small for causal claims.",
            "uiImpact": "Context strip, not a driver-performance explanation.",
            "risk": "High if overclaimed.",
        },
    ]


def summarize_race_scores(race_scores: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    df = pd.DataFrame(race_scores)
    archetype_rows = []
    for archetype, group in df.groupby("archetype", dropna=False):
        archetype_rows.append({
            "archetype": archetype,
            "races": int(len(group)),
            "avgFinish": float(group["finishPosition"].mean()),
            "avgGain": float(group["positionGain"].mean()),
            "avgPaceIndex": float(group["paceIndex"].mean()) if group["paceIndex"].notna().any() else None,
            "avgChaosExposure": float(group["chaosExposureIndex"].mean()),
            "top10Rate": float((group["finishPosition"] <= 10).mean()),
            "avgTeamDelta": float(group["bryceVsTeamAvgFinish"].mean()) if group["bryceVsTeamAvgFinish"].notna().any() else None,
        })
    track_rows = []
    for track_type, group in df.groupby("trackType", dropna=False):
        track_rows.append({
            "trackType": track_type,
            "races": int(len(group)),
            "avgFinish": float(group["finishPosition"].mean()),
            "avgGain": float(group["positionGain"].mean()),
            "avgPaceIndex": float(group["paceIndex"].mean()) if group["paceIndex"].notna().any() else None,
            "avgChaosExposure": float(group["chaosExposureIndex"].mean()),
            "top5Rate": float((group["finishPosition"] <= 5).mean()),
            "top10Rate": float((group["finishPosition"] <= 10).mean()),
        })
    ranked = df.sort_values("finishPosition")
    best = ranked.head(8)
    worst = ranked.tail(8)
    comparison_rows = []
    for label, group in [("best_8_by_finish", best), ("worst_8_by_finish", worst)]:
        comparison_rows.append({
            "cohort": label,
            "races": int(len(group)),
            "avgStart": float(group["startPosition"].mean()),
            "avgFinish": float(group["finishPosition"].mean()),
            "avgGain": float(group["positionGain"].mean()),
            "avgPaceIndex": float(group["paceIndex"].mean()) if group["paceIndex"].notna().any() else None,
            "avgChaosExposure": float(group["chaosExposureIndex"].mean()),
            "avgTeamDelta": float(group["bryceVsTeamAvgFinish"].mean()) if group["bryceVsTeamAvgFinish"].notna().any() else None,
            "issueOrReliabilityLimitedRows": int((group["archetype"] == "incident_or_reliability_limited").sum()),
            "ovalRows": int((group["trackType"] == "oval").sum()),
            "roadRows": int((group["trackType"] == "road").sum()),
            "streetRows": int((group["trackType"] == "street").sum()),
        })
    return (
        sorted(archetype_rows, key=lambda r: (-r["races"], r["avgFinish"])),
        sorted(track_rows, key=lambda r: r["avgFinish"]),
        comparison_rows,
    )


def simple_bar_chart(rows: list[dict[str, Any]], label_col: str, value_col: str, title: str, path: Path, limit: int = 12) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data = [r for r in rows if clean_num(r.get(value_col)) is not None][:limit]
    if not data:
        path.write_text("")
        return
    width, height = 920, 420
    margin_left, margin_top, margin_bottom = 230, 50, 50
    vals = [float(r[value_col]) for r in data]
    min_v = min(0, min(vals))
    max_v = max(vals)
    span = max(max_v - min_v, 1e-6)
    bar_h = (height - margin_top - margin_bottom) / len(data) * 0.72
    gap = (height - margin_top - margin_bottom) / len(data) * 0.28
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f7f7f4"/>',
        f'<text x="24" y="30" font-family="Arial" font-size="18" font-weight="700" fill="#1f2933">{title}</text>',
    ]
    zero_x = margin_left + ((0 - min_v) / span) * (width - margin_left - 50)
    svg.append(f'<line x1="{zero_x:.1f}" y1="{margin_top-5}" x2="{zero_x:.1f}" y2="{height-margin_bottom+5}" stroke="#9aa3ad" stroke-width="1"/>')
    for i, row in enumerate(data):
        y = margin_top + i * (bar_h + gap)
        val = float(row[value_col])
        x = margin_left + ((min(0, val) - min_v) / span) * (width - margin_left - 50)
        w = abs(val) / span * (width - margin_left - 50)
        color = "#0f766e" if val >= 0 else "#b42318"
        svg.append(f'<text x="18" y="{y + bar_h * .68:.1f}" font-family="Arial" font-size="12" fill="#334155">{str(row[label_col])[:34]}</text>')
        svg.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{max(w,1):.1f}" height="{bar_h:.1f}" fill="{color}" rx="3"/>')
        svg.append(f'<text x="{x + w + 6 if val >= 0 else x - 45:.1f}" y="{y + bar_h * .68:.1f}" font-family="Arial" font-size="12" fill="#111827">{val:.2f}</text>')
    svg.append("</svg>")
    path.write_text("\n".join(svg))


def make_report(outputs: dict[str, Any]) -> str:
    race_scores = pd.DataFrame(outputs["race_scores"])
    lap_races = pd.DataFrame(outputs["lap_race_rows"])
    prep = pd.DataFrame(outputs["prep_rows"])
    prep_corr = pd.DataFrame(outputs["prep_correlations"])
    team_year = pd.DataFrame(outputs["team_year_rows"])
    section_sessions = pd.DataFrame(outputs["section_session_rows"])
    future = pd.DataFrame(outputs["future_rows"])
    archetypes = pd.DataFrame(outputs["archetype_summary_rows"])
    track_summary = pd.DataFrame(outputs["track_summary_rows"])
    outcome_cohorts = pd.DataFrame(outputs["outcome_cohort_rows"])
    strength = pd.DataFrame(outputs["driver_strength_rows"])
    field_strength = pd.DataFrame(outputs["field_strength_rows"])
    championship = pd.DataFrame(outputs["championship_rows"])
    racecraft = pd.DataFrame(outputs["racecraft_race_rows"])
    source_audit = pd.DataFrame(outputs["source_audit_rows"])

    best = race_scores.sort_values(["finishPosition", "positionGain"], ascending=[True, False]).head(8)
    worst = race_scores.sort_values(["finishPosition", "conversionPercentileDelta"], ascending=[False, True]).head(8)
    hidden = race_scores[race_scores["archetype"].eq("hidden_pace_bad_result")].sort_values("paceIndex", ascending=False)
    chaos = race_scores.sort_values("chaosExposureIndex", ascending=False).head(8)
    stable = lap_races.sort_values("bryceStabilityPercentile", ascending=False).head(8)
    unstable = lap_races.sort_values("bryceStabilityPercentile", ascending=True).head(8)
    comparable_sections = section_sessions[section_sessions["sectionComparisonRows"].fillna(0) >= 50] if not section_sessions.empty else section_sessions
    sparse_sections = section_sessions[section_sessions["sectionComparisonRows"].fillna(0) < 50] if not section_sessions.empty else section_sessions
    section_best = comparable_sections.sort_values("medianSectionPercentile", ascending=False).head(8)
    section_worst = comparable_sections.sort_values("medianSectionPercentile").head(8)
    cgr = team_year[team_year["teamName"].str.contains("Ganassi", case=False, na=False)]

    lines = [
        "# INDY NXT Deep Analytics Review",
        "",
        "Generated as a second-pass analytics artifact from canonical career data. It reads the first-pass race outcome table and writes only under `analysis/indy-nxt-discovery/output/deep_dive`.",
        "",
        "## Executive Takeaways",
        "",
        "- The strongest next product surface is a race debrief scorecard, because it can combine official result, lap chart, section, incident, penalty, leader, team, prep-session, and modeled-weather context at one race grain.",
        "- The first-pass analytics were directionally useful. Three high-value source families needed deeper use: full-field lap dynamics, practice/qualifying preparation, and per-lap section results.",
        "- Team context is useful descriptively. It can show Bryce versus teammates and team-year baselines. It cannot diagnose Ganassi engineering causes from this dataset alone.",
        "- Practice and qualifying should feed race-weekend prep. The right claim is readiness/context signal, because session formats and group qualifying make absolute comparisons brittle.",
        "- Weather belongs in prep and debrief context. The current INDY NXT weather enrichment is modeled and exact-window for historical rows, so it should not support causal driver-performance claims.",
        "",
        "## What Separates Good And Bad Weekends",
        "",
        table_md(outcome_cohorts, ["cohort", "races", "avgStart", "avgFinish", "avgGain", "avgPaceIndex", "avgChaosExposure", "avgTeamDelta", "issueOrReliabilityLimitedRows", "ovalRows", "roadRows", "streetRows"], 4),
        "",
        "The top outcome cohort combines better finishing conversion, lower team-relative penalty, and more oval representation. The worst cohort clusters around conversion losses, incident/reliability-limited statuses, and team-context drag rather than one single pace pattern.",
        "",
        "## Race Archetype Summary",
        "",
        table_md(archetypes, ["archetype", "races", "avgFinish", "avgGain", "avgPaceIndex", "avgChaosExposure", "top10Rate", "avgTeamDelta"], 12),
        "",
        "## Track Type Summary",
        "",
        table_md(track_summary, ["trackType", "races", "avgFinish", "avgGain", "avgPaceIndex", "avgChaosExposure", "top5Rate", "top10Rate"], 8),
        "",
        "## Best Outcome Races",
        "",
        table_md(best, ["raceLabel", "trackType", "teamName", "startPosition", "finishPosition", "positionGain", "paceIndex", "chaosExposureIndex", "archetype"], 8),
        "",
        "## Worst Outcome Races",
        "",
        table_md(worst, ["raceLabel", "trackType", "teamName", "startPosition", "finishPosition", "positionGain", "paceIndex", "bryceVsTeamAvgFinish", "archetype"], 8),
        "",
        "## Hidden Pace Candidates",
        "",
        table_md(hidden, ["raceLabel", "finishPosition", "positionGain", "paceIndex", "bestLapRank", "medianSectionPercentile", "bryceVsTeamAvgFinish", "archetype"], 8),
        "",
        "These are the rows where a normal result table is most likely to miss the story. They need manual review against source caveats before becoming UI copy.",
        "",
        "## Race Chaos And Lap Dynamics",
        "",
        table_md(chaos, ["raceLabel", "finishPosition", "positionGain", "chaosExposureIndex", "cautionShare", "sessionIncidentCount", "sessionPenaltyCount", "leaderEntropy"], 8),
        "",
        "Most stable Bryce lap-chart races:",
        "",
        table_md(stable, ["raceLabel", "fieldLapDrivers", "bryceNetLapChartGain", "bryceLapGainPercentile", "bryceVolatility", "bryceStabilityPercentile"], 8),
        "",
        "Least stable Bryce lap-chart races:",
        "",
        table_md(unstable, ["raceLabel", "fieldLapDrivers", "bryceNetLapChartGain", "bryceLapGainPercentile", "bryceVolatility", "bryceStabilityPercentile"], 8),
        "",
        "## Preparation Signal",
        "",
        table_md(prep_corr, ["label", "n", "pearson", "interpretation"], 8),
        "",
        "Practice and qualifying are now represented as an event-level prep funnel. The model should display them as contextual evidence, with session format caveats.",
        "",
        "## Team Context",
        "",
        table_md(team_year.sort_values(["seasonYear", "avgFinish"]), ["seasonYear", "teamName", "raceResultRows", "avgFinish", "top5Rate", "top10Rate", "issueLikeStatusRate", "bryceRows", "bryceAvgFinish"], 20),
        "",
        "Ganassi-specific descriptive rows:",
        "",
        table_md(cgr.sort_values(["seasonYear", "avgFinish"]), ["seasonYear", "teamName", "raceResultRows", "avgFinish", "top5Rate", "top10Rate", "issueLikeStatusRate", "bryceRows", "bryceAvgFinish"], 8),
        "",
        "Team status rows are official-result status summaries. They are evidence for outcome context, not engineering root-cause attribution.",
        "",
        "## Opponent And Field Strength Context",
        "",
        "This is descriptive same-sample context with empirical shrinkage, designed to help the UI explain field quality without pretending to predict results.",
        "",
        table_md(strength.sort_values(["shrunkStrengthRating", "raceRows"], ascending=[False, False]), ["driverName", "raceRows", "finishPercentileMean", "shrunkStrengthRating", "avgStartPercentile", "top5Rate", "top10Rate", "issueLikeStatusRate"], 15),
        "",
        "Bryce race results versus rated field context:",
        "",
        table_md(field_strength.sort_values("resultVsFieldStrength", ascending=False), ["raceLabel", "bryceFinish", "bryceFinishPercentile", "fieldStrengthMean", "resultVsFieldStrength", "topRatedRivals"], 10),
        "",
        "## Championship Progression",
        "",
        table_md(championship[championship["seasonYear"].eq(championship["seasonYear"].max())] if not championship.empty else championship, ["seasonYear", "roundIndex", "raceLabel", "bryceRacePoints", "bryceCumulativePoints", "bryceStandingRank", "leaderDriver", "pointsBehindLeader"], 20),
        "",
        "## Official Racecraft Badges",
        "",
        table_md(racecraft[racecraft["bryceRacecraftRows"].fillna(0) > 0], ["raceLabel", "bryceMostImprovedFlag", "bryceRacecraftDescription", "sessionMostImprovedDriver", "sessionMostImprovedPositions"], 10),
        "",
        "## Deep Section Results",
        "",
        "The headline section tables require at least 50 comparable per-lap section rows. Sparse rows are preserved in CSV for review but suppressed from headline rankings.",
        "",
        "Strongest section-result races:",
        "",
        table_md(section_best, ["raceLabel", "sectionComparisonRows", "medianSectionPercentile", "topQuartileShare", "bottomQuartileShare", "bestSectionFamilies"], 8),
        "",
        "Weakest section-result races:",
        "",
        table_md(section_worst, ["raceLabel", "sectionComparisonRows", "medianSectionPercentile", "topQuartileShare", "bottomQuartileShare", "weakestSectionFamilies"], 8),
        "",
        "Sparse section-result rows needing review:",
        "",
        table_md(sparse_sections.sort_values("sectionComparisonRows"), ["raceLabel", "sectionComparisonRows", "medianSectionPercentile", "bestSectionFamilies", "weakestSectionFamilies"], 8),
        "",
        "## Future Race Weekend Prep Inputs",
        "",
        table_md(future, ["eventName", "eventStartDate", "trackName", "trackType", "bryceIndyNxtRacesAtTrack", "sameTrackAvgFinish", "sameTrackAvgGain", "trackTypeAvgFinish", "trackTypeTop10Rate", "weatherState"], 20),
        "",
        "## Source Family Completion Audit",
        "",
        table_md(source_audit, ["sourceFamily", "sourceRows", "analysisStatus", "primaryArtifacts", "auditConclusion"], 30),
        "",
        "## Adversarial Review Of The First Pass",
        "",
        "- First-pass result: good descriptive backbone. Weakness: too much attention on Bryce-only rows, leaving field context underused.",
        "- First-pass lap analysis: useful. Weakness: did not compare Bryce lap movement to full-field volatility and movement baselines.",
        "- First-pass section analysis: useful headline rows. Weakness: top-section rows can overstate isolated micro-moments; per-lap section percentiles are stronger for pace consistency.",
        "- First-pass weather analysis: properly caveated. Weakness: weather has to become a prep/context module rather than a performance explanation.",
        "- First-pass model: acceptable as a sanity check. Weakness: OLS on roughly 32 complete races has too little sample for product claims. Use it to pick hypotheses, then visualize debrief evidence.",
        "- First-pass team context: promising. Weakness: needs team-year and race-level teammate baselines, plus explicit caveats against engineering causality.",
        "",
        "## Recommended Next Analytics Layer",
        "",
        "1. Manual review of every race archetype and hidden-pace label against source caveats.",
        "2. Create a source-state-aware Race Debrief contract from the score table.",
        "3. Add a race-weekend prep contract that uses same-track history, track-type history, practice and qualifying signals, exact-window historical weather, and future-weather placeholders.",
        "4. Keep opponent strength as descriptive context until a larger season-controlled model is justified.",
        "5. Start full-career expansion by metric family: result conversion, qualifying conversion, weather/context, lap shape where available, then section/pace only where series expose comparable data.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    ctx = load_context()
    idx = build_indexes(ctx)
    race_df = read_first_pass_races()
    completed_race_sids = set(race_df["sessionId"].astype(str).tolist())

    lap_race_rows, lap_driver_rows = lap_dynamics(ctx, idx, race_df)
    leader_rows = leader_context(ctx, idx, completed_race_sids)
    incident_rows = incident_penalty_context(ctx, idx, completed_race_sids)
    team_race_rows, team_year_rows = team_context(ctx, idx)
    prep_rows, prep_correlations = prep_session_context(ctx, idx, race_df)
    section_session_rows, section_family_rows = section_results_deep(ctx, idx)
    race_scores = outcome_scores(race_df, lap_race_rows, team_race_rows, section_session_rows, incident_rows, leader_rows)
    future_rows = future_weekend_prep(ctx, race_df)
    backlog_rows = analysis_backlog()
    archetype_summary_rows, track_summary_rows, outcome_cohort_rows = summarize_race_scores(race_scores)
    driver_strength_rows, field_strength_rows = driver_strength_context(ctx, idx, race_df)
    championship_rows = championship_progression(ctx, idx, race_df)
    racecraft_race_rows, racecraft_driver_rows = racecraft_context(ctx, idx, race_df)
    contract_rows, contract_md = ui_analytics_contract()
    source_audit_rows = source_family_audit(ctx, idx, race_df, {
        "race_scores": race_scores,
        "driver_strength_rows": driver_strength_rows,
        "championship_rows": championship_rows,
    })
    adversarial_md = make_adversarial_review(source_audit_rows, race_scores, driver_strength_rows, championship_rows)

    write_csv(lap_race_rows, TABLE_DIR / "full_field_lap_dynamics_by_race.csv")
    write_csv(lap_driver_rows, TABLE_DIR / "full_field_lap_dynamics_by_driver.csv")
    write_csv(leader_rows, TABLE_DIR / "leader_lap_context.csv")
    write_csv(incident_rows, TABLE_DIR / "incident_penalty_context.csv")
    write_csv(team_race_rows, TABLE_DIR / "team_context_by_race.csv")
    write_csv(team_year_rows, TABLE_DIR / "team_context_by_year.csv")
    write_csv(prep_rows, TABLE_DIR / "prep_session_signals.csv")
    write_csv(prep_correlations, TABLE_DIR / "prep_session_correlations.csv")
    write_csv(section_session_rows, TABLE_DIR / "section_results_deep_by_race.csv")
    write_csv(section_family_rows, TABLE_DIR / "section_results_deep_by_section.csv")
    write_csv(race_scores, TABLE_DIR / "race_debrief_scores.csv")
    write_csv(archetype_summary_rows, TABLE_DIR / "race_archetype_summary.csv")
    write_csv(track_summary_rows, TABLE_DIR / "race_track_type_summary.csv")
    write_csv(outcome_cohort_rows, TABLE_DIR / "race_outcome_cohort_comparison.csv")
    write_csv(driver_strength_rows, TABLE_DIR / "driver_strength_ratings.csv")
    write_csv(field_strength_rows, TABLE_DIR / "field_strength_by_race.csv")
    write_csv(championship_rows, TABLE_DIR / "championship_progression.csv")
    write_csv(racecraft_race_rows, TABLE_DIR / "racecraft_context_by_race.csv")
    write_csv(racecraft_driver_rows, TABLE_DIR / "racecraft_context_by_driver.csv")
    write_csv(source_audit_rows, TABLE_DIR / "indy_nxt_source_family_audit.csv")
    write_csv(contract_rows, TABLE_DIR / "ui_analytics_contract.csv")
    write_csv(future_rows, TABLE_DIR / "future_weekend_prep_inputs.csv")
    write_csv(backlog_rows, TABLE_DIR / "analysis_opportunity_backlog.csv")

    ranked_positive = sorted(race_scores, key=lambda r: (clean_num(r.get("conversionPercentileDelta")) or -999), reverse=True)
    ranked_negative = sorted(race_scores, key=lambda r: (clean_num(r.get("conversionPercentileDelta")) or 999))
    simple_bar_chart(ranked_positive, "raceLabel", "conversionPercentileDelta", "Best conversion races", CHART_DIR / "best_conversion_races.svg", 10)
    simple_bar_chart(ranked_negative, "raceLabel", "conversionPercentileDelta", "Worst conversion races", CHART_DIR / "worst_conversion_races.svg", 10)

    report = make_report({
        "race_scores": race_scores,
        "lap_race_rows": lap_race_rows,
        "prep_rows": prep_rows,
        "prep_correlations": prep_correlations,
        "team_year_rows": team_year_rows,
        "section_session_rows": section_session_rows,
        "future_rows": future_rows,
        "archetype_summary_rows": archetype_summary_rows,
        "track_summary_rows": track_summary_rows,
        "outcome_cohort_rows": outcome_cohort_rows,
        "driver_strength_rows": driver_strength_rows,
        "field_strength_rows": field_strength_rows,
        "championship_rows": championship_rows,
        "racecraft_race_rows": racecraft_race_rows,
        "source_audit_rows": source_audit_rows,
    })
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "INDY_NXT_DEEP_ANALYTICS_REVIEW.md").write_text(report)
    (OUT_DIR / "INDY_NXT_ANALYTICS_COMPLETION_AUDIT.md").write_text(adversarial_md)
    (OUT_DIR / "INDY_NXT_UI_ANALYTICS_CONTRACT.md").write_text(contract_md)
    summary = {
        "datasetPath": str(DATASET_PATH.relative_to(ROOT)),
        "datasetUpdatedAt": ctx.data.get("updatedAt"),
        "runDate": RUN_DATE.isoformat(),
        "raceScoreRows": len(race_scores),
        "archetypeSummaryRows": len(archetype_summary_rows),
        "trackSummaryRows": len(track_summary_rows),
        "outcomeCohortRows": len(outcome_cohort_rows),
        "driverStrengthRows": len(driver_strength_rows),
        "fieldStrengthRows": len(field_strength_rows),
        "championshipProgressionRows": len(championship_rows),
        "racecraftRaceRows": len(racecraft_race_rows),
        "racecraftDriverRows": len(racecraft_driver_rows),
        "sourceAuditRows": len(source_audit_rows),
        "contractRows": len(contract_rows),
        "lapRaceRows": len(lap_race_rows),
        "lapDriverRows": len(lap_driver_rows),
        "leaderRows": len(leader_rows),
        "incidentPenaltyRows": len(incident_rows),
        "teamRaceRows": len(team_race_rows),
        "teamYearRows": len(team_year_rows),
        "prepRows": len(prep_rows),
        "prepCorrelationRows": len(prep_correlations),
        "sectionSessionRows": len(section_session_rows),
        "sectionFamilyRows": len(section_family_rows),
        "futureWeekendPrepRows": len(future_rows),
        "outputs": {
            "report": str((OUT_DIR / "INDY_NXT_DEEP_ANALYTICS_REVIEW.md").relative_to(ROOT)),
            "completionAudit": str((OUT_DIR / "INDY_NXT_ANALYTICS_COMPLETION_AUDIT.md").relative_to(ROOT)),
            "uiContract": str((OUT_DIR / "INDY_NXT_UI_ANALYTICS_CONTRACT.md").relative_to(ROOT)),
            "tablesDir": str(TABLE_DIR.relative_to(ROOT)),
            "chartsDir": str(CHART_DIR.relative_to(ROOT)),
        },
        "navigationIssues": [
            "INDY NXT sessions do not carry seriesId directly; join through eventId.",
            "System python3 lacks numpy in this environment; use the bundled workspace Python.",
            "Team context can describe official results but cannot attribute engineering root causes.",
        ],
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
