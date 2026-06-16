import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/badger-kart-club');
const reportPath = join(root, 'data/career/reports/badger-kart-club-context-backfill-report.json');
const refresh = process.argv.includes('--refresh');

const pages = [
  {
    sourceId: 'source_badger_kart_club_2016_fast_times_track_records',
    url: 'https://web.archive.org/web/20251112122951/https://badgerkartclub.com/2016-fast-times-and-track-records',
    originalUrl: 'https://badgerkartclub.com/2016-fast-times-and-track-records',
    archiveTimestamp: '2025-11-12T12:29:51Z',
    rawFile: 'badger-kart-club-2016-fast-times-and-track-records.html',
    sourceName: 'Badger Kart Club 2016 fast times and track records',
    publishedAt: null,
    coverage: 'Archived official Badger Kart Club 2016 fast times and track records page, including Bryce Aron Yamaha Junior fast-time row.',
    required: [/Yamaha Junior\s+8\/6\/2016\s+Bryce Aron\s+40\.536/i],
    records: [
      {
        id: 'metric_badger_kart_club_2016_yamaha_junior_fast_time',
        metricType: 'karting_fast_time',
        formula: 'Direct structured extraction from official Badger Kart Club fast-times table; no derived calculation.',
        metrics: {
          organization: 'Badger Kart Club',
          track: 'Badger Kart Club',
          configuration: null,
          className: 'Yamaha Junior',
          date: '2016-08-06',
          lapTime: '40.536',
          recordTable: '2016 Fast Times'
        }
      }
    ]
  },
  {
    sourceId: 'source_badger_kart_club_2017_fast_times_track_records',
    url: 'https://web.archive.org/web/20251112102610/https://badgerkartclub.com/2017-fast-times-and-track-records',
    originalUrl: 'https://badgerkartclub.com/2017-fast-times-and-track-records',
    archiveTimestamp: '2025-11-12T10:26:10Z',
    rawFile: 'badger-kart-club-2017-fast-times-and-track-records.html',
    sourceName: 'Badger Kart Club 2017 fast times and track records',
    publishedAt: null,
    coverage: 'Archived official Badger Kart Club 2017 fast times and track records page, including Bryce Aron TaG Junior Classic Track fast time and Bus Stop track record rows.',
    required: [
      /Classic Track[\s\S]*?TaG Junior\s+6\/11\/2017\s+Bryce Aron\s+38\.938/i,
      /Bus Stop[\s\S]*?Track Records[\s\S]*?TaG Junior\s+10\/9\/2017\s+Bryce Aron\s+39\.070/i
    ],
    records: [
      {
        id: 'metric_badger_kart_club_2017_classic_tag_junior_fast_time',
        metricType: 'karting_fast_time',
        formula: 'Direct structured extraction from official Badger Kart Club Classic Track fast-times table; no derived calculation.',
        metrics: {
          organization: 'Badger Kart Club',
          track: 'Badger Kart Club',
          configuration: 'Classic Track',
          className: 'TaG Junior',
          date: '2017-06-11',
          lapTime: '38.938',
          recordTable: '2017 Fast Times'
        }
      },
      {
        id: 'metric_badger_kart_club_2017_bus_stop_tag_junior_track_record',
        metricType: 'karting_track_record',
        formula: 'Direct structured extraction from official Badger Kart Club Bus Stop track-record table; no derived calculation.',
        metrics: {
          organization: 'Badger Kart Club',
          track: 'Badger Kart Club',
          configuration: 'Bus Stop',
          className: 'TaG Junior',
          date: '2017-10-09',
          lapTime: '39.070',
          recordTable: 'Track Records'
        }
      }
    ]
  }
];

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const relative = (path) => path.replace(`${root}/`, '');

const readTextIfExists = async (path) => {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
};

const fetchTextCached = async (url, path) => {
  if (!refresh) {
    const cached = await readTextIfExists(path);
    if (cached) return { text: cached, fromCache: true };
  }

  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const text = await response.text();
  await writeFile(path, text);
  return { text, fromCache: false };
};

