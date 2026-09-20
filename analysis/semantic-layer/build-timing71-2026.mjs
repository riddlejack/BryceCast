#!/usr/bin/env node
// Semantic-layer slice 2: build canonical event-grain tables for the audited
// completed 2026 INDY NXT sessions from the lake's Timing71 replays.
//
// Session selection is the audit-validated coverage matrix COMMITTED ON THIS
// BRANCH (data/historical-data-lake/catalog/coverage-2024-through-today.csv at
// commit 1e61227): the 2026 rows carry manually validated canonical replay IDs.
// This is a stable git artifact of the audited commit — NOT the lake worktree's
// regenerating catalog/ directory, which this lane still never reads.
// Replay IDs resolve to raw view paths via the committed source manifest.

import {readFile, mkdir, writeFile, rm} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import {lakeDataRoot, portablePath} from './lib/lake.mjs';
import {parseTiming71Session, T71_SOURCE_TIER} from './lib/timing71-semantic.mjs';

const LANE_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(LANE_DIR, '../..');
const OUTPUT_DIR = join(LANE_DIR, 'output');
const SESSIONS_DIR = join(OUTPUT_DIR, 'sessions-2026');
const COVERAGE_CSV = join(REPO_ROOT, 'data/historical-data-lake/catalog/coverage-2024-through-today.csv');
const MANIFEST = join(REPO_ROOT, 'data/historical-data-lake/manifests/source-files.json');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function sessionIdFor(row) {
  // e.g. t71_2026_barber_race_r1_2026-03-28 / t71_2026_st-petersburg_qualifying_g2_2026-02-28
  const raceN = /Race (\d)/i.exec(row.event)?.[1] ?? /Race (\d)/i.exec(row.sessionLabel)?.[1];
  const groupN = /Group (\d)/i.exec(row.sessionLabel)?.[1];
  const practiceN = /Practice (\d)/i.exec(row.sessionLabel)?.[1];
  const venue = slug(row.event.replace(/\s*Race \d\s*$/i, ''));
  const parts = [`t71`, row.year, venue, row.sessionType];
  if (raceN) parts.push(`r${raceN}`);
  else if (groupN) parts.push(`g${groupN}`);
  else if (practiceN) parts.push(`p${practiceN}`);
  parts.push(row.date);
  return parts.join('_');
}

async function writeGzipNdjson(path, rows) {
  await mkdir(dirname(path), {recursive: true});
  const gz = createGzip({level: 9});
  const out = createWriteStream(path);
  gz.pipe(out);
  for (const r of rows) if (!gz.write(`${JSON.stringify(r)}\n`)) await once(gz, 'drain');
  gz.end();
  await once(out, 'finish');
}

// Load the validated 2026 Timing71 sessions from the committed coverage CSV.
const csv = (await readFile(COVERAGE_CSV, 'utf8')).split(/\r?\n/).filter(Boolean);
const header = parseCsvLine(csv[0]);
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
const rows = csv
  .slice(1)
  .map(parseCsvLine)
  .filter((f) => f[idx.year] === '2026' && f[idx.source] === 'Timing71')
  .map((f) => ({
    year: Number(f[idx.year]),
    date: f[idx.date],
    lakeSessionId: f[idx.sessionId],
    replayId: f[idx.replayId],
    series: f[idx.series],
    sessionType: f[idx.sessionType],
    event: f[idx.event],
    sessionLabel: f[idx.sessionLabel],
    sourceQuality: f[idx.sourceQuality],
    expectedMaxLap: Number(f[idx.cleanSegmentMaxLap]) || null,
    expectedHasCheckered: f[idx.cleanSegmentHasCheckered] === 'true',
  }));
console.log(`Coverage matrix: ${rows.length} validated 2026 Timing71 sessions.`);
// Cross-artifact invariant (replaces the hand-moved session-count pin on
// 2026-07-21): the committed coverage CSV's 2026 Timing71 rows must equal the
// audited canonical list in timing71-2026-coverage.json exactly — every
// audited replay present, nothing unaudited smuggled in. New races enter by
// updating the audit file (postrace:lake-sync automates the gated update),
// never by editing a number here.
const audit = JSON.parse(
  await readFile(join(REPO_ROOT, 'analysis/historical-high-frequency-data-audit/timing71-2026-coverage.json'), 'utf8')
);
const auditedReplayIds = new Set(
  [...(audit.raceReplays ?? []), ...(audit.nonRaceSessionCandidates ?? [])].map((r) => r.replayId)
);
const rowReplayIds = new Set(rows.map((r) => r.replayId));
const missingFromCsv = [...auditedReplayIds].filter((id) => !rowReplayIds.has(id));
const unaudited = [...rowReplayIds].filter((id) => !auditedReplayIds.has(id));
if (missingFromCsv.length > 0 || unaudited.length > 0) {
  throw new Error(
    `coverage CSV vs audited canonical list mismatch — missing from CSV: [${missingFromCsv.join(', ')}] unaudited in CSV: [${unaudited.join(', ')}]`
  );
}

