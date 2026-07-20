/** derive-section-anchors — turn the data lake's decoded timing geometry into the
 *  authoritative per-venue section-anchor DISTANCES, and pin the section
 *  boundaries that the curated files could not (Mid-Ohio, Milwaukee).
 *
 *  PROVENANCE / THE PROBE VERDICT (timing-map probe, task #32).
 *  Two independent third-party sources describe the same physical timing loops:
 *    (a) the RaceTools static track-map packages — the data lake catalog
 *        `data/historical-data-lake/catalog/track-map-definitions.json`, whose
 *        `timingSections[].lapDistance` is a loop's distance-along-track in
 *        METRES; and
 *    (b) the sanctioning feed's decoded `$T`/`$U` geometry — the semantic layer's
 *        per-session `geometry.loopDistances{}`, a loop's cumulative distance
 *        around the lap in FEED UNITS (1/12 ft = 1 inch = 0.0254 m; the S/F loop
 *        is 0).
 *  The probe proved these are ONE loop namespace and agree to the inch: Gateway
 *  map metres == WWTR feed units × 0.0254 to 0.00 m across every shared loop.
 *
 *  WHY THE FEED IS AUTHORITATIVE. The maps are loop-poor at exactly the venues
 *  the curated files gave up on: the real Mid-Ohio map package carries only a
 *  whole-lap section (S01) and no intermediate loops, and there is no
 *  venue-named Milwaukee map at all. The FEED carries the full intermediate loop
 *  inventory for both (Mid-Ohio: I1…I13, 19 mainline loops; Milwaukee: T1, SS1,
 *  T2, BS, T3, SS2, T4, FS). So the feed `loopDistances` are the authoritative
 *  source of section boundaries; the map is corroboration where it has loops.
 *
 *  THE JOIN. Map ↔ venue is joined by INI Track.Name (never the archive
 *  filename — RaceTools filenames are unreliable, per the catalog consumerGuard)
 *  plus a lap-length sanity check, which together reject the probe's wrong-config
 *  twins: Mid-Ohio.zip carries "Streets of Toronto", Arlington.zip carries
 *  "Phoenix Raceway", BelleIsle_2018 carries the old 2.35-mi "Detroit" layout
 *  (not the 1.64-mi downtown circuit the series runs), and the IMS road-course
 *  map is a 3.41-mi config that is not the NXT layout — all refused. Map [GPS]
 *  origins stay untrusted (gpsOriginGuard); we anchor by distance-along-track.
 *
 *  WHAT THIS EMITS.
 *   1. A per-venue derivation table (derived vs curated `measuredLengthMi`
 *      deltas) for every curated venue that has feed geometry.
 *   2. Map↔feed corroboration, flagging any per-loop disagreement over 0.1%.
 *   3. Outline-position handling: for map-polyline outlines (Detroit, Arlington,
 *      St. Pete) the derived normalized distance IS the outline-t and can be
 *      applied directly; for DISTORTED outlines (WWTR, Mid-Ohio, ovals) the
 *      retraced arc-length is not proportional to real distance, so those keep
 *      their curated arc-calibrated positions — this script emits the derived
 *      DISTANCES as authoritative and FLAGS where curated spacing diverges from
 *      real-distance spacing.
 *   4. The immediate win: emit-ready section sets for Mid-Ohio + Milwaukee, whose
 *      mid-lap boundaries are pinned to the feed loop distances (anchored at each
 *      venue's visually-verified S/F outline datum), with per-section
 *      `measuredLengthMi` and `startLoop`/`endLoop` provenance.
 *   5. Debug overlays for Mid-Ohio + Milwaukee for visual QA.
 *
 *  Outputs land in ~/.brycecast/reports/anchor-derivation/. This is a dev/report
 *  helper: it is not imported by the app and it does not write the .ts files —
 *  the emit-ready sets are transcribed by hand after the overlay QA passes.
 *
 *  Usage: node scripts/derive-section-anchors.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { gunzipSync } from 'node:zlib';

const repoRoot = process.cwd();
const CATALOG = 'data/historical-data-lake/catalog/track-map-definitions.json';
const SEMANTIC_OUT = 'analysis/semantic-layer/output';
const OUT_DIR = path.join(os.homedir(), '.brycecast/reports/anchor-derivation');

const FEED_UNIT_METRES = 0.0254; // 1 feed unit = 1/12 ft = 1 inch
const FEED_UNITS_PER_MILE = 63360; // 5280 ft × 12
const METRES_PER_MILE = 1609.344;
const CORROBORATION_TOLERANCE = 0.001; // 0.1% of lap

const wrap = (v) => ((v % 1) + 1) % 1;
const round4 = (v) => Number(v.toFixed(4));

/* ------------------------------------------------------------------ venues */

