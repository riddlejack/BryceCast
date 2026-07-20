#!/usr/bin/env node
/**
 * Quali & Practice Lab — run-by-run qualifying timeline (Brief M, first slice).
 *
 * Builds a context pack answering ONE question per covered INDY NXT qualifying
 * session 2024–2026: "how did his qualifying build?" — Bryce's laps in session
 * order, his best-lap staircase, when the session's fastest lap settled, and
 * where his qualifying landed (on-track group rank + combined grid position).
 *
 * Reads SEMANTIC-LAYER outputs (not raw logs), per the Phase 3 charter:
 *   - analysis/semantic-layer/output/sessions/*.ndjson.gz        (2024-25 RaceTools loop-crossing grain)
 *   - analysis/semantic-layer/output/sessions-2026/*.ndjson.gz   (2026 Timing71 event grain)
 *   - analysis/semantic-layer/output/crosswalk/crosswalk-validation.json  (2026 GO gate)
 *   - analysis/semantic-layer/output/crosswalk/identity-crosswalk-2026.json (2026 identity + canonical event)
 * plus the canonical dataset for the AUTHORITATIVE qualifying classification
 * (SCHEMA law: "UI classification must always come from canonical results"):
 *   - data/career/career.dataset.json (qualifyingResults / sessions / events)
 *
 * The run-by-run BUILD is one substrate (semantic layer, its strength: lap
 * grain). The final RANK is one substrate (canonical official qualifying, its
 * strength: the classification). The two never blend within a number.
 *
 * ADAPTER-CONTRACT LAW: the emitted shape is sized for the full Quali &
 * Practice Lab (traffic context on quali laps, theoretical-best composites,
 * track-evolution curves are v2 fields left null here). A v2 producer fills the
 * same shape from richer lake grain with NO UI rework.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');
const laneDir = path.resolve(__dirname, '..');

const SEM_DIR = path.join(repoRoot, 'analysis/semantic-layer/output');
const SESSIONS_2425 = path.join(SEM_DIR, 'sessions');
const SESSIONS_2026 = path.join(SEM_DIR, 'sessions-2026');
const CROSSWALK_VALIDATION = path.join(SEM_DIR, 'crosswalk/crosswalk-validation.json');
const CROSSWALK_IDENTITY = path.join(SEM_DIR, 'crosswalk/identity-crosswalk-2026.json');
const CAREER_DATASET =
  process.env.BRYCECAST_CAREER_DATASET || path.join(repoRoot, 'data/career/career.dataset.json');

const BRYCE_DRIVER_ID = 'driver_bryce_aron';
const SCHEMA_VERSION = '1.0.0';

/* Lap classification thresholds. A flying lap sits within FLYING_BAND of the
 * driver's best; a support lap (out-lap, in-lap, traffic-compromised) is slower
 * but still a real on-track lap; anything beyond NOISE_MULT is a session-start /
 * red-flag artifact of the crossing clock and is dropped from the run (kept in
 * counts). Tuned against the observed captures (oval lap-1 ~3061 s artifacts;
 * road out-laps ~1.5x the flyer). */
const FLYING_BAND = 1.06;
const NOISE_MULT = 2.5;

/* Semantic venue string -> canonical trackId (both RaceTools and Timing71
 * spellings). The only cross-source join key that is not carried in-band; small
 * and explicit so it never silently drifts. 2026 rows also carry the canonical
 * eventId in the crosswalk, so this map is the fallback, not the primary join. */
