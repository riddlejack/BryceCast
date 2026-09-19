import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, CalendarDays, LineChart, Map as MapIcon, PlayCircle, Radio } from 'lucide-react';
import { Card, HeroPanel, ScreenHead, SourcePill, Stat, Unavailable } from '../app/components';
import { formatDate, formatPosition } from '../app/format';
import { Link } from '../app/router';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor } from '../assets/tracks';
import { displayRaceLabelText } from '../data/debriefArchive';
import { nextSeasonOutlook } from '../data/nextSeason';
import { bestFinishAt, getSeasonReview, type SeasonReview, type SeasonStandout, type SeasonVenue } from '../data/seasonPhase';
import { getUpcomingEvents, raceDayOf } from '../data/upcoming';
import { useVenueSectionData } from './sectionIntelligence';

/** /tracks deep links use the canonical (outline) venue name. */
const tracksHref = (trackName: string | null): string =>
  `/tracks?venue=${encodeURIComponent(trackOutlineFor(trackName)?.name ?? trackName ?? '')}`;

const shortRaceLabel = (raceLabel: string): string =>
  displayRaceLabelText(raceLabel)
    .replace(/^\d{4}\s+/, '')
    .replace(/^INDY NXT by Firestone at (the )?/i, '')
    .replace(/\s+R[12]$/, '');

/* ---------- a venue outline, letterboxed (no measurement needed) ---------- */

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
  return (
    <span style={{ width, height, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {outline ? (
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
      ) : null}
    </span>
  );
};

/* ---------- the showcase: the season's tracks, each shaded by his pace ----------
 * The hero art for a finished season. Every venue mounts once (its section pack
 * loads lazily) and the stack cross-fades on a slow clock, so the landing page
 * shows the site's signature read — a pace map — across the whole year instead
 * of holding on the last place we happened to race. Reduced motion holds still. */

const ShowcaseSlide = ({ trackName, active }: { trackName: string; active: boolean }) => {
  const outline = trackOutlineFor(trackName);
  const sections = useVenueSectionData(trackName);
  const heat = sections.heroHeat.length > 0 ? { resolved: sections.heroHeat, showLabels: false } : null;
  if (!outline) return null;
  return (
    <div className={`showcase__slide${active ? ' showcase__slide--active' : ''}`} aria-hidden={!active}>
      <TrackArt outline={outline} maxHeight={210} wind={null} sections={heat} />
    </div>
  );
};

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
  <HeroPanel tint="bryce">
    <div className="hero-now">
      <div className="hero-now__head">
        <span className="kicker">BryceCast · No. 9 · INDY NXT</span>
        <h1 className="hero-now__title" style={{ marginTop: 6 }}>Bryce Aron’s racing career, lap by lap.</h1>
        <p className="hero-now__meta" style={{ maxWidth: '46ch', lineHeight: 1.45 }}>
          Live timing on race day. A pace map of every track, built from timing loops instead of GPS. And a career
          charted across seven series, from F1600 to the doorstep of INDYCAR.
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
          <Link to="/race-week" className="hero-now__action">
            The {review.seasonYear} season in review <ArrowRight size={16} aria-hidden />
          </Link>
          <Link to="/career" className="hero-now__action">
            Career Lab <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  </HeroPanel>
);

/* ---------- what's inside: four doors into the site ---------- */

const Door = ({ to, icon, title, children, visual }: { to: string; icon: ReactNode; title: string; children: ReactNode; visual?: ReactNode }) => (
  <Link to={to} className="door">
    <span className="door__icon" aria-hidden>{icon}</span>
    <span className="door__title">
      {title} <ArrowRight size={14} aria-hidden />
    </span>
    <span className="door__copy">{children}</span>
    {visual ? <span className="door__visual">{visual}</span> : null}
  </Link>
);

