// Replay reducer core: turn a semantic-layer session pack into a sequence of
// capture-shaped snapshot rows at a 1-second virtual cadence. The output rows
// are byte-shape-compatible with the live runner's archive payload
// (`raw.timing.timing_results = { heartbeat, Item[] }` + enrichment endpoints),
// so the existing api-server replay path serves them with no per-source branch.
//
// House rules honoured here:
//  - Positions change ONLY at loop crossings (no invented between-loop precision):
//    running order is a step function ranked by on-track progress.
//  - Gaps are timestamp differences at the most recent common loop.
//  - Bryce is resolved by NAME (semantic layer) / crosswalk driverId, and his row
//    carries his TRUE season car number for display honesty while stamping the
//    stable BryceCast identity (DriverID 2143) the frontend keys on.
//  - Classification (final order) is validated elsewhere against canonical; the
//    replay shows the as-raced on-road order with the honesty line at the checker.

export const BRYCE_DRIVER_ID = '2143';
export const BRYCE_NAME = { first: 'bryce', last: 'aron' };

const isBryceName = (first, last) =>
  String(first ?? '').trim().toLowerCase() === BRYCE_NAME.first &&
  String(last ?? '').trim().toLowerCase() === BRYCE_NAME.last;

/** Split a "First Middle Last" display string into a first token + remainder. */
export const splitName = (full) => {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
};

/** Seconds -> "m:ss.mmm" the way the live feed renders lap times. */
export const formatLapTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
};

/** RaceTools clock: local seconds-of-day on the session date, labelled Z.
 *  This is a monotonic, correct-year/date virtual clock — NOT UTC-accurate
 *  (the semantic layer's date anchor tz is unvalidated). The replay only ever
 *  uses it as a relative virtual clock, and the manifest/source drawer says so. */
export const isoFromLocalSecondsOfDay = (dateStr, secondsOfDay) => {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dayMs = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return new Date(dayMs + Math.round(secondsOfDay * 1000)).toISOString();
};

/** Timing71 clock: real UTC epoch seconds. */
export const isoFromEpoch = (epochSeconds) => new Date(Math.round(epochSeconds * 1000)).toISOString();

const FLAG_DISPLAY = {
  green: 'GREEN',
  yellow: 'YELLOW',
  red: 'RED',
  checkered: 'CHECKERED',
  white: 'WHITE'
};

// Binary search: index of the last element with key <= target (or -1).
const lastAtOrBefore = (arr, target, keyOf) => {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keyOf(arr[mid]) <= target) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
};

const gapString = (deltaSeconds) => {
  if (!Number.isFinite(deltaSeconds)) return '';
  if (deltaSeconds <= 0) return '0';
  return deltaSeconds.toFixed(3);
};

/** Assemble one capture-shaped snapshot record from computed running order. */
const buildSnapshot = ({
  checkedAt,
  sessionKey,
  heartbeat,
  rows,
  bryceProfile,
  sourceTier,
  trackName
}) => ({
  checkedAt,
  sessionKey,
  summary: {
    checkedAt,
    trackName: trackName ?? heartbeat.trackName ?? null,
    flag: heartbeat.currentFlag ?? null,
    lap: heartbeat.lapNumber ?? null,
    totalLaps: heartbeat.totalLaps ?? null,
    sourceTier
  },
  raw: {
    timing: { timing_results: { heartbeat, Item: rows } },
    drivers_nxt: { drivers: { driver: bryceProfile ? [bryceProfile] : [] } },
    config: { track_map_url: '' },
    schedule_nxt: {},
    trackactivity_nxt: {}
  }
});

/** The checker frame: the as-raced final classification order (the honesty line
 *  at the checkered). Classification is the feed's own final on-road result;
 *  validation checks it against canonical separately. Gaps aren't in the
 *  classification, so lapped cars read "+N L" and lead-lap finishers read blank. */