const VENUE_TO_TRACK = {
  'Barber Motorsports Park': 'track_barber_motorsports_park',
  Barber: 'track_barber_motorsports_park',
  'Detroit Street Circuit': 'track_streets_of_detroit',
  Detroit: 'track_streets_of_detroit',
  'Indianapolis Motor Speedway RC': 'track_indianapolis_motor_speedway_road_course',
  'Indianapolis GP': 'track_indianapolis_motor_speedway_road_course',
  'Iowa Speedway': 'track_iowa_speedway',
  'Mid-Ohio Sports Car Course': 'track_mid_ohio_sports_car_course',
  'Mid-Ohio': 'track_mid_ohio_sports_car_course',
  'Milwaukee Mile': 'track_the_milwaukee_mile',
  'Nashville Superspeedway': 'track_nashville_superspeedway',
  Nashville: 'track_nashville_superspeedway',
  'Portland International Raceway': 'track_portland_international_raceway',
  'Road America': 'track_road_america',
  'St Petersburg Street Circuit': 'track_streets_of_st_petersburg',
  'St. Petersburg': 'track_streets_of_st_petersburg',
  'WeatherTech Raceway Laguna Seca': 'track_weathertech_raceway_laguna_seca',
  'World Wide Technology Raceway': 'track_world_wide_technology_raceway',
  'WWT Raceway': 'track_world_wide_technology_raceway',
  Arlington: 'track_streets_of_arlington'
};

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const loadPack = (p) =>
  gunzipSync(readFileSync(p))
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));