export const FeatureDoors = ({ venues, careerRaces, seriesCount }: { venues: SeasonVenue[]; careerRaces: number | null; seriesCount: number | null }) => (
  <section aria-label="What’s inside BryceCast">
    <h2 className="section-title">What’s inside</h2>
    <div className="doors">
      <Door
        to="/tracks"
        icon={<MapIcon size={18} />}
        title="Pace maps without GPS"
        visual={
          <span className="row" style={{ gap: 10 }}>
            {venues.slice(0, 4).map((venue) => (
              <VenueShape key={venue.trackName} trackName={venue.trackName} width={46} height={28} muted />
            ))}
          </span>
        }
      >
        The timing feed carries no car positions. Section times between timing loops become a stretch-by-stretch map of
        where he was quickest — for races and qualifying, at every track.
      </Door>
      <Door to="/races" icon={<PlayCircle size={18} />} title="Any race, replayed">
        Every INDY NXT race gets a full debrief, and captured races replay second by second — running order, gaps and
        the battles around the No. 9 as they unfolded.
      </Door>
      <Door to="/career" icon={<LineChart size={18} />} title="The whole career, one chart">
        {careerRaces ?? 'Every'} races across {seriesCount ?? 'seven'} series, each placed by the share of the field he
        beat, with weather and rivals alongside.
      </Door>
      <Door to="/live" icon={<Radio size={18} />} title="Live on race day">
        When a session goes green the site wakes up on its own: position, gaps, the fight around him and conditions at
        the track, refreshed every second.
      </Door>
    </div>
  </section>
);

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
          weekends — INDY NXT shares most of them, and its own rounds take over this list once they’re published.
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
      <span className="caption">{label}</span>
      <VenueShape trackName={row.trackName} width={120} height={72} />
      <span className="row" style={{ gap: 10, alignItems: 'baseline' }}>
        <span className="stat__value stat__value--big">{formatPosition(row.finishPosition)}</span>
        {row.startPosition !== null ? <span className="caption">from {formatPosition(row.startPosition)}</span> : null}
      </span>
      <span className="standout__name">{shortRaceLabel(row.raceLabel)}</span>
      <span className="caption caption--secondary">
        {formatDate(row.raceDate ?? row.eventStartDate, { month: 'long', day: 'numeric' })} · full debrief →
      </span>
    </Link>
  );
};

export const SeasonReviewStats = ({ review }: { review: SeasonReview }) => (
  <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
    <Stat label="Championship" value={review.finalRank !== null ? `P${review.finalRank}` : '—'} />
    <Stat label="Points" value={review.points ?? '—'} />
    <Stat label="Top 10s" value={review.top10s} />
    <Stat label="Best finish" value={review.bestFinish !== null ? `P${review.bestFinish}` : '—'} />
    <Stat label="Races" value={review.races} />
  </div>
);

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
      <h2 className="section-title">Standout races</h2>
      <div className="standouts">
        {review.standouts.map((standout) => (
          <StandoutCard key={standout.row.sessionId} standout={standout} />
        ))}
      </div>
    </section>
  ) : null;

export const SeasonVenues = ({ review }: { review: SeasonReview }) => (
  <section aria-label="Track by track">
    <h2 className="section-title">Track by track</h2>
    <div className="venue-grid">
      {review.venues.map((venue) => (
        <Link key={venue.trackName} to={tracksHref(venue.trackName)} className="venue-tile">
          <VenueShape trackName={venue.trackName} width={84} height={50} />
          <span className="venue-tile__name">{trackOutlineFor(venue.trackName)?.name ?? venue.trackName}</span>
          <span className="caption tnum">
            {venue.rows
              .map((row) => (row.officialStatus && row.officialStatus !== 'running' && row.officialStatus !== 'unknown' ? 'ended early' : formatPosition(row.finishPosition)))
              .join(' · ')}
          </span>
        </Link>
      ))}
    </div>
  </section>
);

/* ---------- Race Week, off-season ----------
 * With no weekend to prepare for, the page looks back over the finished year
 * and ahead to the next calendar. The in-season HQ returns untouched the moment
 * the package carries an upcoming event. */

export const OffSeasonRaceWeek = () => {
  const review = getSeasonReview();
  if (!review) {
    return (
      <div className="page stack">
        <ScreenHead kicker="Race week" title="Off-season" />
        <Card>
          <Unavailable>The next event appears here as soon as the calendar is published.</Unavailable>
        </Card>
      </div>
    );
  }
  const arc = seasonArcLine(review);
  return (
    <div className="page stack">
      <ScreenHead
        kicker="Race week · off-season"
        title={`${review.seasonYear}, in the books.`}
        sub={`${review.races} races at ${review.venues.length} tracks. Race week returns with the ${nextSeasonOutlook.seasonYear} calendar — until then, the year in review and the dates already on the board.`}
      />
      <Card
        title={`The ${review.seasonYear} season`}
        action={
          <Link to="/races" className="navlink" style={{ fontSize: 12.5, padding: '0 2px' }}>
            Every race <ArrowRight size={12} aria-hidden />
          </Link>
        }
      >
        <SeasonReviewStats review={review} />
        {arc ? <p style={{ margin: '14px 0 0', fontSize: 14, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>{arc}</p> : null}
      </Card>
      <SeasonStandouts review={review} />
      <NextSeasonCalendar />
      <SeasonVenues review={review} />
      <section className="panel panel--quiet">
        <span className="kicker">When race week returns</span>
        <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--ink-secondary)', maxWidth: '68ch', lineHeight: 1.5 }}>
          In the days before a race this page becomes the weekend’s headquarters: the session schedule with a live
          countdown, the race-hour forecast and wind drawn on the track, his section-by-section record at the venue, how
          past races there unfolded, and the points picture going in. It switches over on its own when the next event is
          scheduled.
        </p>
      </section>
    </div>
  );
};
