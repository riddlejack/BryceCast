import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const outPath = join(root, 'public/data/history-bryce.json');

const seriesId = '09341e09-3216-4f89-a45f-db697d72ee13';
const bryceId = '4959';
const bryceRcDriverId = '2143';
const teammateIds = ['4963', '4895', '4996'];
const previousYears = [2024, 2025];

const api = (path) => `https://www.indynxt.com/api/results/${path}`;

const readJson = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.json();
};

const safeReadJson = async (url) => {
  try {
    return await readJson(url);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Unknown fetch error' };
  }
};

const shortRaceName = (name = '') =>
  name
    .replace('Grand Prix of ', '')
    .replace('INDY NXT by Firestone at ', '')
    .replace('Indianapolis Grand Prix', 'Indy GP')
    .replace('World Wide Technology Raceway', 'WWTR')
    .replace('Race ', 'R');

const trackTypeLabel = (type) => {
  if (type === 'S') return 'Street';
  if (type === 'O') return 'Oval';
  return 'Road';
};

const average = (values) => {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const summarizeYear = (year, records) => {
  const finishes = records.map((result) => Number(result.Rank ?? result.PositionFinish ?? result.finish)).filter(Number.isFinite);

  return {
    year,
    starts: records.length,
    bestFinish: finishes.length ? Math.min(...finishes) : 0,
    top10s: finishes.filter((finish) => finish <= 10).length,
    averageFinish: Number(average(finishes).toFixed(1))
  };
};

const bestLapRank = (records, driverId) => {
  const ranked = records
    .map((record) => ({
      driverId: String(record.DriverOverrideID),
      speed: Number(record.BestSpeed)
    }))
    .filter((record) => Number.isFinite(record.speed) && record.speed > 0)
    .sort((a, b) => b.speed - a.speed);

  const index = ranked.findIndex((record) => record.driverId === String(driverId));
  return index >= 0 ? index + 1 : 0;
};

const driverRecord = (details, driverId) => details.records?.find((record) => String(record.DriverOverrideID) === String(driverId));

const isBryceTimingRow = (row) => {
  const first = String(row?.firstName ?? '').toLowerCase();
  const last = String(row?.lastName ?? '').toLowerCase();
  const driverId = String(row?.DriverID ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const main = async () => {
  const [standings, drivers, timing] = await Promise.all([
    readJson(api(`YearPointSummary?year=2026&id=${seriesId}`)),
    readJson(api(`DriversByYear?year=2026&id=${seriesId}`)),
    readJson('https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json')
  ]);

  const bryceYears = await Promise.all(
    previousYears.map(async (year) => [year, await readJson(api(`DriverYearDetails?year=${year}&series=${seriesId}&driverID=${bryceId}`))])
  );

  const bryceStanding = (standings.DriverList ?? []).find((driver) => driver.DriverName === 'Bryce Aron');
  const standingsRows = (bryceStanding?.Points ?? []).filter((entry) => entry.Track !== 'Total');
  const liveBryce = timing.timing_results?.Item?.find(isBryceTimingRow);
  const liveHeartbeat = timing.timing_results?.heartbeat;
  const liveSessionId = String(liveHeartbeat?.EventSessionID ?? '');
  const sessionRows = standingsRows.filter((entry) => Number(entry.Points) > 0 || String(entry.EventsSessionsID) === liveSessionId);
  const sessionDetails = await Promise.all(
    sessionRows.map(async (entry) => [String(entry.EventsSessionsID), entry, await safeReadJson(api(`EventsSessionDetails?id=${entry.EventsSessionsID}`))])
  );

  const points = sessionDetails.flatMap(([sessionId, standingsRow, details]) => {
    const record = driverRecord(details, bryceId);
    if (record) {
      return [
        {
          race: shortRaceName(details.EventName),
          type: trackTypeLabel(details.TrackType ?? standingsRow.TrackType),
          start: Number(record.PositionStart),
          finish: Number(record.PositionFinish),
          bestLapRank: bestLapRank(details.records ?? [], bryceId),
          points: Number(record.PointsEarned),
          status: record.Status,
          source: 'official session result'
        }
      ];
    }

    if (liveBryce && liveHeartbeat && String(sessionId) === liveSessionId) {
      return [
        {
          race: shortRaceName(liveHeartbeat.eventName),
          type: trackTypeLabel(liveHeartbeat.trackType),
          start: Number(liveBryce.startPosition),
          finish: Number(liveBryce.rank),
          bestLapRank: Number(liveBryce.NTRank) || 0,
          points: null,
          status: liveBryce.comment ? `${liveBryce.status}: ${liveBryce.comment}` : liveBryce.status,
          source: 'provisional Race Control timing; official result not published'
        }
      ];
    }

    return [];
  });

  const teammateSummaries = teammateIds.map((driverId) => {
    const driver = drivers.find((item) => String(item.DriverOverrideID) === driverId);
    const records = sessionDetails
      .map(([, , details]) => driverRecord(details, driverId))
      .filter(Boolean);

    return {
      name: driver ? `${driver.FirstName} ${driver.LastName}` : records[0]?.DriverName ?? `Driver ${driverId}`,
      driverId,
      ...summarizeYear(2026, records)
    };
  });

  const bryceFinishes = points.map((point) => point.finish).filter(Number.isFinite);

  const payload = {
    checkedAt: new Date().toISOString(),
    source: 'INDY NXT official results API + Race Control timing feed for unpublished current session',
    points,
    bryceStanding: bryceStanding
      ? {
          rank: Number(bryceStanding.OverallPosition),
          points: Number(bryceStanding.TotalPoints),
          wins: Number(bryceStanding.TotalWins),
          top5: bryceFinishes.filter((finish) => finish <= 5).length || Number(bryceStanding.TotalTop5s),
          top10: bryceFinishes.filter((finish) => finish <= 10).length,
          bestFinish: bryceFinishes.length ? Math.min(...bryceFinishes) : Number(bryceStanding.BestFinish)
        }
      : undefined,
    yearSummaries: [
      ...bryceYears.map(([year, details]) => summarizeYear(Number(year), details.Results ?? [])),
      summarizeYear(2026, points)
    ],
    teammateSummaries
  };

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: outPath, points: payload.points.length, teammates: payload.teammateSummaries.length }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
