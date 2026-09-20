#!/usr/bin/env node
/**
 * postrace-auto — the unattended post-race pipeline.
 *
 * Run hourly by launchd (`ops/macos/com.brycecast.postrace-auto.plist`). It
 * exits 0 within milliseconds unless a Bryce session has ended and the machine
 * is safe to work on. See scripts/lib/postrace-auto-core.mjs for the design
 * rationale and the state machine; this file is the I/O shell around it.
 *
 *   npm run postrace:auto -- --dry-run          # decide and print, touch nothing
 *   npm run postrace:auto                       # gate, roll, validate, build
 *   npm run postrace:auto -- --publish=deploy-mini
 *
 * Safety properties this file is responsible for:
 *   - the gate reads only local files; no upstream call happens before it passes;
 *   - a heartbeat lock (`data/live/postrace-pipeline.lock`) is shared with
 *     `postrace:roll`, so the two can never overlap;
 *   - nothing is committed unless every dirty path is on the generated-data
 *     allowlist;
 *   - nothing is published unless the package's CONTENT changed;
 *   - every decision, success and failure lands in
 *     `data/live/postrace-auto-status.json` and the JSONL log.
 */

import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

import {
  GATE_STEPS,
  PUBLISH_MODES,
  SCHEDULE_LOOKBACK_MS,
  buildStatus,
  canonicalSessionId,
  classifyWorkingTree,
  diffPackageContent,
  dueSessions,
  emptyState,
  endedSessionsFromRunnerEvents,
  evaluateGate,
  mergeDiscoveredSessions,
  planPublish,
  recordAttempt,
  reconcileState,
  seasonCurationFlag,
  trackAssetSlug,
  venueCurationFlag
} from './lib/postrace-auto-core.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const hit = argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
};

const dryRun = flag('dry-run');
const force = flag('force');
const asJson = flag('json');
const publishMode = option('publish', 'none');
if (!PUBLISH_MODES.includes(publishMode)) {
  console.error(`--publish must be one of: ${PUBLISH_MODES.join(', ')}`);
  process.exit(2);
}

// The repo root is a parameter, never a constant: this has to move to the mini
// unchanged.
const repoRoot = resolve(option('repo-root', process.env.BRYCECAST_REPO_ROOT ?? dirname(__dirname)));

const paths = (() => {
  const liveDir = join(repoRoot, 'data/live');
  return {
    repoRoot,
    liveDir,
    statePath: resolve(option('state-path', process.env.BRYCECAST_POSTRACE_AUTO_STATE ?? join(liveDir, 'postrace-auto-state.json'))),
    statusPath: join(liveDir, 'postrace-auto-status.json'),
    logPath: join(liveDir, 'postrace-auto-events.jsonl'),
    lockPath: join(liveDir, 'postrace-pipeline.lock'),
    // The runner may live in a different checkout (it does on this MacBook:
    // the operational home is ~/Documents/Bryce POV access). Same env var the
    // API server already uses for exactly this reason.
    runnerStatusPath: resolve(
      option('runner-status-path', process.env.BRYCECAST_RUNNER_STATUS_PATH ?? join(liveDir, 'live-runner-status.json'))
    ),
    runnerEventsPath: resolve(
      option('runner-events-path', process.env.BRYCECAST_RUNNER_EVENTS_PATH ?? join(liveDir, 'live-runner-events.jsonl'))
    ),
    deployLockPath: resolve(process.env.BRYCECAST_MINI_KIT_DIR ?? join(homedir(), '.brycecast/deploy'), '.deploy-lock'),
    packagePath: join(repoRoot, 'analysis/ui-data-package/ui-data-package.json'),
    calendarPath: join(repoRoot, 'public/data/indy-nxt-calendar.json'),
    seasonDropDownPath: join(repoRoot, 'data/career/raw/indy-nxt/season-drop-down.json'),
    rawIndyNxtDir: join(repoRoot, 'data/career/raw/indy-nxt'),
    reportDetailsDir: join(repoRoot, 'data/career/raw/indy-nxt/report-details'),
    replayFeedsDir: join(repoRoot, 'analysis/replay-feeds/output/feeds'),
    tracksDir: join(repoRoot, 'src/assets/tracks'),
    trackSectionsDir: join(repoRoot, 'src/assets/tracks/sections')
  };
})();

