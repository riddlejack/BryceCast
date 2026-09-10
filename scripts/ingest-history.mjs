import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outPath = join(root, 'public/data/history-bryce.json');
const BRYCE = 'driver_bryce_aron';
const SERIES = 'series_indy_nxt';
const API_SERIES = '09341e09-3216-4f89-a45f-db697d72ee13';
const num = (v) => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const shortName = (name = '') => name.replace('Grand Prix of ', '').replace('INDY NXT by Firestone at ', '').replace('Indianapolis Grand Prix', 'Indy GP').replace('World Wide Technology Raceway', 'WWTR').replace('Race ', 'R');
const summarize = (year, records) => {
  const finishes = records.map((r) => num(r.finishPosition ?? r.finish)).filter((n) => n > 0);
  return { year, starts: records.length, bestFinish: finishes.length ? Math.min(...finishes) : null,
    top10s: finishes.filter((n) => n <= 10).length,
    averageFinish: finishes.length ? Number((finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(1)) : null };
};

// Results come from the reconciled canonical dataset. DriverYearDetails can
// omit a completed race, and the off-season live feed may be a different series.
const main = async () => {
  const data = JSON.parse(await readFile(join(root, 'data/career/career.dataset.json'), 'utf8'));
  const events = new Map(data.events.map((e) => [e.id, e]));
  const sessions = new Map(data.sessions.map((s) => [s.id, s]));
  const tracks = new Map(data.tracks.map((t) => [t.id, t]));
  const drivers = new Map(data.drivers.map((d) => [d.id, d]));
  const teams = new Map(data.teams.map((t) => [t.id, t]));
  const cars = new Map(data.cars.map((c) => [c.id, c]));
  const all = data.results.filter((r) => {
    const s = sessions.get(r.sessionId);
    return s?.sessionType === 'race' && events.get(s.eventId)?.seriesId === SERIES;
  });
  const bryce = all.filter((r) => r.driverId === BRYCE);
  const yearOf = (r) => events.get(sessions.get(r.sessionId).eventId).seasonYear;
  const year = Math.max(...bryce.map(yearOf));
  const season = bryce.filter((r) => yearOf(r) === year).sort((a, b) => {
    const da = Date.parse(sessions.get(a.sessionId).scheduledStart ?? events.get(sessions.get(a.sessionId).eventId).eventEndDate);
    const db = Date.parse(sessions.get(b.sessionId).scheduledStart ?? events.get(sessions.get(b.sessionId).eventId).eventEndDate);
    return da - db || a.sessionId.localeCompare(b.sessionId);
  });
  const sourceUrl = `https://www.indynxt.com/api/results/YearPointSummary?year=${year}&id=${API_SERIES}`;
  const response = await fetch(sourceUrl, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Official standings refresh failed (${response.status}); previous history retained.`);
  const standings = await response.json();
  const standing = standings.DriverList?.find((r) => r.DriverName === 'Bryce Aron');
  if (!standing || !(num(standing.OverallPosition) > 0) || num(standing.TotalPoints) === null) throw new Error('Official Bryce standing missing; previous history retained.');
  const importedIds = new Set(season.map((r) => String(sessions.get(r.sessionId).officialSessionId)));
  // Positive session IDs identify race rows, including zero-point finishes.
  // Summary/bonus rows have no positive session ID and are not race evidence.
  const missing = (standing.Points ?? []).filter((r) => num(r.EventsSessionsID) > 0 && !importedIds.has(String(r.EventsSessionsID)));
  if (missing.length) throw new Error(`Canonical race results lag official standings: ${missing.map((r) => r.EventsSessionsID).join(', ')}. Refresh career first.`);
  const points = season.map((r) => {
    const session = sessions.get(r.sessionId), event = events.get(session.eventId), track = tracks.get(event.trackId);
    const field = all.filter((row) => row.sessionId === r.sessionId).map((row) => ({ id: row.driverId, speed: num(row.bestLapSpeedMph ?? row.raw?.bestLapSpeedMph ?? row.raw?.BestSpeed) })).filter((row) => row.speed > 0).sort((a, b) => b.speed - a.speed);
    const rank = field.findIndex((row) => row.id === BRYCE);
    return { sessionId: r.sessionId, race: shortName(event.name), type: track?.trackType === 'oval' ? 'Oval' : track?.trackType === 'street' ? 'Street' : 'Road', start: num(r.startPosition), finish: num(r.finishPosition), bestLapRank: num(r.bestLapRank) ?? (rank < 0 ? null : rank + 1),
      points: num(r.points), status: r.status, source: 'official session result', provenanceRefs: r.provenanceRefs ?? [] };
  });
  // Compare only drivers who shared Bryce's team in the same race, including
  // mid-season substitutions. A hard-coded list silently turned rivals into teammates.
  const teammateRows = new Map();
  for (const race of season) for (const other of all) {
    if (other.sessionId !== race.sessionId || !race.teamId || other.teamId !== race.teamId || other.driverId === BRYCE) continue;
    if (!teammateRows.has(other.driverId)) teammateRows.set(other.driverId, []);
    teammateRows.get(other.driverId).push(other);
  }
  const teammateSummaries = [...teammateRows].map(([id, records]) => ({ name: drivers.get(id)?.displayName ?? id, driverId: drivers.get(id)?.externalIds?.indynxtDriverId ?? id, ...summarize(year, records), scope: 'shared-team races with Bryce' }));
  const entries = standings.DriverList.map((row) => {
    const driver = data.drivers.find((d) => d.displayName === row.DriverName);
    const latest = all.filter((r) => r.driverId === driver?.id && yearOf(r) === year).sort((a, b) => String(events.get(sessions.get(a.sessionId).eventId).eventEndDate).localeCompare(String(events.get(sessions.get(b.sessionId).eventId).eventEndDate))).at(-1);
    const car = cars.get(latest?.carId);
    return { driverName: row.DriverName, driverId: driver?.id ?? null, carNo: String(car?.number ?? car?.carNumber ?? latest?.raw?.carNumber ?? ''), teamName: teams.get(latest?.teamId)?.name ?? null,
      points: num(row.TotalPoints), rank: num(row.OverallPosition), isBryce: row.DriverName === 'Bryce Aron' };
  }).filter((r) => r.rank > 0 && r.points !== null).sort((a, b) => a.rank - b.rank);
  const checkedAt = new Date().toISOString();
  const finishes = points.map((r) => r.finish).filter((n) => n > 0);
  const payload = { checkedAt, source: 'Reconciled official INDY NXT session results and championship standings', seasonYear: year, points,
    bryceStanding: { rank: num(standing.OverallPosition), points: num(standing.TotalPoints), wins: num(standing.TotalWins), top5: finishes.filter((n) => n <= 5).length, top10: finishes.filter((n) => n <= 10).length, bestFinish: finishes.length ? Math.min(...finishes) : null },
    yearSummaries: [...new Set(bryce.map(yearOf))].sort().map((y) => summarize(y, bryce.filter((r) => yearOf(r) === y))), teammateSummaries,
    officialStandings: { seasonYear: year, checkedAt, publishedAt: standings.UpdatedDate ?? null, sourceUrl, entries }
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(`${outPath}.tmp`, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(`${outPath}.tmp`, outPath);
  console.log(JSON.stringify({ wrote: outPath, races: points.length, standing: payload.bryceStanding, teammates: teammateSummaries.length }));
};
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
