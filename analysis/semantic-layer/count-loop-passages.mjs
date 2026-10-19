#!/usr/bin/env node
// Count what the loop_crossing rows in the session packs amount to.
//
// A loop_crossing row is one section-completion record as the feed reported it,
// not one pass over a loop. The feed resends records (five 2025 Laguna Seca
// test captures repeat theirs hundreds of times), and one pass over a loop can
// close more than one timing section, so the row count overstates passes.
//
//   crossingRecords  every loop_crossing row
//   repeatedRecords  rows whose car, timing section, crossing time and lap
//                    repeat an earlier row in the same session
//   sectionRecords   crossingRecords - repeatedRecords
//   passages         distinct (car, loop, crossing time) per session
//
// Reads the committed summary and the restored packs; writes
// output/loop-passages.json for scripts/portfolio-stats.mjs.

import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadSummary, loadPack, OUTPUT_DIR} from './lib/pack.mjs';

const summary = await loadSummary();
const summarySha256 = createHash('sha256')
  .update(await readFile(join(OUTPUT_DIR, 'loop-crossings-summary.json')))
  .digest('hex');

const totals = {crossingRecords: 0, repeatedRecords: 0, sectionRecords: 0, passages: 0};
const bySessionType = {};
const repeatsBySession = [];
let sessionsWithCrossings = 0;
for (const s of summary.sessions) {
  const pack = await loadPack(s.pack);
  const rows = pack.loop_crossing;
  if (rows.length !== s.crossingCount) throw new Error(`${s.id}: pack has ${rows.length} crossing rows, summary says ${s.crossingCount}`);
  const records = new Set();
  const passes = new Set();
  for (const c of rows) {
    records.add(JSON.stringify([c.car, c.sectionLabel, c.timeOfDaySeconds, c.lapIndex]));
    passes.add(JSON.stringify([c.car, c.endLoop, c.timeOfDaySeconds]));
  }
  if (rows.length) sessionsWithCrossings += 1;
  const n = {crossingRecords: rows.length, repeatedRecords: rows.length - records.size, sectionRecords: records.size, passages: passes.size};
  const t = (bySessionType[s.sessionType] ||= {sessions: 0, crossingRecords: 0, repeatedRecords: 0, sectionRecords: 0, passages: 0});
  t.sessions += 1;
  for (const k of Object.keys(totals)) {
    totals[k] += n[k];
    t[k] += n[k];
  }
  if (n.repeatedRecords) repeatsBySession.push({id: s.id, sessionType: s.sessionType, qualityMasks: s.qualityMasks || [], ...n});
}
if (totals.crossingRecords !== summary.crossingTotal) throw new Error(`packs hold ${totals.crossingRecords} crossing rows, summary says ${summary.crossingTotal}`);
repeatsBySession.sort((a, b) => b.repeatedRecords - a.repeatedRecords);

const report = {
  lane: 'semantic_layer',
  generatedAt: new Date().toISOString(),
  summaryGeneratedAt: summary.generatedAt,
  summarySha256,
  definitions: {
    crossingRecords: 'Every loop_crossing row in the session packs: one section-completion record as the feed reported it.',
    repeatedRecords: 'Rows whose car, timing section, crossing time and lap repeat an earlier row in the same session (feed resends).',
    sectionRecords: 'crossingRecords minus repeatedRecords.',
    passages: 'Distinct (car, loop, crossing time) per session: one pass of one car over one timing loop, which can close more than one timing section.',
  },
  sessionCount: summary.sessions.length,
  sessionsWithCrossings,
  ...totals,
  bySessionType,
  repeatedRecordsBySession: repeatsBySession,
};
await writeFile(join(OUTPUT_DIR, 'loop-passages.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log(`${summary.sessions.length} sessions (${sessionsWithCrossings} with crossings)`);
console.log(`crossing records ${totals.crossingRecords}; repeated ${totals.repeatedRecords}; section records ${totals.sectionRecords}; passages ${totals.passages}`);
for (const [type, t] of Object.entries(bySessionType)) console.log(`  ${type.padEnd(11)} records ${t.crossingRecords}\tpassages ${t.passages}`);
