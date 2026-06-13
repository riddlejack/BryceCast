import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBryceProfile, isBryceTimingRow, liveSourceEndpoints, raceSnapshotEndpointIds } from './live-source-endpoints.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const outputDir = join(root, 'data/live/pressure-tests');
const latestPath = join(root, 'data/live/live-source-pressure-latest.json');

const argValue = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = process.argv.findLast((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.lastIndexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};

const intervalMs = Number(argValue('interval-ms', argValue('interval', '1000')));
const iterations = Number(argValue('iterations', '30'));
const endpointSelection = argValue('endpoints', 'all');
const writeOutput = !process.argv.includes('--no-write');
const fetchTimeoutMs = Number(argValue('timeout-ms', '5000'));

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const percentile = (values, pct) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
};

const hashText = (text) => createHash('sha256').update(text).digest('hex');

const selectedEndpoints = () => {
  if (endpointSelection === 'all') return liveSourceEndpoints;
  if (endpointSelection === 'primary') return liveSourceEndpoints.filter((endpoint) => raceSnapshotEndpointIds.includes(endpoint.id));
  if (endpointSelection === 'fast') return liveSourceEndpoints.filter((endpoint) => endpoint.cadence === 'fast');
  const ids = new Set(endpointSelection.split(',').map((id) => id.trim()).filter(Boolean));
  return liveSourceEndpoints.filter((endpoint) => ids.has(endpoint.id));
};

const summarizeTiming = (payload) => {
  const timing = payload?.timing_results ?? {};
  const heartbeat = timing.heartbeat ?? {};
  const rows = Array.isArray(timing.Item) ? timing.Item : [];
  const bryce = rows.find((row) => isBryceTimingRow(row, heartbeat)) ?? null;
  const fieldKeys = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort();
  const lapDistanceValues = rows.map((row) => safeNumber(row.lapDistance)).filter((value) => value !== null);
  const sectorKeys = fieldKeys.filter((key) => /^(B?S|BT?S|Q[SWA]?\d|QTotal|QAverage|QSAverage)$/i.test(key));
  const tireValues = [...new Set(rows.map((row) => row.Tire).filter(Boolean))].sort();
  const overtakeValues = rows
    .map((row) => ({ remain: safeNumber(row.OverTake_Remain), active: row.OverTake_Active ?? null }))
    .filter((row) => row.remain !== null || row.active !== null);

  return {
    heartbeat: {
      eventName: heartbeat.eventName ?? null,
      series: heartbeat.Series ?? null,
      sessionName: heartbeat.SessionName ?? null,
      sessionType: heartbeat.SessionType ?? null,
      sessionStatus: heartbeat.SessionStatus ?? null,
      flag: heartbeat.currentFlag ?? null,
      lap: heartbeat.lapNumber ?? null,
      totalLaps: heartbeat.totalLaps ?? null,
      eventId: heartbeat.EventID ?? null,
      eventSessionId: heartbeat.EventSessionID ?? null,
      trackName: heartbeat.trackName ?? null,
      trackType: heartbeat.trackType ?? null
    },
    rowCount: rows.length,
    fieldKeys,
    candidateFields: {
      points: fieldKeys.filter((key) => /points/i.test(key)),
      pit: fieldKeys.filter((key) => /pit/i.test(key)),
      tire: fieldKeys.filter((key) => /tire/i.test(key)),
      overtake: fieldKeys.filter((key) => /overtake|OverTake/i.test(key)),
      sector: sectorKeys,
      trackMap: fieldKeys.filter((key) => /lapDistance|gps|lat|long|track/i.test(key))
    },
    lapDistance: {
      samples: lapDistanceValues.length,
      nonZero: lapDistanceValues.filter((value) => value > 0).length,
      min: lapDistanceValues.length ? Math.min(...lapDistanceValues) : null,
      max: lapDistanceValues.length ? Math.max(...lapDistanceValues) : null
    },
    tires: tireValues,
    overtakeSample: overtakeValues.slice(0, 5),
    bryce: bryce
      ? {
          no: bryce.no,
          rank: bryce.rank,
          liveRank: bryce.liveRank,
          startPosition: bryce.startPosition,
          status: bryce.status,
          comment: bryce.comment,
          gap: bryce.gap,
          liveGap: bryce.liveGap,
          diff: bryce.diff,
          laps: bryce.laps,
          runningDriverPoints: bryce.runningDriverPoints ?? null,
          totalDriverPoints: bryce.totalDriverPoints ?? null,
          totalEntrantPoints: bryce.totalEntrantPoints ?? null,
          tire: bryce.Tire ?? null,
          overtakeRemain: bryce.OverTake_Remain ?? null,
          overtakeActive: bryce.OverTake_Active ?? null,
          lapDistance: bryce.lapDistance ?? null,
          liveDiffAhead: bryce.liveDiffAhead ?? null,
          liveDiffBehind: bryce.liveDiffBehind ?? null,
          sincePitLap: bryce.sincePitLap ?? null,
          lastPitLap: bryce.lastPitLap ?? null,
          pitStops: bryce.pitStops ?? null
        }
      : null
  };
};

