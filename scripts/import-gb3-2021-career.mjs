import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFile } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/gb3-2021');
const reportPath = join(root, 'data/career/reports/gb3-2021-import-report.json');

const year = 2021;
const seriesId = 'series_gb3';
const seasonId = 'season_gb3_2021_bryce_aron';
const baseUrl = 'https://www.tsl-timing.com';
const pdftotextPath = '/opt/homebrew/bin/pdftotext';
const standingsOriginalUrl = 'https://www.gb-3.net/standings/2021-championship-standings/';
const standingsArchiveUrl = 'https://web.archive.org/web/20211127043937id_/https://www.gb-3.net/standings/2021-championship-standings/';
const eventFormatUrl = 'https://www.gb-3.net/event-format-and-costs';
const eventFormatSourceId = 'source_gb3_event_format_and_costs';

const eventsConfig = [
  {
    eventId: '212005',
    round: 1,
    venue: 'Brands Hatch',
    trackId: 'track_brands_hatch_gp',
    trackName: 'Brands Hatch GP',
    startDate: '2021-05-22',
    endDate: '2021-05-23',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'MSVR',
    sessions: ['fp1', 'qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '212505',
    round: 2,
    venue: 'Silverstone',
    trackId: 'track_silverstone_gp',
    trackName: 'Silverstone GP',
    startDate: '2021-06-26',
    endDate: '2021-06-27',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'BRSCC',
    sessions: ['qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '212705',
    round: 3,
    venue: 'Donington Park',
    trackId: 'track_donington_park_gp',
    trackName: 'Donington Park GP',
    startDate: '2021-07-10',
    endDate: '2021-07-11',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'MSVR',
    sessions: ['qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '212905',
    round: 4,
    venue: 'Spa-Francorchamps',
    trackId: 'track_spa_gp',
    trackName: 'Spa GP',
    startDate: '2021-07-24',
    endDate: '2021-07-25',
    country: 'Belgium',
    timezone: 'Europe/Brussels',
    organizer: 'SRO',
    sessions: ['fp1', 'fp2', 'fp3', 'qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '213105',
    round: 5,
    venue: 'Snetterton',
    trackId: 'track_snetterton_300',
    trackName: 'Snetterton 300',
    startDate: '2021-08-07',
    endDate: '2021-08-08',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'MSVR',
    sessions: ['qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '213605',
    round: 6,
    venue: 'Oulton Park',
    trackId: 'track_oulton_park_international',
    trackName: 'Oulton Park International',
    startDate: '2021-09-11',
    endDate: '2021-09-12',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'MSVR',
    sessions: ['qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  },
  {
    eventId: '214105',
    round: 7,
    venue: 'Donington Park',
    trackId: 'track_donington_park_gp',
    trackName: 'Donington Park GP',
    startDate: '2021-10-16',
    endDate: '2021-10-17',
    country: 'United Kingdom',
    timezone: 'Europe/London',
    organizer: 'BRSCC',
    sessions: ['qu1', 'qu2', 'rc1', 'rc2', 'rc3']
  }
];

const sessionLabels = {
  fp1: { label: 'Free Practice 1', type: 'practice', raceNumber: null },
  fp2: { label: 'Free Practice 2', type: 'practice', raceNumber: null },
  fp3: { label: 'Free Practice 3', type: 'practice', raceNumber: null },
  cop: { label: 'Combined Practice', type: 'practice', raceNumber: null },
  qu1: { label: 'Qualifying', type: 'qualifying', raceNumber: null },
  qu2: { label: 'Qualifying 2nd Fastest', type: 'qualifying', raceNumber: null },
  rc1: { label: 'Race 1 Result', type: 'race', raceNumber: 1 },
  rc2: { label: 'Race 2 Result', type: 'race', raceNumber: 2 },
  rc3: { label: 'Race 3 Result', type: 'race', raceNumber: 3 }
};

const gridLabels = {
  grd: { label: 'Grid for Race 1', raceCode: 'rc1', raceNumber: 1 },
  gr2: { label: 'Grid for Race 2', raceCode: 'rc2', raceNumber: 2 },
  gr3: { label: 'Grid for Race 3', raceCode: 'rc3', raceNumber: 3 }
};

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const concurrency = Math.max(1, Number(argValue('concurrency', '4')));
const retries = Math.max(0, Number(argValue('retries', '2')));
const refresh = process.argv.includes('--refresh');

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const readTextIfExists = async (path, fallback) => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return fallback;
  }
};

const fileExists = async (path) => {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const nonEmptyFileExists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchResponse = async (url, attempt = 0) => {
  try {
    const response = await fetch(url, { headers: { accept: 'text/html,application/pdf,text/plain,*/*' } });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return response;
  } catch (error) {
    if (attempt >= retries || error.status === 404) throw error;
    await sleep(250 * 2 ** attempt);
    return fetchResponse(url, attempt + 1);
  }
};

const fetchTextCached = async (url, path) => {
  if (!refresh) {
    const cached = await readTextIfExists(path, null);
    if (cached !== null) return { payload: cached, fromCache: true };
  }
  const payload = await (await fetchResponse(url)).text();
  await writeFile(path, payload);
  return { payload, fromCache: false };
};

const fetchBinaryCached = async (url, path) => {
  if (!refresh && (await nonEmptyFileExists(path))) return { fromCache: true };
  const payload = Buffer.from(await (await fetchResponse(url)).arrayBuffer());
  await writeFile(path, payload);
  return { fromCache: false };
};

const pdfToTextCached = async (pdfPath, textPath) => {
  if (!refresh && (await nonEmptyFileExists(textPath))) return { payload: await readFile(textPath, 'utf8'), fromCache: true };
  await execFileAsync(pdftotextPath, ['-layout', pdfPath, textPath]);
  return { payload: await readFile(textPath, 'utf8'), fromCache: false };
};

const mapLimit = async (items, limit, mapper) => {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
};

const mergeValue = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (Array.isArray(current) || Array.isArray(next)) return Array.from(new Set([...(asArray(current)), ...(asArray(next))]));
  if (current && next && typeof current === 'object' && typeof next === 'object') return { ...current, ...next };
  return next;
};

const upsert = (map, row) => {
  if (!row?.id) return;
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  const merged = { ...current };
  for (const [key, value] of Object.entries(row)) merged[key] = mergeValue(current[key], value);
  merged.provenanceRefs = Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]));
  map.set(row.id, merged);
};

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes, publishedAt = null }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt,
  accessedBy: 'scripts/import-gb3-2021-career.mjs',
  licenseNotes: 'Public official timing/series pages and PDFs; store extracted facts, provenance, and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-gb3-2021-career.mjs',
  rawArtifactPath,
  notes
});

