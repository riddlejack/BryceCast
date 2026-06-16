import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/euroformula-2023');
const reportPath = join(root, 'data/career/reports/euroformula-2023-import-report.json');

const year = 2023;
const raceDocumentsUrl = 'https://euroformula.gtsport.es/carreras?year=2023';
const raceResultsApiUrl = 'https://euroformula.gtsport.es/api/race-results?limit=100';
const providedClassificationPdfUrl = 'https://gtsports-media.s3.eu-west-3.amazonaws.com/euroformulaclasgen-9.pdf';
const rfedaFinalClassificationsPdfUrl = 'https://www.rfeda.es/docs/pdf/historico-de-clasificaciones/CLASIFICACIONES AUTOMOVILISMO 2023- FINALES V 18-01-2024.pdf';
const parserName = 'scripts/import-euroformula-2023-career.mjs';

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const retries = Math.max(0, Number(argValue('retries', '2')));
const refresh = process.argv.includes('--refresh');

const eventCatalog = [
  {
    round: 1,
    pdfVenue: 'Portimao',
    eventSlug: 'portimao',
    eventLabel: 'Portimao',
    trackId: 'track_autodromo_internacional_do_algarve',
    trackName: 'Autodromo Internacional do Algarve',
    country: 'Portugal',
    region: 'Algarve',
    city: 'Portimao',
    timezone: 'Europe/Lisbon'
  },
  {
    round: 2,
    pdfVenue: 'Spa-Francorchamps',
    eventSlug: 'spa_francorchamps',
    eventLabel: 'Spa-Francorchamps',
    trackId: 'track_circuit_de_spa_francorchamps',
    trackName: 'Circuit de Spa-Francorchamps',
    country: 'Belgium',
    region: 'Wallonia',
    city: 'Stavelot',
    timezone: 'Europe/Brussels'
  },
  {
    round: 3,
    pdfVenue: 'Hungaroring',
    eventSlug: 'hungaroring',
    eventLabel: 'Hungaroring',
    trackId: 'track_hungaroring',
    trackName: 'Hungaroring',
    country: 'Hungary',
    region: 'Pest',
    city: 'Mogyorod',
    timezone: 'Europe/Budapest'
  },
  {
    round: 4,
    pdfVenue: 'Paul Ricard',
    eventSlug: 'paul_ricard',
    eventLabel: 'Paul Ricard',
    trackId: 'track_circuit_paul_ricard',
    trackName: 'Circuit Paul Ricard',
    country: 'France',
    region: 'Provence-Alpes-Cote d Azur',
    city: 'Le Castellet',
    timezone: 'Europe/Paris'
  },
  {
    round: 5,
    pdfVenue: 'Red Bull Ring',
    eventSlug: 'red_bull_ring',
    eventLabel: 'Red Bull Ring',
    trackId: 'track_red_bull_ring',
    trackName: 'Red Bull Ring',
    country: 'Austria',
    region: 'Styria',
    city: 'Spielberg',
    timezone: 'Europe/Vienna'
  },
  {
    round: 6,
    pdfVenue: 'Monza',
    eventSlug: 'monza',
    eventLabel: 'Monza',
    trackId: 'track_autodromo_nazionale_monza',
    trackName: 'Autodromo Nazionale Monza',
    country: 'Italy',
    region: 'Lombardy',
    city: 'Monza',
    timezone: 'Europe/Rome'
  },
  {
    round: 7,
    pdfVenue: 'Barcelona',
    eventSlug: 'barcelona',
    eventLabel: 'Barcelona',
    trackId: 'track_circuit_de_barcelona_catalunya',
    trackName: 'Circuit de Barcelona-Catalunya',
    country: 'Spain',
    region: 'Catalonia',
    city: 'Montmelo',
    timezone: 'Europe/Madrid'
  }
];

const countryByNat = {
  USA: 'United States',
  DEU: 'Germany',
  JPN: 'Japan',
  ITA: 'Italy',
  MEX: 'Mexico',
  GBR: 'United Kingdom',
  SRB: 'Serbia',
  CZE: 'Czech Republic',
  HUN: 'Hungary',
  AUT: 'Austria',
  BRA: 'Brazil',
  FRA: 'France',
  ESP: 'Spain'
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[^\d.+-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const slug = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const rel = (path) => path.replace(`${root}/`, '');

const clean = (value) =>
  String(value ?? '')
    .replace(/\f/g, '')
    .replace(/\s+/g, ' ')
    .trim();

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
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchBuffer = async (url, attempt = 0) => {
  try {
    const response = await fetch(encodeURI(url), { headers: { accept: '*/*' } });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (attempt >= retries) throw error;
    await sleep(250 * 2 ** attempt);
    return fetchBuffer(url, attempt + 1);
  }
};

const fetchText = async (url, attempt = 0) => {
  try {
    const response = await fetch(encodeURI(url), { headers: { accept: 'text/html,application/json,text/plain,*/*' } });
    if (!response.ok) {
      const error = new Error(`${response.status} ${response.statusText} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return response.text();
  } catch (error) {
    if (attempt >= retries) throw error;
    await sleep(250 * 2 ** attempt);
    return fetchText(url, attempt + 1);
  }
};

const fetchTextCached = async (url, path) => {
  if (!refresh) {
    const cached = await readTextIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }
  const payload = await fetchText(url);
  await writeFile(path, payload);
  return { payload, fromCache: false };
};

const fetchJsonCached = async (url, path) => {
  if (!refresh) {
    const cached = await readJsonIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }
  const text = await fetchText(url);
  const payload = JSON.parse(text);
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, fromCache: false };
};

const fetchBinaryCached = async (url, path) => {
  if (!refresh && await fileExists(path)) return { fromCache: true };
  const payload = await fetchBuffer(url);
  await writeFile(path, payload);
  return { fromCache: false };
};

const runCommand = async (command, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} ${args.join(' ')} exited ${code}: ${stderr}`));
    });
  });

const extractTextCached = async (pdfPath, textPath) => {
  if (!refresh) {
    const cached = await readTextIfExists(textPath, null);
    if (cached) return { text: cached, fromCache: true };
  }
  const text = await runCommand('pdftotext', ['-layout', pdfPath, '-']);
  await writeFile(textPath, text);
  return { text, fromCache: false };
};

