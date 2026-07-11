import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Flag, Trophy, Wind } from 'lucide-react';
import {
  Card,
  Countdown,
  GhostButton,
  HeroPanel,
  Plate,
  SourcePill,
  Stat,
  StatusChip,
  TrustBanner,
  Unavailable,
  readinessCopy,
  type Tone
} from '../app/components';
import { LapStoryChart, type LapPoint } from '../app/charts';
import { asNumber, asString, formatGain, formatGap, formatLapTime, formatNumber, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import { useNextSession } from '../app/useNextSession';
import type { LiveReadiness } from '../app/useReadiness';

type Row = Record<string, unknown>;

const rowsOf = (payload: LiveReadiness): Row[] => {
  const rows = (payload.liveTiming as Row)?.rows;
  return Array.isArray(rows) ? (rows as Row[]) : [];
};

const heartbeatOf = (payload: LiveReadiness): Row => ((payload.liveTiming as Row)?.heartbeat as Row) ?? {};

const bryceRowOf = (payload: LiveReadiness): Row | null => {
  const bryce = (payload.bryce as Row)?.bryce;
  return bryce && typeof bryce === 'object' ? (bryce as Row) : null;
};

const flagTone = (flag: string | null): Tone => {
  const value = (flag ?? '').toUpperCase();
  if (value === 'GREEN') return 'good';
  if (value === 'YELLOW' || value === 'CAUTION') return 'warn';
  if (value === 'RED') return 'bad';
  return 'neutral';
};

const driverLabel = (row: Row | undefined): string | null =>
  row ? asString(row.lastName) ?? asString(row.name) ?? (asString(row.no) ? `Car ${asString(row.no)}` : null) : null;

/* ---------- session header ---------- */

const SessionHeader = ({ payload }: { payload: LiveReadiness }) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  const sessionName = asString(heartbeat.sessionName ?? weekend.sessionName);
  const typeLabel = asString(weekend.trackType) ? trackTypeLabel(weekend.trackType) : null;
  const kicker = [typeLabel, asString(weekend.trackName)].filter(Boolean).join(' · ') || 'Live companion';
  return (
    <div className="row row--between row--wrap" style={{ alignItems: 'flex-end', gap: 14 }}>
      <div>
        <span className="kicker">{kicker}</span>
        <h1 className="screen-head__title" style={{ marginTop: 8 }}>
          {asString(weekend.eventName) ?? 'INDY NXT'}
        </h1>
      </div>
      <div className="row" style={{ gap: 10 }}>
        {flag ? <StatusChip tone={flagTone(flag)} label={`${flag} flag`} live={flag.toUpperCase() === 'GREEN'} /> : null}
        {lap !== null && totalLaps !== null ? (
          <div className="stat" style={{ alignItems: 'flex-end' }}>
            <span className="caption">Lap</span>
            <span className="figure" style={{ fontSize: 26, lineHeight: 1 }}>
              {lap}<span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>/{totalLaps}</span>
            </span>
          </div>
        ) : sessionName ? (
          <span className="chip chip--outline">{sessionName}</span>
        ) : null}
      </div>
    </div>
  );
};

/* ---------- Bryce hero ---------- */

