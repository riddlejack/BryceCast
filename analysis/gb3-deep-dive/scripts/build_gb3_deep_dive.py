#!/usr/bin/env python3
"""GB3 historic analytics deep dive for BryceCast (convention-conformant lane).

Ported from the archived `analysis/gb3-discovery/gb3_deep_dive.py`
(ref refs/archive/20260718T184926Z/heads/codex/gb3-historic-analytics, d4d3ce1)
into the current lane convention:

- lives at `analysis/gb3-deep-dive/scripts/` with repo-root resolution via
  `Path(__file__).resolve().parents[3]` (sibling lanes: formula-ford-lap-shape,
  indy-nxt-race-lap-section-enhancement);
- stamps a per-row `sourceHash` (whole-file SHA-256 of the canonical dataset,
  the freshness key the career-chapter-utilization audit checks);
- emits an integrity-loaded context pack under `output/context-packs/` that the
  `src/data/packModules.ts` glob (`analysis/**/output/context-packs/**/*.json`)
  can resolve.

The ANALYSIS is intentionally identical to the archived pass: the eight output
tables must stay byte-identical to the archived outputs on the analysis columns.
Only the new `sourceHash` column and dataset-context snapshot lines may differ.
The script reads the canonical career dataset and does not mutate ingestion-owned
career data.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean, median
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/gb3-deep-dive"
DATASET_PATH = ROOT / "data/career/career.dataset.json"
INGESTION_SUMMARY_PATH = ROOT / "data/career/reports/ingestion-summary.json"
VALIDATION_REPORT_PATH = ROOT / "data/career/reports/validation-report.json"
OUT_DIR = LANE_DIR / "output"
TABLE_DIR = OUT_DIR / "tables"
PACK_DIR = OUT_DIR / "context-packs"

BRYCE_ID = "driver_bryce_aron"
GB3_ID = "series_gb3"

CLAIM_STRENGTH = "source_bounded_gb3_result_conversion"

ROADMAP_SERIES = [
    "series_formula_ford",
    "series_euroformula_open",
    "series_frp_f1600",
    "series_froc",
    "series_imsa_weathertech",
]


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def dataset_hash() -> str:
    h = hashlib.sha256()
    with DATASET_PATH.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def clean_num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "DNS", "DNF", "DQ", "nan", "None"}:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def safe_div(a: float | int | None, b: float | int | None) -> float | None:
    if a is None or b in (None, 0):
        return None
    return float(a) / float(b)


def avg(values: list[float | int | None]) -> float | None:
    nums = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    return mean(nums) if nums else None


def med(values: list[float | int | None]) -> float | None:
    nums = [float(v) for v in values if v is not None and math.isfinite(float(v))]
    return median(nums) if nums else None


def fmt(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return f"{value:.3f}".rstrip("0").rstrip(".")
    return str(value)


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


def table_md(rows: list[dict[str, Any]], cols: list[str], limit: int = 20) -> str:
    if not rows:
        return "_No rows._"
    rows = rows[:limit]
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    body = ["| " + " | ".join(fmt(row.get(col)) for col in cols) + " |" for row in rows]
    return "\n".join([header, sep, *body])


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data["events"]}
    sessions = {row["id"]: row for row in data["sessions"]}
    series = {row["id"]: row for row in data["series"]}
    tracks = {row["id"]: row for row in data["tracks"]}
    teams = {row["id"]: row for row in data["teams"]}
    drivers = {row["id"]: row for row in data["drivers"]}
    source_evidence = {row["id"]: row for row in data["sourceEvidence"]}
    sessions_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for session in data["sessions"]:
        sessions_by_event[session.get("eventId")].append(session)
    return {
        "events": events,
        "sessions": sessions,
        "series": series,
        "tracks": tracks,
        "teams": teams,
        "drivers": drivers,
        "source_evidence": source_evidence,
        "sessions_by_event": sessions_by_event,
    }


def series_session_ids(data: dict[str, Any], idx: dict[str, Any], series_id: str) -> set[str]:
    event_ids = {e["id"] for e in data["events"] if e.get("seriesId") == series_id}
    return {s["id"] for s in data["sessions"] if s.get("eventId") in event_ids}


def finish_percentile(result: dict[str, Any]) -> float | None:
    stored = clean_num(result.get("finishPercentile"))
    if stored is not None:
        return stored
    finish = clean_num(result.get("finishPosition"))
    field = clean_num(result.get("fieldSize"))
    if finish is not None and field and field > 1:
        return 1 - ((finish - 1) / (field - 1))
    return None


def source_family_for_year(year: int | None) -> str:
    if year == 2021:
        return "2021 TSL official PDFs"
    if year == 2022:
        return "2022 GB3 official JSON"
    return "unknown GB3 source family"


def source_state_for_year(year: int | None) -> str:
    if year == 2021:
        return "official_pdf_classification_grid_and_weather"
    if year == 2022:
        return "official_api_results_and_pit_counts"
    return "source_backed_unknown_family"


def common_caveat(year: int | None) -> str:
    if year == 2021:
        return (
            "2021 supports starts and official weather/track conditions from TSL PDFs, "
            "but exposes no lap samples, section metrics, or pit sequence."
        )
    if year == 2022:
        return (
            "2022 supports official GB3 JSON classifications and pit-stop count fields, "
            "but exposes no source-backed starts, official weather/track conditions, lap samples, or section metrics."
        )
    return "Use only with source-family review."


def gb3_context(data: dict[str, Any], idx: dict[str, Any]) -> dict[str, Any]:
    gb3_event_ids = {e["id"] for e in data["events"] if e.get("seriesId") == GB3_ID}
    gb3_sessions = [s for s in data["sessions"] if s.get("eventId") in gb3_event_ids]
    gb3_session_ids = {s["id"] for s in gb3_sessions}
    gb3_race_session_ids = {
        s["id"] for s in gb3_sessions if s.get("sessionType") in {"race", "heat"}
    }
    return {
        "event_ids": gb3_event_ids,
        "sessions": gb3_sessions,
        "session_ids": gb3_session_ids,
        "race_session_ids": gb3_race_session_ids,
        "events": [idx["events"][eid] for eid in sorted(gb3_event_ids)],
    }


def normalized_qualifying_context(data: dict[str, Any], idx: dict[str, Any], session_ids: set[str]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen_sessions: set[str] = set()
    for q in data["qualifyingResults"]:
        if q.get("driverId") != BRYCE_ID or q.get("sessionId") not in session_ids:
            continue
        session = idx["sessions"][q["sessionId"]]
        event = idx["events"][session["eventId"]]
        rows.append({
            "eventId": event["id"],
            "eventName": event["name"],
            "seasonYear": event.get("seasonYear"),
            "sessionId": session["id"],
            "sessionName": session.get("sessionName"),
            "sessionSegment": q.get("sessionSegment") or session.get("sessionName"),
            "position": clean_num(q.get("position")),
            "fieldSize": None,
            "bestLapTime": q.get("bestLapTime"),
            "gapToPole": q.get("gapToPole"),
            "sourceTable": "qualifyingResults",
            "sourceState": source_state_for_year(event.get("seasonYear")),
            "confidence": "high",
            "caveat": common_caveat(event.get("seasonYear")),
            "provenanceRefs": ";".join(q.get("provenanceRefs") or []),
        })
        seen_sessions.add(session["id"])

    for result in data["results"]:
        if result.get("driverId") != BRYCE_ID or result.get("sessionId") not in session_ids:
            continue
        session = idx["sessions"][result["sessionId"]]
        if session.get("sessionType") != "qualifying" or session["id"] in seen_sessions:
            continue
        event = idx["events"][session["eventId"]]
        rows.append({
            "eventId": event["id"],
            "eventName": event["name"],
            "seasonYear": event.get("seasonYear"),
            "sessionId": session["id"],
            "sessionName": session.get("sessionName"),
            "sessionSegment": session.get("sessionName"),
            "position": clean_num(result.get("finishPosition")),
            "fieldSize": clean_num(result.get("fieldSize")),
            "bestLapTime": result.get("bestLapTime"),
            "gapToPole": result.get("gapToLeader"),
            "sourceTable": "results.qualifying_session",
            "sourceState": source_state_for_year(event.get("seasonYear")),
            "confidence": "medium",
            "caveat": (
                "Qualifying context is read from result rows because this source family "
                "does not populate the dedicated qualifyingResults table."
            ),
            "provenanceRefs": ";".join(result.get("provenanceRefs") or []),
        })
    return sorted(rows, key=lambda r: (r["seasonYear"] or 0, r["eventName"], r["sessionName"] or ""))


def race_result_rows(data: dict[str, Any], idx: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    q_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for q in normalized_qualifying_context(data, idx, ctx["session_ids"]):
        q_by_event[q["eventId"]].append(q)

    rows: list[dict[str, Any]] = []
    for result in data["results"]:
        if result.get("driverId") != BRYCE_ID or result.get("sessionId") not in ctx["race_session_ids"]:
            continue
        session = idx["sessions"][result["sessionId"]]
        event = idx["events"][session["eventId"]]
        track = idx["tracks"].get(event.get("trackId"), {})
        team = idx["teams"].get(result.get("teamId"), {})
        year = event.get("seasonYear")
        finish = clean_num(result.get("finishPosition"))
        start = clean_num(result.get("startPosition") if result.get("startPosition") is not None else result.get("gridPosition"))
        field = clean_num(result.get("fieldSize"))
        event_q = q_by_event.get(event["id"], [])
        q_positions = [clean_num(q.get("position")) for q in event_q if clean_num(q.get("position")) is not None]
        q_primary = next((q for q in event_q if str(q.get("sessionSegment", "")).lower() == "qualifying"), None)
        q_second = next((q for q in event_q if "2nd" in str(q.get("sessionSegment", "")).lower()), None)
        q_best = min(q_positions) if q_positions else None
        position_gain = start - finish if start is not None and finish is not None else None
        q_best_to_finish = q_best - finish if q_best is not None and finish is not None else None
        rows.append({
            "seasonYear": year,
            "eventId": event["id"],
            "eventName": event["name"],
            "sessionId": session["id"],
            "raceNumber": session.get("raceNumber"),
            "sessionName": session.get("sessionName"),
            "trackName": track.get("canonicalName") or track.get("name"),
            "trackType": track.get("trackType"),
            "teamName": team.get("name"),
            "fieldSize": field,
            "startPosition": start,
            "finishPosition": finish,
            "positionGain": position_gain,
            "finishPercentile": finish_percentile(result),
            "qPrimaryPosition": clean_num(q_primary.get("position")) if q_primary else None,
            "qSecondFastestPosition": clean_num(q_second.get("position")) if q_second else None,
            "qBestPosition": q_best,
            "qBestToFinishDelta": q_best_to_finish,
            "points": clean_num(result.get("points")),
            "status": result.get("status"),
            "pitStops": clean_num(result.get("pitStops")),
            "bestLapTime": result.get("bestLapTime"),
            "gapToLeader": result.get("gapToLeader"),
            "sourceFamily": source_family_for_year(year),
            "sourceState": source_state_for_year(year),
            "confidence": "high",
            "caveat": common_caveat(year),
            "provenanceRefs": ";".join(result.get("provenanceRefs") or []),
        })
    return sorted(rows, key=lambda r: (r["seasonYear"] or 0, r["eventName"], r["raceNumber"] or 0, r["sessionName"] or ""))


def event_summary_rows(race_rows: list[dict[str, Any]], q_rows: list[dict[str, Any]], weather_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    q_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    weather_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in race_rows:
        by_event[row["eventId"]].append(row)
    for row in q_rows:
        q_by_event[row["eventId"]].append(row)
    for row in weather_rows:
        weather_by_event[row["eventId"]].append(row)

    out: list[dict[str, Any]] = []
    for event_id, rows in sorted(by_event.items(), key=lambda item: (item[1][0]["seasonYear"], item[1][0]["eventName"])):
        finishes = [clean_num(r.get("finishPosition")) for r in rows]
        gains = [clean_num(r.get("positionGain")) for r in rows]
        pct = [clean_num(r.get("finishPercentile")) for r in rows]
        q_positions = [clean_num(q.get("position")) for q in q_by_event.get(event_id, []) if clean_num(q.get("position")) is not None]
        wetdry = Counter(w.get("wetDry") or "unknown" for w in weather_by_event.get(event_id, []))
        out.append({
            "seasonYear": rows[0]["seasonYear"],
            "eventName": rows[0]["eventName"],
            "trackName": rows[0]["trackName"],
            "raceRows": len(rows),
            "avgFinish": avg(finishes),
            "bestFinish": min([f for f in finishes if f is not None], default=None),
            "avgFinishPercentile": avg(pct),
            "avgPositionGainWhenStartKnown": avg(gains),
            "top5Count": sum(1 for f in finishes if f is not None and f <= 5),
            "top10Count": sum(1 for f in finishes if f is not None and f <= 10),
            "points": sum(clean_num(r.get("points")) or 0 for r in rows) if any(r.get("points") is not None for r in rows) else None,
            "bestQualifyingPosition": min(q_positions) if q_positions else None,
            "weatherDrySessions": wetdry.get("dry", 0),
            "weatherWetSessions": wetdry.get("wet", 0),
            "sourceFamily": rows[0]["sourceFamily"],
            "sourceState": rows[0]["sourceState"],
            "confidence": "high",
            "caveat": rows[0]["caveat"],
        })
    return out


def weather_context_rows(data: dict[str, Any], idx: dict[str, Any], ctx: dict[str, Any], race_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    event_by_session = {s["id"]: idx["events"][s["eventId"]] for s in ctx["sessions"]}
    race_by_session = {r["sessionId"]: r for r in race_rows}
    out: list[dict[str, Any]] = []
    for weather in data["weatherObservations"]:
        if weather.get("sessionId") not in ctx["session_ids"]:
            continue
        session = idx["sessions"][weather["sessionId"]]
        event = event_by_session[weather["sessionId"]]
        track = idx["tracks"].get(event.get("trackId"), {})
        race = race_by_session.get(weather["sessionId"], {})
        year = event.get("seasonYear")
        out.append({
            "seasonYear": year,
            "eventName": event["name"],
            "sessionName": session.get("sessionName"),
            "sessionType": session.get("sessionType"),
            "trackName": track.get("canonicalName") or track.get("name"),
            "observedAt": weather.get("observedAt"),
            "ambientConditionRaw": weather.get("ambientConditionRaw"),
            "trackConditionRaw": weather.get("trackConditionRaw"),
            "wetDry": weather.get("wetDry"),
            "weatherConfidence": weather.get("confidence"),
            "timeConfidence": weather.get("timeConfidence"),
            "locationConfidence": weather.get("locationConfidence"),
            "bryceFinishPositionIfRace": race.get("finishPosition"),
            "bryceFinishPercentileIfRace": race.get("finishPercentile"),
            "sourceState": "official_tsl_session_condition_line",
            "confidence": "high",
            "caveat": "Official TSL condition strings provide context only. They do not support causal performance claims.",
            "provenanceRefs": ";".join(weather.get("provenanceRefs") or []),
            "eventId": event["id"],
            "sessionId": session["id"],
        })
    return sorted(out, key=lambda r: (r["seasonYear"] or 0, r["eventName"], r["observedAt"] or ""))


def track_profile_rows(data: dict[str, Any], idx: dict[str, Any], race_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_track: dict[str, list[dict[str, Any]]] = defaultdict(list)
    track_id_by_name: dict[str, str] = {}
    for row in race_rows:
        event = idx["events"][row["eventId"]]
        track_id = event.get("trackId")
        by_track[track_id].append(row)
        track_id_by_name[row["trackName"]] = track_id

    out: list[dict[str, Any]] = []
    for track_id, rows in sorted(by_track.items(), key=lambda item: item[1][0]["trackName"] or ""):
        track = idx["tracks"].get(track_id, {})
        finishes = [clean_num(r.get("finishPosition")) for r in rows]
        gains = [clean_num(r.get("positionGain")) for r in rows]
        pct = [clean_num(r.get("finishPercentile")) for r in rows]
        years = sorted({str(r.get("seasonYear")) for r in rows if r.get("seasonYear")})
        out.append({
            "trackName": track.get("canonicalName") or track.get("name") or rows[0]["trackName"],
            "trackType": track.get("trackType"),
            "layoutLengthKm": track.get("layoutLengthKm"),
            "direction": track.get("direction"),
            "surface": track.get("surface"),
            "cornerCount": track.get("cornerCount"),
            "years": ", ".join(years),
            "raceRows": len(rows),
            "avgFinish": avg(finishes),
            "bestFinish": min([f for f in finishes if f is not None], default=None),
            "avgFinishPercentile": avg(pct),
            "avgPositionGainWhenStartKnown": avg(gains),
            "startKnownRows": sum(1 for r in rows if r.get("startPosition") is not None),
            "sourceState": "official_results_plus_track_metadata",
            "confidence": "high",
            "caveat": "Track profile is descriptive. Cross-track comparisons use small GB3 samples and mixed 2021/2022 source families.",
        })
    return out


def team_context_rows(data: dict[str, Any], idx: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    results_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for result in data["results"]:
        if result.get("sessionId") in ctx["race_session_ids"]:
            results_by_session[result["sessionId"]].append(result)

    out: list[dict[str, Any]] = []
    for session_id, results in results_by_session.items():
        bryce = next((r for r in results if r.get("driverId") == BRYCE_ID), None)
        if not bryce:
            continue
        session = idx["sessions"][session_id]
        event = idx["events"][session["eventId"]]
        track = idx["tracks"].get(event.get("trackId"), {})
        team_id = bryce.get("teamId")
        team_results = [r for r in results if r.get("teamId") == team_id]
        team_finishes = [clean_num(r.get("finishPosition")) for r in team_results if clean_num(r.get("finishPosition")) is not None]
        team_ranked = sorted(
            [r for r in team_results if clean_num(r.get("finishPosition")) is not None],
            key=lambda r: clean_num(r.get("finishPosition")) or 999,
        )
        bryce_team_rank = next((i + 1 for i, r in enumerate(team_ranked) if r.get("driverId") == BRYCE_ID), None)
        teammate_finishes = [
            clean_num(r.get("finishPosition"))
            for r in team_results
            if r.get("driverId") != BRYCE_ID and clean_num(r.get("finishPosition")) is not None
        ]
        year = event.get("seasonYear")
        out.append({
            "seasonYear": year,
            "eventName": event["name"],
            "sessionName": session.get("sessionName"),
            "raceNumber": session.get("raceNumber"),
            "trackName": track.get("canonicalName") or track.get("name"),
            "teamName": idx["teams"].get(team_id, {}).get("name"),
            "teamRaceDriverCount": len(team_results),
            "teammateCount": len(team_results) - 1,
            "bryceFinishPosition": clean_num(bryce.get("finishPosition")),
            "bryceWithinTeamRank": bryce_team_rank,
            "teamBestFinish": min(team_finishes, default=None),
            "teamMedianFinish": med(team_finishes),
            "teammateBestFinish": min(teammate_finishes, default=None),
            "teammateMedianFinish": med(teammate_finishes),
            "sourceFamily": source_family_for_year(year),
            "sourceState": "official_full_field_results_descriptive_team_context",
            "confidence": "medium",
            "caveat": "Team context is result-position context only. It does not support engineering, setup, strategy, or reliability attribution.",
            "sessionId": session_id,
        })
    return sorted(out, key=lambda r: (r["seasonYear"] or 0, r["eventName"], r["raceNumber"] or 0))


def source_family_audit_rows(data: dict[str, Any], idx: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for year in [2021, 2022]:
        sessions = [s for s in ctx["sessions"] if idx["events"][s["eventId"]].get("seasonYear") == year]
        session_ids = {s["id"] for s in sessions}
        race_session_ids = {s["id"] for s in sessions if s.get("sessionType") in {"race", "heat"}}
        results = [r for r in data["results"] if r.get("sessionId") in session_ids]
        race_results = [r for r in results if r.get("sessionId") in race_session_ids]
        bryce_races = [r for r in race_results if r.get("driverId") == BRYCE_ID]
        q_rows = normalized_qualifying_context(data, idx, session_ids)
        weather = [w for w in data["weatherObservations"] if w.get("sessionId") in session_ids]
        laps = [l for l in data["lapSamples"] if l.get("sessionId") in session_ids]
        section_metrics = [
            m for m in data["derivedMetrics"]
            if (m.get("sessionId") in session_ids or m.get("seriesId") == GB3_ID)
            and "section" in str(m.get("metricType", "")).lower()
        ]
        out.append({
            "sourceFamily": source_family_for_year(year),
            "seasonYear": year,
            "events": len({s["eventId"] for s in sessions}),
            "sessions": len(sessions),
            "allResultRows": len(results),
            "allRaceRows": len(race_results),
            "bryceRaceRows": len(bryce_races),
            "qualifyingContextRows": len(q_rows),
            "gridStartRaceRows": sum(1 for r in race_results if r.get("startPosition") is not None or r.get("gridPosition") is not None),
            "weatherConditionRows": len(weather),
            "pitStopCountRaceRows": sum(1 for r in race_results if r.get("pitStops") is not None),
            "lapSampleRows": len(laps),
            "sectionMetricRows": len(section_metrics),
            "analysisStatus": "complete_source_bounded",
            "uiUse": "Use with source-family badge and denominator labels.",
            "confidence": "high",
            "caveat": common_caveat(year),
        })
    out.append({
        "sourceFamily": "GB3 combined",
        "seasonYear": "2021-2022",
        "events": len(ctx["event_ids"]),
        "sessions": len(ctx["sessions"]),
        "allResultRows": sum(1 for r in data["results"] if r.get("sessionId") in ctx["session_ids"]),
        "allRaceRows": sum(1 for r in data["results"] if r.get("sessionId") in ctx["race_session_ids"]),
        "bryceRaceRows": sum(1 for r in data["results"] if r.get("driverId") == BRYCE_ID and r.get("sessionId") in ctx["race_session_ids"]),
        "qualifyingContextRows": len(normalized_qualifying_context(data, idx, ctx["session_ids"])),
        "gridStartRaceRows": sum(1 for r in data["results"] if r.get("sessionId") in ctx["race_session_ids"] and (r.get("startPosition") is not None or r.get("gridPosition") is not None)),
        "weatherConditionRows": sum(1 for w in data["weatherObservations"] if w.get("sessionId") in ctx["session_ids"]),
        "pitStopCountRaceRows": sum(1 for r in data["results"] if r.get("sessionId") in ctx["race_session_ids"] and r.get("pitStops") is not None),
        "lapSampleRows": sum(1 for l in data["lapSamples"] if l.get("sessionId") in ctx["session_ids"]),
        "sectionMetricRows": 0,
        "analysisStatus": "complete_with_source_family_split",
        "uiUse": "Use for GB3 summary cards and drill-down tables. Split unsupported detail by source family.",
        "confidence": "high",
        "caveat": "Combined GB3 stats are useful for result conversion. Detail modules must stay split by 2021 TSL PDF versus 2022 GB3 JSON coverage.",
    })
    return out


def coverage_for_series(data: dict[str, Any], idx: dict[str, Any], series_id: str) -> dict[str, Any]:
    session_ids = series_session_ids(data, idx, series_id)
    sessions = [idx["sessions"][sid] for sid in session_ids]
    race_session_ids = {s["id"] for s in sessions if s.get("sessionType") in {"race", "heat"}}
    result_rows = [r for r in data["results"] if r.get("sessionId") in session_ids]
    race_rows = [r for r in result_rows if r.get("sessionId") in race_session_ids]
    bryce_races = [r for r in race_rows if r.get("driverId") == BRYCE_ID]
    q_rows = normalized_qualifying_context(data, idx, session_ids)
    weather = [w for w in data["weatherObservations"] if w.get("sessionId") in session_ids]
    laps = [l for l in data["lapSamples"] if l.get("driverId") == BRYCE_ID and l.get("sessionId") in session_ids]
    penalties = [p for p in data["penalties"] if p.get("sessionId") in session_ids]
    grid_rows = [r for r in race_rows if r.get("startPosition") is not None or r.get("gridPosition") is not None]
    exact_sessions = [s for s in sessions if s.get("scheduledStart") or s.get("actualStart")]
    tracks = {
        idx["events"][s["eventId"]].get("trackId")
        for s in sessions
        if s.get("eventId") in idx["events"]
    }
    return {
        "seriesId": series_id,
        "seriesName": idx["series"].get(series_id, {}).get("name", series_id),
        "events": len({s.get("eventId") for s in sessions}),
        "sessions": len(sessions),
        "raceRows": len(bryce_races),
        "allRaceRows": len(race_rows),
        "qualifyingContextRows": len(q_rows),
        "trackCount": len([t for t in tracks if t]),
        "weatherRows": len(weather),
        "lapSampleRows": len(laps),
        "teamContextRows": len([r for r in result_rows if r.get("driverId") != BRYCE_ID]),
        "gridStartRaceRows": len(grid_rows),
        "gridStartCoveragePct": safe_div(len(grid_rows), len(race_rows)),
        "exactWindowSessions": len(exact_sessions),
        "exactWindowCoveragePct": safe_div(len(exact_sessions), len(sessions)),
        "penaltyDecisionRows": len(penalties),
        "pitStopRows": sum(1 for r in race_rows if r.get("pitStops") is not None),
    }


def roadmap_rows(data: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    base_rows = [coverage_for_series(data, idx, sid) for sid in ROADMAP_SERIES]
    out: list[dict[str, Any]] = []
    for row in base_rows:
        sid = row["seriesId"]
        score = (
            row["raceRows"] * 0.6
            + row["qualifyingContextRows"] * 0.35
            + min(row["weatherRows"], 50) * 0.18
            + min(row["lapSampleRows"], 300) * 0.035
            + (row["gridStartCoveragePct"] or 0) * 8
            + (row["exactWindowCoveragePct"] or 0) * 5
            + min(row["teamContextRows"], 900) * 0.006
        )
        recommended_depth = "lightweight_context_only"
        next_action = "defer_after_gb3"
        if sid == "series_formula_ford":
            recommended_depth = "lap_weather_specialist_pass"
            next_action = "run_next_if_weather_lap_story_is_the_priority"
            score += 8
        elif sid == "series_euroformula_open":
            recommended_depth = "result_and_qualifying_conversion_pass"
            next_action = "run_after_formula_ford_or_before_if_clean_single_seater_comparison_is_needed"
            score += 4
        elif sid == "series_imsa_weathertech":
            recommended_depth = "standalone_daytona_feature"
            next_action = "run_as_feature_story_separate_from_single_seater_parity"
            score += 20
        elif sid == "series_frp_f1600":
            recommended_depth = "result_conversion_plus_penalty_context_pass"
            next_action = "run_after_higher-signal_lanes"
        elif sid == "series_froc":
            recommended_depth = "context_only_or_grid_completion_followup"
            next_action = "defer_until_grid_tail_or_derived_benchmarks_are_needed"
        caveats: list[str] = []
        if row["lapSampleRows"] == 0:
            caveats.append("no Bryce lap samples")
        if row["weatherRows"] == 0:
            caveats.append("no source-backed weather or condition rows")
        if not row["gridStartCoveragePct"]:
            caveats.append("no source-backed start positions")
        elif row["gridStartCoveragePct"] < 0.99:
            caveats.append("partial start-position coverage")
        if sid == "series_imsa_weathertech":
            caveats.append("single event, keep as Daytona feature")
        out.append({
            **row,
            "rankScore": round(score, 3),
            "recommendedDepth": recommended_depth,
            "nextAction": next_action,
            "confidence": "high" if row["raceRows"] >= 10 or sid == "series_imsa_weathertech" else "medium",
            "primaryCaveat": "; ".join(caveats) if caveats else "source-backed result conversion lane",
            "uiUse": roadmap_ui_use(sid),
        })
    return sorted(out, key=lambda r: (-r["rankScore"], r["seriesName"]))


def roadmap_ui_use(series_id: str) -> str:
    if series_id == "series_formula_ford":
        return "Use as a specialist early-career lap and wet/dry context story with strong caveat badges."
    if series_id == "series_imsa_weathertech":
        return "Use as a standalone Daytona endurance feature, separate from open-wheel parity charts."
    if series_id == "series_euroformula_open":
        return "Use for clean result, qualifying, and track conversion modules."
    if series_id == "series_frp_f1600":
        return "Use for early-career result conversion and official penalty context after higher-signal lanes."
    if series_id == "series_froc":
        return "Use as lightweight context until grid tails or derived benchmark needs justify more work."
    return "Use with source badge."


def validation_snapshot() -> dict[str, Any]:
    ingestion = load_json(INGESTION_SUMMARY_PATH)
    validation = load_json(VALIDATION_REPORT_PATH)
    open_gaps = ingestion.get("openGaps") or []
    return {
        "datasetUpdatedAt": load_json(DATASET_PATH).get("updatedAt"),
        "ingestionGeneratedAt": ingestion.get("generatedAt"),
        "validationOk": ingestion.get("validation", {}).get("ok"),
        "validationErrors": len(validation.get("errors") or []),
        "validationWarnings": len(validation.get("warnings") or []),
        "openGapCount": len(open_gaps) if isinstance(open_gaps, list) else open_gaps,
        "openGapIds": [gap.get("id") for gap in open_gaps] if isinstance(open_gaps, list) else [],
        "counts": ingestion.get("counts", {}),
    }


def write_main_report(
    data: dict[str, Any],
    race_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    q_rows: list[dict[str, Any]],
    track_rows: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    team_rows: list[dict[str, Any]],
    audit_rows: list[dict[str, Any]],
    roadmap: list[dict[str, Any]],
) -> None:
    snapshot = validation_snapshot()
    summary = summarize_gb3(race_rows, q_rows, weather_rows, team_rows)
    top_events = sorted(event_rows, key=lambda r: (-(r.get("avgFinishPercentile") or -1), r["eventName"]))[:6]
    race_by_year = summarize_by_year(race_rows)
    weather_race_rows = [w for w in weather_rows if w.get("bryceFinishPositionIfRace") is not None]
    wetdry_summary = summarize_wetdry(weather_race_rows)

    text = f"""# GB3 Historic Analytics Deep Dive

