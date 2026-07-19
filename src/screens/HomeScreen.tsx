import { useEffect, useState } from 'react';
import { ArrowRight, Flag, MapPin, Trophy } from 'lucide-react';
import { Card, Countdown, HeroPanel, Plate, Reveal, Stat, StatusChip } from '../app/components';
import { chartFont, useMeasuredWidth } from '../app/charts';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition, trackTypeLabel, windCardinal } from '../app/format';
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

/* ---------- near-track "now" wind, for the hero shape ----------
 * A quiet flourish: only fetched for imminent states, only rendered when the
 * observation carries a real direction and the venue outline has a geographic
 * orientation (TrackArt gates that). Silent, honest omission on any failure —
 * the RaceWeek page owns the full weather module; Home borrows only the arrow. */

interface NowWind {
  bearingDeg: number;
  label: string;
}

const readObservationWind = (weatherData: Row | null | undefined): NowWind | null => {
  const observation = (weatherData?.observation ?? {}) as Row;
  const deg = asNumber(observation.windDirectionDeg);
  if (deg === null) return null;
  const kph = asNumber(observation.windSpeedKph);
  const mph = kph !== null ? Math.round(kph / 1.609344) : null;
  const cardinal = windCardinal(deg);
  /* House wind convention: speed first, uppercase cardinal ("8 mph WNW"). */
  const label = mph !== null ? `${mph} mph ${cardinal ?? ''}`.trim() : `from the ${cardinal ?? '—'}`;
  return { bearingDeg: deg, label };
};

const useNowWind = (eventId: string | null, venueId: string | null): NowWind | null => {
  const [wind, setWind] = useState<NowWind | null>(null);
  useEffect(() => {
    if (!eventId && !venueId) {
      setWind(null);
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const response = await fetch('/api/weather/upcoming', { headers: { accept: 'application/json' } });
        if (response.ok) {
          const payload = (await response.json()) as Row;
          const events = Array.isArray(payload.events) ? (payload.events as Row[]) : [];
          const match = events.find((entry) => asString((entry.event as Row)?.id) === eventId);
          if (match) {
            const report = readObservationWind((match.weather ?? {}) as Row);
            if (!cancelled && report) {
              setWind(report);
              return;
            }
          }
        }
        /* The imminent race rolls off the "upcoming" set on race day itself —
         * fall back to the venue's live weather by trackId (its venueId). */
        if (!venueId) return;
        const live = await fetch(`/api/weather/live?trackId=${encodeURIComponent(venueId)}`, { headers: { accept: 'application/json' } });
        if (!live.ok) return;
        const liveData = (await live.json()) as Row;
        const report = readObservationWind(liveData);
        if (!cancelled && report) setWind(report);
      } catch {
        /* wind is a flourish — omit silently, never block the hero */
      }
    };
    void run();
    const timer = setInterval(run, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [eventId, venueId]);
  return wind;
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
  const venueRecord = getVenueByTrackName(venueEvent?.trackName ?? null);
  const wind = useNowWind(
    imminent ? venueEvent?.eventId ?? null : null,
    imminent ? venueRecord?.venueId ?? null : null
  );

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

  const action =
    heroState === 'live' || heroState === 'raceDay'
      ? { to: '/live', label: 'Open the live companion' }
      : heroState === 'raceWeek'
      ? { to: '/race-week', label: 'Race week HQ' }
      : latest
      ? { to: `/races/${encodeURIComponent(latest.pack.sessionId)}`, label: 'Read the last debrief' }
      : { to: '/race-week', label: 'See what’s next' };

  const metaLine = (() => {
    if (!venueName) return null;
    const parts: string[] = [venueName];
    if (heroState === 'between' && venueEvent) parts[0] = `Next race · ${venueName}`;
    if (heroState === 'between' && !venueEvent && latest) parts[0] = `Last out · ${venueName}`;
    return parts.join('');
  })();

  const raceDate = venueEvent ? raceDayOf(venueEvent) : latest ? asString((latest.pack as unknown as Row).eventStartDate) : null;

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
    .map((entry) => asNumber(entry.pack.outcome.finishPosition))
    .filter((value): value is number => value !== null);
  if (points.length < 2) return null;

  const height = 68;
  const padX = 5;
  const padTop = 11;
  const padBottom = 9;
  const best = Math.min(...points);
  const worst = Math.max(...points);
  const yMin = Math.max(1, best - 1);
  const yMax = worst + 1;
  const span = yMax - yMin || 1;
  const plotW = Math.max(0, width - padX * 2);
  const plotH = height - padTop - padBottom;
  const xAt = (index: number) => padX + (points.length === 1 ? plotW / 2 : (plotW * index) / (points.length - 1));
  const yAt = (finish: number) => padTop + (plotH * (finish - yMin)) / span;
  const linePath = points.map((finish, index) => `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(1)} ${yAt(finish).toFixed(1)}`).join(' ');
  const bestIndex = points.indexOf(best);

  return (
    <Link to="/career" className="season-spark" aria-label={`Every 2026 finish; season best P${best}. Open the Career Lab.`}>
      <div ref={ref} style={{ width: '100%' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-hidden style={{ display: 'block', overflow: 'visible' }}>
            <path d={linePath} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {points.map((finish, index) =>
              index === bestIndex ? null : (
                <circle key={index} cx={xAt(index)} cy={yAt(finish)} r={2.4} fill="var(--ink-primary)" />
              )
            )}
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
          </svg>
        ) : null}
      </div>
    </Link>
  );
};

const SeasonSoFar = ({ season }: { season: ArchiveEntry[] }) => {
  const standing = getSeasonStanding();
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
          <span className="caption">Every 2026 finish · gold marks his season best</span>
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
