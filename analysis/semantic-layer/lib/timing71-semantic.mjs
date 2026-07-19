// Semantic-layer slice 2: Timing71 replay -> canonical event-grain tables.
//
// Source tier for every row is "timing71_normalized" (third-party normalized
// display-state replay) per the ledger — NEVER "official". Timing71 stores a
// display state plus timestamped incremental changes at a 1-2 s cadence; rows
// here are EVENT OBSERVATIONS at real archive timestamps (UTC epoch seconds),
// never interpolated. This is a different clock domain from slice 1's RaceTools
// local seconds-of-day: slice-2 rows use `observedAtEpoch`.
//
// Grain notes:
//  - An S/F "crossing" is observed as the car's Laps counter incrementing
//    between consecutive frames — quantized to the archive cadence (1-2 s).
//    The precise lap TIME comes from the state's own "Last" lap-time value.
//  - Sector completions (S1/S2/S3) are observed as the sector value changing
//    to a fresh number; sector TIME is the state's value (precise), the
//    timestamp is quantized.
//  - NXT segmentation: recordings can embed an adjacent INDYCAR session with
//    stale rosters (three 2026 cross-session recordings). Only frames whose
//    roster contains Bryce Aron are processed (the lake's audited default).

import {reconstructTiming71Frames} from '../../historical-data-lake/lib/timing71-reader.mjs';

export const T71_SOURCE_TIER = 'timing71_normalized';

const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const cell = (v) => (Array.isArray(v) ? v[0] : v); // [value, flags] tuples
const round = (n, d) => (n == null || !Number.isFinite(n) ? n : Math.round(n * 10 ** d) / 10 ** d);

