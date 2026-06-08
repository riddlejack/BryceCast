import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Activity,
  Antenna,
  BadgeAlert,
  BarChart3,
  Bell,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Database,
  ExternalLink,
  Gauge,
  LayoutDashboard,
  Map,
  MonitorUp,
  Radio,
  RefreshCw,
  Satellite,
  Settings,
  ShieldCheck,
  Smartphone,
  Trophy,
  Tv,
  Video
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { shouldUseApi } from './data/api';
import { buildAlerts, loadRaceSnapshot } from './data/adapters';
import { audioGateCopy, audioSources, audioStatuses, loadAudioState, loadRemoteAudioState, saveAudioState, saveRemoteAudioState } from './data/audio';
import { loadSeasonHistory } from './data/history';
import { loadBryceReplay, loadOnboardCatalogSnapshot, loadRaceLogSnapshot } from './data/localLog';
import {
  livePovDefinition,
  loadPovState,
  loadRemotePovState,
  povEscalationLanes,
  povGateCopy,
  povSources,
  povStatuses,
  roadAmericaChecklist,
  savePovState,
  saveRemotePovState
} from './data/pov';
import { seedSnapshot, sourceUrls } from './data/seed';
import type {
  AudioState,
  BryceReplayPayload,
  BroadcastNetwork,
  BroadcastSessionRoute,
  OnboardCatalogSnapshot,
  PovState,
  RaceLogSnapshot,
  RaceSnapshot,
  SeasonHistoryPayload,
  SourceState,
  TimingRow
} from './data/types';

type Mode = 'tv' | 'engineer' | 'companion' | 'sources' | 'ops';
type ReadinessTone = 'green' | 'amber' | 'red';
type ReadinessRow = {
  label: string;
  tone: ReadinessTone;
  value: string;
  detail: string;
  isAccessGate?: boolean;
};
type RaceReadiness = {
  rows: ReadinessRow[];
  operationalBlockers: ReadinessRow[];
  headlineTone: ReadinessTone;
  headline: string;
  detail: string;
};
type PovStateUpdate = PovState | ((current: PovState) => PovState);
type AudioStateUpdate = AudioState | ((current: AudioState) => AudioState);

const modeMeta: Record<Mode, { label: string; icon: typeof Tv }> = {
  tv: { label: 'TV Mode', icon: Tv },
  engineer: { label: 'Engineer', icon: LayoutDashboard },
  companion: { label: 'Phone', icon: Smartphone },
  sources: { label: 'Sources', icon: Satellite },
  ops: { label: 'Race Ops', icon: Settings }
};
const modeOrder: Mode[] = ['tv', 'engineer', 'companion', 'sources', 'ops'];

const formatTrackType = (trackType: string) => {
  if (trackType === 'O') return 'Oval';
  if (trackType === 'R') return 'Road';
  if (trackType === 'S') return 'Street';
  return trackType || 'Unknown';
};

const formatSourceState = (state: SourceState) => {
  if (state === 'live') return 'Hot';
  if (state === 'cold') return 'Cold';
  if (state === 'stale') return 'Stale';
  if (state === 'error') return 'Error';
  return 'Seed';
};

const rowName = (row: TimingRow) => `${row.firstName} ${row.lastName}`;

const routeSourceLabel: Record<BroadcastSessionRoute['source'], string> = {
  trackactivity: 'Track activity',
  schedule: 'Schedule',
  config: 'Config fallback',
  seed: 'Seed fallback'
};

const sourceModeCopy = (snapshot: RaceSnapshot) => {
  if (snapshot.sourceState === 'live') {
    return {
      heading: 'Race Control timing connected',
      body: 'BryceCast is reading normalized live Race Control data through the local API service. Bryce timing is source-backed and current for the active session.',
      tone: shouldUseApi ? 'API mode' : 'Direct feed mode'
    };
  }
  if (snapshot.sourceState === 'stale') {
    return {
      heading: 'Bryce timing using archived NXT data',
      body: 'The current Race Control timing feed does not contain Bryce Aron, so BryceCast is holding the latest archived INDY NXT Bryce sample and labeling it stale.',
      tone: 'Stale guard active'
    };
  }
  if (snapshot.sourceState === 'cold') {
    return {
      heading: 'Race Control session is cold',
      body: 'The official session is complete or inactive. Current timing remains source-backed, but it should be read as post-session state.',
      tone: 'Cold session'
    };
  }
  if (snapshot.sourceState === 'seed') {
    return {
      heading: 'Demo seed fallback active',
      body: 'Live or archived Race Control data is unavailable. Seed data keeps the layout inspectable, but this state fails race-day readiness.',
      tone: 'Demo only'
    };
  }
  return {
    heading: 'Timing source unavailable',
    body: 'BryceCast could not load a trusted timing source. Use Sources mode to inspect the failing adapter before treating any race data as live.',
    tone: 'Error'
  };
};

const formatRouteWindow = (route: BroadcastSessionRoute) => {
  if (!route.startsAt && !route.estimatedGreenFlag) return 'Window pending';
  if (route.estimatedGreenFlag) return `Green ${route.estimatedGreenFlag}`;
  return `Starts ${route.startsAt}`;
};

const providerFallbacks = (primary?: BroadcastNetwork): BroadcastNetwork[] => {
  if (!primary || !['FS1', 'FS2', 'FOX', 'Fox One'].some((name) => primary.name.includes(name))) return [];
  return [
    { id: 'provider-hulu', name: 'Hulu Live TV', url: sourceUrls.hulu, kind: 'fallback' },
    { id: 'provider-xfinity', name: 'Xfinity Stream', url: sourceUrls.xfinity, kind: 'fallback' }
  ];
};

const uniqueNetworks = (networks: BroadcastNetwork[]) =>
  networks.filter((network, index, all) => all.findIndex((candidate) => candidate.name === network.name && candidate.url === network.url) === index);

const metric = (label: string, value: string | number, detail: string, tone: 'cyan' | 'green' | 'amber' | 'red' | 'white' = 'white') => (
  <div className={`metric-card tone-${tone}`}>
    <span>{label}</span>
    <strong>{value}</strong>
    <small>{detail}</small>
  </div>
);

const formatTimestamp = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatAge = (seconds?: number | null) => {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return 'age unknown';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
};

const ageSecondsFrom = (value?: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 1000)) : null;
};

const formatRank = (value: number | null | undefined) => (value === null || value === undefined ? '-' : `P${value}`);
const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const averageNumber = (values: number[]) => {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
};

const formatAverage = (value: number | null, digits = 1) => (value === null || !Number.isFinite(value) ? '-' : value.toFixed(digits));
const formatSignedAverage = (value: number | null, digits = 1) => (value === null || !Number.isFinite(value) ? '-' : formatSigned(Number(value.toFixed(digits))));

const getRaceReadiness = ({
  snapshot,
  raceLog,
  onboardCatalog,
  povState,
  audioState
}: {
  snapshot: RaceSnapshot;
  raceLog: RaceLogSnapshot | null;
  onboardCatalog: OnboardCatalogSnapshot | null;
  povState: PovState;
  audioState: AudioState;
}): RaceReadiness => {
  const povGate = povGateCopy(povState);
  const audioGate = audioGateCopy(audioState);
  const raceLogAge = ageSecondsFrom(raceLog?.checkedAt);
  const catalogAge = ageSecondsFrom(onboardCatalog?.checkedAt);
  const routeIsOperational = Boolean(snapshot.broadcastRoute.primaryVideo) && snapshot.broadcastRoute.source !== 'seed';
  const loggerTone: ReadinessTone = !raceLog ? 'red' : raceLogAge !== null && raceLogAge < 120 ? 'green' : 'amber';
  const timingTone: ReadinessTone = snapshot.sourceState === 'live' ? 'green' : snapshot.sourceState === 'cold' || snapshot.sourceState === 'stale' ? 'amber' : 'red';
  const catalogTone: ReadinessTone = !onboardCatalog ? 'amber' : catalogAge !== null && catalogAge < 1800 ? 'green' : 'amber';
  const audioTone: ReadinessTone =
    audioGate.acceptance === 'bryce_passing' || audioGate.acceptance === 'race_audio_passing'
      ? 'green'
      : audioGate.acceptance === 'metadata_only'
        ? 'amber'
        : 'red';
  const rows: ReadinessRow[] = [
    {
      label: 'Bryce identity',
      tone: rowName(snapshot.bryce) === 'Bryce Aron' ? 'green' : 'red',
      value: rowName(snapshot.bryce),
      detail: `DriverID ${snapshot.bryce.DriverID ?? 'from archived NXT profile'}; car #${snapshot.bryce.no}.`
    },
    {
      label: 'Timing mode',
      tone: timingTone,
      value: formatSourceState(snapshot.sourceState),
      detail: `${snapshot.heartbeat.currentFlag || 'Flag pending'} at ${snapshot.heartbeat.eventName}.`
    },
    {
      label: 'Session route',
      tone: routeIsOperational ? 'green' : snapshot.broadcastRoute.source === 'config' ? 'amber' : 'red',
      value: snapshot.broadcastRoute.primaryVideo?.name ?? 'Route pending',
      detail: `${routeSourceLabel[snapshot.broadcastRoute.source]} source for ${snapshot.broadcastRoute.sessionName}.`
    },
    {
      label: 'Local archive',
      tone: loggerTone,
      value: raceLog ? `${raceLog.endpoints.filter((endpoint) => endpoint.ok).length}/${raceLog.endpoints.length} feeds` : 'Missing',
      detail: raceLog ? `Last sample ${formatAge(raceLogAge)}; ${raceLog.sessionKey}.` : 'Race logger has no persisted sample.'
    },
    {
      label: 'Catalog evidence',
      tone: catalogTone,
      value: onboardCatalog ? catalogStatusCopy(onboardCatalog).label : 'Not captured',
      detail: onboardCatalog ? `Checked ${formatAge(catalogAge)}; ${onboardCatalog.counts.strictBryceMatches} strict Bryce matches.` : 'Run the official catalog check during live windows.'
    },
    {
      label: 'Live POV gate',
      tone: povGate.acceptance === 'passing' ? 'green' : 'amber',
      value: povGate.label,
      detail: povGate.acceptance === 'passing' ? 'Same-race live proof is complete.' : 'Access-gated exception; all other surfaces continue operating.',
      isAccessGate: true
    },
    {
      label: 'Audio gate',
      tone: audioTone,
      value: audioGate.label,
      detail: audioGate.acceptance === 'metadata_only' ? 'Frequency metadata is logged; isolated live audio still needs proof.' : audioGate.detail,
      isAccessGate: true
    }
  ];
  const operationalBlockers = rows.filter((row) => row.tone === 'red' && !row.isAccessGate);
  const headlineTone: ReadinessTone = operationalBlockers.length ? 'red' : rows.some((row) => row.tone === 'amber') ? 'amber' : 'green';
  const headline =
    headlineTone === 'green'
      ? 'Race room ready'
      : headlineTone === 'amber'
        ? 'Race room ready with gates'
        : `${operationalBlockers.length} blocker${operationalBlockers.length > 1 ? 's' : ''}`;
  const detail = operationalBlockers.length
    ? operationalBlockers.map((row) => row.label).join(', ')
    : rows
        .filter((row) => row.tone === 'amber')
        .map((row) => row.label)
        .join(', ') || 'All readiness checks green';

  return { rows, operationalBlockers, headlineTone, headline, detail };
};

