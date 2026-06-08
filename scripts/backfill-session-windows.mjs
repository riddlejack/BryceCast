import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const frocIndexPath = join(root, 'data/career/raw/froc-2024/froc-2024-extracted-index.json');
const rawDir = join(root, 'data/career/raw/session-windows/froc-2024');
const reportPath = join(root, 'data/career/reports/session-window-backfill-report.json');
const frocImportReportPath = join(root, 'data/career/reports/froc-2024-import-report.json');
const tesseractPath = '/opt/homebrew/bin/tesseract';
const pdfToTextPath = '/opt/homebrew/bin/pdftotext';
const refresh = process.argv.includes('--refresh');

const reviewedFrocWindows = [
  { round: 1, sourceLabel: 'Website_TimeTable_1150x790', entries: [
    ['practice_1', '2024-01-19T09:46:00'], ['practice_2', '2024-01-19T13:12:00'], ['practice_3', '2024-01-19T16:20:00'],
    ['qualifying_1', '2024-01-20T10:43:00'], ['race_1', '2024-01-20T16:12:00'],
    ['qualifying_2', '2024-01-21T10:04:00'], ['race_2', '2024-01-21T12:30:00'], ['race_3', '2024-01-21T16:04:00']
  ] },
  { round: 2, sourceLabel: '2024 CTFROC Website schedule R2 1150x790', entries: [
    ['practice_1', '2024-01-26T09:20:00'], ['practice_2', '2024-01-26T12:20:00'], ['practice_3', '2024-01-26T15:10:00'],
    ['qualifying_1', '2024-01-27T11:50:00'], ['race_1', '2024-01-27T15:11:00'],
    ['qualifying_2', '2024-01-28T10:06:00'], ['race_2', '2024-01-28T12:53:00'], ['race_3', '2024-01-28T15:54:00']
  ] },
  { round: 3, sourceLabel: '2024 CTFROC Website schedule R3 1150x790', entries: [
    ['practice_1', '2024-02-02T09:21:00'], ['practice_2', '2024-02-02T12:47:00'], ['practice_3', '2024-02-02T15:49:00'],
    ['qualifying_1', '2024-02-03T11:59:00'], ['race_1', '2024-02-03T15:11:00'],
    ['qualifying_2', '2024-02-04T10:02:00'], ['race_2', '2024-02-04T12:52:00'], ['race_3', '2024-02-04T16:03:00']
  ] },
  { round: 4, sourceLabel: '2024 CTFROC Website schedule R4 1150x790', entries: [
    ['practice_1', '2024-02-09T09:20:00'], ['practice_2', '2024-02-09T12:55:00'], ['practice_3', '2024-02-09T16:10:00'],
    ['qualifying_1', '2024-02-10T11:42:00'], ['race_1', '2024-02-10T15:57:00'],
    ['qualifying_2', '2024-02-11T09:54:00'], ['race_2', '2024-02-11T12:36:00'], ['race_3', '2024-02-11T16:04:00']
  ] },
  { round: 5, sourceLabel: '2024 CTFROC Website schedule 1150x790 Round 5', entries: [
    ['practice_1', '2024-02-16T10:18:00'], ['practice_2', '2024-02-16T13:23:00'], ['practice_3', '2024-02-16T16:21:00'],
    ['qualifying_1', '2024-02-17T11:22:00'], ['qualifying_2', '2024-02-17T11:22:00'], ['qualifying_3', '2024-02-17T11:22:00'], ['race_1', '2024-02-17T16:05:00'],
    ['race_2', '2024-02-18T11:24:00'], ['race_3', '2024-02-18T15:48:00']
  ] }
];