export function parseTiming71Session(zipBytes, session) {
  const laps = [];
  const crossings = [];
  const sectorObservations = [];
  const flagEvents = [];
  const rosterByCar = new Map(); // car -> {car, driver, team, firstSeenEpoch}
  const prevByCar = new Map(); // car -> {laps, s1, s2, s3, last}
  let prevFlag = null;
  let lastState = null;
  let lastEpoch = null;
  let firstEpoch = null;
  let frameCount = 0;
  let processedFrames = 0;
  let maxLapSum = 0;
  const cadenceGaps = [];
  let prevProcessedEpoch = null;

  for (const frame of reconstructTiming71Frames(zipBytes)) {
    frameCount += 1;
    const cols = (frame.manifest.colSpec ?? []).map((c) => c[0]);
    const iNum = cols.indexOf('Num');
    const iDriver = cols.indexOf('Driver');
    const iTeam = cols.indexOf('Team');
    const iLaps = cols.indexOf('Laps');
    const iState = cols.indexOf('State');
    const iLast = cols.indexOf('Last');
    const iS = [cols.indexOf('S1'), cols.indexOf('S2'), cols.indexOf('S3')];
    const cars = frame.state.cars ?? [];

    // NXT segmentation: only frames whose roster contains Bryce Aron.
    const hasBryce = cars.some((c) => /\bbryce\s+aron\b/i.test(String(c[iDriver] ?? '')));
    if (!hasBryce) continue;

    // Stale-roster guard (the audit's cross-session hazard): at the boundary to
    // an adjacent session the display can briefly keep the NXT roster with RESET
    // lap counters. A field-wide collapse of the lap sum after real running is
    // the session boundary — stop there; everything after is stale or foreign.
    const lapSum = cars.reduce((a, c) => a + (num(c[iLaps]) ?? 0), 0);
    if (maxLapSum >= 10 && lapSum < 0.3 * maxLapSum) break;
    maxLapSum = Math.max(maxLapSum, lapSum);

    processedFrames += 1;
    const epoch = frame.observedAtEpoch;
    firstEpoch ??= epoch;
    if (prevProcessedEpoch !== null) cadenceGaps.push(epoch - prevProcessedEpoch);
    prevProcessedEpoch = epoch;
    lastEpoch = epoch;
    // Snapshot the classification EAGERLY: the reader patches state arrays in
    // place across frames, so a saved reference would silently morph into a
    // later (possibly foreign-session) state after the loop.
    lastState = cars.map((c, idx) => ({
      car: String(c[iNum] ?? ''),
      position: idx + 1,
      laps: num(c[iLaps]),
      state: c[iState] ?? null,
      driver: c[iDriver] ?? null,
      team: c[iTeam] ?? null,
    }));

    // Flag transitions.
    const flag = frame.state.session?.flagState ?? null;
    if (flag !== prevFlag) {
      flagEvents.push({state: normalizeFlag(flag), rawState: flag, observedAtEpoch: epoch});
      prevFlag = flag;
    }

    for (let pos = 0; pos < cars.length; pos += 1) {
      const c = cars[pos];
      const car = String(c[iNum] ?? '');
      if (!car) continue;
      const driver = c[iDriver] ?? null;
      if (driver && !rosterByCar.has(car)) {
        rosterByCar.set(car, {car, driver, team: c[iTeam] ?? null, firstSeenEpoch: epoch});
      }
      const prev = prevByCar.get(car) || {laps: null, s: [null, null, null]};
      const lapsNow = num(c[iLaps]);

      // Lap completion: Laps counter increments.
      if (lapsNow !== null && prev.laps !== null && lapsNow > prev.laps) {
        const lastLap = num(cell(c[iLast]));
        laps.push({
          car,
          lap: lapsNow,
          endObservedAtEpoch: epoch,
          lapSeconds: lastLap === null ? null : round(lastLap, 4),
          positionAtSF: pos + 1,
          lapDelta: lapsNow - prev.laps, // >1 means missed observations between frames
        });
        crossings.push({
          car,
          lapIndex: lapsNow,
          sectionLabel: 'LAP',
          endLoop: 'SF',
          observedAtEpoch: epoch,
          quantized: true,
        });
      }

      // Sector completions: S1/S2/S3 value changes to a fresh number.
      for (let k = 0; k < 3; k += 1) {
        if (iS[k] < 0) continue;
        const v = num(cell(c[iS[k]]));
        if (v !== null && v !== prev.s[k]) {
          sectorObservations.push({
            car,
            sector: `S${k + 1}`,
            sectorSeconds: round(v, 4),
            observedAtEpoch: epoch,
            lapContext: lapsNow,
          });
        }
        prev.s[k] = v;
      }
      prev.laps = lapsNow === null ? prev.laps : lapsNow;
      prevByCar.set(car, prev);
    }
  }

  // Final classification: the eagerly-snapshotted last processed frame.
  const classification = lastState ?? [];

  const flagsSeen = new Set(flagEvents.map((f) => f.state));
  const masks = [];
  if (processedFrames === 0) masks.push('no_bryce_roster_segment');
  if (processedFrames > 0 && processedFrames < 60) masks.push('thin_capture');
  if (session?.sessionType === 'race' && !flagsSeen.has('checkered')) masks.push('no_checkered_flag_detected');
  if (frameCount > processedFrames * 1.5 && processedFrames > 0) masks.push('cross_session_recording_segmented');
  const bigLapJumps = laps.filter((l) => l.lapDelta > 1).length;
  if (bigLapJumps > laps.length * 0.05) masks.push('sparse_lap_observation');

  cadenceGaps.sort((a, b) => a - b);
  return {
    session,
    sourceTier: T71_SOURCE_TIER,
    frames: {
      total: frameCount,
      processedNxtSegment: processedFrames,
      firstObservedAtEpoch: firstEpoch,
      lastObservedAtEpoch: lastEpoch,
      cadenceMedianSeconds: cadenceGaps.length ? cadenceGaps[Math.floor(cadenceGaps.length / 2)] : null,
      cadenceMaxSeconds: cadenceGaps.length ? cadenceGaps[cadenceGaps.length - 1] : null,
    },
    roster: [...rosterByCar.values()],
    flags: flagEvents,
    laps,
    crossings,
    sectorObservations,
    classification,
    qualityMasks: masks,
  };
}

function normalizeFlag(state) {
  const s = String(state ?? '').toLowerCase();
  if (s === 'chequered' || s === 'checkered') return 'checkered';
  if (s === 'code_60' || s === 'fcy' || s === 'caution' || s === 'yellow') return 'yellow';
  if (s === 'green') return 'green';
  if (s === 'red') return 'red';
  if (s === 'white') return 'white';
  return s || 'none';
}
