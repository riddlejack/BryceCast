#!/usr/bin/env node

import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function parseArgs(argv) {
  const options = {dataRoot: DEFAULT_DATA_ROOT, throughDate: '2026-07-18'};
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (argv[index] === '--through-date') options.throughDate = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.throughDate)) throw new Error('--through-date must be YYYY-MM-DD');
  return options;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function optionalJson(path) {
  return (await exists(path)) ? JSON.parse(await readFile(path, 'utf8')) : null;
}

async function atomicWrite(path, text) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, text);
  const {rename} = await import('node:fs/promises');
  await rename(temporary, path);
}

function groupCount(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function csvValue(value) {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const options = parseArgs(process.argv);
const manifest = JSON.parse(await readFile(join(options.dataRoot, 'manifests/source-files.json'), 'utf8'));
const catalog = JSON.parse(await readFile(join(options.dataRoot, 'catalog/session-catalog.json'), 'utf8'));
const timingQuality = await optionalJson(join(options.dataRoot, 'catalog/timing71-session-quality-all.json'));
const raceToolsQuality = await optionalJson(join(options.dataRoot, 'catalog/racetools-session-quality-bryce.json'));
const timing71Canonical2026 = await optionalJson(
  join(REPO_ROOT, 'analysis/historical-high-frequency-data-audit/timing71-2026-coverage.json'),
);
const reconciliation = await optionalJson(join(options.dataRoot, 'catalog/coverage-reconciliation.json'));
const timingById = new Map((timingQuality?.sessions ?? []).map((row) => [row.sessionId, row]));
const raceToolsById = new Map((raceToolsQuality?.sessions ?? []).map((row) => [row.sessionId, row]));

const throughSessions = catalog.sessions.filter((session) => !session.date || session.date <= options.throughDate);
const raceToolsBryceYears = throughSessions.filter(
  (session) => session.source === 'RaceTools' && session.series === 'INDY_NXT' && [2024, 2025].includes(session.year),
);
const timingCandidates = throughSessions.filter((session) => session.source === 'Timing71');
const rosterBearingTimingCandidates = timingCandidates.filter((session) => {
  const quality = timingById.get(session.id);
  return (
    !session.quality.status.startsWith('quarantined') &&
    quality?.analysis?.content?.bryceSegment?.frameCount > 0 &&
    quality.analysis.quality.status === 'usable'
  );
});
const canonical2026ReplayIds = new Set([
  ...(timing71Canonical2026?.raceReplays ?? []).map((row) => row.replayId),
  ...(timing71Canonical2026?.nonRaceSessionCandidates ?? []).map((row) => row.replayId),
]);
const canonical2026MetadataByReplayId = new Map([
  ...(timing71Canonical2026?.raceReplays ?? []).map((row) => [
    row.replayId,
    {event: row.event, sessionType: 'race'},
  ]),
  ...(timing71Canonical2026?.nonRaceSessionCandidates ?? []).map((row) => [
    row.replayId,
    {event: row.event, sessionType: /qual/i.test(row.sessionType) ? 'qualifying' : 'practice'},
  ]),
]);
const canonicalTimingNxt2026 = timingCandidates
  .filter((session) => {
    const quality = timingById.get(session.id);
    return (
      session.year === 2026 &&
      canonical2026ReplayIds.has(session.replayId) &&
      !session.quality.status.startsWith('quarantined') &&
      quality?.analysis?.quality?.status === 'usable'
    );
  })
  .map((session) => ({...session, canonical: canonical2026MetadataByReplayId.get(session.replayId)}));
const missingCanonical2026ReplayIds = [...canonical2026ReplayIds].filter(
  (replayId) => !canonicalTimingNxt2026.some((session) => session.replayId === replayId),
);
if (missingCanonical2026ReplayIds.length > 0) {
  throw new Error(`Canonical 2026 Timing71 replays missing or unusable: ${missingCanonical2026ReplayIds.join(', ')}`);
}
const usableRaceToolsHighFrequency = raceToolsBryceYears.filter((session) => {
  const quality = raceToolsById.get(session.id);
  return !session.quality.status.startsWith('quarantined') && quality?.analysis?.quality?.status === 'usable';
});
const raceToolsCsvOnly = raceToolsBryceYears.filter((session) => {
  const quality = raceToolsById.get(session.id);
  return quality?.analysis?.quality?.status === 'no_heartbeat' && quality.analysis.derivedCsv.rowCountExcludingHeader > 0;
});
const quarantinedRaceTools = raceToolsBryceYears.filter((session) => session.quality.status.startsWith('quarantined'));

const coverageRows = [
  ...raceToolsBryceYears.map((session) => {
    const quality = raceToolsById.get(session.id);
    return {
      year: session.year,
      date: session.date,
      source: session.source,
      sessionId: session.id,
      replayId: null,
      series: session.series,
      sessionType: session.sessionType,
      event: session.event,
      sessionLabel: session.sessionLabel,
      sourceQuality: session.quality.status,
      decodedQuality: quality?.error ? 'analysis_error' : quality?.analysis?.quality?.status ?? 'not_analyzed',
      heartbeatCount: quality?.analysis?.replayLog?.heartbeatCount ?? null,
      heartbeatMedianGapSeconds: quality?.analysis?.replayLog?.heartbeatGapMedianSeconds ?? null,
      namedSectionRecordCount: quality?.analysis?.replayLog?.namedSectionTiming?.recordCount ?? null,
      cleanSegmentFrameCount: null,
      cleanSegmentMaxLap: null,
      cleanSegmentHasCheckered: null,
    };
  }),
  ...canonicalTimingNxt2026.map((session) => {
    const quality = timingById.get(session.id);
    const segment = quality.analysis.content.bryceSegment;
    return {
      year: session.year,
      date: session.date,
      source: session.source,
      sessionId: session.id,
      replayId: session.replayId,
      series: 'INDY_NXT',
      sessionType: session.canonical.sessionType,
      event: session.canonical.event,
      sessionLabel: session.sessionLabel,
      sourceQuality: session.quality.status,
      decodedQuality: quality.analysis.quality.status,
      heartbeatCount: null,
      heartbeatMedianGapSeconds: null,
      namedSectionRecordCount: null,
      cleanSegmentFrameCount: segment.frameCount,
      cleanSegmentMaxLap: segment.maxLap,
      cleanSegmentHasCheckered: segment.hasCheckered,
    };
  }),
].sort((left, right) =>
  [left.year, left.date ?? '', left.source, left.sessionLabel].join('|').localeCompare(
    [right.year, right.date ?? '', right.source, right.sessionLabel].join('|'),
  ),
);

const sourceGroups = {};
for (const file of manifest.files) {
  const key = `${file.sourceId}:${file.year ?? 'all'}`;
  sourceGroups[key] ??= {files: 0, bytes: 0};
  sourceGroups[key].files += 1;
  sourceGroups[key].bytes += file.bytes;
}
const uniqueObjects = new Map(manifest.files.map((file) => [file.sha256, file.bytes]));
const logicalBytes = manifest.files.reduce((sum, file) => sum + file.bytes, 0);
const uniqueBytes = [...uniqueObjects.values()].reduce((sum, bytes) => sum + bytes, 0);

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  throughDate: options.throughDate,
  completionDefinition:
    'Completeness is established by two independent methods. (1) Source-index completeness: every file exposed by the ' +
    'tested RaceTools indexes and Timing71 IndyCar archive for 2024 through the through-date is mirrored. (2) ' +
    'Official-schedule reconciliation: every completed canonical INDY NXT championship-weekend session ' +
    '(practice/qualifying/race, status "official") is matched by date and type against a lake high-frequency capture, per ' +
    'catalog/coverage-reconciliation.json. Exactly one canonical session is a documented exception — 2025 Iowa ' +
    'Qualifications (session_indy_nxt_2025_6596, 2025-07-11): it carries zero qualifying results in the canonical dataset, ' +
    'has no official-schedule window or weather observation, and has no RaceTools or Timing71 capture — evidence consistent ' +
    'with a cancelled/converted session, recorded as unmapped-with-evidence rather than assumed present. Neither method ' +
    'proves that an unlisted private test or recording never existed.',
  officialScheduleReconciliation: reconciliation
    ? {
        source: 'catalog/coverage-reconciliation.json',
        generatedAt: reconciliation.generatedAt,
        method: reconciliation.method,
        pastChampionshipSessions: reconciliation.physicalSessionCounts?.pastChampionshipThroughDate ?? null,
        matchedCount: reconciliation.matchedCount,
        unmatchedCount: reconciliation.unmatchedCount,
        unmappedWithEvidence: (reconciliation.unmatched ?? []).map((physical) => ({
          date: physical.date,
          sessionType: physical.sessionType,
          eventName: physical.eventName,
          canonicalSessionIds: physical.canonicalSessions.map((session) => session.id),
          classification: physical.evidence?.classification ?? null,
          detail: physical.evidence?.detail ?? null,
        })),
      }
    : {
        source: 'catalog/coverage-reconciliation.json',
        status: 'not_generated',
        note: 'Run `node analysis/historical-data-lake/reconcile-coverage.mjs` before build-coverage to populate the official-schedule reconciliation.',
      },
  acquisition: {
    sourceFiles: manifest.files.length,
    uniqueObjects: uniqueObjects.size,
    logicalBytes,
    uniqueBytes,
    exactDuplicateBytesAvoided: logicalBytes - uniqueBytes,
    bySourceYear: sourceGroups,
  },
  catalog: {
    sessions: catalog.sessions.length,
    byYearSourceSeriesType: groupCount(
      throughSessions,
      (session) => `${session.year}:${session.source}:${session.series}:${session.sessionType}`,
    ),
  },
  bryceHighFrequencyCoverage: {
    raceTools2024And2025SourceCandidates: raceToolsBryceYears.length,
    raceToolsUsableHighFrequency: usableRaceToolsHighFrequency.length,
    raceToolsCsvOnlyLowerGrain: raceToolsCsvOnly.length,
    raceToolsQuarantinedDuplicate: quarantinedRaceTools.length,
    raceToolsCandidatesByYearType: groupCount(raceToolsBryceYears, (session) => `${session.year}:${session.sessionType}`),
    timing71RosterBearingCandidatesNotCoverageClaims: rosterBearingTimingCandidates.length,
    timing71Canonical2026Sessions: canonicalTimingNxt2026.length,
    timing71Canonical2026ByType: groupCount(canonicalTimingNxt2026, (session) => session.canonical.sessionType),
    timing71Canonical2026Race: canonicalTimingNxt2026.filter((session) => session.canonical.sessionType === 'race').length,
    timing71Canonical2026PracticeQualifying: canonicalTimingNxt2026.filter((session) =>
      ['practice', 'qualifying'].includes(session.canonical.sessionType),
    ).length,
    missingCanonical2026ReplayIds,
  },
  knownExceptions: [
    {
      source: 'RaceTools',
      date: '2025-05-10',
      issue: 'Contaminated IMS Race 1-labelled duplicate contains mixed sessions.',
      resolution: 'Clean 2025-05-09 Race 1 replay is retained and selected.',
    },
    {
      source: 'RaceTools',
      date: '2025-05-09',
      issue: 'IMS Practice 1 raw replay log contains only a session header; its 522-row CSV is lower-grain.',
      resolution: 'Timing71 replay 1be17234-2d3c-4413-94b1-e3f9a51603c6 contains 2,278 reconstructed Bryce-roster frames for the session.',
    },
    {
      source: 'RaceTools',
      date: '2026-03-29',
      issue: 'Published Barber Race 2 NXT ZIP is only 22 bytes and invalid.',
      resolution: 'Timing71 clean NXT replay supplies the completed historical session.',
    },
    {
      source: 'Timing71',
      issue: 'Some recordings include stale or adjacent INDYCAR session states; two NXT-labelled candidates are false positives.',
      resolution: 'Coverage requires a decoded Bryce-roster segment; three hidden NXT races in INDYCAR-labelled captures are recovered.',
    },
  ],
  coverageRowCount: coverageRows.length,
};

await atomicWrite(join(options.dataRoot, 'catalog/coverage-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
const columns = Object.keys(coverageRows[0] ?? {});
const csv = [columns.join(','), ...coverageRows.map((row) => columns.map((column) => csvValue(row[column])).join(','))].join(
  '\n',
);
await atomicWrite(join(options.dataRoot, 'catalog/coverage-2024-through-today.csv'), `${csv}\n`);
process.stdout.write(`${JSON.stringify(summary.bryceHighFrequencyCoverage, null, 2)}\n`);
