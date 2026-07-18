#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {access, mkdir, readFile, stat, writeFile} from 'node:fs/promises';
import {basename, dirname, join, relative, resolve, sep} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function parseArgs(argv) {
  const command = argv[2] ?? 'build';
  const options = {dataRoot: DEFAULT_DATA_ROOT, concurrency: 2, deep: false};
  for (let index = 3; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (argv[index] === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (argv[index] === '--deep') options.deep = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) {
    throw new Error('--concurrency must be an integer from 1 to 8');
  }
  return {command, options};
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

async function runCapture(command, args, {maxBytes = 32 * 1024 * 1024, encoding = 'utf8'} = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'pipe', 'pipe']});
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) child.kill('SIGTERM');
      else stdout.push(chunk);
    });
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const errorText = Buffer.concat(stderr).toString('utf8').trim();
      if (bytes > maxBytes) reject(new Error(`${command} output exceeded ${maxBytes} bytes`));
      else if (code !== 0) reject(new Error(`${command} exited ${code}: ${errorText}`));
      else {
        const output = Buffer.concat(stdout);
        resolveRun(encoding === null ? output : output.toString(encoding));
      }
    });
  });
}

async function runStatus(command, args) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, {stdio: ['ignore', 'ignore', 'pipe']});
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => resolveRun({ok: false, error: error.message}));
    child.on('close', (code) =>
      resolveRun({ok: code === 0, error: code === 0 ? null : Buffer.concat(stderr).toString('utf8').trim()}),
    );
  });
}

async function sha256File(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const input = createReadStream(path);
    input.on('data', (chunk) => hash.update(chunk));
    input.on('error', reject);
    input.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function fileId(...parts) {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 24);
}

function classifySeries(name, code = '', year = null) {
  const value = `${name} ${code}`;
  if (/INDY\s*NXT|INDY\s*LIGHTS|FREEDOM\s+100|\.L(?:\b|\))/i.test(value)) return 'INDY_NXT';
  if (year !== null && year <= 2015 && /\.P(?:\b|\)|\(partial\))/i.test(value)) return 'INDY_NXT';
  if (/INDYCAR|\.I(?:\b|\))/i.test(value)) return 'INDYCAR';
  return 'unknown';
}

function classifySession(label, code = '') {
  const value = `${label} ${code}`.trim().toLowerCase();
  if (/race|heat|all star/.test(value)) return 'race';
  if (/qual|fast 6|top 12|last chance/.test(value)) return 'qualifying';
  if (/practice|warm|refresher|rookie orientation|install|high.?line|low.?line/.test(value)) return 'practice';
  if (/test/.test(value)) return 'test';
  const stem = value.replace(/\.zip$/i, '');
  if (/(?:_|-)(?:ir|pr|r)\d*(?:\.[a-z])?(?:_\d{4}-\d{2}-\d{2})?$/.test(stem)) return 'race';
  if (/(?:_|-)(?:iq|pq|q|qc|qa|qb)\d*(?:\.[a-z])?(?:_\d{4}-\d{2}-\d{2})?$/.test(stem)) {
    return 'qualifying';
  }
  if (/(?:_|-)(?:ip|pp|p|pf)\d*(?:\.[a-z])?(?:\(partial\))?(?:_\d{4}-\d{2}-\d{2})?$/.test(stem)) {
    return 'practice';
  }
  return 'other';
}

function parseRaceToolsName(path) {
  const name = basename(path);
  const match = name.match(/^(.*)\(([^()]*)\)-(.+)_\(([^()]*)\)(?:_(\d{4}-\d{2}-\d{2}))?\.zip$/i);
  if (!match) {
    const date = name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const pathParts = path.split('/').filter(Boolean);
    const parent = pathParts.length > 1 ? pathParts.at(-2).replace(/^\d+\s*-\s*/, '').trim() : null;
    return {
      event: name.replace(/\.zip$/i, '').replace(/_(?:[IP]?[PQR]|Q[ABC]?|PF|QC)\d*(?:\.[A-Z])?(?:\(partial\))?(?:_\d{4}-\d{2}-\d{2})?$/i, ''),
      track: parent,
      sessionLabel: name.replace(/\.zip$/i, ''),
      sessionType: classifySession(name),
      code: null,
      date,
      parseStatus: 'fallback',
    };
  }
  return {
    event: match[1].trim(),
    track: match[2].trim() || null,
    sessionLabel: match[3].trim(),
    sessionType: classifySession(match[3], match[4]),
    code: match[4].trim(),
    date: match[5] ?? null,
    parseStatus: 'parsed',
  };
}

