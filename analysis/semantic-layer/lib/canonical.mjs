// Read-only view of the canonical career dataset for validation. Never written.
// Path via BRYCECAST_CAREER_DATASET; default is this repository's dataset.

import {readFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const DEFAULT_CAREER_DATASET = join(REPO_ROOT, 'data/career/career.dataset.json');

const VENUE_ALIASES = new Map([
  ['ims', 'indianapolis'], // "IMS" (feed) vs "Indianapolis Motor Speedway ..." (canonical)
  ['wwt', 'worldwidetechnology'], // "WWT Raceway" vs "World Wide Technology Raceway"
]);

function normVenue(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(
      /\b(sports car course|international raceway|motorsports park|street circuit|road course|motor speedway|speedway|raceway|circuit|superspeedway|grand prix|streets?|park|street|road|course|of|rc|gp|the)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return VENUE_ALIASES.get(key) ?? key;
}

export async function loadCanonicalRaces() {
  const path = process.env.BRYCECAST_CAREER_DATASET || DEFAULT_CAREER_DATASET;
  const data = JSON.parse(await readFile(path, 'utf8'));
  const tracks = new Map((data.tracks || []).map((t) => [t.id, t]));
  const events = new Map((data.events || []).map((e) => [e.id, e]));
  const resultsBySession = new Map();
  for (const r of data.results || []) {
    if (!resultsBySession.has(r.sessionId)) resultsBySession.set(r.sessionId, []);
    resultsBySession.get(r.sessionId).push(r);
  }

  const races = [];
  for (const s of data.sessions || []) {
    if (s.sessionType !== 'race') continue;
    if (!/indy_nxt/.test(s.id)) continue;
    const ev = events.get(s.eventId) || {};
    const track = tracks.get(ev.trackId) || {};
    const venue = track.name || ev.trackName || '';
    const date = String(s.scheduledStart || '').slice(0, 10);
    const year = Number((s.id.match(/_(\d{4})_/) || [])[1]) || Number(date.slice(0, 4));
    const results = (resultsBySession.get(s.id) || []).map((r) => ({
      car: String(r.carNumber),
      finishPosition: r.finishPosition,
      classifiedPosition: r.classifiedPosition,
      lapsCompleted: r.lapsCompleted,
      status: r.status,
      driverId: r.driverId,
    }));
    races.push({
      sessionId: s.id,
      year,
      date,
      venue,
      venueKey: normVenue(venue),
      sessionName: s.sessionName,
      raceNumber: s.raceNumber ?? null,
      results,
    });
  }
  return races;
}

// Full canonical context for the identity crosswalk: drivers, NXT sessions with
// official ids, per-session and per-event entrant maps (car# -> driverIds).
export async function loadCanonicalIdentityContext() {
  const path = process.env.BRYCECAST_CAREER_DATASET || DEFAULT_CAREER_DATASET;
  const data = JSON.parse(await readFile(path, 'utf8'));
  const drivers = new Map((data.drivers || []).map((d) => [d.id, d]));
  const tracks = new Map((data.tracks || []).map((t) => [t.id, t]));
  const events = new Map((data.events || []).map((e) => [e.id, e]));

  const sessions = [];
  for (const s of data.sessions || []) {
    if (!/indy_nxt/.test(s.id)) continue;
    const ev = events.get(s.eventId) || {};
    const track = tracks.get(ev.trackId) || {};
    sessions.push({
      sessionId: s.id,
      eventId: s.eventId,
      officialSessionId: s.officialSessionId ?? null,
      sessionType: s.sessionType,
      sessionName: s.sessionName,
      raceNumber: s.raceNumber ?? null,
      date: String(s.scheduledStart || '').slice(0, 10),
      year: Number((s.id.match(/_(\d{4})_/) || [])[1]) || null,
      venue: track.name || ev.trackName || '',
      venueKey: normVenue(track.name || ev.trackName || ''),
    });
  }
  const sessionsById = new Map(sessions.map((s) => [s.sessionId, s]));

  // car# -> Set(driverId), scoped per session and per event, from race results
  // AND qualifying results (practice sessions have no result rows; the event
  // union is their entrant scope).
  const bySession = new Map();
  const byEvent = new Map();
  const byYear = new Map();
  function add(scopeMap, key, car, driverId) {
    if (!key || !car || !driverId) return;
    if (!scopeMap.has(key)) scopeMap.set(key, new Map());
    const m = scopeMap.get(key);
    if (!m.has(car)) m.set(car, new Set());
    m.get(car).add(driverId);
  }
  for (const r of [...(data.results || []), ...(data.qualifyingResults || [])]) {
    const s = sessionsById.get(r.sessionId);
    if (!s) continue;
    const car = String(r.carNumber ?? '');
    add(bySession, r.sessionId, car, r.driverId);
    add(byEvent, s.eventId, car, r.driverId);
    add(byYear, s.year, car, r.driverId);
  }

  return {drivers, sessions, sessionsById, entrantsBySession: bySession, entrantsByEvent: byEvent, entrantsByYear: byYear};
}

// --- Name matching with variant rules (the crosswalk's core) ---
// Returns {match: bool, rule: 'exact'|'given_prefix'|'given_initials'|'given_initial'|'family_only'|null}
export function matchDriverName(sourceName, canonicalDriver) {
  const src = splitName(sourceName);
  const canFull = normName(canonicalDriver.displayName || '');
  const can = {
    given: normName(canonicalDriver.givenName || ''),
    family: normName(canonicalDriver.familyName || ''),
  };
  if (!src.family || !can.family) return {match: false, rule: null};
  const srcFull = normName(sourceName);
  if (srcFull && srcFull === canFull) return {match: true, rule: 'exact'};

  const famEq =
    src.family === can.family ||
    stripSuffix(src.family) === stripSuffix(can.family) ||
    lastToken(src.family) === lastToken(can.family);
  if (!famEq) return {match: false, rule: null};

  const g1 = src.given;
  const g2 = can.given;
  if (g1 && g2) {
    if (g1 === g2) return {match: true, rule: 'exact'};
    if ((g1.length >= 3 && g2.startsWith(g1)) || (g2.length >= 3 && g1.startsWith(g2)))
      return {match: true, rule: 'given_prefix'}; // Seb ~ Sebastian
    const i1 = initials(g1);
    const i2 = initials(g2);
    if (g1.replace(/\s+/g, '') === i2 || g2.replace(/\s+/g, '') === i1)
      return {match: true, rule: 'given_initials'}; // JM ~ Juan Manuel
    if (i1[0] === i2[0] && (g1.length <= 2 || g2.length <= 2)) return {match: true, rule: 'given_initial'};
    return {match: false, rule: null};
  }
  return {match: true, rule: 'family_only'};
}

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function splitName(name) {
  const n = normName(name);
  const parts = n.split(' ').filter(Boolean);
  // Drop generational suffixes BEFORE splitting ("Salvador de Alba Jr").
  while (parts.length > 1 && /^(jr|sr|ii|iii|iv)$/.test(parts[parts.length - 1])) parts.pop();
  if (parts.length <= 1) return {given: '', family: parts.join(' ')};
  // Family may be multi-token ("de alba", "de tullio", "william miller"): treat
  // the final token plus any lowercase particles before it as the family.
  const particles = new Set(['de', 'da', 'van', 'von', 'del', 'la']);
  let famStart = parts.length - 1;
  while (famStart - 1 > 0 && particles.has(parts[famStart - 1])) famStart -= 1;
  return {given: parts.slice(0, famStart).join(' '), family: parts.slice(famStart).join(' ')};
}
function stripSuffix(fam) {
  return fam.replace(/\s+(jr|sr|ii|iii)$/i, '').trim();
}
function lastToken(fam) {
  const p = stripSuffix(fam).split(' ');
  return p[p.length - 1];
}
function initials(given) {
  return given
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('');
}

export function matchCanonicalRace(races, session) {
  const venueKey = normVenue(session.venue);
  // Prefer an exact date match, else fall back to (year, venue).
  return (
    races.find((r) => r.date === session.date && r.results.length) ||
    races.find((r) => r.year === session.year && r.venueKey === venueKey && r.results.length) ||
    null
  );
}

export {normVenue};