## Executive Summary

- **GB3 is now source-ready for result-conversion product modules.** The canonical dataset contains {summary['raceRows']} Bryce GB3 race rows across {summary['events']} events, with {summary['top5Rate']} top-five rate, {summary['top10Rate']} top-ten rate, and {summary['avgFinishPercentile']} average finish percentile.
- **The analysis must keep 2021 and 2022 source families visibly separated.** 2021 TSL PDFs support source-backed starts and official weather/track condition strings; 2022 GB3 JSON supports broader official result volume and pit-stop count fields. A combined GB3 card is safe for result conversion, while detail modules need source-family badges.
- **Qualifying-to-race context is useful but uneven.** The pass finds {len(q_rows)} Bryce qualifying context rows: 14 from 2021 `qualifyingResults` rows and 8 from 2022 qualifying session result rows. Start-to-finish conversion is source-backed only where starts exist.
- **Lap-shape and section-pace claims are unsupported for GB3.** The canonical GB3 slice has zero Bryce lap samples and zero official section metrics, so the UI should omit lap traces, stint shape, sector shape, and section pace modules for this series.

## Source-Bounded Module Readiness

{table_md(audit_rows, ['sourceFamily', 'events', 'sessions', 'bryceRaceRows', 'qualifyingContextRows', 'gridStartRaceRows', 'weatherConditionRows', 'pitStopCountRaceRows', 'lapSampleRows', 'sectionMetricRows', 'analysisStatus'], limit=10)}

