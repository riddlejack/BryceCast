import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';

export function centralEntries(bytes) {
  const entries = [];
  const minimumEocdOffset = Math.max(0, bytes.length - 65_557);
  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('ZIP end-of-central-directory record not found');
  const entryCount = bytes.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = bytes.readUInt32LE(eocdOffset + 16);
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error(`invalid ZIP central-directory entry ${index + 1}/${entryCount}`);
    }
    const fileNameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const end = offset + 46 + fileNameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error(`truncated ZIP central-directory entry ${index + 1}/${entryCount}`);
    entries.push({
      name: bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8'),
      method: bytes.readUInt16LE(offset + 10),
      crc32: bytes.readUInt32LE(offset + 16),
      compressedSize: bytes.readUInt32LE(offset + 20),
      uncompressedSize: bytes.readUInt32LE(offset + 24),
      localOffset: bytes.readUInt32LE(offset + 42),
    });
    offset = end;
  }
  return entries;
}

export function localEntryData(zipBytes, entry) {
  const offset = entry.localOffset;
  if (zipBytes.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`invalid local ZIP header for ${entry.name}`);
  }
  const fileNameLength = zipBytes.readUInt16LE(offset + 26);
  const extraLength = zipBytes.readUInt16LE(offset + 28);
  const start = offset + 30 + fileNameLength + extraLength;
  const compressed = zipBytes.subarray(start, start + entry.compressedSize);
  if (compressed.length !== entry.compressedSize) throw new Error(`truncated ZIP entry ${entry.name}`);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return inflateRawSync(compressed);
  throw new Error(`unsupported ZIP method ${entry.method} for ${entry.name}`);
}

async function unzipEntry(containerPath, entryName, maxBytes = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const child = spawn('unzip', ['-p', containerPath, entryName], {stdio: ['ignore', 'pipe', 'pipe']});
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) child.kill('SIGTERM');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      if (bytes > maxBytes) reject(new Error(`nested ZIP exceeds ${maxBytes} bytes: ${entryName}`));
      else if (code !== 0) reject(new Error(`unzip exited ${code}: ${Buffer.concat(stderr).toString('utf8').trim()}`));
      else resolve(Buffer.concat(stdout));
    });
  });
}

export async function readSessionZipBytes(dataRoot, session) {
  if (session.accessMethod === 'direct_zip') return readFile(join(dataRoot, session.directViewPath));
  if (session.accessMethod === 'zip_entry') {
    return unzipEntry(join(dataRoot, session.containerViewPath), session.entryName);
  }
  throw new Error(`unsupported access method: ${session.accessMethod}`);
}

function numericHex(value) {
  if (!value || !/^[0-9a-f]+$/i.test(value)) return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, probability) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor((sorted.length - 1) * probability)];
}

function maximum(values) {
  let result = null;
  for (const value of values) result = result === null || value > result ? value : result;
  return result;
}

