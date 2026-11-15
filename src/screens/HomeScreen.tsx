import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMeasuredWidth } from '../app/charts';
import { asNumber, formatDate, formatGain } from '../app/format';
import { Link } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor } from '../assets/tracks';
import { DataFreshness } from '../app/dataFreshness';
import { uiDataPackage, type UiCareerFigure, type UiSeasonIndexRow } from '../data/uiDataPackage';
import { daysUntil, getNextEvent, raceDayOf } from '../data/upcoming';
import { getSeasonIndex } from '../data/seasons';
import { loadLatestSeasonDebriefs, chronoCompare, type ArchiveEntry } from '../data/debriefArchive';
import { getSeasonPhase, getSeasonReview, type SeasonReview } from '../data/seasonPhase';
import { nextSeasonOutlook } from '../data/nextSeason';
import { resolveHeatSections, sectionObservationsFromLaps } from '../data/sectionObservations';
import { watchableCaptureForRace } from '../data/replayAvailable';
import { ReplayAffordance, useReplayCatalog } from './replayAffordance';
import { useVenueSectionData } from './sectionIntelligence';
import { SeasonShareButton } from './seasonShareCard';
import { HomeNow, homeNowState } from './homeNow';
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
  width: 2400,
  height: 1350,
  credit: 'Map data © OpenStreetMap contributors (ODbL 1.0). Terrain Tiles: Mapzen / Tilezen, data from USGS 3DEP and others.'
};

/** "2026 Grand Prix of Monterey Race 2 R2" → "Grand Prix of Monterey, Race 2";
 *  "2026 INDY NXT by Firestone at Milwaukee Mile" → "Milwaukee Mile". */
const shortRaceName = (raceLabel: string): string =>
  raceLabel
    .replace(/^\d{4}\s+/, '')
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .replace(/\s+R\d$/, '')
    .replace(/\s+(Race \d)$/, ', $1');

const raceDayOfRow = (row: UiSeasonIndexRow): string | null => row.raceDate ?? row.eventStartDate;

const figureById = (id: string): UiCareerFigure | null =>
  uiDataPackage.screens.careerLab.lifeStats?.figures?.find((figure) => figure.id === id) ?? null;

const HomeHero = ({ review }: { review: SeasonReview | null }) => {
  const row = useMemo(() => getSeasonIndex().find((candidate) => candidate.sessionId === HERO_STILL.sessionId) ?? null, []);
  const races = figureById('races');
  const firstYear = uiDataPackage.screens.careerLab.lifeStats?.span?.firstDay?.slice(0, 4) ?? null;
  const isSeasonBest =
    review?.standouts.some((standout) => standout.row.sessionId === HERO_STILL.sessionId && standout.label === 'Season best') ?? false;
  const raceName = row ? `${row.seasonYear ?? ''} ${shortRaceName(row.raceLabel)}`.trim() : null;
  return (
    <section className="home-hero">
      <div className="home-hero__text">
        <h1>Bryce Aron’s racing career, lap by lap.</h1>
        <p>
          Live timing on race day, a pace map of every INDY NXT track he has raced, and
          {races && firstYear ? ` all ${races.display} of his races since ${firstYear}` : ' every race of his career'} in one place.
        </p>
        <div className="home-hero__links">
          {review ? <Link to="/races">The {review.seasonYear} season →</Link> : <Link to="/races">His races →</Link>}
          <Link to="/career">His career in numbers →</Link>
        </div>
      </div>
      <Link
        to={`/races/${encodeURIComponent(HERO_STILL.sessionId)}`}
        className="home-hero__still"
        aria-label={raceName ? `${raceName}: the race page` : 'The race page'}
      >
        <img
          src={HERO_STILL.src}
          srcSet={`${HERO_STILL.src1200} 1200w, ${HERO_STILL.src} 2400w`}
          sizes="(max-width: 760px) 100vw, 66vw"
          width={HERO_STILL.width}
          height={HERO_STILL.height}
          alt={`A 3D model of WeatherTech Raceway Laguna Seca with the track shaded section by section by Bryce’s pace${raceName ? ` in the ${raceName}` : ''}.`}
          fetchPriority="high"
          decoding="async"
        />
      </Link>
      <div className="home-hero__cap">
        <p>
          WeatherTech Raceway Laguna Seca{raceName ? `, ${raceName}` : ''}. The film’s 3D model, each section shaded by his pace in
          that race: gold where he was strongest against the field, grey where it was tougher.
          <span className="home-hero__credit">{HERO_STILL.credit}</span>
        </p>
        {row && row.finishPosition !== null ? (
          <span className="home-hero__result">
            P{row.finishPosition}
            {row.startPosition !== null ? ` from P${row.startPosition} on the grid` : ''}
            {isSeasonBest ? ', his season best' : ''}
          </span>
        ) : null}
      </div>
    </section>
  );
};