const summarizeDrivers = (payload, id) => {
  const drivers = asArray(payload?.drivers?.driver);
  const bryce = drivers.find(isBryceProfile) ?? null;
  return {
    driverCount: drivers.length,
    bryce:
      id === 'drivers_nxt' && bryce
        ? {
            driverid: bryce.driverid ?? null,
            rcDriverId: bryce.rc_driver_id ?? null,
            number: bryce.number ?? null,
            team: bryce.team ?? null,
            radiofrequency: bryce.radiofrequency ?? null,
            stats: bryce.stats ?? null
          }
        : null,
    sampleKeys: Object.keys(drivers[0] ?? {}).slice(0, 30)
  };
};

const summarizeConfig = (payload) => ({
  trackMapUrl: payload?.track_map_url ?? null,
  noTrackActivity: payload?.no_track_activity ?? null,
  showStaticTrackMap: payload?.show_static_track_map ?? null,
  trackMap: payload?.track_map
    ? {
        show: payload.track_map.show ?? null,
        wssUriPresent: Boolean(payload.track_map.wss_uri),
        wssKeyPresent: Boolean(payload.track_map.wss_key),
        mapPathPresent: Boolean(payload.track_map.map_svg_path_d),
        reverseDirection: payload.track_map.reverse_direction ?? null
      }
    : null,
  waysToWatch: asArray(payload?.ways_to_watch).filter((link) => link.show !== false).map((link) => link.text ?? link.url ?? '').filter(Boolean)
});

const summarizeSchedule = (payload) => {
  const races = asArray(payload?.schedule?.race);
  const now = Date.now();
  const upcoming = races
    .map((race) => ({
      eventId: race.eventid ?? null,
      name: race.name ?? null,
      city: race.city ?? null,
      state: race.state ?? null,
      start: race.startdate ?? race.green_flag ?? race.tv?.listing?.datetime ?? null,
      end: race.enddate ?? null,
      trackType: race.track_type ?? race.tracktype ?? null,
      trackLength: race.track_length ?? null,
      tv: race.tv?.listing
        ? {
            datetime: race.tv.listing.datetime ?? null,
            channel: race.tv.listing.channel ?? null,
            programName: race.tv.listing.programname ?? null
          }
        : null
    }))
    .filter((race) => {
      const parsed = Date.parse(race.end ?? race.start ?? '');
      return Number.isFinite(parsed) && parsed >= now - 86400000;
    })
    .slice(0, 8);
  return {
    raceCount: races.length,
    upcoming
  };
};

const summarizeTrackActivity = (payload) => {
  const events = asArray(payload?.trackactivity?.event);
  const now = Date.now();
  const activeOrUpcoming = events
    .map((event) => ({
      eventId: event.eventid ?? null,
      eventName: event.eventname ?? null,
      trackType: event.tracktype ?? null,
      sessions: asArray(event.sessions?.session)
        .filter((session) => {
          const parsed = Date.parse(session.enddatetime ?? session.startdatetime ?? '');
          return !Number.isFinite(parsed) || parsed >= now - 86400000;
        })
        .slice(0, 12)
        .map((session) => ({
          sessionId: session.sessionid ?? null,
          label: session.sessionlabel ?? null,
          type: session.sessiontype ?? null,
          start: session.startdatetime ?? null,
          end: session.enddatetime ?? null,
          estimatedGreenFlag: session.estimatedgreenflag ?? null,
          status: session.status ?? null,
          resultsImported: session.resultsimported ?? null,
          resultsOfficial: session.resultsofficial ?? null,
          networks: asArray(session.networks?.network).map((network) => network.name).filter(Boolean)
        }))
    }))
    .filter((event) => event.sessions.length > 0)
    .slice(0, 8);
  return {
    eventCount: events.length,
    activeOrUpcoming
  };
};

