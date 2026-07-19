import { useEffect, useState } from 'react';
import { ArrowRight, Flag, MapPin, Trophy } from 'lucide-react';
import { Card, Countdown, HeroPanel, Plate, Reveal, Stat, StatusChip } from '../app/components';
import { chartFont, useMeasuredWidth } from '../app/charts';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition, trackTypeLabel } from '../app/format';
import { currentWindPill, useEventWeather } from '../app/useEventWeather';
import { Link } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { normalizedName, useNextSession } from '../app/useNextSession';
import { uiDataPackage } from '../data/uiDataPackage';
import { trackOutlineFor } from '../assets/tracks';
import { getVenueByTrackName } from '../data/venueDossier';
import { daysUntil, getNextEvent, raceDayOf, type UpcomingPrepEvent } from '../data/upcoming';
import { chronoCompare, displayRaceLabel, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';
import { TrackArt } from '../app/trackArt';

type Row = Record<string, unknown>;

/* ---------- season status join: officialStatus per race, from the package's
 * season index (the same rows the Races spine reads — no new data path). ---------- */

const seasonStatusBySession: Map<string, string> = (() => {
  const raceDebrief = uiDataPackage.screens.raceDebrief as unknown as Row;
  const rows = Array.isArray(raceDebrief.seasonIndex) ? (raceDebrief.seasonIndex as Row[]) : [];
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = asString(row.sessionId);
    const status = asString(row.officialStatus);
    if (id && status) map.set(id, status);
  }
  return map;
})();

/** House convention (Races spine): "running" is a clean day; anything else is
 *  a day that ended early. Missing rows stay clean — never claim an early end
 *  without a sourced status. */
const endedEarly = (sessionId: string): boolean => {
  const status = seasonStatusBySession.get(sessionId);
  return status !== undefined && status !== 'running';
};

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

/* ---------- the hero: the story of now ----------
 * One quiet full-width card. The venue's track outline is the anchor; the
 * headline names the moment; the meta line places it; a countdown holds on race
 * day / race week; one clearly-labeled action leaves for the right page. No stat
 * grids — the numbers live in the cards below and in Career. */

type HeroState = 'live' | 'raceDay' | 'raceWeek' | 'between';

const headlineFor: Record<HeroState, string> = {
  live: 'Bryce is on track.',
  raceDay: 'It’s race day.',
  raceWeek: 'Race week.',
  between: 'Between race weekends.'
};