const BryceHero = ({ payload }: { payload: LiveReadiness }) => {
  const bryce = bryceRowOf(payload);
  const heartbeat = heartbeatOf(payload);
  const green = (asString(heartbeat.flag) ?? '').toUpperCase() === 'GREEN';

  if (!bryce) {
    return (
      <Card>
        <Unavailable>Bryce isn’t in this timing feed. His live card lights up when his session starts.</Unavailable>
      </Card>
    );
  }

  const rank = asNumber(bryce.rank);
  const start = asNumber(bryce.startPosition);
  const gain = start !== null && rank !== null ? formatGain(start - rank) : null;
  const rows = rowsOf(payload);
  const ahead = rank !== null ? rows.find((row) => asNumber(row.rank) === rank - 1) : undefined;
  const behind = rank !== null ? rows.find((row) => asNumber(row.rank) === rank + 1) : undefined;

  const detailStats: Array<{ label: string; value: string }> = [];
  const gapAhead = asString(bryce.liveDiffAhead) ?? asString(bryce.diff);
  if (gapAhead) detailStats.push({ label: 'Gap ahead', value: formatGap(gapAhead) });
  if (asString(bryce.lastLapTime)) detailStats.push({ label: 'Last lap', value: formatLapTime(bryce.lastLapTime) });
  if (asString(bryce.bestLapTime)) detailStats.push({ label: 'Best lap', value: formatLapTime(bryce.bestLapTime) });
  if (asNumber(bryce.pitStops) !== null) detailStats.push({ label: 'Pit stops', value: formatNumber(bryce.pitStops, 0) });

  return (
    <HeroPanel tint={green ? 'live' : 'bryce'}>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <span className="caption" style={{ color: 'var(--bryce)', letterSpacing: '0.12em' }}>
          Bryce Aron · No. 9
        </span>
        <SourcePill
          title="Bryce live tile"
          entries={[
            {
              label: 'Race Control timing feed (car 9, DriverID 2143)',
              path: '/api/bryce',
              note: 'Identity-guarded: only counted as Bryce when the INDY NXT heartbeat and car 9 identity both match.'
            }
          ]}
        />
      </div>
      <div className="grid grid--split" style={{ alignItems: 'center', marginTop: 6 }}>
        <div className="row" style={{ gap: 18 }}>
          <Plate size="hero" />
          <div className="stat">
            <span className="stat__value stat__value--hero" style={{ color: 'var(--bryce)' }}>
              {rank !== null ? `P${rank}` : '—'}
            </span>
            {gain ? (
              <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
                {gain.text} from P{start} start
              </span>
            ) : (
              <span className="stat__delta stat__delta--down">start position pending</span>
            )}
          </div>
        </div>
        {detailStats.length > 0 ? (
          <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
            {detailStats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-muted)', maxWidth: '32ch' }}>
            Lap times and gaps appear here as Race Control publishes them.
          </p>
        )}
      </div>
      {(ahead || behind) && (
        <div className="row row--wrap" style={{ marginTop: 18, gap: 8 }}>
          {ahead ? (
            <span className="chip chip--outline">
              <ArrowUp size={11} aria-hidden /> chasing {driverLabel(ahead)}
            </span>
          ) : rank === 1 ? (
            <span className="chip chip--bryce">
              <Trophy size={11} aria-hidden /> leading the field
            </span>
          ) : null}
          {behind ? (
            <span className="chip chip--outline">
              <ArrowDown size={11} aria-hidden /> {driverLabel(behind)} behind
              {asString(bryce.liveDiffBehind) ? ` · ${formatGap(bryce.liveDiffBehind)}` : ''}
            </span>
          ) : null}
        </div>
      )}
    </HeroPanel>
  );
};

/* ---------- championship projection (Bryce's requested feature) ---------- */

