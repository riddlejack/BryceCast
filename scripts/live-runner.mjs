#!/usr/bin/env node

import { createLiveRunner } from './lib/live-runner-core.mjs';

const argValue = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const hasFlag = (name) => process.argv.includes(`--${name}`);

const numericArg = (name, fallback) => {
  const value = argValue(name, null);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const once = hasFlag('once');
const maxIterations = once ? 1 : numericArg('max-iterations', 0);
const dryRun = hasFlag('dry-run');
const raw = hasFlag('no-raw') ? false : hasFlag('raw') ? true : true;
const respectCadence = hasFlag('respect-cadence');
const boundedWithoutCadence = maxIterations > 0 && !respectCadence;

const runner = createLiveRunner({
  dryRun,
  raw,
  fetchTimeoutMs: numericArg('timeout-ms', 5000),
  idlePollMs: numericArg('idle-poll-ms', 5 * 60 * 1000),
  armedPollMs: numericArg('armed-poll-ms', 15_000),
  livePollMs: numericArg('live-poll-ms', 1000),
  cooldownPollMs: numericArg('cooldown-poll-ms', 15_000),
  enrichmentPollMs: numericArg('enrichment-poll-ms', 15_000),
  armWindowMs: numericArg('arm-window-ms', 45 * 60 * 1000),
  cooldownMs: numericArg('cooldown-ms', 10 * 60 * 1000),
  sleepCapMs: boundedWithoutCadence ? 0 : Infinity
});

const shutdown = () => {
  runner.stop();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await runner.run({ maxIterations });
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })
  );
  process.exitCode = 1;
}