export function analyzeRaceToolsReplay(zipBytes, expectedSeries = null, expectedYear = null) {
  const entries = centralEntries(zipBytes);
  const logEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.log'));
  const csvEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.csv'));
  if (!logEntry) throw new Error('session ZIP has no .log entry');
  const logBytes = localEntryData(zipBytes, logEntry);
  const csvBytes = csvEntry ? localEntryData(zipBytes, csvEntry) : null;
  const logText = logBytes.toString('latin1');
  const lines = logText.split(/\r?\n/).filter(Boolean);
  const delimiter = '¦';
  const messageTypeCounts = {};
  const heartbeats = [];
  const sessionHeaders = [];
  const sessionStates = new Map();
  const driverIdentities = new Map();
  const trackDefinitions = new Map();
  const namedSectionLabels = new Set();
  const namedSectionCars = new Set();
  const namedSectionSamples = [];
  const namedSectionHeartbeatDeltas = [];
  let namedSectionRecordCount = 0;
  let currentHeartbeatEpoch = null;
  let flagMessageCount = 0;
  let yellowReasonMessageCount = 0;

  for (const line of lines) {
    if (line.startsWith('*** New Session')) {
      sessionHeaders.push(line.slice(0, 500));
      continue;
    }
    const type = line.startsWith('$') ? line.slice(0, 2) : 'other';
    messageTypeCounts[type] = (messageTypeCounts[type] ?? 0) + 1;
    const fields = line.split(delimiter);
    if (type === '$H') {
      currentHeartbeatEpoch = numericHex(fields[5]);
      heartbeats.push({counter: numericHex(fields[2]), seriesCode: fields[3] || null, epoch: currentHeartbeatEpoch});
    }
    if (type === '$X' && fields.length >= 8) {
      const key = [fields[3], fields[4], fields[5]].join('|');
      sessionStates.set(key, {seriesCode: fields[3] || null, event: fields[4] || null, track: fields[5] || null});
    }
    if (type === '$O' && fields.length >= 35) {
      const identity = {
        carNumber: fields[29] || null,
        firstName: fields[30] || null,
        lastName: fields[31] || null,
        seriesLabel: fields[32] || null,
        team: fields[35] || null,
        feedDriverId: fields.at(-2) || null,
      };
      const key = identity.feedDriverId || `${identity.carNumber}|${identity.firstName}|${identity.lastName}`;
      if (key && !driverIdentities.has(key)) driverIdentities.set(key, identity);
    }
    if (type === '$U' && fields[1] === 'N') {
      const definition = {
        seriesCode: fields[3] || null,
        track: fields[4] || null,
        trackType: fields[5] || null,
        lengthMiles: Number(fields[6]) || null,
        timingPointLabels: fields.filter((value) => /^(?:SF\*?|SFT|I\d+[A-Z]*|RS|PIC|PI|SFP\*?|PO)$/.test(value)),
      };
      trackDefinitions.set(`${definition.seriesCode}|${definition.track}`, definition);
    }
    if (type === '$S' && fields.length >= 10) {
      const label = fields[6] || null;
      const carNumber = fields[4] || null;
      const timeOfDayTicks = numericHex(fields[7]);
      if (label) namedSectionLabels.add(label);
      if (carNumber) namedSectionCars.add(carNumber);
      namedSectionRecordCount += 1;
      if (timeOfDayTicks !== null && currentHeartbeatEpoch !== null) {
        namedSectionHeartbeatDeltas.push(timeOfDayTicks / 10_000 - (currentHeartbeatEpoch % 86_400));
      }
      if (namedSectionSamples.length < 25) {
        namedSectionSamples.push({
          seriesCode: fields[3] || null,
          carNumber,
          feedPosition: numericHex(fields[5]),
          sectionLabel: label,
          timeOfDayTicksHex: fields[7] || null,
          sectionDurationTicksHex: fields[8] || null,
          timeOfDayTicks,
          sectionDurationTicks: numericHex(fields[8]),
        });
      }
    }
    if (type === '$F' || type === '$A' || type === '$R' || type === '$M') flagMessageCount += 1;
    if (line.includes('Yellow Flag at:')) yellowReasonMessageCount += 1;
  }

  const validHeartbeats = heartbeats.filter((row) => row.epoch !== null);
  const heartbeatGaps = [];
  for (let index = 1; index < validHeartbeats.length; index += 1) {
    heartbeatGaps.push(validHeartbeats[index].epoch - validHeartbeats[index - 1].epoch);
  }
  const heartbeatSeries = [...new Set(validHeartbeats.map((row) => row.seriesCode).filter(Boolean))];
  const observedSeries = new Set(
    [...sessionStates.values()]
      .map((row) => {
        if (row.seriesCode?.endsWith('.L')) return 'INDY_NXT';
        if (expectedYear !== null && expectedYear <= 2016 && row.seriesCode?.endsWith('.P')) return 'INDY_NXT';
        if (row.seriesCode?.endsWith('.I')) return 'INDYCAR';
        return null;
      })
      .filter(Boolean),
  );
  const hasSeriesMismatch = expectedSeries && observedSeries.size > 0 && !observedSeries.has(expectedSeries);
  let qualityStatus = 'usable';
  const qualityReasons = [];
  if (sessionHeaders.length > 1 || observedSeries.size > 1) {
    qualityStatus = 'mixed_session_requires_segmentation';
    qualityReasons.push(`${sessionHeaders.length} new-session headers and ${observedSeries.size} observed series`);
  }
  if (hasSeriesMismatch) {
    qualityStatus = 'series_mismatch';
    qualityReasons.push(`expected ${expectedSeries}; observed ${[...observedSeries].join(', ') || 'unknown'}`);
  }
  if (validHeartbeats.length === 0) {
    qualityStatus = 'no_heartbeat';
    qualityReasons.push('no parseable $H heartbeat records');
  }

  const csvLines = csvBytes ? csvBytes.toString('utf8').split(/\r?\n/).filter(Boolean) : [];
  return {
    archiveEntries: entries.map((entry) => ({
      name: entry.name,
      compressedSize: entry.compressedSize,
      uncompressedSize: entry.uncompressedSize,
    })),
    replayLog: {
      bytes: logBytes.length,
      lineCount: lines.length,
      sessionHeaderCount: sessionHeaders.length,
      sessionHeaders,
      observedSessions: [...sessionStates.values()],
      observedSeries: [...observedSeries],
      heartbeatSeriesCodes: heartbeatSeries,
      heartbeatCount: validHeartbeats.length,
      firstHeartbeatFeedTimestamp:
        validHeartbeats.length === 0 ? null : new Date(validHeartbeats[0].epoch * 1000).toISOString(),
      lastHeartbeatFeedTimestamp:
        validHeartbeats.length === 0 ? null : new Date(validHeartbeats.at(-1).epoch * 1000).toISOString(),
      heartbeatTimestampSemantics:
        'Feed-supplied integer seconds rendered in ISO form for comparison. The encoded timezone has not been validated; do not label this UTC without a track/session timezone join.',
      heartbeatSpanSeconds:
        validHeartbeats.length === 0 ? null : validHeartbeats.at(-1).epoch - validHeartbeats[0].epoch,
      heartbeatGapMedianSeconds: median(heartbeatGaps),
      heartbeatGapMaxSeconds: maximum(heartbeatGaps),
      exactConsecutiveOneSecondHeartbeat: heartbeatGaps.length > 0 && heartbeatGaps.every((value) => value === 1),
      messageTypeCounts,
      flagMessageCount,
      yellowReasonMessageCount,
      drivers: [...driverIdentities.values()],
      bryce: [...driverIdentities.values()].find(
        (driver) => driver.firstName?.toLowerCase() === 'bryce' && driver.lastName?.toLowerCase() === 'aron',
      ) ?? null,
      trackDefinitions: [...trackDefinitions.values()],
      namedSectionTiming: {
        recordCount: namedSectionRecordCount,
        carCount: namedSectionCars.size,
        labels: [...namedSectionLabels],
        rawTickScaleInference: {
          secondsPerTick: 0.0001,
          confidence: 'high_for_relative_timing_timezone_unvalidated',
          basis: 'Section-duration hex values become plausible seconds and cumulative time-of-day values align to the adjacent one-second feed heartbeat when divided by 10,000. INDYCAR also documents timeline recording to the ten-thousandth of a second. Retain raw hex and validate timezone before canonical UTC use.',
          sourceReference: 'https://www.indycar.com/Fan-Info/INDYCAR-101/Additional-Updates',
          comparisonCount: namedSectionHeartbeatDeltas.length,
          deltaToPrecedingHeartbeatMedianSeconds: median(namedSectionHeartbeatDeltas),
          deltaToPrecedingHeartbeatP95Seconds: percentile(namedSectionHeartbeatDeltas, 0.95),
          withinOneSecondCount: namedSectionHeartbeatDeltas.filter((value) => Math.abs(value) <= 1).length,
          withinOneSecondFraction:
            namedSectionHeartbeatDeltas.length === 0
              ? null
              : namedSectionHeartbeatDeltas.filter((value) => Math.abs(value) <= 1).length /
                namedSectionHeartbeatDeltas.length,
        },
        samples: namedSectionSamples,
      },
    },
    derivedCsv: {
      present: Boolean(csvEntry),
      bytes: csvBytes?.length ?? 0,
      rowCountExcludingHeader: Math.max(0, csvLines.length - 1),
      header: csvLines[0] ?? null,
    },
    quality: {status: qualityStatus, reasons: qualityReasons},
  };
}

