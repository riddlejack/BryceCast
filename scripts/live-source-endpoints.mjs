export const bryceRcDriverId = '2143';
export const bryceCarNumber = '9';

export const isIndyNxtTimingHeartbeat = (heartbeat) => {
  if (!heartbeat) return false;
  const series = String(heartbeat?.Series ?? '').trim().toLowerCase();
  const eventName = String(heartbeat?.eventName ?? '').toLowerCase();
  const preamble = String(heartbeat?.preamble ?? '').toLowerCase();
  return series === 'l' || series.includes('nxt') || eventName.includes('indy nxt') || preamble.endsWith('.l');
};

export const isBryceTimingRow = (row, heartbeat) => {
  if (!isIndyNxtTimingHeartbeat(heartbeat)) return false;
  const first = String(row?.firstName ?? '').toLowerCase();
  const last = String(row?.lastName ?? '').toLowerCase();
  const driverId = String(row?.DriverID ?? '');
  const carNumber = String(row?.no ?? '').trim();
  return carNumber === bryceCarNumber && ((first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId);
};

export const isBryceProfile = (driver) => {
  const first = String(driver?.firstname ?? '').toLowerCase();
  const last = String(driver?.lastname ?? '').toLowerCase();
  const driverId = String(driver?.rc_driver_id ?? driver?.driverid ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

export const liveSourceEndpoints = [
  {
    id: 'timing',
    label: 'Timing and scoring',
    series: 'global_active_session',
    cadence: 'fast',
    role: 'primary_timing',
    proxyPath: '/racecontrol/timingscoring-ris.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/timingscoring-ris.json'
  },
  {
    id: 'drivers_nxt',
    label: 'INDY NXT drivers',
    series: 'indy_nxt',
    cadence: 'medium',
    role: 'driver_identity_profile',
    proxyPath: '/racecontrol/driversfeed_nxt.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/driversfeed_nxt.json'
  },
  {
    id: 'config',
    label: 'Race Control config',
    series: 'global_active_session',
    cadence: 'medium',
    role: 'track_map_watch_links_config',
    proxyPath: '/racecontrol/tsconfig.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/tsconfig.json'
  },
  {
    id: 'schedule_nxt',
    label: 'INDY NXT schedule',
    series: 'indy_nxt',
    cadence: 'slow',
    role: 'schedule_broadcast_grid_context',
    proxyPath: '/racecontrol/schedulefeed_nxt.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json'
  },
  {
    id: 'trackactivity_nxt',
    label: 'INDY NXT track activity',
    series: 'indy_nxt',
    cadence: 'slow',
    role: 'session_route_results_context',
    proxyPath: '/racecontrol/trackactivityleaderboardfeed_nxt.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json'
  },
  {
    id: 'ntt_data_polling',
    label: 'NTT prediction data',
    series: 'ntt_indycar',
    cadence: 'candidate',
    role: 'pit_prediction_candidate',
    proxyPath: '/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json',
    url: 'https://indycar.blob.core.windows.net/ntt-data/INDYCAR_DATA_POLLING/data_polling_blob.json'
  },
  {
    id: 'drivers_top',
    label: 'NTT INDYCAR drivers',
    series: 'ntt_indycar',
    cadence: 'medium',
    role: 'wrong_series_guard_reference',
    proxyPath: '/racecontrol/driversfeed.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/driversfeed.json'
  },
  {
    id: 'schedule_top',
    label: 'NTT INDYCAR schedule',
    series: 'ntt_indycar',
    cadence: 'slow',
    role: 'wrong_series_guard_reference',
    proxyPath: '/racecontrol/schedulefeed.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed.json'
  },
  {
    id: 'trackactivity_top',
    label: 'NTT INDYCAR track activity',
    series: 'ntt_indycar',
    cadence: 'slow',
    role: 'wrong_series_guard_reference',
    proxyPath: '/racecontrol/trackactivityleaderboardfeed.json',
    url: 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed.json'
  }
];

export const raceSnapshotEndpointIds = ['timing', 'drivers_nxt', 'config', 'schedule_nxt', 'trackactivity_nxt'];

export const raceSnapshotEndpoints = liveSourceEndpoints.filter((endpoint) => raceSnapshotEndpointIds.includes(endpoint.id));
