import { useEffect, useState } from 'react';
import { ArrowRight, CalendarClock, Flag, Trophy } from 'lucide-react';
import { Card, Stat, StatusChip, TrustBanner } from '../app/components';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition } from '../app/format';
import { Link } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { uiDataPackage } from '../data/uiDataPackage';
import { daysUntil, getNextEvent } from '../data/upcoming';
import { chronoCompare, displayRaceLabel, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/** Latest official season standing from the packaged history snapshot. */
const getSeasonStanding = (): { rank: number | null; points: number | null; top10: number | null; bestFinish: number | null } => {
  const standing = (uiDataPackage.screens.sourceOps.historyStanding ?? {}) as Row;
  return {
    rank: asNumber(standing.rank),
    points: asNumber(standing.points),
    top10: asNumber(standing.top10),
    bestFinish: asNumber(standing.bestFinish)
  };
};

const LiveNowHero = ({ readiness }: { readiness: ReadinessStatus }) => {
  const payload = readiness.payload;
  if (!payload) return null;
  const bryce = ((payload.bryce as Row)?.bryce as Row) ?? null;
  const rank = bryce ? asNumber(bryce.rank) : null;
  const weekend = payload.raceWeekend as Row;
  return (
    <Link to="/live">
      <Card className="home-live-hero">
        <div className="row row--between">
          <StatusChip tone="good" label="LIVE" live />
          <ArrowRight size={16} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
        </div>
        <div className="row row--between" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div>
            <div className="caption caption--secondary">{asString(weekend.eventName) ?? 'INDY NXT'}</div>
            <span className="stat__value stat__value--hero" style={{ color: 'var(--bryce)' }}>
              {rank !== null ? `P${rank}` : '—'}
            </span>
          </div>
          <span style={{ color: 'var(--ink-secondary)', fontSize: 13 }}>Tap for the full live companion</span>
        </div>
      </Card>
    </Link>
  );
};

const NextRaceHero = () => {
  const nextEvent = getNextEvent();
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!nextEvent) {
    return (
      <Card title="Next race">
        <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
          The season schedule is being refreshed — the next race hero returns shortly.
        </p>
      </Card>
    );
  }

  const days = daysUntil(nextEvent);
  const sameTrack = nextEvent.sameTrack;
  return (
    <Link to="/race-week">
      <Card>
        <div className="row row--between">
          <span className="chip chip--bryce">
            <CalendarClock size={12} aria-hidden />
            {days === 0 ? 'Race day' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days} days` : 'Upcoming'}
          </span>
          <ArrowRight size={16} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
        </div>
        <h2 className="display" style={{ fontSize: 24, margin: '12px 0 2px' }}>
          {nextEvent.eventName}
        </h2>
        <div style={{ color: 'var(--ink-secondary)', fontSize: 13.5 }}>
          {nextEvent.trackName} · {formatDate(nextEvent.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        {asNumber(sameTrack.raceCount) ? (
          <div className="row" style={{ marginTop: 14, gap: 24 }}>
            <Stat label={`At ${nextEvent.trackName}`} value={formatNumber(sameTrack.avgFinish)} unit="avg finish" />
            <Stat label="Races there" value={formatNumber(sameTrack.raceCount, 0)} />
          </div>
        ) : null}
      </Card>
    </Link>
  );
};

const LastRaceCard = () => {
  const [latest, setLatest] = useState<ArchiveEntry[] | null>(null);
  useEffect(() => {
    loadDebriefArchive()
      .then((archive) => setLatest(archive.filter((entry) => entry.pack.seasonYear === Math.max(...archive.map((e) => e.pack.seasonYear)))))
      .catch(() => setLatest([]));
  }, []);
  if (!latest || latest.length === 0) return null;
  const [last] = latest;
  const finish = asNumber(last.pack.outcome.finishPosition);
  const start = asNumber(last.pack.outcome.startPosition);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const recent = [...latest].sort((a, b) => chronoCompare(a.pack, b.pack)).slice(-5);
  return (
    <Link to={`/races/${encodeURIComponent(last.pack.sessionId)}`}>
      <Card>
        <div className="row row--between">
          <span className="chip chip--neutral">
            <Flag size={12} aria-hidden />
            Last race
          </span>
          <ArrowRight size={16} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
        </div>
        <div className="row row--between" style={{ marginTop: 12, alignItems: 'flex-end' }}>
          <div>
            <div className="caption caption--secondary">{displayRaceLabel(last.pack)}</div>
            <span className="stat__value" style={{ fontSize: 38, color: 'var(--bryce)' }}>
              {formatPosition(finish)}
            </span>
            {gain ? (
              <span
                className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}
                style={{ marginLeft: 10 }}
              >
                {gain.text} from {formatPosition(start)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="row row--wrap" style={{ marginTop: 12, gap: 6 }}>
          <span className="caption" style={{ marginRight: 2 }}>Recent form</span>
          {recent.map((entry) => {
            const f = asNumber(entry.pack.outcome.finishPosition);
            const s = asNumber(entry.pack.outcome.startPosition);
            const up = f !== null && s !== null && f < s;
            return (
              <span key={entry.pack.sessionId} className="chip chip--outline tnum" style={{ fontSize: 11.5 }}>
                {formatPosition(f)}
                {up ? <span style={{ color: 'var(--status-good)' }}>▲</span> : null}
              </span>
            );
          })}
        </div>
      </Card>
    </Link>
  );
};

const SeasonPulse = () => {
  const standing = getSeasonStanding();
  const pointsRows = uiDataPackage.screens.sourceOps.historyStanding ? null : null;
  void pointsRows;
  return (
    <Card
      title={
        <span className="row" style={{ gap: 7 }}>
          <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
          2026 season
        </span>
      }
      action={
        <Link to="/career" className="navlink" style={{ fontSize: 12.5 }}>
          Career Lab <ArrowRight size={12} aria-hidden />
        </Link>
      }
    >
      <div className="grid grid--3">
        <Stat label="Standing" value={standing.rank !== null ? `P${standing.rank}` : '—'} />
        <Stat label="Points" value={standing.points ?? '—'} />
        <Stat label="Top 10s" value={standing.top10 ?? '—'} delta={standing.bestFinish !== null ? formatGain(0) && { text: `best P${standing.bestFinish}`, direction: 'up' } : null} />
      </div>
    </Card>
  );
};

export const HomeScreen = ({ readiness }: { readiness: ReadinessStatus }) => {
  const state = readiness.payload?.state;
  const liveish = state === 'ready' || state === 'degraded';
  const attention = state === 'wrong_series' || state === 'stale' || state === 'blocked';

  return (
    <div className="page stack">
      <header style={{ margin: '6px 0 4px' }}>
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>
          {liveish ? 'Bryce is on track.' : 'BryceCast'}
        </h1>
        {!liveish ? (
          <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)', fontSize: 14 }}>
            Following Bryce Aron · No. 9 · Chip Ganassi Racing · INDY NXT
          </p>
        ) : null}
      </header>
      {liveish ? <LiveNowHero readiness={readiness} /> : null}
      {attention && readiness.payload ? <TrustBanner state={readiness.payload.state} reason={readiness.payload.reason} /> : null}
      {!liveish ? <NextRaceHero /> : null}
      <SeasonPulse />
      <LastRaceCard />
    </div>
  );
};
