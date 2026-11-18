import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, LineChart, Map as MapIcon, PlayCircle, Radio } from 'lucide-react';
import { Card, Countdown, HeroPanel, ScreenHead, SourcePill, Unavailable } from '../app/components';
import { formatDate, formatPosition } from '../app/format';
import { Link } from '../app/router';
import { TrackArt, TrackIcon } from '../app/trackArt';
import { TrackStill } from '../app/trackStill';
import { trackOutlineFor } from '../assets/tracks';
import { nextSeasonOutlook } from '../data/nextSeason';
import { bestFinishAt, getSeasonReview, racesAt, type SeasonReview, type SeasonStandout, type SeasonVenue } from '../data/seasonPhase';
import { getUpcomingEvents, raceDayOf } from '../data/upcoming';
import { raceStillSectionsFor, useVenueSectionData } from './sectionIntelligence';
import { labelledRaceTitle } from './careerRaceNames';

/** /tracks deep links use the canonical (outline) venue name. */
const tracksHref = (trackName: string | null): string =>
  `/tracks?venue=${encodeURIComponent(trackOutlineFor(trackName)?.name ?? trackName ?? '')}`;

/** The site's one race name (careerRaceNames): "Grand Prix of Monterey · Race 2", or the plain event. */
const shortRaceLabel = (row: { raceLabel: string; sessionId: string; trackName: string | null }): string =>
  labelledRaceTitle({ raceLabel: row.raceLabel, sessionId: row.sessionId, trackName: row.trackName });

/* ---------- a venue mark: the 3D model from above ----------
 * Round 7 (Jack's review of Nov 16): the board's marks are the venues' 3D
 * models seen from straight above, the track a bold ink ribbon (TrackIcon in
 * app/trackArt.tsx), at the board's size (132 x 84) or the Races list's
 * (76 x 42) for a smaller mark. A venue with no model keeps the line drawing;
 * ?icons=line shows the line drawings for comparison. */