const decodeHtml = (value) =>
  String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const sourceEvidence = ({ page, retrievedAt, rawArtifactPath }) => ({
  id: page.sourceId,
  sourceType: 'archived_official_page',
  sourceName: page.sourceName,
  url: page.url,
  linkedUrls: [page.originalUrl, page.url],
  retrievedAt,
  publishedAt: page.publishedAt,
  accessedBy: 'scripts/backfill-badger-kart-club-context.mjs',
  licenseNotes: 'Archived public Badger Kart Club records page; store source URLs, structured Bryce rows, and cached raw HTML only.',
  confidenceTier: 'official',
  coverage: page.coverage,
  parser: 'scripts/backfill-badger-kart-club-context.mjs static record verifier',
  rawArtifactPath,
  notes: `Fetched from the Wayback Machine archive of the original public Badger Kart Club URL because the live year-specific page no longer serves the historical row. Archive timestamp: ${page.archiveTimestamp}. Parsed only after required Bryce record rows were verified in normalized page text.`
});

const careerRecordMetric = ({ page, record }) => ({
  id: record.id,
  scope: 'career',
  metricType: record.metricType,
  sessionId: null,
  eventId: null,
  seriesId: null,
  driverId: 'driver_bryce_aron',
  calculationVersion: 'official_badger_kart_club_direct_extract_v1',
  formula: record.formula,
  inputRefs: [page.sourceId],
  metrics: record.metrics,
  confidence: 'official',
  raw: {
    source: page.sourceName,
    sourceUrl: page.url,
    originalSourceUrl: page.originalUrl,
    archiveTimestamp: page.archiveTimestamp,
    extraction: 'static_verified_record_row'
  },
  provenanceRefs: [page.sourceId]
});

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJson(datasetPath);
  const retrievedAt = new Date().toISOString();
  const sourceIds = new Set(pages.map((page) => page.sourceId));
  const recordIds = new Set(pages.flatMap((page) => page.records).map((record) => record.id));
  const report = {
    checkedAt: retrievedAt,
    refresh,
    pagesChecked: pages.length,
    pagesImported: 0,
    recordsImported: 0,
    fetched: 0,
    cached: 0,
    rawArtifacts: [],
    sourceEvidenceIds: [],
    derivedMetricIds: [],
    failures: []
  };

  const sourceEvidenceRows = asArray(dataset.sourceEvidence).filter((row) => !sourceIds.has(row.id));
  const derivedMetricRows = asArray(dataset.derivedMetrics).filter((row) => !recordIds.has(row.id));

  for (const page of pages) {
    const rawPath = join(rawDir, page.rawFile);
    const fetched = await fetchTextCached(page.url, rawPath);
    report[fetched.fromCache ? 'cached' : 'fetched'] += 1;
    report.rawArtifacts.push(relative(rawPath));

    const plainText = decodeHtml(fetched.text);
    const missing = page.required.filter((pattern) => !pattern.test(plainText)).map((pattern) => String(pattern));
    if (missing.length) {
      report.failures.push({ sourceId: page.sourceId, reason: 'required_record_text_not_found', missing });
      continue;
    }

    sourceEvidenceRows.push(sourceEvidence({ page, retrievedAt, rawArtifactPath: relative(rawPath) }));
    for (const record of page.records) {
      derivedMetricRows.push(careerRecordMetric({ page, record }));
      report.derivedMetricIds.push(record.id);
      report.recordsImported += 1;
    }
    report.pagesImported += 1;
    report.sourceEvidenceIds.push(page.sourceId);
  }

  if (report.failures.length) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`Badger Kart Club backfill failed validation for ${report.failures.length} page(s).`);
  }

  const nextGaps = asArray(dataset.gaps).map((gap) =>
    gap.id === 'gap_remaining_career_rows_after_track_metadata'
      ? {
          ...gap,
          description:
            'Broad historical-tail placeholder, not a UI-readiness blocker. Remaining optional or metric-specific work includes pre-2019 karting race-by-race records, early-career Formula Ford appearances outside the imported official books, future imported-track metadata, non-official ambient weather outside current exact-window scope, and future derived benchmark models. Current production caveats are tracked by specific gap IDs.'
        }
      : gap
  );

  const nextDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    sourceEvidence: sourceEvidenceRows.sort((a, b) => a.id.localeCompare(b.id)),
    derivedMetrics: derivedMetricRows.sort((a, b) => a.id.localeCompare(b.id)),
    gaps: nextGaps.sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: datasetPath, report: reportPath, pagesImported: report.pagesImported, recordsImported: report.recordsImported }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
