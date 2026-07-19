#!/usr/bin/env node

import {createWriteStream} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {basename, dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import {raceToolsSectionEvents, readSessionZipBytes} from './lib/archive-reader.mjs';
import {reconstructTiming71Frames} from './lib/timing71-reader.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function usage() {
  return `Usage:
  node session-tool.mjs list [--year YYYY] [--series INDY_NXT|INDYCAR] [--source RaceTools|Timing71] [--type TYPE] [--json]
  node session-tool.mjs info SESSION_ID
  node session-tool.mjs extract SESSION_ID --output FILE.zip
  node session-tool.mjs export SESSION_ID --output FILE.ndjson [--interval SECONDS] [--segment auto|bryce|all]
  node session-tool.mjs sections SESSION_ID --output FILE.ndjson [--car NUMBER]

Export reconstructs only observed Timing71 replay updates. It does not interpolate
missing time, invent GPS, or turn timing-point data into physical coordinates.`;
}

function parseArgs(argv) {
  const command = argv[2] ?? 'list';
  const options = {dataRoot: DEFAULT_DATA_ROOT, interval: 1, json: false, segment: 'auto'};
  const positionals = [];
  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (value === '--year') options.year = Number(argv[++index]);
    else if (value === '--series') options.series = argv[++index];
    else if (value === '--source') options.source = argv[++index];
    else if (value === '--type') options.type = argv[++index];
    else if (value === '--output') options.output = resolve(argv[++index]);
    else if (value === '--interval') options.interval = Number(argv[++index]);
    else if (value === '--segment') options.segment = argv[++index];
    else if (value === '--car') options.car = argv[++index];
    else if (value === '--json') options.json = true;
    else if (value === '--help' || value === '-h') options.help = true;
    else positionals.push(value);
  }
  if (!Number.isFinite(options.interval) || options.interval <= 0) throw new Error('--interval must be greater than zero');
  if (!['auto', 'bryce', 'all'].includes(options.segment)) throw new Error('--segment must be auto, bryce, or all');
  return {command, options, positionals};
}

function displayRow(session) {
  return {
    id: session.id,
    year: session.year,
    date: session.date,
    series: session.series,
    source: session.source,
    format: session.sourceFormat,
    type: session.sessionType,
    session: session.sessionLabel,
    quality: session.quality.status,
  };
}

function mapCars(cars, columns) {
  return (cars ?? []).map((values) => Object.fromEntries(columns.map((column, index) => [column, values[index] ?? null])));
}

async function writeLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain');
}

const {command, options, positionals} = parseArgs(process.argv);
if (options.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}
const catalog = JSON.parse(await readFile(join(options.dataRoot, 'catalog/session-catalog.json'), 'utf8'));

if (command === 'list') {
  let sessions = catalog.sessions;
  if (options.year) sessions = sessions.filter((session) => session.year === options.year);
  if (options.series) sessions = sessions.filter((session) => session.series === options.series);
  if (options.source) sessions = sessions.filter((session) => session.source.toLowerCase() === options.source.toLowerCase());
  if (options.type) sessions = sessions.filter((session) => session.sessionType === options.type);
  const rows = sessions.map(displayRow);
  if (options.json) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  else {
    process.stdout.write('id\tyear\tdate\tseries\tsource\ttype\tquality\tsession\n');
    for (const row of rows) {
      process.stdout.write(
        [row.id, row.year, row.date, row.series, row.source, row.type, row.quality, row.session].join('\t') + '\n',
      );
    }
  }
} else {
  const id = positionals[0];
  const session = catalog.sessions.find((row) => row.id === id);
  if (!session) throw new Error(`unknown session id: ${id}`);
  if (command === 'info') {
    process.stdout.write(`${JSON.stringify(session, null, 2)}\n`);
  } else if (command === 'extract') {
    if (!options.output) throw new Error('extract requires --output FILE.zip');
    const bytes = await readSessionZipBytes(options.dataRoot, session);
    await mkdir(dirname(options.output), {recursive: true});
    await writeFile(options.output, bytes);
    process.stdout.write(`${options.output}\t${bytes.length} bytes\n`);
  } else if (command === 'export') {
    if (session.source !== 'Timing71') throw new Error('export currently supports Timing71 replay sessions only');
    if (!options.output) throw new Error('export requires --output FILE.ndjson');
    const bytes = await readSessionZipBytes(options.dataRoot, session);
    await mkdir(dirname(options.output), {recursive: true});
    const output = createWriteStream(options.output, {encoding: 'utf8'});
    let lastOutput = -Infinity;
    let rows = 0;
    for (const frame of reconstructTiming71Frames(bytes)) {
      if (frame.observedAtEpoch - lastOutput < options.interval) continue;
      const columns = (frame.manifest.colSpec ?? []).map((column) => column[0]);
      const cars = mapCars(frame.state.cars, columns);
      const targetBryce = options.segment === 'bryce' || (options.segment === 'auto' && session.series === 'INDY_NXT');
      if (targetBryce && !cars.some((car) => /\bbryce\s+aron\b/i.test(String(car.Driver ?? '')))) continue;
      await writeLine(output, {
        source: 'Timing71',
        sourceReplayId: session.replayId,
        sourceSessionId: session.id,
        sourceObservedAt: frame.observedAt,
        sourceObservedAtEpoch: frame.observedAtEpoch,
        updateKind: frame.incremental ? 'reconstructed_incremental' : 'observed_full_frame',
        grain: 'one reconstructed display-state frame at an observed archive update; no interpolation',
        session: frame.state.session,
        cars,
        messages: frame.state.messages,
        highlight: frame.state.highlight,
      });
      lastOutput = frame.observedAtEpoch;
      rows += 1;
    }
    output.end();
    await once(output, 'finish');
    process.stdout.write(`${options.output}\t${rows} observed-state rows\n`);
  } else if (command === 'sections') {
    if (session.source !== 'RaceTools') throw new Error('sections supports RaceTools replay sessions only');
    if (!options.output) throw new Error('sections requires --output FILE.ndjson');
    const bytes = await readSessionZipBytes(options.dataRoot, session);
    await mkdir(dirname(options.output), {recursive: true});
    const output = createWriteStream(options.output, {encoding: 'utf8'});
    let rows = 0;
    for (const event of raceToolsSectionEvents(bytes)) {
      if (options.car && event.carNumber !== options.car) continue;
      await writeLine(output, {
        source: 'RaceTools',
        sourceSessionId: session.id,
        sourceQuality: session.quality,
        grain: 'one source-observed named section/timing-loop record',
        ...event,
      });
      rows += 1;
    }
    output.end();
    await once(output, 'finish');
    process.stdout.write(`${options.output}\t${rows} named-section timing rows\n`);
  } else {
    process.stderr.write(`${usage()}\n`);
    process.exit(2);
  }
}
