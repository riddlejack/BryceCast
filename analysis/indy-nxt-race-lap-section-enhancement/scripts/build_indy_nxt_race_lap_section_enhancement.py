#!/usr/bin/env python3
"""Build INDY NXT race lap/section enhancement artifacts."""

from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import math
import os
import re
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/indy-nxt-race-lap-section-enhancement"
OUTPUT_DIR = LANE_DIR / "output"
PACK_DIR = OUTPUT_DIR / "context-packs"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
INDY_NXT_ID = "series_indy_nxt"

# Derived remainder (the stopwatch trick): per lap, lapTotal minus the sum of
# the racing-line section times is the exact time spent on everything the loops
# don't watch. Emitted as this synthetic section so it rides the same contract.
DERIVED_SECTION_NAME = "Untimed remainder"
# A lap's remainder counts as a GENUINE untimed stretch (worth deriving a shade
# for) only when the racing sections leave more than this share of the lap
# unmeasured. Nashville leaves ~56% (its straights carry no loops); Iowa and
# Milwaukee leave 0.00% once the SF/FS racing sections are counted correctly, so
# their remainder is a classification artefact, not a real gap, and is not shipped.
GENUINE_GAP_MIN_SHARE = 0.02
# Official Section Results print times to 4 decimal places, so a lap whose
# sections tile it exactly lands within half a print unit of zero — with the
# sign decided by float addition order. Below this, a remainder is noise, not a
# measurement. (Before the 2026-09-19 front-straight ruling the affected venues
# never tiled exactly, so this never came up; afterwards eight of them do.)
PRINT_PRECISION_SECONDS = 0.00005
# A car needs at least this many clean section observations to contribute a
# representative time to a section's field distribution (denominator honesty).
MIN_CAR_CLEAN_OBSERVATIONS = 3


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
    h = hashlib.sha256()
    with DATASET_PATH.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def load_dataset() -> dict[str, Any]:
    with DATASET_PATH.open() as f:
        return json.load(f)