**Product implication:** GB3 can power a Career Analytics Lab section with result conversion, event summaries, source-family badges, team-result context, track profiles, and official 2021 condition context. It should not power lap-position charts, section pace, tire or pit strategy, or engineering-root-cause language.

## Result Conversion And Season Shape

{table_md(race_by_year, ['seasonYear', 'raceRows', 'avgFinish', 'medianFinish', 'avgFinishPercentile', 'top5Rate', 'top10Rate', 'avgPositionGainWhenStartKnown', 'startKnownRows', 'points'], limit=5)}

**Interpretation:** The combined GB3 race record is strongest when normalized by field size. Raw finish varies across fields of 16 to 23 cars, so finish percentile should travel with every UI stat. Start-to-finish gain should appear only for 2021 rows, because 2022 official JSON does not expose source-backed grid or start fields.

## Event-Level Readout

{table_md(top_events, ['seasonYear', 'eventName', 'trackName', 'raceRows', 'avgFinish', 'bestFinish', 'avgFinishPercentile', 'avgPositionGainWhenStartKnown', 'bestQualifyingPosition'], limit=8)}

**UI use:** Event cards can show best finish, average finish percentile, known start conversion, and qualifying context. They need a visible source badge because 2021 and 2022 expose different detail fields.

## Qualifying-To-Race Conversion

