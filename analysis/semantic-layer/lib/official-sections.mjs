// Read-only view of parsed official Section Results (Bryce's per-lap section
// times, from official INDY NXT PDFs) for section-time residual validation.
// Path via BRYCECAST_SECTION_OBS; documented default is the master lane output.

import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_SECTION_OBS = join(REPO_ROOT, 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv');

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

// Returns { sessions: Map(sessionId -> {year, raceLabel, trackName, laps: Map(lap -> Map(sectionName -> {timeSeconds, sectionType})) }) }
export async function loadOfficialSections() {
  const path = process.env.BRYCECAST_SECTION_OBS || DEFAULT_SECTION_OBS;
  const text = await readFile(path, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const sessions = new Map();
  for (let i = 1; i < lines.length; i += 1) {
    const f = parseCsvLine(lines[i]);
    const sessionId = f[idx.sessionId];
    const year = Number(f[idx.seasonYear]);
    const lap = Number(f[idx.lapNumber]);
    const sectionName = f[idx.sectionName];
    const sectionType = f[idx.sectionType];
    const timeSeconds = Number(f[idx.timeSeconds]);
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        sessionId,
        year,
        raceLabel: f[idx.raceLabel],
        trackName: f[idx.trackName],
        laps: new Map(),
      });
    }
    const s = sessions.get(sessionId);
    if (!s.laps.has(lap)) s.laps.set(lap, new Map());
    s.laps.get(lap).set(sectionName, {timeSeconds, sectionType});
  }
  return sessions;
}
