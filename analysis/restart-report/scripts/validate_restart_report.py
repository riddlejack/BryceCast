#!/usr/bin/env python3
"""Validate the Restart Report Card lane.

Re-derives restart detection from the canonical dataset independently of the
build, then checks the emitted tables and summary for internal consistency and
the two hand-verified races. Exits non-zero on the first failure.
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import statistics
from collections import defaultdict
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

EXPECTED_HAND_VERIFIED = {
    "session_indy_nxt_2024_6314": [
        {"restartLap": 6, "baselineLap": 5, "windowEndLap": 7, "bryceBaselinePosition": 5, "bryceEndPosition": 5, "bryceNet": 0},
    ],
    "session_indy_nxt_2024_6315": [
        {"restartLap": 26, "baselineLap": 25, "windowEndLap": 27, "bryceBaselinePosition": 16, "bryceEndPosition": 15, "bryceNet": 1},
        {"restartLap": 32, "baselineLap": 31, "windowEndLap": 33, "bryceBaselinePosition": 14, "bryceEndPosition": 14, "bryceNet": 0},
    ],
}


def fail(message: str) -> None:
    raise SystemExit(f"restart-report validation failed: {message}")


def rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        fail(f"missing table {path.relative_to(ROOT)}")
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def as_int(value: Any) -> int | None:
    if value in (None, "", "None"):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def dataset_hash() -> str:
    digest = hashlib.sha256()
    with DATASET_PATH.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def caution_runs(laps: set[int]) -> list[dict[str, int]]:
    ordered = sorted(laps)
    runs: list[dict[str, int]] = []
    current: dict[str, int] | None = None
    for lap in ordered:
        if current and lap == current["end"] + 1:
            current["end"] = lap
        else:
            if current:
                runs.append(current)
            current = {"start": lap, "end": lap}
    if current:
        runs.append(current)
    return runs


def rederive(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data.get("events", [])}
    race_session_ids = set()
    for session in data.get("sessions", []):
        event = events.get(session.get("eventId"), {})
        if event.get("seriesId") == INDY_NXT_ID and session.get("sessionType") == "race":
            race_session_ids.add(session["id"])

    caution_by: dict[str, set[int]] = defaultdict(set)
    for incident in data.get("incidents", []):
        raw = incident.get("raw", {}) or {}
        type_text = str(incident.get("incidentType", "")).lower()
        desc_text = str(incident.get("description", "")).lower()
        if "caution" not in type_text and "caution" not in desc_text:
            continue
        start = as_int(raw.get("startLap") if raw.get("startLap") is not None else incident.get("lapNumber"))
        end = as_int(raw.get("endLap") if raw.get("endLap") is not None else raw.get("startLap"))
        if end is None:
            end = start
        if start is None or end is None or start <= 0 or end <= 0:
            continue
        for lap_no in range(start, end + 1):
            caution_by[incident["sessionId"]].add(lap_no)

    charts: dict[str, dict[str, dict[int, int]]] = defaultdict(lambda: defaultdict(dict))
    for sample in data.get("lapSamples", []):
        sid = sample.get("sessionId")
        if sid not in race_session_ids:
            continue
        pos = sample.get("position")
        lap_no = sample.get("lapNumber")
        if pos is None or lap_no is None:
            continue
        try:
            charts[sid][sample["driverId"]][int(lap_no)] = int(pos)
        except (TypeError, ValueError):
            continue

    restarts: dict[str, list[dict[str, Any]]] = defaultdict(list)
    total_restarts = 0
    for sid, chart in charts.items():
        total_laps = max((max(laps) for laps in chart.values() if laps), default=0)
        cautions = caution_by.get(sid, set())
        index = 0
        for run in caution_runs(cautions):
            restart_lap = run["end"] + 1
            if restart_lap > total_laps:
                continue
            window: list[int] = []
            lap = restart_lap
            while lap <= total_laps and lap not in cautions and len(window) < WINDOW_LAPS:
                window.append(lap)
                lap += 1
            if not window:
                continue
            index += 1
            total_restarts += 1
            baseline = run["end"]
            window_end = window[-1]
            bryce = chart.get(BRYCE_ID, {})
            b0 = bryce.get(baseline)
            b1 = bryce.get(window_end)
            restarts[sid].append(
                {
                    "restartIndex": index,
                    "baselineLap": baseline,
                    "restartLap": restart_lap,
                    "windowEndLap": window_end,
                    "windowLaps": len(window),
                    "bryceBaselinePosition": b0,
                    "bryceEndPosition": b1,
                    "bryceNet": (b0 - b1) if (b0 is not None and b1 is not None) else None,
                }
            )
    return {
        "raceSessionCount": len(race_session_ids),
        "chartedSessions": set(charts.keys()),
        "restarts": restarts,
        "totalRestarts": total_restarts,
    }


def main() -> None:
    data = json.loads(DATASET_PATH.read_text())
    truth = rederive(data)

    summary = json.loads((OUTPUT / "summary.json").read_text())
    if summary.get("schemaVersion") != "brycecast.restartReport.v1":
        fail("summary schemaVersion must be brycecast.restartReport.v1")
    if summary.get("datasetSha256") != dataset_hash():
        fail("summary datasetSha256 does not match the current canonical dataset — rebuild the lane.")

    event_rows = rows(TABLES / "restart_events.csv")
    delta_rows = rows(TABLES / "restart_driver_deltas.csv")
    race_rows = rows(TABLES / "restart_by_race.csv")
    venue_rows = rows(TABLES / "restart_by_venue.csv")
    season_rows = rows(TABLES / "restart_by_season.csv")

    # ---- event-level invariants ------------------------------------------- #
    if len(event_rows) != truth["totalRestarts"]:
        fail(f"restart_events row count {len(event_rows)} != re-derived {truth['totalRestarts']}")
    for row in event_rows:
        base = as_int(row["baselineLap"])
        restart_lap = as_int(row["restartLap"])
        window_laps = as_int(row["windowLaps"])
        window_end = as_int(row["windowEndLap"])
        if restart_lap != base + 1:
            fail(f"{row['sessionId']} restart {row['restartIndex']}: restartLap must be baselineLap+1")
        if window_laps not in (1, 2):
            fail(f"{row['sessionId']} restart {row['restartIndex']}: windowLaps must be 1 or 2")
        if window_end != base + window_laps:
            fail(f"{row['sessionId']} restart {row['restartIndex']}: windowEndLap must be baselineLap+windowLaps")
        if (row["fullWindow"] == "true") != (window_laps == WINDOW_LAPS):
            fail(f"{row['sessionId']} restart {row['restartIndex']}: fullWindow inconsistent with windowLaps")
        if (row["truncated"] == "true") == (window_laps == WINDOW_LAPS):
            fail(f"{row['sessionId']} restart {row['restartIndex']}: truncated inconsistent with windowLaps")
        if row["bryceClassified"] == "true":
            b0 = as_int(row["bryceBaselinePosition"])
            b1 = as_int(row["bryceEndPosition"])
            net = as_int(row["bryceNet"])
            if b0 is None or b1 is None or net != b0 - b1:
                fail(f"{row['sessionId']} restart {row['restartIndex']}: bryceNet must equal baseline-end")
            rank = as_int(row["bryceRankInField"])
            size = as_int(row["bryceFieldSizeRanked"])
            if rank is None or size is None or not (1 <= rank <= size):
                fail(f"{row['sessionId']} restart {row['restartIndex']}: bryce rank out of range")

    # ---- driver-delta invariants ------------------------------------------ #
    for row in delta_rows:
        b0 = as_int(row["baselinePosition"])
        b1 = as_int(row["endPosition"])
        net = as_int(row["net"])
        if b0 is None or b1 is None or net != b0 - b1:
            fail(f"driver delta {row['sessionId']}/{row['restartIndex']}/{row['driverId']}: net must equal baseline-end")
    # exactly one Bryce row per restart where Bryce is classified
    classified_bryce = {(r["sessionId"], r["restartIndex"]) for r in event_rows if r["bryceClassified"] == "true"}
    delta_bryce = {(r["sessionId"], r["restartIndex"]) for r in delta_rows if r["isBryce"] == "true"}
    if classified_bryce != delta_bryce:
        fail("bryce-classified restarts disagree between events and driver deltas")

    # ---- per-race aggregate consistency ----------------------------------- #
    events_by_session: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in event_rows:
        events_by_session[row["sessionId"]].append(row)
    for race in race_rows:
        sid = race["sessionId"]
        evs = events_by_session.get(sid, [])
        if as_int(race["restartCount"]) != len(evs):
            fail(f"{sid}: restartCount mismatch")
        bryce_nets = [as_int(e["bryceNet"]) for e in evs if e["bryceClassified"] == "true"]
        if as_int(race["bryceRestartsCounted"]) != len(bryce_nets):
            fail(f"{sid}: bryceRestartsCounted mismatch")
        if as_int(race["bryceNet"]) != sum(n for n in bryce_nets if n is not None):
            fail(f"{sid}: bryceNet mismatch")
        if as_int(race["bryceGained"]) != sum(1 for n in bryce_nets if n and n > 0):
            fail(f"{sid}: bryceGained mismatch")
        if as_int(race["bryceHeld"]) != sum(1 for n in bryce_nets if n == 0):
            fail(f"{sid}: bryceHeld mismatch")
        if as_int(race["bryceSlipped"]) != sum(1 for n in bryce_nets if n and n < 0):
            fail(f"{sid}: bryceSlipped mismatch")
        if race["soleBestInField"] == "true" and race["coBestInField"] != "true":
            fail(f"{sid}: soleBestInField implies coBestInField")
        # Day-level "beat the field's typical move": re-derive the field's
        # median summed net from the driver deltas and compare.
        totals: dict[str, float] = defaultdict(float)
        for delta in delta_rows:
            if delta["sessionId"] == sid:
                totals[delta["driverId"]] += as_int(delta["net"]) or 0
        if totals:
            field_median = float(statistics.median(totals.values()))
            expected_beat = (as_int(race["bryceRestartsCounted"]) or 0) > 0 and (as_int(race["bryceNet"]) or 0) > field_median
            if (race["bryceBeatFieldTypical"] == "true") != expected_beat:
                fail(f"{sid}: bryceBeatFieldTypical disagrees with the re-derived field median")
            stated = race.get("fieldMedianNet")
            if stated not in (None, "", "None") and abs(float(stated) - field_median) > 0.051:
                fail(f"{sid}: fieldMedianNet disagrees with the re-derived field median")

    # ---- rollup consistency ----------------------------------------------- #
    for scope_rows, key in ((venue_rows, "venueSlug"), (season_rows, "seasonYear")):
        for scope in scope_rows:
            member = [r for r in race_rows if r[key] == scope[key] and as_int(r["restartCount"]) > 0]
            if as_int(scope["restarts"]) != sum(as_int(r["restartCount"]) for r in member):
                fail(f"rollup {key}={scope[key]}: restarts mismatch")
            if as_int(scope["bryceNet"]) != sum(as_int(r["bryceNet"]) for r in member):
                fail(f"rollup {key}={scope[key]}: bryceNet mismatch")
            if as_int(scope["bryceGained"]) != sum(as_int(r["bryceGained"]) for r in member):
                fail(f"rollup {key}={scope[key]}: bryceGained mismatch")

    # ---- career + coverage ------------------------------------------------ #
    career = summary["career"]
    all_bryce = [as_int(e["bryceNet"]) for e in event_rows if e["bryceClassified"] == "true"]
    if career["bryceRestartsCounted"] != len(all_bryce):
        fail("career bryceRestartsCounted mismatch")
    if career["bryceNet"] != sum(n for n in all_bryce if n is not None):
        fail("career bryceNet mismatch")
    if career["totalRestarts"] != len(event_rows):
        fail("career totalRestarts mismatch")
    if summary["coverage"]["indyNxtRaceSessions"] != truth["raceSessionCount"]:
        fail("coverage indyNxtRaceSessions mismatch")
    if summary["coverage"]["sessionsWithLapChart"] != len(truth["chartedSessions"]):
        fail("coverage sessionsWithLapChart mismatch")

    # ---- hand-verified races ---------------------------------------------- #
    for sid, expected in EXPECTED_HAND_VERIFIED.items():
        derived = truth["restarts"].get(sid, [])
        if len(derived) != len(expected):
            fail(f"hand-verified {sid}: expected {len(expected)} restarts, re-derived {len(derived)}")
        for want, got in zip(expected, derived):
            for field, value in want.items():
                if got.get(field) != value:
                    fail(f"hand-verified {sid}: {field} expected {value}, got {got.get(field)}")
        # and the emitted events must match too
        emitted = sorted((e for e in event_rows if e["sessionId"] == sid), key=lambda e: as_int(e["restartIndex"]))
        if len(emitted) != len(expected):
            fail(f"hand-verified {sid}: emitted event count mismatch")
        for want, row in zip(expected, emitted):
            if as_int(row["restartLap"]) != want["restartLap"] or as_int(row["bryceNet"]) != want["bryceNet"]:
                fail(f"hand-verified {sid}: emitted restart disagrees with the by-hand check")

    print(
        f"restart-report validation OK — {len(event_rows)} restarts, "
        f"{career['bryceRestartsCounted']} with a Bryce line, career net {career['bryceNet']:+d}, "
        f"2 races hand-verified."
    )


if __name__ == "__main__":
    main()