/** Curated venue registry. `feedVenue` is the lake `session.venue`; `iniTrackName`
 *  is the map-package join key (exact) with `expectedLapMi` as the wrong-config
 *  guard; `outline` is 'map_polyline' (retraced from the map centreline, so
 *  outline arc-length IS real distance and derived-t applies directly) or
 *  'distorted' (OSM/retraced oval or road course whose arc-length is not
 *  proportional to real distance, so curated arc-calibration is retained).
 *  `sfOutlineT` is the visually-verified S/F datum on the outline, used only to
 *  place the feed-derived distances for the two pinned venues. */
const VENUES = [
  { slug: 'nashville-superspeedway', feedVenue: 'Nashville Superspeedway', iniTrackName: 'Nashville_SuperSpeedway', expectedLapMi: 1.33, outline: 'distorted' },
  { slug: 'world-wide-technology-raceway', feedVenue: 'World Wide Technology Raceway', iniTrackName: 'Gateway Motorsports Park', expectedLapMi: 1.25, outline: 'distorted' },
  { slug: 'iowa-speedway', feedVenue: 'Iowa Speedway', iniTrackName: 'Iowa Speedway', expectedLapMi: 0.894, outline: 'distorted' },
  { slug: 'the-milwaukee-mile', feedVenue: 'Milwaukee Mile', iniTrackName: 'MilwaukeeMile_2024', expectedLapMi: 1.015, outline: 'distorted', pin: true, sfOutlineT: 0.8233 },
  { slug: 'road-america', feedVenue: 'Road America', iniTrackName: 'Road America', expectedLapMi: 4.014, outline: 'distorted' },
  { slug: 'barber-motorsports-park', feedVenue: 'Barber Motorsports Park', iniTrackName: 'Barber Motorsports Park', expectedLapMi: 2.30, outline: 'distorted' },
  { slug: 'portland-international-raceway', feedVenue: 'Portland International Raceway', iniTrackName: 'Portland International Raceway', expectedLapMi: 1.964, outline: 'distorted' },
  { slug: 'weathertech-raceway-laguna-seca', feedVenue: 'WeatherTech Raceway Laguna Seca', iniTrackName: 'WeatherTech Raceway Laguna Seca', expectedLapMi: 2.238, outline: 'distorted' },
  { slug: 'mid-ohio-sports-car-course', feedVenue: 'Mid-Ohio Sports Car Course', iniTrackName: 'Mid-Ohio Sports Car Course', expectedLapMi: 2.258, outline: 'distorted', pin: true, sfOutlineT: 0.7135 },
  { slug: 'streets-of-detroit', feedVenue: 'Detroit Street Circuit', iniTrackName: 'Detroit Street Circuit', expectedLapMi: 1.645, outline: 'map_polyline' },
  { slug: 'streets-of-arlington', feedVenue: null, iniTrackName: 'Arlington2026', expectedLapMi: 2.73, outline: 'map_polyline' },
  { slug: 'streets-of-st-petersburg', feedVenue: 'St Petersburg Street Circuit', iniTrackName: 'StPetersburg', expectedLapMi: 1.80, outline: 'map_polyline' }
];

/** Probe wrong-config refusals, keyed by iniTrackName, with the reason logged
 *  when a candidate is rejected. The exact-iniTrackName join already excludes
 *  most (Mid-Ohio.zip→"Streets of Toronto", Arlington.zip→"Phoenix Raceway");
 *  this backstops the ones whose iniTrackName collides with a real venue. */
const REFUSE_INI = {
  Detroit: 'BelleIsle_2018 carries the old 2.35-mi Belle Isle "Detroit" layout, not the downtown circuit',
  'Indianapolis Road Course': 'IMS road-course map is a 3.41-mi config, not the NXT layout',
  'Streets of Toronto': 'wrong-config twin (Mid-Ohio.zip filename)',
  'Phoenix Raceway': 'wrong-config twin (Arlington.zip filename)'
};

/* ------------------------------------------------------------------ readers */

const readCatalog = () => JSON.parse(fs.readFileSync(path.join(repoRoot, CATALOG), 'utf8'));
const readSummary = () => JSON.parse(fs.readFileSync(path.join(repoRoot, SEMANTIC_OUT, 'loop-crossings-summary.json'), 'utf8'));

/** The representative session's decoded geometry for a feed venue: prefer a race
 *  with the most sections (the richest loop inventory). Geometry is static per
 *  venue across sessions. */