const summarizeNttData = (payload) => {
  const rows = Array.isArray(payload) ? payload : [];
  return {
    rowCount: rows.length,
    datasets: [...new Set(rows.map((row) => row.Dataset).filter(Boolean))].sort(),
    latestDatetime: rows.map((row) => row.Datetime).filter(Boolean).sort().at(-1) ?? null,
    sampleKeys: Object.keys(rows[0] ?? {}).slice(0, 30),
    sample: rows[0] ?? null
  };
};

const summarizePayload = (endpoint, payload) => {
  if (endpoint.id === 'timing') return summarizeTiming(payload);
  if (endpoint.id === 'drivers_nxt' || endpoint.id === 'drivers_top') return summarizeDrivers(payload, endpoint.id);
  if (endpoint.id === 'config') return summarizeConfig(payload);
  if (endpoint.id === 'schedule_nxt' || endpoint.id === 'schedule_top') return summarizeSchedule(payload);
  if (endpoint.id === 'trackactivity_nxt' || endpoint.id === 'trackactivity_top') return summarizeTrackActivity(payload);
  if (endpoint.id === 'ntt_data_polling') return summarizeNttData(payload);
  return { topKeys: Object.keys(payload ?? {}).slice(0, 20) };
};

const validatePayload = (endpoint, payload) => {
  if (endpoint.id === 'timing') {
    return payload?.timing_results?.heartbeat && Array.isArray(payload?.timing_results?.Item)
      ? null
      : 'Timing payload missing timing_results heartbeat or Item rows.';
  }
  if (endpoint.id === 'drivers_nxt' || endpoint.id === 'drivers_top') {
    return Array.isArray(payload?.drivers?.driver) ? null : 'Driver payload missing drivers.driver rows.';
  }
  if (endpoint.id === 'config') {
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? null : 'Config payload is not a JSON object.';
  }
  if (endpoint.id === 'schedule_nxt' || endpoint.id === 'schedule_top') {
    return payload?.schedule ? null : 'Schedule payload missing schedule root.';
  }
  if (endpoint.id === 'trackactivity_nxt' || endpoint.id === 'trackactivity_top') {
    return payload?.trackactivity ? null : 'Track activity payload missing trackactivity root.';
  }
  if (endpoint.id === 'ntt_data_polling') {
    return Array.isArray(payload) ? null : 'NTT candidate payload is not an array.';
  }
  return payload !== null && payload !== undefined ? null : 'JSON payload is empty.';
};

