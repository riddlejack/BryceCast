#!/usr/bin/env node
// Lane gate for the replay feeds. Re-reads the committed manifest + feed packs and
// asserts the invariants that keep a lake replay honest and playable. Exits
// non-zero on any failure so the feeds can never ship broken.
//
//  1. Every watchable session has a feed pack on disk that decodes.
//  2. The feed's first row is at the green flag and the last row is the checker.
//  3. The checker frame's on-road order equals the manifest's validated finalOrder,
//     and (RaceTools) the winner/podium match canonical.
//  4. Bryce is present in the feed at his manifest sample count (identity guard).
//  5. Every session is source-tiered with a non-official label.
//  6. Two-source diffs (where our own capture exists) meet the agreement floor.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readSessionPack } from './lib/pack-reader.mjs';
import { BRYCE_DRIVER_ID } from './lib/reduce.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, 'output', 'replay-feeds-manifest.json');
const feedsDir = join(__dirname, 'output', 'feeds');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const failures = [];
const fail = (id, msg) => failures.push(`${id}: ${msg}`);

const VALID_TIERS = new Set(['racetools_capture', 'timing71_normalized', 'race_control_capture']);
const TWO_SOURCE_FLOOR = 0.99;
const MAX_INTERPOLATION_HOLD_SECONDS = 5;

for (const s of manifest.sessions) {
  const id = s.canonicalSessionId;
  if (!VALID_TIERS.has(s.sourceTier)) fail(id, `unexpected sourceTier ${s.sourceTier}`);
  if (!s.tierLabel || /official/i.test(s.tierLabel)) fail(id, `tier label missing or reads as official: ${s.tierLabel}`);
  if (!s.observationBasis) fail(id, 'observationBasis missing');
  if (s.noGps !== true) fail(id, 'noGps contract missing');
  if (s.sourceTier === 'race_control_capture' && s.replayInterpolated !== false) {
    fail(id, 'direct Race Control capture incorrectly labelled interpolated');
  }
  if (s.sourceTier !== 'race_control_capture' && s.replayInterpolated !== true) {
    fail(id, 'derived 1 Hz replay is not labelled interpolated');
  }
  if (s.replayInterpolated && s.interpolationCoverage?.maximumHoldSeconds !== MAX_INTERPOLATION_HOLD_SECONDS) {
    fail(id, `interpolation hold bound is not ${MAX_INTERPOLATION_HOLD_SECONDS}s`);
  }
  if (!s.watchable) continue; // excluded sessions are documented, not served

  const feedPath = join(feedsDir, `${id}.ndjson.gz`);
  if (!existsSync(feedPath)) {
    fail(id, 'watchable but feed pack missing');
    continue;
  }
  let rows;
  try {
    // Feed packs are snapshot NDJSON; reuse the gz reader then parse lines.
    const { gunzipSync } = await import('node:zlib');
    rows = gunzipSync(readFileSync(feedPath)).toString('utf8').trim().split('\n').map((l) => JSON.parse(l));
  } catch (err) {
    fail(id, `feed pack unreadable: ${err.message}`);
    continue;
  }

  if (rows.length !== s.samples) fail(id, `sample count drift: feed ${rows.length} vs manifest ${s.samples}`);
  const first = rows[0].raw.timing.timing_results.heartbeat;
  const last = rows[rows.length - 1].raw.timing.timing_results.heartbeat;
  if (last.currentFlag !== 'CHECKERED') fail(id, `last frame is ${last.currentFlag}, not CHECKERED`);
  if (!rows.some((r) => r.raw.timing.timing_results.heartbeat.currentFlag === 'GREEN')) fail(id, 'no GREEN frame');
  if (!first.EventSessionID) fail(id, 'heartbeat missing EventSessionID');
  if (!rows.every((row) => row.summary?.observationBasis && row.summary?.noGps === true)) {
    fail(id, 'feed rows missing observation/noGps provenance');
  }
  if (s.replayInterpolated && !rows.every((row) => row.summary?.interpolationBoundSeconds === MAX_INTERPOLATION_HOLD_SECONDS)) {
    fail(id, 'derived rows missing the interpolation hold bound');
  }
  for (const gap of s.interpolationCoverage?.sourceGaps ?? []) {
    const forbiddenStart = Date.parse(gap.lastObservedAt) + MAX_INTERPOLATION_HOLD_SECONDS * 1000;
    const forbiddenEnd = Date.parse(gap.nextObservedAt);
    const invented = rows.some((row) => {
      const at = Date.parse(row.checkedAt);
      return at > forbiddenStart && at < forbiddenEnd;
    });
    if (invented) fail(id, `rows continue through withheld ${gap.sourceGapSeconds}s source gap`);
  }

  const finalOrder = rows[rows.length - 1].raw.timing.timing_results.Item.map((r) => r.no);
  if (JSON.stringify(finalOrder) !== JSON.stringify(s.validation.finalOrder)) {
    fail(id, 'checker-frame order drifted from manifest finalOrder');
  }
  if (s.sourceTier === 'racetools_capture') {
    if (!s.validation.winnerMatch) fail(id, `winner ${s.validation.winner} does not match canonical`);
    if (!s.validation.podiumMatch) fail(id, 'podium does not match canonical');
  }

  const bryceSamples = rows.filter((r) => r.raw.timing.timing_results.Item.some((row) => row.DriverID === BRYCE_DRIVER_ID)).length;
  if (bryceSamples < 120) fail(id, `Bryce present in only ${bryceSamples} frames (<120)`);
  if (bryceSamples !== s.bryceSamples) fail(id, `Bryce sample drift: feed ${bryceSamples} vs manifest ${s.bryceSamples}`);

  const ts = s.validation.twoSource;
  if (ts && ts.agreementFraction !== null && ts.agreementFraction < TWO_SOURCE_FLOOR) {
    fail(id, `two-source agreement ${ts.agreementFraction} below ${TWO_SOURCE_FLOOR}`);
  }
}

const watchable = manifest.sessions.filter((s) => s.watchable).length;
if (failures.length) {
  console.error(`replay-feeds gate FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(JSON.stringify({
  ok: true,
  reduced: manifest.sessions.length,
  watchable,
  racetools: manifest.sessions.filter((s) => s.sourceTier === 'racetools_capture').length,
  timing71: manifest.sessions.filter((s) => s.sourceTier === 'timing71_normalized').length,
  raceControlCapture: manifest.sessions.filter((s) => s.sourceTier === 'race_control_capture').length,
  withheldSourceGapSeconds: manifest.sessions.reduce((sum, s) => sum + (s.interpolationCoverage?.withheldSeconds ?? 0), 0),
  twoSourceChecked: manifest.sessions.filter((s) => s.validation.twoSource).length,
  gate: 'green'
}, null, 2));