const reviewedFrocTestDayArticles = [
  {
    round: 1,
    title: "Mansell's fastest ever Taupo lap an earthshaker",
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/january/mansells-fastest-ever-taupo-lap-an-earthshaker/',
    publishedAt: '2024-01-19',
    supportedDate: '2024-01-18',
    sessionSuffixes: ['test_1', 'test_2', 'test_3'],
    supportSummary: 'Official Toyota article published on 2024-01-19 says a general test day on Thursday preceded Friday official practice at Taupo. This supports date-level context only for the Toyota result-page Test 1/2/3 tabs.'
  },
  {
    round: 3,
    title: 'Woods-Toth sets Hampton Downs pace',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/woods-toth-sets-hampton-dpwns-pace/',
    publishedAt: '2024-02-01',
    supportedDate: '2024-02-01',
    sessionSuffixes: ['test_1', 'test_2'],
    supportSummary: 'Official Toyota article published on 2024-02-01 reports two Thursday Hampton Downs test sessions before Friday official practice. This supports date-level context only for the Toyota result-page Test 1/2 tabs.'
  },
  {
    round: 4,
    title: 'Woods-Toth pips Bilinski in Euromarque Motorsport Park test',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/woods-toth-pips-bilinski-in-euromarque-motorsport-park-test/',
    publishedAt: '2024-02-08',
    supportedDate: '2024-02-08',
    sessionSuffixes: ['test_1', 'test_2'],
    supportSummary: 'Official Toyota article published on 2024-02-08 reports two Euromarque Motorsport Park test sessions before Friday official practice. This supports date-level context only for the Toyota result-page Test 1/2 tabs.'
  },
  {
    round: 5,
    title: 'Abel tops Highlands testing, Hedge a major dark horse',
    url: 'https://www.toyota.co.nz/toyota-racing/castrol-toyota-fr-oceania/news/2024/february/abel-tops-highlands-testing-hedge-a-major-dark-horse/',
    publishedAt: '2024-02-16',
    supportedDate: '2024-02-16',
    sessionSuffixes: ['test_1', 'test_2'],
    supportSummary: 'Official Toyota article published on 2024-02-16 reports two Highlands testing sessions and matches the Toyota result-page Test 1/2 context. This supports date-level context only for those tabs.'
  }
];

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

const fetchTextCached = async (url, path) => {
  if (!refresh && (await nonEmptyFileExists(path))) return { fromCache: true, text: await readFile(path, 'utf8') };
  const response = await fetch(url, { headers: { accept: 'text/html,application/xhtml+xml,text/plain,*/*' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const text = await response.text();
  await writeFile(path, text);
  return { fromCache: false, text };
};

const nonEmptyFileExists = async (path) => {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
};

const fetchBinaryCached = async (url, path) => {
  if (!refresh && (await nonEmptyFileExists(path))) return { fromCache: true };
  const response = await fetch(url, { headers: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,application/pdf,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  return { fromCache: false };
};

const ocrImageCached = async (imagePath, textPath) => {
  if (!refresh && (await nonEmptyFileExists(textPath))) return { fromCache: true, text: await readFile(textPath, 'utf8') };
  const { stdout } = await execFileAsync(tesseractPath, [imagePath.split('/').pop(), 'stdout', '--psm', '6'], { cwd: dirname(imagePath) });
  await writeFile(textPath, stdout);
  return { fromCache: false, text: stdout };
};

const pdfTextCached = async (pdfPath, textPath) => {
  if (!refresh && (await nonEmptyFileExists(textPath))) return { fromCache: true, text: await readFile(textPath, 'utf8') };
  const { stdout } = await execFileAsync(pdfToTextPath, [pdfPath, '-']);
  await writeFile(textPath, stdout);
  return { fromCache: false, text: stdout };
};

const localDateTime = (date, time, fallbackSeconds = '00') => {
  const [, day, month, year] = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/) ?? [];
  const [, hour, minute, second] = time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/) ?? [];
  if (!day || !hour) return null;
  return `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:${second ?? fallbackSeconds}`;
};

const parseFrocTestTimingPdf = (text) => {
  const dateTimeMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\b/);
  const actualStartMatch = text.match(/started at\s+(\d{1,2}:\d{2}(?::\d{2})?)/i);
  const scheduledStart = dateTimeMatch ? localDateTime(dateTimeMatch[1], dateTimeMatch[2]) : null;
  const actualStart = dateTimeMatch && actualStartMatch ? localDateTime(dateTimeMatch[1], actualStartMatch[1]) : null;
  return { scheduledStart, actualStart };
};

const sourceEvidence = ({ id, sourceType = 'official_image', sourceName, url, retrievedAt, publishedAt = null, coverage, rawArtifactPath, notes }) => ({
  id,
  sourceType,
  sourceName,
  url,
  retrievedAt,
  publishedAt,
  accessedBy: 'scripts/backfill-session-windows.mjs',
  licenseNotes:
    sourceType === 'official_article'
      ? 'Public official Toyota Gazoo Racing New Zealand article; store link, short summary, and reviewed session-date context only.'
      : 'Public official Toyota Gazoo Racing New Zealand schedule image or timing PDF; store reviewed session-window facts and source URL.',
  confidenceTier: 'official',
  coverage,
  parser: 'scripts/backfill-session-windows.mjs',
  rawArtifactPath,
  notes
});

const upsert = (map, row) => {
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  map.set(row.id, {
    ...current,
    ...row,
    provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]))
  });
};

