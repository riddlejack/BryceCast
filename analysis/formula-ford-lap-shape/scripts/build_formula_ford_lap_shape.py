#!/usr/bin/env python3
"""Build Formula Ford Bryce-only lap-shape artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/formula-ford-lap-shape"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
FORMULA_FORD_ID = "series_formula_ford"


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


def fmt(value: Any, digits: int = 4) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        if math.isnan(value):
            return ""
        return round(value, digits)
    return value


def fmt_seconds(value: Any, digits: int = 3) -> str:
    formatted = fmt(value, digits)
    return f"{formatted}s" if formatted != "" else "n/a"


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: fmt(row.get(field)) for field in fields})


def parse_time_seconds(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    try:
        parts = text.split(":")
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    except ValueError:
        return None
    return None


def median(values: Iterable[float | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def stdev(values: Iterable[float | None]) -> float | None:
    clean = [float(value) for value in values if value is not None]
    if len(clean) < 2:
        return None
    return float(statistics.pstdev(clean))


def yes_no(value: Any) -> str:
    return "yes" if value is True or value == "yes" else "no"


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "events": {row["id"]: row for row in data["events"]},
        "sessions": {row["id"]: row for row in data["sessions"]},
        "tracks": {row["id"]: row for row in data["tracks"]},
        "results": {row["sessionId"]: row for row in data["results"] if row.get("driverId") == BRYCE_ID},
        "weather": {row["sessionId"]: row for row in data["weatherObservations"] if row.get("sessionId")},
    }


def formula_ford_session_ids(data: dict[str, Any], idx: dict[str, Any]) -> set[str]:
    return {
        session["id"]
        for session in data["sessions"]
        if idx["events"].get(session.get("eventId"), {}).get("seriesId") == FORMULA_FORD_ID
    }


def event_context(session_id: str, idx: dict[str, Any]) -> dict[str, Any]:
    session = idx["sessions"][session_id]
    event = idx["events"][session["eventId"]]
    track = idx["tracks"].get(event.get("trackId"), {})
    weather = idx["weather"].get(session_id, {})
    return {
        "sessionId": session_id,
        "eventId": event["id"],
        "eventName": event.get("name") or "",
        "seasonYear": event.get("seasonYear"),
        "sessionType": session.get("sessionType") or "",
        "sessionName": session.get("sessionName") or "",
        "trackName": track.get("name") or "",
        "trackConfig": track.get("configuration") or "",
        "trackLengthKm": track.get("lengthKm"),
        "wetDry": weather.get("wetDry") or weather.get("trackCondition") or "unknown",
        "weatherConfidence": weather.get("confidence") or "",
    }


def lap_phase(lap_number: int, max_lap: int) -> str:
    if max_lap <= 1:
        return "single_lap"
    pct = (lap_number - 1) / (max_lap - 1)
    if pct < 0.34:
        return "early"
    if pct < 0.67:
        return "middle"
    return "late"


def build_lap_observations(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    session_ids = formula_ford_session_ids(data, idx)
    raw_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lap in data["lapSamples"]:
        if lap.get("sessionId") in session_ids and lap.get("driverId") == BRYCE_ID:
            raw_by_session[lap["sessionId"]].append(lap)

    observations: list[dict[str, Any]] = []
    for session_id, rows in sorted(raw_by_session.items()):
        context = event_context(session_id, idx)
        ordered = sorted(rows, key=lambda row: int(row.get("lapNumber") or 0))
        parsed_times = {
            int(row.get("lapNumber") or 0): parse_time_seconds(row.get("lapTime"))
            for row in ordered
            if row.get("lapNumber") is not None
        }
        valid_times = [value for value in parsed_times.values() if value is not None]
        best = min(valid_times) if valid_times else None
        max_lap = max(parsed_times) if parsed_times else 0
        for row in ordered:
            lap_number = int(row.get("lapNumber") or 0)
            lap_time = parsed_times.get(lap_number)
            is_valid = row.get("isValid") is True and lap_time is not None
            delta_to_best = lap_time - best if is_valid and best is not None and lap_time is not None else None
            raw_diff = parse_time_seconds((row.get("raw") or {}).get("diffToPersonalBest"))
            observations.append(
                {
                    **context,
                    "lapNumber": lap_number,
                    "lapTimeSeconds": lap_time,
                    "averageSpeedKph": row.get("averageSpeedKph"),
                    "isValid": yes_no(is_valid),
                    "deltaToSessionBestSeconds": delta_to_best,
                    "rawDiffToPersonalBestSeconds": raw_diff,
                    "lapPctOfSession": ((lap_number - 1) / (max_lap - 1)) if max_lap > 1 and lap_number > 0 else None,
                    "lapPhase": lap_phase(lap_number, max_lap),
                    "outlierSlowLap": yes_no(bool(delta_to_best is not None and best is not None and delta_to_best > max(3.0, best * 0.08))),
                    "sourceTitle": (row.get("raw") or {}).get("sourceTitle") or "",
                    "parser": (row.get("raw") or {}).get("parser") or "",
                    "analysisPosition": (row.get("raw") or {}).get("analysisPosition"),
                    "sourceTimestamp": row.get("sourceTimestamp") or "",
                    "sourceState": "official_lap_analysis_bryce_labeled_block",
                    "sourceHash": source_hash,
                }
            )
    return observations


def classify_shape(valid_rows: list[dict[str, Any]], best: float | None, first_to_best: float | None, median_delta: float | None, late_delta: float | None, slow_count: int) -> str:
    if len(valid_rows) < 5:
        return "sparse_source_window"
    slow_share = slow_count / len(valid_rows)
    if slow_share >= 0.25:
        return "interrupted_or_variable"
    if first_to_best is not None and first_to_best >= 5 and late_delta is not None and late_delta <= 2.0:
        return "large_ramp_to_pace"
    if median_delta is not None and median_delta <= 0.7:
        return "tight_consistent_run"
    if late_delta is not None and median_delta is not None and late_delta > median_delta + 2.0:
        return "late_fade_or_conditions"
    return "progressive_session_shape"


def build_session_summaries(observations: list[dict[str, Any]], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        by_session[row["sessionId"]].append(row)
    rows: list[dict[str, Any]] = []
    for session_id, session_rows in sorted(by_session.items()):
        ordered = sorted(session_rows, key=lambda row: int(row["lapNumber"]))
        valid = [row for row in ordered if row["isValid"] == "yes" and row.get("lapTimeSeconds") is not None]
        valid_times = [row["lapTimeSeconds"] for row in valid]
        best = min(valid_times) if valid_times else None
        best_rows = [row for row in valid if row.get("lapTimeSeconds") == best]
        best_row = best_rows[0] if best_rows else None
        first_valid = valid[0] if valid else None
        deltas = [row.get("deltaToSessionBestSeconds") for row in valid if row.get("deltaToSessionBestSeconds") is not None]
        late = [row for row in valid if row["lapPhase"] == "late"]
        late_deltas = [row.get("deltaToSessionBestSeconds") for row in late if row.get("deltaToSessionBestSeconds") is not None]
        slow_count = sum(1 for row in valid if row["outlierSlowLap"] == "yes")
        result = idx["results"].get(session_id, {})
        first_to_best = (
            first_valid.get("lapTimeSeconds") - best
            if first_valid is not None and first_valid.get("lapTimeSeconds") is not None and best is not None
            else None
        )
        median_delta = median(deltas)
        late_delta = median(late_deltas)
        rows.append(
            {
                **{key: ordered[0][key] for key in ["sessionId", "eventId", "eventName", "seasonYear", "sessionType", "sessionName", "trackName", "trackConfig", "trackLengthKm", "wetDry", "weatherConfidence"]},
                "sourceLapRows": len(ordered),
                "validLapCount": len(valid),
                "bestLapSeconds": best,
                "bestLapNumber": best_row.get("lapNumber") if best_row else None,
                "bestLapPctOfSession": best_row.get("lapPctOfSession") if best_row else None,
                "medianValidLapSeconds": median(valid_times),
                "medianDeltaToBestSeconds": median_delta,
                "lapTimeStdDevSeconds": stdev(valid_times),
                "firstValidLapSeconds": first_valid.get("lapTimeSeconds") if first_valid else None,
                "firstToBestImprovementSeconds": first_to_best,
                "lateMedianDeltaToBestSeconds": late_delta,
                "slowOutlierCount": slow_count,
                "shapeArchetype": classify_shape(valid, best, first_to_best, median_delta, late_delta, slow_count),
                "finishPosition": result.get("finishPosition"),
                "startPosition": result.get("startPosition"),
                "finishPercentile": result.get("finishPercentile"),
                "fieldSize": result.get("fieldSize"),
                "status": result.get("status") or "",
                "sourceState": "official_lap_analysis_bryce_only_session_shape",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_event_progression(session_rows: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in session_rows:
        by_event[row["eventId"]].append(row)
    out: list[dict[str, Any]] = []
    for event_id, rows in sorted(by_event.items()):
        valid_best_rows = [row for row in rows if row.get("bestLapSeconds") is not None]
        best_row = min(valid_best_rows, key=lambda row: row["bestLapSeconds"]) if valid_best_rows else None
        qualifying = [row for row in valid_best_rows if row["sessionType"] == "qualifying"]
        race_heat = [row for row in valid_best_rows if row["sessionType"] in {"race", "heat"}]
        q_best = min((row["bestLapSeconds"] for row in qualifying), default=None)
        r_best = min((row["bestLapSeconds"] for row in race_heat), default=None)
        out.append(
            {
                "eventId": event_id,
                "eventName": rows[0]["eventName"],
                "trackName": rows[0]["trackName"],
                "lapSessionCount": len(rows),
                "sourceLapRows": sum(int(row["sourceLapRows"]) for row in rows),
                "validLapCount": sum(int(row["validLapCount"]) for row in rows),
                "qualifyingBestLapSeconds": q_best,
                "raceHeatBestLapSeconds": r_best,
                "qualifyingMinusRaceHeatBestSeconds": q_best - r_best if q_best is not None and r_best is not None else None,
                "eventBestLapSeconds": best_row.get("bestLapSeconds") if best_row else None,
                "eventBestSessionId": best_row.get("sessionId") if best_row else "",
                "eventBestSessionName": best_row.get("sessionName") if best_row else "",
                "wetDryStates": ";".join(sorted({row.get("wetDry") or "unknown" for row in rows})),
                "shapeArchetypes": ";".join(sorted({row.get("shapeArchetype") or "unknown" for row in rows})),
                "sourceState": "official_lap_analysis_bryce_only_event_progression",
                "sourceHash": source_hash,
            }
        )
    return out


def build_condition_rows(session_rows: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_group: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in session_rows:
        by_group[(row.get("wetDry") or "unknown", row.get("sessionType") or "session")].append(row)
    rows: list[dict[str, Any]] = []
    for (wet_dry, session_type), group in sorted(by_group.items()):
        rows.append(
            {
                "wetDry": wet_dry,
                "sessionType": session_type,
                "sessionCount": len(group),
                "sourceLapRows": sum(int(row["sourceLapRows"]) for row in group),
                "validLapCount": sum(int(row["validLapCount"]) for row in group),
                "medianBestLapSeconds": median(row.get("bestLapSeconds") for row in group),
                "medianSessionMedianLapSeconds": median(row.get("medianValidLapSeconds") for row in group),
                "medianSessionDeltaToBestSeconds": median(row.get("medianDeltaToBestSeconds") for row in group),
                "medianStdDevSeconds": median(row.get("lapTimeStdDevSeconds") for row in group),
                "shapeArchetypes": ";".join(sorted({row.get("shapeArchetype") or "unknown" for row in group})),
                "sourceState": "official_lap_analysis_bryce_only_condition_shape",
                "sourceHash": source_hash,
            }
        )
    return rows


def build_context_pack(
    generated_at: str,
    source_hash: str,
    counts: dict[str, int],
    session_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    condition_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    most_consistent = sorted(
        [row for row in session_rows if row.get("lapTimeStdDevSeconds") is not None and int(row.get("validLapCount") or 0) >= 8],
        key=lambda row: row["lapTimeStdDevSeconds"],
    )[:8]
    biggest_ramps = sorted(
        [row for row in session_rows if row.get("firstToBestImprovementSeconds") is not None],
        key=lambda row: row["firstToBestImprovementSeconds"],
        reverse=True,
    )[:8]
    return {
        "id": "formula-ford-lap-shape-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_bryce_only_lap_shape",
        "publicPointPrediction": False,
        "fieldRelativePaceAvailable": False,
        "artifacts": [
            "formula_ford_lap_observations.csv",
            "formula_ford_session_lap_shape.csv",
            "formula_ford_event_progression.csv",
            "formula_ford_condition_lap_shape.csv",
        ],
        "counts": counts,
        "mostConsistentSessions": most_consistent,
        "largestFirstToBestRamps": biggest_ramps,
        "eventProgression": event_rows,
        "conditionContext": condition_rows,
        "displayRules": [
            "Use this as Bryce-only lap-analysis shape: improvement, consistency, disruption, and session context.",
            "Do not compare these lap rows against opponents because the imported samples are Bryce-only labeled blocks.",
            "Do not expand continuation pages without repeated Bryce labels unless ingestion/parser ownership approves it.",
            "Sparse source windows should show lap-count badges and avoid broad conclusions.",
        ],
    }


def render_report(
    generated_at: str,
    source_hash: str,
    counts: dict[str, int],
    session_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    condition_rows: list[dict[str, Any]],
) -> str:
    session_lines = "\n".join(
        f"- {row['eventName']} {row['sessionName']}: best {fmt_seconds(row.get('bestLapSeconds'))}, median delta {fmt_seconds(row.get('medianDeltaToBestSeconds'))}, {row['shapeArchetype']}, laps {row['validLapCount']}."
        for row in sorted(session_rows, key=lambda row: (row["eventName"], row["sessionName"]))[:12]
    )
    event_lines = "\n".join(
        f"- {row['eventName']}: {row['lapSessionCount']} lap-analysis sessions, event best {fmt_seconds(row.get('eventBestLapSeconds'))} in {row.get('eventBestSessionName') or 'n/a'}, conditions {row['wetDryStates']}."
        for row in event_rows
    )
    condition_lines = "\n".join(
        f"- {row['wetDry']} {row['sessionType']}: sessions {row['sessionCount']}, valid laps {row['validLapCount']}, median best {fmt_seconds(row.get('medianBestLapSeconds'))}, shape {row['shapeArchetypes']}."
        for row in condition_rows
    )
    return f"""# Formula Ford Lap Shape