{table_md(race_rows[:12], ['seasonYear', 'eventName', 'raceNumber', 'startPosition', 'finishPosition', 'positionGain', 'qPrimaryPosition', 'qSecondFastestPosition', 'qBestToFinishDelta', 'sourceFamily'], limit=12)}

**Interpretation:** 2021 supports the cleanest conversion story because official grid PDFs back every race start. 2022 supports qualifying rank context from official JSON result rows, but the source does not expose race starts, so any "from grid" claim would be unsupported.

## Track And Venue Profile

{table_md(track_rows, ['trackName', 'trackType', 'layoutLengthKm', 'direction', 'raceRows', 'avgFinish', 'bestFinish', 'avgFinishPercentile', 'startKnownRows'], limit=10)}

**Interpretation:** Track modules should present venue history as descriptive GB3 sample context. The sample is too small for track-strength claims, but it is useful for upcoming-weekend memory and cross-series career navigation.

## Weather And Track-Condition Context

{table_md(wetdry_summary, ['wetDry', 'sessionRows', 'raceRows', 'avgRaceFinish', 'avgRaceFinishPercentile'], limit=10)}

**Interpretation:** Official 2021 TSL weather/track strings are safe as context labels. They contain categorical weather and wet/dry track state, with no ambient temperature, humidity, wind, or precipitation values. The UI should avoid causal weather effects and should show 2022 weather as unavailable.

