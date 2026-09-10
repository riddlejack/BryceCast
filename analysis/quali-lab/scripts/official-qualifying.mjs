/** Official section timing is lap/loop grain, never sampled telemetry or GPS.
 * A physical qualifying run can establish multiple independently classified grids. */
export const BRYCE_ID = 'driver_bryce_aron';
export const CANCELLED_QUALIFYING = {
  session_indy_nxt_2024_6489: { note: 'Qualifying was stopped by rain and cancelled. The interrupted run is retained; the race grid was set by entrant points.', url: 'https://www.indynxt.com/news/2024/09/09-14-nxt-nashville-quals' },
  session_indy_nxt_2025_6596: { note: 'Qualifying was cancelled due to thunderstorms. No qualifying laps took place; the grid was set by entrant points.', url: 'https://www.indynxt.com/news/2025/07/07-11-nxt-practice' }
};
const round = (n) => Number.isFinite(n) ? Math.round(n * 10000) / 10000 : null;
export const seconds = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parts = String(value).trim().split(':').map(Number);
  if (!parts.length || parts.some((n) => !Number.isFinite(n))) return null;
  return parts.reduce((total, n) => total * 60 + n, 0);
};
const sameName = (car) => car.driverId === BRYCE_ID || /aron,?\s+bryce|bryce\s+aron/i.test(car.driverName ?? '');
const groupNumber = (name) => String(name ?? '').match(/group\s*(\d+)/i)?.[1] ?? null;
const raceLabel = (event) => /race\s*2/i.test(event.name) ? 'Race 2' : /race\s*1/i.test(event.name) ? 'Race 1' : null;
// FS-PI / FS-PO are named mainline sections in these reports. They are not
// the overlapping pit-lane totals listed as PI to PO, PO to SF, or SF to PI.
const pitSection = (name) => /^(?:PI|PO)(?:\b|\s)|^SF\s*(?:to|-)\s*PI$|Alt|Pit/i.test(name);

export function officialQualifyingIndex(dataset) {
  const sessions = new Map(dataset.sessions.map((s) => [s.id, s]));
  const events = new Map(dataset.events.map((e) => [e.id, e]));
  const tracks = new Map(dataset.tracks.map((t) => [t.id, t]));
  const evidence = new Map(dataset.sourceEvidence.map((e) => [e.id, e]));
  const results = new Map();
  for (const q of dataset.qualifyingResults) {
    if (!results.has(q.sessionId)) results.set(q.sessionId, []);
    results.get(q.sessionId).push(q);
  }
  const metrics = new Map(dataset.derivedMetrics.filter((m) => m.metricType === 'official_section_results').map((m) => [m.sessionId, m]));
  const groups = [];
  for (const q of dataset.qualifyingResults) {
    if (q.driverId !== BRYCE_ID || /combined/i.test(q.sessionSegment ?? '')) continue;
    const session = sessions.get(q.sessionId);
    const event = events.get(session?.eventId);
    if (!session || event?.seriesId !== 'series_indy_nxt') continue;
    const metric = metrics.get(session.id);
    groups.push({ q, session, event, metric, track: tracks.get(event.trackId), field: results.get(q.sessionId) ?? [] });
  }
  for (const [id, cancellation] of Object.entries(CANCELLED_QUALIFYING)) {
    const session = sessions.get(id);
    const event = events.get(session?.eventId);
    if (!session || !event || groups.some((g) => g.session.id === id)) continue;
    groups.push({ q: { sessionId: id, driverId: BRYCE_ID, sessionSegment: session.sessionName, position: null, bestLapTime: null }, session, event,
      metric: metrics.get(id), track: tracks.get(event.trackId), field: [], cancellation });
  }
  return { dataset, sessions, events, evidence, results, groups };
}

/** Only a named doubleheader at this track, this season and this weekend may
 * share a physical run. The group label must also agree. No year/venue-only join. */
