import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Flag, Trophy, Wind } from 'lucide-react';
import { Card, SourcePill, Stat, StatusChip, TrustBanner, Unavailable, readinessCopy, type Tone } from '../app/components';
import { asNumber, asString, formatGain, formatGap, formatLapTime, formatNumber, trackTypeLabel } from '../app/format';
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

/* ---------- session header ---------- */

const SessionHeader = ({ payload }: { payload: LiveReadiness }) => {
  const weekend = payload.raceWeekend as Row;
  const heartbeat = heartbeatOf(payload);
  const flag = asString(heartbeat.flag ?? weekend.flag);
  const lap = asNumber(heartbeat.lap ?? weekend.lap);
  const totalLaps = asNumber(heartbeat.totalLaps ?? weekend.totalLaps);
  return (
    <div className="row row--between row--wrap">
      <div>
        <div className="caption caption--secondary">{trackTypeLabel(weekend.trackType)} · {asString(weekend.trackName) ?? '—'}</div>
        <h1 className="display" style={{ fontSize: 22, margin: '2px 0 0' }}>
          {asString(weekend.eventName) ?? 'INDY NXT'}
        </h1>
      </div>
      <div className="row">
        {flag ? <StatusChip tone={flagTone(flag)} label={`${flag} flag`} live={flag.toUpperCase() === 'GREEN'} /> : null}
        {lap !== null && totalLaps !== null ? (
          <span className="chip chip--outline figure" style={{ fontSize: 13 }}>
            Lap {lap}/{totalLaps}
          </span>
        ) : null}
      </div>
    </div>
  );
};

/* ---------- Bryce hero ---------- */

