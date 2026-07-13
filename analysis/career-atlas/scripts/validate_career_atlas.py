#!/usr/bin/env python3
"""Validate atlas provenance, geometry determinism, and venue source lineage."""

from __future__ import annotations

import csv
import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

try:
    import PIL
    from PIL import Image
except ModuleNotFoundError as error:
    raise SystemExit(
        "Career atlas validation requires Pillow. Install "
        "analysis/career-atlas/requirements.txt in the selected Python environment."
    ) from error


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/career-atlas"
BUILDER = LANE / "scripts/build_career_atlas.py"
OUTPUT = LANE / "output/atlas.json"
TEXTURE = LANE / "output/world_land_texture.png"
NATURAL_EARTH = LANE / "data/ne_110m_land.geojson"
SOURCE_NOTE = LANE / "data/SOURCE.md"
REQUIREMENTS = LANE / "requirements.txt"
FACTS = ROOT / "analysis/career-life-stats/data/venue_facts.csv"
LEDGER = ROOT / "analysis/career-life-stats/output/tables/miles_raced.csv"
DATASET = ROOT / "data/career/career.dataset.json"
BRYCE = "driver_bryce_aron"
EXPECTED_NE_SHA = "9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9"


def fail(message: str) -> None:
    raise AssertionError(message)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rows(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def load_builder():
    spec = importlib.util.spec_from_file_location("career_atlas_builder", BUILDER)
    if spec is None or spec.loader is None:
        fail("Could not load the career atlas builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    if not OUTPUT.exists():
        fail("Career atlas output is missing; run the builder")
    atlas = json.loads(OUTPUT.read_text())
    facts = rows(FACTS)
    ledger = rows(LEDGER)
    dataset = json.loads(DATASET.read_text())
    natural_earth = json.loads(NATURAL_EARTH.read_text())
    builder = load_builder()

    if PIL.__version__ != builder.PINNED_PILLOW_VERSION:
        fail(
            f"Career atlas requires pinned Pillow {builder.PINNED_PILLOW_VERSION}; "
            f"found {PIL.__version__}"
        )
    if REQUIREMENTS.read_text().strip() != f"Pillow=={builder.PINNED_PILLOW_VERSION}":
        fail("Career atlas requirements must pin the texture-rendering Pillow version")

    if atlas.get("schemaVersion") != "brycecast.careerAtlas.v3":
        fail("Unexpected career atlas schema")
    if sha256(NATURAL_EARTH) != EXPECTED_NE_SHA:
        fail("Vendored Natural Earth file does not match its pinned upstream checksum")
    if natural_earth.get("type") != "FeatureCollection" or len(natural_earth.get("features", [])) != 127:
        fail("Natural Earth input must be the pinned 127-feature 110m land collection")
    if {feature.get("geometry", {}).get("type") for feature in natural_earth["features"]} != {"Polygon"}:
        fail("Natural Earth land input geometry types changed")
    if natural_earth.get("crs", {}).get("properties", {}).get("name") != "urn:ogc:def:crs:OGC:1.3:CRS84":
        fail("Natural Earth land input must remain CRS84 lon/lat")
    source_note = SOURCE_NOTE.read_text()
    for required in (EXPECTED_NE_SHA, "public domain", "naturalearthdata.com/about/terms-of-use"):
        if required not in source_note:
            fail(f"Natural Earth provenance note is missing {required}")
    natural_meta = atlas["naturalEarth"]
    if natural_meta.get("license") != "public_domain" or natural_meta.get("sourceSha256") != EXPECTED_NE_SHA:
        fail("Atlas must preserve Natural Earth public-domain provenance and checksum")

    if not TEXTURE.exists():
        fail("Full-world globe texture is missing; run the atlas builder")
    globe = atlas.get("globe", {})
    texture_meta = globe.get("texture", {})
    if globe.get("projection") != "orthographic":
        fail("Career globe must declare the orthographic projection")
    if globe.get("defaultCenter") != {"longitude": -35.0, "latitude": 20.0}:
        fail("Career globe default center changed")
    if globe.get("zoom") != {"min": 1.0, "max": 32.0}:
        fail("Career globe zoom contract changed")
    if texture_meta != {
        "path": "analysis/career-atlas/output/world_land_texture.png",
        "width": 1024,
        "height": 512,
        "format": "png_grayscale_land_mask",
        "sha256": sha256(TEXTURE),
        "sourceFeatureCount": 127,
    }:
        fail("Full-world globe texture metadata does not reconcile")
    with Image.open(TEXTURE) as texture:
        if texture.format != "PNG" or texture.mode != "L" or texture.size != (1024, 512):
            fail("Globe texture must remain a 1024x512 grayscale PNG")
        samples = {
            "North America": (-100.0, 40.0, True),
            "Africa": (20.0, 0.0, True),
            "Australia": (135.0, -25.0, True),
            "Antarctica": (0.0, -80.0, True),
            "Antarctic cap": (-58.0, -85.0, True),
            "Weddell Sea": (-58.0, -80.0, False),
            "Pacific Ocean": (-150.0, 0.0, False),
            "Atlantic Ocean": (-30.0, 0.0, False),
        }
        for label, (lon, lat, expects_land) in samples.items():
            x = min(texture.width - 1, max(0, int((lon + 180.0) / 360.0 * texture.width)))
            y = min(texture.height - 1, max(0, int((90.0 - lat) / 180.0 * texture.height)))
            value = texture.getpixel((x, y))
            if expects_land and value < 192:
                fail(f"Globe texture lost expected land coverage at {label}")
            if not expects_land and value > 63:
                fail(f"Globe texture lost expected ocean coverage at {label}")

    expected_crop = builder.career_crop(facts)
    geometry = atlas["geometry"]
    if geometry.get("crop") != expected_crop:
        fail("Atlas crop must be recomputed from current A2 venue coordinates")
    if geometry.get("projection") != "equirectangular_wrapped":
        fail("Atlas must use the declared wrapped equirectangular projection")
    if geometry.get("simplification") != {"method": "closed_ring_ramer_douglas_peucker", "tolerancePx": 0.35}:
        fail("Atlas simplification contract changed")
    canvas = geometry["canvas"]
    if canvas.get("width") != 1000 or not (300 <= canvas.get("height", 0) <= 700):
        fail("Atlas projected canvas is outside the expected measured-width aspect band")
    land_path = geometry.get("landPath", "")
    if not land_path.startswith("M") or geometry.get("ringCount", 0) < 20:
        fail("Projected land path is empty or implausibly sparse")
    if geometry.get("landPathSha256") != hashlib.sha256(land_path.encode()).hexdigest():
        fail("Projected land path checksum does not reconcile")
    if not (0 < geometry.get("simplifiedPointCount", 0) < geometry.get("clippedPointCount", 0) < geometry.get("sourcePointCount", 0)):
        fail("Projection/simplification point counts do not show deterministic reduction")
    if any(token in land_path for token in ("nan", "NaN", "inf", "Infinity")):
        fail("Projected land path contains a non-finite coordinate")

    with tempfile.TemporaryDirectory() as directory:
        rebuilt = Path(directory) / "atlas.json"
        rebuilt_texture = Path(directory) / "world_land_texture.png"
        result = subprocess.run(
            [
                sys.executable,
                str(BUILDER),
                "--output",
                str(rebuilt),
                "--texture-output",
                str(rebuilt_texture),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            fail(f"Determinism rebuild failed: {result.stderr or result.stdout}")
        if rebuilt.read_bytes() != OUTPUT.read_bytes():
            fail("Career atlas build is not byte-for-byte deterministic")
        if rebuilt_texture.read_bytes() != TEXTURE.read_bytes():
            fail("Full-world globe texture build is not byte-for-byte deterministic")

    if len(ledger) != 145 or len({row["sessionId"] for row in ledger}) != 145:
        fail("Atlas source ledger must remain the A2 145-race driver ledger")
    if any(row["confidenceClass"] != "observed_exact" for row in ledger):
        fail("Every atlas race-count row must remain observed_exact")

    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    series = {row["id"]: row for row in dataset["series"]}
    facts_by_track = {row["trackId"]: row for row in facts}
    bryce_results = {
        row["sessionId"]: row
        for row in dataset["results"]
        if row.get("driverId") == BRYCE and sessions[row["sessionId"]]["sessionType"] == "race"
    }
    if set(bryce_results) != {row["sessionId"] for row in ledger}:
        fail("Atlas race-count source must exactly match all canonical Bryce races")

    expected_by_venue: dict[str, list[dict[str, object]]] = defaultdict(list)
    for session_id, result in bryce_results.items():
        session = sessions[session_id]
        event = events[session["eventId"]]
        fact = facts_by_track[event["trackId"]]
        start = session.get("actualStart") or session.get("scheduledStart") or event.get("eventStartDate") or ""
        expected_by_venue[fact["trackName"]].append(
            {
                "sessionId": session_id,
                "seriesId": event["seriesId"],
                "seasonYear": int(event["seasonYear"]),
                "raceDate": event.get("eventStartDate") or str(start)[:10],
                "sortKey": (str(start), session_id),
                "finishPosition": result.get("finishPosition"),
            }
        )

    venues = atlas.get("venues", [])
    if atlas.get("venueCount") != 34 or len(venues) != 34 or set(expected_by_venue) != {row["trackName"] for row in venues}:
        fail("Atlas must carry all 34 physical A2 career venues exactly once")
    if atlas.get("raceCount") != 145 or sum(row["raceCount"] for row in venues) != 145:
        fail("Atlas venue counts must reconcile to all 145 canonical races")
    if len({row["venueId"] for row in venues}) != 34 or any(not row["venueId"].startswith("venue_") for row in venues):
        fail("Atlas venue identities must be unique and deterministic")

    for venue in venues:
        name = venue["trackName"]
        races = expected_by_venue[name]
        if venue.get("region") != builder.COUNTRY_REGION.get(venue.get("country")):
            fail(f"Region classification mismatch for {name}")
        if venue["raceCount"] != len(races):
            fail(f"Race count mismatch for {name}")
        finishes = [int(row["finishPosition"]) for row in races if row["finishPosition"] is not None]
        if venue["bestFinish"] != (min(finishes) if finishes else None):
            fail(f"Best finish mismatch for {name}")
        if sum(span["raceCount"] for span in venue["seriesSpans"]) != len(races):
            fail(f"Series spans do not reconcile for {name}")
        latest = max(races, key=lambda row: row["sortKey"])
        if venue["latestRace"]["sessionId"] != latest["sessionId"]:
            fail(f"Latest race target mismatch for {name}")
        latest_prefix = "/races/" if latest["seriesId"] == "series_indy_nxt" else "/career/race/"
        if not venue["latestRace"]["raceHref"].startswith(latest_prefix):
            fail(f"Latest race href uses the wrong page family for {name}")
        by_series: dict[str, list[dict[str, object]]] = defaultdict(list)
        for race in races:
            by_series[str(race["seriesId"])].append(race)
        spans_by_series = {span["seriesId"]: span for span in venue["seriesSpans"]}
        if set(spans_by_series) != set(by_series):
            fail(f"Series filter coverage mismatch for {name}")
        for series_id, series_races in by_series.items():
            span = spans_by_series[series_id]
            series_finishes = [int(row["finishPosition"]) for row in series_races if row["finishPosition"] is not None]
            series_latest = max(series_races, key=lambda row: row["sortKey"])
            if span["raceCount"] != len(series_races):
                fail(f"Series-filtered race count mismatch for {name} / {series_id}")
            if span.get("bestFinish") != (min(series_finishes) if series_finishes else None):
                fail(f"Series-filtered best finish mismatch for {name} / {series_id}")
            if span.get("latestRace", {}).get("sessionId") != series_latest["sessionId"]:
                fail(f"Series-filtered latest race mismatch for {name} / {series_id}")
            expected_prefix = "/races/" if series_id == "series_indy_nxt" else "/career/race/"
            if not span["latestRace"]["raceHref"].startswith(expected_prefix):
                fail(f"Series-filtered race href uses the wrong page family for {name} / {series_id}")
        dominant_id = max(
            by_series,
            key=lambda series_id: (
                len(by_series[series_id]),
                max(str(row["raceDate"]) for row in by_series[series_id]),
                series_id,
            ),
        )
        if venue["dominantChapter"]["seriesId"] != dominant_id or venue["dominantChapter"]["seriesName"] != series[dominant_id]["name"]:
            fail(f"Dominant chapter tie-break changed for {name}")
        if set(venue["confidence"].values()) - {"observed_exact", "unknown"}:
            fail(f"Atlas point confidence class is invalid for {name}")
        if venue["confidence"]["coordinates"] != "observed_exact" or venue["confidence"]["raceCount"] != "observed_exact":
            fail(f"Atlas point source facts must be observed_exact for {name}")
        point = venue["projected"]
        if not (0 <= point["x"] <= canvas["width"] and 0 <= point["y"] <= canvas["height"]):
            fail(f"Projected venue lies outside the computed crop: {name}")
        if not venue.get("coordinateSources") or not all(" | https://" in source for source in venue["coordinateSources"]):
            fail(f"Coordinate lineage is incomplete for {name}")

    source_paths = {row["path"]: row for row in atlas.get("sourceRefs", [])}
    required_sources = {str(path.relative_to(ROOT)) for path in (NATURAL_EARTH, SOURCE_NOTE, REQUIREMENTS, FACTS, LEDGER, DATASET)}
    if not required_sources <= set(source_paths):
        fail(f"Atlas source lineage is incomplete: {sorted(required_sources - set(source_paths))}")
    for path, ref in source_paths.items():
        source = ROOT / path
        if not source.exists() or sha256(source) != ref.get("sha256"):
            fail(f"Atlas source checksum is stale for {path}")

    serialized = OUTPUT.read_text()
    if "54649.3" in serialized or '"travel"' in serialized or '"travelMiles"' in serialized:
        fail("Travel displacement or routes leaked into the venue-only atlas product")
    if atlas.get("confidenceClasses") != ["observed_exact", "observed_lower_bound", "modeled_range", "unknown"]:
        fail("Atlas must preserve A2's four confidence-class vocabulary")

    ui_source = (ROOT / "src/screens/careerAtlas.tsx").read_text()
    for network_token in ("fetch(", "XMLHttpRequest", "axios", "http://", "https://"):
        if network_token in ui_source:
            fail(f"Career atlas UI contains a runtime-network path: {network_token}")

    print(
        "career atlas validation passed: "
        f"34 sourced venues / 145 canonical races / 127-feature full-world texture / byte-stable rebuild"
    )


if __name__ == "__main__":
    main()
