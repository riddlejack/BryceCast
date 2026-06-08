import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/froc-2024');
const reportPath = join(root, 'data/career/reports/froc-2024-import-report.json');
const execFileAsync = promisify(execFile);
const pdfToTextPath = '/opt/homebrew/bin/pdftotext';

const year = 2024;
const baseUrl = 'https://www.toyota.co.nz';
const calendarConfirmedUrl =
  'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2023/march/2024-formula-regional-oceania-championship-dates-and-tracks-confirmed/';
const refresh = process.argv.includes('--refresh');

const rounds = [
  {
    number: 1,
    slug: 'round-1-taupo',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/round-1-taupo/',
    officialStartDate: '2024-01-19',
    officialEndDate: '2024-01-21',
    trackId: 'track_taupo_international_motorsport_park',
    trackName: 'Taupo International Motorsport Park',
    city: 'Taupo',
    region: 'Waikato',
    lengthKm: 3.32,
    direction: 'unknown',
    configuration: null
  },
  {
    number: 2,
    slug: 'round-2-manfeild',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-02/',
    officialStartDate: '2024-01-26',
    officialEndDate: '2024-01-28',
    trackId: 'track_manfeild_circuit_chris_amon',
    trackName: 'Manfeild - Circuit Chris Amon',
    city: 'Feilding',
    region: 'Manawatu-Wanganui',
    lengthKm: 3.0,
    direction: 'unknown',
    configuration: null
  },
  {
    number: 3,
    slug: 'round-3-hampton-downs',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-03/',
    officialStartDate: '2024-02-02',
    officialEndDate: '2024-02-04',
    trackId: 'track_hampton_downs_motorsport_park',
    trackName: 'Hampton Downs Motorsport Park',
    city: 'Waikato',
    region: 'Waikato',
    lengthKm: 4.0,
    direction: 'unknown',
    configuration: 'International circuit'
  },
  {
    number: 4,
    slug: 'round-4-euromarque',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-04/',
    officialStartDate: '2024-02-09',
    officialEndDate: '2024-02-11',
    trackId: 'track_euromarque_motorsport_park',
    trackName: 'Euromarque Motorsport Park',
    city: 'Christchurch',
    region: 'Canterbury',
    lengthKm: 3.3,
    direction: 'unknown',
    configuration: 'GP Circuit'
  },
  {
    number: 5,
    slug: 'round-5-highlands',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/calendar-results/2024-season/24-season-round-052/',
    officialStartDate: '2024-02-16',
    officialEndDate: '2024-02-18',
    trackId: 'track_highlands_motorsport_park',
    trackName: 'Highlands Motorsport Park',
    city: 'Cromwell',
    region: 'Otago',
    lengthKm: 4.1,
    direction: 'Clockwise',
    configuration: null
  }
];

const countryNames = {
  AUS: 'Australia',
  BRA: 'Brazil',
  CAN: 'Canada',
  HKG: 'Hong Kong',
  KOR: 'South Korea',
  NZL: 'New Zealand',
  POL: 'Poland',
  USA: 'United States'
};

