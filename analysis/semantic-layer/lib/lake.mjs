// Semantic-layer slice 1: lake access + session enumeration (catalog-free).
//
// The raw archive (~7.1 GB, git-ignored) lives ONLY in the a534 worktree. We
// read it READ-ONLY, and only under raw/ (content-addressed, immutable). We do
// NOT read the lake `catalog/` directory: another worker is regenerating it,
// and this lane is upstream of it. Session enumeration is derived directly from
// the self-describing raw/views tree instead (filenames encode series, session
// type, and date; series suffix `.L` = INDY NXT, `.I` = INDYCAR).
//
// The lake root is exposed via BRYCECAST_LAKE_DATA_ROOT (env) with a documented
// absolute default, never a hardcoded relative path from a component.

import {readFile, readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import {centralEntries, localEntryData} from '../../historical-data-lake/lib/archive-reader.mjs';

export const DEFAULT_LAKE_DATA_ROOT =
  '/Users/example/.codex/worktrees/a534/Bryce POV access/data/historical-data-lake';

export function lakeDataRoot() {
  return process.env.BRYCECAST_LAKE_DATA_ROOT || DEFAULT_LAKE_DATA_ROOT;
}

export function viewsRoot() {
  return join(lakeDataRoot(), 'raw', 'views');
}

// A RaceTools session filename encodes its identity, e.g.
//   INDY NXT by Firestone Grand Prix at Mid-Ohio(Mid-Ohio Sports Car Course)-Race_(R.L)_2025-07-06.zip
// -> event, venue (in parens), sessionLabel, sessionCode (R), series (.L), date.
const NAME_RE = /^(.*?)\(([^)]*)\)-(.*?)_\(([A-Za-z0-9]+)\.([A-Za-z])\)_(\d{4}-\d{2}-\d{2})\.zip$/;

const SERIES_BY_SUFFIX = {L: 'INDY_NXT', I: 'INDYCAR', P: 'INDY_NXT_LEGACY'};

function classifySessionType(sessionCode, sessionLabel) {
  const code = sessionCode.toUpperCase();
  const label = sessionLabel.toLowerCase();
  if (code === 'R' || /(^|\b)race(\b|$)/.test(label)) return 'race';
  if (code.startsWith('Q') || /qualif/.test(label)) return 'qualifying';
  if (/warm/.test(label)) return 'warmup';
  if (/\btest\b/.test(label) || code.startsWith('T')) return 'test';
  if (code.startsWith('P') || /practice|highline/.test(label)) return 'practice';
  return 'other';
}

export function parseSessionFileName(fileName) {
  const match = NAME_RE.exec(fileName);
  if (!match) return null;
  const [, event, venue, sessionLabel, sessionCode, seriesSuffix, date] = match;
  return {
    fileName,
    event: event.trim(),
    venue: venue.trim(),
    sessionLabel: sessionLabel.trim(),
    sessionCode,
    seriesSuffix,
    series: SERIES_BY_SUFFIX[seriesSuffix] || 'UNKNOWN',
    date,
    year: Number(date.slice(0, 4)),
    sessionType: classifySessionType(sessionCode, sessionLabel),
  };
}

function stableSessionId(meta, source) {
  // Deterministic, human-legible id, independent of any catalog id space.
  const slug = (s) =>
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  return `rt_${meta.year}_${slug(meta.venue) || 'venue'}_${meta.sessionCode.toLowerCase()}_${meta.date}_${
    source === 'annual' ? 'a' : 'd'
  }`;
}

// Enumerate every 2024-25 INDY NXT RaceTools session in the lake, catalog-free.
// 2025 sessions are direct ZIP views under sessions/2025/<event>/.
// 2024 sessions are nested entries inside annual/IndyCar_2024.zip.
export async function enumerateNxtSessions({years = [2024, 2025]} = {}) {
  const sessions = [];
  const views = viewsRoot();

  // Direct per-session ZIPs (2025, 2026-root).
  const sessionsDir = join(views, 'racetools', 'sessions');
  for (const yearDir of await safeReaddir(sessionsDir)) {
    const yearPath = join(sessionsDir, yearDir);
    if (!(await isDir(yearPath))) continue;
    for (const eventDir of await safeReaddir(yearPath)) {
      const eventPath = join(yearPath, eventDir);
      if (!(await isDir(eventPath))) continue;
      for (const file of await safeReaddir(eventPath)) {
        if (!file.endsWith('.zip')) continue;
        const meta = parseSessionFileName(file);
        if (!meta || meta.series !== 'INDY_NXT' || !years.includes(meta.year)) continue;
        sessions.push({
          ...meta,
          id: stableSessionId(meta, 'direct'),
          access: 'direct',
          viewPath: join(eventPath, file),
          eventFolder: eventDir,
        });
      }
    }
  }

  // Nested annual archives (2024 and earlier).
  const annualDir = join(views, 'racetools', 'annual');
  for (const year of years) {
    const annualZip = join(annualDir, `IndyCar_${year}.zip`);
    if (!(await exists(annualZip))) continue;
    const outer = await readFile(annualZip);
    for (const entry of centralEntries(outer)) {
      if (!entry.name.endsWith('.zip')) continue;
      const base = entry.name.slice(entry.name.lastIndexOf('/') + 1);
      const meta = parseSessionFileName(base);
      if (!meta || meta.series !== 'INDY_NXT' || meta.year !== year) continue;
      sessions.push({
        ...meta,
        id: stableSessionId(meta, 'annual'),
        access: 'annual',
        annualZip,
        entryName: entry.name,
        eventFolder: entry.name.split('/').slice(0, 2).join('/'),
      });
    }
  }

  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.sessionCode.localeCompare(b.sessionCode));
  return sessions;
}

// Return the decoded .log text (latin1) for a session, reading only raw bytes.
export async function readSessionLogText(session) {
  let innerZipBytes;
  if (session.access === 'direct') {
    innerZipBytes = await readFile(session.viewPath);
  } else if (session.access === 'annual') {
    const outer = await readFile(session.annualZip);
    const entry = centralEntries(outer).find((e) => e.name === session.entryName);
    if (!entry) throw new Error(`annual entry not found: ${session.entryName}`);
    innerZipBytes = localEntryData(outer, entry);
  } else {
    throw new Error(`unsupported access: ${session.access}`);
  }
  const entries = centralEntries(innerZipBytes);
  const logEntry = entries.find((e) => e.name.toLowerCase().endsWith('.log'));
  if (!logEntry) throw new Error(`session ZIP has no .log entry: ${session.id}`);
  return localEntryData(innerZipBytes, logEntry).toString('latin1');
}

async function safeReaddir(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}
async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}
async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
