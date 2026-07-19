#!/usr/bin/env node

// Official-schedule reconciliation for the historical data lake (Wave 0 audit
// condition 1). The lake's completeness claim was originally checked only against
// the source indexes themselves. This script reconciles it against the canonical
// career dataset — the project's official session list — so the claim is verified,
// not merely surviving by luck.
//
// It enumerates every canonical INDY NXT session in the coverage window, collapses
// group/combined qualifying rows into physical (event, date, type) sessions, and
// checks each against the lake's high-frequency coverage matrix by date and type.
// Any canonical session with no lake capture is reported with corroborating
// evidence (qualifying-result count, official-schedule presence, weather refs) so
// a genuine gap can be told apart from a cancelled/converted session.
//
// Repeatable check: re-run after every canonical refresh or lake sync. No network.

import {access, mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');
const DEFAULT_CANONICAL = join(REPO_ROOT, 'data/career/career.dataset.json');
const CANONICAL_SERIES_ID = 'series_indy_nxt';
const CHAMPIONSHIP_SESSION_TYPES = new Set(['practice', 'qualifying', 'race']);

function parseArgs(argv) {
  const options = {dataRoot: DEFAULT_DATA_ROOT, canonical: DEFAULT_CANONICAL, throughDate: '2026-07-18', dateToleranceDays: 1};
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (argv[index] === '--canonical') options.canonical = resolve(argv[++index]);
    else if (argv[index] === '--through-date') options.throughDate = argv[++index];
    else if (argv[index] === '--date-tolerance-days') options.dateToleranceDays = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.throughDate)) throw new Error('--through-date must be YYYY-MM-DD');
  if (!Number.isInteger(options.dateToleranceDays) || options.dateToleranceDays < 0 || options.dateToleranceDays > 3) {
    throw new Error('--date-tolerance-days must be an integer from 0 to 3');
  }
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

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  const {rename} = await import('node:fs/promises');
  await rename(temporary, path);
}

function resolveSessionDate(session, event) {
  const raw = session.scheduledStart;
  if (raw) {
    const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const usa = String(raw).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (usa) return `${usa[3]}-${String(usa[1]).padStart(2, '0')}-${String(usa[2]).padStart(2, '0')}`;
  }
  if (event?.eventStartDate) return String(event.eventStartDate).slice(0, 10);
  return null;
}

