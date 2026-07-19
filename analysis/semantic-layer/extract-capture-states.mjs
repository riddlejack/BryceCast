#!/usr/bin/env node
// Extract compact per-session final states + rosters from BryceCast's OWN live
// capture (sourceTier: brycecast_capture) for the two-source cross-check.
//
// SAFETY: the live runtime is never touched directly by the pipeline. This
// script reads an APFS clone of data/live/brycecast.sqlite (make it with
// `cp -c <live sqlite> <clone>` — instant, copy-on-write, no lock contention,
// zero writes to the source) and emits a small committed JSON. Run BEFORE any
// race-day blackout; downstream validators read only the committed JSON.
//
// Usage: node extract-capture-states.mjs --db /path/to/clone.sqlite

import {execFileSync} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'output', 'cross-check');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const db = arg('--db', null);
if (!db) {
  console.error('usage: node extract-capture-states.mjs --db /path/to/brycecast-clone.sqlite');
  process.exit(2);
}

function q(sql) {
  return execFileSync('sqlite3', ['-json', db, sql], {maxBuffer: 1024 * 1024 * 512}).toString('utf8');
}

// All captured sessions with counts (NXT keys carry the official eventSessionId
// as the suffix of session_key: "<eventId>-<eventSessionId>").
const sessions = JSON.parse(
  q(`SELECT session_key, event_name, session_name,
        COUNT(*) AS snapshotCount, MIN(checked_at) AS firstCheckedAt, MAX(checked_at) AS lastCheckedAt
      FROM race_snapshots GROUP BY session_key ORDER BY MIN(checked_at);`),
);

const out = [];
for (const s of sessions) {
  if (!/INDY NXT/i.test(s.event_name || '')) continue;
  const rows = JSON.parse(
    q(
      `SELECT payload_json FROM race_snapshots WHERE session_key='${s.session_key.replace(/'/g, "''")}' ORDER BY checked_at DESC LIMIT 1;`,
    ),
  );
  if (!rows.length) continue;
  let payload;
  try {
    payload = JSON.parse(rows[0].payload_json);
  } catch {
    continue;
  }
  const items = payload?.raw?.timing?.timing_results?.Item;
  const itemArr = Array.isArray(items) ? items : items ? [items] : [];
  const summary = payload?.summary || {};
  out.push({
    sessionKey: s.session_key,
    officialEventSessionId: (s.session_key.split('-')[1] || null) && s.session_key.includes('-') ? s.session_key.split('-')[1] : null,
    eventName: s.event_name,
    sessionName: s.session_name,
    trackName: summary.trackName ?? null,
    sessionType: summary.sessionType ?? null,
    snapshotCount: s.snapshotCount,
    firstCheckedAt: s.firstCheckedAt,
    lastCheckedAt: s.lastCheckedAt,
    finalFlag: summary.flag ?? null,
    finalLap: summary.lap ?? null,
    totalLaps: summary.totalLaps ?? null,
    sourceTier: 'brycecast_capture',
    finalField: itemArr.map((it) => ({
      car: String(it.no ?? ''),
      firstName: it.firstName ?? null,
      lastName: it.lastName ?? null,
      officialDriverId: it.DriverID ?? null,
      rank: it.rank ?? null,
      startPosition: it.startPosition ?? null,
      laps: it.laps == null ? null : Number(it.laps),
      status: it.status ?? null,
      team: it.team ?? null,
    })),
  });
}

await mkdir(OUT, {recursive: true});
await writeFile(
  join(OUT, 'capture-final-states.json'),
  `${JSON.stringify(
    {
      source: 'brycecast_capture',
      note: 'Final-snapshot field state per captured INDY NXT session, extracted from an APFS clone of the live capture sqlite. The live runtime itself is never read by the pipeline.',
      extractedAt: new Date().toISOString(),
      sessions: out,
    },
    null,
    2,
  )}\n`,
);
console.log(`Extracted ${out.length} NXT sessions from capture clone.`);
for (const s of out) console.log(`  ${s.sessionKey}  ${s.eventName} | ${s.sessionName} | snapshots=${s.snapshotCount} field=${s.finalField.length}`);