## Team Context

{table_md(team_rows[:12], ['seasonYear', 'eventName', 'raceNumber', 'teamName', 'teamRaceDriverCount', 'teammateCount', 'bryceFinishPosition', 'bryceWithinTeamRank', 'teamBestFinish', 'teammateBestFinish'], limit=12)}

**Interpretation:** Full-field race results support descriptive team context for Carlin in 2021 and Hitech Pulse-Eight in 2022. This context can answer "where did Bryce sit within the team result order" but cannot explain car setup, engineering, reliability, strategy, or teammate parity quality.

## Historic Analytics Roadmap

{table_md(roadmap, ['seriesName', 'rankScore', 'raceRows', 'qualifyingContextRows', 'weatherRows', 'lapSampleRows', 'gridStartCoveragePct', 'recommendedDepth'], limit=10)}

**Recommendation:** Run Formula Ford next if the product wants the richest early-career specialist story, especially because it has official wet/dry condition rows and Bryce-only lap-analysis samples. Keep IMSA as a standalone Daytona feature because the source shape is endurance-specific and one-event deep.

## Caveats And Assumptions

- Source authority: `data/career/career.dataset.json`, `data/career/reports/ingestion-summary.json`, and `data/career/reports/validation-report.json` control this pass.
- Validation state: `validationOk={snapshot['validationOk']}`, errors={snapshot['validationErrors']}, warnings={snapshot['validationWarnings']}, openGaps={snapshot['openGapCount']}.
- Current canonical counts: events={snapshot['counts'].get('events')}, sessions={snapshot['counts'].get('sessions')}, results={snapshot['counts'].get('results')}, qualifyingResults={snapshot['counts'].get('qualifyingResults')}, lapSamples={snapshot['counts'].get('lapSamples')}, weatherObservations={snapshot['counts'].get('weatherObservations')}, sourceEvidence={snapshot['counts'].get('sourceEvidence')}.
- GB3 2022 has an open source gap for session 1248 JSON returning 404. Treat row-level missingness there as source-broken rather than model-inferable.
- No GB3 telemetry, setup notes, tire data, pit sequence, lap-position samples, or section metrics exist in the canonical dataset.

