#!/usr/bin/env node

import {createHash} from 'node:crypto';
import {
  access,
  copyFile,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {homedir} from 'node:os';
import {basename, dirname, extname, join, relative, resolve, sep} from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');
const DOWNLOADS_ROOT = join(homedir(), 'Downloads');
const EXISTING_TIMING71_ROOT =
  process.env.BRYCECAST_TIMING71_CACHE ??
  join(DOWNLOADS_ROOT, 'BryceCast-Timing71-INDYNXT-2026-through-2026-07-18');

const USER_AGENT = 'BryceCast-historical-data-lake/1.0';
const RACE_TOOLS_ARCHIVE = 'https://racetools.com/logfiles/IndyCar/';
const RACE_TOOLS_2025 = `${RACE_TOOLS_ARCHIVE}2025/`;
const RACE_TOOLS_MAPS = 'https://racetools.com/maps/INDYCAR/';
const RACE_TOOLS_ROOT = 'https://racetools.com/logfiles/';
const TIMING71_API = 'https://archive.timing71.org/replays';

function usage() {
  return `Usage:
  node archive-sync.mjs plan [--data-root PATH]
  node archive-sync.mjs acquire [--data-root PATH] [--concurrency N]
  node archive-sync.mjs status [--data-root PATH]
  node archive-sync.mjs normalize [--data-root PATH]

The raw data root is Git-ignored. Source manifests and later catalog outputs are
versioned under data/historical-data-lake/. Acquisition is resumable and
content-addressed by SHA-256.`;
}

function parseArgs(argv) {
  const command = argv[2] ?? 'status';
  const options = {dataRoot: DEFAULT_DATA_ROOT, concurrency: 2};
  for (let index = 3; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--data-root') options.dataRoot = resolve(argv[++index]);
    else if (value === '--concurrency') options.concurrency = Number(argv[++index]);
    else if (value === '--help' || value === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) {
    throw new Error('--concurrency must be an integer from 1 to 8');
  }
  return {command, options};
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
  await writeFile(temporary, stableJson(value));
  await rename(temporary, path);
}

async function fetchText(url) {
  const response = await fetch(url, {headers: {'user-agent': USER_AGENT}});
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

function linksWithSizes(html, baseUrl) {
  const rows = [];
  const expression = /(\d+)\s*<A\s+HREF="([^"]+\.zip)"/gi;
  for (const match of html.matchAll(expression)) {
    rows.push({url: new URL(match[2], baseUrl).href, bytes: Number(match[1])});
  }
  return rows;
}

function directoryLinks(html, baseUrl, requiredPrefix) {
  const rows = [];
  for (const match of html.matchAll(/<A\s+HREF="([^"]+\/)"/gi)) {
    const url = new URL(match[1], baseUrl).href;
    if (url.startsWith(requiredPrefix) && url !== requiredPrefix) rows.push(url);
  }
  return [...new Set(rows)];
}

function decodedBasename(url) {
  return decodeURIComponent(basename(new URL(url).pathname));
}

function safeSegments(url, stripPrefix) {
  const path = decodeURIComponent(new URL(url).pathname);
  const stripped = path.startsWith(stripPrefix) ? path.slice(stripPrefix.length) : basename(path);
  return stripped
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map((part) => part.replaceAll(':', '_'));
}

async function discoverRaceToolsAnnual() {
  const html = await fetchText(RACE_TOOLS_ARCHIVE);
  return linksWithSizes(html, RACE_TOOLS_ARCHIVE)
    .filter(({url}) => /IndyCar_20(?:0[8-9]|1\d|2[0-4])(?:_wTelemetry)?\.zip$/i.test(url))
    .map(({url, bytes}) => {
      const name = decodedBasename(url);
      const match = name.match(/IndyCar_(\d{4})(_wTelemetry)?\.zip/i);
      return {
        sourceId: match[2] ? 'racetools-annual-telemetry' : 'racetools-annual',
        sourceClass: 'third-party raw timing-feed replay archive',
        kind: match[2] ? 'annual_telemetry_archive' : 'annual_archive',
        year: Number(match[1]),
        series: ['INDYCAR', 'INDY_NXT'],
        url,
        expectedBytes: bytes,
        viewRelativePath: join('racetools', 'annual', name),
      };
    });
}

