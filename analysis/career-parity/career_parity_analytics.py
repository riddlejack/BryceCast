#!/usr/bin/env python3
"""Career-wide analytics parity pass for BryceCast.

This script reads the canonical career dataset and writes source-bounded
cross-series parity outputs. It does not mutate ingestion-owned files.
"""

from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DATASET_PATH = ROOT / "data/career/career.dataset.json"
OUT_DIR = ROOT / "analysis/career-parity/output"
TABLE_DIR = OUT_DIR / "tables"

BRYCE_ID = "driver_bryce_aron"


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


def table_md(rows: list[dict[str, Any]], cols: list[str], limit: int = 20) -> str:
    rows = rows[:limit]
    if not rows:
        return "_No rows._"
    header = "| " + " | ".join(cols) + " |"
    sep = "| " + " | ".join(["---"] * len(cols)) + " |"
    body = ["| " + " | ".join(fmt(row.get(c)) for c in cols) + " |" for row in rows]
    return "\n".join([header, sep, *body])


def load_data() -> dict[str, Any]:
    return json.loads(DATASET_PATH.read_text())


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    events = {e["id"]: e for e in data["events"]}
    sessions = {s["id"]: s for s in data["sessions"]}
    series = {s["id"]: s for s in data["series"]}
    tracks = {t["id"]: t for t in data["tracks"]}
    teams = {t["id"]: t for t in data["teams"]}
    event_ids_by_series = defaultdict(set)
    session_ids_by_series = defaultdict(set)
    for event in data["events"]:
        event_ids_by_series[event.get("seriesId")].add(event["id"])
    for session in data["sessions"]:
        sid = events.get(session.get("eventId"), {}).get("seriesId")
        if sid:
            session_ids_by_series[sid].add(session["id"])
    return {
        "events": events,
        "sessions": sessions,
        "series": series,
        "tracks": tracks,
        "teams": teams,
        "event_ids_by_series": event_ids_by_series,
        "session_ids_by_series": session_ids_by_series,
    }


def finish_percentile(result: dict[str, Any]) -> float | None:
    if result.get("finishPercentile") is not None:
        return clean_num(result.get("finishPercentile"))
    finish = clean_num(result.get("finishPosition"))
    field = clean_num(result.get("fieldSize"))
    if finish is not None and field and field > 1:
        return 1 - ((finish - 1) / (field - 1))
    return None


