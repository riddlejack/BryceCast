import assert from 'node:assert/strict';
import {
  BATTLES_MIN_LAPS,
  battlesSoFarFrom,
  buildLiveRaceShellSnapshot,
  buildingLapChartFrom,
  canonicalLiveRaceSessionId,
  isPostCheckeredRef,
  liveArchiveUpgradeFor,
  liveRaceSessionRefOf,
  payloadClaimsRacePage,
  raceSurfaceFor,
  replayDeepLinkQuery,
  trailingNumericId
} from '../src/data/liveRaceShellModel.ts';

// Brief R-c — the live race page shell. These tests pin the ONE routing
// decision (shell vs debrief vs untouched detail page) and the pure synthesis
// that feeds the shell's modules. The zero-regression law: a completed race
// with no live claim must resolve 'detail' under EVERY debrief state, so the
// existing page renders on first paint exactly as today.

const payloadFor = ({
  state = 'ready',
  eventId = '5538',
  eventSessionId = '6755',
  sessionType = 'Race',
  sessionName = 'Race',
  lap = 12,
  totalLaps = 35,
  flag = 'GREEN',
  checkedAt = '2026-07-19T20:15:00.000Z',
  simulated = false,
  archiveCheckedAt = '2026-07-19T20:15:00.000Z'
} = {}) => ({
  schemaVersion: 'live-readiness.v1',
  checkedAt,
  state,
  severity: 'green',
  reason: 'test',
  raceWeekend: { eventName: 'INDY NXT by Firestone Music City Grand Prix' },
  liveTiming: {
    heartbeat: { eventId, eventSessionId, sessionType, sessionName, lap, totalLaps, currentFlag: flag, trackName: 'Nashville Superspeedway' }
  },
  bryce: {},
  points: {},
  weather: {},
  replay: simulated ? { simulation: { active: true, sessionKey: `${eventId}-${eventSessionId}`, archiveCheckedAt } } : {},
  sources: {},
  gates: []
});

/* ---------- identity ---------- */

assert.equal(trailingNumericId('session_indy_nxt_2026_6755'), '6755');
assert.equal(trailingNumericId('event_indy_nxt_2026_5547'), '5547');
assert.equal(trailingNumericId('no-numeric-tail'), null);
assert.equal(trailingNumericId(''), null);

const liveRace = payloadFor();
const ref = liveRaceSessionRefOf(liveRace);
assert.ok(ref);
assert.equal(ref.eventSessionId, '6755');
assert.equal(ref.isRace, true);
assert.equal(ref.seasonYear, 2026, 'season year comes from the record time');
assert.equal(canonicalLiveRaceSessionId(liveRace), 'session_indy_nxt_2026_6755');

// A replayed payload is dated by its ARCHIVED record time, never the wall
// clock — a 2026 race replayed in 2027 must still resolve its 2026 page.
const replayed = payloadFor({ simulated: true, checkedAt: '2027-01-05T00:00:10.000Z', archiveCheckedAt: '2026-07-19T20:15:00.000Z' });
assert.equal(canonicalLiveRaceSessionId(replayed), 'session_indy_nxt_2026_6755');

// Races only: a practice heartbeat never claims a race page or a canonical id.
const practice = payloadFor({ sessionType: 'Practice', sessionName: 'Practice 1', eventSessionId: '6898' });
assert.equal(canonicalLiveRaceSessionId(practice), null);
assert.equal(payloadClaimsRacePage(practice, 'session_indy_nxt_2026_6898'), false);

// Race Control abbreviates the LIVE sessionType to 'R' (the fixtures spell it
// out) — both forms are a race; 'P'/'Q' are not.
const abbreviated = payloadFor({ sessionType: 'R', sessionName: 'Race' });
assert.equal(liveRaceSessionRefOf(abbreviated).isRace, true);
const abbreviatedPractice = payloadFor({ sessionType: 'P', sessionName: 'Practice 1', eventSessionId: '6898' });
assert.equal(liveRaceSessionRefOf(abbreviatedPractice).isRace, false);

// Empty string is not an id (the '' RaceTools lesson).
const emptyIds = payloadFor({ eventSessionId: '  ' });
assert.equal(liveRaceSessionRefOf(emptyIds), null);
assert.equal(payloadClaimsRacePage(emptyIds, 'session_indy_nxt_2026_6755'), false);

/* ---------- the claim ---------- */