function knownQuality(sourceFile, entryName = null) {
  const identity = `${sourceFile.url}\n${entryName ?? ''}`;
  if (/Race%201_\(R1\.L\)_2025-05-10\.zip/i.test(identity)) {
    return {
      status: 'quarantined_mixed_session',
      reason: 'Known 45,923-heartbeat capture with 22 mixed NXT/INDYCAR session markers; use the 2025-05-09 Race 1 file.',
    };
  }
  if (/Barber.*Race%202_\(R2\.L\)_2026-03-29\.zip/i.test(identity) && sourceFile.bytes <= 64) {
    return {status: 'quarantined_invalid_zip', reason: 'Published source object is only 22 bytes.'};
  }
  const replayId = sourceFile.metadata?.replayId;
  if (replayId === 'd4d03566-91a1-4772-a12b-f61cd00c35ed') {
    return {status: 'quarantined_false_positive', reason: 'NXT-labelled replay lacks an NXT race checkered state.'};
  }
  if (replayId === 'dd951383-eb15-4242-a985-96c426ea8ab8') {
    return {status: 'quarantined_cross_session', reason: 'Wrong sequential session; use replay 7955b89c-7029-4a9f-bea0-769925a47c36.'};
  }
  if (
    ['1522fa4d-cb20-46fa-8e97-3769480327b8', '323a79f6-8cba-4cd6-bbc0-e1ed1650ae64', '089a8c49-ab69-4f6e-a4e4-c01793d07075'].includes(
      replayId,
    )
  ) {
    return {status: 'usable_after_segmentation', reason: 'Complete NXT race is embedded before a later INDYCAR manifest.'};
  }
  return {status: 'inventory_validated', reason: null};
}

function timing71Series(sourceFile) {
  const hiddenNxtReplayIds = new Set([
    '1522fa4d-cb20-46fa-8e97-3769480327b8',
    '323a79f6-8cba-4cd6-bbc0-e1ed1650ae64',
    '089a8c49-ab69-4f6e-a4e4-c01793d07075',
  ]);
  if (hiddenNxtReplayIds.has(sourceFile.metadata?.replayId)) return 'INDY_NXT';
  return sourceFile.series?.[0] ?? 'unknown';
}

async function listZip(path) {
  const output = await runCapture('unzip', ['-Z1', path]);
  return output.split(/\r?\n/).filter(Boolean);
}

