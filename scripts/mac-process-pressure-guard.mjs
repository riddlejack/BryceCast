#!/usr/bin/env node

import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.env.PROCESS_GUARD_OUT_DIR
  ? path.resolve(process.env.PROCESS_GUARD_OUT_DIR)
  : path.join(ROOT, 'analysis', 'mac-process-limits');
const STATUS_PATH = path.join(OUT_DIR, 'process-pressure-guard-status.json');
const EVENTS_PATH = path.join(OUT_DIR, 'process-pressure-guard-events.jsonl');

const DEFAULT_PATTERNS = [
  'node .*scripts/(race-poller|probe-onboards|live-source-pressure-test|api-server|api-smoke|live-weather|qa-render)\\.mjs',
  'npm run (dev|serve|poll|probe|audit)',
  'vite( |$)',
  '/Applications/Petdex\\.app/|petdex-desktop|sidecar/server\\.js',
];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(arg => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const CONFIG = {
  intervalMs: Number(argValue('interval-ms', process.env.PROCESS_GUARD_INTERVAL_MS || 5000)),
  warningRatio: Number(argValue('warning-ratio', process.env.PROCESS_GUARD_WARNING_RATIO || 0.8)),
  criticalRatio: Number(argValue('critical-ratio', process.env.PROCESS_GUARD_CRITICAL_RATIO || 0.9)),
  emergencyRatio: Number(argValue('emergency-ratio', process.env.PROCESS_GUARD_EMERGENCY_RATIO || 0.95)),
  fallbackLimit: Number(argValue('fallback-limit', process.env.PROCESS_GUARD_FALLBACK_LIMIT || 1000)),
  minAgeSeconds: Number(argValue('min-age-seconds', process.env.PROCESS_GUARD_MIN_AGE_SECONDS || 300)),
  killEnabled: hasFlag('enable-kill') || process.env.PROCESS_GUARD_ENABLE_KILL === '1',
  dryRun: !hasFlag('enable-kill') && process.env.PROCESS_GUARD_ENABLE_KILL !== '1',
  sigkillAfterMs: Number(argValue('sigkill-after-ms', process.env.PROCESS_GUARD_SIGKILL_AFTER_MS || 0)),
  maxKillsPerSweep: Number(argValue('max-kills-per-sweep', process.env.PROCESS_GUARD_MAX_KILLS_PER_SWEEP || 12)),
  zombieParentCriticalCount: Number(argValue('zombie-parent-critical-count', process.env.PROCESS_GUARD_ZOMBIE_PARENT_CRITICAL_COUNT || 50)),
  user: argValue('user', process.env.USER || ''),
  patterns: (process.env.PROCESS_GUARD_KILL_PATTERNS
    ? process.env.PROCESS_GUARD_KILL_PATTERNS.split('|||')
    : DEFAULT_PATTERNS).map(pattern => new RegExp(pattern, 'i')),
};

let limitSnapshot = null;
let lastInventory = null;
let consecutiveInventoryFailures = 0;

function runBuffered(command, args, timeoutMs = 10_000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status: null, signal: null, error: String(error.message || error), stdout, stderr });
    });
    child.on('close', (status, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, signal, error: null, stdout, stderr });
    });
  });
}

function parseLaunchctlLimit(text) {
  const match = text.match(/^\s*\S+\s+(\S+)\s+(\S+)/m);
  if (!match) return null;
  const normalize = value => (value === 'unlimited' ? Infinity : Number(value));
  return { soft: normalize(match[1]), hard: normalize(match[2]) };
}

function parseSysctl(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^(kern\.[^:=\s]+)\s*[:=]\s*(\d+)/);
    if (match) values[match[1]] = Number(match[2]);
  }
  return values;
}

function parseElapsed(text) {
  const parts = text.trim().split(/[-:]/).map(Number);
  if (parts.some(Number.isNaN)) return 0;
  if (text.includes('-')) {
    const [days, hours, minutes, seconds] = parts;
    return (((days * 24 + hours) * 60 + minutes) * 60 + seconds);
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return ((hours * 60 + minutes) * 60 + seconds);
  }
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  return parts[0] || 0;
}

function parseProcessInventory(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!match) continue;
    const [, pidRaw, ppidRaw, user, stat, etime, command] = match;
    rows.push({
      pid: Number(pidRaw),
      ppid: Number(ppidRaw),
      user,
      stat,
      etime,
      ageSeconds: parseElapsed(etime),
      command: command.trim(),
    });
  }
  return rows;
}

function summarize(rows) {
  const byCommand = new Map();
  const byUser = new Map();
  const zombieParents = new Map();
  let zombies = 0;
  for (const row of rows) {
    const base = row.command.split(/\s+/)[0].split('/').pop();
    byCommand.set(base, (byCommand.get(base) || 0) + 1);
    byUser.set(row.user, (byUser.get(row.user) || 0) + 1);
    if (/Z/.test(row.stat)) {
      zombies += 1;
      zombieParents.set(row.ppid, (zombieParents.get(row.ppid) || 0) + 1);
    }
  }
  const top = map => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)
    .map(([name, count]) => ({ name, count }));
  return { total: rows.length, zombies, zombieParents: top(zombieParents), byUser: top(byUser), byCommand: top(byCommand) };
}

function effectiveProcessLimit() {
  const candidates = [
    limitSnapshot?.launchMaxproc?.soft,
    limitSnapshot?.sysctlValues?.['kern.maxprocperuid'],
  ].filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return candidates.length ? Math.min(...candidates) : CONFIG.fallbackLimit;
}