const lookbackMs = Number(option('lookback-days', '')) > 0 ? Number(option('lookback-days')) * 86_400_000 : SCHEDULE_LOOKBACK_MS;

// ---------------------------------------------------------------------------
// Tiny I/O helpers
// ---------------------------------------------------------------------------

const readJson = (path, fallback = null) => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return fallback;
  }
};

/** Read the tail of a JSONL file. Bounded on purpose: the runner's event log
 *  grows across a season and the gate must stay cheap. A partially read first
 *  line simply fails to parse and is dropped. */
const readJsonl = (path, { maxBytes = 2 * 1024 * 1024 } = {}) => {
  try {
    const info = statSync(path);
    const fd = openSync(path, 'r');
    try {
      const length = Math.min(info.size, maxBytes);
      const buf = Buffer.alloc(length);
      readSync(fd, buf, 0, length, Math.max(0, info.size - length));
      return buf
        .toString('utf8')
        .split('\n')
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } finally {
      closeSync(fd);
    }
  } catch {
    return [];
  }
};

const writeAtomicJson = (path, payload) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tmp, path);
};

const logEvent = (event) => {
  if (dryRun) return;
  try {
    mkdirSync(dirname(paths.logPath), { recursive: true });
    appendFileSync(paths.logPath, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
  } catch {
    /* the log is observability, never a reason to fail a run */
  }
};

const say = (line) => {
  if (!asJson) process.stdout.write(`${line}\n`);
};

/** A file that begins with the PDF magic. A truncated or mangled download (the
 *  2024 Indianapolis R2 section PDF is one) must not read as "sections landed". */
const looksLikePdf = (path) => {
  try {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(5);
      return readSync(fd, buf, 0, 5, 0) === 5 && buf.toString('latin1') === '%PDF-';
    } finally {
      closeSync(fd);
    }
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------
// Local discovery
// ---------------------------------------------------------------------------

/**
 * The schedule backstop, from two small committed files rather than the 360 MB
 * canonical dataset — the gate has to stay cheap enough to run hourly forever.
 *   - public/data/indy-nxt-calendar.json: event dates, track, official event id
 *   - data/career/raw/indy-nxt/season-drop-down.json: the sessions per event
 */
const scheduleBacklog = (now) => {
  const calendar = readJson(paths.calendarPath, { events: [] });
  const dropDown = readJson(paths.seasonDropDownPath, []);
  const sessionsByOfficialEventId = new Map();
  for (const yearRow of Array.isArray(dropDown) ? dropDown : []) {
    for (const event of yearRow?.Events ?? []) {
      sessionsByOfficialEventId.set(String(event.EventID), {
        year: Number(yearRow.Year),
        sessions: (event.Sessions ?? []).map((session) => ({
          eventsSessionId: String(session.EventsSessionID),
          sessionName: String(session.SessionName ?? '')
        }))
      });
    }
  }

  const out = [];
  for (const event of calendar?.events ?? []) {
    const endDate = event.eventEndDate ?? event.eventStartDate;
    if (!endDate) continue;
    const endedMs = Date.parse(`${endDate}T23:59:59Z`);
    if (!Number.isFinite(endedMs) || endedMs > now || now - endedMs > lookbackMs) continue;
    const officialEventId = String(event.id ?? '').split('_').at(-1);
    const discovered = sessionsByOfficialEventId.get(officialEventId);
    if (!discovered) continue;
    for (const session of discovered.sessions) {
      out.push({
        sessionId: canonicalSessionId(discovered.year, session.eventsSessionId),
        eventId: event.id,
        eventSessionId: session.eventsSessionId,
        eventName: event.eventName ?? null,
        sessionName: session.sessionName,
        sessionType: sessionTypeFromName(session.sessionName),
        seasonYear: discovered.year,
        trackId: event.track?.id ?? null,
        trackName: event.track?.name ?? null,
        endedAt: new Date(endedMs).toISOString(),
        discoveredVia: 'schedule-backlog'
      });
    }
  }
  return out;
};

const sessionTypeFromName = (name) => {
  const text = String(name ?? '').toLowerCase();
  if (text.includes('qualif')) return 'qualifying';
  if (text.includes('practice') || text.includes('warm')) return 'practice';
  if (text.includes('race')) return 'race';
  return 'race';
};

/**
 * Has each artifact landed? Every check is a cheap stat on the exact file the
 * upstream lane writes, which is also exactly what "late data" means here:
 *   results  — the official EventsSessionDetails JSON for that session
 *   laps     — the official lap-chart PDF plus its extracted text
 *   sections — the official Section Results PDF (validated, not just present)
 *   replay   — the Timing71-derived replay feed for that canonical session
 */
const probeSession = (session) => {
  const { seasonYear, eventSessionId, sessionId } = session;
  const base = `${seasonYear}-${eventSessionId}`;
  const resultsPath = join(paths.rawIndyNxtDir, `${seasonYear}-events-session-${eventSessionId}.json`);
  const sectionPdf = join(paths.reportDetailsDir, `${base}-section_results.pdf`);
  const lapChartPdf = join(paths.reportDetailsDir, `${base}-lap_chart.pdf`);
  const replayFeed = join(paths.replayFeedsDir, `${sessionId}.ndjson.gz`);
  const results = (() => {
    const payload = readJson(resultsPath, null);
    if (!payload) return false;
    const rows = payload?.SessionResults ?? payload?.Results ?? payload?.RaceResults ?? null;
    return Array.isArray(rows) ? rows.length > 0 : Boolean(payload?.SessionName);
  })();
  return {
    sessionType: session.sessionType ?? null,
    results,
    laps: existsSync(lapChartPdf) && looksLikePdf(lapChartPdf) && existsSync(join(paths.reportDetailsDir, `${base}-lap_chart.raw.txt`)),
    sections: existsSync(sectionPdf) && looksLikePdf(sectionPdf),
    replay: existsSync(replayFeed)
  };
};

/** Does this venue have the hand-curated geometry the heat maps need? */
const venueFlagFor = (session) => {
  if (!session.trackId) return null;
  const slug = trackAssetSlug(session.trackId);
  return venueCurationFlag({
    trackId: session.trackId,
    trackName: session.trackName,
    hasOutline: existsSync(join(paths.tracksDir, `${slug}.json`)),
    hasSectionAnchors: existsSync(join(paths.trackSectionsDir, `${slug}.ts`))
  });
};

// ---------------------------------------------------------------------------
// Locking — the JSON heartbeat idiom from scripts/lib/live-runner-core.mjs,
// shared with postrace:roll so an operator's manual roll and this job can never
// run at the same time.
// ---------------------------------------------------------------------------

const LOCK_STALE_MS = 6 * 60 * 60 * 1000; // a full roll can legitimately run for hours

const acquireLock = () => {
  mkdirSync(dirname(paths.lockPath), { recursive: true });
  const existing = readJson(paths.lockPath, null);
  if (existing?.pid && Number(existing.pid) !== process.pid) {
    const heartbeat = Date.parse(existing.heartbeatAt ?? existing.startedAt ?? '');
    if (Number.isFinite(heartbeat) && Date.now() - heartbeat <= (existing.staleAfterMs ?? LOCK_STALE_MS)) {
      throw new Error(`postrace pipeline lock is fresh for pid ${existing.pid} (${paths.lockPath}).`);
    }
  }
  writeAtomicJson(paths.lockPath, {
    pid: process.pid,
    owner: 'postrace-auto',
    startedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
    staleAfterMs: LOCK_STALE_MS
  });
};

const heartbeatLock = () => {
  const current = readJson(paths.lockPath, {}) ?? {};
  if (current.pid && Number(current.pid) !== process.pid) return;
  writeAtomicJson(paths.lockPath, { ...current, pid: process.pid, heartbeatAt: new Date().toISOString() });
};

const releaseLock = () => {
  const current = readJson(paths.lockPath, null);
  if (!current || Number(current.pid) !== process.pid) return;
  try {
    rmSync(paths.lockPath, { force: true });
  } catch {
    /* a leftover lock goes stale on its own after staleAfterMs */
  }
};

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const runNpm = (script, extraEnv = {}) => {
  const startedAt = Date.now();
  const result = spawnSync('npm', ['run', script], {
    cwd: repoRoot,
    env: { ...process.env, ...extraEnv },
    stdio: asJson ? ['ignore', 'pipe', 'pipe'] : 'inherit'
  });
  heartbeatLock();
  return {
    script,
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    durationMs: Date.now() - startedAt
  };
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const main = async () => {
  const now = Date.now();
  const startedAt = new Date(now).toISOString();

  // --- Cheap phase: local reads only -------------------------------------
  const runnerStatus = readJson(paths.runnerStatusPath, null);
  const runnerEvents = readJsonl(paths.runnerEventsPath);
  const priorState = readJson(paths.statePath, null);
  const state0 = priorState ?? emptyState(now);

  const discovered = mergeDiscoveredSessions(
    endedSessionsFromRunnerEvents(runnerEvents, { now, lookbackMs }),
    scheduleBacklog(now)
  );
  const probes = Object.fromEntries(discovered.map((session) => [session.sessionId, probeSession(session)]));
  let state = reconcileState(state0, discovered, probes, { now });
  for (const session of discovered) {
    const entry = state.sessions[session.sessionId];
    if (!entry) continue;
    entry.flags = [venueFlagFor(session), seasonCurationFlag(session.seasonYear)].filter(Boolean);
  }

  const due = dueSessions(state, now);
  const gate = evaluateGate({
    now,
    runnerStatus,
    runnerStatusPresent: Boolean(runnerStatus),
    deployLockHeld: existsSync(paths.deployLockPath),
    pipelineLock: readJson(paths.lockPath, null),
    due,
    allowMissingRunnerStatus: process.env.BRYCECAST_POSTRACE_AUTO_ALLOW_NO_RUNNER === '1',
    force
  });

  const decision = {
    startedAt,
    repoRoot,
    publishMode,
    dryRun,
    force,
    runnerStatusPath: paths.runnerStatusPath,
    runnerPhase: runnerStatus?.phase ?? null,
    runnerUpdatedAt: runnerStatus?.updatedAt ?? null,
    discovered: discovered.length,
    due: due.map((entry) => ({ sessionId: entry.sessionId, state: entry.state, missing: entry.missing, nextAttemptAt: entry.nextAttemptAt })),
    gate: { proceed: gate.proceed, reason: gate.reason, detail: gate.detail, checks: gate.checks }
  };

  say(`postrace-auto — ${startedAt}${dryRun ? ' (dry run)' : ''}`);
  say(`  repo: ${repoRoot}`);
  say(`  runner status: ${paths.runnerStatusPath} → ${runnerStatus?.phase ?? '(absent)'} @ ${runnerStatus?.updatedAt ?? '—'}`);
  for (const check of gate.checks) say(`  [${check.ok ? 'ok' : 'STOP'}] ${check.name}: ${check.detail}`);
  say(`  sessions discovered: ${discovered.length}; due: ${due.length}`);
  for (const entry of due) say(`    • ${entry.sessionId} ${entry.state} missing=[${(entry.missing ?? []).join(',')}] next=${entry.nextAttemptAt ?? 'now'}`);

  if (dryRun) {
    say(`  decision: ${gate.proceed ? 'WOULD RUN' : `would exit 0 — ${gate.reason}`}`);
    if (gate.proceed) {
      say(`  would run: postrace:roll → ${GATE_STEPS.map((step) => step.npmScript).join(' → ')}`);
      const plan = planPublish({ mode: publishMode, repoRoot, branch: currentBranch(), commitMessage: '(dry run)' });
      say(`  publish (${publishMode}): ${plan.commands.length ? plan.commands.map(describeCommand).join(' ; ') : 'nothing — build only'}`);
    }
    if (asJson) process.stdout.write(`${JSON.stringify({ ...decision, mode: 'dry-run' }, null, 2)}\n`);
    return 0;
  }

  state.lastRunAt = startedAt;

  if (!gate.proceed) {
    // Refusals are written down. A runner that quietly died would otherwise make
    // this job silently stop working, which is the failure this project exists
    // to avoid.
    writeAtomicJson(paths.statePath, state);
    writeAtomicJson(paths.statusPath, buildStatus({ state, run: { ...decision, outcome: 'gated', finishedAt: new Date().toISOString() }, now: Date.now() }));
    logEvent({ type: 'gated', reason: gate.reason, detail: gate.detail });
    say(`  decision: exit 0 — ${gate.reason}`);
    if (asJson) process.stdout.write(`${JSON.stringify({ ...decision, outcome: 'gated' }, null, 2)}\n`);
    return 0;
  }

  // --- Expensive phase ----------------------------------------------------
  acquireLock();
  logEvent({ type: 'run_started', due: due.map((entry) => entry.sessionId), publishMode });

  const run = { ...decision, steps: [], outcome: 'running' };
  const dueIds = due.map((entry) => entry.sessionId);
  const packageBefore = readJson(paths.packagePath, null);

  try {
    // The roll owns every upstream refresh. ALLOW_EVENT_ROLL is already scoped
    // to its package step; the as-of date is pinned explicitly so an unattended
    // run is reproducible and its roll target is recorded rather than implied by
    // whatever `today()` happened to be when launchd fired.
    const asOfDate = option('as-of', new Date(now).toISOString().slice(0, 10));
    run.asOfDate = asOfDate;
    const roll = runNpm('postrace:roll', {
      BRYCECAST_ANALYTICS_AS_OF_DATE: asOfDate,
      // We already hold the shared pipeline lock; tell the child not to fight us
      // for it.
      BRYCECAST_POSTRACE_LOCK_OWNED: '1'
    });
    run.steps.push({ id: 'postrace-roll', ...roll });
    say(`  postrace:roll ${roll.ok ? 'ok' : `FAILED (exit ${roll.exitCode})`} in ${Math.round(roll.durationMs / 1000)}s`);
    if (!roll.ok) return finish(run, state, dueIds, false, 'postrace:roll failed', { discovered });

    // Did anything actually change? This question comes BEFORE the gate set on
    // purpose. The roll's own package step already rebuilt and validated the
    // package; if its content is identical to the committed one, that content
    // has already passed every gate and there is nothing to publish. Running
    // `npm run build` anyway would make a nothing-happened hour expensive, which
    // is exactly what an hourly unattended job must not be.
    const packageAfter = readJson(paths.packagePath, null);
    const diff = diffPackageContent(packageBefore, packageAfter);
    run.contentDiff = {
      changed: diff.changed,
      beforeSignature: diff.beforeSignature,
      afterSignature: diff.afterSignature,
      changedPaths: diff.changedPaths,
      truncated: diff.truncated,
      ignoredKeys: diff.ignoredKeys
    };
    say(`  package content: ${diff.changed ? `CHANGED (${diff.changedPaths.length}${diff.truncated ? '+' : ''} paths)` : 'unchanged (timestamp/hash churn ignored)'}`);

    if (!diff.changed) {
      run.publish = { mode: publishMode, executed: false, reason: 'package content unchanged' };
      run.steps.push({ id: 'gate-set', ok: true, skipped: true, reason: 'package content unchanged' });
      say('  gate set skipped: nothing new upstream, nothing to rebuild or publish.');
      return finish(run, state, dueIds, true, 'no content change', { discovered });
    }

    // Content moved, so everything downstream of the package has to be proved
    // again before anything is published.
    for (const step of GATE_STEPS) {
      const result = runNpm(step.npmScript, { BRYCECAST_ANALYTICS_AS_OF_DATE: asOfDate });
      run.steps.push({ id: step.id, ...result });
      say(`  ${step.npmScript} ${result.ok ? 'ok' : `FAILED (exit ${result.exitCode})`} in ${Math.round(result.durationMs / 1000)}s`);
      if (!result.ok) return finish(run, state, dueIds, false, `${step.npmScript} failed`, { discovered });
    }

    // --- Publication ------------------------------------------------------
    // The allowlist protects the COMMIT, so it is only a precondition when a
    // commit is going to happen. In `none` mode the verified change is simply
    // left in the working tree — a human's half-finished edit alongside it is
    // their business, not a pipeline failure.
    const tree = classifyWorkingTree(gitPorcelain());
    run.workingTree = { allowed: tree.allowed.map((entry) => entry.path), refused: tree.refused.map((entry) => entry.path) };

    if (publishMode === 'none') {
      say('  publish: none (build only) — the verified change is in the working tree for review.');
      run.publish = { mode: publishMode, executed: false, reason: 'build-only mode' };
      return finish(run, state, dueIds, true, 'built, not published', { discovered });
    }

    if (!tree.ok) {
      say(`  publish refused: working tree is dirty outside the generated-data allowlist: ${tree.refused.map((entry) => entry.path).join(', ')}`);
      run.publish = { mode: publishMode, executed: false, reason: 'working tree dirty outside allowlist', refused: run.workingTree.refused };
      return finish(run, state, dueIds, false, 'dirty working tree outside allowlist', { discovered });
    }

    const plan = planPublish({
      mode: publishMode,
      repoRoot,
      branch: currentBranch(),
      // Stage exactly what the classification allowed, nothing wider.
      stagePaths: tree.allowed.map((entry) => entry.path),
      commitMessage: `Automated post-race data refresh (${run.asOfDate})\n\nSessions: ${dueIds.join(', ')}\nPackage content signature: ${diff.afterSignature?.slice(0, 12)}`
    });
    run.publish = { mode: publishMode, executed: false, plan: plan.commands.map(describeCommand), note: plan.note };
    await executePlan(plan, run);
    state.lastPublishAt = new Date().toISOString();
    return finish(run, state, dueIds, true, `published via ${publishMode}`, { discovered });
  } catch (error) {
    run.error = String(error?.stack ?? error?.message ?? error);
    say(`  FAILED: ${run.error}`);
    return finish(run, state, dueIds, false, 'exception', { discovered });
  } finally {
    releaseLock();
  }
};

const finish = (run, state, dueIds, ok, summary, { discovered = [] } = {}) => {
  const now = Date.now();
  run.outcome = ok ? 'ok' : 'failed';
  run.summary = summary;
  run.finishedAt = new Date(now).toISOString();
  // Re-probe first: the roll is exactly what makes late artifacts land, so a
  // session that was `partial` an hour ago may be `complete` now. Recording the
  // attempt against pre-roll knowledge would schedule a pointless retry.
  const reprobed = Object.fromEntries(discovered.map((session) => [session.sessionId, probeSession(session)]));
  const rederived = discovered.length ? reconcileState(state, discovered, reprobed, { now }) : state;
  run.sessionStatesAfter = Object.fromEntries(
    dueIds.map((sessionId) => [sessionId, { state: rederived.sessions[sessionId]?.state ?? null, missing: rederived.sessions[sessionId]?.missing ?? [] }])
  );
  const next = recordAttempt(rederived, dueIds, { now, ok, detail: summary });
  next.lastRunAt = run.startedAt;
  if (ok) next.lastSuccessAt = run.finishedAt;
  if (state.lastPublishAt) next.lastPublishAt = state.lastPublishAt;
  writeAtomicJson(paths.statePath, next);
  writeAtomicJson(paths.statusPath, buildStatus({ state: next, run, now }));
  logEvent({ type: ok ? 'run_ok' : 'run_failed', summary, sessions: dueIds, steps: run.steps?.map((step) => ({ id: step.id, ok: step.ok, ms: step.durationMs })) });
  say(`  ${ok ? 'DONE' : 'FAILED'}: ${summary}`);
  if (asJson) process.stdout.write(`${JSON.stringify(run, null, 2)}\n`);
  return ok ? 0 : 1;
};

const describeCommand = (command) => (command.internal ? `<internal:${command.internal}>` : command.argv.join(' '));

const gitPorcelain = () => {
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' });
  return String(result.stdout ?? '').split('\n');
};

const currentBranch = () => {
  const result = spawnSync('git', ['branch', '--show-current'], { cwd: repoRoot, encoding: 'utf8' });
  return String(result.stdout ?? '').trim() || 'HEAD';
};

// ---------------------------------------------------------------------------
// Publication
//
// Both real modes are unreachable unless --publish names them; neither ran
// during development. They are separated from the build path on purpose,
// because the host changes: today the MacBook ships a bundle to the mini, next
// season the mini publishes to itself.
// ---------------------------------------------------------------------------

/**
 * The mini-resident dist swap, mirroring ops/macos/update-mini.sh: move the
 * live bundle aside under a stamped name (so a rollback is a single rename) and
 * move the freshly built one in. Kept in-process because the previous-dist
 * handle has to survive into the health check.
 */
const swapDist = (run) => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dist = join(repoRoot, 'dist');
  const previous = join(repoRoot, `.dist-before-${stamp}`);
  if (!existsSync(join(dist, 'index.html'))) throw new Error('dist/index.html is missing — refusing to publish an unbuilt tree.');
  const served = resolve(process.env.BRYCECAST_SITE_DIR ?? repoRoot, 'dist');
  if (served !== dist && existsSync(served)) {
    renameSync(served, previous);
    renameSync(dist, served);
  }
  run.publish.previousDist = previous;
  return previous;
};

/**
 * Verify the running app server is serving the commit we just published, the
 * same check update-mini.sh makes. On failure the caller rolls the dist back.
 */
const healthCheck = async (run) => {
  const url = process.env.BRYCECAST_HEALTH_URL ?? 'http://127.0.0.1:5181/api/health';
  const expected = String(spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout ?? '').trim();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const response = await fetch(url);
      const payload = await response.json();
      if (payload?.ok && payload?.release?.commit === expected && payload.release.sourceDirty === false) {
        run.publish.health = { ok: true, url, commit: expected };
        return true;
      }
    } catch {
      /* the server is restarting */
    }
    spawnSync('sleep', ['1']);
  }
  run.publish.health = { ok: false, url, commit: expected };
  return false;
};