export function sharedGroups(index, group) {
  const mine = raceLabel(group.event);
  return index.groups.filter((other) => {
    if (other.session.id === group.session.id) return true;
    if (!mine || !raceLabel(other.event) || mine === raceLabel(other.event)) return false;
    if (other.event.trackId !== group.event.trackId || other.event.seasonYear !== group.event.seasonYear) return false;
    if (groupNumber(other.q.sessionSegment) !== groupNumber(group.q.sessionSegment)) return false;
    const distance = Math.abs(Date.parse(other.event.eventStartDate) - Date.parse(group.event.eventStartDate));
    return Number.isFinite(distance) && distance <= 3 * 86400000;
  }).sort((a, b) => (raceLabel(a.event) ?? '').localeCompare(raceLabel(b.event) ?? ''));
}

export const officialQualifyingTimeSeconds = (q, isOval) => {
  if (!isOval) return seconds(q.bestLapTime);
  const laps = [seconds(q.raw?.qualLap1), seconds(q.raw?.qualLap2)];
  return laps.every((lap) => lap > 0) ? (laps[0] + laps[1]) / 2 : null;
};

export function gridClassifications(index, group, isOval) {
  return sharedGroups(index, group).flatMap((g) => {
    const combined = [...index.results.entries()]
      .filter(([sid]) => index.sessions.get(sid)?.eventId === g.event.id)
      .map(([, rows]) => ({ rows, q: rows.find((q) => q.driverId === BRYCE_ID && /combined/i.test(q.sessionSegment ?? '')) }))
      .find(({ rows, q }) => q && rows.length > g.field.length);
    const grid = g.cancellation ? null : combined?.q ?? (isOval && !groupNumber(g.q.sessionSegment) ? g.q : null);
    return index.dataset.sessions.filter((s) => s.eventId === g.event.id && s.sessionType === 'race').map((s) => ({
      raceSessionId: s.id,
      qualifyingSessionId: g.session.id,
      eventId: g.event.id,
      raceLabel: raceLabel(g.event),
      combinedGridPosition: grid?.position ?? null,
      combinedFieldSize: grid ? (combined?.rows.length ?? g.field.length) : null,
      officialBestLapSeconds: officialQualifyingTimeSeconds(g.q, isOval),
      groupRank: g.q.position ?? null,
      groupFieldSize: g.field.length || null,
      lapSelection: isOval ? 'two_lap_average' : raceLabel(g.event) === 'Race 2' ? 'second_fastest' : 'fastest',
      source: 'canonical_official_qualifying',
      provenanceRefs: grid?.provenanceRefs ?? g.q.provenanceRefs ?? []
    }));
  });
}

/** Merge continuation pages without counting them as additional cars. */
export function sectionCars(group) {
  const byCar = new Map();
  for (const car of group.metric?.metrics?.cars ?? []) {
    const key = String(car.carNumber);
    if (!byCar.has(key)) byCar.set(key, { ...car, laps: new Map() });
    const merged = byCar.get(key);
    if (sameName(car)) merged.driverId = BRYCE_ID;
    for (const lap of car.laps ?? []) {
      if (!Number.isInteger(lap.lapNumber) || lap.lapNumber <= 0) continue;
      if (!merged.laps.has(lap.lapNumber)) merged.laps.set(lap.lapNumber, new Map());
      for (const section of lap.sections ?? []) merged.laps.get(lap.lapNumber).set(section.name, section);
    }
  }
  return [...byCar.values()].map((car) => {
    const q = group.field.find((q) => q.driverId === car.driverId || String(q.raw?.carNumber) === String(car.carNumber));
    // A report can include out-laps as well as timed laps. The parser supplies
    // completedLap when available; otherwise a repeated terminal total with
    // fewer populated sections is a partial row, not another completed lap.
    const all = [...car.laps.entries()].sort((a, b) => a[0] - b[0]).map(([lapNumber, sections]) => ({ lapNumber, sections: [...sections.values()] }));
    const laps = all.filter((lap, i) => {
      const total = lap.sections.find((s) => s.name === 'Lap')?.timeSeconds;
      if (!(total > 0)) return false;
      const prev = all[i - 1];
      const prevTotal = prev?.sections.find((s) => s.name === 'Lap')?.timeSeconds;
      const count = (l) => l.sections.filter((s) => s.name !== 'Lap' && !pitSection(s.name) && s.timeSeconds > 0).length;
      if (i === all.length - 1 && prev && total === prevTotal && count(lap) < count(prev)) return false;
      return true;
    });
    return { ...car, qualifyingResult: q ?? null, laps };
  });
}