async function discoverRaceTools2025() {
  const rootHtml = await fetchText(RACE_TOOLS_2025);
  const directories = directoryLinks(rootHtml, RACE_TOOLS_2025, RACE_TOOLS_2025);
  const results = [];
  for (let offset = 0; offset < directories.length; offset += 6) {
    const pages = await Promise.all(
      directories.slice(offset, offset + 6).map(async (url) => ({url, html: await fetchText(url)})),
    );
    for (const page of pages) {
      for (const file of linksWithSizes(page.html, page.url)) {
        const segments = safeSegments(file.url, '/logfiles/IndyCar/2025/');
        results.push({
          sourceId: 'racetools-session-2025',
          sourceClass: 'third-party raw timing-feed replay',
          kind: 'session_replay',
          year: 2025,
          series: /(?:INDY\s*NXT|INDy\s*NXT|\.L\))/i.test(decodeURIComponent(file.url))
            ? ['INDY_NXT']
            : ['INDYCAR'],
          url: file.url,
          expectedBytes: file.bytes,
          viewRelativePath: join('racetools', 'sessions', '2025', ...segments),
        });
      }
    }
  }
  return results;
}

async function discoverRaceToolsMaps() {
  const html = await fetchText(RACE_TOOLS_MAPS);
  return linksWithSizes(html, RACE_TOOLS_MAPS).map(({url, bytes}) => ({
    sourceId: 'racetools-indycar-maps',
    sourceClass: 'third-party timing-map definition',
    kind: 'track_map_archive',
    year: null,
    series: ['INDYCAR', 'INDY_NXT'],
    url,
    expectedBytes: bytes,
    viewRelativePath: join('racetools', 'maps', decodedBasename(url)),
  }));
}

async function discoverRaceTools2026Root() {
  const html = await fetchText(RACE_TOOLS_ROOT);
  return linksWithSizes(html, RACE_TOOLS_ROOT)
    .filter(({url}) => /_2026-\d{2}-\d{2}\.zip$/i.test(url))
    .filter(({url}) => /\((?:[^)]*\.)?[IL]\)|INDY\s*NXT|INDYCAR/i.test(decodeURIComponent(url)))
    .map(({url, bytes}) => ({
      sourceId: 'racetools-session-2026-root',
      sourceClass: 'third-party raw timing-feed replay',
      kind: 'session_replay',
      year: 2026,
      series: /INDY\s*NXT|\.L\)/i.test(decodeURIComponent(url)) ? ['INDY_NXT'] : ['INDYCAR'],
      url,
      expectedBytes: bytes,
      viewRelativePath: join('racetools', 'sessions', '2026-root', decodedBasename(url)),
    }));
}

async function discoverTiming71() {
  const results = [];
  for (const year of [2024, 2025, 2026]) {
    const from = Math.floor(Date.parse(`${year}-01-01T00:00:00Z`) / 1000);
    const to = Math.floor(Date.parse(`${year + 1}-01-01T00:00:00Z`) / 1000);
    const filter = {
      where: {and: [{series: 'IndyCar'}, {startTime: {gte: from}}, {startTime: {lt: to}}]},
      order: ['startTime ASC'],
      limit: 5000,
    };
    const url = new URL(TIMING71_API);
    url.searchParams.set('filter', JSON.stringify(filter));
    const response = await fetch(url, {headers: {'user-agent': USER_AGENT}});
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    const replays = await response.json();
    for (const replay of replays) {
      const replayName = decodedBasename(encodeURI(replay.filename));
      results.push({
        sourceId: 'timing71-replay',
        sourceClass: 'third-party normalized replay of live timing',
        kind: 'normalized_replay',
        year,
        series: /INDY\s*NXT/i.test(replay.description) ? ['INDY_NXT'] : ['INDYCAR'],
        url: encodeURI(replay.filename),
        expectedBytes: null,
        viewRelativePath: join('timing71', String(year), 'replays', replayName),
        metadata: {
          replayId: replay.id,
          description: replay.description,
          startTime: replay.startTime,
          duration: replay.duration,
          archiveApiUrl: `${TIMING71_API}/${replay.id}`,
        },
      });
      if (replay.analysisFilename) {
        const analysisName = decodedBasename(encodeURI(replay.analysisFilename));
        results.push({
          sourceId: 'timing71-analysis',
          sourceClass: 'third-party derived replay analysis',
          kind: 'derived_analysis',
          year,
          series: /INDY\s*NXT/i.test(replay.description) ? ['INDY_NXT'] : ['INDYCAR'],
          url: encodeURI(replay.analysisFilename),
          expectedBytes: null,
          viewRelativePath: join('timing71', String(year), 'analysis', analysisName),
          metadata: {
            replayId: replay.id,
            description: replay.description,
            startTime: replay.startTime,
            duration: replay.duration,
            archiveApiUrl: `${TIMING71_API}/${replay.id}`,
          },
        });
      }
    }
  }
  return results;
}

async function discoverAll() {
  const groups = await Promise.all([
    discoverRaceToolsAnnual(),
    discoverRaceTools2025(),
    discoverRaceToolsMaps(),
    discoverRaceTools2026Root(),
    discoverTiming71(),
  ]);
  const rows = groups.flat();
  const byUrl = new Map();
  for (const row of rows) byUrl.set(row.url, row);
  return [...byUrl.values()].sort((left, right) => left.viewRelativePath.localeCompare(right.viewRelativePath));
}

