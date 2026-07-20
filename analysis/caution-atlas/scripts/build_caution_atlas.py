#!/usr/bin/env python3
"""Build the Caution Atlas lane.

A descriptive, zero-modeling count of full-course cautions per INDY NXT venue:
how many yellows fell per race (median + range), where in the race they fell
(which third of the distance), what the official Results-PDF caution summary
recorded as the cause (counted, never editorialized), and how long each ran
before the restart. Every figure carries its denominator; nothing here is a
probability, a prediction, or a verdict.

Grain and gating (documented so the UI never has to guess):
  - Cautions come from the official Results-PDF caution summaries carried in the
    canonical dataset's `incidents` (raw.startLap..raw.endLap, raw.cautionNumber,
    raw.reason). A caution incident is one official caution episode.
  - Only INDY NXT RACE sessions that have actually been run are counted: status
    'official' AND eventStartDate on or before the as-of date. A future race has
    zero recorded cautions because it has not happened — counting it as a
    caution-free race would deflate every venue's numbers, so it is excluded.
  - "Which third" is the caution's START lap over the race distance actually run
    (the leader's last charted lap). opening = first third, middle = second,
    final = last. A race with no lap chart contributes its caution count but its
    cautions are marked third 'unknown' and excluded from the thirds tallies.
  - The cause category is read from the OFFICIAL LABEL — the reason text before
    the delimiter (':', ';', or a spaced ' - ') that separates the label from the
    incident detail — and mapped by its cause keywords (Contact, Off course,
    Spin, Debris, Mechanical, Conditions). Only the label region is scanned, so
    detail text never sways the cause. A label that carries two causes
    (ambiguous) or none (unmapped) FAILS CLOSED rather than being resolved by a
    priority order. The raw reason is preserved beside the category.
  - A caution whose end lap is the final lap ran to the flag: no restart. Every
    other caution's restart lap is end lap + 1.

Everything is a count of official caution episodes: no lap times, no positions,
no inference about who or what "caused" anything beyond the official label.
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
LANE = ROOT / "analysis/caution-atlas"
OUTPUT = LANE / "output"
TABLES = OUTPUT / "tables"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

INDY_NXT_ID = "series_indy_nxt"

# Nashville is the handoff's reconciliation anchor; the second race pins a
# multi-caution road course. Both are re-derived by the validator.
HAND_VERIFIED_SESSIONS = ("session_indy_nxt_2024_6323", "session_indy_nxt_2026_6749")

# Cause mapping: keywords are matched only within the OFFICIAL LABEL region (the
# text before the label/detail delimiter), never across the whole reason. There
# is no priority order — a label that matches two causes is ambiguous and fails
# closed, because "Off course beats Spin" is not a defensible universal call.
CAUSE_KEYWORDS = (
    ("Contact", ("contact",)),
    ("Off course", ("off course", "off-course")),
    ("Spin", ("spin",)),
    ("Debris", ("debris",)),
    ("Mechanical", ("mechanical",)),
    ("Conditions", ("conditions", "condition")),
)


class CautionCauseError(ValueError):
    """A caution reason whose official label maps to no cause, or to more than
    one. The lane fails closed rather than guess the cause by a priority order."""


def resolve_as_of_date() -> date:
    override = os.environ.get("BRYCECAST_ANALYTICS_AS_OF_DATE")
    if override and override.strip():
        try:
            return date.fromisoformat(override.strip())
        except ValueError as exc:
            raise SystemExit("BRYCECAST_ANALYTICS_AS_OF_DATE must be YYYY-MM-DD") from exc
    return date.today()


AS_OF_DATE = resolve_as_of_date()


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


def parse_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def round1(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value + 0.0, 3)


def cause_label_region(reason: str) -> str:
    """The official label: the reason text up to the first delimiter that
    separates the label from the incident detail. ':' and ';' always delimit;
    a SPACED hyphen ' - ' delimits too, so an 'off-course' hyphen stays intact."""
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
    """Map a caution reason to its official cause, failing closed on an ambiguous
    or unmapped label rather than choosing by priority."""
    region = cause_label_region(reason).lower()
    matched: list[str] = []
    for label, keywords in CAUSE_KEYWORDS:
        if label not in matched and any(keyword in region for keyword in keywords):
            matched.append(label)
    if len(matched) == 1:
        return matched[0]
    if not matched:
        raise CautionCauseError(
            f"unrecognized caution cause label {region!r} (from reason {reason!r}); extend CAUSE_KEYWORDS or fix the source"
        )
    raise CautionCauseError(
        f"ambiguous caution cause label {region!r} maps to {matched} (from reason {reason!r}); fail closed rather than guess"
    )


def third_of(start_lap: int | None, total_laps: int) -> str:
    if start_lap is None or total_laps <= 0:
        return "unknown"
    fraction = start_lap / total_laps
    if fraction <= 1 / 3:
        return "opening"
    if fraction <= 2 / 3:
        return "middle"
    return "final"


# ----------------------------------------------------------------------------- #
# Indexing
# ----------------------------------------------------------------------------- #


def build_context(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data.get("events", [])}
    tracks = {row["id"]: row for row in data.get("tracks", [])}
    return {"events": events, "tracks": tracks}


def indy_nxt_run_race_sessions(data: dict[str, Any], ctx: dict[str, Any]) -> list[dict[str, Any]]:
    """Official INDY NXT race sessions run on or before the as-of date."""
    out = []
    considered = 0
    for session in data.get("sessions", []):
        event = ctx["events"].get(session.get("eventId"), {})
        if event.get("seriesId") != INDY_NXT_ID or session.get("sessionType") != "race":
            continue
        considered += 1
        event_date = parse_date(event.get("eventStartDate"))
        is_run = session.get("status") == "official" and event_date is not None and event_date <= AS_OF_DATE
        if not is_run:
            continue
        track = ctx["tracks"].get(event.get("trackId"), {})
        out.append(
            {
                "sessionId": session["id"],
                "raceLabel": session.get("raceLabel") or event.get("name") or session["id"],
                "seasonYear": clean_int(event.get("seasonYear"))
                or clean_int((re.search(r"_(\d{4})_", session["id"]) or [None, None])[1]),
                "trackName": track.get("name") or event.get("trackName") or "Unknown venue",
                "trackType": track.get("trackType") or track.get("type") or event.get("trackType") or "unknown",
                "eventStartDate": event.get("eventStartDate"),
            }
        )
    out.sort(key=lambda row: (str(row["eventStartDate"]), str(row["sessionId"])))
    return out, considered


def caution_episodes_by_session(data: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for incident in data.get("incidents", []):
        type_text = str(incident.get("incidentType", "")).lower()
        desc_text = str(incident.get("description", "")).lower()
        if "caution" not in type_text and "caution" not in desc_text:
            continue
        raw = incident.get("raw", {}) or {}
        start = clean_int(raw.get("startLap") if raw.get("startLap") is not None else incident.get("lapNumber"))
        end = clean_int(raw.get("endLap") if raw.get("endLap") is not None else raw.get("startLap"))
        if end is None:
            end = start
        if start is None or end is None or start <= 0 or end <= 0:
            continue
        out[incident["sessionId"]].append(
            {
                "cautionNumber": clean_int(raw.get("cautionNumber")),
                "startLap": start,
                "endLap": end,
                "reason": (raw.get("reason") or "").strip() or "Caution",
            }
        )
    for rows in out.values():
        rows.sort(key=lambda row: (row["startLap"], row["endLap"], row["cautionNumber"] or 0))
    return out


def lap_chart_totals(data: dict[str, Any], session_ids: set[str]) -> dict[str, int]:
    """sessionId -> leader's last charted lap (the race distance run)."""
    out: dict[str, int] = defaultdict(int)
    for sample in data.get("lapSamples", []):
        session_id = sample.get("sessionId")
        if session_id not in session_ids:
            continue
        lap_no = sample.get("lapNumber")
        if lap_no is None:
            continue
        try:
            out[session_id] = max(out[session_id], int(lap_no))
        except (TypeError, ValueError):
            continue
    return out


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