const mergeSessionTimeGapDescription = (gap) => {
  if (gap.id !== 'gap_froc_2024_session_times_missing') return gap;
  return {
    ...gap,
    status: 'partial',
    description: 'Official Toyota schedule images backfill practice, qualifying, and race starts for FROC 2024, and official Round 2 timing PDFs backfill Test 1 and Test 2. Official Toyota test-day articles are cached as date-level context for the other nine FROC test sessions, but those sessions remain unavailable for production session-hour weather joins because the official Toyota round pages expose test result tabs and article context but no official test timing PDF links or equivalent exact clock-time source for those sessions.'
  };
};

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJson(datasetPath);
  const frocIndex = await readJson(frocIndexPath);
  const retrievedAt = new Date().toISOString();
  const sourceEvidenceMap = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  const mediaAssets = new Map(asArray(dataset.mediaAssets).map((row) => [row.id, row]));
  const sessions = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const gaps = asArray(dataset.gaps).filter((gap) => gap.id !== 'gap_froc_2024_session_times_missing');

  const report = {
    checkedAt: retrievedAt,
    refresh,
    fetched: 0,
    cached: 0,
    schedulesCached: [],
    ocrArtifacts: [],
    pdfsCached: [],
    pdfTextArtifacts: [],
    testDayArticlesCached: 0,
    testDayArticleArtifacts: [],
    testDayContextSessionsAnnotated: 0,
    sessionsUpdated: [],
    sessionsMissing: [],
    unsourcedFrocTestSessions: [],
    notes: [
      'FROC Round 2 Test 1 and Test 2 are backfilled from official Toyota timing PDFs because those PDFs expose exact header and started-at times.',
      'FROC test sessions outside Round 2 are not present on the Toyota race-weekend schedule images or extracted official PDF links and remain without exact session windows.',
      'Official Toyota test-day articles are cached and attached as date-level context for the remaining FROC test sessions; they are not used to fabricate scheduledStart or actualStart.',
      'Round 5 Qualifying 1/2/3 are shown as one 54-minute qualifying block on the official image, so all three canonical qualifying segment rows share the block start.'
    ]
  };

  for (const roundConfig of reviewedFrocWindows) {
    const round = frocIndex.rounds.find((item) => Number(item.round) === roundConfig.round);
    const schedule = round?.mediaLinks?.find((asset) => asset.url && /schedule|timetable/i.test(`${asset.label} ${asset.url}`));
    if (!schedule) throw new Error(`Missing FROC round ${roundConfig.round} schedule image in extracted index.`);

    const imagePath = join(rawDir, `froc-2024-r${roundConfig.round}-schedule.jpg`);
    const ocrPath = join(rawDir, `froc-2024-r${roundConfig.round}-schedule.ocr.txt`);
    const image = await fetchBinaryCached(schedule.url, imagePath);
    report[image.fromCache ? 'cached' : 'fetched'] += 1;
    const ocr = await ocrImageCached(imagePath, ocrPath);
    if (ocr.fromCache) report.cached += 1;
    report.schedulesCached.push(relative(imagePath));
    report.ocrArtifacts.push(relative(ocrPath));

    const evidenceId = `source_froc_2024_r${roundConfig.round}_toyota_schedule_image`;
    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceName: `FROC 2024 Round ${roundConfig.round} Toyota schedule image`,
      url: schedule.url,
      retrievedAt,
      coverage: `Official Toyota-hosted race-weekend timetable image for FROC 2024 round ${roundConfig.round}.`,
      rawArtifactPath: relative(imagePath),
      notes: `Reviewed values are in scripts/backfill-session-windows.mjs; OCR artifact: ${relative(ocrPath)}. OCR text: ${ocr.text.replace(/\s+/g, ' ').trim()}`
    }));

    for (const [sessionSuffix, scheduledStart] of roundConfig.entries) {
      const sessionId = `session_froc_2024_r${roundConfig.round}_${sessionSuffix}`;
      const session = sessions.get(sessionId);
      if (!session) {
        report.sessionsMissing.push(sessionId);
        continue;
      }
      sessions.set(sessionId, {
        ...session,
        scheduledStart,
        timezone: session.timezone ?? 'Pacific/Auckland',
        timePrecision: 'local_datetime',
        timeSource: 'official_toyota_schedule_image',
        raw: {
          ...(session.raw ?? {}),
          sessionWindowBackfill: {
            source: 'Toyota schedule image',
            sourceUrl: schedule.url,
            reviewedLabel: roundConfig.sourceLabel
          }
        },
        provenanceRefs: Array.from(new Set([...(session.provenanceRefs ?? []), evidenceId]))
      });
      report.sessionsUpdated.push({ sessionId, scheduledStart, sourceEvidenceId: evidenceId });
    }

    const testPdfs = (round?.mediaLinks ?? [])
      .filter((asset) => asset.assetType === 'pdf' && /^Test\s+\d+$/i.test(asset.label ?? ''))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

    for (const asset of testPdfs) {
      const testNumber = Number(asset.label.match(/\d+/)?.[0]);
      if (!Number.isFinite(testNumber)) continue;

      const sessionId = `session_froc_2024_r${roundConfig.round}_test_${testNumber}`;
      const session = sessions.get(sessionId);
      if (!session) {
        report.sessionsMissing.push(sessionId);
        continue;
      }

      const slug = `froc-2024-r${roundConfig.round}-test-${testNumber}`;
      const pdfPath = join(rawDir, `${slug}.pdf`);
      const textPath = join(rawDir, `${slug}.txt`);
      const pdf = await fetchBinaryCached(asset.url, pdfPath);
      report[pdf.fromCache ? 'cached' : 'fetched'] += 1;
      const text = await pdfTextCached(pdfPath, textPath);
      if (text.fromCache) report.cached += 1;
      report.pdfsCached.push(relative(pdfPath));
      report.pdfTextArtifacts.push(relative(textPath));

      const parsed = parseFrocTestTimingPdf(text.text);
      if (!parsed.scheduledStart && !parsed.actualStart) {
        report.sessionsMissing.push(`${sessionId}:unparseable_pdf_time`);
        continue;
      }

      const evidenceId = `source_froc_2024_r${roundConfig.round}_test_${testNumber}_toyota_timing_pdf`;
      upsert(sourceEvidenceMap, sourceEvidence({
        id: evidenceId,
        sourceType: 'official_pdf',
        sourceName: `FROC 2024 Round ${roundConfig.round} ${asset.label} Toyota timing PDF`,
        url: asset.url,
        retrievedAt,
        coverage: `Official Toyota-hosted timing PDF for FROC 2024 round ${roundConfig.round} ${asset.label}.`,
        rawArtifactPath: relative(pdfPath),
        notes: `Text artifact: ${relative(textPath)}. Parsed scheduled/classification time ${parsed.scheduledStart ?? 'missing'} and actual started-at time ${parsed.actualStart ?? 'missing'} from PDF text.`
      }));

      sessions.set(sessionId, {
        ...session,
        scheduledStart: parsed.scheduledStart ?? session.scheduledStart,
        actualStart: parsed.actualStart ?? session.actualStart,
        timezone: session.timezone ?? 'Pacific/Auckland',
        timePrecision: 'local_datetime',
        timeSource: 'official_toyota_timing_pdf',
        raw: {
          ...(session.raw ?? {}),
          sessionWindowBackfill: {
            source: 'Toyota timing PDF',
            sourceUrl: asset.url,
            reviewedLabel: asset.label,
            scheduledStart: parsed.scheduledStart,
            actualStart: parsed.actualStart
          }
        },
        provenanceRefs: Array.from(new Set([...(session.provenanceRefs ?? []), evidenceId]))
      });
      report.sessionsUpdated.push({ sessionId, scheduledStart: parsed.scheduledStart, actualStart: parsed.actualStart, sourceEvidenceId: evidenceId });
    }
  }

  for (const article of reviewedFrocTestDayArticles) {
    const articlePath = join(rawDir, `froc-2024-r${article.round}-test-day-article.html`);
    const fetched = await fetchTextCached(article.url, articlePath);
    report[fetched.fromCache ? 'cached' : 'fetched'] += 1;
    report.testDayArticlesCached += 1;
    report.testDayArticleArtifacts.push(relative(articlePath));

    const evidenceId = `source_froc_2024_r${article.round}_toyota_test_day_article`;
    upsert(sourceEvidenceMap, sourceEvidence({
      id: evidenceId,
      sourceType: 'official_article',
      sourceName: `FROC 2024 Round ${article.round} Toyota test-day article`,
      url: article.url,
      retrievedAt,
      publishedAt: article.publishedAt,
      coverage: article.supportSummary,
      rawArtifactPath: relative(articlePath),
      notes: `${article.supportSummary} Exact scheduledStart/actualStart remains unsourced unless a timing PDF or equivalent official clock-time source is found.`
    }));

    const articleEventId =
      article.sessionSuffixes
        .map((sessionSuffix) => sessions.get(`session_froc_2024_r${article.round}_${sessionSuffix}`)?.eventId)
        .find(Boolean) ?? null;

    upsert(mediaAssets, {
      id: `asset_froc_2024_r${article.round}_test_day_toyota_article`,
      assetType: 'article',
      title: article.title,
      url: article.url,
      rightsStatus: 'link_only',
      publishedAt: article.publishedAt,
      eventId: articleEventId,
      sessionId: null,
      driverId: null,
      summary: article.supportSummary,
      quoteText: null,
      provenanceRefs: [evidenceId]
    });

    for (const sessionSuffix of article.sessionSuffixes) {
      const sessionId = `session_froc_2024_r${article.round}_${sessionSuffix}`;
      const session = sessions.get(sessionId);
      if (!session) {
        report.sessionsMissing.push(sessionId);
        continue;
      }
      if (session.scheduledStart || session.actualStart) continue;

      sessions.set(sessionId, {
        ...session,
        timezone: session.timezone ?? 'Pacific/Auckland',
        raw: {
          ...(session.raw ?? {}),
          testDayContextBackfill: {
            source: 'Toyota test-day article',
            sourceUrl: article.url,
            sourceEvidenceId: evidenceId,
            publishedAt: article.publishedAt,
            supportedDate: article.supportedDate,
            timeWindowStatus: 'date_context_only_exact_time_unsourced',
            notes: article.supportSummary
          }
        },
        provenanceRefs: Array.from(new Set([...(session.provenanceRefs ?? []), evidenceId]))
      });
      report.testDayContextSessionsAnnotated += 1;
    }
  }

  gaps.push({
    id: 'gap_froc_2024_session_times_missing',
    scope: 'froc_2024',
    status: 'partial',
    description: 'Official Toyota schedule images backfill practice, qualifying, and race starts for FROC 2024, and official Round 2 timing PDFs backfill Test 1 and Test 2. Official Toyota test-day articles are cached as date-level context for the other nine FROC test sessions, but those sessions remain unavailable for production session-hour weather joins because the official Toyota round pages expose test result tabs and article context but no official test timing PDF links or equivalent exact clock-time source for those sessions.'
  });

  const frocRoundsByNumber = new Map(asArray(frocIndex.rounds).map((round) => [Number(round.round), round]));
  report.unsourcedFrocTestSessions = Array.from(sessions.values())
    .filter((session) => /^session_froc_2024_r\d+_test_\d+$/.test(String(session.id ?? '')))
    .filter((session) => !session.scheduledStart && !session.actualStart)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((session) => {
      const roundNumber = Number(String(session.id).match(/_r(\d+)_/)?.[1]);
      const testNumber = Number(String(session.id).match(/_test_(\d+)$/)?.[1]);
      const round = frocRoundsByNumber.get(roundNumber);
      const matchingOfficialPdfLinks = asArray(round?.mediaLinks).filter(
        (asset) => asset.assetType === 'pdf' && new RegExp(`^Test\\s+${testNumber}$`, 'i').test(String(asset.label ?? ''))
      );
      return {
        sessionId: session.id,
        eventId: session.eventId,
        round: roundNumber,
        testNumber,
        reason: 'official_toyota_round_page_has_test_result_tab_and_article_date_context_but_no_test_timing_pdf_link_or_exact_clock_time_source',
        checkedRoundPage: round?.url ?? null,
        dateContextEvidenceId: session.raw?.testDayContextBackfill?.sourceEvidenceId ?? null,
        matchingOfficialPdfLinks: matchingOfficialPdfLinks.map((asset) => ({ label: asset.label, url: asset.url }))
      };
    });

  const nextDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    mediaAssets: Array.from(mediaAssets.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id)),
    gaps: gaps.sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);

  const frocImportReport = await readJsonIfExists(frocImportReportPath, null);
  if (frocImportReport) {
    await writeFile(frocImportReportPath, `${JSON.stringify({
      ...frocImportReport,
      gaps: asArray(frocImportReport.gaps).map(mergeSessionTimeGapDescription)
    }, null, 2)}\n`);
  }

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    sessionsUpdated: report.sessionsUpdated.length,
    schedulesCached: report.schedulesCached.length,
    sessionsMissing: report.sessionsMissing
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