const PointsProjection = ({ payload }: { payload: LiveReadiness }) => {
  const points = payload.points as Row;
  const mode = asString(points.mode) ?? 'unavailable';
  const label = asString(points.label) ?? 'Points';
  const brycePoints = (points.bryce as Row) ?? {};
  const rows = rowsOf(payload);
  const [expanded, setExpanded] = useState(false);

  const projected = useMemo(() => {
    const withPoints = rows
      .map((row) => ({
        name: asString(row.name) ?? [asString(row.firstName), asString(row.lastName)].filter(Boolean).join(' '),
        no: asString(row.no),
        isBryce: row.bryce === true,
        total: asNumber(row.totalDriverPoints),
        running: asNumber(row.runningDriverPoints)
      }))
      .filter((row) => row.total !== null);
    return withPoints.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
  }, [rows]);

  const bryceIndex = projected.findIndex((row) => row.isBryce);
  const historicalRank = asNumber(brycePoints.historicalRank);
  const projectedBryceRank = bryceIndex >= 0 ? bryceIndex + 1 : null;
  const championshipMove =
    historicalRank !== null && projectedBryceRank !== null ? formatGain(historicalRank - projectedBryceRank) : null;

  if (mode === 'race_control_live' && projected.length > 0) {
    const visible = expanded ? projected : projected.slice(0, Math.max(10, bryceIndex + 2));
    return (
      <Card
        flush
        title={
          <>
            <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
            If the race ended now
          </>
        }
        action={
          <SourcePill
            title="Championship projection"
            entries={[
              {
                label,
                path: '/api/readiness → points + timing rows',
                note: 'Points computed by INDYCAR Race Control, shown as-is. Provisional until official results publish.'
              }
            ]}
            caveats={['Race Control running points are provisional and reconciled against official results after the session.']}
          />
        }
      >
        <div style={{ padding: '0 18px 10px' }}>
          <div className="row row--wrap" style={{ gap: 8 }}>
            <StatusChip tone="warn" label="Provisional · Race Control" />
            {championshipMove && projectedBryceRank !== null ? (
              <span className="chip chip--bryce">
                Bryce{' '}
                {championshipMove.direction === 'up'
                  ? `up to P${projectedBryceRank}`
                  : championshipMove.direction === 'down'
                    ? `to P${projectedBryceRank}`
                    : `holds P${projectedBryceRank}`}
                {historicalRank !== null ? ` · was P${historicalRank}` : ''}
              </span>
            ) : null}
          </div>
        </div>
        <div className="tower" role="table" aria-label="Projected championship standings">
          {visible.map((row, index) => (
            <div key={row.no ?? index} className={`tower__row${row.isBryce ? ' tower__row--bryce' : ''}`} role="row">
              <span className="tower__pos">{index + 1}</span>
              <span className="tower__name">
                {row.name || `Car ${row.no ?? '—'}`}
                {row.isBryce ? <span className="tower__team" style={{ color: 'var(--bryce)' }}> · No. 9</span> : null}
              </span>
              <span className="tower__gap figure">{row.total}</span>
              <span className="tower__gap" style={{ fontSize: 11.5 }}>{row.running !== null ? `+${row.running} today` : ''}</span>
            </div>
          ))}
        </div>
        {projected.length > visible.length || expanded ? (
          <GhostButton expanded={expanded} onClick={() => setExpanded((value) => !value)}>
            {expanded ? 'Show fewer' : `Show all ${projected.length}`}
          </GhostButton>
        ) : null}
      </Card>
    );
  }

  const historicalPoints = asNumber(brycePoints.historicalDriverPoints);
  return (
    <Card
      title={
        <>
          <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
          Championship
        </>
      }
    >
      {historicalPoints !== null ? (
        <div className="row" style={{ gap: 26 }}>
          <Stat label="Season points" value={historicalPoints} />
          <Stat label="Standing" value={historicalRank !== null ? `P${historicalRank}` : '—'} />
        </div>
      ) : (
        <Unavailable>Live points aren’t flowing right now. The projection lights up once Race Control publishes running points.</Unavailable>
      )}
      <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: '10px 0 0' }}>
        {mode === 'historical_fallback' ? 'From the latest official season standings.' : 'Live projection unavailable in this state.'}
      </p>
    </Card>
  );
};

/* ---------- timing tower ---------- */