async function buildCatalog(options) {
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sessions = [];
  const maps = [];
  const annualEntries = [];

  for (let index = 0; index < manifest.files.length; index += 1) {
    const sourceFile = manifest.files[index];
    const sourcePath = join(options.dataRoot, sourceFile.viewPath);
    if (sourceFile.kind === 'annual_archive' || sourceFile.kind === 'annual_telemetry_archive') {
      const entries = await listZip(sourcePath);
      for (const entryName of entries.filter((name) => name.toLowerCase().endsWith('.zip'))) {
        const parsed = parseRaceToolsName(entryName);
        const series = classifySeries(entryName, parsed.code ?? '', sourceFile.year);
        const quality = knownQuality(sourceFile, entryName);
        const row = {
          id: fileId(sourceFile.id, entryName),
          source: 'RaceTools',
          sourceFileId: sourceFile.id,
          sourceFormat: sourceFile.kind === 'annual_telemetry_archive' ? 'racetools_telemetry_replay' : 'racetools_raw_replay',
          containerViewPath: sourceFile.viewPath,
          entryName,
          directViewPath: null,
          accessMethod: 'zip_entry',
          year: sourceFile.year,
          series,
          ...parsed,
          quality,
        };
        sessions.push(row);
        annualEntries.push({sourceFileId: sourceFile.id, entryName, series});
      }
    } else if (sourceFile.kind === 'session_replay') {
      const parsed = parseRaceToolsName(sourceFile.viewPath);
      const series = classifySeries(sourceFile.viewPath, parsed.code ?? '', sourceFile.year);
      sessions.push({
        id: fileId(sourceFile.id),
        source: 'RaceTools',
        sourceFileId: sourceFile.id,
        sourceFormat: 'racetools_raw_replay',
        containerViewPath: null,
        entryName: null,
        directViewPath: sourceFile.viewPath,
        accessMethod: 'direct_zip',
        year: sourceFile.year,
        series,
        ...parsed,
        quality: knownQuality(sourceFile),
      });
    } else if (sourceFile.kind === 'normalized_replay') {
      const description = sourceFile.metadata?.description ?? basename(sourceFile.viewPath);
      sessions.push({
        id: fileId(sourceFile.id),
        source: 'Timing71',
        sourceFileId: sourceFile.id,
        sourceFormat: 'timing71_full_incremental_state',
        containerViewPath: null,
        entryName: null,
        directViewPath: sourceFile.viewPath,
        accessMethod: 'direct_zip',
        year: sourceFile.year,
        series: timing71Series(sourceFile),
        event: description,
        track: null,
        sessionLabel: description,
        sessionType: classifySession(description),
        code: null,
        date: new Date((sourceFile.metadata?.startTime ?? 0) * 1000).toISOString().slice(0, 10),
        startTime: sourceFile.metadata?.startTime ?? null,
        duration: sourceFile.metadata?.duration ?? null,
        replayId: sourceFile.metadata?.replayId ?? null,
        parseStatus: 'api_metadata',
        quality: knownQuality(sourceFile),
      });
    } else if (sourceFile.kind === 'track_map_archive') {
      let entries = [];
      try {
        entries = await listZip(sourcePath);
      } catch {
        entries = [];
      }
      maps.push({
        sourceFileId: sourceFile.id,
        viewPath: sourceFile.viewPath,
        bytes: sourceFile.bytes,
        sha256: sourceFile.sha256,
        entries,
      });
    }
    if ((index + 1) % 100 === 0) process.stdout.write(`Cataloged ${index + 1}/${manifest.files.length} source files.\n`);
  }

  const counts = {};
  for (const session of sessions) {
    const key = `${session.year}:${session.source}:${session.sourceFormat}:${session.series}:${session.sessionType}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const quarantine = sessions.filter((session) => session.quality.status.startsWith('quarantined'));
  const catalog = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    grain: 'one row per source replay/session candidate; alternate source formats and telemetry variants remain separate',
    sourceFileCount: manifest.files.length,
    sessionCount: sessions.length,
    mapArchiveCount: maps.length,
    counts,
    quarantinedCount: quarantine.length,
    sessions: sessions.sort((left, right) =>
      [left.year ?? 0, left.date ?? '', left.source, left.sessionLabel].join('|').localeCompare(
        [right.year ?? 0, right.date ?? '', right.source, right.sessionLabel].join('|'),
      ),
    ),
  };
  await atomicWriteJson(join(options.dataRoot, 'catalog/session-catalog.json'), catalog);
  await atomicWriteJson(join(options.dataRoot, 'catalog/track-map-catalog.json'), {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    maps,
  });
  await atomicWriteJson(join(options.dataRoot, 'catalog/catalog-summary.json'), {
    schemaVersion: 1,
    generatedAt: catalog.generatedAt,
    sourceFileCount: manifest.files.length,
    sessionCount: sessions.length,
    mapArchiveCount: maps.length,
    counts,
    quarantined: quarantine.map((session) => ({
      id: session.id,
      year: session.year,
      source: session.source,
      sessionLabel: session.sessionLabel,
      replayId: session.replayId ?? null,
      status: session.quality.status,
      reason: session.quality.reason,
    })),
  });
  process.stdout.write(
    `${JSON.stringify({sourceFiles: manifest.files.length, sessions: sessions.length, maps: maps.length, quarantined: quarantine.length}, null, 2)}\n`,
  );
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

async function validate(options) {
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const results = new Array(manifest.files.length);
  let completed = 0;
  await runWithConcurrency(manifest.files, options.concurrency, async (sourceFile, index) => {
    const path = join(options.dataRoot, sourceFile.objectPath);
    const row = {
      id: sourceFile.id,
      sourceId: sourceFile.sourceId,
      year: sourceFile.year,
      viewPath: sourceFile.viewPath,
      exists: await exists(path),
      sizeMatches: false,
      hashMatches: null,
      structureValid: null,
      error: null,
    };
    try {
      if (!row.exists) throw new Error('object missing');
      const details = await stat(path);
      row.sizeMatches = details.size === sourceFile.bytes;
      if (options.deep) row.hashMatches = (await sha256File(path)) === sourceFile.sha256;
      if (path.toLowerCase().endsWith('.zip')) {
        const zipResult = await runStatus('unzip', ['-tq', path]);
        row.structureValid = zipResult.ok;
        if (!zipResult.ok) row.error = zipResult.error;
      } else if (path.toLowerCase().endsWith('.json')) {
        JSON.parse(await readFile(path, 'utf8'));
        row.structureValid = true;
      }
    } catch (error) {
      row.error = error.message;
      row.structureValid ??= false;
    }
    results[index] = row;
    completed += 1;
    if (completed % 25 === 0 || completed === manifest.files.length) {
      process.stdout.write(`Validated ${completed}/${manifest.files.length}.\n`);
    }
  });

  const failures = results.filter(
    (row) => !row.exists || !row.sizeMatches || row.hashMatches === false || row.structureValid === false,
  );
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    deepHashValidation: options.deep,
    fileCount: results.length,
    validCount: results.length - failures.length,
    failureCount: failures.length,
    failures,
    results,
  };
  await atomicWriteJson(join(options.dataRoot, 'catalog/file-validation.json'), report);
  process.stdout.write(`${JSON.stringify({files: results.length, valid: report.validCount, failures: failures.length}, null, 2)}\n`);
}

const {command, options} = parseArgs(process.argv);
if (command === 'build') await buildCatalog(options);
else if (command === 'validate') await validate(options);
else {
  process.stderr.write('Usage: node build-catalog.mjs [build|validate] [--deep] [--concurrency N]\n');
  process.exit(2);
}
