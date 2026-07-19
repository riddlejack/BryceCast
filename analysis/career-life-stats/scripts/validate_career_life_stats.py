#!/usr/bin/env python3
"""Validate Career Life Stats semantics independently of the builder."""

from __future__ import annotations

import csv
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
    if len(canonical_races) != 146 or len(race) != 146:
        fail(f"Personally attributable race ledger must cover all 146 rows, got {len(race)}")
    if {row["sessionId"] for row in race} != set(canonical_races):
        fail("Race ledger session set must exactly match canonical Bryce race results")
    stint_laps = sum(int(row["lapCount"]) for row in rows(STINTS) if row["sessionId"] == DAYTONA)
    for row in race:
        canonical = canonical_races[row["sessionId"]]
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
    if combined & set(ledger_ids) or {row["sessionId"] for row in excluded} != combined:
        fail("Every INDY NXT combined qualifying summary must be excluded exactly once")
    if sum(int(row["lapsInSummary"]) for row in excluded) != 9:
        fail("Excluded aggregate audit should expose the duplicate nine-lap Barber summary")

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
    if personal["laps"] != 3084 or not close(personal["miles"], 7010.9):
        fail("Personally attributable race audit totals changed unexpectedly")

    represented_events = {row["eventId"] for row in race}
    if len(travel) != len(represented_events) - 1:
        fail("Travel ledger must contain one leg between consecutive represented events")
    for row in travel:
        if row["greatCircleConfidence"] != "observed_exact" or row["routeAdjustedConfidence"] != "modeled_range":
            fail("Travel confidence classes must remain explicit")
        if row["actualTravelConfidence"] != "unknown":
            fail("Actual travel must remain blocked/unknown")
        distance = float(row["greatCircleMiles"])
        for suffix in ("Low", "Base", "High"):
            factor = float(row[f"routeFactor{suffix}"])
            if not close(float(row[f"routeAdjusted{suffix}Miles"]), distance * factor, 0.11):
                fail(f"Route proxy formula invalid for {row['fromEventId']} to {row['toEventId']}")
    if not close(sum(float(row["greatCircleMiles"]) for row in travel), 55029.6):
        fail("Great-circle minimum displacement must preserve the audited 55,029.6 miles")
    if summary["travel"]["actualTravel"]["blockedBy"] != ["seasonBase", "returnHomeFrequency"]:
        fail("Actual travel blockers must remain explicit")

    dimensions = {row["dimensionType"] for row in breakdowns}
    if dimensions != {"season", "series", "session_type", "venue", "country", "confidence_class"}:
        fail(f"Visualization breakdown dimensions incomplete: {sorted(dimensions)}")
    if {row["travelModeProxy"] for row in travel_modes} != {row["travelModeProxy"] for row in travel}:
        fail("Travel-mode proxy breakdown is incomplete")

    if len(fuel) != len(tires) or len(fuel) != 10:
        fail("Fuel and tire artifacts must carry every represented series/year model row")
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

    source_paths = {row["path"] for row in summary["sourceRefs"]}
    required = {
        "analysis/career-life-stats/RESEARCH.md",
        "analysis/career-life-stats/data/resource_model_assumptions.csv",
        "analysis/career-life-stats/output/tables/session_mileage_ledger.csv",
        "analysis/career-life-stats/output/tables/estimated_fuel_burned.csv",
        "analysis/career-life-stats/output/tables/estimated_unique_tires.csv",
    }
    if not required <= source_paths:
        fail(f"Summary lineage is incomplete: {sorted(required - source_paths)}")
    if not any("Private tests" in gap for gap in summary["coverageGaps"]):
        fail("Private-test coverage gap must remain explicit")

    print(
        "career life-stats validation passed: "
        f"146 race rows, 3084 personal race laps, {exact_laps + lower_laps} physical-session floor laps, "
        f"{len(unknown)} unknown sessions, {len(excluded)} aggregate qualifying summaries excluded"
    )


if __name__ == "__main__":
    main()