const TimingTower = ({ payload }: { payload: LiveReadiness }) => {
  const rows = rowsOf(payload);
  const [expanded, setExpanded] = useState(false);
  if (rows.length === 0) {
    return (
      <Card title="Timing tower">
        <Unavailable>No timing rows in this state.</Unavailable>
      </Card>
    );
  }
  const sorted = [...rows].sort((a, b) => (asNumber(a.rank) ?? 99) - (asNumber(b.rank) ?? 99));
  const bryceIndex = sorted.findIndex((row) => row.bryce === true);
  const windowed =
    expanded || bryceIndex < 0 ? sorted : sorted.slice(Math.max(0, bryceIndex - 3), Math.min(sorted.length, bryceIndex + 4));

  return (
    <Card
      flush
      title="Timing tower"
      action={
        <SourcePill
          title="Timing tower"
          entries={[{ label: 'Race Control timing feed', path: '/api/timing', note: 'Every car in the session, sorted by live rank.' }]}
        />
      }
    >
      <div className="tower" role="table" aria-label="Live timing tower">
        {windowed.map((row) => {
          const isBryce = row.bryce === true;
          const start = asNumber(row.startPosition);
          const rank = asNumber(row.rank);
          const moved = start !== null && rank !== null ? start - rank : null;
          return (
            <div key={asString(row.no) ?? String(row.rank)} className={`tower__row${isBryce ? ' tower__row--bryce' : ''}`} role="row">
              <span className="tower__pos">{formatNumber(row.rank, 0)}</span>
              <span className="tower__name">
                {driverLabel(row) ?? '—'}
                {moved !== null && moved !== 0 ? (
                  <span style={{ marginLeft: 6, fontSize: 11, color: moved > 0 ? 'var(--status-good)' : 'var(--ink-muted)' }}>
                    {moved > 0 ? `▲${moved}` : `▽${Math.abs(moved)}`}
                  </span>
                ) : null}
                <span className="tower__team"> {asString(row.team) ?? ''}</span>
              </span>
              <span className="tower__gap">{formatGap(row.gap)}</span>
              <span className="tower__gap" style={{ fontSize: 11.5 }}>
                {asNumber(row.pitStops) !== null ? `${formatNumber(row.pitStops, 0)} stops` : ''}
              </span>
            </div>
          );
        })}
      </div>
      <GhostButton expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? 'Focus on Bryce' : `Show all ${sorted.length} cars`}
      </GhostButton>
    </Card>
  );
};

/* ---------- race trend (Bryce position by lap, from the live archive) ---------- */

interface TrendState {
  points: LapPoint[];
  sessionLabel: string | null;
  isCurrentSession: boolean;
}

const useRaceTrend = (payload: LiveReadiness | null, fixtureMode: boolean): TrendState | null => {
  const [trend, setTrend] = useState<TrendState | null>(null);
  const heartbeat = payload ? heartbeatOf(payload) : {};
  const liveKey =
    !fixtureMode && asString(heartbeat.eventId) && asString(heartbeat.eventSessionId)
      ? `${asString(heartbeat.eventId)}-${asString(heartbeat.eventSessionId)}`
      : null;
  const live = payload?.state === 'ready' || payload?.state === 'degraded';

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const key = liveKey ? `&sessionKey=${encodeURIComponent(liveKey)}` : '';
        const response = await fetch(`/api/replay/bryce?sample=lap&limit=200${key}`, { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const data = (await response.json()) as Row;
        if (cancelled || data.available !== true) return;
        const rows = Array.isArray(data.rows) ? (data.rows as Row[]) : [];
        const byLap = new Map<number, LapPoint>();
        for (const row of rows) {
          const lap = asNumber(row.laps);
          const rank = asNumber(row.rank);
          if (lap === null || rank === null) continue;
          byLap.set(lap, { lap, rank, flag: asString(row.flag) });
        }
        const points = [...byLap.values()].sort((a, b) => a.lap - b.lap);
        const sessionKey = asString(data.sessionKey);
        const sessions = Array.isArray(data.sessions) ? (data.sessions as Row[]) : [];
        const session = sessions.find((candidate) => asString(candidate.sessionKey) === sessionKey);
        const label = session
          ? [asString(session.eventName), asString(session.sessionName)].filter(Boolean).join(' · ')
          : null;
        setTrend({
          points,
          sessionLabel: label,
          isCurrentSession: liveKey !== null && sessionKey === liveKey
        });
      } catch {
        /* archive optional */
      }
    };
    void load();
    if (live && !fixtureMode) {
      const timer = setInterval(load, 15_000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }
    return () => {
      cancelled = true;
    };
  }, [liveKey, live, fixtureMode]);

  return trend;
};

const RaceTrend = ({ trend }: { trend: TrendState | null }) => {
  if (!trend || trend.points.length < 2) return null;
  return (
    <Card
      title="Race trend · position by lap"
      action={
        <SourcePill
          title="Race trend"
          entries={[
            {
              label: 'BryceCast live archive (SQLite)',
              path: '/api/replay/bryce?sample=lap',
              note: 'One point per lap from our own 1-second Race Control capture.'
            }
          ]}
        />
      }
    >
      {!trend.isCurrentSession && trend.sessionLabel ? (
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="chip chip--neutral">
            <Flag size={11} aria-hidden /> {trend.sessionLabel}
          </span>
        </div>
      ) : null}
      <LapStoryChart points={trend.points} />
    </Card>
  );
};

