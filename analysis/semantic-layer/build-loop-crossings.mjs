#!/usr/bin/env node
// Semantic-layer slice 1: build canonical loop-crossing / laps / flags tables
// for every 2024-25 INDY NXT RaceTools session.
//
// Storage: per-session grain is written as gzipped NDJSON packs (one file per
// session) under output/sessions/, plus a single compact JSON summary index
// (output/loop-crossings-summary.json) that carries per-session counts, loop
// inventory, quality masks, and the derived lap counts. Full grain gzips small
// (~10-15 MB for all 143 sessions), well under the lane's <100 MB budget, and
// is deterministically regenerable from raw via this script.
//
// Reads only raw/ from the lake (via BRYCECAST_LAKE_DATA_ROOT). Writes only into
// this lane's output/. Never touches the live runtime or the a534 worktree.

import {createWriteStream} from 'node:fs';
import {mkdir, writeFile, rm} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {enumerateNxtSessions, readSessionLogText, lakeDataRoot} from './lib/lake.mjs';
import {parseRaceToolsSession, SOURCE_TIER} from './lib/racetools-semantic.mjs';

const LANE_DIR = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(LANE_DIR, 'output');
const SESSIONS_DIR = join(OUTPUT_DIR, 'sessions');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function writeGzipNdjson(path, rows) {
  await mkdir(dirname(path), {recursive: true});
  const gzip = createGzip({level: 9});
  const out = createWriteStream(path);
  gzip.pipe(out);
  for (const row of rows) {
    if (!gzip.write(`${JSON.stringify(row)}\n`)) await once(gzip, 'drain');
  }
  gzip.end();
  await once(out, 'finish');
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`);
  const {rename} = await import('node:fs/promises');
  await rename(tmp, path);
}

const onlyType = arg('--type', null); // e.g. race
const limit = Number(arg('--limit', '0')) || 0;

const all = await enumerateNxtSessions();
let sessions = onlyType ? all.filter((s) => s.sessionType === onlyType) : all;
if (limit) sessions = sessions.slice(0, limit);

console.log(`Lake root: ${lakeDataRoot()}`);
console.log(`Building loop-crossing tables for ${sessions.length} INDY NXT sessions (2024-25).`);

await rm(SESSIONS_DIR, {recursive: true, force: true});
await mkdir(SESSIONS_DIR, {recursive: true});

const index = [];
let done = 0;
let crossingTotal = 0;
const maskCounts = {};

for (const session of sessions) {
  let parsed;
  let error = null;
  try {
    parsed = parseRaceToolsSession(await readSessionLogText(session), session);
  } catch (e) {
    error = e.message;
  }

  if (error) {
    index.push({
      id: session.id,
      year: session.year,
      date: session.date,
      venue: session.venue,
      event: session.event,
      sessionType: session.sessionType,
      sessionCode: session.sessionCode,
      sessionLabel: session.sessionLabel,
      series: session.series,
      access: session.access,
      sourceTier: SOURCE_TIER,
      error,
    });
    done += 1;
    continue;
  }

  crossingTotal += parsed.crossings.length;
  for (const m of parsed.qualityMasks) maskCounts[m] = (maskCounts[m] || 0) + 1;

  // Per-session grain pack: crossings + laps + flags + classification.
  const packPath = join(SESSIONS_DIR, `${session.id}.ndjson.gz`);
  const rows = [];
  rows.push({record: 'session_meta', ...session, sourceTier: SOURCE_TIER, qualityMasks: parsed.qualityMasks});
  rows.push({record: 'geometry', ...parsed.geometry});
  for (const f of parsed.flags.intervals) rows.push({record: 'flag', ...f, sourceTier: SOURCE_TIER});
  for (const c of parsed.classification.byCar) rows.push({record: 'classification', ...c, sourceTier: SOURCE_TIER});
  for (const l of parsed.laps) rows.push({record: 'lap', ...l, sourceTier: SOURCE_TIER});
  for (const c of parsed.crossings) rows.push({record: 'loop_crossing', ...c, sourceTier: SOURCE_TIER});
  await writeGzipNdjson(packPath, rows);

  index.push({
    id: session.id,
    year: session.year,
    date: session.date,
    venue: parsed.geometry.venue || session.venue,
    event: session.event,
    sessionType: session.sessionType,
    sessionCode: session.sessionCode,
    sessionLabel: session.sessionLabel,
    series: session.series,
    access: session.access,
    sourceTier: SOURCE_TIER,
    trackType: parsed.geometry.trackType,
    lapBoundarySection: parsed.geometry.lapBoundarySection,
    sectionCount: parsed.geometry.sectionCount,
    loopLabels: parsed.loopLabels,
    loopsCrossed: parsed.loopsCrossed,
    distinctLoopCount: parsed.loopsCrossed.length,
    crossingCount: parsed.crossings.length,
    lapRowCount: parsed.laps.length,
    carCount: parsed.cars.length,
    heartbeat: parsed.heartbeats,
    flagEventCount: parsed.flags.events.length,
    greenTod: parsed.flags.greenTod,
    hasCheckered: parsed.flags.hasCheckered,
    maxDerivedLaps: Math.max(0, ...Object.values(parsed.lapCountByCar)),
    qualityMasks: parsed.qualityMasks,
    pack: `sessions/${session.id}.ndjson.gz`,
  });

  done += 1;
  if (done % 20 === 0 || done === sessions.length) console.log(`  ${done}/${sessions.length} sessions`);
}

const summary = {
  lane: 'analysis/semantic-layer',
  slice: 'slice-1-loop-crossings',
  generatedAt: new Date().toISOString(),
  sourceTier: SOURCE_TIER,
  lakeDataRoot: lakeDataRoot(),
  provenanceNote:
    'Derived from immutable RaceTools captures (raw/ only). Local time-of-day is the authoritative crossing clock; feed heartbeat epochs are date anchors with UNVALIDATED timezone. Not an official BryceCast fact.',
  sessionCount: sessions.length,
  crossingTotal,
  qualityMaskCounts: maskCounts,
  sessions: index,
};
await atomicWriteJson(join(OUTPUT_DIR, 'loop-crossings-summary.json'), summary);

console.log(`\nDone. ${sessions.length} sessions, ${crossingTotal} loop crossings.`);
console.log('quality masks:', JSON.stringify(maskCounts));