const loadGeometry = (summary, feedVenue) => {
  const candidates = summary.sessions
    .filter((s) => s.venue === feedVenue && s.sectionCount > 0)
    .sort((a, b) => (a.sessionType !== 'race' ? 1 : 0) - (b.sessionType !== 'race' ? 1 : 0) || b.sectionCount - a.sectionCount);
  if (candidates.length === 0) return null;
  const pick = candidates[0];
  const text = gunzipSync(fs.readFileSync(path.join(repoRoot, SEMANTIC_OUT, pick.pack))).toString('utf8');
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (row.record === 'geometry') return { geometry: row, sessionId: pick.id };
  }
  return null;
};

/** The mainline lap chain: the fine `S…` sections that chain S/F → … → S/F in
 *  driving order. This is the loop-to-loop boundary series the official section
 *  families are built from (the aggregate `I…`/`S2`/`S3` rollups and the pit/
 *  trap `T…`/`P…`/`L…` sections are alternates and are excluded). */
const mainlineChain = (geometry) => {
  const fine = geometry.sections.filter((s) => /^S\d/.test(s.name));
  const bySftart = new Map();
  for (const s of fine) {
    if (!bySftart.has(s.startLoop)) bySftart.set(s.startLoop, []);
    bySftart.get(s.startLoop).push(s);
  }
  const chain = [];
  const used = new Set();
  let cursor = 'SF';
  for (let guard = 0; guard < 200; guard += 1) {
    const next = (bySftart.get(cursor) || []).find((s) => !used.has(s.name));
    if (!next) break;
    chain.push(next);
    used.add(next.name);
    cursor = next.endLoop;
    if (cursor === 'SF') break;
  }
  const closed = cursor === 'SF';
  const lapUnits = chain.reduce((sum, s) => sum + s.lengthUnits, 0);
  return { chain, lapUnits, closed };
};

/** Parse the curated .ts section set: confidence, lapLengthMi, and each section's
 *  name/label/startT/endT/measuredLengthMi/startLoop/endLoop (field order varies
 *  across files, so each field is matched independently within the object). */