## Output Tables

- `tables/gb3_bryce_race_results.csv`
- `tables/gb3_event_summary.csv`
- `tables/gb3_qualifying_context.csv`
- `tables/gb3_track_profile.csv`
- `tables/gb3_weather_context.csv`
- `tables/gb3_team_context.csv`
- `tables/gb3_source_family_audit.csv`
- `tables/historic_analytics_roadmap.csv`
"""
    (OUT_DIR / "GB3_DEEP_DIVE_ANALYTICS.md").write_text(text)


def summarize_gb3(
    race_rows: list[dict[str, Any]],
    q_rows: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    team_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    finishes = [clean_num(r.get("finishPosition")) for r in race_rows]
    pct = [clean_num(r.get("finishPercentile")) for r in race_rows]
    top5 = sum(1 for f in finishes if f is not None and f <= 5)
    top10 = sum(1 for f in finishes if f is not None and f <= 10)
    return {
        "raceRows": len(race_rows),
        "events": len({r["eventId"] for r in race_rows}),
        "avgFinish": fmt(avg(finishes)),
        "avgFinishPercentile": fmt(avg(pct)),
        "top5Rate": fmt(safe_div(top5, len(finishes))),
        "top10Rate": fmt(safe_div(top10, len(finishes))),
        "qualifyingRows": len(q_rows),
        "weatherRows": len(weather_rows),
        "teamRows": len(team_rows),
    }


def summarize_by_year(race_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_year: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in race_rows:
        by_year[row["seasonYear"]].append(row)
    out: list[dict[str, Any]] = []
    for year, rows in sorted(by_year.items()):
        finishes = [clean_num(r.get("finishPosition")) for r in rows]
        pct = [clean_num(r.get("finishPercentile")) for r in rows]
        gains = [clean_num(r.get("positionGain")) for r in rows]
        points = [clean_num(r.get("points")) for r in rows if clean_num(r.get("points")) is not None]
        out.append({
            "seasonYear": year,
            "raceRows": len(rows),
            "avgFinish": avg(finishes),
            "medianFinish": med(finishes),
            "avgFinishPercentile": avg(pct),
            "top5Rate": safe_div(sum(1 for f in finishes if f is not None and f <= 5), len(finishes)),
            "top10Rate": safe_div(sum(1 for f in finishes if f is not None and f <= 10), len(finishes)),
            "avgPositionGainWhenStartKnown": avg(gains),
            "startKnownRows": sum(1 for r in rows if r.get("startPosition") is not None),
            "points": sum(points) if points else None,
        })
    return out


def summarize_wetdry(weather_race_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_state: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in weather_race_rows:
        by_state[row.get("wetDry") or "unknown"].append(row)
    out: list[dict[str, Any]] = []
    for wetdry, rows in sorted(by_state.items()):
        finishes = [clean_num(r.get("bryceFinishPositionIfRace")) for r in rows]
        pct = [clean_num(r.get("bryceFinishPercentileIfRace")) for r in rows]
        out.append({
            "wetDry": wetdry,
            "sessionRows": len(rows),
            "raceRows": len(rows),
            "avgRaceFinish": avg(finishes),
            "avgRaceFinishPercentile": avg(pct),
            "confidence": "high",
            "caveat": "Context only. Do not use as causal weather effect.",
        })
    return out


def write_adversarial_review(
    audit_rows: list[dict[str, Any]],
    race_rows: list[dict[str, Any]],
    q_rows: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    roadmap: list[dict[str, Any]],
) -> None:
    unsupported = [
        {
            "claimFamily": "lap_shape",
            "supportRows": 0,
            "reviewConclusion": "unsupported",
            "safeAlternative": "Use result conversion and event summaries only.",
        },
        {
            "claimFamily": "section_pace",
            "supportRows": 0,
            "reviewConclusion": "unsupported",
            "safeAlternative": "Omit section pace modules for GB3.",
        },
        {
            "claimFamily": "weather_causality",
            "supportRows": len(weather_rows),
            "reviewConclusion": "context_only",
            "safeAlternative": "Show official 2021 condition labels without causal language.",
        },
        {
            "claimFamily": "team_engineering_root_cause",
            "supportRows": len(race_rows),
            "reviewConclusion": "unsupported",
            "safeAlternative": "Use within-team result order and denominator labels.",
        },
        {
            "claimFamily": "2022_start_conversion",
            "supportRows": 0,
            "reviewConclusion": "unsupported",
            "safeAlternative": "Show 2022 qualifying rank to finish context, with start unavailable.",
        },
    ]
    text = f"""# GB3 Analytics Adversarial Review

