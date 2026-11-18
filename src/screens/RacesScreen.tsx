import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, ScreenHead, SourcePill, Unavailable } from '../app/components';
import { chartFont, useMeasuredWidth, PointerOpen } from '../app/charts';
import { useTapPreview } from '../app/tapPreview';
import { formatDate, formatGain, formatNumber, formatPosition } from '../app/format';
import { Link, useRouter } from '../app/router';
import { getSeasonIndex } from '../data/seasons';
import { getUpcomingEvents, raceDayOf, type UpcomingPrepEvent } from '../data/upcoming';
import { liveArchiveUpgradeFor, type LiveArchiveUpgrade } from '../data/liveRaceShellModel';
import type { LiveReadiness } from '../app/useReadiness';
import type { UiSeasonIndexRow } from '../data/uiDataPackage';
import { DataFreshness } from '../app/dataFreshness';
import { chapterTint } from './careerExplorer';
import { fieldSizeFor, useArchiveRaces, type ArchiveRace } from './careerRaceList';
import { beatLine, placeLine } from '../app/raceFacts';
import { RaceStillCard, RowPicture } from './racesPeek';
import { AlsoInYear, EarlierSeason } from './racesEarlier';
import { anyWet, RainStreaks, wetFor } from './raceWet';
import { switchValue } from '../review/switches';
import { FieldSeason, seasonLook } from './races/fieldSeason';
import { firstWinsOf, indyMarks, indyTitle } from './races/seasonMarks';
import { EarlierDrawer, type EarlierSummary } from './races/earlierDrawer';
import './fieldFloor.css';
import './race.css';

/* ---------- the row's track ----------
 * Career round 2 (Jack, Nov 17: "change the 2D track shape on the races page
 * … to maybe the 3D model somehow, the same way it appears in the pop-ups"):
 * each row shows the venue's 3D still (racesPeek RowPicture); the bird's-eye
 * icon and then the line drawing stay only where no model exists.
 * ?racepic=icon shows round seven's bird's-eye icons for comparison. */

const MiniTrack = ({ trackName, sessionId = null, muted = false }: { trackName: string | null; sessionId?: string | null; muted?: boolean }) => (
  <RowPicture venue={{ sessionId, trackName }} muted={muted} />
);

/* ---------- the season spine: finishes + standing, one shared x-axis ---------- */

/* The dot's card: the track's 3D still over the round's numbers, in the
 * Career explorer's grammar (Jack, Nov 17: "when you hover on the 2026 season
 * or the 2025 season, can we make it so that the dot also has the hover
 * behavior of the track shape popping up?"). */
const SpineCard = ({ row, x, y, width, tap }: { row: UiSeasonIndexRow; x: number; y: number; width: number; tap: ReturnType<typeof useTapPreview> }) => {
  const clean = row.officialStatus === 'running';
  const day = row.raceDate ?? row.eventStartDate;
  const field = fieldSizeFor(row.sessionId);
  return (
    <RaceStillCard
      venue={{ sessionId: row.sessionId, trackName: row.trackName }}
      x={x}
      y={y}
      r={7}
      width={width}
      swatch={chapterTint('INDY NXT')}
      meta={[`INDY NXT · Round ${row.roundIndex ?? '—'}`, day ? formatDate(day, { month: 'short', day: 'numeric' }) : null].filter(Boolean).join(' · ')}
      title={indyTitle(row)}
      nums={[placeLine(row.finishPosition, field), beatLine(row.finishPosition, field)].filter(Boolean).join(' · ') || null}
      note={
        [
          row.startPosition !== null && row.finishPosition !== null && row.startPosition !== row.finishPosition ? `started P${row.startPosition}` : null,
          row.points !== null ? `${row.points} pts` : null,
          row.standingRank !== null ? `P${row.standingRank} in points` : null,
          !clean && row.officialStatus && row.officialStatus !== 'unknown' ? `ended early: ${row.officialStatus}` : null,
          wetFor(row.sessionId)?.words ?? null
        ]
          .filter(Boolean)
          .join(' · ') || null
      }
      action="open the race page"
      tap={tap}
    />
  );
};

