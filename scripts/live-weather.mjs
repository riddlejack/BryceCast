import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildUpcomingIndyNxtWeatherReport,
  fetchCachedLiveWeatherForTrack,
  fetchLiveWeatherForTrack,
  loadTrackMetadata
} from './live-weather-service.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const outputPath = join(root, 'data/live/live-weather-latest.json');
const upcomingOutputPath = join(root, 'data/live/live-weather-upcoming-latest.json');

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.findLast((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.lastIndexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const trackId = argValue('track-id', 'track_road_america');
const writeOutput = !process.argv.includes('--no-write');
const upcomingIndyNxt = process.argv.includes('--upcoming-indy-nxt');
const useCache = !process.argv.includes('--no-cache') && !process.argv.includes('--refresh');

if (upcomingIndyNxt) {
  const report = await buildUpcomingIndyNxtWeatherReport({ useCache });

  if (writeOutput) {
    await mkdir(dirname(upcomingOutputPath), { recursive: true });
    await writeFile(upcomingOutputPath, JSON.stringify(report, null, 2));
  }

  console.log(
    JSON.stringify(
      {
        ok: report.sourceState === 'live' || report.sourceState === 'partial',
        sourceState: report.sourceState,
        checkedAt: report.checkedAt,
        eventCount: report.eventCount,
        events: report.events.map(({ event, forecastReadiness, weather }) => ({
          id: event.id,
          name: event.name,
          eventStartDate: event.eventStartDate,
          eventEndDate: event.eventEndDate,
          track: event.track.name,
          forecastReadiness,
          sourceState: weather.sourceState,
          station: weather.station,
          observation: weather.observation,
          nextHours: weather.forecastHourly.slice(0, 2),
          alertCount: weather.alerts.length
        })),
        wrote: writeOutput ? relative(root, upcomingOutputPath) : null
      },
      null,
      2
    )
  );
  process.exit(0);
}

const track = await loadTrackMetadata(trackId);
const report = useCache ? await fetchCachedLiveWeatherForTrack(track) : await fetchLiveWeatherForTrack(track);
if (writeOutput) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(report, null, 2));
}

console.log(
  JSON.stringify(
    {
      ok: report.sourceState === 'live' || report.sourceState === 'partial',
      sourceState: report.sourceState,
      checkedAt: report.checkedAt,
      track: report.track,
      station: report.station,
      observation: report.observation,
      nextHours: report.forecastHourly.slice(0, 4),
      alerts: report.alerts.map((alert) => ({ event: alert.event, severity: alert.severity, headline: alert.headline })),
      probes: report.probes.map((probe) => ({
        id: probe.id,
        ok: probe.ok,
        status: probe.status,
        latencyMs: probe.latencyMs,
        bytes: probe.bytes,
        lastModified: probe.lastModified
      })),
      wrote: writeOutput ? relative(root, outputPath) : null
    },
    null,
    2
  )
);