const stripHtml = (value) =>
  String(value ?? '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const cleanCarNumber = (value) => String(value ?? '').replace(/\*/g, '').trim();
const driverIdFor = (name) => /^bryce\s+aron$/i.test(name) ? 'driver_bryce_aron' : `driver_${slug(name)}`;
const teamIdFor = (team) => `team_${slug(team || 'unknown_team')}`;
const carIdFor = (team, carNumber) => `car_gb3_${year}_${slug(team || 'unknown_team')}_${slug(carNumber || 'unknown')}`;
const parsePosition = (value) => (/^\d+$/.test(String(value ?? '')) ? Number(value) : null);
const statusCategory = (position) => {
  const raw = String(position ?? '').toLowerCase();
  if (/^\d+$/.test(raw)) return 'running';
  if (raw.includes('dnf')) return 'dnf';
  if (raw.includes('dns')) return 'dns';
  if (raw.includes('dq') || raw.includes('dsq')) return 'dsq';
  return 'unknown';
};

const monthNumber = (month) => {
  const key = String(month).toLowerCase().slice(0, 3);
  return {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12'
  }[key] ?? null;
};

const parsePrintedDate = (text) => {
  const match = text.match(/Printed\s*-\s*\d{1,2}:\d{2}\s+\w+,\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!match) return null;
  const month = monthNumber(match[2]);
  if (!month) return null;
  return `${match[3]}-${month}-${String(match[1]).padStart(2, '0')}`;
};

const withDateAndTime = (date, time) => date && time ? `${date}T${time}:00` : null;

const parseTimes = (text) => {
  const date = parsePrintedDate(text);
  const line = text.match(/Start:\s*(\d{1,2}:\d{2})\s+Flag\s+(\d{1,2}:\d{2})\s+End:\s*(\d{1,2}:\d{2})/i);
  return {
    printedDate: date,
    scheduledStart: withDateAndTime(date, line?.[1]),
    flagAt: withDateAndTime(date, line?.[2]),
    endedAt: withDateAndTime(date, line?.[3])
  };
};

const parseWeatherTrack = (text) => {
  const match = text.match(/Weather\s*\/\s*Track\s*:\s*([^\/\n]+?)\s*\/\s*([^\n\r]+)/i);
  if (!match) return { ambientConditionRaw: null, trackConditionRaw: null };
  return {
    ambientConditionRaw: match[1].trim(),
    trackConditionRaw: match[2].replace(/\s{2,}.*/, '').trim()
  };
};

const normalizeTrackCondition = (value) => {
  const raw = String(value ?? '').toLowerCase();
  if (!raw) return null;
  if (raw.includes('wet')) return 'wet';
  if (raw.includes('damp')) return 'damp';
  if (raw.includes('drying')) return 'drying';
  if (raw.includes('dry')) return 'dry';
  return 'unknown';
};

const splitGapDiff = (tokens) => {
  if (tokens.length === 0) return { gapToLeader: null, gapToAhead: null };
  if (tokens.length === 1) return { gapToLeader: tokens[0], gapToAhead: null };
  if (/^laps?$/i.test(tokens[1] ?? '')) {
    const first = `${tokens[0]} ${tokens[1]}`;
    const rest = tokens.slice(2).join(' ') || null;
    return { gapToLeader: first, gapToAhead: rest };
  }
  if (tokens.length >= 4 && /^laps?$/i.test(tokens[3] ?? '')) {
    return { gapToLeader: `${tokens[0]} ${tokens[1]}`, gapToAhead: `${tokens[2]} ${tokens[3]}` };
  }
  return { gapToLeader: tokens[0], gapToAhead: tokens.slice(1).join(' ') || null };
};

const parseClassificationRows = (text, sessionType) => {
  const rows = [];
  const failures = [];
  const lines = text.split(/\r?\n/);
  let inRows = false;
  for (const line of lines) {
    if (/^POS\s+NO\s+/i.test(line.trim())) {
      inRows = true;
      continue;
    }
    if (!inRows) continue;
    if (/^\s*(FASTEST LAP|Weather\s*\/\s*Track|These results|Clerk Of Course|Results can be found|Printed)/i.test(line)) break;
    if (/^\s*NOT CLASSIFIED/i.test(line)) continue;
    if (!line.trim()) continue;
    if (!/^\s*(\d+|DNF|DNS|DQ|DSQ)\s+\S+/.test(line)) continue;

    const parts = line.trim().split(/\s{2,}/).filter(Boolean);
    if (parts.length < 8 && !(sessionType === 'race' && /^(DNF|DNS|DQ|DSQ)$/i.test(parts[0] ?? '') && parts.length >= 6) && !(sessionType !== 'race' && parts.length >= 6)) {
      failures.push({ line, reason: 'too_few_columns' });
      continue;
    }

    const positionRaw = parts[0];
    let numberRaw = parts[1];
    let nameRaw = parts[2];
    let nationalityCode = parts[3];
    let team = parts[4];
    let dataStartIndex = 5;
    if (sessionType === 'race' && /^(DNF|DNS|DQ|DSQ)$/i.test(positionRaw)) {
      const fusedCarDriver = String(numberRaw ?? '').match(/^(\d+)\s*\*?\s+(.+)$/);
      if (fusedCarDriver && /^[A-Z]{3}$/.test(String(nameRaw ?? ''))) {
        numberRaw = fusedCarDriver[1];
        nameRaw = fusedCarDriver[2];
        nationalityCode = parts[2];
        team = parts[3];
        dataStartIndex = 4;
      }
    }
    const carNumber = cleanCarNumber(numberRaw);
    const driverName = nameRaw.replace(/\s+/g, ' ').trim();
    const position = parsePosition(positionRaw);

    if (sessionType === 'race') {
      const [laps, totalTime] = parts.slice(dataStartIndex, dataStartIndex + 2);
      const tail = parts.slice(dataStartIndex + 2).join(' ').trim().split(/\s+/).filter(Boolean);
      if (tail.length < 3 && !Number.isFinite(safeNumber(laps))) {
        failures.push({ line, reason: 'race_tail_parse_failed' });
        continue;
      }
      const bestLapNumber = tail.length >= 3 ? tail.pop() : null;
      const bestLapTime = tail.length >= 2 ? tail.pop() : null;
      const averageSpeed = tail.length >= 1 ? safeNumber(tail.pop()) : null;
      const { gapToLeader, gapToAhead } = splitGapDiff(tail);
      rows.push({
        positionRaw,
        position,
        carNumber,
        driverName,
        nationalityCode,
        team,
        lapsCompleted: safeNumber(laps),
        totalTime,
        gapToLeader,
        gapToAhead,
        averageSpeed,
        bestLapTime,
        bestLapNumber: safeNumber(bestLapNumber)
      });
      continue;
    }

    if (parts.length === 6) {
      rows.push({
        positionRaw,
        position,
        carNumber,
        driverName,
        nationalityCode,
        team,
        lapsCompleted: safeNumber(parts[5]),
        totalTime: null,
        gapToLeader: null,
        gapToAhead: null,
        averageSpeed: null,
        bestLapTime: null,
        bestLapNumber: null
      });
      continue;
    }

    const [bestLapTime, bestLapNumber, laps] = parts.slice(dataStartIndex, dataStartIndex + 3);
    const tail = parts.slice(dataStartIndex + 3).join(' ').trim().split(/\s+/).filter(Boolean);
    if (tail.length < 1) {
      failures.push({ line, reason: 'timed_tail_parse_failed' });
      continue;
    }
    const averageSpeed = safeNumber(tail.pop());
    const { gapToLeader, gapToAhead } = splitGapDiff(tail);
    rows.push({
      positionRaw,
      position,
      carNumber,
      driverName,
      nationalityCode,
      team,
      lapsCompleted: safeNumber(laps),
      totalTime: null,
      gapToLeader,
      gapToAhead,
      averageSpeed,
      bestLapTime,
      bestLapNumber: safeNumber(bestLapNumber)
    });
  }
  return { rows, failures };
};

const parseGridRows = (text) => {
  const rows = [];
  const failures = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^(Pole|These results|Clerk Of Course|Results can be found|Printed|Car\s+\d+\s+-|Circuit Length)/i.test(trimmed)) continue;
    if (/^\d+:\d{2}\.\d+/.test(trimmed)) continue;
    const match = trimmed.match(/^(?:ROW\s+\d+\s+)?(\d{1,2})\s+(\d{1,3})\s+(.+?)\s*$/i);
    if (!match) continue;
    const [, gridPositionRaw, carNumberRaw, driverNameRaw] = match;
    if (!/[A-Za-z]/.test(driverNameRaw)) {
      failures.push({ line, reason: 'missing_driver_name' });
      continue;
    }
    rows.push({
      gridPosition: Number(gridPositionRaw),
      carNumber: cleanCarNumber(carNumberRaw),
      driverName: driverNameRaw.replace(/\s+/g, ' ').trim()
    });
  }
  rows.sort((a, b) => a.gridPosition - b.gridPosition);
  return { rows, failures };
};