const finalRowsFromClassification = (classification, { identityOf, gridOf, statusOf, driverIdOf }) => {
  const sorted = [...classification]
    .filter((c) => Number.isFinite(c.position) && c.position > 0)
    .sort((a, b) => a.position - b.position);
  const winnerLaps = Number.parseInt(sorted[0]?.laps ?? '', 10);
  return sorted.map((c, index) => {
    const car = String(c.car);
    const id = identityOf(car, c);
    const laps = Number.parseInt(c.laps ?? '', 10);
    const lapsDown = Number.isFinite(winnerLaps) && Number.isFinite(laps) ? winnerLaps - laps : 0;
    let gap = '0';
    if (index > 0) gap = lapsDown >= 1 ? `+${lapsDown} L` : '';
    return {
      no: car,
      DriverID: driverIdOf(car, id),
      firstName: id.firstName,
      lastName: id.lastName,
      team: id.team,
      rank: String(c.position),
      liveRank: String(c.position),
      startPosition: gridOf(car),
      status: statusOf(c),
      gap,
      liveGap: gap,
      laps: Number.isFinite(laps) ? String(laps) : '',
      bestLapTime: '',
      lastLapTime: ''
    };
  });
};

// ---------------------------------------------------------------------------
// RaceTools 2024-25 path: fine loop crossings + local seconds-of-day clock.
// ---------------------------------------------------------------------------
export const reduceRaceTools = (pack, { canonicalSessionId, eventSessionId, seasonYear, eventId = null }) => {
  const meta = pack.session_meta;
  const geometry = pack.geometry ?? {};
  const loopDistances = geometry.loopDistances ?? {};
  const sourceTier = 'racetools_capture';

  // Lap length only needs to exceed the largest within-lap loop distance so lap
  // N always outranks lap N-1 in the progress metric (relative ranking only).
  const distances = Object.values(loopDistances).filter((v) => Number.isFinite(v) && v >= 0);
  const lapLength = (distances.length ? Math.max(...distances) : 100000) + 1;
  const loopDistOf = (endLoop) => {
    const direct = loopDistances[endLoop];
    if (Number.isFinite(direct)) return direct;
    const alt = loopDistances[`${endLoop}*`]; // alternate S/F lines are keyed SF*, SFP*
    return Number.isFinite(alt) ? alt : null;
  };

  // Roster identity from the feed's own final classification.
  const roster = new Map();
  for (const c of pack.classification) {
    if (!roster.has(c.car)) {
      roster.set(c.car, {
        car: c.car,
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        team: c.team ?? '',
        statusCode: c.statusCode ?? null,
        classified: c.classified ?? null,
        finalPosition: c.position ?? null,
        finalLaps: c.laps ?? null
      });
    }
  }

  // Per-car crossings (main-lap loops only for progress/order), sorted by time.
  const crossingsByCar = new Map();
  const timeByLoopLap = new Map(); // car -> Map(`endLoop#lapIndex` -> time)
  for (const x of pack.loop_crossings) {
    const dist = loopDistOf(x.endLoop);
    if (!crossingsByCar.has(x.car)) crossingsByCar.set(x.car, []);
    if (!timeByLoopLap.has(x.car)) timeByLoopLap.set(x.car, new Map());
    timeByLoopLap.get(x.car).set(`${x.endLoop}#${x.lapIndex}`, x.timeOfDaySeconds);
    if (dist === null || dist < 0) continue; // skip pit-lane loops for on-track progress
    crossingsByCar.get(x.car).push({
      time: x.timeOfDaySeconds,
      lapIndex: x.lapIndex,
      endLoop: x.endLoop,
      dist,
      isLapBoundary: Boolean(x.isLapBoundary),
      feedPosition: Number.parseInt(x.feedPosition ?? '', 10)
    });
  }
  for (const list of crossingsByCar.values()) list.sort((a, b) => a.time - b.time);

  // Grid: each car's position at its earliest on-track crossing.
  const grid = new Map();
  for (const [car, list] of crossingsByCar) {
    const first = list.find((c) => Number.isFinite(c.feedPosition));
    if (first) grid.set(car, first.feedPosition);
  }

  // Completed-lap times per car come from the authoritative `lap` records — NOT
  // from isLapBoundary crossings, which double-count at venues with an alternate
  // S/F line (e.g. Barber S9 + I3 both end at SF).
  const lapEndTimes = new Map(); // car -> sorted [time] of completed racing laps
  const lapSecondsByCar = new Map(); // car -> sorted [{end, lapSeconds}]
  for (const l of pack.laps) {
    if (!lapEndTimes.has(l.car)) lapEndTimes.set(l.car, []);
    lapEndTimes.get(l.car).push(l.endTimeOfDaySeconds);
    if (!lapSecondsByCar.has(l.car)) lapSecondsByCar.set(l.car, []);
    lapSecondsByCar.get(l.car).push({ end: l.endTimeOfDaySeconds, lapSeconds: l.lapSeconds });
  }
  for (const list of lapEndTimes.values()) list.sort((a, b) => a - b);
  for (const list of lapSecondsByCar.values()) list.sort((a, b) => a.end - b.end);

  // Flags sorted; green window bounds the replay span.
  const flags = [...pack.flags]
    .filter((f) => Number.isFinite(f.startTimeOfDaySeconds))
    .sort((a, b) => a.startTimeOfDaySeconds - b.startTimeOfDaySeconds);
  const firstGreen = flags.find((f) => f.state === 'green');
  const greenStart = firstGreen ? firstGreen.startTimeOfDaySeconds : flags[0]?.startTimeOfDaySeconds;
  let endTime = greenStart;
  for (const list of crossingsByCar.values()) {
    const last = list[list.length - 1];
    if (last && last.time > endTime) endTime = last.time;
  }
  if (!Number.isFinite(greenStart) || !Number.isFinite(endTime) || endTime <= greenStart) {
    return { snapshots: [], reason: 'no green window / crossings', meta };
  }

  const flagAt = (ts) => {
    let state = 'green';
    for (const f of flags) {
      if (f.startTimeOfDaySeconds <= ts && (f.endTimeOfDaySeconds === null || f.endTimeOfDaySeconds > ts)) {
        state = f.state;
      }
      if (f.startTimeOfDaySeconds > ts) break;
    }
    return state;
  };

  const totalLaps = Number.parseInt(roster.get([...roster.entries()].find(([, r]) => r.finalPosition === 1)?.[0])?.finalLaps ?? '', 10) ||
    Math.max(0, ...[...lapEndTimes.values()].map((t) => t.length));

  const trackName = meta?.venue ?? null;
  const heartbeatBase = {
    eventName: meta?.event ?? meta?.venue ?? 'INDY NXT',
    EventID: eventId ? String(eventId) : "",
    EventSessionID: String(eventSessionId),
    SessionName: meta?.sessionLabel ?? 'Race',
    SessionType: 'R',
    Series: 'L',
    trackName,
    trackType: geometry.trackType ?? 'RC'
  };

  const cars = [...crossingsByCar.keys()];
  const snapshots = [];
  const startSec = Math.floor(greenStart);
  const endSec = Math.ceil(endTime);

  const lapsDoneAt = (car, ts) => {
    const b = lapEndTimes.get(car) ?? [];
    return lastAtOrBefore(b, ts, (t) => t) + 1;
  };

  const carStateAt = (car, ts) => {
    const list = crossingsByCar.get(car);
    const idx = lastAtOrBefore(list, ts, (c) => c.time);
    if (idx < 0) return null;
    const c = list[idx];
    const laps = lapsDoneAt(car, ts);
    return { crossing: c, laps, progress: laps * lapLength + c.dist };
  };

  const lapTimesAt = (car, ts) => {
    const list = lapSecondsByCar.get(car) ?? [];
    let best = Infinity;
    let last = 0;
    for (const l of list) {
      if (l.end > ts) break;
      if (Number.isFinite(l.lapSeconds) && l.lapSeconds > 0) {
        last = l.lapSeconds;
        if (l.lapSeconds < best) best = l.lapSeconds;
      }
    }
    return { best: Number.isFinite(best) ? best : 0, last };
  };

  for (let ts = startSec; ts <= endSec; ts += 1) {
    const clamped = Math.min(ts, endTime);
    const running = [];
    for (const car of cars) {
      const st = carStateAt(car, clamped);
      if (!st) continue;
      running.push({ car, ...st });
    }
    if (running.length === 0) continue;
    // Higher progress leads; among cars sharing the same most-recent loop the one
    // that crossed it earlier is ahead (time breaks the progress tie, not car no.).
    running.sort((a, b) => b.progress - a.progress || a.crossing.time - b.crossing.time);

    const leader = running[0];
    const leaderMap = timeByLoopLap.get(leader.car) ?? new Map();
    const isFinal = ts >= endSec;
    const flag = isFinal ? 'checkered' : flagAt(clamped);
    const leaderLaps = leader.laps;

    const rows = running.map((entry, index) => {
      const info = roster.get(entry.car) ?? { firstName: '', lastName: '', team: '' };
      const bryce = isBryceName(info.firstName, info.lastName);
      let gap = '0';
      if (index > 0) {
        const lapsDown = Math.floor((leader.progress - entry.progress) / lapLength);
        if (lapsDown >= 1) {
          gap = `+${lapsDown} L`;
        } else {
          const leaderTime = leaderMap.get(`${entry.crossing.endLoop}#${entry.crossing.lapIndex}`);
          gap = Number.isFinite(leaderTime) ? gapString(entry.crossing.time - leaderTime) : '';
        }
      }
      const lt = lapTimesAt(entry.car, clamped);
      const status = 'Active';
      return {
        no: entry.car,
        DriverID: bryce ? BRYCE_DRIVER_ID : '',
        firstName: info.firstName,
        lastName: info.lastName,
        team: info.team,
        rank: String(index + 1),
        liveRank: String(index + 1),
        startPosition: grid.has(entry.car) ? String(grid.get(entry.car)) : '',
        status,
        gap,
        liveGap: gap,
        laps: String(entry.laps),
        bestLapTime: formatLapTime(lt.best),
        lastLapTime: formatLapTime(lt.last)
      };
    });

    const heartbeat = {
      ...heartbeatBase,
      SessionStatus: FLAG_DISPLAY[flag] ?? 'GREEN',
      currentFlag: FLAG_DISPLAY[flag] ?? 'GREEN',
      lapNumber: String(isFinal ? totalLaps : Math.min(leaderLaps, Math.max(0, totalLaps - 1))),
      totalLaps: String(totalLaps)
    };
    const bryceRow = rows.find((r) => r.DriverID === BRYCE_DRIVER_ID);
    const bryceProfile = bryceRow
      ? { driverid: BRYCE_DRIVER_ID, firstname: bryceRow.firstName, lastname: bryceRow.lastName, no: bryceRow.no }
      : null;

    snapshots.push(
      buildSnapshot({
        checkedAt: isoFromLocalSecondsOfDay(meta.date, clamped),
        sessionKey: canonicalSessionId,
        heartbeat,
        rows,
        bryceProfile,
        sourceTier,
        trackName
      })
    );
  }

  // Overwrite the checker frame with the as-raced final classification order.
  if (snapshots.length && pack.classification.length) {
    const finalRows = finalRowsFromClassification(pack.classification, {
      identityOf: (car) => roster.get(car) ?? { firstName: '', lastName: '', team: '' },
      gridOf: (car) => (grid.has(car) ? String(grid.get(car)) : ''),
      statusOf: (c) => (c.classified === false && c.statusCode !== '0' ? 'DNF' : 'Active'),
      driverIdOf: (car, id) => (isBryceName(id.firstName, id.lastName) ? BRYCE_DRIVER_ID : '')
    });
    if (finalRows.length) snapshots[snapshots.length - 1].raw.timing.timing_results.Item = finalRows;
  }

  const finalOrder = snapshots.length
    ? snapshots[snapshots.length - 1].raw.timing.timing_results.Item.map((r) => r.no)
    : [];
  return {
    snapshots,
    meta,
    sourceTier,
    totalLaps,
    firstGreenIso: isoFromLocalSecondsOfDay(meta.date, greenStart),
    finalOrder,
    bryceSeen: snapshots.some((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID))
  };
};