const BryceHero = ({ payload }: { payload: LiveReadiness }) => {
  const bryce = bryceRowOf(payload);
  if (!bryce) {
    return (
      <Card>
        <Unavailable>Bryce isn’t in this timing feed. His live card will light up when his session starts.</Unavailable>
      </Card>
    );
  }
  const rank = asNumber(bryce.rank);
  const start = asNumber(bryce.startPosition);
  const gain = start !== null && rank !== null ? formatGain(start - rank) : null;
  const rows = rowsOf(payload);
  const ahead = rank !== null ? rows.find((row) => asNumber(row.rank) === rank - 1) : undefined;
  const behind = rank !== null ? rows.find((row) => asNumber(row.rank) === rank + 1) : undefined;

  return (
    <Card className="bryce-hero">
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ gap: 18, alignItems: 'flex-start' }}>
          <div className="stat">
            <span className="caption" style={{ color: 'var(--bryce)' }}>Bryce Aron · No. 9</span>
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
        <SourcePill
          title="Bryce live tile"
          entries={[
            { label: 'Race Control timing feed (car 9, DriverID 2143)', path: '/api/bryce', note: 'Identity-guarded: only counted as Bryce when the INDY NXT heartbeat and car 9 identity both match.' }
          ]}
        />
      </div>
      <div className="grid grid--3" style={{ marginTop: 16 }}>
        <Stat label="Gap ahead" value={ahead ? formatGap(bryce.liveDiffAhead ?? bryce.diff) : '—'} delta={null} />
        <Stat label="Last lap" value={formatLapTime(bryce.lastLapTime)} />
        <Stat label="Best lap" value={formatLapTime(bryce.bestLapTime)} />
      </div>
      {(ahead || behind) && (
        <div className="row row--wrap" style={{ marginTop: 14, gap: 8 }}>
          {ahead ? (
            <span className="chip chip--outline">▲ chasing {asString(ahead.lastName) ?? asString(ahead.name) ?? 'car ahead'}</span>
          ) : null}
          {behind ? (
            <span className="chip chip--outline">
              ▼ {asString(behind.lastName) ?? asString(behind.name) ?? 'car behind'} behind
              {asString(bryce.liveDiffBehind) ? ` ${formatGap(bryce.liveDiffBehind)}` : ''}
            </span>
          ) : null}
        </div>
      )}
    </Card>
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
          <span className="row" style={{ gap: 7 }}>
            <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
            If the race ended now
          </span>
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
        <div style={{ padding: '4px 18px 8px' }}>
          <div className="row row--wrap" style={{ gap: 8, marginBottom: 8 }}>
            <StatusChip tone="warn" label="Provisional · Race Control" />
            {championshipMove && projectedBryceRank !== null ? (
              <span className="chip chip--bryce">
                Bryce {championshipMove.direction === 'up' ? `up to P${projectedBryceRank}` : championshipMove.direction === 'down' ? `to P${projectedBryceRank}` : `holds P${projectedBryceRank}`}
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
              <span className="tower__gap" style={{ fontSize: 11.5 }}>
                {row.running !== null ? `+${row.running} today` : ''}
              </span>
            </div>
          ))}
        </div>
        {projected.length > visible.length || expanded ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--border-hairline)',
              color: 'var(--ink-secondary)',
              padding: '10px 0',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expanded ? 'Show fewer' : `Show all ${projected.length}`}
          </button>
        ) : null}
      </Card>
    );
  }

  /* fallback modes: historical baseline or unavailable */
  const historicalPoints = asNumber(brycePoints.historicalDriverPoints);
  return (
    <Card
      title={
        <span className="row" style={{ gap: 7 }}>
          <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
          Championship
        </span>
      }
    >
      {historicalPoints !== null ? (
        <div className="row" style={{ gap: 24 }}>
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
          return (
            <div key={asString(row.no) ?? String(row.rank)} className={`tower__row${isBryce ? ' tower__row--bryce' : ''}`} role="row">
              <span className="tower__pos">{formatNumber(row.rank, 0)}</span>
              <span className="tower__name">
                {asString(row.lastName) ?? asString(row.name) ?? `Car ${asString(row.no) ?? '—'}`}
                <span className="tower__team"> {asString(row.team) ?? ''}</span>
              </span>
              <span className="tower__gap">{formatGap(row.gap)}</span>
              <span className="tower__gap" style={{ fontSize: 11.5 }}>{asNumber(row.pitStops) !== null ? `${formatNumber(row.pitStops, 0)} stops` : ''}</span>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          borderTop: '1px solid var(--border-hairline)',
          color: 'var(--ink-secondary)',
          padding: '10px 0',
          fontSize: 12.5,
          fontWeight: 600,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? 'Focus on Bryce' : `Show all ${sorted.length} cars`}
      </button>
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
    <div className="row row--between card" style={{ padding: '10px 16px' }}>
      <div className="row" style={{ gap: 14 }}>
        <Wind size={15} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
        {temperature !== null ? <span className="figure" style={{ fontSize: 15 }}>{Math.round(temperature)}°</span> : null}
        {wind !== null ? <span style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>wind {Math.round(wind)}</span> : null}
        {sourceState === 'partial' ? <StatusChip tone="warn" label="partial" /> : null}
      </div>
      <span className="caption">Near-track weather · NWS</span>
    </div>
  );
};

/* ---------- screen ---------- */

export const LiveScreen = ({ payload, fixtureMode }: { payload: LiveReadiness | null; fixtureMode: boolean }) => {
  if (!payload) {
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 46 }} />
        <div className="skeleton" style={{ height: 210 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const copy = readinessCopy[payload.state];
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
          <div className="grid grid--2">
            <PointsProjection payload={payload} />
            <TimingTower payload={payload} />
          </div>
          <WeatherStrip payload={payload} />
        </>
      ) : (
        <>
          <SessionHeader payload={payload} />
          {payload.state === 'pre_session' ? (
            <Card title="Almost time">
              <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 14 }}>
                {copy?.detail} Live timing, the Bryce tile, and the points projection go live the moment Race Control does.
              </p>
            </Card>
          ) : (
            <Card title="While we wait">
              <p style={{ margin: 0, color: 'var(--ink-secondary)', fontSize: 14 }}>{copy?.detail ?? payload.reason}</p>
            </Card>
          )}
          <PointsProjection payload={payload} />
        </>
      )}
    </div>
  );
};