/* ---------- weather strip ---------- */

const WeatherStrip = ({ payload }: { payload: LiveReadiness }) => {
  const weather = payload.weather as Row;
  const sourceState = asString(weather.sourceState);
  if (!sourceState || sourceState === 'error' || sourceState === 'unavailable') return null;
  const observation = (weather.observation as Row) ?? {};
  const temperature = asNumber((observation.temperature as Row)?.value ?? observation.temperature);
  const wind = asNumber((observation.windSpeed as Row)?.value ?? observation.windSpeed);
  if (temperature === null && wind === null) return null;
  return (
    <div className="row row--between panel panel--quiet" style={{ padding: '10px 16px' }}>
      <div className="row" style={{ gap: 14 }}>
        <Wind size={15} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
        {temperature !== null ? <span className="figure" style={{ fontSize: 16 }}>{Math.round(temperature)}°</span> : null}
        {wind !== null ? <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>wind {Math.round(wind)}</span> : null}
        {sourceState === 'partial' ? <StatusChip tone="warn" label="partial" /> : null}
      </div>
      <span className="caption">Near-track weather · NWS</span>
    </div>
  );
};

/* ---------- waiting states ---------- */

const WaitingCard = ({ payload }: { payload: LiveReadiness }) => {
  const copy = readinessCopy[payload.state];
  const nextSession = useNextSession();
  const heartbeat = heartbeatOf(payload);
  const onTrackNow = payload.state === 'wrong_series' ? asString(heartbeat.eventName) : null;

  return (
    <HeroPanel tint="bryce">
      <span className="kicker">{payload.state === 'pre_session' ? 'Almost time' : 'While we wait'}</span>
      <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
        {copy?.detail ?? payload.reason}
        {onTrackNow ? ` Race Control is currently showing ${onTrackNow}.` : ''}
        {payload.state === 'pre_session'
          ? ' Live timing, the Bryce tile, and the points projection light up the moment Race Control goes live.'
          : ''}
      </p>
      {nextSession?.startsAt && new Date(nextSession.startsAt).getTime() > Date.now() ? (
        <div style={{ marginTop: 16 }}>
          <span className="caption">
            Next up · {[nextSession.eventName, nextSession.sessionName].filter(Boolean).join(' · ')}
          </span>
          <div style={{ marginTop: 8 }}>
            <Countdown to={nextSession.startsAt} />
          </div>
        </div>
      ) : null}
      <div className="row" style={{ marginTop: 16 }}>
        <Link to="/race-week" className="chip chip--outline">
          <CalendarClock size={11} aria-hidden /> Race week HQ
        </Link>
      </div>
    </HeroPanel>
  );
};

/* ---------- screen ---------- */

export const LiveScreen = ({ payload, fixtureMode }: { payload: LiveReadiness | null; fixtureMode: boolean }) => {
  const trend = useRaceTrend(payload, fixtureMode);

  if (!payload) {
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 46 }} />
        <div className="skeleton" style={{ height: 230 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const liveish = payload.state === 'ready' || payload.state === 'degraded';

  return (
    <div className="page stack">
      {fixtureMode ? (
        <div className="chip chip--outline" style={{ alignSelf: 'flex-start' }}>
          <Flag size={11} aria-hidden /> Fixture preview · {payload.state}
          {payload.variant && payload.variant !== 'base' ? ` / ${payload.variant}` : ''}
        </div>
      ) : null}
      <TrustBanner state={payload.state} reason={payload.reason} />
      {liveish ? (
        <>
          <SessionHeader payload={payload} />
          <BryceHero payload={payload} />
          <div className="grid grid--split">
            <PointsProjection payload={payload} />
            <div className="stack">
              <TimingTower payload={payload} />
              <WeatherStrip payload={payload} />
            </div>
          </div>
          <RaceTrend trend={trend} />
        </>
      ) : (
        <>
          <SessionHeader payload={payload} />
          <WaitingCard payload={payload} />
          <div className="grid grid--split">
            <PointsProjection payload={payload} />
            <RaceTrend trend={trend} />
          </div>
        </>
      )}
    </div>
  );
};
