#!/usr/bin/env python3
"""Build the deterministic, package-ready Bryce career venue atlas."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
from collections import defaultdict
from pathlib import Path
from typing import Any, Callable
from urllib.parse import quote

try:
    import PIL
    from PIL import Image, ImageDraw
except ModuleNotFoundError as error:
    raise SystemExit(
        "Career atlas generation requires Pillow. Install "
        "analysis/career-atlas/requirements.txt in the selected Python environment."
    ) from error


ROOT = Path(__file__).resolve().parents[3]
LANE = ROOT / "analysis/career-atlas"
NATURAL_EARTH = LANE / "data/ne_110m_land.geojson"
NATURAL_EARTH_SOURCE = LANE / "data/SOURCE.md"
REQUIREMENTS = LANE / "requirements.txt"
VENUE_FACTS = ROOT / "analysis/career-life-stats/data/venue_facts.csv"
RACE_LEDGER = ROOT / "analysis/career-life-stats/output/tables/miles_raced.csv"
LIFE_STATS_RESEARCH = ROOT / "analysis/career-life-stats/RESEARCH.md"
CANONICAL_DATASET = ROOT / "data/career/career.dataset.json"
DEFAULT_OUTPUT = LANE / "output/atlas.json"
DEFAULT_GLOBE_TEXTURE = LANE / "output/world_land_texture.png"
BRYCE_ID = "driver_bryce_aron"
CANVAS_WIDTH = 1000
LONGITUDE_PADDING_RATIO = 0.055
LATITUDE_PADDING_RATIO = 0.10
MIN_PADDING_DEGREES = 4.0
SIMPLIFY_TOLERANCE_PX = 0.35
NATURAL_EARTH_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19"
NATURAL_EARTH_SHA256 = "9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9"
GLOBE_TEXTURE_WIDTH = 1024
GLOBE_TEXTURE_HEIGHT = 512
GLOBE_TEXTURE_AA_SCALE = 2
PINNED_PILLOW_VERSION = "12.2.0"

SERIES_SHORT = {
    "series_frp_f1600": "F1600",
    "series_formula_ford": "Formula Ford",
    "series_gb3": "GB3",
    "series_euroformula_open": "Euroformula",
    "series_froc": "FR Oceania",
    "series_imsa_weathertech": "IMSA",
    "series_indy_nxt": "INDY NXT",
}

COUNTRY_REGION = {
    "Austria": "Europe",
    "Belgium": "Europe",
    "France": "Europe",
    "Hungary": "Europe",
    "Italy": "Europe",
    "New Zealand": "Oceania",
    "Portugal": "Europe",
    "United Kingdom": "Europe",
    "United States": "North America",
}


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="") as handle:
        return list(csv.DictReader(handle))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def source_ref(path: Path, note: str) -> dict[str, str]:
    return {"path": rel(path), "sha256": sha256(path), "note": note}


def unwrap_texture_ring(ring: list[list[float]]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    previous: float | None = None
    for raw_lon, raw_lat in ring:
        lon = float(raw_lon)
        if previous is not None:
            lon += 360.0 * round((previous - lon) / 360.0)
        points.append((lon, float(raw_lat)))
        previous = lon
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    return points


def rasterize_polar_ring(
    draw: ImageDraw.ImageDraw,
    ring: list[tuple[float, float]],
    width: int,
    height: int,
) -> None:
    """Fill an antimeridian-closing polar polygon one longitude at a time."""
    edges = list(zip(ring, ring[1:]))
    if ring[0] != ring[-1]:
        edges.append((ring[-1], ring[0]))
    for pixel_x in range(width):
        longitude = (pixel_x + 0.5) / width * 360.0 - 180.0
        intersections: list[float] = []
        for (left_lon, left_lat), (right_lon, right_lat) in edges:
            if left_lon == right_lon:
                continue
            if not (
                left_lon <= longitude < right_lon
                or right_lon <= longitude < left_lon
            ):
                continue
            ratio = (longitude - left_lon) / (right_lon - left_lon)
            intersections.append(left_lat + ratio * (right_lat - left_lat))
        intersections.sort(reverse=True)
        if len(intersections) % 2:
            raise ValueError(f"Polar land scanline has odd intersection count at {longitude}")
        for index in range(0, len(intersections), 2):
            top = max(0, math.floor((90.0 - intersections[index]) / 180.0 * height))
            bottom = min(height - 1, math.ceil((90.0 - intersections[index + 1]) / 180.0 * height))
            draw.line([(pixel_x, top), (pixel_x, bottom)], fill=255, width=1)


def world_land_texture(natural_earth: dict[str, Any]) -> bytes:
    """Rasterize the full public-domain land set into a deterministic mask.

    The power-of-two equirectangular texture wraps horizontally in WebGL; a
    2x antialias pass keeps the orthographic limb quiet without shipping a map
    library or fetching tiles at runtime.
    """
    if PIL.__version__ != PINNED_PILLOW_VERSION:
        raise RuntimeError(
            f"Deterministic globe texture requires Pillow {PINNED_PILLOW_VERSION}; found {PIL.__version__}. "
            f"Install {rel(REQUIREMENTS)}."
        )
    render_width = GLOBE_TEXTURE_WIDTH * GLOBE_TEXTURE_AA_SCALE
    render_height = GLOBE_TEXTURE_HEIGHT * GLOBE_TEXTURE_AA_SCALE
    image = Image.new("L", (render_width, render_height), 0)
    draw = ImageDraw.Draw(image)

    def pixels(points: list[tuple[float, float]], shift: float) -> list[tuple[float, float]]:
        return [
            (
                (lon + shift + 180.0) / 360.0 * render_width,
                (90.0 - lat) / 180.0 * render_height,
            )
            for lon, lat in points
        ]

    for feature in natural_earth["features"]:
        rings = feature["geometry"]["coordinates"]
        if not rings:
            continue
        raw_outer = [(float(lon), float(lat)) for lon, lat in rings[0]]
        if (
            not rings[1:]
            and min(point[0] for point in raw_outer) <= -180.0
            and max(point[0] for point in raw_outer) >= 180.0
            and min(point[1] for point in raw_outer) <= -89.0
        ):
            # Antarctica's mainland ring closes through explicit +180/-180
            # South-Pole vertices. A longitude scanline fill respects that
            # polar closure without introducing an arbitrary meridian cut.
            rasterize_polar_ring(draw, raw_outer, render_width, render_height)
            continue
        outer = unwrap_texture_ring(rings[0])
        if len(outer) < 3:
            continue
        outer_mean = sum(point[0] for point in outer) / len(outer)
        holes: list[list[tuple[float, float]]] = []
        for raw_hole in rings[1:]:
            hole = unwrap_texture_ring(raw_hole)
            if len(hole) < 3:
                continue
            hole_mean = sum(point[0] for point in hole) / len(hole)
            alignment = 360.0 * round((outer_mean - hole_mean) / 360.0)
            holes.append([(lon + alignment, lat) for lon, lat in hole])

        for shift in (-720.0, -360.0, 0.0, 360.0, 720.0):
            shifted_min = min(point[0] + shift for point in outer)
            shifted_max = max(point[0] + shift for point in outer)
            if shifted_max < -180.0 or shifted_min > 180.0:
                continue
            draw.polygon(pixels(outer, shift), fill=255)
            for hole in holes:
                draw.polygon(pixels(hole, shift), fill=0)

    image = image.resize((GLOBE_TEXTURE_WIDTH, GLOBE_TEXTURE_HEIGHT), Image.Resampling.LANCZOS)
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True, compress_level=9)
    return output.getvalue()


def minimal_longitude_interval(longitudes: list[float]) -> tuple[float, float]:
    """Return the smallest circular longitude interval containing all points."""
    values = sorted(lon % 360.0 for lon in longitudes)
    if not values:
        raise ValueError("Career atlas needs at least one longitude")
    gaps: list[tuple[float, int]] = []
    for index, value in enumerate(values):
        following = values[(index + 1) % len(values)] + (360.0 if index == len(values) - 1 else 0.0)
        gaps.append((following - value, index))
    _, largest_index = max(gaps, key=lambda item: (item[0], -item[1]))
    start = values[(largest_index + 1) % len(values)]
    end = values[largest_index]
    if end < start:
        end += 360.0
    return start, end


def career_crop(facts: list[dict[str, str]]) -> dict[str, float]:
    start, end = minimal_longitude_interval([float(row["lon"]) for row in facts])
    lon_span = end - start
    latitudes = [float(row["lat"]) for row in facts]
    lat_min, lat_max = min(latitudes), max(latitudes)
    lat_span = lat_max - lat_min
    lon_pad = max(MIN_PADDING_DEGREES, lon_span * LONGITUDE_PADDING_RATIO)
    lat_pad = max(MIN_PADDING_DEGREES, lat_span * LATITUDE_PADDING_RATIO)
    return {
        "lonMin": round(start - lon_pad, 6),
        "lonMax": round(end + lon_pad, 6),
        "latMin": round(max(-90.0, lat_min - lat_pad), 6),
        "latMax": round(min(90.0, lat_max + lat_pad), 6),
        "paddingLongitudeDegrees": round(lon_pad, 6),
        "paddingLatitudeDegrees": round(lat_pad, 6),
    }


def longitude_in_crop(lon: float, crop: dict[str, float]) -> float:
    center = (crop["lonMin"] + crop["lonMax"]) / 2.0
    return lon + 360.0 * round((center - lon) / 360.0)


def unwrap_ring(ring: list[list[float]], crop: dict[str, float]) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    previous: float | None = None
    for raw_lon, raw_lat in ring:
        lon = longitude_in_crop(float(raw_lon), crop)
        if previous is not None:
            lon += 360.0 * round((previous - lon) / 360.0)
        points.append((lon, float(raw_lat)))
        previous = lon
    if len(points) > 1 and points[0] == points[-1]:
        points.pop()
    if not points:
        return points
    mean_lon = sum(point[0] for point in points) / len(points)
    crop_center = (crop["lonMin"] + crop["lonMax"]) / 2.0
    shift = 360.0 * round((crop_center - mean_lon) / 360.0)
    return [(lon + shift, lat) for lon, lat in points]


def clip_edge(
    polygon: list[tuple[float, float]],
    inside: Callable[[tuple[float, float]], bool],
    intersect: Callable[[tuple[float, float], tuple[float, float]], tuple[float, float]],
) -> list[tuple[float, float]]:
    if not polygon:
        return []
    output: list[tuple[float, float]] = []
    previous = polygon[-1]
    previous_inside = inside(previous)
    for current in polygon:
        current_inside = inside(current)
        if current_inside:
            if not previous_inside:
                output.append(intersect(previous, current))
            output.append(current)
        elif previous_inside:
            output.append(intersect(previous, current))
        previous, previous_inside = current, current_inside
    return output


def clip_polygon(points: list[tuple[float, float]], crop: dict[str, float]) -> list[tuple[float, float]]:
    def vertical(bound: float, left: tuple[float, float], right: tuple[float, float]) -> tuple[float, float]:
        if right[0] == left[0]:
            return bound, left[1]
        ratio = (bound - left[0]) / (right[0] - left[0])
        return bound, left[1] + ratio * (right[1] - left[1])

    def horizontal(bound: float, left: tuple[float, float], right: tuple[float, float]) -> tuple[float, float]:
        if right[1] == left[1]:
            return left[0], bound
        ratio = (bound - left[1]) / (right[1] - left[1])
        return left[0] + ratio * (right[0] - left[0]), bound

    clipped = points
    clipped = clip_edge(clipped, lambda p: p[0] >= crop["lonMin"], lambda a, b: vertical(crop["lonMin"], a, b))
    clipped = clip_edge(clipped, lambda p: p[0] <= crop["lonMax"], lambda a, b: vertical(crop["lonMax"], a, b))
    clipped = clip_edge(clipped, lambda p: p[1] >= crop["latMin"], lambda a, b: horizontal(crop["latMin"], a, b))
    clipped = clip_edge(clipped, lambda p: p[1] <= crop["latMax"], lambda a, b: horizontal(crop["latMax"], a, b))
    return clipped


def project(point: tuple[float, float], crop: dict[str, float], canvas_height: int) -> tuple[float, float]:
    lon, lat = point
    x = (lon - crop["lonMin"]) / (crop["lonMax"] - crop["lonMin"]) * CANVAS_WIDTH
    y = (crop["latMax"] - lat) / (crop["latMax"] - crop["latMin"]) * canvas_height
    return x, y


def point_line_distance(point: tuple[float, float], left: tuple[float, float], right: tuple[float, float]) -> float:
    dx, dy = right[0] - left[0], right[1] - left[1]
    if dx == 0 and dy == 0:
        return math.hypot(point[0] - left[0], point[1] - left[1])
    ratio = max(0.0, min(1.0, ((point[0] - left[0]) * dx + (point[1] - left[1]) * dy) / (dx * dx + dy * dy)))
    nearest = left[0] + ratio * dx, left[1] + ratio * dy
    return math.hypot(point[0] - nearest[0], point[1] - nearest[1])


def rdp(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) <= 2:
        return points
    maximum, maximum_index = -1.0, 0
    for index in range(1, len(points) - 1):
        distance = point_line_distance(points[index], points[0], points[-1])
        if distance > maximum:
            maximum, maximum_index = distance, index
    if maximum <= tolerance:
        return [points[0], points[-1]]
    left = rdp(points[: maximum_index + 1], tolerance)
    right = rdp(points[maximum_index:], tolerance)
    return left[:-1] + right


def simplify_ring(points: list[tuple[float, float]], tolerance: float) -> list[tuple[float, float]]:
    if len(points) <= 4:
        return points
    first_index, second_index, maximum = 0, 1, -1.0
    for left in range(len(points)):
        for right in range(left + 1, len(points)):
            distance = (points[left][0] - points[right][0]) ** 2 + (points[left][1] - points[right][1]) ** 2
            if distance > maximum:
                first_index, second_index, maximum = left, right, distance
    if first_index > second_index:
        first_index, second_index = second_index, first_index
    chain_a = points[first_index : second_index + 1]
    chain_b = points[second_index:] + points[: first_index + 1]
    simplified = rdp(chain_a, tolerance)[:-1] + rdp(chain_b, tolerance)[:-1]
    return simplified if len(simplified) >= 3 else points


def number(value: float) -> str:
    rendered = f"{value:.1f}"
    return rendered[:-2] if rendered.endswith(".0") else rendered


def build_geometry(natural_earth: dict[str, Any], crop: dict[str, float]) -> dict[str, Any]:
    lon_span = crop["lonMax"] - crop["lonMin"]
    lat_span = crop["latMax"] - crop["latMin"]
    canvas_height = max(1, round(CANVAS_WIDTH * lat_span / lon_span))
    paths: list[str] = []
    source_points = 0
    clipped_points = 0
    simplified_points = 0
    ring_count = 0
    for feature in natural_earth["features"]:
        if feature.get("geometry", {}).get("type") != "Polygon":
            raise ValueError("Natural Earth 110m land input must contain Polygon features only")
        for raw_ring in feature["geometry"]["coordinates"]:
            source_points += len(raw_ring)
            unwrapped = unwrap_ring(raw_ring, crop)
            for offset in (-360.0, 0.0, 360.0):
                shifted = [(lon + offset, lat) for lon, lat in unwrapped]
                if not shifted or max(point[0] for point in shifted) < crop["lonMin"] or min(point[0] for point in shifted) > crop["lonMax"]:
                    continue
                clipped = clip_polygon(shifted, crop)
                if len(clipped) < 3:
                    continue
                clipped_points += len(clipped)
                projected = [project(point, crop, canvas_height) for point in clipped]
                simplified = simplify_ring(projected, SIMPLIFY_TOLERANCE_PX)
                if len(simplified) < 3:
                    continue
                simplified_points += len(simplified)
                ring_count += 1
                commands = [f"M{number(simplified[0][0])} {number(simplified[0][1])}"]
                commands.extend(f"L{number(x)} {number(y)}" for x, y in simplified[1:])
                commands.append("Z")
                paths.append("".join(commands))
    land_path = "".join(paths)
    return {
        "projection": "equirectangular_wrapped",
        "crop": crop,
        "canvas": {"width": CANVAS_WIDTH, "height": canvas_height},
        "simplification": {"method": "closed_ring_ramer_douglas_peucker", "tolerancePx": SIMPLIFY_TOLERANCE_PX},
        "sourceFeatureCount": len(natural_earth["features"]),
        "sourcePointCount": source_points,
        "clippedPointCount": clipped_points,
        "simplifiedPointCount": simplified_points,
        "ringCount": ring_count,
        "fillRule": "evenodd",
        "landPath": land_path,
        "landPathSha256": hashlib.sha256(land_path.encode()).hexdigest(),
    }


def race_target(row: dict[str, Any]) -> dict[str, str]:
    return {
        "sessionId": row["sessionId"],
        "eventId": row["eventId"],
        "raceDate": row["raceDate"],
        "raceLabel": row["raceLabel"],
        "raceHref": (
            f"/races/{quote(row['sessionId'])}"
            if row["seriesId"] == "series_indy_nxt"
            else f"/career/race/{quote(row['sessionId'])}"
        ),
    }


def series_span(rows: list[dict[str, Any]], series_id: str, series_name: str) -> dict[str, Any]:
    matches = [row for row in rows if row["seriesId"] == series_id]
    years = sorted({row["seasonYear"] for row in matches})
    finishes = [int(row["finishPosition"]) for row in matches if row["finishPosition"] is not None]
    latest = max(matches, key=lambda row: row["sortKey"])
    return {
        "seriesId": series_id,
        "seriesName": series_name,
        "seriesShort": SERIES_SHORT[series_id],
        "raceCount": len(matches),
        "firstYear": years[0],
        "lastYear": years[-1],
        "firstRaceDate": min(row["raceDate"] for row in matches),
        "latestRaceDate": max(row["raceDate"] for row in matches),
        "bestFinish": min(finishes) if finishes else None,
        "latestRace": race_target(latest),
    }


def build_venues(facts: list[dict[str, str]], dataset: dict[str, Any], ledger: list[dict[str, str]], crop: dict[str, float], canvas_height: int) -> list[dict[str, Any]]:
    sessions = {row["id"]: row for row in dataset["sessions"]}
    events = {row["id"]: row for row in dataset["events"]}
    series = {row["id"]: row for row in dataset["series"]}
    results = {row["sessionId"]: row for row in dataset["results"] if row.get("driverId") == BRYCE_ID}
    facts_by_track = {row["trackId"]: row for row in facts}
    grouped_facts: dict[str, list[dict[str, str]]] = defaultdict(list)
    for fact in facts:
        grouped_facts[fact["trackName"]].append(fact)

    venue_races: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ledger_row in ledger:
        session = sessions[ledger_row["sessionId"]]
        event = events[session["eventId"]]
        fact = facts_by_track[event["trackId"]]
        result = results[session["id"]]
        if fact["trackName"] != ledger_row["trackName"]:
            raise ValueError(f"A2 ledger track mismatch for {session['id']}")
        start = session.get("actualStart") or session.get("scheduledStart") or event.get("eventStartDate") or ""
        venue_races[fact["trackName"]].append(
            {
                "sessionId": session["id"],
                "eventId": event["id"],
                "seriesId": event["seriesId"],
                "seasonYear": int(event["seasonYear"]),
                "raceDate": event.get("eventStartDate") or str(start)[:10],
                "sortKey": (str(start), session["id"]),
                "finishPosition": result.get("finishPosition"),
                "raceLabel": f"{event['name']} · {session.get('sessionName') or 'Race'}",
            }
        )

    venues: list[dict[str, Any]] = []
    for track_name in sorted(venue_races):
        races = venue_races[track_name]
        venue_facts = grouped_facts[track_name]
        coordinates = {(float(row["lat"]), float(row["lon"]), row["country"]) for row in venue_facts}
        if len(coordinates) != 1:
            raise ValueError(f"Physical venue coordinates disagree for {track_name}")
        lat, lon, country = next(iter(coordinates))
        if country not in COUNTRY_REGION:
            raise ValueError(f"Career atlas needs a deterministic region for {country}")
        spans = [series_span(races, series_id, series[series_id]["name"]) for series_id in sorted({row["seriesId"] for row in races})]
        spans.sort(key=lambda row: (row["firstRaceDate"], row["seriesId"]))
        dominant = max(spans, key=lambda row: (row["raceCount"], row["latestRaceDate"], row["seriesId"]))
        latest = max(races, key=lambda row: row["sortKey"])
        finishes = [int(row["finishPosition"]) for row in races if row["finishPosition"] is not None]
        x, y = project((longitude_in_crop(lon, crop), lat), crop, canvas_height)
        venues.append(
            {
                "venueId": "venue_" + re.sub(r"[^a-z0-9]+", "_", track_name.lower().replace("&", "and")).strip("_"),
                "trackName": track_name,
                "trackIds": sorted(row["trackId"] for row in venue_facts),
                "country": country,
                "region": COUNTRY_REGION[country],
                "lat": lat,
                "lon": lon,
                "projected": {"x": round(x, 3), "y": round(y, 3)},
                "raceCount": len(races),
                "firstYear": min(row["seasonYear"] for row in races),
                "lastYear": max(row["seasonYear"] for row in races),
                "bestFinish": min(finishes) if finishes else None,
                "seriesSpans": spans,
                "dominantChapter": dominant,
                "latestRace": race_target(latest),
                "coordinateSources": sorted({row["coordsSource"] for row in venue_facts}),
                "confidence": {
                    "coordinates": "observed_exact",
                    "raceCount": "observed_exact",
                    "seriesSpans": "observed_exact",
                    "bestFinish": "observed_exact" if finishes else "unknown",
                    "latestRace": "observed_exact",
                },
            }
        )
    return venues


def build_payload(texture_bytes: bytes | None = None) -> dict[str, Any]:
    natural_earth = json.loads(NATURAL_EARTH.read_text())
    texture_bytes = texture_bytes if texture_bytes is not None else world_land_texture(natural_earth)
    facts = read_csv(VENUE_FACTS)
    ledger = read_csv(RACE_LEDGER)
    dataset = json.loads(CANONICAL_DATASET.read_text())
    if sha256(NATURAL_EARTH) != NATURAL_EARTH_SHA256:
        raise ValueError("Vendored Natural Earth geometry does not match the pinned source")
    if len(ledger) != 145 or any(row["confidenceClass"] != "observed_exact" for row in ledger):
        raise ValueError("Career atlas must consume all 145 exact A2 driver-race ledger rows")
    crop = career_crop(facts)
    geometry = build_geometry(natural_earth, crop)
    venues = build_venues(facts, dataset, ledger, crop, geometry["canvas"]["height"])
    return {
        "schemaVersion": "brycecast.careerAtlas.v3",
        "naturalEarth": {
            "dataset": "Natural Earth 1:110m land polygons",
            "sourceCommit": NATURAL_EARTH_COMMIT,
            "sourceUrl": f"https://github.com/nvkelso/natural-earth-vector/blob/{NATURAL_EARTH_COMMIT}/geojson/ne_110m_land.geojson",
            "downloadPage": "https://www.naturalearthdata.com/downloads/110m-physical-vectors/",
            "license": "public_domain",
            "licenseUrl": "https://www.naturalearthdata.com/about/terms-of-use/",
            "sourceSha256": NATURAL_EARTH_SHA256,
        },
        "geometry": geometry,
        "globe": {
            "projection": "orthographic",
            "texture": {
                "path": rel(DEFAULT_GLOBE_TEXTURE),
                "width": GLOBE_TEXTURE_WIDTH,
                "height": GLOBE_TEXTURE_HEIGHT,
                "format": "png_grayscale_land_mask",
                "sha256": hashlib.sha256(texture_bytes).hexdigest(),
                "sourceFeatureCount": len(natural_earth["features"]),
            },
            "defaultCenter": {"longitude": -35.0, "latitude": 20.0},
            "zoom": {"min": 1.0, "max": 32.0},
        },
        "venues": venues,
        "venueCount": len(venues),
        "raceCount": sum(row["raceCount"] for row in venues),
        "confidenceClasses": ["observed_exact", "observed_lower_bound", "modeled_range", "unknown"],
        "caveats": [
            "Venue coordinates and race counts are observed_exact from A2 and canonical race rows.",
            "Best finish is shown only where the canonical result carries a classified finishing position.",
            "Series and region controls only filter observed venue race rows. Routes, travel-mode filters, mileage layers, and actual-travel claims remain outside this atlas.",
        ],
        "sourceRefs": [
            source_ref(NATURAL_EARTH, "Pinned Natural Earth 110m public-domain land polygons."),
            source_ref(NATURAL_EARTH_SOURCE, "Natural Earth source, commit, checksum, and public-domain terms."),
            source_ref(REQUIREMENTS, f"Pinned Pillow {PINNED_PILLOW_VERSION} texture-rendering dependency."),
            source_ref(VENUE_FACTS, "A2 track identity and sourced coordinates for every career venue."),
            source_ref(RACE_LEDGER, "A2 personally attributable ledger covering all 145 canonical race rows."),
            source_ref(LIFE_STATS_RESEARCH, "A2 metric-grain and confidence-class contracts."),
            source_ref(CANONICAL_DATASET, "Canonical race identity, series, date, and classified finish fields."),
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--texture-output", type=Path, default=DEFAULT_GLOBE_TEXTURE)
    args = parser.parse_args()
    natural_earth = json.loads(NATURAL_EARTH.read_text())
    texture_bytes = world_land_texture(natural_earth)
    payload = build_payload(texture_bytes)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    args.texture_output.parent.mkdir(parents=True, exist_ok=True)
    args.texture_output.write_bytes(texture_bytes)
    print(
        "career atlas build passed: "
        f"{payload['venueCount']} venues / {payload['raceCount']} races / "
        f"{payload['geometry']['simplifiedPointCount']} projected land points / "
        f"{len(texture_bytes)}-byte full-world globe texture"
    )


if __name__ == "__main__":
    main()
