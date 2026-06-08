import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/froc-2024');
const reportPath = join(root, 'data/career/reports/froc-grid-rule-backfill-report.json');
const frocImportReportPath = join(root, 'data/career/reports/froc-2024-import-report.json');
const highlandsPreviewUrl = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/highlands-all-set-for-landmark-grand-prix-weekend/';
const highlandsPreviewPath = join(rawDir, 'round-5-highlands-gp-qualifying-format.html');
const race2ArticleUrl = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/aron-wins-race-but-bilinski-takes-fr-oceania-title/';
const race2ArticlePath = join(rawDir, 'round-5-highlands-race-2-article.html');
const round4Qualifying1Url = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/bilinski-again-but-sceats-more-than-abel-to-challenge/';
const round4Qualifying1Path = join(rawDir, 'round-4-euromarque-qualifying-1-article.html');
const round1Qualifying1Url = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/january/picture-1--christian-mansell-mastered-slippery-conditions-at-taupo-to-secure-pole-position/';
const round1Qualifying1Path = join(rawDir, 'round-1-taupo-qualifying-1-article.html');
const round1Race2Url = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/january/xie-opens-ctfroc-account-with-fine-win-at-taupo/';
const round1Race2Path = join(rawDir, 'round-1-taupo-race-2-article.html');
const round1Qualifying2Url = 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/january/mansell-to-start-denny-hulme-trophy-race-from-the-front/';
const round1Qualifying2Path = join(rawDir, 'round-1-taupo-qualifying-2-article.html');
const refresh = process.argv.includes('--refresh');

const highlandsPreviewSourceEvidenceId = 'source_froc_2024_r5_highlands_gp_qualifying_format_article';
const highlandsPreviewMediaAssetId = 'asset_froc_2024_r5_highlands_gp_qualifying_format_article';
const race2SourceEvidenceId = 'source_froc_2024_r5_race_2_toyota_article';
const race2MediaAssetId = 'asset_froc_2024_r5_race_2_toyota_article';
const round4Qualifying1SourceEvidenceId = 'source_froc_2024_r4_qualifying_1_toyota_article';
const round4Qualifying1MediaAssetId = 'asset_froc_2024_r4_qualifying_1_toyota_article';
const round1Qualifying1SourceEvidenceId = 'source_froc_2024_r1_qualifying_1_toyota_article';
const round1Qualifying1MediaAssetId = 'asset_froc_2024_r1_qualifying_1_toyota_article';
const round1Race2SourceEvidenceId = 'source_froc_2024_r1_race_2_toyota_article';
const round1Race2MediaAssetId = 'asset_froc_2024_r1_race_2_toyota_article';
const round1Qualifying2SourceEvidenceId = 'source_froc_2024_r1_qualifying_2_toyota_article';
const round1Qualifying2MediaAssetId = 'asset_froc_2024_r1_qualifying_2_toyota_article';

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};
const relative = (path) => path.replace(`${root}/`, '');

const nonEmptyFileExists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

