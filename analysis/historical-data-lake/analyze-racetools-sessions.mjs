#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeRaceToolsReplay, readSessionZipBytes} from './lib/archive-reader.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function parseArgs(argv) {
  const options = {dataRoot: DEFAULT_DATA_ROOT, concurrency: 2, scope: 'all'};
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (argv[index] === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (argv[index] === '--scope') options.scope = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!['all', 'nxt', 'bryce'].includes(options.scope)) throw new Error('--scope must be all, nxt, or bryce');
  return options;
}

async function atomicWriteJson(path, value) {
  await mkdir(dirname(path), {recursive: true});
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  const {rename} = await import('node:fs/promises');
  await rename(temporary, path);
}

async function runWithConcurrency(items, concurrency, worker) {
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({length: concurrency}, () => lane()));
}

function compactRaceToolsAnalysis(analysis) {
  const replay = analysis.replayLog;
  const sections = replay.namedSectionTiming;
  const tickInference = sections?.rawTickScaleInference;
  return {
    archiveEntries: analysis.archiveEntries,
    replayLog: {
      bytes: replay.bytes,
      lineCount: replay.lineCount,
      sessionHeaderCount: replay.sessionHeaderCount,
      observedSessions: replay.observedSessions,
      observedSeries: replay.observedSeries,
      heartbeatSeriesCodes: replay.heartbeatSeriesCodes,
      heartbeatCount: replay.heartbeatCount,
      firstHeartbeatFeedTimestamp: replay.firstHeartbeatFeedTimestamp,
      lastHeartbeatFeedTimestamp: replay.lastHeartbeatFeedTimestamp,
      heartbeatSpanSeconds: replay.heartbeatSpanSeconds,
      heartbeatGapMedianSeconds: replay.heartbeatGapMedianSeconds,
      heartbeatGapMaxSeconds: replay.heartbeatGapMaxSeconds,
      heartbeatEpochSanitization: replay.heartbeatEpochSanitization,
      significantHeartbeatGaps: replay.significantHeartbeatGaps,
      exactConsecutiveOneSecondHeartbeat: replay.exactConsecutiveOneSecondHeartbeat,
      messageTypeCounts: replay.messageTypeCounts,
      flagMessageCount: replay.flagMessageCount,
      yellowReasonMessageCount: replay.yellowReasonMessageCount,
      driverCount: replay.drivers.length,
      bryce: replay.bryce,
      trackDefinitionCount: replay.trackDefinitions.length,
      namedSectionTiming: {
        recordCount: sections?.recordCount ?? 0,
        carCount: sections?.carCount ?? 0,
        labels: sections?.labels ?? [],
        rawTickScaleInference: tickInference
          ? {
              secondsPerTick: tickInference.secondsPerTick,
              confidence: tickInference.confidence,
              comparisonCount: tickInference.comparisonCount,
              deltaToPrecedingHeartbeatMedianSeconds: tickInference.deltaToPrecedingHeartbeatMedianSeconds,
              deltaToPrecedingHeartbeatP95Seconds: tickInference.deltaToPrecedingHeartbeatP95Seconds,
              withinOneSecondCount: tickInference.withinOneSecondCount,
              withinOneSecondFraction: tickInference.withinOneSecondFraction,
            }
          : null,
      },
    },
    derivedCsv: {
      present: analysis.derivedCsv.present,
      bytes: analysis.derivedCsv.bytes,
      rowCountExcludingHeader: analysis.derivedCsv.rowCountExcludingHeader,
    },
    quality: analysis.quality,
  };
}

const options = parseArgs(process.argv);
const catalog = JSON.parse(await readFile(join(options.dataRoot, 'catalog/session-catalog.json'), 'utf8'));
let sessions = catalog.sessions.filter((session) => session.source === 'RaceTools');
if (options.scope === 'nxt') sessions = sessions.filter((session) => session.series === 'INDY_NXT');
if (options.scope === 'bryce') {
  sessions = sessions.filter((session) => session.series === 'INDY_NXT' && [2024, 2025].includes(session.year));
}