async function walkFiles(root, depth = 3) {
  if (!(await exists(root))) return [];
  const rows = [];
  async function walk(path, remaining) {
    const entries = await readdir(path, {withFileTypes: true});
    for (const entry of entries) {
      const child = join(path, entry.name);
      if (entry.isFile()) rows.push(child);
      else if (entry.isDirectory() && remaining > 0) await walk(child, remaining - 1);
    }
  }
  await walk(root, depth);
  return rows;
}

function canonicalDownloadedName(name) {
  return name.replace(/ \(\d+\)(?=\.[^.]+$)/, '');
}

async function localReuseIndex() {
  const roots = [DOWNLOADS_ROOT, EXISTING_TIMING71_ROOT];
  const files = [];
  for (const root of roots) files.push(...(await walkFiles(root, root === DOWNLOADS_ROOT ? 0 : 3)));
  const index = new Map();
  for (const path of files) {
    const key = canonicalDownloadedName(basename(path));
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(path);
  }
  return index;
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

async function run(command, args) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

function urlKey(url) {
  return createHash('sha256').update(url).digest('hex');
}

async function chooseReuseFile(source, index) {
  const candidates = index.get(canonicalDownloadedName(decodedBasename(source.url))) ?? [];
  for (const candidate of candidates) {
    const details = await stat(candidate);
    if (source.expectedBytes === null || details.size === source.expectedBytes) return candidate;
  }
  return null;
}

async function ensureHardlink(sourcePath, destinationPath) {
  if (await exists(destinationPath)) return;
  await mkdir(dirname(destinationPath), {recursive: true});
  try {
    await link(sourcePath, destinationPath);
  } catch (error) {
    if (error.code === 'EXDEV') await copyFile(sourcePath, destinationPath);
    else if (error.code !== 'EEXIST') throw error;
  }
}

async function acquireOne({source, dataRoot, reuseIndex}) {
  const temporaryRoot = join(dataRoot, 'tmp');
  const rawRoot = join(dataRoot, 'raw');
  await mkdir(temporaryRoot, {recursive: true});
  const extension = extname(new URL(source.url).pathname) || '.bin';
  const temporaryPath = join(temporaryRoot, `${urlKey(source.url)}${extension}`);
  const reusePath = await chooseReuseFile(source, reuseIndex);
  let acquiredPath = reusePath;
  let acquisitionMethod = 'reused_existing_local_download';

  if (!acquiredPath) {
    acquisitionMethod = 'downloaded_with_resumable_curl';
    await run('curl', [
      '--fail',
      '--location',
      '--retry',
      '5',
      '--retry-delay',
      '2',
      '--continue-at',
      '-',
      '--silent',
      '--show-error',
      '--user-agent',
      USER_AGENT,
      '--output',
      temporaryPath,
      source.url,
    ]);
    acquiredPath = temporaryPath;
  }

  const details = await stat(acquiredPath);
  if (source.expectedBytes !== null && details.size !== source.expectedBytes) {
    throw new Error(`size mismatch for ${source.url}: ${details.size} != ${source.expectedBytes}`);
  }
  const digest = await sha256File(acquiredPath);
  const objectRelativePath = join('raw', 'objects', 'sha256', digest.slice(0, 2), `${digest}${extension}`);
  const objectPath = join(dataRoot, objectRelativePath);
  await mkdir(dirname(objectPath), {recursive: true});
  if (!(await exists(objectPath))) {
    if (acquiredPath === temporaryPath) await rename(acquiredPath, objectPath);
    else await ensureHardlink(acquiredPath, objectPath);
  } else if (acquiredPath === temporaryPath) {
    await rm(temporaryPath, {force: true});
  }

  const viewRelativePath = join('raw', 'views', source.viewRelativePath);
  const viewPath = join(dataRoot, viewRelativePath);
  await ensureHardlink(objectPath, viewPath);

  return {
    id: createHash('sha256').update(source.url).digest('hex').slice(0, 24),
    ...source,
    expectedBytes: source.expectedBytes,
    bytes: details.size,
    sha256: digest,
    objectPath: objectRelativePath.split(sep).join('/'),
    viewPath: viewRelativePath.split(sep).join('/'),
    acquisitionMethod,
    reusedFrom: reusePath ? basename(reusePath) : null,
    acquiredAt: new Date().toISOString(),
  };
}

async function loadManifest(path) {
  if (!(await exists(path))) {
    return {schemaVersion: 1, generatedAt: null, files: []};
  }
  return JSON.parse(await readFile(path, 'utf8'));
}

function portableManifestRow(row) {
  return {
    ...row,
    reusedFrom: row.reusedFrom ? basename(row.reusedFrom) : null,
  };
}

async function runWithConcurrency(items, concurrency, worker) {
  let nextIndex = 0;
  async function lane() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({length: concurrency}, () => lane()));
}

