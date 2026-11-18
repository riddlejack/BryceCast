import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Play } from 'lucide-react';
import { asNumber, formatDate, formatGain } from '../app/format';
import { Link, useRouter } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { DataFreshness } from '../app/dataFreshness';
import { uiDataPackage, type UiCareerFigure } from '../data/uiDataPackage';
import { daysUntil, getNextEvent, raceDayOf } from '../data/upcoming';
import { getSeasonIndex } from '../data/seasons';
import { loadLatestSeasonDebriefs, chronoCompare, type ArchiveEntry } from '../data/debriefArchive';
import { getSeasonPhase, getSeasonReview, type SeasonReview } from '../data/seasonPhase';
import { nextSeasonOutlook } from '../data/nextSeason';
import { loadReplayAvailable, watchableCaptureForRace, type ReplayAvailable } from '../data/replayAvailable';
import { ReplayAffordance } from './replayAffordance';
import { SeasonShareButton } from './seasonShareCard';
import { HomeNow, homeNowState } from './homeNow';
import { HeroStill, type HeroStillSpec } from './homeHeroStill';
import { Standouts, shortRaceName } from './homeStandouts';
import './home.css';

/* ============================================================
 * The landing page (round 3 of the site refresh, November 14, 2026).
 * Built to the approved mock-up (Portfolio/builds/project-brycecast/
 * site-refresh/mockup/landing.html): the film's 3D still of Laguna Seca
 * shaded by his pace, one "last time out" line with the replay beside it,
 * six career figures, the season's standout races drawn large, and plain
 * links to the rest of the site. Live and in-season states add one "now"
 * line in the same form (homeNow.tsx). Every figure is read from the UI
 * data package; nothing on this page is typed in by hand.
 * ============================================================ */

/* ---------- the hero still ----------
 * public/tracks-3d/manifest.json, track "weathertech-raceway-laguna-seca",
 * alternate "2026-r1": the race the film shows. Its shading is that race's
 * pace map (full race, median of clean green-flag laps, section by section).
 * The caption's race facts are read from the season index by sessionId, so
 * the picture and its words cannot drift apart. The credit line is the
 * manifest's attribution for the model. */

const HERO_STILL = {
  sessionId: 'session_indy_nxt_2026_6759',
  src: '/tracks-3d/weathertech-raceway-laguna-seca-pace-2026-r1.jpg',
  src1200: '/tracks-3d/weathertech-raceway-laguna-seca-pace-2026-r1@1200.jpg',
  /* The matching section ID map and its legend (homeHeroStill.tsx). */
  ids: '/tracks-3d/weathertech-raceway-laguna-seca-pace-2026-r1-ids.png',
  legend: '/tracks-3d/weathertech-raceway-laguna-seca-pace-2026-r1-ids.json',
  width: 2400,
  height: 1350,
  credit: 'Map data © OpenStreetMap contributors (ODbL 1.0). Terrain Tiles: Mapzen / Tilezen, data from USGS 3DEP and others.'
};

const figureById = (id: string): UiCareerFigure | null =>
  uiDataPackage.screens.careerLab.lifeStats?.figures?.find((figure) => figure.id === id) ?? null;

const HomeHero = ({ review }: { review: SeasonReview | null }) => {
  const row = useMemo(() => getSeasonIndex().find((candidate) => candidate.sessionId === HERO_STILL.sessionId) ?? null, []);
  const races = figureById('races');
  const firstYear = uiDataPackage.screens.careerLab.lifeStats?.span?.firstDay?.slice(0, 4) ?? null;
  const isSeasonBest =
    review?.standouts.some((standout) => standout.row.sessionId === HERO_STILL.sessionId && standout.label === 'Season best') ??
    false;
  const raceName = row ? `${row.seasonYear ?? ''} ${shortRaceName(row.raceLabel)}`.trim() : null;
  const heroSpec: HeroStillSpec = {
    ...HERO_STILL,
    alt: `A 3D model of WeatherTech Raceway Laguna Seca with the track shaded section by section by Bryce’s pace${raceName ? ` in the ${raceName}` : ''}.`
  };
  const result =
    row && row.finishPosition !== null
      ? `P${row.finishPosition}${row.startPosition !== null ? ` from P${row.startPosition} on the grid` : ''}${isSeasonBest ? ', his season best' : ''}`
      : null;
  return (
    <HeroStill
      spec={heroSpec}
      lead={
        <>
          <h1>Bryce Aron’s racing career, lap by lap.</h1>
          <p className="home-hero__intro">
            Live timing on race day, a pace map of every INDY NXT track he has raced, and
            {races && firstYear ? ` all ${races.display} of his races since ${firstYear}` : ' every race of his career'} in one
            place.
          </p>
          <div className="home-hero__links">
            {review ? <Link to="/races">The {review.seasonYear} season →</Link> : <Link to="/races">His races →</Link>}
            <Link to="/career">His career in numbers →</Link>
          </div>
        </>
      }
      caption={
        <>
          <span className="home-hero__cap-line">
            WeatherTech Raceway Laguna Seca{raceName ? `, ${raceName}` : ''}
            {result ? `: ${result}` : ''}. Each section shaded by his pace against the field, gold where he was strongest, grey
            where it was tougher.
          </span>
          <span className="home-hero__credit">The film’s 3D model. {HERO_STILL.credit}</span>
        </>
      }
    />
  );
};

