import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SourcePill, Stat, TickerValue, Unavailable } from '../app/components';
import { useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../app/charts';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import {
  uiDataPackage,
  type UiCareerFigure,
  type UiCareerFigureClass,
  type UiCareerLifeStats,
  type UiCareerWeeksGrid
} from '../data/uiDataPackage';
import { getVenueByTrackName } from '../data/venueDossier';
import { liveBryceRowOf } from '../data/livePageModel';
import type { LiveReadiness, ReadinessStatus } from '../app/useReadiness';
import { CareerAtlas, seriesMetaById, seriesOrder } from './careerAtlas';
import { Gb3DepthLayer } from './gb3Depth';
import { FormulaFordDepthLayer } from './formulaFordDepth';
import { DaytonaDepthLayer } from './daytonaDepth';
import { EuroformulaDepthLayer } from './euroformulaDepth';
import { F1600SeasonStory, FormulaFordBridge, FrocCampaignStory, OriginTimeline } from './smallSeriesStories';
import {
  BestClimbs,
  CareerExplorer,
  CareerRestarts,
  QualiConversion,
  ChapterStrip,
  DaytonaChapterBody,
  DaytonaSourcePill,
  RainDays,
  RivalsCard,
  TheClimb,
  chapterTint
} from './careerExplorer';
import './career.css';

type Row = Record<string, string | number | null>;

/* ============================================================
 * Shared bits
 * ============================================================ */

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });


const monthYear = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const longDate = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const dayMs = 86_400_000;
const toTime = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);

const easeOutQuart = (t: number): number => 1 - (1 - Math.min(1, Math.max(0, t))) ** 4;

/** A clock that starts when `active` turns true and runs for `durationMs`. Under
 *  reduced motion it reports "finished" at once, so the final state renders. */
const useClock = (active: boolean, durationMs: number, reduced: boolean): number => {
  const [elapsed, setElapsed] = useState(reduced ? Number.POSITIVE_INFINITY : 0);
  useEffect(() => {
    if (reduced) {
      setElapsed(Number.POSITIVE_INFINITY);
      return undefined;
    }
    if (!active) return undefined;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const value = now - start;
      if (value >= durationMs) {
        setElapsed(Number.POSITIVE_INFINITY);
        return;
      }
      setElapsed(value);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, durationMs, reduced]);
  return elapsed;
};

const classWord: Record<UiCareerFigureClass, string> = {
  counted: 'Counted',
  lower_bound: 'At least',
  modelled_range: 'Modelled'
};

/* ============================================================
 * Rolling numbers: each digit is a wheel, like a car's odometer.
 * The ones wheel turns continuously; a higher wheel turns only as the
 * wheel below it rolls over from 9 to 0. The text comes from the
 * package's ready-made `display` string; only its digits move.
 * ============================================================ */

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

const wheelPosition = (value: number, place: number, lowest: boolean): number => {
  const scaled = value / 10 ** place;
  if (lowest) return scaled % 10;
  const whole = Math.floor(scaled) % 10;
  const below = scaled - Math.floor(scaled);
  return whole + (below > 0.9 ? (below - 0.9) * 10 : 0);
};

