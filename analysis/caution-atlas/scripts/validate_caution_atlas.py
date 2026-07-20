#!/usr/bin/env python3
"""Validate the Caution Atlas lane.

Re-derives the caution counting from the canonical dataset independently of the
build, then checks the emitted tables and summary for internal consistency, the
Nashville venue reconciliation (the handoff's "2 per race median" claim), and two
hand-verified races. Exits non-zero on the first failure.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import re
import statistics
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/caution-atlas"
OUTPUT = LANE / "output"
TABLES = OUTPUT / "tables"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

INDY_NXT_ID = "series_indy_nxt"

HAND_VERIFIED_SESSIONS = ("session_indy_nxt_2024_6323", "session_indy_nxt_2026_6749")

# The reconciliation the handoff asked for: Nashville, across his 3 visits.
NASHVILLE_VENUE_SLUG = "nashville_superspeedway"
NASHVILLE_EXPECTED = {"races": 3, "medianPerRace": 1.0, "minPerRace": 1, "maxPerRace": 2}

CATEGORY_KEYWORDS = (
    ("Contact", ("contact",)),
    ("Off course", ("off course", "off-course")),
    ("Spin", ("spin",)),
    ("Debris", ("debris",)),
    ("Mechanical", ("mechanical",)),
    ("Conditions", ("condition",)),
)


def fail(message: str) -> None:
    raise SystemExit(f"caution-atlas validation failed: {message}")


def resolve_as_of_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override and override.strip():
        try:
            return date.fromisoformat(override.strip())
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    return date.today()


AS_OF_DATE = resolve_as_of_date()


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


def as_float(value: Any) -> float | None:
    if value in (None, "", "None"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def dataset_hash() -> str:
    digest = hashlib.sha256()
    with DATASET_PATH.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def venue_slug(track_name: str) -> str:
    normalized = (track_name or "").lower()
    if "mid-ohio" in normalized:
        return "mid_ohio"
    out = re.sub(r"[^a-z0-9]+", "_", (track_name or "").lower()).strip("_")
    return out or "venue"


def categorize(reason: str) -> str:
    text = (reason or "").lower()
    for label, keywords in CATEGORY_KEYWORDS:
        if any(keyword in text for keyword in keywords):
            return label
    return "Other"


def third_of(start_lap: int | None, total_laps: int) -> str:
    if start_lap is None or total_laps <= 0:
        return "unknown"
    fraction = start_lap / total_laps
    if fraction <= 1 / 3:
        return "opening"
    if fraction <= 2 / 3:
        return "middle"
    return "final"


def rederive(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data.get("events", [])}
    tracks = {row["id"]: row for row in data.get("tracks", [])}

    considered = 0
    run_sessions: dict[str, dict[str, Any]] = {}
    for session in data.get("sessions", []):
        event = events.get(session.get("eventId"), {})
        if event.get("seriesId") != INDY_NXT_ID or session.get("sessionType") != "race":
            continue
        considered += 1
        event_date = parse_date(event.get("eventStartDate"))
        if session.get("status") != "official" or event_date is None or event_date > AS_OF_DATE:
            continue
        track = tracks.get(event.get("trackId"), {})
        run_sessions[session["id"]] = {
            "trackName": track.get("name") or event.get("trackName") or "Unknown venue",
            "venueSlug": venue_slug(track.get("name") or event.get("trackName") or ""),
            "seasonYear": event.get("seasonYear"),
        }

    totals: dict[str, int] = defaultdict(int)
    for sample in data.get("lapSamples", []):
        sid = sample.get("sessionId")
        if sid not in run_sessions:
            continue
        lap_no = sample.get("lapNumber")
        if lap_no is None:
            continue
        try:
            totals[sid] = max(totals[sid], int(lap_no))
        except (TypeError, ValueError):
            continue

    cautions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for incident in data.get("incidents", []):
        type_text = str(incident.get("incidentType", "")).lower()
        desc_text = str(incident.get("description", "")).lower()
        if "caution" not in type_text and "caution" not in desc_text:
            continue
        sid = incident["sessionId"]
        if sid not in run_sessions:
            continue
        raw = incident.get("raw", {}) or {}
        start = as_int(raw.get("startLap") if raw.get("startLap") is not None else incident.get("lapNumber"))
        end = as_int(raw.get("endLap") if raw.get("endLap") is not None else raw.get("startLap"))
        if end is None:
            end = start
        if start is None or end is None or start <= 0 or end <= 0:
            continue
        cautions[sid].append(
            {
                "startLap": start,
                "endLap": end,
                "reason": (raw.get("reason") or "").strip() or "Caution",
                "third": third_of(start, totals.get(sid, 0)),
                "category": categorize(raw.get("reason") or ""),
            }
        )

    return {
        "considered": considered,
        "runSessions": run_sessions,
        "totals": totals,
        "cautions": cautions,
        "totalCautions": sum(len(v) for v in cautions.values()),
    }


def main() -> None:
    data = json.loads(DATASET_PATH.read_text())
    truth = rederive(data)

    summary = json.loads((OUTPUT / "summary.json").read_text())
    if summary.get("schemaVersion") != "brycecast.cautionAtlas.v1":
        fail("summary schemaVersion must be brycecast.cautionAtlas.v1")
    if summary.get("datasetSha256") != dataset_hash():
        fail("summary datasetSha256 does not match the current canonical dataset — rebuild the lane.")
    if summary.get("asOfDate") != AS_OF_DATE.isoformat():
        fail(f"summary asOfDate {summary.get('asOfDate')} != run as-of {AS_OF_DATE.isoformat()} — rebuild with the same pin.")

    event_rows = rows(TABLES / "caution_events.csv")
    race_rows = rows(TABLES / "caution_by_race.csv")
    venue_rows = rows(TABLES / "caution_by_venue.csv")

    # ---- coverage ---------------------------------------------------------- #
    if summary["coverage"]["indyNxtRaceSessions"] != truth["considered"]:
        fail("coverage indyNxtRaceSessions mismatch")
    if summary["coverage"]["racesConsidered"] != len(truth["runSessions"]):
        fail("coverage racesConsidered (run races) mismatch")
    if summary["coverage"]["totalCautions"] != truth["totalCautions"]:
        fail(f"coverage totalCautions {summary['coverage']['totalCautions']} != re-derived {truth['totalCautions']}")
    if len(event_rows) != truth["totalCautions"]:
        fail(f"caution_events row count {len(event_rows)} != re-derived {truth['totalCautions']}")
    if len(race_rows) != len(truth["runSessions"]):
        fail(f"caution_by_race row count {len(race_rows)} != run races {len(truth['runSessions'])}")

    # No future / non-official race may appear.
    for row in race_rows:
        if row["sessionId"] not in truth["runSessions"]:
            fail(f"caution_by_race carries {row['sessionId']} which is not an official race run on or before {AS_OF_DATE.isoformat()}")

    # ---- event-level invariants ------------------------------------------- #
    events_by_session: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in event_rows:
        start = as_int(row["startLap"])
        end = as_int(row["endLap"])
        duration = as_int(row["durationLaps"])
        total = as_int(row["totalRaceLaps"])
        if start is None or end is None or end < start:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: start/end laps invalid")
        if duration != end - start + 1:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: durationLaps must equal end-start+1")
        if third_of(start, total or 0) != row["third"]:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: third disagrees with the lap/distance re-derivation")
        ran_to_flag = total is not None and total > 0 and end >= total
        if (row["ranToFlag"] == "true") != ran_to_flag:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: ranToFlag inconsistent with end vs total laps")
        restart_lap = as_int(row["restartLap"])
        if ran_to_flag:
            if restart_lap is not None:
                fail(f"{row['sessionId']} caution {row['cautionNumber']}: a caution that ran to the flag has no restart lap")
        elif restart_lap != end + 1:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: restartLap must equal end+1")
        if categorize(row["reason"]) != row["category"]:
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: category disagrees with the reason grouping")
        if row["category"] == "Other":
            fail(f"{row['sessionId']} caution {row['cautionNumber']}: reason '{row['reason']}' fell through to Other — extend the category map")
        events_by_session[row["sessionId"]].append(row)

    # ---- per-race aggregate consistency ----------------------------------- #
    for race in race_rows:
        sid = race["sessionId"]
        evs = events_by_session.get(sid, [])
        if as_int(race["cautionCount"]) != len(evs):
            fail(f"{sid}: cautionCount mismatch")
        if as_int(race["cautionLapsTotal"]) != sum(as_int(e["durationLaps"]) or 0 for e in evs):
            fail(f"{sid}: cautionLapsTotal mismatch")
        for third_key, col in (("opening", "openingThird"), ("middle", "middleThird"), ("final", "finalThird"), ("unknown", "unknownThird")):
            expected = sum(1 for e in evs if e["third"] == third_key)
            if as_int(race[col]) != expected:
                fail(f"{sid}: {col} mismatch")
        if as_int(race["ranToFlagCount"]) != sum(1 for e in evs if e["ranToFlag"] == "true"):
            fail(f"{sid}: ranToFlagCount mismatch")

    # ---- venue rollup consistency ----------------------------------------- #
    counts_by_venue: dict[str, list[int]] = defaultdict(list)
    for race in race_rows:
        counts_by_venue[race["venueSlug"]].append(as_int(race["cautionCount"]) or 0)
    events_by_venue: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in event_rows:
        events_by_venue[row["venueSlug"]].append(row)

    if len(venue_rows) != len(counts_by_venue):
        fail("caution_by_venue row count must equal the number of venues with run races")
    for venue in venue_rows:
        slug = venue["venueSlug"]
        counts = counts_by_venue.get(slug, [])
        evs = events_by_venue.get(slug, [])
        if as_int(venue["races"]) != len(counts):
            fail(f"venue {slug}: races mismatch")
        if as_int(venue["cautions"]) != len(evs):
            fail(f"venue {slug}: cautions mismatch")
        expected_median = round(float(statistics.median(counts)), 3) if counts else None
        if abs((as_float(venue["medianPerRace"]) or 0) - (expected_median or 0)) > 0.0011:
            fail(f"venue {slug}: medianPerRace disagrees with the re-derived median")
        if as_int(venue["minPerRace"]) != (min(counts) if counts else 0):
            fail(f"venue {slug}: minPerRace mismatch")
        if as_int(venue["maxPerRace"]) != (max(counts) if counts else 0):
            fail(f"venue {slug}: maxPerRace mismatch")
        for third_key, col in (("opening", "openingThird"), ("middle", "middleThird"), ("final", "finalThird")):
            if as_int(venue[col]) != sum(1 for e in evs if e["third"] == third_key):
                fail(f"venue {slug}: {col} mismatch")

    # ---- totals ------------------------------------------------------------ #
    if sum(as_int(v["cautions"]) or 0 for v in venue_rows) != truth["totalCautions"]:
        fail("byVenue cautions must sum to the total caution count")
    category_total = sum(summary["totals"]["byCategory"].values())
    if category_total != truth["totalCautions"]:
        fail("totals.byCategory must sum to the total caution count")
    third_total = sum(summary["totals"]["byThird"].values())
    if third_total != truth["totalCautions"]:
        fail("totals.byThird must sum to the total caution count")

    # ---- Nashville reconciliation (the handoff's claim) ------------------- #
    nashville = next((v for v in venue_rows if v["venueSlug"] == NASHVILLE_VENUE_SLUG), None)
    if nashville is None:
        fail("Nashville venue row is missing — the handoff reconciliation cannot be checked")
    if as_int(nashville["races"]) != NASHVILLE_EXPECTED["races"]:
        fail(f"Nashville races expected {NASHVILLE_EXPECTED['races']}, got {nashville['races']}")
    if abs((as_float(nashville["medianPerRace"]) or 0) - NASHVILLE_EXPECTED["medianPerRace"]) > 0.0011:
        fail(
            f"Nashville median expected {NASHVILLE_EXPECTED['medianPerRace']} per race (NOT the handoff's 2), got {nashville['medianPerRace']}"
        )
    if as_int(nashville["minPerRace"]) != NASHVILLE_EXPECTED["minPerRace"] or as_int(nashville["maxPerRace"]) != NASHVILLE_EXPECTED["maxPerRace"]:
        fail(f"Nashville range expected {NASHVILLE_EXPECTED['minPerRace']}-{NASHVILLE_EXPECTED['maxPerRace']}, got {nashville['minPerRace']}-{nashville['maxPerRace']}")

    # ---- hand-verified races ---------------------------------------------- #
    for sid in HAND_VERIFIED_SESSIONS:
        truth_cautions = sorted(truth["cautions"].get(sid, []), key=lambda c: (c["startLap"], c["endLap"]))
        emitted = sorted(
            (e for e in event_rows if e["sessionId"] == sid),
            key=lambda e: (as_int(e["startLap"]) or 0, as_int(e["endLap"]) or 0),
        )
        if len(emitted) != len(truth_cautions):
            fail(f"hand-verified {sid}: expected {len(truth_cautions)} cautions, emitted {len(emitted)}")
        for want, got in zip(truth_cautions, emitted):
            if as_int(got["startLap"]) != want["startLap"] or as_int(got["endLap"]) != want["endLap"]:
                fail(f"hand-verified {sid}: caution laps disagree with the by-hand re-derivation")
            if got["third"] != want["third"] or got["category"] != want["category"]:
                fail(f"hand-verified {sid}: third/category disagrees with the by-hand re-derivation")

    print(
        f"caution-atlas validation OK — {len(event_rows)} cautions across "
        f"{summary['coverage']['racesWithCaution']} of {len(truth['runSessions'])} run races, "
        f"{len(venue_rows)} venues; Nashville median {nashville['medianPerRace']}/race "
        f"(range {nashville['minPerRace']}-{nashville['maxPerRace']}), 2 races hand-verified."
    )


if __name__ == "__main__":
    main()
