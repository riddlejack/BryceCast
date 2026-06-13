import { isBryceProfile, isBryceTimingRow, liveSourceEndpoints } from './live-source-endpoints.mjs';

const endpoints = liveSourceEndpoints;
const fetchTimeoutMs = Number(process.argv.find((arg) => arg.startsWith('--timeout-ms='))?.slice('--timeout-ms='.length) ?? '5000');

const readJson = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
  try {
    const response = await fetch(`${url}?t=${Date.now()}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        origin: 'http://localhost:5173'
      }
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}

    return {
      ok: response.ok,
      status: response.status,
      type: response.headers.get('content-type'),
      allowOrigin: response.headers.get('access-control-allow-origin'),
      lastModified: response.headers.get('last-modified'),
      etag: response.headers.get('etag'),
      bytes: text.length,
      json
    };
  } finally {
    clearTimeout(timeout);
  }
};

const summarize = (id, result) => {
  if (!result.json) return {};

  if (id === 'timing') {
    const timing = result.json.timing_results ?? {};
    const bryce = (timing.Item ?? []).find((row) => isBryceTimingRow(row, timing.heartbeat));
    return {
      event: timing.heartbeat?.eventName,
      flag: timing.heartbeat?.currentFlag,
      lap: `${timing.heartbeat?.lapNumber}/${timing.heartbeat?.totalLaps}`,
      rowCount: timing.Item?.length ?? 0,
      bryce: bryce
        ? {
            rank: bryce.rank,
            start: bryce.startPosition,
            status: bryce.status,
            bestLapTime: bryce.bestLapTime,
            radioNo: bryce.no
          }
        : null
    };
  }

  if (id === 'drivers_nxt') {
    const drivers = result.json.drivers?.driver ?? [];
    const bryce = drivers.find(isBryceProfile);
    return {
      driverCount: drivers.length,
      bryce: bryce
        ? {
            driverid: bryce.driverid,
            rc_driver_id: bryce.rc_driver_id,
            team: bryce.team,
            radiofrequency: bryce.radiofrequency,
            points: bryce.stats?.points
          }
        : null
    };
  }

  if (id === 'config') {
    return {
      trackMapUrl: result.json.track_map_url,
      watchLinks: (result.json.ways_to_watch ?? []).filter((item) => item.show).map((item) => item.text)
    };
  }

  if (id === 'ntt_data_polling') {
    const rows = Array.isArray(result.json) ? result.json : [];
    return {
      rowCount: rows.length,
      datasets: [...new Set(rows.map((row) => row.Dataset).filter(Boolean))],
      latestDatetime: rows.map((row) => row.Datetime).filter(Boolean).sort().at(-1) ?? null,
      sampleKeys: Object.keys(rows[0] ?? {}).slice(0, 20)
    };
  }

  return {
    topKeys: Object.keys(result.json).slice(0, 5)
  };
};

const main = async () => {
  const output = [];

  for (const endpoint of endpoints) {
    try {
      const result = await readJson(endpoint.url);
      output.push({
        id: endpoint.id,
        label: endpoint.label,
        series: endpoint.series,
        cadence: endpoint.cadence,
        role: endpoint.role,
        proxyPath: endpoint.proxyPath,
        url: endpoint.url,
        ok: result.ok,
        status: result.status,
        contentType: result.type,
        allowOrigin: result.allowOrigin,
        lastModified: result.lastModified,
        etag: result.etag,
        bytes: result.bytes,
        summary: summarize(endpoint.id, result)
      });
    } catch (error) {
      output.push({
        id: endpoint.id,
        label: endpoint.label,
        url: endpoint.url,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), endpoints: output }, null, 2));
};

main();