def categories_string(counter: dict[str, int]) -> str:
    """'Contact:3;Debris:1' — sorted by count desc, then name."""
    ordered = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))
    return ";".join(f"{label}:{count}" for label, count in ordered)


def main() -> None:
    data = load_dataset()
    ctx = build_context(data)
    source_hash = dataset_hash()

    run_sessions, considered = indy_nxt_run_race_sessions(data, ctx)
    session_ids = {row["sessionId"] for row in run_sessions}
    totals_by_session = lap_chart_totals(data, session_ids)
    cautions = caution_episodes_by_session(data)

    event_rows: list[dict[str, Any]] = []
    race_rows: list[dict[str, Any]] = []
    uncovered_rows: list[dict[str, Any]] = []

    races_with_caution = 0
    races_caution_free = 0
    races_without_chart = 0

    for session in run_sessions:
        session_id = session["sessionId"]
        total_laps = totals_by_session.get(session_id, 0)
        episodes = cautions.get(session_id, [])
        if not episodes:
            races_caution_free += 1
        else:
            races_with_caution += 1
        if total_laps <= 0:
            races_without_chart += 1
            uncovered_rows.append(
                {
                    "sessionId": session_id,
                    "seasonYear": session["seasonYear"],
                    "raceLabel": session["raceLabel"],
                    "trackName": session["trackName"],
                    "reason": "no_official_lap_chart",
                    "note": "No lap-chart distance for this race; its cautions are counted but not placed in a third.",
                }
            )

        third_counts = {"opening": 0, "middle": 0, "final": 0, "unknown": 0}
        category_counts: dict[str, int] = defaultdict(int)
        ran_to_flag = 0
        durations: list[int] = []

        for episode in episodes:
            start = episode["startLap"]
            end = episode["endLap"]
            duration = end - start + 1
            durations.append(duration)
            to_flag = total_laps > 0 and end >= total_laps
            restart_lap = None if to_flag else end + 1
            if to_flag:
                ran_to_flag += 1
            third = third_of(start, total_laps)
            third_counts[third] += 1
            category = categorize(episode["reason"])
            category_counts[category] += 1
            lap_fraction = round(start / total_laps, 4) if total_laps > 0 else None

            event_rows.append(
                {
                    "sessionId": session_id,
                    "seasonYear": session["seasonYear"],
                    "raceLabel": session["raceLabel"],
                    "trackName": session["trackName"],
                    "trackType": session["trackType"],
                    "venueSlug": venue_slug(session["trackName"]),
                    "cautionNumber": episode["cautionNumber"],
                    "startLap": start,
                    "endLap": end,
                    "durationLaps": duration,
                    "totalRaceLaps": total_laps,
                    "lapFraction": lap_fraction,
                    "third": third,
                    "restartLap": restart_lap,
                    "ranToFlag": "true" if to_flag else "false",
                    "category": category,
                    "reason": episode["reason"],
                    "sourceHash": source_hash,
                }
            )

        race_rows.append(
            {
                "sessionId": session_id,
                "seasonYear": session["seasonYear"],
                "raceLabel": session["raceLabel"],
                "trackName": session["trackName"],
                "trackType": session["trackType"],
                "venueSlug": venue_slug(session["trackName"]),
                "eventStartDate": session["eventStartDate"],
                "totalRaceLaps": total_laps,
                "cautionCount": len(episodes),
                "cautionLapsTotal": sum(durations),
                "openingThird": third_counts["opening"],
                "middleThird": third_counts["middle"],
                "finalThird": third_counts["final"],
                "unknownThird": third_counts["unknown"],
                "ranToFlagCount": ran_to_flag,
                "medianDurationLaps": round1(median([float(d) for d in durations])),
                "categories": categories_string(category_counts),
                "sourceHash": source_hash,
            }
        )

    venue_rows = rollup_by_venue(race_rows, event_rows, source_hash)
    category_totals: dict[str, int] = defaultdict(int)
    third_totals = {"opening": 0, "middle": 0, "final": 0, "unknown": 0}
    for row in event_rows:
        category_totals[row["category"]] += 1
        third_totals[row["third"]] += 1

    write_csv(
        TABLES / "caution_events.csv",
        event_rows,
        [
            "sessionId", "seasonYear", "raceLabel", "trackName", "trackType", "venueSlug",
            "cautionNumber", "startLap", "endLap", "durationLaps", "totalRaceLaps",
            "lapFraction", "third", "restartLap", "ranToFlag", "category", "reason", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "caution_by_race.csv",
        race_rows,
        [
            "sessionId", "seasonYear", "raceLabel", "trackName", "trackType", "venueSlug",
            "eventStartDate", "totalRaceLaps", "cautionCount", "cautionLapsTotal",
            "openingThird", "middleThird", "finalThird", "unknownThird", "ranToFlagCount",
            "medianDurationLaps", "categories", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "caution_by_venue.csv",
        venue_rows,
        [
            "venueSlug", "trackName", "trackType", "seasons", "races", "cautions",
            "medianPerRace", "minPerRace", "maxPerRace", "meanPerRace",
            "openingThird", "middleThird", "finalThird", "unknownThird", "dominantThird",
            "ranToFlagCount", "medianDurationLaps", "categories", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "uncovered_races.csv",
        uncovered_rows,
        ["sessionId", "seasonYear", "raceLabel", "trackName", "reason", "note"],
    )

    summary = {
        "schemaVersion": "brycecast.cautionAtlas.v1",
        "generatedAt": now_iso(),
        "asOfDate": AS_OF_DATE.isoformat(),
        "datasetSha256": source_hash,
        "method": {
            "unit": "official caution episode",
            "thirds": "The caution's start lap over the race distance run (the leader's last charted lap): opening/middle/final third.",
            "category": "A grouping of the official reason text by its leading keyword; the raw reason is preserved and never editorialized.",
            "restart": "A caution ending on the final lap ran to the flag (no restart); every other caution's restart lap is its end lap + 1.",
            "source": "Official INDY NXT Results-PDF caution summaries (incidents) and official lap-chart distance in data/career/career.dataset.json.",
            "precision": "official-report",
        },
        "coverage": {
            "indyNxtRaceSessions": considered,
            "racesConsidered": len(run_sessions),
            "racesWithCaution": races_with_caution,
            "racesCautionFree": races_caution_free,
            "racesWithoutChart": races_without_chart,
            "totalCautions": len(event_rows),
        },
        "totals": {
            "cautions": len(event_rows),
            "byCategory": dict(sorted(category_totals.items(), key=lambda kv: (-kv[1], kv[0]))),
            "byThird": third_totals,
        },
        "byVenue": [venue_summary_row(row) for row in venue_rows],
        "handVerification": build_hand_verification(race_rows, event_rows),
        "sources": [
            {
                "path": "data/career/career.dataset.json",
                "note": "Official Results-PDF caution summaries (incidents) and official lap-chart distance.",
            },
        ],
        "caveats": [
            "Counts of official caution episodes only — no lap times, no positions, no probabilities.",
            "Which-third is the lap the caution flew over the race distance run; a race with no lap chart is counted but not placed in a third.",
            "Cause categories group the official reason text; the raw reason is preserved and never editorialized.",
            "Future and not-yet-official races are excluded so a venue's rate reflects only races actually run.",
        ],
    }
    write_json(OUTPUT / "summary.json", summary)

    print(
        f"caution-atlas: {len(event_rows)} cautions across {races_with_caution} of "
        f"{len(run_sessions)} run races ({races_caution_free} caution-free), "
        f"{len(venue_rows)} venues, as-of {AS_OF_DATE.isoformat()}."
    )


def rollup_by_venue(
    race_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    source_hash: str,
) -> list[dict[str, Any]]:
    races_by_venue: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in race_rows:
        races_by_venue[row["venueSlug"]].append(row)
    events_by_venue: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in event_rows:
        events_by_venue[row["venueSlug"]].append(row)

    out: list[dict[str, Any]] = []
    for venue_slug_key, races in races_by_venue.items():
        counts = [row["cautionCount"] for row in races]
        events = events_by_venue.get(venue_slug_key, [])
        thirds = {"opening": 0, "middle": 0, "final": 0, "unknown": 0}
        category_counts: dict[str, int] = defaultdict(int)
        ran_to_flag = 0
        durations: list[int] = []
        for event in events:
            thirds[event["third"]] += 1
            category_counts[event["category"]] += 1
            if event["ranToFlag"] == "true":
                ran_to_flag += 1
            durations.append(event["durationLaps"])
        # Dominant third: strict max of the placed thirds (unknown never wins).
        placed = {k: thirds[k] for k in ("opening", "middle", "final")}
        top = max(placed.values()) if placed else 0
        leaders = [k for k, v in placed.items() if v == top and v > 0]
        dominant_third = leaders[0] if len(leaders) == 1 else ""
        sample = races[0]
        seasons = sorted({str(row["seasonYear"]) for row in races if row["seasonYear"] is not None})
        out.append(
            {
                "venueSlug": venue_slug_key,
                "trackName": sample["trackName"],
                "trackType": sample["trackType"],
                "seasons": ";".join(seasons),
                "races": len(races),
                "cautions": len(events),
                "medianPerRace": round1(median([float(c) for c in counts])),
                "minPerRace": min(counts) if counts else 0,
                "maxPerRace": max(counts) if counts else 0,
                "meanPerRace": round1(mean([float(c) for c in counts])),
                "openingThird": thirds["opening"],
                "middleThird": thirds["middle"],
                "finalThird": thirds["final"],
                "unknownThird": thirds["unknown"],
                "dominantThird": dominant_third,
                "ranToFlagCount": ran_to_flag,
                "medianDurationLaps": round1(median([float(d) for d in durations])),
                "categories": categories_string(category_counts),
                "sourceHash": source_hash,
            }
        )
    out.sort(key=lambda row: str(row["venueSlug"]))
    return out


def parse_categories(value: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for part in (value or "").split(";"):
        if not part:
            continue
        label, _, count = part.partition(":")
        out.append({"category": label, "count": clean_int(count) or 0})
    return out


def venue_summary_row(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "venueSlug": row["venueSlug"],
        "trackName": row["trackName"],
        "trackType": row["trackType"],
        "seasons": row["seasons"],
        "races": row["races"],
        "cautions": row["cautions"],
        "medianPerRace": row["medianPerRace"],
        "minPerRace": row["minPerRace"],
        "maxPerRace": row["maxPerRace"],
        "meanPerRace": row["meanPerRace"],
        "opening": row["openingThird"],
        "middle": row["middleThird"],
        "final": row["finalThird"],
        "unknown": row["unknownThird"],
        "dominantThird": row["dominantThird"],
        "ranToFlagCount": row["ranToFlagCount"],
        "medianDurationLaps": row["medianDurationLaps"],
        "categories": parse_categories(row["categories"]),
    }


def build_hand_verification(race_rows: list[dict[str, Any]], event_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_session_races = {row["sessionId"]: row for row in race_rows}
    out = []
    for session_id in HAND_VERIFIED_SESSIONS:
        race = by_session_races.get(session_id)
        if not race:
            continue
        events = [e for e in event_rows if e["sessionId"] == session_id]
        out.append(
            {
                "sessionId": session_id,
                "raceLabel": race["raceLabel"],
                "trackName": race["trackName"],
                "totalRaceLaps": race["totalRaceLaps"],
                "cautionCount": race["cautionCount"],
                "cautions": [
                    {
                        "cautionNumber": e["cautionNumber"],
                        "startLap": e["startLap"],
                        "endLap": e["endLap"],
                        "third": e["third"],
                        "category": e["category"],
                        "reason": e["reason"],
                    }
                    for e in sorted(events, key=lambda e: (e["startLap"], e["endLap"]))
                ],
            }
        )
    return out


if __name__ == "__main__":
    main()
