import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/team-usa');
const reportPath = join(root, 'data/career/reports/team-usa-context-backfill-report.json');
const refresh = process.argv.includes('--refresh');

const pages = [
  {
    sourceId: 'source_team_usa_2020_winners_announcement',
    assetId: 'asset_team_usa_2020_winners_announcement',
    url: 'https://teamusascholarship.org/?p=5355',
    rawFile: 'team-usa-2020-winners-announcement.html',
    sourceName: 'Team USA Scholarship 2020 winners announcement',
    title: 'Team USA Scholarship selects Bryce Aron for 2020',
    publishedAt: '2020-09-18',
    coverage:
      'Team USA Scholarship announcement naming Bryce Aron as a 2020 scholarship winner and outlining planned Formula Ford Festival, Walter Hayes Trophy, and Avon National Formula Ford 1600 participation.',
    summary:
      'Team USA Scholarship named Bryce Aron a 2020 scholarship winner, alongside Jackson Lee and Simon Sikes, with planned UK Formula Ford starts including the Formula Ford Festival, Walter Hayes Trophy, and Avon National Formula Ford 1600 finale.',
    required: [/Bryce Aron, Jackson Lee and Simon Sikes/i, /chosen as the latest scholarship winners/i, /Formula Ford Festival/i, /Walter Hayes Trophy/i],
    milestones: [
      {
        id: 'metric_team_usa_2020_scholarship_selection',
        metricType: 'career_award',
        formula: 'Direct structured extraction from Team USA Scholarship winners announcement; no derived calculation.',
        metrics: {
          award: 'Team USA Scholarship winner',
          year: 2020,
          coWinners: ['Jackson Lee', 'Simon Sikes'],
          plannedEventFamilies: ['Formula Ford Festival', 'Walter Hayes Trophy', 'Avon National Formula Ford 1600']
        }
      }
    ]
  },
  {
    sourceId: 'source_team_usa_2020_bryce_aron_blog',
    assetId: 'asset_team_usa_2020_bryce_aron_blog',
    url: 'https://teamusascholarship.org/?p=5362',
    rawFile: 'team-usa-2020-bryce-aron-blog.html',
    sourceName: 'Team USA Scholarship Bryce Aron driver blog',
    title: 'Bryce Aron Team USA blog and early-career milestones',
    publishedAt: '2020-09-29',
    coverage:
      'Team USA Scholarship Bryce Aron driver blog with karting, FRP F1600, and 2020 British Formula Ford narrative milestones.',
    summary:
      'Bryce Aron Team USA blog preserves early-career context: 2018 BKC TaG Jr champion, Yamaha KT100 runner-up, 2019 FRP F1600 P3 with eight podiums, and 2020 UK Formula Ford development context.',
    required: [/2018 BKC Tag Jr\. Championship/i, /Yamaha KT100 championship/i, /finished third in the championship with eight podiums/i, /win at Cadwell Park/i],
    milestones: [
      {
        id: 'metric_team_usa_2020_bkc_tag_jr_champion',
        metricType: 'karting_championship_milestone',
        formula: 'Direct structured extraction from Team USA Scholarship Bryce Aron driver blog; no derived calculation.',
        metrics: { championship: 'BKC TaG Jr. Championship', position: 1, year: 2018 }
      },
      {
        id: 'metric_team_usa_2020_yamaha_kt100_runner_up',
        metricType: 'karting_championship_milestone',
        formula: 'Direct structured extraction from Team USA Scholarship Bryce Aron driver blog; no derived calculation.',
        metrics: { championship: 'Yamaha KT100 championship', position: 2, year: 2018 }
      },
      {
        id: 'metric_team_usa_2020_frp_f1600_podiums_context',
        metricType: 'season_context_milestone',
        formula: 'Direct structured extraction from Team USA Scholarship Bryce Aron driver blog; no derived calculation.',
        metrics: { series: 'FRP F1600 Championship Series', championshipPosition: 3, podiums: 8, year: 2019 }
      }
    ]
  },
  {
    sourceId: 'source_team_usa_2020_walter_hayes_report',
    assetId: 'asset_team_usa_2020_walter_hayes_report',
    url: 'https://teamusascholarship.org/?p=5614',
    rawFile: 'team-usa-2020-walter-hayes-report.html',
    sourceName: 'Team USA Scholarship Walter Hayes Trophy report',
    title: 'Bryce Aron Walter Hayes Trophy podium report',
    publishedAt: '2020-11-01',
    coverage:
      'Team USA Scholarship report for Bryce Aron at the 2020 Walter Hayes Trophy Grand Final.',
    summary:
      'Team USA report gives narrative support for Bryce Aron Walter Hayes Trophy Grand Final P3 after he started ninth at Silverstone, complementing the official TSL timing classification.',
    required: [/third-place finish in the Walter Hayes Trophy Grand Final/i, /started ninth/i, /Silverstone National circuit/i]
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

  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
    const text = await response.text();
    await writeFile(path, text);
    return { text, fromCache: false };
  } finally {
    if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
  }
};