const mergeValue = (current, next) => {
  if (next === null || next === undefined || next === '') return current;
  if (Array.isArray(current) || Array.isArray(next)) {
    return Array.from(new Set([...(asArray(current)), ...(asArray(next))]));
  }
  if (current && next && typeof current === 'object' && typeof next === 'object') {
    return { ...current, ...next };
  }
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

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: parserName,
  licenseNotes: 'Public official Euroformula/GT Sport, RFEDA, and Cronococa timing/source documents; store extracted facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: parserName,
  rawArtifactPath,
  notes
});

const normalizeRenderedHtml = (html) =>
  html
    .replace(/\\u002F/g, '/')
    .replace(/\\"/g, '"')
    .replace(/\\u0026/g, '&');

const parseRfedaEuroformulaStanding = (text, driverName) => {
  const sectionStart = text.search(/EUROPEAN\s+F[,.]?\s+OPEN/i);
  if (sectionStart < 0) return null;
  const section = text.slice(sectionStart, sectionStart + 2000);
  const driverPattern = driverName.replace(/\s+/g, '\\s+');
  const match = section.match(new RegExp(`(\\d+)\\s*º?\\s+${driverPattern}\\s+(\\d+(?:[,.]\\d+)?)`, 'i'));
  if (!match) return null;
  return {
    championshipPosition: Number(match[1]),
    points: safeNumber(match[2]),
    rawSection: clean(section.slice(0, 700))
  };
};

const sessionFromFilename = (filename) => {
  const match = filename.match(/^(Qualifying|Race\s+(\d+))\s+-\s+(.+)\.pdf$/i);
  if (!match) return null;
  const venue = match[3].trim();
  const event = eventCatalog.find((row) => row.pdfVenue === venue);
  if (!event) return null;
  const isQualifying = /^Qualifying$/i.test(match[1]);
  const raceNumber = isQualifying ? null : Number(match[2]);
  const sessionSlug = `${String(event.round).padStart(2, '0')}-${event.eventSlug}-${isQualifying ? 'qualifying' : `race-${raceNumber}`}`;
  return {
    ...event,
    filename,
    sessionSlug,
    sessionType: isQualifying ? 'qualifying' : 'race',
    sessionName: isQualifying ? 'Qualifying' : `Race ${raceNumber}`,
    raceNumber
  };
};

const discoverPdfDocs = (html) => {
  const normalized = normalizeRenderedHtml(html);
  const urls = [...new Set([...normalized.matchAll(/https:\/\/gtsports-media\.s3\.eu-west-3\.amazonaws\.com\/[^"\\<>]+?\.pdf/g)].map((match) => match[0]))];
  const docs = [];
  for (const url of urls) {
    const filename = decodeURIComponent(url.split('/').pop()).replace(/\+/g, ' ');
    const session = sessionFromFilename(filename);
    if (!session) continue;
    docs.push({ ...session, url });
  }
  return docs.sort((left, right) => {
    if (left.round !== right.round) return left.round - right.round;
    if (left.sessionType !== right.sessionType) return left.sessionType === 'qualifying' ? -1 : 1;
    return (left.raceNumber ?? 0) - (right.raceNumber ?? 0);
  });
};

const parseHeader = (line) => {
  const catIndex = line.indexOf('Cat');
  const teamIndex = line.indexOf('Team');
  const bestIndex = line.indexOf('Best');
  return {
    clas: line.indexOf('Clas'),
    no: line.indexOf('N'),
    driver: line.indexOf('Driver'),
    nat: line.indexOf('Nat'),
    cat: catIndex,
    catClas: catIndex >= 0 ? line.indexOf('Clas', catIndex + 1) : -1,
    team: teamIndex,
    teamNat: teamIndex >= 0 ? line.indexOf('Nat', teamIndex + 1) : -1,
    vehicle: line.indexOf('Vehicle'),
    laps: line.indexOf('Laps'),
    totalTime: line.indexOf('Total Time'),
    gap: line.indexOf('Gap'),
    interval: line.indexOf('Interval'),
    kmh: line.indexOf('Km/h'),
    best: bestIndex,
    bestTime: bestIndex >= 0 ? line.indexOf('Time', bestIndex + 1) : -1,
    bestKmh: bestIndex >= 0 ? line.indexOf('Km/h', bestIndex + 1) : -1
  };
};

const sliceBy = (line, start, end) => {
  if (start < 0) return '';
  return clean(line.slice(start, end >= 0 ? end : undefined));
};

const isUsableHeader = (line) =>
  line.includes('Clas') &&
  line.includes('Driver') &&
  line.includes('Team') &&
  line.includes('Vehicle') &&
  line.includes('Laps');

const parseDate = (text) => {
  const match = text.match(/\b(\d{2})\/(\d{2})\/(2023)\s+Page\b/);
  if (!match) return null;
  const [, day, month, parsedYear] = match;
  return `${parsedYear}-${month}-${day}`;
};

const parseTimeOfDayMs = (value) => {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  return Number(hours) * 60 * 60 * 1000 + Number(minutes) * 60 * 1000 + Number(seconds) * 1000 + Number(milliseconds);
};

const parseSessionElapsedMs = (value) => {
  const match = String(value ?? '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  return (hours ? Number(hours) * 60 * 60 * 1000 : 0) + Number(minutes) * 60 * 1000 + Number(seconds) * 1000 + Number(milliseconds);
};

const formatLocalTimeFromMs = (value) => {
  const hours = Math.floor(value / (60 * 60 * 1000));
  const afterHours = value - hours * 60 * 60 * 1000;
  const minutes = Math.floor(afterHours / (60 * 1000));
  const afterMinutes = afterHours - minutes * 60 * 1000;
  const seconds = Math.floor(afterMinutes / 1000);
  const milliseconds = afterMinutes - seconds * 1000;
  const base = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return milliseconds ? `${base}.${String(milliseconds).padStart(3, '0')}` : base;
};

const localDateTime = (date, time) => (date && time ? `${date}T${time}` : null);

const parseSessionStartInference = (text, sessionDate) => {
  const lines = text.split(/\r?\n/);
  const samples = [];
  let inFastestLapsSequence = false;

  for (const line of lines) {
    if (/Lap\s+Time of Day\s+Session Time/i.test(line)) {
      inFastestLapsSequence = true;
      continue;
    }
    if (!inFastestLapsSequence) continue;
    if (!line.trim() && samples.length) break;

    const match = line.match(/^\s*\d+\s+(\d{1,2}:\d{2}:\d{2}\.\d{3})\s+((?:(?:\d+):)?\d{1,2}:\d{2}\.\d{3})\s/);
    if (!match) continue;

    const timeOfDayMs = parseTimeOfDayMs(match[1]);
    const elapsedMs = parseSessionElapsedMs(match[2]);
    if (timeOfDayMs === null || elapsedMs === null) continue;
    const inferredStartMs = timeOfDayMs - elapsedMs;
    if (inferredStartMs < 0 || inferredStartMs >= 24 * 60 * 60 * 1000) continue;
    samples.push({
      timeOfDay: match[1],
      sessionTime: match[2],
      inferredStartTime: formatLocalTimeFromMs(inferredStartMs)
    });
  }

  const uniqueStarts = Array.from(new Set(samples.map((sample) => sample.inferredStartTime))).sort();
  return {
    actualStart: uniqueStarts.length === 1 ? localDateTime(sessionDate, uniqueStarts[0]) : null,
    sampleCount: samples.length,
    uniqueStartCount: uniqueStarts.length,
    inferredStartTimes: uniqueStarts,
    samples: samples.slice(0, 5),
    method: 'time_of_day_minus_session_time'
  };
};

const parseConditions = (text) => {
  const match = text.match(/Track Temp:\s*([\d.]+)\s*C\s+Air Temp:\s*([\d.]+)\s*C\s+Humidity:\s*([\d.]+)\s*%\s+Track Status:\s*([A-Z]+)/s);
  return {
    trackTempC: match ? safeNumber(match[1]) : null,
    airTempC: match ? safeNumber(match[2]) : null,
    humidityPct: match ? safeNumber(match[3]) : null,
    trackStatus: match ? String(match[4]).toLowerCase() : null
  };
};

const parseDriverName = (value) =>
  clean(value)
    .replace(/\s+a\s+/g, ' a ')
    .replace(/\s+$/g, '');

const splitGapInterval = (value) => {
  const text = clean(value);
  if (!text) return { gap: null, interval: null };
  const wideSplit = text.split(/\s{2,}/).map(clean).filter(Boolean);
  if (wideSplit.length >= 2) return { gap: wideSplit[0], interval: wideSplit.slice(1).join(' ') };

  const lapsMatch = text.match(/^(.+?\s+Laps?)\s+(.+)$/i);
  if (lapsMatch) return { gap: clean(lapsMatch[1]), interval: clean(lapsMatch[2]) };

  const timeMatch = text.match(/^([+-]?\d+(?:\.\d+)?|\d+:\d+(?:\.\d+)?)\s+(.+)$/);
  if (timeMatch) return { gap: clean(timeMatch[1]), interval: clean(timeMatch[2]) };

  return { gap: text, interval: null };
};

const parseRaceTail = (tail) => {
  const text = clean(tail);
  if (!text) {
    return {
      laps: null,
      totalTime: null,
      gap: null,
      interval: null,
      averageSpeedKph: null,
      bestLapNumber: null,
      bestLapTime: null,
      bestLapKph: null
    };
  }
  const match = text.match(/^(\d+)\s+(\S+)\s*(.*?)\s+([\d.]+)\s+(\d+)\s+([0-9:.]+)\s+([\d.]+)$/);
  if (!match) {
    return {
      laps: null,
      totalTime: null,
      gap: null,
      interval: null,
      averageSpeedKph: null,
      bestLapNumber: null,
      bestLapTime: null,
      bestLapKph: null,
      tailParseFailure: text
    };
  }
  const [, laps, totalTime, gapInterval, averageSpeedKph, bestLapNumber, bestLapTime, bestLapKph] = match;
  const gapParts = splitGapInterval(gapInterval);
  return {
    laps: safeNumber(laps),
    totalTime: clean(totalTime),
    gap: gapParts.gap,
    interval: gapParts.interval,
    averageSpeedKph: safeNumber(averageSpeedKph),
    bestLapNumber: safeNumber(bestLapNumber),
    bestLapTime: clean(bestLapTime),
    bestLapKph: safeNumber(bestLapKph)
  };
};

const parseQualifyingTail = (tail) => {
  const text = clean(tail);
  const match = text.match(/^(\d+)\s+(\d+)\s+([0-9:.]+)\s*(.*?)\s+([\d.]+)$/);
  if (!match) {
    return {
      laps: null,
      totalTime: null,
      gap: null,
      interval: null,
      averageSpeedKph: null,
      bestLapNumber: null,
      bestLapTime: null,
      bestLapKph: null,
      tailParseFailure: text
    };
  }
  const [, laps, bestLapNumber, bestLapTime, gapInterval, averageSpeedKph] = match;
  const gapParts = splitGapInterval(gapInterval);
  return {
    laps: safeNumber(laps),
    totalTime: null,
    gap: gapParts.gap,
    interval: gapParts.interval,
    averageSpeedKph: safeNumber(averageSpeedKph),
    bestLapNumber: safeNumber(bestLapNumber),
    bestLapTime: clean(bestLapTime),
    bestLapKph: safeNumber(averageSpeedKph)
  };
};

const parseRowFromLine = (line, columns, shape, notClassified = false) => {
  const match = line.match(/^\s*(?:(\d+)\s+)?(\d+)\s+(.+?)\s+([A-Z]{3})\s+(?:(R|GC)(?:\s+(\d+))?\s+)?(.+?)\s+([A-Z]{3})\s+(Dallara F320\s+(?:Spiess|HWA))\s*(.*)$/);
  if (!match) return null;
  const [, parsedPosition, carNumber, driverName, nationalityCode, category, categoryPosition, team, teamCountryCode, vehicle, tail] = match;
  const tailValues = shape === 'qualifying' ? parseQualifyingTail(tail) : parseRaceTail(tail);
  const row = {
    position: notClassified ? null : safeNumber(parsedPosition),
    carNumber: clean(carNumber),
    driverName: parseDriverName(driverName),
    nationalityCode: clean(nationalityCode),
    category: clean(category),
    categoryPosition: safeNumber(categoryPosition),
    team: clean(team),
    teamCountryCode: clean(teamCountryCode),
    vehicle: clean(vehicle),
    ...tailValues,
    notClassified,
    tailRaw: clean(tail)
  };

  if (!row.carNumber || !row.driverName || !/^\d+$/.test(row.carNumber)) return null;
  if (!notClassified && row.position === null) return null;
  return row;
};

const parseClassificationRows = (text) => {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex(isUsableHeader);
  if (headerIndex < 0) return { rows: [], failure: 'No usable classification header found.' };
  const columns = parseHeader(lines[headerIndex]);
  const shape = columns.totalTime >= 0 ? 'race' : 'qualifying';
  const requiredColumns = shape === 'race'
    ? ['clas', 'no', 'driver', 'nat', 'cat', 'catClas', 'team', 'teamNat', 'vehicle', 'laps', 'totalTime', 'gap', 'interval', 'kmh', 'best', 'bestTime', 'bestKmh']
    : ['clas', 'no', 'driver', 'nat', 'cat', 'catClas', 'team', 'teamNat', 'vehicle', 'laps', 'best', 'bestTime', 'gap', 'interval', 'kmh'];
  if (requiredColumns.some((key) => columns[key] < 0)) {
    return { rows: [], failure: `Incomplete classification header columns: ${lines[headerIndex]}` };
  }

  const rows = [];
  let notClassified = false;
  for (const line of lines.slice(headerIndex + 1)) {
    if (/^\s*Provisional Results by Category/i.test(line) || /^\s*Results by Category/i.test(line)) break;
    if (/Fastest lap|Published at:|\* PENALTIES/i.test(line)) break;
    if (/Not classified:/i.test(line)) {
      notClassified = true;
      continue;
    }
    if (!line.trim()) continue;

    const row = parseRowFromLine(line, columns, shape, notClassified);
    if (row) rows.push(row);
  }

  return { rows, failure: rows.length ? null : 'No classification rows parsed from first table.' };
};

const parsePositionChartGridPositions = (text) => {
  const lines = text.split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /\bNr\b/.test(line) && /\bPos\b/.test(line) && /\bGrid\b/.test(line));
  if (headerIndex < 0) return new Map();

  const gridByCarNumber = new Map();
  for (const line of lines.slice(headerIndex + 1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/Page|\f|Graphic Lap Chart|Pit Stop/i.test(trimmed)) break;

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;
    const position = safeNumber(parts[1]);
    const gridCarNumber = clean(parts[2]);
    if (position !== null && /^\d+$/.test(gridCarNumber)) {
      gridByCarNumber.set(gridCarNumber, position);
    }
  }

  return gridByCarNumber;
};

const timeToSeconds = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const parts = text.split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
};

const driverIdFor = (name) => (/^bryce\s+aron$/i.test(name) ? 'driver_bryce_aron' : `driver_${slug(name)}`);

const statusForRaceRow = (row) => {
  if (row.notClassified) return 'dnf';
  return row.position ? 'running' : 'unknown';
};

const gapForQualifying = (row) => (row.position === 1 ? null : row.gap || null);

const isEuroformula2023SourceRef = (ref) =>
  String(ref ?? '').startsWith('source_euroformula_2023_') ||
  [
    'source_euroformula_race_results_api_probe',
    'source_euroformula_supplied_classification_pdf_current'
  ].includes(String(ref ?? ''));

const hasOnlyEuroformula2023Provenance = (row) => {
  const refs = asArray(row.provenanceRefs);
  return refs.length > 0 && refs.every(isEuroformula2023SourceRef);
};

const buildParserPlan = (parseFailures) => [
  'Use the cached PDF and text artifacts under data/career/raw/euroformula-2023/ as the source of truth.',
  'For each failed session, inspect the first Clas/Driver/Team/Vehicle header and adjust fixed-column slicing for that PDF family.',
  'Keep the first table only; ignore duplicate category, fastest-lap, distance, and lap-analysis sections unless adding lapSamples in a later pass.',
  `Current failed sessions: ${parseFailures.map((failure) => failure.sessionSlug).join(', ') || 'none'}.`
];

const main = async () => {
  await mkdir(join(rawDir, 'pdf'), { recursive: true });
  await mkdir(join(rawDir, 'text'), { recursive: true });
  await mkdir(join(rawDir, 'api'), { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const retrievedAt = new Date().toISOString();
  const report = {
    checkedAt: retrievedAt,
    year,
    refresh,
    imported: false,
    fetched: 0,
    cached: 0,
    officialRaceDocumentsUrl: raceDocumentsUrl,
    raceResultsApiUrl,
    providedClassificationPdfUrl,
    rfedaFinalClassificationsPdfUrl,
    discoveredDocuments: 0,
    pdfsFetched: 0,
    pdfsCached: 0,
    textExtracted: 0,
    textCached: 0,
    sessionsImported: 0,
    raceSessionsImported: 0,
    qualifyingSessionsImported: 0,
    raceResultsImported: 0,
    qualifyingResultsImported: 0,
    bryceRaceResultsImported: 0,
    bryceQualifyingResultsImported: 0,
    gridPositionsImported: 0,
    sessionStartWindowsImported: 0,
    championshipStandingsImported: 0,
    mediaAssetsImported: 0,
    rawArtifacts: [],
    parseFailures: [],
    sourceFindings: [],
    parserPlan: null,
    gaps: []
  };

  const pagePath = join(rawDir, 'api', 'race-documents-2023.html');
  const apiPath = join(rawDir, 'api', 'race-results-api-limit-100.json');
  const providedPdfPath = join(rawDir, 'pdf', 'provided-euroformulaclasgen-9-current.pdf');
  const providedTextPath = join(rawDir, 'text', 'provided-euroformulaclasgen-9-current.txt');
  const rfedaPdfPath = join(rawDir, 'pdf', 'rfeda-2023-final-classifications.pdf');
  const rfedaTextPath = join(rawDir, 'text', 'rfeda-2023-final-classifications.txt');

  const pageResult = await fetchTextCached(raceDocumentsUrl, pagePath);
  report[pageResult.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(rel(pagePath));

  const apiResult = await fetchJsonCached(raceResultsApiUrl, apiPath);
  report[apiResult.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(rel(apiPath));
  const apiRows2023 = asArray(apiResult.payload.docs).filter((row) => String(row.nombre ?? '').startsWith('2023 '));
  report.sourceFindings.push({
    source: raceResultsApiUrl,
    finding: apiRows2023.length
      ? `Public race-results API returned ${apiRows2023.length} 2023 rows.`
      : 'Public race-results API returned no 2023 rows; official 2023 import uses race-document PDFs instead.'
  });

  const providedPdfResult = await fetchBinaryCached(providedClassificationPdfUrl, providedPdfPath);
  report[providedPdfResult.fromCache ? 'cached' : 'fetched'] += 1;
  report[providedPdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
  report.rawArtifacts.push(rel(providedPdfPath));
  const providedTextResult = await extractTextCached(providedPdfPath, providedTextPath);
  report[providedTextResult.fromCache ? 'textCached' : 'textExtracted'] += 1;
  report.rawArtifacts.push(rel(providedTextPath));
  const providedText = providedTextResult.text;
  const providedLooks2023 = /Bryce\s+Aron|Noel\s+Leon|238\b/.test(providedText) && /2023/.test(providedText);
  if (!providedLooks2023) {
    report.sourceFindings.push({
      source: providedClassificationPdfUrl,
      finding: 'The supplied euroformulaclasgen-9.pdf currently serves a 2026 provisional standings PDF, so it was preserved but not used as a 2023 source.'
    });
    report.gaps.push({
      id: 'gap_euroformula_2023_championship_classification_pdf_current_mismatch',
      scope: 'euroformula_2023',
      status: 'source_broken_preserved',
      description: 'The supplied Euroformula classification PDF URL now serves a 2026 document, so that mutable S3 key is preserved as source-broken evidence. RFEDA 2023 final classifications PDF is the stable official standings source used for Bryce Aron P4 and 238 European F. Open points.',
      provenanceRefs: ['source_euroformula_2023_rfeda_final_classifications_pdf'],
      raw: {
        mutablePdfUrl: providedClassificationPdfUrl,
        stableOfficialPdfUrl: rfedaFinalClassificationsPdfUrl,
        unavailableReason: 'mutable_s3_key_serves_2026_document'
      }
    });
  }

  const rfedaPdfResult = await fetchBinaryCached(rfedaFinalClassificationsPdfUrl, rfedaPdfPath);
  report[rfedaPdfResult.fromCache ? 'cached' : 'fetched'] += 1;
  report[rfedaPdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
  report.rawArtifacts.push(rel(rfedaPdfPath));
  const rfedaTextResult = await extractTextCached(rfedaPdfPath, rfedaTextPath);
  report[rfedaTextResult.fromCache ? 'textCached' : 'textExtracted'] += 1;
  report.rawArtifacts.push(rel(rfedaTextPath));
  const rfedaBryceStanding = parseRfedaEuroformulaStanding(rfedaTextResult.text, 'Bryce Aron');
  if (rfedaBryceStanding) {
    report.championshipStandingsImported += 1;
    report.sourceFindings.push({
      source: rfedaFinalClassificationsPdfUrl,
      finding: `RFEDA 2023 final classifications PDF lists Bryce Aron P${rfedaBryceStanding.championshipPosition} with ${rfedaBryceStanding.points} European F. Open points.`
    });
  } else {
    report.sourceFindings.push({
      source: rfedaFinalClassificationsPdfUrl,
      finding: 'RFEDA 2023 final classifications PDF was cached, but the European F. Open Bryce Aron standings row was not parsed.'
    });
  }

  const docs = discoverPdfDocs(pageResult.payload);
  report.discoveredDocuments = docs.length;
  if (docs.length !== 28) {
    report.parseFailures.push({
      sessionSlug: 'document_discovery',
      reason: `Expected 28 official 2023 Euroformula PDFs from the race-documents page, discovered ${docs.length}.`
    });
  }

  const parsedSessions = [];
  for (const doc of docs) {
    const pdfPath = join(rawDir, 'pdf', `${doc.sessionSlug}.pdf`);
    const textPath = join(rawDir, 'text', `${doc.sessionSlug}.txt`);
    const pdfResult = await fetchBinaryCached(doc.url, pdfPath);
    report[pdfResult.fromCache ? 'cached' : 'fetched'] += 1;
    report[pdfResult.fromCache ? 'pdfsCached' : 'pdfsFetched'] += 1;
    report.rawArtifacts.push(rel(pdfPath));

    const textResult = await extractTextCached(pdfPath, textPath);
    report[textResult.fromCache ? 'textCached' : 'textExtracted'] += 1;
    report.rawArtifacts.push(rel(textPath));

    const { rows, failure } = parseClassificationRows(textResult.text);
    const gridPositions = parsePositionChartGridPositions(textResult.text);
    const sessionDate = parseDate(textResult.text);
    const sessionStartInference = parseSessionStartInference(textResult.text, sessionDate);
    const conditions = parseConditions(textResult.text);
    if (failure) {
      report.parseFailures.push({
        sessionSlug: doc.sessionSlug,
        url: doc.url,
        reason: failure
      });
      continue;
    }
    parsedSessions.push({
      ...doc,
      pdfPath,
      textPath,
      rows,
      gridPositions,
      sessionDate,
      sessionStartInference,
      conditions
    });
  }

  const bryceParsedRaceRows = parsedSessions
    .filter((session) => session.sessionType === 'race')
    .flatMap((session) => session.rows.map((row) => ({ session, row })))
    .filter(({ row }) => /^bryce\s+aron$/i.test(row.driverName));

  if (!bryceParsedRaceRows.length) {
    report.parseFailures.push({
      sessionSlug: 'bryce_race_rows',
      reason: 'No Bryce Aron race rows parsed from official Euroformula PDFs.'
    });
  }

  if (report.parseFailures.length) {
    report.parserPlan = buildParserPlan(report.parseFailures);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ imported: false, report: reportPath, parseFailures: report.parseFailures, parserPlan: report.parserPlan }, null, 2));
    return;
  }

  const existing = await readJsonIfExists(datasetPath, {});
  const sourceEvidenceMap = new Map(asArray(existing.sourceEvidence)
    .filter((row) => !isEuroformula2023SourceRef(row.id))
    .map((row) => [row.id, row]));
  const drivers = new Map(asArray(existing.drivers)
    .filter((row) => !hasOnlyEuroformula2023Provenance(row))
    .map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series)
    .filter((row) => row.id !== 'series_euroformula_open')
    .map((row) => [row.id, row]));
  const teams = new Map(asArray(existing.teams)
    .filter((row) => !hasOnlyEuroformula2023Provenance(row))
    .map((row) => [row.id, row]));
  const cars = new Map(asArray(existing.cars)
    .filter((row) => !String(row.id ?? '').startsWith(`car_euroformula_${year}_`))
    .map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(asArray(existing.seasons)
    .filter((row) => row.id !== `season_euroformula_open_${year}_bryce_aron`)
    .map((row) => [row.id, row]));
  const events = new Map(asArray(existing.events)
    .filter((row) => !String(row.id ?? '').startsWith(`event_euroformula_${year}_`))
    .map((row) => [row.id, row]));
  const sessions = new Map(asArray(existing.sessions)
    .filter((row) => !String(row.id ?? '').startsWith(`session_euroformula_${year}_`))
    .map((row) => [row.id, row]));
  const results = new Map(asArray(existing.results)
    .filter((row) => !String(row.sessionId ?? '').startsWith(`session_euroformula_${year}_`))
    .map((row) => [row.id, row]));
  const qualifyingResults = new Map(asArray(existing.qualifyingResults)
    .filter((row) => !String(row.sessionId ?? '').startsWith(`session_euroformula_${year}_`))
    .map((row) => [row.id, row]));
  const mediaAssets = new Map(asArray(existing.mediaAssets)
    .filter((row) => !String(row.id ?? '').startsWith(`asset_euroformula_${year}_`))
    .map((row) => [row.id, row]));

  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_euroformula_2023_race_documents_page',
    sourceType: 'official_page',
    sourceName: 'Euroformula 2023 race documents page',
    url: raceDocumentsUrl,
    retrievedAt,
    coverage: 'Official GT Sport/Euroformula race-document page for 2023, used to discover per-event qualifying and race PDFs.',
    rawArtifactPath: rel(pagePath),
    notes: 'Historical race-document page is the discovery source because the public race-results API currently exposes no 2023 rows.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_euroformula_race_results_api_probe',
    sourceType: 'official_api',
    sourceName: 'Euroformula public race-results API probe',
    url: raceResultsApiUrl,
    retrievedAt,
    coverage: 'Official API probe for historical race-result rows.',
    rawArtifactPath: rel(apiPath),
    notes: apiRows2023.length
      ? `API returned ${apiRows2023.length} 2023 rows.`
      : 'No 2023 rows returned during this import; PDFs are controlling source for 2023.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_euroformula_supplied_classification_pdf_current',
    sourceType: 'official_pdf',
    sourceName: 'Supplied Euroformula classification PDF URL',
    url: providedClassificationPdfUrl,
    retrievedAt,
    coverage: 'Preserved supplied S3 classification PDF artifact.',
    rawArtifactPath: rel(providedPdfPath),
    notes: providedLooks2023
      ? 'Text looked compatible with 2023 classification.'
      : 'Current artifact text is a 2026 provisional classification, so it is not used for 2023 normalization.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_euroformula_2023_rfeda_final_classifications_pdf',
    sourceType: 'official_pdf',
    sourceName: 'RFEDA 2023 final classifications PDF',
    url: rfedaFinalClassificationsPdfUrl,
    retrievedAt,
    coverage: 'RFEDA historical 2023 final classifications PDF section for European Formula Open drivers and teams.',
    rawArtifactPath: rel(rfedaPdfPath),
    notes: rfedaBryceStanding
      ? `Parsed European F. Open section row for Bryce Aron: P${rfedaBryceStanding.championshipPosition}, ${rfedaBryceStanding.points} points. Text artifact: ${rel(rfedaTextPath)}.`
      : `Cached but did not parse Bryce Aron from the European F. Open section. Text artifact: ${rel(rfedaTextPath)}.`
  }));

  upsert(series, {
    id: 'series_euroformula_open',
    name: 'Euroformula Open',
    category: 'formula',
    ladderLevel: 'European single-seater development championship',
    governingBody: 'GT Sport',
    countryScope: 'Europe',
    officialWebsite: 'https://euroformula.gtsport.es/',
    externalIds: { euroformulaTenant: 'euroformula.gtsport.es' },
    provenanceRefs: ['source_euroformula_2023_race_documents_page']
  });

  upsert(drivers, {
    id: 'driver_bryce_aron',
    displayName: 'Bryce Aron',
    givenName: 'Bryce',
    familyName: 'Aron',
    nationality: 'United States',
    hometown: 'Winnetka, Illinois',
    dateOfBirth: null,
    externalIds: { euroformula2023CarNumber: '23' },
    provenanceRefs: ['source_euroformula_2023_race_documents_page']
  });

  const sessionsByEvent = new Map();
  for (const session of parsedSessions) {
    const eventId = `event_euroformula_${year}_r${session.round}_${session.eventSlug}`;
    if (!sessionsByEvent.has(eventId)) sessionsByEvent.set(eventId, []);
    sessionsByEvent.get(eventId).push(session);

    upsert(tracks, {
      id: session.trackId,
      name: session.trackName,
      canonicalName: session.trackName,
      country: session.country,
      region: session.region,
      city: session.city,
      latitude: null,
      longitude: null,
      timezone: session.timezone,
      trackType: 'road',
      configuration: null,
      lengthKm: null,
      lengthMi: null,
      direction: 'unknown',
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: [session.trackName, session.eventLabel, session.pdfVenue],
      provenanceRefs: ['source_euroformula_2023_race_documents_page']
    });
  }

  for (const event of eventCatalog) {
    const eventId = `event_euroformula_${year}_r${event.round}_${event.eventSlug}`;
    const eventSessions = sessionsByEvent.get(eventId) ?? [];
    const dates = eventSessions.map((session) => session.sessionDate).filter(Boolean).sort();
    upsert(events, {
      id: eventId,
      seriesId: 'series_euroformula_open',
      seasonYear: year,
      name: `Euroformula Open ${year} Round ${event.round} - ${event.eventLabel}`,
      round: event.round,
      eventStartDate: dates[0] ?? null,
      eventEndDate: dates.at(-1) ?? null,
      trackId: event.trackId,
      country: event.country,
      officialEventId: `${year}-${event.eventSlug}`,
      provenanceRefs: ['source_euroformula_2023_race_documents_page']
    });
  }

  for (const parsedSession of parsedSessions) {
    const eventId = `event_euroformula_${year}_r${parsedSession.round}_${parsedSession.eventSlug}`;
    const sessionId = `session_euroformula_${year}_${parsedSession.sessionSlug}`;
    const evidenceId = `source_euroformula_${year}_${parsedSession.sessionSlug}_pdf`;
    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceType: 'official_pdf',
      sourceName: `Euroformula 2023 ${parsedSession.eventLabel} ${parsedSession.sessionName} PDF`,
      url: parsedSession.url,
      retrievedAt,
      coverage: `Official Euroformula ${parsedSession.eventLabel} ${parsedSession.sessionName} classification rows.`,
      rawArtifactPath: rel(parsedSession.pdfPath),
      notes: parsedSession.sessionStartInference.actualStart
        ? `Parsed from the first classification table and, for race sessions, the position-chart Grid column in the Cronococa PDF. Derived actualStart ${parsedSession.sessionStartInference.actualStart} from ${parsedSession.sessionStartInference.sampleCount} internally consistent Fastest Laps Sequence Time of Day minus Session Time samples in the text artifact ${rel(parsedSession.textPath)}.`
        : `Parsed from the first classification table and, for race sessions, the position-chart Grid column in the Cronococa PDF. Fastest Laps Sequence timing rows did not produce a single internally consistent session start in the text artifact ${rel(parsedSession.textPath)}.`
    }));

    upsert(mediaAssets, {
      id: `asset_euroformula_${year}_${parsedSession.sessionSlug}_pdf`,
      assetType: 'pdf',
      title: `Euroformula ${year} ${parsedSession.eventLabel} ${parsedSession.sessionName} results PDF`,
      url: parsedSession.url,
      rightsStatus: 'link_only',
      publishedAt: parsedSession.sessionDate,
      eventId,
      sessionId,
      driverId: null,
      summary: `Official Euroformula ${parsedSession.eventLabel} ${parsedSession.sessionName} timing PDF.`,
      quoteText: null,
      provenanceRefs: [evidenceId]
    });
    report.mediaAssetsImported += 1;

    upsert(sessions, {
      id: sessionId,
      eventId,
      sessionType: parsedSession.sessionType,
      sessionName: parsedSession.sessionName,
      raceNumber: parsedSession.raceNumber,
      scheduledStart: parsedSession.sessionDate,
      actualStart: parsedSession.sessionStartInference.actualStart,
      timezone: parsedSession.timezone,
      lapsScheduled: null,
      distanceScheduled: null,
      status: 'provisional',
      officialSessionId: parsedSession.filename,
      timePrecision: parsedSession.sessionStartInference.actualStart ? 'local_datetime' : 'date_only',
      timeSource: parsedSession.sessionStartInference.actualStart
        ? 'official_cronococa_pdf_time_of_day_minus_session_time'
        : 'official_cronococa_pdf_classification_date',
      weatherObservationRefs: [],
      ingestionState: 'provisional',
      broadcastRouteRefs: [],
      notificationRefs: [],
      raw: {
        pdfFilename: parsedSession.filename,
        pdfUrl: parsedSession.url,
        parser: 'pdftotext -layout first classification table plus position-chart Grid column',
        sessionStartInference: {
          method: parsedSession.sessionStartInference.method,
          sampleCount: parsedSession.sessionStartInference.sampleCount,
          uniqueStartCount: parsedSession.sessionStartInference.uniqueStartCount,
          inferredStartTimes: parsedSession.sessionStartInference.inferredStartTimes,
          sampleRows: parsedSession.sessionStartInference.samples
        },
        conditions: parsedSession.conditions
      },
      provenanceRefs: ['source_euroformula_2023_race_documents_page', evidenceId]
    });
    report.sessionsImported += 1;
    if (parsedSession.sessionStartInference.actualStart) report.sessionStartWindowsImported += 1;
    if (parsedSession.sessionType === 'race') report.raceSessionsImported += 1;
    if (parsedSession.sessionType === 'qualifying') report.qualifyingSessionsImported += 1;

    const fieldSize = parsedSession.rows.length;
    const bestLapRanks = new Map(
      parsedSession.rows
        .map((row) => ({ carNumber: row.carNumber, seconds: timeToSeconds(row.bestLapTime) }))
        .filter((row) => row.seconds !== null && row.seconds > 0)
        .sort((left, right) => left.seconds - right.seconds)
        .map((row, index) => [row.carNumber, index + 1])
    );

    const classSizes = new Map();
    for (const row of parsedSession.rows) {
      const className = row.category || 'Euroformula Open';
      classSizes.set(className, (classSizes.get(className) ?? 0) + 1);
    }

    for (const row of parsedSession.rows) {
      const driverId = driverIdFor(row.driverName);
      const teamId = `team_${slug(row.team || 'unknown_team')}`;
      const carId = `car_euroformula_${year}_${slug(row.team || 'unknown_team')}_${slug(row.carNumber)}`;
      const className = row.category || 'Euroformula Open';

      upsert(drivers, {
        id: driverId,
        displayName: row.driverName,
        givenName: row.driverName.split(/\s+/)[0] ?? null,
        familyName: row.driverName.split(/\s+/).slice(1).join(' ') || null,
        nationality: countryByNat[row.nationalityCode] ?? row.nationalityCode ?? null,
        hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null,
        dateOfBirth: null,
        externalIds: {
          euroformula2023CarNumber: String(row.carNumber),
          euroformulaNationalityCode: row.nationalityCode || null
        },
        provenanceRefs: [evidenceId]
      });

      upsert(teams, {
        id: teamId,
        name: row.team || 'Unknown Team',
        seriesIds: ['series_euroformula_open'],
        country: countryByNat[row.teamCountryCode] ?? row.teamCountryCode ?? null,
        officialWebsite: null,
        provenanceRefs: [evidenceId]
      });

      upsert(cars, {
        id: carId,
        seriesId: 'series_euroformula_open',
        seasonYear: year,
        chassis: row.vehicle?.includes('Dallara F320') ? 'Dallara F320' : row.vehicle || null,
        engine: row.vehicle?.includes('Spiess') ? 'Spiess' : row.vehicle?.includes('HWA') ? 'HWA' : null,
        tireSupplier: 'Hankook',
        class: className,
        carNumber: String(row.carNumber),
        entrant: row.team || 'Unknown Team',
        teamId,
        liveryNotes: null,
        provenanceRefs: [evidenceId]
      });

      if (parsedSession.sessionType === 'race') {
        const finish = row.position;
        const gridPosition = parsedSession.gridPositions.get(row.carNumber) ?? null;
        upsert(results, {
          id: `result_euroformula_${year}_${parsedSession.sessionSlug}_${driverId}`,
          sessionId,
          driverId,
          teamId,
          carId,
          carNumber: String(row.carNumber),
          class: className,
          gridPosition,
          startPosition: gridPosition,
          finishPosition: finish,
          classifiedPosition: finish,
          finishPercentile: finish && fieldSize ? Number(((fieldSize - finish + 1) / fieldSize).toFixed(4)) : null,
          fieldSize,
          classFieldSize: classSizes.get(className) ?? null,
          classFinishPosition: row.categoryPosition,
          classFinishPercentile: row.categoryPosition && classSizes.get(className)
            ? Number(((classSizes.get(className) - row.categoryPosition + 1) / classSizes.get(className)).toFixed(4))
            : null,
          lapsCompleted: row.laps,
          lapsScheduled: null,
          lapsLed: null,
          points: null,
          status: statusForRaceRow(row),
          statusRaw: row.notClassified ? 'not_classified' : 'classified',
          totalTime: row.totalTime || null,
          gapToLeader: row.gap || null,
          gapToAhead: row.interval || null,
          averageSpeed: row.averageSpeedKph,
          bestLapTime: row.bestLapTime || null,
          bestLapNumber: row.bestLapNumber,
          bestLapRank: bestLapRanks.get(row.carNumber) ?? null,
          pitStops: null,
          penaltyRefs: [],
          incidentRefs: [],
          sourceResultId: `${parsedSession.filename}:${row.carNumber}`,
          resultGrain: 'driver',
          raw: {
            category: row.category || null,
            categoryPosition: row.categoryPosition,
            vehicle: row.vehicle || null,
            teamCountryCode: row.teamCountryCode || null,
            nationalityCode: row.nationalityCode || null,
            bestLapKph: row.bestLapKph,
            positionChartGridPosition: gridPosition,
            notClassified: row.notClassified
          },
          provenanceRefs: [evidenceId]
        });
        report.raceResultsImported += 1;
        if (gridPosition !== null) report.gridPositionsImported += 1;
        if (driverId === 'driver_bryce_aron') report.bryceRaceResultsImported += 1;
      } else {
        upsert(qualifyingResults, {
          id: `qualifying_euroformula_${year}_${parsedSession.sessionSlug}_${driverId}`,
          sessionId,
          driverId,
          teamId,
          carId,
          position: row.position,
          bestLapTime: row.bestLapTime || row.totalTime || null,
          gapToPole: gapForQualifying(row),
          laps: row.laps,
          sessionSegment: null,
          penaltyApplied: false,
          gridPositionResulting: null,
          raw: {
            carNumber: row.carNumber,
            category: row.category || null,
            categoryPosition: row.categoryPosition,
            interval: row.interval || null,
            averageSpeedKph: row.averageSpeedKph,
            bestLapNumber: row.bestLapNumber,
            bestLapKph: row.bestLapKph,
            vehicle: row.vehicle || null
          },
          provenanceRefs: [evidenceId]
        });
        report.qualifyingResultsImported += 1;
        if (driverId === 'driver_bryce_aron') report.bryceQualifyingResultsImported += 1;
      }
    }
  }

  const euroformulaRaceResults = Array.from(results.values()).filter((row) => row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith(`session_euroformula_${year}_`));
  const euroformulaQualifyingResults = Array.from(qualifyingResults.values()).filter((row) => row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith(`session_euroformula_${year}_`));
  upsert(seasons, {
    id: `season_euroformula_open_${year}_bryce_aron`,
    year,
    seriesId: 'series_euroformula_open',
    driverId: 'driver_bryce_aron',
    teamIds: Array.from(new Set(euroformulaRaceResults.map((row) => row.teamId).filter(Boolean))),
    carIds: Array.from(new Set(euroformulaRaceResults.map((row) => row.carId).filter(Boolean))),
    championshipPosition: rfedaBryceStanding?.championshipPosition ?? null,
    points: rfedaBryceStanding?.points ?? null,
    starts: euroformulaRaceResults.length,
    wins: euroformulaRaceResults.filter((row) => row.finishPosition === 1).length,
    poles: euroformulaQualifyingResults.filter((row) => row.position === 1).length,
    podiums: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: euroformulaRaceResults.filter((row) => row.status !== 'running').length,
    provenanceRefs: [
      'source_euroformula_2023_race_documents_page',
      ...(rfedaBryceStanding ? ['source_euroformula_2023_rfeda_final_classifications_pdf'] : [])
    ]
  });

  if (!rfedaBryceStanding) {
    report.gaps.push({
      id: 'gap_euroformula_2023_points_and_standings_not_officially_recovered',
      scope: 'euroformula_2023',
      status: 'open',
      description: 'Official 2023 race PDFs were imported, but championship points, final standings position, and race points were left null because the historical official standings PDF/API row was not recovered from a stable 2023 source.'
    });
  }

  const missingGridRows = Array.from(results.values()).filter((row) =>
    String(row.id ?? '').startsWith(`result_euroformula_${year}_`) &&
    row.gridPosition === null
  );
  if (missingGridRows.length > 0) {
    report.gaps.push({
      id: 'gap_euroformula_2023_starting_grid_not_normalized',
      scope: 'euroformula_2023',
      status: 'partial',
      description: `Official Euroformula race PDFs now import position-chart grid positions where parseable, but ${missingGridRows.length} race result rows still lack grid/start positions.`
    });
  }

  const currentGaps = asArray(existing.gaps)
    .filter((gap) => !String(gap.id ?? '').startsWith('gap_euroformula_2023_'))
    .map((gap) => {
      if (String(gap.description ?? '').includes('Euroformula Open')) {
        return {
          ...gap,
          description: String(gap.description)
            .replace('Euroformula Open, ', '')
            .replace('Euroformula Open', '')
            .replace(/\s+,/g, ',')
            .replace(/\s{2,}/g, ' ')
            .trim()
        };
      }
      return gap;
    });

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
    weatherObservations: asArray(existing.weatherObservations),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...currentGaps,
      ...report.gaps
    ]
  };

  report.imported = true;
  report.bryceSeason = {
    championshipPosition: rfedaBryceStanding?.championshipPosition ?? null,
    points: rfedaBryceStanding?.points ?? null,
    starts: euroformulaRaceResults.length,
    wins: euroformulaRaceResults.filter((row) => row.finishPosition === 1).length,
    poles: euroformulaQualifyingResults.filter((row) => row.position === 1).length,
    podiums: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: euroformulaRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: euroformulaRaceResults.filter((row) => row.status !== 'running').length
  };
  report.counts = {
    drivers: dataset.drivers.length,
    series: dataset.series.length,
    teams: dataset.teams.length,
    cars: dataset.cars.length,
    tracks: dataset.tracks.length,
    seasons: dataset.seasons.length,
    events: dataset.events.length,
    sessions: dataset.sessions.length,
    results: dataset.results.length,
    qualifyingResults: dataset.qualifyingResults.length,
    mediaAssets: dataset.mediaAssets.length,
    sourceEvidence: dataset.sourceEvidence.length,
    gaps: dataset.gaps.length
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: report.counts,
    importReport: report
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