const monthNumber = {
  january: '01',
  february: '02'
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const safeNumber = (value) => {
  const parsed = Number(String(value ?? '').replace(/[^\d.+-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const slug = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');

const pad2 = (value) => String(value).padStart(2, '0');

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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchText = async (url, attempt = 0) => {
  try {
    const response = await fetch(url, {
      headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    return response.text();
  } catch (error) {
    if (attempt >= 2) throw error;
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

const fetchBinaryCached = async (url, path) => {
  if (!refresh) {
    try {
      const cached = await readFile(path);
      if (cached.length > 0) return { fromCache: true };
    } catch {}
  }
  const response = await fetch(url, {
    headers: {
      accept: 'application/pdf,*/*;q=0.8'
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return { fromCache: false };
};

const pdfTextCached = async (pdfPath, textPath) => {
  if (!refresh) {
    const cached = await readTextIfExists(textPath, null);
    if (cached) return { text: cached, fromCache: true };
  }
  const { stdout } = await execFileAsync(pdfToTextPath, [pdfPath, '-']);
  await writeFile(textPath, stdout);
  return { text: stdout, fromCache: false };
};

const decodeEntities = (value = '') => {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '...',
    ldquo: '"',
    lsquo: "'",
    lt: '<',
    mdash: '-',
    nbsp: ' ',
    ndash: '-',
    quot: '"',
    rdquo: '"',
    rsquo: "'"
  };
  return String(value)
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, valueHex) => String.fromCharCode(Number.parseInt(valueHex, 16)))
    .replace(/&#(\d+);/g, (_, valueDec) => String.fromCharCode(Number(valueDec)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
};

const stripTags = (value = '') =>
  decodeEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const attrValue = (tag, attr) => {
  const match = tag.match(new RegExp(`${attr}="([^"]*)"`, 'i'));
  return match ? stripTags(match[1]) : null;
};

const absoluteUrl = (url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `${baseUrl}${url}`;
  return `${baseUrl}/${url}`;
};

const extractFirstText = (html, regex) => {
  const match = html.match(regex);
  return match ? stripTags(match[1]) : null;
};

const extractDateRangeFromTitle = (title) => {
  const match = String(title ?? '').match(/(\d{1,2})\s*-\s*(\d{1,2})\s+(January|February)\s+2024/i);
  if (!match) return null;
  const month = monthNumber[match[3].toLowerCase()];
  return {
    startDate: `2024-${month}-${pad2(match[1])}`,
    endDate: `2024-${month}-${pad2(match[2])}`,
    sourceText: match[0]
  };
};

const parseCells = (rowHtml, tagName) =>
  [...rowHtml.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi'))].map((match) => stripTags(match[1]));

const parseTable = (tableHtml) => {
  const headers = parseCells(tableHtml, 'th');
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => parseCells(match[1], 'td'))
    .filter((cells) => cells.length > 0)
    .map((cells) => {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? '';
      });
      return row;
    });
  return { headers, rows };
};

const tabLabelFromId = (id) => {
  const match = String(id ?? '').match(/1-2024-\d+-(.+)-tab$/);
  if (!match) return id;
  return match[1]
    .replace(/([A-Za-z])(\d+)/g, '$1 $2')
    .replace(/GridR/g, 'Grid R')
    .trim();
};

const parseTabs = (html) => {
  const matches = [...html.matchAll(/<div\b(?=[^>]*\brole="tabpanel")[^>]*>/gi)];
  return matches.flatMap((match, index) => {
    const next = matches[index + 1];
    const contentStart = match.index + match[0].length;
    const content = html.slice(contentStart, next ? next.index : html.indexOf('<script', contentStart));
    const tableHtml = content.match(/<table[\s\S]*?<\/table>/i)?.[0];
    if (!tableHtml) return [];
    const id = attrValue(match[0], 'id');
    const label = attrValue(match[0], 'aria-labelledby') ?? tabLabelFromId(id);
    const parsedTable = parseTable(tableHtml);
    return [{
      id,
      label,
      type: sessionType(label),
      ordinal: sessionOrdinal(label),
      headers: parsedTable.headers,
      rows: parsedTable.rows
    }];
  });
};

const parseMediaLinks = (html) => {
  const pdfLinks = [...html.matchAll(/<a\b[^>]*href="([^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    assetType: 'pdf',
    label: stripTags(match[2]),
    url: absoluteUrl(match[1])
  }));
  const images = [...html.matchAll(/image-url="([^"]+)"[\s\S]*?image-alt="([^"]*)"/gi)].map((match) => ({
    assetType: 'image',
    label: stripTags(match[2]),
    url: absoluteUrl(match[1])
  }));
  return [...pdfLinks, ...images];
};

const sessionType = (label) => {
  const value = String(label ?? '').toLowerCase();
  if (value.startsWith('race')) return 'race';
  if (value.startsWith('qualifying')) return 'qualifying';
  if (value.startsWith('practice')) return 'practice';
  if (value.startsWith('test')) return 'test';
  if (value.startsWith('grid')) return 'grid';
  return 'unknown';
};

const sessionOrdinal = (label) => {
  const match = String(label ?? '').match(/(\d+)/);
  return match ? Number(match[1]) : null;
};

const isClassificationTable = (headers) => {
  const normalized = headers.map((header) => header.toLowerCase());
  return normalized.includes('pos') && normalized.includes('name') && normalized.includes('no.');
};

const isGridTable = (headers) => {
  const normalized = headers.map((header) => header.toLowerCase());
  return normalized.includes('start pos') && normalized.includes('name') && normalized.includes('no.');
};

const parsePosition = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : null);

const parseStartingGridPdfText = (text) => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const startIndex = lines.findIndex((line) => /POLE POSITION/i.test(line));
  const body = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
  const rows = [];

  for (let index = 0; index < body.length; index += 1) {
    const position = parsePosition(body[index]);
    if (!position) continue;

    let nextIndex = index + 1;
    let carLine = body[nextIndex];
    if (/^\d+$/.test(carLine ?? '') && /^\d+\s+[A-Za-z]/.test(body[nextIndex + 1] ?? '')) {
      nextIndex += 1;
      carLine = body[nextIndex];
    }

    const carMatch = String(carLine ?? '').match(/^(\d+)\s+(.+)$/);
    if (!carMatch) continue;

    rows.push({
      startPosition: position,
      carNumber: carMatch[1],
      driverName: carMatch[2].trim()
    });
    index = nextIndex;
  }

  return rows;
};

const statusCategory = (position, diff) => {
  const value = `${position ?? ''} ${diff ?? ''}`.toLowerCase();
  if (/^\d+$/.test(String(position ?? '').trim())) return 'running';
  if (value.includes('dnf')) return 'dnf';
  if (value.includes('dns')) return 'dns';
  if (value.includes('dq') || value.includes('dsq')) return 'dsq';
  return 'unknown';
};

const splitName = (name) => {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    givenName: parts[0] ?? null,
    familyName: parts.length > 1 ? parts.slice(1).join(' ') : null
  };
};

const driverIdFor = (name) => (/^bryce\s+aron$/i.test(String(name ?? '').trim()) ? 'driver_bryce_aron' : `driver_${slug(name)}`);

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
  accessedBy: 'scripts/import-froc-2024-career.mjs',
  licenseNotes: 'Public official Toyota New Zealand result pages; store extracted facts, links, and raw HTML artifacts.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/import-froc-2024-career.mjs',
  rawArtifactPath,
  notes
});

const tableEvidenceId = (roundNumber, tabLabel) => `source_froc_2024_r${roundNumber}_${slug(tabLabel)}_html_table`;
const pageEvidenceId = (roundNumber) => `source_froc_2024_r${roundNumber}_toyota_page`;
const sessionIdFor = (roundNumber, tabLabel) => `session_froc_2024_r${roundNumber}_${slug(tabLabel)}`;
const eventIdFor = (roundNumber, trackName) => `event_froc_2024_r${roundNumber}_${slug(trackName)}`;

const main = async () => {
  await mkdir(rawDir, { recursive: true });
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
  const results = new Map(asArray(existing.results).map((row) => [row.id, row]));
  const mediaAssets = new Map(asArray(existing.mediaAssets).map((row) => [row.id, row]));
  for (const id of mediaAssets.keys()) {
    if (String(id).startsWith('asset_froc_2024_')) mediaAssets.delete(id);
  }

  const report = {
    checkedAt: retrievedAt,
    year,
    refresh,
    fetched: 0,
    cached: 0,
    roundsDiscovered: rounds.length,
    tablesExtracted: 0,
    tableRowsExtracted: 0,
    sessionsImported: 0,
    classificationRowsImported: 0,
    raceRowsImported: 0,
    bryceRowsImported: 0,
    bryceRaceRowsImported: 0,
    gridRowsPreserved: 0,
    gridPdfRowsImported: 0,
    mediaAssetsImported: 0,
    dateConflicts: [],
    rawArtifacts: [],
    gaps: []
  };

  const calendarPath = join(rawDir, 'official-2024-calendar-confirmed.html');
  const calendarResult = await fetchTextCached(calendarConfirmedUrl, calendarPath);
  report[calendarResult.fromCache ? 'cached' : 'fetched'] += 1;
  report.rawArtifacts.push(calendarPath.replace(`${root}/`, ''));
  upsert(sourceEvidenceMap, sourceEvidence({
    id: 'source_froc_2024_calendar_confirmed',
    sourceType: 'official_page',
    sourceName: 'Toyota NZ 2024 Formula Regional Oceania dates and tracks announcement',
    url: calendarConfirmedUrl,
    retrievedAt,
    coverage: 'Official 2024 round dates and tracks used to cross-check Toyota result page titles.',
    rawArtifactPath: calendarPath.replace(`${root}/`, ''),
    notes: 'This official Toyota NZ article places Euromarque Motorsport Park on 9-11 February 2024 and Highlands Motorsport Park on 16-18 February 2024.'
  }));

  upsert(series, {
    id: 'series_froc',
    name: 'Castrol Toyota Formula Regional Oceania Championship',
    category: 'formula',
    ladderLevel: 'FIA-certified Formula Regional winter series',
    governingBody: 'Toyota Gazoo Racing New Zealand',
    countryScope: 'New Zealand / Oceania',
    officialWebsite: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/',
    externalIds: { toyotaSeason: String(year) },
    provenanceRefs: ['source_froc_2024_calendar_confirmed']
  });

  const extractedRounds = [];

  for (const round of rounds) {
    const htmlPath = join(rawDir, `${round.slug}.html`);
    const extractedPath = join(rawDir, `${round.slug}.extracted.json`);
    const htmlResult = await fetchTextCached(round.url, htmlPath);
    report[htmlResult.fromCache ? 'cached' : 'fetched'] += 1;
    report.rawArtifacts.push(htmlPath.replace(`${root}/`, ''));

    const html = htmlResult.payload;
    const title = extractFirstText(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const canonicalUrl = attrValue(html.match(/<link\b[^>]*rel="canonical"[^>]*>/i)?.[0] ?? '', 'href') ?? round.url;
    const pageDateRange = extractDateRangeFromTitle(title);
    const dateConflict = Boolean(
      pageDateRange &&
      (pageDateRange.startDate !== round.officialStartDate || pageDateRange.endDate !== round.officialEndDate)
    );
    if (dateConflict) {
      report.dateConflicts.push({
        round: round.number,
        pageTitle: title,
        pageStartDate: pageDateRange.startDate,
        pageEndDate: pageDateRange.endDate,
        officialStartDate: round.officialStartDate,
        officialEndDate: round.officialEndDate,
        officialCalendarEvidence: 'source_froc_2024_calendar_confirmed'
      });
    }

    const tabs = parseTabs(html);
    const mediaLinks = parseMediaLinks(html);
    const extracted = {
      round: round.number,
      url: round.url,
      canonicalUrl,
      title,
      officialStartDate: round.officialStartDate,
      officialEndDate: round.officialEndDate,
      pageDateRange,
      dateConflict,
      track: {
        id: round.trackId,
        name: round.trackName,
        city: round.city,
        region: round.region,
        lengthKm: round.lengthKm,
        direction: round.direction,
        configuration: round.configuration
      },
      mediaLinks,
      tabs
    };
    await writeFile(extractedPath, `${JSON.stringify(extracted, null, 2)}\n`);
    report.rawArtifacts.push(extractedPath.replace(`${root}/`, ''));
    extractedRounds.push(extracted);

    const pageSourceId = pageEvidenceId(round.number);
    upsert(sourceEvidenceMap, sourceEvidence({
      id: pageSourceId,
      sourceType: 'official_page',
      sourceName: `Toyota NZ FROC 2024 Round ${round.number} results page`,
      url: round.url,
      retrievedAt,
      coverage: `${round.trackName} round page with server-rendered result tables and media links.`,
      rawArtifactPath: htmlPath.replace(`${root}/`, ''),
      notes: dateConflict
        ? 'Page title date conflicts with Toyota NZ 2024 dates announcement; normalized event dates use the announcement and raw page title is preserved.'
        : 'Primary official Toyota NZ HTML source for this round.'
    }));

    upsert(tracks, {
      id: round.trackId,
      name: round.trackName,
      canonicalName: round.trackName,
      country: 'New Zealand',
      region: round.region,
      city: round.city,
      latitude: null,
      longitude: null,
      timezone: 'Pacific/Auckland',
      trackType: 'road',
      configuration: round.configuration,
      lengthKm: round.lengthKm,
      lengthMi: round.lengthKm ? Number((round.lengthKm * 0.621371).toFixed(3)) : null,
      direction: round.direction,
      surface: null,
      elevationM: null,
      cornerCount: null,
      passingDifficulty: null,
      brakingSeverity: null,
      temporary: false,
      altitudeM: null,
      aliases: Array.from(new Set([round.trackName, `${round.trackName}, ${round.city}`].filter(Boolean))),
      provenanceRefs: [pageSourceId, 'source_froc_2024_calendar_confirmed']
    });

    const eventId = eventIdFor(round.number, round.trackName);
    upsert(events, {
      id: eventId,
      seriesId: 'series_froc',
      seasonYear: year,
      name: `FROC ${year} Round ${round.number} - ${round.trackName}`,
      round: round.number,
      eventStartDate: round.officialStartDate,
      eventEndDate: round.officialEndDate,
      trackId: round.trackId,
      country: 'New Zealand',
      officialEventId: canonicalUrl,
      raw: {
        toyotaPageTitle: title,
        toyotaPageDateRange: pageDateRange,
        officialCalendarDateRange: {
          startDate: round.officialStartDate,
          endDate: round.officialEndDate
        },
        dateConflictFlag: dateConflict
      },
      provenanceRefs: [pageSourceId, 'source_froc_2024_calendar_confirmed']
    });

    for (const media of mediaLinks) {
      const labelSlug = slug(media.label || media.url);
      const assetId = `asset_froc_2024_r${round.number}_${labelSlug}`;
      const sessionTab = tabs.find((tab) => slug(tab.label) === labelSlug || slug(tab.label).replace(/^qualifying/, 'qualy') === labelSlug);
      const mediaSessionId = sessionTab && sessionTab.type !== 'grid' ? sessionIdFor(round.number, sessionTab.label) : null;
      upsert(mediaAssets, {
        id: assetId,
        assetType: media.assetType,
        title: `FROC ${year} Round ${round.number} ${media.label || media.assetType}`,
        url: media.url,
        rightsStatus: 'link_only',
        publishedAt: null,
        eventId,
        sessionId: mediaSessionId,
        driverId: null,
        summary: `Official Toyota NZ ${media.assetType} link from Round ${round.number} results page.`,
        quoteText: null,
        provenanceRefs: [pageSourceId]
      });
      report.mediaAssetsImported += 1;
    }

    const gridsByRaceAndCar = new Map();
    for (const tab of tabs.filter((candidate) => candidate.type === 'grid')) {
      const gridSourceId = tableEvidenceId(round.number, tab.label);
      upsert(sourceEvidenceMap, sourceEvidence({
        id: gridSourceId,
        sourceType: 'official_page',
        sourceName: `Toyota NZ FROC 2024 Round ${round.number} ${tab.label} HTML grid table`,
        url: `${round.url}#${tab.id}`,
        retrievedAt,
        coverage: `${round.trackName} ${tab.label} official starting-grid table rows.`,
        rawArtifactPath: extractedPath.replace(`${root}/`, ''),
        notes: 'Server-rendered Toyota NZ grid table parsed from the official round page.'
      }));

      if (!isGridTable(tab.headers)) {
        report.gaps.push({
          id: `gap_froc_2024_r${round.number}_${slug(tab.label)}_unexpected_grid_headers`,
          scope: 'froc_2024',
          status: 'open',
          description: `Toyota Round ${round.number} ${tab.label} grid table headers were not in the expected Start Pos/Name/No. shape.`
        });
        continue;
      }
      for (const row of tab.rows) {
        const key = `${tab.ordinal}:${row['No.'] || slug(row.Name)}`;
        gridsByRaceAndCar.set(key, {
          startPosition: parsePosition(row['Start Pos']),
          driverName: row.Name,
          carNumber: row['No.'],
          source: 'Toyota HTML Grid tab',
          sourceEvidenceId: gridSourceId
        });
        report.gridRowsPreserved += 1;
      }
    }

    for (const media of mediaLinks.filter((asset) => asset.assetType === 'pdf' && /^Grid\s+R\d+$/i.test(asset.label ?? ''))) {
      const raceOrdinal = sessionOrdinal(media.label);
      if (!raceOrdinal) continue;

      const labelSlug = slug(media.label);
      const pdfPath = join(rawDir, `${round.slug}-${labelSlug}.pdf`);
      const textPath = join(rawDir, `${round.slug}-${labelSlug}.txt`);
      const pdfResult = await fetchBinaryCached(media.url, pdfPath);
      report[pdfResult.fromCache ? 'cached' : 'fetched'] += 1;
      const textResult = await pdfTextCached(pdfPath, textPath);
      if (textResult.fromCache) report.cached += 1;
      report.rawArtifacts.push(pdfPath.replace(`${root}/`, ''), textPath.replace(`${root}/`, ''));

      const evidenceId = `source_froc_2024_r${round.number}_${labelSlug}_toyota_pdf`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: evidenceId,
        sourceType: 'official_pdf',
        sourceName: `Toyota NZ FROC 2024 Round ${round.number} ${media.label} starting grid PDF`,
        url: media.url,
        retrievedAt,
        coverage: `${round.trackName} ${media.label} official starting grid.`,
        rawArtifactPath: pdfPath.replace(`${root}/`, ''),
        notes: `Parsed official starting-grid rows from PDF text artifact ${textPath.replace(`${root}/`, '')}.`
      }));

      const parsedGridRows = parseStartingGridPdfText(textResult.text);
      for (const row of parsedGridRows) {
        const key = `${raceOrdinal}:${row.carNumber}`;
        if (gridsByRaceAndCar.has(key)) continue;
        gridsByRaceAndCar.set(key, {
          ...row,
          source: `Toyota ${media.label} PDF`,
          sourceUrl: media.url,
          sourceEvidenceId: evidenceId
        });
        report.gridPdfRowsImported += 1;
      }
    }

    for (const tab of tabs) {
      report.tablesExtracted += 1;
      report.tableRowsExtracted += tab.rows.length;

      if (tab.type === 'grid') continue;
      if (!isClassificationTable(tab.headers)) {
        report.gaps.push({
          id: `gap_froc_2024_r${round.number}_${slug(tab.label)}_unexpected_headers`,
          scope: 'froc_2024',
          status: 'open',
          description: `Toyota Round ${round.number} ${tab.label} table headers were not in a supported classification shape.`
        });
        continue;
      }

      const sessionSourceId = tableEvidenceId(round.number, tab.label);
      upsert(sourceEvidenceMap, sourceEvidence({
        id: sessionSourceId,
        sourceType: 'official_page',
        sourceName: `Toyota NZ FROC 2024 Round ${round.number} ${tab.label} HTML table`,
        url: `${round.url}#${tab.id}`,
        retrievedAt,
        coverage: `${round.trackName} ${tab.label} full-field table rows.`,
        rawArtifactPath: extractedPath.replace(`${root}/`, ''),
        notes: 'Server-rendered Toyota NZ table parsed from the official round page.'
      }));

      const sessionId = sessionIdFor(round.number, tab.label);
      const raceNumber = tab.type === 'race' && tab.ordinal ? (round.number - 1) * 3 + tab.ordinal : null;
      upsert(sessions, {
        id: sessionId,
        eventId,
        sessionType: tab.type,
        sessionName: tab.label,
        raceNumber,
        scheduledStart: null,
        actualStart: null,
        timezone: 'Pacific/Auckland',
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'official',
        officialSessionId: tab.id,
        weatherObservationRefs: [],
        ingestionState: 'official',
        broadcastRouteRefs: [],
        notificationRefs: [],
        raw: {
          toyotaTabId: tab.id,
          toyotaHeaders: tab.headers,
          rowCount: tab.rows.length,
          pageDateConflictFlag: dateConflict
        },
        provenanceRefs: [pageSourceId, sessionSourceId]
      });
      report.sessionsImported += 1;

      const fieldSize = tab.rows.length;
      for (const row of tab.rows) {
        const driverName = row.Name;
        const driverId = driverIdFor(driverName);
        const nameParts = splitName(driverName);
        const carNumber = String(row['No.'] ?? '');
        const carId = carNumber ? `car_froc_${year}_${slug(carNumber)}` : null;
        const position = parsePosition(row.Pos);
        const grid = tab.type === 'race' ? gridsByRaceAndCar.get(`${tab.ordinal}:${carNumber}`) : null;
        const countryCode = row.Country || null;

        upsert(drivers, {
          id: driverId,
          displayName: driverName,
          givenName: nameParts.givenName,
          familyName: nameParts.familyName,
          nationality: countryNames[countryCode] ?? countryCode,
          hometown: driverId === 'driver_bryce_aron' ? 'Winnetka, IL' : null,
          dateOfBirth: null,
          externalIds: {
            froc2024CountryCode: countryCode,
            froc2024CarNumbers: carNumber ? [carNumber] : []
          },
          provenanceRefs: [sessionSourceId]
        });

        if (carId) {
          upsert(cars, {
            id: carId,
            seriesId: 'series_froc',
            seasonYear: year,
            chassis: 'Toyota FT60',
            engine: null,
            tireSupplier: null,
            class: 'Formula Regional Oceania',
            carNumber,
            entrant: null,
            teamId: null,
            liveryNotes: null,
            provenanceRefs: [sessionSourceId]
          });
        }

        upsert(results, {
          id: `result_froc_${year}_r${round.number}_${slug(tab.label)}_${driverId}`,
          sessionId,
          driverId,
          teamId: null,
          carId,
          carNumber,
          class: 'Formula Regional Oceania',
          gridPosition: grid?.startPosition ?? null,
          startPosition: grid?.startPosition ?? null,
          finishPosition: position,
          classifiedPosition: position,
          finishPercentile: position && fieldSize ? Number(((fieldSize - position + 1) / fieldSize).toFixed(4)) : null,
          fieldSize,
          lapsCompleted: safeNumber(row.Laps),
          lapsScheduled: null,
          lapsLed: null,
          points: null,
          status: statusCategory(row.Pos, row.Diff),
          statusRaw: row.Pos ?? null,
          totalTime: null,
          gapToLeader: row.Diff || null,
          gapToAhead: null,
          averageSpeed: null,
          bestLapTime: row['Best Time'] || null,
          bestLapNumber: null,
          bestLapRank: null,
          pitStops: null,
          penaltyRefs: [],
          incidentRefs: [],
          sourceResultId: `${round.number}:${tab.id}:${carNumber || slug(driverName)}`,
          raw: {
            toyotaRound: round.number,
            toyotaSessionLabel: tab.label,
            toyotaTabId: tab.id,
            countryCode,
            pageDateConflictFlag: dateConflict,
            gridEvidence: grid ?? null
          },
          provenanceRefs: Array.from(new Set([sessionSourceId, grid?.sourceEvidenceId].filter(Boolean)))
        });
        report.classificationRowsImported += 1;
        if (tab.type === 'race') report.raceRowsImported += 1;
        if (driverId === 'driver_bryce_aron') {
          report.bryceRowsImported += 1;
          if (tab.type === 'race') report.bryceRaceRowsImported += 1;
        }
      }
    }
  }

  if (report.dateConflicts.length > 0) {
    report.gaps.push({
      id: 'gap_froc_2024_round_4_date_conflict',
      scope: 'froc_2024',
      status: 'open',
      description: 'Toyota Round 4 results page title says 16-18 February 2024, while Toyota 2024 dates announcement places Euromarque Motorsport Park on 9-11 February 2024. Normalized event dates use 9-11 February and preserve the page-title conflict in event raw data.'
    });
  }
  report.gaps.push({
    id: 'gap_froc_2024_session_times_missing',
    scope: 'froc_2024',
    status: 'open',
    description: 'Toyota HTML result pages expose event date ranges and result tables but not exact per-session timestamps, so FROC sessions retain timezone and event dates but scheduledStart remains null.'
  });
  report.gaps.push({
    id: 'gap_froc_2024_start_positions_partial',
    scope: 'froc_2024',
    status: 'open',
    description: 'Toyota HTML Grid tabs and linked official grid PDFs are normalized where present. Some start positions are absent from official page grid tabs/PDF links in the primary HTML import and require downstream official article/PDF backfills before they are production-ready.'
  });

  const bryceFrocRaceResults = Array.from(results.values()).filter(
    (row) => row.driverId === 'driver_bryce_aron' && String(row.sessionId).startsWith('session_froc_2024_') && sessions.get(row.sessionId)?.sessionType === 'race'
  );
  upsert(seasons, {
    id: 'season_froc_2024_bryce_aron',
    year,
    seriesId: 'series_froc',
    driverId: 'driver_bryce_aron',
    teamIds: [],
    carIds: Array.from(new Set(bryceFrocRaceResults.map((row) => row.carId).filter(Boolean))),
    championshipPosition: null,
    points: null,
    starts: bryceFrocRaceResults.length,
    wins: bryceFrocRaceResults.filter((row) => row.finishPosition === 1).length,
    poles: null,
    podiums: bryceFrocRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 3).length,
    top5: bryceFrocRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 5).length,
    top10: bryceFrocRaceResults.filter((row) => row.finishPosition !== null && row.finishPosition <= 10).length,
    dnfs: bryceFrocRaceResults.filter((row) => row.status !== 'running').length,
    provenanceRefs: ['source_froc_2024_calendar_confirmed', ...new Set(bryceFrocRaceResults.flatMap((row) => row.provenanceRefs ?? []))]
  });

  const currentGaps = asArray(existing.gaps).filter(
    (gap) =>
      ![
        'gap_remaining_non_indy_nxt_career_rows',
        'gap_remaining_career_rows_after_imsa',
        'gap_remaining_career_rows_after_froc',
        'gap_froc_2024_round_4_date_conflict',
        'gap_froc_2024_session_times_missing',
        'gap_froc_2024_start_positions_partial'
      ].includes(gap.id) &&
      !String(gap.id ?? '').startsWith('gap_froc_2024_r')
  );

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
      ...report.gaps,
      {
        id: 'gap_remaining_career_rows_after_froc',
        scope: 'career_dataset',
        status: 'open',
        description: 'Later source families, karting race-by-race records, media narrative beyond imported Team USA 2020 context and structured Team USA/Badger Kart Club milestone and record facts, non-official ambient weather enrichment, session-window precision, and track metadata for future imported tracks remain open.'
      }
    ]
  };

  const extractedIndexPath = join(rawDir, 'froc-2024-extracted-index.json');
  await writeFile(extractedIndexPath, `${JSON.stringify({ retrievedAt, rounds: extractedRounds }, null, 2)}\n`);
  report.rawArtifacts.push(extractedIndexPath.replace(`${root}/`, ''));

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
