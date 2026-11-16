#!/usr/bin/env python3
"""Recompute the BryceCast career ledger figures from the dataset and life-stats tables.

The ledger (CAREER-LEDGER-*.md in the BryceCast build folder) was first computed by hand
on November 14, 2026. This script reproduces its methods so the figures can be refreshed
when the dataset changes:

    python3 analysis/career-ledger/compute_career_ledger.py \
        --dataset data/career/career.dataset.json \
        --life-stats analysis/career-life-stats/output \
        --venue-facts analysis/career-life-stats/data/venue_facts.csv \
        --assumptions analysis/career-life-stats/data/resource_model_assumptions.csv \
        --out /tmp/career-ledger.json

Classes follow the ledger: counted, lower bound, modelled range, unknown.
"Corrected" session figures are the life-stats session ledger with duplicate
classifications removed and the GB3 2022 Brands Hatch Friday sessions re-measured on
the Indy layout they ran on.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

BRYCE = "driver_bryce_aron"
DAYTONA = "session_imsa_2025_daytona_rolex_24_race"
DAYTONA_CORNERS = 12
STINTS = "analysis/imsa-daytona-stint-class-pace/output/bryce_imsa_stint_context.csv"
BRANDS_INDY = "track_brands_hatch_indy"
EQUATOR_MI = 24901.0
KM_PER_MI = 1.609344
L_PER_GAL = 3.785411784


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def parse_time(value) -> float | None:
    """Seconds from the dataset's totalTime / lapTime formats.

    MM:SS.sss, SS.sss, HH:MM:SS.ssss, H:MM:SS.sss, and GB3 2022's MM:SS:mmm
    (milliseconds after a colon). A cell holding two values uses the first.
    """
    if value is None:
        return None
    text = str(value).strip().split()[0] if str(value).strip() else ""
    if not text or not re.match(r"^[0-9:.]+$", text):
        return None
    parts = text.split(":")
    try:
        if "." not in text and len(parts) == 3 and len(parts[2]) == 3:
            return int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 1000
        total = 0.0
        for part in parts:
            total = total * 60 + float(part)
        return total
    except ValueError:
        return None


def numeric_gap(value) -> float | None:
    text = str(value or "").strip()
    if not text or re.search(r"[A-Za-z]", text):
        return None
    return parse_time(text)


def session_date(session: dict) -> date | None:
    for key in ("actualStart", "scheduledStart"):
        value = session.get(key)
        if not value:
            continue
        text = str(value)
        match = re.match(r"(\d{4})-(\d{2})-(\d{2})", text)
        if match:
            return date(int(match[1]), int(match[2]), int(match[3]))
        match = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
        if match:
            return date(int(match[3]), int(match[1]), int(match[2]))
    return None


def parse_day(text: str) -> date:
    return datetime.strptime(text[:10], "%Y-%m-%d").date()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--life-stats", required=True)
    parser.add_argument("--venue-facts", required=True)
    parser.add_argument("--assumptions", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    root = Path(args.root)
    data = json.loads(Path(args.dataset).read_text())
    ls = Path(args.life_stats)
    facts = {row["trackId"]: row for row in rows(Path(args.venue_facts))}
    assumptions = rows(Path(args.assumptions))

    sessions = {row["id"]: row for row in data["sessions"]}
    events = {row["id"]: row for row in data["events"]}
    tracks = {row["id"]: row for row in data["tracks"]}
    series_names = {row["id"]: row["name"] for row in data["series"]}
    teams = {row["id"]: row.get("name") for row in data["teams"]}
    cars = {row["id"]: row for row in data["cars"]}

    def ev(result):
        return events[sessions[result["sessionId"]]["eventId"]]

    bryce = [row for row in data["results"] if row.get("driverId") == BRYCE]
    races = [row for row in bryce if sessions[row["sessionId"]]["sessionType"] == "race"]
    heats = [row for row in bryce if sessions[row["sessionId"]]["sessionType"] == "heat"]
    race_ids = {row["sessionId"] for row in races}
    stints = [row for row in rows(root / STINTS) if row["sessionId"] == DAYTONA]
    daytona_laps = sum(int(row["lapCount"]) for row in stints)

    out: dict = {}

    # ---------- 1. Counts ----------
    def by(key_fn, items):
        return dict(sorted(Counter(key_fn(r) for r in items).items(), key=lambda kv: str(kv[0])))

    out["races"] = len(races)
    out["racesStarted"] = len([r for r in races if r.get("status") != "dns"])
    out["dnsRaces"] = [r["sessionId"] for r in races if r.get("status") == "dns"]
    out["racesBySeries"] = by(lambda r: ev(r)["seriesId"], races)
    out["racesByYear"] = by(lambda r: ev(r)["seasonYear"], races)
    out["heats"] = [
        {"sessionId": r["sessionId"], "name": sessions[r["sessionId"]]["sessionName"], "finish": r.get("finishPosition"), "start": r.get("startPosition")}
        for r in heats
    ]
    out["seasonYears"] = sorted({ev(r)["seasonYear"] for r in races})
    out["seriesSeasons"] = sorted({f'{ev(r)["seriesId"]}:{ev(r)["seasonYear"]}' for r in races})
    out["series"] = sorted({ev(r)["seriesId"] for r in races})
    race_events = {ev(r)["id"]: ev(r) for r in races}
    out["events"] = len(race_events)
    # Meetings: merge events at the same track whose date ranges overlap or touch.
    meetings = []
    for event in sorted(race_events.values(), key=lambda e: (e["trackId"], e["eventStartDate"])):
        start, end = parse_day(event["eventStartDate"]), parse_day(event["eventEndDate"] or event["eventStartDate"])
        if meetings and meetings[-1]["trackId"] == event["trackId"] and start <= meetings[-1]["end"]:
            meetings[-1]["end"] = max(meetings[-1]["end"], end)
            meetings[-1]["events"].append(event["id"])
        else:
            meetings.append({"trackId": event["trackId"], "start": start, "end": end, "events": [event["id"]], "year": event["seasonYear"]})
    out["meetings"] = len(meetings)
    race_track_ids = sorted({e["trackId"] for e in race_events.values()})
    out["trackIds"] = len(race_track_ids)
    out["venues"] = sorted({facts[t]["trackName"] for t in race_track_ids})
    out["venueCount"] = len(out["venues"])
    out["countries"] = sorted({facts[t]["country"] for t in race_track_ids})
    out["teams"] = sorted({teams.get(r["teamId"]) or r["teamId"] for r in bryce if r.get("teamId")})
    out["carRecords"] = len({r["carId"] for r in bryce if r.get("carId")})
    out["carNumbers"] = sorted({str(r["carNumber"]) for r in bryce if r.get("carNumber")}, key=lambda x: (len(x), x))
    out["chassis"] = sorted({cars[r["carId"]].get("chassis") for r in bryce if r.get("carId") in cars and cars[r["carId"]].get("chassis")})
    fin = lambda r: r.get("finishPosition")
    out["wins"] = [
        {"sessionId": r["sessionId"], "series": ev(r)["seriesId"], "event": ev(r)["name"], "session": sessions[r["sessionId"]]["sessionName"]}
        for r in races if fin(r) == 1
    ]
    out["podiums"] = len([r for r in races if fin(r) and fin(r) <= 3])
    out["top5"] = len([r for r in races if fin(r) and fin(r) <= 5])
    out["top10"] = len([r for r in races if fin(r) and fin(r) <= 10])
    out["top5WithHeats"] = out["top5"] + len([r for r in heats if fin(r) and fin(r) <= 5])
    out["top10WithHeats"] = out["top10"] + len([r for r in heats if fin(r) and fin(r) <= 10])
    out["podiumsBySeries"] = by(lambda r: ev(r)["seriesId"], [r for r in races if fin(r) and fin(r) <= 3])
    out["top10BySeries"] = by(lambda r: ev(r)["seriesId"], [r for r in races if fin(r) and fin(r) <= 10])
    best = defaultdict(lambda: 999)
    for r in races:
        if fin(r):
            best[ev(r)["seriesId"]] = min(best[ev(r)["seriesId"]], fin(r))
    out["bestFinishBySeries"] = dict(sorted(best.items()))
    with_start = [r for r in races if r.get("startPosition") is not None]
    out["racesWithStart"] = len(with_start)
    out["startsFromFirst"] = [
        {"sessionId": r["sessionId"], "finish": fin(r)} for r in with_start if r["startPosition"] == 1
    ]
    out["frontRowStarts"] = len([r for r in with_start if r["startPosition"] <= 2])
    out["missingStartBySeriesYear"] = by(lambda r: f'{ev(r)["seriesId"]}:{ev(r)["seasonYear"]}', [r for r in races if r.get("startPosition") is None])
    out["statusCounts"] = by(lambda r: r.get("status") or "unknown", races)
    out["statusRawNonRunning"] = [
        {"sessionId": r["sessionId"], "status": r.get("status"), "statusRaw": r.get("statusRaw"), "laps": r.get("lapsCompleted")}
        for r in races if r.get("status") != "running"
    ]
    out["classifiedFinish"] = len([r for r in races if fin(r) is not None])

    # ---------- 2. Distance and laps ----------
    def race_laps(r):
        if r["sessionId"] == DAYTONA:
            return daytona_laps
        return r.get("lapsCompleted")

    def length(track_id):
        return float(facts[track_id]["lengthMi"])

    race_rows = []
    for r in races:
        laps = race_laps(r)
        track_id = ev(r)["trackId"]
        race_rows.append({
            "r": r, "laps": laps, "miles": laps * length(track_id) if laps is not None else None,
            "series": ev(r)["seriesId"], "year": ev(r)["seasonYear"], "trackId": track_id,
            "corners": (laps * (DAYTONA_CORNERS if r["sessionId"] == DAYTONA else (tracks[track_id].get("cornerCount") or 0))) if laps is not None else None,
        })
    out["raceLaps"] = sum(x["laps"] or 0 for x in race_rows)
    out["raceMiles"] = round(sum(x["miles"] or 0 for x in race_rows), 3)
    out["racesWithoutLaps"] = [x["r"]["sessionId"] for x in race_rows if x["laps"] is None]
    out["heatLaps"] = sum(r.get("lapsCompleted") or 0 for r in heats)

    ledger = rows(ls / "tables/session_mileage_ledger.csv")
    def is_duplicate(row):
        name = row["sessionName"]
        if row["seriesId"] == "series_gb3" and row["seasonYear"] == "2021" and name == "Qualifying 2nd Fastest":
            return True
        if row["seriesId"] == "series_gb3" and row["seasonYear"] == "2022" and re.search(r"(Friday|Thursday) combined", name, re.I):
            return True
        return False

    def is_brands_friday(row):
        if row["seriesId"] != "series_gb3" or row["seasonYear"] != "2022" or row["trackId"] != "track_brands_hatch_gp":
            return False
        day = session_date(sessions[row["sessionId"]])
        return day is not None and day.weekday() == 4 and row["sessionType"] == "practice"

    corrected = []
    duplicates = []
    remeasured = []
    for row in ledger:
        if is_duplicate(row):
            duplicates.append(row)
            continue
        row = dict(row)
        row["trackForCorners"] = row["trackId"]
        if is_brands_friday(row):
            remeasured.append(row["sessionId"])
            row["lengthMi"] = facts[BRANDS_INDY]["lengthMi"]
            row["trackForCorners"] = BRANDS_INDY
            if row["lapsFloor"] != "":
                row["milesFloor"] = f'{int(row["lapsFloor"]) * float(row["lengthMi"]):.3f}'
        corrected.append(row)
    out["duplicatesRemoved"] = [{"sessionId": d["sessionId"], "laps": d["lapsFloor"]} for d in duplicates]
    out["brandsFridayRemeasured"] = remeasured

    def summarise(subset):
        laps = sum(int(x["lapsFloor"]) for x in subset if x["lapsFloor"] != "")
        miles = sum(float(x["milesFloor"]) for x in subset if x["milesFloor"] != "")
        return {"sessions": len(subset), "laps": laps, "miles": round(miles, 3)}

    exact = [x for x in corrected if x["confidenceClass"] == "observed_exact"]
    lower = [x for x in corrected if x["confidenceClass"] == "observed_lower_bound"]
    unknown = [x for x in corrected if x["confidenceClass"] == "unknown"]
    out["sessionsExact"] = summarise(exact)
    out["sessionsLowerBound"] = summarise(lower)
    out["sessionsUnknown"] = {"count": len(unknown), "bySeriesType": by(lambda x: f'{x["seriesId"]}:{x["sessionType"]}', unknown), "ids": [x["sessionId"] for x in unknown]}
    out["sessionsFloor"] = summarise(exact + lower)
    out["sessionsFloorWithLaps"] = len([x for x in exact + lower if x["lapsFloor"] not in ("", "0")])
    out["publishedFloor"] = summarise([x for x in ledger if x["confidenceClass"] in ("observed_exact", "observed_lower_bound")])
    out["publishedExact"] = summarise([x for x in ledger if x["confidenceClass"] == "observed_exact"])

    longest = max((x for x in race_rows if x["r"]["sessionId"] != DAYTONA and x["miles"] is not None), key=lambda x: x["miles"])
    most = max((x for x in race_rows if x["r"]["sessionId"] != DAYTONA and x["laps"] is not None), key=lambda x: x["laps"])
    timed = [(x, parse_time(x["r"].get("totalTime"))) for x in race_rows if x["r"]["sessionId"] != DAYTONA]
    longest_time = max((t for t in timed if t[1]), key=lambda t: t[1])
    shortest = min((x for x in race_rows if x["r"].get("status") == "running" and x["laps"]), key=lambda x: x["laps"])
    describe = lambda x: {"sessionId": x["r"]["sessionId"], "event": ev(x["r"])["name"], "laps": x["laps"], "miles": round(x["miles"], 2) if x["miles"] is not None else None, "finish": x["r"].get("finishPosition")}
    out["longestRaceByDistance"] = describe(longest)
    out["mostLapsInOneRace"] = describe(most)
    out["longestRaceByTime"] = {**describe(longest_time[0]), "minutes": round(longest_time[1] / 60, 1)}
    out["shortestRaceRunning"] = describe(shortest)

    def breakdown(key):
        table = {}
        groups = defaultdict(list)
        for x in race_rows:
            groups[str(x[key])].append(x)
        sgroups = defaultdict(list)
        for row in corrected:
            sgroups[row["seriesId"] if key == "series" else row["seasonYear"]].append(row)
        for name in sorted(set(groups) | set(sgroups)):
            g = groups.get(name, [])
            s = sgroups.get(name, [])
            table[name] = {
                "races": len(g),
                "raceLaps": sum(x["laps"] or 0 for x in g),
                "raceMiles": round(sum(x["miles"] or 0 for x in g), 1),
                "exact": summarise([x for x in s if x["confidenceClass"] == "observed_exact"]),
                "lowerBound": summarise([x for x in s if x["confidenceClass"] == "observed_lower_bound"]),
                "unknown": len([x for x in s if x["confidenceClass"] == "unknown"]),
            }
        return table

    out["bySeries"] = breakdown("series")
    out["byYear"] = breakdown("year")

    # ---------- 3. Corners ----------
    out["cornersInRaces"] = sum(x["corners"] or 0 for x in race_rows)
    out["cornersInRacesBySeries"] = dict(sorted(Counter({k: 0 for k in out["series"]}).items()))
    for x in race_rows:
        out["cornersInRacesBySeries"][x["series"]] += x["corners"] or 0
    def session_corners(subset):
        total = 0
        for row in subset:
            if row["lapsFloor"] == "":
                continue
            laps = int(row["lapsFloor"])
            corners = DAYTONA_CORNERS if row["sessionId"] == DAYTONA else tracks[row["trackForCorners"]].get("cornerCount") or 0
            total += laps * corners
        return total
    out["cornersSessionsExact"] = session_corners(exact)
    out["cornersSessionsLowerBound"] = session_corners(lower)
    raced_tracks = [tracks[t] for t in race_track_ids]
    out["tracksWithCornerCount"] = len([t for t in raced_tracks if t.get("cornerCount")])
    sourced = [t for t in raced_tracks if re.search(r"turn|corner|bend", str(t.get("metadataNotes") or t.get("notes") or ""), re.I)]
    out["tracksWithTurnSource"] = len(sourced)
    out["tracksWithoutTurnSource"] = sorted(f'{t["name"]} {t.get("cornerCount")}' for t in raced_tracks if t not in sourced)
    out["ovalRaceLaps"] = sum(x["laps"] or 0 for x in race_rows if tracks[x["trackId"]].get("trackType") == "oval")
    out["ovalTracks"] = sorted({tracks[x["trackId"]]["name"] for x in race_rows if tracks[x["trackId"]].get("trackType") == "oval"})

    # ---------- 4. Time ----------
    daytona_lap_seconds = sum(
        parse_time(l["lapTime"]) or 0 for l in data["lapSamples"] if l["sessionId"] == DAYTONA and l.get("driverId") == BRYCE
    )
    timed_rows, untimed_rows = [], []
    for x in race_rows:
        r = x["r"]
        if r["sessionId"] == DAYTONA:
            timed_rows.append((x, daytona_lap_seconds))
            continue
        t = parse_time(r.get("totalTime"))
        if t:
            timed_rows.append((x, t))
        elif x["laps"]:
            best_lap = parse_time(r.get("bestLapTime"))
            untimed_rows.append((x, x["laps"] * best_lap if best_lap else None))
    out["timedRaces"] = len(timed_rows)
    out["timedRaceHours"] = round(sum(t for _, t in timed_rows) / 3600, 4)
    out["timedRaceMiles"] = round(sum(x["miles"] for x, _ in timed_rows), 3)
    out["untimedRaces"] = len(untimed_rows)
    out["untimedRacesBySeries"] = by(lambda pair: pair[0]["series"], untimed_rows)
    out["untimedRaceHoursLowerBound"] = round(sum(t or 0 for _, t in untimed_rows) / 3600, 4)
    out["untimedWithoutBestLap"] = [x["r"]["sessionId"] for x, t in untimed_rows if t is None]
    out["racesNeitherTimedNorLapped"] = [x["r"]["sessionId"] for x in race_rows if x not in [p[0] for p in timed_rows] and x not in [p[0] for p in untimed_rows]]
    out["allRaceHoursLowerBound"] = round(out["timedRaceHours"] + out["untimedRaceHoursLowerBound"], 4)
    out["averageRaceSpeedMph"] = round(out["timedRaceMiles"] / out["timedRaceHours"], 2)
    # Method check: laps x best lap against the true time on timed races.
    check_true = check_est = 0.0
    for x, t in timed_rows:
        if x["r"]["sessionId"] == DAYTONA:
            continue
        best_lap = parse_time(x["r"].get("bestLapTime"))
        if best_lap and x["laps"]:
            check_true += t
            check_est += x["laps"] * best_lap
    out["bestLapMethodCheck"] = {"trueHours": round(check_true / 3600, 2), "estimateHours": round(check_est / 3600, 2)}
    # Non-race session time: laps x best lap on corrected exact + lower-bound rows.
    best_by_session = {}
    for r in bryce:
        best_by_session[r["sessionId"]] = parse_time(r.get("bestLapTime"))
    for q in data.get("qualifyingResults", []):
        if q.get("driverId") == BRYCE and q["sessionId"] not in best_by_session:
            best_by_session[q["sessionId"]] = parse_time(q.get("bestLapTime") or q.get("bestLap"))
    other_seconds, other_sessions, other_missing = 0.0, 0, []
    for row in exact + lower:
        if row["sessionType"] == "race" or row["lapsFloor"] in ("", "0"):
            continue
        best_lap = best_by_session.get(row["sessionId"])
        if not best_lap:
            other_missing.append(row["sessionId"])
            continue
        other_seconds += int(row["lapsFloor"]) * best_lap
        other_sessions += 1
    out["otherSessionHoursLowerBound"] = round(other_seconds / 3600, 4)
    out["otherSessionsTimed"] = other_sessions
    out["otherSessionsNoBestLap"] = other_missing
    out["allSessionHoursLowerBound"] = round(out["allRaceHoursLowerBound"] + out["otherSessionHoursLowerBound"], 4)

    # ---------- 6. People ----------
    in_races = defaultdict(set)
    driver_series = defaultdict(set)
    for r in data["results"]:
        if r["sessionId"] in race_ids and r.get("driverId") and r["driverId"] != BRYCE:
            in_races[r["driverId"]].add(r["sessionId"])
            driver_series[events[sessions[r["sessionId"]]["eventId"]]["seriesId"]].add(r["driverId"])
    out["otherDriverRecords"] = len(in_races)
    at_daytona = {d for d, s in in_races.items() if DAYTONA in s}
    out["otherDriversAtDaytona"] = len(at_daytona)
    out["otherDriversOnlyDaytona"] = len([d for d in at_daytona if in_races[d] == {DAYTONA}])
    outside = {d for d, s in in_races.items() if s - {DAYTONA}}
    out["otherDriversOutsideDaytona"] = len(outside)
    out["otherDriversBySeries"] = {k: len(v) for k, v in sorted(driver_series.items())}
    shared = sorted(((len(s), d) for d, s in in_races.items()), reverse=True)[:8]
    names = {row["id"]: row.get("displayName") for row in data["drivers"]}
    out["mostRacesShared"] = [{"driver": names.get(d, d), "races": n} for n, d in shared]
    heat_ids = {r["sessionId"] for r in heats}
    heat_only = {
        r["driverId"] for r in data["results"]
        if r["sessionId"] in heat_ids and r.get("driverId") and r["driverId"] != BRYCE and r["driverId"] not in in_races
    }
    out["heatOnlyDrivers"] = len(heat_only)
    out["artifactDriverRecords"] = sorted(d for d in outside if re.match(r"^driver_(\d+|[a-z]{1,3})$", d))
    # Possible duplicate spellings: same family name, given names sharing a first letter.
    by_family = defaultdict(list)
    for d in outside:
        display = names.get(d) or d
        parts = display.replace("(", " ").replace(")", " ").split()
        while parts and re.fullmatch(r"(?i)jr\.?|sr\.?|ii|iii", parts[-1]):
            parts.pop()
        if len(parts) >= 3 and re.fullmatch(r"[A-Z]\.?", parts[0]):
            parts.pop(0)
        if len(parts) >= 2:
            by_family[parts[-1].lower()].append((d, display, parts[0][0].lower()))
    out["possibleDuplicateSpellings"] = sorted(
        [sorted((x[0], x[1]) for x in v) for k, v in by_family.items() if len(v) > 1 and len({x[2] for x in v}) == 1]
    )
    out["carsLinedUpAgainst"] = sum((r.get("fieldSize") or 0) - 1 for r in races)
    out["carsLinedUpDaytona"] = sum((r.get("fieldSize") or 0) - 1 for r in races if r["sessionId"] == DAYTONA)
    out["racesWithoutFieldSize"] = [r["sessionId"] for r in races if not r.get("fieldSize")]
    out["largestFields"] = sorted(((r.get("fieldSize") or 0, r["sessionId"]) for r in races), reverse=True)[:5]

    # ---------- 7. Places ----------
    both = [r for r in races if r.get("startPosition") is not None and fin(r) is not None]
    diffs = [(r["startPosition"] - fin(r), r) for r in both]
    out["racesWithStartAndFinish"] = len(both)
    out["placesGained"] = {"places": sum(d for d, _ in diffs if d > 0), "races": len([d for d, _ in diffs if d > 0])}
    out["placesLost"] = {"places": -sum(d for d, _ in diffs if d < 0), "races": len([d for d, _ in diffs if d < 0])}
    out["placesSame"] = len([d for d, _ in diffs if d == 0])
    out["placesNet"] = sum(d for d, _ in diffs)
    running = [(d, r) for d, r in diffs if r.get("status") == "running"]
    out["placesNetRunning"] = {"net": sum(d for d, _ in running), "races": len(running)}
    out["biggestGain"] = [(d, r["sessionId"], r["startPosition"], fin(r)) for d, r in sorted(diffs, key=lambda p: -p[0])[:5]]
    out["biggestLoss"] = [(d, r["sessionId"], r["startPosition"], fin(r)) for d, r in sorted(diffs, key=lambda p: p[0])[:3]]
    gaps = [(numeric_gap(r.get("gapToAhead")), r) for r in races if fin(r) and fin(r) > 1]
    gaps = [(g, r) for g, r in gaps if g is not None and g > 0]
    out["racesWithGapToAhead"] = len(gaps)
    out["racesWithGapToAheadBySeries"] = by(lambda p: ev(p[1])["seriesId"], gaps)
    out["closestFinishes"] = [(g, r["sessionId"], fin(r)) for g, r in sorted(gaps, key=lambda p: p[0])[:4]]
    margins = []
    for w in [r for r in races if fin(r) == 1]:
        second = next((x for x in data["results"] if x["sessionId"] == w["sessionId"] and x.get("finishPosition") == 2), None)
        margin = None
        if second:
            # gapToAhead first; FROC fills only gapToLeader; Orbits sheets print
            # the margin in the session summary instead of on the row.
            margin = numeric_gap(second.get("gapToAhead")) or numeric_gap(second.get("gapToLeader"))
        if margin is None:
            margin = numeric_gap(((sessions.get(w["sessionId"]) or {}).get("raw") or {}).get("marginOfVictory"))
        margins.append((margin, w["sessionId"], names.get(second["driverId"]) if second else None))
    out["winningMargins"] = sorted(margins, key=lambda m: (m[0] is None, m[0] or 0))

    # ---------- 8. Time given to racing ----------
    first_event = min(race_events.values(), key=lambda e: e["eventStartDate"])
    last_event = max(race_events.values(), key=lambda e: e["eventEndDate"] or e["eventStartDate"])
    span_start = parse_day(first_event["eventStartDate"])
    span_end = parse_day(last_event["eventEndDate"] or last_event["eventStartDate"])
    span_days = (span_end - span_start).days + 1
    out["span"] = {"start": span_start.isoformat(), "end": span_end.isoformat(), "days": span_days, "firstEvent": first_event["name"], "lastEvent": last_event["name"]}
    event_days = set()
    days_by_event = {}
    for e in race_events.values():
        start, end = parse_day(e["eventStartDate"]), parse_day(e["eventEndDate"] or e["eventStartDate"])
        days = {start + timedelta(n) for n in range((end - start).days + 1)}
        days_by_event[e["id"]] = days
        event_days |= days
    out["eventDays"] = len(event_days)
    out["eventDaysWithoutOverlap"] = sum(len(v) for v in days_by_event.values())
    session_days, undated = set(), []
    earlier_days = set()
    for r in bryce:
        s = sessions[r["sessionId"]]
        day = session_date(s)
        if day is None:
            undated.append(s["id"])
            continue
        session_days.add(day)
        if s["eventId"] in race_events and day < parse_day(events[s["eventId"]]["eventStartDate"]):
            earlier_days.add(day)
    out["daysWithSession"] = len(session_days)
    out["undatedSessions"] = len(undated)
    out["eventDaysIncludingEarlierSessions"] = len(event_days | earlier_days)
    out["earlierSessionDaysAdded"] = len(earlier_days - event_days)
    weeks = {d.isocalendar()[:2] for d in event_days}
    span_weeks = set()
    d = span_start
    while d <= span_end:
        span_weeks.add(d.isocalendar()[:2])
        d += timedelta(1)
    out["isoWeeksWithEvent"] = len(weeks)
    out["isoWeeksInSpan"] = len(span_weeks)
    out["isoWeeksWithEventIncludingEarlier"] = len({d.isocalendar()[:2] for d in event_days | earlier_days})
    out["eventsPerYear"] = by(lambda e: e["seasonYear"], race_events.values())
    out["meetingsPerYear"] = by(lambda m: m["year"], meetings)
    out["eventDaysPerYear"] = by(lambda d: d.year, event_days)
    ordered = sorted(races, key=lambda r: (session_date(sessions[r["sessionId"]]) or date.max, sessions[r["sessionId"]].get("actualStart") or ""))
    first_race, last_race = ordered[0], max(races, key=lambda r: (session_date(sessions[r["sessionId"]]) or date.min))
    pick = lambda r: {"sessionId": r["sessionId"], "date": str(session_date(sessions[r["sessionId"]])), "event": ev(r)["name"], "finish": fin(r), "field": r.get("fieldSize"), "start": r.get("startPosition")}
    out["firstRace"], out["lastRace"] = pick(first_race), pick(last_race)

    # ---------- 9. Travel ----------
    travel = rows(ls / "tables/travel_legs.csv")
    summary = json.loads((ls / "summary.json").read_text())
    gc = [float(t["greatCircleMiles"]) for t in travel if t["greatCircleMiles"] != ""]
    out["travel"] = {
        "legs": len(travel),
        "miles": round(sum(gc), 1),
        "equators": round(sum(gc) / EQUATOR_MI, 2),
        "perRaceMile": round(sum(gc) / out["raceMiles"], 1),
        "drive": {"legs": len([t for t in travel if t["travelModeProxy"] == "drive_proxy"]), "miles": round(sum(float(t["greatCircleMiles"]) for t in travel if t["travelModeProxy"] == "drive_proxy"), 1)},
        "flight": {"legs": len([t for t in travel if t["travelModeProxy"] == "flight_proxy"]), "miles": round(sum(float(t["greatCircleMiles"]) for t in travel if t["travelModeProxy"] == "flight_proxy"), 1)},
        "sameVenue": len([t for t in travel if t["greatCircleMiles"] != "" and float(t["greatCircleMiles"]) == 0]),
        "routeLow": round(sum(float(t["routeAdjustedLowMiles"] or 0) for t in travel), 1),
        "routeBase": round(sum(float(t["routeAdjustedBaseMiles"] or 0) for t in travel), 1),
        "routeHigh": round(sum(float(t["routeAdjustedHighMiles"] or 0) for t in travel), 1),
        "longestLegs": sorted(((float(t["greatCircleMiles"]), t["fromTrackName"], t["fromEventStartDate"], t["toTrackName"], t["toEventStartDate"]) for t in travel if t["greatCircleMiles"]), reverse=True)[:3],
        "farthestPair": summary.get("farthestVenuePair"),
        "modes": by(lambda t: t["travelModeProxy"], travel),
    }

    # ---------- 10. Weather ----------
    wx = [w for w in data["weatherObservations"] if w.get("sessionId") in race_ids]
    reports = {w["sessionId"]: w for w in wx if w.get("weatherSourceType") == "series_report"}
    out["racesWithOfficialCondition"] = len(reports)
    out["racesWithOfficialConditionBySeriesYear"] = by(lambda sid: f'{events[sessions[sid]["eventId"]]["seriesId"]}:{events[sessions[sid]["eventId"]]["seasonYear"]}', reports)
    out["officialWetDry"] = by(lambda w: w.get("wetDry") or "unknown", reports.values())
    out["officialWetRaces"] = sorted(f'{w.get("wetDry")}: {events[sessions[sid]["eventId"]]["name"]} / {sessions[sid]["sessionName"]}' for sid, w in reports.items() if w.get("wetDry") not in ("dry", None))
    out["racesWithoutCondition"] = by(lambda r: f'{ev(r)["seriesId"]}:{ev(r)["seasonYear"]}', [r for r in races if r["sessionId"] not in reports and r["sessionId"] not in {w["sessionId"] for w in wx}])
    temps = [(w.get("ambientTempC"), w["sessionId"]) for w in wx if w.get("ambientTempC") is not None]
    out["racesWithTemperature"] = len({sid for _, sid in temps})
    out["hottest"] = max(temps) if temps else None
    out["coldest"] = min(temps) if temps else None
    reanalysis_wet = {w["sessionId"] for w in wx if w.get("weatherSourceType") == "grid_reanalysis" and w.get("wetDry") == "wet"}
    out["indyNxtRainHour"] = len(reanalysis_wet)

    # ---------- 11. Modelled ----------
    def assumption(series_id, year):
        match = [a for a in assumptions if a["seriesId"] == series_id and int(a["seasonStart"]) <= int(year) <= int(a["seasonEnd"])]
        return match[0]

    def fuel(subset, miles_key, series_key="seriesId", year_key="seasonYear"):
        low = base = high = 0.0
        for row in subset:
            miles = row[miles_key]
            if miles in ("", None):
                continue
            a = assumption(row[series_key], row[year_key])
            km = float(miles) * KM_PER_MI
            low += km * float(a["fuelLowLPer100Km"]) / 100
            base += km * float(a["fuelBaseLPer100Km"]) / 100
            high += km * float(a["fuelHighLPer100Km"]) / 100
        return {"low": round(low, 1), "base": round(base, 1), "high": round(high, 1), "gallons": [round(v / L_PER_GAL) for v in (low, base, high)]}

    published_fuel = rows(ls / "tables/estimated_fuel_burned.csv")
    out["fuelPublished"] = {
        "low": round(sum(float(r["estimatedFuelLowLiters"]) for r in published_fuel), 1),
        "base": round(sum(float(r["estimatedFuelBaseLiters"]) for r in published_fuel), 1),
        "high": round(sum(float(r["estimatedFuelHighLiters"]) for r in published_fuel), 1),
    }
    out["fuelCorrected"] = fuel(exact + lower, "milesFloor")
    out["fuelRaces"] = fuel([{"miles": x["miles"], "seriesId": x["series"], "seasonYear": x["year"]} for x in race_rows], "miles")

    published_tires = rows(ls / "tables/estimated_unique_tires.csv")
    out["tiresPublished"] = {k: sum(int(r[f"estimatedUniqueTires{k.title()}"]) for r in published_tires) for k in ("low", "base", "high")}
    def tires(subset):
        totals = {"low": 0, "base": 0, "high": 0}
        for row in subset:
            if row["lapsFloor"] in ("", "0"):
                continue
            a = assumption(row["seriesId"], row["seasonYear"])
            laps = int(row["lapsFloor"])
            # Low tyres come from the longest assumed life, high from the shortest.
            totals["low"] += math.ceil(laps / float(a["tireLifeHighLaps"])) * 4
            totals["base"] += math.ceil(laps / float(a["tireLifeBaseLaps"])) * 4
            totals["high"] += math.ceil(laps / float(a["tireLifeLowLaps"])) * 4
        return totals
    out["tiresCorrected"] = tires(exact + lower)
    out["tiresCorrectedCheckOnLedger"] = tires([x for x in ledger if x["confidenceClass"] in ("observed_exact", "observed_lower_bound")])

    # ---------- 12. Other ----------
    out["penalties"] = [
        {"sessionId": p["sessionId"], "type": p.get("penaltyType"), "reason": p.get("reason")}
        for p in data["penalties"] if p.get("driverId") == BRYCE
    ]
    out["penaltiesBySeriesPrefix"] = by(lambda p: p["id"].split("_")[1] + "_" + p["id"].split("_")[2], data["penalties"])
    out["pitStopsFilled"] = len([r for r in races if r.get("pitStops") is not None])
    out["pitStopsNonZero"] = [(r["sessionId"], r["pitStops"]) for r in races if r.get("pitStops")]
    out["gapRowsCareerRaces"] = [g["id"] for g in data["gaps"] if str(g.get("scope", "")).startswith("career_dataset:races_without_official_classification")]

    Path(args.out).write_text(json.dumps(out, indent=1, default=str) + "\n")
    headline = {k: out[k] for k in ("races", "raceLaps", "raceMiles", "cornersInRaces", "timedRaceHours", "untimedRaceHoursLowerBound", "allRaceHoursLowerBound", "eventDays", "isoWeeksWithEvent", "isoWeeksInSpan", "otherDriverRecords", "otherDriversOutsideDaytona", "carsLinedUpAgainst")}
    headline["venues"] = out["venueCount"]
    headline["series"] = len(out["series"])
    headline["countries"] = len(out["countries"])
    headline["wins"] = len(out["wins"])
    headline["podiums"] = out["podiums"]
    headline["top10"] = out["top10"]
    headline["sessionsExact"] = out["sessionsExact"]
    headline["sessionsFloor"] = out["sessionsFloor"]
    headline["travel"] = out["travel"]["miles"]
    headline["fuelCorrected"] = out["fuelCorrected"]
    print(json.dumps(headline, indent=1))


if __name__ == "__main__":
    main()
