#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readSessionZipBytes} from './lib/archive-reader.mjs';
import {analyzeTiming71Replay} from './lib/timing71-reader.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function parseArgs(argv) {
  const options = {dataRoot: DEFAULT_DATA_ROOT, concurrency: 2, series: 'all'};
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (argv[index] === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (argv[index] === '--series') options.series = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!['all', 'INDY_NXT', 'INDYCAR'].includes(options.series)) {
    throw new Error('--series must be all, INDY_NXT, or INDYCAR');
  }
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

function compactTiming71Analysis(analysis) {
  const segment = analysis.content.bryceSegment;
  return {
    manifest: {
      uuid: analysis.manifest.uuid,
      name: analysis.manifest.name,
      description: analysis.manifest.description,
      startTime: analysis.manifest.startTime,
      version: analysis.manifest.version,
      columnNames: analysis.manifest.columns.map((column) => column[0]),
      trackDataSpecCount: analysis.manifest.trackDataSpec.length,
    },
    frames: analysis.frames,
    content: {
      driverCount: analysis.content.drivers.length,
      bryce: analysis.content.bryce,
      flagStates: analysis.content.flagStates,
      flagMessageCount: analysis.content.flagMessageCount,
      yellowMessageCount: analysis.content.yellowMessageCount,
      hasTrackDataSpec: analysis.content.hasTrackDataSpec,
      bryceSegment: {
        frameCount: segment.frameCount,
        firstObservedAt: segment.firstObservedAt,
        lastObservedAt: segment.lastObservedAt,
        observedSpanSeconds: segment.observedSpanSeconds,
        minCars: segment.minCars,
        maxCars: segment.maxCars,
        uniqueDriverCount: segment.uniqueDrivers.length,
        maxLap: segment.maxLap,
        flagStates: segment.flagStates,
        hasCheckered: segment.hasCheckered,
      },
    },
    quality: analysis.quality,
  };
}

const options = parseArgs(process.argv);
const catalog = JSON.parse(await readFile(join(options.dataRoot, 'catalog/session-catalog.json'), 'utf8'));
let sessions = catalog.sessions.filter((session) => session.source === 'Timing71');
if (options.series !== 'all') sessions = sessions.filter((session) => session.series === options.series);

const results = new Array(sessions.length);
let completed = 0;
await runWithConcurrency(sessions, options.concurrency, async (session, index) => {
  const row = {
    sessionId: session.id,
    replayId: session.replayId,
    year: session.year,
    series: session.series,
    sessionType: session.sessionType,
    sessionLabel: session.sessionLabel,
    analysis: null,
    error: null,
  };
  try {
    const bytes = await readSessionZipBytes(options.dataRoot, session);
    row.analysis = compactTiming71Analysis(analyzeTiming71Replay(bytes));
    if (session.quality.status.startsWith('quarantined')) {
      row.analysis.quality = {
        status: session.quality.status,
        reasons: [session.quality.reason],
        decoderErrors: row.analysis.quality.decoderErrors,
      };
    } else if (session.series === 'INDY_NXT' && row.analysis.content.bryceSegment.frameCount === 0) {
      row.analysis.quality = {
        status: 'wrong_series_or_stale_capture',
        reasons: ['NXT-labelled candidate has no reconstructed frame containing Bryce Aron'],
        decoderErrors: row.analysis.quality.decoderErrors,
      };
    }
  } catch (error) {
    row.error = error.message;
  }
  results[index] = row;
  completed += 1;
  if (completed % 25 === 0 || completed === sessions.length) {
    process.stdout.write(`Analyzed ${completed}/${sessions.length} Timing71 sessions.\n`);
  }
});

const statusCounts = {};
const issues = [];
for (const row of results) {
  const status = row.error ? 'analysis_error' : row.analysis.quality.status;
  statusCounts[status] = (statusCounts[status] ?? 0) + 1;
  if (status !== 'usable') {
    issues.push({
      sessionId: row.sessionId,
      replayId: row.replayId,
      year: row.year,
      series: row.series,
      sessionLabel: row.sessionLabel,
      status,
      error: row.error,
      reasons: row.analysis?.quality.reasons ?? [],
    });
  }
}
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  detailLevel: 'compact_source_quality_index',
  semanticNote:
    'Full manifests, rosters, and frame samples remain in the content-addressed replay ZIPs and are decoded on demand.',
  series: options.series,
  sessionCount: results.length,
  statusCounts,
  issueCount: issues.length,
  issues,
  sessions: results,
};
const suffix = options.series === 'all' ? 'all' : options.series.toLowerCase();
await atomicWriteJson(join(options.dataRoot, `catalog/timing71-session-quality-${suffix}.json`), report);
process.stdout.write(`${JSON.stringify({sessions: results.length, statusCounts, issues: issues.length}, null, 2)}\n`);