function useRaceSnapshot() {
  const [snapshot, setSnapshot] = useState<RaceSnapshot>(seedSnapshot);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const next = await loadRaceSnapshot();
      setSnapshot(next);
      setLastError(next.sourceState === 'seed' ? next.sourceProbes.find((probe) => probe.state === 'error')?.note ?? null : null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : 'Unknown refresh error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, 15000);
    return () => window.clearInterval(id);
  }, []);

  return { snapshot, loading, lastError, refresh };
}

function useSeasonHistory() {
  const [history, setHistory] = useState<SeasonHistoryPayload | null>(null);

  useEffect(() => {
    let active = true;

    loadSeasonHistory().then((payload) => {
      if (active) {
        setHistory(payload);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return history;
}

function useRaceLogStatus() {
  const [logStatus, setLogStatus] = useState<RaceLogSnapshot | null>(null);

  const refreshLog = async () => {
    const next = await loadRaceLogSnapshot();
    setLogStatus(next);
  };

  useEffect(() => {
    refreshLog();
    const id = window.setInterval(refreshLog, 30000);
    return () => window.clearInterval(id);
  }, []);

  return logStatus;
}

function useOnboardCatalogStatus() {
  const [catalog, setCatalog] = useState<OnboardCatalogSnapshot | null>(null);

  const refreshCatalog = async () => {
    const next = await loadOnboardCatalogSnapshot();
    setCatalog(next);
  };

  useEffect(() => {
    refreshCatalog();
    const id = window.setInterval(refreshCatalog, 30000);
    return () => window.clearInterval(id);
  }, []);

  return catalog;
}

function useBryceReplay() {
  const [replay, setReplay] = useState<BryceReplayPayload | null>(null);

  const refreshReplay = async () => {
    const next = await loadBryceReplay(250);
    setReplay(next);
  };

  useEffect(() => {
    refreshReplay();
    const id = window.setInterval(refreshReplay, 30000);
    return () => window.clearInterval(id);
  }, []);

  return replay;
}

function usePovVerification() {
  const [state, setState] = useState<PovState>(() => loadPovState());

  useEffect(() => {
    let active = true;
    loadRemotePovState().then((remote) => {
      if (active && remote) {
        savePovState(remote);
        setState(remote);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const updateState = (next: PovStateUpdate) => {
    setState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      savePovState(resolved);
      void saveRemotePovState(resolved);
      return resolved;
    });
  };

  return [state, updateState] as const;
}

function useAudioVerification() {
  const [state, setState] = useState<AudioState>(() => loadAudioState());

  useEffect(() => {
    let active = true;
    loadRemoteAudioState().then((remote) => {
      if (active && remote) {
        saveAudioState(remote);
        setState(remote);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const updateState = (next: AudioStateUpdate) => {
    setState((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      saveAudioState(resolved);
      void saveRemoteAudioState(resolved);
      return resolved;
    });
  };

  return [state, updateState] as const;
}

function App() {
  const [mode, setMode] = useState<Mode>('tv');
  const { snapshot, loading, lastError, refresh } = useRaceSnapshot();
  const seasonHistory = useSeasonHistory();
  const raceLog = useRaceLogStatus();
  const onboardCatalog = useOnboardCatalogStatus();
  const bryceReplay = useBryceReplay();
  const [povState, setPovState] = usePovVerification();
  const [audioState, setAudioState] = useAudioVerification();
  const alerts = useMemo(() => buildAlerts(snapshot), [snapshot]);
  const readiness = useMemo(
    () => getRaceReadiness({ snapshot, raceLog, onboardCatalog, povState, audioState }),
    [snapshot, raceLog, onboardCatalog, povState, audioState]
  );
  const modeButton = (key: Mode) => {
    const Icon = modeMeta[key].icon;
    const selected = mode === key;
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = modeOrder.indexOf(key);
      const keyMap: Record<string, Mode | undefined> = {
        ArrowRight: modeOrder[(currentIndex + 1) % modeOrder.length],
        ArrowDown: modeOrder[(currentIndex + 1) % modeOrder.length],
        ArrowLeft: modeOrder[(currentIndex - 1 + modeOrder.length) % modeOrder.length],
        ArrowUp: modeOrder[(currentIndex - 1 + modeOrder.length) % modeOrder.length],
        Home: modeOrder[0],
        End: modeOrder[modeOrder.length - 1]
      };
      const nextMode = keyMap[event.key];
      if (!nextMode) return;
      event.preventDefault();
      setMode(nextMode);
      window.setTimeout(() => document.getElementById(`mode-tab-${nextMode}`)?.focus(), 0);
    };
    return (
      <button
        aria-controls={`mode-panel-${key}`}
        aria-selected={selected}
        className={selected ? 'active' : ''}
        id={`mode-tab-${key}`}
        onClick={() => setMode(key)}
        onKeyDown={handleKeyDown}
        role="tab"
        tabIndex={selected ? 0 : -1}
        type="button"
      >
        <Icon size={16} />
        {modeMeta[key].label}
      </button>
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="mark">9</div>
          <div>
            <h1>BryceCast</h1>
            <p>{snapshot.heartbeat.eventName}</p>
          </div>
        </div>
        <div className="session-strip">
          <div>
            <span>Flag</span>
            <strong>{snapshot.heartbeat.currentFlag}</strong>
          </div>
          <div>
            <span>Lap</span>
            <strong>
              {snapshot.heartbeat.lapNumber}/{snapshot.heartbeat.totalLaps}
            </strong>
          </div>
          <div>
            <span>Track</span>
            <strong>{formatTrackType(snapshot.heartbeat.trackType)}</strong>
          </div>
          <div>
            <span>Timing</span>
            <strong className={`source-${snapshot.sourceState}`}>{formatSourceState(snapshot.sourceState)}</strong>
          </div>
        </div>
        <nav aria-label="BryceCast modes" className="mode-switcher" role="tablist">
          {modeButton('tv')}
          {modeButton('engineer')}
          {modeButton('sources')}
          {modeButton('ops')}
        </nav>
      </header>

      <ReadinessStrip readiness={readiness} />

      {mode === 'tv' && (
        <section id="mode-panel-tv" role="tabpanel" aria-labelledby="mode-tab-tv">
        <TvMode snapshot={snapshot} alerts={alerts} loading={loading} refresh={refresh} seasonHistory={seasonHistory} povState={povState} audioState={audioState} />
        </section>
      )}
      {mode === 'engineer' && (
        <section id="mode-panel-engineer" role="tabpanel" aria-labelledby="mode-tab-engineer">
          <EngineerMode snapshot={snapshot} alerts={alerts} seasonHistory={seasonHistory} replay={bryceReplay} />
        </section>
      )}
      {mode === 'companion' && (
        <section id="mode-panel-companion" role="tabpanel" aria-labelledby="mode-tab-companion">
          <CompanionMode
            snapshot={snapshot}
            alerts={alerts}
            readiness={readiness}
            seasonHistory={seasonHistory}
            povState={povState}
            setPovState={setPovState}
            audioState={audioState}
            setAudioState={setAudioState}
            goToMode={setMode}
          />
        </section>
      )}
      {mode === 'sources' && (
        <section id="mode-panel-sources" role="tabpanel" aria-labelledby="mode-tab-sources">
        <SourcesMode
          snapshot={snapshot}
          lastError={lastError}
          loading={loading}
          refresh={refresh}
          povState={povState}
          setPovState={setPovState}
          raceLog={raceLog}
          onboardCatalog={onboardCatalog}
          audioState={audioState}
          setAudioState={setAudioState}
          readiness={readiness}
        />
        </section>
      )}
      {mode === 'ops' && (
        <section id="mode-panel-ops" role="tabpanel" aria-labelledby="mode-tab-ops">
          <OpsMode snapshot={snapshot} povState={povState} audioState={audioState} raceLog={raceLog} />
        </section>
      )}
    </main>
  );
}

function proofTimestamp() {
  return new Date().toISOString();
}

function CompanionMode({
  snapshot,
  alerts,
  readiness,
  seasonHistory,
  povState,
  setPovState,
  audioState,
  setAudioState,
  goToMode
}: {
  snapshot: RaceSnapshot;
  alerts: ReturnType<typeof buildAlerts>;
  readiness: RaceReadiness;
  seasonHistory: SeasonHistoryPayload | null;
  povState: PovState;
  setPovState: (state: PovStateUpdate) => void;
  audioState: AudioState;
  setAudioState: (state: AudioStateUpdate) => void;
  goToMode: (mode: Mode) => void;
}) {
  const { bryce } = snapshot;
  const posDelta = Number(bryce.startPosition) - Number(bryce.rank);
  const povGate = povGateCopy(povState);
  const audioGate = audioGateCopy(audioState);
  const latest = seasonHistory?.points.at(-1);
  const splitRows = ['Street', 'Road', 'Oval']
    .map((trackType) => {
      const rows = seasonHistory?.points.filter((point) => point.type === trackType) ?? [];
      return {
        trackType,
        starts: rows.length,
        averageFinish: averageNumber(rows.map((point) => point.finish)),
        averageDelta: averageNumber(rows.map((point) => point.start - point.finish))
      };
    })
    .filter((row) => row.starts > 0);
  const quickLinks = uniqueNetworks([
    ...(snapshot.broadcastRoute.primaryVideo ? [snapshot.broadcastRoute.primaryVideo] : []),
    ...providerFallbacks(snapshot.broadcastRoute.primaryVideo),
    ...audioLaunchLinks(snapshot.broadcastRoute)
  ]).slice(0, 4);
  const proofAllDone = <T extends { done: boolean }>(items: T[]) => items.map((item) => ({ ...item, done: true }));

  const markPovAbsent = () => {
    setPovState((current) => ({
      ...current,
      status: 'unavailable',
      verifiedAt: proofTimestamp(),
      liveConfirmedSeconds: 0,
      notes: 'Companion quick log: checked the official selector during the live window and Bryce #9 was absent.',
      proofItems: current.proofItems.map((item) => ({ ...item, done: false }))
    }));
  };

  const recordPovVerified = () => {
    setPovState((current) => ({
      ...current,
      status: 'available',
      source: current.source || 'INDYCAR App',
      verifiedAt: proofTimestamp(),
      selectorLabel: current.selectorLabel || '#9 Bryce Aron',
      evidenceRef: current.evidenceRef || 'companion-live-pov-proof',
      liveConfirmedSeconds: Math.max(current.liveConfirmedSeconds, 60),
      notes: 'Companion quick log: live #9 onboard played for at least 60 seconds during the same race window as the official broadcast.',
      proofItems: proofAllDone(current.proofItems)
    }));
  };

  const recordOfficialAudio = () => {
    setAudioState((current) => ({
      ...current,
      status: 'official_race_audio_available',
      source: 'INDYCAR Radio',
      officialRaceAudioAvailable: true,
      verifiedAt: proofTimestamp(),
      evidenceRef: current.evidenceRef || 'companion-official-audio-proof',
      liveConfirmedSeconds: Math.max(current.liveConfirmedSeconds, 60),
      notes: 'Companion quick log: official race audio is active for the room. Bryce-specific radio still needs separate proof.',
      proofItems: current.proofItems.map((item, index) => ({ ...item, done: item.done || index !== 1 }))
    }));
  };

  const recordBryceRadio = () => {
    setAudioState((current) => ({
      ...current,
      status: 'bryce_radio_available',
      source: 'INDYCAR App',
      selectorLabel: current.selectorLabel || '#9 Bryce Aron radio',
      verifiedAt: proofTimestamp(),
      evidenceRef: current.evidenceRef || 'companion-bryce-radio-proof',
      liveConfirmedSeconds: Math.max(current.liveConfirmedSeconds, 60),
      notes: 'Companion quick log: Bryce-specific radio was selectable and played during the live INDY NXT session.',
      proofItems: proofAllDone(current.proofItems)
    }));
  };

  return (
    <section className="companion-grid">
      <div className="panel companion-hero">
        <div>
          <p>Phone Companion</p>
          <h2>Pocket race desk</h2>
          <span>
            Bryce P{bryce.rank}, {posDelta > 0 ? `+${posDelta}` : posDelta} from start, {snapshot.heartbeat.currentFlag} at {snapshot.heartbeat.eventName}.
          </span>
        </div>
        <div className={`companion-readiness ${readiness.headlineTone}`}>
          <strong>{readiness.headline}</strong>
          <small>{readiness.detail}</small>
        </div>
      </div>

      <div className="panel companion-card companion-status-card">
        <div className="panel-heading compact">
          <div>
            <p>Live Bryce</p>
            <h3>Race pulse</h3>
          </div>
          <Gauge size={20} />
        </div>
        <div className="companion-stat-grid">
          <div>
            <span>Position</span>
            <strong>P{bryce.rank}</strong>
          </div>
          <div>
            <span>Gap</span>
            <strong>{bryce.gap || bryce.diff}</strong>
          </div>
          <div>
            <span>Last lap</span>
            <strong>{bryce.lastLapTime}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{bryce.status}</strong>
          </div>
        </div>
        <div className="companion-links">
          {quickLinks.map((network) => (
            <a href={network.url} key={`${network.id}-${network.name}`} target="_blank" rel="noreferrer">
              {network.name} <ExternalLink size={13} />
            </a>
          ))}
        </div>
      </div>

      <div className="panel companion-card companion-proof-card">
        <div className="panel-heading compact">
          <div>
            <p>Quick Proof</p>
            <h3>POV and radio</h3>
          </div>
          <CheckCircle2 size={20} />
        </div>
        <div className={`pov-status-card ${povGate.tone}`}>
          <strong>{povGate.label}</strong>
          <span>{povState.verifiedAt || 'No POV proof timestamp yet'}</span>
          <p>{povGate.acceptance === 'passing' ? 'Live same-race proof is complete.' : livePovDefinition}</p>
        </div>
        <div className="companion-button-grid">
          <button type="button" onClick={markPovAbsent}>Mark #9 absent</button>
          <button type="button" onClick={recordPovVerified}>Record live #9 verified</button>
          <button type="button" onClick={() => goToMode('sources')}>Open Sources proof console</button>
        </div>
        <div className={`pov-status-card ${audioGate.tone}`}>
          <strong>{audioGate.label}</strong>
          <span>{audioState.verifiedAt || 'No audio proof timestamp yet'}</span>
          <p>{audioGate.detail}</p>
        </div>
        <div className="companion-button-grid">
          <button type="button" onClick={recordOfficialAudio}>Record official audio</button>
          <button type="button" onClick={recordBryceRadio}>Record Bryce radio</button>
          <button type="button" onClick={() => goToMode('ops')}>Open Race Ops</button>
        </div>
      </div>

      <div className="panel companion-card">
        <div className="panel-heading compact">
          <div>
            <p>Moment Feed</p>
            <h3>What matters now</h3>
          </div>
          <Bell size={20} />
        </div>
        <div className="companion-alert-list">
          {alerts.slice(0, 4).map((alert) => (
            <div className={`alert-row ${alert.tone}`} key={alert.title}>
              <span>{alert.stamp}</span>
              <div>
                <strong>{alert.title}</strong>
                <p>{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel companion-card">
        <div className="panel-heading compact">
          <div>
            <p>Compact Season</p>
            <h3>Track-form lens</h3>
          </div>
          <BarChart3 size={20} />
        </div>
        <div className="companion-season-top">
          <div>
            <span>Standing</span>
            <strong>{seasonHistory?.bryceStanding ? `P${seasonHistory.bryceStanding.rank}` : '-'}</strong>
          </div>
          <div>
            <span>Latest</span>
            <strong>{latest ? `${latest.race} P${latest.finish}` : '-'}</strong>
          </div>
        </div>
        <div className="companion-split-list">
          {splitRows.map((row) => (
            <div key={row.trackType}>
              <strong>{row.trackType}</strong>
              <span>{row.starts} starts</span>
              <span>P{formatAverage(row.averageFinish)}</span>
              <small className={(row.averageDelta ?? 0) >= 0 ? 'positive' : 'negative'}>{formatSignedAverage(row.averageDelta)}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="panel companion-card companion-readiness-list">
        <div className="panel-heading compact">
          <div>
            <p>Room Checks</p>
            <h3>Local truth</h3>
          </div>
          <ShieldCheck size={20} />
        </div>
        {readiness.rows
          .filter((row) => ['Timing mode', 'Session route', 'Local archive', 'Live POV gate', 'Audio gate'].includes(row.label))
          .map((row) => (
            <div className={`readiness-row ${row.tone}`} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <p>{row.detail}</p>
            </div>
          ))}
      </div>
    </section>
  );
}

function ReadinessStrip({ readiness }: { readiness: RaceReadiness }) {
  const summaryRows = readiness.rows.filter((row) => ['Timing mode', 'Session route', 'Local archive', 'Live POV gate', 'Audio gate'].includes(row.label));
  const stripDetail =
    readiness.operationalBlockers.length > 0
      ? readiness.operationalBlockers.map((row) => row.label).join(', ')
      : readiness.headlineTone === 'green'
        ? 'Timing, route, archive, POV, and audio are all proof-complete.'
        : 'Timing/archive may be stale; POV/audio stay proof-gated.';

  return (
    <section className={`readiness-strip ${readiness.headlineTone}`} aria-label="Race room readiness">
      <div className="readiness-strip-head">
        <span>Room Status</span>
        <strong>{readiness.headline}</strong>
        <p>{stripDetail}</p>
      </div>
      <div className="readiness-strip-items">
        {summaryRows.map((row) => (
          <div className={`strip-item ${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function TvMode({
  snapshot,
  alerts,
  loading,
  refresh,
  seasonHistory,
  povState,
  audioState
}: {
  snapshot: RaceSnapshot;
  alerts: ReturnType<typeof buildAlerts>;
  loading: boolean;
  refresh: () => Promise<void>;
  seasonHistory: SeasonHistoryPayload | null;
  povState: PovState;
  audioState: AudioState;
}) {
  const { bryce } = snapshot;
  const posDelta = Number(bryce.startPosition) - Number(bryce.rank);

  return (
    <section className="tv-grid">
      <div className="main-stage">
        <BroadcastPanel route={snapshot.broadcastRoute} />
        <TimingRibbon rows={snapshot.timingRows} bryceNo={bryce.no} />
      </div>
      <aside className="focus-stack">
        <DriverPanel snapshot={snapshot} />
        <OnboardPanel povState={povState} />
        <RadioPanel frequency={snapshot.bryceProfile.radiofrequency} route={snapshot.broadcastRoute} audioState={audioState} />
      </aside>
      <section className="race-row">
        {metric('Position', `P${bryce.rank}`, `Started P${bryce.startPosition}`, posDelta > 0 ? 'green' : posDelta < 0 ? 'amber' : 'white')}
        {metric('Last Lap', bryce.lastLapTime, `${bryce.LastSpeed} mph`, 'cyan')}
        {metric('Best Lap', bryce.bestLapTime, `Lap ${bryce.bestLap}`, 'green')}
        {metric('Gap', bryce.gap || bryce.diff, `Live gap ${bryce.liveGap}`, 'amber')}
        {metric('Status', bryce.status, bryce.comment || bryce.marker, bryce.status === 'DNF' ? 'red' : 'white')}
      </section>
      <section className="bottom-grid">
        <TrackMap snapshot={snapshot} />
        <AlertsPanel alerts={alerts} />
        <SeasonPulse history={seasonHistory} />
        <div className="refresh-card">
          <button onClick={refresh} type="button">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <span>Updated {new Date(snapshot.updatedAt).toLocaleTimeString()}</span>
        </div>
      </section>
    </section>
  );
}

function EngineerMode({
  snapshot,
  alerts,
  seasonHistory,
  replay
}: {
  snapshot: RaceSnapshot;
  alerts: ReturnType<typeof buildAlerts>;
  seasonHistory: SeasonHistoryPayload | null;
  replay: BryceReplayPayload | null;
}) {
  return (
    <section className="engineer-grid">
      <DriverPanel snapshot={snapshot} dense />
      <PaceChart snapshot={snapshot} />
      <RacecraftChart snapshot={snapshot} />
      <ReplayAnalyticsPanel replay={replay} />
      <TimingTower rows={snapshot.timingRows} bryceNo={snapshot.bryce.no} />
      <AlertsPanel alerts={alerts} dense />
      <TrackMap snapshot={snapshot} dense />
      <SourceHealth snapshot={snapshot} />
      <SeasonPulse dense history={seasonHistory} />
      <SeasonDeepDive history={seasonHistory} />
    </section>
  );
}

function SourcesMode({
  snapshot,
  lastError,
  loading,
  refresh,
  povState,
  setPovState,
  raceLog,
  onboardCatalog,
  audioState,
  setAudioState,
  readiness
}: {
  snapshot: RaceSnapshot;
  lastError: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  povState: PovState;
  setPovState: (state: PovStateUpdate) => void;
  raceLog: RaceLogSnapshot | null;
  onboardCatalog: OnboardCatalogSnapshot | null;
  audioState: AudioState;
  setAudioState: (state: AudioStateUpdate) => void;
  readiness: RaceReadiness;
}) {
  const sourceCopy = sourceModeCopy(snapshot);

  return (
    <section className="sources-grid">
      <div className="panel source-hero">
        <div className="panel-heading">
          <div>
            <p>Timing Adapter</p>
            <h2>{sourceCopy.heading}</h2>
          </div>
          <ShieldCheck size={28} />
        </div>
        <p className="source-copy">{sourceCopy.body}</p>
        <div className={`pov-status-card ${snapshot.sourceState === 'live' ? 'green' : snapshot.sourceState === 'stale' || snapshot.sourceState === 'cold' ? 'amber' : 'red'}`}>
          <strong>{sourceCopy.tone}</strong>
          <span>{snapshot.heartbeat.eventName}</span>
        </div>
        {lastError && <div className="error-strip">{lastError}</div>}
        <button onClick={refresh} type="button">
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Recheck sources
        </button>
      </div>
      <ReadinessPanel readiness={readiness} />
      <PovVerifier state={povState} setState={setPovState} />
      <AudioVerifier state={audioState} setState={setAudioState} frequency={snapshot.bryceProfile.radiofrequency} route={snapshot.broadcastRoute} />
      <LivePovAccessPanel catalog={onboardCatalog} />
      <SourceHealth snapshot={snapshot} large />
      <DataCapturePanel raceLog={raceLog} />
      <SessionRoutePanel route={snapshot.broadcastRoute} />
    </section>
  );
}

function ReadinessPanel({
  readiness
}: {
  readiness: RaceReadiness;
}) {
  return (
    <div className="panel readiness-panel">
      <div className="panel-heading compact">
        <div>
          <p>Race-Day Readiness</p>
          <h3>{readiness.operationalBlockers.length ? `${readiness.operationalBlockers.length} operational blocker${readiness.operationalBlockers.length > 1 ? 's' : ''}` : 'Operational with labeled gates'}</h3>
        </div>
        <ShieldCheck size={20} />
      </div>
      <div className={`pov-status-card ${readiness.headlineTone}`}>
        <strong>{readiness.operationalBlockers.length ? 'Fix live-data blockers before room use' : 'BryceCast core data is source-backed'}</strong>
        <span>POV and isolated radio remain proof-gated when authorized access is unavailable.</span>
      </div>
      <div className="readiness-list">
        {readiness.rows.map((row) => (
          <div className={`readiness-row ${row.tone}`} key={row.label}>
            <span>{row.label}</span>
            <strong>{row.value}</strong>
            <p>{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteLinks({ networks, emptyLabel }: { networks: BroadcastNetwork[]; emptyLabel: string }) {
  if (networks.length === 0) return <p className="route-empty">{emptyLabel}</p>;

  return (
    <div className="surface-links compact">
      {networks.map((network) => (
        <a href={network.url} key={`${network.id}-${network.name}`} target="_blank" rel="noreferrer">
          <span>{network.name}</span>
          <ExternalLink size={14} />
        </a>
      ))}
    </div>
  );
}

function SessionRoutePanel({ route }: { route: BroadcastSessionRoute }) {
  const fallbacks = providerFallbacks(route.primaryVideo);
  const primary = route.primaryVideo ? [route.primaryVideo] : [];

  return (
    <div className="panel source-matrix route-panel">
      <div className="panel-heading compact">
        <div>
          <p>Session Route</p>
          <h3>{route.primaryVideo ? route.primaryVideo.name : 'Authorized route pending'}</h3>
        </div>
        <Tv size={20} />
      </div>
      <p className="source-copy">
        {route.sessionName} from {routeSourceLabel[route.source]}. {formatRouteWindow(route)}. Licensed video stays in the official app or TV provider surface.
      </p>
      <div className="route-grid">
        <div>
          <span>Primary Video</span>
          <RouteLinks networks={primary} emptyLabel="No session video route found." />
        </div>
        <div>
          <span>Provider Fallbacks</span>
          <RouteLinks networks={fallbacks} emptyLabel="No provider fallback inferred for this session." />
        </div>
        <div>
          <span>Official Audio</span>
          <RouteLinks networks={route.audio} emptyLabel="No audio network listed." />
        </div>
        <div>
          <span>International or Delay-Risk</span>
          <RouteLinks networks={route.international} emptyLabel="No international route listed." />
        </div>
      </div>
      <div className="route-note">{route.note}</div>
    </div>
  );
}

function DataCapturePanel({ raceLog }: { raceLog: RaceLogSnapshot | null }) {
  const ageSeconds = ageSecondsFrom(raceLog?.checkedAt);
  const healthy = raceLog && ageSeconds !== null && ageSeconds < 120;
  const endpointCount = raceLog?.endpoints.filter((endpoint) => endpoint.ok).length ?? 0;

  return (
    <div className="panel capture-panel">
      <div className="panel-heading compact">
        <div>
          <p>Data Capture</p>
          <h3>{raceLog ? 'Race logger active' : 'Logger not started'}</h3>
        </div>
        <Database size={20} />
      </div>
      <p className="source-copy">
        The local race logger preserves Race Control, schedule, config, source health, and Bryce samples for the season archive when it is running on the Mac.
      </p>
      <div className={`pov-status-card ${healthy ? 'green' : raceLog ? 'amber' : 'red'}`}>
        <strong>{raceLog ? `${endpointCount}/${raceLog.endpoints.length} feeds logged` : 'No persisted sample yet'}</strong>
        <span>{raceLog ? `${new Date(raceLog.checkedAt).toLocaleTimeString()} (${formatAge(ageSeconds)})` : 'No local archive sample yet'}</span>
        {raceLog?.bryce && (
          <p>
            Bryce P{raceLog.bryce.rank ?? '-'}, {raceLog.bryce.status || 'status unknown'}, lap {raceLog.bryce.laps || '-'}, best {raceLog.bryce.bestLapTime || '-'}
          </p>
        )}
      </div>
      <div className="capture-grid">
        <div>
          <span>Session</span>
          <strong>{raceLog ? raceLog.sessionKey : '-'}</strong>
        </div>
        <div>
          <span>SQLite</span>
          <strong>{raceLog ? raceLog.storage.sqlite : 'data/live/brycecast.sqlite'}</strong>
        </div>
        <div>
          <span>JSONL</span>
          <strong>{raceLog ? raceLog.storage.jsonl : 'data/live/snapshots.jsonl'}</strong>
        </div>
        <div>
          <span>State</span>
          <strong>{raceLog ? raceLog.sourceState : 'waiting'}</strong>
        </div>
      </div>
    </div>
  );
}

function PovVerifier({ state, setState }: { state: PovState; setState: (state: PovStateUpdate) => void }) {
  const gate = povGateCopy(state);
  const update = <K extends keyof PovState>(key: K, value: PovState[K]) => setState((current) => ({ ...current, [key]: value }));
  const updateProof = (index: number, done: boolean) =>
    setState((current) => ({
      ...current,
      proofItems: current.proofItems.map((item, itemIndex) => (itemIndex === index ? { ...item, done } : item))
    }));

  return (
    <div className="panel pov-verifier">
      <div className="panel-heading">
        <div>
          <p>Live #9 POV Gate</p>
          <h2>{gate.label}</h2>
        </div>
        <Video size={28} />
      </div>
      <p className="source-copy">
        {livePovDefinition} Delayed AiM, INDYCAR LIVE replay, highlights, and broadcast cutaways are useful fallback material, but they do not pass this gate.
      </p>
      <div className={`pov-status-card ${gate.tone}`}>
        <strong>{gate.acceptance === 'passing' ? 'Acceptance passing' : 'Acceptance failing'}</strong>
        <span>{state.verifiedAt || 'No live proof timestamp yet'}</span>
        {gate.acceptance !== 'passing' && <p>Same-race live #9 required. Every other video path remains a fallback.</p>}
      </div>
      <div className="pov-form">
        <label>
          Status
          <select value={state.status} onChange={(event) => update('status', event.target.value as PovState['status'])}>
            {povStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Surface
          <select value={state.source} onChange={(event) => update('source', event.target.value as PovState['source'])}>
            {povSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label>
          Device
          <input value={state.device} onChange={(event) => update('device', event.target.value)} />
        </label>
        <label>
          Session
          <input value={state.session} onChange={(event) => update('session', event.target.value)} />
        </label>
        <label>
          Verified at
          <input value={state.verifiedAt} placeholder="2026-06-20 11:36 CT" onChange={(event) => update('verifiedAt', event.target.value)} />
        </label>
        <label>
          Live seconds
          <input
            min="0"
            type="number"
            value={state.liveConfirmedSeconds}
            onChange={(event) => update('liveConfirmedSeconds', Number(event.target.value))}
          />
        </label>
        <label>
          Selector label
          <input value={state.selectorLabel} placeholder="#9 Bryce Aron" onChange={(event) => update('selectorLabel', event.target.value)} />
        </label>
        <label>
          Evidence ref
          <input value={state.evidenceRef} placeholder="screenshot filename or note" onChange={(event) => update('evidenceRef', event.target.value)} />
        </label>
        <label className="wide">
          Latency note
          <input value={state.latencyNote} placeholder="e.g. 18s behind FS1" onChange={(event) => update('latencyNote', event.target.value)} />
        </label>
        <label className="wide">
          Notes
          <textarea value={state.notes} onChange={(event) => update('notes', event.target.value)} />
        </label>
      </div>
      <div className="proof-list editable">
        {state.proofItems.map((item, index) => (
          <label className={item.done ? 'proof-row done' : 'proof-row'} key={item.label}>
            <input checked={item.done} type="checkbox" onChange={(event) => updateProof(index, event.target.checked)} />
            <CheckCircle2 size={16} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

const audioLaunchLinks = (route: BroadcastSessionRoute): BroadcastNetwork[] =>
  uniqueNetworks([
    { id: 'indycar-app-audio', name: 'INDYCAR App', url: sourceUrls.app, kind: 'app' },
    { id: 'indycar-radio-direct', name: 'INDYCAR Radio', url: sourceUrls.radio, kind: 'audio' },
    ...route.audio
  ]);

function AudioVerifier({
  state,
  setState,
  frequency,
  route
}: {
  state: AudioState;
  setState: (state: AudioStateUpdate) => void;
  frequency: string;
  route: BroadcastSessionRoute;
}) {
  const gate = audioGateCopy(state);
  const displayFrequency = state.frequency || frequency;
  const update = <K extends keyof AudioState>(key: K, value: AudioState[K]) => setState((current) => ({ ...current, [key]: value }));
  const updateProof = (index: number, done: boolean) =>
    setState((current) => ({
      ...current,
      proofItems: current.proofItems.map((item, itemIndex) => (itemIndex === index ? { ...item, done } : item))
    }));

  return (
    <div className="panel pov-verifier audio-verifier">
      <div className="panel-heading">
        <div>
          <p>Audio / Radio Gate</p>
          <h2>{gate.label}</h2>
        </div>
        <Radio size={28} />
      </div>
      <p className="source-copy">
        Bryce-specific app radio, official race-call audio, and published RF frequency are separate lanes. Frequency metadata does not create a no-hardware audio stream.
      </p>
      <div className={`pov-status-card ${gate.tone}`}>
        <strong>{gate.acceptance === 'bryce_passing' ? 'Bryce radio proof passing' : gate.acceptance === 'race_audio_passing' ? 'Official race audio usable' : 'Audio proof incomplete'}</strong>
        <span>{state.verifiedAt || 'No audio proof timestamp yet'}</span>
        <p>{gate.detail}</p>
      </div>
      <div className="audio-lanes">
        <div>
          <span>Bryce isolated radio</span>
          <strong>{state.status === 'bryce_radio_available' ? 'Candidate active' : state.status === 'bryce_radio_absent' ? 'Absent this check' : 'Needs live app check'}</strong>
        </div>
        <div>
          <span>Official race audio</span>
          <strong>{state.officialRaceAudioAvailable || state.status === 'official_race_audio_available' ? 'Available' : 'Needs proof'}</strong>
        </div>
        <div>
          <span>Frequency fallback</span>
          <strong>{displayFrequency || 'Unverified'}</strong>
        </div>
      </div>
      <div className="pov-form">
        <label>
          Status
          <select value={state.status} onChange={(event) => update('status', event.target.value as AudioState['status'])}>
            {audioStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source
          <select value={state.source} onChange={(event) => update('source', event.target.value as AudioState['source'])}>
            {audioSources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
        </label>
        <label>
          Device
          <input value={state.device} onChange={(event) => update('device', event.target.value)} />
        </label>
        <label>
          Session
          <input value={state.session} onChange={(event) => update('session', event.target.value)} />
        </label>
        <label>
          Verified at
          <input value={state.verifiedAt} placeholder="2026-06-20 11:36 CT" onChange={(event) => update('verifiedAt', event.target.value)} />
        </label>
        <label>
          Live seconds
          <input min="0" type="number" value={state.liveConfirmedSeconds} onChange={(event) => update('liveConfirmedSeconds', Number(event.target.value))} />
        </label>
        <label>
          Selector label
          <input value={state.selectorLabel} placeholder="#9 Bryce radio or INDYCAR Radio" onChange={(event) => update('selectorLabel', event.target.value)} />
        </label>
        <label>
          Evidence ref
          <input value={state.evidenceRef} placeholder="audio-selector-screenshot.png" onChange={(event) => update('evidenceRef', event.target.value)} />
        </label>
        <label>
          Frequency
          <input value={displayFrequency} onChange={(event) => update('frequency', event.target.value)} />
        </label>
        <label>
          Frequency source
          <input value={state.frequencySource} placeholder="Driver feed" onChange={(event) => update('frequencySource', event.target.value)} />
        </label>
        <label className="wide checkbox-label">
          <input checked={state.officialRaceAudioAvailable} type="checkbox" onChange={(event) => update('officialRaceAudioAvailable', event.target.checked)} />
          Official race audio active even if Bryce-specific radio is absent
        </label>
        <label className="wide">
          Permission bucket
          <input value={state.permissionBucket} placeholder="Private listening only" onChange={(event) => update('permissionBucket', event.target.value)} />
        </label>
        <label className="wide">
          Latency note
          <input value={state.latencyNote} placeholder="e.g. app audio 12s behind Race Control" onChange={(event) => update('latencyNote', event.target.value)} />
        </label>
        <label className="wide">
          Notes
          <textarea value={state.notes} onChange={(event) => update('notes', event.target.value)} />
        </label>
      </div>
      <div className="proof-list editable">
        {state.proofItems.map((item, index) => (
          <label className={item.done ? 'proof-row done' : 'proof-row'} key={item.label}>
            <input checked={item.done} type="checkbox" onChange={(event) => updateProof(index, event.target.checked)} />
            <CheckCircle2 size={16} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <div className="catalog-links audio-links">
        {audioLaunchLinks(route).map((network) => (
          <a href={network.url} key={`${network.id}-${network.name}`} target="_blank" rel="noreferrer">
            {network.name} <ExternalLink size={13} />
          </a>
        ))}
      </div>
    </div>
  );
}

const catalogStatusCopy = (catalog: OnboardCatalogSnapshot | null) => {
  if (!catalog) return { label: 'Catalog probe not run', tone: 'amber' as const };
  if (catalog.passGate) return { label: 'Bryce candidate found', tone: 'green' as const };
  if (catalog.status === 'nxt_driver_level_no_bryce') return { label: 'NXT driver-level onboards found, Bryce absent', tone: 'amber' as const };
  if (catalog.status === 'series_onboards_only') return { label: 'Series onboards only', tone: 'red' as const };
  return { label: 'No onboard catalog entries', tone: 'red' as const };
};

function LivePovAccessPanel({ catalog }: { catalog: OnboardCatalogSnapshot | null }) {
  const status = catalogStatusCopy(catalog);
  const catalogSamples = catalog?.strictBryceMatches.length ? catalog.strictBryceMatches : catalog?.onboardSample.slice(0, 4) ?? [];

  return (
    <div className="panel pov-access-panel">
      <div className="panel-heading compact">
        <div>
          <p>POV Access War Room</p>
          <h3>Live #9 during actual race</h3>
        </div>
        <BadgeAlert size={20} />
      </div>
      <p className="source-copy">
        BryceCast treats live same-window onboard as the core product gate. The broadcast, timing, radio, history, and delayed clips keep the watch room useful while this access route is chased, but none of them replace it.
      </p>
      <div className="access-lanes">
        {povEscalationLanes.map((lane) => (
          <div className="access-lane" key={lane.owner}>
            <strong>{lane.owner}</strong>
            <span>{lane.ask}</span>
            <p>{lane.pass}</p>
          </div>
        ))}
      </div>
      <div className={`pov-status-card ${status.tone}`}>
        <strong>Staylive Onboards Monitor: {status.label}</strong>
        <span>{catalog ? `Checked ${new Date(catalog.checkedAt).toLocaleTimeString()}` : 'No onboard catalog snapshot has been captured for this session.'}</span>
        <p>
          {catalog
            ? `${catalog.counts.onboardItems} onboard catalog objects, ${catalog.counts.indyNxtItems} INDY NXT session objects, ${catalog.counts.strictBryceMatches} strict Bryce/Aron matches. ${catalog.note}`
            : 'The monitor checks official INDYCAR LIVE catalog metadata for Bryce/Aron entries. It does not embed, extract, or play protected video.'}
        </p>
      </div>
      <div className="catalog-links">
        <a href={sourceUrls.indycarLive} target="_blank" rel="noreferrer">
          INDYCAR LIVE <ExternalLink size={13} />
        </a>
        <span>Catalog monitor evidence required during live windows</span>
      </div>
      {catalogSamples.length > 0 && (
        <div className="catalog-samples">
          {catalogSamples.map((item) => (
            <a href={item.url || sourceUrls.indycarLive} key={`${item.channelId}-${item.id}`} target="_blank" rel="noreferrer">
              <span>{item.channelName}</span>
              <strong>{item.name}</strong>
              <small>{item.status || 'status pending'}</small>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function OpsMode({ snapshot, povState, audioState, raceLog }: { snapshot: RaceSnapshot; povState: PovState; audioState: AudioState; raceLog: RaceLogSnapshot | null }) {
  const route = snapshot.broadcastRoute;
  const primaryRoute = route.primaryVideo?.name ?? 'authorized broadcast';
  const providerNames = providerFallbacks(route.primaryVideo)
    .map((network) => network.name)
    .join(' or ');
  const audioStatus = audioGateCopy(audioState);
  const steps = [
    ['Launch broadcast', `Open ${primaryRoute} for ${route.sessionName}. ${providerNames ? `Use ${providerNames} if that carries ${primaryRoute}.` : 'Use your authorized TV provider path.'}`],
    ['Start race logger', 'Turn on the local race logger so BryceCast preserves timing, source health, and Bryce samples for season analytics.'],
    ['Monitor onboard catalog', 'Keep the official INDYCAR LIVE catalog monitor running during the live window so any Bryce/Aron onboard candidate is captured.'],
    ['Start BryceCast', 'Open the MacBook dashboard, then AirPlay or HDMI to the TV.'],
    ['Connect live timing', 'Confirm Race Control source is live, stale, cold, or demo seed before trusting the room view.'],
    ['Prove live #9 POV', 'Check the INDYCAR app or approved monitor route for a selectable live #9 onboard during the actual race. Delayed clips, replay, and broadcast cutaways do not count.'],
    ['Add radio layer', `Try Bryce app radio first, keep official race audio as the room baseline, and treat ${snapshot.bryceProfile.radiofrequency} as frequency metadata only.`],
    ['Sync experience', 'Delay timing/radio panels mentally or through OBS later if video latency differs.']
  ];
  const status = povGateCopy(povState);

  return (
    <section className="ops-grid">
      <div className="panel ops-card">
        <div className="panel-heading">
          <div>
            <p>Watch Party Flow</p>
            <h2>MacBook-first race room</h2>
          </div>
          <MonitorUp size={28} />
        </div>
        <div className="ops-list">
          {steps.map(([title, detail], index) => (
            <div className="ops-step" key={title}>
              <strong>{index + 1}</strong>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <DataCapturePanel raceLog={raceLog} />
      <SessionRoutePanel route={route} />
      <div className="panel ops-card">
        <div className="panel-heading">
          <div>
            <p>Audio Proof</p>
            <h2>{audioStatus.label}</h2>
          </div>
          <Radio size={28} />
        </div>
        <div className={`pov-status-card ${audioStatus.tone}`}>
          <strong>{audioState.source}</strong>
          <span>{audioState.device}</span>
          <p>{audioStatus.detail}</p>
          <p>
            Frequency {audioState.frequency || snapshot.bryceProfile.radiofrequency} from {audioState.frequencySource || 'driver feed'}; {audioState.permissionBucket}.
          </p>
        </div>
        <div className="proof-list">
          {audioState.proofItems.map((item) => (
            <div className={item.done ? 'proof-row done' : 'proof-row'} key={item.label}>
              <CheckCircle2 size={16} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel ops-card">
        <div className="panel-heading">
          <div>
            <p>Live POV Proof</p>
            <h2>{status.label}</h2>
          </div>
          <Video size={28} />
        </div>
        <div className={`pov-status-card ${status.tone}`}>
          <strong>{povState.source}</strong>
          <span>{povState.device}</span>
          <p>{povState.notes}</p>
          {status.acceptance !== 'passing' && <p>{livePovDefinition}</p>}
        </div>
        <div className="proof-list">
          {povState.proofItems.map((item) => (
            <div className={item.done ? 'proof-row done' : 'proof-row'} key={item.label}>
              <CheckCircle2 size={16} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="panel ops-card">
        <div className="panel-heading">
          <div>
            <p>Road America</p>
            <h2>Live test plan</h2>
          </div>
          <Smartphone size={28} />
        </div>
        <div className="roadmap-list">
          {roadAmericaChecklist.map((item) => (
            <span key={`${item.time}-${item.task}`}>
              <b>{item.time}</b>
              {item.task}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function BroadcastPanel({ route }: { route: BroadcastSessionRoute }) {
  const actions = uniqueNetworks([...(route.primaryVideo ? [route.primaryVideo] : []), ...route.alternates, ...providerFallbacks(route.primaryVideo)]).slice(0, 4);

  return (
    <div className="broadcast-panel">
      <div className="broadcast-frame">
        <div className="track-sheen" />
        <div className="broadcast-content">
          <div className="live-chip">
            <CircleDot size={12} />
            {routeSourceLabel[route.source]} session route
          </div>
          <h2>{route.primaryVideo ? route.primaryVideo.name : 'Race Broadcast'}</h2>
          <p>{route.sessionName}. Keep licensed video in the official app or provider window, then place BryceCast beside it for the room view.</p>
          <div className="broadcast-actions">
            {actions.map((network) => (
              <a href={network.url} key={`${network.id}-${network.name}`} target="_blank" rel="noreferrer">
                {network.name} <ExternalLink size={14} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DriverPanel({ snapshot, dense = false }: { snapshot: RaceSnapshot; dense?: boolean }) {
  const { bryce, bryceProfile } = snapshot;
  const delta = Number(bryce.startPosition) - Number(bryce.rank);

  return (
    <div className={`panel driver-panel ${dense ? 'dense' : ''}`}>
      <div className="driver-top">
        <div className="driver-number">#{bryce.no}</div>
        <div>
          <p>Chip Ganassi Racing</p>
          <h2>{rowName(bryce)}</h2>
        </div>
        <Trophy size={22} />
      </div>
      <div className="driver-visual">
        <img src={bryceProfile.carillustration} alt="Bryce Aron's #9 car illustration" />
      </div>
      <div className="driver-stats">
        <div>
          <span>Position</span>
          <strong>P{bryce.rank}</strong>
        </div>
        <div>
          <span>Delta</span>
          <strong>{delta > 0 ? `+${delta}` : delta}</strong>
        </div>
        <div>
          <span>Laps</span>
          <strong>{bryce.laps}</strong>
        </div>
        <div>
          <span>Points</span>
          <strong>{bryce.runningDriverPoints}</strong>
        </div>
      </div>
    </div>
  );
}

function OnboardPanel({ povState }: { povState: PovState }) {
  const status = povGateCopy(povState);

  return (
    <div className="panel onboard-panel">
      <div className="panel-heading compact">
        <div>
          <p>Live POV Requirement</p>
          <h3>Bryce POV</h3>
        </div>
        <Video size={20} />
      </div>
      <div className={`onboard-screen ${status.tone}`}>
        <div className="dash-line" />
        <Car size={42} />
        <span>{status.label}</span>
      </div>
      <div className="feed-status">
        <span>{povState.source}</span>
        <strong>{status.acceptance === 'passing' ? 'Same-race proof complete' : 'Same-race live #9 required'}</strong>
      </div>
      <p className="pov-note">{povState.selectorLabel ? `Selector: ${povState.selectorLabel}` : 'Live #9 during the actual race is still unproven.'}</p>
    </div>
  );
}

function RadioPanel({ frequency, route, audioState }: { frequency: string; route: BroadcastSessionRoute; audioState: AudioState }) {
  const status = audioGateCopy(audioState);
  const displayFrequency = audioState.frequency || frequency;
  const links = audioLaunchLinks(route).slice(0, 3);

  return (
    <div className="panel radio-panel">
      <div className="panel-heading compact">
        <div>
          <p>Audio / Radio</p>
          <h3>{status.label}</h3>
        </div>
        <Radio size={20} />
      </div>
      <div className="waveform">
        {Array.from({ length: 28 }).map((_, index) => (
          <i key={index} style={{ height: `${18 + ((index * 13) % 44)}px` }} />
        ))}
      </div>
      <div className="feed-status">
        <span>{audioState.source}</span>
        <strong>{status.acceptance === 'metadata_only' ? 'Not a live audio stream' : status.acceptance === 'race_audio_passing' ? 'Race-call baseline ready' : status.detail}</strong>
      </div>
      <p className="pov-note">
        {displayFrequency} from {audioState.frequencySource || 'driver feed'}
      </p>
      <div className="radio-link-row">
        {links.map((network) => (
          <a href={network.url} key={`${network.id}-${network.name}`} target="_blank" rel="noreferrer">
            {network.name} <ExternalLink size={13} />
          </a>
        ))}
      </div>
    </div>
  );
}

function TrackMap({ snapshot, dense = false }: { snapshot: RaceSnapshot; dense?: boolean }) {
  return (
    <div className={`panel track-panel ${dense ? 'dense' : ''}`}>
      <div className="panel-heading compact">
        <div>
          <p>Reference Map</p>
          <h3>{snapshot.heartbeat.trackName}</h3>
        </div>
        <Map size={20} />
      </div>
      <div className="map-stage">
        {snapshot.trackMapUrl ? <img src={snapshot.trackMapUrl} alt={`${snapshot.heartbeat.trackName} track map`} /> : <div className="oval-map" />}
      </div>
      <div className="map-foot">
        <span>No live car-position feed</span>
        <strong>{snapshot.heartbeat.trackLength} mi</strong>
      </div>
    </div>
  );
}

function AlertsPanel({ alerts, dense = false }: { alerts: ReturnType<typeof buildAlerts>; dense?: boolean }) {
  return (
    <div className={`panel alerts-panel ${dense ? 'dense' : ''}`}>
      <div className="panel-heading compact">
        <div>
          <p>Moment Desk</p>
          <h3>Timing notes</h3>
        </div>
        <Bell size={20} />
      </div>
      <div className="alert-list">
        {alerts.map((alert) => (
          <div className={`alert-row ${alert.tone}`} key={alert.title}>
            <span>{alert.stamp}</span>
            <div>
              <strong>{alert.title}</strong>
              <p>{alert.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimingRibbon({ rows, bryceNo }: { rows: TimingRow[]; bryceNo: string }) {
  const bryceIndex = rows.findIndex((row) => row.no === bryceNo);
  const windowRows = rows.slice(Math.max(0, bryceIndex - 3), Math.min(rows.length, bryceIndex + 4));

  return (
    <div className="timing-ribbon">
      {windowRows.map((row) => (
        <div className={row.no === bryceNo ? 'timing-cell bryce' : 'timing-cell'} key={`${row.rank}-${row.no}`}>
          <strong>P{row.rank}</strong>
          <span>#{row.no}</span>
          <p>{row.lastName}</p>
          <small>{row.gap || row.diff}</small>
        </div>
      ))}
    </div>
  );
}

function TimingTower({ rows, bryceNo }: { rows: TimingRow[]; bryceNo: string }) {
  return (
    <div className="panel timing-tower">
      <div className="panel-heading compact">
        <div>
          <p>Timing Tower</p>
          <h3>Field context</h3>
        </div>
        <Clock size={20} />
      </div>
      <div className="tower-table">
        {rows.slice(0, 24).map((row) => (
          <div className={row.no === bryceNo ? 'tower-row bryce' : 'tower-row'} key={`${row.rank}-${row.no}`}>
            <b>{row.rank}</b>
            <span>#{row.no}</span>
            <strong>{rowName(row)}</strong>
            <small>{row.bestLapTime}</small>
            <em>{row.status}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaceChart({ snapshot }: { snapshot: RaceSnapshot }) {
  const isBryceRow = (row: TimingRow) => row.firstName === snapshot.bryce.firstName && row.lastName === snapshot.bryce.lastName;
  const rows = snapshot.timingRows
    .filter((row) => Number.parseFloat(row.BestSpeed) > 0)
    .slice(0, 12)
    .map((row) => ({
      name: isBryceRow(row) ? 'Bryce' : `#${row.no}`,
      speed: Number.parseFloat(row.BestSpeed),
      bryce: isBryceRow(row)
    }));

  return (
    <div className="panel chart-panel">
      <div className="panel-heading compact">
        <div>
          <p>Pace</p>
          <h3>Best speed vs field</h3>
        </div>
        <Gauge size={20} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#aab2c2', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis hide domain={['dataMin - 3', 'dataMax + 1']} />
          <Tooltip contentStyle={{ background: '#111722', border: '1px solid #273241', color: '#fff' }} />
          <Bar dataKey="speed" radius={[4, 4, 0, 0]}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.bryce ? '#ff304d' : '#27d8ff'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function RacecraftChart({ snapshot }: { snapshot: RaceSnapshot }) {
  const isBryceRow = (row: TimingRow) => row.firstName === snapshot.bryce.firstName && row.lastName === snapshot.bryce.lastName;
  const rows = snapshot.timingRows
    .slice(0, 14)
    .map((row) => ({ name: isBryceRow(row) ? 'Bryce' : `#${row.no}`, net: row.Passes - row.Passed, bryce: isBryceRow(row) }));

  return (
    <div className="panel chart-panel">
      <div className="panel-heading compact">
        <div>
          <p>Racecraft</p>
          <h3>Net pass delta</h3>
        </div>
        <Activity size={20} />
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows}>
          <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: '#aab2c2', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#aab2c2', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: '#111722', border: '1px solid #273241', color: '#fff' }} />
          <Bar dataKey="net" radius={[4, 4, 4, 4]}>
            {rows.map((row) => (
              <Cell key={row.name} fill={row.bryce ? '#ff304d' : row.net >= 0 ? '#3de28a' : '#ffbf47'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReplayAnalyticsPanel({ replay }: { replay: BryceReplayPayload | null }) {
  const rows = replay?.rows ?? [];
  const chartRows = rows.filter((row) => row.rank !== null);
  const hasTrend = replay?.archiveState === 'ready';
  const stateTone = !replay || replay.archiveState === 'missing' || replay.archiveState === 'empty' ? 'red' : replay.archiveState === 'tiny' ? 'amber' : 'green';
  const summary = replay?.summary;

  return (
    <div className="panel replay-panel">
      <div className="panel-heading compact">
        <div>
          <p>Replay Analytics</p>
          <h3>{replay ? `${replay.archiveState} archive` : 'API archive offline'}</h3>
        </div>
        <Database size={20} />
      </div>
      <div className={`pov-status-card ${stateTone}`}>
        <strong>{replay ? `${replay.returned}/${replay.selectedCount || replay.count} samples loaded` : 'Replay API unavailable'}</strong>
        <span>
          {replay?.sessionKey ?? 'Replay API unavailable'} {summary?.coverageMinutes ? `, ${summary.coverageMinutes} min captured` : ''}
        </span>
        <p>
          {replay?.warnings?.[0] ?? 'SQLite replay turns race logger samples into rank, pass, pit, and status timelines for post-race review.'}
        </p>
      </div>
      <div className="replay-metrics">
        <div>
          <span>Rank Window</span>
          <strong>
            {formatRank(summary?.firstRank)} to {formatRank(summary?.latestRank)}
          </strong>
        </div>
        <div>
          <span>Best / Worst</span>
          <strong>
            {formatRank(summary?.bestRank)} / {formatRank(summary?.worstRank)}
          </strong>
        </div>
        <div>
          <span>Position Delta</span>
          <strong>{summary?.positionDelta === null || summary?.positionDelta === undefined ? '-' : summary.positionDelta > 0 ? `+${summary.positionDelta}` : summary.positionDelta}</strong>
        </div>
        <div>
          <span>Pass Net</span>
          <strong>{summary?.netPasses === null || summary?.netPasses === undefined ? '-' : summary.netPasses > 0 ? `+${summary.netPasses}` : summary.netPasses}</strong>
        </div>
      </div>
      <div className="replay-chart">
        {hasTrend && chartRows.length > 0 ? (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={chartRows}>
              <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
              <XAxis dataKey="timeLabel" tick={{ fill: '#aab2c2', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis reversed tick={{ fill: '#aab2c2', fontSize: 10 }} axisLine={false} tickLine={false} width={32} />
              <Tooltip contentStyle={{ background: '#111722', border: '1px solid #273241', color: '#fff' }} />
              <Line type="monotone" dataKey="rank" stroke="#ff304d" strokeWidth={2.4} dot={{ r: 3, fill: '#ff304d' }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="replay-empty">
            <strong>Replay chart waits for more samples</strong>
            <span>A full live-session archive is required before BryceCast can show a trustworthy rank trend.</span>
          </div>
        )}
      </div>
      <div className="replay-events">
        {(summary?.statusEvents.length ? summary.statusEvents : []).slice(-4).map((event) => (
          <div key={`${event.checkedAt}-${event.status}-${event.comment}`}>
            <span>{formatTimestamp(event.checkedAt)}</span>
            <strong>
              {formatRank(event.rank)} {event.status}
            </strong>
            <p>{event.comment || event.gap || 'No status note captured.'}</p>
          </div>
        ))}
        {summary && summary.statusEvents.length === 0 && <p className="route-empty">No replay status events captured yet.</p>}
      </div>
    </div>
  );
}

function SeasonPulse({ dense = false, history }: { dense?: boolean; history: SeasonHistoryPayload | null }) {
  const points = history?.points ?? [];
  const deltaData = points.map((point) => ({ ...point, delta: point.start - point.finish }));
  const latest = points.at(-1);
  const officialCount = points.filter((point) => point.source?.toLowerCase().includes('official')).length;

  return (
    <div className={`panel season-panel ${dense ? 'dense' : ''}`}>
      <div className="panel-heading compact">
        <div>
          <p>Season Pulse</p>
          <h3>Qualifying to finish</h3>
        </div>
        <BarChart3 size={20} />
      </div>
      {points.length > 0 ? (
        <ResponsiveContainer width="100%" height={dense ? 220 : 142}>
          <AreaChart data={deltaData}>
            <defs>
              <linearGradient id="deltaFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#3de28a" stopOpacity={0.42} />
                <stop offset="95%" stopColor="#3de28a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,.08)" vertical={false} />
            <XAxis dataKey="race" tick={{ fill: '#aab2c2', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#aab2c2', fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ background: '#111722', border: '1px solid #273241', color: '#fff' }} />
            <Area type="monotone" dataKey="delta" stroke="#3de28a" fill="url(#deltaFill)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="season-empty">Loading season history</div>
      )}
      <div className="season-meta">
        <div>
          <span>Standings</span>
          <strong>{history?.bryceStanding ? `P${history.bryceStanding.rank}, ${history.bryceStanding.points} pts` : 'Loading'}</strong>
        </div>
        <div>
          <span>Best Finish</span>
          <strong>{history?.bryceStanding ? `P${history.bryceStanding.bestFinish}` : '-'}</strong>
        </div>
        <div>
          <span>Latest</span>
          <strong>{latest ? `${latest.race} ${latest.points === null ? 'pending pts' : `${latest.points} pts`}` : '-'}</strong>
        </div>
        <div>
          <span>Result Rows</span>
          <strong>
            {points.length ? `${officialCount}/${points.length} official` : '-'}
          </strong>
        </div>
      </div>
      {dense && history && (
        <div className="season-detail-grid">
          <div>
            <h4>Recent Years</h4>
            {history.yearSummaries.map((summary) => (
              <p key={summary.year}>
                {summary.year}: {summary.starts} starts, best P{summary.bestFinish}, avg P{summary.averageFinish}
              </p>
            ))}
          </div>
          <div>
            <h4>CGR Bench</h4>
            {history.teammateSummaries.map((summary) => (
              <p key={summary.driverId}>
                {summary.name}: best P{summary.bestFinish}, avg P{summary.averageFinish}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SeasonDeepDive({ history }: { history: SeasonHistoryPayload | null }) {
  const points = history?.points ?? [];
  const splitRows = ['Street', 'Road', 'Oval']
    .map((trackType) => {
      const rows = points.filter((point) => point.type === trackType);
      const deltas = rows.map((point) => point.start - point.finish);
      const finishes = rows.map((point) => point.finish);
      const starts = rows.map((point) => point.start);
      const bestLaps = rows.map((point) => point.bestLapRank).filter((rank) => rank > 0);
      return {
        trackType,
        starts: rows.length,
        averageStart: averageNumber(starts),
        averageFinish: averageNumber(finishes),
        averageDelta: averageNumber(deltas),
        bestFinish: finishes.length ? Math.min(...finishes) : null,
        top10s: finishes.filter((finish) => finish <= 10).length,
        averageBestLapRank: averageNumber(bestLaps)
      };
    })
    .filter((row) => row.starts > 0);
  const deltaRows = points.map((point) => ({ ...point, delta: point.start - point.finish }));
  const bestGain = deltaRows.length ? deltaRows.reduce((best, point) => (point.delta > best.delta ? point : best), deltaRows[0]) : null;
  const biggestLoss = deltaRows.length ? deltaRows.reduce((worst, point) => (point.delta < worst.delta ? point : worst), deltaRows[0]) : null;
  const bestLap = points
    .filter((point) => point.bestLapRank > 0)
    .sort((left, right) => left.bestLapRank - right.bestLapRank)[0];
  const currentYear = history?.yearSummaries.find((summary) => summary.year === 2026);
  const teammateRows = history
    ? [
        {
          name: 'Bryce Aron',
          driverId: 'bryce',
          starts: currentYear?.starts ?? points.length,
          bestFinish: history.bryceStanding?.bestFinish ?? currentYear?.bestFinish ?? 0,
          top10s: history.bryceStanding?.top10 ?? currentYear?.top10s ?? 0,
          averageFinish: currentYear?.averageFinish ?? averageNumber(points.map((point) => point.finish)) ?? 0
        },
        ...history.teammateSummaries
      ]
        .filter((row) => row.starts > 0)
        .sort((left, right) => left.averageFinish - right.averageFinish)
    : [];
  const officialCount = points.filter((point) => point.source?.toLowerCase().includes('official')).length;
  const provisionalCount = points.length - officialCount;
  const checkedAtAge = ageSecondsFrom(history?.checkedAt);

  return (
    <div className="panel season-deep-panel">
      <div className="panel-heading compact">
        <div>
          <p>Season Analytics</p>
          <h3>Splits, gains, CGR bench</h3>
        </div>
        <BarChart3 size={20} />
      </div>
      {!history || points.length === 0 ? (
        <div className="season-empty">Season analytics waiting for history ingest</div>
      ) : (
        <>
          <div className="analytics-hero-grid">
            <div>
              <span>Official rows</span>
              <strong>
                {officialCount}/{points.length}
              </strong>
              <p>{provisionalCount ? `${provisionalCount} provisional timing row${provisionalCount > 1 ? 's' : ''}` : 'All rows official'}</p>
            </div>
            <div>
              <span>Best gain</span>
              <strong>{bestGain ? `${formatSigned(bestGain.delta)} at ${bestGain.race}` : '-'}</strong>
              <p>{bestGain ? `P${bestGain.start} to P${bestGain.finish}` : 'No race rows loaded'}</p>
            </div>
            <div>
              <span>Largest loss</span>
              <strong>{biggestLoss ? `${formatSigned(biggestLoss.delta)} at ${biggestLoss.race}` : '-'}</strong>
              <p>{biggestLoss ? `P${biggestLoss.start} to P${biggestLoss.finish}` : 'No race rows loaded'}</p>
            </div>
            <div>
              <span>Best lap rank</span>
              <strong>{bestLap ? `P${bestLap.bestLapRank}` : '-'}</strong>
              <p>{bestLap ? `${bestLap.race}, ${bestLap.type}` : 'No best-lap rank data'}</p>
            </div>
          </div>
          <div className="split-table">
            <div className="split-head">
              <span>Track type</span>
              <span>Starts</span>
              <span>Avg start</span>
              <span>Avg finish</span>
              <span>Avg +/-</span>
              <span>Top 10</span>
            </div>
            {splitRows.map((row) => (
              <div className="split-row" key={row.trackType}>
                <strong>{row.trackType}</strong>
                <span>{row.starts}</span>
                <span>P{formatAverage(row.averageStart)}</span>
                <span>P{formatAverage(row.averageFinish)}</span>
                <span className={(row.averageDelta ?? 0) >= 0 ? 'positive' : 'negative'}>{formatSignedAverage(row.averageDelta)}</span>
                <span>
                  {row.top10s}/{row.starts}
                </span>
              </div>
            ))}
          </div>
          <div className="bench-grid">
            <div>
              <h4>CGR average finish</h4>
              {teammateRows.map((row, index) => (
                <p className={row.driverId === 'bryce' ? 'bryce-bench' : ''} key={row.driverId}>
                  <b>{index + 1}</b>
                  <span>{row.name}</span>
                  <strong>P{row.averageFinish.toFixed(1)}</strong>
                  <small>
                    best P{row.bestFinish}, top 10s {row.top10s ?? '-'}
                  </small>
                </p>
              ))}
            </div>
            <div>
              <h4>Source confidence</h4>
              <p>
                <b>{formatAge(checkedAtAge)}</b>
                <span>{history.source}</span>
              </p>
              <p>
                <b>{points.length}</b>
                <span>race rows, {splitRows.length} track-type split{splitRows.length === 1 ? '' : 's'}.</span>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SourceHealth({ snapshot, large = false }: { snapshot: RaceSnapshot; large?: boolean }) {
  return (
    <div className={`panel source-health ${large ? 'large' : ''}`}>
      <div className="panel-heading compact">
        <div>
          <p>Timing Health</p>
          <h3>Race Control feeds</h3>
        </div>
        <Antenna size={20} />
      </div>
      <div className="probe-list">
        {snapshot.sourceProbes.map((probe) => (
          <div className={`probe-row ${probe.state}`} key={probe.id}>
            <BadgeAlert size={16} />
            <div>
              <strong>{probe.label}</strong>
              <span>{probe.note}</span>
              <div className="probe-meta">
                <small>{probe.freshnessLabel ?? `checked ${formatAge(probe.checkedAgeSeconds)}`}</small>
                <small>{probe.bytes !== undefined ? `${probe.bytes.toLocaleString()} bytes` : 'bytes unknown'}</small>
              </div>
              <code>{probe.url}</code>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
