#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'analysis', 'mac-process-limits');

function run(command, args = []) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15_000,
    maxBuffer: 8 * 1024 * 1024,
  });

  return {
    command: [command, ...args].join(' '),
    status: result.status,
    signal: result.signal,
    error: result.error ? String(result.error.message || result.error) : null,
    elapsedMs: Date.now() - startedAt,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function firstInt(text) {
  const match = text.match(/\b(\d+)\b/);
  return match ? Number(match[1]) : null;
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

function processFamilies(psOutput) {
  const counts = new Map();
  for (const raw of psOutput.split(/\r?\n/)) {
    const command = raw.trim();
    if (!command) continue;
    const base = command.split('/').pop() || command;
    counts.set(base, (counts.get(base) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([command, count]) => ({ command, count }));
}

function recommendations({ launchMaxproc, sysctlValues, userProcessCount }) {
  const totalMemGb = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const isAppleSilicon = os.arch() === 'arm64';
  const isM5Pro = os.cpus().some(cpu => /Apple M5 Pro/i.test(cpu.model || ''));

  const expectedFloor = totalMemGb >= 64 ? 8192 : totalMemGb >= 32 ? 4096 : 2048;
  const preferredSystemMaxproc = totalMemGb >= 64 ? 16384 : totalMemGb >= 32 ? 8192 : 4096;
  const preferredUserMaxproc = Math.floor(preferredSystemMaxproc * 0.75);

  const observedSoft = launchMaxproc?.soft ?? null;
  const observedHard = launchMaxproc?.hard ?? null;
  const observedKernelMaxproc = sysctlValues['kern.maxproc'] ?? null;
  const observedKernelPerUid = sysctlValues['kern.maxprocperuid'] ?? null;

  const flags = [];
  if (observedSoft !== null && Number.isFinite(observedSoft) && observedSoft < expectedFloor) {
    flags.push(`launchctl maxproc soft limit ${observedSoft} is low for ${totalMemGb} GB RAM`);
  }
  if (observedKernelPerUid !== null && observedKernelPerUid < expectedFloor) {
    flags.push(`kern.maxprocperuid ${observedKernelPerUid} is low for ${totalMemGb} GB RAM`);
  }
  if (observedKernelMaxproc !== null && observedKernelPerUid !== null && observedKernelPerUid >= observedKernelMaxproc) {
    flags.push(`per-UID process ceiling ${observedKernelPerUid} should stay below system ceiling ${observedKernelMaxproc}`);
  }
  if (userProcessCount !== null && observedKernelPerUid !== null && userProcessCount > observedKernelPerUid * 0.8) {
    flags.push(`current user process count ${userProcessCount} is above 80% of kern.maxprocperuid ${observedKernelPerUid}`);
  }

  return {
    hardwareClass: {
      arch: os.arch(),
      totalMemGb,
      cpuCount: os.cpus().length,
      isAppleSilicon,
      isM5Pro,
    },
    targetEnvelope: {
      preferredSystemMaxproc,
      preferredUserMaxproc,
      rationale: '64 GB Apple Silicon should have thousands of process slots, but keep per-user under system-wide to preserve OS recovery headroom.',
    },
    observed: {
      launchctlMaxprocSoft: observedSoft,
      launchctlMaxprocHard: observedHard,
      kernelMaxproc: observedKernelMaxproc,
      kernelMaxprocPerUid: observedKernelPerUid,
      userProcessCount,
    },
    flags,
    nextActions: [
      'Do not change limits while the machine is already in Resource temporarily unavailable state.',
      'After a clean reboot, compare observed values with the target envelope.',
      'If observed maxproc is below the target envelope, use a balanced LaunchDaemon or launchctl limit change and reboot.',
      'Run the process pressure guard before high-risk live race drills.',
    ],
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const commands = {
    swVers: run('/usr/bin/sw_vers'),
    uname: run('/usr/bin/uname', ['-a']),
    launchMaxproc: run('/bin/launchctl', ['limit', 'maxproc']),
    launchMaxfiles: run('/bin/launchctl', ['limit', 'maxfiles']),
    sysctl: run('/usr/sbin/sysctl', [
      'kern.maxproc',
      'kern.maxprocperuid',
      'kern.num_proc',
      'kern.num_tasks',
      'kern.num_threads',
      'kern.num_taskthreads',
      'kern.maxfiles',
      'kern.maxfilesperproc',
      'kern.num_files',
    ]),
    pgrepPath: run('/usr/bin/which', ['pgrep']),
    userProcesses: run('/bin/ps', ['-u', process.env.USER || '', '-o', 'comm=']),
    processUsers: run('/bin/ps', ['-axo', 'user=']),
    zombies: run('/bin/ps', ['-A', '-o', 'ppid=,stat=']),
  };

  const userProcessCount = commands.userProcesses.status === 0
    ? commands.userProcesses.stdout.split(/\r?\n/).filter(Boolean).length
    : null;

  const sysctlValues = parseSysctl(commands.sysctl.stdout);
  const launchMaxproc = parseLaunchctlLimit(commands.launchMaxproc.stdout);

  const report = {
    generatedAt: new Date().toISOString(),
    host: {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      totalmemBytes: os.totalmem(),
      totalmemGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      cpuCount: os.cpus().length,
      cpuModels: [...new Set(os.cpus().map(cpu => cpu.model))],
      loadavg: os.loadavg(),
      uptimeSeconds: os.uptime(),
    },
    parsed: {
      launchMaxproc,
      launchMaxfiles: parseLaunchctlLimit(commands.launchMaxfiles.stdout),
      sysctlValues,
      userProcessCount,
      topUserProcessFamilies: processFamilies(commands.userProcesses.stdout),
    },
    recommendation: recommendations({ launchMaxproc, sysctlValues, userProcessCount }),
    raw: commands,
  };

  const outPath = path.join(OUT_DIR, `process-limit-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(report.recommendation, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