Generated: `{generated_at}`
Source dataset: `data/career/career.dataset.json`
Source hash: `{source_hash}`

## Source Scope

This lane uses official 2020 Formula Ford lap-analysis rows where the imported source block is explicitly labeled for Bryce Aron. It supports Bryce-only lap shape, warm-up, consistency, slow-spike, event progression, and official wet/dry condition context. It does not support opponent lap comparisons or unlabeled continuation-page expansion.

## What Became Productized

- `formula_ford_lap_observations.csv`: {counts['lapObservations']} Bryce-labeled lap-analysis rows.
- `formula_ford_session_lap_shape.csv`: {counts['sessionSummaries']} session lap-shape summaries.
- `formula_ford_event_progression.csv`: {counts['eventProgressionRows']} event progression rows.
- `formula_ford_condition_lap_shape.csv`: {counts['conditionRows']} wet/damp/drying/dry session-context rows.
- Context pack: `context-packs/formula-ford-lap-shape-context.json`.

## Session Lap Shape

{session_lines}

## Event Progression

{event_lines}

## Condition Context

{condition_lines}

## Caveats

- The source is Bryce-only labeled lap-analysis, so use it for personal lap shape rather than opponent pace comparison.
- Continuation pages without a repeated Bryce label remain outside this lane until ingestion/parser ownership approves expansion.
- Sparse source windows are retained with lap counts; they should not be used for broad conclusions.
- Session condition labels are official timing/report rows, but they are context rather than causal proof.
"""


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    data = load_dataset()
    idx = build_indexes(data)
    source_hash = dataset_hash()
    generated_at = now_iso()

    observations = build_lap_observations(data, idx, source_hash)
    session_rows = build_session_summaries(observations, idx, source_hash)
    event_rows = build_event_progression(session_rows, source_hash)
    condition_rows = build_condition_rows(session_rows, source_hash)
    counts = {
        "lapObservations": len(observations),
        "sessionSummaries": len(session_rows),
        "eventProgressionRows": len(event_rows),
        "conditionRows": len(condition_rows),
    }
    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "source_bounded_bryce_only_lap_shape",
        "publicPointPrediction": False,
        "fieldRelativePaceAvailable": False,
        "counts": counts,
        "caveats": [
            "Formula Ford lap samples are Bryce-only labeled lap-analysis blocks.",
            "Continuation-page rows without repeated Bryce labels are not expanded in this lane.",
            "Use lap counts and source-shape caveats before drawing broad conclusions from sparse sessions.",
        ],
    }
    pack = build_context_pack(generated_at, source_hash, counts, session_rows, event_rows, condition_rows)

    write_csv(
        OUTPUT_DIR / "formula_ford_lap_observations.csv",
        observations,
        [
            "sessionId",
            "eventId",
            "eventName",
            "seasonYear",
            "sessionType",
            "sessionName",
            "trackName",
            "trackConfig",
            "trackLengthKm",
            "wetDry",
            "weatherConfidence",
            "lapNumber",
            "lapTimeSeconds",
            "averageSpeedKph",
            "isValid",
            "deltaToSessionBestSeconds",
            "rawDiffToPersonalBestSeconds",
            "lapPctOfSession",
            "lapPhase",
            "outlierSlowLap",
            "sourceTitle",
            "parser",
            "analysisPosition",
            "sourceTimestamp",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "formula_ford_session_lap_shape.csv",
        session_rows,
        [
            "sessionId",
            "eventId",
            "eventName",
            "seasonYear",
            "sessionType",
            "sessionName",
            "trackName",
            "trackConfig",
            "trackLengthKm",
            "wetDry",
            "weatherConfidence",
            "sourceLapRows",
            "validLapCount",
            "bestLapSeconds",
            "bestLapNumber",
            "bestLapPctOfSession",
            "medianValidLapSeconds",
            "medianDeltaToBestSeconds",
            "lapTimeStdDevSeconds",
            "firstValidLapSeconds",
            "firstToBestImprovementSeconds",
            "lateMedianDeltaToBestSeconds",
            "slowOutlierCount",
            "shapeArchetype",
            "finishPosition",
            "startPosition",
            "finishPercentile",
            "fieldSize",
            "status",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "formula_ford_event_progression.csv",
        event_rows,
        [
            "eventId",
            "eventName",
            "trackName",
            "lapSessionCount",
            "sourceLapRows",
            "validLapCount",
            "qualifyingBestLapSeconds",
            "raceHeatBestLapSeconds",
            "qualifyingMinusRaceHeatBestSeconds",
            "eventBestLapSeconds",
            "eventBestSessionId",
            "eventBestSessionName",
            "wetDryStates",
            "shapeArchetypes",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "formula_ford_condition_lap_shape.csv",
        condition_rows,
        [
            "wetDry",
            "sessionType",
            "sessionCount",
            "sourceLapRows",
            "validLapCount",
            "medianBestLapSeconds",
            "medianSessionMedianLapSeconds",
            "medianSessionDeltaToBestSeconds",
            "medianStdDevSeconds",
            "shapeArchetypes",
            "sourceState",
            "sourceHash",
        ],
    )
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "formula-ford-lap-shape-context.json", pack)
    (OUTPUT_DIR / "FORMULA_FORD_LAP_SHAPE.md").write_text(
        render_report(generated_at, source_hash, counts, session_rows, event_rows, condition_rows)
    )
    print(json.dumps({"ok": True, "output": str(OUTPUT_DIR.relative_to(ROOT)), "counts": counts}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
