#!/usr/bin/env python3
"""Validate Career Life Stats semantics independently of the builder."""

from __future__ import annotations

import csv
import datetime as dt
import json
import math
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/career-life-stats"
DATASET = ROOT / "data/career/career.dataset.json"
FACTS = LANE / "data/venue_facts.csv"
ASSUMPTIONS = LANE / "data/resource_model_assumptions.csv"
STINTS = ROOT / "analysis/imsa-daytona-stint-class-pace/output/bryce_imsa_stint_context.csv"
TABLES = LANE / "output/tables"
SUMMARY = LANE / "output/summary.json"
FIGURES = LANE / "output/career_figures.json"
BRYCE = "driver_bryce_aron"
DAYTONA = "session_imsa_2025_daytona_rolex_24_race"
CONFIDENCE = {"observed_exact", "observed_lower_bound", "modeled_range", "unknown"}


def fail(message: str) -> None:
    raise AssertionError(message)


def rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        fail(f"Missing artifact: {path.relative_to(ROOT)}")
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def close(left: float, right: float, tolerance: float = 0.051) -> bool:
    return abs(left - right) <= tolerance


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    value = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 3958.7613 * math.asin(min(1.0, math.sqrt(value)))


def validate_career_figures(
    dataset: dict[str, Any],
    summary: dict[str, Any],
    race: list[dict[str, str]],
    ledger: list[dict[str, str]],
    travel: list[dict[str, str]],
    fuel: list[dict[str, str]],
) -> None:
    """Check the Career page figures against the ledgers they summarise."""
    if not FIGURES.exists():
        fail("Missing artifact: analysis/career-life-stats/output/career_figures.json")
    payload = json.loads(FIGURES.read_text())
    if payload.get("schemaVersion") != "brycecast.careerFigures.v1":
        fail("career_figures.json must use brycecast.careerFigures.v1")
    sessions = {row["id"]: row for row in dataset["sessions"]}
    bryce_races = [
        row for row in dataset["results"]
        if row.get("driverId") == BRYCE and sessions[row["sessionId"]]["sessionType"] == "race"
    ]
    all_figures = payload["figures"] + payload["lifeShare"]["figures"]
    ids = [item["id"] for item in all_figures]
    if len(ids) != len(set(ids)):
        fail("Career figure ids must be unique")
    for item in all_figures:
        if item["class"] not in {"counted", "lower_bound", "modelled_range"}:
            fail(f"Career figure {item['id']} has an invalid class")
        if not item.get("how") or not item.get("unit") or not item.get("display") or not item.get("label"):
            fail(f"Career figure {item['id']} needs a label, unit, display and plain how")
        if "—" in item["how"] or "—" in (item.get("caveat") or ""):
            fail(f"Career figure {item['id']} uses an em dash; keep the plain register")
        if item["class"] == "lower_bound" and not item["display"].endswith("+"):
            fail(f"Lower bound {item['id']} must display with a trailing +")
        if item["class"] == "modelled_range":
            band = item["range"]
            if not band or not (band["low"] <= band["base"] <= band["high"]) or item["value"] is not None:
                fail(f"Modelled range {item['id']} must carry ordered low/base/high and no single value")
        elif item["value"] is None:
            fail(f"Figure {item['id']} needs a value")
    by_id = {item["id"]: item for item in all_figures}
    expect = {
        "races": len(bryce_races),
        "wins": sum(1 for row in bryce_races if row.get("finishPosition") == 1),
        "podiums": sum(1 for row in bryce_races if row.get("finishPosition") is not None and row["finishPosition"] <= 3),
        "topTens": sum(1 for row in bryce_races if row.get("finishPosition") is not None and row["finishPosition"] <= 10),
        "raceLaps": summary["personalRaceMileage"]["laps"],
        "raceMiles": summary["personalRaceMileage"]["miles"],
        "venues": summary["venues"],
        "countries": summary["countries"],
        "milesBetweenTracks": summary["travel"]["greatCircleMinimum"]["miles"],
    }
    for fid, value in expect.items():
        if fid not in by_id or by_id[fid]["value"] != value:
            fail(f"Career figure {fid} must be {value}, got {by_id.get(fid, {}).get('value')}")
    route = summary["travel"]["routeAdjustedMinimum"]
    if by_id["milesBetweenTracksByRoad"]["range"] != {"low": route["lowMiles"], "base": route["baseMiles"], "high": route["highMiles"]}:
        fail("Route-adjusted figure must mirror the summary")
    gallons = 3.785411784
    fuel_litres = [sum(float(row[key]) for row in fuel) for key in ("estimatedFuelLowLiters", "estimatedFuelBaseLiters", "estimatedFuelHighLiters")]
    band = by_id["fuelAllSessions"]["range"]
    if any(abs(band[key] - litres / gallons) > 1 for key, litres in zip(("low", "base", "high"), fuel_litres)):
        fail("All-session fuel figure must match the fuel table in US gallons")
    if not (by_id["fuelRaces"]["range"]["high"] < band["high"]):
        fail("Race fuel must be smaller than all-session fuel")
    if not (by_id["raceTimeTimed"]["value"] <= by_id["raceTimeAll"]["value"] <= by_id["sessionHours"]["value"]):
        fail("Time figures must nest: timed races <= all races <= all sessions")
    people = by_id["otherDriverRecords"]
    if not (people["range"]["low"] <= people["range"]["high"] < people["value"]):
        fail("People range must sit below the driver-record count")

    span = payload["span"]
    grid = payload["weeksGrid"]["weeks"]
    if len(grid) != span["weeks"] or payload["weeksGrid"]["weekCount"] != len(grid):
        fail("Weeks grid must hold one cell per ISO week of the span")
    previous = None
    for week in grid:
        monday = dt.date.fromisoformat(week["monday"])
        if monday.weekday() != 0 or f"{monday.isocalendar()[0]}-W{monday.isocalendar()[1]:02d}" != week["isoWeek"]:
            fail(f"Weeks grid cell {week['isoWeek']} has a wrong Monday")
        if previous and (monday - previous).days != 7:
            fail(f"Weeks grid skips a week before {week['isoWeek']}")
        previous = monday
    if sum(entry["raceCount"] for week in grid for entry in week["races"]) != len(bryce_races):
        fail("Weeks grid must place every race once")
    if sum(1 for week in grid if week["races"]) != by_id["raceWeeks"]["value"]:
        fail("Weeks grid filled cells must equal the race-week figure")
    if by_id["raceWeeks"]["denominator"]["value"] != len(grid) or by_id["eventDays"]["denominator"]["value"] != span["days"]:
        fail("Day and week figures must use the span as their denominator")

    legs = payload["travelLegs"]["legs"]
    if len(legs) != len(travel):
        fail("Travel legs must mirror travel_legs.csv one for one")
    running = 0.0
    for leg, row in zip(legs, travel):
        running += float(row["greatCircleMiles"])
        if leg["from"]["eventId"] != row["fromEventId"] or leg["to"]["eventId"] != row["toEventId"]:
            fail(f"Travel leg {leg['index']} is out of order")
        if not close(leg["runningMiles"], running, 0.051):
            fail(f"Travel leg {leg['index']} running total is wrong")
    if not close(payload["travelLegs"]["totalMiles"], summary["travel"]["greatCircleMinimum"]["miles"]):
        fail("Travel legs total must equal the great-circle minimum")

    life = payload["lifeShare"]
    if not life["birthDateProvenance"] or life["asOf"] != span["lastDay"]:
        fail("Share-of-life figures need the birth-date provenance and the span end")


