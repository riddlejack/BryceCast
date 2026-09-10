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

UI_DATA_PACKAGE_PATH = ROOT / "analysis/ui-data-package/ui-data-package.json"

# Independent re-implementation of the build's cause parsing (fail closed on an
# ambiguous or unmapped official label; no priority order).
CAUSE_KEYWORDS = (
    ("Contact", ("contact",)),
    ("Off course", ("off course", "off-course")),
    ("Spin", ("spin",)),
    ("Debris", ("debris",)),
    ("Mechanical", ("mechanical",)),
    ("Conditions", ("conditions", "condition")),
)


class CautionCauseError(ValueError):
    """A caution reason whose official label maps to no cause, or to more than one."""


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


def cause_label_region(reason: str) -> str:
    """The official label: reason text before the first ':', ';', or spaced ' - '
    delimiter (the spaced hyphen leaves an 'off-course' hyphen intact)."""
    text = " ".join((reason or "").split())
    cut = len(text)
    for delim in (":", ";"):
        pos = text.find(delim)
        if pos != -1:
            cut = min(cut, pos)
    spaced_hyphen = text.find(" - ")
    if spaced_hyphen != -1:
        cut = min(cut, spaced_hyphen)
    return text[:cut].strip()


def categorize(reason: str) -> str:
    region = cause_label_region(reason).lower()
    matched: list[str] = []
    for label, keywords in CAUSE_KEYWORDS:
        if label not in matched and any(keyword in region for keyword in keywords):
            matched.append(label)
    if len(matched) == 1:
        return matched[0]
    if not matched:
        raise CautionCauseError(f"unrecognized caution cause label {region!r} (from reason {reason!r})")
    raise CautionCauseError(f"ambiguous caution cause label {region!r} maps to {matched} (from reason {reason!r})")


def normalize_categories(value: Any) -> dict[str, int]:
    """Both the CSV 'Contact:3;Debris:1' string and the package
    [{'category','count'}] list collapse to {category: count} for comparison."""
    out: dict[str, int] = {}
    if isinstance(value, str):
        for part in value.split(";"):
            if not part:
                continue
            label, _, count = part.partition(":")
            out[label] = (as_int(count) or 0)
    elif isinstance(value, list):
        for entry in value:
            out[entry.get("category")] = as_int(entry.get("count")) or 0
    return {k: v for k, v in out.items() if v}


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
        total = totals.get(sid, 0)
        ran_to_flag = total > 0 and end >= total
        cautions[sid].append(
            {
                "startLap": start,
                "endLap": end,
                "durationLaps": end - start + 1,
                "totalRaceLaps": total,
                "lapFraction": round(start / total, 4) if total > 0 else None,
                "restartLap": None if ran_to_flag else end + 1,
                "ranToFlag": ran_to_flag,
                "reason": (raw.get("reason") or "").strip() or "Caution",
                "third": third_of(start, total),
                "category": categorize((raw.get("reason") or "").strip() or "Caution"),
            }
        )

    return {
        "considered": considered,
        "runSessions": run_sessions,
        "totals": totals,
        "cautions": cautions,
        "totalCautions": sum(len(v) for v in cautions.values()),
    }


