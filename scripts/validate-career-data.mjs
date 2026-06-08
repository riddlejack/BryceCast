import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const reportPath = join(root, 'data/career/reports/validation-report.json');

const collectionNames = [
  'drivers',
  'series',
  'teams',
  'cars',
  'tracks',
  'seasons',
  'events',
  'sessions',
  'results',
  'qualifyingResults',
  'lapSamples',
  'racecraftEvents',
  'penalties',
  'incidents',
  'weatherObservations',
  'mediaAssets',
  'broadcastRoutes',
  'notificationRules',
  'notificationEvents',
  'derivedMetrics',
  'sourceEvidence',
  'gaps'
];

const requiredCollections = new Set(collectionNames);

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const add = (list, severity, path, message) => {
  list.push({ severity, path, message });
};

const idsFor = (dataset, collection) => new Set((dataset[collection] ?? []).map((row) => row.id).filter(Boolean));

const checkUniqueIds = (dataset, issues) => {
  for (const name of collectionNames) {
    const rows = dataset[name] ?? [];
    const seen = new Set();
    rows.forEach((row, index) => {
      if (!row || typeof row !== 'object') {
        add(issues, 'error', `${name}[${index}]`, 'Row must be an object.');
        return;
      }
      if (!row.id) {
        add(issues, 'error', `${name}[${index}]`, 'Row is missing id.');
        return;
      }
      if (seen.has(row.id)) {
        add(issues, 'error', `${name}.${row.id}`, 'Duplicate id within collection.');
      }
      seen.add(row.id);
    });
  }
};

const checkRef = (dataset, issues, path, value, targetCollection, required = false) => {
  if (!value) {
    if (required) add(issues, 'error', path, `Missing required reference to ${targetCollection}.`);
    return;
  }
  if (!idsFor(dataset, targetCollection).has(value)) {
    add(issues, 'error', path, `Reference ${value} does not exist in ${targetCollection}.`);
  }
};

const isValidDate = (value) => {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time);
};

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const isSessionWindowExempt = (session) =>
  session.timeWindowApplicability === 'not_applicable_aggregate_classification';