/** Parse an official "M:SS.mmmm" / "SS.mmmm" lap-time string to seconds. */
const parseLapTime = (str) => {
  if (str === null || str === undefined || str === '') return null;
  const m = String(str).match(/(?:(\d+):)?(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return (m[1] ? Number(m[1]) * 60 : 0) + Number(m[2]);
};

const round4 = (n) => (n === null || n === undefined ? null : Math.round(n * 10000) / 10000);
const isBryceName = (first, last) => /(^|\b)aron\b/i.test(String(last || '')) && /bryce/i.test(String(first || ''));

/* ------------------------------------------------------------------ */
/* Canonical index: Bryce's official qualifying rows, grouped by event */
/* ------------------------------------------------------------------ */

const buildCanonicalIndex = () => {
  const dataset = readJson(CAREER_DATASET);
  const datasetSha = createHash('sha256').update(readFileSync(CAREER_DATASET)).digest('hex');
  const sessionById = new Map(dataset.sessions.map((s) => [s.id, s]));
  const eventById = new Map(dataset.events.map((e) => [e.id, e]));

  // field size per qualifying session = distinct qR rows for that session
  const fieldSize = {};
  for (const q of dataset.qualifyingResults) fieldSize[q.sessionId] = (fieldSize[q.sessionId] || 0) + 1;

  // Bryce quali rows enriched with event/track/date, grouped by eventId
  const byEvent = new Map();
  for (const q of dataset.qualifyingResults) {
    if (q.driverId !== BRYCE_DRIVER_ID) continue;
    const session = sessionById.get(q.sessionId);
    if (!session) continue;
    const event = eventById.get(session.eventId);
    if (!event) continue;
    const row = {
      sessionId: q.sessionId,
      eventId: event.id,
      trackId: event.trackId,
      year: event.seasonYear,
      eventName: event.name,
      segment: q.sessionSegment || session.sessionName || '',
      position: q.position ?? null,
      bestLapSeconds: parseLapTime(q.bestLapTime),
      gapToPoleSeconds: parseLapTime(q.gapToPole),
      isCombined: /combined/i.test(q.sessionSegment || session.sessionName || ''),
      raceLabel: /race 1/i.test(q.sessionSegment || '') ? 'Race 1' : /race 2/i.test(q.sessionSegment || '') ? 'Race 2' : null,
      fieldSize: fieldSize[q.sessionId] ?? null
    };
    if (!byEvent.has(event.id)) byEvent.set(event.id, []);
    byEvent.get(event.id).push(row);
  }

  // race sessions per event (for surface linkage)
  const raceSessionsByEvent = new Map();
  for (const s of dataset.sessions) {
    if (s.sessionType !== 'race') continue;
    if (!raceSessionsByEvent.has(s.eventId)) raceSessionsByEvent.set(s.eventId, []);
    raceSessionsByEvent.get(s.eventId).push(s.id);
  }

  return { dataset, datasetSha, byEvent, raceSessionsByEvent, eventById };
};

/* ------------------------------------------------------------------ */
/* The run-by-run build from a semantic capture                        */
/* ------------------------------------------------------------------ */

/** Extract Bryce's ordered run and the session-best evolution from a capture.
 *  `timeField` is the crossing-clock field (RaceTools local seconds-of-day vs
 *  Timing71 observed epoch) — used only for ORDER, never rendered. */
const buildRun = (records, bryceCar, timeField) => {
  const laps = records.filter((r) => r.record === 'lap' && r.lapSeconds > 0);
  const bryceLaps = laps
    .filter((r) => String(r.car) === String(bryceCar))
    .slice()
    .sort((a, b) => (a[timeField] ?? a.lap) - (b[timeField] ?? b.lap));
  if (bryceLaps.length === 0) return null;

  /* The best comes from FULL flying laps only. `isFirstRacingLap` laps are
   * measured from the start-line instant and "may be partial" (SCHEMA) — an
   * implausibly-fast lap-1 (IMS road ~57 s vs a real ~75 s) is one of these,
   * never a legitimate best. Compute the best from non-first laps; the field
   * gets the same guard so the session best isn't a partial either. */
  const fullBryceLaps = bryceLaps.filter((l) => !l.isFirstRacingLap);
  const bryceBest = Math.min(...(fullBryceLaps.length ? fullBryceLaps : bryceLaps).map((l) => l.lapSeconds));

  // ordered run: drop crossing-clock noise (slow artifacts) and fast partials
  const run = [];
  let runningBest = Infinity;
  let seq = 0;
  for (const lap of bryceLaps) {
    if (lap.lapSeconds > bryceBest * NOISE_MULT) continue; // slow artifact (session-start gap, red-flag)
    if (lap.isFirstRacingLap && lap.lapSeconds < bryceBest - 1e-9) continue; // fast partial first lap
    seq += 1;
    const isPB = lap.lapSeconds < runningBest - 1e-9;
    if (isPB) runningBest = lap.lapSeconds;
    run.push({
      seq,
      lapIndex: lap.lap ?? null,
      seconds: round4(lap.lapSeconds),
      kind: lap.lapSeconds <= bryceBest * FLYING_BAND ? 'flying' : 'support',
      isPersonalBest: isPB,
      runningBestSeconds: round4(runningBest),
      /* v2 (full Quali & Practice Lab): typed traffic context for THIS lap —
       * car ahead, gap, clear-air flag — filled by a lake-grain producer with
       * no UI rework (adapter-contract law). Null in v1. */
      trafficObservation: null
    });
  }
  const noiseLaps = bryceLaps.length - run.length;
  const bestSeq = run.find((r) => Math.abs(r.seconds - round4(bryceBest)) < 1e-9)?.seq ?? null;

  // session-best evolution across all full flying laps in the capture (order by clock)
  const cleanField = laps.filter((l) => !l.isFirstRacingLap && l.lapSeconds <= bryceBest * NOISE_MULT * 2);
  cleanField.sort((a, b) => (a[timeField] ?? a.lap) - (b[timeField] ?? b.lap));
  let fieldBest = Infinity;
  const sessionBestSteps = [];
  let sessionBestHolderCar = null;
  for (const lap of cleanField) {
    if (lap.lapSeconds < fieldBest - 1e-9) {
      fieldBest = lap.lapSeconds;
      sessionBestHolderCar = String(lap.car);
      sessionBestSteps.push({ seconds: round4(lap.lapSeconds), byBryce: String(lap.car) === String(bryceCar) });
    }
  }
  const lapHolders = new Set(laps.map((l) => String(l.car)));

  return {
    run,
    noiseLaps,
    bryceBestSeconds: round4(bryceBest),
    bryceBestSeq: bestSeq,
    sessionBestSeconds: round4(fieldBest),
    sessionBestHolderCar,
    sessionBestByBryce: sessionBestHolderCar === String(bryceCar),
    sessionBestSteps,
    sessionBestMoves: sessionBestSteps.length,
    lapHolderCount: lapHolders.size,
    gapToSessionBestSeconds: round4(bryceBest - fieldBest)
  };
};

/* ------------------------------------------------------------------ */
/* Canonical rank resolution (group + combined grid), event-joined     */
/* ------------------------------------------------------------------ */

/** Resolve Bryce's official qualifying outcome for a capture. Group/single row
 *  gives the on-track session rank; a genuine Combined row gives the grid
 *  position. Doubleheaders (two group rows in the year/track) are attributed to
 *  the race whose group best-lap matches Bryce's captured best flying lap.
 *
 *  `isOval` is the ACTUAL track format (passed from the caller, not inferred
 *  here): the group→grid fallback fires only on verified ovals, where there is
 *  no combined stage and the single on-track group IS the grid. On road/street
 *  a group is never presented as a grid — the grid comes only from a combined
 *  session that genuinely merged the groups. */
const resolveRank = (canon, { eventId, year, trackId, isOval, bryceBestSeconds }) => {
  let events = [];
  if (eventId && canon.byEvent.has(eventId)) {
    events = [eventId];
  } else {
    for (const [eid, rows] of canon.byEvent) {
      if (rows[0].year === year && rows[0].trackId === trackId) events.push(eid);
    }
  }
  if (events.length === 0) return null;

  const groupRows = [];
  for (const eid of events) for (const r of canon.byEvent.get(eid)) if (!r.isCombined) groupRows.push(r);
  if (groupRows.length === 0) return null;

  let group;
  let attribution = 'single';
  if (groupRows.length === 1) {
    group = groupRows[0];
  } else {
    // doubleheader: pick the group row whose official best matches the capture
    const scored = groupRows
      .map((r) => ({ r, d: r.bestLapSeconds !== null && bryceBestSeconds !== null ? Math.abs(r.bestLapSeconds - bryceBestSeconds) : Infinity }))
      .sort((a, b) => a.d - b.d);
    group = scored[0].r;
    attribution = 'doubleheader_bestlap';
  }

  // Grid-setting row. A Combined session only sets the grid when it GENUINELY
  // merges the groups — its field is larger than the attributed group's. A
  // "combined" no larger than a single group is a duplicate/mislabel (Barber
  // 2025's "Combined" is a 10-row copy of Group 1) and is NOT a grid. On a
  // verified oval there is no combined stage: the single on-track group IS the
  // grid. On road/street with no genuine combined, the grid is left null rather
  // than passing a group off as one (St. Pete 2025 had two groups but no
  // combined session — its grid is simply not in the canonical data).
  const eventRows = canon.byEvent.get(group.eventId);
  const combined = eventRows.find((r) => r.isCombined) || null;
  const combinedMergesField =
    combined !== null &&
    combined.fieldSize !== null &&
    group.fieldSize !== null &&
    combined.fieldSize > group.fieldSize;
  const ovalSingle = isOval && !combined && eventRows.filter((r) => !r.isCombined).length === 1;
  const gridRow = combinedMergesField ? combined : ovalSingle ? group : null;

  return {
    eventId: group.eventId,
    onTrackGroupRank: group.position,
    groupFieldSize: group.fieldSize,
    groupSegment: group.segment,
    onTrackGapToPoleSeconds: group.gapToPoleSeconds,
    officialBestLapSeconds: group.bestLapSeconds,
    combinedGridPosition: gridRow ? gridRow.position : null,
    combinedFieldSize: gridRow ? gridRow.fieldSize : null,
    combinedGapToPoleSeconds: gridRow ? gridRow.gapToPoleSeconds : null,
    doubleheaderRaceLabel: group.raceLabel,
    attribution,
    rankSource: 'canonical_official_qualifying'
  };
};

/* ------------------------------------------------------------------ */
/* Per-session assembly                                                 */
/* ------------------------------------------------------------------ */

const isQualifying = (meta) => meta.sessionType === 'qualifying';

const assembleSession = (records, opts, canon) => {
  const meta = records.find((r) => r.record === 'session_meta');
  const { source, sourceTier, sourceTierLabel, timeField, bryceCar, canonicalEventId, crosswalk } = opts;

  const built = buildRun(records, bryceCar, timeField);
  if (!built) return { excluded: true, reason: 'no_bryce_laps', id: meta.id, meta };

  const trackId = VENUE_TO_TRACK[meta.venue] || null;
  /* Actual track format, resolved once and passed into rank resolution: the
   * group→grid fallback is permitted only where this is true. */
  const isOval = /oval|superspeedway|milwaukee|iowa|world-wide|world wide/i.test(`${meta.venue} ${trackId}`);
  const rank = resolveRank(canon, {
    eventId: canonicalEventId,
    year: meta.year,
    trackId,
    isOval,
    bryceBestSeconds: built.bryceBestSeconds
  });
  if (!rank) {
    return {
      excluded: true,
      reason: 'no_canonical_qualifying_classification',
      id: meta.id,
      meta,
      detail: 'no official qualifying result for Bryce in the canonical dataset — rank unverifiable'
    };
  }

  const raceSessionIds = canon.raceSessionsByEvent.get(rank.eventId) || [];

  // cross-check: RaceTools feed classification position vs canonical group rank
  const bryceCls = records.find(
    (r) => r.record === 'classification' && String(r.car) === String(bryceCar)
  );
  const semanticPosition = bryceCls ? bryceCls.position ?? null : null;
  let positionCrossCheck = 'na';
  if (source === 'racetools' && semanticPosition !== null && rank.onTrackGroupRank !== null) {
    positionCrossCheck = semanticPosition === rank.onTrackGroupRank ? 'match' : 'mismatch';
  }

  return {
    excluded: false,
    session: {
      id: meta.id,
      source,
      sourceTier,
      sourceTierLabel,
      seasonYear: meta.year,
      date: meta.date,
      venueName: meta.venue,
      trackId,
      sessionLabel: meta.sessionLabel ?? null,
      /* Weekend contract holds practice and qualifying alike; this first slice
       * builds qualifying only, a practice producer fills the same shape. */
      sessionType: 'qualifying',
      eventId: rank.eventId,
      raceSessionIds,
      isOval,
      // crosswalk gate provenance (2026 only; null for 2024-25)
      crosswalkVerdict: crosswalk ? crosswalk.verdict : null,
      crosswalkCrossCheck: crosswalk ? crosswalk.crossCheck : null,
      qualityMasks: meta.qualityMasks ?? [],
      // the run-by-run BUILD (semantic substrate)
      laps: built.run,
      lapCount: built.run.length,
      droppedNoiseLaps: built.noiseLaps,
      bryceBestSeconds: built.bryceBestSeconds,
      bryceBestSeq: built.bryceBestSeq,
      sessionBestSeconds: built.sessionBestSeconds,
      sessionBestByBryce: built.sessionBestByBryce,
      /* The benchmark line is the fastest lap IN THE CAPTURE. On road/street the
       * capture is one qualifying group (lap holders ≈ group size, half the
       * combined field), so it is the GROUP best, not the session best; ovals
       * run one group as the whole field, so it is the session best. Labelled
       * accordingly on screen so a split-quali benchmark never over-claims. */
      benchmarkScope: isOval ? 'session' : 'group',
      sessionBestMoves: built.sessionBestMoves,
      sessionBestSteps: built.sessionBestSteps,
      gapToSessionBestSeconds: built.gapToSessionBestSeconds,
      lapHolderCount: built.lapHolderCount,
      // the final RANK (canonical substrate)
      onTrackGroupRank: rank.onTrackGroupRank,
      groupFieldSize: rank.groupFieldSize,
      groupSegment: rank.groupSegment,
      combinedGridPosition: rank.combinedGridPosition,
      combinedFieldSize: rank.combinedFieldSize,
      gridGapToPoleSeconds: rank.combinedGapToPoleSeconds,
      onTrackGapToPoleSeconds: rank.onTrackGapToPoleSeconds,
      officialBestLapSeconds: rank.officialBestLapSeconds,
      /* captured best (semantic) minus official best (canonical). ~0 confirms
       * the capture holds his fastest lap; a positive value means the capture
       * missed it (a lap-crossing the feed dropped) — the UI headlines the
       * official best and the staircase honestly stops at the captured floor. */
      capturedBestVsOfficialSeconds:
        rank.officialBestLapSeconds !== null && built.bryceBestSeconds !== null
          ? round4(built.bryceBestSeconds - rank.officialBestLapSeconds)
          : null,
      doubleheaderRaceLabel: rank.doubleheaderRaceLabel,
      rankAttribution: rank.attribution,
      rankSource: rank.rankSource,
      // validation echoes
      semanticClassificationPosition: semanticPosition,
      positionCrossCheck,
      /* Doubleheader pairing (filled in main's post-pass): the uncaptured
       * sibling races of this weekend, so a Race-2 page shows a quiet note
       * instead of silence and never reuses Race-1's ranks. */
      pairedUncapturedRaces: [],
      // v2 fields (full Quali & Practice Lab) — filled by a lake producer later,
      // consumed through the same contract with no UI rework (adapter-contract law):
      //   theoreticalBest — { seconds, components[{segment,seconds,sourceLapSeq}], sourceLapSeqs, scope }
      //   trackEvolution  — ordered observations [{ order, referenceSeconds, scope, coverage }]
      theoreticalBest: null,
      trackEvolution: null
    }
  };
};

/* ------------------------------------------------------------------ */
/* Main                                                                 */
/* ------------------------------------------------------------------ */

const main = () => {
  const canon = buildCanonicalIndex();

  // 2026 crosswalk gate + identity
  const cwValidation = readJson(CROSSWALK_VALIDATION);
  const cwIdentity = readJson(CROSSWALK_IDENTITY);
  const verdictBySession = new Map(cwValidation.goNoGo.map((s) => [s.t71SessionId, s]));
  const identityBySession = new Map(cwIdentity.sessions.map((s) => [s.t71SessionId, s]));

  const covered = [];
  const excluded = [];

  // --- 2024-25 RaceTools captures ---
  for (const file of readdirSync(SESSIONS_2425).sort()) {
    if (!file.endsWith('.ndjson.gz')) continue;
    const records = loadPack(path.join(SESSIONS_2425, file));
    const meta = records.find((r) => r.record === 'session_meta');
    if (!meta || !isQualifying(meta)) continue;
    const bryceCls = records.find(
      (r) => r.record === 'classification' && isBryceName(r.firstName, r.lastName)
    );
    if (!bryceCls) continue; // Bryce not in this group's session
    const result = assembleSession(records, {
      source: 'racetools',
      sourceTier: 'racetools_capture',
      sourceTierLabel: 'RaceTools race-weekend capture',
      timeField: 'endTimeOfDaySeconds',
      bryceCar: bryceCls.car,
      canonicalEventId: null,
      crosswalk: null
    }, canon);
    if (result.excluded) excluded.push({ id: result.id, seasonYear: meta.year, venueName: meta.venue, source: 'racetools', reason: result.reason, detail: result.detail || null });
    else covered.push(result.session);
  }

  // --- 2026 Timing71 captures (crosswalk-gated) ---
  for (const file of readdirSync(SESSIONS_2026).sort()) {
    if (!file.endsWith('.ndjson.gz')) continue;
    const records = loadPack(path.join(SESSIONS_2026, file));
    const meta = records.find((r) => r.record === 'session_meta');
    if (!meta || !isQualifying(meta)) continue;

    const verdict = verdictBySession.get(meta.id);
    const identity = identityBySession.get(meta.id);
    // GATE: exclude any 2026 session whose crosswalk isn't validated GO
    if (!verdict || verdict.verdict !== 'GO') {
      excluded.push({ id: meta.id, seasonYear: meta.year, venueName: meta.venue, source: 'timing71', reason: 'crosswalk_not_go', detail: `crosswalk verdict ${verdict ? verdict.verdict : 'missing'}` });
      continue;
    }
    const bryceMapping = identity ? (identity.mappings || []).find((m) => m.driverId === BRYCE_DRIVER_ID) : null;
    if (!bryceMapping) {
      excluded.push({ id: meta.id, seasonYear: meta.year, venueName: meta.venue, source: 'timing71', reason: 'bryce_not_in_crosswalk', detail: 'no validated Bryce identity mapping' });
      continue;
    }
    const result = assembleSession(records, {
      source: 'timing71',
      sourceTier: 'timing71_normalized',
      sourceTierLabel: 'third-party normalized (Timing71)',
      timeField: 'endObservedAtEpoch',
      bryceCar: bryceMapping.car,
      canonicalEventId: identity.canonicalEventId || null,
      crosswalk: { verdict: verdict.verdict, crossCheck: verdict.crossCheck }
    }, canon);
    if (result.excluded) excluded.push({ id: result.id, seasonYear: meta.year, venueName: meta.venue, source: 'timing71', reason: result.reason, detail: result.detail || null });
    else covered.push(result.session);
  }

  covered.sort((a, b) => (a.seasonYear - b.seasonYear) || a.date.localeCompare(b.date));

  /* Doubleheader pairing post-pass. A covered Race-1 qualifying weekend also has
   * a Race-2 race whose OWN qualifying we did not capture; the canonical dataset
   * models Race 1 and Race 2 as sibling events at the same track/year. Carry the
   * uncaptured sibling race session ids so the Race-2 page can show a quiet note
   * (never reusing Race-1's ranks). Any sibling race that IS covered by another
   * session is skipped — it needs no note. */
  const coveredRaceIds = new Set(covered.flatMap((s) => s.raceSessionIds));
  const raceLabelOf = (name) => (/race 2/i.test(name) ? 'Race 2' : /race 1/i.test(name) ? 'Race 1' : null);
  for (const s of covered) {
    const myEvent = canon.eventById.get(s.eventId);
    if (!myEvent) continue;
    const siblings = [...canon.eventById.values()].filter(
      (e) => e.trackId === myEvent.trackId && e.seasonYear === myEvent.seasonYear && e.id !== myEvent.id
    );
    const paired = [];
    for (const sib of siblings) {
      for (const rid of canon.raceSessionsByEvent.get(sib.id) || []) {
        if (coveredRaceIds.has(rid)) continue;
        paired.push({ raceSessionId: rid, raceLabel: raceLabelOf(sib.name), eventName: sib.name });
      }
    }
    s.pairedUncapturedRaces = paired;
  }

  /* Family-legible exclusion notes for the coverage drawer: every set-aside
   * session is named with the reason it was set aside. */
  const exclusionNote = (e) => {
    if (e.reason === 'no_bryce_laps') return 'the second qualifying group — Bryce ran in the other group, so this capture holds none of his laps';
    if (e.reason === 'no_canonical_qualifying_classification') return 'no official qualifying result in the canonical dataset to verify a rank against';
    if (e.reason === 'crosswalk_not_go') return 'the 2026 identity crosswalk did not validate GO';
    if (e.reason === 'bryce_not_in_crosswalk') return 'no validated 2026 identity mapping for Bryce';
    return e.detail || e.reason;
  };
  const exclusions = excluded.map((e) => ({
    seasonYear: e.seasonYear,
    venueName: e.venueName,
    reason: e.reason,
    note: exclusionNote(e)
  }));

  const bySeasonSource = {};
  for (const s of covered) {
    const k = `${s.seasonYear}:${s.source}`;
    bySeasonSource[k] = (bySeasonSource[k] || 0) + 1;
  }

  const pack = {
    id: 'quali_lab_run_by_run',
    type: 'quali_lab',
    schemaVersion: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    question: 'How did his qualifying build?',
    sourceHash: canon.datasetSha,
    sourceTiers: [
      { tier: 'racetools_capture', label: 'RaceTools race-weekend capture', note: 'third-party capture of the timing feed; not official timing' },
      { tier: 'timing71_normalized', label: 'third-party normalized (Timing71)', note: 'third-party normalized display-state replay; 2026 rows gated by the validated identity crosswalk' }
    ],
    rankSource: 'canonical official qualifying classification (qualifyingResults)',
    method: [
      'The run-by-run build (laps, best-lap staircase, session-best evolution) comes only from the semantic layer.',
      'The final rank (on-track group rank + combined grid position) comes only from the canonical official qualifying classification.',
      'Doubleheader qualifying is attributed to the race whose official best lap matches the captured best flying lap.',
      '2026 sessions are gated on a validated Timing71 identity crosswalk (GO); non-GO sessions are excluded and named.'
    ],
    caveats: [
      'Third-party derived analytics, never official timing; source tier is labelled on every session.',
      'Lap times are the capture’s own values; session-start and red-flag crossing-clock artifacts are dropped from the run and counted.',
      'On-track group rank and combined grid position are two different denominators, each labelled where shown.'
    ],
    coverage: {
      coveredSessions: covered.length,
      excludedSessions: excluded.length,
      bySeasonSource,
      exclusions
    },
    sessions: covered
  };

  const outDir = path.join(laneDir, 'output/context-packs');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'quali-lab-context.json'), `${JSON.stringify(pack, null, 2)}\n`);

  // coverage census
  const census = {
    generatedAt: pack.generatedAt,
    sourceHash: canon.datasetSha,
    covered: covered.map((s) => ({
      id: s.id,
      seasonYear: s.seasonYear,
      date: s.date,
      venueName: s.venueName,
      source: s.source,
      sourceTier: s.sourceTier,
      lapCount: s.lapCount,
      onTrackGroupRank: s.onTrackGroupRank,
      groupFieldSize: s.groupFieldSize,
      combinedGridPosition: s.combinedGridPosition,
      combinedFieldSize: s.combinedFieldSize,
      rankAttribution: s.rankAttribution,
      positionCrossCheck: s.positionCrossCheck,
      crosswalkVerdict: s.crosswalkVerdict
    })),
    excluded
  };
  writeFileSync(path.join(laneDir, 'output/coverage-census.json'), `${JSON.stringify(census, null, 2)}\n`);

  // flat review table
  const cols = [
    'id', 'seasonYear', 'date', 'venueName', 'source', 'sourceTier', 'lapCount',
    'bryceBestSeconds', 'sessionBestSeconds', 'gapToSessionBestSeconds',
    'onTrackGroupRank', 'groupFieldSize', 'combinedGridPosition', 'combinedFieldSize',
    'doubleheaderRaceLabel', 'rankAttribution', 'positionCrossCheck', 'crosswalkVerdict'
  ];
  const rows = covered.map((s) => cols.map((c) => (s[c] === null || s[c] === undefined ? '' : s[c])).join(','));
  writeFileSync(
    path.join(laneDir, 'output/tables/quali_lab_sessions.csv'),
    `${cols.join(',')}\n${rows.join('\n')}\n`
  );

  console.log(`quali-lab: ${covered.length} covered, ${excluded.length} excluded`);
  console.log('by season/source:', JSON.stringify(bySeasonSource));
  console.log('excluded:', JSON.stringify(excluded.map((e) => `${e.id} (${e.reason})`), null, 0));
};

main();