const parseBryceStanding = (html) => {
  const rows = String(html ?? '').match(/<tr class="fs_title_driver">[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    if (!/bryce-aron|Bryce\s+Aron/i.test(row)) continue;
    const position = safeNumber(row.match(/class="fs_title_pos">\s*(\d+)\./i)?.[1]);
    const points = safeNumber(row.match(/<strong>\s*([\d.]+)\s*pts\s*<\/strong>/i)?.[1]);
    const driverName = stripHtml(row.match(/<strong>(.*?)<\/strong>/i)?.[1]);
    const team = stripHtml(row.match(/<br\s*\/?>(.*?)<\/td>/i)?.[1]);
    if (position && points !== null && /^Bryce Aron$/i.test(driverName)) {
      return { position, points, driverName, team, rawHtml: row };
    }
  }
  return null;
};

const relative = (path) => path.replace(`${root}/`, '');
const sessionPdfUrl = (eventId, code) => `${baseUrl}/file/?f=BF3GT/2021/${eventId}${code}bf3.pdf`;
const gridPdfUrl = sessionPdfUrl;
const sessionSlug = (code) => slug(sessionLabels[code]?.label ?? code);
const sessionIdFor = (event, code) => `session_gb3_${year}_${event.eventId}_${sessionSlug(code)}`;
const isGb32021SourceRef = (ref) => String(ref ?? '').startsWith('source_gb3_2021_');
const isOwnedByGb32021Import = (row) => {
  const refs = asArray(row?.provenanceRefs);
  return refs.length > 0 && refs.every(isGb32021SourceRef);
};
const withoutGb32021Rows = (rows, predicate) => asArray(rows).filter((row) => !predicate(row));
const stripGb32021Provenance = (row) => ({
  ...row,
  provenanceRefs: asArray(row?.provenanceRefs).filter((ref) => !isGb32021SourceRef(ref))
});

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const existing = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const sourceEvidenceMap = new Map(withoutGb32021Rows(existing.sourceEvidence, (row) => String(row.id ?? '').startsWith('source_gb3_2021_')).map((row) => [row.id, row]));
  const drivers = new Map(withoutGb32021Rows(existing.drivers, isOwnedByGb32021Import).map(stripGb32021Provenance).map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series).map(stripGb32021Provenance).map((row) => [row.id, row]));
  const teams = new Map(withoutGb32021Rows(existing.teams, isOwnedByGb32021Import).map(stripGb32021Provenance).map((row) => [row.id, row]));
  const cars = new Map(withoutGb32021Rows(existing.cars, (row) => isOwnedByGb32021Import(row) || String(row.id ?? '').startsWith('car_gb3_2021_')).map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(withoutGb32021Rows(existing.seasons, (row) => row.id === seasonId).map((row) => [row.id, row]));
  const events = new Map(withoutGb32021Rows(existing.events, (row) => String(row.id ?? '').startsWith('event_gb3_2021_')).map((row) => [row.id, row]));
  const sessions = new Map(withoutGb32021Rows(existing.sessions, (row) => String(row.id ?? '').startsWith('session_gb3_2021_')).map((row) => [row.id, row]));
  const results = new Map(withoutGb32021Rows(existing.results, (row) => String(row.id ?? '').startsWith('result_gb3_2021_')).map((row) => [row.id, row]));
  const qualifyingResults = new Map(withoutGb32021Rows(existing.qualifyingResults, (row) => String(row.id ?? '').startsWith('qualifying_gb3_2021_')).map((row) => [row.id, row]));
  const weatherObservations = new Map(withoutGb32021Rows(existing.weatherObservations, (row) => String(row.id ?? '').startsWith('weather_gb3_2021_')).map((row) => [row.id, row]));
  const mediaAssets = new Map(withoutGb32021Rows(existing.mediaAssets, (row) => String(row.id ?? '').startsWith('asset_gb3_2021_')).map((row) => [row.id, row]));

  const importReport = {
    checkedAt: retrievedAt,
    year,
    refresh,
    concurrency,
    fetched: 0,
    cached: 0,
    eventPagesImported: 0,
    pdfsImported: 0,
    gridPdfsImported: 0,
    pdfsStagedOnly: 0,
    sessionsImported: 0,
    resultsImported: 0,
    qualifyingResultsImported: 0,
    bryceResultsImported: 0,
    weatherObservationsImported: 0,
    mediaAssetsImported: 0,
    standingsImported: false,
    gridPositionsImported: 0,
    rawArtifacts: [],
    parserValidation: [],
    gaps: []
  };

  upsert(series, {
    id: seriesId,
    name: 'GB3 Championship',
    category: 'formula',
    ladderLevel: 'British single-seater development ladder',
    governingBody: 'MotorSport Vision',
    countryScope: 'United Kingdom / Europe',
    officialWebsite: 'https://www.gb-3.net/',
    externalIds: { gb3ChampionshipId: '22', historicalName2021: 'BRDC British F3 Championship' },
    provenanceRefs: ['source_gb3_2021_tsl_event_index']
  });
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_gb3_2021_tsl_event_index',
    sourceType: 'official_html',
    sourceName: 'TSL Timing 2021 British GT / GB3 event index pages',
    url: 'https://www.tsl-timing.com/Results/bf3gt/2021',
    retrievedAt,
    coverage: 'Official TSL result index family for 2021 British GT events containing GB3/BRDC British F3 session PDFs.',
    rawArtifactPath: null,
    notes: 'Aggregate source row used by canonical GB3 series metadata; event-specific source evidence rows hold cached HTML artifacts.'
  }));

  const eventFormatPath = join(rawDir, 'gb3-event-format-and-costs.html');
  try {
    const eventFormatPage = await fetchTextCached(eventFormatUrl, eventFormatPath);
    importReport[eventFormatPage.fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(relative(eventFormatPath));
    upsert(sourceEvidenceMap, sourceEvidence({
      id: eventFormatSourceId,
      sourceType: 'official_html',
      sourceName: 'GB3 Championship Event Format and costs',
      url: eventFormatUrl,
      retrievedAt,
      coverage: 'Official GB3 event-format page describing Race 1 grid from first qualifying classification and Race 2 grid from second qualifying classification.',
      rawArtifactPath: relative(eventFormatPath),
      notes: 'Used only for rule-backed grid derivation where matching official TSL qualifying PDFs provide the driver order.'
    }));
  } catch (error) {
    importReport.gaps.push({
      id: 'gap_gb3_event_format_source_unavailable',
      scope: 'gb3',
      status: 'open',
      description: `Official GB3 event-format page could not be fetched: ${error.message}. Race 1/Race 2 grid derivation requires this rule source plus TSL qualifying classifications.`
    });
  }

  const standingsPath = join(rawDir, 'gb3-2021-official-standings-archive.html');
  let bryceStanding = null;
  try {
    const standingsPage = await fetchTextCached(standingsArchiveUrl, standingsPath);
    importReport[standingsPage.fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(relative(standingsPath));
    bryceStanding = parseBryceStanding(standingsPage.payload);
    if (bryceStanding) {
      importReport.standingsImported = true;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: 'source_gb3_2021_official_championship_standings_archive',
        sourceType: 'official_html',
        sourceName: 'GB3 2021 Championship Standings archived official page',
        url: standingsArchiveUrl,
        retrievedAt,
        coverage: 'Archived official GB3 2021 Championship Standings page listing driver championship position and points.',
        rawArtifactPath: relative(standingsPath),
        notes: `Original official URL: ${standingsOriginalUrl}. Wayback timestamp 20211127043937. Parsed Bryce Aron as P${bryceStanding.position} with ${bryceStanding.points} points.`
      }));
    }
  } catch (error) {
    importReport.gaps.push({
      id: 'gap_gb3_2021_official_standings_archive_fetch_failed',
      scope: 'gb3_2021',
      status: 'open',
      description: `Archived official GB3 2021 standings page could not be fetched: ${error.message}`
    });
  }

  const sessionEntries = [];
  for (const event of eventsConfig) {
    const eventPageUrl = `${baseUrl}/event/${event.eventId}`;
    const eventPagePath = join(rawDir, `${event.eventId}-event.html`);
    const eventPage = await fetchTextCached(eventPageUrl, eventPagePath);
    importReport[eventPage.fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(relative(eventPagePath));
    importReport.eventPagesImported += 1;

    const eventEvidenceId = `source_gb3_2021_${event.eventId}_event_page`;
    upsert(sourceEvidenceMap, sourceEvidence({
      id: eventEvidenceId,
      sourceType: 'official_html',
      sourceName: `TSL Timing GB3 2021 ${event.venue} event page`,
      url: eventPageUrl,
      retrievedAt,
      coverage: `Official TSL event index for ${event.venue}, including GB3/BRDC British F3 PDFs and event timetable link.`,
      rawArtifactPath: relative(eventPagePath),
      notes: `${event.organizer} event page. The 2021 source label is BRDC British F3 Championship on several PDFs.`
    }));

    upsert(events, {
      id: `event_gb3_${year}_r${event.round}_${slug(event.venue)}`,
      seriesId,
      seasonYear: year,
      name: `GB3 ${year} Round ${event.round} - ${event.venue}`,
      round: event.round,
      eventStartDate: event.startDate,
      eventEndDate: event.endDate,
      trackId: event.trackId,
      country: event.country,
      officialEventId: event.eventId,
      timezone: event.timezone,
      timezoneSource: 'track_metadata',
      provenanceRefs: [eventEvidenceId]
    });

    const bookUrl = sessionPdfUrl(event.eventId, '');
    upsert(mediaAssets, {
      id: `asset_gb3_${year}_${event.eventId}_pdf_book`,
      assetType: 'pdf',
      title: `GB3 ${year} ${event.venue} TSL PDF book`,
      url: bookUrl,
      rightsStatus: 'link_only',
      publishedAt: event.endDate,
      eventId: `event_gb3_${year}_r${event.round}_${slug(event.venue)}`,
      sessionId: null,
      driverId: null,
      summary: `Official TSL PDF book for GB3/BRDC British F3 at ${event.venue}.`,
      quoteText: null,
      provenanceRefs: [eventEvidenceId]
    });
    importReport.mediaAssetsImported += 1;

    for (const code of event.sessions) sessionEntries.push({ event, code, eventEvidenceId });
  }

  const gridEntries = [];
  for (const event of eventsConfig) {
    for (const [code, label] of Object.entries(gridLabels)) {
      if (event.sessions.includes(label.raceCode)) gridEntries.push({ event, code, label });
    }
  }

  const stagedGrids = await mapLimit(gridEntries, concurrency, async (entry) => {
    const { event, code } = entry;
    const pdfUrl = gridPdfUrl(event.eventId, code);
    const fileBase = `${event.eventId}-${code}-bf3`;
    const pdfPath = join(rawDir, `${fileBase}.pdf`);
    const textPath = join(rawDir, `${fileBase}.txt`);
    try {
      const pdf = await fetchBinaryCached(pdfUrl, pdfPath);
      importReport[pdf.fromCache ? 'cached' : 'fetched'] += 1;
      importReport.rawArtifacts.push(relative(pdfPath));
      const text = await pdfToTextCached(pdfPath, textPath);
      if (text.fromCache) importReport.cached += 1;
      importReport.rawArtifacts.push(relative(textPath));
      return { ...entry, pdfUrl, pdfPath, textPath, text: text.payload, error: null };
    } catch (error) {
      return { ...entry, pdfUrl, pdfPath, textPath, text: null, error };
    }
  });

  const gridByEventRaceCodeCar = new Map();
  for (const entry of stagedGrids) {
    const { event, code, label } = entry;
    const eventId = `event_gb3_${year}_r${event.round}_${slug(event.venue)}`;
    const evidenceId = `source_gb3_2021_${event.eventId}_${code}_bf3_pdf`;
    const assetId = `asset_gb3_${year}_${event.eventId}_${code}_pdf`;

    if (entry.error) {
      importReport.pdfsStagedOnly += 1;
      importReport.gaps.push({
        id: `gap_gb3_2021_${event.eventId}_${code}_grid_pdf_unavailable`,
        scope: 'gb3_2021',
        status: 'open',
        description: `TSL event page indicates ${event.venue} ${label.label}, but ${entry.pdfUrl} could not be fetched: ${entry.error.status ?? entry.error.message}.`
      });
      continue;
    }

    const parsedGrid = parseGridRows(entry.text);
    const parserOk = parsedGrid.rows.length >= 10 && parsedGrid.failures.length <= 2;
    const rawTextPath = relative(entry.textPath);
    const rawPdfPath = relative(entry.pdfPath);

    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceType: 'official_pdf',
      sourceName: `GB3 2021 ${event.venue} ${label.label} PDF`,
      url: entry.pdfUrl,
      retrievedAt,
      publishedAt: parsePrintedDate(entry.text),
      coverage: `${event.venue} ${label.label} official TSL grid rows.`,
      rawArtifactPath: rawPdfPath,
      notes: `Text extraction: ${rawTextPath}. Source report label: ${entry.text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? 'unknown'}.`
    }));

    upsert(mediaAssets, {
      id: assetId,
      assetType: 'pdf',
      title: `GB3 ${year} ${event.venue} ${label.label} timing PDF`,
      url: entry.pdfUrl,
      rightsStatus: 'link_only',
      publishedAt: parsePrintedDate(entry.text),
      eventId,
      sessionId: sessionIdFor(event, label.raceCode),
      driverId: null,
      summary: `Official TSL grid PDF for ${event.venue} ${label.label}.`,
      quoteText: null,
      provenanceRefs: [`source_gb3_2021_${event.eventId}_event_page`, evidenceId]
    });
    importReport.mediaAssetsImported += 1;

    importReport.parserValidation.push({
      event: event.venue,
      eventId: event.eventId,
      code,
      label: label.label,
      sessionType: 'grid',
      rowCount: parsedGrid.rows.length,
      parserFailures: parsedGrid.failures.length,
      scheduledStart: null,
      flagAt: null,
      endedAt: null,
      weather: { ambientConditionRaw: null, trackConditionRaw: null },
      parserOk
    });

    if (!parserOk) {
      importReport.pdfsStagedOnly += 1;
      importReport.gaps.push({
        id: `gap_gb3_2021_${event.eventId}_${code}_grid_parser`,
        scope: 'gb3_2021',
        status: 'open',
        description: `GB3 2021 ${event.venue} ${label.label} PDF was fetched and text-extracted, but parser confidence was insufficient for canonical grid import.`
      });
      continue;
    }

    for (const row of parsedGrid.rows) {
      gridByEventRaceCodeCar.set(`${event.eventId}:${label.raceCode}:${row.carNumber}`, {
        ...row,
        sourceEvidenceId: evidenceId,
        gridPdfCode: code,
        gridLabel: label.label,
        rawTextPath
      });
    }
    importReport.gridPdfsImported += 1;
  }

  const staged = await mapLimit(sessionEntries, concurrency, async (entry) => {
    const { event, code } = entry;
    const label = sessionLabels[code];
    const pdfUrl = sessionPdfUrl(event.eventId, code);
    const fileBase = `${event.eventId}-${code}-bf3`;
    const pdfPath = join(rawDir, `${fileBase}.pdf`);
    const textPath = join(rawDir, `${fileBase}.txt`);
    try {
      const pdf = await fetchBinaryCached(pdfUrl, pdfPath);
      importReport[pdf.fromCache ? 'cached' : 'fetched'] += 1;
      importReport.rawArtifacts.push(relative(pdfPath));
      const text = await pdfToTextCached(pdfPath, textPath);
      if (text.fromCache) importReport.cached += 1;
      importReport.rawArtifacts.push(relative(textPath));
      return { ...entry, label, pdfUrl, pdfPath, textPath, text: text.payload, error: null };
    } catch (error) {
      return { ...entry, label, pdfUrl, pdfPath, textPath, text: null, error };
    }
  });

  for (const entry of staged) {
    const { event, code, label } = entry;
    const eventId = `event_gb3_${year}_r${event.round}_${slug(event.venue)}`;
    const sessionId = sessionIdFor(event, code);
    const evidenceId = `source_gb3_2021_${event.eventId}_${code}_bf3_pdf`;
    const assetId = `asset_gb3_${year}_${event.eventId}_${code}_pdf`;

    if (entry.error) {
      importReport.pdfsStagedOnly += 1;
      importReport.gaps.push({
        id: `gap_gb3_2021_${event.eventId}_${code}_pdf_unavailable`,
        scope: 'gb3_2021',
        status: 'open',
        description: `TSL event page indicates ${event.venue} ${label.label}, but ${entry.pdfUrl} could not be fetched: ${entry.error.status ?? entry.error.message}.`
      });
      continue;
    }

    const times = parseTimes(entry.text);
    const weather = parseWeatherTrack(entry.text);
    const parsed = parseClassificationRows(entry.text, label.type);
    const parserOk = parsed.rows.length >= 10 && parsed.failures.length <= 2 && Boolean(times.scheduledStart);
    const rawTextPath = relative(entry.textPath);
    const rawPdfPath = relative(entry.pdfPath);

    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceType: 'official_pdf',
      sourceName: `GB3 2021 ${event.venue} ${label.label} PDF`,
      url: entry.pdfUrl,
      retrievedAt,
      publishedAt: times.printedDate,
      coverage: `${event.venue} ${label.label} official TSL classification rows and session report metadata.`,
      rawArtifactPath: rawPdfPath,
      notes: `Text extraction: ${rawTextPath}. Source report label: ${entry.text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? 'unknown'}.`
    }));

    upsert(mediaAssets, {
      id: assetId,
      assetType: 'pdf',
      title: `GB3 ${year} ${event.venue} ${label.label} timing PDF`,
      url: entry.pdfUrl,
      rightsStatus: 'link_only',
      publishedAt: times.printedDate,
      eventId,
      sessionId: parserOk ? sessionId : null,
      driverId: null,
      summary: `Official TSL timing PDF for ${event.venue} ${label.label}.`,
      quoteText: null,
      provenanceRefs: [entry.eventEvidenceId, evidenceId]
    });
    importReport.mediaAssetsImported += 1;

    importReport.parserValidation.push({
      event: event.venue,
      eventId: event.eventId,
      code,
      label: label.label,
      sessionType: label.type,
      rowCount: parsed.rows.length,
      parserFailures: parsed.failures.length,
      scheduledStart: times.scheduledStart,
      flagAt: times.flagAt,
      endedAt: times.endedAt,
      weather,
      parserOk
    });

    if (!parserOk) {
      importReport.pdfsStagedOnly += 1;
      importReport.gaps.push({
        id: `gap_gb3_2021_${event.eventId}_${code}_parser`,
        scope: 'gb3_2021',
        status: 'open',
        description: `GB3 2021 ${event.venue} ${label.label} PDF was fetched and text-extracted, but parser confidence was insufficient for canonical row import.`
      });
      continue;
    }

    const track = tracks.get(event.trackId);
    const weatherId = `weather_gb3_2021_${event.eventId}_${code}_official_conditions`;
    if (weather.ambientConditionRaw || weather.trackConditionRaw) {
      upsert(weatherObservations, {
        id: weatherId,
        trackId: event.trackId,
        sessionId,
        observedAt: times.scheduledStart,
        source: 'TSL official classification weather/track line',
        stationId: 'official_session_report',
        latitude: track?.latitude ?? null,
        longitude: track?.longitude ?? null,
        distanceFromTrackKm: 0,
        ambientTempC: null,
        ambientConditionRaw: weather.ambientConditionRaw,
        trackTempC: null,
        trackTempSource: null,
        trackCondition: normalizeTrackCondition(weather.trackConditionRaw),
        trackConditionRaw: weather.trackConditionRaw,
        gripLevel: 'unknown',
        airDensityKgM3: null,
        relativeHumidityPct: null,
        dewPointC: null,
        windSpeedKph: null,
        windGustKph: null,
        windDirectionDeg: null,
        precipitationMm: null,
        precipitationType: null,
        pressureHpa: null,
        cloudCoverPct: null,
        wetDry: normalizeTrackCondition(weather.trackConditionRaw),
        confidence: 'official',
        timeWindowStart: times.scheduledStart,
        timeWindowEnd: times.scheduledStart,
        timeWindowReason: 'exact_session_report',
        trackCoordinateSource: 'track_metadata',
        weatherSourceType: 'series_report',
        timeConfidence: 'high',
        locationConfidence: 'track_exact',
        joinNotes: 'Official TSL classification weather/track condition. Coordinates identify the circuit from the canonical track metadata row.',
        provenanceRefs: [evidenceId]
      });
      importReport.weatherObservationsImported += 1;
    }

    upsert(sessions, {
      id: sessionId,
      eventId,
      sessionType: label.type,
      sessionName: label.label,
      raceNumber: label.raceNumber,
      scheduledStart: times.scheduledStart,
      actualStart: null,
      timezone: event.timezone,
      timePrecision: 'local_datetime',
      timeSource: 'official_tsl_classification_start',
      flagAt: times.flagAt,
      endedAt: times.endedAt,
      lapsScheduled: label.type === 'race' ? Math.max(...parsed.rows.map((row) => row.lapsCompleted ?? 0)) || null : null,
      distanceScheduled: null,
      status: /provisional/i.test(entry.text) ? 'provisional' : 'official',
      officialSessionId: `${event.eventId}${code}bf3`,
      weatherObservationRefs: weather.ambientConditionRaw || weather.trackConditionRaw ? [weatherId] : [],
      ingestionState: 'official_pdf',
      broadcastRouteRefs: [],
      notificationRefs: [],
      raw: {
        sourceSeriesName: entry.text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? null,
        sourceSessionTitle: entry.text.split(/\r?\n/).find((line) => /CLASSIFICATION/i.test(line))?.trim() ?? null,
        tslEventId: event.eventId,
        tslPdfCode: code,
        pdfUrl: entry.pdfUrl,
        textArtifactPath: rawTextPath,
        printedDate: times.printedDate,
        ambientConditionRaw: weather.ambientConditionRaw,
        trackConditionRaw: weather.trackConditionRaw
      },
      provenanceRefs: [entry.eventEvidenceId, evidenceId]
    });
    importReport.pdfsImported += 1;
    importReport.sessionsImported += 1;

    const fieldSize = parsed.rows.length;
    for (const row of parsed.rows) {
      const driverId = driverIdFor(row.driverName);
      const teamId = teamIdFor(row.team);
      const carId = carIdFor(row.team, row.carNumber);

      upsert(drivers, {
        id: driverId,
        displayName: row.driverName.replace(/\b([A-Z]+)\b/g, (match) => match[0] + match.slice(1).toLowerCase()),
        givenName: null,
        familyName: null,
        nationality: row.nationalityCode === 'USA' ? 'United States' : null,
        hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null,
        dateOfBirth: null,
        externalIds: {
          gb3_2021_name: row.driverName,
          gb3_2021_nationalityCode: row.nationalityCode
        },
        provenanceRefs: [evidenceId]
      });

      upsert(teams, {
        id: teamId,
        name: row.team || 'Unknown Team',
        seriesIds: [seriesId],
        country: null,
        officialWebsite: null,
        provenanceRefs: [evidenceId]
      });

      upsert(cars, {
        id: carId,
        seriesId,
        seasonYear: year,
        chassis: null,
        engine: null,
        tireSupplier: null,
        class: 'GB3',
        carNumber: row.carNumber,
        entrant: row.team || 'Unknown Team',
        teamId,
        liveryNotes: null,
        provenanceRefs: [evidenceId]
      });

      const resultId = `result_gb3_${year}_${event.eventId}_${code}_${driverId}`;
      const gridEvidence = label.type === 'race'
        ? gridByEventRaceCodeCar.get(`${event.eventId}:${code}:${row.carNumber}`) ?? null
        : null;
      const gridPosition = gridEvidence?.gridPosition ?? null;
      const gridProvenanceRefs = gridEvidence ? [gridEvidence.sourceEvidenceId] : [];
      upsert(results, {
        id: resultId,
        sessionId,
        driverId,
        teamId,
        carId,
        carNumber: row.carNumber,
        class: 'GB3',
        gridPosition,
        startPosition: gridPosition,
        finishPosition: row.position,
        classifiedPosition: row.position,
        finishPercentile: row.position && fieldSize ? Number(((fieldSize - row.position + 1) / fieldSize).toFixed(4)) : null,
        fieldSize,
        lapsCompleted: row.lapsCompleted,
        lapsScheduled: label.type === 'race' ? Math.max(...parsed.rows.map((item) => item.lapsCompleted ?? 0)) || null : null,
        lapsLed: null,
        points: null,
        status: statusCategory(row.positionRaw),
        statusRaw: String(row.positionRaw ?? ''),
        totalTime: row.totalTime,
        gapToLeader: row.gapToLeader,
        gapToAhead: row.gapToAhead,
        averageSpeed: row.averageSpeed,
        bestLapTime: row.bestLapTime,
        bestLapNumber: row.bestLapNumber,
        bestLapRank: null,
        pitStops: null,
        penaltyRefs: [],
        incidentRefs: [],
        sourceResultId: `${event.eventId}${code}bf3:${row.carNumber}`,
        resultGrain: 'driver',
        raw: {
          sourceSeriesName: '2021 BRDC British F3 Championship',
          nationalityCode: row.nationalityCode,
          tslPositionRaw: row.positionRaw,
          tslPdfCode: code,
          sessionReportAverageMph: row.averageSpeed,
          ...(gridEvidence ? {
            gridEvidence: {
              source: 'official_tsl_grid_pdf',
              gridSourceEvidenceId: gridEvidence.sourceEvidenceId,
              gridPdfCode: gridEvidence.gridPdfCode,
              gridLabel: gridEvidence.gridLabel,
              startPosition: gridPosition
            }
          } : {})
        },
        provenanceRefs: Array.from(new Set([evidenceId, ...gridProvenanceRefs]))
      });
      importReport.resultsImported += 1;
      if (gridEvidence) importReport.gridPositionsImported += 1;
      if (driverId === 'driver_bryce_aron') importReport.bryceResultsImported += 1;

      if (label.type === 'qualifying') {
        upsert(qualifyingResults, {
          id: `qualifying_gb3_${year}_${event.eventId}_${code}_${driverId}`,
          sessionId,
          driverId,
          teamId,
          carId,
          position: row.position,
          bestLapTime: row.bestLapTime,
          gapToPole: row.gapToLeader,
          laps: row.lapsCompleted,
          sessionSegment: label.label,
          penaltyApplied: false,
          gridPositionResulting: null,
          raw: {
            carNumber: row.carNumber,
            nationalityCode: row.nationalityCode,
            interval: row.gapToAhead,
            averageSpeedMph: row.averageSpeed,
            bestLapNumber: row.bestLapNumber
          },
          provenanceRefs: [evidenceId]
        });
        importReport.qualifyingResultsImported += 1;
      }
    }
  }

  const bryceGb3RaceResults = Array.from(results.values()).filter((row) => {
    const session = sessions.get(row.sessionId);
    return row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith(`session_gb3_${year}_`) && session?.sessionType === 'race';
  });
  const bryceTeamIds = Array.from(new Set(bryceGb3RaceResults.map((row) => row.teamId).filter(Boolean)));
  const bryceCarIds = Array.from(new Set(bryceGb3RaceResults.map((row) => row.carId).filter(Boolean)));
  upsert(seasons, {
    id: seasonId,
    year,
    seriesId,
    driverId: 'driver_bryce_aron',
    teamIds: bryceTeamIds,
    carIds: bryceCarIds,
    championshipPosition: bryceStanding?.position ?? null,
    points: bryceStanding?.points ?? null,
    starts: bryceGb3RaceResults.length,
    wins: bryceGb3RaceResults.filter((row) => row.finishPosition === 1).length,
    poles: null,
    podiums: bryceGb3RaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: bryceGb3RaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: bryceGb3RaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: bryceGb3RaceResults.filter((row) => row.status !== 'running').length,
    provenanceRefs: Array.from(new Set([
      ...bryceGb3RaceResults.flatMap((row) => row.provenanceRefs ?? []),
      ...(bryceStanding ? ['source_gb3_2021_official_championship_standings_archive'] : [])
    ])),
    raw: {
      officialStandings: bryceStanding ? {
        sourceOriginalUrl: standingsOriginalUrl,
        sourceArchiveUrl: standingsArchiveUrl,
        position: bryceStanding.position,
        points: bryceStanding.points,
        team: bryceStanding.team
      } : null
    }
  });

  const currentGaps = asArray(existing.gaps).filter((gap) => {
    const id = String(gap.id ?? '');
    const description = String(gap.description ?? '');
    return !id.startsWith('gap_gb3_2021_') && !/GB3 2021/.test(description);
  });
  if (!bryceStanding) {
    currentGaps.push({
      id: 'gap_gb3_2021_championship_points_not_officially_recovered',
      scope: 'gb3_2021',
      status: 'open',
      description: 'The 2021 GB3 session/result PDFs are imported from official TSL/BRSCC sources, but official season championship position and points are not yet normalized from a controlling official standings source.'
    });
  }

  const dataset = {
    schemaVersion: 'bryce-career.v1',
    updatedAt: retrievedAt,
    drivers: Array.from(drivers.values()).sort((a, b) => a.id.localeCompare(b.id)),
    series: Array.from(series.values()).sort((a, b) => a.id.localeCompare(b.id)),
    teams: Array.from(teams.values()).sort((a, b) => a.id.localeCompare(b.id)),
    cars: Array.from(cars.values()).sort((a, b) => a.id.localeCompare(b.id)),
    tracks: Array.from(tracks.values()).sort((a, b) => a.id.localeCompare(b.id)),
    seasons: Array.from(seasons.values()).sort((a, b) => a.id.localeCompare(b.id)),
    events: Array.from(events.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    results: Array.from(results.values()).sort((a, b) => a.id.localeCompare(b.id)),
    qualifyingResults: Array.from(qualifyingResults.values()).sort((a, b) => a.id.localeCompare(b.id)),
    lapSamples: asArray(existing.lapSamples),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: asArray(existing.penalties),
    incidents: asArray(existing.incidents),
    weatherObservations: Array.from(weatherObservations.values()).sort((a, b) => a.id.localeCompare(b.id)),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [...currentGaps, ...importReport.gaps].sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(importReport, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: {
      drivers: dataset.drivers.length,
      teams: dataset.teams.length,
      cars: dataset.cars.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      qualifyingResults: dataset.qualifyingResults.length,
      weatherObservations: dataset.weatherObservations.length,
      sourceEvidence: dataset.sourceEvidence.length,
      gaps: dataset.gaps.length
    },
    importReport
  }, null, 2));
};

if (!(await fileExists(pdftotextPath))) {
  console.error(`Missing pdftotext at ${pdftotextPath}`);
  process.exitCode = 1;
} else {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
