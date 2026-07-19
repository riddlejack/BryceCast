// Read-only view of the canonical career dataset for validation. Never written.
// Path via BRYCECAST_CAREER_DATASET; documented default is the ac78 checkout.

import {readFile} from 'node:fs/promises';

export const DEFAULT_CAREER_DATASET =
  '/Users/example/.codex/worktrees/ac78/Bryce POV access/data/career/career.dataset.json';

function normVenue(name) {
  return String(name || '')
    .toLowerCase()
    .replace(
      /\b(sports car course|international raceway|motorsports park|street circuit|road course|motor speedway|speedway|raceway|circuit|superspeedway|grand prix|park|street|road|course|rc|gp|the)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, '')
    .trim();
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