const fetchTextCached = async (url, path) => {
  if (!refresh && (await nonEmptyFileExists(path))) {
    return { fromCache: true, text: await readFile(path, 'utf8') };
  }
  const response = await fetch(url, { headers: { accept: 'text/html,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const text = await response.text();
  await writeFile(path, text);
  return { fromCache: false, text };
};

const normalizeText = (html) =>
  String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&#39;|&apos;|&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

const assertArticleSupportsRule = (plainText) => {
  const checks = [
    /best times will form the grid order for race one/i,
    /bottom five(?:'|’)?s positions will be their starting places on the GP grid/i,
    /grid places 9-13/i,
    /first eight places on the grid/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Highlands article no longer exposes expected grid-rule text: ${missing.join(', ')}`);
  }
};

const assertRace2ArticleSupportsTopEightGrid = (plainText) => {
  const checks = [
    /A reverse top eight grid based on Saturday(?:'|’)?s results from the first race put Aron/i,
    /alongside Woods-Toth/i,
    /Third on the grid would be[^.]*Jacob Abel alongside Korea(?:'|’)?s Michael Shin/i,
    /In fifth and sixth on row three were Bilinski and Callum Hedge/i,
    /Behind them sat Saturday race winner Liam Sceats and China(?:'|’)?s Gerrard Xie/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Highlands Race 2 article no longer exposes expected top-eight grid narrative: ${missing.join(', ')}`);
  }
};

const assertRound4Qualifying1SupportsRace1Grid = (plainText) => {
  const checks = [
    /will nevertheless start seventh on the grid/i,
    /afternoon(?:'|’)?s race will be the first of three/i,
    /2024 Castrol Toyota Formula Regional Oceania Championship certified by FIA[^A-Za-z0-9]+R4 Qual 1/i,
    /Roman Bilinski[\s\S]*Liam Sceats[\s\S]*Jacob Abel[\s\S]*Bryce Aron/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Euromarque Qualifying 1 article no longer exposes expected Race 1 grid evidence: ${missing.join(', ')}`);
  }
};

const assertRound1Qualifying1SupportsRace1Grid = (plainText) => {
  const checks = [
    /secure the first pole position of the season/i,
    /We(?:'|’)?ll see how they go in the race/i,
    /2024 Castrol Toyota Formula Regional Oceania Championship certified by FIA[^A-Za-z0-9]+R1 Qualifying/i,
    /Christian Mansell[\s\S]*Roman Bilinski[\s\S]*Gerrard Xie[\s\S]*Liam Sceats/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Taupo Qualifying 1 article no longer exposes expected Race 1 grid evidence: ${missing.join(', ')}`);
  }
};

const assertRound1Race2SupportsTopEightGrid = (plainText) => {
  const checks = [
    /victory in the reverse top eight race having started third on the grid/i,
    /A clean start saw Crosbie win the drag race to the first corner/i,
    /from Sceats, Tommy Smith, Shin, Bilinski, Kaleb Ngatoa, Christian Mansell/i,
    /charge from P16 on the grid/i,
    /take[s]? up the pole position for this afternoon(?:'|’)?s Denny Hulme Trophy feature race/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Taupo Race 2 article no longer exposes expected reverse-grid evidence: ${missing.join(', ')}`);
  }
};

const assertRound1Qualifying2SupportsRace3Grid = (plainText) => {
  const checks = [
    /Mansell to start Denny Hulme Trophy race from the front/i,
    /second pole position of the weekend[^.]*Denny Hulme Memorial Trophy feature race/i,
    /causing a session stoppage would shift him down the order on the grid/i,
    /Sunday morning(?:'|’)?s second race will see a grid formed from the top eight finishers in Saturday(?:'|’)?s opener/i,
    /Sunday(?:'|’)?s feature race will have a grid formed from Q2/i,
    /2024 Castrol Toyota Formula Regional Oceania Championship certified by FIA[^A-Za-z0-9]+R1 Qualifying 2/i,
    /Christian Mansell[\s\S]*Alex Crosbie[\s\S]*Liam Sceats[\s\S]*Roman Bilinski/i
  ];
  const missing = checks.filter((pattern) => !pattern.test(plainText)).map(String);
  if (missing.length) {
    throw new Error(`Official Taupo Qualifying 2 article no longer exposes expected Race 3 grid evidence: ${missing.join(', ')}`);
  }
};

const byPosition = (rows) =>
  rows
    .filter((row) => row.finishPosition !== null && row.finishPosition !== undefined)
    .sort((a, b) => a.finishPosition - b.finishPosition);

const qualifyingRows = (dataset, sessionId) =>
  byPosition(asArray(dataset.results).filter((row) => row.sessionId === sessionId));

const raceRows = (dataset, sessionId) =>
  asArray(dataset.results).filter((row) => row.sessionId === sessionId);

const gridFromRows = (rows, filter) => {
  const grid = new Map();
  for (const row of rows) {
    if (filter(row)) grid.set(row.carNumber, row.finishPosition);
  }
  return grid;
};

const reverseTopNGridFromRaceResults = (rows, count) => {
  const grid = new Map();
  byPosition(rows)
    .filter((row) => row.finishPosition >= 1 && row.finishPosition <= count)
    .forEach((row) => {
      grid.set(row.carNumber, count + 1 - row.finishPosition);
    });
  return grid;
};

const applyGrid = ({ row, startPosition, source, sourceEvidenceId, qualifyingSessionIds, report }) => {
  if (!Number.isFinite(startPosition)) return row;
  const existingSourceEvidenceId = row.raw?.gridEvidence?.sourceEvidenceId ?? null;
  if (
    existingSourceEvidenceId !== sourceEvidenceId &&
    (
      (row.startPosition !== null && row.startPosition !== undefined && row.startPosition !== startPosition) ||
      (row.gridPosition !== null && row.gridPosition !== undefined && row.gridPosition !== startPosition)
    )
  ) {
    report.conflicts.push({
      resultId: row.id,
      sessionId: row.sessionId,
      carNumber: row.carNumber,
      existingStartPosition: row.startPosition ?? null,
      existingGridPosition: row.gridPosition ?? null,
      derivedStartPosition: startPosition
    });
    return row;
  }

  return {
    ...row,
    gridPosition: startPosition,
    startPosition,
    raw: {
      ...(row.raw ?? {}),
      gridEvidence: {
        startPosition,
        driverId: row.driverId,
        carNumber: row.carNumber,
        source,
        sourceEvidenceId,
        qualifyingSessionIds
      }
    },
    provenanceRefs: Array.from(new Set([...(row.provenanceRefs ?? []), sourceEvidenceId]))
  };
};

const mergeGapDescription = (gap) => {
  if (gap.id !== 'gap_froc_2024_start_positions_partial') return gap;
  return {
    ...gap,
    status: 'partial',
    description: 'Toyota HTML Grid tabs, linked official grid PDFs, the official Taupo Qualifying 1/2 articles, the official Taupo Race 2 article, the official Euromarque Qualifying 1 article, the official Highlands Grand Prix qualifying-format article, and the official Highlands Race 2 article are normalized where present. FROC Round 1 Race 1 and Round 4 Race 1 start positions are imported from official Qualifying 1 articles plus qualifying tables. FROC Round 1 Race 2 top-eight start positions are imported from the official Race 2 reverse top-eight article rule plus Race 1 results, and Woods-Toth P16 is imported from the same article direct statement. FROC Round 1 Race 3 start positions are imported from the official Qualifying 2 article plus Qualifying 2 table. FROC Round 5 Race 1 and Grand Prix start positions are imported from the qualifying-format article plus qualifying tables. FROC Round 5 Race 2 top-eight start positions are imported from the official Race 2 article narrative. The remaining R1 Race 2 and R5 Race 2 tail start positions remain open until race-specific official grid evidence is found.'
  };
};

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJson(datasetPath);
  const retrievedAt = new Date().toISOString();
  const highlandsPreview = await fetchTextCached(highlandsPreviewUrl, highlandsPreviewPath);
  const highlandsPreviewText = normalizeText(highlandsPreview.text);
  assertArticleSupportsRule(highlandsPreviewText);
  const race2Article = await fetchTextCached(race2ArticleUrl, race2ArticlePath);
  const race2ArticleText = normalizeText(race2Article.text);
  assertRace2ArticleSupportsTopEightGrid(race2ArticleText);
  const round4Qualifying1Article = await fetchTextCached(round4Qualifying1Url, round4Qualifying1Path);
  const round4Qualifying1Text = normalizeText(round4Qualifying1Article.text);
  assertRound4Qualifying1SupportsRace1Grid(round4Qualifying1Text);
  const round1Qualifying1Article = await fetchTextCached(round1Qualifying1Url, round1Qualifying1Path);
  const round1Qualifying1Text = normalizeText(round1Qualifying1Article.text);
  assertRound1Qualifying1SupportsRace1Grid(round1Qualifying1Text);
  const round1Race2Article = await fetchTextCached(round1Race2Url, round1Race2Path);
  const round1Race2Text = normalizeText(round1Race2Article.text);
  assertRound1Race2SupportsTopEightGrid(round1Race2Text);
  const round1Qualifying2Article = await fetchTextCached(round1Qualifying2Url, round1Qualifying2Path);
  const round1Qualifying2Text = normalizeText(round1Qualifying2Article.text);
  assertRound1Qualifying2SupportsRace3Grid(round1Qualifying2Text);

  const sourceEvidence = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  sourceEvidence.set(highlandsPreviewSourceEvidenceId, {
    id: highlandsPreviewSourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Highlands Grand Prix qualifying-format preview',
    url: highlandsPreviewUrl,
    retrievedAt,
    publishedAt: '2024-02-15',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-rule facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Highlands preview defining the Round 5 Race 1 and Grand Prix qualifying-to-grid rules.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(highlandsPreviewPath),
    notes: 'Article states Q1 best times form Race 1 grid, Q1 bottom five start at their GP grid positions, Q2 slowest five occupy GP grid places 9-13, and Q3 times set the first eight GP grid places.'
  });
  sourceEvidence.set(race2SourceEvidenceId, {
    id: race2SourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Highlands Race 2 article',
    url: race2ArticleUrl,
    retrievedAt,
    publishedAt: '2024-02-18',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-position facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Highlands Race 2 narrative naming the top eight Race 2 grid rows.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(race2ArticlePath),
    notes: 'Article names Aron and Woods-Toth on row one, Abel and Shin on row two, Bilinski and Hedge on row three, and Sceats and Xie behind them.'
  });
  sourceEvidence.set(round4Qualifying1SourceEvidenceId, {
    id: round4Qualifying1SourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Euromarque Round 4 Qualifying 1 article',
    url: round4Qualifying1Url,
    retrievedAt,
    publishedAt: '2024-02-10',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-position facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Euromarque Round 4 Qualifying 1 narrative and table identifying the Race 1 grid order.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(round4Qualifying1Path),
    notes: 'Article states Bryce Aron would start seventh on the grid after Qualifying 1 and includes the full R4 Qual 1 table used for Race 1 start positions.'
  });
  sourceEvidence.set(round1Qualifying1SourceEvidenceId, {
    id: round1Qualifying1SourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Taupo Round 1 Qualifying 1 article',
    url: round1Qualifying1Url,
    retrievedAt,
    publishedAt: '2024-01-20',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-position facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Taupo Round 1 Qualifying 1 narrative and table identifying the Race 1 pole and qualifying order.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(round1Qualifying1Path),
    notes: 'Article states Christian Mansell secured the first pole position of the season and includes the full R1 Qualifying table used for Race 1 start positions.'
  });
  sourceEvidence.set(round1Race2SourceEvidenceId, {
    id: round1Race2SourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Taupo Round 1 Race 2 article',
    url: round1Race2Url,
    retrievedAt,
    publishedAt: '2024-01-21',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-position facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Taupo Round 1 Race 2 narrative identifying the race as a reverse top-eight race and validating the top-eight grid order.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(round1Race2Path),
    notes: 'Article states Xie won the reverse top-eight race after starting third, describes Crosbie leading from Sceats, Tommy Smith, Shin, Bilinski, Ngatoa, Mansell, Woods-Toth, and Fecury at lap one, and separately says Woods-Toth charged from P16. The reverse top-eight mapping and Woods-Toth P16 are imported; other tail starts remain unset because the tail order is not fully source-backed by this article.'
  });
  sourceEvidence.set(round1Qualifying2SourceEvidenceId, {
    id: round1Qualifying2SourceEvidenceId,
    sourceType: 'official_html',
    sourceName: 'Toyota NZ Taupo Round 1 Qualifying 2 article',
    url: round1Qualifying2Url,
    retrievedAt,
    publishedAt: '2024-01-21',
    accessedBy: 'scripts/backfill-froc-grid-rules.mjs',
    licenseNotes: 'Public official Toyota NZ article; store derived grid-position facts and source URL.',
    confidenceTier: 'official',
    coverage: 'Official Taupo Round 1 Qualifying 2 narrative and table identifying the Race 3/Denny Hulme Trophy grid rule and full Q2 order.',
    parser: 'scripts/backfill-froc-grid-rules.mjs',
    rawArtifactPath: relative(round1Qualifying2Path),
    notes: 'Article states the Sunday feature race grid is formed from Q2, says Woods-Toth would shift down the order after causing a session stoppage, and includes the adjusted R1 Qualifying 2 article table used for Race 3 start positions.'
  });

  const mediaAssets = new Map(asArray(dataset.mediaAssets).map((row) => [row.id, row]));
  mediaAssets.set(highlandsPreviewMediaAssetId, {
    id: highlandsPreviewMediaAssetId,
    assetType: 'article',
    title: 'Highlands all set for landmark Grand Prix weekend',
    url: highlandsPreviewUrl,
    rightsStatus: 'link_only',
    publishedAt: '2024-02-15',
    eventId: 'event_froc_2024_r5_highlands_motorsport_park',
    sessionId: null,
    driverId: 'driver_bryce_aron',
    summary: 'Official Toyota NZ preview that mentions Bryce Aron and defines the Highlands Grand Prix qualifying format used to derive Round 5 Race 1 and Grand Prix start positions.',
    quoteText: null,
    provenanceRefs: [highlandsPreviewSourceEvidenceId]
  });
  mediaAssets.set(race2MediaAssetId, {
    id: race2MediaAssetId,
    assetType: 'article',
    title: 'Aron wins race, but Bilinski takes FR Oceania title',
    url: race2ArticleUrl,
    rightsStatus: 'link_only',
    publishedAt: '2024-02-18',
    eventId: 'event_froc_2024_r5_highlands_motorsport_park',
    sessionId: 'session_froc_2024_r5_race_2',
    driverId: 'driver_bryce_aron',
    summary: 'Official Toyota NZ Race 2 article that names the top-eight Highlands Race 2 grid rows and describes Bryce Aron winning the race.',
    quoteText: null,
    provenanceRefs: [race2SourceEvidenceId]
  });
  mediaAssets.set(round4Qualifying1MediaAssetId, {
    id: round4Qualifying1MediaAssetId,
    assetType: 'article',
    title: 'Bilinski again but Sceats more than Abel to challenge',
    url: round4Qualifying1Url,
    rightsStatus: 'link_only',
    publishedAt: '2024-02-10',
    eventId: 'event_froc_2024_r4_euromarque_motorsport_park',
    sessionId: 'session_froc_2024_r4_qualifying_1',
    driverId: 'driver_bryce_aron',
    summary: 'Official Toyota NZ Qualifying 1 article that identifies the Euromarque Round 4 Race 1 grid and Bryce Aron starting seventh.',
    quoteText: null,
    provenanceRefs: [round4Qualifying1SourceEvidenceId]
  });
  mediaAssets.set(round1Qualifying1MediaAssetId, {
    id: round1Qualifying1MediaAssetId,
    assetType: 'article',
    title: 'Patient Mansell hits sweet spot for first pole position of the season',
    url: round1Qualifying1Url,
    rightsStatus: 'link_only',
    publishedAt: '2024-01-20',
    eventId: 'event_froc_2024_r1_taupo_international_motorsport_park',
    sessionId: 'session_froc_2024_r1_qualifying_1',
    driverId: null,
    summary: 'Official Toyota NZ Qualifying 1 article that identifies the Taupo Round 1 Race 1 pole and full qualifying order.',
    quoteText: null,
    provenanceRefs: [round1Qualifying1SourceEvidenceId]
  });
  mediaAssets.set(round1Race2MediaAssetId, {
    id: round1Race2MediaAssetId,
    assetType: 'article',
    title: 'Xie opens CTFROC account with fine win at Taupo',
    url: round1Race2Url,
    rightsStatus: 'link_only',
    publishedAt: '2024-01-21',
    eventId: 'event_froc_2024_r1_taupo_international_motorsport_park',
    sessionId: 'session_froc_2024_r1_race_2',
    driverId: null,
    summary: 'Official Toyota NZ Race 2 article that identifies the Taupo Race 2 as a reverse top-eight race and validates the top-eight grid mapping.',
    quoteText: null,
    provenanceRefs: [round1Race2SourceEvidenceId]
  });
  mediaAssets.set(round1Qualifying2MediaAssetId, {
    id: round1Qualifying2MediaAssetId,
    assetType: 'article',
    title: 'Mansell to start Denny Hulme Trophy race from the front',
    url: round1Qualifying2Url,
    rightsStatus: 'link_only',
    publishedAt: '2024-01-21',
    eventId: 'event_froc_2024_r1_taupo_international_motorsport_park',
    sessionId: 'session_froc_2024_r1_qualifying_2',
    driverId: null,
    summary: 'Official Toyota NZ Qualifying 2 article that identifies the Taupo Denny Hulme Trophy feature-race grid as Q2-backed and includes the full Q2 order.',
    quoteText: null,
    provenanceRefs: [round1Qualifying2SourceEvidenceId]
  });

  const r1q1 = qualifyingRows(dataset, 'session_froc_2024_r1_qualifying_1');
  const r1q2 = qualifyingRows(dataset, 'session_froc_2024_r1_qualifying_2');
  const r4q1 = qualifyingRows(dataset, 'session_froc_2024_r4_qualifying_1');
  const q1 = qualifyingRows(dataset, 'session_froc_2024_r5_qualifying_1');
  const q2 = qualifyingRows(dataset, 'session_froc_2024_r5_qualifying_2');
  const q3 = qualifyingRows(dataset, 'session_froc_2024_r5_qualifying_3');
  const round1Race1Grid = gridFromRows(r1q1, () => true);
  const round1Race2TopEightGrid = reverseTopNGridFromRaceResults(raceRows(dataset, 'session_froc_2024_r1_race_1'), 8);
  const round1Race2DirectGrid = new Map([['14', 16]]);
  const round1Race3Grid = new Map([
    ['71', 1],
    ['41', 2],
    ['23', 3],
    ['4', 4],
    ['15', 5],
    ['39', 6],
    ['16', 7],
    ['19', 8],
    ['7', 9],
    ['14', 10],
    ['6', 11],
    ['48', 12],
    ['31', 13],
    ['22', 14],
    ['5', 15],
    ['739', 16],
    ['20', 17]
  ]);
  const round4Race1Grid = gridFromRows(r4q1, () => true);
  const race1Grid = gridFromRows(q1, () => true);
  const grandPrixGrid = new Map([
    ...gridFromRows(q3, (row) => row.finishPosition >= 1 && row.finishPosition <= 8),
    ...gridFromRows(q2, (row) => row.finishPosition >= 9 && row.finishPosition <= 13),
    ...gridFromRows(q1, (row) => row.finishPosition >= 14)
  ]);
  const race2TopEightGrid = new Map([
    ['27', 1],
    ['14', 2],
    ['51', 3],
    ['16', 4],
    ['4', 5],
    ['17', 6],
    ['23', 7],
    ['39', 8]
  ]);

  const report = {
    checkedAt: retrievedAt,
    refresh,
    highlandsPreviewFromCache: highlandsPreview.fromCache,
    race2ArticleFromCache: race2Article.fromCache,
    round4Qualifying1ArticleFromCache: round4Qualifying1Article.fromCache,
    round1Qualifying1ArticleFromCache: round1Qualifying1Article.fromCache,
    round1Race2ArticleFromCache: round1Race2Article.fromCache,
    round1Qualifying2ArticleFromCache: round1Qualifying2Article.fromCache,
    rawArtifacts: [relative(highlandsPreviewPath), relative(race2ArticlePath), relative(round4Qualifying1Path), relative(round1Qualifying1Path), relative(round1Race2Path), relative(round1Qualifying2Path)],
    highlandsPreviewSourceEvidenceId,
    highlandsPreviewMediaAssetId,
    race2SourceEvidenceId,
    race2MediaAssetId,
    round4Qualifying1SourceEvidenceId,
    round4Qualifying1MediaAssetId,
    round1Qualifying1SourceEvidenceId,
    round1Qualifying1MediaAssetId,
    round1Race2SourceEvidenceId,
    round1Race2MediaAssetId,
    round1Qualifying2SourceEvidenceId,
    round1Qualifying2MediaAssetId,
    round1Race1RowsUpdated: [],
    round1Race2RowsUpdated: [],
    round1Race2RowsPreservedWithoutStarts: [],
    round1Race3RowsUpdated: [],
    round4Race1RowsUpdated: [],
    race1RowsUpdated: [],
    race2RowsUpdated: [],
    race3RowsUpdated: [],
    race2RowsPreservedWithoutStarts: [],
    conflicts: []
  };

  const nextResults = asArray(dataset.results).map((row) => {
    if (row.sessionId === 'session_froc_2024_r1_race_1') {
      const updated = applyGrid({
        row,
        startPosition: round1Race1Grid.get(row.carNumber),
        source: 'Toyota Taupo Qualifying 1 article plus Qualifying 1 table',
        sourceEvidenceId: round1Qualifying1SourceEvidenceId,
        qualifyingSessionIds: ['session_froc_2024_r1_qualifying_1'],
        report
      });
      if (updated !== row) {
        report.round1Race1RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
      }
      return updated;
    }

    if (row.sessionId === 'session_froc_2024_r1_race_2') {
      const startPosition = round1Race2TopEightGrid.get(row.carNumber);
      if (startPosition) {
        const updated = applyGrid({
          row,
          startPosition,
          source: 'Toyota Taupo Race 2 official article reverse top-eight rule plus Race 1 results',
          sourceEvidenceId: round1Race2SourceEvidenceId,
          qualifyingSessionIds: [],
          report
        });
        if (updated !== row) report.round1Race2RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
        return updated;
      }
      const directStartPosition = round1Race2DirectGrid.get(row.carNumber);
      if (directStartPosition) {
        const updated = applyGrid({
          row,
          startPosition: directStartPosition,
          source: 'Toyota Taupo Race 2 official article direct P16 statement',
          sourceEvidenceId: round1Race2SourceEvidenceId,
          qualifyingSessionIds: [],
          report
        });
        if (updated !== row) report.round1Race2RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
        return updated;
      }
      if (row.startPosition === null && row.gridPosition === null) {
        report.round1Race2RowsPreservedWithoutStarts.push(row.id);
      }
    }

    if (row.sessionId === 'session_froc_2024_r1_race_3') {
      const updated = applyGrid({
        row,
        startPosition: round1Race3Grid.get(row.carNumber),
        source: 'Toyota Taupo Qualifying 2 article plus Qualifying 2 table',
        sourceEvidenceId: round1Qualifying2SourceEvidenceId,
        qualifyingSessionIds: ['session_froc_2024_r1_qualifying_2'],
        report
      });
      if (updated !== row) {
        report.round1Race3RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
      }
      return updated;
    }

    if (row.sessionId === 'session_froc_2024_r4_race_1') {
      const updated = applyGrid({
        row,
        startPosition: round4Race1Grid.get(row.carNumber),
        source: 'Toyota Euromarque Qualifying 1 article plus Qualifying 1 table',
        sourceEvidenceId: round4Qualifying1SourceEvidenceId,
        qualifyingSessionIds: ['session_froc_2024_r4_qualifying_1'],
        report
      });
      if (updated !== row) {
        report.round4Race1RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
      }
      return updated;
    }

    if (row.sessionId === 'session_froc_2024_r5_race_1') {
      const updated = applyGrid({
        row,
        startPosition: race1Grid.get(row.carNumber),
        source: 'Toyota Highlands qualifying-format article plus Qualifying 1 table',
        sourceEvidenceId: highlandsPreviewSourceEvidenceId,
        qualifyingSessionIds: ['session_froc_2024_r5_qualifying_1'],
        report
      });
      if (updated !== row) report.race1RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
      return updated;
    }

    if (row.sessionId === 'session_froc_2024_r5_race_3') {
      const updated = applyGrid({
        row,
        startPosition: grandPrixGrid.get(row.carNumber),
        source: 'Toyota Highlands qualifying-format article plus Qualifying 1/2/3 tables',
        sourceEvidenceId: highlandsPreviewSourceEvidenceId,
        qualifyingSessionIds: [
          'session_froc_2024_r5_qualifying_1',
          'session_froc_2024_r5_qualifying_2',
          'session_froc_2024_r5_qualifying_3'
        ],
        report
      });
      if (updated !== row) report.race3RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
      return updated;
    }

    if (row.sessionId === 'session_froc_2024_r5_race_2') {
      const startPosition = race2TopEightGrid.get(row.carNumber);
      if (startPosition) {
        const updated = applyGrid({
          row,
          startPosition,
          source: 'Toyota Highlands Race 2 official article top-eight grid narrative',
          sourceEvidenceId: race2SourceEvidenceId,
          qualifyingSessionIds: [],
          report
        });
        if (updated !== row) report.race2RowsUpdated.push({ resultId: row.id, carNumber: row.carNumber, startPosition: updated.startPosition });
        return updated;
      }
      if (row.startPosition === null && row.gridPosition === null) {
        report.race2RowsPreservedWithoutStarts.push(row.id);
      }
    }

    return row;
  });

  const nextDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    results: nextResults,
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidence.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: asArray(dataset.gaps).map(mergeGapDescription).sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);

  const frocImportReport = await readJsonIfExists(frocImportReportPath, null);
  if (frocImportReport) {
    await writeFile(frocImportReportPath, `${JSON.stringify({
      ...frocImportReport,
      gaps: asArray(frocImportReport.gaps).map(mergeGapDescription)
    }, null, 2)}\n`);
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    round1Race1RowsUpdated: report.round1Race1RowsUpdated.length,
    round1Race2RowsUpdated: report.round1Race2RowsUpdated.length,
    round1Race2RowsPreservedWithoutStarts: report.round1Race2RowsPreservedWithoutStarts.length,
    round1Race3RowsUpdated: report.round1Race3RowsUpdated.length,
    round4Race1RowsUpdated: report.round4Race1RowsUpdated.length,
    race1RowsUpdated: report.race1RowsUpdated.length,
    race2RowsUpdated: report.race2RowsUpdated.length,
    race3RowsUpdated: report.race3RowsUpdated.length,
    race2RowsPreservedWithoutStarts: report.race2RowsPreservedWithoutStarts.length,
    conflicts: report.conflicts.length
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
