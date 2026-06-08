import { seedBroadcastRoute, seedBryceProfile, seedSnapshot, sourceUrls } from './seed';
import { loadApiJson } from './api';
import type { BroadcastNetwork, BroadcastSessionRoute, DriverProfile, RaceHeartbeat, RaceSnapshot, SourceProbe, SourceState, TimingRow } from './types';

interface TimingPayload {
  timing_results?: {
    heartbeat?: RaceHeartbeat;
    Item?: TimingRow[];
  };
}

interface DriversPayload {
  drivers?: {
    driver?: DriverProfile[];
  };
}

interface ConfigPayload {
  track_map_url?: string;
  ways_to_watch?: WatchLinkPayload[];
}

interface WatchLinkPayload {
  show?: boolean;
  url?: string;
  text?: string;
  image?: {
    source?: string;
    alt?: string;
  };
}

interface NetworkPayload {
  id?: string;
  name?: string;
  url?: string;
  logo_image_positive?: string;
  logo_image_negative?: string;
}

interface ActivitySessionPayload {
  sessionid?: string;
  sessionlabel?: string;
  sessiontype?: string;
  startdatetime?: string;
  enddatetime?: string;
  estimatedgreenflag?: string;
  broadcastnetworkid?: string;
  broadcastnetworkname?: string;
  networks?: {
    network?: NetworkPayload | NetworkPayload[];
  };
}

interface ActivityEventPayload {
  eventid?: string;
  eventname?: string;
  sessions?: {
    session?: ActivitySessionPayload | ActivitySessionPayload[];
  };
}

interface TrackActivityPayload {
  trackactivity?: {
    event?: ActivityEventPayload | ActivityEventPayload[];
  };
}

interface ScheduleBroadcastPayload {
  name?: string;
  start?: string;
  end?: string;
  networks?: {
    network?: NetworkPayload | NetworkPayload[];
  };
}

interface ScheduleRacePayload {
  eventid?: string;
  name?: string;
  tv?: {
    listing?: {
      datetime?: string;
      channel?: string;
      channel_logo_positive?: string;
      channel_logo_negative?: string;
      programname?: string;
    };
  };
  broadcasts?: {
    broadcast?: ScheduleBroadcastPayload | ScheduleBroadcastPayload[];
  };
}

interface SchedulePayload {
  schedule?: {
    race?: ScheduleRacePayload | ScheduleRacePayload[];
  };
}

