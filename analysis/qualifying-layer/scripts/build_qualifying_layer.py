#!/usr/bin/env python3
"""Build the normalized historic qualifying layer.

One qualifying model spanning every canonical series. For each of Bryce's
qualifying appearances it records where he qualified and against how big a
field, then — where the source carries a grid column — how that qualifying
converted to the flag.

The core discipline is the **source family**. A qualifying session is read from
exactly one of two families, NEVER blended within a session:

  - official_qualifying     — rows from the dedicated `qualifyingResults` table
                              (position, bestLapTime, gapToPole). The purpose
                              built qualifying classification.
  - qualifying_session_result — rows from the `results` table for a session whose
                              sessionType is `qualifying`. Used only where the
                              source family does not populate the dedicated
                              qualifyingResults table (F1600, Formula Ford, FROC,
                              GB3 2022).

Precedence is per session: if the dedicated `qualifyingResults` table has rows
for a session, that whole session is read from it and the `results` rows for
that same session are never touched. Otherwise the whole session is read from
`results`. A session therefore always resolves to one family; the validator
proves no session is ever represented under both.

Quali -> race linkage (non-circular, read from the data, never assumed for the
headline): a qualifying session set a race's grid when Bryce's grid position in
a race of the same event equals his qualifying rank. That race is the linked
race; the pair is a `grid_confirmed` conversion row. Reverse-grid races (grid
set by a prior race's classification) carry no matching qualifying rank and
fall out of the conversion set by construction — they are recorded as excluded,
not estimated. Where the source carries no grid column at all (F1600 2019,
GB3 2022), the qualifying position is still recorded in the inventory but the
grid linkage is left `unconfirmed` and no conversion figure is invented.

Everything is positions and place counts; qualifying lap times are carried as
context strings only, never differenced into a pace claim.
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import statistics
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/qualifying-layer"
OUTPUT = LANE / "output"
TABLES = OUTPUT / "tables"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"

FAMILY_OFFICIAL = "official_qualifying"
FAMILY_SESSION_RESULT = "qualifying_session_result"
SOURCE_TABLE = {
    FAMILY_OFFICIAL: "qualifyingResults",
    FAMILY_SESSION_RESULT: "results.qualifying_session",
}


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


def round1(value: float | None) -> float | None:
    if value is None:
        return None
    return round(value + 0.0, 3)


def mean(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(statistics.fmean(clean))


def median(values: list[float]) -> float | None:
    clean = [v for v in values if v is not None]
    if not clean:
        return None
    return float(statistics.median(clean))


# ----------------------------------------------------------------------------- #
# Indexing
# ----------------------------------------------------------------------------- #


def build_context(data: dict[str, Any]) -> dict[str, Any]:
    events = {row["id"]: row for row in data.get("events", [])}
    series = {row["id"]: row for row in data.get("series", [])}
    sessions = {row["id"]: row for row in data.get("sessions", [])}

    # Round index per (series, season): events ordered by start date, 1-based.
    by_series_season: dict[tuple[str, Any], list[dict[str, Any]]] = defaultdict(list)
    for event in data.get("events", []):
        by_series_season[(event.get("seriesId"), event.get("seasonYear"))].append(event)
    round_index: dict[str, int] = {}
    for group in by_series_season.values():
        ordered = sorted(group, key=lambda e: (str(e.get("eventStartDate") or ""), str(e.get("id"))))
        for idx, event in enumerate(ordered, start=1):
            round_index[event["id"]] = idx

    return {"events": events, "series": series, "sessions": sessions, "roundIndex": round_index}


def quali_field_by_session(data: dict[str, Any], ctx: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """For every qualifying session, resolve the single source family and its full
    field. qualifyingResults wins per session; results is used only where the
    dedicated table has no rows for that session."""
    official: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data.get("qualifyingResults", []):
        official[row["sessionId"]].append(row)

    session_results: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data.get("results", []):
        session = ctx["sessions"].get(row.get("sessionId"))
        if session and session.get("sessionType") == "qualifying":
            session_results[row["sessionId"]].append(row)

    fields: dict[str, dict[str, Any]] = {}
    for session_id, session in ctx["sessions"].items():
        if session.get("sessionType") != "qualifying":
            continue
        if official.get(session_id):
            rows = official[session_id]
            ranks = {r["driverId"]: (clean_int(r.get("position")), r) for r in rows}
            fields[session_id] = {
                "family": FAMILY_OFFICIAL,
                "sourceTable": SOURCE_TABLE[FAMILY_OFFICIAL],
                "ranks": ranks,
                "fieldSize": len(rows),
            }
        elif session_results.get(session_id):
            rows = session_results[session_id]
            ranks = {r["driverId"]: (clean_int(r.get("finishPosition")), r) for r in rows}
            fields[session_id] = {
                "family": FAMILY_SESSION_RESULT,
                "sourceTable": SOURCE_TABLE[FAMILY_SESSION_RESULT],
                "ranks": ranks,
                "fieldSize": len(rows),
            }
    return fields


def bryce_races_by_event(data: dict[str, Any], ctx: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    out: dict[str, list[dict[str, Any]]] = defaultdict(list)
    race_field_size: dict[str, int] = defaultdict(int)
    for row in data.get("results", []):
        session = ctx["sessions"].get(row.get("sessionId"))
        if session and session.get("sessionType") == "race":
            race_field_size[row["sessionId"]] += 1
    for row in data.get("results", []):
        if row.get("driverId") != BRYCE_ID:
            continue
        session = ctx["sessions"].get(row.get("sessionId"))
        if not session or session.get("sessionType") != "race":
            continue
        event = ctx["events"].get(session.get("eventId"), {})
        out[session["eventId"]].append(
            {
                "sessionId": row["sessionId"],
                "eventId": session["eventId"],
                "raceLabel": session.get("sessionName") or event.get("name") or row["sessionId"],
                "raceNumber": clean_int(session.get("raceNumber")),
                "scheduledStart": session.get("scheduledStart") or session.get("actualStart") or "",
                "grid": clean_int(row.get("gridPosition")),
                "start": clean_int(row.get("startPosition")),
                "finish": clean_int(row.get("finishPosition")),
                "fieldSize": clean_int(row.get("fieldSize")) or race_field_size.get(row["sessionId"]),
            }
        )
    for rows in out.values():
        rows.sort(key=lambda r: (r["raceNumber"] if r["raceNumber"] is not None else 0, str(r["scheduledStart"])))
    return out


# ----------------------------------------------------------------------------- #
# Roles and linkage
# ----------------------------------------------------------------------------- #


def session_role(session: dict[str, Any], event_has_combined: bool) -> str:
    """grid_setting | group_component | secondary, from the official session name.

    - a "combined" session is the merged grid-setting classification;
    - a "group" session is a component of a combined session when one exists;
    - a "2nd fastest" session sets a secondary (Race 2) grid;
    - anything else is a single grid-setting qualifying.
    """
    name = f"{session.get('sessionName') or ''} {session.get('sessionSegment') or ''}".lower()
    if "combined" in name:
        return "grid_setting"
    if ("2nd" in name or "second" in name) and "fastest" in name:
        return "secondary"
    if "group" in name and event_has_combined:
        return "group_component"
    return "grid_setting"


def pick_quali_for_grid(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Deterministic tiebreak when several qualifying sessions in one event share
    Bryce's rank and so all match a race grid. The attributed rank is identical
    across candidates by construction; this only fixes which session id is cited.
    Prefer the merged 'combined' classification, then a primary (non-2nd-fastest)
    session, then the official-family session, then the earliest session id."""
    def key(candidate: dict[str, Any]) -> tuple:
        name = str(candidate.get("sessionName") or "").lower()
        return (
            0 if "combined" in name else 1,
            1 if ("2nd" in name or "second" in name) else 0,
            0 if candidate["sourceFamily"] == FAMILY_OFFICIAL else 1,
            str(candidate["sessionId"]),
        )

    return sorted(candidates, key=key)[0]