export const VenueShape = ({
  trackName,
  width = 64,
  height = 40,
  muted = false
}: {
  trackName: string | null;
  width?: number;
  height?: number;
  muted?: boolean;
}) => {
  const outline = trackOutlineFor(trackName);
  const line = outline ? (
        <svg viewBox={outline.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <path
            d={outline.mainPath}
            fill="none"
            stroke={muted ? 'var(--ink-muted)' : 'var(--ink-primary)'}
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      ) : null;
  return (
    <span
      className={`venue-shape${muted ? ' venue-shape--muted' : ''}`}
      style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
    >
      <TrackIcon slug={outline?.slug} box={width >= 100 ? 'board' : 'row'} muted={muted} fallback={line} />
    </span>
  );
};

/* ---------- a venue drawn with his pace on it ----------
 * The signature read, reusable at any size: the venue outline shaded section by
 * section. With a sessionId it shades from that race; otherwise from the most
 * recent visit that carries clean-lap comparisons. Falls back to the plain
 * outline while packs load or where a venue has no anchored sections. */

export const HeatTrack = ({
  trackName,
  sessionId,
  maxHeight = 120,
  interactive = true,
  fallback
}: {
  trackName: string | null;
  sessionId?: string;
  maxHeight?: number;
  /** Point at a section to read it (off where the card itself is the link). */
  interactive?: boolean;
  /** Drawn instead where the venue has no 3D model (default: the 2D drawing,
   *  shaded the same way). */
  fallback?: ReactNode;
}) => {
  const outline = trackOutlineFor(trackName);
  const canonical = outline?.name ?? trackName;
  const sections = useVenueSectionData(canonical);
  /* The race named, else the most recent visit with clean-lap comparisons;
   * shaded as the Tracks page's model shades it (round 6: the 3D still of the
   * model where the venue has one, the 2D drawing shaded the same way where
   * it does not). */
  const shaded = useMemo(() => {
    if (!sections.anchors || !outline) return null;
    const named = sessionId ? sections.visits.find((pack) => pack.sessionId === sessionId) ?? null : null;
    for (const visit of [named, sections.mostRecent]) {
      if (!visit) continue;
      /* That visit's own anchors: a measured pack never joins PDF names. */
      const visitAnchors = sections.anchorsBySession.get(visit.sessionId) ?? sections.anchors;
      const own = raceStillSectionsFor(visit, visitAnchors, outline);
      if (own.heat.length > 0) return { sessionId: visit.sessionId, ...own };
    }
    return null;
  }, [sessionId, outline, sections.anchors, sections.anchorsBySession, sections.visits, sections.mostRecent]);
  if (!outline) return null;
  return (
    <div className="heat-track" style={{ width: '100%', maxWidth: Math.round((maxHeight * 1200) / 676), margin: '0 auto' }}>
      <TrackStill
        slug={outline.slug}
        sessionId={shaded?.sessionId ?? null}
        sections={shaded?.sections ?? []}
        interactive={interactive && maxHeight >= 120}
        alt={`${outline.name}: the 3D track${shaded ? ', shaded section by section by his pace' : ''}.`}
        sizes={`${Math.round((maxHeight * 1200) / 676)}px`}
        fallback={
          fallback ?? (
            <TrackArt
              outline={outline}
              maxHeight={maxHeight}
              wind={null}
              showCornerLabels={false}
              sections={shaded ? { resolved: shaded.heat, showLabels: false } : null}
            />
          )
        }
      />
    </div>
  );
};

/* ---------- the showcase: the season's tracks, each shaded by his pace ----------
 * The hero art for a finished season. Every venue mounts once (its section pack
 * loads lazily) and the stack cross-fades on a slow clock, so the landing page
 * shows the site's signature read — a pace map — across the whole year instead
 * of holding on the last place we happened to race. Reduced motion holds still. */

const ShowcaseSlide = ({ trackName, active }: { trackName: string; active: boolean }) => (
  <div className={`showcase__slide${active ? ' showcase__slide--active' : ''}`} aria-hidden={!active}>
    <HeatTrack trackName={trackName} maxHeight={210} interactive={false} />
  </div>
);

export const TrackShowcase = ({ venues, seasonYear }: { venues: SeasonVenue[]; seasonYear: number }) => {
  const slides = useMemo(() => venues.filter((venue) => trackOutlineFor(venue.trackName)).slice(0, 8), [venues]);
  const [index, setIndex] = useState(0);
  /* Mount slides progressively: the active one and the next, then keep them. */
  const [mounted, setMounted] = useState(1);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return undefined;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return undefined;
    const timer = setInterval(() => setIndex((value) => (value + 1) % slides.length), 4200);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  useEffect(() => {
    setMounted((value) => Math.min(slides.length, Math.max(value, index + 2)));
  }, [index, slides.length]);

  if (slides.length === 0) return null;
  const current = slides[index];
  return (
    <div
      className="showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="showcase__stage">
        {slides.slice(0, mounted).map((venue, slideIndex) => (
          <ShowcaseSlide key={venue.trackName} trackName={venue.trackName} active={slideIndex === index} />
        ))}
      </div>
      <Link to={tracksHref(current.trackName)} className="showcase__caption">
        <span className="showcase__venue">{trackOutlineFor(current.trackName)?.name ?? current.trackName}</span>
        <span className="caption caption--secondary">
          shaded by his {seasonYear} pace, section by section
          {current.bestFinish !== null && current.bestFinish <= 10 ? ` · ${formatPosition(current.bestFinish)} here` : ''}
        </span>
      </Link>
      {slides.length > 1 ? (
        <div className="showcase__dots" role="tablist" aria-label="Season tracks">
          {slides.map((venue, slideIndex) => (
            <button
              key={venue.trackName}
              type="button"
              role="tab"
              aria-selected={slideIndex === index}
              aria-label={venue.trackName}
              className={`showcase__dot${slideIndex === index ? ' showcase__dot--active' : ''}`}
              onClick={() => {
                setIndex(slideIndex);
                setPaused(true);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

/* ---------- Home hero for a finished season: say what this place is ---------- */

export const SeasonCompleteHero = ({ review }: { review: SeasonReview }) => (
  <HeroPanel tint="bryce" className="hero--wash">
    <div className="hero-now">
      <div className="hero-now__head">
        <span className="kicker">BryceCast · No. 9 · INDY NXT</span>
        <h1 className="hero-now__title" style={{ marginTop: 6 }}>Bryce Aron’s racing career, lap by lap.</h1>
        <p className="hero-now__meta" style={{ maxWidth: '46ch', lineHeight: 1.45 }}>
          Live timing on race day. A pace map of every track, built from timing loops instead of GPS. And a career
          charted across ten series, from Formula F to the doorstep of INDYCAR.
        </p>
      </div>

      <div className="hero-now__art">
        <TrackShowcase venues={[...review.venues].reverse()} seasonYear={review.seasonYear} />
      </div>

      <div className="hero-now__foot">
        <span className="caption">
          {review.seasonYear} season complete · {nextSeasonOutlook.seasonYear} calendar on the way
        </span>
        <div className="row row--wrap" style={{ gap: 20 }}>
          <Link to="/races" className="hero-now__action">
            The {review.seasonYear} season in review <ArrowRight size={16} aria-hidden />
          </Link>
          <Link to="/career" className="hero-now__action">
            Career <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  </HeroPanel>
);

/* ---------- what's inside: four doors into the site ----------
 * Each door carries one hue and one small, real visual — heat-mapped tracks,
 * the latest replays, the career's chapters by race count, the live cadence —
 * so the landing page shows the product instead of describing it. */

type DoorTone = 'gold' | 'blue' | 'green' | 'live';

const Door = ({ to, tone, icon, title, children, visual }: { to: string; tone: DoorTone; icon: ReactNode; title: string; children: ReactNode; visual?: ReactNode }) => (
  <Link to={to} className={`door door--${tone}`}>
    <span className="door__icon" aria-hidden>{icon}</span>
    <span className="door__title">
      {title} <ArrowRight size={14} aria-hidden />
    </span>
    <span className="door__copy">{children}</span>
    {visual ? <span className="door__visual">{visual}</span> : null}
  </Link>
);

export interface CareerChapter {
  name: string;
  races: number;
}

/* One ink ramp, light to dark, with the current series in gold — the career's
 * chapters by race count without a second palette on the landing page. */
const chapterShade = (index: number, total: number): string =>
  index === 0 ? 'var(--bryce)' : `color-mix(in srgb, var(--ink-primary) ${Math.round(62 - (44 * (index - 1)) / Math.max(1, total - 2))}%, var(--surface-0))`;

export const FeatureDoors = ({
  review,
  careerRaces,
  chapters
}: {
  review: SeasonReview;
  careerRaces: number | null;
  chapters: CareerChapter[];
}) => {
  const heatVenues = [...review.venues].reverse().slice(0, 3);
  const latestRaces = [...review.rows].reverse().slice(0, 3);
  const chapterTotal = chapters.reduce((sum, chapter) => sum + chapter.races, 0);
  return (
    <section aria-label="What’s inside BryceCast">
      <h2 className="section-title">What’s inside</h2>
      <div className="doors">
        <Door
          to="/tracks"
          tone="gold"
          icon={<MapIcon size={18} />}
          title="Pace maps without GPS"
          visual={
            <span className="door__tracks">
              {heatVenues.map((venue) => (
                <HeatTrack key={venue.trackName} trackName={venue.trackName} maxHeight={64} interactive={false} />
              ))}
            </span>
          }
        >
          The timing feed carries no car positions. Section times between timing loops become a stretch-by-stretch map
          of where he was quickest — for races and qualifying.
        </Door>
        <Door
          to="/races"
          tone="blue"
          icon={<PlayCircle size={18} />}
          title="Any race, replayed"
          visual={
            <span className="door__list">
              {latestRaces.map((row) => (
                <span key={row.sessionId} className="door__list-row">
                  <PlayCircle size={13} aria-hidden />
                  <span>{shortRaceLabel(row)}</span>
                  <span className="tnum">{formatPosition(row.finishPosition)}</span>
                </span>
              ))}
            </span>
          }
        >
          Every INDY NXT race gets a full debrief, and captured races replay second by second — running order, gaps
          and the battles around the No. 9 as they unfolded.
        </Door>
        <Door
          to="/career"
          tone="green"
          icon={<LineChart size={18} />}
          title="The whole career, one chart"
          visual={
            chapterTotal > 0 ? (
              <span className="door__chapters">
                <span className="door__chapter-bar" aria-hidden>
                  {chapters.map((chapter, index) => (
                    <span key={chapter.name} style={{ flexGrow: chapter.races, background: chapterShade(index, chapters.length) }} />
                  ))}
                </span>
                <span className="caption caption--secondary">
                  {chapters.slice(0, 4).map((chapter) => `${chapter.name} ${chapter.races}`).join(' · ')}
                  {chapters.length > 4 ? ` · +${chapters.length - 4} more` : ''}
                </span>
              </span>
            ) : undefined
          }
        >
          {careerRaces ?? 'Every'} races across {chapters.length || 'ten'} series, each placed by the share of the
          field he beat, with weather and rivals alongside.
        </Door>
        <Door
          to="/live"
          tone="live"
          icon={<Radio size={18} />}
          title="Live on race day"
          visual={
            <span className="door__pulse">
              <span className="door__pulse-dot" aria-hidden />
              <span className="caption caption--secondary">arms itself 45 minutes before a session · one-second timing</span>
            </span>
          }
        >
          When a session goes green the site wakes up on its own: position, gaps, the fight around him and conditions
          at the track. Off-season, the Live page replays a race so you can see it run.
        </Door>
      </div>
    </section>
  );
};

/* ---------- next season's calendar ----------
 * The packaged INDY NXT window wins the moment it exists; until then this shows
 * the INDYCAR weekends announced so far, labeled as exactly that. */

export const NextSeasonCalendar = ({ compact = false }: { compact?: boolean }) => {
  const published = getUpcomingEvents();
  const outlook = nextSeasonOutlook;
  const rows: { key: string; date: string; title: string; sub: string | null; trackName: string | null }[] =
    published.length > 0
      ? published.map((event) => ({
          key: event.eventId,
          date: raceDayOf(event),
          title: event.eventName,
          sub: event.trackName,
          trackName: event.trackName
        }))
      : outlook.indycarWeekends.map((weekend) => ({
          key: weekend.date,
          date: weekend.date,
          title: weekend.venue,
          sub: weekend.eventName ?? null,
          trackName: weekend.trackName
        }));
  const pending = published.length === 0;
  const shown = compact ? rows.slice(0, 5) : rows;

  return (
    <Card
      title={
        <>
          <CalendarDays size={15} aria-hidden />
          {pending ? `${outlook.seasonYear}: the dates so far` : 'The calendar ahead'}
        </>
      }
      action={
        pending ? (
          <SourcePill
            title={`${outlook.seasonYear} schedule`}
            entries={[
              {
                label: outlook.source.label,
                path: outlook.source.url,
                note: `Checked ${formatDate(outlook.checkedOn, { month: 'long', day: 'numeric', year: 'numeric' })}`
              }
            ]}
            caveats={['INDY NXT by Firestone has not published its own 2027 calendar. These are NTT INDYCAR SERIES race dates; INDY NXT rounds run on INDYCAR weekends but not all of them.']}
          />
        ) : undefined
      }
    >
      {pending ? (
        <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>
          INDY NXT’s own {outlook.seasonYear} calendar isn’t out yet. INDYCAR has announced its first eight race
          weekends. INDY NXT shares most of them, and its own rounds take over this list once they’re published.
        </p>
      ) : null}
      <div className="tower">
        {shown.map((row) => {
          const best = bestFinishAt(row.trackName);
          return (
            <div key={row.key} className="tower__row cal-row">
              <span className="cal-row__date tnum">
                <span className="cal-row__month">{formatDate(row.date, { month: 'short' })}</span>
                <span className="cal-row__day">{formatDate(row.date, { day: 'numeric' })}</span>
              </span>
              <VenueShape trackName={row.trackName} width={52} height={32} />
              <span className="tower__name" style={{ whiteSpace: 'normal', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span>{row.title}</span>
                {row.sub ? <span className="tower__team">{row.sub}</span> : null}
              </span>
              <span className="tower__gap" style={{ fontSize: 12, textAlign: 'right' }}>
                {best ? (
                  <Link to={tracksHref(row.trackName)} className="navlink" style={{ padding: 0, fontSize: 12 }}>
                    {best.finish <= 10 ? `his best here ${formatPosition(best.finish)}` : 'his laps here'} →
                  </Link>
                ) : pending ? (
                  <span style={{ color: 'var(--ink-muted)' }}>INDYCAR weekend</span>
                ) : null}
              </span>
            </div>
          );
        })}
      </div>
      {compact && rows.length > shown.length ? (
        <Link to="/race-week" className="navlink" style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 13, padding: '12px 2px 0' }}>
          All {rows.length} dates <ArrowRight size={12} aria-hidden />
        </Link>
      ) : null}
    </Card>
  );
};

/* ---------- the season in review (Race Week's off-season face) ---------- */

const StandoutCard = ({ standout }: { standout: SeasonStandout }) => {
  const { row, label } = standout;
  return (
    <Link to={`/races/${encodeURIComponent(row.sessionId)}`} className="standout">
      <span className="standout__label">{label}</span>
      <span className="standout__art">
        <HeatTrack trackName={row.trackName} sessionId={row.sessionId} maxHeight={150} interactive={false} />
      </span>
      <span className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <span className="stat__value stat__value--big">{formatPosition(row.finishPosition)}</span>
        {row.startPosition !== null ? <span className="caption">from {formatPosition(row.startPosition)} on the grid</span> : null}
      </span>
      <span className="standout__name">{shortRaceLabel(row)}</span>
      <span className="caption caption--secondary">
        {formatDate(row.raceDate ?? row.eventStartDate, { month: 'long', day: 'numeric' })} · shaded by his pace that day · full debrief →
      </span>
    </Link>
  );
};

/** One honest sentence on the shape of the year — only ever built from what the
 *  results show, and silent when there's no clear shape. */
export const seasonArcLine = (review: SeasonReview): string | null => {
  const parts: string[] = [];
  if (review.closingTop10Run >= 2) {
    parts.push(`He closed the year with ${review.closingTop10Run} straight top-10 finishes`);
  }
  if (review.halves) {
    const first = Math.round(review.halves.first);
    const second = Math.round(review.halves.second);
    parts.push(
      parts.length > 0
        ? `and his average finish moved from P${first} in the first half to P${second} in the second`
        : `His average finish moved from P${first} in the first half of the year to P${second} in the second`
    );
  }
  return parts.length > 0 ? `${parts.join(', ')}.` : null;
};

export const SeasonStandouts = ({ review }: { review: SeasonReview }) =>
  review.standouts.length > 0 ? (
    <section aria-label="Standout races">
      <h2 className="section-title">Standout races of {review.seasonYear}</h2>
      <div className="standouts">
        {review.standouts.map((standout) => (
          <StandoutCard key={standout.row.sessionId} standout={standout} />
        ))}
      </div>
    </section>
  ) : null;

/* ---------- Race Week, off-season: the road to next season ----------
 * Race Week always faces forward (Races owns the look back). With no weekend to
 * prepare for it becomes the next season's board: a countdown to the first
 * announced weekend, then every known date as a venue card — the track shaded
 * by his most recent pace there, and his history at the place. The in-season
 * HQ returns untouched the moment the package carries an upcoming event. */

const historyLine = (trackName: string | null): string | null => {
  const races = racesAt(trackName);
  if (races.length === 0) return null;
  const years = [...new Set(races.map((row) => row.seasonYear).filter((year): year is number => year !== null))];
  const best = bestFinishAt(trackName);
  const count = `${races.length} INDY NXT race${races.length === 1 ? '' : 's'} here (${years.join(', ')})`;
  return best && best.finish <= 10 ? `${count} · best ${formatPosition(best.finish)}` : count;
};

const WeekendCard = ({ date, venue, eventName, trackName }: { date: string; venue: string; eventName?: string; trackName: string | null }) => {
  const history = historyLine(trackName);
  const hasOutline = trackOutlineFor(trackName ?? venue) !== null;
  const body = (
    <>
      <span className="weekend__date tnum">
        <span className="cal-row__month">{formatDate(date, { month: 'short' })}</span>
        <span className="weekend__day">{formatDate(date, { day: 'numeric' })}</span>
        <span className="cal-row__month">{formatDate(date, { weekday: 'short' })}</span>
      </span>
      <span className="weekend__art">
        {/* Plain outlines on every card: most of next year's venues have no laps
            of his yet, and a board that is half pace maps reads as half broken.
            The pace map is one tap away where it exists. */}
        {hasOutline ? <VenueShape trackName={trackName ?? venue} width={132} height={84} muted={!history} /> : null}
      </span>
      <span className="weekend__text">
        <span className="weekend__venue">{venue}</span>
        {eventName ? <span className="caption">{eventName}</span> : null}
        <span className="caption caption--secondary">
          {history ? `${history} · his pace map →` : 'INDYCAR weekend · INDY NXT round not yet confirmed'}
        </span>
      </span>
    </>
  );
  return history ? (
    <Link to={tracksHref(trackName)} className="weekend weekend--known">{body}</Link>
  ) : (
    <div className="weekend">{body}</div>
  );
};

export const OffSeasonRaceWeek = () => {
  const review = getSeasonReview();
  const outlook = nextSeasonOutlook;
  const opener = outlook.indycarWeekends[0] ?? null;
  if (!opener) {
    return (
      <div className="page stack">
        <ScreenHead kicker="Race week" title="Off-season" />
        <Card>
          <Unavailable>The next event appears here as soon as the calendar is published.</Unavailable>
        </Card>
      </div>
    );
  }
  return (
    <div className="page stack">
      <ScreenHead
        kicker="Race week · off-season"
        title={`The road to ${outlook.seasonYear}.`}
        sub={`Race week is where the next weekend gets prepared. With ${review ? review.seasonYear : 'the season'} complete, it turns to the calendar ahead: every ${outlook.seasonYear} date announced so far, and what he has already done at each place.`}
      />

      <HeroPanel tint="bryce" className="hero--wash">
        <div className="hero-now">
          <div className="hero-now__head">
            <span className="kicker">First weekend on the board</span>
            <h2 className="hero-now__title" style={{ marginTop: 6 }}>{opener.venue}</h2>
            <p className="hero-now__meta">
              {formatDate(opener.date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · the NTT INDYCAR
              SERIES opener. INDY NXT’s own {outlook.seasonYear} calendar is still to come.
            </p>
          </div>
          {/* Round 7 (Jack: "too small for Streets of St. Petersburg"): the still fills
              its column (up to 760 x 428), centred on the words beside it. */}
          <div className="hero-now__art hero-now__art--fill">
            <HeatTrack trackName={opener.trackName} maxHeight={430} />
            {racesAt(opener.trackName).length > 0 ? (
              <p className="caption caption--secondary" style={{ margin: '8px 0 0', textAlign: 'center' }}>
                shaded by his most recent pace here
              </p>
            ) : null}
          </div>
          <div className="hero-now__foot">
            <Countdown to={`${opener.date}T12:00:00`} />
          </div>
        </div>
      </HeroPanel>

      <section aria-label={`${outlook.seasonYear} dates`}>
        <div className="row row--between" style={{ alignItems: 'baseline', gap: 12 }}>
          <h2 className="section-title">{outlook.seasonYear}: the dates so far</h2>
          <SourcePill
            title={`${outlook.seasonYear} schedule`}
            entries={[
              {
                label: outlook.source.label,
                path: outlook.source.url,
                note: `Checked ${formatDate(outlook.checkedOn, { month: 'long', day: 'numeric', year: 'numeric' })}`
              }
            ]}
            caveats={['INDY NXT by Firestone has not published its own calendar for this season. These are NTT INDYCAR SERIES race dates; INDY NXT rounds run on INDYCAR weekends but not all of them.']}
          />
        </div>
        <p style={{ margin: '0 2px 12px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '68ch' }}>
          INDYCAR has announced its first {outlook.indycarWeekends.length} race weekends. INDY NXT shares most INDYCAR
          weekends, and its own rounds take over this board once they’re published.
        </p>
        <div className="weekends">
          {outlook.indycarWeekends.map((weekend) => (
            <WeekendCard key={weekend.date} date={weekend.date} venue={weekend.venue} eventName={weekend.eventName} trackName={weekend.trackName ?? weekend.venue} />
          ))}
        </div>
      </section>

      <div className="grid grid--2 grid--equal">
        <section className="panel panel--quiet">
          <span className="kicker">When race week returns</span>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
            In the days before a race this page becomes the weekend’s headquarters: the session schedule with a live
            countdown, the race-hour forecast and wind drawn on the track, his section-by-section record at the venue,
            how past races there unfolded, and the points picture going in. It switches over on its own.
          </p>
        </section>
        <Link to="/races" className="panel panel--quiet" style={{ color: 'inherit', textDecoration: 'none' }}>
          <span className="kicker">Looking back</span>
          <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
            {review
              ? `${review.races} races, ${review.points ?? '—'} points, P${review.finalRank ?? '—'} in the championship. Every ${review.seasonYear} race has a full debrief, and captured races replay second by second.`
              : 'Every race has a full debrief.'}
          </p>
          <span className="hero-now__action" style={{ marginTop: 12, fontSize: 14 }}>
            The {review?.seasonYear ?? ''} season, race by race <ArrowRight size={15} aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
};
