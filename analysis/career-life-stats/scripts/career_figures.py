"""Career figures for the Career page: each a value, a class and a plain "how".

Called by build_career_life_stats.py after the corrected session ledger, race
ledger and travel legs exist. Everything here is computed from the canonical
dataset and those ledgers; the only hand-kept inputs are the birth date below
and data/driver_record_variants.csv (the driver records that look like one
person entered twice).

Classes on the page:
  counted        exact from the data
  lower_bound    the true figure is at least this
  modelled_range an estimate built on stated assumptions
"""

from __future__ import annotations

import csv
import datetime as dt
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# Per Jack, November 14, 2026; year to confirm. Used only for the
# "share of his life" figures. Not in the canonical dataset (dateOfBirth is null).
BIRTH_DATE = dt.date(2003, 9, 30)
BIRTH_DATE_PROVENANCE = "per Jack, November 14, 2026; year to confirm"

LITRES_PER_US_GALLON = 3.785411784
EQUATOR_MILES = 24901.0
DAYTONA_CORNERS_FALLBACK = None  # Daytona's corner count comes from the dataset track row.


def parse_duration(value: Any) -> float | None:
    """Seconds from the dataset's time formats; None when there is no time.

    MM:SS.sss and M:SS.sss (Euroformula, Formula Ford, GB3 2021), HH:MM:SS.ssss
    (INDY NXT), MM:SS:mmm with milliseconds after a colon (GB3 2022),
    H:MM:SS.sss (Daytona car) and SS.sss. A cell holding two times keeps the first.
    """
    if value is None:
        return None
    text = str(value).strip()
    if not text or not re.match(r"^\d", text):
        return None
    text = text.split()[0]
    parts = text.split(":")
    try:
        if len(parts) == 1:
            return float(parts[0])
        if len(parts) == 2:
            return int(parts[0]) * 60 + float(parts[1])
        if len(parts) == 3:
            if "." in parts[2]:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
            if len(parts[2]) == 3:
                return int(parts[0]) * 60 + int(parts[1]) + int(parts[2]) / 1000
    except ValueError:
        return None
    raise ValueError(f"Unrecognised time format: {value!r}")