const jsonFetch = async <T>(url: string): Promise<T> => {
  const separator = url.includes('?') ? '&' : '?';
  const response = await fetch(`${url}${separator}t=${Date.now()}`, {
    headers: { accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
};

const sourceProbe = (id: string, label: string, url: string, state: SourceProbe['state'], note: string): SourceProbe => ({
  id,
  label,
  url,
  state,
  note
});

const resultValue = <T>(result: PromiseSettledResult<T>) => (result.status === 'fulfilled' ? result.value : undefined);

const resultMessage = (result: PromiseSettledResult<unknown>) =>
  result.status === 'rejected' && result.reason instanceof Error ? result.reason.message : 'Unavailable.';

const sessionSourceState = (heartbeat: RaceHeartbeat): SourceState => {
  const flags = `${heartbeat.currentFlag} ${heartbeat.SessionStatus} ${heartbeat.SessionType}`.toUpperCase();
  const lap = Number(heartbeat.lapNumber);
  const totalLaps = Number(heartbeat.totalLaps);
  const completedRace = Number.isFinite(lap) && Number.isFinite(totalLaps) && totalLaps > 0 && lap >= totalLaps;

  if (flags.includes('COLD') || flags.includes('CHECKER') || flags.includes('COMPLETE') || completedRace) {
    return 'cold';
  }

  return 'live';
};

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const bryceRcDriverId = '2143';

const isBryceTimingRow = (row: TimingRow) => {
  const first = row.firstName?.toLowerCase() ?? '';
  const last = row.lastName?.toLowerCase() ?? '';
  const driverId = String(row.DriverID ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const isBryceProfile = (driver: DriverProfile) => {
  const first = driver.firstname?.toLowerCase() ?? '';
  const last = driver.lastname?.toLowerCase() ?? '';
  const driverId = String(driver.rc_driver_id ?? driver.driverid ?? '');
  return (first === 'bryce' && last === 'aron') || driverId === bryceRcDriverId;
};

const describeBryceMiss = (heartbeat: RaceHeartbeat | undefined, timingRows: TimingRow[]) => {
  const carNine = timingRows.find((row) => row.no === '9');
  const event = heartbeat?.eventName ? ` at ${heartbeat.eventName}` : '';
  const series = heartbeat?.Series ? `Series ${heartbeat.Series}` : 'unknown series';
  const carNineNote = carNine ? ' A different car #9 exists in that feed.' : '';
  return `Current Race Control timing feed is ${series}${event} and does not contain Bryce Aron.${carNineNote}`;
};

const networkKind = (name: string): BroadcastNetwork['kind'] => {
  const normalized = name.toLowerCase();
  if (normalized.includes('radio') || normalized.includes('sirius')) return 'audio';
  if (normalized.includes('indycar live')) return 'international';
  if (normalized.includes('app')) return 'app';
  if (normalized.includes('fs1') || normalized.includes('fs2') || normalized.includes('fox')) return 'video';
  return 'fallback';
};

const normalizeNetwork = (network: NetworkPayload, fallbackIndex: number): BroadcastNetwork | null => {
  const name = network.name?.trim();
  const url = network.url?.trim();
  if (!name || !url) return null;
  return {
    id: network.id ?? `${name}-${fallbackIndex}`,
    name,
    url,
    logoPositive: network.logo_image_positive,
    logoNegative: network.logo_image_negative,
    kind: networkKind(name)
  };
};

const normalizeWatchLink = (link: WatchLinkPayload, fallbackIndex: number): BroadcastNetwork | null => {
  const name = link.image?.alt?.trim() || link.text?.trim();
  const url = link.url?.trim();
  if (!name || !url) return null;
  return {
    id: `config-${fallbackIndex}-${name}`,
    name,
    url,
    logoPositive: link.image?.source,
    kind: networkKind(name)
  };
};

const routeFromNetworks = ({
  heartbeat,
  eventName,
  sessionName,
  sessionType,
  startsAt,
  endsAt,
  estimatedGreenFlag,
  source,
  note,
  networks
}: {
  heartbeat: RaceHeartbeat;
  eventName: string;
  sessionName: string;
  sessionType: string;
  startsAt: string;
  endsAt?: string;
  estimatedGreenFlag?: string;
  source: BroadcastSessionRoute['source'];
  note: string;
  networks: BroadcastNetwork[];
}): BroadcastSessionRoute => {
  const unique = networks.filter((network, index, all) => all.findIndex((candidate) => candidate.name === network.name && candidate.url === network.url) === index);
  const priority = ['FS1', 'FOX', 'FS2', 'Fox One', 'INDYCAR LIVE'];
  const priorityIndex = (network: BroadcastNetwork) => {
    const index = priority.findIndex((name) => network.name.includes(name));
    return index === -1 ? 99 : index;
  };
  const video = unique
    .filter((network) => network.kind === 'video')
    .sort((left, right) => priorityIndex(left) - priorityIndex(right));
  const primaryVideo = video[0];

  return {
    eventId: heartbeat.EventID,
    sessionId: heartbeat.EventSessionID,
    eventName,
    sessionName,
    sessionType,
    startsAt,
    endsAt,
    estimatedGreenFlag,
    primaryVideo,
    alternates: unique.filter((network) => network.kind !== 'audio' && network.kind !== 'international' && network !== primaryVideo),
    audio: unique.filter((network) => network.kind === 'audio'),
    international: unique.filter((network) => network.kind === 'international'),
    source,
    note
  };
};

const buildTrackActivityRoute = (payload: TrackActivityPayload | undefined, heartbeat: RaceHeartbeat): BroadcastSessionRoute | null => {
  const event = asArray(payload?.trackactivity?.event).find((candidate) => String(candidate.eventid) === String(heartbeat.EventID));
  const session = asArray(event?.sessions?.session).find((candidate) => String(candidate.sessionid) === String(heartbeat.EventSessionID));
  if (!event || !session) return null;

  const networks = asArray(session.networks?.network)
    .map((network, index) => normalizeNetwork(network, index))
    .filter((network): network is BroadcastNetwork => Boolean(network));

  if (networks.length === 0) return null;

  return routeFromNetworks({
    heartbeat,
    eventName: event.eventname ?? heartbeat.eventName,
    sessionName: session.sessionlabel ?? heartbeat.SessionName,
    sessionType: session.sessiontype ?? heartbeat.SessionType,
    startsAt: session.startdatetime ?? '',
    endsAt: session.enddatetime,
    estimatedGreenFlag: session.estimatedgreenflag,
    source: 'trackactivity',
    note: `Matched current EventSessionID ${heartbeat.EventSessionID} from track activity.`,
    networks
  });
};

const buildScheduleRoute = (payload: SchedulePayload | undefined, heartbeat: RaceHeartbeat): BroadcastSessionRoute | null => {
  const race = asArray(payload?.schedule?.race).find((candidate) => String(candidate.eventid) === String(heartbeat.EventID));
  if (!race) return null;

  const broadcasts = asArray(race.broadcasts?.broadcast);
  const sessionBroadcast =
    broadcasts.find((broadcast) => broadcast.name?.toLowerCase().includes(heartbeat.SessionName.toLowerCase())) ??
    broadcasts.find((broadcast) => broadcast.name?.toLowerCase().includes(heartbeat.SessionType.toLowerCase())) ??
    broadcasts[0];
  const listing = race.tv?.listing;
  const broadcastNetworks = asArray(sessionBroadcast?.networks?.network)
    .map((network, index) => normalizeNetwork(network, index))
    .filter((network): network is BroadcastNetwork => Boolean(network));
  const listingNetwork =
    listing?.channel && listing.datetime
      ? {
          id: `listing-${listing.channel}`,
          name: listing.channel,
          url: listing.channel.toUpperCase() === 'FS2' ? 'https://www.foxsports.com/live/fs2' : 'https://www.foxsports.com/live/fs1',
          logoPositive: listing.channel_logo_positive,
          logoNegative: listing.channel_logo_negative,
          kind: networkKind(listing.channel)
        }
      : null;
  const networks = listingNetwork ? [listingNetwork, ...broadcastNetworks] : broadcastNetworks;
  if (networks.length === 0) return null;

  return routeFromNetworks({
    heartbeat,
    eventName: race.name ?? heartbeat.eventName,
    sessionName: sessionBroadcast?.name ?? listing?.programname ?? heartbeat.SessionName,
    sessionType: heartbeat.SessionType,
    startsAt: sessionBroadcast?.start ?? listing?.datetime ?? '',
    endsAt: sessionBroadcast?.end,
    source: 'schedule',
    note: `Matched EventID ${heartbeat.EventID} from schedule feed.`,
    networks
  });
};

const buildConfigRoute = (payload: ConfigPayload | undefined, heartbeat: RaceHeartbeat): BroadcastSessionRoute => {
  const networks = (payload?.ways_to_watch ?? [])
    .filter((link) => link.show !== false)
    .map((link, index) => normalizeWatchLink(link, index))
    .filter((network): network is BroadcastNetwork => Boolean(network));

  return routeFromNetworks({
    heartbeat,
    eventName: heartbeat.eventName,
    sessionName: heartbeat.SessionName,
    sessionType: heartbeat.SessionType,
    startsAt: '',
    source: networks.length ? 'config' : 'seed',
    note: networks.length ? 'Using generic Race Control watch links because no session route matched.' : seedBroadcastRoute.note,
    networks: networks.length ? networks : [seedBroadcastRoute.primaryVideo!, ...seedBroadcastRoute.alternates, ...seedBroadcastRoute.audio, ...seedBroadcastRoute.international]
  });
};

export const loadRaceSnapshot = async (): Promise<RaceSnapshot> => {
  const apiSnapshot = await loadApiJson<RaceSnapshot>('/api/snapshot');
  if (apiSnapshot?.heartbeat && Array.isArray(apiSnapshot.timingRows) && apiSnapshot.bryce) {
    return apiSnapshot;
  }

  const probes: SourceProbe[] = [];

  try {
    const [timingResult, driversResult, configResult, scheduleResult, trackActivityResult] = await Promise.allSettled([
      jsonFetch<TimingPayload>(sourceUrls.timing),
      jsonFetch<DriversPayload>(sourceUrls.drivers),
      jsonFetch<ConfigPayload>(sourceUrls.config),
      jsonFetch<SchedulePayload>(sourceUrls.schedule),
      jsonFetch<TrackActivityPayload>(sourceUrls.trackActivity)
    ]);

    const timingPayload = resultValue(timingResult);
    const driversPayload = resultValue(driversResult);
    const configPayload = resultValue(configResult);
    const schedulePayload = resultValue(scheduleResult);
    const trackActivityPayload = resultValue(trackActivityResult);
    const timingRows = timingPayload?.timing_results?.Item ?? [];
    const heartbeat = timingPayload?.timing_results?.heartbeat;
    const bryce = timingRows.find(isBryceTimingRow);
    const bryceProfile = driversPayload?.drivers?.driver?.find(isBryceProfile) ?? seedBryceProfile;
    const sourceState: SourceState = heartbeat ? sessionSourceState(heartbeat) : 'error';

    probes.push(
      timingResult.status === 'fulfilled'
        ? sourceProbe('timing', 'Timing and scoring', sourceUrls.timing, sourceState, `${timingRows.length} timing rows loaded; session ${heartbeat?.currentFlag ?? 'unknown'}.`)
        : sourceProbe('timing', 'Timing and scoring', sourceUrls.timing, 'error', resultMessage(timingResult)),
      driversResult.status === 'fulfilled'
        ? sourceProbe('drivers', 'INDY NXT drivers', sourceUrls.drivers, 'live', `Bryce profile ${bryceProfile.radiofrequency ? 'with radio frequency' : 'loaded'}.`)
        : sourceProbe('drivers', 'INDY NXT drivers', sourceUrls.drivers, 'seed', `Using seeded Bryce profile. ${resultMessage(driversResult)}`),
      configResult.status === 'fulfilled'
        ? sourceProbe('config', 'Race Control config', sourceUrls.config, configPayload?.track_map_url ? 'live' : 'stale', configPayload?.track_map_url ? 'Track map URL found.' : 'Config loaded without map.')
        : sourceProbe('config', 'Race Control config', sourceUrls.config, 'seed', `Using seeded track map. ${resultMessage(configResult)}`),
      scheduleResult.status === 'fulfilled'
        ? sourceProbe('schedule', 'INDY NXT schedule', sourceUrls.schedule, 'live', 'Schedule feed loaded for session broadcast routing.')
        : sourceProbe('schedule', 'INDY NXT schedule', sourceUrls.schedule, 'seed', `Using fallback broadcast links. ${resultMessage(scheduleResult)}`),
      trackActivityResult.status === 'fulfilled'
        ? sourceProbe('trackactivity', 'INDY NXT track activity', sourceUrls.trackActivity, 'live', 'Track activity feed loaded for EventSessionID routing.')
        : sourceProbe('trackactivity', 'INDY NXT track activity', sourceUrls.trackActivity, 'seed', `Using fallback broadcast links. ${resultMessage(trackActivityResult)}`)
    );

    if (!heartbeat || !bryce || timingRows.length === 0) {
      throw new Error(heartbeat && timingRows.length > 0 && !bryce ? describeBryceMiss(heartbeat, timingRows) : 'Race Control payload loaded but Bryce row or heartbeat was missing.');
    }

    return {
      heartbeat,
      timingRows: timingRows.sort((a, b) => Number(a.rank) - Number(b.rank)),
      bryce,
      bryceProfile,
      trackMapUrl: configPayload?.track_map_url ?? seedSnapshot.trackMapUrl,
      broadcastRoute:
        buildTrackActivityRoute(trackActivityPayload, heartbeat) ??
        buildScheduleRoute(schedulePayload, heartbeat) ??
        buildConfigRoute(configPayload, heartbeat),
      updatedAt: new Date().toISOString(),
      sourceState,
      sourceProbes: probes
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown adapter failure';

    return {
      ...seedSnapshot,
      updatedAt: new Date().toISOString(),
      sourceState: 'seed',
      sourceProbes: [
        sourceProbe('timing', 'Timing and scoring', sourceUrls.timing, 'error', message),
        sourceProbe('drivers', 'INDY NXT drivers', sourceUrls.drivers, 'seed', 'Using seeded Bryce profile.'),
        sourceProbe('config', 'Race Control config', sourceUrls.config, 'seed', 'Using seeded track map.')
      ]
    };
  }
};

export const buildAlerts = (snapshot: RaceSnapshot) => {
  const { bryce, heartbeat } = snapshot;
  const start = Number(bryce.startPosition);
  const rank = Number(bryce.rank);
  const gain = Number.isFinite(start) && Number.isFinite(rank) ? start - rank : 0;
  const now = new Date(snapshot.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return [
    {
      tone: bryce.status === 'DNF' ? 'red' : gain > 0 ? 'green' : gain < 0 ? 'amber' : 'neutral',
      title: bryce.status === 'DNF' ? 'Bryce stopped early' : gain > 0 ? `Bryce up ${gain}` : gain < 0 ? `Bryce down ${Math.abs(gain)}` : 'Bryce holding station',
      detail: bryce.comment || `Started P${bryce.startPosition}, currently P${bryce.rank}.`,
      stamp: now
    },
    {
      tone: 'cyan',
      title: `Lap ${heartbeat.lapNumber} of ${heartbeat.totalLaps}`,
      detail: `${heartbeat.currentFlag} at ${heartbeat.trackName}.`,
      stamp: now
    },
    {
      tone: 'green',
      title: `Best lap ${bryce.bestLapTime}`,
      detail: `Lap ${bryce.bestLap}, ${bryce.BestSpeed} mph.`,
      stamp: now
    },
    {
      tone: bryce.Passed > bryce.Passes ? 'amber' : 'green',
      title: `${bryce.Passes} passes, ${bryce.Passed} times passed`,
      detail: `Net racecraft delta ${bryce.Passes - bryce.Passed}.`,
      stamp: now
    }
  ] as const;
};