export function* raceToolsSectionEvents(zipBytes) {
  const entries = centralEntries(zipBytes);
  const logEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.log'));
  if (!logEntry) throw new Error('session ZIP has no .log entry');
  const lines = localEntryData(zipBytes, logEntry).toString('latin1').split(/\r?\n/).filter(Boolean);
  const delimiter = '¦';
  const identities = new Map();
  for (const line of lines) {
    if (!line.startsWith('$E')) continue;
    const fields = line.split(delimiter);
    if (fields.length < 15) continue;
    const identity = {
      seriesCode: fields[3] || null,
      carNumber: fields[4] || null,
      driver: fields[6] || null,
      feedDriverId: fields[10] || null,
      team: fields[14] || null,
    };
    const key = `${identity.seriesCode}|${identity.carNumber}`;
    if (identity.carNumber && !identities.has(key)) identities.set(key, identity);
  }

  let nearestPrecedingHeartbeatEpoch = null;
  for (const line of lines) {
    const fields = line.split(delimiter);
    if (line.startsWith('$H')) {
      nearestPrecedingHeartbeatEpoch = numericHex(fields[5]);
      continue;
    }
    if (!line.startsWith('$S') || fields.length < 10) continue;
    const seriesCode = fields[3] || null;
    const carNumber = fields[4] || null;
    const timeOfDayTicks = numericHex(fields[7]);
    const sectionDurationTicks = numericHex(fields[8]);
    yield {
      recordType: 'named_section_timing',
      updateCode: fields[1] || null,
      feedRecordIdHex: fields[2] || null,
      seriesCode,
      carNumber,
      identity: identities.get(`${seriesCode}|${carNumber}`) ?? null,
      feedPosition: numericHex(fields[5]),
      sectionLabel: fields[6] || null,
      timeOfDayTicksHex: fields[7] || null,
      timeOfDayTicks,
      timeOfDaySecondsInferred: timeOfDayTicks === null ? null : timeOfDayTicks / 10_000,
      sectionDurationTicksHex: fields[8] || null,
      sectionDurationTicks,
      sectionDurationSecondsInferred: sectionDurationTicks === null ? null : sectionDurationTicks / 10_000,
      nearestPrecedingHeartbeatFeedTimestamp:
        nearestPrecedingHeartbeatEpoch === null
          ? null
          : new Date(nearestPrecedingHeartbeatEpoch * 1000).toISOString(),
      timingSemantics:
        'Named section/timing-loop event. Tick-to-second conversion is an evidence-backed inference; the heartbeat field is the nearest preceding one-second feed timestamp with unvalidated timezone semantics, not exact crossing UTC.',
    };
  }
}
