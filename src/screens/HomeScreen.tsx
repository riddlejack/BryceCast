import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Flag, MapPin, Radio, Trophy } from 'lucide-react';
import { Card, Countdown, HeroPanel, Plate, Stat, StatusChip } from '../app/components';
import { asNumber, asString, formatClock, formatDate, formatGain, formatNumber, formatPct, formatPosition, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { normalizedName, useNextSession } from '../app/useNextSession';
import { uiDataPackage } from '../data/uiDataPackage';
import { daysUntil, getNextEvent, type UpcomingPrepEvent } from '../data/upcoming';
import { chronoCompare, displayRaceLabel, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/* ---------- season standing from packaged history ---------- */

const getSeasonStanding = (): { rank: number | null; points: number | null; top10: number | null; bestFinish: number | null } => {
  const standing = (uiDataPackage.screens.sourceOps.historyStanding ?? {}) as Row;
  return {
    rank: asNumber(standing.rank),
    points: asNumber(standing.points),
    top10: asNumber(standing.top10),
    bestFinish: asNumber(standing.bestFinish)
  };
};

/* ---------- live hero ---------- */

const LiveNowHero = ({ readiness }: { readiness: ReadinessStatus }) => {
  const payload = readiness.payload;
  if (!payload) return null;
  const bryce = ((payload.bryce as Row)?.bryce as Row) ?? null;
  const rank = bryce ? asNumber(bryce.rank) : null;
  const start = bryce ? asNumber(bryce.startPosition) : null;
  const gain = start !== null && rank !== null ? formatGain(start - rank) : null;
  const weekend = payload.raceWeekend as Row;
  const heartbeat = ((payload.liveTiming as Row)?.heartbeat as Row) ?? {};
  const lap = asNumber(heartbeat.lap);
  const totalLaps = asNumber(heartbeat.totalLaps);
  return (
    <Link to="/live">
      <HeroPanel tint="live">
        <div className="row row--between row--wrap" style={{ alignItems: 'flex-start' }}>
          <span className="kicker">
            <StatusChip tone="good" label="Live" live /> {asString(weekend.eventName) ?? 'INDY NXT'}
          </span>
          {lap !== null && totalLaps !== null ? (
            <span className="chip chip--outline figure">Lap {lap}/{totalLaps}</span>
          ) : null}
        </div>
        <div className="row row--between row--wrap" style={{ marginTop: 10, alignItems: 'flex-end', gap: 18 }}>
          <div className="row" style={{ gap: 16, alignItems: 'center' }}>
            <Plate size="hero" />
            <div className="stat">
              <span className="caption" style={{ color: 'var(--bryce)' }}>Bryce Aron · running</span>
              <span className="stat__value stat__value--hero" style={{ color: 'var(--bryce)' }}>
                {rank !== null ? `P${rank}` : '—'}
              </span>
              {gain ? (
                <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
                  {gain.text} from P{start} start
                </span>
              ) : null}
            </div>
          </div>
          <span className="row" style={{ color: 'var(--ink-secondary)', fontSize: 13.5, gap: 6 }}>
            Open the live companion <ArrowRight size={15} aria-hidden />
          </span>
        </div>
      </HeroPanel>
    </Link>
  );
};

/* ---------- next race hero ---------- */

const TrackForm = ({ event }: { event: UpcomingPrepEvent }) => {
  const sameTrack = event.sameTrack as Row;
  const trackType = (event.trackTypeHistory ?? {}) as Row;
  const raceCount = asNumber(sameTrack.raceCount);
  const typeCount = asNumber(trackType.raceCount);
  const typeName = trackTypeLabel(event.trackType).toLowerCase();

  if (raceCount !== null && raceCount > 0) {
    return (
      <div>
        <span className="caption">How Bryce runs at {event.trackName}</span>
        <div className="row" style={{ gap: 26, marginTop: 8 }}>
          <Stat label="Races" value={formatNumber(raceCount, 0)} />
          <Stat label="Avg finish" value={formatNumber(sameTrack.avgFinish)} />
          <Stat label="Top-10 rate" value={formatPct(sameTrack.top10RatePct)} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>History, not a prediction.</p>
      </div>
    );
  }

  if (typeCount !== null && typeCount > 0) {
    return (
      <div>
        <span className="caption">First time here · on {typeName}s so far</span>
        <div className="row" style={{ gap: 26, marginTop: 8 }}>
          <Stat label={`${typeName} races`} value={formatNumber(typeCount, 0)} />
          <Stat label="Avg finish" value={formatNumber(trackType.avgFinish)} />
          <Stat label="Top-10 rate" value={formatPct(trackType.top10RatePct)} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>History, not a prediction.</p>
      </div>
    );
  }

  return null;
};

const NextRaceHero = ({ readiness }: { readiness: ReadinessStatus }) => {
  const nextEvent = getNextEvent();
  const nextSession = useNextSession();
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (!nextEvent) {
    return (
      <Card title="Next race">
        <p style={{ margin: 0, color: 'var(--ink-secondary)' }}>
          The season schedule is being refreshed — the next race returns here shortly.
        </p>
      </Card>
    );
  }

  const days = daysUntil(nextEvent);
  const sessionMatchesEvent =
    nextSession?.startsAt && normalizedName(nextSession.eventName).includes(normalizedName(nextEvent.eventName).slice(0, 12));
  const preciseStart = sessionMatchesEvent ? nextSession?.startsAt ?? null : null;
  const startMs = preciseStart ? new Date(preciseStart).getTime() : null;
  const hoursAway = startMs !== null ? (startMs - Date.now()) / 3_600_000 : null;

  const state = readiness.payload?.state;
  const guardState = state === 'wrong_series' || state === 'stale' || state === 'blocked';
  const nearSession = hoursAway !== null ? hoursAway <= 6 : days !== null && days <= 0;

  const daysChip =
    days === 0 ? 'Race day' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days} days` : 'Upcoming';

  return (
    <Link to="/race-week">
      <HeroPanel tint="bryce">
        <span
          aria-hidden
          className="figure"
          style={{
            position: 'absolute',
            right: '0.06em',
            top: '-0.16em',
            fontSize: 230,
            fontWeight: 850,
            lineHeight: 1,
            color: 'transparent',
            WebkitTextStroke: '1.5px rgba(245, 182, 63, 0.13)',
            transform: 'skewX(-6deg)',
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: -1
          }}
        >
          9
        </span>
        <div className="row row--wrap" style={{ gap: 8 }}>
          <span className="chip chip--bryce">
            <CalendarClock size={12} aria-hidden />
            {daysChip}
          </span>
          <span className="chip chip--outline">{trackTypeLabel(nextEvent.trackType)}</span>
        </div>
        <h2
          className="display"
          style={{ fontSize: 'clamp(28px, 6vw, 40px)', margin: '14px 0 4px', letterSpacing: '-0.025em' }}
        >
          {nextEvent.eventName}
        </h2>
        <div className="row row--wrap" style={{ color: 'var(--ink-secondary)', fontSize: 13.5, gap: 6 }}>
          <span className="row" style={{ gap: 5, whiteSpace: 'nowrap' }}>
            <MapPin size={13} aria-hidden />
            {nextEvent.trackName}
          </span>
          {asNumber(nextEvent.trackLengthMi) !== null ? <> · {formatNumber(nextEvent.trackLengthMi, 3)} mi</> : null}
          {asNumber(nextEvent.cornerCount) !== null && asNumber(nextEvent.cornerCount)! > 0 ? (
            <> · {formatNumber(nextEvent.cornerCount, 0)} corners</>
          ) : null}
          <> · {formatDate(nextEvent.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}</>
        </div>

        <div className="grid grid--split" style={{ marginTop: 20, alignItems: 'end', gap: 20 }}>
          <div>
            {preciseStart ? (
              <>
                <span className="caption">First session · {formatDate(preciseStart, { weekday: 'short', month: 'short', day: 'numeric' })} · {formatClock(preciseStart)} your time</span>
                <div style={{ marginTop: 8 }}>
                  <Countdown to={preciseStart} />
                </div>
              </>
            ) : days !== null && days > 0 ? (
              <div className="countdown">
                <div className="countdown__cell">
                  <span className="countdown__num">{days}</span>
                  <span className="countdown__label">{days === 1 ? 'day' : 'days'}</span>
                </div>
              </div>
            ) : null}
          </div>
          <TrackForm event={nextEvent} />
        </div>

        <div className="row row--between row--wrap" style={{ marginTop: 18 }}>
          {nearSession ? (
            <span className="row" style={{ gap: 8 }}>
              <StatusChip
                tone={state === 'ready' || state === 'degraded' ? 'good' : 'neutral'}
                label={state === 'ready' || state === 'degraded' ? 'Live now' : 'Live companion arms at green flag'}
              />
            </span>
          ) : (
            <span className="row" style={{ gap: 7, color: 'var(--ink-muted)', fontSize: 12 }}>
              <Radio size={12} aria-hidden />
              {guardState ? 'Live timing idle — it lights up when cars are on track.' : 'Live companion ready for race day.'}
            </span>
          )}
          <span className="row" style={{ color: 'var(--ink-secondary)', fontSize: 13, gap: 6 }}>
            Race week HQ <ArrowRight size={14} aria-hidden />
          </span>
        </div>
      </HeroPanel>
    </Link>
  );
};

/* ---------- season so far ---------- */

const SeasonStrip = ({ season }: { season: ArchiveEntry[] }) => {
  if (season.length === 0) return null;
  return (
    <div>
      <span className="caption">Every 2026 race · start → finish</span>
      <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }}>
        {season.map((entry) => {
          const finish = asNumber(entry.pack.outcome.finishPosition);
          const start = asNumber(entry.pack.outcome.startPosition);
          const gained = finish !== null && start !== null && finish < start;
          const top10 = finish !== null && finish <= 10;
          return (
            <Link key={entry.pack.sessionId} to={`/races/${encodeURIComponent(entry.pack.sessionId)}`}>
              <span
                className="figure"
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 1,
                  minWidth: 44,
                  padding: '7px 8px 5px',
                  borderRadius: 10,
                  fontSize: 15,
                  background: top10 ? 'var(--bryce-faint)' : 'color-mix(in srgb, var(--surface-2) 70%, transparent)',
                  border: `1px solid ${top10 ? 'var(--bryce-border)' : 'var(--border-hairline)'}`,
                  color: top10 ? 'var(--bryce)' : 'var(--ink-primary)'
                }}
              >
                {formatPosition(finish)}
                <span style={{ fontSize: 9, fontWeight: 650, letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>
                  {trackShort(entry)}
                  {gained && start !== null && finish !== null ? (
                    <span style={{ color: 'var(--status-good)' }}> ▲{start - finish}</span>
                  ) : null}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const trackShort = (entry: ArchiveEntry): string => {
  const name = (entry.pack.track as Row | undefined)?.name;
  const text = typeof name === 'string' ? name : '';
  return text
    .replace(/^(the\s+)/i, '')
    .split(/[\s-]+/)
    .filter((word) => !/^(sports?|car|course|race(way)?|park|street|circuit|of|at|the|mile)$/i.test(word))
    .map((word) => word[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();
};

const SeasonSoFar = ({ season }: { season: ArchiveEntry[] }) => {
  const standing = getSeasonStanding();
  return (
    <Card
      title={
        <>
          <Trophy size={15} style={{ color: 'var(--bryce)' }} aria-hidden />
          2026 season so far
        </>
      }
      action={
        <Link to="/career" className="navlink" style={{ fontSize: 12.5, padding: '0 2px' }}>
          Career Lab <ArrowRight size={12} aria-hidden />
        </Link>
      }
    >
      <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
        <Stat label="Standing" value={standing.rank !== null ? `P${standing.rank}` : '—'} />
        <Stat label="Points" value={standing.points ?? '—'} />
        <Stat label="Top 10s" value={standing.top10 ?? '—'} />
        <Stat label="Best finish" value={standing.bestFinish !== null ? `P${standing.bestFinish}` : '—'} />
      </div>
      <div style={{ marginTop: 18 }}>
        <SeasonStrip season={season} />
      </div>
    </Card>
  );
};

/* ---------- last time out ---------- */

const LastTimeOut = ({ latest }: { latest: ArchiveEntry | null }) => {
  if (!latest) return null;
  const outcome = latest.pack.outcome as Row;
  const finish = asNumber(outcome.finishPosition);
  const start = asNumber(outcome.startPosition);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const points = asNumber(outcome.points);
  const standingRank = asNumber(outcome.standingRank);
  const percentile = asNumber(outcome.finishPercentile);
  const fieldBeaten = percentile !== null ? Math.round(percentile * 100) : null;

  return (
    <Link to={`/races/${encodeURIComponent(latest.pack.sessionId)}`}>
      <Card
        title={
          <>
            <Flag size={15} aria-hidden />
            Last time out
          </>
        }
        action={<ArrowRight size={15} style={{ color: 'var(--ink-secondary)' }} aria-hidden />}
      >
        <span className="caption caption--secondary">{displayRaceLabel(latest.pack)}</span>
        <div className="row" style={{ alignItems: 'baseline', gap: 12, marginTop: 4 }}>
          <span className="stat__value stat__value--big" style={{ color: 'var(--bryce)' }}>
            {formatPosition(finish)}
          </span>
          {gain ? (
            <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
              {gain.text} from {formatPosition(start)} start
            </span>
          ) : null}
        </div>
        <div className="row row--wrap" style={{ gap: 8, marginTop: 12 }}>
          {points !== null ? <span className="chip chip--outline tnum">+{formatNumber(points, 0)} points</span> : null}
          {fieldBeaten !== null ? <span className="chip chip--outline tnum">ahead of {fieldBeaten}% of the field</span> : null}
          {standingRank !== null ? <span className="chip chip--outline tnum">P{formatNumber(standingRank, 0)} in the championship</span> : null}
        </div>
        <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-muted)' }}>Full debrief →</p>
      </Card>
    </Link>
  );
};

/* ---------- career strip ---------- */

const CareerStrip = () => {
  const careerLab = uiDataPackage.screens.careerLab as unknown as Row;
  const rows = Array.isArray(careerLab.seriesSummary) ? (careerLab.seriesSummary as Row[]) : [];
  const totalRaces = rows.reduce((sum, row) => sum + (asNumber(row.raceRows) ?? 0), 0);
  return (
    <Link to="/career">
      <section className="panel panel--quiet">
        <div className="row row--between row--wrap" style={{ gap: 14 }}>
          <div>
            <span className="kicker">The journey</span>
            <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-secondary)', maxWidth: '52ch' }}>
              Karting to F1600 to INDY NXT — {rows.length || 'seven'} series and {totalRaces || 'a career of'} source-backed
              races, with every climb charted in the Career Lab.
            </p>
          </div>
          <span className="row" style={{ gap: 22 }}>
            <Stat label="Series" value={rows.length || '—'} />
            <Stat label="Races" value={totalRaces || '—'} />
            <ArrowRight size={16} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
          </span>
        </div>
      </section>
    </Link>
  );
};

/* ---------- screen ---------- */

export const HomeScreen = ({ readiness }: { readiness: ReadinessStatus }) => {
  const state = readiness.payload?.state;
  const liveish = state === 'ready' || state === 'degraded';

  const [season, setSeason] = useState<ArchiveEntry[]>([]);
  useEffect(() => {
    loadDebriefArchive()
      .then((archive) => {
        const latestYear = Math.max(...archive.map((entry) => entry.pack.seasonYear));
        setSeason(
          archive
            .filter((entry) => entry.pack.seasonYear === latestYear)
            .sort((a, b) => chronoCompare(a.pack, b.pack))
        );
      })
      .catch(() => setSeason([]));
  }, []);

  const latest = season.length > 0 ? season[season.length - 1] : null;
  const nextEvent = getNextEvent();
  const days = nextEvent ? daysUntil(nextEvent) : null;

  const title = useMemo(() => {
    if (liveish) return 'Bryce is on track.';
    if (days !== null && days === 0) return 'It’s race day.';
    if (days !== null && days <= 5) return 'Race week.';
    return 'Between race weekends.';
  }, [liveish, days]);

  return (
    <div className="page stack">
      <header className="screen-head">
        <span className="kicker">Bryce Aron · No. 9 · Chip Ganassi Racing · INDY NXT</span>
        <h1 className="screen-head__title">{title}</h1>
      </header>
      {liveish ? <LiveNowHero readiness={readiness} /> : <NextRaceHero readiness={readiness} />}
      <div className="grid grid--split">
        <SeasonSoFar season={season} />
        <LastTimeOut latest={latest} />
      </div>
      <CareerStrip />
    </div>
  );
};
