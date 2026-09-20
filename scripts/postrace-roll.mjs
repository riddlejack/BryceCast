#!/usr/bin/env node
/**
 * postrace:roll — one guarded command for the post-race roll-forward (Brief T).
 *
 * Wraps scripts/lib/postrace-roll-core.mjs. See that module for the pipeline
 * order and the hard rules. This CLI just parses flags, runs it against the real
 * `npm run` step runner, and exits with the pipeline's exit code.
 *
 *   npm run postrace:roll            # run the full chain (hard-stops on failure)
 *   npm run postrace:roll:dry        # validate preflight only, run nothing
 *
 * BRYCECAST_SQLITE_PATH is optional; official championship standings are primary.
 * Sets BRYCECAST_ALLOW_EVENT_ROLL=1 for the package step only, after preflight.
 * Never deploys, never touches LaunchAgents.
 *
 * Locking: shares `data/live/postrace-pipeline.lock` with `postrace:auto`, the
 * unattended scheduler. Two concurrent rolls would fight over the same generated
 * artifacts, so whichever starts second refuses. `postrace:auto` holds the lock
 * across its whole run and passes BRYCECAST_POSTRACE_LOCK_OWNED=1 to this child,
 * which is how an automated roll runs inside the lock it already owns.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPostraceRoll } from './lib/postrace-roll-core.mjs';

const dryRun = process.argv.includes('--dry-run');
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const lockPath = join(repoRoot, 'data/live/postrace-pipeline.lock');
const LOCK_STALE_MS = 6 * 60 * 60 * 1000;

const readLock = () => {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
};

// A dry run mutates nothing, so it never needs the lock. An automated roll is
// already inside postrace:auto's lock.
const needsLock = !dryRun && process.env.BRYCECAST_POSTRACE_LOCK_OWNED !== '1';
let lockOwned = false;

if (needsLock) {
  const existing = readLock();
  if (existing?.pid && Number(existing.pid) !== process.pid) {
    const heartbeat = Date.parse(existing.heartbeatAt ?? existing.startedAt ?? '');
    const fresh = Number.isFinite(heartbeat) && Date.now() - heartbeat <= (existing.staleAfterMs ?? LOCK_STALE_MS);
    if (fresh) {
      process.stderr.write(
        `[FAIL] The postrace pipeline lock is held by ${existing.owner ?? 'another run'} (pid ${existing.pid}).\n` +
          `       ${lockPath}\n` +
          `       Wait for it to finish; inspect a stale lock before removing it.\n`
      );
      process.exit(1);
    }
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  const tmp = `${lockPath}.${process.pid}.tmp`;
  writeFileSync(
    tmp,
    `${JSON.stringify(
      {
        pid: process.pid,
        owner: 'postrace-roll',
        startedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        staleAfterMs: LOCK_STALE_MS
      },
      null,
      2
    )}\n`
  );
  renameSync(tmp, lockPath);
  lockOwned = true;
}

const releaseLock = () => {
  if (!lockOwned) return;
  const current = readLock();
  if (current && Number(current.pid) === process.pid && existsSync(lockPath)) rmSync(lockPath, { force: true });
  lockOwned = false;
};

process.on('exit', releaseLock);

let exitCode = 1;
try {
  const result = runPostraceRoll({ dryRun });
  exitCode = result.exitCode;
  if (result.report.reportPaths) {
    process.stdout.write(`\nRun report:\n  ${result.report.reportPaths.json}\n  ${result.report.reportPaths.human}\n`);
  }
} finally {
  releaseLock();
}

process.exit(exitCode);