const NumberToken = ({ token, progress }: { token: string; progress: number }) => {
  const done = progress >= 1;
  const target = Number(token.replace(/,/g, ''));
  const [intPart, decPart = ''] = token.split('.');
  const intDigits = intPart.replace(/,/g, '').length;
  const decimals = decPart.length;
  const value = target * easeOutQuart(progress);
  let digitIndex = 0;
  return (
    <span className="odo-num">
      {[...token].map((char, index) => {
        if (char < '0' || char > '9') {
          return (
            <span key={index} className="odo-sep">
              {char}
            </span>
          );
        }
        const k = digitIndex;
        digitIndex += 1;
        const place = k < intDigits ? intDigits - 1 - k : -(k - intDigits + 1);
        // Finished: each wheel rests exactly on its printed digit.
        const position = done ? Number(char) : wheelPosition(value, place, place === -decimals);
        const unreached = !done && place > 0 && value < 10 ** place;
        return (
          <span key={index} className={`odo-wheel${unreached ? ' odo-wheel--rest' : ''}`}>
            <span className="odo-wheel__strip" style={{ transform: `translateY(${(-position * 1.1).toFixed(3)}em)` }}>
              {DIGITS.map((digit, digitKey) => (
                <span key={digitKey}>{digit}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
};

/** Splits "71 h 47 min+" into numbers, units and marks, and rolls the numbers. */
const RollingValue = ({ display, progress }: { display: string; progress: number }) => {
  const tokens = display.match(/\d[\d,]*(?:\.\d+)?|[^\d]+/g) ?? [display];
  return (
    <>
      {tokens.map((token, index) => {
        if (/^\d/.test(token)) return <NumberToken key={index} token={token} progress={progress} />;
        return token.split(/([+%])/).map((part, partIndex) => {
          if (!part) return null;
          if (part === '+') return <span key={`${index}-${partIndex}`} className="odo-plus">+</span>;
          if (part === '%') return <span key={`${index}-${partIndex}`} className="odo-pct">%</span>;
          return (
            <span key={`${index}-${partIndex}`} className="odo-unit">
              {part}
            </span>
          );
        });
      })}
    </>
  );
};

/* ============================================================
 * 1. The odometer
 * ============================================================ */

/* The ledger's figures, in reading order: on track, people and places, then
 * the modelled and INDY NXT-only figures. Values always come from the package. */
const ODOMETER_IDS = [
  'races',
  'raceLaps',
  'raceMiles',
  'raceCorners',
  'raceTimeAll',
  'sessionHours',
  'otherDriverRecords',
  'venues',
  'countries',
  'milesBetweenTracks',
  'eventDays',
  'raceWeeks',
  'fuelRaces',
  'indyNxtCautions',
  'indyNxtRetirements'
] as const;

/** Units the label does not already carry. */
const unitSuffix: Partial<Record<string, string>> = {
  fuelRaces: 'US gallons'
};

const figureById = (figures: UiCareerFigure[], id: string): UiCareerFigure | undefined =>
  figures.find((figure) => figure.id === id);

/** During a live (or replayed) session the odometer counts today's on-track
 *  laps as they run — Bryce's completed laps × the canonical venue length. It
 *  never touches the exact sourced career figure above it.
 *
 *  Two guards keep the number honest:
 *  - Laps come only from `bryce.laps`. There is NO heartbeat-lap fallback: the
 *    session leader's lap counter overcounts the moment Bryce is lapped or his
 *    row is missing, so absent `bryce.laps` we render no provisional mileage.
 *  - `covered` is true when the active session is already summed into the exact
 *    career total (its event-session id is in the ledger). A covered session's
 *    laps are shown as a replay preview only and are NEVER added to the total —
 *    that double-count is what produced the false 7,053.
 *
 *  Absent a live session nothing extra renders. */
const liveOdometerIncrement = (live: LiveReadiness | null, coveredEventSessionIds: Set<string>) => {
  if (!live) return null;
  if (live.state !== 'ready' && live.state !== 'degraded') return null;
  const heartbeat = (live.liveTiming as Record<string, unknown> | undefined)?.heartbeat as
    | Record<string, unknown>
    | undefined;
  const trackName = asString(heartbeat?.trackName);
  if (!trackName) return null;
  const venue = getVenueByTrackName(trackName);
  const lengthMi = venue?.lengthMi ?? null;
  if (lengthMi === null || lengthMi <= 0) return null;
  const bryce = liveBryceRowOf(live);
  const laps = asNumber(bryce?.laps);
  if (laps === null || laps <= 0) return null;
  const rawSessionId = heartbeat?.eventSessionId;
  const activeSessionId = rawSessionId == null ? '' : String(rawSessionId).trim();
  const covered = activeSessionId.length > 0 && coveredEventSessionIds.has(activeSessionId);
  return { laps, lengthMi, trackName, todayMiles: laps * lengthMi, activeSessionId, covered };
};

const splitNamedSource = (source: string): { name: string; url: string } => {
  const separator = source.indexOf(' | ');
  if (separator < 0) return { name: source, url: '' };
  return { name: source.slice(0, separator), url: source.slice(separator + 3) };
};

const OdometerLive = ({ lifeStats, live }: { lifeStats: UiCareerLifeStats; live: LiveReadiness | null }) => {
  /* The ledger stores full session ids (session_indy_nxt_2026_6755); the live
   * feed reports the bare event-session id (6755). Match on the trailing token
   * so a replay of an already-counted race dedups against the exact total. */
  const coveredEventSessionIds = new Set(
    (lifeStats.coveredSessionIds ?? []).map((id) => id.slice(id.lastIndexOf('_') + 1)).filter(Boolean)
  );
  const liveToday = liveOdometerIncrement(live, coveredEventSessionIds);
  // Only fold today's laps into the exact career figure when the session is NOT
  // already counted; a covered replay leaves the total untouched.
  const provisionalTotalMiles =
    liveToday && !liveToday.covered ? lifeStats.personalRaceMileage.miles + liveToday.todayMiles : null;
  if (liveToday && liveToday.covered) {
    /* Already in the exact total — preview the replay's laps, add nothing.
     * This is the guard against the false 7,053. */
    return (
      <div className="odometer-live odometer-live--preview">
        <span className="caption">Replay preview</span>
        <TickerValue className="odometer-live__value" value={`+${wholeNumber.format(liveToday.todayMiles)} mi`} valueKey={liveToday.laps} />
        <p className="caption caption--secondary odometer-live__note">
          {wholeNumber.format(liveToday.laps)} {liveToday.laps === 1 ? 'lap' : 'laps'} × {liveToday.lengthMi.toFixed(2)} mi at{' '}
          {liveToday.trackName}. This session already counts in the miles raced above, so replaying it adds nothing.
        </p>
      </div>
    );
  }
  if (liveToday && provisionalTotalMiles !== null) {
    /* A session not yet in the ledger (a live race in progress). Today's laps
     * lead; the total including today stays subordinate. */
    return (
      <div className="odometer-live">
        <span className="caption">Today, provisional</span>
        <TickerValue className="odometer-live__value" value={`+${wholeNumber.format(liveToday.todayMiles)} mi today`} valueKey={liveToday.laps} />
        <p className="caption caption--secondary odometer-live__note">
          {wholeNumber.format(provisionalTotalMiles)} mi including today · {wholeNumber.format(liveToday.laps)}{' '}
          {liveToday.laps === 1 ? 'lap' : 'laps'} × {liveToday.lengthMi.toFixed(2)} mi at {liveToday.trackName}. Reconciled with
          official results after the flag.
        </p>
      </div>
    );
  }
  return null;
};

const OdometerCell = ({ figure, progress }: { figure: UiCareerFigure; progress: number }) => {
  const unit = unitSuffix[figure.id];
  const people =
    figure.id.startsWith('otherDriverRecords') && figure.range
      ? `${wholeNumber.format(figure.range.low)} to ${wholeNumber.format(figure.range.high)} people`
      : null;
  const parts = figure.parts && figure.id.startsWith('indyNxt') ? figure.parts.map((part) => `${part.value} ${part.label}`).join(', ') : null;
  const denominator = figure.denominator
    ? `of ${wholeNumber.format(figure.denominator.value)} ${figure.denominator.unit}${figure.id === 'eventDays' ? ' from his first race meeting to his latest' : ''}`
    : null;
  const subLine = [denominator, people, parts, figure.scope !== 'career' ? figure.scope : null].filter(Boolean).join(' · ');
  /* The caveat shows where it changes how the number reads: why a floor is a
   * floor, what a model assumes, and what a narrower scope leaves out. */
  const showCaveat = figure.caveat && (figure.class !== 'counted' || figure.id === 'indyNxtCautions');
  return (
    <div className={`odo-cell odo-cell--${figure.class}`} data-figure-id={figure.id}>
      <div className="odo-cell__value" aria-label={`${figure.display}${unit ? ` ${unit}` : ''}`}>
        <span aria-hidden>
          <RollingValue display={figure.display} progress={progress} />
        </span>
      </div>
      <div className="odo-cell__label">
        {figure.label}
        {unit ? <span className="odo-cell__unit">, {unit}</span> : null}
      </div>
      {subLine ? <div className="odo-cell__sub">{subLine}</div> : null}
      <p className="odo-cell__how">
        <span className="odo-cell__class">{classWord[figure.class]}.</span> {figure.how}
        {showCaveat ? <span className="odo-cell__caveat"> {figure.caveat}</span> : null}
      </p>
    </div>
  );
};

const Odometer = ({ lifeStats, live }: { lifeStats: UiCareerLifeStats; live: LiveReadiness | null }) => {
  const reduced = useReducedMotion();
  const [viewRef, seen] = useInViewOnce<HTMLDivElement>(0.15);
  const figures = ODOMETER_IDS.map((id) => figureById(lifeStats.figures, id)).filter(
    (figure): figure is UiCareerFigure => figure !== undefined
  );
  const STAGGER = 70;
  const RUN = 2100;
  const elapsed = useClock(seen, RUN + STAGGER * figures.length, reduced);

  const venueSourceEntries = lifeStats.venueSources.flatMap((venue) => [
    ...venue.lengthSources.map((source, index) => {
      const named = splitNamedSource(source);
      return { label: `${venue.trackName} · length${venue.lengthSources.length > 1 ? ` ${index + 1}` : ''}`, path: named.url, note: named.name };
    }),
    ...venue.coordsSources.map((source, index) => {
      const named = splitNamedSource(source);
      return { label: `${venue.trackName} · coordinates${venue.coordsSources.length > 1 ? ` ${index + 1}` : ''}`, path: named.url, note: named.name };
    })
  ]);

  return (
    <section className="career-odometer" aria-labelledby="career-odometer-title">
      <div className="career-section-head">
        <h2 id="career-odometer-title" className="career-section-title">
          The odometer
        </h2>
        <SourcePill
          title="The odometer"
          entries={[...lifeStats.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note })), ...venueSourceEntries]}
          caveats={[
            ...lifeStats.caveats,
            ...Object.entries(lifeStats.figureClasses).map(([key, text]) => `${classWord[key as UiCareerFigureClass]}: ${text}`),
            ...figures.filter((figure) => figure.caveat).map((figure) => `${figure.label}: ${figure.caveat}`)
          ]}
        />
      </div>
      <p className="career-key">
        <span>
          <strong>Counted</strong> {lifeStats.figureClasses.counted.toLowerCase()}
        </span>
        <span>
          <strong>
            At least <span className="odo-plus">+</span>
          </strong>{' '}
          {lifeStats.figureClasses.lower_bound.toLowerCase()}
        </span>
        <span>
          <strong>Modelled</strong> {lifeStats.figureClasses.modelled_range.toLowerCase()}
        </span>
      </p>
      <div ref={viewRef} className="odo-grid">
        {figures.map((figure, index) => (
          <OdometerCell key={figure.id} figure={figure} progress={(elapsed - index * STAGGER) / RUN} />
        ))}
      </div>
      <OdometerLive lifeStats={lifeStats} live={live} />
    </section>
  );
};

/* ============================================================
 * 2. A share of his life
 * ============================================================ */

const LifeLine = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const share = lifeStats.lifeShare;
  const birth = toTime(share.birthDate);
  const end = toTime(share.asOf);
  const first = toTime(lifeStats.span.firstDay);
  const last = toTime(lifeStats.span.lastDay);
  const pad = 2;
  const x = (time: number) => pad + ((time - birth) / (end - birth)) * Math.max(width - pad * 2, 1);
  const raceWeeks = lifeStats.weeksGrid.weeks.filter((week) => week.races.length > 0);
  const birthYear = new Date(birth).getUTCFullYear();
  const endYear = new Date(end).getUTCFullYear();
  const years: number[] = [];
  for (let year = birthYear + 1; year <= endYear; year += 1) years.push(year);
  const narrow = width < 640;
  const height = 92;
  const lineY = 46;
  const ageFirst = figureById(share.figures, 'ageAtFirstRace');
  const ageLast = figureById(share.figures, 'ageAtLastRace');
  return (
    <div ref={ref} className="life-line">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`His life from ${longDate(share.birthDate)} to ${longDate(share.asOf)}, with his racing years from ${longDate(
            lifeStats.span.firstDay
          )} marked and a tick for each of the ${raceWeeks.length} weeks with a race meeting.`}
        >
          <line x1={x(birth)} x2={x(end)} y1={lineY} y2={lineY} stroke="var(--grey-line)" strokeWidth={1} />
          {years.map((year) => {
            const time = Date.UTC(year, 0, 1);
            const yx = x(time);
            /* Year labels every five years, kept clear of the two race labels. */
            const clear = yx < x(first) - 150 || (yx > x(first) + 30 && yx < x(last) - (narrow ? 80 : 150));
            const labelled = year % 5 === 0 && clear;
            return (
              <g key={year}>
                <line x1={yx} x2={yx} y1={lineY + 6} y2={lineY + (year % 5 === 0 ? 12 : 9)} stroke="var(--grey-ink3)" strokeWidth={1} />
                {labelled ? (
                  <text x={yx} y={lineY + 30} textAnchor="middle" className="life-line__year">
                    {year}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line x1={x(first)} x2={x(last)} y1={lineY} y2={lineY} stroke="var(--ink)" strokeWidth={3} />
          {raceWeeks.map((week) => (
            <line
              key={week.isoWeek}
              x1={x(toTime(week.monday) + 3 * dayMs)}
              x2={x(toTime(week.monday) + 3 * dayMs)}
              y1={lineY - 16}
              y2={lineY - 3}
              stroke="var(--amber)"
              strokeWidth={1}
            />
          ))}
          <circle cx={x(birth)} cy={lineY} r={3} fill="var(--ink)" />
          <text x={x(birth)} y={lineY - 12} className="life-line__label" textAnchor="start">
            Born, {monthYear(share.birthDate)}
          </text>
          <text x={x(first) - 8} y={lineY - 12} className="life-line__label" textAnchor="end">
            {narrow ? `First race, ${ageFirst?.display ?? ''}` : `First race, age ${ageFirst?.display ?? ''}`}
          </text>
          <text x={x(last)} y={lineY + 30} className="life-line__label" textAnchor="end">
            {narrow ? `Latest, ${ageLast?.display ?? ''}` : `Latest race, age ${ageLast?.display ?? ''}`}
          </text>
        </svg>
      ) : null}
    </div>
  );
};

const LifeShare = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const share = lifeStats.lifeShare;
  const f = (id: string) => figureById(share.figures, id);
  const eventDays = figureById(lifeStats.figures, 'eventDays');
  const raceWeeks = figureById(lifeStats.figures, 'raceWeeks');
  const ageFirst = f('ageAtFirstRace');
  const ageLast = f('ageAtLastRace');
  const lifePct = f('eventDaysShareOfLife');
  const careerPct = f('eventDaysShareOfCareer');
  const weeksLived = f('weeksLived');
  const daysAlive = f('daysAlive');
  if (!ageFirst || !ageLast || !lifePct || !careerPct || !eventDays) {
    return (
      <section className="career-life">
        <h2 className="career-section-title">A share of his life</h2>
        <Unavailable>The share-of-life figures are not in this data package.</Unavailable>
      </section>
    );
  }
  const big: Array<{ figure: UiCareerFigure; label: string }> = [
    { figure: ageFirst, label: `his age at his first race, ${monthYear(share.firstRaceDate)}` },
    { figure: ageLast, label: `his age at his latest race, ${monthYear(share.lastRaceDate)}` },
    { figure: lifePct, label: 'of his life spent at race meetings' },
    { figure: careerPct, label: 'of the days since his first race' }
  ];
  return (
    <section className="career-life" aria-labelledby="career-life-title">
      <div className="career-section-head">
        <h2 id="career-life-title" className="career-section-title">
          A share of his life
        </h2>
      </div>
      <div className="life-figures">
        {big.map(({ figure, label }) => (
          <div key={figure.id} className="life-figure">
            <span className="life-figure__value">{figure.display}</span>
            <span className="life-figure__label">{label}</span>
          </div>
        ))}
      </div>
      <p className="career-prose">
        Bryce has spent {eventDays.display} days at race meetings. That is {lifePct.display} of the {daysAlive?.display ?? ''} days he has
        been alive, and {careerPct.display} of the {wholeNumber.format(eventDays.denominator?.value ?? lifeStats.span.days)} days from his
        first race meeting to his latest.
        {raceWeeks && weeksLived ? ` ${raceWeeks.display} of the ${weeksLived.display} weeks he has lived held a race meeting.` : ''}
      </p>
      <LifeLine lifeStats={lifeStats} />
    </section>
  );
};

/* ============================================================
 * 3. His career in weeks
 * ============================================================ */

const isoWeekParts = (isoWeek: string): { year: number; week: number } => {
  const [year, week] = isoWeek.split('-W');
  return { year: Number(year), week: Number(week) };
};

/** ISO week number of a UTC date. */
const isoWeekOf = (time: number): number => {
  const date = new Date(time);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / dayMs / 7 - ((firstThursday.getUTCDay() + 6) % 7 - 3) / 7);
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthColumns = MONTHS.map((label, month) => ({ label, week: isoWeekOf(Date.UTC(2021, month, 4)) }));

type GridWeek = UiCareerWeeksGrid['weeks'][number];

const weekColor = (week: GridWeek): string => {
  const seriesId = week.races[0]?.seriesId;
  return seriesId ? seriesMetaById(seriesId).tint : 'none';
};

const WeekDetail = ({ week, coarse }: { week: GridWeek | null; coarse: boolean }) => {
  if (!week) {
    return (
      <p className="weeks-detail weeks-detail--hint">
        {coarse ? 'Tap' : 'Point at'} a filled week to see its race meeting.
      </p>
    );
  }
  const monday = toTime(week.monday);
  const sunday = monday + 6 * dayMs;
  const range = `${new Date(monday).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })} to ${new Date(
    sunday
  ).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
  return (
    <div className="weeks-detail" aria-live="polite">
      <span className="weeks-detail__date">Week of {range}</span>
      {week.races.length === 0 ? (
        <span className="weeks-detail__race">No race meeting</span>
      ) : (
        week.races.map((race) => {
          const meta = seriesMetaById(race.seriesId);
          return (
            <span key={race.eventId} className="weeks-detail__race">
              <i aria-hidden style={{ background: meta.tint }} />
              <strong>{meta.short}</strong> {race.eventName}
              <span className="weeks-detail__meta">
                {race.raceCount === 0
                  ? ' · practice only this week'
                  : ` · ${race.raceCount} ${race.raceCount === 1 ? 'race' : 'races'}${race.bestFinish !== null ? `, best P${race.bestFinish}` : ''}`}
              </span>
            </span>
          );
        })
      )}
    </div>
  );
};

const WeeksGrid = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const grid = lifeStats.weeksGrid;
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const coarse = useCoarsePointer();
  const [active, setActive] = useState<number | null>(null);
  const weeks = grid.weeks;
  const raceWeekIndexes = useMemo(
    () => weeks.flatMap((week, index) => (week.races.length > 0 ? [index] : [])),
    [weeks]
  );
  const years = useMemo(() => [...new Set(weeks.map((week) => isoWeekParts(week.isoWeek).year))], [weeks]);
  const seriesInGrid = useMemo(() => {
    const ids = new Set(weeks.flatMap((week) => week.races.map((race) => race.seriesId)));
    return seriesOrder.filter((id) => ids.has(id));
  }, [weeks]);
  const raceWeeks = figureById(lifeStats.figures, 'raceWeeks');

  /* Two layouts: years as rows on a wide screen (a long band), years as
   * columns on a phone (a tall block). Same cells, same data. */
  const vertical = width > 0 && width < 640;
  const gap = vertical ? 2 : 3;
  const labelW = vertical ? 34 : 50;
  const headH = vertical ? 24 : 24;
  const maxWeek = 53;
  const cellW = vertical
    ? Math.floor((width - labelW - gap * (years.length - 1)) / years.length)
    : Math.max(6, Math.min(30, Math.floor((width - labelW - gap * (maxWeek - 1)) / maxWeek)));
  const cellH = vertical ? 7 : cellW;
  const cellPos = (week: GridWeek) => {
    const { year, week: weekNo } = isoWeekParts(week.isoWeek);
    const row = years.indexOf(year);
    return vertical
      ? { x: labelW + row * (cellW + gap), y: headH + (weekNo - 1) * (cellH + gap) }
      : { x: labelW + (weekNo - 1) * (cellW + gap), y: headH + row * (cellH + gap) };
  };
  const svgW = width;
  const svgH = vertical ? headH + maxWeek * (cellH + gap) : headH + years.length * (cellH + gap);

  const pick = (clientX: number, clientY: number, target: SVGSVGElement): number | null => {
    const bounds = target.getBoundingClientRect();
    const px = clientX - bounds.left;
    const py = clientY - bounds.top;
    let best: { index: number; distance: number } | null = null;
    weeks.forEach((week, index) => {
      const { x, y } = cellPos(week);
      const dx = Math.max(x - px, 0, px - (x + cellW));
      const dy = Math.max(y - py, 0, py - (y + cellH));
      const distance = Math.hypot(dx, dy);
      if (!best || distance < best.distance) best = { index, distance };
    });
    const found = best as { index: number; distance: number } | null;
    return found && found.distance <= (vertical ? 3 : 2) ? found.index : null;
  };

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (raceWeekIndexes.length === 0) return;
    const current = active === null ? -1 : raceWeekIndexes.indexOf(active);
    let next: number | null = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = raceWeekIndexes[Math.min(raceWeekIndexes.length - 1, current + 1)];
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = raceWeekIndexes[Math.max(0, current - 1)];
    else if (event.key === 'Home') next = raceWeekIndexes[0];
    else if (event.key === 'End') next = raceWeekIndexes[raceWeekIndexes.length - 1];
    else if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next !== null && next !== undefined) {
      event.preventDefault();
      setActive(next);
    }
  };

  const activeWeek = active === null ? null : weeks[active];

  return (
    <section className="career-weeks" aria-labelledby="career-weeks-title">
      <div className="career-section-head">
        <h2 id="career-weeks-title" className="career-section-title">
          His career in weeks
        </h2>
      </div>
      <p className="career-lede">
        <span className="career-lede__big">{raceWeeks?.display ?? grid.raceWeekCount}</span> of the {wholeNumber.format(grid.weekCount)} weeks
        from {monthYear(lifeStats.span.firstDay)} to {monthYear(lifeStats.span.lastDay)} held a race meeting. One square is one week, Monday
        to Sunday.
      </p>
      <div ref={ref} className="weeks-grid">
        {width > 0 ? (
          <svg
            width={svgW}
            height={svgH}
            tabIndex={0}
            role="img"
            aria-label={`${grid.weekCount} weeks from ${grid.firstWeek} to ${grid.lastWeek}; ${grid.raceWeekCount} held a race meeting, coloured by series. Use the arrow keys to step through the race weeks.`}
            onPointerMove={(event) => {
              if (event.pointerType === 'touch') return;
              const index = pick(event.clientX, event.clientY, event.currentTarget);
              if (index !== null && weeks[index].races.length > 0) setActive(index);
            }}
            onPointerDown={(event) => {
              const index = pick(event.clientX, event.clientY, event.currentTarget);
              if (index !== null && weeks[index].races.length > 0) setActive(index);
            }}
            onKeyDown={onKey}
          >
            {/* Month labels, set from a reference year's week numbers. */}
            {monthColumns.map((month, index) =>
              vertical ? (
                index % 2 === 0 ? (
                  <text key={month.label} x={0} y={headH + (month.week - 1) * (cellH + gap) + cellH} className="weeks-grid__axis">
                    {month.label}
                  </text>
                ) : null
              ) : (
                <text key={month.label} x={labelW + (month.week - 1) * (cellW + gap)} y={14} className="weeks-grid__axis">
                  {month.label}
                </text>
              )
            )}
            {years.map((year, row) =>
              vertical ? (
                <text
                  key={year}
                  x={labelW + row * (cellW + gap) + cellW / 2}
                  y={14}
                  textAnchor="middle"
                  className="weeks-grid__year"
                >
                  ’{String(year).slice(2)}
                </text>
              ) : (
                <text key={year} x={0} y={headH + row * (cellH + gap) + cellH / 2} dominantBaseline="central" className="weeks-grid__year">
                  {year}
                </text>
              )
            )}
            {weeks.map((week, index) => {
              const { x, y } = cellPos(week);
              const filled = week.races.length > 0;
              const twoSeries = filled && new Set(week.races.map((race) => race.seriesId)).size > 1;
              return (
                <g key={week.isoWeek} data-week={week.isoWeek} data-filled={filled ? 'true' : 'false'}>
                  {filled ? (
                    <rect x={x} y={y} width={cellW} height={cellH} fill={weekColor(week)} />
                  ) : (
                    <rect x={x + 0.5} y={y + 0.5} width={cellW - 1} height={cellH - 1} fill="none" stroke="var(--grey-hair)" />
                  )}
                  {twoSeries ? (
                    <rect
                      x={vertical ? x + cellW / 2 : x}
                      y={vertical ? y : y + cellH / 2}
                      width={vertical ? cellW / 2 : cellW}
                      height={vertical ? cellH : cellH / 2}
                      fill={seriesMetaById(week.races[1].seriesId).tint}
                    />
                  ) : null}
                  {active === index ? (
                    <rect x={x - 2.5} y={y - 2.5} width={cellW + 5} height={cellH + 5} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
      </div>
      <div className="series-key" aria-label="Series colours">
        {seriesInGrid.map((id) => {
          const meta = seriesMetaById(id);
          return (
            <span key={id}>
              <i aria-hidden style={{ background: meta.tint }} />
              {meta.short}
            </span>
          );
        })}
        <span>
          <i aria-hidden className="series-key__empty" />
          No race meeting
        </span>
      </div>
      <WeekDetail week={activeWeek} coarse={coarse} />
    </section>
  );
};

/* ============================================================
 * 6. The chapters: a horizontal timeline, one chapter open at a time
 * ============================================================ */

/* Career chapters in journey order — the climb from F1600 to INDY NXT.
 * Narrative lines are descriptive context only; every number beside them
 * comes from the source-backed series summary. */
const seriesChapters: Array<{ key: string; name: string; years: string; short?: string; narrative: string }> = [
  {
    key: 'f1600',
    name: 'F1600 Championship Series',
    years: '2019',
    short: 'F1600',
    narrative: 'His first season racing cars, in American grassroots open-wheel.'
  },
  {
    key: 'formula-ford',
    name: 'Formula Ford',
    years: '2020',
    narrative: 'A year in the UK’s old school of racecraft, through to the Festival and the Walter Hayes Trophy.'
  },
  {
    key: 'gb3',
    name: 'GB3 Championship',
    years: '2021–22',
    short: 'GB3',
    narrative: 'Two seasons of British junior formula racing against deep international fields.'
  },
  {
    key: 'euroformula',
    name: 'Euroformula Open',
    years: '2023',
    short: 'Euroformula',
    narrative: 'A full European season in continental single-seaters.'
  },
  {
    key: 'fr-oceania',
    name: 'Castrol Toyota Formula Regional Oceania Championship',
    years: '2024',
    short: 'FR Oceania',
    narrative: 'A New Zealand summer in the Toyota series that feeds the junior ladder.'
  },
  {
    key: 'daytona',
    name: 'IMSA WeatherTech SportsCar Championship',
    years: '2025',
    short: 'Daytona 24',
    narrative:
      'One race, twenty-four hours: the Rolex 24 at Daytona in a GTP prototype, shared with three co-drivers through the night.'
  },
  {
    key: 'indy-nxt',
    name: 'INDY NXT',
    years: '2024–26',
    narrative: 'The step below INDYCAR, and the current chapter.'
  }
];

/* Which chapters carry a depth layer. It renders under the open chapter. */
const chapterDepth = (key: string): { title: string; render: () => ReactNode } | undefined => {
  switch (key) {
    case 'f1600':
      return { title: 'The F1600 season, in depth', render: () => <F1600SeasonStory /> };
    case 'formula-ford':
      return { title: 'Formula Ford lap shape', render: () => <FormulaFordDepthLayer /> };
    case 'gb3':
      return { title: 'The GB3 years, in depth', render: () => <Gb3DepthLayer /> };
    case 'euroformula':
      return { title: 'The 2023 season, in depth', render: () => <EuroformulaDepthLayer /> };
    case 'fr-oceania':
      return { title: 'The FR Oceania campaign, in depth', render: () => <FrocCampaignStory /> };
    case 'daytona':
      return { title: 'The 24 hours, in depth', render: () => <DaytonaDepthLayer /> };
    default:
      return undefined;
  }
};

const ChapterPanel = ({
  chapter,
  row,
  current,
  extra
}: {
  chapter: (typeof seriesChapters)[number];
  row: Row | undefined;
  current: boolean;
  extra?: string | null;
}) => {
  const races = row ? asNumber(row.raceRows) : null;
  const oneRace = chapter.key === 'daytona';
  // F1600 ran 21 races but classified 20 (one DNS). The generic raceRows count
  // only classified races, which contradicts the depth story's "21 races". Read
  // the honest split straight from that story so the two agree.
  const f1600Totals = chapter.key === 'f1600' ? uiDataPackage.screens.careerLab.smallSeriesStories.f1600?.totals ?? null : null;
  const depth = chapterDepth(chapter.key);
  return (
    <div className={`journey__chapter chapter-panel${current ? ' journey__chapter--current' : ''}`}>
      <div className="chapter-panel__summary">
        <div className="chapter-panel__head">
          <span className="chapter-panel__years">{chapter.years}</span>
          <h3 className="chapter-panel__name">
            <span aria-hidden className="chapter-panel__dot" style={{ background: chapterTint(chapter.name) }} />
            {chapter.short ?? chapter.name}
          </h3>
          <span className="chapter-panel__count">
            {f1600Totals
              ? `${f1600Totals.classifiedRaces} classified of ${f1600Totals.raceCount} entered`
              : races !== null
                ? `${formatNumber(races, 0)} ${races === 1 ? 'race' : 'races'}`
                : null}
            {oneRace ? <DaytonaSourcePill /> : null}
          </span>
          {chapter.short && chapter.short !== chapter.name && !oneRace ? <span className="chapter-panel__full">{chapter.name}</span> : null}
        </div>
        <div className="chapter-panel__body">
          <p className="chapter-panel__narrative">{chapter.narrative}</p>
          {oneRace ? (
            /* A single dot on a percentile strip says nothing — the one-race
             * chapter gets told as the race it was. */
            <DaytonaChapterBody />
          ) : (
            <>
              {row ? (
                <div className="chapter-panel__stats">
                  <Stat label="Average finish" value={formatNumber(row.avgFinish)} />
                  <Stat label="Field beaten, on average" value={formatPct(row.avgFinishPercentile)} />
                  <Stat label="Top-ten rate" value={formatPct(row.top10RatePct)} />
                </div>
              ) : null}
              <div className="chapter-panel__strip">
                <ChapterStrip seriesName={chapter.name} />
              </div>
              {extra ? <p className="caption caption--secondary chapter-panel__extra">{extra}</p> : null}
            </>
          )}
        </div>
      </div>
      {chapter.key === 'formula-ford' ? (
        <div className="chapter-panel__bridge">
          <FormulaFordBridge />
        </div>
      ) : null}
      {/* The depth layer renders once, under the open chapter's summary. */}
      {depth ? (
        <div className="chapter-panel__depth" data-depth-title={depth.title}>
          <h4 className="chapter-panel__depth-title">{depth.title}</h4>
          {depth.render()}
        </div>
      ) : null}
    </div>
  );
};

const chapterFromHash = (): string | null => {
  if (typeof window === 'undefined') return null;
  const match = window.location.hash.match(/^#chapter-([a-z0-9-]+)$/);
  return match && seriesChapters.some((chapter) => chapter.key === match[1]) ? match[1] : null;
};

const ChapterTimeline = ({ rowByName, lapLine }: { rowByName: Map<string, Row>; lapLine: string | null }) => {
  const [openKey, setOpenKey] = useState<string>(() => chapterFromHash() ?? seriesChapters[seriesChapters.length - 1].key);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const railRef = useRef<HTMLDivElement | null>(null);
  const openIndex = Math.max(0, seriesChapters.findIndex((chapter) => chapter.key === openKey));
  const open = seriesChapters[openIndex];

  /* Keep the open tab in view when the rail scrolls sideways (phone). */
  useEffect(() => {
    const rail = railRef.current;
    const tab = tabRefs.current[openIndex];
    if (!rail || !tab || rail.scrollWidth <= rail.clientWidth) return;
    const left = tab.offsetLeft - (rail.clientWidth - tab.offsetWidth) / 2;
    rail.scrollTo({ left: Math.max(0, left), behavior: 'auto' });
  }, [openIndex]);

  const choose = (key: string) => {
    setOpenKey(key);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      window.history.replaceState(window.history.state, '', `#chapter-${key}`);
    }
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = Math.min(seriesChapters.length - 1, index + 1);
    else if (event.key === 'ArrowLeft') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = seriesChapters.length - 1;
    else return;
    event.preventDefault();
    choose(seriesChapters[next].key);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="career-chapters" aria-labelledby="career-chapters-title">
      <div className="career-section-head">
        <h2 id="career-chapters-title" className="career-section-title">
          The chapters
        </h2>
      </div>
      <div ref={railRef} className="chapter-rail" role="tablist" aria-label="Career chapters">
        {seriesChapters.map((chapter, index) => {
          const selected = index === openIndex;
          const row = rowByName.get(chapter.name);
          const f1600Totals = chapter.key === 'f1600' ? uiDataPackage.screens.careerLab.smallSeriesStories.f1600?.totals ?? null : null;
          const races = f1600Totals ? f1600Totals.raceCount : row ? asNumber(row.raceRows) : null;
          return (
            <button
              key={chapter.key}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`chapter-tab-${chapter.key}`}
              aria-selected={selected}
              aria-controls="chapter-panel"
              tabIndex={selected ? 0 : -1}
              className={`chapter-rail__tab${selected ? ' chapter-rail__tab--open' : ''}`}
              style={{ ['--tint' as string]: chapterTint(chapter.name) }}
              onClick={() => choose(chapter.key)}
              onKeyDown={(event) => onKey(event, index)}
            >
              <span className="chapter-rail__node" aria-hidden />
              <span className="chapter-rail__years">{chapter.years}</span>
              <span className="chapter-rail__name">{chapter.short ?? chapter.name}</span>
              {races !== null ? (
                <span className="chapter-rail__count">
                  {races} {races === 1 ? 'race' : 'races'}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div id="chapter-panel" role="tabpanel" aria-labelledby={`chapter-tab-${open.key}`} className="chapter-open">
        <ChapterPanel
          key={open.key}
          chapter={open}
          row={rowByName.get(open.name)}
          current={openIndex === seriesChapters.length - 1}
          extra={openIndex === seriesChapters.length - 1 ? lapLine : null}
        />
      </div>
    </section>
  );
};

/* ============================================================
 * 7. More from the archive: the older tools, folded. Each opens on
 *    a click and renders only while open, so the page stays short.
 * ============================================================ */

const archiveItems: Array<{ key: string; title: string; blurb: string; render: () => ReactNode }> = [
  {
    key: 'before',
    title: 'Before the record',
    blurb: 'The karting years, 2016 through 2018: sourced facts, not race results.',
    render: () => <OriginTimeline />
  },
  {
    key: 'explorer',
    title: 'The explorer',
    blurb: 'Every race on one chart, grouped by series, season, track type or conditions.',
    render: () => <CareerExplorer />
  },
  {
    key: 'rivals',
    title: 'The rivals',
    blurb: 'The drivers who shared an INDY NXT grid with him five or more times, and who finished ahead.',
    render: () => <RivalsCard />
  },
  {
    key: 'restarts',
    title: 'The restarts',
    blurb: 'What happened to his place at each INDY NXT restart.',
    render: () => <CareerRestarts />
  },
  {
    key: 'qualifying',
    title: 'Qualifying to the flag',
    blurb: 'Where qualifying put him against where he finished, in every series.',
    render: () => <QualiConversion />
  },
  {
    key: 'climbs',
    title: 'Biggest climbs',
    blurb: 'The five races where he gained the most places.',
    render: () => <BestClimbs />
  },
  {
    key: 'rain',
    title: 'Rain days',
    blurb: 'His wet and mixed days against his dry ones.',
    render: () => <RainDays />
  }
];

const ArchiveFold = () => {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <section className="career-archive" aria-labelledby="career-archive-title">
      <div className="career-section-head">
        <h2 id="career-archive-title" className="career-section-title">
          More from the archive
        </h2>
      </div>
      <ul className="archive-list">
        {archiveItems.map((item) => {
          const isOpen = open.has(item.key);
          return (
            <li key={item.key} id={`archive-${item.key}`} className={`archive-item${isOpen ? ' archive-item--open' : ''}`}>
              <button
                type="button"
                className="archive-item__toggle"
                aria-expanded={isOpen}
                aria-controls={`archive-body-${item.key}`}
                onClick={() => toggle(item.key)}
              >
                <span className="archive-item__title">{item.title}</span>
                <span className="archive-item__blurb">{item.blurb}</span>
                <span className="archive-item__action" aria-hidden>
                  {isOpen ? 'Close' : 'Open'}
                  <span className="archive-item__sign">{isOpen ? '−' : '+'}</span>
                </span>
              </button>
              {isOpen ? (
                <div id={`archive-body-${item.key}`} className="archive-item__body">
                  {item.render()}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/* ============================================================
 * The page
 * ============================================================ */

export const CareerScreen = ({ readiness }: { readiness?: ReadinessStatus }) => {
  const careerLab = uiDataPackage.screens.careerLab;
  const lifeStats = careerLab.lifeStats;
  const rows = careerLab.seriesSummary as Row[];
  const rowByName = new Map(rows.map((row) => [asString(row.seriesName) ?? '', row]));

  /* Lap texture for the current chapter: every sourced INDY NXT lap chart. */
  const lapTotals = (careerLab.lapPositionMix ?? []).reduce(
    (acc, season) => {
      for (const { position, laps } of season.positions) {
        acc.total += laps;
        if (position <= 5) acc.top5 += laps;
        if (position <= 10) acc.top10 += laps;
      }
      return acc;
    },
    { total: 0, top5: 0, top10: 0 }
  );
  const lapLine =
    lapTotals.total > 0
      ? `Lap by lap: of ${wholeNumber.format(lapTotals.total)} laps on sourced lap charts, ${wholeNumber.format(lapTotals.top10)} ran inside the top ten and ${wholeNumber.format(lapTotals.top5)} inside the top five.`
      : null;

  const figures = lifeStats?.figures ?? [];
  const races = figureById(figures, 'races');
  const wins = figureById(figures, 'wins');
  const podiums = figureById(figures, 'podiums');
  const topTens = figureById(figures, 'topTens');

  return (
    <div className="page stack career">
      <header className="career-head">
        <div>
          <h1 className="screen-head__title">His career so far</h1>
          {lifeStats && races ? (
            <p className="screen-head__sub">
              {races.display} races in {seriesChapters.length} series, {monthYear(lifeStats.span.firstDay)} to{' '}
              {monthYear(lifeStats.span.lastDay)}
              {wins && podiums && topTens
                ? `: ${wins.display} wins, ${podiums.display} podiums and ${topTens.display} top tens.`
                : '.'}{' '}
              Every number on this page says how it was made.
            </p>
          ) : null}
        </div>
        <SourcePill
          title="Career"
          entries={careerLab.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={careerLab.caveats}
        />
      </header>

      {lifeStats ? (
        <>
          <Odometer lifeStats={lifeStats} live={readiness?.payload ?? null} />
          <LifeShare lifeStats={lifeStats} />
          <WeeksGrid lifeStats={lifeStats} />
        </>
      ) : (
        <section>
          <h2 className="career-section-title">The odometer</h2>
          <Unavailable>Career life stats are unavailable until the sourced venue-and-lap lane is rebuilt.</Unavailable>
        </section>
      )}

      <CareerAtlas />

      <TheClimb />

      {rows.length === 0 ? (
        <section>
          <h2 className="career-section-title">The chapters</h2>
          <Unavailable>Career summary data unavailable.</Unavailable>
        </section>
      ) : (
        <ChapterTimeline rowByName={rowByName} lapLine={lapLine} />
      )}

      {/* The campaigns (cumulative points arcs) retired 2026-07-21 on Jack's
          call: points always accumulate, so the arcs said nothing the season
          cards don't. Component retained in careerExplorer for archaeology. */}
      <ArchiveFold />
    </div>
  );
};