const SeasonSpine = ({ rows }: { rows: UiSeasonIndexRow[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  /* Round 9: on a phone the first tap on a round reads it, the second (or the card's button) opens it. */
  const tap = useTapPreview();

  const ordered = rows;
  const n = ordered.length;
  if (n < 2) return null;

  /* Round 4 (Jack, Nov 15: "the text on this page needs to be increased a few
   * points"): labels at 14-15 px, the panels a little taller to match. */
  const margin = { top: 30, right: 18, bottom: 30, left: 68 };
  const finishPanelHeight = 180;
  const panelGap = 42;
  const standingPanelHeight = 86;
  const height = margin.top + finishPanelHeight + panelGap + standingPanelHeight + margin.bottom;
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const x = (index: number) => margin.left + (index / (n - 1)) * plotWidth;

  const finishes = ordered.map((row) => row.finishPosition ?? 0);
  /* The field's floor (round 2, intersections; switch fieldfloor: on | off): a
   * short dash per round at last place that day, so P20 of 21 and P20 of 24 read
   * apart. The axis runs to the biggest field so every floor fits. */
  const floorOn = switchValue('fieldfloor') !== 'off';
  const fields = ordered.map((row) => (floorOn ? fieldSizeFor(row.sessionId) : null));
  const worstFinish = Math.max(
    ...finishes,
    ...ordered.map((row) => row.startPosition ?? 1),
    ...fields.filter((value): value is number => value !== null)
  );
  const yFinish = (position: number) => margin.top + ((position - 1) / Math.max(worstFinish, 2)) * finishPanelHeight;

  const standings = ordered.map((row) => row.standingRank).filter((value): value is number => value !== null);
  const standingMin = Math.max(1, Math.min(...standings) - 1);
  const standingMax = Math.max(...standings) + 1;
  const standingTop = margin.top + finishPanelHeight + panelGap;
  const yStanding = (rank: number) =>
    standingTop + ((rank - standingMin) / Math.max(standingMax - standingMin, 1)) * standingPanelHeight;

  const finishTicks = [1, 5, 10, 15, 20, 25].filter((tick) => tick <= worstFinish + (floorOn ? 0 : 1));
  const floorHalf = Math.max(3, Math.min(8, (plotWidth / Math.max(n - 1, 1)) * 0.28));
  const standingTicks = [...new Set([standingMin + 1, standingMax - 1])].filter(
    (tick) => tick >= standingMin && tick <= standingMax
  );
  const labelEvery = width < 560 ? 2 : 1;

  const finishLine = ordered
    .map((row, index) => `${x(index)},${yFinish(row.finishPosition ?? worstFinish)}`)
    .join(' ');
  // Step path (stepAfter): horizontal to the next round's x, then vertical.
  const standingRows = ordered.filter((row) => row.standingRank !== null);
  let standingPath = '';
  standingRows.forEach((row, index) => {
    const pointX = x(ordered.indexOf(row));
    const pointY = yStanding(row.standingRank as number);
    if (index === 0) {
      standingPath = `M${pointX} ${pointY}`;
    } else {
      standingPath += ` H${pointX} V${pointY}`;
    }
  });

  const clearHover = () => setHovered(null);
  const indy = chapterTint('INDY NXT');

  const onMove = (event: React.MouseEvent<Element>): number | null => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const mouseX = event.clientX - bounds.left;
    if (mouseX < margin.left - 12 || mouseX > width - margin.right + 12) {
      clearHover();
      return null;
    }
    const index = Math.min(n - 1, Math.max(0, Math.round(((mouseX - margin.left) / plotWidth) * (n - 1))));
    setHovered(index);
    return index;
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label="Season results and championship standing, round by round"
          {...tap.surface({
            find: onMove,
            clear: clearHover,
            open: (index) => () => navigate(`/races/${encodeURIComponent(ordered[index as number].sessionId)}`)
          })}
          style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
        >
          <text x={margin.left} y={15} fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={15} fontWeight={550}>
            Race finishes
          </text>
          {finishTicks.map((tick) => (
            <g key={`f${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yFinish(tick)} y2={yFinish(tick)} stroke="var(--grid-hairline)" />
              <text
                x={margin.left - 8}
                y={yFinish(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={14}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}
          <text
            x={margin.left}
            y={standingTop - 11}
            fill="var(--ink-secondary)"
            fontFamily={chartFont}
            fontSize={15}
            fontWeight={550}
          >
            Championship standing
          </text>
          {standingTicks.map((tick) => (
            <g key={`s${tick}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={yStanding(tick)}
                y2={yStanding(tick)}
                stroke="var(--grid-hairline)"
              />
              <text
                x={margin.left - 8}
                y={yStanding(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={14}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}

          {hovered !== null ? (
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={margin.top - 6}
              y2={height - margin.bottom + 2}
              stroke="var(--axis-baseline)"
              strokeDasharray="3 3"
            />
          ) : null}

          {fields.map((field, index) =>
            field !== null ? (
              <line
                key={`floor-${ordered[index].sessionId}`}
                className={`field-floor${hovered === index ? ' field-floor--on' : ''}`}
                x1={x(index) - floorHalf}
                x2={x(index) + floorHalf}
                y1={yFinish(field)}
                y2={yFinish(field)}
              />
            ) : null
          )}

          {/* QoL 2 (proxy review 1): the season line in INDY NXT's own gold, so
              gold means one thing site-wide; a top 5 is ringed, as a win is
              on the earlier seasons. */}
          <polyline points={finishLine} fill="none" stroke={indy} strokeWidth={2} strokeLinejoin="round" />
          {ordered.map((row, index) => {
            const clean = row.officialStatus === 'running';
            const topFive = clean && row.finishPosition !== null && row.finishPosition <= 5;
            const pointY = yFinish(row.finishPosition ?? worstFinish);
            const dotR = hovered === index ? 6 : 4.8;
            return (
              <g key={row.sessionId}>
                {topFive ? <circle cx={x(index)} cy={pointY} r={dotR + 3.4} fill="none" stroke="var(--ink-primary)" strokeWidth={1.6} /> : null}
                <circle
                  cx={x(index)}
                  cy={pointY}
                  r={dotR}
                  fill={clean ? indy : 'var(--surface-1)'}
                  stroke={clean ? indy : 'var(--ink-muted)'}
                  strokeWidth={1.6}
                  style={{ transition: 'r 120ms ease' }}
                />
                {(() => {
                  const wet = wetFor(row.sessionId);
                  return wet ? <RainStreaks cx={x(index)} cy={pointY} r={topFive ? dotR + 3.4 : dotR} read={wet} /> : null;
                })()}
              </g>
            );
          })}

          <path d={standingPath} fill="none" stroke="var(--ink-secondary)" strokeWidth={1.7} strokeLinejoin="round" />
          {hovered !== null && ordered[hovered].standingRank !== null ? (
            <circle cx={x(hovered)} cy={yStanding(ordered[hovered].standingRank as number)} r={3.6} fill="var(--ink-secondary)" />
          ) : null}

          {ordered.map((row, index) =>
            index % labelEvery === 0 || index === n - 1 ? (
              <text
                key={`r${row.sessionId}`}
                x={x(index)}
                y={height - 8}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={14}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {row.roundIndex ?? index + 1}
              </text>
            ) : null
          )}
          <text x={margin.left - 8} y={height - 8} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={14}>
            round
          </text>
        </svg>
      ) : null}
      {hovered !== null ? <SpineCard row={ordered[hovered]} x={x(hovered)} y={yFinish(ordered[hovered].finishPosition ?? worstFinish)} width={width} tap={tap} /> : null}
    </div>
  );
};

/* Round 3: the INDY NXT season in the same picture as the years before it
 * (races/fieldSeason.tsx), with its championship standing underneath. */
const IndySeason = ({ rows, season, look }: { rows: UiSeasonIndexRow[]; season: number; look: 'field' | 'share' }) => {
  const marks = useMemo(() => indyMarks(rows), [rows]);
  return <FieldSeason marks={marks} look={look} label={`${season} season: ${rows.length} rounds by weekend, each his finish in that day's field, and his championship standing`} />;
};

/* ---------- list rows: the index under the spine ---------- */

const RaceRow = ({ row }: { row: UiSeasonIndexRow }) => {
  const gain = row.startPosition !== null && row.finishPosition !== null ? formatGain(row.startPosition - row.finishPosition) : null;
  const shortLabel = indyTitle(row);
  const clean = row.officialStatus === 'running';
  /* A ring means the same thing here as on the spine above: a top-5 finish. */
  const topFive = clean && row.finishPosition !== null && row.finishPosition <= 5;
  return (
    <Link to={`/races/${encodeURIComponent(row.sessionId)}`} className="tower__row race-row">
      <span className="figure row race-row__pos">
        {formatPosition(row.finishPosition)}
        {topFive ? <span aria-label="top five" className="race-row__top5" /> : null}
      </span>
      <MiniTrack trackName={row.trackName} sessionId={row.sessionId} />
      {/* Name + status stack vertically (#24): the shared .tower__name is a
          centered flex row, so we flip it to a left-aligned column here. Status
          then sits on its own line under the race name — a long venue never
          truncates it to "mechanic", and it no longer steals the title column. */}
      <span
        className="tower__name"
        style={{ whiteSpace: 'normal', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
      >
        <span>{shortLabel.replace(/ (Race) (\d+)$/, ' $1\u00a0$2')}</span>
        {!clean && row.officialStatus && row.officialStatus !== 'unknown' ? (
          <span className="tower__team">
            {row.officialStatus.charAt(0).toUpperCase() + row.officialStatus.slice(1)}
          </span>
        ) : null}
      </span>
      <span className={`stat__delta stat__delta--${gain?.direction ?? 'flat'}`} style={{ textAlign: 'right' }}>
        {gain ? gain.text : ''}
      </span>
      <span className="tower__gap tnum">{row.points !== null ? `${row.points} pts` : ''}</span>
      <span className="tower__gap race-row__date">
        {(row.raceDate ?? row.eventStartDate) ? formatDate(row.raceDate ?? row.eventStartDate!, { month: 'short', day: 'numeric' }) : ''}
      </span>
      <ArrowRight size={16} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  );
};

const yearSpan = (years: Array<{ year: number }>): string =>
  years.length > 1 ? `${years[years.length - 1].year} to ${years[0].year}` : years.length ? String(years[0].year) : '';

const seasonSummary = (rows: UiSeasonIndexRow[]): string => {
  const finishes = rows.map((row) => row.finishPosition).filter((value): value is number => value !== null);
  if (finishes.length === 0) return '';
  const top10s = finishes.filter((finish) => finish <= 10).length;
  const best = Math.min(...finishes);
  const parts = [`${finishes.length} races`, `best P${best}`];
  if (top10s > 0) parts.push(`${top10s} top-10${top10s === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

/* ---------- remaining season: placeholder rounds, listed but not yet raced ---------- */

interface PlaceholderRound {
  eventId: string;
  trackName: string;
  raceDate: string;
  round: number;
  seasonTotal: number;
  label: string;
}

/** The rounds still to run this season — derived only from the typed adapters,
 *  never invented. The round number continues from the last completed round;
 *  the season total is that round plus the events the schedule still carries.
 *  (Verified 2026-07-19: 13 completed rounds + 4 upcoming = a 17-race season,
 *  matching the canonical INDY NXT schedule feed.) */
const remainingRoundsFor = (completed: UiSeasonIndexRow[], upcoming: UpcomingPrepEvent[]): PlaceholderRound[] => {
  if (upcoming.length === 0 || completed.length === 0) return [];
  const lastRun = Math.max(...completed.map((row) => row.roundIndex ?? 0));
  const seasonTotal = lastRun + upcoming.length;
  return upcoming.map((event, index) => ({
    eventId: event.eventId,
    trackName: event.trackName,
    raceDate: raceDayOf(event),
    round: lastRun + index + 1,
    seasonTotal,
    label: indyTitle({ raceLabel: event.eventName, sessionId: event.eventId, trackName: event.trackName })
  }));
};

/* One placeholder row: the archive's grammar (outline mini in its fixed box,
 * series prefix trimmed, date) but quieter and honestly non-interactive — no
 * result numerals, no chevron, no link. It becomes a real, clickable row only
 * once the race has run and its results land in the package.
 *
 * The moment this round's race goes live (the shell exists), the row upgrades
 * IN PLACE: a quiet ink dot + "LIVE", and the row opens the race's live page —
 * the same URL that will hold the finished story forever (Brief R-c). */
const UpcomingRaceRow = ({ round, live }: { round: PlaceholderRound; live: LiveArchiveUpgrade | null }) =>
  live ? (
    <Link to={`/races/${encodeURIComponent(live.sessionId)}`} className="tower__row race-row--upcoming race-row--live">
      <MiniTrack trackName={round.trackName} />
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {round.label}
        <span className="tower__team">
          race {round.round} of {round.seasonTotal}
        </span>
      </span>
      <span
        className="row tnum"
        style={{ gap: 6, fontSize: 15, fontWeight: 650, color: 'var(--ink-primary)', justifyContent: 'flex-end' }}
      >
        {/* The spec's QUIET INK dot — never the status green; the archive is
            not a health indicator, it just points at the live page. */}
        <span className="live-dot" style={{ background: 'var(--ink-primary)' }} aria-hidden />
        LIVE
      </span>
      <ArrowRight size={16} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  ) : (
    <div className="tower__row race-row--upcoming" aria-disabled="true">
      <MiniTrack trackName={round.trackName} muted />
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {round.label}
        <span className="tower__team">
          race {round.round} of {round.seasonTotal}
        </span>
      </span>
      <span className="tower__gap race-row__when" style={{ color: 'var(--ink-muted)' }}>
        {round.raceDate ? formatDate(round.raceDate, { month: 'short', day: 'numeric' }) : ''}
      </span>
    </div>
  );

/* The remaining-season block no longer carries its own source control: its
 * schedule entry and caveats fold into the season card's one SourcePill (see
 * RacesScreen), so a single card keeps a single source drawer. */
const RemainingSeason = ({
  season,
  rounds,
  livePayload
}: {
  season: number;
  rounds: PlaceholderRound[];
  livePayload: LiveReadiness | null;
}) => (
  <div className="race-upcoming">
    <div className="race-upcoming__head">
      <p className="caption caption--secondary" style={{ margin: 0 }}>
        The rest of {season}: {rounds.length} round{rounds.length === 1 ? '' : 's'} still to run. Each opens once it&rsquo;s been
        raced.
      </p>
    </div>
    <div className="tower race-upcoming__list" style={{ margin: '4px -12px 0' }}>
      {/* Latest first, like every list on this page: the whole archive reads as
          one timeline running down into the past, so the season finale sits at
          the top and the next race sits right above the most recent result. */}
      {[...rounds].reverse().map((round) => (
        <UpcomingRaceRow key={round.eventId} round={round} live={liveArchiveUpgradeFor(round.eventId, livePayload)} />
      ))}
    </div>
  </div>
);

/* Scroll to a season and keep it there while the page above it settles (a
 * drawer year's charts measure and draw after it opens). Any wheel, touch or
 * key from the reader lets go at once. */
const pinToSeason = (id: string, smooth: boolean) => {
  const node = () => document.getElementById(id);
  node()?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
  let stop = false;
  const cancel = () => {
    stop = true;
  };
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  events.forEach((name) => window.addEventListener(name, cancel, { passive: true }));
  const done = () => events.forEach((name) => window.removeEventListener(name, cancel));
  const t0 = performance.now();
  let last = Number.NaN;
  const check = () => {
    const el = node();
    if (stop || !el) return done();
    const top = el.getBoundingClientRect().top;
    const want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
    /* once a smooth scroll has come to rest, put it right if the page moved under it */
    if (Math.abs(top - last) < 0.5 && Math.abs(top - want) > 2) el.scrollIntoView({ block: 'start' });
    last = top;
    if (performance.now() - t0 < 1800) requestAnimationFrame(check);
    else done();
  };
  requestAnimationFrame(check);
};

/* ---------- the years, as one line of jump links ----------
 * Eight seasons, newest first: the year, how many races, a swatch per series.
 * A link scrolls to its season card. */
const YearIndex = ({
  years,
  beforeOpen
}: {
  years: Array<{ year: number; count: number; series: string[] }>;
  /** Opens the 2023-and-earlier drawer when a year inside it is picked. */
  beforeOpen: (year: number) => boolean;
}) => (
  <nav className="races-years" aria-label="Seasons">
    {years.map(({ year, count, series }) => (
      <a
        key={year}
        href={`#season-${year}`}
        className="races-years__year"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          const waited = beforeOpen(year);
          /* a year in the drawer exists once the drawer has rendered open */
          if (waited) window.setTimeout(() => pinToSeason(`season-${year}`, true), 60);
          else pinToSeason(`season-${year}`, true);
        }}
      >
        <span className="races-years__label">{year}</span>
        <span className="races-years__count">
          <span className="races-years__swatches" aria-hidden>
            {series.map((name) => (
              <i key={name} style={{ background: chapterTint(name) }} />
            ))}
          </span>
          {count}
        </span>
      </a>
    ))}
  </nav>
);

export const RacesScreen = ({ livePayload = null }: { livePayload?: LiveReadiness | null }) => {
  const index = getSeasonIndex();
  const archive = useArchiveRaces();
  const archiveByYear = useMemo(() => {
    const byYear = new Map<number, ArchiveRace[]>();
    for (const race of archive) {
      const list = byYear.get(race.seasonYear) ?? [];
      list.push(race);
      byYear.set(race.seasonYear, list);
    }
    return byYear;
  }, [archive]);
  const total = index.length + archive.length;

  const seasons = useMemo(() => {
    const bySeason = new Map<number, UiSeasonIndexRow[]>();
    for (const row of index) {
      const year = row.seasonYear ?? 0;
      const list = bySeason.get(year) ?? [];
      list.push(row);
      bySeason.set(year, list);
    }
    // rows arrive chronological; seasons newest-first, spine ascending, list newest-first
    return [...bySeason.entries()].sort((a, b) => b[0] - a[0]);
  }, [index]);

  // Upcoming events grouped by season year (soonest first — the adapter sorts
  // ascending by weekend start). Only seasons with a completed card below get
  // their remaining rounds shown; the source is the package's upcoming events.
  const upcomingBySeason = useMemo(() => {
    const bySeason = new Map<number, UpcomingPrepEvent[]>();
    for (const event of getUpcomingEvents()) {
      const year = Number(event.eventStartDate.slice(0, 4));
      if (!Number.isFinite(year)) continue;
      const list = bySeason.get(year) ?? [];
      list.push(event);
      bySeason.set(year, list);
    }
    return bySeason;
  }, []);

  const indyYears = new Set(seasons.map(([season]) => season));
  const allYears = [...new Set([...indyYears, ...archiveByYear.keys()])].sort((a, b) => b - a);
  const years = allYears.map((year) => {
    const others = archiveByYear.get(year) ?? [];
    const series = [...(indyYears.has(year) ? ['INDY NXT'] : []), ...new Set(others.map((race) => race.seriesName))];
    const indyCount = seasons.find(([season]) => season === year)?.[1].length ?? 0;
    return { year, count: indyCount + others.length, series };
  });
  const firstWins = useMemo(() => firstWinsOf(archive), [archive]);
  const look = seasonLook();

  /* Round 3 (Jack, Nov 18): the years before INDY NXT sit behind one
   * disclosure, "2023 and earlier"; the INDY NXT seasons stay as they are. */
  const firstIndy = indyYears.size ? Math.min(...indyYears) : Infinity;
  const earlierYears = allYears.filter((year) => year < firstIndy && !indyYears.has(year));
  const laterYears = allYears.filter((year) => !earlierYears.includes(year));
  const earlierSummary = useMemo((): EarlierSummary | null => {
    if (!earlierYears.length) return null;
    const races = earlierYears.flatMap((year) => archiveByYear.get(year) ?? []);
    const series = new Map<string, string>();
    for (const race of [...races].sort((a, b) => a.day.localeCompare(b.day))) if (!series.has(race.seriesName)) series.set(race.seriesName, race.seriesShort);
    return {
      first: Math.min(...earlierYears),
      last: Math.max(...earlierYears),
      races: races.length,
      series: [...series.entries()].map(([name, short]) => ({ name, short }))
    };
    // earlierYears is derived from archiveByYear and the index
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archiveByYear, earlierYears.join(',')]);

  const [drawer, setDrawer] = useState<{ open: boolean; instant: boolean }>(() => {
    const hash = typeof window === 'undefined' ? '' : window.location.hash;
    const year = Number(hash.replace('#season-', ''));
    return { open: switchValue('racesyears') === 'open' || (hash.startsWith('#season-') && year < firstIndy), instant: true };
  });
  const openFor = useCallback(
    (year: number): boolean => {
      if (year >= firstIndy || drawer.open) return false;
      setDrawer({ open: true, instant: true });
      return true;
    },
    [firstIndy, drawer.open]
  );
  /* An address that ends #season-2019 lands on that year once it has drawn. */
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith('#season-') || Number(hash.slice(8)) >= firstIndy) return;
    const timer = window.setTimeout(() => pinToSeason(hash.slice(1), false), 60);
    return () => window.clearTimeout(timer);
    // once, on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page stack races-index">
      <ScreenHead
        kicker="The archive"
        title="Races"
        sub={
          total > 0
            ? `All ${formatNumber(total, 0)} of his races, ${yearSpan(years)}: INDY NXT from the official results and timing, the years before from each series’ results.`
            : 'His races, from the official results and timing.'
        }
      />
      <DataFreshness />
      {years.length > 1 ? <YearIndex years={years} beforeOpen={openFor} /> : null}
      {total === 0 ? (
        <Card>
          <Unavailable>No completed races in the package yet.</Unavailable>
        </Card>
      ) : (
        <>
        {laterYears.map((season) => {
          const rows = seasons.find(([year]) => year === season)?.[1] ?? null;
          const others = archiveByYear.get(season) ?? [];
          if (!rows) return <EarlierSeason key={season} year={season} races={others} firstWins={firstWins} />;
          const remaining = remainingRoundsFor(rows, upcomingBySeason.get(season) ?? []);
          return (
          <div key={season} id={`season-${season}`} className="races-season">
          <Card
            title={`${season} season`}
            action={
              <span className="row" style={{ gap: 12 }}>
                <span className="caption caption--secondary">{seasonSummary(rows)}</span>
                <SourcePill
                  title={`${season} season index`}
                  entries={[
                    {
                      label: 'Official results · every completed race',
                      path: 'analysis/predictive-race-intelligence/output/context-packs/race-debriefs/',
                      note: 'Start, finish, points, and official result status per round, from the race-debrief packs.'
                    },
                    {
                      label: 'Championship progression',
                      path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv',
                      note: 'Standing after each round from official points progression.'
                    },
                    // Folded in from the former remaining-season pill: the same
                    // card now speaks with one source control.
                    ...(remaining.length > 0
                      ? [
                          {
                            label: 'Remaining rounds · official schedule',
                            path: 'analysis/predictive-race-intelligence/output/context-packs/upcoming-events/',
                            note: 'Venue, date, and running order for the rounds still to come, from the upcoming-event context packs.'
                          }
                        ]
                      : [])
                  ]}
                  caveats={[
                    'Standing is recorded after each round; mid-season rows shift as the season goes on.',
                    ...(remaining.length > 0
                      ? [
                          'Round numbers continue from the last completed round; the season total is that round plus the rounds still scheduled.',
                          'These rounds have not been raced, so no result is shown and the row does not open yet.'
                        ]
                      : [])
                  ]}
                />
              </span>
            }
          >
            {/* The season's shape leads the card; the rounds still to run sit
                between it and the completed rows, so the whole card reads as
                one timeline — future at the top, past running down. */}
            {look === 'old' ? (
              <p className="caption caption--secondary races-index__legend">
                A ring marks a top-5 finish · a hollow dot a day that ended early
                {anyWet(rows.map((row) => row.sessionId)) ? ' · rain streaks a wet track' : ''}
                {switchValue('fieldfloor') !== 'off' ? ' · a short dash marks last place in that day’s field' : ''} · the quiet line is his championship position ·{' '}
                <PointerOpen what="any round" />
              </p>
            ) : (
              <p className="caption caption--secondary races-index__legend">
                {look === 'share' ? 'Dot: the share of the field he beat, a win at the top' : 'Dot: his finish, P1 at the top · line below it: the cars he beat'} · grey line:
                his weekend average · ring: a top 5 · hollow: ended early
                {anyWet(rows.map((row) => row.sessionId)) ? ' · streaks: a wet track' : ''} · <PointerOpen what="any round" />
              </p>
            )}
            {look === 'old' ? <SeasonSpine rows={rows} /> : <IndySeason rows={rows} season={season} look={look} />}
            {remaining.length > 0 ? <RemainingSeason season={season} rounds={remaining} livePayload={livePayload} /> : null}
            <div className="tower" style={{ margin: '10px -12px 0' }}>
              {[...rows].reverse().map((row) => (
                <RaceRow key={row.sessionId} row={row} />
              ))}
            </div>
            {others.length > 0 ? <AlsoInYear year={season} races={others} firstWins={firstWins} /> : null}
          </Card>
          </div>
          );
        })}
        {earlierSummary ? (
          <EarlierDrawer
            open={drawer.open}
            instant={drawer.instant}
            onToggle={() => setDrawer((value) => ({ open: !value.open, instant: false }))}
            summary={earlierSummary}
          >
            {() => earlierYears.map((season) => <EarlierSeason key={season} year={season} races={archiveByYear.get(season) ?? []} firstWins={firstWins} />)}
          </EarlierDrawer>
        ) : null}
        </>
      )}
    </div>
  );
};