/* ---------- last time out: one line, the replay beside it ---------- */

/** The replay catalog with its loading state: 'pending' until the API answers
 *  (or fails), so the slot can hold the button's place from the first paint. */
const useReplayCatalogState = (): {
  done: boolean;
  catalog: ReplayAvailable | null;
} => {
  const [state, setState] = useState<{
    done: boolean;
    catalog: ReplayAvailable | null;
  }>({ done: false, catalog: null });
  useEffect(() => {
    let cancelled = false;
    loadReplayAvailable()
      .then((catalog) => {
        if (!cancelled) setState({ done: true, catalog });
      })
      .catch(() => {
        if (!cancelled) setState({ done: true, catalog: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
};

/** The replay button before the catalog has answered: the same disc and title
 *  in the same place, the meta and source lines held at their height. It
 *  already works: the Live page resolves a race id to its capture itself. */
const PendingReplay = ({ sessionId, title }: { sessionId: string; title: string }) => {
  const { navigate } = useRouter();
  const key = encodeURIComponent(sessionId);
  return (
    <div className="race-replay__year home-replay--pending">
      <button type="button" className="race-replay__year-link" onClick={() => navigate(`/live?replay=${key}&from=${key}`)}>
        <span className="race-replay__year-play" aria-hidden>
          <Play size={14} />
        </span>
        <span className="race-replay__year-text">
          <span className="race-replay__year-title">{title}</span>
          <span className="race-replay__year-meta tnum" aria-hidden>
            &nbsp;
          </span>
        </span>
      </button>
      <div className="race-replay__year-prov" aria-hidden>
        &nbsp;
      </div>
    </div>
  );
};

const LastTimeOut = ({
  review,
  latestPack,
  complete
}: {
  review: SeasonReview;
  latestPack: ArchiveEntry | null;
  complete: boolean;
}) => {
  const { done: catalogDone, catalog } = useReplayCatalogState();
  const row = review.rows[review.rows.length - 1];
  if (!row) return null;
  const finish = row.finishPosition;
  const start = row.startPosition;
  const gain = finish !== null && start !== null ? formatGain(start - finish) : null;
  /* The share of the other cars he beat, (field − place) ÷ (field − 1), from
   * the career conversion row; the debrief pack's finishPercentile counts him
   * in his own field, so it is only the fallback. */
  const share = (uiDataPackage.screens.careerLab.resultConversion ?? []).find((r) => r.sessionId === row.sessionId)?.fieldBeatenShare;
  const percentile =
    typeof share === 'number'
      ? share
      : latestPack && latestPack.pack.sessionId === row.sessionId
        ? asNumber((latestPack.pack.outcome as unknown as Record<string, unknown>).finishPercentile)
        : null;
  const fieldBeaten = percentile !== null ? Math.round(percentile * 100) : null;
  const capture = watchableCaptureForRace(catalog, row.sessionId);
  const racePath = `/races/${encodeURIComponent(row.sessionId)}`;

  const facts: ReactNode[] = [];
  if (gain && start !== null) {
    facts.push(
      gain.direction === 'flat' ? (
        <>held P{start} from the grid</>
      ) : (
        <>
          <b className={`home-gain home-gain--${gain.direction}`}>{gain.text}</b> from P{start} on the grid
        </>
      )
    );
  }
  if (row.points !== null) facts.push(<b>+{row.points} points</b>);
  if (fieldBeaten !== null)
    facts.push(
      <>
        ahead of <b>{fieldBeaten}%</b> of the field
      </>
    );

  const rank = row.standingRank;
  const points = row.cumulativePoints;
  const seasonLine =
    rank === null ? null : complete ? (
      <>
        Finished the {review.seasonYear} season <b>P{rank}</b> in the championship
        {points !== null ? ` on ${points} points` : ''}
        {review.closingTop10Run >= 2 ? (
          <>
            , with {review.closingTop10Run} straight <span className="home-nowrap">top-10s</span> to close it
          </>
        ) : null}
        .
      </>
    ) : (
      <>
        <b>P{rank}</b> in the {review.seasonYear} championship
        {points !== null ? ` on ${points} points` : ''} after {review.races} {review.races === 1 ? 'race' : 'races'}.
      </>
    );

  return (
    <section className="home-line home-last" aria-label="Last time out">
      <Link to={racePath} className="home-line__head">
        Last time out · <span className="home-last__race">{shortRaceName(row.raceLabel)}</span>
      </Link>
      <Link to={racePath} className="home-line__lead home-last__result">
        <span className="home-line__big">{finish !== null ? `P${finish}` : '—'}</span>
      </Link>
      <div className="home-line__body">
        <div className="home-line__facts">
          <p>
            {facts.map((fact, index) => (
              <span key={index}>
                {index > 0 ? ' · ' : ''}
                {fact}
              </span>
            ))}
          </p>
          {seasonLine ? <p>{seasonLine}</p> : null}
          {complete ? (
            <div className="home-share">
              <SeasonShareButton review={review} />
            </div>
          ) : null}
        </div>
        <div className="home-last__replay">
          {capture ? (
            <ReplayAffordance capture={capture} fromSessionId={row.sessionId} title="Watch the race replay" variant="compact" />
          ) : !catalogDone ? (
            <PendingReplay sessionId={row.sessionId} title="Watch the race replay" />
          ) : (
            <Link to={racePath} className="home-textlink">
              The race, lap by lap →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
};

/* ---------- his career so far: six figures from the ledger ----------
 * screens.careerLab.lifeStats.figures (analysis/career-life-stats), shown with
 * the package's own `display` strings. A "+" marks a floor (lower_bound). */

/** "71 h 47 min+" → numbers large, units small, the floor mark in amber. */
const FigureValue = ({ display }: { display: string }) => {
  const tokens = display.match(/\d[\d,]*(?:\.\d+)?|[^\d]+/g) ?? [display];
  return (
    <>
      {tokens.map((token, index) => {
        if (/^\d/.test(token)) return <span key={index}>{token}</span>;
        return token.split(/(\+)/).map((part, partIndex) => {
          const key = `${index}-${partIndex}`;
          if (!part) return null;
          if (part === '+')
            return (
              <span key={key} className="home-odo__plus">
                +
              </span>
            );
          if (!part.trim()) return <span key={key}> </span>;
          return (
            <span key={key} className="home-odo__unit">
              {part.trim()}
            </span>
          );
        });
      })}
    </>
  );
};

const CareerSoFar = () => {
  const careerLab = uiDataPackage.screens.careerLab;
  const span = careerLab.lifeStats?.span ?? null;
  const seriesCount = Array.isArray(careerLab.seriesSummary) ? careerLab.seriesSummary.length : null;
  const races = figureById('races');
  const laps = figureById('raceLaps');
  const countries = figureById('countries');
  const cells: Array<{
    figure: UiCareerFigure;
    label: string;
    sub: string | null;
  }> = [];
  const add = (id: string, label: string, sub: string | null = null) => {
    const figure = figureById(id);
    if (figure) cells.push({ figure, label, sub });
  };
  add('races', 'races');
  add('raceMiles', 'miles raced', laps ? `${laps.display} laps` : null);
  add('raceCorners', 'corners taken in races');
  add('raceTimeAll', 'racing, start to flag');
  add('venues', countries ? `tracks in ${countries.display} countries` : 'tracks');
  add('milesBetweenTracks', 'miles between tracks', 'in straight lines, race to race');
  if (cells.length === 0) return null;
  const hasFloor = cells.some((cell) => cell.figure.class === 'lower_bound');
  return (
    <section className="home-career" aria-labelledby="home-career-title">
      <h2 id="home-career-title">His career so far</h2>
      {races && span ? (
        <p className="home-sub">
          {races.display} races{seriesCount ? ` in ${seriesCount} series` : ''},{' '}
          {formatDate(span.firstDay, { month: 'long', year: 'numeric' })} to{' '}
          {formatDate(span.lastDay, { month: 'long', year: 'numeric' })}.
        </p>
      ) : null}
      <Link to="/career" className="home-odo" aria-label="His career so far: open the career page">
        {cells.map(({ figure, label, sub }) => (
          <span key={figure.id} className={`home-odo__cell home-odo__cell--${figure.class}`} data-figure-id={figure.id}>
            <b>
              <FigureValue display={figure.display} />
            </b>
            <span className="home-odo__label">{label}</span>
            {sub ? <em>{sub}</em> : null}
          </span>
        ))}
      </Link>
      <p className="home-note">
        {hasFloor ? 'A + marks a floor: the true figure is at least this. ' : ''}
        <Link to="/career">How each figure is worked out →</Link>
      </p>
    </section>
  );
};

/* ---------- the standout races: homeStandouts.tsx ---------- */

/* ---------- the rest of the site, as plain links ---------- */

const MoreLinks = () => (
  <section className="home-more" aria-label="More on BryceCast">
    <Link to="/races" className="home-more__item">
      <span className="home-more__title">Races →</span>
      <span>Every INDY NXT race he has run, each with a debrief. Captured races replay second by second.</span>
    </Link>
    <Link to="/tracks" className="home-more__item">
      <span className="home-more__title">Tracks →</span>
      <span>His pace at each INDY NXT track, section by section, from the official timing loops.</span>
    </Link>
    <Link to="/live" className="home-more__item">
      <span className="home-more__title">Live →</span>
      <span>Position, gaps and the cars around him while a session runs. Off-season it replays a race.</span>
    </Link>
    <Link to="/race-week" className="home-more__item">
      <span className="home-more__title">Race Week →</span>
      <span>
        The next weekend’s schedule, forecast and his record at the track. Off-season, the {nextSeasonOutlook.seasonYear} dates so
        far.
      </span>
    </Link>
  </section>
);

/* ---------- screen ---------- */

export const HomeScreen = ({ readiness }: { readiness: ReadinessStatus }) => {
  const state = readiness.payload?.state;
  const liveish = state === 'ready' || state === 'degraded';

  /* The latest race's debrief pack, for the share of the field he beat. */
  const [latestPack, setLatestPack] = useState<ArchiveEntry | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadLatestSeasonDebriefs()
      .then((archive) => {
        if (cancelled || archive.length === 0) return;
        const sorted = [...archive].sort((a, b) => chronoCompare(a.pack, b.pack));
        setLatestPack(sorted[sorted.length - 1] ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const review = getSeasonReview();
  const nextEvent = getNextEvent();
  const days = nextEvent ? daysUntil(nextEvent) : null;
  /* The reviewed season is over when nothing is on the calendar, or when the
   * next race on it belongs to a later season (a new year's opener announced
   * before any of its races are in the package). */
  const nextEventYear = nextEvent ? Number(raceDayOf(nextEvent).slice(0, 4)) : null;
  const complete =
    review !== null && (getSeasonPhase() === 'complete' || (nextEventYear !== null && nextEventYear > review.seasonYear));
  const nowState = homeNowState(liveish, nextEvent, days);
  const nowOnTop = nowState === 'live' || nowState === 'raceDay';
  const now = nowState ? <HomeNow state={nowState} readiness={readiness} nextEvent={nextEvent} days={days} /> : null;

  return (
    <div className="page home">
      {nowOnTop ? now : null}
      <HomeHero review={review} />
      {nowOnTop ? null : now}
      {review ? <LastTimeOut review={review} latestPack={latestPack} complete={complete} /> : null}
      <CareerSoFar />
      {review ? <Standouts review={review} complete={complete} heroSessionId={HERO_STILL.sessionId} /> : null}
      <MoreLinks />
      <div className="home-fresh">
        <DataFreshness />
      </div>
    </div>
  );
};