/**
 * Execute a publication plan. The only place in this file that mutates anything
 * outside the repo, and reached only when --publish asked for a real mode.
 */
const executePlan = async (plan, run) => {
  for (const command of plan.commands) {
    if (command.requiresAncestor) {
      const check = spawnSync('git', ['merge-base', '--is-ancestor', command.requiresAncestor.of, command.requiresAncestor.to], {
        cwd: repoRoot
      });
      if (check.status !== 0) {
        throw new Error(
          `Refusing to fast-forward: ${command.requiresAncestor.of} is not an ancestor of ${command.requiresAncestor.to}. Reconcile the branches by hand.`
        );
      }
    }
    if (command.internal === 'swap-dist') {
      swapDist(run);
      run.publish.steps = [...(run.publish.steps ?? []), { id: command.id, exitCode: 0 }];
      continue;
    }
    if (command.internal === 'health-check') {
      const ok = await healthCheck(run);
      run.publish.steps = [...(run.publish.steps ?? []), { id: command.id, exitCode: ok ? 0 : 1 }];
      if (!ok) {
        const previous = run.publish.previousDist;
        const served = resolve(process.env.BRYCECAST_SITE_DIR ?? repoRoot, 'dist');
        if (previous && existsSync(previous)) {
          rmSync(served, { recursive: true, force: true });
          renameSync(previous, served);
        }
        throw new Error('Health check failed after publish; the previous dist was restored.');
      }
      continue;
    }
    const [bin, ...args] = command.argv;
    const result = spawnSync(bin, args, { cwd: command.cwd ?? repoRoot, stdio: asJson ? 'pipe' : 'inherit' });
    run.publish.steps = [...(run.publish.steps ?? []), { id: command.id, exitCode: result.status ?? 1 }];
    if (result.status !== 0) throw new Error(`Publish step ${command.id} failed (exit ${result.status}).`);
  }
  run.publish.executed = true;
};

process.exitCode = await main();
