import assert from 'node:assert/strict';
import { isOperatorRequest, isHealthyIdleRunner, buildIdleReadinessPayload, resolveTimingObservationArtifact } from './api-server.mjs';

const direct = { headers: { host: '127.0.0.1:5181' }, socket: { remoteAddress: '127.0.0.1' } };
assert.equal(isOperatorRequest(direct, ''), true);
for (const headers of [
  { host: 'brycecast.com' },
  { ...direct.headers, 'cf-connecting-ip': '203.0.113.20' },
  { ...direct.headers, 'x-forwarded-for': '203.0.113.20' },
  { ...direct.headers, origin: 'https://brycecast.com' },
  { ...direct.headers, 'sec-fetch-site': 'same-origin' }
]) assert.equal(isOperatorRequest({ ...direct, headers }, ''), false, JSON.stringify(headers));
assert.equal(isOperatorRequest({ headers: { authorization: 'Bearer example-test-token' } }, 'example-test-token'), true);
assert.equal(isOperatorRequest({ headers: { authorization: 'Bearer wrong' } }, 'example-test-token'), false);
assert.equal(isOperatorRequest({ ...direct, socket: { remoteAddress: '192.168.1.10' } }, ''), false);

const now = Date.parse('2026-09-10T12:00:00Z');
const idle = { phase: 'IDLE', updatedAt: new Date(now - 5 * 60000).toISOString(), currentSession: { eventName: 'Unrelated INDYCAR event' } };
assert.equal(isHealthyIdleRunner(idle, now), true, 'normal five-minute idle poll is healthy');
assert.equal(isHealthyIdleRunner({ ...idle, phase: 'LIVE' }, now), false);
assert.equal(isHealthyIdleRunner({ ...idle, updatedAt: new Date(now - 12 * 60000).toISOString() }, now), false);
assert.equal(isHealthyIdleRunner(null, now), false);
const payload = buildIdleReadinessPayload({ status: idle });
assert.equal(payload.state, 'pre_session');
assert.equal(payload.liveTiming.rows.length, 0);
assert.equal(payload.raceWeekend.eventName, null, 'idle status must not promote an unrelated series');
assert.equal(payload.raceWeekend.sourceState, 'cold');
const sessionId = 'session_indy_nxt_2026_6759';
const ledger = { sessions: [{ canonicalSessionId: sessionId, status: 'observed', primarySource: { observedArtifact: 'analysis/semantic-layer/output/timing-observations/test.ndjson.gz' } }] };
assert.ok(resolveTimingObservationArtifact(sessionId, ledger)?.endsWith('/timing-observations/test.ndjson.gz'));
assert.equal(resolveTimingObservationArtifact('../data/live/brycecast.sqlite', ledger), null);
assert.equal(resolveTimingObservationArtifact('session_indy_nxt_2026_9999', ledger), null);
for (const observedArtifact of ['data/live/brycecast.sqlite', '../secrets.ndjson.gz', 'analysis/semantic-layer/output/../../../../secrets.ndjson.gz']) {
  const invalid = { sessions: [{ ...ledger.sessions[0], primarySource: { observedArtifact } }] };
  assert.equal(resolveTimingObservationArtifact(sessionId, invalid), null);
}
assert.equal(resolveTimingObservationArtifact(sessionId, { sessions: [{ ...ledger.sessions[0], status: 'unavailable' }] }), null);
console.log('PASS: proxy-safe operator authorization, idle readiness and allowlisted observation downloads');
