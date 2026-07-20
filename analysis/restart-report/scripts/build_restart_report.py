#!/usr/bin/env python3
"""Build the Restart Report Card lane.

For every INDY NXT race with an official lap chart, identify each restart from
the official caution-lap summaries and measure how the running order moved over
the two green laps that follow. Bryce's movement is always shown against the
full field so every claim carries a denominator.

Restart definition (documented so the UI never has to guess):
  - Caution laps come from the official Results-PDF caution summaries carried in
    the canonical dataset's `incidents` (raw.startLap..raw.endLap).
  - Consecutive caution laps merge into one caution period. The restart is the
    first green lap after that period ends.
  - A caution period that ends on the final lap produced NO restart (the race
    finished under yellow) and is recorded, not counted.
  - The measured window is the up-to-two green laps after the restart. If a
    fresh caution or the finish arrives first, the window truncates to the green
    laps actually run, and the row records how many.
  - "Positions gained" for a driver = running position at the last caution lap
    (the restart order) minus the running position two green laps later. Positive
    means the driver moved forward. Only drivers present at both laps are
    classified for that restart.

Everything is positions, never lap times: the lap chart carries running order
only. If a race has no official lap chart it is marked uncovered, never
estimated.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/restart-report"
OUTPUT = LANE / "output"
TABLES = OUTPUT / "tables"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"
WINDOW_LAPS = 2

# The field baseline (Brief K v2) needs enough restarts at a venue before a
# "typical movement here" figure reads as a norm rather than one noisy day. Below
# this, the venue row is emitted with its denominator but flagged not-stable so
# the UI can fall back to the series-wide baseline instead of headlining a thin N.
MIN_BASELINE_RESTARTS = 3

# Two races verified against the official Results-PDF caution summaries by hand;
# the values below are reproduced in the report and re-derived by the validator.
HAND_VERIFIED_SESSIONS = ("session_indy_nxt_2024_6314", "session_indy_nxt_2024_6315")


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
    digest = hashlib.sha256()
    with DATASET_PATH.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_dataset() -> dict[str, Any]:
    with DATASET_PATH.open() as handle:
        return json.load(handle)


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def clean_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number != number:  # NaN
        return None
    return int(number)


def slug(value: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return out or "venue"


def venue_slug(track_name: str) -> str:
    normalized = (track_name or "").lower()
    if "mid-ohio" in normalized:
        return "mid_ohio"
    return slug(track_name)


def parse_event_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def round1(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value + 0.0, 3)


def median(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def mean(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(statistics.fmean(clean))


# ----------------------------------------------------------------------------- #
# Indexing
# ----------------------------------------------------------------------------- #


def build_context(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data.get("events", [])}
    tracks = {row["id"]: row for row in data.get("tracks", [])}
    drivers = {row["id"]: row for row in data.get("drivers", [])}
    return {"events": events, "tracks": tracks, "drivers": drivers}


def indy_nxt_race_sessions(data: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    out = []
    for session in data.get("sessions", []):
        event = ctx["events"].get(session.get("eventId"), {})
        if event.get("seriesId") != INDY_NXT_ID or session.get("sessionType") != "race":
            continue
        track = ctx["tracks"].get(event.get("trackId"), {})
        out.append(
            {
                "sessionId": session["id"],
                "eventId": session.get("eventId"),
                "raceLabel": session.get("raceLabel") or event.get("name") or session["id"],
                "seasonYear": clean_int(event.get("seasonYear"))
                or clean_int((re.search(r"_(\d{4})_", session["id"]) or [None, None])[1]),
                "trackName": track.get("name") or event.get("trackName") or "Unknown venue",
                "trackType": track.get("trackType") or track.get("type") or event.get("trackType") or "unknown",
                "eventStartDate": event.get("eventStartDate"),
            }
        )
    out.sort(key=lambda row: (row["seasonYear"] or 0, str(row["sessionId"])))
    return out


def caution_laps_by_session(data: dict[str, Any]) -> dict[str, set[int]]:
    out: dict[str, set[int]] = defaultdict(set)
    for incident in data.get("incidents", []):
        raw = incident.get("raw", {}) or {}
        start = clean_int(raw.get("startLap") if raw.get("startLap") is not None else incident.get("lapNumber"))
        end = clean_int(raw.get("endLap") if raw.get("endLap") is not None else raw.get("startLap"))
        if end is None:
            end = start
        if start is None or end is None or start <= 0 or end <= 0:
            continue
        type_text = str(incident.get("incidentType", "")).lower()
        desc_text = str(incident.get("description", "")).lower()
        if "caution" not in type_text and "caution" not in desc_text:
            continue
        for lap_no in range(start, end + 1):
            out[incident["sessionId"]].add(lap_no)
    return out


def caution_summaries_by_session(data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for incident in data.get("incidents", []):
        raw = incident.get("raw", {}) or {}
        type_text = str(incident.get("incidentType", "")).lower()
        desc_text = str(incident.get("description", "")).lower()
        if "caution" not in type_text and "caution" not in desc_text:
            continue
        start = clean_int(raw.get("startLap") if raw.get("startLap") is not None else incident.get("lapNumber"))
        end = clean_int(raw.get("endLap") if raw.get("endLap") is not None else raw.get("startLap"))
        if end is None:
            end = start
        if start is None or end is None:
            continue
        out[incident["sessionId"]].append(
            {
                "number": clean_int(raw.get("cautionNumber")),
                "startLap": start,
                "endLap": end,
                "reason": raw.get("reason") or "Caution",
            }
        )
    for rows in out.values():
        rows.sort(key=lambda row: (row["startLap"], row["endLap"]))
    return out


def caution_runs(caution_laps: set[int]) -> list[dict[str, int]]:
    """Merge consecutive caution laps into maximal caution periods."""
    laps = sorted(caution_laps)
    runs: list[dict[str, int]] = []
    current: dict[str, int] | None = None
    for lap in laps:
        if current and lap == current["end"] + 1:
            current["end"] = lap
        else:
            if current:
                runs.append(current)
            current = {"start": lap, "end": lap}
    if current:
        runs.append(current)
    return runs


# ----------------------------------------------------------------------------- #
# Per-session lap chart
# ----------------------------------------------------------------------------- #


def lap_chart_by_session(data: dict[str, Any], session_ids: set[str]) -> dict[str, dict[str, dict[int, int]]]:
    """sessionId -> driverId -> {lapNumber: position}."""
    out: dict[str, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))
    for sample in data.get("lapSamples", []):
        session_id = sample.get("sessionId")
        if session_id not in session_ids:
            continue
        position = sample.get("position")
        lap_no = sample.get("lapNumber")
        if position is None or lap_no is None:
            continue
        try:
            out[session_id][sample["driverId"]][int(lap_no)] = int(position)
        except (TypeError, ValueError):
            continue
    return out


def results_by_session(data: dict[str, Any], session_ids: set[str]) -> dict[str, dict[str, dict[str, Any]]]:
    out: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
    for result in data.get("results", []):
        session_id = result.get("sessionId")
        if session_id in session_ids:
            out[session_id][result.get("driverId")] = result
    return out


def main() -> None:
    data = load_dataset()
    ctx = build_context(data)
    source_hash = dataset_hash()

    race_sessions = indy_nxt_race_sessions(data, ctx)
    session_ids = {row["sessionId"] for row in race_sessions}
    charts = lap_chart_by_session(data, session_ids)
    results = results_by_session(data, session_ids)
    caution_laps = caution_laps_by_session(data)
    caution_summaries = caution_summaries_by_session(data)
    driver_name = {driver_id: (driver.get("displayName") or driver_id) for driver_id, driver in ctx["drivers"].items()}

    event_rows: list[dict[str, Any]] = []
    driver_delta_rows: list[dict[str, Any]] = []
    race_rows: list[dict[str, Any]] = []
    uncovered_rows: list[dict[str, Any]] = []

    sessions_with_chart = 0
    races_with_restarts = 0
    races_no_caution = 0
    end_of_race_cautions = 0

    for session in race_sessions:
        session_id = session["sessionId"]
        chart = charts.get(session_id)
        if not chart:
            uncovered_rows.append(
                {
                    "sessionId": session_id,
                    "seasonYear": session["seasonYear"],
                    "raceLabel": session["raceLabel"],
                    "trackName": session["trackName"],
                    "reason": "no_official_lap_chart",
                    "note": "No official lap-chart positions are available for this session.",
                }
            )
            continue
        sessions_with_chart += 1

        total_laps = max((max(laps) for laps in chart.values() if laps), default=0)
        session_results = results.get(session_id, {})
        bryce_result = session_results.get(BRYCE_ID)
        bryce_team_id = bryce_result.get("teamId") if bryce_result else None
        bryce_in_chart = BRYCE_ID in chart and bool(chart[BRYCE_ID])

        cautions = caution_laps.get(session_id, set())
        if not cautions:
            races_no_caution += 1
        runs = caution_runs(cautions)
        summaries = caution_summaries.get(session_id, [])

        # Attribute each caution period to the official caution numbers it covers.
        def summaries_for(run: dict[str, int]) -> list[dict[str, Any]]:
            return [s for s in summaries if not (s["endLap"] < run["start"] or s["startLap"] > run["end"])]

        restarts: list[dict[str, Any]] = []
        restart_index = 0
        for run in runs:
            restart_lap = run["end"] + 1
            if restart_lap > total_laps:
                end_of_race_cautions += 1
                continue
            baseline_lap = run["end"]
            # Count consecutive green laps after the restart, capped at WINDOW_LAPS.
            window: list[int] = []
            lap = restart_lap
            while lap <= total_laps and lap not in cautions and len(window) < WINDOW_LAPS:
                window.append(lap)
                lap += 1
            if not window:
                # Restart lap itself is green by construction; only reachable if the
                # race ended exactly at the restart lap.
                end_of_race_cautions += 1
                continue
            restart_index += 1
            window_laps = len(window)
            window_end_lap = window[-1]
            full_window = window_laps == WINDOW_LAPS
            if window_end_lap >= total_laps and not full_window:
                truncate_reason = "race_end"
            elif not full_window:
                truncate_reason = "next_caution"
            else:
                truncate_reason = ""

            related = summaries_for(run)
            caution_numbers = ";".join(str(s["number"]) for s in related if s["number"] is not None)
            caution_reasons = " · ".join(dict.fromkeys(s["reason"] for s in related)) if related else ""

            # Field distribution: every driver present at both endpoints.
            field: list[dict[str, Any]] = []
            for driver_id, laps in chart.items():
                pos0 = laps.get(baseline_lap)
                pos1 = laps.get(window_end_lap)
                if pos0 is None or pos1 is None:
                    continue
                result = session_results.get(driver_id)
                net = pos0 - pos1
                field.append(
                    {
                        "driverId": driver_id,
                        "driverName": driver_name.get(driver_id, driver_id),
                        "carNumber": (result or {}).get("carNumber"),
                        "isBryce": driver_id == BRYCE_ID,
                        "isTeammate": driver_id != BRYCE_ID
                        and bryce_team_id is not None
                        and (result or {}).get("teamId") == bryce_team_id,
                        "baselinePosition": pos0,
                        "restartPosition": laps.get(restart_lap),
                        "endPosition": pos1,
                        "net": net,
                    }
                )
            field.sort(key=lambda row: -row["net"])
            field_nets = [row["net"] for row in field]
            field_median = median([float(n) for n in field_nets])
            field_best = max(field_nets) if field_nets else None

            bryce_entry = next((row for row in field if row["isBryce"]), None)
            bryce_net = bryce_entry["net"] if bryce_entry else None
            if bryce_entry is not None:
                better = sum(1 for row in field if row["net"] > bryce_entry["net"])
                bryce_rank = better + 1
            else:
                bryce_rank = None

            restart = {
                "sessionId": session_id,
                "seasonYear": session["seasonYear"],
                "raceLabel": session["raceLabel"],
                "trackName": session["trackName"],
                "trackType": session["trackType"],
                "venueSlug": venue_slug(session["trackName"]),
                "restartIndex": restart_index,
                "cautionNumbers": caution_numbers,
                "cautionReasons": caution_reasons,
                "totalLaps": total_laps,
                "baselineLap": baseline_lap,
                "restartLap": restart_lap,
                "windowLaps": window_laps,
                "windowEndLap": window_end_lap,
                "fullWindow": "true" if full_window else "false",
                "truncated": "false" if full_window else "true",
                "truncateReason": truncate_reason,
                "fieldClassified": len(field),
                "fieldNetMedian": round1(field_median),
                "fieldNetBest": field_best,
                "bryceClassified": "true" if bryce_entry else "false",
                "bryceBaselinePosition": bryce_entry["baselinePosition"] if bryce_entry else None,
                "bryceRestartPosition": bryce_entry["restartPosition"] if bryce_entry else None,
                "bryceEndPosition": bryce_entry["endPosition"] if bryce_entry else None,
                "bryceNet": bryce_net,
                "bryceRankInField": bryce_rank,
                "bryceFieldSizeRanked": len(field) if bryce_entry else None,
                "sourceHash": source_hash,
            }
            restarts.append(restart)
            event_rows.append(restart)

            for row in field:
                driver_delta_rows.append(
                    {
                        "sessionId": session_id,
                        "restartIndex": restart_index,
                        "restartLap": restart_lap,
                        "driverId": row["driverId"],
                        "driverName": row["driverName"],
                        "carNumber": row["carNumber"],
                        "isBryce": "true" if row["isBryce"] else "false",
                        "isTeammate": "true" if row["isTeammate"] else "false",
                        "baselinePosition": row["baselinePosition"],
                        "endPosition": row["endPosition"],
                        "net": row["net"],
                        "sourceHash": source_hash,
                    }
                )

        if restarts:
            races_with_restarts += 1

        # Per-race aggregate.
        bryce_restart_nets = [r["bryceNet"] for r in restarts if r["bryceNet"] is not None]
        bryce_counted = len(bryce_restart_nets)
        bryce_net_total = sum(bryce_restart_nets) if bryce_counted else 0
        bryce_gained = sum(1 for n in bryce_restart_nets if n > 0)
        bryce_held = sum(1 for n in bryce_restart_nets if n == 0)
        bryce_slipped = sum(1 for n in bryce_restart_nets if n < 0)

        # Field-wide totals across this race's restarts, for a rank denominator.
        driver_totals: dict[str, float] = defaultdict(float)
        for restart in restarts:
            for row in field_rows_for(driver_delta_rows, session_id, restart["restartIndex"]):
                driver_totals[row["driverId"]] += row["net"]

        # The field's typical day: median of every classified driver's summed
        # restart movement this race. "Beat the field's typical move" at day
        # grain = Bryce's day net strictly above that median.
        field_median_net = median([float(total) for total in driver_totals.values()])
        bryce_beat_field_typical = (
            bryce_counted > 0 and field_median_net is not None and bryce_net_total > field_median_net
        )

        sole_best = "false"
        co_best = "false"
        bryce_rank_race = None
        field_size_ranked = len(driver_totals)
        if bryce_counted and restarts:
            bryce_total = driver_totals.get(BRYCE_ID, 0)
            better = sum(1 for did, tot in driver_totals.items() if did != BRYCE_ID and tot > bryce_total)
            equal = sum(1 for did, tot in driver_totals.items() if did != BRYCE_ID and tot == bryce_total)
            bryce_rank_race = better + 1
            classified_all = bryce_counted == len(restarts)
            if classified_all and better == 0 and equal == 0:
                sole_best = "true"
            if classified_all and better == 0:
                co_best = "true"

        coverage_note = ""
        if not bryce_in_chart and restarts:
            coverage_note = "bryce_absent_from_lap_chart"
            uncovered_rows.append(
                {
                    "sessionId": session_id,
                    "seasonYear": session["seasonYear"],
                    "raceLabel": session["raceLabel"],
                    "trackName": session["trackName"],
                    "reason": "bryce_absent_from_lap_chart",
                    "note": "The field's restarts are measured, but Bryce has no lap-chart line this race.",
                }
            )
        elif restarts and bryce_counted < len(restarts):
            coverage_note = "bryce_partial_restart_coverage"

        race_rows.append(
            {
                "sessionId": session_id,
                "seasonYear": session["seasonYear"],
                "raceLabel": session["raceLabel"],
                "trackName": session["trackName"],
                "trackType": session["trackType"],
                "venueSlug": venue_slug(session["trackName"]),
                "restartCount": len(restarts),
                "cautionPeriods": len(runs),
                "bryceRestartsCounted": bryce_counted,
                "bryceNet": bryce_net_total,
                "bryceGained": bryce_gained,
                "bryceHeld": bryce_held,
                "bryceSlipped": bryce_slipped,
                "bryceRankInField": bryce_rank_race,
                "fieldSizeRanked": field_size_ranked,
                "fieldMedianNet": round1(field_median_net),
                "bryceBeatFieldTypical": "true" if bryce_beat_field_typical else "false",
                "soleBestInField": sole_best,
                "coBestInField": co_best,
                "coverageNote": coverage_note,
                "sourceHash": source_hash,
            }
        )

    # ------------------------------------------------------------------------- #
    # Rollups
    # ------------------------------------------------------------------------- #
    venue_rows = rollup(race_rows, event_rows, key="venueSlug", label_fields=("trackName", "trackType"), source_hash=source_hash)
    season_rows = rollup(race_rows, event_rows, key="seasonYear", label_fields=(), source_hash=source_hash)

    # Career figures.
    all_bryce_nets = [r["bryceNet"] for r in event_rows if r["bryceNet"] is not None]
    career_counted = len(all_bryce_nets)
    beat_field_median = sum(
        1
        for r in event_rows
        if r["bryceNet"] is not None and r["fieldNetMedian"] is not None and r["bryceNet"] > r["fieldNetMedian"]
    )
    field_avg_per_restart = mean(
        [row["net"] for row in driver_delta_rows if row["isBryce"] == "false"]
    )
    career = {
        "totalRestarts": len(event_rows),
        "bryceRestartsCounted": career_counted,
        "bryceGained": sum(1 for n in all_bryce_nets if n > 0),
        "bryceHeld": sum(1 for n in all_bryce_nets if n == 0),
        "bryceSlipped": sum(1 for n in all_bryce_nets if n < 0),
        "bryceNet": sum(all_bryce_nets) if career_counted else 0,
        "avgBryceNetPerRestart": round1(mean([float(n) for n in all_bryce_nets])),
        "fieldAvgNetPerRestart": round1(field_avg_per_restart),
        "restartsBeatFieldMedian": beat_field_median,
        "racesSoleBestInField": sum(1 for r in race_rows if r["soleBestInField"] == "true"),
        "racesWithRestarts": races_with_restarts,
    }

    hand_verification = build_hand_verification(event_rows)
    venue_baseline_rows, field_baseline = build_field_baselines(event_rows, driver_delta_rows, source_hash)

    write_csv(
        TABLES / "restart_events.csv",
        event_rows,
        [
            "sessionId", "seasonYear", "raceLabel", "trackName", "trackType", "venueSlug",
            "restartIndex", "cautionNumbers", "cautionReasons", "totalLaps", "baselineLap",
            "restartLap", "windowLaps", "windowEndLap", "fullWindow", "truncated", "truncateReason",
            "fieldClassified", "fieldNetMedian", "fieldNetBest", "bryceClassified",
            "bryceBaselinePosition", "bryceRestartPosition", "bryceEndPosition", "bryceNet",
            "bryceRankInField", "bryceFieldSizeRanked", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "restart_driver_deltas.csv",
        driver_delta_rows,
        [
            "sessionId", "restartIndex", "restartLap", "driverId", "driverName", "carNumber",
            "isBryce", "isTeammate", "baselinePosition", "endPosition", "net", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "restart_by_race.csv",
        race_rows,
        [
            "sessionId", "seasonYear", "raceLabel", "trackName", "trackType", "venueSlug",
            "restartCount", "cautionPeriods", "bryceRestartsCounted", "bryceNet", "bryceGained",
            "bryceHeld", "bryceSlipped", "bryceRankInField", "fieldSizeRanked", "fieldMedianNet",
            "bryceBeatFieldTypical", "soleBestInField", "coBestInField", "coverageNote", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "restart_by_venue.csv",
        venue_rows,
        [
            "venueSlug", "trackName", "trackType", "seasons", "races", "restarts",
            "bryceRestartsCounted", "bryceNet", "bryceGained", "bryceHeld", "bryceSlipped",
            "avgBryceNetPerRestart", "fieldAvgNetPerRestart", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "restart_by_season.csv",
        season_rows,
        [
            "seasonYear", "races", "restarts", "bryceRestartsCounted", "bryceNet", "bryceGained",
            "bryceHeld", "bryceSlipped", "avgBryceNetPerRestart", "fieldAvgNetPerRestart", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "restart_venue_baseline.csv",
        venue_baseline_rows,
        [
            "venueSlug", "trackName", "trackType", "seasons", "spanFirstSeason", "spanLastSeason",
            "restarts", "driverObservations", "meanAbsoluteFieldMove", "medianFieldMove", "stable", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "uncovered_races.csv",
        uncovered_rows,
        ["sessionId", "seasonYear", "raceLabel", "trackName", "reason", "note"],
    )

    summary = {
        "schemaVersion": "brycecast.restartReport.v1",
        "generatedAt": now_iso(),
        "runDate": RUN_DATE.isoformat(),
        "datasetSha256": source_hash,
        "windowLaps": WINDOW_LAPS,
        "method": {
            "restartDefinition": "First green lap after a caution period (consecutive official caution laps merged); cautions that end on the final lap produce no restart.",
            "measurement": "Positions gained = running position at the last caution lap minus running position two green laps later; window truncates to the green laps actually run before a fresh caution or the finish.",
            "currency": "positions",
            "source": "Official Results-PDF caution summaries and official lap-chart positions in data/career/career.dataset.json.",
            "precision": "lap-chart",
        },
        "coverage": {
            "indyNxtRaceSessions": len(race_sessions),
            "sessionsWithLapChart": sessions_with_chart,
            "racesWithRestarts": races_with_restarts,
            "racesNoCaution": races_no_caution,
            "endOfRaceCautionsExcluded": end_of_race_cautions,
            "racesUncovered": len(uncovered_rows),
        },
        "career": career,
        "fieldBaseline": field_baseline,
        "venueBaselines": venue_baseline_rows,
        "byVenue": venue_rows,
        "bySeason": season_rows,
        "handVerification": hand_verification,
        "sources": [
            {"path": "data/career/career.dataset.json", "note": "Official caution summaries (incidents) and official lap-chart positions."},
        ],
        "caveats": [
            "Positions only: the lap chart carries running order, never lap times or gaps.",
            "A restart's window is the two green laps after it; where a fresh caution or the finish arrives first, the window is shorter and the row says so.",
            "Position changes in the window can include pit cycles under green; the measure is descriptive net movement, not a count of on-track passes.",
            "Caution laps come from official Results-PDF caution summaries; races without an official lap chart are marked uncovered, never estimated.",
            "The field baseline is the mean absolute place change per car per restart at a venue, INDY NXT since the first covered season; each figure carries its restart and car-observation count, and thin venues (< 3 restarts) are flagged unstable rather than headlined.",
        ],
    }
    write_json(OUTPUT / "summary.json", summary)

    print(
        f"restart-report: {len(event_rows)} restarts across {races_with_restarts} races "
        f"({sessions_with_chart}/{len(race_sessions)} sessions charted, "
        f"{races_no_caution} caution-free, {end_of_race_cautions} ended under caution, "
        f"{len(uncovered_rows)} uncovered rows); "
        f"field baseline: the average car moved {field_baseline['meanAbsoluteFieldMove']} places across "
        f"{field_baseline['restarts']} restarts / {len(venue_baseline_rows)} venues "
        f"since {field_baseline['spanFirstSeason']}."
    )


def field_rows_for(driver_delta_rows: list[dict[str, Any]], session_id: str, restart_index: int) -> list[dict[str, Any]]:
    return [
        row
        for row in driver_delta_rows
        if row["sessionId"] == session_id and row["restartIndex"] == restart_index
    ]


def rollup(
    race_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    key: str,
    label_fields: tuple[str, ...],
    source_hash: str,
) -> list[dict[str, Any]]:
    groups: dict[Any, dict[str, Any]] = {}
    seasons_by_key: dict[Any, set[Any]] = defaultdict(set)
    field_nets_by_key: dict[Any, list[float]] = defaultdict(list)
    bryce_nets_by_key: dict[Any, list[float]] = defaultdict(list)

    for row in event_rows:
        group_key = row[key]
        if row["bryceNet"] is not None:
            bryce_nets_by_key[group_key].append(float(row["bryceNet"]))

    race_by_key: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in race_rows:
        race_by_key[row[key]].append(row)
        seasons_by_key[row[key]].add(row.get("seasonYear"))

    out: list[dict[str, Any]] = []
    for group_key, rows in race_by_key.items():
        restarts = sum(r["restartCount"] for r in rows)
        if restarts == 0:
            continue
        bryce_counted = sum(r["bryceRestartsCounted"] for r in rows)
        bryce_net = sum(r["bryceNet"] for r in rows)
        bryce_gained = sum(r["bryceGained"] for r in rows)
        bryce_held = sum(r["bryceHeld"] for r in rows)
        bryce_slipped = sum(r["bryceSlipped"] for r in rows)
        avg_bryce = round1(bryce_net / bryce_counted) if bryce_counted else None
        entry: dict[str, Any] = {}
        if key == "venueSlug":
            sample = rows[0]
            entry["venueSlug"] = group_key
            entry["trackName"] = sample.get("trackName")
            entry["trackType"] = sample.get("trackType")
            entry["seasons"] = ";".join(str(s) for s in sorted(x for x in seasons_by_key[group_key] if x is not None))
        else:
            entry["seasonYear"] = group_key
        entry["races"] = len([r for r in rows if r["restartCount"] > 0])
        entry["restarts"] = restarts
        entry["bryceRestartsCounted"] = bryce_counted
        entry["bryceNet"] = bryce_net
        entry["bryceGained"] = bryce_gained
        entry["bryceHeld"] = bryce_held
        entry["bryceSlipped"] = bryce_slipped
        entry["avgBryceNetPerRestart"] = avg_bryce
        entry["fieldAvgNetPerRestart"] = round1(0.0)  # positions net to ~0 across the full field
        entry["sourceHash"] = source_hash
        out.append(entry)

    if key == "seasonYear":
        out.sort(key=lambda row: row["seasonYear"] or 0)
    else:
        out.sort(key=lambda row: str(row["venueSlug"]))
    return out


def build_field_baselines(
    event_rows: list[dict[str, Any]],
    driver_delta_rows: list[dict[str, Any]],
    source_hash: str,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """The venue field baseline (Brief K v2): how far the *whole field* typically
    moves on a restart at each venue, so Bryce's own figure reads against a norm.

    "Typical field movement" is the mean absolute net running-order change per
    classified car per restart — the average size of a place swing on a restart
    here, in either direction. It is derived from the same validated driver
    deltas as Bryce's v1 figures (never estimated), and every row carries its
    denominator: how many restarts and car-observations, and the season span.

    v1 covers INDY NXT 2024→present (the field-baseline first slice). The
    contract is sized so a later 16-year lake extraction extends the same rows to
    an earlier `spanFirstSeason` and larger counts with no UI rework.
    """
    # (sessionId, restartIndex) -> venue/season context from the event rows.
    ctx: dict[tuple[str, str], dict[str, Any]] = {}
    for row in event_rows:
        ctx[(row["sessionId"], str(row["restartIndex"]))] = {
            "venueSlug": row["venueSlug"],
            "trackName": row["trackName"],
            "trackType": row["trackType"],
            "seasonYear": row["seasonYear"],
        }

    per_venue: dict[str, dict[str, Any]] = {}
    all_abs: list[float] = []
    all_restarts: set[tuple[str, str]] = set()
    all_seasons: set[int] = set()

    def touch(bucket: dict[str, Any], net_abs: float, restart_key: tuple[str, str], season: int | None) -> None:
        bucket["abs"].append(net_abs)
        bucket["restarts"].add(restart_key)
        if season is not None:
            bucket["seasons"].add(season)

    for row in driver_delta_rows:
        key = (row["sessionId"], str(row["restartIndex"]))
        info = ctx.get(key)
        if info is None:
            continue
        net = clean_int(row["net"])
        if net is None:
            continue
        net_abs = float(abs(net))
        season = clean_int(info["seasonYear"])
        venue = info["venueSlug"]
        bucket = per_venue.setdefault(
            venue,
            {
                "venueSlug": venue,
                "trackName": info["trackName"],
                "trackType": info["trackType"],
                "abs": [],
                "restarts": set(),
                "seasons": set(),
            },
        )
        touch(bucket, net_abs, key, season)
        all_abs.append(net_abs)
        all_restarts.add(key)
        if season is not None:
            all_seasons.add(season)

    venue_rows: list[dict[str, Any]] = []
    for bucket in per_venue.values():
        restarts = len(bucket["restarts"])
        seasons = sorted(bucket["seasons"])
        venue_rows.append(
            {
                "venueSlug": bucket["venueSlug"],
                "trackName": bucket["trackName"],
                "trackType": bucket["trackType"],
                "seasons": ";".join(str(s) for s in seasons),
                "spanFirstSeason": seasons[0] if seasons else None,
                "spanLastSeason": seasons[-1] if seasons else None,
                "restarts": restarts,
                "driverObservations": len(bucket["abs"]),
                "meanAbsoluteFieldMove": round1(mean(bucket["abs"])),
                "medianFieldMove": round1(median(bucket["abs"])),
                "stable": "true" if restarts >= MIN_BASELINE_RESTARTS else "false",
                "sourceHash": source_hash,
            }
        )
    venue_rows.sort(key=lambda row: (-row["restarts"], str(row["venueSlug"])))

    seasons = sorted(all_seasons)
    field_baseline = {
        "scope": "indy_nxt",
        "precision": "lap-chart",
        "coverageTier": "official_timing_documents",
        "spanFirstSeason": seasons[0] if seasons else None,
        "spanLastSeason": seasons[-1] if seasons else None,
        "restarts": len(all_restarts),
        "driverObservations": len(all_abs),
        "meanAbsoluteFieldMove": round1(mean(all_abs)),
        "medianFieldMove": round1(median(all_abs)),
        "minStableRestarts": MIN_BASELINE_RESTARTS,
        "note": (
            "Mean absolute running-order change per classified car per restart — "
            "the average size of a place swing on an INDY NXT restart, from the "
            "official lap chart. Positions only, never lap times."
        ),
    }
    return venue_rows, field_baseline


def build_hand_verification(event_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for session_id in HAND_VERIFIED_SESSIONS:
        restarts = [r for r in event_rows if r["sessionId"] == session_id]
        if not restarts:
            continue
        out.append(
            {
                "sessionId": session_id,
                "raceLabel": restarts[0]["raceLabel"],
                "restarts": [
                    {
                        "restartIndex": r["restartIndex"],
                        "cautionNumbers": r["cautionNumbers"],
                        "baselineLap": r["baselineLap"],
                        "restartLap": r["restartLap"],
                        "windowEndLap": r["windowEndLap"],
                        "bryceBaselinePosition": r["bryceBaselinePosition"],
                        "bryceEndPosition": r["bryceEndPosition"],
                        "bryceNet": r["bryceNet"],
                    }
                    for r in restarts
                ],
            }
        )
    return out


if __name__ == "__main__":
    main()
