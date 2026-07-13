import { mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { compactTimingRowForReadiness } from './api-server.mjs';

const argument = (name, fallback) => {
  const value = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};

const sqlitePath = resolve(argument('sqlite', 'data/live/brycecast.sqlite'));
const outputDir = resolve(argument('out', 'analysis/live-f3-audit/traces'));
const windows = [
  { id: 'race1-green', session: '5544-6761', from: '2026-07-04T17:18:00.000Z', to: '2026-07-04T17:20:00.999Z', state: 'green, live intervals, lap 7 to 8' },
  { id: 'race1-yellow-neighbor-change', session: '5544-6761', from: '2026-07-04T17:22:50.000Z', to: '2026-07-04T17:24:50.999Z', state: 'yellow, P18 to P17, lap 11 to 12' },
  { id: 'race1-rank-change', session: '5544-6761', from: '2026-07-04T17:20:10.000Z', to: '2026-07-04T17:21:10.999Z', state: 'green, P15 to P17' },
  { id: 'race1-lap-boundary', session: '5544-6761', from: '2026-07-04T17:28:50.000Z', to: '2026-07-04T17:29:50.999Z', state: 'green, lap 14 to 15' },
  { id: 'race2-yellow-green-boundary', session: '5543-6760', from: '2026-07-05T14:07:15.000Z', to: '2026-07-05T14:09:15.999Z', state: 'green/yellow/green, lap 0 to 1, P15 to P16' },
  { id: 'race2-rank-change', session: '5543-6760', from: '2026-07-05T14:38:40.000Z', to: '2026-07-05T14:40:40.999Z', state: 'green, P15 to P14, lap 26 to 27' }
];

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const median = (values) => {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

const heartbeatSummary = (heartbeat) => ({
  eventName: heartbeat?.eventName ?? null,
  eventId: heartbeat?.EventID ?? null,
  eventSessionId: heartbeat?.EventSessionID ?? null,
  sessionName: heartbeat?.SessionName ?? null,
  sessionType: heartbeat?.SessionType ?? null,
  sessionStatus: heartbeat?.SessionStatus ?? null,
  series: heartbeat?.Series ?? null,
  flag: heartbeat?.currentFlag ?? null,
  lap: numberOrNull(heartbeat?.lapNumber),
  totalLaps: numberOrNull(heartbeat?.totalLaps),
  trackName: heartbeat?.trackName ?? null,
  trackType: heartbeat?.trackType ?? null
});

const database = new DatabaseSync(sqlitePath, { readOnly: true });
await mkdir(outputDir, { recursive: true });

const sessionRecords = new Map();
for (const session of new Set(windows.map((window) => window.session))) {
  const records = database
    .prepare('SELECT checked_at, flag, lap, payload_json FROM race_snapshots WHERE session_key = ? ORDER BY checked_at')
    .all(session)
    .map((record) => {
      const payload = JSON.parse(record.payload_json);
      const timing = payload.raw.timing.timing_results;
      return {
        checkedAt: record.checked_at,
        flag: record.flag,
        lap: record.lap,
        heartbeat: timing.heartbeat,
        rows: timing.Item,
        bryce: timing.Item.find((row) => String(row.DriverID) === '2143') ?? null
      };
    });
  sessionRecords.set(session, records);
}

const manifest = [];
for (const window of windows) {
  const records = sessionRecords.get(window.session).filter((record) => record.checkedAt >= window.from && record.checkedAt <= window.to);
  const trace = records.map((record) => {
    const normalizedRows = record.rows
      .slice()
      .sort((left, right) => Number(left.liveRank ?? left.rank ?? 999) - Number(right.liveRank ?? right.rank ?? 999))
      .map((row) => compactTimingRowForReadiness(row, record.heartbeat));
    const bryceIndex = normalizedRows.findIndex((row) => row.bryce === true);
    const nearFieldRows = normalizedRows.slice(Math.max(0, bryceIndex - 3), Math.min(normalizedRows.length, bryceIndex + 4));
    const timing = {
      checkedAt: record.checkedAt,
      sourceState: ['GREEN', 'YELLOW'].includes(record.flag) ? 'live' : 'cold',
      rowCount: record.rows.length,
      bryceNo: '9',
      heartbeat: heartbeatSummary(record.heartbeat),
      rowSelection: 'Bryce plus three live-ranked rows on each side; rowCount preserves full field size',
      rows: nearFieldRows
    };
    return {
      archiveCheckedAt: record.checkedAt,
      mapping: ['/api/readiness.liveTiming', '/api/timing'],
      readiness: {
        schemaVersion: 'live-readiness.v1',
        state: ['GREEN', 'YELLOW'].includes(record.flag) ? 'ready' : 'pre_session',
        checkedAt: record.checkedAt,
        liveTiming: {
          checkedAt: timing.checkedAt,
          sourceState: timing.sourceState,
          rowCount: timing.rowCount,
          bryceNo: timing.bryceNo,
          heartbeat: timing.heartbeat,
          bryce: nearFieldRows.find((row) => row.bryce === true) ?? null
        }
      },
      timing
    };
  });
  const path = resolve(outputDir, `${window.id}.jsonl`);
  await writeFile(path, `${trace.map((record) => JSON.stringify(record)).join('\n')}\n`);
  manifest.push({ ...window, samples: trace.length, path: relative(process.cwd(), path), firstCheckedAt: trace[0]?.archiveCheckedAt ?? null, lastCheckedAt: trace.at(-1)?.archiveCheckedAt ?? null });
}

const cadence = {};
for (const [session, records] of sessionRecords) {
  const sampleIntervals = records.slice(1).map((record, index) => (Date.parse(record.checkedAt) - Date.parse(records[index].checkedAt)) / 1_000);
  const summarizeFields = (selector) => {
    const fieldNames = [...new Set(records.flatMap((record) => Object.keys(selector(record) ?? {})))];
    return Object.fromEntries(fieldNames.sort().map((field) => {
      let previous = Symbol('first');
      let previousChangeAt = null;
      let changes = 0;
      let missing = 0;
      const distinct = new Set();
      const changeIntervals = [];
      for (const record of records) {
        const value = selector(record)?.[field];
        if (value === null || value === undefined || value === '') missing += 1;
        else distinct.add(JSON.stringify(value));
        const encoded = JSON.stringify(value);
        if (typeof previous === 'symbol') {
          previous = encoded;
          previousChangeAt = Date.parse(record.checkedAt);
        } else if (encoded !== previous) {
          const nextAt = Date.parse(record.checkedAt);
          changes += 1;
          changeIntervals.push((nextAt - previousChangeAt) / 1_000);
          previous = encoded;
          previousChangeAt = nextAt;
        }
      }
      return [field, { distinct: distinct.size, changes, missing, medianSecondsBetweenChanges: median(changeIntervals) }];
    }));
  };

  let eligibleChangedLiveGaps = 0;
  let internallyMatchedChangedLiveGaps = 0;
  let previousBryceGap = null;
  for (const record of records) {
    if (!['GREEN', 'YELLOW'].includes(record.flag) || numberOrNull(record.lap) === 0 || !record.bryce) continue;
    const ordered = record.rows.slice().sort((left, right) => Number(left.liveRank) - Number(right.liveRank));
    const index = ordered.findIndex((row) => String(row.DriverID) === '2143');
    const ahead = ordered[index - 1];
    const current = ordered[index];
    if (!ahead || current.liveGap === previousBryceGap) continue;
    previousBryceGap = current.liveGap;
    const liveGap = numberOrNull(current.liveGap);
    const currentDiff = numberOrNull(current.liveDiffAhead);
    const aheadDiff = numberOrNull(ahead.liveDiffAhead);
    if (liveGap === null || currentDiff === null || aheadDiff === null || String(current.laps) !== String(ahead.laps)) continue;
    eligibleChangedLiveGaps += 1;
    if (Math.abs((currentDiff - aheadDiff) / 1_000_000 - liveGap) <= 0.00015) internallyMatchedChangedLiveGaps += 1;
  }

  cadence[session] = {
    samples: records.length,
    firstCheckedAt: records[0]?.checkedAt ?? null,
    lastCheckedAt: records.at(-1)?.checkedAt ?? null,
    sampleCadenceSeconds: {
      median: median(sampleIntervals),
      p95: sampleIntervals.slice().sort((left, right) => left - right)[Math.floor(sampleIntervals.length * 0.95)] ?? null,
      max: Math.max(...sampleIntervals)
    },
    heartbeatFields: summarizeFields((record) => record.heartbeat),
    bryceTimingFields: summarizeFields((record) => record.bryce),
    liveGapInternalValidation: {
      eligibleChangedLiveGaps,
      internallyMatchedChangedLiveGaps,
      matchRate: eligibleChangedLiveGaps ? internallyMatchedChangedLiveGaps / eligibleChangedLiveGaps : null,
      relation: '(Bryce.liveDiffAhead - preceding-liveRank.liveDiffAhead) / 1e6 == Bryce.liveGap',
      caveat: 'Validation is restricted to active, same-lap, newly changed values because Race Control row fields can update asynchronously.'
    }
  };
}

await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify({ schemaVersion: 'live-f3-traces.v1', sqlitePath, kind: 'read-only archived payloads normalized through the production /api/timing row adapter', windows: manifest }, null, 2)}\n`);
await writeFile(resolve(outputDir, 'cadence-summary.json'), `${JSON.stringify({ schemaVersion: 'live-f3-cadence.v1', sqlitePath, sessions: cadence }, null, 2)}\n`);
database.close();

console.log(JSON.stringify({ sqlitePath, outputDir, windows: manifest.map(({ id, samples }) => ({ id, samples })), sessions: Object.keys(cadence) }, null, 2));
