const endpoints = [
  ['timing', 'https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json'],
  ['drivers_nxt', 'https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json'],
  ['config', 'https://indycar.blob.core.windows.net/racecontrol/tsconfig.json'],
  ['schedule_nxt', 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json'],
  ['trackactivity_nxt', 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json']
];

const bryceRcDriverId = '2143';

const isBryceTimingRow = (row) => {
  const first = String(row?.firstName ?? '').toLowerCase();
  const last = String(row?.lastName ?? '').toLowerCase();
  const driverId = String(row?.DriverID ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const isBryceProfile = (driver) => {
  const first = String(driver?.firstname ?? '').toLowerCase();
  const last = String(driver?.lastname ?? '').toLowerCase();
  const driverId = String(driver?.rc_driver_id ?? driver?.driverid ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const readJson = async (url) => {
  const response = await fetch(`${url}?t=${Date.now()}`, {
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
};

const summarize = (id, result) => {
  if (!result.json) return {};

  if (id === 'timing') {
    const timing = result.json.timing_results ?? {};
    const bryce = (timing.Item ?? []).find(isBryceTimingRow);
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

  return {
    topKeys: Object.keys(result.json).slice(0, 5)
  };
};

const main = async () => {
  const output = [];

  for (const [id, url] of endpoints) {
    try {
      const result = await readJson(url);
      output.push({
        id,
        url,
        ok: result.ok,
        status: result.status,
        contentType: result.type,
        allowOrigin: result.allowOrigin,
        lastModified: result.lastModified,
        etag: result.etag,
        bytes: result.bytes,
        summary: summarize(id, result)
      });
    } catch (error) {
      output.push({
        id,
        url,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), endpoints: output }, null, 2));
};

main();