assert.equal(payloadClaimsRacePage(liveRace, 'session_indy_nxt_2026_6755'), true);
assert.equal(payloadClaimsRacePage(liveRace, 'session_indy_nxt_2026_6754'), false, 'a different race is never claimed');
assert.equal(payloadClaimsRacePage(null, 'session_indy_nxt_2026_6755'), false);
for (const state of ['pre_session', 'degraded', 'stale']) {
  assert.equal(payloadClaimsRacePage(payloadFor({ state }), 'session_indy_nxt_2026_6755'), true, `${state} holds the shell`);
}
for (const state of ['wrong_series', 'blocked']) {
  assert.equal(payloadClaimsRacePage(payloadFor({ state }), 'session_indy_nxt_2026_6755'), false, `${state} never claims the page`);
}

/* ---------- the routing decision ---------- */

const decide = (overrides) =>
  raceSurfaceFor({
    requestedSessionId: 'session_indy_nxt_2026_6755',
    debrief: 'absent',
    payload: null,
    replayCanonicalSessionId: null,
    ...overrides
  });

// 1. Zero regression: no live claim → 'detail' under EVERY debrief state.
for (const debrief of ['loading', 'present', 'absent']) {
  assert.equal(decide({ debrief }), 'detail', `completed race stays untouched (debrief=${debrief})`);
  assert.equal(
    decide({ debrief, payload: payloadFor({ eventSessionId: '6754' }) }),
    'detail',
    'a DIFFERENT live race never claims this page'
  );
}

// 2. Live claim: shell only once the debrief check has answered "absent".
assert.equal(decide({ payload: liveRace, debrief: 'absent' }), 'shell');
assert.equal(decide({ payload: liveRace, debrief: 'loading' }), 'pending');
assert.equal(decide({ payload: liveRace, debrief: 'present' }), 'detail', 'roll-forward: the debrief owns the URL');

// 3. Pre-green and stale hold the shell; the shell appears before the flag.
assert.equal(decide({ payload: payloadFor({ state: 'pre_session', lap: 0, flag: 'COLD' }) }), 'shell');
assert.equal(decide({ payload: payloadFor({ state: 'stale' }) }), 'shell');

// 4. A per-client replay of THIS race renders the shell even where a debrief
//    exists — the time machine, and the QA path.
assert.equal(decide({ debrief: 'present', replayCanonicalSessionId: 'session_indy_nxt_2026_6755' }), 'shell');
assert.equal(decide({ debrief: 'present', replayCanonicalSessionId: 'session_indy_nxt_2026_6754' }), 'detail');
assert.equal(decide({ debrief: 'present', replayCanonicalSessionId: null }), 'detail');

/* ---------- post-checkered ---------- */

assert.equal(isPostCheckeredRef(liveRaceSessionRefOf(payloadFor({ lap: 35, totalLaps: 35, flag: 'COLD' }))), true);
assert.equal(isPostCheckeredRef(liveRaceSessionRefOf(payloadFor({ lap: 35, totalLaps: 35, flag: 'GREEN' }))), false);
assert.equal(isPostCheckeredRef(liveRaceSessionRefOf(payloadFor({ lap: 34, totalLaps: 35, flag: 'YELLOW' }))), false);

/* ---------- the lap chart, building ---------- */

const rowFor = (driverId, no, rank, lastName, bryce = false) => ({
  driverId,
  no,
  liveRank: rank,
  rank,
  firstName: bryce ? 'Bryce' : 'Test',
  lastName,
  status: 'Active',
  bryce
});

const sampleFor = (lap, flag, rows, checkedAtMs) => ({
  sessionKey: '5538-6755',
  checkedAt: new Date(checkedAtMs).toISOString(),
  checkedAtMs,
  arrivalCheckedAt: new Date(checkedAtMs).toISOString(),
  lap,
  flag,
  rows,
  bryceId: '2143',
  signature: String(checkedAtMs)
});

const t0 = Date.parse('2026-07-19T20:00:00.000Z');
// Stable identities (ids keyed to the DRIVER, never the position): the rivals
// hold station while Bryce moves through them, exactly like a real field.
const fieldAt = (brycePos) => {
  const names = ['Leader', 'Second', 'Third', 'Fourth', 'Fifth'];
  const rows = [];
  let position = 1;
  names.forEach((name, index) => {
    if (position === brycePos) position += 1;
    rows.push(rowFor(String(101 + index), String(11 + index), position, name));
    position += 1;
  });
  rows.push(rowFor('2143', '9', brycePos, 'Aron', true));
  return rows;
};