def main() -> None:
    dataset = json.loads(DATASET.read_text())
    summary = json.loads(SUMMARY.read_text())
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    facts = {row["trackId"]: row for row in rows(FACTS)}
    race = rows(TABLES / "miles_raced.csv")
    ledger = rows(TABLES / "session_mileage_ledger.csv")
    excluded = rows(TABLES / "excluded_aggregate_sessions.csv")
    travel = rows(TABLES / "travel_legs.csv")
    breakdowns = rows(TABLES / "mileage_breakdowns.csv")
    travel_modes = rows(TABLES / "travel_mode_breakdown.csv")
    fuel = rows(TABLES / "estimated_fuel_burned.csv")
    tires = rows(TABLES / "estimated_unique_tires.csv")
    assumptions = rows(ASSUMPTIONS)

    if summary.get("schemaVersion") != "brycecast.careerLifeStats.v2":
        fail("Summary must use the v2 semantic schema")
    for path in [SUMMARY, *TABLES.glob("*.csv")]:
        text = path.read_text()
        if "9137.7" in text or "9,137.7" in text:
            fail(f"Shared-car odometer value leaked into {path.relative_to(ROOT)}")

    bryce_results = [row for row in dataset["results"] if row.get("driverId") == BRYCE]
    canonical_races = {
        row["sessionId"]: row for row in bryce_results
        if sessions[row["sessionId"]]["sessionType"] == "race"
    }
    if len(canonical_races) < 140:
        fail(f"Canonical career race history unexpectedly regressed to {len(canonical_races)} rows")
    if len(race) != len(canonical_races):
        fail(
            "Personally attributable race ledger must cover every canonical Bryce race, "
            f"expected {len(canonical_races)}, got {len(race)}"
        )
    if {row["sessionId"] for row in race} != set(canonical_races):
        fail("Race ledger session set must exactly match canonical Bryce race results")
    stint_laps = sum(int(row["lapCount"]) for row in rows(STINTS) if row["sessionId"] == DAYTONA)
    for row in race:
        canonical = canonical_races[row["sessionId"]]
        if row["sessionId"] != DAYTONA and canonical.get("lapsCompleted") is None:
            # A disqualification printed with no laps (GB3 2021 Silverstone Race 3) stays unknown.
            if row["confidenceClass"] != "unknown" or row["personalLaps"] != "" or row["personalMiles"] != "":
                fail(f"Race row without canonical laps must stay unknown for {row['sessionId']}")
            continue
        expected = stint_laps if row["sessionId"] == DAYTONA else int(canonical["lapsCompleted"])
        if int(row["personalLaps"]) != expected:
            fail(f"Incorrect personally attributable laps for {row['sessionId']}")
        if row["confidenceClass"] != "observed_exact" or row["metricGrain"] != "driver_physical_race":
            fail(f"Race row confidence/grain invalid for {row['sessionId']}")
        if not close(float(row["personalMiles"]), expected * float(row["lengthMi"]), 0.00051):
            fail(f"Race mileage formula invalid for {row['sessionId']}")
    daytona = next(row for row in race if row["sessionId"] == DAYTONA)
    if int(daytona["canonicalLaps"]) != 780 or int(daytona["personalLaps"]) != 142:
        fail("Daytona must preserve 780 shared-car laps while attributing exactly 142 to Bryce")
    for session_id in (
        "session_euroformula_2023_06-monza-race-2",
        "session_frp_f1600_2019_r2_06_race_3",
        "session_gb3_2022_1305",
        "session_gb3_2022_1376",
    ):
        if session_id not in {row["sessionId"] for row in race}:
            fail(f"Unclassified canonical race disappeared: {session_id}")

    ledger_ids = [row["sessionId"] for row in ledger]
    if len(ledger_ids) != len(set(ledger_ids)):
        fail("Physical-session ledger must have one row per physical session")
    for row in ledger:
        if row["confidenceClass"] not in CONFIDENCE:
            fail(f"Invalid confidence class on {row['sessionId']}")
        if row["metricGrain"] != "driver_physical_session":
            fail(f"Invalid metric grain on {row['sessionId']}")
        if row["confidenceClass"] == "unknown" and (row["lapsFloor"] or row["milesFloor"]):
            fail(f"Unknown session must not carry a false floor: {row['sessionId']}")
        if row["lapsFloor"] and not close(
            float(row["milesFloor"]), float(row["lapsFloor"]) * float(row["lengthMi"]), 0.00051
        ):
            fail(f"Session mileage formula invalid for {row['sessionId']}")
        event = events[row["eventId"]]
        session = sessions[row["sessionId"]]
        if event["seriesId"] == "series_frp_f1600" and session["sessionType"] in {"practice", "qualifying"}:
            canonical = next(item for item in bryce_results if item["sessionId"] == row["sessionId"])
            best_n = int(canonical.get("bestLapNumber") or 0)
            expected = "observed_lower_bound" if best_n > 0 else "unknown"
            if row["confidenceClass"] != expected or (best_n > 0 and int(row["lapsFloor"]) != best_n):
                fail(f"F1600 bestLapNumber semantics invalid for {row['sessionId']}")
        if event["seriesId"] == "series_froc" and session["sessionType"] != "race":
            if row["confidenceClass"] != "unknown":
                fail(f"FROC non-race laps must remain unknown: {row['sessionId']}")
        if event["seriesId"] == "series_euroformula_open" and session["sessionType"] == "qualifying":
            if row["lapField"] != "qualifyingResults.laps" or row["confidenceClass"] != "observed_exact":
                fail(f"Euroformula qualifying must use qualifyingResults.laps: {row['sessionId']}")

    combined = {
        row["sessionId"] for row in bryce_results
        if events[sessions[row["sessionId"]]["eventId"]]["seriesId"] == "series_indy_nxt"
        and sessions[row["sessionId"]]["sessionType"] == "qualifying"
        and sessions[row["sessionId"]]["sessionName"].lower().startswith("combined qual")
    }
    # GB3 repeats (ledger discrepancy 2): "Qualifying 2nd Fastest" re-ranks the
    # same qualifying session; "Thursday/Friday combined" adds up that day's
    # practice. Both are dropped like INDY NXT's combined qualifying.
    gb3_repeats = {
        row["sessionId"] for row in bryce_results
        if events[sessions[row["sessionId"]]["eventId"]]["seriesId"] == "series_gb3"
        and (
            (sessions[row["sessionId"]]["sessionType"] == "qualifying"
             and "2nd fastest" in (sessions[row["sessionId"]]["sessionName"] or "").lower())
            or (sessions[row["sessionId"]]["sessionType"] == "practice"
                and "combined" in (sessions[row["sessionId"]]["sessionName"] or "").lower())
        )
    }
    if (combined | gb3_repeats) & set(ledger_ids):
        fail("Aggregate or repeated classifications leaked into the physical-session ledger")
    if {row["sessionId"] for row in excluded} != combined | gb3_repeats:
        fail("Every INDY NXT combined qualifying and GB3 repeated classification must be excluded exactly once")
    indy_excluded = [row for row in excluded if row["sessionId"] in combined]
    gb3_excluded = [row for row in excluded if row["sessionId"] in gb3_repeats]
    if sum(int(row["lapsInSummary"]) for row in indy_excluded) != 9:
        fail("Excluded aggregate audit should expose the duplicate nine-lap Barber summary")
    if len(gb3_excluded) != 11 or sum(int(row["lapsInSummary"]) for row in gb3_excluded) != 198:
        fail("GB3 repeats must be the eleven classifications (198 laps) found in the November 16, 2026 ledger")

    # Layouts re-measured from the field's own lap speeds (ledger discrepancy 3).
    implied: dict[str, list[float]] = {}
    for result in dataset["results"]:
        raw = result.get("raw") if isinstance(result.get("raw"), dict) else {}
        speed = raw.get("fastestLapAvgSpeedMph")
        best = str(result.get("bestLapTime") or "")
        parts = best.split(":")
        if not speed or len(parts) != 3 or "." in parts[2]:
            continue
        seconds = int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 1000
        implied.setdefault(result["sessionId"], []).append(float(speed) * seconds / 3600)
    remeasured = [row for row in ledger if row.get("layoutEvidence")]
    for row in ledger:
        event = events[row["eventId"]]
        if row.get("layoutEvidence"):
            if row["trackId"] == event["trackId"]:
                fail(f"Re-measured session {row['sessionId']} must name the layout it moved to")
        elif row["trackId"] != event["trackId"]:
            fail(f"Session {row['sessionId']} left its event track without layout evidence")
        values = sorted(implied.get(row["sessionId"], []))
        if values and row["lapsFloor"]:
            median = values[len(values) // 2]
            if abs(median / float(row["lengthMi"]) - 1) > 0.03:
                fail(f"{row['sessionId']} lap speeds imply {median:.3f} mi but the ledger uses {row['lengthMi']} mi")
    brands_friday = {f"session_gb3_2022_{n}" for n in (1466, 1467, 1468, 1469)}
    if {row["sessionId"] for row in remeasured} != brands_friday or any(
        row["trackId"] != "track_brands_hatch_indy" for row in remeasured
    ):
        fail("The four Brands Hatch 2022 Friday sessions must sit on the 1.208-mile Indy layout, and only they")
    if sum(int(row["lapsFloor"]) for row in remeasured) != 56:
        fail("Re-measured Brands Hatch Friday sessions must carry their 56 laps")

    # Every Bryce session's track must have a venue_facts row.
    for result in bryce_results:
        track_id = events[sessions[result["sessionId"]]["eventId"]]["trackId"]
        if track_id not in facts:
            fail(f"Track {track_id} has no venue_facts row")

    exact = [row for row in ledger if row["confidenceClass"] == "observed_exact"]
    lower = [row for row in ledger if row["confidenceClass"] == "observed_lower_bound"]
    unknown = [row for row in ledger if row["confidenceClass"] == "unknown"]
    exact_laps = sum(int(row["lapsFloor"] or 0) for row in exact)
    lower_laps = sum(int(row["lapsFloor"] or 0) for row in lower)
    exact_miles = sum(float(row["milesFloor"] or 0) for row in exact)
    lower_miles = sum(float(row["milesFloor"] or 0) for row in lower)
    physical = summary["physicalSessionMileage"]
    if (exact_laps, lower_laps, exact_laps + lower_laps) != (
        physical["exact"]["laps"], physical["lowerBound"]["laps"], physical["floor"]["laps"]
    ):
        fail("Physical-session lap aggregates do not reconcile")
    if len(unknown) != physical["unknown"]["sessions"]:
        fail("Unknown physical-session coverage does not reconcile")
    if not close(exact_miles + lower_miles, physical["floor"]["miles"]):
        fail("Physical-session mileage floor does not reconcile")
    personal = summary["personalRaceMileage"]
    expected_race_laps = sum(int(row["personalLaps"]) for row in race if row["personalLaps"] != "")
    expected_race_miles = sum(float(row["personalMiles"]) for row in race if row["personalMiles"] != "")
    covered_races = [row for row in race if row["confidenceClass"] == "observed_exact"]
    if personal["raceRows"] != len(canonical_races) or personal["coveredRaceRows"] != len(covered_races):
        fail("Personally attributable race row counts do not reconcile to the canonical ledger")
    if personal["laps"] != expected_race_laps or not close(personal["miles"], expected_race_miles):
        fail("Personally attributable race totals do not reconcile to the session ledger")

    represented_events = {row["eventId"] for row in race}
    if len(travel) != len(represented_events) - 1:
        fail("Travel ledger must contain one leg between consecutive represented events")
    for row in travel:
        recomputed = haversine(
            float(row["fromLat"]), float(row["fromLon"]), float(row["toLat"]), float(row["toLon"])
        )
        if not close(recomputed, float(row["greatCircleMiles"]), 0.051):
            fail(f"Travel leg distance does not match its coordinates: {row['fromEventId']} to {row['toEventId']}")
        for side in ("from", "to"):
            fact = facts.get(row[f"{side}TrackId"])
            if not fact or not close(float(fact["lat"]), float(row[f"{side}Lat"]), 1e-6) or not close(
                float(fact["lon"]), float(row[f"{side}Lon"]), 1e-6
            ):
                fail(f"Travel leg {side} coordinates must come from venue_facts: {row[f'{side}EventId']}")
        if row["greatCircleConfidence"] != "observed_exact" or row["routeAdjustedConfidence"] != "modeled_range":
            fail("Travel confidence classes must remain explicit")
        if row["actualTravelConfidence"] != "unknown":
            fail("Actual travel must remain blocked/unknown")
        distance = float(row["greatCircleMiles"])
        for suffix in ("Low", "Base", "High"):
            factor = float(row[f"routeFactor{suffix}"])
            if not close(float(row[f"routeAdjusted{suffix}Miles"]), distance * factor, 0.11):
                fail(f"Route proxy formula invalid for {row['fromEventId']} to {row['toEventId']}")
    expected_travel_miles = sum(float(row["greatCircleMiles"]) for row in travel)
    if not close(summary["travel"]["greatCircleMinimum"]["miles"], expected_travel_miles):
        fail("Great-circle minimum displacement does not reconcile to the travel ledger")
    if summary["travel"]["actualTravel"]["blockedBy"] != ["seasonBase", "returnHomeFrequency"]:
        fail("Actual travel blockers must remain explicit")

    dimensions = {row["dimensionType"] for row in breakdowns}
    if dimensions != {"season", "series", "session_type", "venue", "country", "confidence_class"}:
        fail(f"Visualization breakdown dimensions incomplete: {sorted(dimensions)}")
    if {row["travelModeProxy"] for row in travel_modes} != {row["travelModeProxy"] for row in travel}:
        fail("Travel-mode proxy breakdown is incomplete")

    expected_resource_keys = {(row["seriesId"], int(row["seasonYear"])) for row in ledger}
    fuel_keys = {(row["seriesId"], int(row["seasonYear"])) for row in fuel}
    tire_keys = {(row["seriesId"], int(row["seasonYear"])) for row in tires}
    if fuel_keys != expected_resource_keys or tire_keys != expected_resource_keys:
        fail("Fuel and tire artifacts must carry every represented series/year model row exactly once")
    assumption_keys = set()
    for row in assumptions:
        key = (row["seriesId"], int(row["seasonStart"]), int(row["seasonEnd"]))
        if key in assumption_keys:
            fail(f"Duplicate resource assumption {key}")
        assumption_keys.add(key)
        fuel_band = [float(row[name]) for name in ("fuelLowLPer100Km", "fuelBaseLPer100Km", "fuelHighLPer100Km")]
        tire_life = [int(row[name]) for name in ("tireLifeLowLaps", "tireLifeBaseLaps", "tireLifeHighLaps")]
        if fuel_band != sorted(fuel_band) or tire_life != sorted(tire_life):
            fail(f"Resource assumption bands must be ordered for {key}")
        if not row["sourceUrl"].startswith("https://"):
            fail(f"Resource assumption needs a source URL for {key}")
    for row in fuel:
        values = [float(row[name]) for name in ("estimatedFuelLowLiters", "estimatedFuelBaseLiters", "estimatedFuelHighLiters")]
        if values != sorted(values) or row["confidenceClass"] != "modeled_range":
            fail(f"Fuel model range invalid for {row['seriesId']} {row['seasonYear']}")
    for row in tires:
        values = [int(row[name]) for name in ("estimatedUniqueTiresLow", "estimatedUniqueTiresBase", "estimatedUniqueTiresHigh")]
        if values != sorted(values) or row["confidenceClass"] != "modeled_range":
            fail(f"Tire model range invalid for {row['seriesId']} {row['seasonYear']}")

    validate_career_figures(dataset, summary, race, ledger, travel, fuel)

    source_paths = {row["path"] for row in summary["sourceRefs"]}
    required = {
        "analysis/career-life-stats/RESEARCH.md",
        "analysis/career-life-stats/data/resource_model_assumptions.csv",
        "analysis/career-life-stats/output/tables/session_mileage_ledger.csv",
        "analysis/career-life-stats/output/tables/estimated_fuel_burned.csv",
        "analysis/career-life-stats/output/tables/estimated_unique_tires.csv",
        "analysis/career-life-stats/output/career_figures.json",
        "analysis/career-life-stats/data/driver_record_variants.csv",
    }
    if not required <= source_paths:
        fail(f"Summary lineage is incomplete: {sorted(required - source_paths)}")
    if not any("Private tests" in gap for gap in summary["coverageGaps"]):
        fail("Private-test coverage gap must remain explicit")

    print(
        "career life-stats validation passed: "
        f"{len(race)} race rows, {expected_race_laps} personal race laps, {exact_laps + lower_laps} physical-session floor laps, "
        f"{len(unknown)} unknown sessions, {len(excluded)} repeated classifications excluded, {len(remeasured)} sessions re-measured, "
        f"{len(json.loads(FIGURES.read_text())['figures'])} career figures checked"
    )


if __name__ == "__main__":
    main()
