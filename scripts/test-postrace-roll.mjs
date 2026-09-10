#!/usr/bin/env node
/**
 * Tests for postrace:roll (Part 2 of the Brief T task).
 *
 * Covers the two behaviors the task calls out explicitly:
 *   - the --dry-run mode validates preflight only and runs no steps;
 *   - the failure-stop path halts hard (a broken env var, and a mid-chain step
 *     failure), running nothing after the stop.
 * Plus the invariants that make the roll safe: history-before-package ordering,
 * and ALLOW_EVENT_ROLL scoped to the package step only.
 *
 * Uses an injected step runner so nothing shells out to the real pipeline; the
 * report is written to a temp dir so the repo stays clean.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  PIPELINE_STEPS,
  MANUAL_FOLLOWUPS,
  defaultRunStep,
  runPreflight,
  runPostraceRoll
} from './lib/postrace-roll-core.mjs';

const repoRoot = process.cwd();
const workdir = mkdtempSync(join(tmpdir(), 'brycecast-postrace-'));
const reportDir = join(workdir, 'reports');

let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

// A valid capture-archive sqlite for the happy-path preflight.
const goodSqlite = join(workdir, 'capture.sqlite');
const gdb = new DatabaseSync(goodSqlite);
gdb.exec(`CREATE TABLE race_snapshots (id INTEGER PRIMARY KEY, checked_at TEXT, session_key TEXT, source_state TEXT, payload_json TEXT)`);
gdb.prepare(`INSERT INTO race_snapshots (checked_at, session_key, source_state, payload_json) VALUES (?,?,?,?)`).run('2026-08-08T00:00:00Z', 'k', 'live', '{}');
gdb.close();

const baseEnv = { ...process.env, BRYCECAST_SQLITE_PATH: goodSqlite };
const silent = () => {};

console.log('postrace:roll');

// --- Static invariants ------------------------------------------------------
check('pipeline order: ingest-history precedes ui-data-package', () => {
  const ids = PIPELINE_STEPS.map((s) => s.id);
  assert.ok(ids.indexOf('ingest-history') < ids.indexOf('ui-data-package'), 'history must run before the package');
  assert.equal(ids[0], 'career-import', 'chain starts with the canonical import refresh');
});
check('ALLOW_EVENT_ROLL is scoped to the package step only', () => {
  const scoped = PIPELINE_STEPS.filter((s) => s.env && s.env.BRYCECAST_ALLOW_EVENT_ROLL === '1');
  assert.equal(scoped.length, 1, 'exactly one step carries the roll override');
  assert.equal(scoped[0].id, 'ui-data-package');
  for (const s of PIPELINE_STEPS) {
    if (s.id !== 'ui-data-package') assert.ok(!s.env?.BRYCECAST_ALLOW_EVENT_ROLL, `${s.id} must not carry the roll override`);
  }
});
check('timing archives and coverage are refreshed before history and UI', () => {
  const ids = PIPELINE_STEPS.map((s) => s.id);
  assert.ok(ids.indexOf('lake-sync') < ids.indexOf('timing-coverage'));
  assert.ok(ids.indexOf('timing-coverage') < ids.indexOf('timing-coverage-validate'));
  assert.ok(ids.indexOf('timing-coverage-validate') < ids.indexOf('ingest-history'));
  assert.ok(MANUAL_FOLLOWUPS.some((x) => x.id === 'deploy'));
});

// --- Preflight: happy path --------------------------------------------------
check('preflight passes with a valid sqlite in the repo root', () => {
  const pre = runPreflight({ env: baseEnv, cwd: repoRoot, now: Date.parse('2026-08-08T12:00:00Z') });
  assert.ok(pre.ok, `preflight should pass:\n${pre.checks.filter((c) => !c.ok).map((c) => c.name + ': ' + c.detail).join('\n')}`);
  assert.equal(pre.resolved.archive.hasRaceSnapshots, true);
});

// Official standings eliminate the old full-capture-database prerequisite.
check('preflight succeeds without SQLite when official standings are used', () => {
  const env = { ...process.env };
  delete env.BRYCECAST_SQLITE_PATH;
  const pre = runPreflight({ env, cwd: repoRoot });
  assert.equal(pre.ok, true);
  assert.equal(pre.resolved.sqlitePath, null);
});
check('failure-stop: an explicitly missing archive halts before any step', () => {
  let stepCalls = 0;
  const { ok, exitCode, report } = runPostraceRoll({
    env: { ...process.env, BRYCECAST_SQLITE_PATH: join(workdir, 'missing.sqlite') },
    cwd: repoRoot,
    runStep: () => { stepCalls += 1; return { ok: true, exitCode: 0 }; },
    onLog: silent,
    reportDir
  });
  assert.equal(ok, false);
  assert.equal(exitCode, 1);
  assert.equal(stepCalls, 0);
  assert.ok(report.steps.every((s) => s.status === 'pending'));
});

// --- Failure-stop path B: a mid-chain step fails ----------------------------
check('failure-stop: a nonzero step exit hard-stops the chain', () => {
  const calls = [];
  const failAt = 'career-coverage';
  const { ok, exitCode, report } = runPostraceRoll({
    dryRun: false,
    env: baseEnv,
    cwd: repoRoot,
    now: () => Date.parse('2026-08-08T12:00:00Z'),
    runStep: ({ step }) => {
      calls.push(step.id);
      return step.id === failAt ? { ok: false, exitCode: 7 } : { ok: true, exitCode: 0 };
    },
    onLog: silent,
    reportDir
  });
  assert.equal(ok, false);
  assert.equal(exitCode, 7, 'exit code propagates the failing step');
  // Steps up to and including the failure ran; nothing after did.
  const idx = PIPELINE_STEPS.findIndex((s) => s.id === failAt);
  assert.deepEqual(calls, PIPELINE_STEPS.slice(0, idx + 1).map((s) => s.id), 'ran through the failing step, then stopped');
  assert.equal(report.failedStep.id, failAt);
  const failedEntry = report.steps.find((s) => s.id === failAt);
  assert.equal(failedEntry.status, 'failed');
  for (const s of report.steps.slice(idx + 1)) assert.equal(s.status, 'skipped-after-failure');
});

// --- Effective env scoping through the real default runner contract ---------
check('only the package step receives ALLOW_EVENT_ROLL in its effective env', () => {
  const seen = {};
  runPostraceRoll({
    dryRun: false,
    env: baseEnv,
    cwd: repoRoot,
    now: () => Date.parse('2026-08-08T12:00:00Z'),
    // Mirror defaultRunStep's env merge to observe what the child WOULD get.
    runStep: ({ step, env }) => {
      const effective = { ...env, ...(step.env ?? {}) };
      seen[step.id] = effective.BRYCECAST_ALLOW_EVENT_ROLL ?? null;
      return { ok: true, exitCode: 0 };
    },
    onLog: silent,
    reportDir
  });
  assert.equal(seen['ui-data-package'], '1', 'package step gets the override');
  assert.equal(seen['ingest-history'], null, 'history step does not');
  assert.equal(seen['career-import'], null, 'import step does not');
});

// --- Dry-run: preflight only, no steps --------------------------------------
check('--dry-run validates preflight and runs NO steps', () => {
  const { ok, exitCode, report } = runPostraceRoll({
    dryRun: true,
    env: baseEnv,
    cwd: repoRoot,
    now: () => Date.parse('2026-08-08T12:00:00Z'),
    runStep: () => { throw new Error('dry-run must not execute a step'); },
    onLog: silent,
    reportDir
  });
  assert.equal(ok, true);
  assert.equal(exitCode, 0);
  assert.ok(report.steps.every((s) => s.status === 'skipped-dry-run'), 'all steps skipped in dry-run');
  assert.equal(report.mode, 'dry-run');
});

// --- Reports get written (JSON + human) -------------------------------------
check('run reports are written as JSON + human markdown', () => {
  const { report } = runPostraceRoll({
    dryRun: true,
    env: baseEnv,
    cwd: repoRoot,
    now: () => Date.parse('2026-08-08T12:00:00Z'),
    runStep: () => ({ ok: true, exitCode: 0 }),
    onLog: silent,
    reportDir
  });
  assert.ok(existsSync(report.reportPaths.json), 'JSON report exists');
  assert.ok(existsSync(report.reportPaths.human), 'human report exists');
  const md = readFileSync(report.reportPaths.human, 'utf8');
  assert.match(md, /postrace:roll run report/);
  assert.match(md, /Manual follow-ups/);
  assert.match(md, /never did/i);
  const parsed = JSON.parse(readFileSync(report.reportPaths.json, 'utf8'));
  assert.equal(parsed.mode, 'dry-run');
});

// --- Preflight rejects a non-sqlite file ------------------------------------
check('preflight rejects a BRYCECAST_SQLITE_PATH that is not a SQLite db', () => {
  const bogus = join(workdir, 'not-a-db.txt');
  writeFileSync(bogus, 'this is not sqlite');
  const pre = runPreflight({ env: { ...process.env, BRYCECAST_SQLITE_PATH: bogus }, cwd: repoRoot, now: Date.now() });
  assert.equal(pre.ok, false);
  const magic = pre.checks.find((c) => c.name === 'sqlite-magic');
  assert.equal(magic.ok, false);
});

rmSync(workdir, { recursive: true, force: true });
console.log(`\npostrace:roll: ${passed} checks passed`);