export function buildOfficialSectionLaps(index, group) {
  const cars = sectionCars(group);
  const bryce = cars.find(sameName);
  if (!bryce?.laps.length) return null;
  const bestFor = (car) => Math.min(...car.laps.map((l) => l.sections.find((s) => s.name === 'Lap')?.timeSeconds).filter((s) => s > 0));
  const cleanFor = (car) => car.laps.filter((l) => {
    const total = l.sections.find((s) => s.name === 'Lap')?.timeSeconds;
    return total > 0 && total <= bestFor(car) * 1.06;
  });
  const names = [...new Set(bryce.laps.flatMap((l) => l.sections.map((s) => s.name)))].filter((name) => name !== 'Lap' && !pitSection(name));
  const bestSection = (car, name) => {
    const values = cleanFor(car).map((lap) => lap.sections.find((s) => s.name === name)?.timeSeconds).filter((s) => s > 0);
    return values.length ? Math.min(...values) : null;
  };
  const distribution = new Map([...names, 'Lap'].map((name) => [name, cars.filter((car) => !sameName(car)).map((car) => bestSection(car, name)).filter((s) => s > 0)]));
  const cleanLaps = new Set(cleanFor(bryce).map((l) => l.lapNumber));
  const tuple = (lap, name) => {
    const value = lap.sections.find((s) => s.name === name);
    if (!(value?.timeSeconds > 0)) return null;
    const others = distribution.get(name) ?? [];
    const n = others.length + 1;
    const rank = 1 + others.filter((s) => s < value.timeSeconds - 0.00005).length;
    return [lap.lapNumber, n > 1 ? round(1 - (rank - 1) / (n - 1)) : null, rank, n, cleanLaps.has(lap.lapNumber) ? 1 : 0, 'u', round(value.timeSeconds), value.speedMph ?? null];
  };
  const refs = (group.metric.inputRefs ?? []).map((id) => index.evidence.get(id)).filter(Boolean);
  return {
    schemaVersion: 'brycecast.sectionLaps.v1', type: 'section_laps',
    id: `quali_sections_${group.session.id}`, sessionId: group.session.id,
    raceLabel: group.session.sessionName, seasonYear: group.event.seasonYear,
    venueName: group.track?.name ?? group.event.name, trackType: group.track?.trackType ?? null,
    totalLaps: Math.max(...bryce.laps.map((l) => l.lapNumber)),
    tupleOrder: ['lap', 'fieldPercentile', 'fieldRank', 'fieldComparisonCount', 'clean', 'caution', 'timeSeconds', 'speedMph'],
    sourceTier: 'parsed_pdf_aggregate', comparisonScope: 'qualifying_group_best_sections',
    sections: names.map((sectionName) => ({ sectionName, kind: 'measured', laps: bryce.laps.map((lap) => tuple(lap, sectionName)).filter(Boolean), fieldSeconds: (distribution.get(sectionName) ?? []).slice().sort((a, b) => a - b) })),
    lapTotals: bryce.laps.map((lap) => tuple(lap, 'Lap')).filter(Boolean),
    sourceStateCounts: { official_section_results: bryce.laps.length },
    sourceRefs: refs.map((r) => ({ key: r.id, path: r.url, note: r.sourceName })),
    caveats: [
      'Official timing-loop section times, not GPS or second-by-second telemetry.',
      'Each selected section is ranked against each other driver’s best section on a lap within 6% of that driver’s fastest recorded lap in this qualifying group. The denominator is the drivers with an observed comparable section.',
      'The clean marker is a lap-time filter, not proof of green flags or clear air. No flag state is inferred.',
      'Pit segments and incomplete terminal rows are excluded. Missing sections remain unavailable.'
    ]
  };
}
