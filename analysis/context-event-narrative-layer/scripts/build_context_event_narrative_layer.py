#!/usr/bin/env python3
"""Build source-bounded context/narrative artifacts from canonical career data."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/context-event-narrative-layer"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
CONTEXT_COLLECTIONS = ["racecraftEvents", "penalties", "incidents", "weatherObservations", "mediaAssets"]


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


def truncate(value: Any, limit: int = 280) -> str:
    clean = " ".join(text(value).split())
    if len(clean) <= limit:
        return clean
    return clean[: limit - 3].rstrip() + "..."


def yes_no(value: Any) -> str:
    return "yes" if value is True or value == "yes" else "no"


def lap_sort_value(value: Any) -> tuple[int, int | str]:
    parsed = safe_int(value)
    if parsed is not None:
        return (0, parsed)
    return (1, text(value))


def safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def provenance_count(row: dict[str, Any]) -> int:
    refs = row.get("provenanceRefs") or row.get("inputRefs") or []
    return len(refs) if isinstance(refs, list) else 0


def build_indexes(data: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    return {
        "drivers": {row["id"]: row for row in data.get("drivers", [])},
        "events": {row["id"]: row for row in data.get("events", [])},
        "sessions": {row["id"]: row for row in data.get("sessions", [])},
        "series": {row["id"]: row for row in data.get("series", [])},
        "tracks": {row["id"]: row for row in data.get("tracks", [])},
    }


def driver_name(idx: dict[str, Any], driver_id: str | None) -> str:
    if not driver_id:
        return ""
    driver = idx["drivers"].get(driver_id)
    if not driver:
        return driver_id
    return driver.get("displayName") or " ".join(part for part in [driver.get("givenName"), driver.get("familyName")] if part) or driver_id


def context(idx: dict[str, Any], *, session_id: str | None = None, event_id: str | None = None, series_id: str | None = None, track_id: str | None = None) -> dict[str, Any]:
    session = idx["sessions"].get(session_id or "")
    if session and not event_id:
        event_id = session.get("eventId")
    event = idx["events"].get(event_id or "")
    if event:
        series_id = series_id or event.get("seriesId")
        track_id = track_id or event.get("trackId")
    series = idx["series"].get(series_id or "")
    track = idx["tracks"].get(track_id or "")
    return {
        "sessionId": session.get("id") if session else (session_id or ""),
        "sessionType": session.get("sessionType") if session else "",
        "sessionName": session.get("sessionName") if session else "",
        "eventId": event.get("id") if event else (event_id or ""),
        "eventName": event.get("name") if event else "",
        "seasonYear": event.get("seasonYear") if event else "",
        "seriesId": series.get("id") if series else (series_id or "global_context"),
        "seriesName": series.get("name") if series else "Global / career context",
        "trackId": track.get("id") if track else (track_id or ""),
        "trackName": track.get("name") if track else "",
    }


def bryce_focused(row: dict[str, Any]) -> bool:
    if row.get("driverId") == BRYCE_ID:
        return True
    searchable = " ".join(text(row.get(field)) for field in ["description", "summary", "title", "quoteText"]).lower()
    return "bryce" in searchable or "bryce aron" in searchable or searchable.endswith(" aron")


def weather_source_state(row: dict[str, Any]) -> str:
    confidence = text(row.get("confidence")).lower()
    source_type = text(row.get("weatherSourceType")).lower()
    source = text(row.get("source")).lower()
    if confidence == "official" or source_type == "series_report":
        return "official_weather_context"
    if "modeled" in confidence or source_type in {"grid_reanalysis", "forecast_model"} or "open-meteo" in source:
        return "modeled_weather_context"
    return "source_backed_weather_context"


def timeline_row(base: dict[str, Any], row: dict[str, Any], source_hash: str) -> dict[str, Any]:
    return {
        **base,
        "contextId": row.get("id"),
        "driverId": row.get("driverId") or "",
        "driverName": driver_name(base["_idx"], row.get("driverId")),
        "lapNumber": row.get("lapNumber") if row.get("lapNumber") is not None else "",
        "provenanceRefCount": provenance_count(row),
        "sourceHash": source_hash,
    }


def build_timeline(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []

    for item in data.get("racecraftEvents", []):
        ctx = context(idx, session_id=item.get("sessionId"))
        before = item.get("positionBefore")
        after = item.get("positionAfter")
        impact = f"P{before} to P{after}" if before is not None and after is not None else text(item.get("eventType"))
        rows.append(
            timeline_row(
                {**ctx, "_idx": idx},
                item,
                source_hash,
            )
            | {
                "contextType": "racecraft",
                "subtype": item.get("eventType") or "",
                "impactLabel": impact,
                "description": truncate(item.get("description")),
                "sourceConfidence": item.get("confidence") or "official",
                "sourceState": "official_racecraft_context",
            }
        )

    for item in data.get("penalties", []):
        raw = item.get("raw") or {}
        impacts = []
        if item.get("positionImpact") is not None:
            impacts.append(f"positionImpact={item['positionImpact']}")
        if item.get("timeImpactSeconds") is not None:
            impacts.append(f"timeImpactSeconds={item['timeImpactSeconds']}")
        rows.append(
            timeline_row({**context(idx, session_id=item.get("sessionId")), "_idx": idx}, item, source_hash)
            | {
                "contextType": "penalty",
                "subtype": item.get("penaltyType") or "",
                "impactLabel": "; ".join(impacts) or text(item.get("penaltyType")),
                "description": truncate(raw.get("announcement") or f"{item.get('penaltyType') or 'penalty'}: {item.get('reason') or ''}"),
                "sourceConfidence": "official" if provenance_count(item) else "source_backed",
                "sourceState": "official_penalty_context",
            }
        )

    for item in data.get("incidents", []):
        rows.append(
            timeline_row({**context(idx, session_id=item.get("sessionId")), "_idx": idx}, item, source_hash)
            | {
                "contextType": "incident",
                "subtype": item.get("incidentType") or "",
                "impactLabel": item.get("outcome") or "",
                "description": truncate(item.get("description")),
                "sourceConfidence": "official" if provenance_count(item) else "source_backed",
                "sourceState": "official_incident_context",
            }
        )

    for item in data.get("weatherObservations", []):
        ctx = context(idx, session_id=item.get("sessionId"), track_id=item.get("trackId"))
        condition = item.get("trackCondition") or item.get("trackConditionRaw") or item.get("ambientConditionRaw") or ""
        wet_dry = item.get("wetDry") or "unknown"
        temps = []
        if item.get("ambientTempC") is not None:
            temps.append(f"ambient {item['ambientTempC']}C")
        if item.get("trackTempC") is not None:
            temps.append(f"track {item['trackTempC']}C")
        description = f"{wet_dry} / {condition}".strip(" /")
        if temps:
            description = f"{description}; {'; '.join(temps)}"
        if item.get("source"):
            description = f"{description} ({item['source']})"
        rows.append(
            timeline_row({**ctx, "_idx": idx}, item, source_hash)
            | {
                "contextType": "weather",
                "subtype": item.get("weatherSourceType") or item.get("timeWindowReason") or "weather_context",
                "impactLabel": f"{wet_dry}; {condition}".strip("; "),
                "description": truncate(description),
                "sourceConfidence": item.get("confidence") or item.get("timeConfidence") or "source_backed",
                "sourceState": weather_source_state(item),
            }
        )

    for item in data.get("mediaAssets", []):
        ctx = context(idx, session_id=item.get("sessionId"), event_id=item.get("eventId"))
        rows.append(
            timeline_row({**ctx, "_idx": idx}, item, source_hash)
            | {
                "contextType": "media",
                "subtype": item.get("assetType") or "",
                "impactLabel": item.get("rightsStatus") or "",
                "description": truncate(item.get("summary") or item.get("title")),
                "sourceConfidence": item.get("rightsStatus") or "source_backed_media",
                "sourceState": "media_narrative_context",
            }
        )

    for row in rows:
        row.pop("_idx", None)
    return sorted(rows, key=lambda row: (str(row.get("seasonYear")), row.get("seriesName") or "", row.get("eventName") or "", row.get("sessionId") or "", lap_sort_value(row.get("lapNumber")), row.get("contextType") or "", row.get("contextId") or ""))


def build_session_rollups(timeline: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in timeline:
        if row.get("sessionId"):
            grouped[row["sessionId"]].append(row)

    rows: list[dict[str, Any]] = []
    for session_id, items in sorted(grouped.items()):
        first = items[0]
        counts = Counter(item["contextType"] for item in items)
        laps = [int(item["lapNumber"]) for item in items if text(item.get("lapNumber")).isdigit()]
        source_states = Counter(item["sourceState"] for item in items)
        wet_dry = sorted({text(item.get("impactLabel")).split(";")[0] for item in items if item.get("contextType") == "weather" and item.get("impactLabel")})
        rows.append(
            {
                "sessionId": session_id,
                "eventId": first.get("eventId"),
                "eventName": first.get("eventName"),
                "seriesId": first.get("seriesId"),
                "seriesName": first.get("seriesName"),
                "seasonYear": first.get("seasonYear"),
                "sessionType": first.get("sessionType"),
                "totalContextRows": len(items),
                "racecraftCount": counts.get("racecraft", 0),
                "penaltyCount": counts.get("penalty", 0),
                "incidentCount": counts.get("incident", 0),
                "weatherCount": counts.get("weather", 0),
                "mediaCount": counts.get("media", 0),
                "bryceContextCount": sum(1 for item in items if item.get("driverId") == BRYCE_ID or "bryce" in text(item.get("description")).lower()),
                "wetDryStates": "; ".join(wet_dry),
                "firstLapNumber": min(laps) if laps else "",
                "lastLapNumber": max(laps) if laps else "",
                "sourceStateCounts": "; ".join(f"{key}:{value}" for key, value in sorted(source_states.items())),
                "sourceHash": source_hash,
            }
        )
    return rows


def build_series_coverage(timeline: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in timeline:
        grouped[row.get("seriesId") or "global_context"].append(row)

    rows: list[dict[str, Any]] = []
    for series_id, items in sorted(grouped.items()):
        first = items[0]
        counts = Counter(item["contextType"] for item in items)
        official_rows = sum(1 for item in items if text(item.get("sourceConfidence")).lower().startswith("official"))
        rows.append(
            {
                "seriesId": series_id,
                "seriesName": first.get("seriesName") or "Global / career context",
                "seasonYears": "; ".join(str(year) for year in sorted({item.get("seasonYear") for item in items if item.get("seasonYear")})),
                "eventCount": len({item.get("eventId") for item in items if item.get("eventId")}),
                "sessionCount": len({item.get("sessionId") for item in items if item.get("sessionId")}),
                "totalContextRows": len(items),
                "racecraftCount": counts.get("racecraft", 0),
                "penaltyCount": counts.get("penalty", 0),
                "incidentCount": counts.get("incident", 0),
                "weatherCount": counts.get("weather", 0),
                "mediaCount": counts.get("media", 0),
                "bryceContextCount": sum(1 for item in items if item.get("driverId") == BRYCE_ID or "bryce" in text(item.get("description")).lower()),
                "officialContextShare": official_rows / len(items) if items else "",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_weather_context(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in data.get("weatherObservations", []):
        ctx = context(idx, session_id=item.get("sessionId"), track_id=item.get("trackId"))
        rows.append(
            {
                "weatherId": item.get("id"),
                **ctx,
                "observedAt": item.get("observedAt") or "",
                "wetDry": item.get("wetDry") or "",
                "trackCondition": item.get("trackCondition") or item.get("trackConditionRaw") or "",
                "ambientConditionRaw": item.get("ambientConditionRaw") or "",
                "ambientTempC": item.get("ambientTempC"),
                "trackTempC": item.get("trackTempC"),
                "precipitationMm": item.get("precipitationMm"),
                "windSpeedKph": item.get("windSpeedKph"),
                "source": item.get("source") or "",
                "weatherSourceType": item.get("weatherSourceType") or "",
                "confidence": item.get("confidence") or "",
                "timeConfidence": item.get("timeConfidence") or "",
                "locationConfidence": item.get("locationConfidence") or "",
                "timeWindowStart": item.get("timeWindowStart") or "",
                "timeWindowEnd": item.get("timeWindowEnd") or "",
                "timeWindowReason": item.get("timeWindowReason") or "",
                "joinNotes": truncate(item.get("joinNotes"), 500),
                "provenanceRefCount": provenance_count(item),
                "sourceState": weather_source_state(item),
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (str(row.get("seasonYear")), row.get("seriesName") or "", row.get("eventName") or "", row.get("sessionId") or "", row.get("weatherId") or ""))


def build_media_index(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in data.get("mediaAssets", []):
        ctx = context(idx, session_id=item.get("sessionId"), event_id=item.get("eventId"))
        rows.append(
            {
                "mediaId": item.get("id"),
                "assetType": item.get("assetType") or "",
                "title": item.get("title") or "",
                "rightsStatus": item.get("rightsStatus") or "",
                "publishedAt": item.get("publishedAt") or "",
                **ctx,
                "driverId": item.get("driverId") or "",
                "driverName": driver_name(idx, item.get("driverId")),
                "isBryceFocused": yes_no(bryce_focused(item)),
                "hasQuote": yes_no(bool(item.get("quoteText"))),
                "summary": truncate(item.get("summary"), 500),
                "url": item.get("url") or "",
                "provenanceRefCount": provenance_count(item),
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (str(row.get("publishedAt")), row.get("seriesName") or "", row.get("mediaId") or ""))


def build_source_lineage(data: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for item in data.get("sourceEvidence", []):
        raw_path = item.get("rawArtifactPath") or ""
        linked_urls = item.get("linkedUrls") or []
        rows.append(
            {
                "sourceId": item.get("id"),
                "sourceType": item.get("sourceType") or "",
                "sourceName": item.get("sourceName") or "",
                "confidenceTier": item.get("confidenceTier") or "",
                "url": item.get("url") or "",
                "hasUrl": yes_no(bool(item.get("url"))),
                "linkedUrlCount": len(linked_urls) if isinstance(linked_urls, list) else 0,
                "retrievedAt": item.get("retrievedAt") or "",
                "publishedAt": item.get("publishedAt") or "",
                "accessedBy": item.get("accessedBy") or "",
                "parser": item.get("parser") or "",
                "hasRawArtifact": yes_no(bool(raw_path)),
                "rawArtifactPath": raw_path,
                "coverage": truncate(item.get("coverage"), 700),
                "licenseNotes": truncate(item.get("licenseNotes"), 500),
                "notes": truncate(item.get("notes"), 500),
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (row.get("confidenceTier") or "", row.get("sourceType") or "", row.get("sourceId") or ""))


def gap_source_state(item: dict[str, Any]) -> str:
    status = text(item.get("status")).lower() or "unknown"
    if status == "source_broken_preserved":
        return "source_broken_gap_context"
    if status == "partial":
        return "partial_gap_context"
    if status == "open":
        return "open_gap_context"
    return "source_gap_context"


def build_gap_context(data: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in data.get("gaps", []):
        raw = item.get("raw") or {}
        rows.append(
            {
                "gapId": item.get("id"),
                "scope": item.get("scope") or "",
                "status": item.get("status") or "",
                "sourceState": gap_source_state(item),
                "description": text(item.get("description")),
                "provenanceRefCount": provenance_count(item),
                "rawKeys": "; ".join(sorted(raw)) if isinstance(raw, dict) else "",
                "displayPolicy": "show_as_source_boundary_not_performance_metric",
                "productUse": "source_ops;coverage_badges;unavailable_state_copy",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (row.get("status") or "", row.get("scope") or "", row.get("gapId") or ""))


def metric_nested_count(item: dict[str, Any]) -> int:
    metrics = item.get("metrics") or {}
    metric_type = item.get("metricType")
    if metric_type == "official_section_results":
        return sum(len(car.get("laps") or []) for car in metrics.get("cars") or [])
    if metric_type == "official_top_section_times":
        return sum(len(section.get("rows") or []) for section in metrics.get("sections") or [])
    if metric_type == "official_leader_lap_summary":
        return len(metrics.get("laps") or [])
    if isinstance(metrics, dict):
        return len(metrics)
    return 0


def metric_headline(item: dict[str, Any]) -> tuple[str, str]:
    metrics = item.get("metrics") or {}
    metric_type = item.get("metricType")
    if metric_type == "official_event_summary_race_stats":
        headline = f"{metrics.get('totalLaps', 'n/a')} total laps; {metrics.get('totalPasses', 'n/a')} total passes; {metrics.get('cautionLaps', 'n/a')} caution laps"
        detail = f"greenLaps={metrics.get('greenLaps', 'n/a')}; positionPasses={metrics.get('positionPasses', 'n/a')}; leadChanges={metrics.get('leadChanges', 'n/a')}"
        return headline, detail
    if metric_type == "official_leader_lap_summary":
        laps = metrics.get("laps") or []
        leaders = sorted({lap.get("driverName") for lap in laps if lap.get("driverName")})
        return f"{len(laps)} leader-lap rows", f"leaders={'; '.join(leaders[:8])}"
    if metric_type == "official_section_results":
        sections = metrics.get("sectionNames") or []
        cars = metrics.get("cars") or []
        return f"{len(sections)} sections across {len(cars)} cars", f"carLapRows={metric_nested_count(item)}"
    if metric_type == "official_top_section_times":
        sections = metrics.get("sections") or []
        return f"{len(sections)} top-section tables", f"rankedRows={metric_nested_count(item)}"
    if metric_type in {"karting_fast_time", "karting_track_record"}:
        return f"{metrics.get('organization', 'official record')} {metrics.get('className', '')}".strip(), f"track={metrics.get('track', '')}; lapTime={metrics.get('lapTime', '')}; date={metrics.get('date', '')}"
    if metric_type == "karting_championship_milestone":
        return text(metrics.get("achievement") or metrics.get("title") or "karting milestone"), text(metrics.get("description") or metrics)
    if metric_type == "season_context_milestone":
        return text(metrics.get("milestone") or metrics.get("title") or "season context milestone"), text(metrics.get("description") or metrics)
    if metric_type == "career_award":
        return text(metrics.get("award") or metrics.get("title") or "career award"), text(metrics.get("description") or metrics)
    return text(metric_type), truncate(metrics, 500)


def build_derived_metric_context(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in data.get("derivedMetrics", []):
        ctx = context(idx, session_id=item.get("sessionId"), event_id=item.get("eventId"), series_id=item.get("seriesId"))
        headline, detail = metric_headline(item)
        rows.append(
            {
                "metricId": item.get("id"),
                "metricType": item.get("metricType") or "",
                "scope": item.get("scope") or "",
                **ctx,
                "driverId": item.get("driverId") or "",
                "driverName": driver_name(idx, item.get("driverId")),
                "calculationVersion": item.get("calculationVersion") or "",
                "confidence": item.get("confidence") or "",
                "formula": truncate(item.get("formula"), 500),
                "inputRefCount": len(item.get("inputRefs") or []),
                "provenanceRefCount": provenance_count(item),
                "nestedEntityCount": metric_nested_count(item),
                "metricHeadline": truncate(headline, 400),
                "metricDetail": truncate(detail, 700),
                "sourceState": "official_derived_metric_context" if text(item.get("metricType")).startswith("official_") else "structured_career_metric_context",
                "sourceHash": source_hash,
            }
        )
    return sorted(rows, key=lambda row: (row.get("seriesName") or "", str(row.get("seasonYear")), row.get("eventName") or "", row.get("metricType") or "", row.get("metricId") or ""))


def compact_counter(counter: Counter[str], limit: int = 12) -> list[dict[str, Any]]:
    return [{"label": key, "count": value} for key, value in counter.most_common(limit)]


def top_rows(rows: Iterable[dict[str, Any]], *, key: str, limit: int = 10) -> list[dict[str, Any]]:
    return sorted(rows, key=lambda row: int(row.get(key) or 0), reverse=True)[:limit]


def build_context_pack(
    timeline: list[dict[str, Any]],
    session_rollups: list[dict[str, Any]],
    series_coverage: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    media_rows: list[dict[str, Any]],
    source_rows: list[dict[str, Any]],
    derived_rows: list[dict[str, Any]],
    gap_rows: list[dict[str, Any]],
    source_hash: str,
) -> dict[str, Any]:
    type_counts = Counter(row["contextType"] for row in timeline)
    metric_counts = Counter(row["metricType"] for row in derived_rows)
    source_type_counts = Counter(row["sourceType"] for row in source_rows)
    gap_status_counts = Counter(row["status"] for row in gap_rows)
    road_america_rows = [
        row
        for row in timeline
        if "road america" in f"{row.get('eventName', '')} {row.get('trackName', '')}".lower()
    ]
    bryce_rows = [row for row in timeline if row.get("driverId") == BRYCE_ID or "bryce" in text(row.get("description")).lower()]
    return {
        "generatedAt": now_iso(),
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_context_narrative_not_telemetry",
        "publicPointPrediction": False,
        "causalAttribution": False,
        "sourceScope": {
            "timelineCollections": CONTEXT_COLLECTIONS,
            "timelineRows": len(timeline),
            "sessionRollupRows": len(session_rollups),
            "seriesCoverageRows": len(series_coverage),
            "weatherRows": len(weather_rows),
            "mediaRows": len(media_rows),
            "sourceEvidenceRows": len(source_rows),
            "derivedMetricRows": len(derived_rows),
            "gapRows": len(gap_rows),
        },
        "contextTypeCounts": compact_counter(type_counts),
        "derivedMetricTypeCounts": compact_counter(metric_counts),
        "sourceEvidenceTypeCounts": compact_counter(source_type_counts),
        "gapStatusCounts": compact_counter(gap_status_counts),
        "sourceBoundaryGaps": {
            "count": len(gap_rows),
            "rowsPath": "analysis/context-event-narrative-layer/output/gap_source_boundary_context.csv",
            "displayPolicy": "Gaps are source-boundary facts. They should drive unavailable/deferred states, not inferred metrics.",
            "examples": [
                {
                    "gapId": row.get("gapId"),
                    "scope": row.get("scope"),
                    "status": row.get("status"),
                    "description": row.get("description"),
                    "sourceState": row.get("sourceState"),
                }
                for row in gap_rows[:9]
            ],
        },
        "seriesContextCoverage": top_rows(series_coverage, key="totalContextRows", limit=10),
        "highestContextSessions": top_rows(session_rollups, key="totalContextRows", limit=12),
        "bryceFocusedContext": {
            "count": len(bryce_rows),
            "examples": [
                {
                    "contextType": row.get("contextType"),
                    "seriesName": row.get("seriesName"),
                    "eventName": row.get("eventName"),
                    "sessionType": row.get("sessionType"),
                    "description": row.get("description"),
                    "sourceState": row.get("sourceState"),
                }
                for row in bryce_rows[:12]
            ],
        },
        "roadAmericaContext": {
            "timelineRows": len(road_america_rows),
            "counts": compact_counter(Counter(row["contextType"] for row in road_america_rows)),
            "examples": [
                {
                    "contextType": row.get("contextType"),
                    "seasonYear": row.get("seasonYear"),
                    "sessionType": row.get("sessionType"),
                    "description": row.get("description"),
                    "sourceState": row.get("sourceState"),
                }
                for row in road_america_rows[:12]
            ],
        },
        "productUseCases": [
            {
                "id": "race_weekend_prep_context",
                "whatItAdds": "Source-backed incident, penalty, racecraft, condition, and media context around events and sessions.",
                "safeUses": ["prep cards", "source drawer facets", "career lab context filters", "event storyline timelines"],
                "blockedUses": ["private telemetry diagnosis", "unsupported causal labels", "public point forecasts"],
            },
            {
                "id": "career_source_lineage",
                "whatItAdds": "Queryable source-evidence and raw-artifact lineage for every canonical source row.",
                "safeUses": ["confidence badges", "evidence drilldown", "coverage QA", "source-family filtering"],
                "blockedUses": ["claiming source completeness beyond imported material"],
            },
        ],
        "caveats": [
            "Context facts are source-bounded to canonical rows and provenance refs.",
            "Official weather rows are not available for every series/session; condition context uses the confidence labels already present in the dataset.",
            "Media rows are link/index metadata and should respect rightsStatus before display.",
            "Derived metrics are indexed here for product access; existing deep-dive lanes remain the primary analytic interpretation for section, lap, and stint packages.",
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
    timeline: list[dict[str, Any]],
    session_rollups: list[dict[str, Any]],
    series_coverage: list[dict[str, Any]],
    weather_rows: list[dict[str, Any]],
    media_rows: list[dict[str, Any]],
    source_rows: list[dict[str, Any]],
    derived_rows: list[dict[str, Any]],
    gap_rows: list[dict[str, Any]],
    source_hash: str,
) -> None:
    type_counts = Counter(row["contextType"] for row in timeline)
    metric_counts = Counter(row["metricType"] for row in derived_rows)
    source_counts = Counter(row["sourceType"] for row in source_rows)
    gap_counts = Counter(row["status"] for row in gap_rows)
    lines = [
        "# Context Event Narrative Layer",
        "",
        f"Generated: {now_iso()}",
        f"Source hash: `{source_hash}`",
        "",
        "## Source Scope",
        "",
        "This lane normalizes canonical non-lap context collections into product-ready artifacts without editing ingestion-owned files. The output covers racecraft events, penalties, incidents, weather observations, media assets, source evidence, source-boundary gaps, and remaining derived metric context.",
        "",
        markdown_table(
            [{"collection": key, "rows": value} for key, value in type_counts.items()],
            ["collection", "rows"],
        ),
        "",
        "## What Became Productized",
        "",
        "- A row-level context timeline for every canonical racecraft, penalty, incident, weather, and media row.",
        "- Session and series rollups suitable for prep cards, source drawers, and career lab filtering.",
        "- Weather/condition rows with source confidence and join caveats preserved.",
        "- Media and source-evidence indexes that make rights, source type, parser, raw artifact, and confidence queryable.",
        "- A row-level source-boundary gap index covering every canonical gap row for Source Ops, unavailable states, and caveat routing.",
        "- Derived metric context rows that keep official INDY NXT section/leader/event-summary metrics and career milestones addressable from one semantic layer.",
        "",
        "## Context Timeline",
        "",
        markdown_table(top_rows(session_rollups, key="totalContextRows", limit=12), ["seriesName", "seasonYear", "eventName", "sessionType", "totalContextRows", "incidentCount", "penaltyCount", "weatherCount", "mediaCount"], limit=12),
        "",
        "## Source Evidence",
        "",
        markdown_table([{"sourceType": key, "rows": value} for key, value in source_counts.most_common(12)], ["sourceType", "rows"], limit=12),
        "",
        "## Source Boundary Gaps",
        "",
        markdown_table([{"status": key, "rows": value} for key, value in gap_counts.most_common(12)], ["status", "rows"], limit=12),
        "",
        "## Derived Metric Context",
        "",
        markdown_table([{"metricType": key, "rows": value} for key, value in metric_counts.most_common(12)], ["metricType", "rows"], limit=12),
        "",
        "## Weather And Media",
        "",
        f"- Weather/condition rows: {len(weather_rows)}.",
        f"- Media index rows: {len(media_rows)}.",
        f"- Source-evidence rows: {len(source_rows)}.",
        f"- Source-boundary gap rows: {len(gap_rows)}.",
        f"- Derived metric rows: {len(derived_rows)}.",
        "",
        "## Series Coverage",
        "",
        markdown_table(top_rows(series_coverage, key="totalContextRows", limit=10), ["seriesName", "seasonYears", "totalContextRows", "racecraftCount", "penaltyCount", "incidentCount", "weatherCount", "mediaCount"], limit=10),
        "",
        "## Caveats",
        "",
        "- These artifacts support context, explainability, and source-backed browsing; they do not turn source notes into private telemetry or point forecasts.",
        "- Rights status must gate media display. Link-only material should be treated as source metadata unless a later product lane adds approved display rules.",
        "- Weather observations inherit their source confidence, time confidence, location confidence, and join notes from the canonical dataset.",
        "- Source-evidence lineage indexes imported sources and raw-artifact references; it does not assert that the outside world has no further sources.",
        "- Gap rows are productized as source-boundary context only; an open gap is not a performance claim.",
        "",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines))


def main() -> int:
    data = load_dataset()
    source_hash = dataset_hash()
    idx = build_indexes(data)

    timeline = build_timeline(data, idx, source_hash)
    session_rollups = build_session_rollups(timeline, source_hash)
    series_coverage = build_series_coverage(timeline, source_hash)
    weather_rows = build_weather_context(data, idx, source_hash)
    media_rows = build_media_index(data, idx, source_hash)
    source_rows = build_source_lineage(data, source_hash)
    derived_rows = build_derived_metric_context(data, idx, source_hash)
    gap_rows = build_gap_context(data, source_hash)

    write_csv(
        OUTPUT_DIR / "context_event_timeline.csv",
        timeline,
        [
            "contextId",
            "contextType",
            "seriesId",
            "seriesName",
            "seasonYear",
            "eventId",
            "eventName",
            "sessionId",
            "sessionType",
            "sessionName",
            "trackId",
            "trackName",
            "driverId",
            "driverName",
            "lapNumber",
            "subtype",
            "impactLabel",
            "description",
            "sourceConfidence",
            "sourceState",
            "provenanceRefCount",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "session_context_rollups.csv",
        session_rollups,
        [
            "sessionId",
            "eventId",
            "eventName",
            "seriesId",
            "seriesName",
            "seasonYear",
            "sessionType",
            "totalContextRows",
            "racecraftCount",
            "penaltyCount",
            "incidentCount",
            "weatherCount",
            "mediaCount",
            "bryceContextCount",
            "wetDryStates",
            "firstLapNumber",
            "lastLapNumber",
            "sourceStateCounts",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "series_context_coverage.csv",
        series_coverage,
        [
            "seriesId",
            "seriesName",
            "seasonYears",
            "eventCount",
            "sessionCount",
            "totalContextRows",
            "racecraftCount",
            "penaltyCount",
            "incidentCount",
            "weatherCount",
            "mediaCount",
            "bryceContextCount",
            "officialContextShare",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "weather_condition_context.csv",
        weather_rows,
        [
            "weatherId",
            "seriesId",
            "seriesName",
            "seasonYear",
            "eventId",
            "eventName",
            "sessionId",
            "sessionType",
            "sessionName",
            "trackId",
            "trackName",
            "observedAt",
            "wetDry",
            "trackCondition",
            "ambientConditionRaw",
            "ambientTempC",
            "trackTempC",
            "precipitationMm",
            "windSpeedKph",
            "source",
            "weatherSourceType",
            "confidence",
            "timeConfidence",
            "locationConfidence",
            "timeWindowStart",
            "timeWindowEnd",
            "timeWindowReason",
            "joinNotes",
            "provenanceRefCount",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "media_narrative_index.csv",
        media_rows,
        [
            "mediaId",
            "assetType",
            "title",
            "rightsStatus",
            "publishedAt",
            "seriesId",
            "seriesName",
            "seasonYear",
            "eventId",
            "eventName",
            "sessionId",
            "sessionType",
            "sessionName",
            "driverId",
            "driverName",
            "isBryceFocused",
            "hasQuote",
            "summary",
            "url",
            "provenanceRefCount",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "source_evidence_lineage.csv",
        source_rows,
        [
            "sourceId",
            "sourceType",
            "sourceName",
            "confidenceTier",
            "url",
            "hasUrl",
            "linkedUrlCount",
            "retrievedAt",
            "publishedAt",
            "accessedBy",
            "parser",
            "hasRawArtifact",
            "rawArtifactPath",
            "coverage",
            "licenseNotes",
            "notes",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "derived_metric_context.csv",
        derived_rows,
        [
            "metricId",
            "metricType",
            "scope",
            "seriesId",
            "seriesName",
            "seasonYear",
            "eventId",
            "eventName",
            "sessionId",
            "sessionType",
            "sessionName",
            "driverId",
            "driverName",
            "calculationVersion",
            "confidence",
            "formula",
            "inputRefCount",
            "provenanceRefCount",
            "nestedEntityCount",
            "metricHeadline",
            "metricDetail",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "gap_source_boundary_context.csv",
        gap_rows,
        [
            "gapId",
            "scope",
            "status",
            "sourceState",
            "description",
            "provenanceRefCount",
            "rawKeys",
            "displayPolicy",
            "productUse",
            "sourceHash",
        ],
    )

    summary = {
        "ok": True,
        "generatedAt": now_iso(),
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_context_narrative_not_telemetry",
        "publicPointPrediction": False,
        "causalAttribution": False,
        "counts": {
            "timelineRows": len(timeline),
            "sessionRollupRows": len(session_rollups),
            "seriesCoverageRows": len(series_coverage),
            "weatherRows": len(weather_rows),
            "mediaRows": len(media_rows),
            "sourceEvidenceRows": len(source_rows),
            "derivedMetricRows": len(derived_rows),
            "gapRows": len(gap_rows),
        },
        "contextTypeCounts": dict(Counter(row["contextType"] for row in timeline)),
        "derivedMetricTypeCounts": dict(Counter(row["metricType"] for row in derived_rows)),
        "sourceEvidenceTypeCounts": dict(Counter(row["sourceType"] for row in source_rows)),
        "gapStatusCounts": dict(Counter(row["status"] for row in gap_rows)),
        "artifacts": [
            "context_event_timeline.csv",
            "session_context_rollups.csv",
            "series_context_coverage.csv",
            "weather_condition_context.csv",
            "media_narrative_index.csv",
            "source_evidence_lineage.csv",
            "derived_metric_context.csv",
            "gap_source_boundary_context.csv",
            "context-packs/context-event-narrative-context.json",
            "CONTEXT_EVENT_NARRATIVE_LAYER.md",
        ],
    }
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(
        PACK_DIR / "context-event-narrative-context.json",
        build_context_pack(timeline, session_rollups, series_coverage, weather_rows, media_rows, source_rows, derived_rows, gap_rows, source_hash),
    )
    write_report(OUTPUT_DIR / "CONTEXT_EVENT_NARRATIVE_LAYER.md", timeline, session_rollups, series_coverage, weather_rows, media_rows, source_rows, derived_rows, gap_rows, source_hash)

    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT)), "counts": summary["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