const parseCurated = (slug) => {
  const file = path.join(repoRoot, `src/assets/tracks/sections/${slug}.ts`);
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, 'utf8');
  const lapMatch = /lapLengthMi:\s*([\d.]+)/.exec(src);
  const confMatch = /confidence:\s*'([^']+)'/.exec(src);
  const sections = [];
  const objectRe = /\{\s*familyId:[^}]*\}/g;
  let obj;
  while ((obj = objectRe.exec(src)) !== null) {
    const body = obj[0];
    const str = (key) => (new RegExp(`${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(body)?.[1] ?? null);
    const num = (key) => {
      const m = new RegExp(`${key}:\\s*([\\d.]+)`).exec(body);
      return m ? Number(m[1]) : null;
    };
    sections.push({
      familyId: str('familyId'),
      sectionName: str('sectionName'),
      label: str('label'),
      startT: num('startT'),
      endT: num('endT'),
      measuredLengthMi: num('measuredLengthMi'),
      startLoop: str('startLoop'),
      endLoop: str('endLoop')
    });
  }
  return { lapLengthMi: lapMatch ? Number(lapMatch[1]) : null, confidence: confMatch ? confMatch[1] : null, sections };
};

/* ------------------------------------------------------------------ map join */

/** Join a venue to its map package by exact INI Track.Name + lap-length sanity,
 *  refusing the probe's wrong-config twins. Returns the richest matching package
 *  (most timing sections) plus its SF-referenced loop distances in metres. */
const joinMap = (catalog, venue) => {
  const reasons = [];
  if (REFUSE_INI[venue.iniTrackName]) {
    return { map: null, loopsMetres: null, reasons: [`refused: ${REFUSE_INI[venue.iniTrackName]}`] };
  }
  const candidates = catalog.maps.filter((m) => m.iniTrackName === venue.iniTrackName);
  const kept = [];
  for (const m of candidates) {
    const len = m.lengthMiles;
    if (len && Math.abs(len - venue.expectedLapMi) / venue.expectedLapMi > 0.02) {
      reasons.push(`skipped ${m.packageSha256.slice(0, 8)} (${m.sourceViewPath.split('/').pop()}): lengthMiles ${len} ≠ expected ${venue.expectedLapMi}`);
      continue;
    }
    kept.push(m);
  }
  if (kept.length === 0) {
    return { map: null, loopsMetres: null, reasons: reasons.length ? reasons : ['no venue-named map package'] };
  }
  const map = kept.sort((a, b) => (b.timingSections?.length ?? 0) - (a.timingSections?.length ?? 0))[0];
  // SF-referenced loop distances (metres), from each section's end loop.
  const raw = new Map();
  const lapMetres = Math.max(...(map.timingSections || []).map((s) => s.lapDistance || 0));
  for (const s of map.timingSections || []) {
    if (s.lapDistance == null) continue;
    if (!raw.has(s.end)) raw.set(s.end, s.lapDistance);
  }
  const sfRaw = raw.get('SF');
  const loopsMetres = new Map();
  if (sfRaw != null && lapMetres > 0) {
    for (const [loop, d] of raw) loopsMetres.set(loop, ((d - sfRaw) % lapMetres + lapMetres) % lapMetres);
  }
  return { map, lapMetres, loopsMetres, reasons };
};

/* ------------------------------------------------- feed loop distances (SF=0) */

const feedLoopsFromSF = (geometry) => {
  const out = new Map();
  for (const [key, value] of Object.entries(geometry.loopDistances)) {
    const loop = key.replace(/\*$/, '');
    if (value < 0) continue; // pit-lane loops (PI/PIC) sit before S/F
    if (/^(PI|PO|PIC|SFP)$/.test(loop)) continue;
    if (!out.has(loop)) out.set(loop, value);
  }
  return out;
};

/* ------------------------------------------------------------ derive per venue */

const deriveVenue = (venue, catalog, summary) => {
  const curated = parseCurated(venue.slug);
  const result = { venue, curated, feed: null, map: null, corroboration: null, lengthDeltas: [], positionFlag: null, emit: null };

  const join = joinMap(catalog, venue);
  result.map = { iniTrackName: venue.iniTrackName, matched: !!join.map, reasons: join.reasons };
  if (join.map) {
    result.map.sha = join.map.packageSha256.slice(0, 12);
    result.map.view = join.map.sourceViewPath.split('/').pop();
    result.map.sections = (join.map.timingSections || []).length;
    result.map.lengthMi = join.map.lengthMiles;
  }

  if (!venue.feedVenue) {
    result.feed = { available: false, note: 'venue absent from the lake (no feed geometry)' };
    return result;
  }
  const geo = loadGeometry(summary, venue.feedVenue);
  if (!geo) {
    result.feed = { available: false, note: 'no decoded geometry in the lake for this venue' };
    return result;
  }
  const { chain, lapUnits, closed } = mainlineChain(geo.geometry);
  const feedLoops = feedLoopsFromSF(geo.geometry);
  const lapMi = lapUnits / FEED_UNITS_PER_MILE;
  result.feed = {
    available: true,
    sessionId: geo.sessionId,
    fineSections: chain.length,
    loopCount: feedLoops.size,
    lapUnits,
    lapMi: round4(lapMi),
    closed,
    chain: chain.map((s) => ({
      name: s.name,
      startLoop: s.startLoop,
      endLoop: s.endLoop,
      units: s.lengthUnits,
      lengthMi: round4(s.lengthUnits / FEED_UNITS_PER_MILE)
    }))
  };

  // --- map↔feed corroboration (report per-loop disagreement over 0.1%) ---
  if (join.loopsMetres && join.loopsMetres.size > 1) {
    const rows = [];
    let maxPct = 0;
    for (const [loop, feedUnits] of feedLoops) {
      const mapM = join.loopsMetres.get(loop);
      if (mapM == null) continue;
      const feedM = feedUnits * FEED_UNIT_METRES;
      const deltaM = mapM - feedM;
      const pct = Math.abs(deltaM) / (join.lapMetres || 1);
      maxPct = Math.max(maxPct, pct);
      rows.push({ loop, feedM: Number(feedM.toFixed(2)), mapM: Number(mapM.toFixed(2)), deltaM: Number(deltaM.toFixed(2)), pct: Number((pct * 100).toFixed(3)) });
    }
    // A CONSTANT delta across every loop is a shared-datum offset (the map's SF
    // reference sits elsewhere) — the section LENGTHS still agree, only absolute
    // positions differ. A VARYING delta is a genuine geometry disagreement.
    const deltas = rows.map((r) => r.deltaM);
    const spread = deltas.length ? Math.max(...deltas) - Math.min(...deltas) : 0;
    const datumOffset = rows.length > 1 && spread / (join.lapMetres || 1) < CORROBORATION_TOLERANCE;
    result.corroboration = {
      sharedLoops: rows.length,
      maxDisagreementPct: Number((maxPct * 100).toFixed(3)),
      classification: datumOffset ? 'shared-datum offset (lengths agree; absolute positions shifted)' : maxPct > CORROBORATION_TOLERANCE ? 'genuine per-loop disagreement (feed authoritative)' : 'agreement within 0.1%',
      datumOffsetM: datumOffset ? Number((deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(2)) : null,
      overTolerance: rows.filter((r) => r.pct > CORROBORATION_TOLERANCE * 100),
      rows
    };
  } else if (join.map) {
    // Whole-lap-only corroboration (loop-poor map): compare lap totals.
    const deltaPct = join.lapMetres ? Math.abs(join.lapMetres - lapMi * METRES_PER_MILE) / join.lapMetres : null;
    result.corroboration = {
      sharedLoops: 0,
      wholeLapOnly: true,
      mapLapM: join.lapMetres ? Number(join.lapMetres.toFixed(2)) : null,
      feedLapM: Number((lapMi * METRES_PER_MILE).toFixed(2)),
      maxDisagreementPct: deltaPct != null ? Number((deltaPct * 100).toFixed(3)) : null
    };
  } else {
    result.corroboration = { sharedLoops: 0, note: 'no map loops to corroborate against; feed is the sole source' };
  }

  // --- length validation: derived vs curated measuredLengthMi ---
  // Only report per-family deltas through a RELIABLE join, never a guessed
  // alignment — a false delta is worse than an honest "not auto-validated".
  if (curated && !closed) {
    result.alignmentBasis = 'feed geometry incomplete (chain does not close at S/F) — not length-validated or pinned';
  } else if (curated) {
    const cumFromSF = (loop) => feedLoops.get(loop);
    const withMeasured = curated.sections.filter((f) => f.measuredLengthMi != null);
    const hasLoopPairs = withMeasured.length > 0 && withMeasured.every((f) => f.startLoop && f.endLoop);

    if (hasLoopPairs) {
      // (1) loop-pair join — the general, exact method (curated stores the loops).
      result.alignmentBasis = 'loop-pair join (curated startLoop/endLoop)';
      for (const fam of withMeasured) {
        if (!feedLoops.has(fam.startLoop) || !feedLoops.has(fam.endLoop)) continue;
        const d = wrap((cumFromSF(fam.endLoop) - cumFromSF(fam.startLoop)) / lapUnits) * lapUnits;
        const derivedMi = d / FEED_UNITS_PER_MILE;
        result.lengthDeltas.push({ sectionName: fam.sectionName, basis: `${fam.startLoop}→${fam.endLoop}`, curatedMi: fam.measuredLengthMi, derivedMi: round4(derivedMi), deltaMi: Number((derivedMi - fam.measuredLengthMi).toFixed(4)) });
      }
    } else if (withMeasured.length > 0) {
      // (2) contiguous best-offset alignment by length fingerprint — accepted only
      // when it fits to <0.005 mi (WWTR's rolled families land at offset 1).
      const fam = curated.sections;
      const feedMi = chain.map((s) => s.lengthUnits / FEED_UNITS_PER_MILE);
      let best = null;
      for (let off = 0; off + fam.length <= chain.length; off += 1) {
        let maxAbs = 0;
        for (let i = 0; i < fam.length; i += 1) maxAbs = Math.max(maxAbs, Math.abs(feedMi[off + i] - (fam[i].measuredLengthMi ?? feedMi[off + i])));
        if (!best || maxAbs < best.maxAbs) best = { off, maxAbs };
      }
      if (best && best.maxAbs < 0.005) {
        result.alignmentBasis = `contiguous fingerprint alignment (offset ${best.off}, skips ${best.off} leading + ${chain.length - best.off - fam.length} trailing untimed)`;
        fam.forEach((f, i) => {
          const s = chain[best.off + i];
          const derivedMi = s.lengthUnits / FEED_UNITS_PER_MILE;
          result.lengthDeltas.push({ sectionName: f.sectionName, basis: `${s.startLoop}→${s.endLoop}`, curatedMi: f.measuredLengthMi, derivedMi: round4(derivedMi), deltaMi: f.measuredLengthMi != null ? Number((derivedMi - f.measuredLengthMi).toFixed(4)) : null });
        });
      } else {
        result.alignmentBasis = `curated families are rolled/renamed/non-contiguous vs feed fine sections — per-family length needs the loop-pair map (best contiguous fit off by ${best ? best.maxAbs.toFixed(3) : '?'} mi)`;
      }
    } else {
      // (3) no curated lengths: derive the whole chain in order (adds coverage).
      const timed = chain.length === curated.sections.length + 1 && chain[0].startLoop === 'SF' ? chain.slice(1) : chain;
      if (timed.length === curated.sections.length) {
        result.alignmentBasis = 'driving-order (curated has no measuredLengthMi — would ADD measured coverage)';
        curated.sections.forEach((f, i) => {
          const s = timed[i];
          result.lengthDeltas.push({ sectionName: f.sectionName, basis: `${s.startLoop}→${s.endLoop}`, curatedMi: null, derivedMi: round4(s.lengthUnits / FEED_UNITS_PER_MILE), deltaMi: null });
        });
      } else {
        result.alignmentBasis = `curated has no measuredLengthMi and feed chain (${chain.length}) does not align 1:1 with families (${curated.sections.length})`;
      }
    }

    // --- outline-position divergence flag ---
    // Compare curated t-span length to the real-distance fraction. On a
    // proportional outline they match; on an arc-calibrated (distorted) outline
    // they diverge — which is the signal to RETAIN the curated positions.
    let maxSpanDelta = 0;
    for (const d of result.lengthDeltas) {
      const fam = curated.sections.find((f) => f.sectionName === d.sectionName);
      if (!fam || fam.startT == null || fam.endT == null || d.derivedMi == null) continue;
      const curatedTLen = wrap(fam.endT - fam.startT) || (fam.endT === fam.startT ? 0 : 1);
      const derivedFrac = d.derivedMi / (curated.lapLengthMi || lapMi);
      maxSpanDelta = Math.max(maxSpanDelta, Math.abs(curatedTLen - derivedFrac));
    }
    result.positionFlag = {
      outline: venue.outline,
      maxSpanDelta: Number(maxSpanDelta.toFixed(4)),
      proportional: maxSpanDelta < 0.002,
      action:
        venue.outline === 'map_polyline'
          ? 'derived-t applies directly (outline is the map centreline)'
          : maxSpanDelta < 0.002
            ? 'outline spacing follows real distance; positions confirmed against feed'
            : 'outline is arc-calibrated (non-proportional); curated positions retained, distances flagged'
    };
  }

  // --- immediate-win emit for the two pinned venues ---
  if (venue.pin && curated) {
    result.emit = buildPinnedSet(venue, curated, chain, feedLoops, lapUnits);
  }

  return result;
};

/** Build the emit-ready section array for a pinned venue: each curated family
 *  keeps its name/label but takes its measured length + boundary loops + startT/
 *  endT from the feed, placed by real distance from the visually-verified S/F
 *  outline datum. The untimed S/F straight (feed S1 SF→first loop) is skipped —
 *  it stays the base outline, exactly as curated. */
const buildPinnedSet = (venue, curated, chain, feedLoops, lapUnits) => {
  // Feed timed sections = the chain minus the untimed frontstretch when the feed
  // has exactly one extra fine section (Mid-Ohio: S1 SF→I1). Milwaukee tiles the
  // full lap, so every fine section is a curated family.
  const timed = chain.length === curated.sections.length + 1 ? chain.slice(1) : chain;
  if (timed.length !== curated.sections.length) {
    return { error: `feed timed sections (${timed.length}) ≠ curated families (${curated.sections.length})` };
  }
  const tOf = (loop) => wrap(venue.sfOutlineT + (feedLoops.get(loop) ?? 0) / lapUnits);
  const sections = curated.sections.map((fam, i) => {
    const s = timed[i];
    return {
      familyId: fam.familyId ?? fam.sectionName,
      sectionName: fam.sectionName,
      label: fam.label,
      startT: round4(tOf(s.startLoop)),
      endT: round4(tOf(s.endLoop)),
      measuredLengthMi: round4(s.lengthUnits / FEED_UNITS_PER_MILE),
      startLoop: s.startLoop,
      endLoop: s.endLoop
    };
  });
  const timedMi = timed.reduce((sum, s) => sum + s.lengthUnits, 0) / FEED_UNITS_PER_MILE;
  const lapMi = lapUnits / FEED_UNITS_PER_MILE;
  return { sections, lapLengthMi: round4(lapMi), timedShare: Number((timedMi / lapMi).toFixed(4)) };
};

/* ------------------------------------------------------------------ rendering */

const parsePoints = (d) => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

const geometryFor = (mainPath) => {
  const points = parsePoints(mainPath);
  const n = points.length;
  const cum = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[n] || 1;
  const pointAtT = (t) => {
    const d = wrap(t) * total;
    let i = 0;
    while (i < n && cum[i + 1] < d) i += 1;
    const a = points[i % n];
    const b = points[(i + 1) % n];
    const segLen = cum[i + 1] - cum[i] || 1;
    const frac = (d - cum[i]) / segLen;
    return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
  };
  return { pointAtT };
};

const spanLen = (start, end) => wrap(end - start) || (end === start ? 0 : 1);
const spanMid = (start, end) => wrap(start + spanLen(start, end) / 2);
const dashesFor = (start, end) =>
  start <= end ? [{ arr: `${end - start} 2`, off: -start }] : [{ arr: `${1 - start} 2`, off: -start }, { arr: `${end} 2`, off: 0 }];

const DIAG = ['#0066cc', '#e09a2f', '#2f9377', '#b05a73', '#5581c2', '#b98a3f', '#2e9ac2', '#7a5bb0', '#c2582e', '#3f8f4f'];

const renderOverlay = (venue, emit) => {
  const asset = JSON.parse(fs.readFileSync(path.join(repoRoot, `src/assets/tracks/${venue.slug}.json`), 'utf8'));
  const [, , vw] = asset.viewBox.split(' ').map(Number);
  const { pointAtT } = geometryFor(asset.mainPath);
  const px = (v) => (v / 760) * vw;
  const spanPaths = emit.sections
    .map((sp, index) => {
      const color = DIAG[index % DIAG.length];
      const paths = dashesFor(sp.startT, sp.endT)
        .map((d) => `<path d="${asset.mainPath}" fill="none" pathLength="1" stroke="${color}" stroke-width="${px(6)}" stroke-linecap="round" stroke-dasharray="${d.arr}" stroke-dashoffset="${d.off}" opacity="0.9"/>`)
        .join('');
      const mid = pointAtT(spanMid(sp.startT, sp.endT));
      const label = `<text x="${mid.x}" y="${mid.y}" text-anchor="middle" dominant-baseline="middle" font-size="${px(12)}" font-family="system-ui" font-weight="700" fill="#111">${index + 1}</text>`;
      return paths + label;
    })
    .join('');
  const cornerMarks = (asset.cornerArcs || [])
    .map((arc, i) => {
      const dot = (p, r, fill) => `<circle cx="${p.x}" cy="${p.y}" r="${px(r)}" fill="${fill}"/>`;
      return dot(arc.apex, 4, '#d62828') + `<text x="${arc.apex.x}" y="${arc.apex.y - px(9)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#d62828">${arc.label ?? `arc${i}`}</text>`;
    })
    .join('');
  const sf = asset.startFinish
    ? `<g transform="translate(${asset.startFinish.x} ${asset.startFinish.y}) rotate(${asset.startFinish.angleDeg + 90})"><line x1="${-px(11)}" x2="${px(11)}" stroke="#f5b63f" stroke-width="${px(5)}" stroke-linecap="round"/></g><text x="${asset.startFinish.x}" y="${asset.startFinish.y + px(16)}" text-anchor="middle" font-size="${px(11)}" font-family="system-ui" fill="#b8860b">S/F</text>`
    : '';
  const legend = emit.sections
    .map((sp, i) => `<div class="row"><span class="sw" style="background:${DIAG[i % DIAG.length]}"></span><b>${i + 1}</b> <code>${sp.sectionName}</code> <span class="t">${sp.startLoop}→${sp.endLoop} · ${sp.measuredLengthMi} mi · t ${sp.startT.toFixed(3)}–${sp.endT.toFixed(3)}</span></div>`)
    .join('');
  return `<section class="v"><h2>${asset.name} <small>(pinned from feed loop distances · ${emit.sections.length} sections · ${(emit.timedShare * 100).toFixed(1)}% of the ${emit.lapLengthMi} mi lap timed)</small></h2>
    <svg viewBox="${asset.viewBox}" width="1360" style="max-width:100%;height:auto;background:#fff;border:1px solid #eee">
      <path d="${asset.mainPath}" fill="none" stroke="#ccc" stroke-width="${px(2)}" stroke-linejoin="round"/>
      ${spanPaths}${sf}${cornerMarks}
    </svg><div class="legend">${legend}</div></section>`;
};

/* ------------------------------------------------------------------ main */

const catalog = readCatalog();
const summary = readSummary();
fs.mkdirSync(OUT_DIR, { recursive: true });

const results = VENUES.map((v) => deriveVenue(v, catalog, summary));

// Console report ----------------------------------------------------------
console.log('\n════════ SECTION-ANCHOR DERIVATION (feed loop distances authoritative) ════════');
for (const r of results) {
  const v = r.venue;
  console.log(`\n■ ${v.slug}  [outline: ${v.outline}]`);
  console.log(`  map join: ini="${v.iniTrackName}" → ${r.map.matched ? `${r.map.sha} ${r.map.view} (${r.map.sections} sections, ${r.map.lengthMi} mi)` : 'NONE'}${r.map.reasons.length ? '  ‹' + r.map.reasons.join('; ') + '›' : ''}`);
  if (!r.feed?.available) {
    console.log(`  feed: — (${r.feed?.note})`);
    continue;
  }
  console.log(`  feed: ${r.feed.sessionId}  chain ${r.feed.fineSections} sections, ${r.feed.loopCount} loops, lap ${r.feed.lapMi} mi${r.feed.closed ? '' : '  ⚠ chain does not close at S/F'}`);
  if (r.corroboration) {
    if (r.corroboration.sharedLoops > 1) {
      const flag = r.corroboration.overTolerance.length ? `⚠ ${r.corroboration.overTolerance.length}/${r.corroboration.sharedLoops} loop(s) over 0.1%` : 'all within 0.1%';
      console.log(`  corroboration: ${r.corroboration.sharedLoops} shared loops, max Δ ${r.corroboration.maxDisagreementPct}% — ${r.corroboration.classification} [${flag}]`);
      if (r.corroboration.datumOffsetM != null) console.log(`      (constant datum offset ${r.corroboration.datumOffsetM} m — section lengths unaffected)`);
      else for (const o of r.corroboration.overTolerance) console.log(`      ⚠ ${o.loop}: feed ${o.feedM}m vs map ${o.mapM}m (Δ ${o.deltaM}m, ${o.pct}%)`);
    } else if (r.corroboration.wholeLapOnly) {
      console.log(`  corroboration: whole-lap only — map ${r.corroboration.mapLapM}m vs feed ${r.corroboration.feedLapM}m (Δ ${r.corroboration.maxDisagreementPct}%, within 0.1%)`);
    } else {
      console.log(`  corroboration: ${r.corroboration.note}`);
    }
  }
  if (r.alignmentBasis) console.log(`  length join: ${r.alignmentBasis}`);
  if (r.lengthDeltas.length) {
    const withCurated = r.lengthDeltas.filter((d) => d.curatedMi != null && d.deltaMi != null);
    if (withCurated.length) {
      const maxDelta = Math.max(...withCurated.map((d) => Math.abs(d.deltaMi)));
      console.log(`  length validation vs curated measuredLengthMi: ${withCurated.length} families, max |Δ| ${maxDelta.toFixed(4)} mi`);
      for (const d of withCurated.filter((d) => Math.abs(d.deltaMi) >= 0.001)) console.log(`      Δ ${d.sectionName}: curated ${d.curatedMi} vs derived ${d.derivedMi} (${d.deltaMi >= 0 ? '+' : ''}${d.deltaMi})`);
      if (withCurated.every((d) => Math.abs(d.deltaMi) < 0.001)) console.log('      ✓ every family reproduced to <0.001 mi (to the inch)');
    } else {
      console.log(`  length: derived lengths available for ${r.lengthDeltas.length} families (curated has none — would ADD measured coverage)`);
    }
  }
  if (r.positionFlag) console.log(`  outline positions: ${r.positionFlag.action} (max span Δ ${r.positionFlag.maxSpanDelta})`);
  if (r.emit && !r.emit.error) console.log(`  ★ PINNED: emit-ready ${r.emit.sections.length} sections, ${(r.emit.timedShare * 100).toFixed(1)}% of the ${r.emit.lapLengthMi} mi lap`);
  if (r.emit?.error) console.log(`  ★ PIN ERROR: ${r.emit.error}`);
}

// Emit-ready sets + overlays ---------------------------------------------
for (const r of results.filter((r) => r.emit && !r.emit.error)) {
  const outJson = path.join(OUT_DIR, `${r.venue.slug}.pinned.json`);
  fs.writeFileSync(outJson, JSON.stringify(r.emit, null, 2));
  const overlay = `<!doctype html><meta charset="utf-8"><title>${r.venue.slug} — pinned section anchors</title>
<style>body{font-family:system-ui;margin:22px;background:#fafafa;color:#1d1d1f}
h1{font-size:19px}h2{font-size:14px;margin:18px 0 8px}h2 small{color:#888;font-weight:400}
.v{background:#fff;border:1px solid #eee;border-radius:12px;padding:16px;margin-bottom:20px}
.legend{margin-top:10px;font-size:12px;display:grid;gap:4px}.row{display:flex;gap:8px;align-items:center}
.sw{width:14px;height:14px;border-radius:3px}code{background:#f2f2f4;padding:1px 5px;border-radius:4px}
.t{color:#888;margin-left:auto}p.note{font-size:12px;color:#666;max-width:80ch}</style>
<h1>Anchor derivation — ${r.venue.slug} pinned from feed loop distances</h1>
<p class="note">Diagnostic colours (one hue per span, numbered in driving order). Acceptance: the gold S/F tick sits on the start/finish straight, each numbered span covers its named turn(s) with the red corner-apex dots inside, and boundaries land on straights. Section boundaries are placed by feed loop distance from the S/F datum; the untimed S/F straight stays the base outline. Not the shipped heat ramp.</p>
${renderOverlay(r.venue, r.emit)}`;
  const outHtml = path.join(OUT_DIR, `${r.venue.slug}-section-debug.html`);
  fs.writeFileSync(outHtml, overlay);
  console.log(`\n  wrote ${outJson}`);
  console.log(`  wrote ${outHtml}`);
}

fs.writeFileSync(path.join(OUT_DIR, 'derivation.json'), JSON.stringify(results, null, 2));
console.log(`\n  wrote ${path.join(OUT_DIR, 'derivation.json')}`);
console.log('\n════════ done ════════\n');
