#!/usr/bin/env python3
"""Build source-grained career mileage, travel, fuel, and tire artifacts."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from collections import defaultdict
from itertools import combinations
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/career-life-stats"
DATASET_PATH = ROOT / "data/career/career.dataset.json"
VENUE_FACTS_PATH = LANE / "data/venue_facts.csv"
ASSUMPTIONS_PATH = LANE / "data/resource_model_assumptions.csv"
STINT_PATH = ROOT / "analysis/imsa-daytona-stint-class-pace/output/bryce_imsa_stint_context.csv"
RESEARCH_PATH = LANE / "RESEARCH.md"
OUTPUT = LANE / "output"
TABLES = OUTPUT / "tables"

BRYCE_ID = "driver_bryce_aron"
DAYTONA_SESSION = "session_imsa_2025_daytona_rolex_24_race"
EARTH_RADIUS_MI = 3958.7613
SESSION_TYPES = {"race", "practice", "qualifying", "heat", "test"}
CONFIDENCE = {"observed_exact", "observed_lower_bound", "modeled_range", "unknown"}
DRIVE_MAX_GREAT_CIRCLE_MI = 750.0
ROUTE_FACTORS = {
    "same_venue": (1.0, 1.0, 1.0),
    "drive_proxy": (1.12, 1.18, 1.28),
    "flight_proxy": (1.03, 1.08, 1.15),
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def haversine_miles(left: dict[str, Any], right: dict[str, Any]) -> float:
    lat1, lon1 = math.radians(float(left["lat"])), math.radians(float(left["lon"]))
    lat2, lon2 = math.radians(float(right["lat"])), math.radians(float(right["lon"]))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_MI * math.asin(min(1.0, math.sqrt(value)))


def source_ref(row: dict[str, Any]) -> str:
    refs = row.get("provenanceRefs") or []
    return ";".join(refs)


def venue_source_rows(facts: list[dict[str, str]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for fact in facts:
        venue = grouped.setdefault(
            fact["trackName"],
            {"trackName": fact["trackName"], "trackIds": [], "lengthSources": [], "coordsSources": []},
        )
        venue["trackIds"].append(fact["trackId"])
        for source_key, target_key in (("lengthSource", "lengthSources"), ("coordsSource", "coordsSources")):
            if fact[source_key] not in venue[target_key]:
                venue[target_key].append(fact[source_key])
    return [grouped[name] for name in sorted(grouped)]


def model_assumption(assumptions: list[dict[str, str]], series_id: str, year: int) -> dict[str, str]:
    matches = [
        row for row in assumptions
        if row["seriesId"] == series_id and int(row["seasonStart"]) <= year <= int(row["seasonEnd"])
    ]
    if len(matches) != 1:
        raise ValueError(f"Expected one resource assumption for {series_id} {year}, found {len(matches)}")
    return matches[0]


def aggregate(rows: list[dict[str, Any]], key: str, value: str) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        group = (str(row[key]), row["confidenceClass"])
        item = grouped.setdefault(
            group,
            {
                "dimensionType": value,
                "dimensionValue": str(row[key]),
                "confidenceClass": row["confidenceClass"],
                "sessionCount": 0,
                "lapsFloor": 0,
                "milesFloor": 0.0,
            },
        )
        item["sessionCount"] += 1
        item["lapsFloor"] += int(row["lapsFloor"] or 0)
        item["milesFloor"] += float(row["milesFloor"] or 0)
    return [
        {**item, "milesFloor": f"{item['milesFloor']:.3f}"}
        for _, item in sorted(grouped.items())
    ]


def main() -> None:
    dataset = json.loads(DATASET_PATH.read_text())
    facts = read_csv(VENUE_FACTS_PATH)
    assumptions = read_csv(ASSUMPTIONS_PATH)
    stint_rows = read_csv(STINT_PATH)
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    series = {row["id"]: row for row in dataset["series"]}
    facts_by_track = {row["trackId"]: row for row in facts}
    qualifying = {
        row["sessionId"]: row for row in dataset.get("qualifyingResults", [])
        if row.get("driverId") == BRYCE_ID
    }
    bryce_results = [row for row in dataset["results"] if row.get("driverId") == BRYCE_ID]

    daytona_laps = sum(int(row["lapCount"]) for row in stint_rows if row["sessionId"] == DAYTONA_SESSION)
    if daytona_laps <= 0:
        raise ValueError("Daytona driver-stint table must supply positive Bryce-attributed laps")

    race_rows: list[dict[str, Any]] = []
    race_laps_by_session: dict[str, int] = {}
    race_results = [row for row in bryce_results if sessions[row["sessionId"]]["sessionType"] == "race"]
    race_results.sort(
        key=lambda row: (
            events[sessions[row["sessionId"]]["eventId"]].get("eventStartDate") or "",
            sessions[row["sessionId"]].get("actualStart") or sessions[row["sessionId"]].get("scheduledStart") or "",
            row["sessionId"],
        )
    )
    represented_events: dict[str, dict[str, Any]] = {}
    for result in race_results:
        session = sessions[result["sessionId"]]
        event = events[session["eventId"]]
        fact = facts_by_track[event["trackId"]]
        canonical_laps = result.get("lapsCompleted")
        if canonical_laps is None:
            confidence, laps, method = "unknown", None, "canonical race result has no lapsCompleted"
        elif result["sessionId"] == DAYTONA_SESSION:
            confidence, laps, method = (
                "observed_exact",
                daytona_laps,
                "sum of Bryce driver-stint lapCount; shared-car canonical laps excluded",
            )
        else:
            confidence, laps, method = "observed_exact", int(canonical_laps), "canonical driver result lapsCompleted"
        length_mi = float(fact["lengthMi"])
        miles = laps * length_mi if laps is not None else None
        race_laps_by_session[result["sessionId"]] = laps or 0
        race_rows.append(
            {
                "sessionId": result["sessionId"],
                "eventId": event["id"],
                "eventStartDate": event.get("eventStartDate") or "",
                "seriesId": event["seriesId"],
                "seasonYear": event["seasonYear"],
                "trackId": fact["trackId"],
                "trackName": fact["trackName"],
                "country": fact["country"],
                "status": result.get("status") or "unknown",
                "canonicalLaps": canonical_laps if canonical_laps is not None else "",
                "personalLaps": laps if laps is not None else "",
                "lengthMi": fact["lengthMi"],
                "personalMiles": f"{miles:.3f}" if miles is not None else "",
                "confidenceClass": confidence,
                "sourceGrain": result.get("resultGrain") or "driver_result",
                "metricGrain": "driver_physical_race",
                "attributionMethod": method,
                "sourceRef": rel(STINT_PATH) if result["sessionId"] == DAYTONA_SESSION else source_ref(result),
            }
        )
        represented_events[event["id"]] = {
            "eventId": event["id"],
            "eventStartDate": event.get("eventStartDate") or "",
            "trackId": fact["trackId"],
            "trackName": fact["trackName"],
            "country": fact["country"],
            "lat": float(fact["lat"]),
            "lon": float(fact["lon"]),
        }

    ledger_rows: list[dict[str, Any]] = []
    excluded_rows: list[dict[str, Any]] = []
    for result in bryce_results:
        session = sessions[result["sessionId"]]
        if session["sessionType"] not in SESSION_TYPES:
            continue
        event = events[session["eventId"]]
        fact = facts_by_track[event["trackId"]]
        name = session.get("sessionName") or ""
        if (
            event["seriesId"] == "series_indy_nxt"
            and session["sessionType"] == "qualifying"
            and name.lower().startswith("combined qual")
        ):
            excluded_rows.append(
                {
                    "sessionId": session["id"],
                    "eventId": event["id"],
                    "sessionName": name,
                    "lapsInSummary": result.get("lapsCompleted") or 0,
                    "reason": "aggregate classification; not a second physical qualifying session",
                    "sourceRef": source_ref(result),
                }
            )
            continue

        confidence = "unknown"
        laps: int | None = None
        source_grain = result.get("resultGrain") or "driver_result"
        lap_field = ""
        note = "source does not expose completed laps"
        if session["sessionType"] == "race":
            race = next(row for row in race_rows if row["sessionId"] == session["id"])
            confidence = race["confidenceClass"]
            laps = int(race["personalLaps"]) if race["personalLaps"] != "" else None
            source_grain = race["sourceGrain"]
            lap_field = "personalLaps"
            note = race["attributionMethod"]
        elif event["seriesId"] == "series_euroformula_open" and session["sessionType"] == "qualifying":
            qrow = qualifying.get(session["id"])
            if qrow and qrow.get("laps") is not None:
                confidence, laps = "observed_exact", int(qrow["laps"])
                source_grain, lap_field = "driver_qualifying_result", "qualifyingResults.laps"
                note = "official qualifying classification lap count"
        elif event["seriesId"] == "series_frp_f1600" and session["sessionType"] in {"practice", "qualifying"}:
            best_lap_number = int(result.get("bestLapNumber") or 0)
            if best_lap_number > 0:
                confidence, laps = "observed_lower_bound", best_lap_number
                lap_field = "bestLapNumber"
                note = "best lap occurred on lap N; N is a lower bound, never a session total"
            else:
                note = "bestLapNumber is zero/absent and does not prove zero completed laps"
        elif event["seriesId"] == "series_froc" and session["sessionType"] != "race":
            note = "FROC HTML classification omits total completed laps"
        elif result.get("lapsCompleted") is not None:
            confidence, laps = "observed_exact", int(result["lapsCompleted"])
            lap_field = "lapsCompleted"
            note = "canonical physical-session driver result lap count"

        miles = laps * float(fact["lengthMi"]) if laps is not None else None
        ledger_rows.append(
            {
                "sessionId": session["id"],
                "eventId": event["id"],
                "eventStartDate": event.get("eventStartDate") or "",
                "seriesId": event["seriesId"],
                "seriesName": series[event["seriesId"]]["name"],
                "seasonYear": event["seasonYear"],
                "sessionType": session["sessionType"],
                "sessionName": name,
                "trackId": fact["trackId"],
                "trackName": fact["trackName"],
                "country": fact["country"],
                "lapsFloor": laps if laps is not None else "",
                "lengthMi": fact["lengthMi"],
                "milesFloor": f"{miles:.3f}" if miles is not None else "",
                "confidenceClass": confidence,
                "sourceGrain": source_grain,
                "metricGrain": "driver_physical_session",
                "lapField": lap_field,
                "semanticNote": note,
                "sourceRef": rel(STINT_PATH) if session["id"] == DAYTONA_SESSION else source_ref(result),
            }
        )

    # Euroformula qualifying lives only in qualifyingResults at driver grain;
    # it must not disappear merely because there is no parallel generic result.
    represented_session_ids = {row["sessionId"] for row in ledger_rows}
    for session_id, qrow in qualifying.items():
        session = sessions[session_id]
        event = events[session["eventId"]]
        if (
            event["seriesId"] != "series_euroformula_open"
            or session["sessionType"] != "qualifying"
            or session_id in represented_session_ids
        ):
            continue
        fact = facts_by_track[event["trackId"]]
        laps = int(qrow["laps"])
        ledger_rows.append(
            {
                "sessionId": session_id,
                "eventId": event["id"],
                "eventStartDate": event.get("eventStartDate") or "",
                "seriesId": event["seriesId"],
                "seriesName": series[event["seriesId"]]["name"],
                "seasonYear": event["seasonYear"],
                "sessionType": "qualifying",
                "sessionName": session.get("sessionName") or "Qualifying",
                "trackId": fact["trackId"],
                "trackName": fact["trackName"],
                "country": fact["country"],
                "lapsFloor": laps,
                "lengthMi": fact["lengthMi"],
                "milesFloor": f"{laps * float(fact['lengthMi']):.3f}",
                "confidenceClass": "observed_exact",
                "sourceGrain": "driver_qualifying_result",
                "metricGrain": "driver_physical_session",
                "lapField": "qualifyingResults.laps",
                "semanticNote": "official qualifying classification lap count",
                "sourceRef": source_ref(qrow),
            }
        )

    ledger_rows.sort(key=lambda row: (row["eventStartDate"], row["sessionId"]))

    ordered_events = sorted(represented_events.values(), key=lambda row: (row["eventStartDate"], row["eventId"]))
    travel_rows: list[dict[str, Any]] = []
    for left, right in zip(ordered_events, ordered_events[1:]):
        distance = haversine_miles(left, right)
        if distance == 0:
            mode = "same_venue"
        elif left["country"] == right["country"] and distance <= DRIVE_MAX_GREAT_CIRCLE_MI:
            mode = "drive_proxy"
        else:
            mode = "flight_proxy"
        low_factor, base_factor, high_factor = ROUTE_FACTORS[mode]
        travel_rows.append(
            {
                "fromEventId": left["eventId"],
                "fromEventStartDate": left["eventStartDate"],
                "fromTrackName": left["trackName"],
                "fromCountry": left["country"],
                "toEventId": right["eventId"],
                "toEventStartDate": right["eventStartDate"],
                "toTrackName": right["trackName"],
                "toCountry": right["country"],
                "greatCircleMiles": f"{distance:.1f}",
                "greatCircleConfidence": "observed_exact",
                "travelModeProxy": mode,
                "routeFactorLow": low_factor,
                "routeFactorBase": base_factor,
                "routeFactorHigh": high_factor,
                "routeAdjustedLowMiles": f"{distance * low_factor:.1f}",
                "routeAdjustedBaseMiles": f"{distance * base_factor:.1f}",
                "routeAdjustedHighMiles": f"{distance * high_factor:.1f}",
                "routeAdjustedConfidence": "modeled_range",
                "actualTravelConfidence": "unknown",
            }
        )

    resource_groups: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for row in ledger_rows:
        resource_groups[(row["seriesId"], int(row["seasonYear"]))].append(row)
    fuel_rows: list[dict[str, Any]] = []
    tire_rows: list[dict[str, Any]] = []
    for (series_id, year), rows in sorted(resource_groups.items()):
        assumption = model_assumption(assumptions, series_id, year)
        miles_floor = sum(float(row["milesFloor"] or 0) for row in rows)
        km_floor = miles_floor * 1.609344
        rates = [float(assumption[key]) for key in ("fuelLowLPer100Km", "fuelBaseLPer100Km", "fuelHighLPer100Km")]
        fuel_rows.append(
            {
                "seriesId": series_id,
                "seriesName": series[series_id]["name"],
                "seasonYear": year,
                "chassis": assumption["chassis"],
                "observedMilesFloor": f"{miles_floor:.3f}",
                "estimatedFuelLowLiters": f"{km_floor * rates[0] / 100:.1f}",
                "estimatedFuelBaseLiters": f"{km_floor * rates[1] / 100:.1f}",
                "estimatedFuelHighLiters": f"{km_floor * rates[2] / 100:.1f}",
                "confidenceClass": "modeled_range",
                "formula": "milesFloor*1.609344*fuelLPer100Km/100",
                "sourceUrl": assumption["sourceUrl"],
                "sensitivityDrivers": "lap coverage; track length; caution running; engine map; fuel-rate band",
            }
        )
        life_low, life_base, life_high = [
            int(assumption[key]) for key in ("tireLifeLowLaps", "tireLifeBaseLaps", "tireLifeHighLaps")
        ]
        lapped = [row for row in rows if row["lapsFloor"] != "" and int(row["lapsFloor"]) > 0]
        unknown_sessions = sum(1 for row in rows if row["confidenceClass"] == "unknown")

        def tires(life: int) -> int:
            return sum(math.ceil(int(row["lapsFloor"]) / life) * 4 for row in lapped)

        tire_rows.append(
            {
                "seriesId": series_id,
                "seriesName": series[series_id]["name"],
                "seasonYear": year,
                "chassis": assumption["chassis"],
                "tireSupplier": assumption["tireSupplier"],
                "observedSessionsWithLaps": len(lapped),
                "unknownLapSessionsExcluded": unknown_sessions,
                "estimatedUniqueTiresLow": tires(life_high),
                "estimatedUniqueTiresBase": tires(life_base),
                "estimatedUniqueTiresHigh": tires(life_low),
                "confidenceClass": "modeled_range",
                "formula": "sum_per_session(ceil(lapsFloor/assumedLifeLaps)*4)",
                "sourceUrl": assumption["sourceUrl"],
                "sensitivityDrivers": "unknown sessions; reused sets; wet tires; damage; allocation; tire-life band",
            }
        )

    breakdown_rows: list[dict[str, Any]] = []
    for key, label in (
        ("seasonYear", "season"),
        ("seriesId", "series"),
        ("sessionType", "session_type"),
        ("trackName", "venue"),
        ("country", "country"),
        ("confidenceClass", "confidence_class"),
    ):
        breakdown_rows.extend(aggregate(ledger_rows, key, label))

    travel_mode_rows = []
    for mode in ROUTE_FACTORS:
        rows = [row for row in travel_rows if row["travelModeProxy"] == mode]
        if not rows:
            continue
        travel_mode_rows.append(
            {
                "travelModeProxy": mode,
                "legCount": len(rows),
                "greatCircleMiles": f"{sum(float(row['greatCircleMiles']) for row in rows):.1f}",
                "routeAdjustedLowMiles": f"{sum(float(row['routeAdjustedLowMiles']) for row in rows):.1f}",
                "routeAdjustedBaseMiles": f"{sum(float(row['routeAdjustedBaseMiles']) for row in rows):.1f}",
                "routeAdjustedHighMiles": f"{sum(float(row['routeAdjustedHighMiles']) for row in rows):.1f}",
                "confidenceClass": "modeled_range" if mode != "same_venue" else "observed_exact",
            }
        )

    race_laps = sum(int(row["personalLaps"] or 0) for row in race_rows)
    race_miles = sum(float(row["personalMiles"] or 0) for row in race_rows)
    exact_rows = [row for row in ledger_rows if row["confidenceClass"] == "observed_exact"]
    lower_rows = [row for row in ledger_rows if row["confidenceClass"] == "observed_lower_bound"]
    unknown_rows = [row for row in ledger_rows if row["confidenceClass"] == "unknown"]
    exact_laps = sum(int(row["lapsFloor"] or 0) for row in exact_rows)
    lower_laps = sum(int(row["lapsFloor"] or 0) for row in lower_rows)
    exact_miles = sum(float(row["milesFloor"] or 0) for row in exact_rows)
    lower_miles = sum(float(row["milesFloor"] or 0) for row in lower_rows)
    great_circle = sum(float(row["greatCircleMiles"]) for row in travel_rows)
    route_low = sum(float(row["routeAdjustedLowMiles"]) for row in travel_rows)
    route_base = sum(float(row["routeAdjustedBaseMiles"]) for row in travel_rows)
    route_high = sum(float(row["routeAdjustedHighMiles"]) for row in travel_rows)

    venues: dict[str, dict[str, Any]] = {}
    for event in represented_events.values():
        venues.setdefault(event["trackName"], event)
    farthest = None
    for left, right in combinations(venues.values(), 2):
        miles = haversine_miles(left, right)
        if farthest is None or miles > farthest["miles"]:
            farthest = {"fromTrackName": left["trackName"], "toTrackName": right["trackName"], "miles": round(miles, 1)}
    longest = max(travel_rows, key=lambda row: float(row["greatCircleMiles"]), default=None)

    files = {
        "miles_raced.csv": (race_rows, list(race_rows[0].keys())),
        "session_mileage_ledger.csv": (ledger_rows, list(ledger_rows[0].keys())),
        "excluded_aggregate_sessions.csv": (excluded_rows, list(excluded_rows[0].keys())),
        "travel_legs.csv": (travel_rows, list(travel_rows[0].keys())),
        "mileage_breakdowns.csv": (breakdown_rows, list(breakdown_rows[0].keys())),
        "travel_mode_breakdown.csv": (travel_mode_rows, list(travel_mode_rows[0].keys())),
        "estimated_fuel_burned.csv": (fuel_rows, list(fuel_rows[0].keys())),
        "estimated_unique_tires.csv": (tire_rows, list(tire_rows[0].keys())),
    }
    for name, (rows, fields) in files.items():
        write_csv(TABLES / name, rows, fields)

    source_paths = [DATASET_PATH, VENUE_FACTS_PATH, STINT_PATH, ASSUMPTIONS_PATH, RESEARCH_PATH]
    source_refs = [
        {"path": rel(path), "sha256": sha256(path), "note": note}
        for path, note in zip(
            source_paths,
            (
                "Canonical source facts at result, qualifying-result, session, event, and venue grain.",
                "Curated track lengths and coordinates with named sources.",
                "Al Kamel-derived Bryce driver stints used for Daytona attribution.",
                "Explicit low/base/high fuel and tire model assumptions with source URLs.",
                "Source-grain, metric-grain, confidence, travel, and resource-model contracts.",
            ),
        )
    ]
    source_refs.extend(
        {
            "path": rel(TABLES / name),
            "sha256": sha256(TABLES / name),
            "note": "Deterministic generated career life-stats artifact.",
        }
        for name in files
    )

    summary = {
        "schemaVersion": "brycecast.careerLifeStats.v2",
        "generatedAt": dataset.get("updatedAt"),
        "personalRaceMileage": {
            "raceRows": len(race_rows),
            "coveredRaceRows": len([row for row in race_rows if row["confidenceClass"] == "observed_exact"]),
            "laps": race_laps,
            "miles": round(race_miles, 1),
            "confidenceClass": "observed_exact",
            "metricGrain": "driver_physical_race",
        },
        "physicalSessionMileage": {
            "sessionRows": len(ledger_rows),
            "exact": {"sessions": len(exact_rows), "laps": exact_laps, "miles": round(exact_miles, 1), "confidenceClass": "observed_exact"},
            "lowerBound": {"sessions": len(lower_rows), "laps": lower_laps, "miles": round(lower_miles, 1), "confidenceClass": "observed_lower_bound"},
            "unknown": {"sessions": len(unknown_rows), "confidenceClass": "unknown"},
            "floor": {"laps": exact_laps + lower_laps, "miles": round(exact_miles + lower_miles, 1), "confidenceClass": "observed_lower_bound"},
            "excludedAggregateSessions": len(excluded_rows),
            "metricGrain": "driver_physical_session",
        },
        "travel": {
            "greatCircleMinimum": {
                "miles": round(great_circle, 1),
                "label": "minimum venue-to-venue displacement between consecutive race events",
                "confidenceClass": "observed_exact",
            },
            "routeAdjustedMinimum": {
                "lowMiles": round(route_low, 1),
                "baseMiles": round(route_base, 1),
                "highMiles": round(route_high, 1),
                "confidenceClass": "modeled_range",
                "assumptions": {
                    "driveProxy": "same-country and <=750 great-circle miles; factor 1.12/1.18/1.28",
                    "flightProxy": "all other non-zero legs; factor 1.03/1.08/1.15",
                },
            },
            "actualTravel": {
                "confidenceClass": "unknown",
                "blockedBy": ["seasonBase", "returnHomeFrequency"],
            },
        },
        "countries": len({venue["country"] for venue in venues.values()}),
        "venues": len(venues),
        "longestLeg": (
            {"fromTrackName": longest["fromTrackName"], "toTrackName": longest["toTrackName"], "miles": float(longest["greatCircleMiles"])}
            if longest else None
        ),
        "farthestVenuePair": farthest,
        "coverageGaps": [
            "FROC non-race classifications do not expose completed laps.",
            "F1600 best-lap numbers are lower bounds, not session totals.",
            "Private tests beyond imported official session results are not covered.",
            "Actual travel is blocked pending seasonBase and returnHomeFrequency.",
        ],
        "resourceModels": {
            "fuel": {"confidenceClass": "modeled_range", "rows": len(fuel_rows), "table": rel(TABLES / "estimated_fuel_burned.csv")},
            "tires": {"confidenceClass": "modeled_range", "rows": len(tire_rows), "table": rel(TABLES / "estimated_unique_tires.csv")},
        },
        "venueSources": venue_source_rows(facts),
        "sourceRefs": source_refs,
    }
    write_json(OUTPUT / "summary.json", summary)
    print(
        "career life-stats build passed: "
        f"{race_laps} personal race laps / {race_miles:.1f} miles; "
        f"physical floor {exact_laps + lower_laps} laps / {exact_miles + lower_miles:.1f} miles; "
        f"travel minimum {great_circle:.1f} miles"
    )


if __name__ == "__main__":
    main()