function killCandidates(rows) {
  return rows
    .filter(row => row.user === CONFIG.user)
    .filter(row => row.pid !== process.pid && row.ppid !== process.pid)
    .filter(row => row.ageSeconds >= CONFIG.minAgeSeconds)
    .filter(row => !row.command.includes('mac-process-pressure-guard.mjs'))
    .filter(row => CONFIG.patterns.some(pattern => pattern.test(row.command)))
    .sort((a, b) => b.ageSeconds - a.ageSeconds)
    .slice(0, CONFIG.maxKillsPerSweep);
}

function zombieParentCandidates(rows) {
  const byPid = new Map(rows.map(row => [row.pid, row]));
  const zombiesByParent = new Map();
  for (const row of rows) {
    if (/Z/.test(row.stat)) {
      zombiesByParent.set(row.ppid, (zombiesByParent.get(row.ppid) || 0) + 1);
    }
  }

  return [...zombiesByParent.entries()]
    .filter(([, count]) => count >= CONFIG.zombieParentCriticalCount)
    .map(([ppid, count]) => ({ parent: byPid.get(ppid), count }))
    .filter(entry => entry.parent)
    .filter(entry => entry.parent.user === CONFIG.user)
    .filter(entry => CONFIG.patterns.some(pattern => pattern.test(entry.parent.command)))
    .sort((a, b) => b.count - a.count)
    .map(entry => entry.parent);
}

async function logEvent(event) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  await appendFile(EVENTS_PATH, `${line}\n`);
}

async function refreshLimits() {
  const [launchMaxproc, sysctl] = await Promise.all([
    runBuffered('/bin/launchctl', ['limit', 'maxproc']),
    runBuffered('/usr/sbin/sysctl', ['kern.maxproc', 'kern.maxprocperuid']),
  ]);
  limitSnapshot = {
    launchMaxproc: parseLaunchctlLimit(launchMaxproc.stdout),
    sysctlValues: parseSysctl(sysctl.stdout),
    raw: { launchMaxproc, sysctl },
  };
}

async function collectInventory() {
  const result = await runBuffered('/bin/ps', ['-axo', 'pid=,ppid=,user=,stat=,etime=,command=']);
  if (result.status !== 0 || result.error) {
    consecutiveInventoryFailures += 1;
    await logEvent({ type: 'inventory_failed', consecutiveInventoryFailures, result });
    return null;
  }
  consecutiveInventoryFailures = 0;
  const rows = parseProcessInventory(result.stdout);
  lastInventory = { at: new Date().toISOString(), rows, summary: summarize(rows) };
  return lastInventory;
}

async function terminate(rows, reason) {
  const candidates = killCandidates(rows);
  const kills = [];
  for (const row of candidates) {
    const record = { pid: row.pid, ageSeconds: row.ageSeconds, command: row.command, dryRun: CONFIG.dryRun };
    if (!CONFIG.dryRun) {
      try {
        process.kill(row.pid, 'SIGTERM');
        record.sigterm = true;
        if (CONFIG.sigkillAfterMs > 0) {
          setTimeout(() => {
            try { process.kill(row.pid, 'SIGKILL'); } catch {}
          }, CONFIG.sigkillAfterMs).unref();
        }
      } catch (error) {
        record.error = String(error.message || error);
      }
    }
    kills.push(record);
  }
  await logEvent({ type: 'terminate_candidates', reason, count: kills.length, kills });
  return kills;
}

async function sweep() {
  if (!limitSnapshot) await refreshLimits();
  const inventory = await collectInventory();
  const source = inventory || lastInventory;
  const limit = effectiveProcessLimit();
  const count = source?.summary?.total ?? null;
  const ratio = count === null ? null : count / limit;
  const status = {
    at: new Date().toISOString(),
    config: { ...CONFIG, patterns: CONFIG.patterns.map(pattern => pattern.source) },
    limits: limitSnapshot,
    effectiveProcessLimit: limit,
    processCount: count,
    processRatio: ratio,
    consecutiveInventoryFailures,
    inventoryAgeSeconds: source ? Math.round((Date.now() - Date.parse(source.at)) / 1000) : null,
    summary: source?.summary ?? null,
  };
  await writeFile(STATUS_PATH, `${JSON.stringify(status, null, 2)}\n`);

  if (!source) return;
  const zombieParents = zombieParentCandidates(source.rows);
  if (zombieParents.length > 0) {
    await terminate(zombieParents, `zombie_parent_count_gte_${CONFIG.zombieParentCriticalCount}`);
    return;
  }
  if (consecutiveInventoryFailures > 0) {
    await terminate(source.rows, 'inventory_spawn_failed_using_cached_inventory');
    return;
  }
  if (ratio !== null && ratio >= CONFIG.emergencyRatio) {
    await terminate(source.rows, `emergency_ratio_${ratio.toFixed(3)}`);
  } else if (ratio !== null && ratio >= CONFIG.criticalRatio) {
    await terminate(source.rows, `critical_ratio_${ratio.toFixed(3)}`);
  } else if (ratio !== null && ratio >= CONFIG.warningRatio) {
    await logEvent({ type: 'warning_ratio', ratio, count, limit });
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  await logEvent({ type: 'guard_started', config: { ...CONFIG, patterns: CONFIG.patterns.map(pattern => pattern.source) } });
  await sweep();
  setInterval(() => {
    sweep().catch(error => logEvent({ type: 'sweep_error', error: String(error.stack || error) }));
  }, CONFIG.intervalMs);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
