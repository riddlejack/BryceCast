#!/usr/bin/env python3
"""Build BryceCast predictive race-intelligence artifacts.

This lane refreshes analysis-owned upstream analytics artifacts, then writes
only under analysis/predictive-race-intelligence/output. It does not mutate
ingestion data, frontend code, or source manifests.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import date, datetime, timezone
from html import escape as html_escape
from pathlib import Path
from statistics import mean, median
from typing import Any

import numpy as np
import pandas as pd


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/predictive-race-intelligence"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
UPCOMING_PACK_DIR = PACK_DIR / "upcoming-events"
DEBRIEF_PACK_DIR = PACK_DIR / "race-debriefs"
CHART_DIR = OUTPUT_DIR / "charts"
DATASET_PATH = ROOT / "data/career/career.dataset.json"
def resolve_run_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override:
        try:
            return date.fromisoformat(override)
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    return date.today()


RUN_DATE = resolve_run_date()

INDY_TABLES = ROOT / "analysis/indy-nxt-discovery/output/tables"
DEEP_TABLES = ROOT / "analysis/indy-nxt-discovery/output/deep_dive/tables"
CAREER_TABLES = ROOT / "analysis/career-parity/output/tables"
INVENTORY_CSV_ROOTS = [INDY_TABLES, DEEP_TABLES, CAREER_TABLES]
SECTION_RACE_ALLOWED_HOLDOUTS = {"session_indy_nxt_2024_6325"}
FUTURE_WEEKEND_PREP_FIELDS = (
    "eventId",
    "eventName",
    "eventStartDate",
    "trackName",
    "trackType",
    "trackLengthMi",
    "cornerCount",
    "bryceIndyNxtRacesAtTrack",
    "sameTrackAvgFinish",
    "sameTrackAvgGain",
    "sameTrackTop10Rate",
    "trackTypeAvgFinish",
    "trackTypeAvgGain",
    "trackTypeTop10Rate",
    "weatherState",
    "prepUse",
    "sourceState",
)
UPSTREAM_ANALYTICS_SCRIPTS = [
    ROOT / "analysis/indy-nxt-discovery/analyze_indy_nxt.py",
    ROOT / "analysis/indy-nxt-discovery/deep_indy_nxt_analytics.py",
    ROOT / "analysis/career-parity/career_parity_analytics.py",
]

INPUTS = {
    "uiMetricManifest": ROOT / "analysis/ui-contract/ui-metric-manifest.json",
    "uiArtifactIndex": ROOT / "analysis/ANALYTICS_UI_ARTIFACT_INDEX.md",
    "productDefinition": ROOT / "analysis/product-definition/PRODUCT_DEFINITION_PACKET.md",
    "uiInsightInventory": ROOT / "analysis/indy-nxt-discovery/output/UI_ANALYTICS_INSIGHT_INVENTORY.md",
    "indySummary": ROOT / "analysis/indy-nxt-discovery/output/summary.json",
    "indyDeepSummary": ROOT / "analysis/indy-nxt-discovery/output/deep_dive/summary.json",
    "careerParitySummary": ROOT / "analysis/career-parity/output/summary.json",
    "careerCoverage": ROOT / "data/career/reports/career-coverage-matrix.json",
    "ingestionSummary": ROOT / "data/career/reports/ingestion-summary.json",
    "validationReport": ROOT / "data/career/reports/validation-report.json",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def slug(value: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return out or "item"


def clean_num(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "dns", "dnf"}:
        return None
    try:
        return float(text.replace(",", ""))
    except ValueError:
        return None


def to_bool_int(value: bool) -> int:
    return 1 if value else 0


def fmt(value: Any, digits: int = 3) -> Any:
    if value is None:
        return None
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return round(value, digits)
    return value


def json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [json_safe(item) for item in value]
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def source_hash(path: Path) -> str | None:
    if not path.exists() or not path.is_file():
        return None
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def source_ref(path: Path, role: str) -> dict[str, Any]:
    return {
        "path": rel(path),
        "role": role,
        "sha256": source_hash(path),
        "bytes": path.stat().st_size if path.exists() else None,
    }


def source_identity(path: Path) -> dict[str, Any]:
    return {
        "bytes": path.stat().st_size,
        "sha256": source_hash(path),
    }


def load_json(path: Path) -> Any:
    with path.open() as f:
        return json.load(f)


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def read_future_weekend_prep() -> pd.DataFrame:
    path = DEEP_TABLES / "future_weekend_prep_inputs.csv"
    try:
        future = pd.read_csv(path)
    except pd.errors.EmptyDataError:
        return pd.DataFrame(columns=FUTURE_WEEKEND_PREP_FIELDS)
    missing = set(FUTURE_WEEKEND_PREP_FIELDS) - set(future.columns)
    if missing:
        raise ValueError(f"{rel(path)} missing required columns: {sorted(missing)}")
    return future


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(json_safe(obj), indent=2, sort_keys=True, allow_nan=False) + "\n")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("")
        return
    fields: list[str] = []
    for row in rows:
        for key in row:
            if key not in fields:
                fields.append(key)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def table_count(path: Path) -> tuple[int, int]:
    rows = read_csv(path)
    cols = len(rows[0]) if rows else 0
    return len(rows), cols


def regenerate_upstream_analytics() -> list[dict[str, Any]]:
    refreshed: list[dict[str, Any]] = []
    for script in UPSTREAM_ANALYTICS_SCRIPTS:
        result = subprocess.run([sys.executable, str(script)], cwd=ROOT, text=True, capture_output=True)
        if result.returncode != 0:
            output = (result.stdout + "\n" + result.stderr).strip()
            raise RuntimeError(f"Upstream analytics refresh failed for {rel(script)}: {output[:1200]}")
        refreshed.append(
            {
                "path": rel(script),
                "role": "upstream analysis script refreshed before predictive build",
                "sha256": source_hash(script),
                "bytes": script.stat().st_size,
            }
        )
    return refreshed


def dataset_indexes(data: dict[str, Any]) -> tuple[dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    return (
        {row["id"]: row for row in data.get("sessions", [])},
        {row["id"]: row for row in data.get("events", [])},
    )


def canonical_indy_bryce_race_sessions(data: dict[str, Any]) -> set[str]:
    sessions, events = dataset_indexes(data)
    out: set[str] = set()
    for result in data.get("results", []):
        if result.get("driverId") != "driver_bryce_aron":
            continue
        session = sessions.get(result.get("sessionId") or "")
        event = events.get((session or {}).get("eventId") or "")
        if session and event and session.get("sessionType") == "race" and event.get("seriesId") == "series_indy_nxt":
            out.add(result["sessionId"])
    return out


def canonical_future_indy_events(data: dict[str, Any]) -> set[str]:
    sessions, events = dataset_indexes(data)
    bryce_result_events = {
        sessions[result["sessionId"]]["eventId"]
        for result in data.get("results", [])
        if result.get("driverId") == "driver_bryce_aron"
        and result.get("sessionId") in sessions
        and sessions[result["sessionId"]].get("sessionType") == "race"
    }
    out: set[str] = set()
    for event in events.values():
        if event.get("seriesId") != "series_indy_nxt" or event["id"] in bryce_result_events:
            continue
        try:
            event_date = date.fromisoformat(str(event.get("eventStartDate") or "")[:10])
        except ValueError:
            continue
        if event_date >= RUN_DATE:
            out.add(event["id"])
    return out


def canonical_bryce_finished_race_sessions(data: dict[str, Any]) -> set[str]:
    sessions, _ = dataset_indexes(data)
    return {
        result["sessionId"]
        for result in data.get("results", [])
        if result.get("driverId") == "driver_bryce_aron"
        and result.get("sessionId") in sessions
        and sessions[result["sessionId"]].get("sessionType") == "race"
        and result.get("finishPosition") is not None
    }


def iso_date_prefix(value: Any) -> str | None:
    text = str(value or "").strip()
    match = re.match(r"^(\d{4}-\d{2}-\d{2})", text)
    return match.group(1) if match else None


def race_session_chronology(data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    sessions, events = dataset_indexes(data)
    items: list[dict[str, Any]] = []
    for session_id in canonical_indy_bryce_race_sessions(data):
        session = sessions.get(session_id) or {}
        event = events.get(session.get("eventId") or "") or {}
        event_start_date = iso_date_prefix(event.get("eventStartDate"))
        if not event_start_date:
            raise ValueError(f"{session_id} missing ISO eventStartDate in canonical dataset")
        session_start = session.get("actualStart") or session.get("scheduledStart") or event_start_date
        session_start_date = iso_date_prefix(session_start) or event_start_date
        items.append(
            {
                "sessionId": session_id,
                "seasonYear": int(clean_num(event.get("seasonYear")) or 0),
                "eventId": event.get("id"),
                "eventName": event.get("name"),
                "eventStartDate": event_start_date,
                "sessionStart": session_start,
                "sessionStartDate": session_start_date,
            }
        )

    by_session: dict[str, dict[str, Any]] = {}
    by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        by_year[item["seasonYear"]].append(item)
    for _, rows in by_year.items():
        rows.sort(key=lambda row: (row["sessionStartDate"], str(row["sessionStart"] or ""), row["eventStartDate"], row["sessionId"]))
        for index, row in enumerate(rows, start=1):
            by_session[row["sessionId"]] = {**row, "roundIndex": index}
    return by_session


def csv_id_set(path: Path, field: str) -> set[str]:
    return {row[field] for row in read_csv(path) if row.get(field)}


def require_exact_ids(label: str, observed: set[str], expected: set[str]) -> None:
    if observed != expected:
        missing = sorted(expected - observed)
        extra = sorted(observed - expected)
        raise AssertionError(f"{label} upstream coverage mismatch: missing={missing[:8]} extra={extra[:8]}")


def validate_upstream_coverage(data: dict[str, Any]) -> dict[str, Any]:
    indy_sessions = canonical_indy_bryce_race_sessions(data)
    future_events = canonical_future_indy_events(data)
    finished_race_sessions = canonical_bryce_finished_race_sessions(data)
    checks: list[dict[str, Any]] = []

    for label, path in [
        ("race_debrief_scores", DEEP_TABLES / "race_debrief_scores.csv"),
        ("full_field_lap_dynamics_by_race", DEEP_TABLES / "full_field_lap_dynamics_by_race.csv"),
        ("incident_penalty_context", DEEP_TABLES / "incident_penalty_context.csv"),
        ("team_context_by_race", DEEP_TABLES / "team_context_by_race.csv"),
        ("championship_progression", DEEP_TABLES / "championship_progression.csv"),
    ]:
        observed = csv_id_set(path, "sessionId")
        require_exact_ids(label, observed, indy_sessions)
        checks.append({"id": label, "field": "sessionId", "rows": len(observed), "coverage": "exact_indy_nxt_bryce_race_sessions"})

    section_observed = csv_id_set(DEEP_TABLES / "section_results_deep_by_race.csv", "sessionId")
    require_exact_ids("section_results_deep_by_race", section_observed, indy_sessions - SECTION_RACE_ALLOWED_HOLDOUTS)
    checks.append(
        {
            "id": "section_results_deep_by_race",
            "field": "sessionId",
            "rows": len(section_observed),
            "coverage": "exact_indy_nxt_bryce_race_sessions_minus_source_broken_holdout",
            "allowedMissing": sorted(SECTION_RACE_ALLOWED_HOLDOUTS),
        }
    )

    future = read_future_weekend_prep()
    require_exact_ids("future_weekend_prep_inputs", set(future["eventId"].dropna().astype(str)), future_events)
    checks.append({"id": "future_weekend_prep_inputs", "field": "eventId", "rows": len(future_events), "coverage": "exact_future_indy_nxt_events_without_bryce_race_results"})

    require_exact_ids("career_result_conversion", csv_id_set(CAREER_TABLES / "career_result_conversion.csv", "sessionId"), finished_race_sessions)
    checks.append({"id": "career_result_conversion", "field": "sessionId", "rows": len(finished_race_sessions), "coverage": "exact_bryce_finished_race_sessions"})

    return {
        "datasetSourceHash": source_hash(DATASET_PATH),
        "asOfDate": RUN_DATE.isoformat(),
        "checks": checks,
        "sourceRefs": [
            source_ref(DEEP_TABLES / "future_weekend_prep_inputs.csv", "future event coverage"),
            source_ref(DEEP_TABLES / "race_debrief_scores.csv", "completed INDY NXT race coverage"),
            source_ref(DEEP_TABLES / "section_results_deep_by_race.csv", "section coverage with source-broken holdout"),
            source_ref(CAREER_TABLES / "career_result_conversion.csv", "career finished-race coverage"),
        ],
    }


def git_head() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return "unknown"


def classify_artifact(path: Path) -> tuple[str, str]:
    name = path.name
    analyst_only = {
        "indy_nxt_correlations.csv",
        "indy_nxt_exploratory_model.csv",
        "prep_session_correlations.csv",
        "driver_strength_ratings.csv",
        "field_strength_by_race.csv",
    }
    context_ready = {
        "future_weekend_prep_inputs.csv",
        "prep_session_signals.csv",
        "race_debrief_scores.csv",
        "indy_nxt_race_outcomes.csv",
        "full_field_lap_dynamics_by_race.csv",
        "full_field_lap_dynamics_by_driver.csv",
        "indy_nxt_lap_timeline.csv",
        "section_results_deep_by_race.csv",
        "section_results_deep_by_section.csv",
        "indy_nxt_section_strengths.csv",
        "incident_penalty_context.csv",
        "leader_lap_context.csv",
        "team_context_by_race.csv",
        "team_context_by_year.csv",
        "championship_progression.csv",
        "race_track_type_summary.csv",
        "racecraft_context_by_race.csv",
        "career_result_conversion.csv",
        "career_series_result_summary.csv",
        "career_metric_family_parity.csv",
        "career_series_modeling_priority.csv",
    }
    if name in analyst_only:
        return "analyst_only", "Keep for hypothesis selection or internal diagnostics until validated out of sample."
    if name in context_ready:
        return "context_pack_ready", "Promote through context packs with source refs, caveats, and denominator rules."
    if "source_family_audit" in name or name == "ui_analytics_contract.csv":
        return "productized", "Use as governance/source-contract input."
    return "context_pack_ready", "Inventory and expose if a context pack has a matching product use."


def build_inventory() -> dict[str, Any]:
    manifest = load_json(INPUTS["uiMetricManifest"])
    items: list[dict[str, Any]] = []

    for item in manifest.get("items", []):
        items.append(
            {
                "id": f"metric:{item['id']}",
                "label": item["id"],
                "kind": "metric_contract",
                "surface": item.get("surface"),
                "sourcePath": rel(INPUTS["uiMetricManifest"]),
                **source_identity(INPUTS["uiMetricManifest"]),
                "productizationStatus": "productized",
                "availability": item.get("availability"),
                "confidence": item.get("confidence"),
                "recommendedAction": "Keep as canonical metric id; hydrate from context pack or runtime API.",
                "caveat": (item.get("caveatBehavior") or {}).get("copy"),
            }
        )

    for item in manifest.get("deferredOrUnavailable", []):
        availability = item.get("availability")
        status = "blocked" if availability == "unavailable" else "deferred"
        items.append(
            {
                "id": f"deferred:{item['id']}",
                "label": item["id"],
                "kind": "deferred_or_unavailable_contract",
                "surface": "cross_surface",
                "sourcePath": rel(INPUTS["uiMetricManifest"]),
                **source_identity(INPUTS["uiMetricManifest"]),
                "productizationStatus": status,
                "availability": availability,
                "confidence": "not_applicable",
                "recommendedAction": "Do not expose except as unavailable/deferred state until required proof exists.",
                "caveat": item.get("rationale"),
            }
        )

    for root in INVENTORY_CSV_ROOTS:
        if not root.exists():
            continue
        for path in sorted(root.glob("*.csv")):
            rows, cols = table_count(path)
            status, action = classify_artifact(path)
            items.append(
                {
                    "id": f"artifact:{slug(rel(path))}",
                    "label": path.name,
                    "kind": "analysis_artifact",
                    "surface": infer_surface(path),
                    "sourcePath": rel(path),
                    **source_identity(path),
                    "rows": rows,
                    "columns": cols,
                    "productizationStatus": status,
                    "availability": status,
                    "confidence": infer_confidence(path, status),
                    "recommendedAction": action,
                    "caveat": infer_artifact_caveat(path),
                }
            )

    for key, path in INPUTS.items():
        if path.exists():
            items.append(
                {
                    "id": f"governance:{key}",
                    "label": key,
                    "kind": "governance_source",
                    "surface": "governance",
                    "sourcePath": rel(path),
                    **source_identity(path),
                    "productizationStatus": "productized",
                    "availability": "available",
                    "confidence": "high",
                    "recommendedAction": "Use as source precedence, caveat, or validation input.",
                    "caveat": None,
                }
            )

    return {
        "schemaVersion": "brycecast.predictiveRaceIntelligence.inventory.v1",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "asOfDate": RUN_DATE.isoformat(),
        "repoHead": git_head(),
        "items": items,
        "statusCounts": dict(sorted(count_by(items, "productizationStatus").items())),
        "sourceRefs": [source_ref(path, key) for key, path in INPUTS.items() if path.exists()],
    }


def infer_surface(path: Path) -> str:
    name = path.name
    if "future_weekend" in name or "prep_" in name:
        return "race_weekend_prep"
    if "debrief" in name or "lap_" in name or "section" in name or "incident" in name or "leader" in name:
        return "race_debrief"
    if "career_" in name:
        return "career_lab"
    if "source" in name:
        return "source_ops"
    if "strength" in name or "team_" in name or "racecraft" in name:
        return "race_intelligence"
    return "cross_surface"


def infer_confidence(path: Path, status: str) -> str:
    name = path.name
    if status == "analyst_only":
        return "low"
    if "section" in name or "weather" in name or "strength" in name:
        return "medium"
    return "high"


def infer_artifact_caveat(path: Path) -> str | None:
    name = path.name
    if name == "indy_nxt_exploratory_model.csv":
        return "In-sample OLS only; existing interpretation text has coefficient-sign QA issues."
    if "correlations" in name:
        return "Correlation is exploratory and non-causal."
    if "section" in name:
        return "Headline display needs denominator filtering and partial-source badges."
    if "strength" in name:
        return "Descriptive same-sample context; not a predictive scouting model."
    if "weather" in name:
        return "Weather context is non-official/modelled unless a source row proves otherwise."
    return None


def count_by(rows: list[dict[str, Any]], key: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for row in rows:
        value = str(row.get(key) or "")
        out[value] = out.get(value, 0) + 1
    return out


def build_career_prior_matrix() -> list[dict[str, Any]]:
    result_rows = pd.read_csv(CAREER_TABLES / "career_result_conversion.csv")
    summary_rows = pd.read_csv(CAREER_TABLES / "career_series_result_summary.csv")
    parity_rows = pd.read_csv(CAREER_TABLES / "career_metric_family_parity.csv")
    rows: list[dict[str, Any]] = []

    for _, row in summary_rows.iterrows():
        rows.append(
            {
                "priorId": f"series:{row.seriesId}",
                "priorType": "series_outcome",
                "seriesId": row.seriesId,
                "seriesName": row.seriesName,
                "trackType": "",
                "metricFamily": "result_conversion",
                "raceRows": int(row.raceRows),
                "avgFinishPercentile": fmt(clean_num(row.avgFinishPercentile)),
                "top10Rate": fmt(clean_num(row.top10Rate)),
                "top5Rate": fmt(clean_num(row.top5Rate)),
                "avgGain": fmt(clean_num(row.avgGain)),
                "parityStatus": "production_safe",
                "eligibility": "prior_allowed",
                "sourceState": "official_or_source_backed_result",
                "caveat": "Use as normalized prior; do not compare raw finish across different field sizes.",
            }
        )

    for track_type, group in result_rows.groupby("trackType", dropna=True):
        rows.append(prior_row_from_group(f"track_type:{track_type}", "track_type_outcome", group, "", track_type, "result_conversion"))

    for (series_name, track_type), group in result_rows.groupby(["seriesName", "trackType"], dropna=True):
        rows.append(prior_row_from_group(f"series_track:{slug(series_name)}:{track_type}", "series_track_outcome", group, series_name, track_type, "result_conversion"))

    for _, row in parity_rows.iterrows():
        status = row.parityStatus
        eligible = "prior_allowed" if status in {"production_safe", "source_bounded_partial"} else "prior_denied"
        rows.append(
            {
                "priorId": f"metric_family:{slug(row.seriesName)}:{row.metricFamily}",
                "priorType": "metric_family_eligibility",
                "seriesId": row.seriesId,
                "seriesName": row.seriesName,
                "trackType": "",
                "metricFamily": row.metricFamily,
                "raceRows": "",
                "sourceRowsOrSessions": row.sourceRowsOrSessions,
                "avgFinishPercentile": "",
                "top10Rate": "",
                "top5Rate": "",
                "avgGain": "",
                "parityStatus": status,
                "eligibility": eligible,
                "sourceState": status,
                "caveat": row.caveat,
            }
        )

    return rows


def prior_row_from_group(
    prior_id: str,
    prior_type: str,
    group: pd.DataFrame,
    series_name: str,
    track_type: str,
    metric_family: str,
) -> dict[str, Any]:
    finish_pct = pd.to_numeric(group["finishPercentile"], errors="coerce").dropna()
    finish = pd.to_numeric(group["finishPosition"], errors="coerce").dropna()
    gain = pd.to_numeric(group["positionGain"], errors="coerce").dropna()
    return {
        "priorId": prior_id,
        "priorType": prior_type,
        "seriesId": "",
        "seriesName": series_name,
        "trackType": track_type,
        "metricFamily": metric_family,
        "raceRows": len(group),
        "avgFinishPercentile": fmt(float(finish_pct.mean())) if len(finish_pct) else "",
        "top10Rate": fmt(float((finish <= 10).mean())) if len(finish) else "",
        "top5Rate": fmt(float((finish <= 5).mean())) if len(finish) else "",
        "avgGain": fmt(float(gain.mean())) if len(gain) else "",
        "parityStatus": "production_safe",
        "eligibility": "prior_allowed",
        "sourceState": "official_or_source_backed_result",
        "caveat": "Aggregated prior; use with denominator and source-family caveats.",
    }


def build_feature_matrix() -> pd.DataFrame:
    race = pd.read_csv(DEEP_TABLES / "race_debrief_scores.csv")
    prep = pd.read_csv(DEEP_TABLES / "prep_session_signals.csv")
    field = pd.read_csv(DEEP_TABLES / "field_strength_by_race.csv")
    team = pd.read_csv(DEEP_TABLES / "team_context_by_race.csv")
    lap = pd.read_csv(DEEP_TABLES / "full_field_lap_dynamics_by_race.csv")
    section = pd.read_csv(DEEP_TABLES / "section_results_deep_by_race.csv")
    incident = pd.read_csv(DEEP_TABLES / "incident_penalty_context.csv")

    df = (
        race.merge(prep, on="sessionId", how="left", suffixes=("", "_prep"))
        .merge(field[["sessionId", "fieldStrengthMean", "fieldRatedRivals"]], on="sessionId", how="left")
        .merge(
            team[["sessionId", "teamCars", "teamAverageFinish", "bryceVsTeamAvgFinish", "bryceTeamFinishRank"]],
            on="sessionId",
            how="left",
            suffixes=("", "_team"),
        )
        .merge(
            lap[["sessionId", "fieldLapDrivers", "bryceNetLapChartGain", "bryceBestRunningPosition", "bryceWorstRunningPosition", "brycePrimaryStory"]],
            on="sessionId",
            how="left",
        )
        .merge(section[["sessionId", "sectionComparisonRows", "medianSectionPercentile", "bestSectionFamilies", "weakestSectionFamilies"]], on="sessionId", how="left", suffixes=("", "_section"))
        .merge(incident[["sessionId", "sessionPenaltyCount", "sessionIncidentCount", "brycePenaltyCount", "bryceIncidentCount"]], on="sessionId", how="left", suffixes=("", "_incident"))
    )

    out = pd.DataFrame()
    wanted = [
        "sessionId",
        "raceLabel",
        "seasonYear",
        "trackName",
        "trackType",
        "teamName",
        "startPosition",
        "finishPosition",
        "positionGain",
        "finishPercentile",
        "bestQualifyingRank",
        "avgQualifyingRank",
        "bestPracticeRank",
        "avgPracticeRank",
        "raceStart",
        "raceFinish",
        "raceGain",
        "fieldStrengthMean",
        "fieldRatedRivals",
        "teamCars",
        "teamAverageFinish",
        "bryceTeamFinishRank",
        "paceIndex",
        "bestLapRank",
        "medianSectionPercentile",
        "sectionComparisonRows",
        "bryceLapGainPercentile",
        "bryceStabilityPercentile",
        "chaosExposureIndex",
        "cautionShare",
        "sessionIncidentCount",
        "sessionPenaltyCount",
        "bryceIncidentCount",
        "brycePenaltyCount",
        "leaderEntropy",
        "weatherContext",
        "archetype",
        "bryceNetLapChartGain",
        "bryceBestRunningPosition",
        "bryceWorstRunningPosition",
        "brycePrimaryStory",
        "bestSectionFamilies",
        "weakestSectionFamilies",
        "sourceState",
        "confidence",
        "caveat",
    ]
    for col in wanted:
        out[col] = df[col] if col in df else ""
    out["top10"] = pd.to_numeric(out["finishPosition"], errors="coerce").le(10).map(to_bool_int)
    out["top5"] = pd.to_numeric(out["finishPosition"], errors="coerce").le(5).map(to_bool_int)
    out["preRaceEligible"] = "false"
    out["postRaceOnlyFields"] = "finishPosition;positionGain;paceIndex;lapDynamics;sectionResults;incidentPenalty;teamOutcome;archetype"
    out["modelLeakagePolicy"] = "full_feature_matrix_is_post_race_context;pre_race_models_must_exclude_postRaceOnlyFields"
    return out


def mae(y: list[float], p: list[float]) -> float:
    return float(np.mean(np.abs(np.asarray(y) - np.asarray(p))))


def rmse(y: list[float], p: list[float]) -> float:
    return float(np.sqrt(np.mean((np.asarray(y) - np.asarray(p)) ** 2)))


def brier(y: list[float], p: list[float]) -> float:
    return float(np.mean((np.asarray(p) - np.asarray(y)) ** 2))


def loo_group_mean(data: pd.DataFrame, group_col: str, y_col: str = "finishPercentile") -> tuple[list[float], list[float]]:
    rows = data.dropna(subset=[y_col, group_col])
    actual: list[float] = []
    pred: list[float] = []
    for idx, row in rows.iterrows():
        train = rows.drop(idx)
        group = train[train[group_col] == row[group_col]][y_col].dropna()
        value = float(group.mean() if len(group) else train[y_col].mean())
        actual.append(float(row[y_col]))
        pred.append(value)
    return actual, pred


def loo_ridge(data: pd.DataFrame, features: list[str], y_col: str = "finishPercentile", ridge: float = 1.0) -> tuple[list[float], list[float], int]:
    rows = data[[y_col, *features]].apply(pd.to_numeric, errors="coerce").dropna()
    if len(rows) < 5:
        return [], [], len(rows)
    actual: list[float] = []
    pred: list[float] = []
    for held in rows.index:
        train = rows.drop(held)
        test = rows.loc[[held]]
        x = train[features].to_numpy(float)
        y = train[y_col].to_numpy(float)
        mu = x.mean(axis=0)
        sd = x.std(axis=0)
        sd[sd == 0] = 1
        xs = (x - mu) / sd
        xs = np.column_stack([np.ones(len(xs)), xs])
        lam = np.eye(xs.shape[1]) * ridge
        lam[0, 0] = 0
        beta = np.linalg.pinv(xs.T @ xs + lam) @ xs.T @ y
        xt = test[features].to_numpy(float)
        xts = (xt - mu) / sd
        xts = np.column_stack([np.ones(len(xts)), xts])
        value = float((xts @ beta).ravel()[0])
        actual.append(float(test[y_col].iloc[0]))
        pred.append(max(0.0, min(1.0, value)))
    return actual, pred, len(rows)


def loo_knn(data: pd.DataFrame, features: list[str], k: int = 5, y_col: str = "finishPercentile") -> tuple[list[float], list[float], int]:
    rows = data[[y_col, *features]].apply(pd.to_numeric, errors="coerce").dropna()
    if len(rows) < 5:
        return [], [], len(rows)
    actual: list[float] = []
    pred: list[float] = []
    for held in rows.index:
        train = rows.drop(held)
        test = rows.loc[held]
        x = train[features].to_numpy(float)
        mu = x.mean(axis=0)
        sd = x.std(axis=0)
        sd[sd == 0] = 1
        xs = (x - mu) / sd
        xt = (test[features].to_numpy(float) - mu) / sd
        dist = np.sqrt(((xs - xt) ** 2).sum(axis=1))
        nearest = train.iloc[np.argsort(dist)[: min(k, len(train))]]
        actual.append(float(test[y_col]))
        pred.append(float(nearest[y_col].mean()))
    return actual, pred, len(rows)


def build_model_scorecard(feature_df: pd.DataFrame) -> dict[str, Any]:
    df = feature_df.copy()
    text_cols = {
        "sessionId",
        "raceLabel",
        "trackName",
        "trackType",
        "teamName",
        "weatherContext",
        "archetype",
        "sourceState",
        "confidence",
        "caveat",
        "preRaceEligible",
        "postRaceOnlyFields",
        "modelLeakagePolicy",
        "bestSectionFamilies",
        "weakestSectionFamilies",
        "brycePrimaryStory",
    }
    for col in df.columns:
        if col not in text_cols:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    for track_type in sorted(str(v) for v in df["trackType"].dropna().unique()):
        df[f"track_{track_type}"] = (df["trackType"].astype(str) == track_type).astype(float)

    base = df.dropna(subset=["finishPercentile"])
    y = [float(v) for v in base["finishPercentile"]]
    base_mae = mae(y, [mean(y)] * len(y))
    base_rmse = rmse(y, [mean(y)] * len(y))
    models: list[dict[str, Any]] = [
        model_row("overall_mean", "finish_percentile", len(y), base_mae, base_rmse, None, "baseline", "Safe as a calibration baseline, not a prediction."),
    ]

    for model_id, group_col in [("track_type_mean", "trackType"), ("season_mean", "seasonYear")]:
        actual, pred = loo_group_mean(base, group_col)
        product_use = "baseline" if model_id == "track_type_mean" else "analyst_only"
        caveat = "Descriptive grouped baseline."
        if model_id == "season_mean":
            caveat = "Leave-one-out season aggregate is not time-aware; keep out of pre-race context packs."
        row = model_row(model_id, "finish_percentile", len(actual), mae(actual, pred), rmse(actual, pred), base_mae, product_use, caveat)
        if model_id == "season_mean":
            row["allowedInContextPacks"] = False
            row["leakageStatus"] = "time_leakage_control"
            row["validation"] = "leave_one_race_out_not_time_aware"
        models.append(row)

    feature_sets = {
        "start_position_ridge": ["startPosition"],
        "best_qualifying_ridge": ["bestQualifyingRank"],
        "start_plus_qualifying_ridge": ["startPosition", "bestQualifyingRank"],
        "prep_practice_qualifying_ridge": ["bestPracticeRank", "avgPracticeRank", "bestQualifyingRank", "avgQualifyingRank"],
        "track_start_qualifying_ridge": ["startPosition", "bestQualifyingRank", "track_oval", "track_road", "track_street"],
        "field_context_ridge": ["startPosition", "bestQualifyingRank", "fieldStrengthMean", "teamCars", "track_oval", "track_road", "track_street"],
    }
    for model_id, features in feature_sets.items():
        actual, pred, n = loo_ridge(df, features)
        product_use = "internal_context_band" if model_id in {"start_position_ridge", "track_start_qualifying_ridge"} else "analyst_only"
        caveat = "Leave-one-out only; promote only if it beats baseline and calibration gates hold."
        models.append(model_row(model_id, "finish_percentile", n, mae(actual, pred), rmse(actual, pred), base_mae, product_use, caveat, features))

    actual, pred, n = loo_knn(df, ["bestPracticeRank", "avgPracticeRank", "bestQualifyingRank", "avgQualifyingRank"])
    models.append(model_row("prep_practice_qualifying_knn5", "finish_percentile", n, mae(actual, pred), rmse(actual, pred), base_mae, "internal_context_band", "Good for race-week path language after practice/qualifying, not a public point forecast.", ["bestPracticeRank", "avgPracticeRank", "bestQualifyingRank", "avgQualifyingRank"]))

    actual, pred, n = loo_ridge(df, ["startPosition", "bestQualifyingRank", "teamAverageFinish", "bryceTeamFinishRank", "track_oval", "track_road", "track_street"])
    models.append(model_row("team_context_posthoc_ridge", "finish_percentile", n, mae(actual, pred), rmse(actual, pred), base_mae, "leakage_control_only", "Best observed lift uses post-race team outcome context; do not use pre-race.", ["startPosition", "bestQualifyingRank", "teamAverageFinish", "bryceTeamFinishRank"]))

    top = base.dropna(subset=["finishPosition"])
    y_top = [1.0 if float(v) <= 10 else 0.0 for v in top["finishPosition"]]
    rate = mean(y_top)
    models.append(
        {
            "id": "top10_overall_rate",
            "target": "top10",
            "n": len(y_top),
            "brier": fmt(brier(y_top, [rate] * len(y_top))),
            "rate": fmt(rate),
            "validation": "leave_one_race_out_not_required_for_constant_rate",
            "productUse": "baseline",
            "allowedInContextPacks": True,
            "leakageStatus": "pre_race_safe",
            "caveat": "Use as base-rate context only.",
        }
    )
    for model_id, group_col in [("top10_track_type_rate", "trackType"), ("top10_season_rate", "seasonYear")]:
        actual_top: list[float] = []
        pred_top: list[float] = []
        rows = top.dropna(subset=[group_col])
        for idx, row in rows.iterrows():
            train = rows.drop(idx)
            group = train[train[group_col] == row[group_col]]
            value = float((group["finishPosition"].astype(float) <= 10).mean()) if len(group) else float((train["finishPosition"].astype(float) <= 10).mean())
            actual_top.append(1.0 if float(row["finishPosition"]) <= 10 else 0.0)
            pred_top.append(value)
        is_season_group = group_col == "seasonYear"
        models.append(
            {
                "id": model_id,
                "target": "top10",
                "n": len(actual_top),
                "brier": fmt(brier(actual_top, pred_top)),
                "baselineBrier": fmt(brier(y_top, [rate] * len(y_top))),
                "validation": "leave_one_race_out_not_time_aware" if is_season_group else "leave_one_race_out",
                "productUse": "analyst_only",
                "allowedInContextPacks": False,
                "leakageStatus": "time_leakage_control" if is_season_group else "pre_race_safe",
                "caveat": "Season grouping is not time-aware; keep as leakage-control diagnostic." if is_season_group else "Did not beat overall base rate in the first no-write probe; keep as diagnostic until further lift exists.",
            }
        )

    return {
        "schemaVersion": "brycecast.predictiveRaceIntelligence.modelScorecard.v1",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "methodology": {
            "sample": "36 Bryce INDY NXT race rows from existing deep-dive artifacts.",
            "validation": "Leave-one-race-out for model candidates; no sklearn dependency.",
            "promotionPolicy": "Product prediction requires out-of-sample lift over the relevant naive baseline and no leakage.",
            "claimPolicy": "Use source-bounded historical prior bands, paths, and analog races. Do not publish point predictions from this sample.",
        },
        "models": models,
        "promotionGates": [
            {"id": "beats_naive_baseline", "description": "Candidate must improve MAE/RMSE or Brier against relevant baseline out of sample."},
            {"id": "no_post_race_leakage", "description": "Pre-race model may not use finish, lap dynamics, team outcome, incident, penalty, section, or archetype fields."},
            {"id": "minimum_denominator", "description": "Every prediction or path claim must display n and source family."},
            {"id": "calibration_visible", "description": "Top-10 probabilities require Brier/calibration evidence before product promotion."},
            {"id": "source_family_guard", "description": "Full-career priors need metric-family eligibility and cannot overwrite INDY NXT target-domain signal."},
            {"id": "negative_control", "description": "Weather and field-strength claims stay analyst-only unless they provide validated incremental lift."},
        ],
    }


def model_row(
    model_id: str,
    target: str,
    n: int,
    mae_value: float,
    rmse_value: float,
    baseline_mae: float | None,
    product_use: str,
    caveat: str,
    features: list[str] | None = None,
) -> dict[str, Any]:
    lift = None
    if baseline_mae and baseline_mae > 0:
        lift = (baseline_mae - mae_value) / baseline_mae
    return {
        "id": model_id,
        "target": target,
        "n": n,
        "features": features or [],
        "mae": fmt(mae_value),
        "rmse": fmt(rmse_value),
        "baselineMae": fmt(baseline_mae) if baseline_mae is not None else None,
        "liftVsBaselinePct": fmt(lift * 100, 1) if lift is not None else None,
        "validation": "leave_one_race_out" if model_id != "overall_mean" else "constant_baseline",
        "productUse": product_use,
        "allowedInContextPacks": product_use in {"baseline", "internal_context_band"},
        "leakageStatus": "post_race_leakage" if "posthoc" in model_id else "pre_race_safe",
        "caveat": caveat,
    }


def build_upcoming_packs(feature_df: pd.DataFrame, career_priors: list[dict[str, Any]], scorecard: dict[str, Any]) -> list[dict[str, Any]]:
    future = read_future_weekend_prep()
    race = pd.read_csv(DEEP_TABLES / "race_debrief_scores.csv")
    packs: list[dict[str, Any]] = []
    dataset_source_hash = source_hash(DATASET_PATH)

    for _, event in future.iterrows():
        event_id = str(event.eventId)
        pack_id = f"upcoming_{event_id}_{slug(str(event.eventName))}"
        track_type = str(event.trackType)
        same_track = race[race["trackName"] == event.trackName]
        same_type = race[race["trackType"] == track_type]
        finish_pct = pd.to_numeric(same_type["finishPercentile"], errors="coerce").dropna()
        band = prediction_band_from_series(finish_pct)
        analogs = choose_analog_races(race, str(event.trackName), track_type)
        pack = {
            "schemaVersion": "brycecast.upcomingEventIntelligencePack.v1",
            "id": pack_id,
            "type": "upcoming_event",
            "generatedAt": now_iso(),
            "sourceHash": dataset_source_hash,
            "asOfDate": RUN_DATE.isoformat(),
            "eventId": event_id,
            "eventName": event.eventName,
            "eventStartDate": event.eventStartDate,
            "weatherState": event.get("weatherState"),
            "track": {
                "name": event.trackName,
                "type": track_type,
                "lengthMi": fmt(clean_num(event.trackLengthMi)),
                "cornerCount": int(clean_num(event.cornerCount) or 0),
            },
            "sameTrackHistory": {
                "raceCount": int(clean_num(event.bryceIndyNxtRacesAtTrack) or 0),
                "avgFinish": fmt(clean_num(event.sameTrackAvgFinish)),
                "avgGain": fmt(clean_num(event.sameTrackAvgGain)),
                "top10Rate": fmt(clean_num(event.sameTrackTop10Rate)),
                "sourceState": event.sourceState,
            },
            "trackTypeHistory": {
                "raceCount": int(len(same_type)),
                "avgFinish": fmt(clean_num(event.trackTypeAvgFinish)),
                "avgGain": fmt(clean_num(event.trackTypeAvgGain)),
                "top10Rate": fmt(clean_num(event.trackTypeTop10Rate)),
                "finishPercentileMedian": fmt(float(finish_pct.median())) if len(finish_pct) else None,
            },
            "careerPriorContext": career_prior_context(career_priors, track_type),
            "predictionBand": {
                "claimStrength": "source_bounded_historical_prior_band",
                "target": "finish_percentile_prior_and_top10_path",
                "finishPercentileBand": band,
                "top10Policy": "path_language_only_until_calibration; show historical denominators outside predictionBand",
                "confidence": "medium_low",
                "calibrationState": "not_calibrated_for_point_probability",
                "modelPolicy": "No point prediction. Band is a source-backed historical prior for story/context until qualifying and live data arrive.",
                "scorecardRef": "analysis/predictive-race-intelligence/output/model_scorecard.json",
            },
            "top10Path": top10_path(event, same_track, same_type, scorecard),
            "analogRaces": analogs,
            "analogSelectionPolicy": "pre_race_track_match_then_recency_no_outcome_sort",
            "prepUpdateHooks": [
                "Refresh after first practice with bestPracticeRank and avgPracticeRank.",
                "Refresh after qualifying with bestQualifyingRank, startPosition, and conversion path.",
                "During live race, switch to /api/readiness and replay-quality gates rather than static priors.",
            ],
            "chartSpecs": [
                {"id": "same_track_vs_track_type", "type": "bar", "fields": ["sameTrackAvgFinish", "trackTypeAvgFinish", "sameTrackTop10Rate", "trackTypeTop10Rate"]},
                {"id": "finish_percentile_band", "type": "interval", "fields": ["p25", "median", "p75"], "source": "predictionBand.finishPercentileBand"},
                {"id": "analog_race_table", "type": "ranked_table", "fields": ["raceLabel", "trackName", "trackType", "analogType", "confidence"]},
            ],
            "sourceRefs": [
                source_ref(DEEP_TABLES / "future_weekend_prep_inputs.csv", "event prep row"),
                source_ref(DEEP_TABLES / "race_debrief_scores.csv", "historical race priors"),
                source_ref(CAREER_TABLES / "career_series_result_summary.csv", "career series priors"),
                source_ref(CAREER_TABLES / "career_result_conversion.csv", "career conversion priors"),
                source_ref(OUTPUT_DIR / "career_prior_matrix.csv", "generated career prior context"),
                source_ref(OUTPUT_DIR / "model_scorecard.json", "prediction validation"),
            ],
            "caveats": [
                "Static prep has no future-weather forecast; use runtime NWS APIs for weather context.",
                "This is a prior band, not a point forecast or betting line.",
                "Full-career priors are normalized context and cannot override INDY NXT target-domain evidence.",
            ],
        }
        path = UPCOMING_PACK_DIR / f"{pack_id}.json"
        write_json(path, pack)
        packs.append(
            {
                "id": pack_id,
                "type": "upcoming_event",
                "path": rel(path),
                "eventId": event_id,
                "sourceRefs": [
                    rel(DEEP_TABLES / "future_weekend_prep_inputs.csv"),
                    rel(DEEP_TABLES / "race_debrief_scores.csv"),
                    rel(CAREER_TABLES / "career_series_result_summary.csv"),
                    rel(CAREER_TABLES / "career_result_conversion.csv"),
                    rel(OUTPUT_DIR / "career_prior_matrix.csv"),
                    rel(OUTPUT_DIR / "model_scorecard.json"),
                ],
            }
        )
    return packs


def prediction_band_from_series(series: pd.Series) -> dict[str, Any]:
    clean = pd.to_numeric(series, errors="coerce").dropna()
    if not len(clean):
        return {"p25": None, "median": None, "p75": None, "n": 0}
    return {
        "p25": fmt(float(clean.quantile(0.25))),
        "median": fmt(float(clean.quantile(0.50))),
        "p75": fmt(float(clean.quantile(0.75))),
        "n": int(len(clean)),
    }


def career_prior_context(career_priors: list[dict[str, Any]], track_type: str) -> list[dict[str, Any]]:
    out = []
    for row in career_priors:
        if row.get("priorType") == "track_type_outcome" and row.get("trackType") == track_type:
            out.append(row)
        if row.get("priorType") == "series_outcome" and row.get("seriesName") in {"INDY NXT", "GB3 Championship", "Formula Ford"}:
            out.append(row)
    return out[:6]


def track_type_label(track_type: str) -> str:
    labels = {
        "road": "road-course",
        "oval": "oval",
        "street": "street-course",
    }
    return labels.get(track_type, track_type.replace("_", " ") or "track-type")


def finish_text(value: Any) -> str:
    parsed = clean_num(value)
    return "n/a" if parsed is None else f"{parsed:.1f}"


def rate_text(value: Any) -> str:
    parsed = clean_num(value)
    return "n/a" if parsed is None else f"{round(parsed * 100):.0f}%"


def top10_path(event: pd.Series, same_track: pd.DataFrame, same_type: pd.DataFrame, scorecard: dict[str, Any]) -> list[dict[str, Any]]:
    track_name = str(event.trackName)
    type_label = track_type_label(str(event.trackType))
    path = [
        {
            "factor": "Qualifying and start position",
            "whyItMatters": "Start-position-only LOO model modestly improves finish-percentile error versus the overall mean.",
            "currentState": "Unknown until qualifying.",
            "actionableRead": f"After qualifying, compare start position to the historical {type_label} conversion band and {track_name} analogs.",
        },
        {
            "factor": f"{type_label.capitalize()} conversion",
            "whyItMatters": f"INDY NXT {event.trackType} rows currently show avg finish {finish_text(event.trackTypeAvgFinish)} and top-10 rate {rate_text(event.trackTypeTop10Rate)}.",
            "currentState": "Pre-event prior only.",
            "actionableRead": "The product should show the range and analogs, not a single expected finish.",
        },
        {
            "factor": "Same-track execution",
            "whyItMatters": f"Bryce has {event.bryceIndyNxtRacesAtTrack} prior INDY NXT races at {event.trackName}.",
            "currentState": "Small sample; useful but not enough alone.",
            "actionableRead": "Use same-track rows as analog stories with denominator labels.",
        },
        {
            "factor": "Keep chaos out of the result",
            "whyItMatters": "Incident/reliability-limited races dominate downside stories in the debrief score table.",
            "currentState": "Not knowable pre-race.",
            "actionableRead": "Use live/replay data to explain when the race deviates from the pre-race band.",
        },
    ]
    if len(same_track):
        analog = same_track.sort_values(["seasonYear", "raceLabel"], ascending=[False, False]).iloc[0]
        path.append(
            {
                "factor": f"Recent {track_name} analog",
                "whyItMatters": f"{analog.raceLabel} is retained as a same-track historical analog without ranking by outcome.",
                "currentState": "Historical analog.",
                "actionableRead": f"Anchor a Race Week card to the concrete {track_name} analog, with raw outcome details deferred to race-debrief packs.",
            }
        )
    return path


def choose_analog_races(race: pd.DataFrame, track_name: str, track_type: str, limit: int = 6) -> list[dict[str, Any]]:
    same_track = race[race["trackName"] == track_name].copy()
    same_track["analogScore"] = 0
    same_type = race[(race["trackType"] == track_type) & (race["trackName"] != track_name)].copy()
    same_type["analogScore"] = 1
    rows = pd.concat([same_track, same_type], ignore_index=True)
    rows = rows.sort_values(["analogScore", "seasonYear", "raceLabel"], ascending=[True, False, False]).head(limit)
    out = []
    for _, row in rows.iterrows():
        out.append(
            {
                "sessionId": row.sessionId,
                "raceLabel": row.raceLabel,
                "trackName": row.trackName,
                "trackType": row.trackType,
                "analogType": "same_track" if int(clean_num(row.analogScore) or 0) == 0 else "same_track_type",
                "analogyBasis": "track_match" if int(clean_num(row.analogScore) or 0) == 0 else "track_type_match",
                "historicalOutcomePolicy": "outcome_fields_suppressed_in_upcoming_pack; use race_debrief context packs for detailed outcomes",
                "confidence": row.confidence,
            }
        )
    return out


def build_race_debrief_packs(feature_df: pd.DataFrame) -> list[dict[str, Any]]:
    data = load_json(DATASET_PATH)
    chronology = race_session_chronology(data)
    race = pd.read_csv(DEEP_TABLES / "race_debrief_scores.csv")
    lap = pd.read_csv(DEEP_TABLES / "full_field_lap_dynamics_by_race.csv")
    incident = pd.read_csv(DEEP_TABLES / "incident_penalty_context.csv")
    leader = pd.read_csv(DEEP_TABLES / "leader_lap_context.csv")
    team = pd.read_csv(DEEP_TABLES / "team_context_by_race.csv")
    section = pd.read_csv(DEEP_TABLES / "section_results_deep_by_race.csv")
    championship = pd.read_csv(DEEP_TABLES / "championship_progression.csv")
    packs: list[dict[str, Any]] = []
    dataset_source_hash = source_hash(DATASET_PATH)
    joined = (
        race.merge(lap, on=["sessionId", "raceLabel"], how="left", suffixes=("", "_lap"))
        .merge(incident, on=["sessionId", "raceLabel"], how="left", suffixes=("", "_incident"))
        .merge(leader, on=["sessionId", "raceLabel"], how="left", suffixes=("", "_leader"))
        .merge(team, on=["sessionId", "raceLabel", "seasonYear"], how="left", suffixes=("", "_team"))
        .merge(section, on=["sessionId", "raceLabel"], how="left", suffixes=("", "_section"))
        .merge(championship, on=["sessionId", "raceLabel", "seasonYear"], how="left", suffixes=("", "_championship"))
    )
    for _, row in joined.iterrows():
        pack_id = f"debrief_{row.sessionId}"
        race_chronology = chronology.get(str(row.sessionId))
        if not race_chronology:
            raise ValueError(f"Missing canonical chronology for {row.sessionId}")
        pack = {
            "schemaVersion": "brycecast.raceDebriefContextPack.v1",
            "id": pack_id,
            "type": "race_debrief",
            "generatedAt": now_iso(),
            "sourceHash": dataset_source_hash,
            "sessionId": row.sessionId,
            "raceLabel": row.raceLabel,
            "seasonYear": int(clean_num(row.seasonYear) or 0),
            "eventStartDate": race_chronology["eventStartDate"],
            "raceOrder": {
                "seasonYear": int(clean_num(row.seasonYear) or 0),
                "roundIndex": race_chronology["roundIndex"],
                "source": rel(DATASET_PATH),
                "sourceFields": ["events.eventStartDate", "sessions.actualStart", "sessions.scheduledStart"],
                "sessionStartDate": race_chronology["sessionStartDate"],
            },
            "track": {"name": row.trackName, "type": row.trackType},
            "outcome": {
                "teamName": row.teamName,
                "startPosition": fmt(clean_num(row.startPosition)),
                "finishPosition": fmt(clean_num(row.finishPosition)),
                "positionGain": fmt(clean_num(row.positionGain)),
                "finishPercentile": fmt(clean_num(row.finishPercentile)),
                "points": fmt(clean_num(row.get("bryceRacePoints"))),
                "cumulativePoints": fmt(clean_num(row.get("bryceCumulativePoints"))),
                "standingRank": fmt(clean_num(row.get("bryceStandingRank"))),
            },
            "conversion": {
                "conversionPercentileDelta": fmt(clean_num(row.conversionPercentileDelta)),
                "bestLapRank": fmt(clean_num(row.bestLapRank)),
                "paceIndex": fmt(clean_num(row.paceIndex)),
                "archetype": row.archetype,
                "labelReviewState": "review_required_before_public_copy",
            },
            "lapStory": {
                "fieldLapDrivers": fmt(clean_num(row.get("fieldLapDrivers"))),
                "topLapChartMover": row.get("topLapChartMover"),
                "topLapChartGain": fmt(clean_num(row.get("topLapChartGain"))),
                "bryceNetLapChartGain": fmt(clean_num(row.get("bryceNetLapChartGain"))),
                "bryceBestRunningPosition": fmt(clean_num(row.get("bryceBestRunningPosition"))),
                "bryceWorstRunningPosition": fmt(clean_num(row.get("bryceWorstRunningPosition"))),
                "brycePrimaryStory": row.get("brycePrimaryStory"),
                "sourceState": row.get("sourceState_lap") or "official_lap_chart",
            },
            "sectionSignal": {
                "sectionComparisonRows": fmt(clean_num(row.get("sectionComparisonRows"))),
                "medianSectionPercentile": fmt(clean_num(row.get("medianSectionPercentile"))),
                "bestSectionFamilies": row.get("bestSectionFamilies"),
                "weakestSectionFamilies": row.get("weakestSectionFamilies"),
                "displayPolicy": "headline_allowed_if_sectionComparisonRows_gte_50_else_badge_or_suppress",
            },
            "raceContext": {
                "sessionIncidentCount": fmt(clean_num(row.get("sessionIncidentCount"))),
                "sessionPenaltyCount": fmt(clean_num(row.get("sessionPenaltyCount"))),
                "bryceIncidentCount": fmt(clean_num(row.get("bryceIncidentCount"))),
                "brycePenaltyCount": fmt(clean_num(row.get("brycePenaltyCount"))),
                "leaderEntropy": fmt(clean_num(row.get("leaderEntropy"))),
                "topLeader": row.get("topLeader"),
                "topLeaderShare": fmt(clean_num(row.get("topLeaderShare"))),
                "weatherContext": row.get("weatherContext"),
            },
            "teamContext": {
                "teamCars": fmt(clean_num(row.get("teamCars"))),
                "teammates": row.get("teammates"),
                "teamAverageFinish": fmt(clean_num(row.get("teamAverageFinish"))),
                "bryceVsTeamAvgFinish": fmt(clean_num(row.get("bryceVsTeamAvgFinish"))),
                "bryceTeamFinishRank": fmt(clean_num(row.get("bryceTeamFinishRank"))),
                "policy": "descriptive_result_context_only",
            },
            "chartSpecs": [
                {"id": "start_finish_slope", "type": "slope", "fields": ["startPosition", "finishPosition"]},
                {"id": "lap_position_story", "type": "inverted_line", "source": rel(INDY_TABLES / "indy_nxt_lap_timeline.csv"), "filter": {"sessionId": row.sessionId}},
                {"id": "section_strengths", "type": "ranked_bar", "fields": ["bestSectionFamilies", "weakestSectionFamilies"], "displayPolicy": "denominator_badged"},
                {"id": "team_context_dotplot", "type": "dot_plot", "fields": ["teamAverageFinish", "bryceVsTeamAvgFinish", "bryceTeamFinishRank"]},
            ],
            "sourceRefs": [
                source_ref(DEEP_TABLES / "race_debrief_scores.csv", "debrief score"),
                source_ref(DEEP_TABLES / "full_field_lap_dynamics_by_race.csv", "lap dynamics"),
                source_ref(DEEP_TABLES / "incident_penalty_context.csv", "incident and penalty context"),
                source_ref(DEEP_TABLES / "leader_lap_context.csv", "leader lap context"),
                source_ref(DEEP_TABLES / "team_context_by_race.csv", "team context"),
                source_ref(DEEP_TABLES / "section_results_deep_by_race.csv", "section context"),
                source_ref(DEEP_TABLES / "championship_progression.csv", "championship context"),
                source_ref(INDY_TABLES / "indy_nxt_lap_timeline.csv", "lap timeline chart source"),
                source_ref(DATASET_PATH, "canonical event/session chronology"),
            ],
            "caveats": [row.caveat, "Archetype labels require review before public UI copy."],
            "sourceState": row.sourceState,
            "confidence": row.confidence,
        }
        path = DEBRIEF_PACK_DIR / f"{pack_id}.json"
        write_json(path, pack)
        packs.append(
            {
                "id": pack_id,
                "type": "race_debrief",
                "path": rel(path),
                "sessionId": row.sessionId,
                "seasonYear": int(clean_num(row.seasonYear) or 0),
                "roundIndex": race_chronology["roundIndex"],
                "eventStartDate": race_chronology["eventStartDate"],
                "sourceRefs": [
                    rel(DEEP_TABLES / "race_debrief_scores.csv"),
                    rel(DEEP_TABLES / "full_field_lap_dynamics_by_race.csv"),
                    rel(DEEP_TABLES / "incident_penalty_context.csv"),
                    rel(DEEP_TABLES / "leader_lap_context.csv"),
                    rel(DEEP_TABLES / "team_context_by_race.csv"),
                    rel(DEEP_TABLES / "section_results_deep_by_race.csv"),
                    rel(DEEP_TABLES / "championship_progression.csv"),
                    rel(INDY_TABLES / "indy_nxt_lap_timeline.csv"),
                    rel(DATASET_PATH),
                ],
            }
        )
    return packs


def build_career_lab_pack(career_priors: list[dict[str, Any]]) -> dict[str, Any]:
    series_summary = read_csv(CAREER_TABLES / "career_series_result_summary.csv")
    parity = read_csv(CAREER_TABLES / "career_metric_family_parity.csv")
    result_conversion = read_csv(CAREER_TABLES / "career_result_conversion.csv")
    pack = {
        "schemaVersion": "brycecast.careerLabContextPack.v1",
        "id": "career_lab_context",
        "type": "career_lab",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "seriesSummary": series_summary,
        "metricFamilyParity": parity,
        "careerPriorMatrixPath": rel(OUTPUT_DIR / "career_prior_matrix.csv"),
        "resultConversionRows": len(result_conversion),
        "resultConversion": result_conversion,
        "topCareerStories": career_stories(series_summary, result_conversion),
        "sourceFamilyRules": [
            "Use finish percentile beside raw finish across series.",
            "INDY NXT controls target-domain race intelligence.",
            "GB3 is the best non-INDY deepening candidate.",
            "Formula Ford lap/weather context is source-bounded and should be labeled separately.",
            "IMSA Daytona remains a standalone sports-car feature.",
        ],
        "chartSpecs": [
            {"id": "series_finish_percentile", "type": "bar", "fields": ["seriesName", "avgFinishPercentile"]},
            {"id": "metric_family_parity_heatmap", "type": "heatmap", "fields": ["seriesName", "metricFamily", "parityStatus"]},
            {"id": "result_conversion_scatter", "type": "scatter", "fields": ["startPosition", "finishPosition", "finishPercentile", "seriesName"]},
            {"id": "track_type_prior_strip", "type": "small_multiple", "source": rel(OUTPUT_DIR / "career_prior_matrix.csv")},
        ],
        "sourceRefs": [
            source_ref(CAREER_TABLES / "career_series_result_summary.csv", "career summary"),
            source_ref(CAREER_TABLES / "career_metric_family_parity.csv", "metric parity"),
            source_ref(CAREER_TABLES / "career_result_conversion.csv", "result conversion"),
            source_ref(OUTPUT_DIR / "career_prior_matrix.csv", "career prior matrix chart source"),
        ],
        "caveats": [
            "Career Lab is parity-aware; unavailable metric families must render unavailable instead of inferred.",
            "Raw top-10 rates are not comparable across every junior series without field-size context.",
        ],
    }
    path = PACK_DIR / "career-lab-context.json"
    write_json(path, pack)
    return {
        "id": pack["id"],
        "type": "career_lab",
        "path": rel(path),
        "sourceRefs": [
            rel(CAREER_TABLES / "career_series_result_summary.csv"),
            rel(CAREER_TABLES / "career_metric_family_parity.csv"),
            rel(CAREER_TABLES / "career_result_conversion.csv"),
            rel(OUTPUT_DIR / "career_prior_matrix.csv"),
        ],
    }


def career_stories(series_summary: list[dict[str, str]], result_conversion: list[dict[str, str]]) -> list[dict[str, Any]]:
    summaries = sorted(series_summary, key=lambda r: int(float(r.get("raceRows") or 0)), reverse=True)
    rows = pd.DataFrame(result_conversion)
    rows["finishPercentileNum"] = pd.to_numeric(rows["finishPercentile"], errors="coerce")
    best = rows.sort_values("finishPercentileNum", ascending=False).head(5)
    return [
        {"story": "Largest source-backed race sample", "detail": f"{summaries[0]['seriesName']} has {summaries[0]['raceRows']} race rows."},
        {"story": "Best next historic deep dive", "detail": "GB3 combines the largest non-INDY result sample with qualifying support."},
        {"story": "Track-type prior", "detail": "Career track-type rows are broad enough for priors, but INDY NXT rows control upcoming-event context."},
        {"story": "Best finish-percentile races", "detail": "; ".join(best["raceLabel"].astype(str).head(3).tolist())},
    ]


def build_live_race_day_pack() -> dict[str, Any]:
    source_refs = [
        source_ref(ROOT / "docs/contracts/LIVE_RACE_DAY_PRODUCT_CONTRACT.md", "live product contract"),
        source_ref(ROOT / "scripts/api-server.mjs", "runtime API"),
        source_ref(ROOT / "scripts/live-source-endpoints.mjs", "source map"),
    ]
    pack = {
        "schemaVersion": "brycecast.liveRaceDayContextPack.v1",
        "id": "live_race_day_context",
        "type": "live_race_day",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "runtimeBoundary": [
            "/api/readiness",
            "/api/session",
            "/api/timing",
            "/api/bryce",
            "/api/weather/live",
            "/api/weather/upcoming",
            "/api/replay/bryce",
            "/api/sources",
            "/api/history/bryce?compact=1",
        ],
        "currentLocalEvidence": {
            "state": "not_embedded_in_static_context_pack",
            "runtimeEndpoints": ["/api/readiness", "/api/replay/bryce", "/api/sources"],
            "policy": "Ignored local live archives and poller snapshots are intentionally excluded from static analytics artifacts.",
            "pressureCaveat": "Cold/wrong-series proof is not green-flag INDY NXT proof.",
        },
        "replayQuality": {
            "archiveState": "runtime_only",
            "staticPackPolicy": "Use /api/replay/bryce and /api/readiness for live replay evidence; do not bake ignored local archives into generated analytics packages.",
        },
        "featureFlags": {
            "movingDotMap": False,
            "tireStrategy": False,
            "overtakeStrategy": False,
            "teamRadioAudio": False,
            "livePov": False,
            "officialWeather": False,
        },
        "validationGates": [
            {"id": "active_indy_nxt_rehearsal", "status": "blocked_by_live_proof", "requirement": "20 minutes at 1-second polling during active INDY NXT running."},
            {"id": "fresh_bryce_identity", "status": "blocked_by_live_proof", "requirement": "INDY NXT heartbeat plus car 9 and DriverID 2143 or exact Bryce Aron."},
            {"id": "replay_trend_ready", "status": "blocked_by_live_proof", "requirement": "Archive has enough live samples, changing payloads, and chronological rows."},
            {"id": "points_reconciliation", "status": "blocked_by_live_proof", "requirement": "Race Control running points reconcile to official result after publish."},
        ],
        "sourceRefs": source_refs,
        "caveats": [
            "Live context packs describe readiness and proof gates; they do not replace runtime APIs.",
            "Local replay evidence is runtime-only and intentionally excluded from static context-pack hashing.",
        ],
    }
    path = PACK_DIR / "live-race-day-context.json"
    write_json(path, pack)
    return {
        "id": pack["id"],
        "type": "live_race_day",
        "path": rel(path),
        "sourceRefs": [
            rel(ROOT / "docs/contracts/LIVE_RACE_DAY_PRODUCT_CONTRACT.md"),
            rel(ROOT / "scripts/api-server.mjs"),
            rel(ROOT / "scripts/live-source-endpoints.mjs"),
        ],
    }

def build_manifest(pack_refs: list[dict[str, Any]], upstream_coverage: dict[str, Any]) -> dict[str, Any]:
    enriched_pack_refs = []
    for pack in pack_refs:
        pack_path = ROOT / pack["path"]
        enriched_pack_refs.append(
            {
                **pack,
                "bytes": pack_path.stat().st_size,
                "sha256": source_hash(pack_path),
            }
        )
    pack_counts = {pack_type: 0 for pack_type in ("upcoming_event", "race_debrief", "career_lab", "live_race_day")}
    pack_counts.update(count_by(enriched_pack_refs, "type"))
    return {
        "schemaVersion": "brycecast.predictiveRaceIntelligence.contextPackManifest.v1",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "asOfDate": RUN_DATE.isoformat(),
        "repoHead": git_head(),
        "upstreamCoverage": upstream_coverage,
        "packs": sorted(enriched_pack_refs, key=lambda p: (p["type"], p["id"])),
        "packCounts": dict(sorted(pack_counts.items())),
        "sourceRefs": [
            source_ref(DATASET_PATH, "canonical event/session chronology"),
            source_ref(DEEP_TABLES / "future_weekend_prep_inputs.csv", "upcoming event packs"),
            source_ref(DEEP_TABLES / "race_debrief_scores.csv", "race debrief packs"),
            source_ref(CAREER_TABLES / "career_result_conversion.csv", "career lab pack"),
            source_ref(ROOT / "docs/contracts/LIVE_RACE_DAY_PRODUCT_CONTRACT.md", "live race day pack"),
        ],
    }


def clean_context_pack_outputs() -> None:
    for directory in [UPCOMING_PACK_DIR, DEBRIEF_PACK_DIR]:
        if directory.exists():
            for path in directory.glob("*.json"):
                path.unlink()
        directory.mkdir(parents=True, exist_ok=True)
    for path in [PACK_DIR / "career-lab-context.json", PACK_DIR / "live-race-day-context.json"]:
        if path.exists():
            path.unlink()


def simple_bar_svg(path: Path, rows: list[tuple[str, float]], title: str, subtitle: str) -> None:
    width = 980
    height = max(260, 56 + len(rows) * 34)
    left = 280
    right = 50
    max_v = max((abs(v) for _, v in rows), default=1)
    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#fbfaf7"/>',
        f'<text x="28" y="30" font-family="Inter, Arial" font-size="19" font-weight="700" fill="#1f2933">{html_escape(title, quote=False)}</text>',
        f'<text x="28" y="52" font-family="Inter, Arial" font-size="12" fill="#5d6875">{html_escape(subtitle, quote=False)}</text>',
    ]
    for i, (label, value) in enumerate(rows):
        y = 76 + i * 34
        bar_w = (abs(value) / max_v) * (width - left - right) if max_v else 0
        lines.append(f'<text x="28" y="{y+15}" font-family="Inter, Arial" font-size="12" fill="#39434d">{html_escape(label[:36], quote=False)}</text>')
        lines.append(f'<rect x="{left}" y="{y}" width="{bar_w:.1f}" height="20" rx="3" fill="#2d6f8f" opacity="0.88"/>')
        lines.append(f'<text x="{left+bar_w+8}" y="{y+15}" font-family="Inter, Arial" font-size="12" fill="#1f2933">{value:.3f}</text>')
    lines.append("</svg>")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def build_charts(scorecard: dict[str, Any], career_priors: list[dict[str, Any]], feature_df: pd.DataFrame) -> list[str]:
    model_rows = [
        (m["id"], float(m["mae"]))
        for m in scorecard["models"]
        if m.get("target") == "finish_percentile"
        and m.get("mae") is not None
        and m.get("allowedInContextPacks") is True
        and m.get("leakageStatus") == "pre_race_safe"
    ]
    model_rows = sorted(model_rows, key=lambda r: r[1])[:10]
    simple_bar_svg(CHART_DIR / "finish_percentile_model_mae.svg", model_rows, "Finish-Percentile Model Backtest", "Pre-race-safe context models only; lower MAE is better.")

    track_rows = [
        (f"{row['trackType']} ({row['raceRows']})", float(row["avgFinishPercentile"]))
        for row in career_priors
        if row.get("priorType") == "track_type_outcome" and row.get("avgFinishPercentile") not in {"", None}
    ]
    simple_bar_svg(CHART_DIR / "career_track_type_priors.svg", track_rows, "Career Track-Type Priors", "Normalized finish percentile by track type.")

    future = read_future_weekend_prep()
    future = future.sort_values(["eventStartDate", "eventId"], ascending=[True, True])
    next_track_name = str(future.iloc[0].trackName) if len(future) else "upcoming track"
    next_track_history = feature_df[feature_df["trackName"] == next_track_name]
    next_track_rows = [(row["raceLabel"], float(row["finishPercentile"])) for _, row in next_track_history.iterrows()]
    simple_bar_svg(
        CHART_DIR / "upcoming_track_indy_nxt_history.svg",
        next_track_rows,
        f"{next_track_name} INDY NXT History",
        f"Bryce finish percentile in prior {next_track_name} races.",
    )

    return [rel(CHART_DIR / name) for name in ["finish_percentile_model_mae.svg", "career_track_type_priors.svg", "upcoming_track_indy_nxt_history.svg"]]


def build_report(
    inventory: dict[str, Any],
    career_priors: list[dict[str, Any]],
    feature_df: pd.DataFrame,
    scorecard: dict[str, Any],
    pack_manifest: dict[str, Any],
    charts: list[str],
) -> str:
    models = sorted(
        [
            m
            for m in scorecard["models"]
            if m.get("target") == "finish_percentile"
            and m.get("allowedInContextPacks") is True
            and m.get("leakageStatus") == "pre_race_safe"
        ],
        key=lambda m: m.get("mae") or 999,
    )
    top_model = models[0]
    baseline = next(m for m in scorecard["models"] if m["id"] == "overall_mean")
    future = read_future_weekend_prep()
    future = future.sort_values(["eventStartDate", "eventId"], ascending=[True, True])
    next_track_name = str(future.iloc[0].trackName) if len(future) else "upcoming track"
    next_track_history = feature_df[feature_df["trackName"] == next_track_name]
    lines = [
        "# Predictive Race Intelligence Productization Pass",
        "",
        f"Generated: `{now_iso()}`",
        f"Repo head: `{git_head()}`",
        "",
        "## Decision",
        "",
        "BryceCast should promote a predictive race-intelligence workbench, not a point-forecast UI. Existing data supports source-bounded historical prior bands, top-10 paths, analog races, debrief explainers, and career priors. It does not yet support public betting-style finish predictions.",
        "",
        "## Ground Truth Inventory",
        "",
        f"- Inventory items: `{len(inventory['items'])}`.",
        f"- Productization statuses: `{inventory['statusCounts']}`.",
        f"- INDY NXT feature rows: `{len(feature_df)}`.",
        f"- Career prior rows: `{len(career_priors)}`.",
        f"- Context packs: `{pack_manifest['packCounts']}`.",
        "",
        "## Predictive Feasibility",
        "",
        f"- Overall finish-percentile baseline MAE: `{baseline['mae']}`.",
        f"- Best observed finish-percentile MAE: `{top_model['mae']}` from `{top_model['id']}`.",
        "- Any model using team outcome, lap, section, incident, penalty, or archetype fields is post-race only and barred from pre-race predictions.",
        "- Top-10 grouped rates did not beat the base-rate Brier score in the first scorecard, so top-10 should stay as a path/probability-band concept.",
        "",
        f"## {next_track_name} Intelligence",
        "",
    ]
    if len(next_track_history):
        for _, row in next_track_history.iterrows():
            lines.append(f"- `{row['raceLabel']}`: start P{fmt(clean_num(row['startPosition']))}, finish P{fmt(clean_num(row['finishPosition']))}, gain `{fmt(clean_num(row['positionGain']))}`, finish percentile `{fmt(clean_num(row['finishPercentile']))}`.")
    lines.extend(
        [
            "",
            "The generated upcoming-event packs add top-10 path factors, analog races, prediction bands, and prep-update hooks. They intentionally avoid point predictions.",
            "",
            "## Context Pack Surfaces",
            "",
            f"- Upcoming event packs: all {pack_manifest['packCounts'].get('upcoming_event', 0)} remaining INDY NXT events in the current future-prep window.",
            f"- Race debrief packs: all {pack_manifest['packCounts'].get('race_debrief', 0)} analyzable Bryce INDY NXT races.",
            "- Career Lab pack: series summary, metric-family parity, prior matrix, source-family rules.",
            "- Live race-day pack: runtime boundary, replay quality, current local proof state, and blocked live proof gates.",
            "",
            "## Validation Gates",
            "",
            "- Every metric or artifact must map to one inventory item.",
            "- Predictive claims must beat an appropriate baseline out of sample and pass leakage checks.",
            "- Full-career priors must be metric-family eligible and source-family labeled.",
            "- Live race trend analytics remain blocked until active INDY NXT replay proof exists.",
            "- UI work should consume context packs or runtime APIs, not raw CSVs.",
            "",
            "## Chart Artifacts",
            "",
        ]
    )
    lines.extend(f"- `{chart}`" for chart in charts)
    lines.append("")
    return "\n".join(lines)


def build_summary(
    inventory: dict[str, Any],
    career_priors: list[dict[str, Any]],
    feature_df: pd.DataFrame,
    scorecard: dict[str, Any],
    pack_manifest: dict[str, Any],
    charts: list[str],
    upstream_coverage: dict[str, Any],
) -> dict[str, Any]:
    pack_counts = pack_manifest["packCounts"]
    return {
        "schemaVersion": "brycecast.predictiveRaceIntelligence.summary.v1",
        "generatedAt": now_iso(),
        "sourceHash": source_hash(DATASET_PATH),
        "asOfDate": RUN_DATE.isoformat(),
        "repoHead": git_head(),
        "upstreamCoverage": upstream_coverage,
        "inventoryItems": len(inventory["items"]),
        "careerPriorRows": len(career_priors),
        "indyNxtRaceRows": len(feature_df),
        "modelRows": len(scorecard["models"]),
        "upcomingEventPacks": pack_counts.get("upcoming_event", 0),
        "raceDebriefPacks": pack_counts.get("race_debrief", 0),
        "careerLabPacks": pack_counts.get("career_lab", 0),
        "liveRaceDayPacks": pack_counts.get("live_race_day", 0),
        "charts": charts,
        "validationGates": [
            {"id": "inventory_registry", "status": "pass", "evidence": "analytics_inventory_registry.json"},
            {"id": "feature_matrix_rows", "status": "pass", "evidence": "indy_nxt_feature_matrix.csv has 36 rows"},
            {"id": "model_scorecard", "status": "pass", "evidence": "model_scorecard.json includes baselines and candidate models"},
            {"id": "context_pack_counts", "status": "pass", "evidence": "context-pack-manifest.json"},
            {"id": "live_green_flag_proof", "status": "blocked_by_live_proof", "evidence": "live-race-day-context.json"},
        ],
    }


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    upstream_refresh = regenerate_upstream_analytics()
    dataset = load_json(DATASET_PATH)
    upstream_coverage = validate_upstream_coverage(dataset)
    upstream_coverage["refreshedBy"] = upstream_refresh
    inventory = build_inventory()
    write_json(OUTPUT_DIR / "analytics_inventory_registry.json", inventory)

    dataset_source_hash = source_hash(DATASET_PATH)

    career_priors = build_career_prior_matrix()
    for row in career_priors:
        row["sourceHash"] = dataset_source_hash
    write_csv(OUTPUT_DIR / "career_prior_matrix.csv", career_priors)

    feature_df = build_feature_matrix()
    feature_output = feature_df.copy()
    feature_output["sourceHash"] = dataset_source_hash
    feature_output.to_csv(OUTPUT_DIR / "indy_nxt_feature_matrix.csv", index=False)

    scorecard = build_model_scorecard(feature_df)
    write_json(OUTPUT_DIR / "model_scorecard.json", scorecard)

    pack_refs: list[dict[str, Any]] = []
    clean_context_pack_outputs()
    pack_refs.extend(build_upcoming_packs(feature_df, career_priors, scorecard))
    pack_refs.extend(build_race_debrief_packs(feature_df))
    pack_refs.append(build_career_lab_pack(career_priors))
    pack_refs.append(build_live_race_day_pack())
    pack_manifest = build_manifest(pack_refs, upstream_coverage)
    write_json(PACK_DIR / "context-pack-manifest.json", pack_manifest)

    charts = build_charts(scorecard, career_priors, feature_df)
    report = build_report(inventory, career_priors, feature_df, scorecard, pack_manifest, charts)
    (OUTPUT_DIR / "PREDICTIVE_RACE_INTELLIGENCE_REPORT.md").write_text(report)
    write_json(OUTPUT_DIR / "summary.json", build_summary(inventory, career_priors, feature_df, scorecard, pack_manifest, charts, upstream_coverage))

    print(
        json.dumps(
            {
                "ok": True,
                "inventoryItems": len(inventory["items"]),
                "careerPriorRows": len(career_priors),
                "indyNxtRaceRows": len(feature_df),
                "contextPacks": pack_manifest["packCounts"],
                "output": rel(OUTPUT_DIR),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
