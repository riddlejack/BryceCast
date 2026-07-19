#!/usr/bin/env python3
"""Validate the GB3 deep-dive lane artifacts.

Standalone integrity gate on the built output (not a re-derivation oracle):
asserts row counts, percentile bounds, source-family integrity, that
denominators are present, that every required caveat field is non-empty, and
that the canonical-dataset SHA-256 (`sourceHash`) is stamped on every row, the
context pack, and the summary. Also checks the pack carries the UI-facing
tables and forbids overclaiming causal/predictive language.
"""

from __future__ import annotations

import csv
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
LANE_DIR = ROOT / "analysis/gb3-deep-dive"
OUTPUT_DIR = LANE_DIR / "output"
TABLE_DIR = OUTPUT_DIR / "tables"
DATASET_PATH = ROOT / "data/career/career.dataset.json"

BRYCE_ID = "driver_bryce_aron"
GB3_ID = "series_gb3"
CLAIM_STRENGTH = "source_bounded_gb3_result_conversion"

KNOWN_SOURCE_FAMILIES = {"2021 TSL official PDFs", "2022 GB3 official JSON"}
AUDIT_SOURCE_FAMILIES = KNOWN_SOURCE_FAMILIES | {"GB3 combined"}

REQUIRED_FILES = [
    "tables/gb3_bryce_race_results.csv",
    "tables/gb3_event_summary.csv",
    "tables/gb3_qualifying_context.csv",
    "tables/gb3_track_profile.csv",
    "tables/gb3_weather_context.csv",
    "tables/gb3_team_context.csv",
    "tables/gb3_source_family_audit.csv",
    "tables/historic_analytics_roadmap.csv",
    "summary.json",
    "GB3_DEEP_DIVE_ANALYTICS.md",
    "GB3_ANALYTICS_ADVERSARIAL_REVIEW.md",
    "HISTORIC_ANALYTICS_ROADMAP.md",
    "context-packs/gb3-deep-dive-context.json",
]


def fail(message: str) -> None:
    raise AssertionError(message)


def require_file(path: Path) -> None:
    if not path.exists():
        fail(f"Missing required artifact: {path.relative_to(ROOT)}")
    if path.is_file() and path.stat().st_size == 0:
        fail(f"Empty required artifact: {path.relative_to(ROOT)}")


