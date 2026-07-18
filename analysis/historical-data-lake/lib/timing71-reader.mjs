import {centralEntries, localEntryData} from './archive-reader.mjs';

function frameTimestamp(name) {
  const match = name.match(/(?:^|\/)(\d+)(i)?\.json$/i);
  return match ? {seconds: Number(match[1]), incremental: Boolean(match[2])} : null;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function pathParts(path) {
  if (Array.isArray(path)) return path;
  if (path === '' || path === null || path === undefined) return [];
  return String(path)
    .split('.')
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

function targetAt(root, path) {
  let target = root;
  for (const part of pathParts(path)) {
    if (target === null || target === undefined) throw new Error(`patch path does not exist: ${JSON.stringify(path)}`);
    target = target[part];
  }
  return target;
}

function valueAt(root, path) {
  const parts = pathParts(path);
  if (parts.length === 0) return root;
  const key = parts.at(-1);
  return targetAt(root, parts.slice(0, -1))?.[key];
}

function setAt(root, path, value) {
  const parts = pathParts(path);
  if (parts.length === 0) return clone(value);
  const key = parts.at(-1);
  const parent = targetAt(root, parts.slice(0, -1));
  parent[key] = clone(value);
  return root;
}

function addPairs(root, path, pairs) {
  const target = targetAt(root, path);
  if (!Array.isArray(pairs)) throw new Error(`invalid add payload: ${JSON.stringify(pairs)}`);
  for (const [key, value] of pairs) {
    if (Array.isArray(target) && Number.isInteger(Number(key))) target.splice(Number(key), 0, clone(value));
    else target[key] = clone(value);
  }
  return root;
}

function removePairs(root, path, pairs) {
  const target = targetAt(root, path);
  if (!Array.isArray(pairs)) throw new Error(`invalid remove payload: ${JSON.stringify(pairs)}`);
  const keys = pairs.map(([key]) => key);
  if (Array.isArray(target)) {
    for (const key of keys.map(Number).sort((left, right) => right - left)) target.splice(key, 1);
  } else {
    for (const key of keys) delete target[key];
  }
  return root;
}

export function applyTiming71Patch(base, operations) {
  let result = base;
  for (const operation of operations ?? []) {
    const [kind, path, values] = operation;
    if (kind === 'change') result = setAt(result, path, values?.[1]);
    else if (kind === 'add') result = addPairs(result, path, values);
    else if (kind === 'remove') result = removePairs(result, path, values);
    else throw new Error(`unsupported Timing71 patch operation: ${kind}`);
  }
  return result;
}

export function readTiming71Archive(zipBytes) {
  const entries = centralEntries(zipBytes);
  const manifestEntry = entries.find((entry) => entry.name === 'manifest.json');
  if (!manifestEntry) throw new Error('Timing71 replay has no manifest.json');
  const manifest = JSON.parse(localEntryData(zipBytes, manifestEntry).toString('utf8'));
  const frames = entries
    .map((entry) => ({entry, timing: frameTimestamp(entry.name)}))
    .filter((row) => row.timing)
    .sort((left, right) =>
      left.timing.seconds - right.timing.seconds || Number(left.timing.incremental) - Number(right.timing.incremental),
    );
  return {manifest, frames};
}

function parseFrame(zipBytes, row) {
  return JSON.parse(localEntryData(zipBytes, row.entry).toString('utf8'));
}

function applyIframe(state, iframe) {
  return {
    cars: applyTiming71Patch(state.cars, iframe.cars),
    session: applyTiming71Patch(state.session, iframe.session),
    highlight: clone(iframe.highlight),
    messages: [...clone(iframe.messages ?? []), ...(state.messages ?? [])].slice(0, 100),
  };
}

export function* reconstructTiming71Frames(zipBytes, {includeIncremental = true} = {}) {
  const {manifest, frames} = readTiming71Archive(zipBytes);
  let state = null;
  for (const row of frames) {
    const payload = parseFrame(zipBytes, row);
    if (row.timing.incremental) {
      if (!state) continue;
      state = applyIframe(state, payload);
      if (!includeIncremental) continue;
    } else {
      state = payload;
    }
    yield {
      observedAt: new Date(row.timing.seconds * 1000).toISOString(),
      observedAtEpoch: row.timing.seconds,
      incremental: row.timing.incremental,
      manifest,
      state,
    };
  }
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function maximum(values) {
  let result = null;
  for (const value of values) result = result === null || value > result ? value : result;
  return result;
}

function compactEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function auditPatch(base, operations) {
  const mismatches = [];
  for (const operation of operations ?? []) {
    const [kind, path, values] = operation;
    if (kind === 'change') {
      const actual = valueAt(base, path);
      if (!compactEqual(actual, values?.[0])) mismatches.push({kind, path, expected: values?.[0], actual});
    } else if (kind === 'add' || kind === 'remove') {
      const target = targetAt(base, path);
      for (const [key, expected] of values ?? []) {
        const actual = target?.[key];
        const valid = kind === 'add' ? actual === undefined : compactEqual(actual, expected);
        if (!valid) mismatches.push({kind, path: [...pathParts(path), key], expected, actual});
      }
    }
  }
  return mismatches;
}

export function analyzeTiming71Replay(zipBytes) {
  const {manifest, frames} = readTiming71Archive(zipBytes);
  const columns = (manifest.colSpec ?? []).map((column) => column[0]);
  const numberIndex = columns.indexOf('Num');
  const driverIndex = columns.indexOf('Driver');
  const teamIndex = columns.indexOf('Team');
  const identities = new Map();
  const targetIdentities = new Map();
  const timestamps = frames.map((row) => row.timing.seconds);
  const gaps = timestamps.slice(1).map((value, index) => value - timestamps[index]);
  let state = null;
  let fullFrameCount = 0;
  let incrementalFrameCount = 0;
  let patchPreconditionCount = 0;
  let patchPreconditionMismatchCount = 0;
  let nonemptyCarFrameCount = 0;
  let flagMessageCount = 0;
  let yellowMessageCount = 0;
  let bryceFrameCount = 0;
  let firstBryceFrameEpoch = null;
  let lastBryceFrameEpoch = null;
  let bryceSegmentMinCars = null;
  let bryceSegmentMaxCars = null;
  let bryceSegmentMaxLap = null;
  const bryceSegmentFlagStates = new Set();
  const observedMessages = new Set();
  const flagStates = new Set();
  const errors = [];

  for (const row of frames) {
    let payload;
    try {
      payload = parseFrame(zipBytes, row);
      if (row.timing.incremental) {
        incrementalFrameCount += 1;
        if (!state) continue;
        const carMismatches = auditPatch(state.cars, payload.cars);
        const sessionMismatches = auditPatch(state.session, payload.session);
        patchPreconditionCount += (payload.cars?.length ?? 0) + (payload.session?.length ?? 0);
        patchPreconditionMismatchCount += carMismatches.length + sessionMismatches.length;
        if (carMismatches.length || sessionMismatches.length) {
          errors.push({
            frame: row.entry.name,
            error: 'patch precondition mismatch',
            mismatches: [...carMismatches, ...sessionMismatches].slice(0, 10),
          });
        }
        state = applyIframe(state, payload);
      } else {
        fullFrameCount += 1;
        state = payload;
      }
    } catch (error) {
      errors.push({frame: row.entry.name, error: error.message});
      state = null;
      continue;
    }
    if ((state?.cars?.length ?? 0) > 0) nonemptyCarFrameCount += 1;
    const currentIdentities = [];
    for (const car of state?.cars ?? []) {
      const identity = {
        carNumber: numberIndex >= 0 ? car[numberIndex] ?? null : null,
        driver: driverIndex >= 0 ? car[driverIndex] ?? null : null,
        team: teamIndex >= 0 ? car[teamIndex] ?? null : null,
      };
      const key = `${identity.carNumber}|${identity.driver}|${identity.team}`;
      if (identity.driver && !identities.has(key)) identities.set(key, identity);
      if (identity.driver) currentIdentities.push({...identity, values: car});
    }
    if (currentIdentities.some((identity) => /\bbryce\s+aron\b/i.test(identity.driver))) {
      bryceFrameCount += 1;
      firstBryceFrameEpoch ??= row.timing.seconds;
      lastBryceFrameEpoch = row.timing.seconds;
      bryceSegmentMinCars = Math.min(bryceSegmentMinCars ?? currentIdentities.length, currentIdentities.length);
      bryceSegmentMaxCars = Math.max(bryceSegmentMaxCars ?? currentIdentities.length, currentIdentities.length);
      if (state?.session?.flagState) bryceSegmentFlagStates.add(state.session.flagState);
      const lapsIndex = columns.indexOf('Laps');
      for (const identity of currentIdentities) {
        const key = `${identity.carNumber}|${identity.driver}|${identity.team}`;
        if (!targetIdentities.has(key)) {
          targetIdentities.set(key, {
            carNumber: identity.carNumber,
            driver: identity.driver,
            team: identity.team,
          });
        }
        if (lapsIndex >= 0) {
          const laps = Number(identity.values[lapsIndex]);
          if (Number.isFinite(laps)) bryceSegmentMaxLap = Math.max(bryceSegmentMaxLap ?? laps, laps);
        }
      }
    }
    for (const message of payload.messages ?? []) {
      const messageKey = JSON.stringify(message);
      if (observedMessages.has(messageKey)) continue;
      observedMessages.add(messageKey);
      const text = Array.isArray(message) ? String(message[2] ?? '') : JSON.stringify(message);
      const style = Array.isArray(message) ? String(message[3] ?? '') : '';
      if (/green flag|yellow|caution|red flag|checkered|chequered/i.test(text)) flagMessageCount += 1;
      if (/yellow|caution/i.test(`${text} ${style}`)) yellowMessageCount += 1;
    }
    const flagState = state?.session?.flagState;
    if (flagState) flagStates.add(flagState);
  }

  const drivers = [...identities.values()];
  let qualityStatus = 'usable';
  const qualityReasons = [];
  if (frames.length === 0) {
    qualityStatus = 'empty_replay';
    qualityReasons.push('archive contains no replay frames');
  } else if (nonemptyCarFrameCount === 0) {
    qualityStatus = 'no_car_data';
    qualityReasons.push('all replay frames have an empty car array');
  }
  if (errors.some((row) => row.error !== 'patch precondition mismatch')) {
    qualityStatus = 'decoder_error';
    qualityReasons.push(`${errors.length} frames could not be decoded`);
  }
  if (patchPreconditionMismatchCount > 0) {
    qualityStatus = 'decoder_mismatch';
    qualityReasons.push(`${patchPreconditionMismatchCount}/${patchPreconditionCount} patch preconditions did not match reconstructed state`);
  }

  return {
    manifest: {
      uuid: manifest.uuid ?? null,
      name: manifest.name ?? null,
      description: manifest.description ?? null,
      startTime: manifest.startTime ?? null,
      version: manifest.version ?? null,
      columns: manifest.colSpec ?? [],
      trackDataSpec: manifest.trackDataSpec ?? [],
    },
    frames: {
      count: frames.length,
      fullFrameCount,
      incrementalFrameCount,
      nonemptyCarFrameCount,
      firstObservedAt: timestamps.length ? new Date(timestamps[0] * 1000).toISOString() : null,
      lastObservedAt: timestamps.length ? new Date(timestamps.at(-1) * 1000).toISOString() : null,
      observedSpanSeconds: timestamps.length ? timestamps.at(-1) - timestamps[0] : null,
      updateGapMedianSeconds: median(gaps),
      updateGapMaxSeconds: maximum(gaps),
      exactConsecutiveOneSecondUpdates: gaps.length > 0 && gaps.every((value) => value === 1),
      patchPreconditionCount,
      patchPreconditionMismatchCount,
    },
    content: {
      drivers,
      bryce: drivers.find((driver) => /\bbryce\s+aron\b/i.test(driver.driver)) ?? null,
      flagStates: [...flagStates],
      flagMessageCount,
      yellowMessageCount,
      hasTrackDataSpec: (manifest.trackDataSpec?.length ?? 0) > 0,
      bryceSegment: {
        frameCount: bryceFrameCount,
        firstObservedAt: firstBryceFrameEpoch === null ? null : new Date(firstBryceFrameEpoch * 1000).toISOString(),
        lastObservedAt: lastBryceFrameEpoch === null ? null : new Date(lastBryceFrameEpoch * 1000).toISOString(),
        observedSpanSeconds:
          firstBryceFrameEpoch === null || lastBryceFrameEpoch === null ? null : lastBryceFrameEpoch - firstBryceFrameEpoch,
        minCars: bryceSegmentMinCars,
        maxCars: bryceSegmentMaxCars,
        uniqueDrivers: [...targetIdentities.values()],
        maxLap: bryceSegmentMaxLap,
        flagStates: [...bryceSegmentFlagStates],
        hasCheckered: bryceSegmentFlagStates.has('chequered') || bryceSegmentFlagStates.has('checkered'),
      },
    },
    quality: {status: qualityStatus, reasons: qualityReasons, decoderErrors: errors.slice(0, 25)},
  };
}
