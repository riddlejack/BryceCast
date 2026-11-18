#!/usr/bin/env python3
"""The race-by-race rows behind the head-to-head table (career round 2, Nov 17 2026).

`indy_nxt_head_to_head.csv` (analyze_indy_nxt.py, analyze_head_to_head) holds each
rival's totals. The rivals chart now draws one mark per shared race and shows
that race's track, so it needs the races themselves. This script walks the same
rows by the same rule (INDY NXT race sessions; both cars with a classified
finish position; ahead / behind by finish position; same teamId = teammates)
and writes one row per (rival, race).

It needs no pandas, and it refuses to write unless every rival's recomputed
totals equal the committed head-to-head table exactly, so the two can never
disagree.

    python3 analysis/indy-nxt-discovery/head_to_head_races.py [--dataset PATH]

PATH defaults to data/career/career.dataset.json (not in git; any checkout's copy).
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
TABLES = HERE / "output" / "tables"
BRYCE_ID = "driver_bryce_aron"
OUT = TABLES / "indy_nxt_head_to_head_races.csv"


def series_id() -> str:
    source = (HERE / "analyze_indy_nxt.py").read_text()
    match = re.search(r'INDY_SERIES_ID\s*=\s*"([^"]+)"', source)
    if not match:
        raise SystemExit("INDY_SERIES_ID not found in analyze_indy_nxt.py")
    return match.group(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default=str(ROOT / "data/career/career.dataset.json"))
    args = parser.parse_args()
    data = json.loads(Path(args.dataset).read_text())

    indy = series_id()
    events = {e["id"] for e in data["events"] if e.get("seriesId") == indy}
    races = {s["id"] for s in data["sessions"] if s.get("eventId") in events and s.get("sessionType") == "race"}
    results = defaultdict(list)
    for result in data["results"]:
        if result.get("sessionId") in races:
            results[result["sessionId"]].append(result)

    outcomes = {row["sessionId"]: row for row in csv.DictReader((TABLES / "indy_nxt_race_outcomes.csv").open())}
    totals = {row["driverId"]: row for row in csv.DictReader((TABLES / "indy_nxt_head_to_head.csv").open())}

    rows = []
    tally: dict[str, list[int]] = defaultdict(lambda: [0, 0, 0, 0])
    for sid, field in results.items():
        bryce = next((r for r in field if r.get("driverId") == BRYCE_ID), None)
        if not bryce or bryce.get("finishPosition") is None:
            continue
        race = outcomes.get(sid)
        if race is None:
            raise SystemExit(f"{sid} has no row in indy_nxt_race_outcomes.csv")
        for result in field:
            did = result.get("driverId")
            if not did or did == BRYCE_ID or result.get("finishPosition") is None:
                continue
            delta = bryce["finishPosition"] - result["finishPosition"]
            same_team = bryce.get("teamId") == result.get("teamId")
            t = tally[did]
            t[0] += 1
            t[1] += delta < 0
            t[2] += delta > 0
            t[3] += same_team
            rows.append({
                "driverId": did,
                "sessionId": sid,
                "scheduledStart": race["scheduledStart"],
                "seasonYear": race["seasonYear"],
                "raceLabel": race["raceLabel"],
                "trackId": race["trackId"],
                "trackName": race["trackName"],
                "bryceFinish": bryce["finishPosition"],
                "rivalFinish": result["finishPosition"],
                "sameTeam": int(same_team),
            })

    bad = []
    for did, row in totals.items():
        want = [int(row["racesTogether"]), int(row["bryceAhead"]), int(row["bryceBehind"]), int(row["sameTeamRaces"])]
        if tally.get(did) != want:
            bad.append(f"{did}: recomputed {tally.get(did)} vs table {want}")
    if set(tally) != set(totals):
        bad.append(f"rival sets differ: {sorted(set(tally) ^ set(totals))}")
    if bad:
        raise SystemExit("head-to-head totals do not match; nothing written\n" + "\n".join(bad))

    rows.sort(key=lambda r: (r["driverId"], r["scheduledStart"], r["sessionId"]))
    with OUT.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows for {len(tally)} rivals across {len(results)} races; totals match the head-to-head table")


if __name__ == "__main__":
    main()
