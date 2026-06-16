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
const rawDir = join(root, 'data/career/raw/frp-f1600');
const reportPath = join(root, 'data/career/reports/frp-f1600-import-report.json');

const year = 2019;
const seriesId = 'series_frp_f1600';
const seasonId = 'season_frp_f1600_2019_bryce_aron';
const archiveUrl = 'https://www.racefrp.com/results-archive/f1600';
const standingsUrl = 'https://www.racefrp.com/standings';
const seasonRecapUrl = 'https://www.racefrp.com/f1600-news/2019-season-news-and-recap';
const pointsPdfUrl =
  'https://cdn.prod.website-files.com/5e6065f5b2e7eb7c7741994a/5e6065f5b2e7ebeb26419ba1_F1600_Season_Points_NJMP_with_DROPS_2019(1).pdf';
const timezone = 'America/New_York';
const pdftotextPath = '/opt/homebrew/bin/pdftotext';

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const concurrency = Math.max(1, Number(argValue('concurrency', '8')));
const retries = Math.max(0, Number(argValue('retries', '2')));
const refresh = process.argv.includes('--refresh');

const monthByName = new Map([
  ['jan', 1],
  ['january', 1],
  ['feb', 2],
  ['february', 2],
  ['mar', 3],
  ['march', 3],
  ['apr', 4],
  ['april', 4],
  ['may', 5],
  ['jun', 6],
  ['june', 6],
  ['jul', 7],
  ['july', 7],
  ['aug', 8],
  ['august', 8],
  ['sep', 9],
  ['sept', 9],
  ['september', 9],
  ['oct', 10],
  ['october', 10],
  ['nov', 11],
  ['november', 11],
  ['dec', 12],
  ['december', 12]
]);

const trackProfiles = {
  road_atlanta: {
    id: 'track_michelin_raceway_road_atlanta',
    name: 'Michelin Raceway Road Atlanta',
    canonicalName: 'Michelin Raceway Road Atlanta',
    aliases: ['Road Atlanta', 'Michelin Raceway Road Atlanta', 'FRP at ROAD ATLANTA 2019'],
    expectedPdfAliases: ['ROAD ATLANTA', 'Michelin Raceway Road Atlanta'],
    lengthMi: 2.54,
    city: 'Braselton',
    region: 'Georgia'
  },
  watkins_glen_international: {
    id: 'track_watkins_glen_international',
    name: 'Watkins Glen International',
    canonicalName: 'Watkins Glen International',
    aliases: ['Watkins Glen International', 'Watkins Glen', 'FRP at WATKINS GLEN'],
    expectedPdfAliases: ['WATKINS GLEN', 'Watkins Glen'],
    lengthMi: 3.37,
    city: 'Watkins Glen',
    region: 'New York'
  },
  mid_ohio_sports_car_course: {
    id: 'track_mid_ohio_sports_car_course',
    name: 'Mid-Ohio Sports Car Course',
    canonicalName: 'Mid-Ohio Sports Car Course',
    aliases: ['Mid Ohio Sports Car Course', 'Mid-Ohio', 'FRP ALL FORMULA WEEKEND 2019'],
    expectedPdfAliases: ['Mid-Ohio', 'MIDOHIO'],
    lengthMi: 2.258,
    city: 'Lexington',
    region: 'Ohio'
  },
  virginia_international_raceway: {
    id: 'track_virginia_international_raceway',
    name: 'Virginia International Raceway',
    canonicalName: 'Virginia International Raceway',
    aliases: ['Virginia International Raceway', 'VIR', 'FRP at VIR 2019'],
    expectedPdfAliases: ['VIR', 'Virginia International Raceway'],
    lengthMi: 3.27,
    city: 'Alton',
    region: 'Virginia'
  },
  pittsburgh_international_race_complex: {
    id: 'track_pittsburgh_international_race_complex',
    name: 'Pittsburgh International Race Complex',
    canonicalName: 'Pittsburgh International Race Complex',
    aliases: ["Pittsburgh International Race Complex", "Pittsburgh Int'l Complex", 'PITT RACE'],
    expectedPdfAliases: ['PITT RACE', "Pittsburgh Int'l Complex"],
    lengthMi: 2.8,
    city: 'Wampum',
    region: 'Pennsylvania'
  },
  summit_point: {
    id: 'track_summit_point_motorsports_park',
    name: 'Summit Point Motorsports Park',
    canonicalName: 'Summit Point Motorsports Park',
    aliases: ['Summit Point', 'Summit Point Motorsports Park', 'FRP at SUMMIT POINT with KARTS'],
    expectedPdfAliases: ['SUMMIT POINT', 'Summit Point'],
    lengthMi: 2.0,
    city: 'Summit Point',
    region: 'West Virginia'
  },
  new_jersey_motorsports_park: {
    id: 'track_new_jersey_motorsports_park_thunderbolt',
    name: 'New Jersey Motorsports Park Thunderbolt',
    canonicalName: 'New Jersey Motorsports Park Thunderbolt',
    aliases: ['New Jersey Motorsports Park', 'NJMP', 'New Jersey Thunderbolt MtrspPk'],
    expectedPdfAliases: ['NJMP', 'New Jersey Thunderbolt'],
    lengthMi: 2.25,
    city: 'Millville',
    region: 'New Jersey'
  }
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const uniqueRowsById = (rows) => Array.from(new Map(rows.filter((row) => row?.id).map((row) => [row.id, row])).values());
const safeNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.+-]/g, ''));
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

