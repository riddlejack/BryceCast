// Read-only ground truth for validation, from the canonical career dataset in
// the master worktree (never written). Overridable via BRYCECAST_CAREER_DATASET.
//
//  - official per-lap LAP CHART: career.dataset.json `lapSamples` carry a
//    per-car per-lap running position (position-only; sourced from official
//    Results/Section PDFs) for all 28 clean 2024-25 NXT races. This is the
//    external check for lap-chart agreement.
//  - official INCIDENTS: `incidents` carry {lapNumber, turn text, car} for the
//    located-incident cross-check.
//  - official finishing results: for winner/field-size context.

import {readFile} from 'node:fs/promises';

export const DEFAULT_CAREER_DATASET =
  '/Users/example/.codex/worktrees/ac78/Bryce POV access/data/career/career.dataset.json';

const VENUE_ALIASES = new Map([['ims', 'indianapolis'], ['wwt', 'worldwidetechnology']]);
export function normVenue(name) {
  const key = String(name || '')
    .toLowerCase()
    .replace(
      /\b(sports car course|international raceway|motorsports park|street circuit|road course|motor speedway|speedway|raceway|circuit|superspeedway|grand prix|streets of|streets?|park|street|road|course|of|rc|gp|the)\b/g,
      '',
    )
    .replace(/[^a-z0-9]+/g, '')
    .trim();
  return VENUE_ALIASES.get(key) ?? key;
}

export async function loadGroundTruth() {
  const path = process.env.BRYCECAST_CAREER_DATASET || DEFAULT_CAREER_DATASET;
  const data = JSON.parse(await readFile(path, 'utf8'));
  const tracks = new Map((data.tracks || []).map((t) => [t.id, t]));
  const events = new Map((data.events || []).map((e) => [e.id, e]));

  const raceSessions = (data.sessions || [])
    .filter((s) => s.sessionType === 'race' && /indy_nxt_202[45]/.test(s.id))
    .map((s) => {
      const ev = events.get(s.eventId) || {};
      const tr = tracks.get(ev.trackId) || {};
      const venue = tr.name || ev.trackName || '';
      return {
        id: s.id,
        date: String(s.scheduledStart || '').slice(0, 10),
        venue,
        venueKey: normVenue(venue),
        raceNumber: s.raceNumber ?? null,
      };
    });

  // official per-lap positions: sessionId -> Map(lapNumber -> Map(car -> position))
  const lapChart = new Map();
  for (const x of data.lapSamples || []) {
    if (!/indy_nxt_202[45]/.test(x.sessionId) || x.position == null) continue;
    if (!lapChart.has(x.sessionId)) lapChart.set(x.sessionId, new Map());
    const byLap = lapChart.get(x.sessionId);
    if (!byLap.has(x.lapNumber)) byLap.set(x.lapNumber, new Map());
    byLap.get(x.lapNumber).set(String(x.carNumber), x.position);
  }

  // official incidents: sessionId -> [{lap, cars[], turn, reason}]
  const incidents = new Map();
  for (const inc of data.incidents || []) {
    if (!/indy_nxt_202[45]/.test(inc.sessionId)) continue;
    const cars = (inc.raw && inc.raw.mentionedCars) || [];
    const reason = (inc.raw && inc.raw.reason) || inc.description || '';
    const turn = (/Turn\s+(\w+)/i.exec(reason) || [])[1] || null;
    if (!incidents.has(inc.sessionId)) incidents.set(inc.sessionId, []);
    incidents.get(inc.sessionId).push({lap: inc.lapNumber ?? null, cars: cars.map(String), turn, reason, type: inc.incidentType});
  }

  // official finishing results: sessionId -> [{car, finishPosition, lapsCompleted, status}]
  const results = new Map();
  for (const r of data.results || []) {
    if (!/indy_nxt_202[45]/.test(r.sessionId)) continue;
    if (!results.has(r.sessionId)) results.set(r.sessionId, []);
    results.get(r.sessionId).push({
      car: String(r.carNumber),
      finishPosition: r.finishPosition,
      lapsCompleted: r.lapsCompleted,
      status: r.status,
    });
  }

  return {raceSessions, lapChart, incidents, results};
}

// Map each feed race (summary session) to at most one canonical race, tiered so
// doubleheaders pair by race number and single races by date (mirrors the
// semantic layer's finishing-order matcher).
export function mapFeedToCanonical(feedRaces, raceSessions) {
  const feedRN = (s) => {
    const m = /^R(\d+)$/i.exec(s.sessionCode || '');
    return m ? Number(m[1]) : 1;
  };
  const used = new Set();
  const map = new Map();
  const sorted = feedRaces.slice().sort((a, b) => a.date.localeCompare(b.date) || feedRN(a) - feedRN(b));
  for (const s of sorted) {
    const vk = normVenue(s.venue);
    const rn = feedRN(s);
    const pick = (pred) => {
      const c = raceSessions.find((r) => !used.has(r.id) && pred(r));
      if (c) used.add(c.id);
      return c || null;
    };
    const can =
      pick((r) => r.date === s.date && r.venueKey === vk && (r.raceNumber ?? 1) === rn) ||
      pick((r) => r.date === s.date && r.venueKey === vk) ||
      pick((r) => r.date === s.date);
    map.set(s.id, can ? can.id : null);
  }
  return map;
}
