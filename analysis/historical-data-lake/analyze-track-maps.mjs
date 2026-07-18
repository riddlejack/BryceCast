#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {centralEntries, localEntryData} from './lib/archive-reader.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '../..');
const DEFAULT_DATA_ROOT = join(REPO_ROOT, 'data/historical-data-lake');

function parseArgs(argv) {
  const options = {dataRoot: DEFAULT_DATA_ROOT};
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--data-root') options.dataRoot = resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
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

function parseIni(text) {
  const result = {};
  let section = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[([^\]]+)]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      result[section] ??= {};
      continue;
    }
    const separator = line.indexOf('=');
    if (separator < 0 || !section) continue;
    result[section][line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return result;
}

function numeric(value) {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function analyzeMapPackage(bytes, provenance) {
  const entries = centralEntries(bytes);
  const iniEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.ini'));
  if (!iniEntry) return null;
  const ini = parseIni(localEntryData(bytes, iniEntry).toString('latin1'));
  const trackCsv = entries.find(
    (entry) => entry.name.toLowerCase().endsWith('.csv') && !/_pit\.csv$/i.test(entry.name),
  );
  const pitCsv = entries.find((entry) => /_pit\.csv$/i.test(entry.name));
  const trackRows = trackCsv
    ? localEntryData(bytes, trackCsv).toString('latin1').split(/\r?\n/).filter(Boolean)
    : [];
  const pitRows = pitCsv ? localEntryData(bytes, pitCsv).toString('latin1').split(/\r?\n/).filter(Boolean) : [];
  const sectionOrder = Object.entries(ini.Sections ?? {})
    .filter(([key]) => /^Section_\d+$/.test(key))
    .sort((left, right) => Number(left[0].slice(8)) - Number(right[0].slice(8)))
    .map(([, value]) => value);
  const sections = sectionOrder.map((name) => ({
    name,
    type: ini[name]?.Type ?? null,
    start: ini[name]?.Start ?? null,
    end: ini[name]?.End ?? null,
    lapDistance: numeric(ini[name]?.LapDistance),
    length: numeric(ini[name]?.Length),
  }));
  return {
    ...provenance,
    packageSha256: createHash('sha256').update(bytes).digest('hex'),
    packageEntryCount: entries.length,
    iniEntry: iniEntry.name,
    trackCsvEntry: trackCsv?.name ?? null,
    pitCsvEntry: pitCsv?.name ?? null,
    name: ini.Track?.Name ?? iniEntry.name.replace(/\.ini$/i, ''),
    venueType: ini.Track?.Venue ?? null,
    lengthMiles: numeric(ini.Track?.Length),
    controlLine: ini.Track?.ControlLine ?? null,
    pitControlLine: ini.Track?.PitControlLine ?? null,
    staticGeometry: {
      trackPointCount: trackRows.length,
      pitPointCount: pitRows.length,
      hasTrackPolyline: trackRows.length > 1,
      geographicReferenceOrigin:
        ini.GPS?.SF_Latitude && ini.GPS?.SF_Longitude
          ? {
              latitude: numeric(ini.GPS.SF_Latitude),
              longitude: numeric(ini.GPS.SF_Longitude),
              latitudeScale: numeric(ini.GPS.LatitudeScale),
              longitudeScale: numeric(ini.GPS.LongitudeScale),
              rotationAdjustment: numeric(ini.GPS.RotationAdjustment),
            }
          : null,
      semantics:
        'Static track/pit polyline and reference origin. This is not an observation of any car position and must not be labeled vehicle GPS.',
    },
    timingSections: sections,
  };
}

function discoverPackages(bytes, sourceFileId, viewPath) {
  const direct = analyzeMapPackage(bytes, {
    sourceFileId,
    sourceViewPath: viewPath,
    nestedEntry: null,
  });
  if (direct) return [direct];
  const packages = [];
  for (const entry of centralEntries(bytes).filter((row) => row.name.toLowerCase().endsWith('.zip'))) {
    try {
      const packageRow = analyzeMapPackage(localEntryData(bytes, entry), {
        sourceFileId,
        sourceViewPath: viewPath,
        nestedEntry: entry.name,
      });
      if (packageRow) packages.push(packageRow);
    } catch {
      // Invalid nested packages remain represented by the source-file validation report.
    }
  }
  return packages;
}

const options = parseArgs(process.argv);
const manifest = JSON.parse(await readFile(join(options.dataRoot, 'manifests/source-files.json'), 'utf8'));
const mapSources = manifest.files.filter((file) => file.kind === 'track_map_archive');
const maps = [];
for (const [index, source] of mapSources.entries()) {
  const bytes = await readFile(join(options.dataRoot, source.viewPath));
  maps.push(...discoverPackages(bytes, source.id, source.viewPath));
  if ((index + 1) % 10 === 0 || index + 1 === mapSources.length) {
    process.stdout.write(`Analyzed ${index + 1}/${mapSources.length} map archives.\n`);
  }
}
const firstByHash = new Map();
for (const map of maps) {
  const first = firstByHash.get(map.packageSha256);
  map.duplicateOf = first ? {sourceFileId: first.sourceFileId, nestedEntry: first.nestedEntry} : null;
  if (!first) firstByHash.set(map.packageSha256, map);
}
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  grain: 'one row per RaceTools static track-map package',
  sourceArchiveCount: mapSources.length,
  mapDefinitionCount: maps.length,
  uniquePackageCount: firstByHash.size,
  maps: maps.sort((left, right) => left.name.localeCompare(right.name)),
  semanticWarning:
    'Map coordinates are static track geometry. Named timing sections can be joined to raw timing-loop events only after label validation; neither source is continuous car GPS.',
};
await atomicWriteJson(join(options.dataRoot, 'catalog/track-map-definitions.json'), report);
process.stdout.write(`${JSON.stringify({sourceArchives: mapSources.length, mapDefinitions: maps.length}, null, 2)}\n`);
