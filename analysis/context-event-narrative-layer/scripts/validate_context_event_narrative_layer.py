#!/usr/bin/env python3
"""Validate context event/narrative layer artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/context-event-narrative-layer"
OUTPUT_DIR = LANE_DIR / "output"

CONTEXT_COLLECTIONS = ["racecraftEvents", "penalties", "incidents", "weatherObservations", "mediaAssets"]
CONTEXT_TYPE_BY_COLLECTION = {
    "racecraftEvents": "racecraft",
    "penalties": "penalty",
    "incidents": "incident",
    "weatherObservations": "weather",
    "mediaAssets": "media",
}

REQUIRED_FILES = [
    "context_event_timeline.csv",
    "session_context_rollups.csv",
    "series_context_coverage.csv",
    "weather_condition_context.csv",
    "media_narrative_index.csv",
    "source_evidence_lineage.csv",
    "derived_metric_context.csv",
    "gap_source_boundary_context.csv",
    "summary.json",
    "CONTEXT_EVENT_NARRATIVE_LAYER.md",
    "context-packs/context-event-narrative-context.json",
]

TIMELINE_FIELDS = {
    "contextId",
    "contextType",
    "seriesId",
    "seriesName",
    "seasonYear",
    "eventId",
    "eventName",
    "sessionId",
    "sessionType",
    "driverId",
    "lapNumber",
    "subtype",
    "impactLabel",
    "description",
    "sourceConfidence",
    "sourceState",
    "provenanceRefCount",
    "sourceHash",
}


def text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def expected_weather_source_state(row: dict[str, Any]) -> str:
    confidence = text(row.get("confidence")).lower()
    source_type = text(row.get("weatherSourceType")).lower()
    source = text(row.get("source")).lower()
    if confidence == "official" or source_type == "series_report":
        return "official_weather_context"
    if "modeled" in confidence or source_type in {"grid_reanalysis", "forecast_model"} or "open-meteo" in source:
        return "modeled_weather_context"
    return "source_backed_weather_context"


def expected_gap_source_state(row: dict[str, Any]) -> str:
    status = text(row.get("status")).lower() or "unknown"
    if status == "source_broken_preserved":
        return "source_broken_gap_context"
    if status == "partial":
        return "partial_gap_context"
    if status == "open":
        return "open_gap_context"
    return "source_gap_context"


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


def parse_int(value: Any, artifact: str, field: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        fail(f"{artifact} has non-integer {field}: {value!r}")


def expected_counts(dataset: dict[str, Any]) -> dict[str, Any]:
    return {
        "timelineRows": sum(len(dataset.get(collection, [])) for collection in CONTEXT_COLLECTIONS),
        "mediaRows": len(dataset.get("mediaAssets", [])),
        "sourceEvidenceRows": len(dataset.get("sourceEvidence", [])),
        "derivedMetricRows": len(dataset.get("derivedMetrics", [])),
        "gapRows": len(dataset.get("gaps", [])),
        "weatherRows": len(dataset.get("weatherObservations", [])),
        "gapIds": sorted(str(row.get("id") or "") for row in dataset.get("gaps", [])),
        "gapSourceStateById": {
            str(row.get("id") or ""): expected_gap_source_state(row)
            for row in dataset.get("gaps", [])
        },
        "gapDescriptionById": {
            str(row.get("id") or ""): text(row.get("description"))
            for row in dataset.get("gaps", [])
        },
        "weatherIds": sorted(str(row.get("id") or "") for row in dataset.get("weatherObservations", [])),
        "timelineKeys": sorted(
            (CONTEXT_TYPE_BY_COLLECTION[collection], str(row.get("id") or ""))
            for collection in CONTEXT_COLLECTIONS
            for row in dataset.get(collection, [])
        ),
        "weatherSourceStateById": {
            str(row.get("id") or ""): expected_weather_source_state(row)
            for row in dataset.get("weatherObservations", [])
        },
    }


def validate_timeline(expected_hash: str, counts: dict[str, Any]) -> None:
    rows = read_csv(OUTPUT_DIR / "context_event_timeline.csv")
    if not rows:
        fail("context_event_timeline.csv is empty")
    missing = TIMELINE_FIELDS - set(rows[0])
    if missing:
        fail(f"context_event_timeline.csv missing fields: {sorted(missing)}")
    if len(rows) != counts["timelineRows"]:
        fail(f"context_event_timeline row count mismatch: expected {counts['timelineRows']}, got {len(rows)}")
    observed_timeline_keys = sorted((row.get("contextType") or "", row.get("contextId") or "") for row in rows)
    if observed_timeline_keys != counts["timelineKeys"]:
        fail("context_event_timeline contextType/contextId coverage does not match canonical context collections")
    type_counts = {kind: 0 for kind in ["racecraft", "penalty", "incident", "weather", "media"]}
    for row in rows:
        if row["sourceHash"] != expected_hash:
            fail("context_event_timeline sourceHash does not match canonical dataset")
        if row["sourceState"] not in {
            "official_racecraft_context",
            "official_penalty_context",
            "official_incident_context",
            "official_weather_context",
            "modeled_weather_context",
            "source_backed_weather_context",
            "media_narrative_context",
        }:
            fail(f"unexpected context sourceState {row['sourceState']!r}")
        if row["contextType"] == "weather":
            expected_state = counts["weatherSourceStateById"].get(row["contextId"])
            if expected_state and row["sourceState"] != expected_state:
                fail(
                    "context_event_timeline weather sourceState mismatch for "
                    f"{row['contextId']}: expected {expected_state}, got {row['sourceState']}"
                )
        if row["contextType"] in type_counts:
            type_counts[row["contextType"]] += 1
        parse_int(row.get("provenanceRefCount"), "context_event_timeline.csv", "provenanceRefCount")
    if any(count == 0 for count in type_counts.values()):
        fail(f"context_event_timeline missing context types: {type_counts}")


def validate_rollups_and_lineage(expected_hash: str, counts: dict[str, Any]) -> None:
    timeline = read_csv(OUTPUT_DIR / "context_event_timeline.csv")

    rollups = read_csv(OUTPUT_DIR / "session_context_rollups.csv")
    expected_session_ids = sorted({row["sessionId"] for row in timeline if row.get("sessionId")})
    observed_session_ids = sorted(row.get("sessionId") or "" for row in rollups)
    if observed_session_ids != expected_session_ids:
        fail("session_context_rollups.csv sessionId coverage does not match the context timeline")
    for row in rollups:
        if row["sourceHash"] != expected_hash:
            fail("session_context_rollups.csv sourceHash does not match canonical dataset")

    series = read_csv(OUTPUT_DIR / "series_context_coverage.csv")
    expected_series_ids = sorted({row.get("seriesId") or "global_context" for row in timeline})
    observed_series_ids = sorted(row.get("seriesId") or "global_context" for row in series)
    if observed_series_ids != expected_series_ids:
        fail("series_context_coverage.csv seriesId coverage does not match the context timeline")
    for row in series:
        if row["sourceHash"] != expected_hash:
            fail("series_context_coverage.csv sourceHash does not match canonical dataset")

    weather = read_csv(OUTPUT_DIR / "weather_condition_context.csv")
    if len(weather) != counts["weatherRows"]:
        fail(f"weather_condition_context.csv row count mismatch: expected {counts['weatherRows']}, got {len(weather)}")
    observed_weather_ids = sorted(row.get("weatherId") or "" for row in weather)
    if observed_weather_ids != counts["weatherIds"]:
        fail("weather_condition_context.csv weatherId coverage does not match canonical weatherObservations")
    for row in weather:
        if "sourceState" not in row:
            fail("weather_condition_context.csv missing sourceState")
        expected_state = counts["weatherSourceStateById"].get(row["weatherId"])
        if expected_state and row["sourceState"] != expected_state:
            fail(
                "weather_condition_context.csv sourceState mismatch for "
                f"{row['weatherId']}: expected {expected_state}, got {row['sourceState']}"
            )
        if row["sourceHash"] != expected_hash:
            fail("weather_condition_context.csv sourceHash does not match canonical dataset")

    media = read_csv(OUTPUT_DIR / "media_narrative_index.csv")
    if len(media) != counts["mediaRows"]:
        fail("media_narrative_index row count mismatch")
    for row in media:
        if row["sourceHash"] != expected_hash:
            fail("media_narrative_index sourceHash does not match canonical dataset")

    source = read_csv(OUTPUT_DIR / "source_evidence_lineage.csv")
    if len(source) != counts["sourceEvidenceRows"]:
        fail("source_evidence_lineage row count mismatch")
    for row in source:
        if row["sourceHash"] != expected_hash:
            fail("source_evidence_lineage sourceHash does not match canonical dataset")
        if row.get("rawArtifactPath") and row.get("hasRawArtifact") != "yes":
            fail("source_evidence_lineage rawArtifactPath missing hasRawArtifact flag")

    derived = read_csv(OUTPUT_DIR / "derived_metric_context.csv")
    if len(derived) != counts["derivedMetricRows"]:
        fail("derived_metric_context row count mismatch")
    metric_types = {row["metricType"] for row in derived}
    for required in ["official_section_results", "official_top_section_times", "official_leader_lap_summary", "official_event_summary_race_stats"]:
        if required not in metric_types:
            fail(f"derived_metric_context missing metric type {required}")
    for row in derived:
        if row["sourceHash"] != expected_hash:
            fail("derived_metric_context sourceHash does not match canonical dataset")

    gaps = read_csv(OUTPUT_DIR / "gap_source_boundary_context.csv")
    if len(gaps) != counts["gapRows"]:
        fail(f"gap_source_boundary_context.csv row count mismatch: expected {counts['gapRows']}, got {len(gaps)}")
    observed_gap_ids = sorted(row.get("gapId") or "" for row in gaps)
    if observed_gap_ids != counts["gapIds"]:
        fail("gap_source_boundary_context.csv gapId coverage does not match canonical gaps")
    for row in gaps:
        if row["sourceHash"] != expected_hash:
            fail("gap_source_boundary_context.csv sourceHash does not match canonical dataset")
        expected_state = counts["gapSourceStateById"].get(row.get("gapId") or "")
        if expected_state and row.get("sourceState") != expected_state:
            fail(
                "gap_source_boundary_context.csv sourceState mismatch for "
                f"{row.get('gapId')}: expected {expected_state}, got {row.get('sourceState')}"
            )
        expected_description = counts["gapDescriptionById"].get(row.get("gapId") or "")
        if row.get("description") != expected_description:
            fail(f"gap_source_boundary_context.csv description mismatch for {row.get('gapId')}")
        if row.get("displayPolicy") != "show_as_source_boundary_not_performance_metric":
            fail(f"gap_source_boundary_context.csv unexpected displayPolicy for {row.get('gapId')}")
        parse_int(row.get("provenanceRefCount"), "gap_source_boundary_context.csv", "provenanceRefCount")


def validate_context(expected_hash: str, counts: dict[str, Any]) -> None:
    summary = load_json(OUTPUT_DIR / "summary.json")
    if summary.get("ok") is not True:
        fail("summary.json must set ok=true")
    if summary.get("sourceHash") != expected_hash:
        fail("summary.json sourceHash does not match canonical dataset")
    if summary.get("claimStrength") != "source_bounded_context_narrative_not_telemetry":
        fail("summary.json claimStrength mismatch")
    if summary.get("publicPointPrediction") is not False or summary.get("causalAttribution") is not False:
        fail("summary.json must forbid point prediction and causal attribution")
    summary_counts = {
        "timelineRows": counts["timelineRows"],
        "sessionRollupRows": len(read_csv(OUTPUT_DIR / "session_context_rollups.csv")),
        "seriesCoverageRows": len(read_csv(OUTPUT_DIR / "series_context_coverage.csv")),
        "weatherRows": counts["weatherRows"],
        "mediaRows": counts["mediaRows"],
        "sourceEvidenceRows": counts["sourceEvidenceRows"],
        "derivedMetricRows": counts["derivedMetricRows"],
        "gapRows": counts["gapRows"],
    }
    for key, expected in summary_counts.items():
        if summary.get("counts", {}).get(key) != expected:
            fail(f"summary.json count mismatch for {key}: expected {expected}, got {summary.get('counts', {}).get(key)}")

    pack = load_json(OUTPUT_DIR / "context-packs/context-event-narrative-context.json")
    if pack.get("sourceHash") != expected_hash:
        fail("context pack sourceHash does not match canonical dataset")
    if pack.get("claimStrength") != "source_bounded_context_narrative_not_telemetry":
        fail("context pack claimStrength mismatch")
    for key, expected in summary_counts.items():
        if pack.get("sourceScope", {}).get(key) != expected:
            fail(f"context pack sourceScope count mismatch for {key}")
    text = json.dumps(pack).lower()
    forbidden = ["win probability", "predicted finish", "expected finish", "telemetry root cause", "proved caused"]
    hits = [phrase for phrase in forbidden if phrase in text]
    if hits:
        fail(f"context pack contains unsupported claim text: {hits}")

    report = OUTPUT_DIR / "CONTEXT_EVENT_NARRATIVE_LAYER.md"
    require_file(report)
    report_text = report.read_text()
    if expected_hash not in report_text:
        fail("report missing current source hash")
    for phrase in [
        "Source Scope",
        "What Became Productized",
        "Context Timeline",
        "Source Evidence",
        "Derived Metric Context",
        "Source Boundary Gaps",
        "Caveats",
    ]:
        if phrase not in report_text:
            fail(f"report missing section: {phrase}")
    if re.search(r"\b(win probability|predicted finish|expected finish|telemetry root cause|proved caused)\b", report_text.lower()):
        fail("report contains unsupported predictive/causal language")


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)
        dataset = load_json(ROOT / "data/career/career.dataset.json")
        expected_hash = dataset_hash()
        counts = expected_counts(dataset)
        validate_timeline(expected_hash, counts)
        validate_rollups_and_lineage(expected_hash, counts)
        validate_context(expected_hash, counts)
    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT))}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