def result_conversion(data: dict[str, Any], idx: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for result in data["results"]:
        if result.get("driverId") != BRYCE_ID:
            continue
        session = idx["sessions"].get(result.get("sessionId"), {})
        if session.get("sessionType") != "race":
            continue
        event = idx["events"].get(session.get("eventId"), {})
        series_id = event.get("seriesId")
        start = clean_num(result.get("startPosition") or result.get("gridPosition"))
        finish = clean_num(result.get("finishPosition"))
        field = clean_num(result.get("fieldSize"))
        if finish is None:
            continue
        rows.append({
            "seriesId": series_id,
            "seriesName": idx["series"].get(series_id, {}).get("name", series_id),
            "seasonYear": event.get("seasonYear"),
            "eventName": event.get("name"),
            "sessionId": session.get("id"),
            "raceLabel": f"{event.get('seasonYear')} {event.get('name')}",
            "trackName": idx["tracks"].get(event.get("trackId"), {}).get("canonicalName") or idx["tracks"].get(event.get("trackId"), {}).get("name"),
            "trackType": idx["tracks"].get(event.get("trackId"), {}).get("trackType"),
            "teamName": idx["teams"].get(result.get("teamId"), {}).get("name"),
            "startPosition": start,
            "finishPosition": finish,
            "positionGain": start - finish if start is not None else None,
            "finishPercentile": finish_percentile(result),
            "points": result.get("points"),
            "status": result.get("status"),
            "sourceState": "official_or_source_backed_result",
        })
    return rows


def series_summary(result_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_series = defaultdict(list)
    for row in result_rows:
        by_series[row["seriesId"]].append(row)
    out = []
    for sid, rows in by_series.items():
        finishes = [clean_num(r.get("finishPosition")) for r in rows if clean_num(r.get("finishPosition")) is not None]
        gains = [clean_num(r.get("positionGain")) for r in rows if clean_num(r.get("positionGain")) is not None]
        finish_pct = [clean_num(r.get("finishPercentile")) for r in rows if clean_num(r.get("finishPercentile")) is not None]
        statuses = [str(r.get("status") or "").lower() for r in rows]
        out.append({
            "seriesId": sid,
            "seriesName": rows[0]["seriesName"],
            "raceRows": len(rows),
            "avgFinish": mean(finishes) if finishes else None,
            "medianFinish": median(finishes) if finishes else None,
            "avgGain": mean(gains) if gains else None,
            "avgFinishPercentile": mean(finish_pct) if finish_pct else None,
            "top5Rate": safe_div(sum(1 for f in finishes if f <= 5), len(finishes)) if finishes else None,
            "top10Rate": safe_div(sum(1 for f in finishes if f <= 10), len(finishes)) if finishes else None,
            "issueLikeStatusRate": safe_div(sum(1 for s in statuses if s and s not in {"running", "unknown"}), len(statuses)) if statuses else None,
        })
    return sorted(out, key=lambda r: (-(r["raceRows"] or 0), r["seriesName"]))


def metric_family_parity(data: dict[str, Any], idx: dict[str, Any], result_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result_by_series = defaultdict(list)
    for row in result_rows:
        result_by_series[row["seriesId"]].append(row)
    out = []
    metric_families = [
        ("result_conversion", "Result conversion across all series"),
        ("qualifying_conversion", "Qualifying-to-race conversion where qualifying rows exist"),
        ("track_venue_history", "Track type and venue history"),
        ("weather_context", "Weather or conditions where source-backed"),
        ("lap_shape", "Lap-shape where lap samples exist"),
        ("team_teammate_context", "Team and teammate context where field rows support it"),
        ("section_pace", "Section pace where official section metrics exist"),
    ]
    for series_id, series in idx["series"].items():
        session_ids = idx["session_ids_by_series"].get(series_id, set())
        race_rows = result_by_series.get(series_id, [])
        q_rows = [q for q in data["qualifyingResults"] if q.get("driverId") == BRYCE_ID and q.get("sessionId") in session_ids]
        lap_rows = [l for l in data["lapSamples"] if l.get("driverId") == BRYCE_ID and l.get("sessionId") in session_ids]
        weather_rows = [w for w in data["weatherObservations"] if w.get("sessionId") in session_ids]
        section_metric_rows = [
            m for m in data["derivedMetrics"]
            if (m.get("sessionId") in session_ids or m.get("seriesId") == series_id)
            and m.get("metricType")
            and "section" in m.get("metricType")
        ]
        full_field_rows = [
            r for r in data["results"]
            if r.get("sessionId") in session_ids and r.get("driverId") != BRYCE_ID
        ]
        values = {
            "result_conversion": (len(race_rows), "production_safe" if race_rows else "unavailable"),
            "qualifying_conversion": (len(q_rows), "production_safe" if q_rows else "unavailable_without_guessing"),
            "track_venue_history": (len({r.get("trackName") for r in race_rows if r.get("trackName")}), "production_safe" if race_rows else "unavailable"),
            "weather_context": (len(weather_rows), "source_bounded_partial" if weather_rows else "unavailable"),
            "lap_shape": (len(lap_rows), "source_bounded_partial" if lap_rows else "unavailable"),
            "team_teammate_context": (len(full_field_rows), "source_bounded_partial" if full_field_rows else "unavailable"),
            "section_pace": (len(section_metric_rows), "source_bounded_partial" if section_metric_rows else "unavailable"),
        }
        for family, label in metric_families:
            count, status = values[family]
            out.append({
                "seriesId": series_id,
                "seriesName": series.get("name", series_id),
                "metricFamily": family,
                "metricLabel": label,
                "sourceRowsOrSessions": count,
                "parityStatus": status,
                "uiUse": ui_use_for_family(family, status),
                "caveat": caveat_for_family(series_id, family, status, count),
            })
    return out


def ui_use_for_family(family: str, status: str) -> str:
    if status == "production_safe":
        return "Use in Career Analytics Lab."
    if status == "source_bounded_partial":
        return "Use with coverage badge and denominators."
    return "Show unavailable or omit from comparison charts."


def caveat_for_family(series_id: str, family: str, status: str, count: int) -> str:
    if count == 0 or status.startswith("unavailable"):
        if family == "qualifying_conversion":
            return "No qualifying rows currently support a start-to-race conversion model for this series."
        if family == "weather_context":
            return "No trustworthy source-backed weather rows currently available for this series."
        if family == "lap_shape":
            return "No lap-sample rows currently available for Bryce in this series."
        if family == "team_teammate_context":
            return "No full-field race-result rows currently support teammate or team-context modeling."
        if family == "section_pace":
            return "No official section-metric rows currently available for this series."
        return "No trustworthy source-backed rows currently available for this metric family."
    if status == "production_safe":
        if family == "result_conversion":
            return "Use percentiles alongside raw finish because field sizes and formats vary by series."
        if family == "qualifying_conversion":
            return "Qualifying rows exist; display session-format and group caveats where applicable."
        if family == "track_venue_history":
            return "Venue and track-type coverage comes from canonical event and track metadata."
        return "Comparable within source-family limits."
    if family == "weather_context" and series_id == "series_indy_nxt":
        return "INDY NXT weather is modeled non-official; context only."
    if family == "weather_context":
        return "Use as ambient/session context with source and confidence labels; do not claim causal weather effects."
    if family == "lap_shape":
        return "Lap row grains differ by source family; use within-series first and show coverage denominators."
    if family == "team_teammate_context":
        return "Full-field results support descriptive team/teammate context, not engineering root-cause attribution."
    if family == "section_pace":
        return "Section metrics are currently INDY NXT-only and need denominator badges for sparse sessions."
    return "Source-backed but bounded; show coverage badges and denominators."


def modeling_priority(parity_rows: list[dict[str, Any]], summary_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    score_by_series = defaultdict(int)
    status_weight = {"production_safe": 3, "source_bounded_partial": 2, "unavailable": 0, "unavailable_without_guessing": 0}
    for row in parity_rows:
        score_by_series[row["seriesId"]] += status_weight.get(row["parityStatus"], 0)
    races = {r["seriesId"]: r["raceRows"] for r in summary_rows}
    out = []
    for row in summary_rows:
        sid = row["seriesId"]
        base = score_by_series.get(sid, 0)
        race_bonus = min(row["raceRows"], 40) / 10
        total = base + race_bonus
        if sid == "series_indy_nxt":
            recommendation = "reference_model_complete_for_ui_contract"
        elif sid == "series_gb3":
            recommendation = "next_deep_dive_candidate"
        elif sid == "series_formula_ford":
            recommendation = "lap_weather_specialist_pass"
        elif sid == "series_imsa_weathertech":
            recommendation = "standalone_daytona_feature"
        elif row["raceRows"] >= 15:
            recommendation = "result_conversion_pass"
        else:
            recommendation = "lightweight_context_only"
        out.append({
            "seriesId": sid,
            "seriesName": row["seriesName"],
            "raceRows": row["raceRows"],
            "parityScore": total,
            "recommendedDepth": recommendation,
        })
    return sorted(out, key=lambda r: (r["recommendedDepth"] != "next_deep_dive_candidate", -r["parityScore"]))


def make_report(data: dict[str, Any], summary_rows: list[dict[str, Any]], parity_rows: list[dict[str, Any]], priority_rows: list[dict[str, Any]]) -> str:
    ready = [r for r in parity_rows if r["parityStatus"] == "production_safe"]
    partial = [r for r in parity_rows if r["parityStatus"] == "source_bounded_partial"]
    lines = [
        "# Career Analytics Parity Pass",
        "",
        f"Generated from canonical career dataset updated `{data.get('updatedAt')}`.",
        "",
        "## Series Result Summary",
        "",
        table_md(summary_rows, ["seriesName", "raceRows", "avgFinish", "avgGain", "avgFinishPercentile", "top5Rate", "top10Rate", "issueLikeStatusRate"], 20),
        "",
        "## Metric-Family Parity Matrix",
        "",
        table_md(parity_rows, ["seriesName", "metricFamily", "sourceRowsOrSessions", "parityStatus", "uiUse", "caveat"], 60),
        "",
        "## Modeling Priority",
        "",
        table_md(priority_rows, ["seriesName", "raceRows", "parityScore", "recommendedDepth"], 20),
        "",
        "## Interpretation",
        "",
        f"- Production-safe metric-family rows: {len(ready)}.",
        f"- Source-bounded partial metric-family rows: {len(partial)}.",
        "- GB3 is the best next historic deep-dive candidate because it has the largest non-INDY race-result set plus qualifying and weather support.",
        "- Formula Ford is valuable for weather and lap-shape context, but its source shape differs from INDY NXT and should be labeled separately.",
        "- IMSA should remain a standalone Daytona feature rather than a broad career comparison axis.",
        "",
        "## Agent Navigation Notes",
        "",
        "- This pass is a metric-family screen, not a full historical deep dive. It identifies which series deserve deeper modeling next.",
        "- Team and teammate context counts use full-field session-result rows, so later UI work should split race-result context from practice/qualifying context.",
        "- Cross-series comparisons should use finish percentiles and coverage badges, because field sizes, source families, and session formats differ.",
        "- Warehouse setup is deferred; this report intentionally reads the canonical local dataset and writes only under `analysis/`.",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    data = load_data()
    idx = build_indexes(data)
    results = result_conversion(data, idx)
    summary = series_summary(results)
    parity = metric_family_parity(data, idx, results)
    priority = modeling_priority(parity, summary)
    write_csv(results, TABLE_DIR / "career_result_conversion.csv")
    write_csv(summary, TABLE_DIR / "career_series_result_summary.csv")
    write_csv(parity, TABLE_DIR / "career_metric_family_parity.csv")
    write_csv(priority, TABLE_DIR / "career_series_modeling_priority.csv")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "CAREER_ANALYTICS_PARITY_PASS.md").write_text(make_report(data, summary, parity, priority))
    summary_json = {
        "datasetPath": str(DATASET_PATH.relative_to(ROOT)),
        "datasetUpdatedAt": data.get("updatedAt"),
        "resultRows": len(results),
        "seriesSummaryRows": len(summary),
        "metricFamilyRows": len(parity),
        "modelingPriorityRows": len(priority),
        "outputs": {
            "report": str((OUT_DIR / "CAREER_ANALYTICS_PARITY_PASS.md").relative_to(ROOT)),
            "tablesDir": str(TABLE_DIR.relative_to(ROOT)),
        },
    }
    (OUT_DIR / "summary.json").write_text(json.dumps(summary_json, indent=2, sort_keys=True) + "\n")
    print(json.dumps(summary_json, indent=2))


if __name__ == "__main__":
    main()