const results = new Array(sessions.length);
let completed = 0;
await runWithConcurrency(sessions, options.concurrency, async (session, index) => {
  const row = {
    sessionId: session.id,
    year: session.year,
    series: session.series,
    sessionType: session.sessionType,
    event: session.event,
    track: session.track,
    sessionLabel: session.sessionLabel,
    sourceFormat: session.sourceFormat,
    accessMethod: session.accessMethod,
    analysis: null,
    error: null,
  };
  try {
    const bytes = await readSessionZipBytes(options.dataRoot, session);
    row.analysis = compactRaceToolsAnalysis(
      analyzeRaceToolsReplay(bytes, session.series === 'unknown' ? null : session.series, session.year),
    );
  } catch (error) {
    row.error = error.message;
  }
  results[index] = row;
  completed += 1;
  if (completed % 25 === 0 || completed === sessions.length) {
    process.stdout.write(`Analyzed ${completed}/${sessions.length} RaceTools sessions.\n`);
  }
});

// Curated benign annotations for genuine heartbeat gaps that the Wave 0 audit
// verified are not missing race data (e.g. a pre-green recorder dropout). Keyed
// by robust identity match rather than a volatile session id.
function benignGapAnnotation(row) {
  const haystack = `${row.event ?? ''} ${row.track ?? ''} ${row.sessionLabel ?? ''}`.toLowerCase();
  if (row.year === 2025 && row.sessionType === 'race' && /mid.?ohio/.test(haystack)) {
    return {
      benign: true,
      classification: 'pre_green_recorder_gap',
      reason:
        'Wave 0 audit: the single ~436 s heartbeat gap falls before lap 1 completes (pre-green). No race data is missing.',
    };
  }
  return null;
}

const statusCounts = {};
const issues = [];
let qualityIssueCount = 0;
let heartbeatGapIssueCount = 0;
for (const row of results) {
  const status = row.error ? 'analysis_error' : row.analysis.quality.status;
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  if (row.error || status !== 'usable') {
    qualityIssueCount += 1;
    issues.push({
      category: 'quality',
      sessionId: row.sessionId,
      year: row.year,
      sessionType: row.sessionType,
      event: row.event,
      sessionLabel: row.sessionLabel,
      status,
      error: row.error,
      reasons: row.analysis?.quality.reasons ?? [],
    });
  }
  const gapWarning = row.analysis?.quality?.heartbeatGapWarning ?? null;
  if (gapWarning) {
    heartbeatGapIssueCount += 1;
    issues.push({
      category: 'heartbeat_gap',
      sessionId: row.sessionId,
      year: row.year,
      sessionType: row.sessionType,
      event: row.event,
      sessionLabel: row.sessionLabel,
      status,
      maxGapSeconds: gapWarning.maxGapSeconds,
      significantGapCount: gapWarning.significantGapCount,
      thresholdSeconds: gapWarning.thresholdSeconds,
      gaps: gapWarning.gaps,
      annotation: benignGapAnnotation(row),
    });
  }
}
const errors = issues;
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  detailLevel: 'compact_source_quality_index',
  semanticNotes: {
    heartbeatTimestamp:
      'Feed-supplied integer seconds rendered in ISO form for comparison. The encoded timezone has not been validated.',
    sectionTickInference:
      'Raw section hex values are retained in source ZIPs. Per-session indexes keep only validation statistics; regenerate detail from raw when needed.',
  },
  scope: options.scope,
  sessionCount: results.length,
  statusCounts,
  issueCount: issues.length,
  qualityIssueCount,
  heartbeatGapIssueCount,
  issues,
  sessions: results,
};
const suffix = options.scope === 'all' ? 'all' : options.scope;
await atomicWriteJson(join(options.dataRoot, `catalog/racetools-session-quality-${suffix}.json`), report);
process.stdout.write(`${JSON.stringify({sessions: results.length, statusCounts, issues: errors.length}, null, 2)}\n`);