// ---------------------------------------------------------------------------
// Timing71 2026 path: S/F-only crossings + real UTC epoch clock + roster identity.
// ---------------------------------------------------------------------------
export const reduceTiming71 = (pack, { canonicalSessionId, eventSessionId, seasonYear, eventId = null, crosswalk = null }) => {
  const meta = pack.session_meta;
  const sourceTier = 'timing71_normalized';

  // Identity from the roster; team/name join. Crosswalk (if provided) maps
  // (car, name) -> canonical driverId for stable identity.
  const roster = new Map();
  for (const car of pack.roster?.cars ?? []) {
    const { first, last } = splitName(car.driver);
    roster.set(String(car.car), { car: String(car.car), firstName: first, lastName: last, team: car.team ?? '', driver: car.driver });
  }
  for (const c of pack.classification) {
    const key = String(c.car);
    if (!roster.has(key)) {
      const { first, last } = splitName(c.driver);
      roster.set(key, { car: key, firstName: first, lastName: last, team: c.team ?? '', driver: c.driver });
    }
    const r = roster.get(key);
    r.finalPosition = c.position ?? null;
    r.finalLaps = c.laps ?? null;
    r.state = c.state ?? null;
  }

  const driverIdFor = (car, info) => {
    if (isBryceName(info.firstName, info.lastName)) return BRYCE_DRIVER_ID;
    if (crosswalk) {
      const entry = crosswalk[String(car)];
      if (entry?.driverId) return String(entry.driverId);
    }
    return '';
  };

  // S/F crossings per car (once per lap).
  const crossingsByCar = new Map();
  const timeByLap = new Map(); // car -> Map(lapIndex -> epoch)
  for (const x of pack.loop_crossings) {
    const car = String(x.car);
    if (!crossingsByCar.has(car)) crossingsByCar.set(car, []);
    if (!timeByLap.has(car)) timeByLap.set(car, new Map());
    crossingsByCar.get(car).push({ time: x.observedAtEpoch, lapIndex: x.lapIndex });
    timeByLap.get(car).set(x.lapIndex, x.observedAtEpoch);
  }
  for (const list of crossingsByCar.values()) list.sort((a, b) => a.time - b.time);

  // positionAtSF per (car, lap) for running order between S/F crossings.
  const posByCarLap = new Map();
  const lapSecondsByCar = new Map();
  const grid = new Map();
  for (const l of pack.laps) {
    const car = String(l.car);
    posByCarLap.set(`${car}#${l.lap}`, l.positionAtSF);
    if (!lapSecondsByCar.has(car)) lapSecondsByCar.set(car, []);
    lapSecondsByCar.get(car).push({ end: l.endObservedAtEpoch, lapSeconds: l.lapSeconds });
    if (l.lap === 1 && Number.isFinite(l.positionAtSF)) grid.set(car, l.positionAtSF);
  }
  for (const list of lapSecondsByCar.values()) list.sort((a, b) => a.end - b.end);

  const flags = [...pack.flags]
    .filter((f) => Number.isFinite(f.observedAtEpoch))
    .sort((a, b) => a.observedAtEpoch - b.observedAtEpoch);
  const firstGreen = flags.find((f) => f.state === 'green');
  const greenStart = firstGreen ? firstGreen.observedAtEpoch : flags[0]?.observedAtEpoch;
  let endTime = greenStart;
  for (const list of crossingsByCar.values()) {
    const last = list[list.length - 1];
    if (last && last.time > endTime) endTime = last.time;
  }
  const checkered = flags.find((f) => f.state === 'checkered');
  if (checkered && checkered.observedAtEpoch > endTime) endTime = checkered.observedAtEpoch;
  if (!Number.isFinite(greenStart) || !Number.isFinite(endTime) || endTime <= greenStart) {
    return { snapshots: [], reason: 'no green window / crossings', meta };
  }

  const flagAt = (ts) => {
    let state = 'green';
    for (const f of flags) {
      if (f.observedAtEpoch <= ts) state = f.state;
      else break;
    }
    return state;
  };

  const totalLaps = Number.parseInt(
    [...roster.values()].find((r) => r.finalPosition === 1)?.finalLaps ?? '',
    10
  ) || Math.max(0, ...[...crossingsByCar.values()].map((l) => l.length));

  const trackName = meta?.venue ?? null;
  const heartbeatBase = {
    eventName: meta?.event ?? meta?.venue ?? 'INDY NXT',
    EventID: eventId ? String(eventId) : "",
    EventSessionID: String(eventSessionId),
    SessionName: meta?.sessionLabel ? 'Race' : 'Race',
    SessionType: 'R',
    Series: 'L',
    trackName,
    trackType: 'RC'
  };

  const cars = [...crossingsByCar.keys()];
  const snapshots = [];
  const startSec = Math.floor(greenStart);
  const endSec = Math.ceil(endTime);

  const carStateAt = (car, ts) => {
    const list = crossingsByCar.get(car);
    const idx = lastAtOrBefore(list, ts, (c) => c.time);
    if (idx < 0) return { laps: 0, lastLap: 0, pos: posByCarLap.get(`${car}#1`) ?? 999, started: false };
    const c = list[idx];
    return {
      laps: c.lapIndex,
      lastLap: c.lapIndex,
      pos: posByCarLap.get(`${car}#${c.lapIndex}`) ?? c.lapIndex,
      crossing: c,
      started: true
    };
  };

  const lapTimesAt = (car, ts) => {
    const list = lapSecondsByCar.get(car) ?? [];
    let best = Infinity;
    let last = 0;
    for (const l of list) {
      if (l.end > ts) break;
      if (Number.isFinite(l.lapSeconds) && l.lapSeconds > 0) {
        last = l.lapSeconds;
        if (l.lapSeconds < best) best = l.lapSeconds;
      }
    }
    return { best: Number.isFinite(best) ? best : 0, last };
  };

  for (let ts = startSec; ts <= endSec; ts += 1) {
    const clamped = Math.min(ts, endTime);
    const running = [];
    for (const car of cars) {
      const st = carStateAt(car, clamped);
      if (!st.started) continue;
      running.push({ car, ...st });
    }
    if (running.length === 0) continue;
    // Rank by laps completed desc, then the feed's running position at last S/F,
    // then the S/F crossing time (earlier = ahead) as the final tiebreak.
    running.sort((a, b) => b.laps - a.laps || a.pos - b.pos || a.crossing.time - b.crossing.time);

    const leader = running[0];
    const leaderMap = timeByLap.get(leader.car) ?? new Map();
    const isFinal = ts >= endSec;
    const flag = isFinal ? 'checkered' : flagAt(clamped);

    const rows = running.map((entry, index) => {
      const info = roster.get(entry.car) ?? { firstName: '', lastName: '', team: '' };
      const bryce = isBryceName(info.firstName, info.lastName);
      let gap = '0';
      if (index > 0) {
        const lapsDown = leader.laps - entry.laps;
        if (lapsDown >= 1) {
          gap = `+${lapsDown} L`;
        } else {
          const leaderTime = leaderMap.get(entry.crossing.lapIndex);
          gap = Number.isFinite(leaderTime) ? gapString(entry.crossing.time - leaderTime) : '';
        }
      }
      const lt = lapTimesAt(entry.car, clamped);
      const status = isFinal && info.state && info.state !== 'RUN' ? info.state : 'Active';
      return {
        no: entry.car,
        DriverID: driverIdFor(entry.car, info),
        firstName: info.firstName,
        lastName: info.lastName,
        team: info.team,
        rank: String(index + 1),
        liveRank: String(index + 1),
        startPosition: grid.has(entry.car) ? String(grid.get(entry.car)) : '',
        status,
        gap,
        liveGap: gap,
        laps: String(entry.laps),
        bestLapTime: formatLapTime(lt.best),
        lastLapTime: formatLapTime(lt.last)
      };
    });

    const heartbeat = {
      ...heartbeatBase,
      SessionStatus: FLAG_DISPLAY[flag] ?? 'GREEN',
      currentFlag: FLAG_DISPLAY[flag] ?? 'GREEN',
      lapNumber: String(isFinal ? totalLaps : Math.min(leader.laps, Math.max(0, totalLaps - 1))),
      totalLaps: String(totalLaps)
    };
    const bryceRow = rows.find((r) => r.DriverID === BRYCE_DRIVER_ID);
    const bryceProfile = bryceRow
      ? { driverid: BRYCE_DRIVER_ID, firstname: bryceRow.firstName, lastname: bryceRow.lastName, no: bryceRow.no }
      : null;

    snapshots.push(
      buildSnapshot({
        checkedAt: isoFromEpoch(clamped),
        sessionKey: canonicalSessionId,
        heartbeat,
        rows,
        bryceProfile,
        sourceTier,
        trackName
      })
    );
  }

  // Overwrite the checker frame with Timing71's own as-raced final order. For
  // Road America R2 2026 this diverges from canonical (post-race DQ of the
  // on-road winner) — that is the documented CONDITIONAL, surfaced honestly.
  if (snapshots.length && pack.classification.length) {
    const finalRows = finalRowsFromClassification(pack.classification, {
      identityOf: (car, c) => {
        const r = roster.get(String(car));
        if (r) return r;
        const { first, last } = splitName(c.driver);
        return { firstName: first, lastName: last, team: c.team ?? '' };
      },
      gridOf: (car) => (grid.has(String(car)) ? String(grid.get(String(car))) : ''),
      statusOf: (c) => (c.state && c.state !== 'RUN' ? c.state : 'Active'),
      driverIdOf: (car, id) => driverIdFor(car, id)
    });
    if (finalRows.length) snapshots[snapshots.length - 1].raw.timing.timing_results.Item = finalRows;
  }

  const finalOrder = snapshots.length
    ? snapshots[snapshots.length - 1].raw.timing.timing_results.Item.map((r) => r.no)
    : [];
  return {
    snapshots,
    meta,
    sourceTier,
    totalLaps,
    firstGreenIso: isoFromEpoch(greenStart),
    finalOrder,
    bryceSeen: snapshots.some((s) => s.raw.timing.timing_results.Item.some((r) => r.DriverID === BRYCE_DRIVER_ID))
  };
};