// Resolve replayId -> raw view path via the committed manifest.
const manifest = JSON.parse(await readFile(MANIFEST, 'utf8'));
const manifestFiles = manifest.files || manifest.sources || (Array.isArray(manifest) ? manifest : Object.values(manifest));
const byReplayId = new Map();
for (const f of manifestFiles) {
  if (f.kind === 'derived_analysis') continue;
  const rid = f.metadata?.replayId;
  if (rid) byReplayId.set(rid, f);
}

await rm(SESSIONS_DIR, {recursive: true, force: true});
await mkdir(SESSIONS_DIR, {recursive: true});

const index = [];
let done = 0;
for (const row of rows) {
  const entry = byReplayId.get(row.replayId);
  if (!entry) throw new Error(`replayId not in manifest: ${row.replayId} (${row.event} ${row.sessionLabel})`);
  const id = sessionIdFor(row);
  const zipBytes = await readFile(join(lakeDataRoot(), 'raw/views', entry.viewRelativePath));
  const session = {
    id,
    year: row.year,
    date: row.date,
    venue: row.event.replace(/\s*Race \d\s*$/i, ''),
    event: row.event,
    sessionType: row.sessionType,
    sessionLabel: row.sessionLabel,
    series: 'INDY_NXT',
    source: 'Timing71',
    replayId: row.replayId,
    lakeSessionId: row.lakeSessionId,
    sourceQuality: row.sourceQuality,
    recordingDescription: entry.metadata?.description ?? null,
  };
  const parsed = parseTiming71Session(zipBytes, session);
  if (row.sourceQuality === 'usable_after_segmentation' && !parsed.qualityMasks.includes('cross_session_recording_segmented')) {
    parsed.qualityMasks.push('cross_session_recording_segmented');
  }

  const packPath = join(SESSIONS_DIR, `${id}.ndjson.gz`);
  const packRows = [];
  packRows.push({
    record: 'session_meta',
    ...session,
    sourceTier: T71_SOURCE_TIER,
    qualityMasks: parsed.qualityMasks,
    sourceObservationCoverage: parsed.frames,
  });
  packRows.push({record: 'roster', cars: parsed.roster, sourceTier: T71_SOURCE_TIER});
  for (const f of parsed.flags) packRows.push({record: 'flag', ...f, sourceTier: T71_SOURCE_TIER});
  for (const c of parsed.classification) packRows.push({record: 'classification', ...c, sourceTier: T71_SOURCE_TIER});
  for (const l of parsed.laps) packRows.push({record: 'lap', ...l, sourceTier: T71_SOURCE_TIER});
  for (const c of parsed.crossings) packRows.push({record: 'loop_crossing', ...c, sourceTier: T71_SOURCE_TIER});
  for (const s of parsed.sectorObservations) packRows.push({record: 'sector_observation', ...s, sourceTier: T71_SOURCE_TIER});
  await writeGzipNdjson(packPath, packRows);

  const maxLaps = Math.max(0, ...parsed.classification.map((c) => c.laps ?? 0));
  index.push({
    ...session,
    sourceTier: T71_SOURCE_TIER,
    frames: parsed.frames,
    rosterSize: parsed.roster.length,
    lapRowCount: parsed.laps.length,
    crossingCount: parsed.crossings.length,
    sectorObservationCount: parsed.sectorObservations.length,
    flagEventCount: parsed.flags.length,
    maxLaps,
    expectedMaxLap: row.expectedMaxLap,
    maxLapMatchesCoverage: row.expectedMaxLap === null ? null : maxLaps === row.expectedMaxLap,
    qualityMasks: parsed.qualityMasks,
    pack: `sessions-2026/${id}.ndjson.gz`,
  });
  done += 1;
  console.log(`  ${done}/${rows.length} ${id} (frames=${parsed.frames.processedNxtSegment}/${parsed.frames.total}, laps=${parsed.laps.length}, sectors=${parsed.sectorObservations.length}) ${parsed.qualityMasks.join(',') || ''}`);
}

const summary = {
  lane: 'analysis/semantic-layer',
  slice: 'slice-2-timing71-2026',
  generatedAt: new Date().toISOString(),
  sourceTier: T71_SOURCE_TIER,
  lakeDataRoot: portablePath(lakeDataRoot()),
  provenanceNote:
    'Derived from Timing71 replay recordings (third-party normalized display state; 1-2 s cadence; real archive timestamps, no interpolation). Never label as official. Identity requires the validated crosswalk before ANY UI use.',
  sessionCount: index.length,
  sessions: index,
};
await writeFile(join(OUTPUT_DIR, 'timing71-2026-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(`\nDone: ${index.length} sessions.`);