def conversion_outcome(quali_rank: int, finish: int) -> str:
    if finish < quali_rank:
        return "ahead"
    if finish == quali_rank:
        return "held"
    return "behind"


def main() -> None:
    data = load_dataset()
    ctx = build_context(data)
    source_hash = dataset_hash()

    fields = quali_field_by_session(data, ctx)
    races_by_event = bryce_races_by_event(data, ctx)

    # Which events carry a merged "combined" qualifying session (for role logic)?
    event_has_combined: dict[str, bool] = defaultdict(bool)
    for session_id in fields:
        session = ctx["sessions"][session_id]
        name = f"{session.get('sessionName') or ''} {session.get('sessionSegment') or ''}".lower()
        if "combined" in name:
            event_has_combined[session["eventId"]] = True

    # ---- Bryce qualifying appearances (the normalized inventory) ----------- #
    quali_rows: list[dict[str, Any]] = []
    quali_meta_by_session: dict[str, dict[str, Any]] = {}
    for session_id, field in fields.items():
        if BRYCE_ID not in field["ranks"]:
            continue
        rank, raw = field["ranks"][BRYCE_ID]
        if rank is None:
            continue
        session = ctx["sessions"][session_id]
        event = ctx["events"].get(session["eventId"], {})
        series = ctx["series"].get(event.get("seriesId"), {})
        role = session_role(session, event_has_combined.get(session["eventId"], False))
        if field["family"] == FAMILY_OFFICIAL:
            best_lap = raw.get("bestLapTime")
            gap = raw.get("gapToPole")
            provenance = raw.get("provenanceRefs") or []
        else:
            best_lap = raw.get("bestLapTime")
            gap = raw.get("gapToLeader")
            provenance = raw.get("provenanceRefs") or []
        meta = {
            "sessionId": session_id,
            "eventId": session["eventId"],
            "seriesId": event.get("seriesId"),
            "seriesName": series.get("name") or event.get("seriesId"),
            "seasonYear": clean_int(event.get("seasonYear")),
            "roundIndex": ctx["roundIndex"].get(session["eventId"]),
            "eventName": event.get("name"),
            "sessionName": session.get("sessionName"),
            "sourceFamily": field["family"],
            "sourceTable": field["sourceTable"],
            "qualiRank": rank,
            "qualiFieldSize": field["fieldSize"],
            "role": role,
            "bestLapTime": best_lap or "",
            "gapToPole": gap or "",
            "provenanceRefs": ";".join(provenance),
        }
        quali_meta_by_session[session_id] = meta
        quali_rows.append(meta)

    # ---- Quali -> race conversion (grid-confirmed) ------------------------- #
    # For each Bryce race, find the same-event qualifying whose rank equals the
    # race grid. That confirms the grid-setting qualifying without assuming it.
    # One qualifying session can grid several races in a weekend (e.g. GB3 Race 1
    # and Race 2 both start from the qualifying order), so a session links to a
    # list of races, not one.
    linked_races_by_session: dict[str, list[str]] = defaultdict(list)
    conversion_rows: list[dict[str, Any]] = []
    excluded_rows: list[dict[str, Any]] = []

    for event_id, races in races_by_event.items():
        event = ctx["events"].get(event_id, {})
        series = ctx["series"].get(event.get("seriesId"), {})
        event_qualis = [quali_meta_by_session[sid] for sid in fields if sid in quali_meta_by_session and ctx["sessions"][sid]["eventId"] == event_id]
        event_has_grid = any(r["grid"] is not None for r in races)
        for race in races:
            base = {
                "raceSessionId": race["sessionId"],
                "seriesId": event.get("seriesId"),
                "seriesName": series.get("name") or event.get("seriesId"),
                "seasonYear": clean_int(event.get("seasonYear")),
                "roundIndex": ctx["roundIndex"].get(event_id),
                "eventName": event.get("name"),
                "raceLabel": race["raceLabel"],
                "raceNumber": race["raceNumber"],
            }
            if race["finish"] is None:
                excluded_rows.append({**base, "reason": "no_finish", "note": "No classified finish for this race."})
                continue
            if not event_qualis:
                excluded_rows.append({**base, "reason": "no_qualifying_in_event", "note": "No Bryce qualifying classification exists for this event."})
                continue
            if race["grid"] is None:
                # The source carries no grid column; the qualifying position is
                # recorded in the inventory but conversion is not invented.
                excluded_rows.append({**base, "reason": "no_grid_column", "note": "Source family does not populate a grid column; qualifying position recorded, conversion not computed."})
                continue
            candidates = [q for q in event_qualis if q["qualiRank"] == race["grid"]]
            if not candidates:
                excluded_rows.append({**base, "reason": "reverse_grid_no_quali_match", "note": "Grid does not match any qualifying rank in this event (grid set by a prior race's classification)."})
                continue
            quali = pick_quali_for_grid(candidates)
            linked_races_by_session[quali["sessionId"]].append(race["sessionId"])
            delta = quali["qualiRank"] - race["finish"]
            grid_to_finish = race["grid"] - race["finish"] if race["grid"] is not None else None
            conversion_rows.append(
                {
                    "raceSessionId": race["sessionId"],
                    "qualiSessionId": quali["sessionId"],
                    "seriesId": quali["seriesId"],
                    "seriesName": quali["seriesName"],
                    "seasonYear": quali["seasonYear"],
                    "roundIndex": quali["roundIndex"],
                    "eventName": quali["eventName"],
                    "raceLabel": race["raceLabel"],
                    "raceNumber": race["raceNumber"],
                    "sourceFamily": quali["sourceFamily"],
                    "sourceTable": quali["sourceTable"],
                    "qualiRank": quali["qualiRank"],
                    "qualiFieldSize": quali["qualiFieldSize"],
                    "grid": race["grid"],
                    "start": race["start"],
                    "finish": race["finish"],
                    "raceFieldSize": race["fieldSize"],
                    "linkageTier": "grid_confirmed",
                    "conversionOutcome": conversion_outcome(quali["qualiRank"], race["finish"]),
                    "qualiToFinish": delta,
                    "gridToFinish": grid_to_finish,
                    "sourceHash": source_hash,
                }
            )

    conversion_rows.sort(key=lambda r: (r["seasonYear"] or 0, r["roundIndex"] or 0, str(r["raceSessionId"])))
    excluded_rows.sort(key=lambda r: (r["seasonYear"] or 0, r["roundIndex"] or 0, str(r["raceSessionId"])))

    # ---- Finalize the inventory rows with linkage tier --------------------- #
    inventory_out: list[dict[str, Any]] = []
    for meta in quali_rows:
        session_id = meta["sessionId"]
        event_id = meta["eventId"]
        races = races_by_event.get(event_id, [])
        event_has_grid = any(r["grid"] is not None for r in races)
        linked_races = linked_races_by_session.get(session_id, [])
        if meta["role"] == "group_component":
            tier = "group_component"
        elif meta["role"] == "secondary":
            tier = "secondary"
        elif linked_races:
            tier = "grid_confirmed"
        elif not races:
            tier = "no_linked_race"
        elif not event_has_grid:
            tier = "unconfirmed_no_grid"
        else:
            tier = "unlinked_reverse_grid"
        inventory_out.append(
            {
                "sessionId": session_id,
                "eventId": event_id,
                "seriesId": meta["seriesId"],
                "seriesName": meta["seriesName"],
                "seasonYear": meta["seasonYear"],
                "roundIndex": meta["roundIndex"],
                "eventName": meta["eventName"],
                "sessionName": meta["sessionName"],
                "sourceFamily": meta["sourceFamily"],
                "sourceTable": meta["sourceTable"],
                "qualiRank": meta["qualiRank"],
                "qualiFieldSize": meta["qualiFieldSize"],
                "role": meta["role"],
                "linkageTier": tier,
                "linkedRaceSessionIds": ";".join(linked_races),
                "bestLapTime": meta["bestLapTime"],
                "gapToPole": meta["gapToPole"],
                "provenanceRefs": meta["provenanceRefs"],
                "sourceHash": source_hash,
            }
        )
    inventory_out.sort(key=lambda r: (r["seasonYear"] or 0, r["roundIndex"] or 0, str(r["sessionId"])))

    # ---- Rollup: per series / season --------------------------------------- #
    rollup_rows = build_rollup(inventory_out, conversion_rows, source_hash)

    # ---- Career + coverage ------------------------------------------------- #
    grid_setting_inventory = [r for r in inventory_out if r["role"] == "grid_setting"]
    career = build_career(inventory_out, grid_setting_inventory, conversion_rows)

    # ---- Source-family map (per series/season, the audit's core artifact) -- #
    source_family_map = build_source_family_map(inventory_out)

    # ---- Write tables ------------------------------------------------------ #
    write_csv(
        TABLES / "quali_sessions.csv",
        inventory_out,
        [
            "sessionId", "eventId", "seriesId", "seriesName", "seasonYear", "roundIndex",
            "eventName", "sessionName", "sourceFamily", "sourceTable", "qualiRank",
            "qualiFieldSize", "role", "linkageTier", "linkedRaceSessionIds", "bestLapTime",
            "gapToPole", "provenanceRefs", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "quali_race_conversion.csv",
        conversion_rows,
        [
            "raceSessionId", "qualiSessionId", "seriesId", "seriesName", "seasonYear",
            "roundIndex", "eventName", "raceLabel", "raceNumber", "sourceFamily",
            "sourceTable", "qualiRank", "qualiFieldSize", "grid", "start", "finish",
            "raceFieldSize", "linkageTier", "conversionOutcome", "qualiToFinish",
            "gridToFinish", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "quali_by_series_season.csv",
        rollup_rows,
        [
            "seriesId", "seriesName", "seasonYear", "sourceFamily", "qualifyingSessions",
            "gridSettingSessions", "avgQualiRank", "bestQualiRank", "avgQualiFieldSize",
            "conversionRaces", "finishedAhead", "held", "finishedBehind",
            "avgQualiRankConverted", "avgFinishConverted", "sourceHash",
        ],
    )
    write_csv(
        TABLES / "excluded_races.csv",
        excluded_rows,
        ["raceSessionId", "seriesId", "seriesName", "seasonYear", "roundIndex", "eventName", "raceLabel", "raceNumber", "reason", "note"],
    )

    summary = {
        "schemaVersion": "brycecast.qualifyingLayer.v1",
        "generatedAt": now_iso(),
        "runDate": RUN_DATE.isoformat(),
        "datasetSha256": source_hash,
        "method": {
            "sourceFamilies": {
                FAMILY_OFFICIAL: "Dedicated qualifyingResults classification (position, best lap, gap to pole).",
                FAMILY_SESSION_RESULT: "Result rows for a qualifying session, used only where the dedicated qualifyingResults table is not populated.",
            },
            "sourceFamilyDiscipline": "Each qualifying session is read from exactly one family; qualifyingResults wins per session and the results rows for that same session are never blended in.",
            "linkage": "A qualifying set a race's grid when Bryce's race grid equals his qualifying rank in the same event; that race is the grid_confirmed conversion. Reverse-grid races carry no matching rank and are recorded as excluded, never estimated. Where a source has no grid column, the qualifying position is recorded but conversion is left unconfirmed.",
            "currency": "grid positions and place counts; qualifying lap times are context strings, never differenced into a pace claim.",
        },
        "coverage": build_coverage(inventory_out, conversion_rows, excluded_rows, races_by_event),
        "career": career,
        "sourceFamilyMap": source_family_map,
        "bySeriesSeason": rollup_rows,
        "sources": [
            {"path": "data/career/career.dataset.json", "note": "Canonical qualifyingResults, qualifying-session results, and race results with grid columns."},
        ],
        "caveats": [
            "Source families are never blended within a session: qualifyingResults wins per session, and the results rows for that same session are not mixed in.",
            "Conversion is computed only where the race carries a grid column and that grid matches a qualifying rank in the same event (grid_confirmed). Reverse-grid races are excluded, not estimated.",
            "F1600 2019 and GB3 2022 sources carry no grid column: Bryce's qualifying position is recorded in the inventory, but no conversion figure is invented for them.",
            "Group qualifying sessions are recorded but marked group_component; the merged 'combined' classification is the grid-setting session for INDY NXT weekends.",
            "Qualifying best-lap times and gaps are carried as context strings; the layer never differences them into a pace or margin claim.",
        ],
    }
    write_json(OUTPUT / "summary.json", summary)

    cov = summary["coverage"]
    print(
        f"qualifying-layer: {len(inventory_out)} Bryce qualifying appearances across "
        f"{cov['seriesWithQualifying']} series; {len(conversion_rows)} grid-confirmed conversion races "
        f"(finished ahead of his grid slot in {career['finishedAhead']} of {career['conversionRaces']}, "
        f"held {career['held']}); {len(excluded_rows)} races outside the conversion set."
    )


def build_rollup(inventory: list[dict[str, Any]], conversion: list[dict[str, Any]], source_hash: str) -> list[dict[str, Any]]:
    """Per (series, season, family): the inventory stats span every appearance;
    the conversion stats span only the grid_confirmed races."""
    keys: dict[tuple, dict[str, Any]] = {}

    inv_by_key: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for row in inventory:
        inv_by_key[(row["seriesId"], row["seasonYear"], row["sourceFamily"])].append(row)

    conv_by_key: dict[tuple, list[dict[str, Any]]] = defaultdict(list)
    for row in conversion:
        conv_by_key[(row["seriesId"], row["seasonYear"], row["sourceFamily"])].append(row)

    out: list[dict[str, Any]] = []
    for key in sorted(set(inv_by_key) | set(conv_by_key), key=lambda k: (k[1] or 0, str(k[0]), str(k[2]))):
        series_id, season, family = key
        inv_rows = inv_by_key.get(key, [])
        grid_setting = [r for r in inv_rows if r["role"] == "grid_setting"]
        ranks = [r["qualiRank"] for r in grid_setting] or [r["qualiRank"] for r in inv_rows]
        field_sizes = [r["qualiFieldSize"] for r in grid_setting] or [r["qualiFieldSize"] for r in inv_rows]
        conv_rows = conv_by_key.get(key, [])
        ahead = sum(1 for r in conv_rows if r["conversionOutcome"] == "ahead")
        held = sum(1 for r in conv_rows if r["conversionOutcome"] == "held")
        behind = sum(1 for r in conv_rows if r["conversionOutcome"] == "behind")
        series_name = (inv_rows or conv_rows)[0]["seriesName"]
        out.append(
            {
                "seriesId": series_id,
                "seriesName": series_name,
                "seasonYear": season,
                "sourceFamily": family,
                "qualifyingSessions": len(inv_rows),
                "gridSettingSessions": len(grid_setting),
                "avgQualiRank": round1(mean([float(r) for r in ranks])),
                "bestQualiRank": min(ranks) if ranks else None,
                "avgQualiFieldSize": round1(mean([float(r) for r in field_sizes if r is not None])),
                "conversionRaces": len(conv_rows),
                "finishedAhead": ahead,
                "held": held,
                "finishedBehind": behind,
                "avgQualiRankConverted": round1(mean([float(r["qualiRank"]) for r in conv_rows])) if conv_rows else None,
                "avgFinishConverted": round1(mean([float(r["finish"]) for r in conv_rows])) if conv_rows else None,
                "sourceHash": source_hash,
            }
        )
    return out


def build_career(inventory: list[dict[str, Any]], grid_setting: list[dict[str, Any]], conversion: list[dict[str, Any]]) -> dict[str, Any]:
    ahead = sum(1 for r in conversion if r["conversionOutcome"] == "ahead")
    held = sum(1 for r in conversion if r["conversionOutcome"] == "held")
    behind = sum(1 for r in conversion if r["conversionOutcome"] == "behind")
    ranks = [float(r["qualiRank"]) for r in grid_setting]
    return {
        "qualifyingAppearances": len(inventory),
        "gridSettingSessions": len(grid_setting),
        "avgQualiRank": round1(mean(ranks)),
        "bestQualiRank": min((r["qualiRank"] for r in grid_setting), default=None),
        "conversionRaces": len(conversion),
        "finishedAhead": ahead,
        "held": held,
        "finishedBehind": behind,
        "avgQualiRankConverted": round1(mean([float(r["qualiRank"]) for r in conversion])) if conversion else None,
        "avgFinishConverted": round1(mean([float(r["finish"]) for r in conversion])) if conversion else None,
    }


def build_source_family_map(inventory: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The audit's core artifact: which source family backs each series/season,
    proving no season straddles both within a session."""
    by_season: dict[tuple, dict[str, Any]] = {}
    for row in inventory:
        key = (row["seriesId"], row["seasonYear"])
        entry = by_season.setdefault(
            key,
            {
                "seriesId": row["seriesId"],
                "seriesName": row["seriesName"],
                "seasonYear": row["seasonYear"],
                "families": defaultdict(int),
            },
        )
        entry["families"][row["sourceFamily"]] += 1
    out: list[dict[str, Any]] = []
    for entry in by_season.values():
        families = dict(entry["families"])
        out.append(
            {
                "seriesId": entry["seriesId"],
                "seriesName": entry["seriesName"],
                "seasonYear": entry["seasonYear"],
                "families": families,
                "primaryFamily": max(families, key=families.get),
            }
        )
    out.sort(key=lambda r: (r["seasonYear"] or 0, str(r["seriesId"])))
    return out


def build_coverage(inventory: list[dict[str, Any]], conversion: list[dict[str, Any]], excluded: list[dict[str, Any]], races_by_event: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    reason_counts: dict[str, int] = defaultdict(int)
    for row in excluded:
        reason_counts[row["reason"]] += 1
    series_with_qualifying = {r["seriesId"] for r in inventory}
    series_with_conversion = {r["seriesId"] for r in conversion}
    total_bryce_races = sum(len(v) for v in races_by_event.values())
    family_counts: dict[str, int] = defaultdict(int)
    for row in inventory:
        family_counts[row["sourceFamily"]] += 1
    return {
        "bryceRaces": total_bryce_races,
        "qualifyingAppearances": len(inventory),
        "seriesWithQualifying": len(series_with_qualifying),
        "seriesWithConversion": len(series_with_conversion),
        "conversionRaces": len(conversion),
        "excludedRaces": len(excluded),
        "excludedReasons": dict(reason_counts),
        "appearancesByFamily": dict(family_counts),
    }


if __name__ == "__main__":
    main()
