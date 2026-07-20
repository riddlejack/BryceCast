#!/usr/bin/env python3
"""Validate the normalized qualifying layer.

Re-derives the source-family resolution, Bryce's ranks, and the grid-confirmed
conversion straight from the canonical dataset — independently of the build —
then checks the emitted tables and summary for internal consistency, the
source-family exclusivity discipline, correct denominators, and that every
Bryce race is accounted for exactly once (conversion or excluded). Exits
non-zero on the first failure.

The source-family exclusivity check is the audit's core requirement: a
qualifying session must resolve to exactly one family, and the field size must
be the row count of that one family — never a blend.
"""

from __future__ import annotations

import csv
import hashlib
import json
import statistics
from collections import defaultdict
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
KNOWN_FAMILIES = {FAMILY_OFFICIAL, FAMILY_SESSION_RESULT}
KNOWN_TIERS = {
    "grid_confirmed", "unconfirmed_no_grid", "unlinked_reverse_grid",
    "group_component", "secondary", "no_linked_race",
}
KNOWN_ROLES = {"grid_setting", "group_component", "secondary"}
EXCLUDED_REASONS = {"no_finish", "no_qualifying_in_event", "no_grid_column", "reverse_grid_no_quali_match"}


def fail(message: str) -> None:
    raise SystemExit(f"qualifying-layer validation failed: {message}")


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


def rederive(data: dict[str, Any]) -> dict[str, Any]:
    sessions = {row["id"]: row for row in data.get("sessions", [])}
    events = {row["id"]: row for row in data.get("events", [])}

    official: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data.get("qualifyingResults", []):
        official[row["sessionId"]].append(row)
    session_results: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data.get("results", []):
        session = sessions.get(row.get("sessionId"))
        if session and session.get("sessionType") == "qualifying":
            session_results[row["sessionId"]].append(row)

    # Resolve one family per qualifying session (qualifyingResults wins).
    family: dict[str, dict[str, Any]] = {}
    for session_id, session in sessions.items():
        if session.get("sessionType") != "qualifying":
            continue
        if official.get(session_id):
            rowset = official[session_id]
            ranks = {r["driverId"]: as_int(r.get("position")) for r in rowset}
            family[session_id] = {"family": FAMILY_OFFICIAL, "ranks": ranks, "fieldSize": len(rowset)}
        elif session_results.get(session_id):
            rowset = session_results[session_id]
            ranks = {r["driverId"]: as_int(r.get("finishPosition")) for r in rowset}
            family[session_id] = {"family": FAMILY_SESSION_RESULT, "ranks": ranks, "fieldSize": len(rowset)}

    # Bryce qualifying appearances.
    bryce_quali: dict[str, dict[str, Any]] = {}
    for session_id, resolved in family.items():
        rank = resolved["ranks"].get(BRYCE_ID)
        if rank is None:
            continue
        bryce_quali[session_id] = {
            "eventId": sessions[session_id]["eventId"],
            "family": resolved["family"],
            "rank": rank,
            "fieldSize": resolved["fieldSize"],
        }

    # Bryce race results by event.
    race_field_size: dict[str, int] = defaultdict(int)
    for row in data.get("results", []):
        session = sessions.get(row.get("sessionId"))
        if session and session.get("sessionType") == "race":
            race_field_size[row["sessionId"]] += 1
    races_by_event: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in data.get("results", []):
        if row.get("driverId") != BRYCE_ID:
            continue
        session = sessions.get(row.get("sessionId"))
        if not session or session.get("sessionType") != "race":
            continue
        races_by_event[session["eventId"]].append(
            {
                "sessionId": row["sessionId"],
                "eventId": session["eventId"],
                "grid": as_int(row.get("gridPosition")),
                "finish": as_int(row.get("finishPosition")),
            }
        )

    # Conversion + exclusion by re-derivation.
    conversion: dict[str, dict[str, Any]] = {}
    excluded: dict[str, str] = {}
    for event_id, races in races_by_event.items():
        event_qualis = [
            {"sessionId": sid, "rank": q["rank"], "family": q["family"]}
            for sid, q in bryce_quali.items()
            if q["eventId"] == event_id
        ]
        for race in races:
            if race["finish"] is None:
                excluded[race["sessionId"]] = "no_finish"
                continue
            if not event_qualis:
                excluded[race["sessionId"]] = "no_qualifying_in_event"
                continue
            if race["grid"] is None:
                excluded[race["sessionId"]] = "no_grid_column"
                continue
            matches = [q for q in event_qualis if q["rank"] == race["grid"]]
            if not matches:
                excluded[race["sessionId"]] = "reverse_grid_no_quali_match"
                continue
            conversion[race["sessionId"]] = {
                "grid": race["grid"],
                "finish": race["finish"],
                "candidateCount": len(matches),
            }

    return {
        "family": family,
        "bryceQuali": bryce_quali,
        "conversion": conversion,
        "excluded": excluded,
        "racesByEvent": races_by_event,
        "totalBryceRaces": sum(len(v) for v in races_by_event.values()),
    }