def read_csv(name: str) -> list[dict[str, str]]:
    path = TABLE_DIR / name
    require_file(path)
    with path.open(newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        fail(f"{name} has no data rows")
    return rows


def load_json(path: Path) -> Any:
    require_file(path)
    with path.open() as f:
        return json.load(f)


def dataset_hash() -> str:
    h = hashlib.sha256()
    with DATASET_PATH.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def to_float(value: str) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        fail(f"non-numeric value where number expected: {value!r}")


def require_hash(rows: list[dict[str, str]], name: str, expected: str) -> None:
    for row in rows:
        if "sourceHash" not in row:
            fail(f"{name} missing sourceHash column")
        if row["sourceHash"] != expected:
            fail(f"{name} sourceHash does not match canonical dataset")


def require_caveat(rows: list[dict[str, str]], name: str, field: str = "caveat") -> None:
    for row in rows:
        if not (row.get(field) or "").strip():
            fail(f"{name} has an empty required {field}")


def require_percentile_bounds(rows: list[dict[str, str]], name: str, field: str) -> None:
    for row in rows:
        value = to_float(row.get(field, ""))
        if value is not None and not (0.0 <= value <= 1.0):
            fail(f"{name} {field} out of [0,1] bounds: {value}")


def expected_counts() -> dict[str, int]:
    data = load_json(DATASET_PATH)
    events = {e["id"]: e for e in data["events"]}
    sessions = {s["id"]: s for s in data["sessions"]}
    gb3_event_ids = {e["id"] for e in data["events"] if e.get("seriesId") == GB3_ID}
    gb3_sessions = [s for s in data["sessions"] if s.get("eventId") in gb3_event_ids]
    gb3_session_ids = {s["id"] for s in gb3_sessions}
    gb3_race_session_ids = {s["id"] for s in gb3_sessions if s.get("sessionType") in {"race", "heat"}}

    bryce_race = [
        r for r in data["results"]
        if r.get("driverId") == BRYCE_ID and r.get("sessionId") in gb3_race_session_ids
    ]
    race_event_ids = {sessions[r["sessionId"]]["eventId"] for r in bryce_race}
    race_track_ids = {events[eid].get("trackId") for eid in race_event_ids}
    team_sessions = {r["sessionId"] for r in bryce_race}

    # Qualifying context: dedicated qualifyingResults rows + qualifying-session
    # result rows not already represented (mirrors the build's normalization).
    seen: set[str] = set()
    qual = 0
    for q in data["qualifyingResults"]:
        if q.get("driverId") == BRYCE_ID and q.get("sessionId") in gb3_session_ids:
            qual += 1
            seen.add(q["sessionId"])
    for r in data["results"]:
        if r.get("driverId") != BRYCE_ID or r.get("sessionId") not in gb3_session_ids:
            continue
        s = sessions[r["sessionId"]]
        if s.get("sessionType") == "qualifying" and s["id"] not in seen:
            qual += 1

    weather = sum(1 for w in data["weatherObservations"] if w.get("sessionId") in gb3_session_ids)

    return {
        "race": len(bryce_race),
        "event": len(race_event_ids),
        "qualifying": qual,
        "track": len(race_track_ids),
        "weather": weather,
        "team": len(team_sessions),
        "audit": 3,
        "roadmap": 5,
    }


def main() -> int:
    try:
        for relative in REQUIRED_FILES:
            require_file(OUTPUT_DIR / relative)

        expected_hash = dataset_hash()
        exp = expected_counts()

        race = read_csv("gb3_bryce_race_results.csv")
        events = read_csv("gb3_event_summary.csv")
        qual = read_csv("gb3_qualifying_context.csv")
        track = read_csv("gb3_track_profile.csv")
        weather = read_csv("gb3_weather_context.csv")
        team = read_csv("gb3_team_context.csv")
        audit = read_csv("gb3_source_family_audit.csv")
        roadmap = read_csv("historic_analytics_roadmap.csv")

        # ---- Row counts ---------------------------------------------------
        counts = {
            ("gb3_bryce_race_results.csv", len(race), exp["race"]),
            ("gb3_event_summary.csv", len(events), exp["event"]),
            ("gb3_qualifying_context.csv", len(qual), exp["qualifying"]),
            ("gb3_track_profile.csv", len(track), exp["track"]),
            ("gb3_weather_context.csv", len(weather), exp["weather"]),
            ("gb3_team_context.csv", len(team), exp["team"]),
            ("gb3_source_family_audit.csv", len(audit), exp["audit"]),
            ("historic_analytics_roadmap.csv", len(roadmap), exp["roadmap"]),
        }
        for name, got, want in counts:
            if got != want:
                fail(f"{name} row count mismatch: expected {want}, got {got}")

        # ---- sourceHash stamped on every row of every table ---------------
        for name, rows in [
            ("gb3_bryce_race_results.csv", race),
            ("gb3_event_summary.csv", events),
            ("gb3_qualifying_context.csv", qual),
            ("gb3_track_profile.csv", track),
            ("gb3_weather_context.csv", weather),
            ("gb3_team_context.csv", team),
            ("gb3_source_family_audit.csv", audit),
            ("historic_analytics_roadmap.csv", roadmap),
        ]:
            require_hash(rows, name, expected_hash)

        # ---- Percentile bounds --------------------------------------------
        require_percentile_bounds(race, "gb3_bryce_race_results.csv", "finishPercentile")
        require_percentile_bounds(events, "gb3_event_summary.csv", "avgFinishPercentile")
        require_percentile_bounds(track, "gb3_track_profile.csv", "avgFinishPercentile")
        require_percentile_bounds(weather, "gb3_weather_context.csv", "bryceFinishPercentileIfRace")

        # ---- Source-family integrity --------------------------------------
        for row in race:
            if row.get("sourceFamily") not in KNOWN_SOURCE_FAMILIES:
                fail(f"race row has unknown sourceFamily {row.get('sourceFamily')!r}")
        for row in audit:
            if row.get("sourceFamily") not in AUDIT_SOURCE_FAMILIES:
                fail(f"audit row has unknown sourceFamily {row.get('sourceFamily')!r}")
        audit_families = {row["sourceFamily"] for row in audit}
        if audit_families != AUDIT_SOURCE_FAMILIES:
            fail(f"source-family audit must carry both years plus combined; got {sorted(audit_families)}")
        for row in weather:
            if row.get("sourceState") != "official_tsl_session_condition_line":
                fail(f"weather row has unexpected sourceState {row.get('sourceState')!r}")
        for row in team:
            if row.get("sourceState") != "official_full_field_results_descriptive_team_context":
                fail(f"team row has unexpected sourceState {row.get('sourceState')!r}")

        # ---- Denominators present -----------------------------------------
        for row in audit:
            for field in ["events", "sessions", "allRaceRows", "bryceRaceRows", "qualifyingContextRows"]:
                if (row.get(field) or "") == "":
                    fail(f"audit row missing denominator {field}")
        for row in events:
            if (to_float(row.get("raceRows", "")) or 0) < 1:
                fail("event summary row missing raceRows denominator")
        for row in track:
            if (to_float(row.get("raceRows", "")) or 0) < 1:
                fail("track profile row missing raceRows denominator")
        for row in team:
            if (to_float(row.get("teamRaceDriverCount", "")) or 0) < 1:
                fail("team context row missing teamRaceDriverCount denominator")

        # ---- Within-team rank: present iff Bryce is a classified finisher --
        # A blank rank is only valid when Bryce carries no finish position that
        # race (unclassified/DNF); it must never be invented.
        for row in team:
            rank = to_float(row.get("bryceWithinTeamRank", ""))
            drivers = to_float(row.get("teamRaceDriverCount", ""))
            has_finish = (row.get("bryceFinishPosition") or "").strip() != ""
            if has_finish and rank is None:
                fail("team context row with a Bryce finish is missing bryceWithinTeamRank")
            if not has_finish and rank is not None:
                fail("team context row without a Bryce finish must leave bryceWithinTeamRank blank, not invented")
            if rank is not None and drivers is not None and not (1 <= rank <= drivers):
                fail(f"bryceWithinTeamRank {rank} outside 1..{drivers}")

        # ---- Unavailable lanes stated as zero -----------------------------
        for row in audit:
            if (row.get("lapSampleRows") or "") == "" or (row.get("sectionMetricRows") or "") == "":
                fail("audit row must state lap/section coverage explicitly")
        combined = next(r for r in audit if r["sourceFamily"] == "GB3 combined")
        if combined.get("sectionMetricRows") != "0":
            fail("combined GB3 sectionMetricRows must be 0 (no section support)")

        # ---- Caveats non-empty where required -----------------------------
        require_caveat(race, "gb3_bryce_race_results.csv")
        require_caveat(events, "gb3_event_summary.csv")
        require_caveat(qual, "gb3_qualifying_context.csv")
        require_caveat(track, "gb3_track_profile.csv")
        require_caveat(weather, "gb3_weather_context.csv")
        require_caveat(team, "gb3_team_context.csv")
        require_caveat(audit, "gb3_source_family_audit.csv")
        require_caveat(roadmap, "historic_analytics_roadmap.csv", field="primaryCaveat")

        # ---- Context pack -------------------------------------------------
        pack = load_json(OUTPUT_DIR / "context-packs/gb3-deep-dive-context.json")
        if pack.get("sourceHash") != expected_hash:
            fail("context pack sourceHash does not match canonical dataset")
        if pack.get("claimStrength") != CLAIM_STRENGTH:
            fail("context pack claimStrength mismatch")
        for flag in ["publicPointPrediction", "lapShapeAvailable", "sectionPaceAvailable", "causalWeatherAvailable"]:
            if pack.get(flag) is not False:
                fail(f"context pack must set {flag}=false")
        required_pack_tables = {
            "raceResults": exp["race"],
            "qualifyingContext": exp["qualifying"],
            "teamContext": exp["team"],
            "trackProfile": exp["track"],
            "weatherContext": exp["weather"],
            "sourceFamilyReadiness": exp["audit"],
        }
        for key, want in required_pack_tables.items():
            got = pack.get(key)
            if not isinstance(got, list) or len(got) != want:
                fail(f"context pack {key} must carry {want} rows, got {len(got) if isinstance(got, list) else got}")
            for row in got:
                if row.get("sourceHash") != expected_hash:
                    fail(f"context pack {key} row missing canonical sourceHash")
        text = json.dumps(pack).lower()
        forbidden = ["win probability", "predicted finish", "expected finish", "field-relative pace", "lap position trace"]
        hits = [phrase for phrase in forbidden if phrase in text]
        if hits:
            fail(f"context pack contains unsupported claim text: {hits}")
        for required in ["source family", "percentile", "unavailable"]:
            if required not in text:
                fail(f"context pack must carry caveat semantics keyword: {required!r}")

        # ---- Summary ------------------------------------------------------
        summary = load_json(OUTPUT_DIR / "summary.json")
        if summary.get("ok") is not True:
            fail("summary.json must set ok=true")
        if summary.get("sourceHash") != expected_hash:
            fail("summary.json sourceHash does not match canonical dataset")
        if summary.get("claimStrength") != CLAIM_STRENGTH:
            fail("summary.json claimStrength mismatch")
        for flag in ["publicPointPrediction", "lapShapeAvailable", "sectionPaceAvailable", "causalWeatherAvailable"]:
            if summary.get(flag) is not False:
                fail(f"summary.json must set {flag}=false")
        if summary.get("counts", {}).get("raceRows") != exp["race"]:
            fail("summary.json counts.raceRows mismatch")

        # ---- Report sections ----------------------------------------------
        report_text = (OUTPUT_DIR / "GB3_DEEP_DIVE_ANALYTICS.md").read_text()
        for phrase in [
            "Executive Summary",
            "Source-Bounded Module Readiness",
            "Result Conversion And Season Shape",
            "Event-Level Readout",
            "Qualifying-To-Race Conversion",
            "Track And Venue Profile",
            "Weather And Track-Condition Context",
            "Team Context",
            "Historic Analytics Roadmap",
            "Caveats And Assumptions",
        ]:
            if phrase not in report_text:
                fail(f"deep-dive report missing section: {phrase}")

    except AssertionError as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, indent=2))
        return 1
    except StopIteration:
        print(json.dumps({"ok": False, "error": "combined GB3 audit row not found"}, indent=2))
        return 1
    print(json.dumps({"ok": True, "lane": str(LANE_DIR.relative_to(ROOT)), "sourceHash": expected_hash}, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
