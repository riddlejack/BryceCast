#!/usr/bin/env node

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {basename, dirname, join, resolve} from 'node:path';
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
    iniTrackName: ini.Track?.Name ?? null,
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
              trust: 'untrusted_until_per_venue_validated',
              note:
                'The [GPS] origin is untrusted for geographic projection until validated against real-world geography per venue. The $P telemetry probe (2026-07-19) found at least one package whose local geometry is correct but whose [GPS] origin carries the wrong venue coordinates (Toronto 43.6339,-79.4122 on a non-Toronto map), consistent with the F2 filename mislabels. Use the local polyline + LapDistance distance-along-track as the trusted frame.',
            }
          : null,
      semantics:
        'Static track/pit polyline and reference origin. This is not an observation of any car position and must not be labeled vehicle GPS. The trusted frame is the local polyline + LapDistance distance-along-track; the [GPS] origin is untrusted for geographic projection until per-venue validated (see geographicReferenceOrigin.note).',
    },
    timingSections: sections,
  };
}

// RaceTools archive filenames are not a reliable key: standalone `Mid-Ohio.zip`
// carries the Streets of Toronto map, `Arlington.zip` carries Phoenix Raceway,
// and `IndyCarMaps.zip/Portland_2018.zip` carries Gateway (Wave 0 audit F2).
// Consumers MUST join by INI Track.Name + package SHA-256, never by filename.
// These are the audit-confirmed cases; the heuristic below flags any further
// divergence so a new mislabel cannot pass silently.
const KNOWN_FILENAME_MISMATCHES = [
  {archive: 'Mid-Ohio.zip', nestedEntry: null, iniTrackName: 'Streets of Toronto'},
  {archive: 'IndyCarMaps.zip', nestedEntry: 'Mid-Ohio.zip', iniTrackName: 'Streets of Toronto'},
  {archive: 'IndyNXT_2026.zip', nestedEntry: 'Mid-Ohio.zip', iniTrackName: 'Streets of Toronto'},
  {archive: 'Arlington.zip', nestedEntry: null, iniTrackName: 'Phoenix Raceway'},
  {archive: 'IndyCarMaps.zip', nestedEntry: 'Portland_2018.zip', iniTrackName: 'Gateway Motorsports Park'},
];

const VENUE_STOPWORDS = new Set([
  'the', 'raceway', 'speedway', 'park', 'circuit', 'street', 'streets', 'international', 'motorsports',
  'motorsport', 'motor', 'sports', 'sport', 'car', 'cars', 'course', 'club', 'of', 'rc', 'and',
  'autodrome', 'superspeedway', 'super', 'grand', 'prix', 'racing', 'series', 'day', 'test',
]);