const decodeHtml = (value) =>
  String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#124;/g, '|')
    .replace(/&#47;/g, '/')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const sourceEvidence = ({ page, retrievedAt, rawArtifactPath }) => ({
  id: page.sourceId,
  sourceType: 'official_page',
  sourceName: page.sourceName,
  url: page.url,
  linkedUrls: [page.url],
  retrievedAt,
  publishedAt: page.publishedAt,
  accessedBy: 'scripts/backfill-team-usa-context.mjs',
  licenseNotes: 'Public Team USA Scholarship web page; store source URL, short summary, and cached raw HTML only.',
  confidenceTier: 'official',
  coverage: page.coverage,
  parser: 'scripts/backfill-team-usa-context.mjs static milestone verifier',
  rawArtifactPath,
  notes:
    'Fetched from the public Team USA Scholarship site. TLS certificate validation was disabled during retrieval because the source certificate is expired; cache and provenance preserve the exact public URL.'
});

const mediaAsset = ({ page }) => ({
  id: page.assetId,
  assetType: 'article',
  title: page.title,
  url: page.url,
  rightsStatus: 'link_only',
  publishedAt: page.publishedAt,
  eventId: null,
  sessionId: null,
  driverId: 'driver_bryce_aron',
  summary: page.summary,
  quoteText: null,
  provenanceRefs: [page.sourceId]
});

const careerMilestoneMetric = ({ page, milestone }) => ({
  id: milestone.id,
  scope: 'career',
  metricType: milestone.metricType,
  sessionId: null,
  eventId: null,
  seriesId: null,
  driverId: 'driver_bryce_aron',
  calculationVersion: 'official_team_usa_direct_extract_v1',
  formula: milestone.formula,
  inputRefs: [page.sourceId],
  metrics: milestone.metrics,
  confidence: 'official',
  raw: {
    source: page.sourceName,
    sourceUrl: page.url,
    sourcePublishedAt: page.publishedAt,
    extraction: 'static_verified_text_milestone'
  },
  provenanceRefs: [page.sourceId]
});

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJson(datasetPath);
  const retrievedAt = new Date().toISOString();
  const sourceIds = new Set(pages.map((page) => page.sourceId));
  const assetIds = new Set(pages.map((page) => page.assetId));
  const milestoneIds = new Set(pages.flatMap((page) => page.milestones ?? []).map((milestone) => milestone.id));
  const report = {
    checkedAt: retrievedAt,
    refresh,
    pagesChecked: pages.length,
    pagesImported: 0,
    fetched: 0,
    cached: 0,
    rawArtifacts: [],
    sourceEvidenceIds: [],
    mediaAssetIds: [],
    derivedMetricIds: [],
    tlsCertificateCaveat: 'Team USA Scholarship HTTPS certificate is expired; importer disables TLS verification only for these public page fetches.',
    failures: []
  };

  const sourceEvidenceRows = asArray(dataset.sourceEvidence).filter((row) => !sourceIds.has(row.id));
  const mediaAssetRows = asArray(dataset.mediaAssets).filter((row) => !assetIds.has(row.id));
  const derivedMetricRows = asArray(dataset.derivedMetrics).filter((row) => !milestoneIds.has(row.id));

  for (const page of pages) {
    const rawPath = join(rawDir, page.rawFile);
    const fetched = await fetchTextCached(page.url, rawPath);
    report[fetched.fromCache ? 'cached' : 'fetched'] += 1;
    report.rawArtifacts.push(relative(rawPath));

    const plainText = decodeHtml(fetched.text);
    const missing = page.required.filter((pattern) => !pattern.test(plainText)).map((pattern) => String(pattern));
    if (missing.length) {
      report.failures.push({ sourceId: page.sourceId, reason: 'required_text_not_found', missing });
      continue;
    }

    sourceEvidenceRows.push(sourceEvidence({ page, retrievedAt, rawArtifactPath: relative(rawPath) }));
    mediaAssetRows.push(mediaAsset({ page }));
    for (const milestone of page.milestones ?? []) {
      derivedMetricRows.push(careerMilestoneMetric({ page, milestone }));
      report.derivedMetricIds.push(milestone.id);
    }
    report.pagesImported += 1;
    report.sourceEvidenceIds.push(page.sourceId);
    report.mediaAssetIds.push(page.assetId);
  }

  if (report.failures.length) {
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`Team USA context backfill failed validation for ${report.failures.length} page(s).`);
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
    mediaAssets: mediaAssetRows.sort((a, b) => a.id.localeCompare(b.id)),
    derivedMetrics: derivedMetricRows.sort((a, b) => a.id.localeCompare(b.id)),
    gaps: nextGaps.sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ wrote: datasetPath, report: reportPath, pagesImported: report.pagesImported }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
