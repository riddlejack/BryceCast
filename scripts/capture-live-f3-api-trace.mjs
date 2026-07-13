import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const argument = (name, fallback) => {
  const value = process.argv.find((candidate) => candidate.startsWith(`--${name}=`));
  return value ? value.slice(name.length + 3) : fallback;
};

const base = argument('base', 'http://127.0.0.1:8793');
const seconds = Math.max(2, Number(argument('seconds', '60')));
const output = resolve(argument('out', 'analysis/live-f3-audit/api-arrivals.json'));

const fetchJson = async (path) => {
  const startedAt = new Date().toISOString();
  const response = await fetch(`${base}${path}`, { headers: { accept: 'application/json' } });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(payload)}`);
  return { startedAt, receivedAt: new Date().toISOString(), payload };
};

const samples = [];
const startedMs = Date.now();
for (let index = 0; index < seconds; index += 1) {
  const [readiness, timing] = await Promise.all([fetchJson('/api/readiness'), fetchJson('/api/timing')]);
  const bryce = timing.payload.rows.find((row) => row.bryce === true) ?? null;
  samples.push({
    index,
    requestedAt: readiness.startedAt,
    receivedAt: readiness.receivedAt,
    readinessCheckedAt: readiness.payload.checkedAt,
    timingCheckedAt: timing.payload.checkedAt,
    archiveCheckedAt: readiness.payload.replay?.simulation?.archiveCheckedAt ?? null,
    state: readiness.payload.state,
    flag: timing.payload.heartbeat?.flag ?? null,
    lap: timing.payload.heartbeat?.lap ?? null,
    rowCount: timing.payload.rowCount,
    bryce: bryce ? {
      driverId: bryce.driverId,
      rank: bryce.rank,
      liveRank: bryce.liveRank,
      gap: bryce.gap,
      liveGap: bryce.liveGap,
      diff: bryce.diff,
      liveDiffAhead: bryce.liveDiffAhead,
      liveDiffBehind: bryce.liveDiffBehind
    } : null
  });
  const nextAt = startedMs + (index + 1) * 1_000;
  if (index < seconds - 1 && Date.now() < nextAt) await new Promise((resolveDelay) => setTimeout(resolveDelay, nextAt - Date.now()));
}

const archiveTimes = samples.map((sample) => Date.parse(sample.archiveCheckedAt ?? '')).filter(Number.isFinite);
const archiveIntervals = archiveTimes.slice(1).map((value, index) => (value - archiveTimes[index]) / 1_000);
const result = {
  schemaVersion: 'live-f3-api-arrivals.v1',
  base,
  requestedCadenceMs: 1_000,
  samples,
  summary: {
    samples: samples.length,
    firstRequestedAt: samples[0]?.requestedAt ?? null,
    lastReceivedAt: samples.at(-1)?.receivedAt ?? null,
    distinctArchivePayloads: new Set(samples.map((sample) => sample.archiveCheckedAt)).size,
    medianArchiveIntervalSeconds: archiveIntervals.length ? archiveIntervals.slice().sort((left, right) => left - right)[Math.floor(archiveIntervals.length / 2)] : null,
    distinctLiveGapValues: new Set(samples.map((sample) => sample.bryce?.liveGap)).size,
    distinctLapLineGapValues: new Set(samples.map((sample) => sample.bryce?.gap)).size
  }
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output, ...result.summary }, null, 2));