def rederive_venue_rollups(truth: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Every rendered per-venue aggregate — counts, median/mean/range, thirds,
    dominant third, ran-to-flag, median duration, and the category rollup —
    recomputed from the canonical re-derivation, independently of the build."""
    buckets: dict[str, dict[str, Any]] = {}
    for sid, meta in truth["runSessions"].items():
        bucket = buckets.setdefault(meta["venueSlug"], {"counts": [], "events": []})
        evs = truth["cautions"].get(sid, [])
        bucket["counts"].append(len(evs))
        bucket["events"].extend(evs)
    out: dict[str, dict[str, Any]] = {}
    for slug, bucket in buckets.items():
        counts = bucket["counts"]
        evs = bucket["events"]
        thirds = {k: sum(1 for e in evs if e["third"] == k) for k in ("opening", "middle", "final", "unknown")}
        placed = {k: thirds[k] for k in ("opening", "middle", "final")}
        top = max(placed.values()) if placed else 0
        leaders = [k for k, v in placed.items() if v == top and v > 0]
        durations = [e["durationLaps"] for e in evs]
        categories: dict[str, int] = defaultdict(int)
        for e in evs:
            categories[e["category"]] += 1
        out[slug] = {
            "races": len(counts),
            "cautions": len(evs),
            "medianPerRace": round(float(statistics.median(counts)), 3) if counts else None,
            "minPerRace": min(counts) if counts else 0,
            "maxPerRace": max(counts) if counts else 0,
            "meanPerRace": round(float(statistics.fmean(counts)), 3) if counts else None,
            "openingThird": thirds["opening"],
            "middleThird": thirds["middle"],
            "finalThird": thirds["final"],
            "unknownThird": thirds["unknown"],
            "dominantThird": leaders[0] if len(leaders) == 1 else "",
            "ranToFlagCount": sum(1 for e in evs if e["ranToFlag"]),
            "medianDurationLaps": round(float(statistics.median(durations)), 3) if durations else None,
            "categories": dict(categories),
        }
    return out


def rederive_race_rollups(truth: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Per-race aggregates the UI reads: caution/laps totals, thirds, ran-to-flag,
    median duration, and the category rollup, from the canonical re-derivation."""
    out: dict[str, dict[str, Any]] = {}
    for sid in truth["runSessions"]:
        evs = truth["cautions"].get(sid, [])
        durations = [e["durationLaps"] for e in evs]
        categories: dict[str, int] = defaultdict(int)
        for e in evs:
            categories[e["category"]] += 1
        out[sid] = {
            "cautionCount": len(evs),
            "cautionLapsTotal": sum(durations),
            "openingThird": sum(1 for e in evs if e["third"] == "opening"),
            "middleThird": sum(1 for e in evs if e["third"] == "middle"),
            "finalThird": sum(1 for e in evs if e["third"] == "final"),
            "ranToFlagCount": sum(1 for e in evs if e["ranToFlag"]),
            "medianDurationLaps": round(float(statistics.median(durations)), 3) if durations else None,
            "categories": dict(categories),
        }
    return out


def nums_equal(left: Any, right: Any) -> bool:
    lf, rf = as_float(left), as_float(right)
    if lf is None or rf is None:
        return lf is None and rf is None
    return abs(lf - rf) <= 0.0011


def check_cause_parsing() -> None:
    """Fixtures pinning the fail-closed cause parser: real labels map, and an
    ambiguous or unmapped label raises rather than guessing by priority."""
    ok_cases = [
        ("Contact: Cars 14 and 26 in Turn 3", "Contact"),
        ("Off Course: Car 68 in Turn 12", "Off course"),
        ("Off course Cars 2, 28, 27 and 48.", "Off course"),
        ("Spin: Car 5", "Spin"),
        ("Debris", "Debris"),
        ("Mechanical: Car 15 Between Turn 2 and 3", "Mechanical"),
        ("Conditions", "Conditions"),
    ]
    for reason, expected in ok_cases:
        got = categorize(reason)
        if got != expected:
            fail(f"cause fixture {reason!r} expected {expected}, got {got}")
    fail_cases = [
        "Contact and Spin: Cars 4 and 5",  # ambiguous — two causes in the label
        "Incident: Car 9",                 # unmapped — no known cause word
        "Red flag - track blocked",        # unmapped
        "Caution",                         # unmapped — a bare caution with no stated cause
    ]
    for reason in fail_cases:
        try:
            got = categorize(reason)
        except CautionCauseError:
            continue
        fail(f"cause fixture {reason!r} should have failed closed but returned {got}")


def check_venue_rollups(venue_rows: list[dict[str, str]], truth: dict[str, Any]) -> None:
    """Independently re-derive and deep-compare EVERY rendered venue aggregate."""
    expected = rederive_venue_rollups(truth)
    if {v["venueSlug"] for v in venue_rows} != set(expected):
        fail("caution_by_venue venues disagree with the re-derived set")
    for venue in venue_rows:
        slug = venue["venueSlug"]
        want = expected[slug]
        for col, key in (
            ("races", "races"), ("cautions", "cautions"),
            ("minPerRace", "minPerRace"), ("maxPerRace", "maxPerRace"),
            ("openingThird", "openingThird"), ("middleThird", "middleThird"),
            ("finalThird", "finalThird"), ("unknownThird", "unknownThird"),
            ("ranToFlagCount", "ranToFlagCount"),
        ):
            if as_int(venue[col]) != want[key]:
                fail(f"venue {slug}: {col} {venue[col]} != re-derived {want[key]}")
        for col, key in (
            ("medianPerRace", "medianPerRace"), ("meanPerRace", "meanPerRace"),
            ("medianDurationLaps", "medianDurationLaps"),
        ):
            if not nums_equal(venue[col], want[key]):
                fail(f"venue {slug}: {col} {venue[col]} != re-derived {want[key]}")
        if (venue["dominantThird"] or "") != want["dominantThird"]:
            fail(f"venue {slug}: dominantThird {venue['dominantThird']!r} != re-derived {want['dominantThird']!r}")
        if normalize_categories(venue["categories"]) != want["categories"]:
            fail(f"venue {slug}: category rollup {venue['categories']!r} != re-derived {want['categories']}")


def check_race_rollups(race_rows: list[dict[str, str]], truth: dict[str, Any]) -> None:
    """Independently re-derive and deep-compare per-race median duration and the
    category rollup (the count/laps/thirds columns are checked separately)."""
    expected = rederive_race_rollups(truth)
    for race in race_rows:
        sid = race["sessionId"]
        want = expected.get(sid)
        if want is None:
            fail(f"caution_by_race carries {sid} with no re-derived counterpart")
        if not nums_equal(race["medianDurationLaps"], want["medianDurationLaps"]):
            fail(f"{sid}: medianDurationLaps {race['medianDurationLaps']} != re-derived {want['medianDurationLaps']}")
        if normalize_categories(race["categories"]) != want["categories"]:
            fail(f"{sid}: category rollup {race['categories']!r} != re-derived {want['categories']}")


def check_ui_package(event_rows: list[dict[str, str]], race_rows: list[dict[str, str]], venue_rows: list[dict[str, str]]) -> None:
    """Deep-compare the normalized caution rows the UI actually reads — the
    embedded ui-data-package cautionAtlas — against the lane tables, so a value
    can never drift between the CSV and the package the React app hydrates."""
    if not UI_DATA_PACKAGE_PATH.exists():
        return
    package = json.loads(UI_DATA_PACKAGE_PATH.read_text())
    # This validator runs before the UI package is rewritten. A package from the
    # prior canonical hash is a normal refresh state; the root package validator
    # performs this deep comparison after the new package is written.
    if package.get("sourceHash") != dataset_hash():
        return
    try:
        atlas = package["screens"]["careerLab"]["cautionAtlas"]
    except (KeyError, TypeError):
        fail("ui-data-package has no screens.careerLab.cautionAtlas")

    # events: 1:1 with the CSV, same order, every rendered field normalized equal.
    pkg_events = atlas["events"]
    if len(pkg_events) != len(event_rows):
        fail(f"package events {len(pkg_events)} != caution_events rows {len(event_rows)}")
    for csv_row, pkg in zip(event_rows, pkg_events):
        for col, key in (("sessionId", "sessionId"), ("trackName", "trackName"), ("venueSlug", "venueSlug"), ("third", "third"), ("category", "category")):
            if str(csv_row[col]) != str(pkg.get(key)):
                fail(f"package event {pkg.get('sessionId')}: {key} {pkg.get(key)!r} != CSV {csv_row[col]!r}")
        for col, key in (("seasonYear", "seasonYear"), ("startLap", "startLap"), ("endLap", "endLap"), ("durationLaps", "durationLaps"), ("totalRaceLaps", "totalRaceLaps"), ("restartLap", "restartLap")):
            if as_int(csv_row[col]) != (as_int(pkg.get(key)) if pkg.get(key) is not None else None):
                fail(f"package event {pkg.get('sessionId')}: {key} {pkg.get(key)!r} != CSV {csv_row[col]!r}")
        if not nums_equal(csv_row["lapFraction"], pkg.get("lapFraction")):
            fail(f"package event {pkg.get('sessionId')}: lapFraction {pkg.get('lapFraction')} != CSV {csv_row['lapFraction']}")
        if (csv_row["ranToFlag"] == "true") != bool(pkg.get("ranToFlag")):
            fail(f"package event {pkg.get('sessionId')}: ranToFlag {pkg.get('ranToFlag')} != CSV {csv_row['ranToFlag']}")

    # byRace: package carries only cautionCount>0 races; deep-compare by session.
    pkg_by_race = {row["sessionId"]: row for row in atlas["byRace"]}
    csv_by_race = {row["sessionId"]: row for row in race_rows if (as_int(row["cautionCount"]) or 0) > 0}
    if set(pkg_by_race) != set(csv_by_race):
        fail("package byRace session set != caution_by_race (cautionCount>0) set")
    for sid, csv_row in csv_by_race.items():
        pkg = pkg_by_race[sid]
        for col, key in (("totalRaceLaps", "totalRaceLaps"), ("cautionCount", "cautionCount"), ("cautionLapsTotal", "cautionLapsTotal"), ("openingThird", "opening"), ("middleThird", "middle"), ("finalThird", "final"), ("ranToFlagCount", "ranToFlagCount")):
            if as_int(csv_row[col]) != as_int(pkg.get(key)):
                fail(f"package byRace {sid}: {key} {pkg.get(key)!r} != CSV {csv_row[col]!r}")
        if not nums_equal(csv_row["medianDurationLaps"], pkg.get("medianDurationLaps")):
            fail(f"package byRace {sid}: medianDurationLaps {pkg.get('medianDurationLaps')} != CSV {csv_row['medianDurationLaps']}")
        if normalize_categories(csv_row["categories"]) != normalize_categories(pkg.get("categories")):
            fail(f"package byRace {sid}: categories != CSV")

    # byVenue: deep-compare every rendered field, including the category rollup.
    pkg_by_venue = {row["venueSlug"]: row for row in atlas["byVenue"]}
    csv_by_venue = {row["venueSlug"]: row for row in venue_rows}
    if set(pkg_by_venue) != set(csv_by_venue):
        fail("package byVenue venue set != caution_by_venue set")
    for slug, csv_row in csv_by_venue.items():
        pkg = pkg_by_venue[slug]
        for col, key in (("races", "races"), ("cautions", "cautions"), ("minPerRace", "minPerRace"), ("maxPerRace", "maxPerRace"), ("openingThird", "opening"), ("middleThird", "middle"), ("finalThird", "final"), ("ranToFlagCount", "ranToFlagCount")):
            if as_int(csv_row[col]) != as_int(pkg.get(key)):
                fail(f"package byVenue {slug}: {key} {pkg.get(key)!r} != CSV {csv_row[col]!r}")
        for col, key in (("medianPerRace", "medianPerRace"), ("meanPerRace", "meanPerRace"), ("medianDurationLaps", "medianDurationLaps")):
            if not nums_equal(csv_row[col], pkg.get(key)):
                fail(f"package byVenue {slug}: {key} {pkg.get(key)!r} != CSV {csv_row[col]!r}")
        if (csv_row["dominantThird"] or "") != (pkg.get("dominantThird") or ""):
            fail(f"package byVenue {slug}: dominantThird {pkg.get('dominantThird')!r} != CSV {csv_row['dominantThird']!r}")
        if normalize_categories(csv_row["categories"]) != normalize_categories(pkg.get("categories")):
            fail(f"package byVenue {slug}: categories != CSV")


def main() -> None:
    data = json.loads(DATASET_PATH.read_text())
    check_cause_parsing()
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

    # ---- every rendered aggregate, re-derived independently ---------------- #
    check_venue_rollups(venue_rows, truth)
    check_race_rollups(race_rows, truth)

    # ---- the rows the UI actually reads, deep-compared through the package -- #
    check_ui_package(event_rows, race_rows, venue_rows)

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
