/**
 * Refresh official results, timing archives, history and the UI in dependency order.
 * Stops on failed validation. SQLite is optional: official championship standings
 * are the primary source; an explicitly supplied archive is checked read-only.
 * The event-roll override is scoped to the final package step. Deployment is a
 * separate build-before-publish command. Dry-run validates without running steps.
 */

import { existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

/** The pipeline, in execution order. `env` is merged over the inherited env for
 *  that step only — that is how ALLOW_EVENT_ROLL stays scoped to the package. */
export const PIPELINE_STEPS = [
  { id: 'career-import', npmScript: 'career:import:indy-nxt:refresh', label: 'Refresh INDY NXT canonical import' },
  { id: 'backfill-report-details', npmScript: 'career:backfill:indy-nxt-report-details:refresh', label: 'Backfill report details' },
  { id: 'backfill-session-windows', npmScript: 'career:backfill:indy-nxt-session-windows:refresh', label: 'Backfill session windows' },
  { id: 'backfill-weather', npmScript: 'career:backfill:indy-nxt-weather:refresh', label: 'Backfill race-window weather' },
  { id: 'career-validate', npmScript: 'career:validate', label: 'Validate career data' },
  { id: 'career-summary', npmScript: 'career:summary', label: 'Summarize career ingestion' },
  { id: 'career-coverage', npmScript: 'career:coverage', label: 'Audit career coverage' },
  { id: 'lake-sync', npmScript: 'postrace:lake-sync', label: 'Acquire and validate timing archives and replay feeds' },
  { id: 'timing-coverage', npmScript: 'analytics:timing-coverage', label: 'Rebuild observed timing coverage' },
  { id: 'timing-coverage-validate', npmScript: 'analytics:timing-coverage:validate', label: 'Validate timing source coverage' },
  { id: 'ingest-history', npmScript: 'ingest:history', label: 'Refresh official championship standings and career history' },
  {
    id: 'ui-data-package',
    npmScript: 'analytics:ui-data-package:refresh-validate',
    label: 'Rebuild + validate the UI data package (rolls the upcoming event)',
    env: { BRYCECAST_ALLOW_EVENT_ROLL: '1' }
  }
];

/** Manual follow-ups the script deliberately does NOT perform. Surfaced in every
 *  run report so the operator knows what still needs a human. */
export const MANUAL_FOLLOWUPS = [
  {
    id: 'source-coverage',
    title: 'Review source gaps and newly posted reports',
    detail: 'Review the timing coverage ledger and qualifying source limitations. Re-run the same refresh command when delayed archives or reports are published.'
  },
  {
    id: 'deploy',
    title: 'Publish the verified release',
    detail: 'Commit, merge into `main` and push. An operator then runs the release driver from the private companion repo; the updater builds before publishing and rolls back on a failed health check.'
  }
];

const SQLITE_MAGIC = 'SQLite format 3\0';

const readJsonIfExists = (path) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const todayIso = (now) => new Date(now).toISOString().slice(0, 10);

/** Read the first 16 bytes and confirm the SQLite file-header magic — a lock-free,
 *  read-only proof that the path is a SQLite database without opening it. */
const looksLikeSqlite = (path) => {
  let fd = null;
  try {
    fd = openSync(path, 'r');
    const buf = Buffer.alloc(16);
    const bytes = readSync(fd, buf, 0, 16, 0);
    return bytes === 16 && buf.toString('latin1') === SQLITE_MAGIC;
  } catch {
    return false;
  } finally {
    if (fd !== null) closeSync(fd);
  }
};

/** Best-effort read-only table check. Tolerates open failures (this Mac's live
 *  archive needs immutable-URI reads; sqlite3 -readonly fails on it) — the header
 *  check above is the definitive gate, this only enriches the report. */
const inspectArchive = (path) => {
  const attempts = [
    () => new DatabaseSync(path, { readOnly: true }),
    () => new DatabaseSync(`file:${resolve(path)}?immutable=1`, { readOnly: true })
  ];
  for (const open of attempts) {
    let db = null;
    try {
      db = open();
      const hasTable = Boolean(
        db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'race_snapshots'`).get()
      );
      const count = hasTable ? Number(db.prepare(`SELECT COUNT(*) AS n FROM race_snapshots`).get().n) : 0;
      return { opened: true, hasRaceSnapshots: hasTable, snapshotCount: count };
    } catch {
      // try the next open strategy
    } finally {
      if (db) try { db.close(); } catch { /* noop */ }
    }
  }
  return { opened: false, hasRaceSnapshots: null, snapshotCount: null };
};

/**
 * Preflight. Pure validation — NO network, NO mutation, runs no pipeline steps.
 * Returns { ok, checks: [{name, ok, level, detail}], resolved: {...} }.
 */
export const runPreflight = ({ env = process.env, cwd = process.cwd(), now = Date.now() } = {}) => {
  const checks = [];
  const add = (name, ok, detail, level = 'error') => checks.push({ name, ok, level, detail });

  // 1. cwd is a BryceCast repo root with the scripts this pipeline calls.
  const pkgPath = join(cwd, 'package.json');
  const pkg = readJsonIfExists(pkgPath);
  const scripts = pkg?.scripts ?? {};
  const missingScripts = PIPELINE_STEPS.filter((s) => !scripts[s.npmScript]).map((s) => s.npmScript);
  add(
    'repo-root',
    Boolean(pkg) && missingScripts.length === 0,
    pkg ? (missingScripts.length ? `missing npm scripts: ${missingScripts.join(', ')}` : `package.json OK (${PIPELINE_STEPS.length} pipeline scripts present)`) : `no package.json at ${cwd}`
  );

  // 2. An explicit SQLite override is optional and must be valid when supplied.
  const sqliteRaw = (env.BRYCECAST_SQLITE_PATH ?? '').trim();
  add('sqlite-path', true, sqliteRaw || 'No archive override: official championship standings are used.', 'info');

  // 3-4. The path exists, is a file, is a SQLite database (header magic).
  let resolvedSqlite = null;
  let archiveInfo = null;
  if (sqliteRaw.length > 0) {
    resolvedSqlite = resolve(cwd, sqliteRaw);
    const exists = existsSync(resolvedSqlite);
    const isFile = exists && statSync(resolvedSqlite).isFile();
    add('sqlite-exists', isFile, isFile ? `file present: ${resolvedSqlite}` : `not a readable file: ${resolvedSqlite}`);
    if (isFile) {
      const isSqlite = looksLikeSqlite(resolvedSqlite);
      add('sqlite-magic', isSqlite, isSqlite ? 'valid SQLite header' : 'file is not a SQLite database (bad header)');
      if (isSqlite) {
        archiveInfo = inspectArchive(resolvedSqlite);
        if (archiveInfo.opened) {
          add(
            'sqlite-has-snapshots',
            archiveInfo.hasRaceSnapshots === true,
            archiveInfo.hasRaceSnapshots ? `race_snapshots present (${archiveInfo.snapshotCount} rows)` : 'race_snapshots table missing — not a capture archive'
          );
          if (archiveInfo.hasRaceSnapshots && archiveInfo.snapshotCount === 0) {
            add('sqlite-nonempty', true, 'race_snapshots is empty — no archive standings fallback is available', 'warn');
          }
        } else {
          add('sqlite-inspect', true, 'could not open read-only for a table check (immutable-only archive?) — header magic accepted', 'warn');
        }
      }
    }
  }

  // 5. npm is available (the runner shells out to `npm run`).
  const npmProbe = spawnSync('npm', ['--version'], { encoding: 'utf8', timeout: 20000 });
  add('npm-available', npmProbe.status === 0, npmProbe.status === 0 ? `npm ${String(npmProbe.stdout).trim()}` : 'npm not found on PATH');

  // 6. Roll intent: what the committed package would roll to.
  const committed = readJsonIfExists(join(cwd, 'analysis/ui-data-package/ui-data-package.json'));
  const committedAsOf = typeof committed?.asOfDate === 'string' ? committed.asOfDate : null;
  const upcoming = (committed?.screens?.upcomingPrep?.events ?? [])
    .map((e) => ({ eventId: e.eventId ?? null, trackName: e.trackName ?? null, eventStartDate: typeof e.eventStartDate === 'string' ? e.eventStartDate : null }))
    .filter((e) => e.eventStartDate)
    .sort((a, b) => a.eventStartDate.localeCompare(b.eventStartDate));
  const today = todayIso(now);
  const willDrop = upcoming.filter((e) => e.eventStartDate < today);
  add(
    'roll-intent',
    true,
    committed
      ? `committed asOfDate ${committedAsOf ?? '(none)'}; next up ${upcoming[0] ? `${upcoming[0].trackName ?? upcoming[0].eventId} (${upcoming[0].eventStartDate})` : '(none)'}; ${willDrop.length} event(s) roll out at ${today}`
      : 'no committed package to compare against (guard will treat this as a fresh build)',
    'info'
  );

  const blocking = checks.filter((c) => c.level === 'error' && !c.ok);
  return {
    ok: blocking.length === 0,
    checks,
    resolved: {
      cwd,
      today,
      sqlitePath: resolvedSqlite,
      archive: archiveInfo,
      committedAsOfDate: committedAsOf,
      upcoming,
      willDropFromUpcoming: willDrop
    }
  };
};

/** Default step runner: `npm run <script>` with the step's env merged over the
 *  inherited env. Inherits stdio so pipeline progress streams to the console. */
export const defaultRunStep = ({ step, env, cwd }) => {
  const result = spawnSync('npm', ['run', step.npmScript], {
    cwd,
    env: { ...env, ...(step.env ?? {}) },
    stdio: 'inherit'
  });
  const exitCode = result.status === null ? (result.signal ? 1 : 1) : result.status;
  return { ok: exitCode === 0, exitCode, signal: result.signal ?? null, error: result.error ? String(result.error.message ?? result.error) : null };
};

/** Snapshot the package's roll-relevant fields for the run report's before/after. */
const packageSnapshot = (cwd) => {
  const pkg = readJsonIfExists(join(cwd, 'analysis/ui-data-package/ui-data-package.json'));
  if (!pkg) return null;
  return {
    asOfDate: typeof pkg.asOfDate === 'string' ? pkg.asOfDate : null,
    upcoming: (pkg.screens?.upcomingPrep?.events ?? [])
      .map((e) => ({ eventId: e.eventId ?? null, trackName: e.trackName ?? null, eventStartDate: e.eventStartDate ?? null }))
      .filter((e) => e.eventStartDate)
      .sort((a, b) => String(a.eventStartDate).localeCompare(String(b.eventStartDate)))
  };
};

const diffUpcoming = (before, after) => {
  if (!before || !after) return null;
  const key = (e) => `${e.eventId ?? ''}:${e.eventStartDate ?? ''}`;
  const beforeKeys = new Set(before.upcoming.map(key));
  const afterKeys = new Set(after.upcoming.map(key));
  return {
    asOfDate: { before: before.asOfDate, after: after.asOfDate, changed: before.asOfDate !== after.asOfDate },
    droppedFromUpcoming: before.upcoming.filter((e) => !afterKeys.has(key(e))),
    addedToUpcoming: after.upcoming.filter((e) => !beforeKeys.has(key(e)))
  };
};

/**
 * Run the roll-forward. `dryRun` validates preflight only.
 * Returns { ok, exitCode, report }. Always writes a JSON + human report to
 * <cwd>/analysis/postrace-roll-reports/ unless `writeReport` is false.
 */
export const runPostraceRoll = ({
  dryRun = false,
  env = process.env,
  cwd = process.cwd(),
  now = Date.now,
  runStep = defaultRunStep,
  onLog = (line) => process.stdout.write(`${line}\n`),
  writeReport = true,
  reportDir = null
} = {}) => {
  const startedAt = new Date(now()).toISOString();
  const preflight = runPreflight({ env, cwd, now: now() });

  const report = {
    tool: 'postrace:roll',
    mode: dryRun ? 'dry-run' : 'roll',
    startedAt,
    finishedAt: null,
    ok: false,
    exitCode: 1,
    preflight,
    steps: PIPELINE_STEPS.map((s) => ({ id: s.id, npmScript: s.npmScript, label: s.label, status: 'pending', exitCode: null, startedAt: null, finishedAt: null, durationMs: null, rollScoped: Boolean(s.env) })),
    package: { before: null, after: null, diff: null },
    manualFollowups: MANUAL_FOLLOWUPS,
    neverDid: ['deploy', 'LaunchAgent changes', 'iCloud writes', 'live-runner interaction']
  };

  onLog(`postrace:roll — ${report.mode} — ${startedAt}`);
  for (const check of preflight.checks) {
    const tag = check.ok ? 'ok' : check.level === 'warn' || check.level === 'info' ? check.level : 'FAIL';
    onLog(`  [${tag}] ${check.name}: ${check.detail}`);
  }

  if (!preflight.ok) {
    onLog('Preflight FAILED — halting before any pipeline step ran.');
    report.finishedAt = new Date(now()).toISOString();
    report.exitCode = 1;
    report.ok = false;
    if (writeReport) report.reportPaths = persistReport(report, cwd, reportDir);
    return { ok: false, exitCode: 1, report };
  }

  if (dryRun) {
    onLog('Preflight OK. --dry-run: no pipeline steps executed.');
    report.finishedAt = new Date(now()).toISOString();
    report.exitCode = 0;
    report.ok = true;
    for (const s of report.steps) s.status = 'skipped-dry-run';
    if (writeReport) report.reportPaths = persistReport(report, cwd, reportDir);
    return { ok: true, exitCode: 0, report };
  }

  report.package.before = packageSnapshot(cwd);

  let failedAt = null;
  for (let i = 0; i < PIPELINE_STEPS.length; i += 1) {
    const step = PIPELINE_STEPS[i];
    const entry = report.steps[i];
    entry.status = 'running';
    entry.startedAt = new Date(now()).toISOString();
    onLog(`\n▶ ${step.id} — npm run ${step.npmScript}${step.env ? ` (env: ${Object.keys(step.env).join(', ')})` : ''}`);
    const result = runStep({ step, env, cwd });
    entry.finishedAt = new Date(now()).toISOString();
    entry.durationMs = Date.parse(entry.finishedAt) - Date.parse(entry.startedAt);
    entry.exitCode = result.exitCode;
    if (!result.ok) {
      entry.status = 'failed';
      entry.error = result.error ?? null;
      failedAt = { index: i, step, result };
      onLog(`✗ ${step.id} exited ${result.exitCode}${result.signal ? ` (signal ${result.signal})` : ''} — HARD STOP.`);
      // Mark the rest skipped.
      for (let j = i + 1; j < report.steps.length; j += 1) report.steps[j].status = 'skipped-after-failure';
      break;
    }
    entry.status = 'ok';
    onLog(`✓ ${step.id} (${entry.durationMs} ms)`);
  }

  if (!failedAt) {
    report.package.after = packageSnapshot(cwd);
    report.package.diff = diffUpcoming(report.package.before, report.package.after);
  }

  report.finishedAt = new Date(now()).toISOString();
  report.ok = !failedAt;
  report.exitCode = failedAt ? (failedAt.result.exitCode || 1) : 0;
  if (failedAt) report.failedStep = { id: failedAt.step.id, npmScript: failedAt.step.npmScript, exitCode: failedAt.result.exitCode };

  onLog(`\npostrace:roll ${report.ok ? 'COMPLETE' : `FAILED at ${failedAt.step.id}`}.`);
  if (report.ok) {
    onLog('Release follow-ups:');
    for (const m of MANUAL_FOLLOWUPS) onLog(`  • ${m.title}: ${m.detail}`);
  }
  if (writeReport) report.reportPaths = persistReport(report, cwd, reportDir);
  return { ok: report.ok, exitCode: report.exitCode, report };
};

const persistReport = (report, cwd, reportDir) => {
  const dir = reportDir ?? join(cwd, 'analysis/postrace-roll-reports');
  mkdirSync(dir, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const base = `postrace-roll-${report.mode}-${stamp}`;
  const jsonPath = join(dir, `${base}.json`);
  const mdPath = join(dir, `${base}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(mdPath, renderHumanReport(report));
  return { json: jsonPath, human: mdPath };
};

export const renderHumanReport = (report) => {
  const lines = [];
  lines.push(`# postrace:roll run report`);
  lines.push('');
  lines.push(`- Mode: **${report.mode}**`);
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt ?? '(n/a)'}`);
  lines.push(`- Result: **${report.ok ? 'OK' : 'FAILED'}** (exit ${report.exitCode})`);
  if (report.failedStep) lines.push(`- Failed step: \`${report.failedStep.npmScript}\` (exit ${report.failedStep.exitCode})`);
  lines.push('');
  lines.push(`## Preflight`);
  for (const c of report.preflight.checks) {
    const tag = c.ok ? 'ok' : c.level === 'warn' ? 'warn' : c.level === 'info' ? 'info' : 'FAIL';
    lines.push(`- [${tag}] **${c.name}** — ${c.detail}`);
  }
  const r = report.preflight.resolved;
  lines.push('');
  lines.push(`## Roll intent`);
  lines.push(`- Today: ${r.today}`);
  lines.push(`- Optional SQLite archive: ${r.sqlitePath ?? '(unset)'}${r.archive?.snapshotCount != null ? ` — ${r.archive.snapshotCount} snapshots` : ''}`);
  lines.push(`- Committed asOfDate: ${r.committedAsOfDate ?? '(none)'}`);
  lines.push(`- Upcoming (committed): ${r.upcoming.length ? r.upcoming.map((e) => `${e.trackName ?? e.eventId} (${e.eventStartDate})`).join(', ') : '(none)'}`);
  if (r.willDropFromUpcoming.length) lines.push(`- Would roll out of upcoming: ${r.willDropFromUpcoming.map((e) => `${e.trackName ?? e.eventId} (${e.eventStartDate})`).join(', ')}`);
  lines.push('');
  lines.push(`## Pipeline steps`);
  for (const s of report.steps) {
    const scoped = s.rollScoped ? ' [ALLOW_EVENT_ROLL=1 scoped here]' : '';
    lines.push(`- **${s.status}** — \`${s.npmScript}\`${s.exitCode != null ? ` (exit ${s.exitCode}${s.durationMs != null ? `, ${s.durationMs} ms` : ''})` : ''}${scoped}`);
  }
  if (report.package?.diff) {
    lines.push('');
    lines.push(`## What rolled`);
    const d = report.package.diff;
    lines.push(`- asOfDate: ${d.asOfDate.before ?? '(none)'} → ${d.asOfDate.after ?? '(none)'}${d.asOfDate.changed ? ' (changed)' : ' (unchanged)'}`);
    if (d.droppedFromUpcoming.length) lines.push(`- Dropped from upcoming: ${d.droppedFromUpcoming.map((e) => `${e.trackName ?? e.eventId} (${e.eventStartDate})`).join(', ')}`);
    if (d.addedToUpcoming.length) lines.push(`- Added to upcoming: ${d.addedToUpcoming.map((e) => `${e.trackName ?? e.eventId} (${e.eventStartDate})`).join(', ')}`);
  }
  lines.push('');
  lines.push(`## Manual follow-ups (NOT done by this script)`);
  for (const m of report.manualFollowups) lines.push(`- **${m.title}** — ${m.detail}`);
  lines.push('');
  lines.push(`## This script never did`);
  lines.push(report.neverDid.map((x) => `- ${x}`).join('\n'));
  lines.push('');
  lines.push(`> Absent-yet data (e.g. unpublished section-timing PDFs) surfaces post-publication; re-run the relevant lane when it lands. Deploy remains a separate, gated manual step.`);
  lines.push('');
  return lines.join('\n');
};