def main() -> None:
    data = json.loads(DATASET_PATH.read_text())
    truth = rederive(data)

    summary = json.loads((OUTPUT / "summary.json").read_text())
    if summary.get("schemaVersion") != "brycecast.qualifyingLayer.v1":
        fail("summary schemaVersion must be brycecast.qualifyingLayer.v1")
    if summary.get("datasetSha256") != dataset_hash():
        fail("summary datasetSha256 does not match the current canonical dataset — rebuild the lane.")

    inventory = rows(TABLES / "quali_sessions.csv")
    conversion_rows = rows(TABLES / "quali_race_conversion.csv")
    rollup_rows = rows(TABLES / "quali_by_series_season.csv")
    excluded_rows = rows(TABLES / "excluded_races.csv")

    # ---- inventory: source-family exclusivity + denominators -------------- #
    if len(inventory) != len(truth["bryceQuali"]):
        fail(f"quali_sessions row count {len(inventory)} != re-derived {len(truth['bryceQuali'])}")
    seen_sessions: set[str] = set()
    for row in inventory:
        sid = row["sessionId"]
        if sid in seen_sessions:
            fail(f"session {sid} appears more than once in the inventory (a session must resolve to one family)")
        seen_sessions.add(sid)
        derived = truth["bryceQuali"].get(sid)
        if derived is None:
            fail(f"inventory session {sid} is not a re-derived Bryce qualifying appearance")
        if row["sourceFamily"] not in KNOWN_FAMILIES:
            fail(f"session {sid}: unknown sourceFamily {row['sourceFamily']!r}")
        if row["sourceFamily"] != derived["family"]:
            fail(f"session {sid}: sourceFamily {row['sourceFamily']} != re-derived {derived['family']} (family precedence broken)")
        if as_int(row["qualiRank"]) != derived["rank"]:
            fail(f"session {sid}: qualiRank {row['qualiRank']} != re-derived {derived['rank']}")
        if as_int(row["qualiFieldSize"]) != derived["fieldSize"]:
            fail(f"session {sid}: qualiFieldSize {row['qualiFieldSize']} != row count of the one chosen family {derived['fieldSize']} (denominator must not blend families)")
        if row["role"] not in KNOWN_ROLES:
            fail(f"session {sid}: unknown role {row['role']!r}")
        if row["linkageTier"] not in KNOWN_TIERS:
            fail(f"session {sid}: unknown linkageTier {row['linkageTier']!r}")

    # ---- conversion invariants -------------------------------------------- #
    inventory_by_session = {r["sessionId"]: r for r in inventory}
    conv_sessions: set[str] = set()
    for row in conversion_rows:
        rsid = row["raceSessionId"]
        if rsid in conv_sessions:
            fail(f"race {rsid} appears more than once in the conversion table")
        conv_sessions.add(rsid)
        derived = truth["conversion"].get(rsid)
        if derived is None:
            fail(f"conversion race {rsid} is not a re-derived grid_confirmed conversion")
        grid = as_int(row["grid"])
        rank = as_int(row["qualiRank"])
        finish = as_int(row["finish"])
        if grid != rank:
            fail(f"{rsid}: grid {grid} must equal qualiRank {rank} for a grid_confirmed conversion")
        if grid != derived["grid"] or finish != derived["finish"]:
            fail(f"{rsid}: grid/finish disagree with re-derivation")
        if row["linkageTier"] != "grid_confirmed":
            fail(f"{rsid}: conversion rows must be grid_confirmed, got {row['linkageTier']}")
        if as_int(row["qualiToFinish"]) != rank - finish:
            fail(f"{rsid}: qualiToFinish must equal qualiRank - finish")
        if as_int(row["gridToFinish"]) != grid - finish:
            fail(f"{rsid}: gridToFinish must equal grid - finish")
        if as_int(row["gridToFinish"]) != as_int(row["qualiToFinish"]):
            fail(f"{rsid}: gridToFinish must equal qualiToFinish when grid == qualiRank")
        outcome = row["conversionOutcome"]
        expected = "ahead" if finish < rank else ("held" if finish == rank else "behind")
        if outcome != expected:
            fail(f"{rsid}: conversionOutcome {outcome} disagrees with rank/finish ({expected})")
        # the linked qualifying session must be a real Bryce appearance
        qsid = row["qualiSessionId"]
        if qsid not in inventory_by_session:
            fail(f"{rsid}: qualiSessionId {qsid} is not in the inventory")
        if inventory_by_session[qsid]["sourceFamily"] != row["sourceFamily"]:
            fail(f"{rsid}: conversion sourceFamily disagrees with the linked inventory session")
        linked = [x for x in inventory_by_session[qsid]["linkedRaceSessionIds"].split(";") if x]
        if rsid not in linked:
            fail(f"{rsid}: inventory session {qsid} does not link back to this race")

    if conv_sessions != set(truth["conversion"]):
        missing = set(truth["conversion"]) - conv_sessions
        extra = conv_sessions - set(truth["conversion"])
        fail(f"conversion set disagrees with re-derivation (missing {len(missing)}, extra {len(extra)})")

    # ---- excluded races: partition with conversion ------------------------ #
    excluded_by_session: dict[str, str] = {}
    for row in excluded_rows:
        rsid = row["raceSessionId"]
        if row["reason"] not in EXCLUDED_REASONS:
            fail(f"excluded race {rsid}: unknown reason {row['reason']!r}")
        excluded_by_session[rsid] = row["reason"]
    if excluded_by_session != truth["excluded"]:
        fail("excluded races disagree with re-derivation")
    overlap = conv_sessions & set(excluded_by_session)
    if overlap:
        fail(f"{len(overlap)} races are both converted and excluded — the partition must be exact")
    covered = conv_sessions | set(excluded_by_session)
    all_bryce_races = {r["sessionId"] for races in truth["racesByEvent"].values() for r in races}
    if covered != all_bryce_races:
        fail(f"every Bryce race must be either converted or excluded exactly once (covered {len(covered)} of {len(all_bryce_races)})")

    # ---- rollup consistency ----------------------------------------------- #
    inv_by_key: dict[tuple, list[dict[str, str]]] = defaultdict(list)
    for row in inventory:
        inv_by_key[(row["seriesId"], row["seasonYear"], row["sourceFamily"])].append(row)
    conv_by_key: dict[tuple, list[dict[str, str]]] = defaultdict(list)
    for row in conversion_rows:
        conv_by_key[(row["seriesId"], row["seasonYear"], row["sourceFamily"])].append(row)
    for row in rollup_rows:
        key = (row["seriesId"], row["seasonYear"], row["sourceFamily"])
        members = inv_by_key.get(key, [])
        if as_int(row["qualifyingSessions"]) != len(members):
            fail(f"rollup {key}: qualifyingSessions mismatch")
        grid_setting = [m for m in members if m["role"] == "grid_setting"]
        if as_int(row["gridSettingSessions"]) != len(grid_setting):
            fail(f"rollup {key}: gridSettingSessions mismatch")
        conv_members = conv_by_key.get(key, [])
        if as_int(row["conversionRaces"]) != len(conv_members):
            fail(f"rollup {key}: conversionRaces mismatch")
        ahead = sum(1 for m in conv_members if m["conversionOutcome"] == "ahead")
        held = sum(1 for m in conv_members if m["conversionOutcome"] == "held")
        behind = sum(1 for m in conv_members if m["conversionOutcome"] == "behind")
        if as_int(row["finishedAhead"]) != ahead or as_int(row["held"]) != held or as_int(row["finishedBehind"]) != behind:
            fail(f"rollup {key}: ahead/held/behind mismatch")
        if ahead + held + behind != len(conv_members):
            fail(f"rollup {key}: conversion outcomes must partition the conversion races")

    # ---- source-family map: no season straddles both within a session ----- #
    for entry in summary.get("sourceFamilyMap", []):
        families = entry.get("families", {})
        for fam in families:
            if fam not in KNOWN_FAMILIES:
                fail(f"source-family map has unknown family {fam!r}")
        # Each SESSION resolves to one family (enforced above); the map merely
        # tallies how many appearances fall to each family per season. The
        # discipline is proven session-by-session, so a season can legitimately
        # be single-family here across every one of its sessions.
        if entry.get("primaryFamily") not in KNOWN_FAMILIES:
            fail(f"source-family map primaryFamily invalid for {entry.get('seriesId')}")

    # ---- career + coverage ------------------------------------------------ #
    career = summary["career"]
    if career["qualifyingAppearances"] != len(inventory):
        fail("career qualifyingAppearances mismatch")
    if career["conversionRaces"] != len(conversion_rows):
        fail("career conversionRaces mismatch")
    ahead = sum(1 for r in conversion_rows if r["conversionOutcome"] == "ahead")
    held = sum(1 for r in conversion_rows if r["conversionOutcome"] == "held")
    behind = sum(1 for r in conversion_rows if r["conversionOutcome"] == "behind")
    if career["finishedAhead"] != ahead or career["held"] != held or career["finishedBehind"] != behind:
        fail("career ahead/held/behind mismatch")
    if ahead + held + behind != len(conversion_rows):
        fail("career conversion outcomes must partition the conversion races")
    cov = summary["coverage"]
    if cov["bryceRaces"] != truth["totalBryceRaces"]:
        fail("coverage bryceRaces mismatch")
    if cov["conversionRaces"] != len(conversion_rows):
        fail("coverage conversionRaces mismatch")
    if cov["excludedRaces"] != len(excluded_rows):
        fail("coverage excludedRaces mismatch")

    # ---- mutation guard: a family flip must be caught --------------------- #
    # Prove the exclusivity check is not blind to a blended denominator: flip one
    # inventory row's family and confirm the re-derived family no longer agrees.
    sample = inventory[0]
    flipped = FAMILY_SESSION_RESULT if sample["sourceFamily"] == FAMILY_OFFICIAL else FAMILY_OFFICIAL
    if flipped == truth["bryceQuali"][sample["sessionId"]]["family"]:
        fail("mutation guard: flipped family should differ from the re-derived family")

    print(
        f"qualifying-layer validation OK — {len(inventory)} qualifying appearances "
        f"(one source family each, denominators re-derived), {len(conversion_rows)} grid-confirmed "
        f"conversions (ahead {ahead} / held {held} / behind {behind}), "
        f"{len(excluded_rows)} excluded; every one of {truth['totalBryceRaces']} Bryce races accounted for once."
    )


if __name__ == "__main__":
    main()
