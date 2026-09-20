#!/usr/bin/env node
/**
 * Tests for the unattended post-race pipeline core.
 *
 * Everything asserted here is a decision that, if wrong, either (a) lets an
 * unattended job run during a race weekend, (b) republishes the site for no
 * reason, or (c) silently drops a race. Those are the three failure modes the
 * design exists to prevent, so they are what this file tests.
 *
 * Nothing here touches the network, spawns a process, or writes outside a temp
 * directory.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  PUBLISHABLE_PATHS,
  PUBLISH_MODES,
  RETRY_OFFSETS_MS,
  RUNNER_STATUS_MAX_AGE_MS,
  SESSION_PROXIMITY_MS,
  SESSION_STATES,
  buildStatus,
  canonicalSessionId,
  CURATED_THROUGH_SEASON,
  classifyWorkingTree,
  contentSignature,
  deriveSessionState,
  diffPackageContent,
  dueSessions,
  emptyState,
  endedSessionsFromRunnerEvents,
  endedSessionsFromSchedule,
  evaluateGate,
  expectedArtifactsFor,
  isPublishablePath,
  isSessionDue,
  mergeDiscoveredSessions,
  nextAttemptAt,
  planPublish,
  planSync,
  recordAttempt,
  reconcileState,
  seasonCurationFlag,
  stripVolatile,
  syncOptOutReason,
  trackAssetSlug,
  venueCurationFlag
} from './lib/postrace-auto-core.mjs';
import { FIRST_INDY_NXT_SEASON, discoverSeasons, seasonIdPrefixPattern } from './lib/indy-nxt-seasons.mjs';

const workdir = mkdtempSync(join(tmpdir(), 'brycecast-postrace-auto-'));
let passed = 0;
const check = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
};

const HOUR = 3_600_000;
const NOW = Date.parse('2026-09-19T12:00:00Z');
const freshIdleStatus = (overrides = {}) => ({
  phase: 'IDLE',
  updatedAt: new Date(NOW - 30_000).toISOString(),
  nextSession: null,
  ...overrides
});

console.log('postrace:auto');

// ---------------------------------------------------------------------------
console.log('\n season discovery');
// ---------------------------------------------------------------------------

const dropDownFixture = [
  { Year: '2027', Events: [] },
  { Year: '2026', Events: [{ EventID: 5541, Sessions: [{ EventsSessionID: '6758', SessionName: 'Race' }] }] },
  { Year: '2025', Events: [] },
  { Year: '2024', Events: [] },
  { Year: '2023', Events: [] },
  { Year: '2002', Events: [] }
];

check('the floor is Bryce\'s first INDY NXT season and is a floor, not a list', () => {
  assert.equal(FIRST_INDY_NXT_SEASON, 2024);
});

check('a season the feed lists is included — 2027 needs no code change', () => {
  assert.deepEqual(discoverSeasons(dropDownFixture), [2024, 2025, 2026, 2027]);
});

check('seasons before the floor stay out: the feed carries INDY NXT back to 2002', () => {
  const discovered = discoverSeasons(dropDownFixture);
  assert.ok(!discovered.includes(2023) && !discovered.includes(2002), 'pre-2024 seasons are not Bryce\'s career');
});

check('a season the feed does NOT list is a clean absence, not an error', () => {
  const withoutNextSeason = dropDownFixture.filter((row) => row.Year !== '2027');
  assert.deepEqual(discoverSeasons(withoutNextSeason), [2024, 2025, 2026]);
  // No throw, no sentinel, no gap entry: the year simply is not there.
});

check('junk and duplicate rows cannot corrupt the season list', () => {
  assert.deepEqual(discoverSeasons([{ Year: '2026' }, { Year: 2026 }, { Year: 'n/a' }, null, { Year: '' }]), [2026]);
  assert.deepEqual(discoverSeasons(null), []);
});

check('id prefix patterns follow the discovered seasons', () => {
  const pattern = seasonIdPrefixPattern([2024, 2025, 2026, 2027], 'event_indy_nxt_');
  assert.ok(pattern.test('event_indy_nxt_2027_5600'));
  assert.ok(!pattern.test('event_indy_nxt_2023_5000'));
});

// ---------------------------------------------------------------------------
console.log('\n gate');
// ---------------------------------------------------------------------------

check('runner LIVE → refuse (one ingestor owns upstream polling)', () => {
  const gate = evaluateGate({ now: NOW, runnerStatus: freshIdleStatus({ phase: 'LIVE' }), due: [{ sessionId: 'x' }] });
  assert.equal(gate.proceed, false);
  assert.equal(gate.reason, 'runner_not_idle');
});

check('runner ARMED and COOLDOWN also refuse', () => {
  for (const phase of ['ARMED', 'COOLDOWN']) {
    const gate = evaluateGate({ now: NOW, runnerStatus: freshIdleStatus({ phase }), due: [{ sessionId: 'x' }] });
    assert.equal(gate.reason, 'runner_not_idle', `${phase} must refuse`);
  }
});

check('stale runner status → refuse (it cannot prove the runner is idle)', () => {
  const stale = freshIdleStatus({ updatedAt: new Date(NOW - RUNNER_STATUS_MAX_AGE_MS - 1000).toISOString() });
  const gate = evaluateGate({ now: NOW, runnerStatus: stale, due: [{ sessionId: 'x' }] });
  assert.equal(gate.proceed, false);
  assert.equal(gate.reason, 'runner_status_stale');
});

check('a status timestamped in the future is also refused', () => {
  const future = freshIdleStatus({ updatedAt: new Date(NOW + 2 * RUNNER_STATUS_MAX_AGE_MS).toISOString() });
  assert.equal(evaluateGate({ now: NOW, runnerStatus: future, due: [{ sessionId: 'x' }] }).reason, 'runner_status_stale');
});

check('missing runner status refuses unless the host explicitly has no runner', () => {
  assert.equal(
    evaluateGate({ now: NOW, runnerStatus: null, runnerStatusPresent: false, due: [{ sessionId: 'x' }] }).reason,
    'runner_status_unavailable'
  );
  assert.equal(
    evaluateGate({ now: NOW, runnerStatus: null, runnerStatusPresent: false, allowMissingRunnerStatus: true, due: [{ sessionId: 'x' }] })
      .proceed,
    true
  );
});

check('a session starting soon refuses even with an IDLE runner', () => {
  const status = freshIdleStatus({
    nextSession: { eventName: 'Grand Prix of Somewhere', startsAt: new Date(NOW + SESSION_PROXIMITY_MS - HOUR).toISOString() }
  });
  const gate = evaluateGate({ now: NOW, runnerStatus: status, due: [{ sessionId: 'x' }] });
  assert.equal(gate.reason, 'session_imminent');
});

check('a session far in the future does not block', () => {
  const status = freshIdleStatus({ nextSession: { startsAt: new Date(NOW + 30 * 24 * HOUR).toISOString() } });
  assert.equal(evaluateGate({ now: NOW, runnerStatus: status, due: [{ sessionId: 'x' }] }).proceed, true);
});

check('nothing due → no-op', () => {
  const gate = evaluateGate({ now: NOW, runnerStatus: freshIdleStatus(), due: [] });
  assert.equal(gate.proceed, false);
  assert.equal(gate.reason, 'no_work_due');
});

check('a held deploy lock refuses', () => {
  const gate = evaluateGate({ now: NOW, runnerStatus: freshIdleStatus(), deployLockHeld: true, due: [{ sessionId: 'x' }] });
  assert.equal(gate.reason, 'deploy_lock_held');
});

check('a fresh pipeline lock from another pid refuses; a stale one does not', () => {
  const fresh = { pid: 999, heartbeatAt: new Date(NOW - 1000).toISOString(), staleAfterMs: 60_000 };
  assert.equal(evaluateGate({ now: NOW, runnerStatus: freshIdleStatus(), pipelineLock: fresh, pid: 1, due: [{ sessionId: 'x' }] }).reason, 'pipeline_lock_held');
  const stale = { pid: 999, heartbeatAt: new Date(NOW - 10 * HOUR).toISOString(), staleAfterMs: 60_000 };
  assert.equal(evaluateGate({ now: NOW, runnerStatus: freshIdleStatus(), pipelineLock: stale, pid: 1, due: [{ sessionId: 'x' }] }).proceed, true);
});

check('the gate refuses on the runner BEFORE it considers work — race day short-circuits', () => {
  const gate = evaluateGate({ now: NOW, runnerStatus: freshIdleStatus({ phase: 'LIVE' }), due: [] });
  assert.equal(gate.reason, 'runner_not_idle', 'the runner check must win over "nothing due"');
});

check('--force cannot override the runner: it only overrides "nothing due"', () => {
  assert.equal(evaluateGate({ now: NOW, runnerStatus: freshIdleStatus({ phase: 'LIVE' }), due: [], force: true }).reason, 'runner_not_idle');
  assert.equal(evaluateGate({ now: NOW, runnerStatus: freshIdleStatus(), due: [], force: true }).proceed, true);
});

// ---------------------------------------------------------------------------
console.log('\n retry schedule');
// ---------------------------------------------------------------------------

check('the ladder is +1h, +3h, +6h, +12h, then daily to 7 days', () => {
  const hours = RETRY_OFFSETS_MS.map((ms) => ms / HOUR);
  assert.deepEqual(hours, [1, 3, 6, 12, 24, 48, 72, 96, 120, 144, 168]);
});

check('retries are measured from the session end, so a missed hour does not shift the ladder', () => {
  const ended = Date.parse('2026-09-06T20:00:00Z');
  assert.equal(nextAttemptAt(ended, 0), ended + 1 * HOUR);
  assert.equal(nextAttemptAt(ended, 3), ended + 12 * HOUR);
  assert.equal(nextAttemptAt(ended, 10), ended + 168 * HOUR);
});

check('the ladder ends: after the last rung there is no next attempt', () => {
  assert.equal(nextAttemptAt(Date.now(), RETRY_OFFSETS_MS.length), null);
});

check('a session is due only once its scheduled attempt time has arrived', () => {
  const entry = { state: SESSION_STATES.AWAITING_RESULTS, nextAttemptAt: new Date(NOW + HOUR).toISOString() };
  assert.equal(isSessionDue(entry, NOW), false);
  assert.equal(isSessionDue({ ...entry, nextAttemptAt: new Date(NOW - 1).toISOString() }, NOW), true);
});

check('abandoned sessions are never due again', () => {
  assert.equal(isSessionDue({ state: SESSION_STATES.ABANDONED, nextAttemptAt: null }, NOW), false);
});

check('a complete session is due until one successful automated run has verified it', () => {
  const complete = { state: SESSION_STATES.COMPLETE, verified: false, nextAttemptAt: new Date(NOW - 1).toISOString() };
  assert.equal(isSessionDue(complete, NOW), true, 'artifacts on disk are not proof the pipeline ran');
  assert.equal(isSessionDue({ ...complete, verified: true }, NOW), false);
});

// ---------------------------------------------------------------------------
console.log('\n state transitions');
// ---------------------------------------------------------------------------

const raceSession = {
  sessionId: canonicalSessionId(2026, '6758'),
  eventId: 'event_indy_nxt_2026_5541',
  eventSessionId: '6758',
  eventName: 'Grand Prix of Monterey Race 2',
  sessionName: 'Race',
  sessionType: 'race',
  seasonYear: 2026,
  trackId: 'track_weathertech_raceway_laguna_seca',
  endedAt: new Date(NOW - 2 * HOUR).toISOString(),
  discoveredVia: 'runner-events'
};

check('a race expects results, laps, sections and a replay; practice expects only results', () => {
  assert.deepEqual(expectedArtifactsFor('race'), ['results', 'laps', 'sections', 'replay']);
  assert.deepEqual(expectedArtifactsFor('practice'), ['results']);
  assert.deepEqual(expectedArtifactsFor('qualifying', 'Qualifying - Race 1 Group 2'), ['results', 'sections']);
});

check('a combined-qualifying rollup expects results only — it has no report family', () => {
  // The Monterey rehearsal found 6951 and 6954 stuck `partial`, waiting on a
  // section PDF that the series only publishes for the two group sessions.
  assert.deepEqual(expectedArtifactsFor('qualifying', 'Combined Qualifying - Race 2'), ['results']);
  assert.equal(deriveSessionState({ results: true }, 'qualifying', 'Combined Qualifying - Race 2').state, SESSION_STATES.COMPLETE);
  assert.equal(deriveSessionState({ results: true }, 'qualifying', 'Qualifying - Race 2 Group 1').state, SESSION_STATES.PARTIAL);
});

check('awaiting_results → partial → complete follows what has actually landed', () => {
  assert.equal(deriveSessionState({ results: false, laps: false, sections: false, replay: false }, 'race').state, SESSION_STATES.AWAITING_RESULTS);
  const partial = deriveSessionState({ results: true, laps: true, sections: false, replay: false }, 'race');
  assert.equal(partial.state, SESSION_STATES.PARTIAL);
  assert.deepEqual(partial.missing, ['sections', 'replay']);
  assert.equal(deriveSessionState({ results: true, laps: true, sections: true, replay: true }, 'race').state, SESSION_STATES.COMPLETE);
});

check('reconcile enters a new session at the state its artifacts imply', () => {
  const state = reconcileState(emptyState(NOW), [raceSession], { [raceSession.sessionId]: { results: false } }, { now: NOW });
  const entry = state.sessions[raceSession.sessionId];
  assert.equal(entry.state, SESSION_STATES.AWAITING_RESULTS);
  assert.equal(entry.attempts, 0);
  assert.equal(entry.verified, false);
  assert.equal(entry.nextAttemptAt, new Date(Date.parse(raceSession.endedAt) + HOUR).toISOString());
});

check('a verified-complete session never re-opens', () => {
  let state = reconcileState(emptyState(NOW), [raceSession], { [raceSession.sessionId]: { results: true, laps: true, sections: true, replay: true } }, { now: NOW });
  state = recordAttempt(state, [raceSession.sessionId], { now: NOW, ok: true });
  assert.equal(state.sessions[raceSession.sessionId].verified, true);
  assert.equal(state.sessions[raceSession.sessionId].nextAttemptAt, null);
  // An upstream file disappearing later must not drag a finished race back in.
  const after = reconcileState(state, [raceSession], { [raceSession.sessionId]: { results: false } }, { now: NOW + HOUR });
  assert.equal(after.sessions[raceSession.sessionId].state, SESSION_STATES.COMPLETE);
  assert.deepEqual(dueSessions(after, NOW + HOUR), []);
});

check('a failed attempt advances the ladder and keeps the session open', () => {
  let state = reconcileState(emptyState(NOW), [raceSession], { [raceSession.sessionId]: { results: false } }, { now: NOW });
  state = recordAttempt(state, [raceSession.sessionId], { now: NOW, ok: false, detail: 'roll failed' });
  const entry = state.sessions[raceSession.sessionId];
  assert.equal(entry.attempts, 1);
  assert.equal(entry.lastOutcome, 'failed');
  assert.equal(entry.state, SESSION_STATES.AWAITING_RESULTS);
  assert.equal(entry.nextAttemptAt, new Date(Date.parse(raceSession.endedAt) + 3 * HOUR).toISOString());
});

check('after the ladder is exhausted the session is abandoned and stays flagged', () => {
  let state = reconcileState(emptyState(NOW), [raceSession], { [raceSession.sessionId]: { results: true, laps: true, sections: false, replay: false } }, { now: NOW });
  for (let attempt = 0; attempt < RETRY_OFFSETS_MS.length; attempt += 1) {
    state = recordAttempt(state, [raceSession.sessionId], { now: NOW, ok: true });
  }
  const entry = state.sessions[raceSession.sessionId];
  assert.equal(entry.state, SESSION_STATES.ABANDONED);
  assert.equal(entry.nextAttemptAt, null);
  const status = buildStatus({ state, run: null, now: NOW });
  assert.equal(status.abandoned.length, 1, 'giving up must be loud in the status file');
  assert.deepEqual(status.abandoned[0].missing, ['sections', 'replay']);
});

// ---------------------------------------------------------------------------
console.log('\n session discovery from local runner artifacts');
// ---------------------------------------------------------------------------

check('a cooldown boundary in the runner event log marks a session ended', () => {
  const events = [
    { at: new Date(NOW - 3 * HOUR).toISOString(), type: 'phase_transition', from: 'IDLE', to: 'LIVE' },
    {
      at: new Date(NOW - 2 * HOUR).toISOString(),
      type: 'session_boundary',
      action: 'cooldown_started',
      session: { eventId: '5541', eventSessionId: '6758', eventName: 'Grand Prix of Monterey Race 2', sessionName: 'Race' }
    }
  ];
  const found = endedSessionsFromRunnerEvents(events, { now: NOW });
  assert.equal(found.length, 1);
  assert.equal(found[0].sessionId, 'session_indy_nxt_2026_6758');
  assert.equal(found[0].discoveredVia, 'runner-events');
});

check('runner events older than the lookback window are ignored', () => {
  const events = [
    {
      at: new Date(NOW - 60 * 24 * HOUR).toISOString(),
      type: 'session_boundary',
      action: 'cooldown_started',
      session: { eventSessionId: '6000' }
    }
  ];
  assert.deepEqual(endedSessionsFromRunnerEvents(events, { now: NOW }), []);
});

check('the schedule backstop catches a weekend the runner missed entirely', () => {
  const dataset = {
    events: [
      { id: 'event_indy_nxt_2026_5541', seriesId: 'series_indy_nxt', seasonYear: 2026, name: 'Monterey R2', eventStartDate: '2026-09-05', eventEndDate: '2026-09-06', trackId: 'track_weathertech_raceway_laguna_seca' },
      { id: 'event_indy_nxt_2027_5600', seriesId: 'series_indy_nxt', seasonYear: 2027, name: 'Future', eventStartDate: '2027-03-01', eventEndDate: '2027-03-02', trackId: 'track_x' }
    ],
    sessions: [
      { id: 'session_indy_nxt_2026_6758', eventId: 'event_indy_nxt_2026_5541', sessionType: 'race' },
      { id: 'session_indy_nxt_2027_7000', eventId: 'event_indy_nxt_2027_5600', sessionType: 'race' }
    ]
  };
  const found = endedSessionsFromSchedule(dataset, { now: NOW });
  assert.equal(found.length, 1, 'only events that have already finished');
  assert.equal(found[0].sessionId, 'session_indy_nxt_2026_6758');
});

check('the runner\'s own observation wins over the schedule inference', () => {
  const fromRunner = [{ sessionId: 'session_indy_nxt_2026_6758', endedAt: '2026-09-06T21:30:00.000Z', discoveredVia: 'runner-events' }];
  const fromSchedule = [{ sessionId: 'session_indy_nxt_2026_6758', endedAt: '2026-09-06T23:59:59.000Z', discoveredVia: 'schedule-backlog', trackId: 'track_x' }];
  const merged = mergeDiscoveredSessions(fromRunner, fromSchedule);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].discoveredVia, 'runner-events');
  assert.equal(merged[0].trackId, 'track_x', 'schedule detail is kept where the runner has none');
});

// ---------------------------------------------------------------------------
console.log('\n content diff');
// ---------------------------------------------------------------------------

const packageFixture = {
  schemaVersion: 'brycecast.uiDataPackage.v1',
  generatedAt: '2026-09-19T22:02:49.631Z',
  sourceHash: 'aaaa',
  baselineCommit: '97d9b7c',
  asOfDate: '2026-09-10',
  screens: { raceDebrief: { races: [{ raceId: 'r1', finish: 6, sourceInventory: { retrievedAt: '2026-09-10T00:00:00Z' } }] } }
};

check('a rebuild that only moves timestamps, hashes and repo heads is NOT a change', () => {
  const rebuilt = {
    ...packageFixture,
    generatedAt: '2026-09-20T09:00:00.000Z',
    sourceHash: 'bbbb',
    baselineCommit: 'deadbee',
    screens: { raceDebrief: { races: [{ raceId: 'r1', finish: 6, sourceInventory: { retrievedAt: '2026-09-20T09:00:00Z' } }] } }
  };
  const diff = diffPackageContent(packageFixture, rebuilt);
  assert.equal(diff.changed, false, 'timestamp-only churn must not trigger a publish');
  assert.deepEqual(diff.changedPaths, []);
});

check('context-pack mtimes and self-timestamping hashes are churn; byte size is not', () => {
  const withRefs = { ...packageFixture, refs: [{ id: 'career_lab', sha256: 'aaa', bytes: 10, modifiedAt: '2026-09-19T22:02:05.797Z' }] };
  // Every rebuild rewrites each pack's own generatedAt, so mtime and sha256 move
  // on a run where nothing happened. Treating those as content would republish
  // the site every hour.
  const churnOnly = { ...withRefs, refs: [{ ...withRefs.refs[0], modifiedAt: '2026-09-19T22:38:09.837Z', sha256: 'bbb' }] };
  assert.equal(diffPackageContent(withRefs, churnOnly).changed, false);
  // Size is not moved by a fixed-width timestamp, so it stays a real signal.
  const grew = { ...withRefs, refs: [{ ...withRefs.refs[0], sha256: 'bbb', bytes: 11 }] };
  assert.equal(diffPackageContent(withRefs, grew).changed, true);
});

check('a late-landing data change reaches the screens, which is what actually gates a publish', () => {
  // Modelled on the first live rehearsal: newly archived weather observations
  // filled nulls in venueDossier nine days after the race.
  const before = { ...packageFixture, screens: { venueDossier: { venues: [{ visits: [{ conditions: null }] }] } } };
  const after = { ...packageFixture, screens: { venueDossier: { venues: [{ visits: [{ conditions: { ambientTempF: 86 } }] }] } } };
  const diff = diffPackageContent(before, after);
  assert.equal(diff.changed, true);
  assert.equal(diff.changedPaths[0].path, 'screens.venueDossier.venues[0].visits[0].conditions');
});

check('a real data change IS a change, and the changed path is named', () => {
  const rebuilt = JSON.parse(JSON.stringify(packageFixture));
  rebuilt.generatedAt = '2026-09-20T09:00:00.000Z';
  rebuilt.screens.raceDebrief.races[0].finish = 4;
  const diff = diffPackageContent(packageFixture, rebuilt);
  assert.equal(diff.changed, true);
  assert.equal(diff.changedPaths.length, 1);
  assert.equal(diff.changedPaths[0].path, 'screens.raceDebrief.races[0].finish');
});

check('a newly added race is a change', () => {
  const rebuilt = JSON.parse(JSON.stringify(packageFixture));
  rebuilt.screens.raceDebrief.races.push({ raceId: 'r2', finish: 9 });
  assert.equal(diffPackageContent(packageFixture, rebuilt).changed, true);
});

check('a re-fetched standings snapshot with identical standings is not a change', () => {
  const before = { ...packageFixture, screens: { upcomingPrep: { standingsSnapshot: { capturedAt: '2026-09-19T22:37:51.656Z', leader: 'A', points: 298 } } } };
  const after = { ...packageFixture, screens: { upcomingPrep: { standingsSnapshot: { capturedAt: '2026-09-19T22:46:55.710Z', leader: 'A', points: 298 } } } };
  assert.equal(diffPackageContent(before, after).changed, false, 'when it was fetched is not what it said');
  const moved = { ...packageFixture, screens: { upcomingPrep: { standingsSnapshot: { capturedAt: '2026-09-19T22:46:55.710Z', leader: 'A', points: 302 } } } };
  assert.equal(diffPackageContent(before, moved).changed, true);
});

check('key order cannot masquerade as a change', () => {
  assert.equal(contentSignature({ a: 1, b: 2 }), contentSignature({ b: 2, a: 1 }));
});

check('a first build (no prior package) counts as a change', () => {
  assert.equal(diffPackageContent(null, packageFixture).changed, true);
});

check('stripVolatile removes volatile keys at every depth, not just the root', () => {
  const stripped = stripVolatile({ generatedAt: 'x', deep: { nested: { retrievedAt: 'y', keep: 1 } } });
  assert.deepEqual(stripped, { deep: { nested: { keep: 1 } } });
});

// ---------------------------------------------------------------------------
console.log('\n staging allowlist');
// ---------------------------------------------------------------------------

check('generated data paths are publishable', () => {
  for (const path of [
    'analysis/ui-data-package/ui-data-package.json',
    'analysis/replay-feeds/output/feeds/session_indy_nxt_2026_6758.ndjson.gz',
    'data/career/career.dataset.json',
    'data/career/raw/indy-nxt/2026-events-session-6758.json',
    'data/historical-data-lake/catalog/timing-coverage-ledger.json',
    'public/data/indy-nxt-calendar.json',
    // Both of these are written by the roll and were caught only by running it:
    // the audited Timing71 list and the generated coverage matrix.
    'analysis/historical-high-frequency-data-audit/timing71-2026-coverage.json',
    'docs/CAREER_ANALYTICS_COVERAGE_MATRIX.md'
  ]) {
    assert.equal(isPublishablePath(path), true, `${path} must be publishable`);
  }
});

check('source, config and ops paths are NOT publishable by an unattended run', () => {
  for (const path of [
    'src/app/components.tsx',
    'scripts/postrace-auto.mjs',
    'package.json',
    'ops/macos/com.brycecast.live-runner.plist',
    'analysis/ui-data-package/scripts/build.mjs',
    'analysis/historical-high-frequency-data-audit/probe-racetools.mjs',
    'docs/API_SERVICE.md'
  ]) {
    assert.equal(isPublishablePath(path), false, `${path} must never be auto-staged`);
  }
});

check('a working tree dirty outside the allowlist blocks the publish', () => {
  const tree = classifyWorkingTree([
    ' M analysis/ui-data-package/ui-data-package.json',
    ' M data/career/career.dataset.json',
    ' M src/app/components.tsx'
  ]);
  assert.equal(tree.ok, false);
  assert.deepEqual(tree.refused.map((entry) => entry.path), ['src/app/components.tsx']);
});

check('an all-generated working tree is allowed', () => {
  const tree = classifyWorkingTree([' M analysis/ui-data-package/ui-data-package.json', '?? data/career/raw/indy-nxt/2026-events-session-9999.json']);
  assert.equal(tree.ok, true);
  assert.equal(tree.allowed.length, 2);
});

check('renames are classified by their destination path', () => {
  const tree = classifyWorkingTree(['R  data/career/old.json -> src/app/new.tsx']);
  assert.equal(tree.ok, false);
});

// ---------------------------------------------------------------------------
console.log('\n new-venue guard');
// ---------------------------------------------------------------------------

check('a venue with both outline and anchors raises no flag', () => {
  assert.equal(venueCurationFlag({ trackId: 'track_road_america', hasOutline: true, hasSectionAnchors: true }), null);
});

check('a new venue without curated geometry is flagged by name, and results still publish', () => {
  const flag = venueCurationFlag({ trackId: 'track_circuit_of_the_americas', trackName: 'Circuit of the Americas', hasOutline: false, hasSectionAnchors: false });
  assert.equal(flag.type, 'needs_curation');
  assert.equal(flag.venue, 'Circuit of the Americas');
  assert.equal(flag.slug, 'circuit-of-the-americas');
  assert.equal(flag.missing.length, 2);
});

check('an outlined venue that still lacks section anchors is flagged for anchors only', () => {
  const flag = venueCurationFlag({ trackId: 'track_streets_of_toronto', trackName: 'Streets of Toronto', hasOutline: true, hasSectionAnchors: false });
  assert.deepEqual(flag.missing, ['src/assets/tracks/sections anchors']);
});

check('the flag reaches the status file with its session attached', () => {
  let state = reconcileState(emptyState(NOW), [raceSession], { [raceSession.sessionId]: { results: true, laps: true, sections: true, replay: true } }, { now: NOW });
  state.sessions[raceSession.sessionId].flags = [venueCurationFlag({ trackId: 'track_new_place', trackName: 'New Place', hasOutline: false, hasSectionAnchors: false })];
  const status = buildStatus({ state, run: null, now: NOW });
  assert.equal(status.flags.length, 1);
  assert.equal(status.flags[0].venue, 'New Place');
  assert.equal(status.flags[0].sessionId, raceSession.sessionId);
});

check('a season beyond the curated inputs is flagged, not silently half-processed', () => {
  assert.equal(seasonCurationFlag(CURATED_THROUGH_SEASON), null);
  const flag = seasonCurationFlag(CURATED_THROUGH_SEASON + 1);
  assert.equal(flag.type, 'needs_curation');
  assert.equal(flag.scope, 'season');
  assert.equal(flag.season, CURATED_THROUGH_SEASON + 1);
  assert.match(flag.detail, /weekend-schedule catalogue/);
});

check('track ids map to the asset slugs the heat maps use', () => {
  assert.equal(trackAssetSlug('track_weathertech_raceway_laguna_seca'), 'weathertech-raceway-laguna-seca');
});

// ---------------------------------------------------------------------------
console.log('\n publish modes');
// ---------------------------------------------------------------------------

check('the default mode executes nothing at all', () => {
  const plan = planPublish({ mode: 'none', repoRoot: workdir, branch: 'fable/postrace-auto', commitMessage: 'x' });
  assert.deepEqual(plan.commands, []);
});

check('deploy-mini commits only allowlisted paths, then fast-forwards, then deploys', () => {
  const plan = planPublish({ mode: 'deploy-mini', repoRoot: workdir, branch: 'fable/postrace-auto', commitMessage: 'x' });
  const ids = plan.commands.map((command) => command.id);
  assert.deepEqual(ids, ['stage', 'commit', 'fast-forward-master', 'deploy']);
  const stage = plan.commands[0];
  assert.deepEqual(stage.argv.slice(0, 3), ['git', 'add', '--']);
  assert.deepEqual(stage.argv.slice(3), PUBLISHABLE_PATHS, 'git add must name paths, never -A');
  assert.ok(plan.commands[2].requiresAncestor, 'master must be proven an ancestor before it moves');
});

check('staging names the exact dirty files, so pattern-matched output dirs are not missed', () => {
  // A prefix-only pathspec would silently skip analysis/<lane>/output/, which is
  // where most of the roll's artifacts land.
  const dirty = [
    'analysis/replay-feeds/output/feeds/session_indy_nxt_2026_6758.ndjson.gz',
    'analysis/ui-data-package/ui-data-package.json',
    'data/career/career.dataset.json'
  ];
  const plan = planPublish({ mode: 'deploy-mini', repoRoot: workdir, branch: 'b', commitMessage: 'x', stagePaths: dirty });
  assert.deepEqual(plan.commands[0].argv.slice(3), dirty);
});

check('a path that is not publishable can never reach git add, even if passed in', () => {
  const plan = planPublish({
    mode: 'deploy-mini',
    repoRoot: workdir,
    branch: 'b',
    commitMessage: 'x',
    stagePaths: ['data/career/career.dataset.json', 'src/app/components.tsx']
  });
  assert.deepEqual(plan.commands[0].argv.slice(3), ['data/career/career.dataset.json']);
});

check('a publish with nothing allowlisted to stage is refused rather than committing nothing', () => {
  assert.throws(
    () => planPublish({ mode: 'deploy-mini', repoRoot: workdir, branch: 'b', commitMessage: 'x', stagePaths: ['src/app/components.tsx'] }),
    /nothing allowlisted to stage/
  );
});

check('local mode builds, swaps dist, restarts and health-checks — no ssh, no bundle', () => {
  const plan = planPublish({ mode: 'local', repoRoot: workdir, branch: 'main', commitMessage: 'x', uid: 501 });
  assert.deepEqual(plan.commands.map((command) => command.id), ['stage', 'commit', 'build', 'swap-dist', 'restart-app-server', 'health-check']);
  const restart = plan.commands.find((command) => command.id === 'restart-app-server');
  assert.deepEqual(restart.argv, ['launchctl', 'kickstart', '-k', 'gui/501/com.brycecast.app-server']);
  assert.ok(plan.commands.every((command) => !command.argv?.includes('ssh')));
});

check('github mode fetches and proves a fast-forward BEFORE it commits anything', () => {
  const plan = planPublish({ mode: 'github', repoRoot: workdir, branch: 'main', commitMessage: 'x' });
  const ids = plan.commands.map((command) => command.id);
  assert.deepEqual(ids, ['fetch', 'assert-fast-forward', 'stage', 'commit', 'push']);
  assert.ok(ids.indexOf('assert-fast-forward') < ids.indexOf('commit'), 'a diverged branch must stop before the commit');
  assert.deepEqual(plan.commands[0].argv, ['git', 'fetch', '--quiet', 'origin', 'main']);
  assert.deepEqual(plan.commands[1].requiresAncestor, { of: 'origin/main', to: 'main' });
  const push = plan.commands.find((command) => command.id === 'push');
  assert.deepEqual(push.argv, ['git', 'push', 'origin', 'main:main']);
  assert.ok(plan.commands.every((command) => !command.argv?.includes('--force')), 'a publish never force-pushes');
});

check('github mode refuses to publish from any branch but the publish branch', () => {
  assert.throws(
    () => planPublish({ mode: 'github', repoRoot: workdir, branch: 'fable/postrace-auto', commitMessage: 'x' }),
    /publishes main only/
  );
  // …and the publish branch itself is configurable, not a constant.
  const plan = planPublish({ mode: 'github', repoRoot: workdir, branch: 'release', commitMessage: 'x', publishBranch: 'release', remote: 'github' });
  assert.deepEqual(plan.commands[0].argv, ['git', 'fetch', '--quiet', 'github', 'release']);
});

check('github mode pushes the private overlay after the public commit, never before', () => {
  const plan = planPublish({
    mode: 'github',
    repoRoot: workdir,
    branch: 'main',
    commitMessage: 'x',
    privateOverlay: './ops/private-overlay.sh',
    productionUpdateCmd: 'ssh host update'
  });
  assert.deepEqual(plan.commands.map((command) => command.id), [
    'fetch',
    'assert-fast-forward',
    'stage',
    'commit',
    'push',
    'private-overlay-commit',
    'private-overlay-push',
    'production-update'
  ]);
  assert.deepEqual(plan.commands[5].argv, ['./ops/private-overlay.sh', 'commit', '-m', 'x']);
  assert.equal(plan.commands[7].internal, 'production-update');
  assert.equal(plan.commands[7].command, 'ssh host update');
});

check('github mode without an overlay or an updater is just commit-and-push', () => {
  const plan = planPublish({ mode: 'github', repoRoot: workdir, branch: 'main', commitMessage: 'x' });
  assert.ok(!plan.commands.some((command) => command.id.startsWith('private-overlay')));
  assert.ok(!plan.commands.some((command) => command.internal === 'production-update'));
});

check('github mode stages through the same allowlist as every other mode', () => {
  const plan = planPublish({
    mode: 'github',
    repoRoot: workdir,
    branch: 'main',
    commitMessage: 'x',
    stagePaths: ['data/career/career.dataset.json', 'ops/macos/update-mini.sh', 'src/App.tsx']
  });
  assert.deepEqual(plan.commands.find((command) => command.id === 'stage').argv.slice(3), ['data/career/career.dataset.json']);
});

check('the existing modes are untouched and none is the default', () => {
  assert.deepEqual(PUBLISH_MODES, ['none', 'deploy-mini', 'local', 'github']);
  assert.equal(PUBLISH_MODES[0], 'none');
});

check('an unknown publish mode is rejected rather than silently doing nothing', () => {
  assert.throws(() => planPublish({ mode: 'yolo', repoRoot: workdir, branch: 'x', commitMessage: 'x' }), /Unknown publish mode/);
});

// ---------------------------------------------------------------------------
console.log('\n pre-roll sync');
// ---------------------------------------------------------------------------

check('on the publish branch, clean, up to date → no-op', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: false, diverged: false });
  assert.equal(sync.action, 'noop');
  assert.equal(sync.ok, true);
  assert.deepEqual(sync.steps, []);
});

check('behind origin → fast-forward, merge-ff first', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: true, diverged: false });
  assert.equal(sync.action, 'fast_forward');
  assert.equal(sync.ok, true);
  assert.deepEqual(sync.steps.map((step) => step.id), ['merge-ff']);
  assert.deepEqual(sync.steps[0].argv, ['git', 'merge', '--ff-only', 'origin/main']);
});

check('diverged → refuse, never a fast-forward', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: false, diverged: true });
  assert.equal(sync.action, 'refuse');
  assert.equal(sync.ok, false);
  assert.equal(sync.reason, 'diverged');
});

check('a dirty tree refuses before the network is ever touched', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', dirty: true });
  assert.equal(sync.action, 'refuse');
  assert.equal(sync.reason, 'dirty_tree');
  // fetchOk defaults to null (not attempted) — the refusal short-circuits before it matters.
});

check('off the publish branch refuses, naming the branch it is stuck reconciling to', () => {
  const sync = planSync({ branch: 'fix/some-feature', publishBranch: 'main' });
  assert.equal(sync.action, 'refuse');
  assert.equal(sync.reason, 'off_branch');
  assert.match(sync.detail, /fix\/some-feature/);
});

check('clean and on-branch, before fetching, is the go-ahead to fetch', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main' });
  assert.equal(sync.action, 'fetch');
  assert.equal(sync.ok, true);
});

check('an offline fetch continues the roll on stale code rather than refusing', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: false });
  assert.equal(sync.action, 'continue_stale');
  assert.equal(sync.ok, false, 'recorded as not-ok in the run, but not a refusal');
  assert.equal(sync.reason, 'fetch_failed');
});

check('a lockfile change across the fast-forward adds an npm ci step, in order after the merge', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: true, lockfileChanged: true });
  assert.deepEqual(sync.steps.map((step) => step.id), ['merge-ff', 'npm-ci']);
  assert.deepEqual(sync.steps[1].argv, ['npm', 'ci', '--no-audit', '--no-fund']);
});

check('no lockfile change means no npm ci step', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: true, lockfileChanged: false });
  assert.ok(!sync.steps.some((step) => step.id === 'npm-ci'));
});

check('an attached private overlay is pulled after the merge, tolerant of failure, on fast-forward, no-op and offline alike', () => {
  const overlay = './ops/private-overlay.sh';
  const ff = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: true, privateOverlay: overlay });
  assert.deepEqual(ff.steps.map((step) => step.id), ['merge-ff', 'overlay-pull']);
  const noop = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: false, privateOverlay: overlay });
  assert.deepEqual(noop.steps.map((step) => step.id), ['overlay-pull']);
  const offline = planSync({ branch: 'main', publishBranch: 'main', fetchOk: false, privateOverlay: overlay });
  assert.deepEqual(offline.steps.map((step) => step.id), ['overlay-pull']);
  assert.ok(offline.steps[0].offlineTolerant, 'overlay pull must not turn a stale-fetch continue into a hard failure');
});

check('no overlay script attached means no overlay-pull step', () => {
  const sync = planSync({ branch: 'main', publishBranch: 'main', fetchOk: true, ahead: false });
  assert.deepEqual(sync.steps, []);
});

check('--no-sync opts out; so does the env var; neither fires on an unrelated flag', () => {
  assert.equal(syncOptOutReason(['--no-sync'], {}), '--no-sync flag');
  assert.equal(syncOptOutReason([], { BRYCECAST_POSTRACE_NO_SYNC: '1' }), 'BRYCECAST_POSTRACE_NO_SYNC=1');
  assert.equal(syncOptOutReason(['--dry-run'], {}), null);
  assert.equal(syncOptOutReason([], { BRYCECAST_POSTRACE_NO_SYNC: '0' }), null);
});

// ---------------------------------------------------------------------------
console.log('\n status file');
// ---------------------------------------------------------------------------

check('the status file surfaces pending retries in the order they come due', () => {
  const state = emptyState(NOW);
  state.sessions = {
    late: { sessionId: 'late', state: SESSION_STATES.PARTIAL, missing: ['replay'], attempts: 2, nextAttemptAt: '2026-09-21T00:00:00.000Z' },
    soon: { sessionId: 'soon', state: SESSION_STATES.AWAITING_RESULTS, missing: ['results'], attempts: 0, nextAttemptAt: '2026-09-19T13:00:00.000Z' },
    done: { sessionId: 'done', state: SESSION_STATES.COMPLETE, verified: true, attempts: 1 }
  };
  const status = buildStatus({ state, run: { outcome: 'ok' }, now: NOW });
  assert.deepEqual(status.pendingRetries.map((entry) => entry.sessionId), ['soon', 'late']);
  assert.equal(status.sessionCounts[SESSION_STATES.COMPLETE], 1);
  assert.equal(status.lastRun.outcome, 'ok');
});

writeFileSync(join(workdir, 'noop'), '');
rmSync(workdir, { recursive: true, force: true });
console.log(`\npostrace:auto: ${passed} checks passed`);