/* ---------- last time out: one line, the replay beside it ---------- */

const LastTimeOut = ({ review, latestPack, complete }: { review: SeasonReview; latestPack: ArchiveEntry | null; complete: boolean }) => {
  const catalog = useReplayCatalog();
  const row = review.rows[review.rows.length - 1];
  if (!row) return null;
  const finish = row.finishPosition;
  const start = row.startPosition;
  const gain = finish !== null && start !== null ? formatGain(start - finish) : null;
  /* The share of the field he beat comes from the race's own debrief pack,
   * shown only once that pack has loaded and is the same race. */
  const percentile =
    latestPack && latestPack.pack.sessionId === row.sessionId
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
        <b>P{rank}</b> in the {review.seasonYear} championship{points !== null ? ` on ${points} points` : ''} after {review.races}{' '}
        {review.races === 1 ? 'race' : 'races'}.
      </>
    );

  return (
    <section className="home-line home-last" aria-label="Last time out">
      <Link to={racePath} className="home-last__result">
        <span className="home-label">Last time out · {shortRaceName(row.raceLabel)}</span>
        <span className="home-line__big">{finish !== null ? `P${finish}` : '—'}</span>
      </Link>
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
        ) : (
          <Link to={racePath} className="home-textlink">
            The race, lap by lap →
          </Link>
        )}
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
          if (part === '+') return <span key={key} className="home-odo__plus">+</span>;
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
  const cells: Array<{ figure: UiCareerFigure; label: string; sub: string | null }> = [];
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
          {formatDate(span.firstDay, { month: 'long', year: 'numeric' })} to {formatDate(span.lastDay, { month: 'long', year: 'numeric' })}.
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

/* ---------- the standout races, drawn large ----------
 * The season review's standouts (season best, then the biggest charges through
 * the field, clean days only), each venue shaded by his pace in that race,
 * from the same section packs and anchors the race page uses. */

const StandoutArt = ({ trackName, sessionId }: { trackName: string | null; sessionId: string }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const outline = trackOutlineFor(trackName);
  const sections = useVenueSectionData(outline?.name ?? trackName);
  const resolved = useMemo(() => {
    if (!sections.anchors) return [];
    const visit = sections.visits.find((pack) => pack.sessionId === sessionId);
    if (!visit) return [];
    /* That visit's own anchors: a measured pack never joins PDF names. */
    const anchors = sections.anchorsBySession.get(visit.sessionId) ?? sections.anchors;
    return resolveHeatSections(anchors, sectionObservationsFromLaps(visit));
  }, [sessionId, sections.anchors, sections.anchorsBySession, sections.visits]);
  const maxHeight = width > 0 && width < 480 ? 230 : 290;
  return (
    <div ref={ref} className="home-race__art">
      {outline && width > 0 ? (
        <div className="home-race__draw">
          <TrackArt
            outline={outline}
            maxHeight={maxHeight}
            wind={null}
            showCornerLabels={false}
            strokeScale={2}
            sections={resolved.length > 0 ? { resolved, showLabels: false } : null}
          />
        </div>
      ) : null}
    </div>
  );
};

const Standouts = ({ review, complete }: { review: SeasonReview; complete: boolean }) => {
  if (review.standouts.length === 0) return null;
  return (
    <section className="home-standouts" aria-labelledby="home-standouts-title">
      <h2 id="home-standouts-title">
        Standout races of {review.seasonYear}
        {complete ? '' : ' so far'}
      </h2>
      <p className="home-sub">Each track shaded by his pace in that race, section by section.</p>
      <div className="home-races">
        {review.standouts.map(({ row, label }) => {
          const date = raceDayOfRow(row);
          return (
            <Link key={row.sessionId} to={`/races/${encodeURIComponent(row.sessionId)}`} className="home-race">
              <StandoutArt trackName={row.trackName} sessionId={row.sessionId} />
              <span className="home-race__pos">
                <b>{row.finishPosition !== null ? `P${row.finishPosition}` : '—'}</b>
                {row.startPosition !== null ? <span>from P{row.startPosition} on the grid</span> : null}
              </span>
              <span className="home-race__name">{shortRaceName(row.raceLabel)}</span>
              <span className="home-race__meta">
                {date ? `${formatDate(date, { month: 'long', day: 'numeric' })} · ` : ''}
                {label.charAt(0).toLowerCase() + label.slice(1)}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

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
      {review ? <Standouts review={review} complete={complete} /> : null}
      <MoreLinks />
      <div className="home-fresh">
        <DataFreshness />
      </div>
    </div>
  );
};