function venueTokens(value) {
  return String(value ?? '')
    .replace(/\.(zip|ini)$/i, '')
    .replace(/[_-](pit|i\d+[a-z]*|l\d+|preliminary|prelim|short|innerloop|inner|outer|ext|sf|indycar|iracing|\d{4})$/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2') // split camelCase filenames (RoadAmerica -> Road America)
    .replace(/([A-Za-z])(\d)/g, '$1 $2') // split trailing digits (LagunaSeca2021 -> Laguna Seca 2021)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !VENUE_STOPWORDS.has(word));
}

function detectFilenameMismatch(map, archiveBasename) {
  const fileLabel = map.nestedEntry ?? archiveBasename;
  const archiveLabel = map.nestedEntry ? `${archiveBasename}/${map.nestedEntry}` : archiveBasename;
  const known = KNOWN_FILENAME_MISMATCHES.find(
    (row) => row.archive === archiveBasename && (row.nestedEntry ?? null) === (map.nestedEntry ?? null),
  );
  if (known) {
    return {
      archiveLabel,
      archiveFilenameSuggests: fileLabel.replace(/\.(zip|ini)$/i, ''),
      iniTrackName: map.iniTrackName,
      source: 'audit_confirmed',
      note: 'RaceTools archive filename does not describe its contents; join by INI Track.Name + SHA-256.',
    };
  }
  // Heuristic guard: only when a real INI Track.Name exists (blank/absent names are
  // recorded by audit F8, not treated as mismatches here).
  if (!map.iniTrackName || map.iniTrackName.trim() === '') return null;
  const fileTokens = venueTokens(fileLabel);
  const nameTokens = new Set(venueTokens(map.iniTrackName));
  if (fileTokens.length === 0 || nameTokens.size === 0) return null;
  const shares = fileTokens.some((token) => nameTokens.has(token));
  if (shares) return null;
  return {
    archiveLabel,
    archiveFilenameSuggests: fileLabel.replace(/\.(zip|ini)$/i, ''),
    iniTrackName: map.iniTrackName,
    source: 'heuristic_no_shared_venue_token',
    note: 'Archive filename shares no venue token with the INI Track.Name; verify before trusting the filename.',
  };
}

const SECTION_ANCHOR_MIN = 10; // rich packages define 23-45 sections; 0-2 cannot anchor a real section span

function buildVenueSectionStatus(maps) {
  const byVenue = new Map();
  for (const map of maps) {
    const resolvedName = map.iniTrackName && map.iniTrackName.trim() !== '';
    const venueName = resolvedName ? map.iniTrackName : map.iniEntry.replace(/\.ini$/i, '');
    const origin = map.staticGeometry.geographicReferenceOrigin;
    if (!byVenue.has(venueName)) {
      byVenue.set(venueName, {
        venueName,
        iniTrackNameResolved: Boolean(resolvedName),
        maxSections: 0,
        packageCount: 0,
        hasGpsOrigin: false,
        hasGpsScales: false,
      });
    }
    const row = byVenue.get(venueName);
    row.iniTrackNameResolved = row.iniTrackNameResolved || Boolean(resolvedName);
    row.maxSections = Math.max(row.maxSections, map.timingSections.length);
    row.packageCount += 1;
    if (origin) row.hasGpsOrigin = true;
    if (origin && origin.latitudeScale != null) row.hasGpsScales = true;
  }
  return [...byVenue.values()]
    .map((row) => ({...row, sectionAnchorable: row.maxSections >= SECTION_ANCHOR_MIN}))
    .sort((left, right) => right.maxSections - left.maxSections || left.venueName.localeCompare(right.venueName));
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
for (const map of maps) {
  map.filenameMismatch = detectFilenameMismatch(map, basename(map.sourceViewPath));
}
const filenameMismatches = maps.filter((map) => map.filenameMismatch);
const venueSectionStatus = buildVenueSectionStatus(maps);
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  grain: 'one row per RaceTools static track-map package',
  sourceArchiveCount: mapSources.length,
  mapDefinitionCount: maps.length,
  uniquePackageCount: firstByHash.size,
  consumerGuard:
    'Join map packages to sessions/venues by INI Track.Name + package SHA-256, NEVER by archive filename. RaceTools filenames are unreliable (see filenameMismatches). Query venueSectionStatus.sectionAnchorable to know whether a venue can be section-anchored from lake maps before attempting a per-section join. The trusted spatial frame is the local polyline + LapDistance distance-along-track; map [GPS] origins are untrusted for geographic projection until per-venue validated (see gpsOriginGuard).',
  gpsOriginGuard:
    'Map-package [GPS] origins (SF_Latitude/SF_Longitude and scales) are untrusted for geographic projection until validated against real-world geography per venue. The $P telemetry probe (2026-07-19) confirmed at least one package with correct local geometry but a wrong-venue [GPS] origin (Toronto 43.6339,-79.4122 on a non-Toronto map), the same class as the F2 filename mislabels. Anchor sections by distance-along-track (LapDistance) on the local polyline, not by projecting the [GPS] origin.',
  filenameMismatchCount: filenameMismatches.length,
  filenameMismatches: filenameMismatches.map((map) => ({
    packageSha256: map.packageSha256,
    ...map.filenameMismatch,
    sections: map.timingSections.length,
  })),
  sectionAnchorMinSections: SECTION_ANCHOR_MIN,
  venueSectionStatus,
  maps: maps.sort((left, right) => left.name.localeCompare(right.name)),
  semanticWarning:
    'Map coordinates are static track geometry. Named timing sections can be joined to raw timing-loop events only after label validation; neither source is continuous car GPS.',
};
await atomicWriteJson(join(options.dataRoot, 'catalog/track-map-definitions.json'), report);
process.stdout.write(`${JSON.stringify({sourceArchives: mapSources.length, mapDefinitions: maps.length}, null, 2)}\n`);