This review stress-tests the GB3 deep dive against the canonical source shape.

## Completion Matrix

{table_md(audit_rows, ['sourceFamily', 'bryceRaceRows', 'qualifyingContextRows', 'gridStartRaceRows', 'weatherConditionRows', 'pitStopCountRaceRows', 'lapSampleRows', 'sectionMetricRows', 'analysisStatus'], limit=10)}

## Unsupported Or Constrained Claim Families

{table_md(unsupported, ['claimFamily', 'supportRows', 'reviewConclusion', 'safeAlternative'], limit=10)}

## Structural Issues

| severity | issue | evidence | required display behavior |
| --- | --- | --- | --- |
| high | GB3 source families expose different fields. | 2021 has official TSL grids and condition rows; 2022 has official JSON pit count rows and no source-backed starts or weather. | Every detailed metric needs a source-family badge. |
| high | Lap and section modules have no GB3 support. | 0 GB3 lap samples and 0 GB3 section metric rows. | Omit lap trace, stint-shape, sector-shape, and section-pace UI for GB3. |
| medium | Qualifying context spans two canonical shapes. | 2021 context is in `qualifyingResults`; 2022 context is in qualifying session result rows. | Label 2022 qualifying context as medium confidence source-family normalization. |
| medium | Team context can be overread. | Full-field rows support team result order only. | Use result order language only, with no engineering or setup attribution. |
| medium | Weather context is 2021-only. | {len(weather_rows)} official condition rows, all from the 2021 TSL source family. | Show 2022 weather as unavailable, not blank or inferred. |

## Acceptance Tests Applied

- Result conversion uses only Bryce race rows from GB3 race sessions.
- Start-to-finish gain is populated only when `startPosition` or `gridPosition` is source-backed.
- Qualifying context includes 2021 `qualifyingResults` and 2022 qualifying session result rows, with source-table labels.
- Weather rows preserve official TSL categorical conditions and avoid ambient-weather inference.
- Roadmap ranks follow current canonical support, with IMSA held as a standalone Daytona feature.

## Final Assessment

GB3 is ready for a source-bounded historic analytics module after this pass. The main product risk is overclaiming detail parity with INDY NXT. The safe UI surface is result conversion, qualifying context, event/track summaries, team-result context, source-family coverage badges, and 2021 official condition context.
"""
    (OUT_DIR / "GB3_ANALYTICS_ADVERSARIAL_REVIEW.md").write_text(text)


def write_roadmap_report(roadmap: list[dict[str, Any]]) -> None:
    text = f"""# Historic Analytics Roadmap After GB3

## Ranked Roadmap

{table_md(roadmap, ['seriesName', 'rankScore', 'raceRows', 'qualifyingContextRows', 'weatherRows', 'lapSampleRows', 'gridStartCoveragePct', 'recommendedDepth', 'confidence'], limit=10)}

## Recommended Order

1. **Formula Ford:** Run a specialist pass focused on wet/dry official condition rows, Bryce-only lap-analysis samples, grid/start coverage, and event progression. This is the richest next early-career story, with caveats around Bryce-only lap samples and partial source-asymmetry holdouts.
2. **IMSA Daytona:** Run as a standalone endurance feature, separate from single-seater parity. The value is lap-sample depth, official condition context, pit count rows, and full-field class context for one event.
3. **Euroformula Open:** Run a clean result and qualifying conversion pass. The source shape is strong for result, grid, qualifying, and track context, while weather and lap shape remain unavailable.
4. **FRP F1600:** Run after the higher-signal lanes if early-career chronology needs a fuller bridge. It has more race rows than Euroformula but lacks source-backed starts, weather, and lap samples.
5. **FROC:** Keep as lightweight context until the product needs New Zealand winter-series framing or a specific grid-rule follow-up. Current result depth is small and derived benchmarks remain blocked.

## Product Boundary