const isValidTimezone = (timezone) => {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const checkRefs = (dataset, issues) => {
  for (const row of dataset.seasons ?? []) {
    checkRef(dataset, issues, `seasons.${row.id}.seriesId`, row.seriesId, 'series', true);
    checkRef(dataset, issues, `seasons.${row.id}.driverId`, row.driverId, 'drivers', true);
    for (const teamId of row.teamIds ?? []) checkRef(dataset, issues, `seasons.${row.id}.teamIds`, teamId, 'teams');
    for (const carId of row.carIds ?? []) checkRef(dataset, issues, `seasons.${row.id}.carIds`, carId, 'cars');
  }

  for (const row of dataset.events ?? []) {
    checkRef(dataset, issues, `events.${row.id}.seriesId`, row.seriesId, 'series', true);
    checkRef(dataset, issues, `events.${row.id}.trackId`, row.trackId, 'tracks', true);
  }

  for (const row of dataset.sessions ?? []) {
    checkRef(dataset, issues, `sessions.${row.id}.eventId`, row.eventId, 'events', true);
    for (const weatherId of row.weatherObservationRefs ?? []) checkRef(dataset, issues, `sessions.${row.id}.weatherObservationRefs`, weatherId, 'weatherObservations');
    for (const sessionId of row.derivedFromSessionIds ?? []) checkRef(dataset, issues, `sessions.${row.id}.derivedFromSessionIds`, sessionId, 'sessions');
  }

  for (const row of dataset.results ?? []) {
    checkRef(dataset, issues, `results.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `results.${row.id}.driverId`, row.driverId, 'drivers', true);
    checkRef(dataset, issues, `results.${row.id}.teamId`, row.teamId, 'teams');
    checkRef(dataset, issues, `results.${row.id}.carId`, row.carId, 'cars');
    for (const penaltyId of row.penaltyRefs ?? []) checkRef(dataset, issues, `results.${row.id}.penaltyRefs`, penaltyId, 'penalties');
    for (const incidentId of row.incidentRefs ?? []) checkRef(dataset, issues, `results.${row.id}.incidentRefs`, incidentId, 'incidents');
  }

  for (const row of dataset.qualifyingResults ?? []) {
    checkRef(dataset, issues, `qualifyingResults.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `qualifyingResults.${row.id}.driverId`, row.driverId, 'drivers', true);
    checkRef(dataset, issues, `qualifyingResults.${row.id}.teamId`, row.teamId, 'teams');
    checkRef(dataset, issues, `qualifyingResults.${row.id}.carId`, row.carId, 'cars');
  }

  for (const row of dataset.lapSamples ?? []) {
    checkRef(dataset, issues, `lapSamples.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `lapSamples.${row.id}.driverId`, row.driverId, 'drivers', true);
    if (row.carId) checkRef(dataset, issues, `lapSamples.${row.id}.carId`, row.carId, 'cars');
  }

  for (const row of dataset.racecraftEvents ?? []) {
    checkRef(dataset, issues, `racecraftEvents.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `racecraftEvents.${row.id}.driverId`, row.driverId, 'drivers', true);
    for (const driverId of row.otherDriverIds ?? []) checkRef(dataset, issues, `racecraftEvents.${row.id}.otherDriverIds`, driverId, 'drivers');
  }

  for (const row of dataset.penalties ?? []) {
    checkRef(dataset, issues, `penalties.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `penalties.${row.id}.driverId`, row.driverId, 'drivers');
  }

  for (const row of dataset.incidents ?? []) {
    checkRef(dataset, issues, `incidents.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `incidents.${row.id}.driverId`, row.driverId, 'drivers');
    for (const driverId of row.otherDriverIds ?? []) checkRef(dataset, issues, `incidents.${row.id}.otherDriverIds`, driverId, 'drivers');
  }

  for (const row of dataset.mediaAssets ?? []) {
    checkRef(dataset, issues, `mediaAssets.${row.id}.eventId`, row.eventId, 'events');
    checkRef(dataset, issues, `mediaAssets.${row.id}.sessionId`, row.sessionId, 'sessions');
    checkRef(dataset, issues, `mediaAssets.${row.id}.driverId`, row.driverId, 'drivers');
  }

  for (const row of dataset.broadcastRoutes ?? []) {
    checkRef(dataset, issues, `broadcastRoutes.${row.id}.eventId`, row.eventId, 'events');
    checkRef(dataset, issues, `broadcastRoutes.${row.id}.sessionId`, row.sessionId, 'sessions');
  }

  for (const row of dataset.notificationEvents ?? []) {
    checkRef(dataset, issues, `notificationEvents.${row.id}.sessionId`, row.sessionId, 'sessions', true);
    checkRef(dataset, issues, `notificationEvents.${row.id}.broadcastRouteId`, row.broadcastRouteId, 'broadcastRoutes');
  }
};

const checkProvenance = (dataset, issues) => {
  const evidenceIds = idsFor(dataset, 'sourceEvidence');
  const needsProvenance = collectionNames.filter((name) => !['sourceEvidence', 'gaps'].includes(name));
  for (const name of needsProvenance) {
    for (const row of dataset[name] ?? []) {
      const refs = row.provenanceRefs ?? [];
      if (!Array.isArray(refs) || refs.length === 0) {
        add(issues, name === 'drivers' ? 'warn' : 'error', `${name}.${row.id}.provenanceRefs`, 'Missing provenanceRefs.');
        continue;
      }
      for (const ref of refs) {
        if (!evidenceIds.has(ref)) add(issues, 'error', `${name}.${row.id}.provenanceRefs`, `Source evidence ${ref} does not exist.`);
      }
    }
  }
};

const checkTemporalAndWeatherIntegrity = (dataset, issues) => {
  let sessionsMissingTimeZone = 0;
  let sessionsMissingStart = 0;

  const eventsById = new Map((dataset.events ?? []).map((row) => [row.id, row]));
  const sessionsById = new Map((dataset.sessions ?? []).map((row) => [row.id, row]));

  for (const session of dataset.sessions ?? []) {
    if (session.scheduledStart && !isValidDate(session.scheduledStart)) {
      add(issues, 'error', `sessions.${session.id}.scheduledStart`, 'scheduledStart must be a parseable date/time when present.');
    }
    if (session.actualStart && !isValidDate(session.actualStart)) {
      add(issues, 'error', `sessions.${session.id}.actualStart`, 'actualStart must be a parseable date/time when present.');
    }
    if (!session.scheduledStart && !session.actualStart && !isSessionWindowExempt(session)) sessionsMissingStart += 1;
    if (!session.timezone) sessionsMissingTimeZone += 1;
  }

  if (sessionsMissingStart > 0) {
    add(issues, 'warn', 'sessions.timeCoverage', `${sessionsMissingStart} physical sessions do not yet have scheduledStart or actualStart. Weather/live joins must wait for session time backfill.`);
  }
  if (sessionsMissingTimeZone > 0) {
    add(issues, 'warn', 'sessions.timezoneCoverage', `${sessionsMissingTimeZone} sessions do not yet have timezone. Weather joins must use track/event timezone backfill before production analytics.`);
  }

  for (const weather of dataset.weatherObservations ?? []) {
    checkRef(dataset, issues, `weatherObservations.${weather.id}.trackId`, weather.trackId, 'tracks', true);
    checkRef(dataset, issues, `weatherObservations.${weather.id}.sessionId`, weather.sessionId, 'sessions', true);
    if (!isValidDate(weather.observedAt)) {
      add(issues, 'error', `weatherObservations.${weather.id}.observedAt`, 'Weather observation must include a parseable observedAt timestamp.');
    }
    if (!isFiniteNumber(weather.latitude) || !isFiniteNumber(weather.longitude)) {
      add(issues, 'error', `weatherObservations.${weather.id}.coordinates`, 'Weather observation must include numeric latitude and longitude.');
    }
    if (!isFiniteNumber(weather.distanceFromTrackKm)) {
      add(issues, 'error', `weatherObservations.${weather.id}.distanceFromTrackKm`, 'Weather observation must include numeric distanceFromTrackKm.');
    }

    const session = sessionsById.get(weather.sessionId);
    const event = session ? eventsById.get(session.eventId) : null;
    if (event?.trackId && weather.trackId && event.trackId !== weather.trackId) {
      add(issues, 'error', `weatherObservations.${weather.id}.trackId`, `Weather trackId ${weather.trackId} does not match session event trackId ${event.trackId}.`);
    }
  }
};

const checkTrackMetadataCoverage = (dataset, issues) => {
  const tracksById = new Map((dataset.tracks ?? []).map((row) => [row.id, row]));
  const referencedTrackIds = new Set((dataset.events ?? []).map((row) => row.trackId).filter(Boolean));
  const missingCoordinates = [];
  const missingTimezone = [];
  const missingLayoutLength = [];
  const missingKnownDirection = [];
  const invalidCoordinates = [];
  const invalidTimezones = [];

  for (const trackId of referencedTrackIds) {
    const track = tracksById.get(trackId);
    if (!track) continue;

    const hasLatitude = isFiniteNumber(track.latitude);
    const hasLongitude = isFiniteNumber(track.longitude);
    const hasCoordinates = hasLatitude && hasLongitude;
    const hasLength = isFiniteNumber(track.lengthKm) || isFiniteNumber(track.lengthMi);

    if (!hasCoordinates) {
      missingCoordinates.push(trackId);
    } else if (track.latitude < -90 || track.latitude > 90 || track.longitude < -180 || track.longitude > 180) {
      invalidCoordinates.push(trackId);
    }

    if (!track.timezone) {
      missingTimezone.push(trackId);
    } else if (!isValidTimezone(track.timezone)) {
      invalidTimezones.push(trackId);
    }

    if (!hasLength) missingLayoutLength.push(trackId);
    if (!track.direction || track.direction === 'unknown') missingKnownDirection.push(trackId);

    if (track.weatherJoinReady && (!hasCoordinates || !track.timezone)) {
      add(issues, 'error', `tracks.${trackId}.weatherJoinReady`, 'weatherJoinReady cannot be true without numeric coordinates and timezone.');
    }
  }

  if (invalidCoordinates.length > 0) {
    add(issues, 'error', 'tracks.coordinateValidity', `Tracks have out-of-range coordinates: ${invalidCoordinates.join(', ')}.`);
  }
  if (invalidTimezones.length > 0) {
    add(issues, 'error', 'tracks.timezoneValidity', `Tracks have invalid IANA timezones: ${invalidTimezones.join(', ')}.`);
  }
  if (missingCoordinates.length > 0) {
    add(issues, 'warn', 'tracks.coordinateCoverage', `${missingCoordinates.length} event-referenced tracks lack coordinates: ${missingCoordinates.join(', ')}.`);
  }
  if (missingTimezone.length > 0) {
    add(issues, 'warn', 'tracks.timezoneCoverage', `${missingTimezone.length} event-referenced tracks lack timezone: ${missingTimezone.join(', ')}.`);
  }
  if (missingLayoutLength.length > 0) {
    add(issues, 'warn', 'tracks.layoutCoverage', `${missingLayoutLength.length} event-referenced tracks lack layout length: ${missingLayoutLength.join(', ')}.`);
  }
  if (missingKnownDirection.length > 0) {
    add(issues, 'warn', 'tracks.directionCoverage', `${missingKnownDirection.length} event-referenced tracks lack known direction: ${missingKnownDirection.join(', ')}.`);
  }
};

const checkDatasetShape = (dataset, issues) => {
  if (dataset.schemaVersion !== 'bryce-career.v1') {
    add(issues, 'error', 'schemaVersion', 'Expected schemaVersion bryce-career.v1.');
  }
  for (const name of requiredCollections) {
    if (!Array.isArray(dataset[name])) add(issues, 'error', name, 'Required collection must be an array.');
  }
};

const main = async () => {
  const dataset = await readJson(datasetPath);
  const issues = [];
  checkDatasetShape(dataset, issues);
  checkUniqueIds(dataset, issues);
  checkRefs(dataset, issues);
  checkProvenance(dataset, issues);
  checkTemporalAndWeatherIntegrity(dataset, issues);
  checkTrackMetadataCoverage(dataset, issues);

  const report = {
    checkedAt: new Date().toISOString(),
    dataset: datasetPath,
    ok: issues.every((issue) => issue.severity !== 'error'),
    counts: Object.fromEntries(collectionNames.map((name) => [name, Array.isArray(dataset[name]) ? dataset[name].length : null])),
    issues
  };

  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