function summarizePlan(sources, existingByUrl = new Map()) {
  const summary = {};
  let expectedBytes = 0;
  let unknownBytes = 0;
  let missing = 0;
  for (const source of sources) {
    const key = `${source.sourceId}:${source.year ?? 'all'}`;
    summary[key] ??= {files: 0, expectedBytes: 0, unknownSizeFiles: 0, alreadyAcquired: 0};
    summary[key].files += 1;
    if (source.expectedBytes === null) {
      summary[key].unknownSizeFiles += 1;
      unknownBytes += 1;
    } else {
      summary[key].expectedBytes += source.expectedBytes;
      expectedBytes += source.expectedBytes;
    }
    if (existingByUrl.has(source.url)) summary[key].alreadyAcquired += 1;
    else missing += 1;
  }
  return {files: sources.length, missing, knownExpectedBytes: expectedBytes, unknownSizeFiles: unknownBytes, groups: summary};
}

async function commandPlan(options) {
  const sources = await discoverAll();
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = await loadManifest(manifestPath);
  const existing = new Map(manifest.files.map((file) => [file.url, file]));
  process.stdout.write(stableJson(summarizePlan(sources, existing)));
}

async function commandAcquire(options) {
  const sources = await discoverAll();
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = await loadManifest(manifestPath);
  const byUrl = new Map(manifest.files.map((file) => [file.url, file]));
  const reuseIndex = await localReuseIndex();
  const pending = sources.filter((source) => {
    const row = byUrl.get(source.url);
    return !row || !row.objectPath;
  });
  process.stdout.write(`${stableJson(summarizePlan(sources, byUrl))}\n`);
  process.stdout.write(`Acquiring ${pending.length} source files with concurrency ${options.concurrency}.\n`);

  let completed = 0;
  let manifestWrite = Promise.resolve();
  await runWithConcurrency(pending, options.concurrency, async (source) => {
    const label = `${source.sourceId} ${source.year ?? ''} ${decodedBasename(source.url)}`.trim();
    process.stdout.write(`[${completed + 1}/${pending.length}] ${label}\n`);
    const row = await acquireOne({source, dataRoot: options.dataRoot, reuseIndex});
    byUrl.set(row.url, row);
    completed += 1;
    manifestWrite = manifestWrite.then(() =>
      atomicWriteJson(manifestPath, {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        dataRoot: relative(REPO_ROOT, options.dataRoot).split(sep).join('/'),
        contentAddressing: 'sha256',
        files: [...byUrl.values()]
          .map(portableManifestRow)
          .sort((left, right) => left.viewPath.localeCompare(right.viewPath)),
      }),
    );
    await manifestWrite;
    process.stdout.write(`  ${row.acquisitionMethod}; ${row.bytes} bytes; ${row.sha256.slice(0, 12)}\n`);
  });

  process.stdout.write(`Acquisition complete: ${byUrl.size} manifested files.\n`);
}


async function commandNormalize(options) {
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = await loadManifest(manifestPath);
  await atomicWriteJson(manifestPath, {
    ...manifest,
    files: manifest.files.map(portableManifestRow),
  });
  process.stdout.write(`Normalized ${manifest.files.length} manifest rows for portable repository use.\n`);
}

async function commandStatus(options) {
  const manifestPath = join(options.dataRoot, 'manifests/source-files.json');
  const manifest = await loadManifest(manifestPath);
  const uniqueHashes = new Set(manifest.files.map((file) => file.sha256));
  const bytes = manifest.files.reduce((sum, file) => sum + (file.bytes ?? 0), 0);
  const uniqueBytes = [...new Map(manifest.files.map((file) => [file.sha256, file.bytes])).values()].reduce(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const missing = [];
  for (const file of manifest.files) {
    const path = join(options.dataRoot, file.objectPath);
    if (!(await exists(path))) missing.push(file.id);
  }
  process.stdout.write(
    stableJson({
      manifestPath: relative(REPO_ROOT, manifestPath),
      files: manifest.files.length,
      uniqueObjects: uniqueHashes.size,
      logicalBytes: bytes,
      uniqueBytes,
      exactDuplicateBytesAvoided: bytes - uniqueBytes,
      missingObjects: missing.length,
      generatedAt: manifest.generatedAt,
    }),
  );
}

const {command, options} = parseArgs(process.argv);
if (options.help) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

if (command === 'plan') await commandPlan(options);
else if (command === 'acquire') await commandAcquire(options);
else if (command === 'status') await commandStatus(options);
else if (command === 'normalize') await commandNormalize(options);
else {
  process.stderr.write(`${usage()}\n`);
  process.exit(2);
}