Cross-series UI should normalize by finish percentile and carry coverage badges. Field sizes, session formats, and source families differ enough that raw finish comparisons alone are misleading.
"""
    (OUT_DIR / "HISTORIC_ANALYTICS_ROADMAP.md").write_text(text)


def stamp_source_hash(rows: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    """Append the canonical-dataset SHA-256 to every row as the final column.

    Setting a new key on an existing dict appends it in insertion order, so the
    archived analysis columns keep their exact order and values; `sourceHash`
    lands last. This is the only permitted new column in the oracle diff.
    """
    for row in rows:
        row["sourceHash"] = source_hash
    return rows


def build_context_pack(
    generated_at: str,
    source_hash: str,
    counts: dict[str, int],
    race_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    q_rows: list[dict[str, Any]],
    track_rows: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    team_rows: list[dict[str, Any]],
    audit_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "id": "gb3-deep-dive-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": CLAIM_STRENGTH,
        "publicPointPrediction": False,
        "lapShapeAvailable": False,
        "sectionPaceAvailable": False,
        "causalWeatherAvailable": False,
        "artifacts": [
            "tables/gb3_bryce_race_results.csv",
            "tables/gb3_event_summary.csv",
            "tables/gb3_qualifying_context.csv",
            "tables/gb3_track_profile.csv",
            "tables/gb3_weather_context.csv",
            "tables/gb3_team_context.csv",
            "tables/gb3_source_family_audit.csv",
            "tables/historic_analytics_roadmap.csv",
        ],
        "counts": counts,
        "sourceFamilies": [
            "2021 TSL official PDFs",
            "2022 GB3 official JSON",
        ],
        "raceResults": race_rows,
        "eventSummary": event_rows,
        "qualifyingContext": q_rows,
        "trackProfile": track_rows,
        "weatherContext": weather_rows,
        "teamContext": team_rows,
        "sourceFamilyReadiness": audit_rows,
        "displayRules": [
            "Every GB3 result stat travels with its finish percentile and a labeled denominator; raw finish alone must not headline.",
            "Split every detail module by source family: 2021 TSL official PDFs versus 2022 GB3 official JSON. A combined card is safe only for result conversion.",
            "Show start-to-finish conversion only for 2021 rows; 2022 exposes no source-backed race starts, so render 2022 start as unavailable, never blank or inferred.",
            "Omit lap-trace, stint-shape, sector-shape, and section-pace modules for GB3: the canonical slice has 0 Bryce lap samples and 0 section metrics.",
            "Weather is 2021-only official TSL condition labels; present as context, never as a causal performance effect, and show 2022 weather as unavailable.",
            "Team context is within-team result order only; it does not support engineering, setup, strategy, reliability, or teammate-parity attribution.",
            "No telemetry, GPS, tire, pit-sequence, or calibrated finish/top-10 prediction claims are supported for GB3.",
        ],
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def main() -> int:
    data = load_json(DATASET_PATH)
    idx = build_indexes(data)
    ctx = gb3_context(data, idx)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    TABLE_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)

    source_hash = dataset_hash()
    generated_at = now_iso()

    q_rows = normalized_qualifying_context(data, idx, ctx["session_ids"])
    race_rows = race_result_rows(data, idx, ctx)
    weather_rows = weather_context_rows(data, idx, ctx, race_rows)
    event_rows = event_summary_rows(race_rows, q_rows, weather_rows)
    track_rows = track_profile_rows(data, idx, race_rows)
    team_rows = team_context_rows(data, idx, ctx)
    audit_rows = source_family_audit_rows(data, idx, ctx)
    roadmap = roadmap_rows(data, idx)

    # Reports render explicit column lists only (see table_md), so they never
    # surface sourceHash. Write them before stamping to keep the archived
    # narrative byte-identical apart from dataset-context snapshot lines.
    write_main_report(data, race_rows, event_rows, q_rows, track_rows, weather_rows, team_rows, audit_rows, roadmap)
    write_adversarial_review(audit_rows, race_rows, q_rows, weather_rows, roadmap)
    write_roadmap_report(roadmap)

    # Convention gap 2: per-row sourceHash stamping (canonical dataset SHA-256).
    for rows in (race_rows, event_rows, q_rows, track_rows, weather_rows, team_rows, audit_rows, roadmap):
        stamp_source_hash(rows, source_hash)

    write_csv(race_rows, TABLE_DIR / "gb3_bryce_race_results.csv")
    write_csv(event_rows, TABLE_DIR / "gb3_event_summary.csv")
    write_csv(q_rows, TABLE_DIR / "gb3_qualifying_context.csv")
    write_csv(track_rows, TABLE_DIR / "gb3_track_profile.csv")
    write_csv(weather_rows, TABLE_DIR / "gb3_weather_context.csv")
    write_csv(team_rows, TABLE_DIR / "gb3_team_context.csv")
    write_csv(audit_rows, TABLE_DIR / "gb3_source_family_audit.csv")
    write_csv(roadmap, TABLE_DIR / "historic_analytics_roadmap.csv")

    counts = {
        "raceRows": len(race_rows),
        "eventRows": len(event_rows),
        "qualifyingContextRows": len(q_rows),
        "trackProfileRows": len(track_rows),
        "weatherRows": len(weather_rows),
        "teamContextRows": len(team_rows),
        "sourceFamilyAuditRows": len(audit_rows),
        "roadmapRows": len(roadmap),
        "lapSampleRows": 0,
        "sectionMetricRows": 0,
    }

    pack = build_context_pack(
        generated_at,
        source_hash,
        counts,
        race_rows,
        event_rows,
        q_rows,
        track_rows,
        weather_rows,
        team_rows,
        audit_rows,
    )
    write_json(PACK_DIR / "gb3-deep-dive-context.json", pack)

    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "generatedFrom": str(DATASET_PATH.relative_to(ROOT)),
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": CLAIM_STRENGTH,
        "publicPointPrediction": False,
        "lapShapeAvailable": False,
        "sectionPaceAvailable": False,
        "causalWeatherAvailable": False,
        "datasetUpdatedAt": data.get("updatedAt"),
        "gb3RaceRows": len(race_rows),
        "gb3QualifyingContextRows": len(q_rows),
        "gb3WeatherRows": len(weather_rows),
        "gb3TeamContextRows": len(team_rows),
        "gb3LapSampleRows": 0,
        "gb3SectionMetricRows": 0,
        "counts": counts,
        "tables": sorted(p.name for p in TABLE_DIR.glob("*.csv")),
        "reports": [
            "GB3_DEEP_DIVE_ANALYTICS.md",
            "GB3_ANALYTICS_ADVERSARIAL_REVIEW.md",
            "HISTORIC_ANALYTICS_ROADMAP.md",
        ],
        "contextPack": "context-packs/gb3-deep-dive-context.json",
        "caveats": [
            "GB3 detail must stay split by 2021 TSL PDF versus 2022 GB3 JSON source families.",
            "No GB3 lap samples or section metrics exist; omit lap-trace, stint, sector, and section-pace modules.",
            "Weather is 2021-only official TSL condition context, never a causal effect; 2022 weather is unavailable.",
            "Team context is within-team result order only, with no engineering, setup, strategy, or reliability attribution.",
            "2022 exposes no source-backed race starts; show 2022 start-to-finish conversion as unavailable.",
        ],
        "validationSnapshot": validation_snapshot(),
    }
    write_json(OUT_DIR / "summary.json", summary)
    print(json.dumps({"ok": True, "output": str(OUT_DIR.relative_to(ROOT)), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