function shiftDate(date, deltaDays) {
  const time = new Date(`${date}T00:00:00Z`);
  time.setUTCDate(time.getUTCDate() + deltaDays);
  return time.toISOString().slice(0, 10);
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const options = parseArgs(process.argv);

const canonical = JSON.parse(await readFile(options.canonical, 'utf8'));
const events = new Map(canonical.events.filter((event) => event.seriesId === CANONICAL_SERIES_ID).map((event) => [event.id, event]));
const qualifyingResultCountBySession = new Map();
for (const row of canonical.qualifyingResults ?? []) {
  qualifyingResultCountBySession.set(row.sessionId, (qualifyingResultCountBySession.get(row.sessionId) ?? 0) + 1);
}
const resultCountBySession = new Map();
for (const row of canonical.results ?? []) {
  resultCountBySession.set(row.sessionId, (resultCountBySession.get(row.sessionId) ?? 0) + 1);
}

// Collapse canonical sessions into physical (event, date, type) sessions.
const physicalByKey = new Map();
for (const session of canonical.sessions) {
  const event = events.get(session.eventId);
  if (!event) continue;
  const date = resolveSessionDate(session, event);
  const key = `${session.eventId}|${date}|${session.sessionType}`;
  if (!physicalByKey.has(key)) {
    physicalByKey.set(key, {
      eventId: session.eventId,
      eventName: event.name,
      trackId: event.trackId,
      date,
      sessionType: session.sessionType,
      canonicalSessions: [],
    });
  }
  physicalByKey.get(key).canonicalSessions.push({
    id: session.id,
    sessionName: session.sessionName,
    status: session.status,
    scheduledStart: session.scheduledStart ?? null,
    hasOfficialScheduleWindow: Boolean(session.raw?.indycarWeekendScheduleWindow),
    weatherObservationRefCount: (session.weatherObservationRefs ?? []).length,
    qualifyingResultCount: qualifyingResultCountBySession.get(session.id) ?? 0,
    resultCount: resultCountBySession.get(session.id) ?? 0,
  });
}
const physicalSessions = [...physicalByKey.values()];
const pastChampionship = physicalSessions.filter(
  (physical) => CHAMPIONSHIP_SESSION_TYPES.has(physical.sessionType) && physical.date && physical.date <= options.throughDate,
);
const futureCount = physicalSessions.filter((physical) => physical.date && physical.date > options.throughDate).length;

// Load the lake's high-frequency coverage matrix (date + sessionType).
const coverageCsvPath = join(options.dataRoot, 'catalog/coverage-2024-through-today.csv');
const csvLines = (await readFile(coverageCsvPath, 'utf8')).trim().split('\n');
const header = csvLines[0].split(',');
const columnIndex = Object.fromEntries(header.map((name, index) => [name, index]));
const lakeRows = csvLines.slice(1).map(parseCsvLine);
const lakeByDateType = new Map();
for (const row of lakeRows) {
  const key = `${row[columnIndex.date]}|${row[columnIndex.sessionType]}`;
  if (!lakeByDateType.has(key)) lakeByDateType.set(key, []);
  lakeByDateType.get(key).push({
    date: row[columnIndex.date],
    source: row[columnIndex.source],
    sessionType: row[columnIndex.sessionType],
    event: row[columnIndex.event],
    sessionLabel: row[columnIndex.sessionLabel],
  });
}

function matchLake(physical) {
  for (let delta = 0; delta <= options.dateToleranceDays; delta += 1) {
    for (const signed of delta === 0 ? [0] : [-delta, delta]) {
      const key = `${shiftDate(physical.date, signed)}|${physical.sessionType}`;
      if (lakeByDateType.has(key)) return {matchedDateOffsetDays: signed, lakeRows: lakeByDateType.get(key)};
    }
  }
  return null;
}

function assessUnmatched(physical) {
  const quali = physical.sessionType === 'qualifying';
  const allZeroResults = physical.canonicalSessions.every(
    (session) => session.qualifyingResultCount === 0 && session.resultCount === 0,
  );
  const noScheduleWindow = physical.canonicalSessions.every((session) => !session.hasOfficialScheduleWindow);
  const noWeather = physical.canonicalSessions.every((session) => session.weatherObservationRefCount === 0);
  if (quali && allZeroResults && noScheduleWindow) {
    return {
      classification: 'evidence_consistent_with_cancellation',
      detail:
        'Canonical marks the session official but it carries zero qualifying/race results, no official-schedule window, ' +
        `${noWeather ? 'and no weather observations, ' : ''}and no lake high-frequency capture exists. Consistent with a ` +
        'cancelled or converted session rather than a missing high-frequency source. Recorded as unmapped-with-evidence.',
    };
  }
  return {
    classification: 'genuine_coverage_gap_candidate',
    detail:
      'Canonical session has no lake high-frequency capture and shows result/schedule evidence of having occurred. ' +
      'Investigate as a possible missing source before publishing the completeness claim.',
  };
}

const matched = [];
const unmatched = [];
for (const physical of pastChampionship) {
  const match = matchLake(physical);
  if (match) matched.push({physical, match});
  else unmatched.push({...physical, evidence: assessUnmatched(physical)});
}

// Lake captures that map to no canonical championship physical session (e.g. test
// days and extra oval practices the canonical dataset does not track): reported as
// an informational superset, never as a gap.
const canonicalDateTypes = new Set(pastChampionship.map((physical) => `${physical.date}|${physical.sessionType}`));
const lakeOnly = [...lakeByDateType.keys()].filter((key) => {
  const [, sessionType] = key.split('|');
  return CHAMPIONSHIP_SESSION_TYPES.has(sessionType) && !canonicalDateTypes.has(key) && ![-1, 1].some((delta) => {
    const [date] = key.split('|');
    return canonicalDateTypes.has(`${shiftDate(date, delta)}|${sessionType}`);
  });
});

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  throughDate: options.throughDate,
  method:
    'Reconcile the lake high-frequency coverage matrix against the canonical career dataset (the official session list). ' +
    'Canonical INDY NXT practice/qualifying/race sessions are collapsed to physical (event, date, type) sessions and matched ' +
    `to a lake capture by exact date and type, with a ±${options.dateToleranceDays}-day fallback. This is official-schedule ` +
    'reconciliation, not source-index self-consistency.',
  canonical: {
    path: options.canonical.replace(`${REPO_ROOT}/`, ''),
    seriesId: CANONICAL_SERIES_ID,
    schemaVersion: canonical.schemaVersion ?? null,
    updatedAt: canonical.updatedAt ?? null,
  },
  dateToleranceDays: options.dateToleranceDays,
  physicalSessionCounts: {
    totalChampionship: physicalSessions.filter((physical) => CHAMPIONSHIP_SESSION_TYPES.has(physical.sessionType)).length,
    pastChampionshipThroughDate: pastChampionship.length,
    futureAfterThroughDate: futureCount,
  },
  matchedCount: matched.length,
  unmatchedCount: unmatched.length,
  unmatched,
  lakeOnlyChampionshipDateTypes: lakeOnly.length,
  lakeOnlyNote:
    'Lake date/type buckets with no canonical championship session — expected superset (private tests, extra oval practices). Not coverage gaps.',
};

await atomicWriteJson(join(options.dataRoot, 'catalog/coverage-reconciliation.json'), report);
process.stdout.write(
  `${JSON.stringify(
    {
      pastChampionship: pastChampionship.length,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatchedSessions: unmatched.map((physical) => `${physical.date} ${physical.sessionType} @ ${physical.eventName} (${physical.canonicalSessions.map((session) => session.id).join(', ')})`),
    },
    null,
    2,
  )}\n`,
);
