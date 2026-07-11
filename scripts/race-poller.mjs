import { liveSourceEndpoints, raceSnapshotEndpoints } from './live-source-endpoints.mjs';
import { buildSummary, fetchEndpoint, writeStorage } from './lib/race-poller-core.mjs';

const endpoints = process.argv.includes('--all-sources') ? liveSourceEndpoints : raceSnapshotEndpoints;

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.findLast((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.lastIndexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const watch = process.argv.includes('--watch');
const once = process.argv.includes('--once') || !watch;
const intervalMs = Number(argValue('interval-ms', argValue('interval', '15000')));
const iterations = once ? 1 : Number(argValue('iterations', '0'));
const fetchTimeoutMs = Number(argValue('timeout-ms', '5000'));

const pollOnce = async () => {
  const results = await Promise.all(endpoints.map((endpoint) => fetchEndpoint(endpoint, { timeoutMs: fetchTimeoutMs })));
  const summary = buildSummary(results);
  await writeStorage(summary, results);
  console.log(
    JSON.stringify(
      {
        checkedAt: summary.checkedAt,
        sessionKey: summary.sessionKey,
        event: summary.eventName,
        flag: summary.flag,
        lap: `${summary.lap}/${summary.totalLaps}`,
        sourceState: summary.sourceState,
        bryce: summary.bryce
          ? {
              rank: summary.bryce.rank,
              status: summary.bryce.status,
              laps: summary.bryce.laps,
              gap: summary.bryce.gap,
              bestLapTime: summary.bryce.bestLapTime
            }
          : null,
        endpoints: summary.endpoints.map((endpoint) => ({ id: endpoint.id, ok: endpoint.ok, status: endpoint.status, bytes: endpoint.bytes })),
        storage: summary.storage
      },
      null,
      2
    )
  );
};

let stopped = false;
process.on('SIGINT', () => {
  stopped = true;
});

if (once) {
  await pollOnce();
} else {
  let count = 0;
  while (!stopped && (iterations === 0 || count < iterations)) {
    const startedAt = Date.now();
    if (!stopped) {
      await pollOnce();
      count += 1;
    }
    const elapsedMs = Date.now() - startedAt;
    const sleepMs = Math.max(0, intervalMs - elapsedMs);
    if (!stopped && (iterations === 0 || count < iterations) && sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
}
