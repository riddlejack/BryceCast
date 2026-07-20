#!/usr/bin/env node
/**
 * Validator for the Quali & Practice Lab run-by-run pack (Brief M, first slice).
 * Exits non-zero on any hard failure. Advisory findings are printed, not fatal.
 *
 * Hard gates:
 *  - pack identity + schema + source tiers
 *  - every 2026 session is crosswalk-verdict GO (the correctness gate)
 *  - every covered session carries a run, a rank, and a labelled denominator
 *  - the running best-lap staircase is monotonic non-increasing and equals the run min
 *  - RaceTools ROAD sessions: semantic feed classification position == canonical
 *    group rank (the join-correctness invariant; ovals are advisory — the oval
 *    feed carries capture-time running order, not the official aggregate)
 *  - validation axis: captured best flying lap ≈ canonical official best (road)
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const laneDir = path.resolve(__dirname, '..');
const PACK = path.join(laneDir, 'output/context-packs/quali-lab-context.json');
const CENSUS = path.join(laneDir, 'output/coverage-census.json');

/* Egregious residuals (partial-lap artifacts, wrong-session joins) are fatal;
 * a moderate gap is a genuine capture miss of his fastest lap — advisory, since
 * the UI headlines the official best and the run shows captured laps. */
const ROAD_BEST_FATAL_S = 1.5;
const ROAD_BEST_ADVISORY_S = 0.15;
const KNOWN_TIERS = new Set(['racetools_capture', 'timing71_normalized']);

const failures = [];
const advisories = [];
const fail = (m) => failures.push(m);
const warn = (m) => advisories.push(m);

const pack = JSON.parse(readFileSync(PACK, 'utf8'));
const census = JSON.parse(readFileSync(CENSUS, 'utf8'));

// identity
if (pack.id !== 'quali_lab_run_by_run') fail(`pack id ${pack.id}`);
if (pack.type !== 'quali_lab') fail(`pack type ${pack.type}`);
if (!pack.schemaVersion) fail('missing schemaVersion');
if (!Array.isArray(pack.sessions) || pack.sessions.length === 0) fail('no sessions');
if (!pack.sourceHash) fail('missing sourceHash');

let residualMax = 0;
let crossMatch = 0;
let crossMismatchRoad = 0;

for (const s of pack.sessions) {
  const tag = s.id;

  if (!KNOWN_TIERS.has(s.sourceTier)) fail(`${tag}: unknown sourceTier ${s.sourceTier}`);
  if (!s.sourceTierLabel) fail(`${tag}: missing sourceTierLabel`);
  if (!s.rankSource) fail(`${tag}: missing rankSource`);

  // run present
  if (!Array.isArray(s.laps) || s.laps.length === 0) fail(`${tag}: empty run`);

  // a rank and a labelled denominator
  const hasRank = s.onTrackGroupRank !== null || s.combinedGridPosition !== null;
  const hasDenom = s.groupFieldSize !== null || s.combinedFieldSize !== null;
  if (!hasRank) fail(`${tag}: no rank (group or grid)`);
  if (!hasDenom) fail(`${tag}: no field-size denominator`);

  // 2026 crosswalk gate
  if (s.source === 'timing71') {
    if (s.crosswalkVerdict !== 'GO') fail(`${tag}: 2026 session not crosswalk GO (${s.crosswalkVerdict})`);
  } else if (s.crosswalkVerdict !== null) {
    warn(`${tag}: non-2026 session carries a crosswalk verdict ${s.crosswalkVerdict}`);
  }

  // monotonic running best + equals run min
  let prevBest = Infinity;
  let runMin = Infinity;
  for (const lap of s.laps) {
    if (lap.runningBestSeconds > prevBest + 1e-9) fail(`${tag}: running best increased at seq ${lap.seq}`);
    prevBest = lap.runningBestSeconds;
    runMin = Math.min(runMin, lap.seconds);
  }
  if (Math.abs(runMin - s.bryceBestSeconds) > 1e-6) fail(`${tag}: bryceBestSeconds ${s.bryceBestSeconds} != run min ${runMin}`);
  if (s.laps.length && Math.abs(s.laps[s.laps.length - 1].runningBestSeconds - s.bryceBestSeconds) > 1e-6)
    fail(`${tag}: final runningBest != bryceBestSeconds`);

  // gap to session best consistency
  if (s.sessionBestSeconds !== null && s.gapToSessionBestSeconds !== null) {
    const g = Math.round((s.bryceBestSeconds - s.sessionBestSeconds) * 10000) / 10000;
    if (Math.abs(g - s.gapToSessionBestSeconds) > 1e-4) fail(`${tag}: gapToSessionBest inconsistent`);
    if (s.gapToSessionBestSeconds < -1e-6 && !s.sessionBestByBryce)
      fail(`${tag}: Bryce faster than session best but not flagged holder`);
  }

  // join-correctness invariant (RaceTools road)
  if (s.source === 'racetools' && s.positionCrossCheck !== 'na') {
    if (s.positionCrossCheck === 'match') crossMatch += 1;
    else if (!s.isOval) {
      crossMismatchRoad += 1;
      fail(`${tag}: RaceTools road feed position ${s.semanticClassificationPosition} != canonical group rank ${s.onTrackGroupRank}`);
    } else {
      warn(`${tag}: oval feed position ${s.semanticClassificationPosition} != canonical rank ${s.onTrackGroupRank} (advisory — capture-time order)`);
    }
  }

  // validation axis: captured best flying lap vs canonical official best (road)
  if (!s.isOval && s.officialBestLapSeconds !== null && s.bryceBestSeconds !== null) {
    const resid = Math.abs(s.bryceBestSeconds - s.officialBestLapSeconds);
    residualMax = Math.max(residualMax, resid);
    if (resid > ROAD_BEST_FATAL_S)
      fail(`${tag}: captured best ${s.bryceBestSeconds} vs official ${s.officialBestLapSeconds} residual ${resid.toFixed(4)}s > ${ROAD_BEST_FATAL_S}s (partial artifact / wrong join)`);
    else if (resid > ROAD_BEST_ADVISORY_S)
      warn(`${tag}: captured best ${s.bryceBestSeconds} vs official ${s.officialBestLapSeconds} gap ${resid.toFixed(4)}s (capture missed his fastest lap — UI headlines official)`);
  }
}

// census consistency
if (census.covered.length !== pack.sessions.length)
  fail(`census covered ${census.covered.length} != pack sessions ${pack.sessions.length}`);

// no event double-counted
const eventCounts = {};
for (const s of pack.sessions) eventCounts[s.eventId] = (eventCounts[s.eventId] || 0) + 1;
const dupEvents = Object.entries(eventCounts).filter(([, n]) => n > 1);
if (dupEvents.length) fail(`weekend double-counted: ${JSON.stringify(dupEvents)}`);

// report
console.log(`quali-lab validate: ${pack.sessions.length} sessions, ${census.excluded.length} excluded`);
console.log(`  road position cross-checks: ${crossMatch} match, ${crossMismatchRoad} mismatch`);
console.log(`  max road best-lap residual vs official: ${residualMax.toFixed(4)}s (fatal >${ROAD_BEST_FATAL_S}s)`);
if (advisories.length) {
  console.log(`  advisories (${advisories.length}):`);
  for (const a of advisories) console.log(`    - ${a}`);
}
if (failures.length) {
  console.error(`FAIL (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASS');