const history = {
  sessionKey: '5538-6755',
  selectedDrivers: [],
  stats: { arrivals: 0, valueChanges: 0, unchangedValues: 0, duplicateTimestamps: 0, outOfOrderArrivals: 0 },
  samples: [
    sampleFor(0, 'COLD', fieldAt(6), t0), // pre-green frames never chart
    sampleFor(1, 'GREEN', fieldAt(6), t0 + 60_000),
    sampleFor(2, 'GREEN', fieldAt(6), t0 + 120_000),
    sampleFor(2, 'GREEN', fieldAt(5), t0 + 150_000), // later sample on lap 2 wins
    sampleFor(3, 'YELLOW', fieldAt(5), t0 + 210_000),
    sampleFor(4, 'YELLOW', fieldAt(5), t0 + 270_000),
    sampleFor(5, 'GREEN', fieldAt(4), t0 + 330_000)
  ]
};

const chart = buildingLapChartFrom(history);
assert.ok(chart);
assert.equal(chart.latestLap, 5, 'the chart grows to the newest charted lap — no reserved empty span');
assert.equal(chart.lapChart.totalLaps, 5);
assert.equal(chart.lapsCharted, 5);
const bryceDriver = chart.lapChart.drivers.find((driver) => driver.isBryce);
assert.ok(bryceDriver);
assert.deepEqual(
  bryceDriver.laps,
  [
    [1, 6],
    [2, 5],
    [3, 5],
    [4, 5],
    [5, 4]
  ],
  'one point per lap; the LAST sample on a lap is that lap’s running order'
);
assert.equal(bryceDriver.finishPosition, null, 'no result numerals mid-race');
assert.deepEqual(chart.cautionSpans, [{ fromLap: 3, toLap: 4, ongoing: false }]);

// An ongoing caution reaches the newest lap and says so.
const ongoingHistory = { ...history, samples: [...history.samples, sampleFor(6, 'YELLOW', fieldAt(4), t0 + 390_000)] };
const ongoingChart = buildingLapChartFrom(ongoingHistory);
assert.deepEqual(ongoingChart.cautionSpans.at(-1), { fromLap: 6, toLap: 6, ongoing: true });

// Pre-green only → nothing to chart yet (the module states its honest empty).
assert.equal(buildingLapChartFrom({ ...history, samples: [sampleFor(0, 'COLD', fieldAt(6), t0)] }), null);
assert.equal(buildingLapChartFrom(null), null);

/* ---------- battles so far ---------- */

// Below the lap threshold the module never appears.
assert.deepEqual(battlesSoFarFrom(chart), []);

const longHistory = {
  ...history,
  samples: Array.from({ length: 14 }, (_, index) => {
    const lap = index + 1;
    // Bryce P5; 'Fourth' runs P4 — adjacent every lap; they swap on laps 8/11.
    const brycePos = lap === 8 || lap === 9 || lap === 10 ? 4 : 5;
    return sampleFor(lap, 'GREEN', fieldAt(brycePos), t0 + lap * 60_000);
  })
};
const longChart = buildingLapChartFrom(longHistory);
assert.ok(longChart.lapsCharted >= BATTLES_MIN_LAPS);
const battles = battlesSoFarFrom(longChart);
assert.ok(battles.length > 0, 'battles appear once enough laps exist');
assert.ok(
  battles.every((battle) => battle.lapsAdjacent >= 3),
  'only sustained company is named'
);
const closest = battles[0];
assert.equal(closest.lapsAdjacent, 14, 'the swap partner stays within one spot every lap');
assert.equal(closest.swaps, 2, 'two changes of order between shared laps');

/* ---------- the coherent snapshot: hero lap === chart lap ---------- */

// The mixed-clock defect: the hero derived its lap from the payload heartbeat
// while the chart derived "through lap N" from the accumulated history, and the
// two update on slightly different clocks — at 72s the heartbeat read lap 28
// while the history had charted lap 29; at 136s the heartbeat led at lap 65
// while the chart trailed at lap 64. One snapshot reconciles them: the lap it
// hands the hero is always the chart's newest charted lap.
const requested = 'session_indy_nxt_2026_6755';
const historyThrough = (latestLap) => ({
  sessionKey: '5538-6755',
  selectedDrivers: [],
  stats: { arrivals: 0, valueChanges: 0, unchangedValues: 0, duplicateTimestamps: 0, outOfOrderArrivals: 0 },
  samples: Array.from({ length: latestLap }, (_, index) => sampleFor(index + 1, 'GREEN', fieldAt(5), t0 + (index + 1) * 60_000))
});