def parse_date(value: Any) -> dt.date | None:
    if not value:
        return None
    text = str(value)
    match = re.match(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        return dt.date(*map(int, match.groups()))
    match = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", text)
    if match:
        return dt.date(int(match[3]), int(match[1]), int(match[2]))
    raise ValueError(f"Unrecognised date: {value!r}")


def iso_week_id(day: dt.date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def monday_of(day: dt.date) -> dt.date:
    return day - dt.timedelta(days=day.weekday())


def hm(seconds: float) -> str:
    minutes = int(round(seconds / 60))
    return f"{minutes // 60} h {minutes % 60} min"


def fmt_int(value: int) -> str:
    return f"{value:,}"


def fmt_1(value: float) -> str:
    return f"{value:,.1f}"


def pct(part: float, whole: float) -> float:
    return round(100 * part / whole, 1)


def years_between(born: dt.date, day: dt.date) -> int:
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


def figure(
    fid: str,
    label: str,
    cls: str,
    unit: str,
    display: str,
    how: str,
    *,
    value: float | int | None = None,
    low: float | None = None,
    base: float | None = None,
    high: float | None = None,
    denominator: tuple[float | int, str] | None = None,
    parts: list[tuple[str, float | int]] | None = None,
    scope: str = "career",
    caveat: str | None = None,
) -> dict[str, Any]:
    if cls not in {"counted", "lower_bound", "modelled_range"}:
        raise ValueError(f"Bad class {cls} on {fid}")
    if cls == "modelled_range" and (low is None or high is None):
        raise ValueError(f"Modelled range {fid} needs low and high")
    if cls != "modelled_range" and value is None and low is None:
        raise ValueError(f"Figure {fid} needs a value")
    return {
        "id": fid,
        "label": label,
        "class": cls,
        "unit": unit,
        "value": value,
        "range": None if low is None else {"low": low, "base": base, "high": high},
        "display": display,
        "denominator": None if denominator is None else {"value": denominator[0], "unit": denominator[1]},
        "parts": None if parts is None else [{"label": name, "value": amount} for name, amount in parts],
        "scope": scope,
        "how": how,
        "caveat": caveat,
    }


def build_career_figures(
    *,
    dataset: dict[str, Any],
    bryce_id: str,
    daytona_session: str,
    race_rows: list[dict[str, Any]],
    ledger_rows: list[dict[str, Any]],
    travel_rows: list[dict[str, Any]],
    fuel_rows: list[dict[str, Any]],
    assumptions_for: Any,
    facts_by_track: dict[str, dict[str, str]],
    variants_path: Path,
) -> dict[str, Any]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    tracks = {row["id"]: row for row in dataset["tracks"]}
    drivers = {row["id"]: row for row in dataset["drivers"]}
    bryce_results = [row for row in dataset["results"] if row.get("driverId") == bryce_id]
    bryce_quali = {
        row["sessionId"]: row for row in dataset.get("qualifyingResults", []) if row.get("driverId") == bryce_id
    }
    results_by_session = {row["sessionId"]: row for row in bryce_results}
    race_results = [row for row in bryce_results if sessions[row["sessionId"]]["sessionType"] == "race"]
    race_ids = {row["sessionId"] for row in race_results}
    race_count = len(race_results)
    race_by_session = {row["sessionId"]: row for row in race_rows}

    # ---- Results ------------------------------------------------------------
    finishes = [row.get("finishPosition") for row in race_results]
    wins = sum(1 for pos in finishes if pos == 1)
    podiums = sum(1 for pos in finishes if pos is not None and pos <= 3)
    top_tens = sum(1 for pos in finishes if pos is not None and pos <= 10)

    # ---- Distance -----------------------------------------------------------
    race_laps = sum(int(row["personalLaps"] or 0) for row in race_rows)
    race_miles = round(sum(float(row["personalMiles"] or 0) for row in race_rows), 1)

    corners = 0
    for row in race_rows:
        track = tracks[events[sessions[row["sessionId"]]["eventId"]]["trackId"]]
        if track.get("cornerCount") is None:
            raise ValueError(f"Track {track['id']} ({track.get('name')}) has no cornerCount")
        corners += int(row["personalLaps"] or 0) * int(track["cornerCount"])

    # ---- Time in the car ----------------------------------------------------
    daytona_lap_seconds = [
        parse_duration(lap.get("lapTime"))
        for lap in dataset["lapSamples"]
        if lap.get("sessionId") == daytona_session and lap.get("driverId") == bryce_id
    ]
    daytona_lap_seconds = [value for value in daytona_lap_seconds if value is not None]
    daytona_laps = int(race_by_session[daytona_session]["personalLaps"])
    if len(daytona_lap_seconds) != daytona_laps:
        raise ValueError(f"Daytona lap times ({len(daytona_lap_seconds)}) must match his {daytona_laps} stint laps")

    timed_seconds = 0.0
    timed_races = 0
    untimed_seconds = 0.0
    untimed_races = 0
    for result in race_results:
        laps = int(race_by_session[result["sessionId"]]["personalLaps"] or 0)
        if result["sessionId"] == daytona_session:
            timed_seconds += sum(daytona_lap_seconds)
            timed_races += 1
            continue
        total = parse_duration(result.get("totalTime"))
        if total is not None:
            timed_seconds += total
            timed_races += 1
            continue
        best = parse_duration(result.get("bestLapTime"))
        if laps > 0 and best is not None:
            untimed_seconds += laps * best
            untimed_races += 1
    all_race_seconds = timed_seconds + untimed_seconds
    races_with_time = timed_races + untimed_races

    other_session_seconds = 0.0
    other_sessions = 0
    for row in ledger_rows:
        if row["sessionType"] == "race" or row["confidenceClass"] not in {"observed_exact", "observed_lower_bound"}:
            continue
        laps = int(row["lapsFloor"] or 0)
        result = results_by_session.get(row["sessionId"])
        best = parse_duration(result.get("bestLapTime")) if result else None
        if best is None and row["sessionId"] in bryce_quali:
            best = parse_duration(bryce_quali[row["sessionId"]].get("bestLapTime"))
        if laps > 0 and best is not None:
            other_session_seconds += laps * best
            other_sessions += 1
    all_session_hours = (all_race_seconds + other_session_seconds) / 3600

    # ---- People -------------------------------------------------------------
    variant_rows = []
    with variants_path.open(newline="") as handle:
        variant_rows = list(csv.DictReader(handle))

    def people(session_ids: set[str]) -> dict[str, int]:
        others = {
            row["driverId"] for row in dataset["results"]
            if row["sessionId"] in session_ids and row.get("driverId") and row["driverId"] != bryce_id
        }
        artifacts = {row["driverId"] for row in variant_rows if row["kind"] == "parsing_artifact"} & others
        groups: dict[str, set[str]] = defaultdict(set)
        for row in variant_rows:
            if row["kind"] == "possible_variant" and row["driverId"] in others:
                groups[row["groupId"]].add(row["driverId"])
        extra = sum(len(members) - 1 for members in groups.values() if members)
        high = len(others) - len(artifacts)
        return {"records": len(others), "low": high - extra, "high": high}

    all_people = people(race_ids)
    single_seater_people = people(race_ids - {daytona_session})

    # ---- Venues and travel --------------------------------------------------
    venues = {row["trackName"] for row in race_rows}
    countries = {row["country"] for row in race_rows}
    great_circle = round(sum(float(row["greatCircleMiles"]) for row in travel_rows), 1)
    route_low = round(sum(float(row["routeAdjustedLowMiles"]) for row in travel_rows), 1)
    route_base = round(sum(float(row["routeAdjustedBaseMiles"]) for row in travel_rows), 1)
    route_high = round(sum(float(row["routeAdjustedHighMiles"]) for row in travel_rows), 1)

    # ---- Days and weeks -----------------------------------------------------
    race_event_ids = sorted({sessions[row["sessionId"]]["eventId"] for row in race_results})
    event_days: set[dt.date] = set()
    event_days_by_event: dict[str, list[dt.date]] = {}
    for event_id in race_event_ids:
        event = events[event_id]
        start, end = parse_date(event["eventStartDate"]), parse_date(event.get("eventEndDate") or event["eventStartDate"])
        days = []
        day = start
        while day <= end:
            days.append(day)
            day += dt.timedelta(days=1)
        event_days_by_event[event_id] = days
        event_days.update(days)
    span_start, span_end = min(event_days), max(event_days)
    span_days = (span_end - span_start).days + 1

    session_days: set[dt.date] = set()
    undated_sessions = 0
    for session_id in {row["sessionId"] for row in bryce_results} | set(bryce_quali):
        session = sessions[session_id]
        day = parse_date(session.get("actualStart")) or parse_date(session.get("scheduledStart"))
        if day is None:
            undated_sessions += 1
        else:
            session_days.add(day)

    def weeks_between(first: dt.date, last: dt.date) -> list[dt.date]:
        mondays = []
        monday = monday_of(first)
        while monday <= last:
            mondays.append(monday)
            monday += dt.timedelta(days=7)
        return mondays

    span_mondays = weeks_between(span_start, span_end)
    event_week_ids = {iso_week_id(day) for day in event_days}

    # ---- Fuel (modelled) ----------------------------------------------------
    def litres(rows: list[dict[str, Any]], miles_key: str) -> list[float]:
        km_by_group: dict[tuple[str, int], float] = defaultdict(float)
        for row in rows:
            km_by_group[(row["seriesId"], int(row["seasonYear"]))] += float(row[miles_key] or 0) * 1.609344
        totals = [0.0, 0.0, 0.0]
        for (series_id, year), km in km_by_group.items():
            assumption = assumptions_for(series_id, year)
            for index, key in enumerate(("fuelLowLPer100Km", "fuelBaseLPer100Km", "fuelHighLPer100Km")):
                totals[index] += km * float(assumption[key]) / 100
        return totals

    race_litres = litres(race_rows, "personalMiles")
    # Same rates as estimated_fuel_burned.csv, summed before rounding.
    session_litres = litres(ledger_rows, "milesFloor")
    table_litres = [
        sum(float(row[key]) for row in fuel_rows)
        for key in ("estimatedFuelLowLiters", "estimatedFuelBaseLiters", "estimatedFuelHighLiters")
    ]
    if any(abs(left - right) > 0.5 for left, right in zip(session_litres, table_litres)):
        raise ValueError(f"Session fuel {session_litres} disagrees with the fuel table {table_litres}")
    race_gallons = [round(value / LITRES_PER_US_GALLON) for value in race_litres]
    session_gallons = [round(value / LITRES_PER_US_GALLON) for value in session_litres]

    # ---- INDY NXT incidents and penalties -----------------------------------
    indy_race_ids = {
        sid for sid in race_ids if events[sessions[sid]["eventId"]]["seriesId"] == "series_indy_nxt"
    }
    my_incidents = [
        row for row in dataset.get("incidents", [])
        if row.get("sessionId") in race_ids
        and (row.get("driverId") == bryce_id or bryce_id in (row.get("otherDriverIds") or []))
    ]
    outside_indy = [row for row in my_incidents if row["sessionId"] not in indy_race_ids]
    if outside_indy:
        raise ValueError("Incident rows outside INDY NXT appeared; the INDY NXT-only figures need rewording")
    cautions = [row for row in my_incidents if str(row.get("incidentType", "")).startswith("caution")]

    def caution_cause(row: dict[str, Any]) -> str:
        match = re.search(r"\bfor (\w+)", row.get("description") or "")
        return match.group(1).lower() if match else "unknown"

    caution_causes = Counter(caution_cause(row) for row in cautions)
    retirements = Counter(
        row["incidentType"] for row in my_incidents
        if row.get("driverId") == bryce_id and not str(row.get("incidentType", "")).startswith("caution")
    )
    status_retirements = Counter(
        row.get("status") for row in race_results if row["sessionId"] in indy_race_ids and row.get("status") in {"contact", "mechanical"}
    )
    if dict(retirements) != dict(status_retirements):
        raise ValueError(f"INDY NXT retirement incidents {dict(retirements)} disagree with result status {dict(status_retirements)}")
    penalties = [
        row for row in dataset.get("penalties", [])
        if row.get("driverId") == bryce_id and row.get("sessionId") in race_ids
    ]
    if any(row["sessionId"] not in indy_race_ids for row in penalties):
        raise ValueError("Penalty rows outside INDY NXT appeared; the INDY NXT-only figure needs rewording")
    contact_cautions = caution_causes.get("contact", 0)
    spin_cautions = caution_causes.get("spin", 0)
    if contact_cautions + spin_cautions != len(cautions):
        raise ValueError(f"Caution causes not all contact or spin: {dict(caution_causes)}")

    # ---- Figures -------------------------------------------------------------
    first_race = min(race_results, key=lambda row: sessions[row["sessionId"]].get("actualStart") or sessions[row["sessionId"]].get("scheduledStart") or "")
    last_race = max(race_results, key=lambda row: sessions[row["sessionId"]].get("actualStart") or sessions[row["sessionId"]].get("scheduledStart") or "")
    first_race_day = parse_date(sessions[first_race["sessionId"]].get("actualStart") or sessions[first_race["sessionId"]].get("scheduledStart"))
    last_race_day = parse_date(sessions[last_race["sessionId"]].get("actualStart") or sessions[last_race["sessionId"]].get("scheduledStart"))
    if last_race_day > span_end or first_race_day < span_start:
        raise ValueError("Race dates fall outside the event-day span")

    figures = [
        figure(
            "races", "Races", "counted", "races", fmt_int(race_count),
            "Every race he has a result in, across seven series. Heats are not counted.",
            value=race_count,
        ),
        figure(
            "wins", "Wins", "counted", "races", fmt_int(wins),
            "Races where he was classified first.",
            value=wins, denominator=(race_count, "races"),
        ),
        figure(
            "podiums", "Podiums", "counted", "races", fmt_int(podiums),
            "Races where he finished in the top three.",
            value=podiums, denominator=(race_count, "races"),
        ),
        figure(
            "topTens", "Top tens", "counted", "races", fmt_int(top_tens),
            "Races where he finished tenth or better.",
            value=top_tens, denominator=(race_count, "races"),
        ),
        figure(
            "raceLaps", "Race laps", "counted", "laps", fmt_int(race_laps),
            "His laps in every race added up. At Daytona only the laps he drove himself count.",
            value=race_laps,
            caveat="Daytona counts his 142 laps, not the 780 the shared car ran.",
        ),
        figure(
            "raceMiles", "Miles raced", "counted", "miles", fmt_1(race_miles),
            "Each race's laps times that track's length, added up race by race.",
            value=race_miles,
            caveat=f"About {round(100 * race_miles / EQUATOR_MILES)}% of one trip around the equator.",
        ),
        figure(
            "raceCorners", "Corners in races", "counted", "corners", fmt_int(corners),
            "His laps in each race times the number of numbered turns on that track.",
            value=corners,
            caveat="The turn counts come from each track's published layout; an oval counts as four corners.",
        ),
        figure(
            "raceTimeTimed", "Time racing, timed races", "counted", "hours", hm(timed_seconds),
            "The official race time from the start to his finish, added up over the races that publish one.",
            value=round(timed_seconds / 3600, 2), parts=[("races covered", timed_races), ("races in all", race_count)],
            caveat=f"Covers {timed_races} of {race_count} races and includes time behind the safety car.",
        ),
        figure(
            "raceTimeAll", "Time racing, all races", "lower_bound", "hours", f"{hm(all_race_seconds)}+",
            "The timed races, plus his laps times his best lap for the races with no official time.",
            value=round(all_race_seconds / 3600, 2), parts=[("races covered", races_with_time), ("races in all", race_count)],
            caveat=(
                f"Covers {races_with_time} of {race_count} races; the other {race_count - races_with_time} had no laps. "
                "Real laps are slower than his best, so the true time is longer."
            ),
        ),
        figure(
            "sessionHours", "Time on track, all official sessions", "lower_bound", "hours",
            f"{all_session_hours:,.1f} h+",
            "Race time, plus his laps times his best lap in every practice, qualifying and test session with a lap count.",
            value=round(all_session_hours, 1),
            caveat="Leaves out sessions with no lap count and every private test.",
        ),
        figure(
            "otherDriverRecords", "Other drivers in his races", "counted", "driver records", fmt_int(all_people["records"]),
            "Every other driver name on the results of the races he was in, counted once each.",
            value=all_people["records"], low=all_people["low"], high=all_people["high"],
            caveat=(
                f"Some names appear twice under different spellings, so this is between "
                f"{all_people['low']} and {all_people['high']} people. About half are from the one 24-hour race at Daytona."
            ),
        ),
        figure(
            "otherDriverRecordsSingleSeater", "Other drivers, leaving out Daytona", "counted", "driver records",
            fmt_int(single_seater_people["records"]),
            "The same count without the Daytona 24-hour race, so only the drivers he raced in single-seaters.",
            value=single_seater_people["records"], low=single_seater_people["low"], high=single_seater_people["high"],
            caveat=f"Between {single_seater_people['low']} and {single_seater_people['high']} people, for the same reason.",
        ),
        figure(
            "venues", "Tracks", "counted", "tracks", fmt_int(len(venues)),
            "Different circuits he has raced at. Two layouts at one circuit count once.",
            value=len(venues),
        ),
        figure(
            "countries", "Countries", "counted", "countries", fmt_int(len(countries)),
            "Countries those circuits are in.",
            value=len(countries),
        ),
        figure(
            "milesBetweenTracks", "Miles between tracks", "lower_bound", "miles", f"{fmt_1(great_circle)}+",
            "A straight line from each race's track to the next race's track, added up in date order.",
            value=great_circle,
            caveat="The least distance anyone could cover between his races, not his real travel: trips home and testing are left out.",
        ),
        figure(
            "milesBetweenTracksByRoad", "Miles between tracks, by road and air", "modelled_range", "miles",
            f"{fmt_1(route_low)} to {fmt_1(route_high)}",
            "The straight lines stretched to allow for roads on short trips and flight paths on long ones.",
            low=route_low, base=route_base, high=route_high,
            caveat="The stretch factors are assumptions. Still only track to track, not his real travel.",
        ),
        figure(
            "eventDays", "Days at race meetings", "counted", "days", fmt_int(len(event_days)),
            "Every day from the first to the last day of each race meeting, counting a day once even when two meetings share it.",
            value=len(event_days), denominator=(span_days, "days"),
            caveat=f"Out of the {span_days:,} days from his first race meeting to his last.",
        ),
        figure(
            "sessionDays", "Days he was on track", "counted", "days", fmt_int(len(session_days)),
            "Different dates on which he ran in at least one official session.",
            value=len(session_days), denominator=(span_days, "days"),
            caveat=f"{undated_sessions} sessions have no date and are left out.",
        ),
        figure(
            "raceWeeks", "Weeks with a race meeting", "counted", "weeks", fmt_int(len(event_week_ids)),
            "Calendar weeks, Monday to Sunday, that held at least one day of a race meeting.",
            value=len(event_week_ids), denominator=(len(span_mondays), "weeks"),
        ),
        figure(
            "fuelRaces", "Fuel burned in races", "modelled_range", "US gallons",
            f"{fmt_int(race_gallons[0])} to {fmt_int(race_gallons[2])}",
            "His race miles times a low, middle and high guess at how much fuel each car uses per mile.",
            low=race_gallons[0], base=race_gallons[1], high=race_gallons[2],
            caveat="The fuel rates are assumptions, not measurements.",
        ),
        figure(
            "fuelAllSessions", "Fuel burned in all official sessions", "modelled_range", "US gallons",
            f"{fmt_int(session_gallons[0])} to {fmt_int(session_gallons[2])}",
            "The same fuel rates applied to his miles in every practice, qualifying, test and race.",
            low=session_gallons[0], base=session_gallons[1], high=session_gallons[2],
            caveat="The fuel rates are assumptions, and sessions with no lap count are left out.",
        ),
        figure(
            "indyNxtCautions", "Cautions he was named in", "counted", "caution periods", fmt_int(len(cautions)),
            "Safety-car periods in his races where the official report names his car.",
            value=len(cautions), parts=[("contact", contact_cautions), ("spin", spin_cautions)], scope="INDY NXT only",
            caveat="Being named does not mean he caused it. Only INDY NXT publishes these reports.",
        ),
        figure(
            "indyNxtRetirements", "Races he retired from", "counted", "races", fmt_int(sum(retirements.values())),
            "INDY NXT races where the official result says he stopped before the finish, and why.",
            value=sum(retirements.values()),
            parts=[("after contact", retirements.get("contact", 0)), ("mechanical", retirements.get("mechanical", 0))],
            scope="INDY NXT only", denominator=(len(indy_race_ids), "races"),
        ),
        figure(
            "indyNxtPenalties", "Penalties", "counted", "penalties", fmt_int(len(penalties)),
            "Penalties the INDY NXT stewards gave him in races.",
            value=len(penalties), scope="INDY NXT only", denominator=(len(indy_race_ids), "races"),
            caveat="All three were for avoidable contact. Other series' penalties are not in the data.",
        ),
    ]

    # ---- Share of his life -------------------------------------------------
    days_alive = (span_end - BIRTH_DATE).days + 1
    life_mondays = weeks_between(BIRTH_DATE, span_end)
    age_first = years_between(BIRTH_DATE, first_race_day)
    age_last = years_between(BIRTH_DATE, span_end)
    life_share = {
        "birthDate": BIRTH_DATE.isoformat(),
        "birthDateProvenance": BIRTH_DATE_PROVENANCE,
        "asOf": span_end.isoformat(),
        "firstRaceDate": first_race_day.isoformat(),
        "lastRaceDate": last_race_day.isoformat(),
        "figures": [
            figure(
                "ageAtFirstRace", "Age at his first race", "counted", "years", f"{age_first}",
                f"His age on {first_race_day:%B} {first_race_day.day}, {first_race_day.year}, the day of his first car race.",
                value=age_first,
            ),
            figure(
                "ageAtLastRace", "Age at his latest race", "counted", "years", f"{age_last}",
                f"His age on {span_end:%B} {span_end.day}, {span_end.year}, the day of his latest race.",
                value=age_last,
            ),
            figure(
                "daysAlive", "Days alive", "counted", "days", fmt_int(days_alive),
                f"Every day from his birth to {span_end:%B} {span_end.day}, {span_end.year}, counting both.",
                value=days_alive,
            ),
            figure(
                "eventDaysShareOfLife", "Days at race meetings, share of his life", "counted", "percent",
                f"{pct(len(event_days), days_alive)}%",
                "His days at race meetings out of every day he has been alive.",
                value=pct(len(event_days), days_alive), denominator=(days_alive, "days"),
                parts=[("days at race meetings", len(event_days))],
            ),
            figure(
                "eventDaysShareOfCareer", "Days at race meetings, share of his racing years", "counted", "percent",
                f"{pct(len(event_days), span_days)}%",
                "His days at race meetings out of every day from his first race meeting to his last.",
                value=pct(len(event_days), span_days), denominator=(span_days, "days"),
                parts=[("days at race meetings", len(event_days))],
            ),
            figure(
                "sessionDaysShareOfLife", "Days on track, share of his life", "counted", "percent",
                f"{pct(len(session_days), days_alive)}%",
                "Days he ran in at least one official session, out of every day he has been alive.",
                value=pct(len(session_days), days_alive), denominator=(days_alive, "days"),
                parts=[("days on track", len(session_days))],
            ),
            figure(
                "sessionDaysShareOfCareer", "Days on track, share of his racing years", "counted", "percent",
                f"{pct(len(session_days), span_days)}%",
                "Days he ran in at least one official session, out of every day from his first race meeting to his last.",
                value=pct(len(session_days), span_days), denominator=(span_days, "days"),
                parts=[("days on track", len(session_days))],
            ),
            figure(
                "weeksLived", "Weeks lived", "counted", "weeks", fmt_int(len(life_mondays)),
                f"Calendar weeks, Monday to Sunday, from the week he was born to the week of {span_end:%B} {span_end.day}, {span_end.year}.",
                value=len(life_mondays),
            ),
            figure(
                "raceWeeksShareOfLife", "Race weeks among the weeks he has lived", "counted", "weeks",
                fmt_int(len(event_week_ids)),
                "Weeks that held at least one day of a race meeting, out of every week he has lived.",
                value=len(event_week_ids), denominator=(len(life_mondays), "weeks"),
            ),
        ],
    }

    # ---- Weeks grid ----------------------------------------------------------
    # Races are placed in the week of their own date (an event can span two weeks).
    finish_by_event_week: dict[tuple[str, str], list[int]] = defaultdict(list)
    races_by_event_week: Counter[tuple[str, str]] = Counter()
    for row in race_results:
        session = sessions[row["sessionId"]]
        day = parse_date(session.get("actualStart") or session.get("scheduledStart")) or parse_date(
            events[session["eventId"]]["eventStartDate"]
        )
        key = (session["eventId"], iso_week_id(day))
        races_by_event_week[key] += 1
        if row.get("finishPosition") is not None:
            finish_by_event_week[key].append(int(row["finishPosition"]))
    week_events: dict[str, list[str]] = defaultdict(list)
    for event_id in race_event_ids:
        for week in sorted({iso_week_id(day) for day in event_days_by_event[event_id]}):
            week_events[week].append(event_id)
    weeks = []
    for monday in span_mondays:
        week = iso_week_id(monday)
        weeks.append(
            {
                "isoWeek": week,
                "monday": monday.isoformat(),
                "races": [
                    {
                        "eventId": event_id,
                        "seriesId": events[event_id]["seriesId"],
                        "eventName": events[event_id]["name"],
                        "raceCount": races_by_event_week[(event_id, week)],
                        "bestFinish": min(finish_by_event_week[(event_id, week)]) if finish_by_event_week[(event_id, week)] else None,
                    }
                    for event_id in sorted(week_events.get(week, []), key=lambda eid: (events[eid]["eventStartDate"], eid))
                ],
            }
        )
    if {week["isoWeek"] for week in weeks if week["races"]} != event_week_ids:
        raise ValueError("Weeks grid race weeks disagree with the race-week count")
    if sum(entry["raceCount"] for week in weeks for entry in week["races"]) != race_count:
        raise ValueError("Weeks grid must place every race exactly once")
    weeks_grid = {
        "firstWeek": weeks[0]["isoWeek"],
        "lastWeek": weeks[-1]["isoWeek"],
        "weekCount": len(weeks),
        "raceWeekCount": len(event_week_ids),
        "how": "One cell per calendar week, Monday to Sunday, from his first race meeting to his latest. A week is filled when it holds a day of a race meeting; each race sits in the week of its own date.",
        "weeks": weeks,
    }

    # ---- Travel legs ---------------------------------------------------------
    legs = []
    running = 0.0
    for index, row in enumerate(travel_rows, start=1):
        miles = float(row["greatCircleMiles"])
        running += miles
        legs.append(
            {
                "index": index,
                "from": {
                    "eventId": row["fromEventId"],
                    "trackName": row["fromTrackName"],
                    "country": row["fromCountry"],
                    "lat": float(row["fromLat"]),
                    "lon": float(row["fromLon"]),
                    "date": row["fromEventStartDate"],
                },
                "to": {
                    "eventId": row["toEventId"],
                    "trackName": row["toTrackName"],
                    "country": row["toCountry"],
                    "lat": float(row["toLat"]),
                    "lon": float(row["toLon"]),
                    "date": row["toEventStartDate"],
                },
                "greatCircleMiles": miles,
                "modeProxy": {"drive_proxy": "drive", "flight_proxy": "flight", "same_venue": "same_venue"}[row["travelModeProxy"]],
                "runningMiles": round(running, 1),
            }
        )
    travel_legs = {
        "legCount": len(legs),
        "totalMiles": round(running, 1),
        "class": "lower_bound",
        "how": "Each leg is a straight line from one race meeting's track to the next one's, in date order. Drive or flight is a rule of thumb (same country and under 750 miles counts as a drive), not how he travelled.",
        "legs": legs,
    }

    checks = {
        "timedRaces": timed_races,
        "untimedRaces": untimed_races,
        "otherSessionsTimed": other_sessions,
        "eventCount": len(race_event_ids),
        "spanDays": span_days,
        "spanWeeks": len(span_mondays),
        "undatedSessions": undated_sessions,
        "raceLitres": [round(value, 1) for value in race_litres],
        "sessionLitres": [round(value, 1) for value in session_litres],
    }
    return {
        "schemaVersion": "brycecast.careerFigures.v1",
        "classes": {
            "counted": "Exact from the data.",
            "lower_bound": "The true figure is at least this.",
            "modelled_range": "An estimate built on stated assumptions.",
        },
        "span": {"firstDay": span_start.isoformat(), "lastDay": span_end.isoformat(), "days": span_days, "weeks": len(span_mondays)},
        "figures": figures,
        "lifeShare": life_share,
        "weeksGrid": weeks_grid,
        "travelLegs": travel_legs,
        "checks": checks,
    }