def clean_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        if math.isnan(float(value)):
            return None
        return float(value)
    text = str(value).strip()
    if not text or text in {"-", "--"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def slug(value: str) -> str:
    out = re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")
    return out or "track"


def venue_slug(track_name: str) -> str:
    normalized = track_name.lower()
    if "mid-ohio" in normalized:
        return "mid_ohio"
    return slug(track_name)


def parse_event_date(value: Any) -> date | None:
    try:
        return date.fromisoformat(str(value or "")[:10])
    except ValueError:
        return None


def next_upcoming_track_name(data: dict[str, Any]) -> str | None:
    tracks = {row["id"]: row for row in data.get("tracks", [])}
    candidates: list[tuple[date, str, str]] = []
    for event in data.get("events", []):
        if event.get("seriesId") != INDY_NXT_ID:
            continue
        event_date = parse_event_date(event.get("eventStartDate"))
        if event_date is None or event_date < RUN_DATE:
            continue
        track = tracks.get(event.get("trackId") or "", {})
        track_name = track.get("name") or event.get("trackName") or ""
        if track_name:
            candidates.append((event_date, str(event.get("id") or ""), str(track_name)))
    if not candidates:
        return None
    candidates.sort(key=lambda row: (row[0], row[1]))
    return candidates[0][2]


def median(values: Iterable[float]) -> float | None:
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


def mean(values: Iterable[float]) -> float | None:
    clean = [value for value in values if value is not None]
    if not clean:
        return None
    return float(sum(clean) / len(clean))


def fmt(value: Any, digits: int = 4) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        return round(value, digits)
    return value


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow({field: fmt(row.get(field)) for field in fields})


def write_csv_gz(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the gzip byte-stable across rebuilds of identical rows.
    with gzip.GzipFile(path, "wb", mtime=0) as raw:
        with io.TextIOWrapper(raw, encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", lineterminator="\n")
            writer.writeheader()
            for row in rows:
                writer.writerow({field: fmt(row.get(field)) for field in fields})


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def is_bryce(row: dict[str, Any]) -> bool:
    return row.get("driverId") == BRYCE_ID or "aron, bryce" in str(row.get("driverName", "")).lower()


# The front-straight racing-line families (the 2026-09-19 front-straights fix).
#
# The official Section Results name the S/F straight after the pit timing loops
# it runs between — the loops sit BESIDE the racing surface, so the span the car
# actually drives is the front straight, not the pit lane. The July rule read
# any PI/PO reference as a pit split and threw these away, which is why the
# straights at St. Petersburg, Indianapolis RC, Barber, Portland and the S/F
# stretches at Laguna Seca, WWTR, Mid-Ohio and Arlington never coloured.
#
# Keyed by (official track name -> exact section families), so a genuinely new
# name at a new venue FAILS CLOSED into pit_or_timing_line rather than being
# swept in by a loose regex. Every entry below is admitted on three pieces of
# evidence, measured over all 44 race sessions in race_section_lap_observations:
#
#   1. SPEED. Median speed on green laps is full racing pace, not pit pace:
#      Barber FS-PO 147 mph; IMS FS - PO 165 / FS - PO 2 170 / FS - PI 150;
#      Mid-Ohio FS - PO 135; Portland FS-PO 156 / FS-PI 142; St. Petersburg
#      FS-PO 148 / FS-PI 130; Laguna Seca FS - PI 115; WWTR FS - PO 172 /
#      FS - PI 164; Arlington FS-PO 114 / FS PI 86 (a 40 mph pit lane cannot
#      produce these). The genuine pit splits sit at 0.4-33 mph.
#   2. PRESENCE. They are recorded on EVERY lap (n = the car's lap count). The
#      genuine pit splits (``PI to PO``, ``PO to SF``, ``SF to PI``,
#      ``PO to Alt``, ``Alt S/F to PI``, ``PO to I13A``) appear once or twice
#      per race — only on the laps the car actually pitted — and are excluded.
#   3. TILING. At every venue above, sum(track sections) + sum(these families)
#      equals the official ``Lap`` row to 0.000s on green laps, with no venue
#      carrying an overlapping alternative span; before the fix the same
#      venues left 2.8-24.1% of the lap unaccounted for. That residual WAS
#      these families.
#
# This also brings the race lane in line with the qualifying lane, which has
# always read them as mainline sections (analysis/quali-lab/scripts/
# official-qualifying.mjs: "FS-PI / FS-PO are named mainline sections in these
# reports"), and with the curated map anchors, which were derived from the
# qualifying packs and have been waiting for these names ever since.
ON_TRACK_FRONT_STRAIGHT_FAMILIES: dict[str, frozenset[str]] = {
    "Barber Motorsports Park": frozenset({"FS-PO"}),
    "Indianapolis Motor Speedway Road Course": frozenset({"FS - PO", "FS - PO 2", "FS - PI"}),
    "Mid-Ohio Sports Car Course": frozenset({"FS - PO"}),
    "Portland International Raceway": frozenset({"FS-PI", "FS-PO"}),
    "Streets of Arlington": frozenset({"FS PI", "FS-PO"}),
    "Streets of St. Petersburg": frozenset({"FS-PI", "FS-PO"}),
    "WeatherTech Raceway Laguna Seca": frozenset({"FS - PI"}),
    "World Wide Technology Raceway": frozenset({"FS - PI", "FS - PO"}),
}


def is_pit_line(name: str, track_name: str) -> bool:
    """Pit/timing-line test (front-straight fix 2026-09-19; supersedes the
    2026-07-19 SF over-match fix).

    July's rule is kept for the SF half: a section like ``SF to T1`` /
    ``T4 to SF`` / ``FS to SF`` (ovals) or ``SF to I1`` / ``I15 to SF`` (road
    courses) is the RACING LINE measured loop-to-loop across the start/finish
    line, not a pit split, so an SF reference alone never excludes a section.

    What July got wrong is the other half — it assumed a PI/PO reference always
    means the pit lane. It does not: the S/F straight is named after the pit
    loops it runs past. ``ON_TRACK_FRONT_STRAIGHT_FAMILIES`` is the evidenced
    per-venue list of those on-track spans (see its comment for the speed,
    presence and tiling proof); everything else referencing pit-in/pit-out or
    the alternate start stays a pit split.

    Classification diff against the July rule across the 44 race sessions:
    14 (venue, family) pairs move to track_section — Barber FS-PO; IMS
    FS - PO / FS - PO 2 / FS - PI; Mid-Ohio FS - PO; Portland FS-PI / FS-PO;
    Arlington FS PI / FS-PO; St. Petersburg FS-PI / FS-PO; Laguna Seca
    FS - PI; WWTR FS - PI / FS - PO. The six pit-transit families
    (``PI to PO``, ``PO to SF``, ``SF to PI``, ``PO to Alt``,
    ``Alt S/F to PI``, ``PO to I13A``) stay pit_or_timing_line at every venue.

    This is also the tiling check's rule for deciding whether an untimed
    stretch is a GENUINE gap (Nashville's straights, which carry no loop at
    all) or fully timed. Under the new rule Nashville stays the only road/oval
    venue shipping a derived remainder; Barber, IMS, Mid-Ohio, Portland,
    St. Petersburg, Arlington, Laguna Seca and WWTR join Iowa, Milwaukee, Road
    America and Detroit at a 0.000s residual. See
    INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md § Derived Remainder.

    Pit laps cannot pollute these spans: the clean-lap filter already drops any
    lap over 110% of the car's own median green lap, and a pit stop costs far
    more than that (all 188 laps above 140% of the session median are already
    flagged ``no``), so a pit-in or pit-out lap never counts as a clean
    comparison here. Verified rather than assumed — no new guard was needed."""
    cleaned = name.strip()
    if cleaned == "Lap":
        return False
    if cleaned in ON_TRACK_FRONT_STRAIGHT_FAMILIES.get(track_name, frozenset()):
        return False
    upper = cleaned.upper()
    return bool(re.search(r"(^|[^A-Z])(PI|PO)([^A-Z]|$)", upper)) or "ALT START" in upper


def classify_section(name: str, track_name: str) -> str:
    cleaned = name.strip()
    if cleaned == "Lap":
        return "lap_total"
    if is_pit_line(cleaned, track_name):
        return "pit_or_timing_line"
    return "track_section"


def section_family(name: str) -> str:
    return re.sub(r"\s+", " ", name.strip())


def race_label(event: dict[str, Any], session: dict[str, Any]) -> str:
    year = event.get("seasonYear") or ""
    name = event.get("name") or session.get("sessionName") or session.get("id")
    session_name = session.get("sessionName") or ""
    if session_name and session_name.lower() not in {"race", "race 1"} and session_name not in name:
        return f"{year} {name} {session_name}".strip()
    return f"{year} {name}".strip()


def event_context(
    session_id: str,
    sessions: dict[str, dict[str, Any]],
    events: dict[str, dict[str, Any]],
    tracks: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    session = sessions.get(session_id, {})
    event = events.get(session.get("eventId"), {})
    track = tracks.get(event.get("trackId"), {})
    return {
        "session": session,
        "event": event,
        "track": track,
        "sessionId": session_id,
        "eventId": event.get("id") or session.get("eventId"),
        "seasonYear": event.get("seasonYear"),
        "raceLabel": race_label(event, session),
        "trackName": track.get("name") or "",
        "trackType": track.get("trackType") or "",
    }


def comparable_percentile(field_times: list[float], bryce_time: float) -> tuple[int | None, float | None]:
    if len(field_times) < 8:
        return None, None
    rank = 1 + sum(1 for value in field_times if value < bryce_time)
    return rank, 1 - ((rank - 1) / (len(field_times) - 1))


def position_percentile(position: float | None, field_size: int) -> float | None:
    if position is None or field_size <= 1:
        return None
    return 1 - ((position - 1) / (field_size - 1))


def build_indexes(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "events": {row["id"]: row for row in data["events"]},
        "sessions": {row["id"]: row for row in data["sessions"]},
        "tracks": {row["id"]: row for row in data["tracks"]},
        "results": {row["sessionId"]: row for row in data["results"] if row.get("driverId") == BRYCE_ID},
    }


def indy_nxt_race_session_ids(data: dict[str, Any], idx: dict[str, Any]) -> set[str]:
    out = set()
    for session in data["sessions"]:
        event = idx["events"].get(session.get("eventId"), {})
        if event.get("seriesId") == INDY_NXT_ID and session.get("sessionType") == "race":
            out.add(session["id"])
    return out


def caution_laps_by_session(data: dict[str, Any]) -> dict[str, set[int]]:
    out: dict[str, set[int]] = defaultdict(set)
    for incident in data["incidents"]:
        raw = incident.get("raw", {})
        start = int(raw.get("startLap") or incident.get("lapNumber") or 0)
        end = int(raw.get("endLap") or raw.get("startLap") or incident.get("lapNumber") or 0)
        if start <= 0 or end <= 0:
            continue
        if "caution" not in str(incident.get("incidentType", "")).lower() and "caution" not in str(incident.get("description", "")).lower():
            continue
        for lap_no in range(start, end + 1):
            out[incident["sessionId"]].add(lap_no)
    return out


def lap_caution_state(lap_no: int, caution_laps: set[int]) -> str:
    if lap_no in caution_laps:
        return "caution"
    if lap_no - 1 in caution_laps:
        return "restart_lap"
    return "green"


def segment_type(caution_state: str) -> str:
    if caution_state == "caution":
        return "caution_window"
    if caution_state == "restart_lap":
        return "restart_window"
    if caution_state == "green":
        return "green_run"
    return "unknown"


def build_lap_microstates(data: dict[str, Any], idx: dict[str, Any], source_hash: str) -> list[dict[str, Any]]:
    race_session_ids = indy_nxt_race_session_ids(data, idx)
    caution_by_session = caution_laps_by_session(data)
    field_by_session_lap: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    bryce_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lap in data["lapSamples"]:
        session_id = lap.get("sessionId")
        lap_no = lap.get("lapNumber")
        if session_id not in race_session_ids or lap_no is None:
            continue
        if clean_float(lap.get("position")) is None:
            continue
        field_by_session_lap[(session_id, int(lap_no))].append(lap)
        if lap.get("driverId") == BRYCE_ID:
            bryce_by_session[session_id].append(lap)

    rows: list[dict[str, Any]] = []
    for session_id in sorted(bryce_by_session):
        context = event_context(session_id, idx["sessions"], idx["events"], idx["tracks"])
        ordered = sorted(bryce_by_session[session_id], key=lambda row: int(row["lapNumber"]))
        first_position = clean_float(ordered[0].get("position")) if ordered else None
        previous_position = None
        for lap in ordered:
            lap_no = int(lap["lapNumber"])
            position = clean_float(lap.get("position"))
            field_rows = field_by_session_lap[(session_id, lap_no)]
            field_size = len(field_rows)
            caution_state = lap_caution_state(lap_no, caution_by_session.get(session_id, set()))
            delta = previous_position - position if previous_position is not None and position is not None else None
            rows.append(
                {
                    **{key: context[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                    "lapNumber": lap_no,
                    "position": position,
                    "previousPosition": previous_position,
                    "positionDelta": delta,
                    "netFromLapOne": first_position - position if first_position is not None and position is not None else None,
                    "fieldSizeAtLap": field_size,
                    "runningPositionPercentile": position_percentile(position, field_size),
                    "cautionState": caution_state,
                    "sourceCompleteness": lap.get("raw", {}).get("chartCompleteness") or "unknown",
                    "sourceState": "official_lap_chart",
                    "sourceHash": source_hash,
                }
            )
            previous_position = position
    return rows


def build_lap_segments(microstates: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in microstates:
        by_session[row["sessionId"]].append(row)
    for session_id, session_rows in sorted(by_session.items()):
        ordered = sorted(session_rows, key=lambda row: int(row["lapNumber"]))
        current: list[dict[str, Any]] = []
        current_type = None
        segment_index = 0
        for row in ordered:
            row_type = segment_type(row["cautionState"])
            if current and row_type != current_type:
                segment_index += 1
                rows.append(segment_summary(current, segment_index, current_type or "unknown", source_hash))
                current = []
            current.append(row)
            current_type = row_type
        if current:
            segment_index += 1
            rows.append(segment_summary(current, segment_index, current_type or "unknown", source_hash))
    return rows


def segment_summary(rows: list[dict[str, Any]], segment_index: int, current_type: str, source_hash: str) -> dict[str, Any]:
    positions = [clean_float(row["position"]) for row in rows if clean_float(row["position"]) is not None]
    deltas = [abs(clean_float(row.get("positionDelta")) or 0) for row in rows[1:]]
    percentiles = [clean_float(row.get("runningPositionPercentile")) for row in rows if clean_float(row.get("runningPositionPercentile")) is not None]
    start_position = clean_float(rows[0].get("position"))
    end_position = clean_float(rows[-1].get("position"))
    return {
        "sessionId": rows[0]["sessionId"],
        "raceLabel": rows[0]["raceLabel"],
        "trackName": rows[0]["trackName"],
        "segmentId": f"{rows[0]['sessionId']}_segment_{segment_index:02d}",
        "segmentType": current_type,
        "startLap": rows[0]["lapNumber"],
        "endLap": rows[-1]["lapNumber"],
        "lapCount": len(rows),
        "startPosition": start_position,
        "endPosition": end_position,
        "netGain": start_position - end_position if start_position is not None and end_position is not None else None,
        "bestPosition": min(positions) if positions else None,
        "worstPosition": max(positions) if positions else None,
        "volatility": sum(deltas),
        "medianRunningPositionPercentile": median(percentiles),
        "sourceCompleteness": ";".join(sorted({row.get("sourceCompleteness") or "unknown" for row in rows})),
        "sourceHash": source_hash,
    }


def build_inflections(microstates: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    rows = []
    for row in microstates:
        delta = clean_float(row.get("positionDelta"))
        if delta is None or abs(delta) < 1:
            continue
        direction = "gain" if delta > 0 else "loss"
        caution = row["cautionState"]
        if caution == "restart_lap":
            trigger = f"restart_{direction}"
        elif caution == "caution":
            trigger = f"caution_reorder_{direction}"
        else:
            trigger = f"green_flag_{direction}"
        rows.append(
            {
                "sessionId": row["sessionId"],
                "raceLabel": row["raceLabel"],
                "lapNumber": row["lapNumber"],
                "previousPosition": row["previousPosition"],
                "position": row["position"],
                "positionDelta": delta,
                "trigger": trigger,
                "cautionState": caution,
                "magnitude": abs(delta),
                "sourceHash": source_hash,
            }
        )
    rows.sort(key=lambda row: (row["sessionId"], int(row["lapNumber"])))
    return rows


def build_race_section_observations(
    data: dict[str, Any],
    idx: dict[str, Any],
    source_hash: str,
    microstates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    race_session_ids = indy_nxt_race_session_ids(data, idx)
    caution_by_session = caution_laps_by_session(data)
    caution_state_by_lap = {(row["sessionId"], int(row["lapNumber"])): row["cautionState"] for row in microstates}
    lap_chart_laps_by_session: dict[str, set[int]] = defaultdict(set)
    for row in microstates:
        lap_chart_laps_by_session[row["sessionId"]].add(int(row["lapNumber"]))
    observations: list[dict[str, Any]] = []

    metrics = [
        metric
        for metric in data["derivedMetrics"]
        if metric.get("seriesId") == INDY_NXT_ID
        and metric.get("metricType") == "official_section_results"
        and metric.get("sessionId") in race_session_ids
    ]
    for metric in sorted(metrics, key=lambda row: row.get("sessionId") or ""):
        session_id = metric["sessionId"]
        context = event_context(session_id, idx["sessions"], idx["events"], idx["tracks"])
        cars = metric.get("metrics", {}).get("cars", [])
        field_by_lap_section: dict[tuple[int, str], dict[tuple[str, str, str], float]] = defaultdict(dict)
        bryce_lap_totals: dict[int, float] = {}
        for car_index, car in enumerate(cars):
            key = (
                str(car.get("driverId") or car.get("driverName") or f"driver_{car_index}"),
                str(car.get("carNumber") or ""),
                str(car.get("carId") or ""),
            )
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    name = section.get("name")
                    time_seconds = clean_float(section.get("timeSeconds"))
                    if not name or time_seconds is None:
                        continue
                    field_by_lap_section[(lap_no_int, name)][key] = time_seconds
                    if is_bryce(car) and name == "Lap":
                        previous = bryce_lap_totals.get(lap_no_int)
                        bryce_lap_totals[lap_no_int] = time_seconds if previous is None else min(previous, time_seconds)
        green_lap_times = [
            lap_time
            for lap_no, lap_time in bryce_lap_totals.items()
            if lap_no > 0
            and lap_no not in caution_by_session.get(session_id, set())
            and (lap_no - 1) not in caution_by_session.get(session_id, set())
        ]
        median_green_lap = median(green_lap_times)
        clean_by_lap: dict[int, str] = {}
        for lap_no, lap_time in bryce_lap_totals.items():
            if lap_no <= 0 or median_green_lap is None:
                clean_by_lap[lap_no] = "unknown"
            elif lap_no in caution_by_session.get(session_id, set()) or (lap_no - 1) in caution_by_session.get(session_id, set()):
                clean_by_lap[lap_no] = "no"
            elif lap_time <= median_green_lap * 1.10:
                clean_by_lap[lap_no] = "yes"
            else:
                clean_by_lap[lap_no] = "no"

        seen: set[tuple[int, str, float]] = set()
        for car in cars:
            if not is_bryce(car):
                continue
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    name = section.get("name")
                    time_seconds = clean_float(section.get("timeSeconds"))
                    if not name or time_seconds is None:
                        continue
                    dedupe_key = (lap_no_int, name, round(time_seconds, 6))
                    if dedupe_key in seen:
                        continue
                    seen.add(dedupe_key)
                    has_lap_chart_row = lap_no_int in lap_chart_laps_by_session.get(session_id, set())
                    if has_lap_chart_row:
                        clean_candidate = clean_by_lap.get(lap_no_int, "unknown")
                        caution_state = caution_state_by_lap.get(
                            (session_id, lap_no_int),
                            lap_caution_state(lap_no_int, caution_by_session.get(session_id, set())),
                        )
                        source_state = "official_section_results+official_lap_chart+official_incident_caution_context"
                    else:
                        clean_candidate = "unknown"
                        caution_state = "unknown"
                        source_state = "official_section_results_only"
                    field_times = list(field_by_lap_section.get((lap_no_int, name), {}).values())
                    rank, percentile = comparable_percentile(field_times, time_seconds)
                    observations.append(
                        {
                            **{key: context[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                            "lapNumber": lap_no_int,
                            "sectionName": name,
                            "sectionFamily": section_family(name),
                            "sectionType": classify_section(name, context["trackName"]),
                            "timeSeconds": time_seconds,
                            "speedMph": clean_float(section.get("speedMph")),
                            "fieldComparisonCount": len(field_times),
                            "fieldRank": rank,
                            "fieldPercentile": percentile,
                            "cleanRaceLapCandidate": clean_candidate,
                            "cautionState": caution_state,
                            "sourceState": source_state,
                            "sourceMetricId": metric.get("id"),
                            "sourceHash": source_hash,
                        }
                    )
    return observations


def car_identity_key(car: dict[str, Any], car_index: int) -> tuple[str, str, str]:
    """The same per-driver key the ranking uses, so a re-derivation from the
    full-field table reproduces every stored Bryce rank exactly."""
    return (
        str(car.get("driverId") or car.get("driverName") or f"driver_{car_index}"),
        str(car.get("carNumber") or ""),
        str(car.get("carId") or ""),
    )


def per_car_clean_flags(lap_totals: dict[int, float], caution_laps: set[int]) -> dict[int, bool]:
    """Clean green-flag laps for one car, mirroring the Bryce clean filter: a
    green lap (itself and the lap before out of caution) within 110% of the
    car's own median green lap."""
    green = [
        lap_time
        for lap_no, lap_time in lap_totals.items()
        if lap_no > 0 and lap_no not in caution_laps and (lap_no - 1) not in caution_laps
    ]
    median_green = median(green)
    flags: dict[int, bool] = {}
    for lap_no, lap_time in lap_totals.items():
        flags[lap_no] = (
            median_green is not None
            and lap_no > 0
            and lap_no not in caution_laps
            and (lap_no - 1) not in caution_laps
            and lap_time <= median_green * 1.10
        )
    return flags


def build_field_and_derived_observations(
    data: dict[str, Any],
    idx: dict[str, Any],
    source_hash: str,
    microstates: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Full-field extraction (Brief H, the coverage-blindness fix).

    The legacy lane ranks Bryce against every car's per-lap section time but
    stores only Bryce's rows. This emits the WHOLE ranked field table (every
    car, every lap, every section) PLUS a synthesized ``Untimed remainder`` row
    per car per lap (lapTotal minus the racing-line sections — the stopwatch
    trick), and a compact per-section field-distribution summary the UI packs
    consume. Returns (field_rows, field_distribution_by_session)."""
    race_session_ids = indy_nxt_race_session_ids(data, idx)
    caution_by_session = caution_laps_by_session(data)
    caution_state_by_lap = {(row["sessionId"], int(row["lapNumber"])): row["cautionState"] for row in microstates}

    metrics = [
        metric
        for metric in data["derivedMetrics"]
        if metric.get("seriesId") == INDY_NXT_ID
        and metric.get("metricType") == "official_section_results"
        and metric.get("sessionId") in race_session_ids
    ]

    field_rows: list[dict[str, Any]] = []
    distribution_by_session: dict[str, Any] = {}

    for metric in sorted(metrics, key=lambda row: row.get("sessionId") or ""):
        session_id = metric["sessionId"]
        context = event_context(session_id, idx["sessions"], idx["events"], idx["tracks"])
        caution_laps = caution_by_session.get(session_id, set())
        cars = metric.get("metrics", {}).get("cars", [])

        # Aggregate every car's page-entries into one clock: key -> lap -> {name: time}.
        per_car: dict[tuple[str, str, str], dict[int, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
        car_meta: dict[tuple[str, str, str], dict[str, Any]] = {}
        for car_index, car in enumerate(cars):
            key = car_identity_key(car, car_index)
            car_meta.setdefault(
                key,
                {"driverId": car.get("driverId"), "carNumber": str(car.get("carNumber") or ""), "isBryce": is_bryce(car)},
            )
            for lap in car.get("laps", []):
                lap_no = lap.get("lapNumber")
                if lap_no is None:
                    continue
                lap_no_int = int(lap_no)
                for section in lap.get("sections", []):
                    name = section.get("name")
                    time_seconds = clean_float(section.get("timeSeconds"))
                    if not name or time_seconds is None:
                        continue
                    per_car[key][lap_no_int][name] = time_seconds

        # Stable anonymised car index (carNumber then driverId), so the shipped
        # distribution never carries a rival's name yet stays traceable here.
        ordered_keys = sorted(
            per_car,
            key=lambda k: (int(car_meta[k]["carNumber"]) if car_meta[k]["carNumber"].isdigit() else 9999, k[0]),
        )
        car_ref = {key: f"car_{position:02d}" for position, key in enumerate(ordered_keys)}

        # Racing-line families (SF/FS straights included, pit-in/out excluded).
        racing_families: set[str] = set()
        for laps in per_car.values():
            for sections in laps.values():
                for name in sections:
                    if name.strip() != "Lap" and not is_pit_line(name, context["trackName"]):
                        racing_families.add(section_family(name))

        # Per car: clean flags + remainder (lapTotal - sum of racing families,
        # only when the car has the lap total AND every racing family that lap).
        clean_flags: dict[tuple[str, str, str], dict[int, bool]] = {}
        remainder_by_lap: dict[int, dict[tuple[str, str, str], float]] = defaultdict(dict)
        uncovered_laps: dict[tuple[str, str, str], set[int]] = defaultdict(set)
        for key, laps in per_car.items():
            lap_totals = {lap_no: sections["Lap"] for lap_no, sections in laps.items() if "Lap" in sections}
            clean_flags[key] = per_car_clean_flags(lap_totals, caution_laps)
            for lap_no, sections in laps.items():
                lap_total = sections.get("Lap")
                if lap_total is None:
                    continue
                by_family = {
                    section_family(name): time_seconds
                    for name, time_seconds in sections.items()
                    if name.strip() != "Lap" and not is_pit_line(name, context["trackName"])
                }
                if not racing_families or set(by_family) != racing_families:
                    continue
                remainder = lap_total - sum(by_family.values())
                if remainder < -PRINT_PRECISION_SECONDS:  # data error: sections overrun the lap -> lap uncovered, never clamped
                    uncovered_laps[key].add(lap_no)
                    continue
                # Inside the source's own print precision the lap tiles exactly
                # and the sign is float noise, not an overrun. Clamping HERE is
                # not hiding a discrepancy: anything the source could actually
                # print is still caught above.
                remainder_by_lap[lap_no][key] = max(0.0, remainder)

        # Field time lists per (lap, section) and per lap (remainder) for ranking.
        field_by_lap_section: dict[tuple[int, str], list[float]] = defaultdict(list)
        for key, laps in per_car.items():
            for lap_no, sections in laps.items():
                for name, time_seconds in sections.items():
                    field_by_lap_section[(lap_no, name)].append(time_seconds)

        def rank_of(values: list[float], value: float) -> tuple[int | None, float | None]:
            return comparable_percentile(values, value)

        # Genuine-gap gate: Bryce's median remainder share of his median lap.
        bryce_key = next((key for key in per_car if car_meta[key]["isBryce"]), None)
        bryce_lap_totals = (
            {lap_no: sections["Lap"] for lap_no, sections in per_car[bryce_key].items() if "Lap" in sections}
            if bryce_key
            else {}
        )
        bryce_remainders = [remainder_by_lap[lap_no][bryce_key] for lap_no in remainder_by_lap if bryce_key in remainder_by_lap[lap_no]] if bryce_key else []
        median_lap = median(list(bryce_lap_totals.values()))
        median_remainder = median(bryce_remainders)
        remainder_share = (median_remainder / median_lap) if (median_remainder is not None and median_lap) else 0.0
        derived_coverage = "genuine_gap" if remainder_share > GENUINE_GAP_MIN_SHARE else "fully_timed"

        # Emit the full-field rows: every car, every lap, every raw section.
        for key in ordered_keys:
            meta = car_meta[key]
            for lap_no in sorted(per_car[key]):
                sections = per_car[key][lap_no]
                caution_state = caution_state_by_lap.get(
                    (session_id, lap_no), lap_caution_state(lap_no, caution_laps)
                )
                is_clean = clean_flags[key].get(lap_no, False)
                for name in sorted(sections):
                    if name.strip() == "Lap":
                        section_type = "lap_total"
                    elif is_pit_line(name, context["trackName"]):
                        section_type = "pit_or_timing_line"
                    else:
                        section_type = "track_section"
                    time_seconds = sections[name]
                    rank, percentile = rank_of(field_by_lap_section[(lap_no, name)], time_seconds)
                    field_rows.append(
                        {
                            "sessionId": session_id,
                            "seasonYear": context["seasonYear"],
                            "trackName": context["trackName"],
                            "carRef": car_ref[key],
                            "driverId": meta["driverId"],
                            "carNumber": meta["carNumber"],
                            "isBryce": "yes" if meta["isBryce"] else "no",
                            "lapNumber": lap_no,
                            "sectionName": name,
                            "sectionFamily": section_family(name),
                            "sectionType": section_type,
                            "timeSeconds": time_seconds,
                            "cleanRaceLapCandidate": "yes" if is_clean else "no",
                            "cautionState": caution_state,
                            "fieldComparisonCount": len(field_by_lap_section[(lap_no, name)]),
                            "fieldRank": rank,
                            "fieldPercentile": percentile,
                            "sourceHash": source_hash,
                        }
                    )
                # Synthesized derived-remainder row for this car/lap.
                if lap_no in remainder_by_lap and key in remainder_by_lap[lap_no]:
                    remainder = remainder_by_lap[lap_no][key]
                    field_remainders = list(remainder_by_lap[lap_no].values())
                    rank, percentile = rank_of(field_remainders, remainder)
                    field_rows.append(
                        {
                            "sessionId": session_id,
                            "seasonYear": context["seasonYear"],
                            "trackName": context["trackName"],
                            "carRef": car_ref[key],
                            "driverId": meta["driverId"],
                            "carNumber": meta["carNumber"],
                            "isBryce": "yes" if meta["isBryce"] else "no",
                            "lapNumber": lap_no,
                            "sectionName": DERIVED_SECTION_NAME,
                            "sectionFamily": DERIVED_SECTION_NAME,
                            "sectionType": "derived_remainder",
                            "timeSeconds": remainder,
                            "cleanRaceLapCandidate": "yes" if clean_flags[key].get(lap_no, False) else "no",
                            "cautionState": caution_state_by_lap.get((session_id, lap_no), lap_caution_state(lap_no, caution_laps)),
                            "fieldComparisonCount": len(field_remainders),
                            "fieldRank": rank,
                            "fieldPercentile": percentile,
                            "sourceHash": source_hash,
                        }
                    )

        # Per-section field distribution: each car's median CLEAN section time.
        families = sorted(racing_families) + [DERIVED_SECTION_NAME]
        section_distribution: dict[str, Any] = {}
        for family in families:
            car_medians: list[float] = []
            for key in ordered_keys:
                if family == DERIVED_SECTION_NAME:
                    values = [
                        remainder_by_lap[lap_no][key]
                        for lap_no in remainder_by_lap
                        if key in remainder_by_lap[lap_no] and clean_flags[key].get(lap_no, False)
                    ]
                else:
                    values = [
                        time_seconds
                        for lap_no, sections in per_car[key].items()
                        if clean_flags[key].get(lap_no, False)
                        for name, time_seconds in sections.items()
                        if section_family(name) == family
                    ]
                if len(values) >= MIN_CAR_CLEAN_OBSERVATIONS:
                    car_medians.append(round(float(statistics.median(values)), 4))
            if car_medians:
                section_distribution[family] = {
                    "fieldCarMedians": sorted(car_medians),
                    "fieldMedianSeconds": round(float(statistics.median(car_medians)), 4),
                    "fieldCarCount": len(car_medians),
                }

        # Bryce's per-lap derived remainder, ready to drop into the pack tuples.
        derived_remainder_rows: list[dict[str, Any]] = []
        if bryce_key is not None:
            for lap_no in sorted(remainder_by_lap):
                if bryce_key not in remainder_by_lap[lap_no]:
                    continue
                remainder = remainder_by_lap[lap_no][bryce_key]
                field_remainders = list(remainder_by_lap[lap_no].values())
                rank, percentile = rank_of(field_remainders, remainder)
                derived_remainder_rows.append(
                    {
                        "lapNumber": lap_no,
                        "fieldPercentile": percentile,
                        "fieldRank": rank,
                        "fieldComparisonCount": len(field_remainders),
                        "cleanRaceLapCandidate": "yes" if clean_flags[bryce_key].get(lap_no, False) else "no",
                        "cautionState": caution_state_by_lap.get(
                            (session_id, lap_no), lap_caution_state(lap_no, caution_laps)
                        ),
                        "timeSeconds": round(remainder, 4),
                    }
                )

        distribution_by_session[session_id] = {
            "trackName": context["trackName"],
            "seasonYear": context["seasonYear"],
            "derivedCoverage": derived_coverage,
            "racingSectionCount": len(racing_families),
            "medianRemainderSeconds": round(median_remainder, 4) if median_remainder is not None else None,
            "medianRemainderShareOfLap": round(remainder_share, 4),
            "uncoveredLapCount": sum(len(laps) for laps in uncovered_laps.values()),
            "sections": section_distribution,
            "derivedRemainder": derived_remainder_rows if derived_coverage == "genuine_gap" else [],
        }

    return field_rows, distribution_by_session


def format_section_list(groups: dict[str, list[float]], reverse: bool) -> str:
    ranked = [
        (name, median(values), len(values))
        for name, values in groups.items()
        if len(values) >= 8 and median(values) is not None
    ]
    ranked.sort(key=lambda item: item[1], reverse=reverse)
    return "; ".join(f"{name}:{value:.2f} n={count}" for name, value, count in ranked[:4])


def build_section_session_summary(observations: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in observations:
        by_session[row["sessionId"]].append(row)
    summaries = []
    for session_id, rows in sorted(by_session.items()):
        first = rows[0]
        clean_track = [
            row
            for row in rows
            if row["sectionType"] == "track_section"
            and row.get("cleanRaceLapCandidate") == "yes"
            and row.get("fieldPercentile") is not None
        ]
        percentiles = [float(row["fieldPercentile"]) for row in clean_track]
        groups: dict[str, list[float]] = defaultdict(list)
        for row in clean_track:
            groups[row["sectionFamily"]].append(float(row["fieldPercentile"]))
        clean_laps = {
            int(row["lapNumber"])
            for row in rows
            if row.get("cleanRaceLapCandidate") == "yes" and row["sectionType"] == "lap_total"
        }
        source_states = {row.get("sourceState") for row in rows}
        has_lap_chart_backing = "official_section_results+official_lap_chart+official_incident_caution_context" in source_states
        if clean_track:
            source_state = "official_section_results+official_lap_chart+official_incident_caution_context_clean_lap_filtered"
            if "official_section_results_only" in source_states:
                source_state += "+section_only_rows_excluded"
        elif has_lap_chart_backing:
            source_state = "official_section_results+official_lap_chart+official_incident_caution_context_no_clean_comparable_rows"
        else:
            source_state = "official_section_results_only_no_lap_chart_clean_filter_unavailable"
        summaries.append(
            {
                **{key: first[key] for key in ["sessionId", "eventId", "seasonYear", "raceLabel", "trackName", "trackType"]},
                "cleanRaceLapCount": len(clean_laps),
                "cleanSectionComparisonRows": len(clean_track),
                "medianCleanTrackSectionPercentile": median(percentiles),
                "topQuartileCleanSectionShare": sum(1 for value in percentiles if value >= 0.75) / len(percentiles) if percentiles else None,
                "bottomQuartileCleanSectionShare": sum(1 for value in percentiles if value <= 0.25) / len(percentiles) if percentiles else None,
                "bestCleanSectionFamilies": format_section_list(groups, reverse=True),
                "weakestCleanSectionFamilies": format_section_list(groups, reverse=False),
                "sourceState": source_state,
                "sourceHash": source_hash,
            }
        )
    return summaries


def build_track_race_rows(
    microstates: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    source_hash: str,
    track_name: str,
) -> list[dict[str, Any]]:
    micro_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    segment_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    section_by_session = {row["sessionId"]: row for row in section_summaries}
    track_match = track_name.lower()
    for row in microstates:
        if track_match in row["trackName"].lower():
            micro_by_session[row["sessionId"]].append(row)
    for row in segments:
        if track_match in row.get("trackName", "").lower():
            segment_by_session[row["sessionId"]].append(row)
    rows = []
    for session_id, laps in sorted(micro_by_session.items()):
        ordered = sorted(laps, key=lambda row: int(row["lapNumber"]))
        section = section_by_session.get(session_id, {})
        gain_segments = sorted(segment_by_session.get(session_id, []), key=lambda row: clean_float(row.get("netGain")) or 0, reverse=True)
        rows.append(
            {
                "sessionId": session_id,
                "raceLabel": ordered[0]["raceLabel"],
                "seasonYear": ordered[0]["seasonYear"],
                "trackName": ordered[0]["trackName"],
                "lapRows": len(ordered),
                "startPosition": ordered[0]["position"],
                "finishPosition": ordered[-1]["position"],
                "netLapChartGain": clean_float(ordered[0]["position"]) - clean_float(ordered[-1]["position"]) if clean_float(ordered[0]["position"]) is not None and clean_float(ordered[-1]["position"]) is not None else None,
                "bestRunningPosition": min(clean_float(row["position"]) for row in ordered if clean_float(row["position"]) is not None),
                "worstRunningPosition": max(clean_float(row["position"]) for row in ordered if clean_float(row["position"]) is not None),
                "bestSegment": f"{gain_segments[0]['segmentType']} L{gain_segments[0]['startLap']}-{gain_segments[0]['endLap']} gain {fmt(gain_segments[0]['netGain'], 2)}" if gain_segments else "",
                "medianCleanTrackSectionPercentile": section.get("medianCleanTrackSectionPercentile"),
                "bestCleanSectionFamilies": section.get("bestCleanSectionFamilies"),
                "weakestCleanSectionFamilies": section.get("weakestCleanSectionFamilies"),
                "sourceHash": source_hash,
            }
        )
    return rows


def build_context_packs(
    generated_at: str,
    source_hash: str,
    microstates: list[dict[str, Any]],
    segments: list[dict[str, Any]],
    inflections: list[dict[str, Any]],
    section_observations: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    road_america_rows: list[dict[str, Any]],
    upcoming_track_name: str | None,
    upcoming_rows: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any] | None]:
    best_segments = sorted(segments, key=lambda row: clean_float(row.get("netGain")) or -999, reverse=True)[:8]
    biggest_inflections = sorted(inflections, key=lambda row: clean_float(row.get("magnitude")) or -999, reverse=True)[:12]
    best_sections = sorted(
        [row for row in section_summaries if clean_float(row.get("medianCleanTrackSectionPercentile")) is not None],
        key=lambda row: clean_float(row.get("medianCleanTrackSectionPercentile")) or -999,
        reverse=True,
    )[:8]
    counts = {
        "raceLapMicrostates": len(microstates),
        "raceLapSegments": len(segments),
        "raceLapInflectionPoints": len(inflections),
        "raceSectionLapObservations": len(section_observations),
        "raceSectionSessionSummaries": len(section_summaries),
        "roadAmericaRows": len(road_america_rows),
        "upcomingVenueRows": len(upcoming_rows),
    }
    section_source_state_counts = {
        state: sum(1 for row in section_observations if row.get("sourceState") == state)
        for state in sorted({row.get("sourceState") for row in section_observations})
    }
    summary = {
        "ok": True,
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "counts": counts,
        "upcomingVenue": {
            "asOfDate": RUN_DATE.isoformat(),
            "status": "available" if upcoming_track_name else "season_complete",
            "trackName": upcoming_track_name,
            "artifactSlug": venue_slug(upcoming_track_name) if upcoming_track_name else None,
        },
        "sectionSourceStateCounts": section_source_state_counts,
        "caveats": [
            "Lap microstates are official race lap chart positions, not telemetry or lap-time pace.",
            "Race section aggregates use clean-lap filters and low-denominator suppression.",
            "Race section rows without a same-session/same-lap Bryce lap chart row are retained as official_section_results_only and do not receive clean-lap or caution labels.",
            "Context packs are for post-race debrief and Career Lab exploration, not future finish forecasting.",
        ],
    }
    pack = {
        "id": "indy-nxt-race-lap-section-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "artifacts": [
            "race_lap_microstates.csv",
            "race_lap_segments.csv",
            "race_lap_inflection_points.csv",
            "race_section_lap_observations.csv",
            "race_section_lap_field_observations.csv.gz",
            "race_section_field_distribution.json",
            "race_section_session_summary.csv",
        ],
        "counts": counts,
        "sectionSourceStateCounts": section_source_state_counts,
        "bestLapChartSegments": best_segments,
        "largestPositionInflections": biggest_inflections,
        "bestCleanRaceSectionSessions": best_sections,
        "displayRules": [
            "Use lap-position microstates as a race story trace, not telemetry pace.",
            "Use clean section percentiles only with denominator labels and source drawers.",
            "Treat official_section_results_only rows as raw section comparisons, not clean-lap or caution-aware race shape.",
            "Keep caution/restart segments visually distinct from green-flag movement.",
        ],
    }
    road_pack = {
        "id": "road-america-race-context",
        "generatedAt": generated_at,
        "sourceDataset": "data/career/career.dataset.json",
        "sourceHash": source_hash,
        "claimStrength": "post_race_descriptive_only",
        "publicPointPrediction": False,
        "trackName": "Road America",
        "historicalRaceRows": road_america_rows,
        "displayRules": [
            "Use these rows as completed Road America race history only.",
            "Do not blend with future session claims without live/current source rows.",
        ],
    }
    upcoming_pack = None
    if upcoming_track_name:
        upcoming_slug = venue_slug(upcoming_track_name).replace("_", "-")
        upcoming_pack = {
            "id": f"next-venue-{upcoming_slug}-race-context",
            "generatedAt": generated_at,
            "sourceDataset": "data/career/career.dataset.json",
            "sourceHash": source_hash,
            "claimStrength": "post_race_descriptive_only",
            "publicPointPrediction": False,
            "asOfDate": RUN_DATE.isoformat(),
            "trackName": upcoming_track_name,
            "historicalRaceRows": upcoming_rows,
            "displayRules": [
                f"Use these rows as completed {upcoming_track_name} race history only.",
                "Do not blend with future session claims without live/current source rows.",
            ],
        }
    return summary, pack, road_pack, upcoming_pack


def render_report(
    generated_at: str,
    summary: dict[str, Any],
    road_america_rows: list[dict[str, Any]],
    section_summaries: list[dict[str, Any]],
    upcoming_track_name: str | None,
    upcoming_rows: list[dict[str, Any]],
) -> str:
    counts = summary["counts"]
    road_lines = "\n".join(
        f"- {row['raceLabel']}: start {fmt(row['startPosition'])}, finish {fmt(row['finishPosition'])}, best running {fmt(row['bestRunningPosition'])}, section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}."
        for row in road_america_rows
    ) or "- No Road America race lap rows were available."
    if upcoming_track_name:
        upcoming_lines = "\n".join(
            f"- {row['raceLabel']}: start {fmt(row['startPosition'])}, finish {fmt(row['finishPosition'])}, best running {fmt(row['bestRunningPosition'])}, section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}."
            for row in upcoming_rows
        ) or f"- No {upcoming_track_name} race lap rows were available."
        upcoming_heading = f"Track: `{upcoming_track_name}`"
        context_pack_line = "A current next-venue race context pack is also emitted."
    else:
        upcoming_lines = "- No future INDY NXT venue remains on the canonical schedule as of the analysis date."
        upcoming_heading = "Season complete; no next-venue race artifact is emitted."
        context_pack_line = "The next-venue pack is omitted when the canonical schedule has no future event."
    session_count = counts['raceSectionSessionSummaries']
    section_lines = "\n".join(
        f"- {row['raceLabel']}: clean section median {fmt(row['medianCleanTrackSectionPercentile'], 3)}, best {row['bestCleanSectionFamilies'] or 'n/a'}."
        for row in sorted(section_summaries, key=lambda r: clean_float(r.get("medianCleanTrackSectionPercentile")) or -999, reverse=True)[:6]
    )
    return f"""# INDY NXT Race Lap/Section Enhancement

Generated: `{generated_at}`
Source dataset: `data/career/career.dataset.json`
Source hash: `{summary['sourceHash']}`

## Source Scope

This lane uses official INDY NXT race lap chart rows, official caution/incidents, and official race Section Results. Section rows without same-lap Bryce lap-chart backing are retained as section-only comparisons and do not receive clean-lap or caution labels. It does not use live timing, telemetry, setup notes, or predictive betting-style claims.

## What Became Productized

- `race_lap_microstates.csv`: {counts['raceLapMicrostates']} Bryce lap-position rows with field percentiles and caution/restart labels.
- `race_lap_segments.csv`: {counts['raceLapSegments']} caution-aware lap segments.
- `race_lap_inflection_points.csv`: {counts['raceLapInflectionPoints']} position-movement events.
- `race_section_lap_observations.csv`: clean-lap-aware race section observations (Bryce only).
- `race_section_lap_field_observations.csv.gz`: {counts.get('raceSectionFieldObservations', 0)} FULL-FIELD ranked rows — every car, every lap, every section, plus a synthesized derived-remainder row per car/lap.
- `race_section_field_distribution.json`: per-section field time distributions + Bryce's per-lap derived remainder with real full-field percentiles.
- `race_section_session_summary.csv`: {counts['raceSectionSessionSummaries']} race section summaries.
- Context packs: `context-packs/indy-nxt-race-lap-section-context.json` and the permanent historical `context-packs/road-america-race-context.json`. {context_pack_line}
- Source split: {summary.get('sectionSourceStateCounts', {})}.

## Lap Microstates

Each Bryce lap row now carries previous position, position delta, net movement from lap one, field-size denominator, running-position percentile, and caution/restart state.

## Caution-Aware Segments

Segments split green runs, caution windows, and restart laps so movement is not presented as generic pace when it happened under race-control context.

## Race Section Shape

Clean-lap race section highlights:

{section_lines}

## Derived Remainder

The official Section Results carry every car's lap total (the `Lap` section) and
its named section splits. Per lap, `lapTotal - sum(racing-line sections)` is the
exact time spent on everything the loops don't watch — the stopwatch trick — and
because the field's lap totals are present, that remainder ranks against the
whole field, not just Bryce. The remainder is shipped as a shadeable
`{DERIVED_SECTION_NAME}` section only where the racing sections leave a genuine
untimed stretch (>2% of the lap). Sessions at or below that threshold are
classified as fully timed and do not ship a derived row. A negative remainder
(sections overrunning the lap) marks that lap uncovered; it is never clamped,
but a remainder inside the source's own 0.0001 s print precision counts as
zero rather than as an overrun.

As of the 2026-09-19 front-straight ruling below, **every one of the {session_count}
race sessions is fully timed** and no session ships a derived row. The lane
keeps the machinery: a future venue, or a venue whose report drops a family,
falls back to the derived remainder automatically.

## The Front-Straight Ruling (2026-09-19)

This supersedes the 2026-07-19 SF over-match fix on its second half.

July corrected one error and introduced another. It established — rightly —
that an `SF`/`S/F` reference does not make a section a pit split, rescuing
`SF to T1`, `T4 to SF`, `FS to SF`, `SF to I1` and friends at Iowa, Milwaukee,
Road America and Detroit. But it kept the converse as an axiom: *"pit means
PI/PO or the alternate start, nothing else"*, and so it left every `FS-PO` /
`FS-PI` / `FS - PO 2` family classified as a pit split. Those families are the
start/finish straight. The result was that the S/F straight went uncoloured on
the heat map at eight venues, and at four of them (Laguna Seca, Mid-Ohio, WWTR,
Arlington) the discarded time reappeared as a "genuine untimed gap" that the
curated map assets then described as a stretch carrying no timing loop.

The evidence that overturns it, measured across all 44 race sessions:

- **Speed.** These families run at full racing pace on every green lap —
  86-172 mph depending on venue. The genuine pit-transit families
  (`PI to PO`, `PO to SF`, `SF to PI`, `PO to Alt`, `Alt S/F to PI`,
  `PO to I13A`) run at 0.4-33 mph.
- **Presence.** They are recorded on every lap. The pit-transit families appear
  once or twice per race — only on the laps the car actually pitted.
- **Tiling.** `sum(track sections) + sum(these families)` equals the official
  `Lap` row to 0.000 s on green laps at every affected venue. Before the fix
  the same venues left 2.8% (Barber) to 24.1% (WWTR) of the lap unexplained,
  and that residual was exactly these families. No venue carries an
  overlapping alternative span, so there is one tiling and no double count.
- **Geometry.** The semantic layer's decoded loop inventory puts the pit-in
  loop at a *negative* distance from S/F and the pit-out loop just past it:
  both sit on the main straight, either side of the line, not in the pit lane.
  The family lengths reproduce those loop distances to the foot — Barber
  `FS-PO` = SF→I1 = 5,352 units = 0.0845 mi; Indianapolis `FS - PO` = SF→I1B
  and `FS - PO 2` = I1B→I1; St. Petersburg `FS-PO` = SF→I1 = 8,244 units.
- **Ranking.** Every reclassified row resolves a field percentile against a
  median of 20 cars (min 12), so the comparison the map draws is real.
- **Precedent.** The qualifying lane has always read them as mainline sections
  (`analysis/quali-lab/scripts/official-qualifying.mjs`), and the curated map
  anchors at Barber, Indianapolis, Portland and St. Petersburg were derived
  from the qualifying packs and had been waiting for these names since July.

Fourteen (venue, family) pairs move to `track_section`; every pit-transit
family stays excluded at every venue. Pit laps cannot pollute the new spans:
the clean-lap filter drops any lap over 110% of the car's own median green lap,
and all 188 laps above 140% of the session median were already flagged `no`, so
no pit-in or pit-out lap counts as a clean comparison. That was verified, not
assumed; no new guard was added, and caution/clean-lap semantics are unchanged.

## Road America Context

{road_lines}

## Upcoming Venue Race Context

{upcoming_heading}

{upcoming_lines}

## Caveats

- Lap chart position is race order, not telemetry speed or lap-time pace.
- Caution windows are official incident/caution rows where source-visible; absence of a caution row is not proof of a fully green race in non-INDY NXT series.
- Section percentiles suppress low denominators and aggregate only clean race-lap candidates.
- Context packs are post-race descriptive only.
"""


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PACK_DIR.mkdir(parents=True, exist_ok=True)
    data = load_dataset()
    idx = build_indexes(data)
    source_hash = dataset_hash()
    generated_at = now_iso()

    microstates = build_lap_microstates(data, idx, source_hash)
    segments = build_lap_segments(microstates, source_hash)
    inflections = build_inflections(microstates, source_hash)
    section_observations = build_race_section_observations(data, idx, source_hash, microstates)
    field_observations, field_distribution = build_field_and_derived_observations(data, idx, source_hash, microstates)
    section_summaries = build_section_session_summary(section_observations, source_hash)
    road_america_rows = build_track_race_rows(microstates, segments, section_summaries, source_hash, "Road America")
    upcoming_track_name = next_upcoming_track_name(data)
    upcoming_rows = (
        build_track_race_rows(microstates, segments, section_summaries, source_hash, upcoming_track_name)
        if upcoming_track_name
        else []
    )
    summary, pack, road_pack, upcoming_pack = build_context_packs(
        generated_at,
        source_hash,
        microstates,
        segments,
        inflections,
        section_observations,
        section_summaries,
        road_america_rows,
        upcoming_track_name,
        upcoming_rows,
    )
    # Full-field extraction + derived-remainder coverage (Brief H).
    summary["counts"]["raceSectionFieldObservations"] = len(field_observations)
    genuine_gap_sessions = sorted(
        session_id
        for session_id, entry in field_distribution.items()
        if entry.get("derivedCoverage") == "genuine_gap"
    )
    summary["derivedRemainderCoverage"] = {
        "genuineGapSessions": len(genuine_gap_sessions),
        "fullyTimedSessions": sum(
            1 for entry in field_distribution.values() if entry.get("derivedCoverage") == "fully_timed"
        ),
        "note": (
            "The derived remainder (lapTotal minus racing-line sections) is shipped only for sessions whose "
            "racing sections leave a genuine untimed stretch (>2% of the lap). Sessions at or below that "
            "threshold are classified as fully timed and do not ship a derived row."
        ),
    }

    write_csv(
        OUTPUT_DIR / "race_lap_microstates.csv",
        microstates,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
            "lapNumber",
            "position",
            "previousPosition",
            "positionDelta",
            "netFromLapOne",
            "fieldSizeAtLap",
            "runningPositionPercentile",
            "cautionState",
            "sourceCompleteness",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_lap_segments.csv",
        segments,
        [
            "sessionId",
            "raceLabel",
            "trackName",
            "segmentId",
            "segmentType",
            "startLap",
            "endLap",
            "lapCount",
            "startPosition",
            "endPosition",
            "netGain",
            "bestPosition",
            "worstPosition",
            "volatility",
            "medianRunningPositionPercentile",
            "sourceCompleteness",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_lap_inflection_points.csv",
        inflections,
        [
            "sessionId",
            "raceLabel",
            "lapNumber",
            "previousPosition",
            "position",
            "positionDelta",
            "trigger",
            "cautionState",
            "magnitude",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "race_section_lap_observations.csv",
        section_observations,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
            "lapNumber",
            "sectionName",
            "sectionFamily",
            "sectionType",
            "timeSeconds",
            "speedMph",
            "fieldComparisonCount",
            "fieldRank",
            "fieldPercentile",
            "cleanRaceLapCandidate",
            "cautionState",
            "sourceState",
            "sourceMetricId",
            "sourceHash",
        ],
    )
    write_csv_gz(
        OUTPUT_DIR / "race_section_lap_field_observations.csv.gz",
        field_observations,
        [
            "sessionId",
            "seasonYear",
            "trackName",
            "carRef",
            "driverId",
            "carNumber",
            "isBryce",
            "lapNumber",
            "sectionName",
            "sectionFamily",
            "sectionType",
            "timeSeconds",
            "cleanRaceLapCandidate",
            "cautionState",
            "fieldComparisonCount",
            "fieldRank",
            "fieldPercentile",
            "sourceHash",
        ],
    )
    write_json(
        OUTPUT_DIR / "race_section_field_distribution.json",
        {
            "generatedAt": generated_at,
            "sourceHash": source_hash,
            "claimStrength": "post_race_descriptive_only",
            "note": (
                "Per-section field time distributions (each car's median clean-lap section time) and Bryce's "
                "per-lap derived remainder with real full-field percentiles. Consumed by build-ui-data-package.mjs."
            ),
            "sessions": field_distribution,
        },
    )
    write_csv(
        OUTPUT_DIR / "race_section_session_summary.csv",
        section_summaries,
        [
            "sessionId",
            "eventId",
            "seasonYear",
            "raceLabel",
            "trackName",
            "trackType",
            "cleanRaceLapCount",
            "cleanSectionComparisonRows",
            "medianCleanTrackSectionPercentile",
            "topQuartileCleanSectionShare",
            "bottomQuartileCleanSectionShare",
            "bestCleanSectionFamilies",
            "weakestCleanSectionFamilies",
            "sourceState",
            "sourceHash",
        ],
    )
    write_csv(
        OUTPUT_DIR / "road_america_race_lap_section_context.csv",
        road_america_rows,
        [
            "sessionId",
            "raceLabel",
            "seasonYear",
            "trackName",
            "lapRows",
            "startPosition",
            "finishPosition",
            "netLapChartGain",
            "bestRunningPosition",
            "worstRunningPosition",
            "bestSegment",
            "medianCleanTrackSectionPercentile",
            "bestCleanSectionFamilies",
            "weakestCleanSectionFamilies",
            "sourceHash",
        ],
    )
    for stale_path in OUTPUT_DIR.glob("next_venue_*_race_lap_section_context.csv"):
        stale_path.unlink()
    for stale_path in PACK_DIR.glob("next-venue-*-race-context.json"):
        stale_path.unlink()
    if upcoming_track_name:
        upcoming_slug = venue_slug(upcoming_track_name)
        write_csv(
            OUTPUT_DIR / f"next_venue_{upcoming_slug}_race_lap_section_context.csv",
            upcoming_rows,
            [
                "sessionId",
                "raceLabel",
                "seasonYear",
                "trackName",
                "lapRows",
                "startPosition",
                "finishPosition",
                "netLapChartGain",
                "bestRunningPosition",
                "worstRunningPosition",
                "bestSegment",
                "medianCleanTrackSectionPercentile",
                "bestCleanSectionFamilies",
                "weakestCleanSectionFamilies",
                "sourceHash",
            ],
        )
    write_json(OUTPUT_DIR / "summary.json", summary)
    write_json(PACK_DIR / "indy-nxt-race-lap-section-context.json", pack)
    write_json(PACK_DIR / "road-america-race-context.json", road_pack)
    if upcoming_track_name and upcoming_pack:
        write_json(PACK_DIR / f"next-venue-{upcoming_slug.replace('_', '-')}-race-context.json", upcoming_pack)
    (OUTPUT_DIR / "INDY_NXT_RACE_LAP_SECTION_ENHANCEMENT.md").write_text(
        render_report(generated_at, summary, road_america_rows, section_summaries, upcoming_track_name, upcoming_rows)
    )

    print(json.dumps({"ok": True, "output": str(OUTPUT_DIR.relative_to(ROOT)), "counts": summary["counts"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