const snapAhead = buildLiveRaceShellSnapshot(payloadFor({ lap: 28 }), historyThrough(29), requested);
assert.equal(snapAhead.chart.latestLap, 29);
assert.equal(snapAhead.lap, 29, 'the hero adopts the chart lap when the history leads the heartbeat');
assert.equal(snapAhead.lap, snapAhead.chart.latestLap, 'visible hero lap === chart lap');

const snapBehind = buildLiveRaceShellSnapshot(payloadFor({ lap: 65, totalLaps: 80 }), historyThrough(64), requested);
assert.equal(snapBehind.chart.latestLap, 64);
assert.equal(snapBehind.lap, 64, 'the hero adopts the chart lap when the heartbeat leads the history');
assert.equal(snapBehind.lap, snapBehind.chart.latestLap, 'visible hero lap === chart lap');

// The invariant across a whole timeline of ±1-skewed frames.
for (let heartbeatLap = 1; heartbeatLap <= 30; heartbeatLap += 1) {
  const chartLap = Math.max(1, heartbeatLap + ((heartbeatLap % 3) - 1)); // ±1 skew
  const snap = buildLiveRaceShellSnapshot(
    payloadFor({ lap: heartbeatLap, totalLaps: 80 }),
    historyThrough(chartLap),
    requested
  );
  assert.ok(snap.chart === null || snap.lap === snap.chart.latestLap, `frame ${heartbeatLap}: hero lap must equal chart lap`);
}

// Before the chart exists (pre-green) the heartbeat lap stands in — nothing to
// contradict it.
const preGreenSnap = buildLiveRaceShellSnapshot(payloadFor({ state: 'pre_session', lap: 0, flag: 'COLD' }), null, requested);
assert.equal(preGreenSnap.chart, null);
assert.equal(preGreenSnap.lap, 0, 'before the chart exists the heartbeat lap stands in');
assert.equal(preGreenSnap.preGreen, true);

// A payload for a DIFFERENT race never paints this shell (no chart, no lap).
const otherRaceSnap = buildLiveRaceShellSnapshot(payloadFor({ eventSessionId: '6754', lap: 10 }), historyThrough(12), requested);
assert.equal(otherRaceSnap.isThisRace, false);
assert.equal(otherRaceSnap.chart, null, 'a different live race never charts this page');
assert.equal(otherRaceSnap.lap, null);

/* ---------- the archive LIVE dot ---------- */

assert.deepEqual(liveArchiveUpgradeFor('event_indy_nxt_2026_5538', liveRace), { sessionId: 'session_indy_nxt_2026_6755' });
assert.equal(liveArchiveUpgradeFor('event_indy_nxt_2026_5547', liveRace), null, 'a different round never lights up');
assert.equal(liveArchiveUpgradeFor('event_indy_nxt_2026_5538', practice), null, 'practice never upgrades a row');
assert.equal(liveArchiveUpgradeFor('event_indy_nxt_2026_5538', payloadFor({ state: 'blocked' })), null);
assert.equal(liveArchiveUpgradeFor('event_indy_nxt_2026_5538', null), null);
assert.ok(liveArchiveUpgradeFor('event_indy_nxt_2026_5538', payloadFor({ state: 'pre_session', lap: 0, flag: 'COLD' })), 'the dot appears the moment the shell exists — pre-green included');

/* ---------- replay continuity across pages ---------- */

assert.equal(
  replayDeepLinkQuery('?replay=5538-6755&rt=2026-07-19T20%3A15%3A00.000Z&speed=16'),
  '?replay=5538-6755&t0=2026-07-19T20%3A15%3A00.000Z&speed=16',
  'rt (per-poll clock) becomes t0 (navigable seed) so a cross-link resumes mid-race'
);
assert.equal(replayDeepLinkQuery(''), '');

console.log(
  JSON.stringify(
    {
      ok: true,
      assertions: 'live race shell: identity, claim, routing decision, building lap chart, battles, LIVE dot, replay continuity',
      laws: {
        zeroRegression: 'no-live-claim-always-detail',
        rollForward: 'debrief-present-owns-the-url',
        preGreen: 'shell-exists-before-the-flag',
        timeMachine: 'engaged-replay-renders-shell-over-existing-debrief',
        emptyIds: 'empty-string-never-an-identity',
        coherentLap: 'one-snapshot-hero-lap-equals-chart-lap'
      }
    },
    null,
    2
  )
);