const fetchEndpoint = async (endpoint) => {
  const startedAt = performance.now();
  const fetchedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const separator = endpoint.url.includes('?') ? '&' : '?';
    const response = await fetch(`${endpoint.url}${separator}t=${Date.now()}`, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
	    const text = await response.text();
	    let payload = null;
	    let parseError = null;
	    try {
	      payload = text ? JSON.parse(text) : null;
	    } catch (error) {
	      parseError = error;
	    }
	    const validationError = response.ok && !parseError ? validatePayload(endpoint, payload) : null;
	    const error = !response.ok
	      ? `${response.status} ${response.statusText}`
	      : parseError
	        ? `Invalid JSON response: ${parseError.message}`
	        : validationError;
	    const ok = response.ok && !error;
	    return {
      id: endpoint.id,
      label: endpoint.label,
      series: endpoint.series,
      cadence: endpoint.cadence,
      role: endpoint.role,
      proxyPath: endpoint.proxyPath,
      url: endpoint.url,
      fetchedAt,
	      ok,
	      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      contentType: response.headers.get('content-type'),
      lastModified: response.headers.get('last-modified'),
      etag: response.headers.get('etag'),
      bytes: Buffer.byteLength(text),
      hash: hashText(text),
	      summary: ok && payload ? summarizePayload(endpoint, payload) : {},
	      error
	    };
  } catch (error) {
    return {
      id: endpoint.id,
      label: endpoint.label,
      series: endpoint.series,
      cadence: endpoint.cadence,
      role: endpoint.role,
      proxyPath: endpoint.proxyPath,
      url: endpoint.url,
      fetchedAt,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      contentType: null,
      lastModified: null,
      etag: null,
      bytes: 0,
      hash: null,
      summary: {},
      error: error?.name === 'AbortError' ? `Timed out after ${fetchTimeoutMs} ms` : error instanceof Error ? error.message : 'Unknown fetch error'
    };
  } finally {
    clearTimeout(timeout);
  }
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const endpoints = selectedEndpoints();
if (endpoints.length === 0) {
  throw new Error(`No live endpoints matched --endpoints=${endpointSelection}`);
}

const startedAt = new Date().toISOString();
const samples = [];

for (let iteration = 1; iteration <= iterations; iteration += 1) {
  const iterationStartedAt = Date.now();
  const results = await Promise.all(endpoints.map(fetchEndpoint));
  samples.push({ iteration, checkedAt: new Date().toISOString(), results });
  const short = results.map((result) => `${result.id}:${result.status}/${result.latencyMs}ms/${result.bytes}b`).join(' ');
  console.log(`[${iteration}/${iterations}] ${short}`);
  const elapsed = Date.now() - iterationStartedAt;
  if (iteration < iterations && intervalMs > elapsed) await sleep(intervalMs - elapsed);
}

const endpointReports = endpoints.map((endpoint) => {
  const rows = samples.map((sample) => sample.results.find((result) => result.id === endpoint.id)).filter(Boolean);
  const okRows = rows.filter((row) => row.ok);
  const latencies = okRows.map((row) => row.latencyMs);
  const hashes = rows.map((row) => row.hash).filter(Boolean);
  const etags = rows.map((row) => row.etag).filter(Boolean);
  const modified = rows.map((row) => row.lastModified).filter(Boolean);
  const latest = rows.at(-1) ?? null;
  return {
    id: endpoint.id,
    label: endpoint.label,
    series: endpoint.series,
    cadence: endpoint.cadence,
    role: endpoint.role,
    proxyPath: endpoint.proxyPath,
    url: endpoint.url,
    requests: rows.length,
    ok: okRows.length,
    errors: rows.length - okRows.length,
    successRate: rows.length ? okRows.length / rows.length : 0,
    statusCounts: rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    }, {}),
    latencyMs: {
      min: latencies.length ? Math.min(...latencies) : null,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      max: latencies.length ? Math.max(...latencies) : null
    },
    bytes: {
      min: okRows.length ? Math.min(...okRows.map((row) => row.bytes)) : null,
      max: okRows.length ? Math.max(...okRows.map((row) => row.bytes)) : null,
      latest: latest?.bytes ?? null
    },
    uniquePayloadHashes: new Set(hashes).size,
    uniqueEtags: new Set(etags).size,
    uniqueLastModified: new Set(modified).size,
    latestLastModified: latest?.lastModified ?? null,
    latestEtag: latest?.etag ?? null,
    latestSummary: latest?.summary ?? {}
  };
});

const totalRequests = endpointReports.reduce((sum, endpoint) => sum + endpoint.requests, 0);
const totalOk = endpointReports.reduce((sum, endpoint) => sum + endpoint.ok, 0);
const report = {
  schemaVersion: 'live-source-pressure.v1',
  startedAt,
  finishedAt: new Date().toISOString(),
  intervalMs,
  iterations,
  endpointSelection,
  endpointCount: endpoints.length,
  totalRequests,
  totalOk,
  totalErrors: totalRequests - totalOk,
  overallSuccessRate: totalRequests ? totalOk / totalRequests : 0,
  endpointReports,
  samples
};

if (writeOutput) {
  await mkdir(outputDir, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const runPath = join(outputDir, `live-source-pressure-${stamp}.json`);
  await writeFile(runPath, JSON.stringify(report, null, 2));
  await writeFile(latestPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ wrote: relative(root, runPath), latest: relative(root, latestPath) }, null, 2));
}

console.log(
  JSON.stringify(
    {
      ok: report.totalErrors === 0,
      intervalMs,
      iterations,
      endpointCount: endpoints.length,
      totalRequests,
      totalErrors: report.totalErrors,
      endpointReports: endpointReports.map((endpoint) => ({
        id: endpoint.id,
        successRate: endpoint.successRate,
        p95LatencyMs: endpoint.latencyMs.p95,
        uniquePayloadHashes: endpoint.uniquePayloadHashes,
        latestLastModified: endpoint.latestLastModified,
        headline:
          endpoint.id === 'timing'
            ? endpoint.latestSummary?.heartbeat
            : endpoint.id === 'ntt_data_polling'
              ? endpoint.latestSummary
              : undefined
      }))
    },
    null,
    2
  )
);
