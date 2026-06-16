import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/formula-ford-2020');
const pdfDir = join(rawDir, 'pdf');
const textDir = join(rawDir, 'text');
const eventPagesDir = join(rawDir, 'event-pages');
const extractedPath = join(rawDir, 'extracted-classifications.json');
const reportPath = join(root, 'data/career/reports/formula-ford-2020-import-report.json');

const year = 2020;
const timezone = 'Europe/London';
const sourceLicenseNotes = 'Public official TSL/BRSCC timing PDFs/pages; store extracted facts, source URLs, and page references.';
const refresh = process.argv.includes('--refresh');
const pdftotextBin = process.env.PDFTOTEXT_BIN ?? 'pdftotext';

const sources = [
  {
    id: 'festival',
    eventId: 'event_formula_ford_2020_formula_ford_festival',
    eventName: 'BRSCC Formula Ford Festival 2020',
    eventStartDate: '2020-10-24',
    eventEndDate: '2020-10-25',
    country: 'United Kingdom',
    trackId: 'track_brands_hatch_indy',
    track: {
      id: 'track_brands_hatch_indy',
      name: 'Brands Hatch Indy',
      canonicalName: 'Brands Hatch Indy Circuit',
      country: 'United Kingdom',
      region: 'Kent',
      city: 'West Kingsdown',
      latitude: 51.3569,
      longitude: 0.2631,
      timezone,
      trackType: 'road',
      configuration: 'Indy',
      lengthMi: 1.2079,
      lengthKm: 1.9441,
      direction: 'clockwise',
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Brands Hatch Indy', 'Brands Hatch Indy Circuit']
    },
    url: 'https://brscc.co.uk/wp-content/uploads/2021/04/2020-BRSCC-Formula-Ford-Festival-TSL-Results.pdf',
    pdfPath: join(pdfDir, 'formula-ford-festival-book.pdf'),
    textPath: join(textDir, 'formula-ford-festival-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_festival_book_pdf',
    sourceName: 'BRSCC Formula Ford Festival 2020 TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '204331',
    coverage: 'Official BRSCC/TSL Formula Ford Festival 2020 result book with qualifying, heats, semi-finals, finals, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for Formula Ford Festival classifications. Parser imports classification pages only.'
  },
  {
    id: 'wht',
    eventId: 'event_formula_ford_2020_walter_hayes_trophy',
    eventName: 'Walter Hayes Trophy 2020',
    eventStartDate: '2020-10-31',
    eventEndDate: '2020-11-01',
    country: 'United Kingdom',
    trackId: 'track_silverstone_national',
    track: {
      id: 'track_silverstone_national',
      name: 'Silverstone National',
      canonicalName: 'Silverstone National Circuit',
      country: 'United Kingdom',
      region: 'Northamptonshire',
      city: 'Silverstone',
      latitude: 52.0786,
      longitude: -1.0169,
      timezone,
      trackType: 'road',
      configuration: 'National',
      lengthMi: 1.6404,
      lengthKm: 2.6400,
      direction: 'clockwise',
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Silverstone National', 'Silverstone National Circuit']
    },
    url: 'https://www.tsl-timing.com/file/?f=HSCC/2020/204456wht.pdf',
    pdfPath: join(pdfDir, 'walter-hayes-trophy-book.pdf'),
    textPath: join(textDir, 'walter-hayes-trophy-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_wht_book_pdf',
    sourceName: 'HSCC Walter Hayes Trophy 2020 TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '204456',
    coverage: 'Official TSL Walter Hayes Trophy 2020 result book with qualifying, heats, progression, last chance, semi-final, and final classifications.',
    sourceNotes: 'Primary source for Walter Hayes Trophy classifications. Parser imports classification pages only.'
  },
  {
    id: 'national_oulton_park',
    eventId: 'event_formula_ford_2020_national_oulton_park',
    eventName: 'BRSCC National FF1600 2020 - Oulton Park',
    eventStartDate: '2020-07-18',
    eventEndDate: '2020-07-18',
    country: 'United Kingdom',
    trackId: 'track_oulton_park_international',
    track: {
      id: 'track_oulton_park_international',
      name: 'Oulton Park International',
      canonicalName: 'Oulton Park International Circuit',
      country: 'United Kingdom',
      region: 'Cheshire',
      city: 'Little Budworth',
      latitude: 53.1776,
      longitude: -2.614,
      timezone,
      trackType: 'road',
      configuration: 'International',
      lengthMi: 2.6920,
      lengthKm: 4.3320,
      direction: 'clockwise',
      surface: 'asphalt',
      elevationM: null,
      cornerCount: 17,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Oulton Park', 'Oulton Park International']
    },
    url: 'https://www.tsl-timing.com/file/?f=BRSCC/2020/202931ffn.pdf',
    pdfPath: join(pdfDir, 'national-ff1600-oulton-park-book.pdf'),
    textPath: join(textDir, 'national-ff1600-oulton-park-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_national_oulton_park_book_pdf',
    sourceName: 'BRSCC National FF1600 2020 Oulton Park TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '202931',
    coverage: 'Official TSL/BRSCC Avon Tyres National and Northern Formula Ford Championship Oulton Park result book with qualifying, grids, race classifications, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for 2020 National FF1600 Oulton Park classifications. Parser imports classification and grid pages only.'
  },
  {
    id: 'national_brands_hatch',
    eventId: 'event_formula_ford_2020_national_brands_hatch',
    eventName: 'BRSCC National FF1600 2020 - Brands Hatch',
    eventStartDate: '2020-09-26',
    eventEndDate: '2020-09-27',
    country: 'United Kingdom',
    trackId: 'track_brands_hatch_indy',
    track: {
      id: 'track_brands_hatch_indy',
      name: 'Brands Hatch Indy',
      canonicalName: 'Brands Hatch Indy Circuit',
      country: 'United Kingdom',
      region: 'Kent',
      city: 'West Kingsdown',
      latitude: 51.3569,
      longitude: 0.2631,
      timezone,
      trackType: 'road',
      configuration: 'Indy',
      lengthMi: 1.2079,
      lengthKm: 1.9441,
      direction: 'clockwise',
      surface: 'asphalt',
      elevationM: null,
      cornerCount: 7,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Brands Hatch Indy', 'Brands Hatch Indy Circuit']
    },
    url: 'https://www.tsl-timing.com/file/?f=BRSCC/2020/203931ffn.pdf',
    pdfPath: join(pdfDir, 'national-ff1600-brands-hatch-book.pdf'),
    textPath: join(textDir, 'national-ff1600-brands-hatch-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_national_brands_hatch_book_pdf',
    sourceName: 'BRSCC National FF1600 2020 Brands Hatch TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '203931',
    coverage: 'Official TSL/BRSCC Avon Tyres National and Northern Formula Ford Championship Brands Hatch result book with qualifying, grids, race classifications, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for 2020 National FF1600 Brands Hatch classifications. Parser imports classification and grid pages only.'
  },
  {
    id: 'national_silverstone',
    eventId: 'event_formula_ford_2020_national_silverstone',
    eventName: 'BRSCC National FF1600 2020 - Silverstone International',
    eventStartDate: '2020-10-10',
    eventEndDate: '2020-10-10',
    country: 'United Kingdom',
    trackId: 'track_silverstone_international',
    track: {
      id: 'track_silverstone_international',
      name: 'Silverstone International',
      canonicalName: 'Silverstone International Circuit',
      country: 'United Kingdom',
      region: 'Northamptonshire',
      city: 'Silverstone',
      latitude: 52.0786,
      longitude: -1.0169,
      timezone,
      trackType: 'road',
      configuration: 'International',
      lengthMi: 1.8508,
      lengthKm: 2.9785,
      direction: 'clockwise',
      surface: 'asphalt',
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Silverstone International', 'Silverstone International Circuit']
    },
    url: 'https://www.tsl-timing.com/file/?f=BARC/2020/204121ffn.pdf',
    pdfPath: join(pdfDir, 'national-ff1600-silverstone-book.pdf'),
    textPath: join(textDir, 'national-ff1600-silverstone-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_national_silverstone_book_pdf',
    sourceName: 'BRSCC National FF1600 2020 Silverstone International TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '204121',
    coverage: 'Official TSL/BARC-hosted Avon Tyres National and Northern Formula Ford Championship Silverstone International result book with qualifying, grids, race classifications, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for 2020 National FF1600 Silverstone International classifications. Parser imports classification and grid pages only.'
  },
  {
    id: 'champion_cadwell',
    eventId: 'event_formula_ford_2020_champion_cadwell',
    eventName: 'The Champion of Cadwell for FF1600 2020',
    eventStartDate: '2020-08-22',
    eventEndDate: '2020-08-22',
    country: 'United Kingdom',
    trackId: 'track_cadwell_park_full',
    track: {
      id: 'track_cadwell_park_full',
      name: 'Cadwell Park',
      canonicalName: 'Cadwell Park Circuit',
      country: 'United Kingdom',
      region: 'Lincolnshire',
      city: 'Louth',
      latitude: 53.3106,
      longitude: -0.0586,
      timezone,
      trackType: 'road',
      configuration: 'Full Circuit',
      lengthMi: 2.1869,
      lengthKm: 3.5195,
      direction: 'clockwise',
      surface: 'asphalt',
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Cadwell Park', 'Cadwell Park Circuit']
    },
    url: 'https://www.tsl-timing.com/file/?f=MSVR/2020/203452hef.pdf',
    eventPageUrl: 'https://www.tsl-timing.com/event/203452',
    eventPagePath: join(rawDir, 'event-pages/champion-of-cadwell-event.html'),
    pdfPath: join(pdfDir, 'champion-of-cadwell-book.pdf'),
    textPath: join(textDir, 'champion-of-cadwell-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_champion_cadwell_book_pdf',
    sourceName: 'MSVR Champion of Cadwell for FF1600 2020 TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '203452',
    coverage: 'Official TSL/MSVR Champion of Cadwell for FF1600 2020 result book with qualifying, grids, race classifications, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for 2020 Champion of Cadwell classifications. Parser imports classification, grid, and source-labeled Bryce lap-analysis pages.'
  },
  {
    id: 'champion_brands',
    eventId: 'event_formula_ford_2020_champion_brands',
    eventName: 'Champion of Brands 2020',
    eventStartDate: '2020-09-12',
    eventEndDate: '2020-09-12',
    country: 'United Kingdom',
    trackId: 'track_brands_hatch_indy',
    track: {
      id: 'track_brands_hatch_indy',
      name: 'Brands Hatch Indy',
      canonicalName: 'Brands Hatch Indy Circuit',
      country: 'United Kingdom',
      region: 'Kent',
      city: 'West Kingsdown',
      latitude: 51.3569,
      longitude: 0.2631,
      timezone,
      trackType: 'road',
      configuration: 'Indy',
      lengthMi: 1.2079,
      lengthKm: 1.9441,
      direction: 'clockwise',
      surface: 'asphalt',
      elevationM: null,
      cornerCount: 7,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: ['Brands Hatch Indy', 'Brands Hatch Indy Circuit']
    },
    url: 'https://www.tsl-timing.com/file/?f=MSVR/2020/203752cob.pdf',
    eventPageUrl: 'https://www.tsl-timing.com/event/203752',
    eventPagePath: join(rawDir, 'event-pages/champion-of-brands-event.html'),
    pdfPath: join(pdfDir, 'champion-of-brands-book.pdf'),
    textPath: join(textDir, 'champion-of-brands-book.txt'),
    sourceEvidenceId: 'source_formula_ford_2020_champion_brands_book_pdf',
    sourceName: 'MSVR Champion of Brands 2020 TSL results book',
    sourceType: 'official_pdf',
    officialEventId: '203752',
    coverage: 'Official TSL/MSVR Champion of Brands 2020 result book with qualifying, grids, race classifications, lap charts, and timing analysis.',
    sourceNotes: 'Primary source for 2020 Champion of Brands classifications. Parser imports classification, grid, and source-labeled Bryce lap-analysis pages.'
  }
];

const supportingSources = [
  {
    id: 'source_formula_ford_2020_wht_event_page',
    sourceType: 'official_page',
    sourceName: 'TSL Walter Hayes Trophy 2020 event page',
    url: 'https://www.tsl-timing.com/event/204456',
    rawArtifactPath: 'data/career/raw/formula-ford-2020/walter-hayes-trophy-event.html',
    coverage: 'Official TSL event page listing Walter Hayes Trophy sessions, PDF book, individual result PDFs, track length, and date.',
    notes: 'Used to preserve the official session inventory and confirm the event-level source route.'
  },
  {
    id: 'source_formula_ford_2020_wht_grand_final_pdf',
    sourceType: 'official_pdf',
    sourceName: 'TSL Walter Hayes Trophy 2020 Grand Final classification PDF',
    url: 'https://www.tsl-timing.com/file/?f=HSCC/2020/204456finwht.pdf',
    rawArtifactPath: 'data/career/raw/formula-ford-2020/pdf/walter-hayes-trophy-grand-final.pdf',
    coverage: 'Official standalone Grand Final classification used as a cross-check against the WHT book import.',
    notes: 'The WHT book classification is the normalized source; this PDF is retained as a row-level cross-check for Bryce P3 in the Grand Final.'
  }
];

const eventHtmlPath = join(rawDir, 'walter-hayes-trophy-event.html');
const grandFinalPdfPath = join(pdfDir, 'walter-hayes-trophy-grand-final.pdf');
const grandFinalTextPath = join(textDir, 'walter-hayes-trophy-grand-final.txt');

const monthNumber = {
  january: '01',
  february: '02',
  march: '03',
  april: '04',
  may: '05',
  june: '06',
  july: '07',
  august: '08',
  september: '09',
  october: '10',
  november: '11',
  december: '12'
};

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

const fetchBuffer = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/pdf,text/html,*/*' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
};

const fetchCached = async (url, path) => {
  if (!refresh) {
    try {
      await readFile(path);
      return { fromCache: true };
    } catch {
      // Fetch below.
    }
  }
  const payload = await fetchBuffer(url);
  await writeFile(path, payload);
  return { fromCache: false };
};

const convertPdf = async (pdfPath, textPath) => {
  if (!refresh) {
    const cached = await readTextIfExists(textPath, null);
    if (cached) return { fromCache: true };
  }
  await execFile(pdftotextBin, ['-layout', pdfPath, textPath]);
  return { fromCache: false };
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

const sourceEvidence = ({ id, sourceType, sourceName, url, retrievedAt, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/import-formula-ford-2020-career.mjs',
  licenseNotes: sourceLicenseNotes,
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-formula-ford-2020-career.mjs',
  rawArtifactPath,
  notes
});

const sourcePath = (path) => path.replace(`${root}/`, '');

const parsePrintedDate = (page, fallbackDate) => {
  const match = page.match(/Printed\s+-\s+\d{1,2}:\d{2}\s+([A-Za-z]+),\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!match) return fallbackDate;
  const [, , day, month, printedYear] = match;
  const monthValue = monthNumber[month.toLowerCase()];
  if (!monthValue) return fallbackDate;
  return `${printedYear}-${monthValue}-${String(day).padStart(2, '0')}`;
};

const parseTimeWindow = (page, date) => {
  const match = page.match(/Start:\s*([0-9]{1,2}:[0-9]{2})(?:\s+Flag\s+([0-9]{1,2}:[0-9]{2}))?(?:\s+End:\s+([0-9]{1,2}:[0-9]{2}))?/);
  if (!match) return { scheduledStart: null, actualStart: null, flagTimeLocal: null, endTimeLocal: null };
  const [, start, flag, end] = match;
  const iso = (value) => (date && value ? `${date}T${value.padStart(5, '0')}:00` : null);
  return {
    scheduledStart: iso(start),
    actualStart: iso(start),
    flagTimeLocal: flag ?? null,
    endTimeLocal: end ?? null
  };
};

const parseWeather = (page) => {
  const match = page.match(/Weather\s*\/\s*Track\s*:\s*([^/\n]+?)\s*\/\s*([^\n]+?)(?:\s{2,}|\s+Circuit Length|$)/);
  if (!match) return null;
  const weatherRaw = match[1].trim();
  const trackRaw = match[2].replace(/Circuit Length.*/i, '').trim();
  const normalizedTrack = trackRaw.toLowerCase();
  const wetDry =
    normalizedTrack.includes('dry') && !normalizedTrack.includes('drying')
      ? 'dry'
      : normalizedTrack.includes('drying')
        ? 'drying'
        : normalizedTrack.includes('damp')
          ? 'damp'
          : normalizedTrack.includes('wet')
            ? 'wet'
            : 'unknown';
  return {
    weatherRaw,
    trackRaw,
    trackCondition: wetDry,
    wetDry
  };
};

const parseCircuitLengthMi = (page) => {
  const match = page.match(/Circuit Length\s*=\s*([0-9.]+)\s*miles/i);
  return match ? safeNumber(match[1]) : null;
};

const sessionTypeFromTitle = (title) => {
  if (/QUALIFYING/i.test(title)) return 'qualifying';
  if (/^HEAT\s+\d+/i.test(title)) return 'heat';
  return 'race';
};

const sessionNameFromTitle = (title) => title.replace(/\s+-\s+CLASSIFICATION(?:\s+-\s+AMENDED)?$/i, '').trim();

const parseRaceNumber = (title) => {
  const raceMatch = title.match(/\bRACE\s+(\d+)\b/i);
  if (raceMatch) return Number(raceMatch[1]);
  const heatMatch = title.match(/\bHEAT\s+(\d+)\b/i);
  if (heatMatch) return Number(heatMatch[1]);
  return null;
};

const parseHeatNumber = (title) => {
  const match = title.match(/\bHEAT\s+(\d+)\b/i);
  return match ? Number(match[1]) : null;
};

const isClassToken = (value) => {
  const clean = String(value ?? '').replace(/\*/g, '').trim();
  return Boolean(clean) && /^(Pro|Club|SCA|SCB|SCC|SCD|SCE|CH|JC|O|H|P)$/i.test(clean);
};

const cleanClass = (value) => {
  const clean = String(value ?? '').replace(/\*/g, '').trim();
  return clean || null;
};

const cleanDriverName = (name) =>
  String(name ?? '')
    .replace(/®/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\*+$/g, '')
    .trim();

const identityName = (name) => cleanDriverName(name).replace(/\s+\((?:R|ROOKIE)\)$/i, '').trim();

const driverIdFor = (name) => (/^bryce\s+aron$/i.test(identityName(name)) ? 'driver_bryce_aron' : `driver_${slug(identityName(name))}`);

const splitName = (name) => {
  const clean = identityName(name);
  const parts = clean.split(/\s+/);
  return {
    givenName: parts[0] ?? null,
    familyName: parts.length > 1 ? parts.slice(1).join(' ') : null
  };
};

const parseCarAndClass = (parts, startIndex) => {
  const first = String(parts[startIndex] ?? '').trim();
  const tokens = first.split(/\s+/).filter(Boolean);
  const carNumber = tokens.shift() ?? null;
  let classRaw = tokens.filter((token) => token !== '*').join(' ') || null;
  let index = startIndex + 1;
  while (isClassToken(parts[index])) {
    classRaw = [classRaw, cleanClass(parts[index])].filter(Boolean).join(' ') || null;
    index += 1;
  }
  return { carNumber, classRaw: cleanClass(classRaw), index };
};

const parsePositionAndName = (value, allowPic) => {
  const text = String(value ?? '').trim();
  if (allowPic) {
    const match = text.match(/^(\d+)\s+(.+)$/);
    if (match) return { pic: Number(match[1]), name: cleanDriverName(match[2]) };
  }
  return { pic: null, name: cleanDriverName(text) };
};

const looksLikeTime = (value) => /^[0-9]+(?::[0-9]{2})?(?:\.[0-9]+)$/.test(String(value ?? '').trim());

const parseResultLine = (line, sessionType) => {
  const parts = line.trim().split(/\s{2,}/).filter(Boolean);
  if (parts.length < 5) return null;
  const positionRaw = parts[0];
  const numericPosition = /^\d+$/.test(positionRaw) ? Number(positionRaw) : null;
  const status = numericPosition ? 'running' : positionRaw.toLowerCase() === 'dnf' ? 'dnf' : positionRaw.toLowerCase() === 'dns' ? 'dns' : positionRaw.toLowerCase().startsWith('dq') ? 'dsq' : 'unknown';
  const { carNumber, classRaw, index: afterCarIndex } = parseCarAndClass(parts, 1);
  const { pic, name } = parsePositionAndName(parts[afterCarIndex], Boolean(numericPosition));
  const entry = parts[afterCarIndex + 1] ?? null;
  const values = parts.slice(afterCarIndex + 2);
  if (!carNumber || !name || !entry) return null;

  const row = {
    positionRaw,
    finishPosition: numericPosition,
    classifiedPosition: numericPosition,
    carNumber: String(carNumber),
    classRaw: classRaw ?? 'Formula Ford',
    classPosition: pic,
    driverName: name,
    entry,
    status,
    lapsCompleted: null,
    totalTime: null,
    gapToLeader: null,
    gapToAhead: null,
    averageSpeedMph: null,
    bestLapTime: null,
    bestLapNumber: null,
    rawValues: values
  };

  if (sessionType === 'qualifying') {
    row.bestLapTime = values[0] ?? null;
    row.bestLapNumber = safeNumber(values[1]);
    row.lapsCompleted = safeNumber(values[2]);
    row.averageSpeedMph = safeNumber(values.at(-1));
    if (values.length >= 6) {
      row.gapToLeader = values[3] ?? null;
      row.gapToAhead = values[4] ?? null;
    }
    return row;
  }

  row.lapsCompleted = safeNumber(values[0]);
  row.totalTime = values[1] ?? null;
  const tail = values.slice(2);
  const hasBestLap = tail.length >= 3 && looksLikeTime(tail.at(-2)) && /^\d+$/.test(String(tail.at(-1) ?? ''));
  if (hasBestLap) {
    row.bestLapNumber = safeNumber(tail.at(-1));
    row.bestLapTime = tail.at(-2);
    row.averageSpeedMph = safeNumber(tail.at(-3));
    const gapFields = tail.slice(0, -3);
    row.gapToLeader = gapFields[0] ?? null;
    row.gapToAhead = gapFields[1] ?? null;
  } else {
    row.averageSpeedMph = safeNumber(tail.at(-1));
    const gapFields = tail.slice(0, -1);
    row.gapToLeader = gapFields[0] ?? null;
    row.gapToAhead = gapFields[1] ?? null;
  }
  return row;
};

const parseClassificationPages = (source, text) => {
  const pages = text.split('\f');
  const sessions = new Map();
  for (const [pageIndex, page] of pages.entries()) {
    if (!/CLASSIFICATION/i.test(page) || !/^POS\s+NO\s+/m.test(page)) continue;
    const lines = page.split('\n');
    const title = lines.find((line) => /CLASSIFICATION/i.test(line))?.trim();
    if (!title) continue;
    const sessionName = sessionNameFromTitle(title);
    const sessionType = sessionTypeFromTitle(title);
    const printedDate = parsePrintedDate(page, source.eventStartDate);
    const timeWindow = parseTimeWindow(page, printedDate);
    const weather = parseWeather(page);
    const circuitLengthMi = parseCircuitLengthMi(page);
    const headerIndex = lines.findIndex((line) => /^POS\s+NO\s+/i.test(line.trim()));
    const parsedRows = [];
    for (const line of lines.slice(headerIndex + 1)) {
      if (/^\s*FASTEST LAP\b/i.test(line) || /^\s*Weather\s*\/\s*Track/i.test(line)) break;
      if (!/^\s*(?:\d+|DNF|DNS|DQ)\s+/.test(line)) continue;
      const parsed = parseResultLine(line, sessionType);
      if (parsed) parsedRows.push(parsed);
    }
    if (parsedRows.length === 0) continue;

    const sessionSlug = slug(sessionName);
    const key = `${source.id}:${sessionSlug}:${timeWindow.scheduledStart ?? printedDate}`;
    const existing = sessions.get(key);
    if (existing) {
      const existingRowKeys = new Set(existing.rows.map((row) => `${row.positionRaw}:${row.carNumber}:${identityName(row.driverName)}:${row.bestLapTime ?? row.totalTime ?? ''}`));
      for (const row of parsedRows) {
        const rowKey = `${row.positionRaw}:${row.carNumber}:${identityName(row.driverName)}:${row.bestLapTime ?? row.totalTime ?? ''}`;
        if (!existingRowKeys.has(rowKey)) {
          existing.rows.push(row);
          existingRowKeys.add(rowKey);
        }
      }
      existing.pageNumbers.push(pageIndex + 1);
      continue;
    }

    sessions.set(key, {
      sourceId: source.id,
      eventId: source.eventId,
      trackId: source.trackId,
      sessionSlug,
      title,
      sessionName,
      sessionType,
      raceNumber: parseRaceNumber(title),
      heatNumber: parseHeatNumber(title),
      printedDate,
      scheduledStart: timeWindow.scheduledStart,
      actualStart: timeWindow.actualStart,
      flagTimeLocal: timeWindow.flagTimeLocal,
      endTimeLocal: timeWindow.endTimeLocal,
      weather,
      circuitLengthMi,
      pageNumbers: [pageIndex + 1],
      rows: parsedRows
    });
  }
  return Array.from(sessions.values()).sort((a, b) => (a.scheduledStart ?? '').localeCompare(b.scheduledStart ?? '') || a.sessionName.localeCompare(b.sessionName));
};

const sessionNameFromGridTitle = (title) => title.replace(/\s+-\s+GRID\b.*$/i, '').trim();
const cleanPenaltyReason = (value) => String(value ?? '').replace(/\.+$/g, '').trim();

const parseGridEntries = (page) => {
  const entries = [];
  const seen = new Set();
  const entryPattern = /(?:^|\s)(?<position>\d{1,2})\s+(?<carNumber>\d{1,3})\s+(?<driverName>[A-Za-z][A-Za-z® .'\-()]+?)(?=\s{2,}\d{1,2}\s+\d{1,3}\s+[A-Za-z]|\s*$)/g;
  for (const line of page.split('\n')) {
    const normalized = line
      .replace(/\bROW\s+\d+\b/ig, ' ')
      .replace(/\bPole\b/ig, ' ')
      .replace(/\b\d{1,2}(?::\d{2})?\.\d{3}\b/g, ' ')
      .trimEnd();
    if (!normalized.trim()) continue;
    for (const match of normalized.matchAll(entryPattern)) {
      const position = Number(match.groups.position);
      const carNumber = match.groups.carNumber;
      const driverName = cleanDriverName(match.groups.driverName);
      const key = `${position}:${carNumber}:${identityName(driverName)}`;
      if (!Number.isFinite(position) || seen.has(key)) continue;
      seen.add(key);
      entries.push({ position, carNumber, driverName });
    }
  }
  return entries.sort((a, b) => a.position - b.position);
};

const parseGridPages = (source, text) => {
  const pages = text.split('\f');
  const grids = [];
  for (const [pageIndex, page] of pages.entries()) {
    if (/\bRESTART\s+GRID\b/i.test(page)) continue;
    const lines = page.split('\n');
    const gridTitle = lines.find((line) => /\s+-\s+GRID\s*\(/i.test(line.trim()))?.trim();
    if (!gridTitle) continue;
    const rows = parseGridEntries(page);
    if (rows.length === 0) continue;
    const sessionName = sessionNameFromGridTitle(gridTitle);
    grids.push({
      sourceId: source.id,
      sessionSlug: slug(sessionName),
      sessionName,
      title: gridTitle,
      pageNumber: pageIndex + 1,
      rows
    });
  }
  return grids.sort((a, b) => a.sessionSlug.localeCompare(b.sessionSlug));
};

const parsePenaltyNotes = (source, text) => {
  const pages = text.split('\f');
  const penalties = [];
  for (const [pageIndex, page] of pages.entries()) {
    const lines = page.split('\n');
    const classificationTitle = lines.find((line) => /\bCLASSIFICATION\b/i.test(line.trim()))?.trim();
    const gridTitle = lines.find((line) => /\s+-\s+GRID\b/i.test(line.trim()))?.trim();
    for (const line of lines) {
      const gridMatch = line.match(/^\s*\*?Car\s+(?<carNumber>\S+)\s+-\s+(?<positions>\d+)\s+place grid penalty for\s+(?<reason>.+?)\.?\s*$/i);
      if (gridMatch && gridTitle) {
        const sessionName = sessionNameFromGridTitle(gridTitle);
        penalties.push({
          sourceId: source.id,
          sessionSlug: slug(sessionName),
          sessionName,
          carNumber: gridMatch.groups.carNumber,
          penaltyType: 'grid_position_loss',
          positionImpact: -Number(gridMatch.groups.positions),
          timeImpactSeconds: null,
          reason: cleanPenaltyReason(gridMatch.groups.reason),
          announcementRaw: line.trim(),
          pageNumber: pageIndex + 1
        });
        continue;
      }

      const timeMatch = line.match(/^\s*\*?Car\s+(?<carNumber>\S+)\s+-\s+(?<seconds>\d+)\s+second penalty for\s+(?<reason>.+?)\.?\s*$/i);
      if (timeMatch && classificationTitle) {
        const sessionName = sessionNameFromTitle(classificationTitle);
        penalties.push({
          sourceId: source.id,
          sessionSlug: slug(sessionName),
          sessionName,
          carNumber: timeMatch.groups.carNumber,
          penaltyType: 'time_penalty',
          positionImpact: null,
          timeImpactSeconds: Number(timeMatch.groups.seconds),
          reason: cleanPenaltyReason(timeMatch.groups.reason),
          announcementRaw: line.trim(),
          pageNumber: pageIndex + 1
        });
      }
    }
  }
  return penalties;
};

const sessionNameFromAnalysisTitle = (title) =>
  title
    .replace(/\s+-\s+LAP\s+ANALYSIS\b.*$/i, '')
    .replace(/\s+-\s+SECTOR\s+ANALYSIS\b.*$/i, '')
    .trim();

const isLapTimeToken = (value) => /^(?:\d+:)?\d{1,2}\.\d{3}$/.test(String(value ?? '').trim());
const isPlausibleMph = (value) => {
  const parsed = safeNumber(value);
  return parsed !== null && parsed >= 40 && parsed <= 130;
};

const parseLapAnalysisRow = (line) => {
  const match = String(line ?? '').trim().match(/^(\d+)\s*-\s*(.*)$/);
  if (!match) return null;
  const lapNumber = Number(match[1]);
  const rest = match[2] ?? '';
  const timeOfDayMatch = rest.match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*$/);
  if (!timeOfDayMatch) return null;
  const sourceTimestamp = timeOfDayMatch[1];
  const beforeTimestamp = rest
    .slice(0, timeOfDayMatch.index)
    .replace(/\(\d+\)/g, ' ')
    .replace(/\bP\b/g, ' ')
    .trim();
  const tokens = beforeTimestamp.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return {
      lapNumber,
      lapTime: null,
      diffToPersonalBest: null,
      averageSpeedMph: null,
      sourceTimestamp,
      rawTokens: []
    };
  }

  let lapTimeIndex = -1;
  let mphIndex = -1;
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    if (!isPlausibleMph(tokens[index])) continue;
    const previousIsLapTime = isLapTimeToken(tokens[index - 1]);
    const previousPreviousIsLapTime = isLapTimeToken(tokens[index - 2]);
    if (!previousIsLapTime && !previousPreviousIsLapTime) continue;
    mphIndex = index;
    lapTimeIndex = previousPreviousIsLapTime ? index - 2 : index - 1;
    break;
  }
  if (lapTimeIndex === -1) return null;
  const diffIndex = mphIndex === lapTimeIndex + 2 ? lapTimeIndex + 1 : mphIndex + 1;
  return {
    lapNumber,
    lapTime: tokens[lapTimeIndex],
    diffToPersonalBest: tokens[diffIndex] && diffIndex < tokens.length && diffIndex !== mphIndex ? tokens[diffIndex] : null,
    averageSpeedMph: safeNumber(tokens[mphIndex]),
    sourceTimestamp,
    rawTokens: tokens
  };
};

const parseColumnLapRows = ({ lines, startIndex, columnStart, columnEnd }) => {
  const rows = [];
  for (const line of lines.slice(startIndex)) {
    const slice = line.slice(columnStart, columnEnd).trimEnd();
    if (/^\s*(?:Weather\s*\/\s*Track|Results can be found|Printed\s+-)/i.test(slice)) break;
    if (/^\s*P\d+\s+/i.test(slice)) break;
    const row = parseLapAnalysisRow(slice);
    if (row) rows.push(row);
  }
  return rows;
};

const parseSectorBlockRows = (lines, startIndex) => {
  const rows = [];
  for (const line of lines.slice(startIndex)) {
    if (/^\s*P\d+\s+/i.test(line) && rows.length > 0) break;
    if (/^\s*(?:Weather\s*\/\s*Track|Results can be found|Printed\s+-)/i.test(line)) break;
    const row = parseLapAnalysisRow(line);
    if (row) rows.push(row);
  }
  return rows;
};

const parseLapAnalysisPages = (source, text) => {
  const pages = text.split('\f');
  const analyses = [];
  for (const [pageIndex, page] of pages.entries()) {
    const lines = page.split('\n');
    const title = lines.find((line) => /\b(?:LAP|SECTOR)\s+ANALYSIS\b/i.test(line.trim()))?.trim();
    if (!title || !/Bryce\s+ARON/i.test(page)) continue;
    const sessionName = sessionNameFromAnalysisTitle(title);
    const sessionSlug = slug(sessionName);
    const bryceLineIndex = lines.findIndex((line) => /^\s*P\d+\s+.*\bBryce\s+ARON\b/i.test(line));
    if (bryceLineIndex === -1) continue;
    const bryceLine = lines[bryceLineIndex];
    const position = safeNumber(bryceLine.match(/^\s*P(\d+)/i)?.[1]);
    let rows = [];
    let parser = 'formula_ford_sector_analysis_block';
    if (/\bSECTOR\s+ANALYSIS\b/i.test(title)) {
      rows = parseSectorBlockRows(lines, bryceLineIndex + 1);
    } else {
      const bryceOffset = bryceLine.search(/\bP\d+\s+.*\bBryce\s+ARON\b/i);
      const isRightColumn = bryceOffset >= 65;
      rows = parseColumnLapRows({
        lines,
        startIndex: bryceLineIndex + 1,
        columnStart: isRightColumn ? 70 : 0,
        columnEnd: isRightColumn ? undefined : 70
      });
      parser = isRightColumn ? 'formula_ford_lap_analysis_right_column' : 'formula_ford_lap_analysis_left_column';
    }
    if (!rows.length) continue;
    analyses.push({
      sourceId: source.id,
      sessionSlug,
      sessionName,
      title,
      pageNumber: pageIndex + 1,
      parser,
      analysisPosition: position,
      rows
    });
  }
  return analyses.sort((a, b) => a.sessionSlug.localeCompare(b.sessionSlug) || a.pageNumber - b.pageNumber);
};

const resultStatusLabel = (row) => row.status === 'running' ? String(row.finishPosition ?? row.positionRaw) : row.status.toUpperCase();

const main = async () => {
  await mkdir(pdfDir, { recursive: true });
  await mkdir(textDir, { recursive: true });
  await mkdir(eventPagesDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const existing = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const sourceEvidenceMap = new Map(asArray(existing.sourceEvidence).map((row) => [row.id, row]));
  const drivers = new Map(asArray(existing.drivers).map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series).map((row) => [row.id, row]));
  const teams = new Map(asArray(existing.teams).map((row) => [row.id, row]));
  const cars = new Map(asArray(existing.cars).map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(asArray(existing.seasons).map((row) => [row.id, row]));
  const events = new Map(asArray(existing.events).map((row) => [row.id, row]));
  const sessions = new Map(asArray(existing.sessions).map((row) => [row.id, row]));
  const ownedResultPrefix = `result_formula_ford_${year}_`;
  const ownedCarPrefix = `car_formula_ford_${year}_`;
  const ownedPenaltyPrefix = `penalty_formula_ford_${year}_`;
  const results = new Map(asArray(existing.results).map((row) => [row.id, {
    ...row,
    penaltyRefs: asArray(row.penaltyRefs).filter((ref) => !String(ref).startsWith(ownedPenaltyPrefix))
  }]).filter(([id]) => !String(id).startsWith(ownedResultPrefix)));
  for (const id of [...cars.keys()].filter((id) => String(id).startsWith(ownedCarPrefix))) {
    cars.delete(id);
  }
  const penalties = new Map(
    asArray(existing.penalties)
      .filter((row) => !String(row.id ?? '').startsWith(ownedPenaltyPrefix))
      .map((row) => [row.id, row])
  );
  const lapSamples = new Map(
    asArray(existing.lapSamples)
      .filter((row) => !String(row.id ?? '').startsWith(`lap_formula_ford_${year}_`))
      .map((row) => [row.id, row])
  );
  const weatherObservations = new Map(asArray(existing.weatherObservations).map((row) => [row.id, row]));
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));

  const report = {
    checkedAt: retrievedAt,
    year,
    refresh,
    fetched: 0,
    cached: 0,
    pdfsConverted: 0,
    textCached: 0,
    classificationSessionsDiscovered: 0,
    gridPagesDiscovered: 0,
    lapAnalysisPagesDiscovered: 0,
    sessionsImported: 0,
    resultRowsImported: 0,
    gridRowsImported: 0,
    lapSamplesImported: 0,
    bryceResultRowsImported: 0,
    bryceLapSamplesImported: 0,
    weatherObservationsImported: 0,
    penaltiesImported: 0,
    mediaAssetsImported: 0,
    rawArtifacts: [],
    crossChecks: [],
    gridRowsUnmatched: [],
    gridRowsMatchedByDriverName: [],
    gridStartHoldouts: [],
    gaps: []
  };

  const eventPage = await fetchCached('https://www.tsl-timing.com/event/204456', eventHtmlPath);
  report[eventPage.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(sourcePath(eventHtmlPath));
  const finalPdf = await fetchCached('https://www.tsl-timing.com/file/?f=HSCC/2020/204456finwht.pdf', grandFinalPdfPath);
  report[finalPdf.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(sourcePath(grandFinalPdfPath));
  const finalText = await convertPdf(grandFinalPdfPath, grandFinalTextPath);
  report[finalText.fromCache ? 'textCached' : 'pdfsConverted'] += 1;
  report.rawArtifacts.push(sourcePath(grandFinalTextPath));

  for (const source of sources) {
    if (source.eventPageUrl && source.eventPagePath) {
      const pageResult = await fetchCached(source.eventPageUrl, source.eventPagePath);
      report[pageResult.fromCache ? 'cached' : 'fetched'] += 1;
      report.rawArtifacts.push(sourcePath(source.eventPagePath));
    }
    const pdfResult = await fetchCached(source.url, source.pdfPath);
    report[pdfResult.fromCache ? 'cached' : 'fetched'] += 1;
    report.rawArtifacts.push(sourcePath(source.pdfPath));
    const textResult = await convertPdf(source.pdfPath, source.textPath);
    report[textResult.fromCache ? 'textCached' : 'pdfsConverted'] += 1;
    report.rawArtifacts.push(sourcePath(source.textPath));
  }

  for (const source of sources) {
    upsert(sourceEvidenceMap, sourceEvidence({
      id: source.sourceEvidenceId,
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      url: source.url,
      retrievedAt,
      coverage: source.coverage,
      rawArtifactPath: sourcePath(source.pdfPath),
      notes: source.sourceNotes
    }));
    if (source.eventPageUrl && source.eventPagePath) {
      upsert(sourceEvidenceMap, sourceEvidence({
        id: `source_formula_ford_2020_${source.id}_event_page`,
        sourceType: 'official_page',
        sourceName: `${source.eventName} TSL event page`,
        url: source.eventPageUrl,
        retrievedAt,
        coverage: `Official TSL event page listing ${source.eventName} sessions and timing documents.`,
        rawArtifactPath: sourcePath(source.eventPagePath),
        notes: 'Used to preserve the official event-level source route and timing-document inventory.'
      }));
    }
  }
  for (const source of supportingSources) {
    upsert(sourceEvidenceMap, sourceEvidence({ ...source, retrievedAt }));
  }

  upsert(series, {
    id: 'series_formula_ford',
    name: 'Formula Ford',
    category: 'formula',
    ladderLevel: 'Entry-level single-seater / Formula Ford special events',
    governingBody: 'BRSCC / HSCC / event organizers',
    countryScope: 'United Kingdom / international invitational',
    officialWebsite: 'https://brscc.co.uk/',
    externalIds: { discipline: 'ff1600_formula_ford' },
    provenanceRefs: sources.map((source) => source.sourceEvidenceId)
  });

  const extractedSessions = [];
  const extractedGridPages = [];
  const extractedPenaltyNotes = [];
  const extractedLapAnalyses = [];
  for (const source of sources) {
    const text = await readFile(source.textPath, 'utf8');
    const parsed = parseClassificationPages(source, text);
    extractedSessions.push(...parsed);
    extractedGridPages.push(...parseGridPages(source, text));
    extractedPenaltyNotes.push(...parsePenaltyNotes(source, text));
    extractedLapAnalyses.push(...parseLapAnalysisPages(source, text));
  }
  report.classificationSessionsDiscovered = extractedSessions.length;
  report.gridPagesDiscovered = extractedGridPages.length;
  report.lapAnalysisPagesDiscovered = extractedLapAnalyses.length;
  const gridPagesBySession = new Map();
  for (const grid of extractedGridPages) {
    const key = `${grid.sourceId}:${grid.sessionSlug}`;
    if (!gridPagesBySession.has(key)) gridPagesBySession.set(key, grid);
  }
  const penaltyNotesBySession = new Map();
  for (const note of extractedPenaltyNotes) {
    const key = `${note.sourceId}:${note.sessionSlug}`;
    penaltyNotesBySession.set(key, [...(penaltyNotesBySession.get(key) ?? []), note]);
  }
  const lapAnalysesBySession = new Map();
  for (const analysis of extractedLapAnalyses) {
    const key = `${analysis.sourceId}:${analysis.sessionSlug}`;
    lapAnalysesBySession.set(key, [...(lapAnalysesBySession.get(key) ?? []), analysis]);
  }
  await writeFile(extractedPath, `${JSON.stringify({ extractedAt: retrievedAt, sessions: extractedSessions, grids: extractedGridPages, penaltyNotes: extractedPenaltyNotes, lapAnalyses: extractedLapAnalyses }, null, 2)}\n`);
  report.rawArtifacts.push(sourcePath(extractedPath));

  const finalTextContent = await readFile(grandFinalTextPath, 'utf8');
  const finalCrossCheck = parseClassificationPages({ ...sources.find((source) => source.id === 'wht'), id: 'wht_final_crosscheck' }, finalTextContent)
    .find((session) => /GRAND FINAL/i.test(session.title));
  const finalBryce = finalCrossCheck?.rows.find((row) => driverIdFor(row.driverName) === 'driver_bryce_aron');
  report.crossChecks.push({
    source: 'source_formula_ford_2020_wht_grand_final_pdf',
    check: 'wht_grand_final_bryce_row',
    ok: finalBryce?.finishPosition === 3 && finalBryce.carNumber === '21',
    observed: finalBryce ? {
      driverName: finalBryce.driverName,
      carNumber: finalBryce.carNumber,
      finishPosition: finalBryce.finishPosition,
      totalTime: finalBryce.totalTime,
      bestLapTime: finalBryce.bestLapTime
    } : null
  });

  for (const source of sources) {
    const bookEvidenceId = source.sourceEvidenceId;
    const sourceEventPageEvidenceId = source.eventPageUrl ? `source_formula_ford_2020_${source.id}_event_page` : null;
    const eventEvidenceId = source.id === 'wht' ? 'source_formula_ford_2020_wht_event_page' : sourceEventPageEvidenceId ?? bookEvidenceId;
    upsert(tracks, {
      ...source.track,
      provenanceRefs: [bookEvidenceId]
    });
    upsert(events, {
      id: source.eventId,
      seriesId: 'series_formula_ford',
      seasonYear: year,
      name: source.eventName,
      round: null,
      eventStartDate: source.eventStartDate,
      eventEndDate: source.eventEndDate,
      trackId: source.trackId,
      country: source.country,
      officialEventId: source.officialEventId,
      provenanceRefs: [eventEvidenceId]
    });
    upsert(mediaAssets, {
      id: `asset_formula_ford_2020_${source.id}_book_pdf`,
      assetType: 'pdf',
      title: source.sourceName,
      url: source.url,
      rightsStatus: 'link_only',
      publishedAt: source.eventEndDate,
      eventId: source.eventId,
      sessionId: null,
      driverId: null,
      summary: source.coverage,
      quoteText: null,
      provenanceRefs: [bookEvidenceId]
    });
    report.mediaAssetsImported += 1;
    if (source.eventPageUrl && sourceEventPageEvidenceId) {
      upsert(mediaAssets, {
        id: `asset_formula_ford_2020_${source.id}_event_page`,
        assetType: 'timing_sheet',
        title: `${source.eventName} TSL event page`,
        url: source.eventPageUrl,
        rightsStatus: 'link_only',
        publishedAt: source.eventEndDate,
        eventId: source.eventId,
        sessionId: null,
        driverId: null,
        summary: `Official TSL event page listing ${source.eventName} timing documents and session links.`,
        quoteText: null,
        provenanceRefs: [sourceEventPageEvidenceId]
      });
      report.mediaAssetsImported += 1;
    }
  }

  upsert(mediaAssets, {
    id: 'asset_formula_ford_2020_wht_event_page',
    assetType: 'timing_sheet',
    title: 'TSL Walter Hayes Trophy 2020 event page',
    url: 'https://www.tsl-timing.com/event/204456',
    rightsStatus: 'link_only',
    publishedAt: '2020-11-01',
    eventId: 'event_formula_ford_2020_walter_hayes_trophy',
    sessionId: null,
    driverId: null,
    summary: 'Official TSL event page listing WHT timing documents and session links.',
    quoteText: null,
    provenanceRefs: ['source_formula_ford_2020_wht_event_page']
  });
  upsert(mediaAssets, {
    id: 'asset_formula_ford_2020_wht_grand_final_pdf',
    assetType: 'result_sheet',
    title: 'TSL Walter Hayes Trophy 2020 Grand Final classification PDF',
    url: 'https://www.tsl-timing.com/file/?f=HSCC/2020/204456finwht.pdf',
    rightsStatus: 'link_only',
    publishedAt: '2020-11-01',
    eventId: 'event_formula_ford_2020_walter_hayes_trophy',
    sessionId: 'session_formula_ford_2020_wht_grand_final',
    driverId: 'driver_bryce_aron',
    summary: 'Official WHT Grand Final classification cross-check. Bryce Aron finished P3 in car 21.',
    quoteText: null,
    provenanceRefs: ['source_formula_ford_2020_wht_grand_final_pdf']
  });
  report.mediaAssetsImported += 2;

  for (const parsedSession of extractedSessions) {
    const source = sources.find((entry) => entry.id === parsedSession.sourceId);
    const sessionId = `session_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}`;
    const sessionEvidenceId = `source_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_classification`;
    const pageNote = `Imported from PDF page(s) ${parsedSession.pageNumbers.join(', ')}.`;
    upsert(sourceEvidenceMap, sourceEvidence({
      id: sessionEvidenceId,
      sourceType: 'official_pdf',
      sourceName: `${source.eventName} ${parsedSession.sessionName} classification`,
      url: source.url,
      retrievedAt,
      coverage: `${source.eventName} ${parsedSession.sessionName} full-field classification rows.`,
      rawArtifactPath: sourcePath(source.textPath),
      notes: `${pageNote} Session title: ${parsedSession.title}.`
    }));

    const weatherId = parsedSession.weather ? `weather_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_official_conditions` : null;
    upsert(sessions, {
      id: sessionId,
      eventId: source.eventId,
      sessionType: parsedSession.sessionType,
      sessionName: parsedSession.sessionName,
      raceNumber: parsedSession.raceNumber,
      scheduledStart: parsedSession.scheduledStart,
      actualStart: parsedSession.actualStart,
      timezone,
      lapsScheduled: null,
      distanceScheduled: null,
      status: 'official',
      officialSessionId: `${source.id}:${parsedSession.title}`,
      weatherObservationRefs: weatherId ? [weatherId] : [],
      ingestionState: 'official',
      broadcastRouteRefs: [],
      notificationRefs: [],
      raw: {
        title: parsedSession.title,
        heatNumber: parsedSession.heatNumber,
        flagTimeLocal: parsedSession.flagTimeLocal,
        endTimeLocal: parsedSession.endTimeLocal,
        pageNumbers: parsedSession.pageNumbers,
        circuitLengthMi: parsedSession.circuitLengthMi
      },
      provenanceRefs: [source.sourceEvidenceId, sessionEvidenceId]
    });
    report.sessionsImported += 1;

    if (weatherId) {
      upsert(weatherObservations, {
        id: weatherId,
        trackId: source.trackId,
        sessionId,
        observedAt: parsedSession.actualStart ?? parsedSession.scheduledStart,
        source: 'TSL official classification weather/track line',
        stationId: 'official_session_report',
        latitude: source.track.latitude,
        longitude: source.track.longitude,
        distanceFromTrackKm: 0,
        ambientTempC: null,
        ambientConditionRaw: parsedSession.weather.weatherRaw,
        trackTempC: null,
        trackTempSource: null,
        trackCondition: parsedSession.weather.trackCondition,
        trackConditionRaw: parsedSession.weather.trackRaw,
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
        wetDry: parsedSession.weather.wetDry,
        confidence: 'official',
        timeWindowStart: parsedSession.actualStart ?? parsedSession.scheduledStart,
        timeWindowEnd: parsedSession.actualStart ?? parsedSession.scheduledStart,
        timeWindowReason: 'exact_session_report',
        trackCoordinateSource: 'manual_public_track_reference',
        weatherSourceType: 'series_report',
        timeConfidence: 'high',
        locationConfidence: 'track_exact',
        joinNotes: 'Official TSL classification weather/track condition. Coordinates identify the circuit and should be hardened by the track metadata lane.',
        provenanceRefs: [sessionEvidenceId]
      });
      report.weatherObservationsImported += 1;
    }

    const fieldSize = parsedSession.rows.length;
    const resultIdsByCarNumber = new Map();
    const driverIdsByCarNumber = new Map();
    const resultIdsByDriverName = new Map();
    const duplicateDriverNames = new Set();
    for (const row of parsedSession.rows) {
      const driverId = driverIdFor(row.driverName);
      const normalizedName = identityName(row.driverName);
      const { givenName, familyName } = splitName(row.driverName);
      const className = row.classRaw || 'Formula Ford';
      const carId = `car_formula_ford_2020_${slug(row.entry)}_${slug(row.carNumber)}`;
      const resultId = `result_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_${slug(row.carNumber)}_${driverId}`;

      upsert(drivers, {
        id: driverId,
        displayName: normalizedName,
        givenName,
        familyName,
        nationality: driverId === 'driver_bryce_aron' ? 'United States' : null,
        hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, Illinois' : null,
        dateOfBirth: null,
        externalIds: {
          formulaFord2020Name: normalizedName
        },
        provenanceRefs: [sessionEvidenceId]
      });

      upsert(cars, {
        id: carId,
        seriesId: 'series_formula_ford',
        seasonYear: year,
        chassis: row.entry,
        engine: null,
        tireSupplier: null,
        class: className,
        carNumber: row.carNumber,
        entrant: row.entry,
        teamId: null,
        liveryNotes: null,
        provenanceRefs: [sessionEvidenceId]
      });

      upsert(results, {
        id: resultId,
        sessionId,
        driverId,
        teamId: null,
        carId,
        carNumber: row.carNumber,
        class: className,
        gridPosition: null,
        startPosition: null,
        finishPosition: row.finishPosition,
        classifiedPosition: row.classifiedPosition,
        finishPercentile: row.finishPosition && fieldSize ? Number(((fieldSize - row.finishPosition + 1) / fieldSize).toFixed(4)) : null,
        fieldSize,
        classPosition: row.classPosition,
        lapsCompleted: row.lapsCompleted,
        lapsScheduled: null,
        lapsLed: null,
        points: null,
        status: row.status,
        statusRaw: resultStatusLabel(row),
        totalTime: row.totalTime,
        gapToLeader: row.gapToLeader,
        gapToAhead: row.gapToAhead,
        averageSpeed: row.averageSpeedMph,
        averageSpeedUnit: row.averageSpeedMph === null ? null : 'mph',
        bestLapTime: row.bestLapTime,
        bestLapNumber: row.bestLapNumber,
        bestLapRank: null,
        pitStops: null,
        penaltyRefs: [],
        incidentRefs: [],
        sourceResultId: `${source.id}:${parsedSession.sessionSlug}:${row.carNumber}:${row.positionRaw}`,
        raw: {
          sourcePositionRaw: row.positionRaw,
          classRaw: row.classRaw,
          classPosition: row.classPosition,
          entry: row.entry,
          rowValues: row.rawValues,
          pageNumbers: parsedSession.pageNumbers,
          sessionTitle: parsedSession.title
        },
        provenanceRefs: [sessionEvidenceId]
      });
      resultIdsByCarNumber.set(row.carNumber, resultId);
      driverIdsByCarNumber.set(row.carNumber, driverId);
      if (resultIdsByDriverName.has(normalizedName)) duplicateDriverNames.add(normalizedName);
      resultIdsByDriverName.set(normalizedName, resultId);
      report.resultRowsImported += 1;
      if (driverId === 'driver_bryce_aron') report.bryceResultRowsImported += 1;
    }

    const gridPage = gridPagesBySession.get(`${source.id}:${parsedSession.sessionSlug}`);
    if (gridPage) {
      const gridEvidenceId = `source_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_grid`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: gridEvidenceId,
        sourceType: 'official_pdf',
        sourceName: `${source.eventName} ${parsedSession.sessionName} grid`,
        url: source.url,
        retrievedAt,
        coverage: `${source.eventName} ${parsedSession.sessionName} official grid/start positions.`,
        rawArtifactPath: sourcePath(source.textPath),
        notes: `Imported grid rows from PDF page ${gridPage.pageNumber}. Session grid title: ${gridPage.title}.`
      }));

      for (const gridRow of gridPage.rows) {
        let resultId = resultIdsByCarNumber.get(gridRow.carNumber);
        let matchStrategy = 'car_number';
        if (!resultId) {
          const normalizedGridName = identityName(gridRow.driverName);
          const candidateResultId = duplicateDriverNames.has(normalizedGridName)
            ? null
            : resultIdsByDriverName.get(normalizedGridName);
          if (candidateResultId) {
            resultId = candidateResultId;
            matchStrategy = 'driver_name_fallback';
            const result = results.get(resultId);
            report.gridRowsMatchedByDriverName.push({
              sourceId: source.id,
              sessionSlug: parsedSession.sessionSlug,
              sessionName: parsedSession.sessionName,
              pageNumber: gridPage.pageNumber,
              position: gridRow.position,
              gridCarNumber: gridRow.carNumber,
              resultCarNumber: result?.carNumber ?? null,
              driverName: gridRow.driverName,
              reason: 'official_grid_car_number_differs_from_classification_result_car_number'
            });
          }
        }
        if (!resultId) {
          report.gridRowsUnmatched.push({
            sourceId: source.id,
            sessionSlug: parsedSession.sessionSlug,
            sessionName: parsedSession.sessionName,
            pageNumber: gridPage.pageNumber,
            position: gridRow.position,
            carNumber: gridRow.carNumber,
            driverName: gridRow.driverName,
            reason: 'official_grid_row_has_no_imported_classification_result_row'
          });
          continue;
        }
        const result = results.get(resultId);
        upsert(results, {
          ...result,
          gridPosition: gridRow.position,
          startPosition: gridRow.position,
          raw: {
            ...(result?.raw ?? {}),
            gridEvidence: {
              source: 'official_formula_ford_grid_page',
              matchStrategy,
              gridTitle: gridPage.title,
              pageNumber: gridPage.pageNumber,
              carNumber: gridRow.carNumber,
              driverName: gridRow.driverName,
              position: gridRow.position
            }
          },
          provenanceRefs: Array.from(new Set([...(result?.provenanceRefs ?? []), gridEvidenceId]))
        });
        report.gridRowsImported += 1;
      }
    }

    const penaltyNotes = penaltyNotesBySession.get(`${source.id}:${parsedSession.sessionSlug}`) ?? [];
    if (penaltyNotes.length > 0) {
      const penaltyEvidenceId = `source_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_penalty_notes`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: penaltyEvidenceId,
        sourceType: 'official_pdf',
        sourceName: `${source.eventName} ${parsedSession.sessionName} penalty notes`,
        url: source.url,
        retrievedAt,
        coverage: `${source.eventName} ${parsedSession.sessionName} official penalty note rows.`,
        rawArtifactPath: sourcePath(source.textPath),
        notes: `Imported penalty note(s) from PDF page(s) ${Array.from(new Set(penaltyNotes.map((note) => note.pageNumber))).join(', ')}.`
      }));

      for (const note of penaltyNotes) {
        const resultId = resultIdsByCarNumber.get(note.carNumber);
        const driverId = driverIdsByCarNumber.get(note.carNumber);
        if (!resultId || !driverId) {
          report.gaps.push({
            id: `gap_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_penalty_car_${slug(note.carNumber)}_unmatched`,
            scope: 'formula_ford_2020',
            status: 'open',
            description: `Official penalty note could not be linked to an imported result row: ${note.announcementRaw}`
          });
          continue;
        }
        const penaltyId = `penalty_formula_ford_${year}_${source.id}_${parsedSession.sessionSlug}_car_${slug(note.carNumber)}_${note.penaltyType === 'grid_position_loss' ? 'grid_positions' : 'time_seconds'}`;
        upsert(penalties, {
          id: penaltyId,
          sessionId,
          driverId,
          lapNumber: null,
          penaltyType: note.penaltyType,
          reason: note.reason,
          served: null,
          positionImpact: note.positionImpact,
          timeImpactSeconds: note.timeImpactSeconds,
          raw: {
            carNumber: note.carNumber,
            announcement: note.announcementRaw,
            pageNumber: note.pageNumber,
            sessionTitle: parsedSession.title
          },
          provenanceRefs: [source.sourceEvidenceId, penaltyEvidenceId]
        });
        const result = results.get(resultId);
        upsert(results, {
          ...result,
          penaltyRefs: Array.from(new Set([...(result?.penaltyRefs ?? []), penaltyId]))
        });
        report.penaltiesImported += 1;
      }
    }

    const lapAnalyses = lapAnalysesBySession.get(`${source.id}:${parsedSession.sessionSlug}`) ?? [];
    for (const analysis of lapAnalyses) {
      const bryceCarNumber = Array.from(driverIdsByCarNumber.entries()).find(([, driverId]) => driverId === 'driver_bryce_aron')?.[0];
      const resultId = bryceCarNumber ? resultIdsByCarNumber.get(bryceCarNumber) : null;
      const result = resultId ? results.get(resultId) : null;
      if (result?.driverId !== 'driver_bryce_aron') continue;
      const lapEvidenceId = `source_formula_ford_2020_${source.id}_${parsedSession.sessionSlug}_lap_analysis`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: lapEvidenceId,
        sourceType: 'official_pdf',
        sourceName: `${source.eventName} ${parsedSession.sessionName} Bryce Aron lap analysis`,
        url: source.url,
        retrievedAt,
        coverage: `${source.eventName} ${parsedSession.sessionName} official Bryce Aron lap-analysis rows.`,
        rawArtifactPath: sourcePath(source.textPath),
        notes: `Imported Bryce lap-analysis rows from PDF page ${analysis.pageNumber}. Session analysis title: ${analysis.title}. Parser: ${analysis.parser}.`
      }));
      for (const row of analysis.rows) {
        const lapId = `lap_formula_ford_${year}_${source.id}_${parsedSession.sessionSlug}_bryce_aron_${String(row.lapNumber).padStart(3, '0')}`;
        upsert(lapSamples, {
          id: lapId,
          sessionId,
          driverId: 'driver_bryce_aron',
          carId: result.carId ?? null,
          carNumber: result.carNumber ?? null,
          lapNumber: row.lapNumber,
          lapTime: row.lapTime,
          position: null,
          gapToLeader: null,
          gapToAhead: null,
          sector1: null,
          sector2: null,
          sector3: null,
          speedTrap: null,
          flagState: null,
          pitIn: null,
          pitOut: null,
          tireAge: null,
          sourceTimestamp: row.sourceTimestamp,
          class: result.class ?? 'Formula Ford',
          averageSpeedKph: row.averageSpeedMph === null ? null : Number((row.averageSpeedMph * 1.609344).toFixed(3)),
          sessionElapsed: null,
          isValid: Boolean(row.lapTime),
          isSessionBest: row.lapTime === result.bestLapTime,
          isPersonalBest: row.lapTime === result.bestLapTime,
          raw: {
            source: 'Formula Ford official lap analysis page',
            sourceTitle: analysis.title,
            pageNumber: analysis.pageNumber,
            parser: analysis.parser,
            analysisPosition: analysis.analysisPosition,
            averageSpeedMph: row.averageSpeedMph,
            diffToPersonalBest: row.diffToPersonalBest,
            rawTokens: row.rawTokens
          },
          provenanceRefs: [lapEvidenceId]
        });
        report.lapSamplesImported += 1;
        report.bryceLapSamplesImported += 1;
      }
    }
  }

  const bryceFormulaFordResults = Array.from(results.values()).filter((row) => {
    if (row.driverId !== 'driver_bryce_aron') return false;
    const session = sessions.get(row.sessionId);
    return session?.eventId?.startsWith('event_formula_ford_2020_') && ['heat', 'race'].includes(session.sessionType);
  });
  const bryceFormulaFordRaceResults = bryceFormulaFordResults.filter((row) => row.finishPosition !== null || ['dnf', 'dns', 'dsq'].includes(row.status));
  upsert(seasons, {
    id: 'season_formula_ford_2020_bryce_aron',
    year,
    seriesId: 'series_formula_ford',
    driverId: 'driver_bryce_aron',
    teamIds: [],
    carIds: Array.from(new Set(bryceFormulaFordRaceResults.map((row) => row.carId).filter(Boolean))),
    championshipPosition: null,
    points: null,
    starts: bryceFormulaFordRaceResults.length,
    wins: bryceFormulaFordRaceResults.filter((row) => row.finishPosition === 1).length,
    poles: null,
    podiums: bryceFormulaFordRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: bryceFormulaFordRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: bryceFormulaFordRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: bryceFormulaFordRaceResults.filter((row) => row.status !== 'running').length,
    provenanceRefs: sources.map((source) => source.sourceEvidenceId)
  });

  const staleGapIds = new Set([
    'gap_remaining_non_indy_nxt_career_rows',
    'gap_remaining_career_rows_after_imsa',
    'gap_remaining_career_rows_after_track_metadata',
    'gap_remaining_career_rows_after_frp_f1600_2019',
    'gap_remaining_career_rows_after_froc',
    'gap_remaining_career_rows_after_formula_ford_2020',
    'gap_remaining_career_rows_after_formula_ford_2020_refresh'
  ]);
  const currentGaps = asArray(existing.gaps).filter((gap) =>
    !staleGapIds.has(gap.id) &&
    !String(gap.id ?? '').startsWith('gap_formula_ford_2020_')
  );
  const finalResults = Array.from(results.values()).sort((a, b) => a.id.localeCompare(b.id));
  const finalCars = Array.from(cars.values()).sort((a, b) => a.id.localeCompare(b.id));
  report.gridStartHoldouts = finalResults
    .filter((row) => {
      const session = sessions.get(row.sessionId);
      return session?.eventId?.startsWith('event_formula_ford_2020_') &&
        ['race', 'heat'].includes(session.sessionType) &&
        row.gridPosition == null &&
        row.startPosition == null;
    })
    .map((row) => {
      const session = sessions.get(row.sessionId);
      return {
        resultId: row.id,
        sessionId: row.sessionId,
        sessionName: session?.sessionName ?? null,
        carNumber: row.carNumber,
        driverId: row.driverId,
        finishPosition: row.finishPosition,
        reason: 'official_classification_row_has_no_safe_original_grid_start_match'
      };
    });
  if (report.gridStartHoldouts.length > 0) {
    report.gaps.push({
      id: 'gap_formula_ford_2020_grid_start_source_asymmetry_holdouts',
      scope: 'series_formula_ford:2020:grid_start_positions',
      status: 'open',
      description: `Formula Ford 2020 official grid/start import is complete for ${report.gridRowsImported} race/heat rows. The remaining ${report.gridStartHoldouts.length} classified race/heat rows are held out because the official source family exposes reserve-only entries, restart-grid-only positions, or original-grid rows that do not safely match the classified driver/car row. These rows remain explicit holdouts instead of guessed grid/start positions. Lap-analysis imports remain scoped to Bryce-labeled blocks; continuation pages without a repeated Bryce label stay held out until a layout-aware parser can match them deterministically.`,
      provenanceRefs: sources.map((source) => source.sourceEvidenceId),
      raw: {
        resultIds: report.gridStartHoldouts.map((row) => row.resultId),
        holdouts: report.gridStartHoldouts,
        lapAnalysisScope: 'bryce_labeled_blocks_only',
        lapAnalysisHoldoutReason: 'continuation_pages_without_repeated_bryce_label_are_not_matched'
      }
    });
  }
  const referencedDriverIds = new Set([
    ...finalResults.map((row) => row.driverId).filter(Boolean),
    ...finalCars.map((row) => row.driverId).filter(Boolean)
  ]);
  for (const staleDriverId of ['driver_h', 'driver_o', 'driver_p', 'driver_jc', 'driver_ch', 'driver_sca', 'driver_scb', 'driver_scc', 'driver_scd', 'driver_sce']) {
    if (!referencedDriverIds.has(staleDriverId)) drivers.delete(staleDriverId);
  }

  const dataset = {
    schemaVersion: 'bryce-career.v1',
    updatedAt: retrievedAt,
    drivers: Array.from(drivers.values()).sort((a, b) => a.id.localeCompare(b.id)),
    series: Array.from(series.values()).sort((a, b) => a.id.localeCompare(b.id)),
    teams: Array.from(teams.values()).sort((a, b) => a.id.localeCompare(b.id)),
    cars: finalCars,
    tracks: Array.from(tracks.values()).sort((a, b) => a.id.localeCompare(b.id)),
    seasons: Array.from(seasons.values()).sort((a, b) => a.id.localeCompare(b.id)),
    events: Array.from(events.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    results: finalResults,
    qualifyingResults: asArray(existing.qualifyingResults),
    lapSamples: Array.from(lapSamples.values()).sort((a, b) => a.id.localeCompare(b.id)),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: Array.from(penalties.values()).sort((a, b) => a.id.localeCompare(b.id)),
    incidents: asArray(existing.incidents),
    weatherObservations: Array.from(weatherObservations.values()).sort((a, b) => a.id.localeCompare(b.id)),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: [
      ...currentGaps,
      ...report.gaps,
      {
        id: 'gap_remaining_career_rows_after_formula_ford_2020_refresh',
        scope: 'career_dataset',
        status: 'open',
        description: 'Broad historical-tail placeholder, not a UI-readiness blocker. Remaining optional or metric-specific work includes pre-2019 karting race-by-race records, early-career Formula Ford appearances outside the imported official books, future imported-track metadata, non-official ambient weather outside current exact-window scope, and future derived benchmark models. Current production caveats are tracked by specific gap IDs.'
      }
    ]
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: {
      drivers: dataset.drivers.length,
      series: dataset.series.length,
      cars: dataset.cars.length,
      tracks: dataset.tracks.length,
      seasons: dataset.seasons.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      lapSamples: dataset.lapSamples.length,
      formulaFordGridRowsImported: report.gridRowsImported,
      penalties: dataset.penalties.length,
      weatherObservations: dataset.weatherObservations.length,
      mediaAssets: dataset.mediaAssets.length,
      sourceEvidence: dataset.sourceEvidence.length,
      gaps: dataset.gaps.length
    },
    importReport: report
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