const HomeHero = ({
  readiness,
  liveish,
  nextEvent,
  days,
  latest
}: {
  readiness: ReadinessStatus;
  liveish: boolean;
  nextEvent: UpcomingPrepEvent | null;
  days: number | null;
  latest: ArchiveEntry | null;
}) => {
  const nextSession = useNextSession();
  const [, forceTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceTick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const heroState: HeroState = liveish
    ? 'live'
    : days === 0
    ? 'raceDay'
    : days !== null && days > 0 && days <= 6
    ? 'raceWeek'
    : 'between';
  const imminent = heroState === 'live' || heroState === 'raceDay' || heroState === 'raceWeek';

  /* The hero centers the venue in play: the next event through race week (or the
   * one running now); off-season, the place we were last. */
  const venueEvent = nextEvent;
  const venueName = venueEvent?.trackName ?? (latest ? asString((latest.pack.track as Row | undefined)?.name) : null);
  const outline = trackOutlineFor(venueName);
  /* Same near-track weather hook the Race Week hero and weather window read, so
   * the "now" wind pill can never disagree between pages (one source of truth).
   * Only the current reading is needed here — no race-hour sessions. Calm air
   * reads "now · calm" with no arrow; imminent states only. */
  const venueRecord = getVenueByTrackName(venueEvent?.trackName ?? null);
  const { weather } = useEventWeather(
    imminent ? venueEvent?.eventId ?? null : null,
    imminent ? venueRecord?.venueId ?? null : null,
    []
  );
  const wind = currentWindPill(weather?.current ?? null, 'now');

  /* A precise session start (from the live-runner schedule) drives the real
   * countdown; day-precision package data is the fallback. */
  const sessionMatchesEvent =
    venueEvent &&
    nextSession?.startsAt &&
    normalizedName(nextSession.eventName).includes(normalizedName(venueEvent.eventName).slice(0, 12));
  const preciseStart = sessionMatchesEvent ? nextSession?.startsAt ?? null : null;

  /* Live "now" figures — his position is the countdown's stand-in when he's out. */
  const bryce = ((readiness.payload?.bryce as Row)?.bryce as Row) ?? null;
  const liveRank = bryce ? asNumber(bryce.rank) : null;
  const liveStart = bryce ? asNumber(bryce.startPosition) : null;
  const liveGain = liveStart !== null && liveRank !== null ? formatGain(liveStart - liveRank) : null;
  const heartbeat = ((readiness.payload?.liveTiming as Row)?.heartbeat as Row) ?? {};
  const lap = asNumber(heartbeat.lap);
  const totalLaps = asNumber(heartbeat.totalLaps);

  /* Between weekends the action still points ahead (director ruling): the
   * "Last time out" card directly below already owns the look back. */
  const action =
    heroState === 'live' || heroState === 'raceDay'
      ? { to: '/live', label: 'Open the live companion' }
      : { to: '/race-week', label: 'Race week HQ' };

  const metaLine = (() => {
    if (!venueName) return null;
    const parts: string[] = [venueName];
    if (heroState === 'between' && venueEvent) parts[0] = `Next race · ${venueName}`;
    if (heroState === 'between' && !venueEvent && latest) parts[0] = `Last out · ${venueName}`;
    return parts.join('');
  })();

  const raceDate = venueEvent
    ? raceDayOf(venueEvent)
    : latest
      ? (asString((latest.pack.raceOrder as Row | undefined)?.sessionStartDate) ??
        asString((latest.pack as unknown as Row).eventStartDate))
      : null;

  return (
    <HeroPanel tint={heroState === 'live' ? 'live' : 'bryce'}>
      <div className="hero-now">
        <div className="hero-now__head">
          <h1 className="hero-now__title">{headlineFor[heroState]}</h1>
          {metaLine ? (
            <p className="hero-now__meta row row--wrap">
              <span className="row" style={{ gap: 5, whiteSpace: 'nowrap' }}>
                <MapPin size={13} aria-hidden />
                {metaLine}
              </span>
              {venueEvent ? <> · {trackTypeLabel(venueEvent.trackType)}</> : null}
              {raceDate ? <> · {formatDate(raceDate, { weekday: 'long', month: 'long', day: 'numeric' })}</> : null}
            </p>
          ) : (
            <p className="hero-now__meta">The schedule returns here as soon as the next event is published.</p>
          )}
        </div>

        <div className="hero-now__art">
          {outline ? <TrackArt outline={outline} maxHeight={200} wind={imminent ? wind : null} /> : null}
        </div>

        <div className="hero-now__foot">
          {heroState === 'live' ? (
            <div className="hero-now__live">
              <span className="row" style={{ gap: 8 }}>
                <StatusChip tone="good" label="Live" live />
                {lap !== null && totalLaps !== null ? (
                  <span className="caption tnum">Lap {lap}/{totalLaps}</span>
                ) : null}
              </span>
              {liveRank !== null ? (
                <div className="row" style={{ gap: 12, alignItems: 'baseline', marginTop: 8 }}>
                  <Plate size="hero" />
                  <span className="stat__value stat__value--hero">P{liveRank}</span>
                  {liveGain ? (
                    <span className={`stat__delta ${liveGain.direction === 'up' ? 'stat__delta--up' : liveGain.direction === 'down' ? 'stat__delta--down' : 'stat__delta--flat'}`}>
                      {liveGain.text} from P{liveStart}
                    </span>
                  ) : null}
                </div>
              ) : (
                <p className="hero-now__meta" style={{ marginTop: 8 }}>Bryce’s session is underway.</p>
              )}
            </div>
          ) : heroState === 'raceDay' || heroState === 'raceWeek' ? (
            preciseStart ? (
              <div>
                <span className="caption">
                  {heroState === 'raceDay' ? 'Green flag' : 'First session'} ·{' '}
                  {formatDate(preciseStart, { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <div style={{ marginTop: 8 }}>
                  <Countdown to={preciseStart} />
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="figure" style={{ fontSize: 34, lineHeight: 1.05 }}>{days === 0 ? 'Today' : days ?? '—'}</span>
                <span style={{ fontSize: 14, color: 'var(--ink-secondary)', fontWeight: 500 }}>
                  {days === 0 ? 'race day' : days === 1 ? 'day to green' : 'days to green'}
                </span>
              </div>
            )
          ) : venueEvent && days !== null ? (
            <span className="caption">
              {days === 1 ? 'The next weekend is a day away.' : `The next weekend is ${days} days away.`}
            </span>
          ) : null}

          <Link to={action.to} className="hero-now__action">
            {action.label} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </HeroPanel>
  );
};

/* ---------- last time out (unchanged in spirit — the focused result) ---------- */

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
          <span className="stat__value stat__value--big">{formatPosition(finish)}</span>
          {gain ? (
            <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : gain.direction === 'down' ? 'stat__delta--down' : 'stat__delta--flat'}`}>
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

/* ---------- season sparkline: every 2026 finish, one glance ----------
 * House SVG in pixel space (crisp at any width). Ink line, quiet ink dots, one
 * gold dot on the season best — gold means one thing here, keyed in the caption.
 * P1 sits at the top, so an improving run reads as the line rising. The whole
 * spark clicks through to the Career Lab, where the race-by-race detail lives. */

const SeasonSparkline = ({ season }: { season: ArchiveEntry[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const points = season
    .map((entry) => {
      const finish = asNumber(entry.pack.outcome.finishPosition);
      if (finish === null) return null;
      return { finish, early: endedEarly(entry.pack.sessionId) };
    })
    .filter((point): point is { finish: number; early: boolean } => point !== null);
  if (points.length < 2) return null;

  const height = 68;
  const padX = 5;
  const padTop = 11;
  const padBottom = 9;
  const finishes = points.map((point) => point.finish);
  const worst = Math.max(...finishes);
  const yMin = Math.max(1, Math.min(...finishes) - 1);
  const yMax = worst + 1;
  const span = yMax - yMin || 1;
  const plotW = Math.max(0, width - padX * 2);
  const plotH = height - padTop - padBottom;
  const xAt = (index: number) => padX + (points.length === 1 ? plotW / 2 : (plotW * index) / (points.length - 1));
  const yAt = (finish: number) => padTop + (plotH * (finish - yMin)) / span;
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)} ${yAt(point.finish).toFixed(1)}`).join(' ');
  /* Season best among clean days only — gold never lands on a day that ended early. */
  const cleanFinishes = points.filter((point) => !point.early).map((point) => point.finish);
  const best = cleanFinishes.length > 0 ? Math.min(...cleanFinishes) : null;
  const bestIndex = best !== null ? points.findIndex((point) => !point.early && point.finish === best) : -1;

  return (
    <Link to="/career" className="season-spark" aria-label={`Every 2026 finish${best !== null ? `; season best P${best}` : ''}. Open the Career Lab.`}>
      <div ref={ref} style={{ width: '100%' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
            <path d={linePath} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((point, index) => {
              if (index === bestIndex) return null;
              /* The house open circle: a day that ended early, never a filled result. */
              return point.early ? (
                <circle key={index} cx={xAt(index)} cy={yAt(point.finish)} r={3} fill="var(--surface-1)" stroke="var(--ink-muted)" strokeWidth={1.5} />
              ) : (
                <circle key={index} cx={xAt(index)} cy={yAt(point.finish)} r={2.4} fill="var(--ink-primary)" />
              );
            })}
            {bestIndex >= 0 && best !== null ? (
              <>
                <circle cx={xAt(bestIndex)} cy={yAt(best)} r={4} fill="var(--bryce)" />
                <text
                  x={xAt(bestIndex)}
                  y={yAt(best) - 8}
                  textAnchor="middle"
                  fontFamily={chartFont}
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--ink-primary)"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  P{best}
                </text>
              </>
            ) : null}
          </svg>
        ) : null}
      </div>
    </Link>
  );
};

const SeasonSoFar = ({ season }: { season: ArchiveEntry[] }) => {
  const standing = getSeasonStanding();
  const hasEarlyEnd = season.some((entry) => endedEarly(entry.pack.sessionId));
  return (
    <Card
      title={
        <>
          <Trophy size={15} aria-hidden />
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
      {season.length >= 2 ? (
        <div style={{ marginTop: 18 }}>
          <span className="caption">
            Every 2026 finish · gold marks his season best{hasEarlyEnd ? ' · ○ a day that ended early' : ''}
          </span>
          <div style={{ marginTop: 8 }}>
            <SeasonSparkline season={season} />
          </div>
        </div>
      ) : null}
    </Card>
  );
};

/* ---------- the journey (unchanged closing card) ---------- */

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

  return (
    <div className="page stack">
      <HomeHero readiness={readiness} liveish={liveish} nextEvent={nextEvent} days={days} latest={latest} />
      <div className="grid grid--2">
        <Reveal>
          <LastTimeOut latest={latest} />
        </Reveal>
        <Reveal delay={60}>
          <SeasonSoFar season={season} />
        </Reveal>
      </div>
      <Reveal delay={90}>
        <CareerStrip />
      </Reveal>
    </div>
  );
};