const cleanDriverName = (value) => String(value ?? '').replace(/\/M$/i, '').trim();

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
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response;
  } catch (error) {
    if (attempt >= retries) throw error;
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
  if (Object.hasOwn(row, 'derivedFromSessionIds')) merged.derivedFromSessionIds = row.derivedFromSessionIds;
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
  accessedBy: 'scripts/import-frp-f1600-career.mjs',
  licenseNotes: 'Public official FRP timing pages/PDFs; store extracted facts, provenance, and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-frp-f1600-career.mjs',
  rawArtifactPath,
  notes,
  provenanceRefs: []
});

const parseEventDateRange = (dateParts) => {
  const end = String(dateParts[1] ?? '');
  const endMatch = end.match(/([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  const startMatch = String(dateParts[0] ?? '').match(/([A-Za-z]+)\s+(\d{1,2})/);
  if (!endMatch || !startMatch) return { eventStartDate: null, eventEndDate: null };
  const yearValue = Number(endMatch[3]);
  const startMonth = monthByName.get(startMatch[1].toLowerCase());
  const endMonth = monthByName.get(endMatch[1].toLowerCase());
  const pad = (number) => String(number).padStart(2, '0');
  return {
    eventStartDate: `${yearValue}-${pad(startMonth)}-${pad(startMatch[2])}`,
    eventEndDate: `${yearValue}-${pad(endMonth)}-${pad(endMatch[2])}`
  };
};

const parseArchiveEvents = (html) => {
  const section = html.match(
    /<h2[^>]*>2019 Results<\/h2>[\s\S]*?(?=<section class="standard-section"><div class="half-div-wide-mobile"><h2[^>]*>2018 Results<\/h2>)/
  )?.[0];
  if (!section) throw new Error('Could not locate 2019 Results section on FRP F1600 archive.');
  return section
    .split('<div role="listitem" class="w-dyn-item">')
    .slice(1)
    .map((item, eventIndex) => {
      const eventName = (item.match(/<h3[^>]*>(.*?)<\/h3>/)?.[1] ?? '').replace(/<[^>]+>/g, '').trim();
      const dateParts = [...item.matchAll(/<div class="event-date white">(.*?)<\/div>/g)].map((match) =>
        match[1].replace(/<[^>]+>/g, '').trim()
      );
      const eventSlug = slug(eventName);
      const trackProfile = trackProfiles[eventSlug];
      if (!trackProfile) throw new Error(`Unmapped FRP F1600 2019 event track: ${eventName}`);
      const links = [...item.matchAll(/href="([^"]+)"[^>]*class="archive-results-link[^>]*>([^<]*)/g)]
        .map((match) => ({
          label: match[2].trim(),
          url: match[1].replace(/&amp;/g, '&')
        }))
        .filter((link) => link.url !== '#');
      return {
        eventIndex,
        eventName,
        eventSlug,
        trackProfile,
        ...parseEventDateRange(dateParts),
        links
      };
    });
};

const sessionType = (label, headerLine) => {
  if (/race/i.test(label) || /Race \(/i.test(headerLine)) return 'race';
  if (/qual/i.test(label)) return 'qualifying';
  if (/practice/i.test(label)) return 'practice';
  return 'unknown';
};

const raceNumber = (label) => {
  const match = String(label).match(/Race\s+(\d+)/i);
  return match ? Number(match[1]) : null;
};

const parseLocalDateTime = (text) => {
  const match = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)\b/i);
  if (!match) return null;
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const ampm = match[6].toUpperCase();
  if (ampm === 'PM' && hour !== 12) hour += 12;
  if (ampm === 'AM' && hour === 12) hour = 0;
  return `${match[3]}-${String(match[1]).padStart(2, '0')}-${String(match[2]).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
};

const parseStartedAt = (text, localDateTime) => {
  if (!localDateTime) return null;
  const match = text.match(/\b(?:Race|Practice|Qualifying) started at (\d{1,2}):(\d{2}):(\d{2})\b/i);
  if (!match) return null;
  return `${localDateTime.slice(0, 10)}T${String(match[1]).padStart(2, '0')}:${match[2]}:${match[3]}`;
};

const parseLapsScheduled = (text) => {
  const match = text.match(/Race \((?:\d+:\d+\s+or\s+)?(\d+)\s+Laps\)/i);
  return match ? Number(match[1]) : null;
};

const sourceSessionLabelToSessionId = (entries, entry, sourceSession) => {
  const practiceMatch = sourceSession?.match(/\bPractice\s+(\d+)\b/i);
  if (!practiceMatch) return null;
  const sourceEntry = entries.find((candidate) =>
    candidate.event.eventIndex === entry.event.eventIndex &&
    new RegExp(`\\bPractice\\s+${practiceMatch[1]}\\b`, 'i').test(candidate.link.label ?? '')
  );
  return sourceEntry
    ? `session_frp_f1600_${year}_r${sourceEntry.event.eventIndex + 1}_${sourceEntry.sessionSlug}`
    : null;
};

const parsePdfMetadata = (text) => {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find((line) => /\bPos\b/.test(line) && /\bName\b/.test(line));
  if (!headerLine) throw new Error('Missing timing row header.');
  const topBlock = lines.slice(0, Math.max(6, lines.indexOf(headerLine))).join('\n');
  const firstLine = lines.find((line) => line.trim())?.trim() ?? '';
  const trackLine = lines.find((line) => /F1600 Championship Series/.test(line) && /\d+\.\d+\s+miles/.test(line)) ?? '';
  const lengthMi = safeNumber(trackLine.match(/(\d+\.\d+)\s+miles/i)?.[1]);
  const localDateTime = parseLocalDateTime(topBlock);
  const mode = /Overall BestTm/.test(headerLine)
    ? 'combined'
    : /\bLaps\b/.test(headerLine) && /\bPoints\b/.test(headerLine)
      ? 'race'
      : 'timed';
  return {
    lines,
    headerLine,
    topBlock,
    firstLine,
    trackLine,
    lengthMi,
    localDateTime,
    actualStart: parseStartedAt(topBlock, localDateTime),
    lapsScheduled: parseLapsScheduled(topBlock),
    mode,
    classFirst: headerLine.indexOf('Class') < headerLine.indexOf('No.')
  };
};

const splitNameSponsor = (before) => {
  const parts = before.trim().split(/\s{2,}/).filter(Boolean);
  return { nameRaw: parts.shift() ?? '', sponsor: parts.join(' ') || null };
};

const parseTimingRow = (line, mode, classFirst) => {
  const left = classFirst
    ? line.match(/^\s*(?<position>\d+|DQ|DNF|DNS)\s+(?<classRaw>F16M?|F1600)\s+(?<carNumber>\S+)\s+(?<rest>.+?)\s*$/)
    : line.match(/^\s*(?<position>\d+|DQ|DNF|DNS)\s+(?<carNumber>\S+)\s+(?<classRaw>F16M?|F1600)\s+(?<rest>.+?)\s*$/);
  if (!left) return null;
  const { position, carNumber, classRaw, rest } = left.groups;
  let match;

  if (mode === 'race') {
    match = rest.match(/^(?<before>.*?)(?:\s+(?<laps>\d+))?\s+(?:(?<best>\d+:\d{2}\.\d{3})\s+)?(?<points>\d+)\s*(?<make>[A-Za-z].*)?$/);
    if (!match) return null;
    return {
      position,
      carNumber,
      classRaw,
      ...splitNameSponsor(match.groups.before),
      laps: match.groups.laps ?? null,
      best: match.groups.best ?? null,
      points: match.groups.points ?? null,
      make: (match.groups.make ?? '').trim() || null
    };
  }

  if (mode === 'combined') {
    match = rest.match(/^(?<before>.*?)\s+(?<best>\d+:\d{2}\.\d{3})\s+(?<sourceSession>F1600\s+.+)$/);
    if (!match) return null;
    return {
      position,
      carNumber,
      classRaw,
      ...splitNameSponsor(match.groups.before),
      laps: null,
      best: match.groups.best,
      bestLap: null,
      points: null,
      make: null,
      sourceSession: match.groups.sourceSession
    };
  }

  match = rest.match(/^(?<before>.*?)\s+(?<best>\d+:\d{2}\.\d{3})\s+(?<bestLap>\d+)\s*(?<make>[A-Za-z].*)?$/);
  if (match) {
    return {
      position,
      carNumber,
      classRaw,
      ...splitNameSponsor(match.groups.before),
      laps: null,
      best: match.groups.best,
      bestLap: match.groups.bestLap,
      points: null,
      make: (match.groups.make ?? '').trim() || null
    };
  }

  match = rest.match(/^(?<before>.*?)\s+0\s*(?<make>[A-Za-z].*)?$/);
  if (!match) return null;
  return {
    position,
    carNumber,
    classRaw,
    ...splitNameSponsor(match.groups.before),
    laps: null,
    best: null,
    bestLap: null,
    points: null,
    make: (match.groups.make ?? '').trim() || null,
    rawNoTimeIndicator: '0'
  };
};

const parseRows = (metadata) => {
  const rowLines = metadata.lines.filter((line) => /^\s*(?:\d+|DQ|DNF|DNS)\s+/.test(line));
  const rows = rowLines.map((line) => ({ line, parsed: parseTimingRow(line, metadata.mode, metadata.classFirst) }));
  const failures = rows.filter((row) => !row.parsed);
  return {
    rowCount: rows.length,
    failures,
    rows: rows.filter((row) => row.parsed).map((row) => row.parsed)
  };
};

const parsePenaltyAnnouncements = (metadata) =>
  metadata.lines.flatMap((line) => {
    const match = line.match(/\bCar\s+(?<carNumber>\S+)\s+loses\s+(?<positions>\d+)\s+grid positions?\s+for\s+(?<reason>.+?)\s*$/i);
    if (!match) return [];
    return [{
      carNumber: match.groups.carNumber,
      penaltyType: 'grid_position_loss',
      positionImpact: -Number(match.groups.positions),
      reason: match.groups.reason.trim(),
      announcementRaw: line.trim()
    }];
  });

const eventMatchesPdf = (event, metadata) => {
  const haystack = `${metadata.firstLine}\n${metadata.trackLine}`.toLowerCase();
  return event.trackProfile.expectedPdfAliases.some((alias) => haystack.includes(alias.toLowerCase()));
};

const dateWithinEvent = (localDateTime, event) => {
  if (!localDateTime) return true;
  const date = localDateTime.slice(0, 10);
  return (!event.eventStartDate || date >= event.eventStartDate) && (!event.eventEndDate || date <= event.eventEndDate);
};

const statusCategory = (position) => {
  const value = String(position ?? '').toLowerCase();
  if (/^\d+$/.test(value)) return 'running';
  if (value === 'dq') return 'dsq';
  if (value === 'dnf') return 'dnf';
  if (value === 'dns') return 'dns';
  return 'unknown';
};

const parsePosition = (position) => (/^\d+$/.test(String(position ?? '')) ? Number(position) : null);

const makeParts = (make) => {
  const parts = String(make ?? '').split('/').map((part) => part.trim()).filter(Boolean);
  return {
    chassis: parts[0] ?? null,
    engine: parts.slice(1).join('/') || null
  };
};

const parseSeasonStanding = (pointsText) => {
  const line = pointsText.split(/\r?\n/).find((row) => /^\s*Bryce Aron\s+/.test(row));
  if (!line) return { points: null, position: null, rowRaw: null };
  const tail = line.match(/\s+(\d+)\s+(\d+)\s*$/);
  return {
    points: tail ? Number(tail[1]) : null,
    position: tail ? Number(tail[2]) : null,
    rowRaw: line.trim()
  };
};

const sameDayOrNull = (value) => value ?? null;

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });
  if (!(await fileExists(pdftotextPath))) {
    throw new Error(`pdftotext not found at ${pdftotextPath}. Install Poppler or adjust import-frp-f1600-career.mjs.`);
  }

  const existing = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const ownedPenaltyPrefix = `penalty_frp_f1600_${year}_`;
  const sourceEvidenceMap = new Map(asArray(existing.sourceEvidence).map((row) => [row.id, row]));
  const drivers = new Map(asArray(existing.drivers).map((row) => [row.id, row]));
  const series = new Map(asArray(existing.series).map((row) => [row.id, row]));
  const teams = new Map(asArray(existing.teams).map((row) => [row.id, row]));
  const cars = new Map(asArray(existing.cars).map((row) => [row.id, row]));
  const tracks = new Map(asArray(existing.tracks).map((row) => [row.id, row]));
  const seasons = new Map(asArray(existing.seasons).map((row) => [row.id, row]));
  const events = new Map(asArray(existing.events).map((row) => [row.id, row]));
  const sessions = new Map(asArray(existing.sessions).map((row) => [row.id, row]));
  const results = new Map(asArray(existing.results).map((row) => [row.id, {
    ...row,
    penaltyRefs: asArray(row.penaltyRefs).filter((ref) => !String(ref).startsWith(ownedPenaltyPrefix))
  }]));
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));
  const penalties = new Map(
    asArray(existing.penalties)
      .filter((row) => !String(row.id ?? '').startsWith(ownedPenaltyPrefix))
      .map((row) => [row.id, row])
  );

  const importReport = {
    checkedAt: retrievedAt,
    year,
    refresh,
    concurrency,
    fetched: 0,
    cached: 0,
    archiveEventsDiscovered: 0,
    pdfsDiscovered: 0,
    pdfsImported: 0,
    pdfsStagedOnly: 0,
    sessionsImported: 0,
    resultsImported: 0,
    bryceResultsImported: 0,
    raceResultsImported: 0,
    bryceRaceResultsImported: 0,
    mediaAssetsImported: 0,
    penaltiesImported: 0,
    seasonStandingRowsParsed: 0,
    rawArtifacts: [],
    parserValidation: [],
    gaps: []
  };

  const archivePath = join(rawDir, '2019-f1600-results-archive.html');
  const standingsPath = join(rawDir, '2019-frp-standings-page.html');
  const recapPath = join(rawDir, '2019-f1600-season-recap.html');
  const [archiveResult, standingsResult, recapResult] = await Promise.all([
    fetchTextCached(archiveUrl, archivePath),
    fetchTextCached(standingsUrl, standingsPath),
    fetchTextCached(seasonRecapUrl, recapPath)
  ]);
  for (const result of [archiveResult, standingsResult, recapResult]) importReport[result.fromCache ? 'cached' : 'fetched'] += 1;
  importReport.rawArtifacts.push(
    archivePath.replace(`${root}/`, ''),
    standingsPath.replace(`${root}/`, ''),
    recapPath.replace(`${root}/`, '')
  );

  const archiveEvents = parseArchiveEvents(archiveResult.payload);
  importReport.archiveEventsDiscovered = archiveEvents.length;

  const archiveInventoryPath = join(rawDir, '2019-archive-inventory.json');
  await writeFile(
    archiveInventoryPath,
    `${JSON.stringify(
      archiveEvents.map((event) => ({
        eventName: event.eventName,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        links: event.links
      })),
      null,
      2
    )}\n`
  );
  importReport.rawArtifacts.push(archiveInventoryPath.replace(`${root}/`, ''));

  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_frp_f1600_2019_archive',
    sourceType: 'official_page',
    sourceName: 'FRP F1600 2019 Results Archive',
    url: archiveUrl,
    retrievedAt,
    coverage: 'Official FRP F1600 2019 event list and linked session PDFs.',
    rawArtifactPath: archivePath.replace(`${root}/`, ''),
    notes: 'Used for event discovery and source URLs. Row data is imported from linked official PDFs.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_frp_f1600_2019_standings_page',
    sourceType: 'official_page',
    sourceName: 'FRP standings page',
    url: standingsUrl,
    retrievedAt,
    coverage: 'Official FRP standings page linking the 2019 F1600 points PDF.',
    rawArtifactPath: standingsPath.replace(`${root}/`, ''),
    notes: 'Discovery route for the season points PDF.'
  }));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_frp_f1600_2019_season_recap',
    sourceType: 'official_page',
    sourceName: 'FRP 2019 F1600 season news and recap',
    url: seasonRecapUrl,
    retrievedAt,
    coverage: 'Official FRP narrative recap confirming the 2019 championship podium and Bryce Aron as K-Hill.',
    rawArtifactPath: recapPath.replace(`${root}/`, ''),
    notes: 'Used as cross-check for Bryce championship position and K-Hill team context.'
  }));

  upsert(series, {
    id: seriesId,
    name: 'F1600 Championship Series',
    category: 'formula',
    ladderLevel: 'North American junior open-wheel',
    governingBody: 'Formula Race Promotions',
    countryScope: 'United States',
    officialWebsite: 'https://www.racefrp.com/',
    externalIds: { frpArchivePath: '/results-archive/f1600' },
    provenanceRefs: ['source_frp_f1600_2019_archive']
  });

  upsert(teams, {
    id: 'team_k_hill_motorsports',
    name: 'K-Hill Motorsports',
    seriesIds: [seriesId],
    country: 'United States',
    officialWebsite: null,
    provenanceRefs: ['source_frp_f1600_2019_season_recap']
  });

  for (const event of archiveEvents) {
    const { trackProfile } = event;
    upsert(tracks, {
      id: trackProfile.id,
      name: trackProfile.name,
      canonicalName: trackProfile.canonicalName,
      country: 'United States',
      region: trackProfile.region,
      city: trackProfile.city,
      latitude: null,
      longitude: null,
      timezone,
      trackType: 'road',
      configuration: /thunderbolt/i.test(trackProfile.name) ? 'Thunderbolt' : null,
      lengthKm: trackProfile.lengthMi ? Number((trackProfile.lengthMi * 1.609344).toFixed(3)) : null,
      lengthMi: trackProfile.lengthMi,
      direction: 'unknown',
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: trackProfile.aliases,
      provenanceRefs: ['source_frp_f1600_2019_archive']
    });

    upsert(events, {
      id: `event_frp_f1600_${year}_r${event.eventIndex + 1}_${event.eventSlug}`,
      seriesId,
      seasonYear: year,
      name: `FRP F1600 ${year} Round ${event.eventIndex + 1} - ${event.eventName}`,
      round: event.eventIndex + 1,
      eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate,
      trackId: trackProfile.id,
      country: 'United States',
      officialEventId: null,
      provenanceRefs: ['source_frp_f1600_2019_archive']
    });
  }

  const pdfEntries = archiveEvents.flatMap((event) =>
    event.links.map((link, linkIndex) => {
      const sessionSlug = slug(`${String(linkIndex + 1).padStart(2, '0')}_${link.label || basename(new URL(link.url).pathname)}`);
      return {
        event,
        link,
        linkIndex,
        sessionSlug,
        pdfPath: join(rawDir, `2019-${String(event.eventIndex + 1).padStart(2, '0')}-${event.eventSlug}-${sessionSlug}.pdf`),
        textPath: join(rawDir, `2019-${String(event.eventIndex + 1).padStart(2, '0')}-${event.eventSlug}-${sessionSlug}.txt`)
      };
    })
  );
  importReport.pdfsDiscovered = pdfEntries.length;

  const parsedEntries = await mapLimit(pdfEntries, concurrency, async (entry) => {
    const pdfResult = await fetchBinaryCached(entry.link.url, entry.pdfPath);
    importReport[pdfResult.fromCache ? 'cached' : 'fetched'] += 1;
    const textResult = await pdfToTextCached(entry.pdfPath, entry.textPath);
    importReport[textResult.fromCache ? 'cached' : 'fetched'] += 1;
    importReport.rawArtifacts.push(entry.pdfPath.replace(`${root}/`, ''), entry.textPath.replace(`${root}/`, ''));
    const metadata = parsePdfMetadata(textResult.payload);
    const parsedRows = parseRows(metadata);
    return { ...entry, metadata, parsedRows };
  });

  for (const entry of parsedEntries) {
    const eventId = `event_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.event.eventSlug}`;
    const sessionId = `session_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}`;
    const evidenceId = `source_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_pdf`;
    const assetId = `asset_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_pdf`;
    const relativePdf = entry.pdfPath.replace(`${root}/`, '');
    const relativeText = entry.textPath.replace(`${root}/`, '');
    const stype = sessionType(entry.link.label, entry.metadata.topBlock);
    const eventMatch = eventMatchesPdf(entry.event, entry.metadata);
    const dateMatch = dateWithinEvent(entry.metadata.localDateTime, entry.event);
    const parserOk = entry.parsedRows.failures.length === 0 && entry.parsedRows.rows.length > 0;
    const isAggregateClassification = entry.metadata.mode === 'combined';
    const derivedFromSessionIds = isAggregateClassification
      ? Array.from(new Set(entry.parsedRows.rows
        .map((row) => sourceSessionLabelToSessionId(parsedEntries, entry, row.sourceSession))
        .filter(Boolean))).sort()
      : [];

    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceType: 'official_pdf',
      sourceName: `FRP F1600 ${year} ${entry.event.eventName} ${entry.link.label || basename(new URL(entry.link.url).pathname)} PDF`,
      url: entry.link.url,
      retrievedAt,
      coverage: eventMatch && dateMatch
        ? `${entry.event.eventName} ${entry.link.label} official timing rows.`
        : `Staged official archive-linked PDF with event/date mismatch against ${entry.event.eventName}.`,
      rawArtifactPath: relativePdf,
      notes: `Text extraction: ${relativeText}. Header track line: ${entry.metadata.trackLine.trim()}`
    }));

    upsert(mediaAssets, {
      id: assetId,
      assetType: 'pdf',
      title: `FRP F1600 ${year} ${entry.event.eventName} ${entry.link.label || 'session'} timing PDF`,
      url: entry.link.url,
      rightsStatus: 'link_only',
      publishedAt: sameDayOrNull(entry.metadata.localDateTime),
      eventId: eventMatch && dateMatch ? eventId : null,
      sessionId: eventMatch && dateMatch && parserOk ? sessionId : null,
      driverId: null,
      summary: eventMatch && dateMatch
        ? `Official FRP F1600 timing PDF for ${entry.event.eventName} ${entry.link.label}.`
        : `Archive-linked PDF preserved but not attributed because PDF header/date does not match ${entry.event.eventName}.`,
      quoteText: null,
      provenanceRefs: ['source_frp_f1600_2019_archive', evidenceId]
    });
    importReport.mediaAssetsImported += 1;

    importReport.parserValidation.push({
      event: entry.event.eventName,
      label: entry.link.label,
      url: entry.link.url,
      mode: entry.metadata.mode,
      rowCount: entry.parsedRows.rowCount,
      parsedRows: entry.parsedRows.rows.length,
      parserFailures: entry.parsedRows.failures.length,
      penaltyAnnouncementsParsed: parsePenaltyAnnouncements(entry.metadata).length,
      eventMatch,
      dateMatch,
      scheduledStart: entry.metadata.localDateTime,
      trackLine: entry.metadata.trackLine.trim()
    });

    if (!eventMatch || !dateMatch) {
      importReport.pdfsStagedOnly += 1;
      const gapId = `gap_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_pdf_event_mismatch`;
      const isKnownPittsburghQualifyingMismatch = gapId === 'gap_frp_f1600_2019_r5_01_qualifying_pdf_event_mismatch';
      importReport.gaps.push({
        id: gapId,
        scope: 'frp_f1600_2019',
        status: 'open',
        description: isKnownPittsburghQualifyingMismatch
          ? `FRP archive labels ${entry.event.eventName} ${entry.link.label}, but the linked PDF header/date indicates a different event (${entry.metadata.firstLine}; ${entry.metadata.trackLine.trim()}; ${entry.metadata.localDateTime ?? 'no session time'}). The correct Pittsburgh qualifying PDF was not found on the official archive route, so rows were staged but not imported.`
          : `FRP archive labels ${entry.event.eventName} ${entry.link.label}, but the linked PDF header/date indicates a different event (${entry.metadata.firstLine}; ${entry.metadata.trackLine.trim()}; ${entry.metadata.localDateTime ?? 'no session time'}). Rows were staged but not imported.`,
        raw: {
          archiveUrl,
          linkedPdfUrl: entry.link.url,
          expectedEvent: entry.event.eventName,
          expectedSession: entry.link.label,
          observedHeader: entry.metadata.firstLine,
          observedTrackLine: entry.metadata.trackLine.trim(),
          observedStart: entry.metadata.localDateTime ?? null,
          unavailableReason: isKnownPittsburghQualifyingMismatch
            ? 'official_archive_link_points_to_summit_point_qualifying_pdf'
            : 'official_archive_link_pdf_event_or_date_mismatch'
        }
      });
      continue;
    }

    if (!parserOk) {
      importReport.pdfsStagedOnly += 1;
      importReport.gaps.push({
        id: `gap_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_parser`,
        scope: 'frp_f1600_2019',
        status: 'open',
        description: `FRP F1600 ${entry.event.eventName} ${entry.link.label} PDF was fetched and text-extracted, but parser confidence was insufficient.`
      });
      continue;
    }

    upsert(sessions, {
      id: sessionId,
      eventId,
      sessionType: stype,
      sessionName: entry.link.label || entry.metadata.topBlock.split(/\r?\n/).find((line) => /F1600/.test(line))?.trim() || 'Session',
      raceNumber: raceNumber(entry.link.label),
      scheduledStart: entry.metadata.localDateTime,
      actualStart: entry.metadata.actualStart,
      timezone,
      timePrecision: isAggregateClassification ? 'not_applicable' : (entry.metadata.localDateTime ? 'local_datetime' : 'unknown'),
      timeWindowApplicability: isAggregateClassification ? 'not_applicable_aggregate_classification' : 'physical_session',
      weatherJoinEligible: !isAggregateClassification,
      derivedFromSessionIds,
      lapsScheduled: entry.metadata.lapsScheduled,
      distanceScheduled: null,
      status: /final/i.test(entry.metadata.topBlock) ? 'official' : 'provisional',
      officialSessionId: null,
      weatherObservationRefs: [],
      ingestionState: 'official_pdf',
      broadcastRouteRefs: [],
      notificationRefs: [],
      raw: {
        archiveLabel: entry.link.label,
        pdfFirstLine: entry.metadata.firstLine,
        pdfTrackLine: entry.metadata.trackLine.trim(),
        pdfMode: entry.metadata.mode,
        aggregateClassificationNote: isAggregateClassification
          ? 'Combined P1/P2 classification PDF. No separate qualifying session window is published; use derivedFromSessionIds for underlying on-track windows.'
          : null,
        sourceFileName: basename(new URL(entry.link.url).pathname)
      },
      provenanceRefs: ['source_frp_f1600_2019_archive', evidenceId]
    });
    importReport.pdfsImported += 1;
    importReport.sessionsImported += 1;

    const fieldSize = entry.parsedRows.rows.length;
    const resultIdsByCarNumber = new Map();
    const driverIdsByCarNumber = new Map();
    for (const row of entry.parsedRows.rows) {
      const displayName = cleanDriverName(row.nameRaw);
      const driverId = /^bryce\s+aron$/i.test(displayName) ? 'driver_bryce_aron' : `driver_${slug(displayName || row.carNumber)}`;
      const finish = parsePosition(row.position);
      const status = statusCategory(row.position);
      const teamId = driverId === 'driver_bryce_aron' ? 'team_k_hill_motorsports' : null;
      const { chassis, engine } = makeParts(row.make);
      const carId = `car_frp_f1600_${year}_${driverId}_${slug(row.carNumber)}`;
      const resultId = `result_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_${driverId}_${slug(row.carNumber)}`;
      const carNumberKey = String(row.carNumber ?? '').trim();
      resultIdsByCarNumber.set(carNumberKey, resultId);
      driverIdsByCarNumber.set(carNumberKey, driverId);

      upsert(drivers, {
        id: driverId,
        displayName: displayName || row.nameRaw,
        givenName: displayName ? displayName.split(/\s+/)[0] : null,
        familyName: displayName ? displayName.split(/\s+/).slice(1).join(' ') || null : null,
        nationality: driverId === 'driver_bryce_aron' ? 'United States' : null,
        hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, IL' : null,
        dateOfBirth: null,
        externalIds: {},
        provenanceRefs: [evidenceId]
      });

      upsert(cars, {
        id: carId,
        seriesId,
        seasonYear: year,
        chassis,
        engine,
        tireSupplier: null,
        class: row.classRaw,
        carNumber: String(row.carNumber ?? ''),
        entrant: row.sponsor,
        teamId,
        liveryNotes: null,
        provenanceRefs: [evidenceId]
      });

      upsert(results, {
        id: resultId,
        sessionId,
        driverId,
        teamId,
        carId,
        carNumber: String(row.carNumber ?? ''),
        class: row.classRaw,
        gridPosition: null,
        startPosition: null,
        finishPosition: finish,
        classifiedPosition: finish,
        finishPercentile: finish && fieldSize ? Number(((fieldSize - finish + 1) / fieldSize).toFixed(4)) : null,
        fieldSize,
        lapsCompleted: safeNumber(row.laps),
        lapsScheduled: entry.metadata.lapsScheduled,
        lapsLed: null,
        points: safeNumber(row.points),
        status,
        statusRaw: row.position,
        totalTime: null,
        gapToLeader: null,
        gapToAhead: null,
        averageSpeed: null,
        bestLapTime: row.best,
        bestLapNumber: safeNumber(row.bestLap),
        bestLapRank: null,
        pitStops: null,
        penaltyRefs: [],
        incidentRefs: [],
        sourceResultId: `${entry.event.eventSlug}:${entry.sessionSlug}:${row.position}:${row.carNumber}:${displayName}`,
        raw: {
          driverNameRaw: row.nameRaw,
          sponsor: row.sponsor,
          makeModel: row.make,
          sourceSession: row.sourceSession ?? null,
          noTimeIndicator: row.rawNoTimeIndicator ?? null,
          rowParserMode: entry.metadata.mode,
          sourceLineClass: row.classRaw
        },
        provenanceRefs: [evidenceId]
      });
      importReport.resultsImported += 1;
      if (stype === 'race') importReport.raceResultsImported += 1;
      if (driverId === 'driver_bryce_aron') {
        importReport.bryceResultsImported += 1;
        if (stype === 'race') importReport.bryceRaceResultsImported += 1;
      }
    }

    for (const penalty of parsePenaltyAnnouncements(entry.metadata)) {
      const resultId = resultIdsByCarNumber.get(penalty.carNumber);
      const result = resultId ? results.get(resultId) : null;
      const driverId = driverIdsByCarNumber.get(penalty.carNumber);
      if (!result || !driverId) {
        importReport.gaps.push({
          id: `gap_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_penalty_car_${slug(penalty.carNumber)}_unmatched`,
          scope: 'frp_f1600_2019',
          status: 'open',
          description: `Official penalty announcement could not be linked to an imported result row: ${penalty.announcementRaw}`
        });
        continue;
      }

      const penaltyId = `penalty_frp_f1600_${year}_r${entry.event.eventIndex + 1}_${entry.sessionSlug}_car_${slug(penalty.carNumber)}_grid_positions`;
      upsert(penalties, {
        id: penaltyId,
        sessionId,
        driverId,
        lapNumber: null,
        penaltyType: penalty.penaltyType,
        reason: penalty.reason,
        served: null,
        positionImpact: penalty.positionImpact,
        timeImpactSeconds: null,
        raw: {
          carNumber: penalty.carNumber,
          announcement: penalty.announcementRaw,
          sourceFileName: basename(new URL(entry.link.url).pathname)
        },
        provenanceRefs: [evidenceId]
      });
      results.set(resultId, {
        ...result,
        penaltyRefs: Array.from(new Set([...(result.penaltyRefs ?? []), penaltyId]))
      });
      importReport.penaltiesImported += 1;
    }
  }

  const pointsPdfPath = join(rawDir, '2019-f1600-season-points.pdf');
  const pointsTextPath = join(rawDir, '2019-f1600-season-points.txt');
  const pointsPdfResult = await fetchBinaryCached(pointsPdfUrl, pointsPdfPath);
  importReport[pointsPdfResult.fromCache ? 'cached' : 'fetched'] += 1;
  const pointsTextResult = await pdfToTextCached(pointsPdfPath, pointsTextPath);
  importReport[pointsTextResult.fromCache ? 'cached' : 'fetched'] += 1;
  importReport.rawArtifacts.push(pointsPdfPath.replace(`${root}/`, ''), pointsTextPath.replace(`${root}/`, ''));

  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_frp_f1600_2019_points_pdf',
    sourceType: 'official_pdf',
    sourceName: 'FRP F1600 2019 season points PDF',
    url: pointsPdfUrl,
    retrievedAt,
    coverage: 'Official 2019 F1600 season points summary with drops.',
    rawArtifactPath: pointsPdfPath.replace(`${root}/`, ''),
    notes: 'Used for Bryce Aron final points and championship position.'
  }));

  upsert(mediaAssets, {
    id: 'asset_frp_f1600_2019_points_pdf',
    assetType: 'pdf',
    title: 'FRP F1600 2019 season points PDF',
    url: pointsPdfUrl,
    rightsStatus: 'link_only',
    publishedAt: null,
    eventId: null,
    sessionId: null,
    driverId: null,
    summary: 'Official FRP F1600 2019 season points PDF with drops.',
    quoteText: null,
    provenanceRefs: ['source_frp_f1600_2019_standings_page', 'source_frp_f1600_2019_points_pdf']
  });

  const seasonStanding = parseSeasonStanding(pointsTextResult.payload);
  if (seasonStanding.rowRaw) importReport.seasonStandingRowsParsed = 1;
  const bryceRaceRows = Array.from(results.values()).filter(
    (row) =>
      row.driverId === 'driver_bryce_aron' &&
      String(row.sessionId).startsWith(`session_frp_f1600_${year}_`) &&
      sessions.get(row.sessionId)?.sessionType === 'race'
  );
  const bryceAllRows = Array.from(results.values()).filter(
    (row) => row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith(`session_frp_f1600_${year}_`)
  );
  const bryceCarIds = Array.from(new Set(bryceAllRows.map((row) => row.carId).filter(Boolean)));
  upsert(seasons, {
    id: seasonId,
    year,
    seriesId,
    driverId: 'driver_bryce_aron',
    teamIds: ['team_k_hill_motorsports'],
    carIds: bryceCarIds,
    championshipPosition: seasonStanding.position,
    points: seasonStanding.points,
    starts: bryceRaceRows.filter((row) => row.status !== 'dns').length,
    wins: bryceRaceRows.filter((row) => row.finishPosition === 1).length,
    poles: bryceAllRows.filter((row) => sessions.get(row.sessionId)?.sessionType === 'qualifying' && row.finishPosition === 1).length,
    podiums: bryceRaceRows.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: bryceRaceRows.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: bryceRaceRows.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: bryceRaceRows.filter((row) => ['dnf', 'dsq'].includes(row.status)).length,
    raw: {
      raceEntries: bryceRaceRows.length,
      dns: bryceRaceRows.filter((row) => row.status === 'dns').length,
      seasonPointsRow: seasonStanding.rowRaw
    },
    provenanceRefs: ['source_frp_f1600_2019_points_pdf', 'source_frp_f1600_2019_season_recap']
  });

  const currentGaps = asArray(existing.gaps).filter(
    (gap) =>
      ![
        'gap_non_indy_nxt_career_rows',
        'gap_remaining_non_indy_nxt_career_rows',
        'gap_remaining_career_rows_after_imsa',
        'gap_remaining_career_rows_after_frp_f1600_2019'
      ].includes(gap.id) &&
      !String(gap.id ?? '').startsWith(`gap_frp_f1600_${year}_`)
  );
  const remainingCareerGap = {
    id: 'gap_remaining_career_rows_after_frp_f1600_2019',
    scope: 'career_dataset',
    status: 'open',
    description:
      'Later source families, karting race-by-race records, media narrative beyond imported Team USA 2020 context and structured Team USA/Badger Kart Club milestone and record facts, non-official ambient weather enrichment, session-window precision, and track metadata for future imported tracks remain open. FRP F1600 2019 session PDFs, 2 official qualifying grid-position penalties, and season points are imported except one archive-linked Pittsburgh qualifying PDF that points to Summit Point.'
  };

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
    qualifyingResults: asArray(existing.qualifyingResults),
    lapSamples: asArray(existing.lapSamples),
    racecraftEvents: asArray(existing.racecraftEvents),
    penalties: Array.from(penalties.values()).sort((a, b) => a.id.localeCompare(b.id)),
    incidents: asArray(existing.incidents),
    weatherObservations: asArray(existing.weatherObservations),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    broadcastRoutes: asArray(existing.broadcastRoutes),
    notificationRules: asArray(existing.notificationRules),
    notificationEvents: asArray(existing.notificationEvents),
    derivedMetrics: asArray(existing.derivedMetrics),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: uniqueRowsById([...currentGaps, ...importReport.gaps, remainingCareerGap])
  };

  await writeFile(datasetPath, `${JSON.stringify(dataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(importReport, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    counts: {
      drivers: dataset.drivers.length,
      series: dataset.series.length,
      teams: dataset.teams.length,
      cars: dataset.cars.length,
      tracks: dataset.tracks.length,
      seasons: dataset.seasons.length,
      events: dataset.events.length,
      sessions: dataset.sessions.length,
      results: dataset.results.length,
      mediaAssets: dataset.mediaAssets.length,
      sourceEvidence: dataset.sourceEvidence.length,
      gaps: dataset.gaps.length
    },
    importReport
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
