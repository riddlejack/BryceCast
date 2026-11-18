import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { SourcePill, Stat, TickerValue, Unavailable } from '../app/components';
import { PointerWord, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../app/charts';
import { useTapPreview } from '../app/tapPreview';
import { useRouter } from '../app/router';
import { VenueTipCard } from '../app/venueCard';
import { beatLine, placeLine } from '../app/raceFacts';
import { raceName } from './careerRaceNames';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import {
  uiDataPackage,
  type UiCareerFigure,
  type UiCareerFigureClass,
  type UiCareerLifeStats,
  type UiCareerOtherDrivers,
  type UiCareerTimeBreakdown,
  type UiCareerWeeksGrid
} from '../data/uiDataPackage';
import { getVenueByTrackName } from '../data/venueDossier';
import { liveBryceRowOf } from '../data/livePageModel';
import type { LiveReadiness, ReadinessStatus } from '../app/useReadiness';
import { CareerAtlas, seriesMetaById, seriesOrder } from './careerAtlas';
import { useOldDeepDives } from './deepDives/frame';
import { ExplorerDeepDive } from './deepDives/explorer';
import { RivalsDeepDive } from './deepDives/rivals';
import { RestartsDeepDive } from './deepDives/restarts';
import { QualifyingDeepDive } from './deepDives/qualifying';
import { ClimbsDeepDive } from './deepDives/climbs';
import { RainDeepDive } from './deepDives/rain';
import { BeforeDeepDive } from './deepDives/before';
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
  chapterTint,
  raceHref
} from './careerExplorer';
import './career.css';
import { wetFor, type WetRead } from './raceWet';
import { switchValue } from '../review/switches';
import './wetWeeks.css';

type Row = Record<string, string | number | null>;

/* ============================================================
 * Shared bits
 * ============================================================ */

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const countWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const countWord = (value: number): string => countWords[value] ?? wholeNumber.format(value);


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

/** Review switch `odocolour` (round 3): the odometer in one colour set (ink, a
 *  soft and a faint ink step, series hues only for series, amber only for "at
 *  least"); `old` puts round 2's six colour schemes back. */
const odoColourOld = (): boolean => switchValue('odocolour') === 'old';
/** `odocolour=series`: the same set, but the other drivers keep their series hues at rest. */
const odoPeopleInSeries = (): boolean => switchValue('odocolour') === 'series';

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
 * 1. The odometer (round 4, November 15): the ledger's figures in six
 *    groups, each with one drawing. A figure shows its number and a short
 *    label; a click opens how it was counted. One panel explains the method.
 * ============================================================ */

/** `short`: the same words, cut to fit one line of a phone's half column (round 9). */
type OdoFigureSpec = { id: string; label: string; short?: string };
type OdoGroupSpec = {
  key: string;
  title: string;
  /** Column weights for the figures, so a wide value (a range) gets room. */
  columns: string;
  figures: OdoFigureSpec[];
  visual: 'series' | 'distance' | 'time' | 'places' | 'people' | 'incidents';
};

/* Cut from the odometer in round 4: "Days at race meetings" (177) and "Weeks
 * with a race meeting" (75). Both are the captions of "His life in weeks"
 * just below, so they appeared twice. Added: the single-seater share of the
 * other drivers (269), which the people drawing splits out. */
const ODOMETER_GROUPS: OdoGroupSpec[] = [
  {
    key: 'on-track',
    title: 'On track',
    columns: '1fr 1.15fr 1.25fr',
    visual: 'series',
    figures: [
      { id: 'races', label: 'Races' },
      { id: 'raceLaps', label: 'Race laps' },
      { id: 'raceCorners', label: 'Corners in races' }
    ]
  },
  {
    key: 'distance',
    title: 'Distance',
    columns: '1fr 1.42fr 1.38fr',
    visual: 'distance',
    figures: [
      { id: 'raceMiles', label: 'Miles raced' },
      { id: 'milesBetweenTracks', label: 'Miles between tracks' },
      { id: 'fuelRaces', label: 'US gallons of fuel' }
    ]
  },
  {
    key: 'time',
    title: 'Time in the car',
    columns: '1fr 1fr',
    visual: 'time',
    figures: [
      { id: 'raceTimeAll', label: 'Racing' },
      { id: 'sessionHours', label: 'In every official session' }
    ]
  },
  {
    key: 'places',
    title: 'Places',
    columns: '1fr 1fr',
    visual: 'places',
    figures: [
      { id: 'venues', label: 'Tracks' },
      { id: 'countries', label: 'Countries' }
    ]
  },
  {
    key: 'people',
    title: 'The other drivers',
    columns: '1fr 1fr',
    visual: 'people',
    figures: [
      { id: 'otherDriverRecords', label: 'Drivers in his races' },
      { id: 'otherDriverRecordsSingleSeater', label: 'Of them in single-seaters', short: 'In single-seaters' }
    ]
  },
  {
    key: 'incidents',
    title: 'When it went wrong, INDY NXT only',
    columns: '1fr 1fr',
    visual: 'incidents',
    figures: [
      { id: 'indyNxtRetirements', label: 'Races he retired from' },
      { id: 'indyNxtCautions', label: 'Cautions he was named in', short: 'Cautions naming him' }
    ]
  }
];

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

/* ---------- the drawings, one per group ---------- */

const ordinal = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
};

/** Races by series, from the weeks grid (every race sits in exactly one week). */
const racesBySeries = (lifeStats: UiCareerLifeStats): Array<{ seriesId: string; races: number }> => {
  const counts = new Map<string, number>();
  for (const week of lifeStats.weeksGrid.weeks) {
    for (const race of week.races) counts.set(race.seriesId, (counts.get(race.seriesId) ?? 0) + race.raceCount);
  }
  return seriesOrder.filter((id) => (counts.get(id) ?? 0) > 0).map((id) => ({ seriesId: id, races: counts.get(id) ?? 0 }));
};

/* Round 2 (November 17): every drawing reads on hover, and on a phone on the
 * first tap (useTapPreview). A bar or segment reads in the drawing's own key
 * line; a mark at a track opens a card with the track's 3D still (VenuePeek),
 * as the Career explorer's INDY NXT dots do. Colour comes only from the theme
 * tokens: the series tints, the INDY NXT gold for his own miles and hours,
 * the travel colour, and one colour per country. */

type Hot = string | null;

/** Where a mark sits inside the figure: its centre-top and its bottom. */
const markBox = (mark: Element, figure: Element | null) => {
  const box = mark.getBoundingClientRect();
  const origin = figure?.getBoundingClientRect() ?? box;
  return { x: box.left - origin.left + box.width / 2, y: box.top - origin.top, under: box.bottom - origin.top };
};

const yearsOf = (from: number, to: number): string => (from === to ? String(from) : `${from}–${to}`);

/** Races by series with the years he raced each, from the weeks grid. */
const seriesYears = (lifeStats: UiCareerLifeStats): Map<string, { from: number; to: number }> => {
  const years = new Map<string, { from: number; to: number }>();
  for (const week of lifeStats.weeksGrid.weeks) {
    const year = Number(week.monday.slice(0, 4));
    for (const race of week.races) {
      const span = years.get(race.seriesId);
      years.set(race.seriesId, span ? { from: Math.min(span.from, year), to: Math.max(span.to, year) } : { from: year, to: year });
    }
  }
  return years;
};

const SeriesVisual = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const rows = racesBySeries(lifeStats);
  const total = rows.reduce((sum, row) => sum + row.races, 0);
  const years = useMemo(() => seriesYears(lifeStats), [lifeStats]);
  const [hot, setHot] = useState<Hot>(null);
  const tap = useTapPreview();
  const hotRow = rows.find((row) => row.seriesId === hot) ?? null;
  const handlers = (seriesId: string) => tap.target(seriesId, { show: () => setHot(seriesId), hide: () => setHot(null) });
  return (
    <figure
      className={`odo-visual odo-series${hot ? ' odo-series--hot' : ''}`}
      aria-label={`Races by series: ${rows.map((row) => `${seriesMetaById(row.seriesId).short} ${row.races}`).join(', ')}.`}
    >
      <div className="odo-bar" aria-hidden>
        {rows.map((row) => (
          <span
            key={row.seriesId}
            className={`odo-bar__seg${hot === row.seriesId ? ' odo-bar__seg--hot' : ''}`}
            style={{ flexGrow: row.races, background: seriesMetaById(row.seriesId).tint }}
            {...handlers(row.seriesId)}
          />
        ))}
      </div>
      <figcaption className="odo-legend">
        {rows.map((row) => (
          <span
            key={row.seriesId}
            className={`odo-legend__item${hot === row.seriesId ? ' odo-legend__item--hot' : ''}`}
            {...handlers(row.seriesId)}
          >
            <i aria-hidden style={{ background: seriesMetaById(row.seriesId).tint }} />
            {seriesMetaById(row.seriesId).short} {row.races}
          </span>
        ))}
        {hotRow ? (
          <span className="odo-read odo-legend__line">
            <b>{seriesMetaById(hotRow.seriesId).short}</b>
            {': '}
            {hotRow.races} {hotRow.races === 1 ? 'race' : 'races'}
            {years.get(hotRow.seriesId) ? `, ${yearsOf(years.get(hotRow.seriesId)!.from, years.get(hotRow.seriesId)!.to)}` : ''}
          </span>
        ) : (
          <span className="odo-legend__note odo-legend__line">{total} races, in the order he raced the series</span>
        )}
      </figcaption>
    </figure>
  );
};

/** Two or three bars on one scale. A floor ends in a dashed run: there is
 *  more. Each part reads on hover; a bar's label reads the whole bar. */
type ScalePart = { key: string; value: number; tone: 'race' | 'race-hatch' | 'race-soft' | 'travel'; read: ReactNode };
type ScaleBar = { key: string; label: string; parts: ScalePart[]; floor?: boolean; read?: ReactNode };

const ScaleBars = ({
  bars,
  max,
  marks,
  ariaLabel,
  note
}: {
  bars: ScaleBar[];
  max: number;
  marks?: Array<{ value: number; label: string }>;
  ariaLabel: string;
  note?: ReactNode;
}) => {
  /* "bar:<key>" for a bar's label, "<bar>/<part>" for a part. */
  const [hot, setHot] = useState<Hot>(null);
  const tap = useTapPreview();
  const hotBar = hot?.startsWith('bar:') ? hot.slice(4) : hot?.split('/')[0] ?? null;
  const hotPart = hot && !hot.startsWith('bar:') ? hot.split('/')[1] : null;
  const read = (() => {
    if (!hot) return null;
    const bar = bars.find((item) => item.key === hotBar);
    if (!bar) return null;
    if (hotPart === null) return bar.read ?? bar.parts[0]?.read ?? null;
    return bar.parts.find((part) => part.key === hotPart)?.read ?? null;
  })();
  const on = (key: string) => tap.target(key, { show: () => setHot(key), hide: () => setHot(null) });
  return (
    <figure className={`odo-visual${hot ? ' odo-scale--hot' : ''}`} aria-label={ariaLabel}>
      <div className="odo-scale" aria-hidden>
        {marks?.map((mark) => (
          <span key={mark.label} className="odo-scale__mark" style={{ ['--f' as string]: String(mark.value / max) }}>
            <span className="odo-scale__mark-label">{mark.label}</span>
          </span>
        ))}
        {bars.map((bar) => {
          const total = bar.parts.reduce((sum, part) => sum + part.value, 0);
          const barHot = hotBar === bar.key;
          return (
            <div key={bar.key} className={`odo-scale__row${barHot ? ' odo-scale__row--hot' : ''}`}>
              <span className="odo-scale__label" {...(bar.read ? on(`bar:${bar.key}`) : on(`${bar.key}/${bar.parts[0].key}`))}>
                {bar.label}
              </span>
              <span className="odo-scale__track">
                <span className="odo-scale__fill" style={{ width: `${(total / max) * 100}%` }}>
                  {bar.parts.map((part) => (
                    <span
                      key={part.key}
                      className={`odo-scale__part odo-scale__part--${part.tone}${hotPart === part.key || (hotPart === null && barHot) ? ' odo-scale__part--hot' : ''}`}
                      style={{ flexGrow: part.value }}
                      {...on(`${bar.key}/${part.key}`)}
                    />
                  ))}
                </span>
                {bar.floor ? <span className="odo-scale__more" style={{ left: `${(total / max) * 100}%` }} /> : null}
              </span>
            </div>
          );
        })}
      </div>
      {read ? (
        <figcaption className="odo-legend">
          <span className="odo-read">{read}</span>
        </figcaption>
      ) : note ? (
        <figcaption className="odo-legend">{note}</figcaption>
      ) : null}
    </figure>
  );
};

const EQUATOR_MILES = 24_901;

const DistanceVisual = ({ figures }: { figures: UiCareerFigure[] }) => {
  const racedFigure = figureById(figures, 'raceMiles');
  const betweenFigure = figureById(figures, 'milesBetweenTracks');
  const byRoad = figureById(figures, 'milesBetweenTracksByRoad');
  const raced = racedFigure?.value ?? 0;
  const between = betweenFigure?.value ?? 0;
  if (!raced || !between || !racedFigure || !betweenFigure) return <div className="odo-visual" />;
  const max = between * 1.12;
  /* A floor, so the ratio rounds down to a whole number (8.28 is "8"). */
  const ratio = Math.floor(between / raced);
  return (
    <ScaleBars
      ariaLabel={`Miles raced against miles between tracks, on one scale with the equator marked: ${ratio} miles between tracks for every mile raced.`}
      max={max}
      marks={[
        { value: EQUATOR_MILES, label: 'once round the equator' },
        { value: EQUATOR_MILES * 2, label: 'twice' }
      ]}
      bars={[
        {
          key: 'raced',
          label: 'Raced',
          parts: [
            {
              key: 'raced',
              value: raced,
              tone: 'race',
              read: (
                <>
                  <i aria-hidden className="odo-key odo-key--race" />
                  <b>{racedFigure.display} miles</b> raced{racedFigure.caveat ? `. ${racedFigure.caveat}` : ''}
                </>
              )
            }
          ]
        },
        {
          key: 'between',
          label: 'Between tracks',
          parts: [
            {
              key: 'between',
              value: between,
              tone: 'travel',
              read: (
                <>
                  <i aria-hidden className="odo-key odo-key--travel" />
                  <b>{betweenFigure.display} miles</b> in straight lines from track to track
                  {byRoad ? `; ${byRoad.display} by road` : ''}
                </>
              )
            }
          ],
          floor: true
        }
      ]}
      note={<span>At least {ratio} miles between tracks for every mile raced</span>}
    />
  );
};

const TimeVisual = ({ figures, breakdown }: { figures: UiCareerFigure[]; breakdown: UiCareerTimeBreakdown | undefined }) => {
  const racingFigure = figureById(figures, 'raceTimeAll');
  const sessionsFigure = figureById(figures, 'sessionHours');
  const racing = racingFigure?.value ?? 0;
  const sessions = sessionsFigure?.value ?? 0;
  if (!racing || !sessions || !racingFigure || !sessionsFigure || !breakdown) return <div className="odo-visual" />;
  const { timedRaces: timed, untimedRaces: untimed, otherSessions: other } = breakdown;
  const parts = (withOther: boolean): ScalePart[] => [
    {
      key: 'timed',
      value: timed.hours,
      tone: 'race',
      read: (
        <>
          <i aria-hidden className="odo-key odo-key--race" />
          <b>{timed.display}</b> of official race times, in {timed.count} of his {breakdown.raceCount} races
        </>
      )
    },
    {
      key: 'untimed',
      value: untimed.hours,
      tone: 'race-hatch',
      read: (
        <>
          <i aria-hidden className="odo-key odo-key--race-hatch" />
          <b>{untimed.display}</b> in the {untimed.count} races with no official time: his laps × his best lap
        </>
      )
    },
    ...(withOther
      ? [
          {
            key: 'other',
            value: other.hours,
            tone: 'race-soft' as const,
            read: (
              <>
                <i aria-hidden className="odo-key odo-key--race-soft" />
                <b>{other.display}</b> in {other.count} practice, qualifying and test sessions
              </>
            )
          }
        ]
      : [])
  ];
  return (
    <ScaleBars
      ariaLabel={`Hours in the car on one scale: racing ${racingFigure.display}, every official session ${sessionsFigure.display}.`}
      max={sessions * 1.12}
      bars={[
        {
          key: 'racing',
          label: 'Racing',
          parts: parts(false),
          floor: true,
          read: (
            <>
              <b>{racingFigure.display}</b> racing: {timed.display} official, {untimed.display} with no official time
            </>
          )
        },
        {
          key: 'sessions',
          label: 'All sessions',
          parts: parts(true),
          floor: true,
          read: (
            <>
              <b>{sessionsFigure.display}</b> in all: {racingFigure.display} racing, {other.display} practice, qualifying, tests
            </>
          )
        }
      ]}
      note={
        <>
          <span>
            <i aria-hidden className="odo-key odo-key--race" />
            official race times
          </span>
          <span>
            <i aria-hidden className="odo-key odo-key--race-hatch" />
            races with no official time
          </span>
          <span>
            <i aria-hidden className="odo-key odo-key--race-soft" />
            practice, qualifying, tests
          </span>
        </>
      }
    />
  );
};

const countryCode: Record<string, string> = {
  'United States': 'US',
  'United Kingdom': 'UK',
  'New Zealand': 'NZ',
  Austria: 'AT',
  Belgium: 'BE',
  France: 'FR',
  Hungary: 'HU',
  Italy: 'IT',
  Portugal: 'PT'
};

/** One colour per country: home, Britain, New Zealand, and the European season. */
const countryTint = (country: string): string =>
  country === 'United States'
    ? 'var(--place-us)'
    : country === 'United Kingdom'
      ? 'var(--place-uk)'
      : country === 'New Zealand'
        ? 'var(--place-nz)'
        : 'var(--place-eu)';

type AtlasVenue = NonNullable<typeof uiDataPackage.screens.careerLab.atlas>['venues'][number];

const PlacesVisual = () => {
  const venues = uiDataPackage.screens.careerLab.atlas?.venues ?? [];
  const countries = useMemo(() => {
    const byCountry = new Map<string, AtlasVenue[]>();
    for (const venue of venues) byCountry.set(venue.country, [...(byCountry.get(venue.country) ?? []), venue]);
    return [...byCountry.entries()]
      .map(([name, list]) => [name, [...list].sort((a, b) => a.firstYear - b.firstYear || a.trackName.localeCompare(b.trackName))] as const)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [venues]);
  const figureRef = useRef<HTMLElement | null>(null);
  const tap = useTapPreview();
  /* The country in hand, the track under the pointer (null: the country's
   * label), and where the card points. */
  const [hot, setHot] = useState<{ country: string; venue: AtlasVenue | null; x: number; y: number; under: number } | null>(null);
  const show = (country: string, venue: AtlasVenue | null) => (target: Element) => {
    setHot({ country, venue, ...markBox(target, figureRef.current) });
  };
  const hotList = hot ? countries.find(([name]) => name === hot.country)?.[1] ?? [] : [];
  /* A country's card shows the track he raced most there; a dot's, its own. */
  const mostRaced = hotList.reduce<AtlasVenue | null>((best, venue) => (!best || venue.raceCount > best.raceCount ? venue : best), null);
  const shown = hot ? hot.venue ?? mostRaced : null;
  const countryRaces = hotList.reduce((sum, venue) => sum + venue.raceCount, 0);
  const countryYears = hotList.length
    ? yearsOf(Math.min(...hotList.map((venue) => venue.firstYear)), Math.max(...hotList.map((venue) => venue.lastYear)))
    : '';
  const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;
  return (
    <figure
      ref={figureRef}
      className={`odo-visual odo-visual--cards${hot ? ' odo-places--hot' : ''}`}
      aria-label={`Tracks by country: ${countries.map(([name, list]) => `${name} ${list.length}`).join(', ')}.`}
    >
      <div className="odo-places" aria-hidden>
        {countries.map(([name, list]) => (
          <span key={name} className={`odo-places__country${hot?.country === name ? ' odo-places__country--hot' : ''}`} style={{ ['--place' as string]: countryTint(name) }}>
            <span className="odo-places__dots">
              {list.map((venue) => {
                let el: HTMLElement | null = null;
                return (
                  <i
                    key={venue.venueId}
                    ref={(node) => {
                      el = node;
                    }}
                    className={hot?.venue?.venueId === venue.venueId ? 'odo-places__dot--hot' : undefined}
                    {...tap.target(venue.venueId, {
                      show: () => el && show(name, venue)(el),
                      hide: () => setHot(null)
                    })}
                  />
                );
              })}
            </span>
            <span
              className="odo-places__name"
              {...tap.target(`country:${name}`, {
                show: () => {
                  const label = figureRef.current?.querySelector(`[data-country="${name}"]`);
                  if (label) show(name, null)(label);
                },
                hide: () => setHot(null)
              })}
              data-country={name}
            >
              {countryCode[name] ?? name}
            </span>
          </span>
        ))}
      </div>
      <figcaption className="odo-legend">
        <span className="odo-legend__note">{odoColourOld() ? 'One dot is one track, coloured by country' : 'One dot is one track, grouped by country'}</span>
      </figcaption>
      {hot && shown ? (
        <VenueTipCard
          tap={tap}
          tip={{
            x: hot.x,
            y: hot.y,
            under: hot.under,
            venue: { trackName: shown.trackName, trackId: shown.trackIds[0] ?? null },
            meta: hot.venue ? hot.country : plural(hotList.length, 'track'),
            tint: odoColourOld() ? countryTint(hot.country) : null,
            title: hot.venue ? shown.trackName : hot.country,
            detail: hot.venue
              ? `${plural(shown.raceCount, 'race')}, ${yearsOf(shown.firstYear, shown.lastYear)} · ${shown.seriesSpans.map((span) => span.seriesShort).join(', ')}`
              : `${plural(countryRaces, 'race')}, ${countryYears}`,
            note: hot.venue ? null : `Pictured: ${shown.trackName}, where he raced most`
          }}
        />
      ) : null}
    </figure>
  );
};

/** Display only: the results sheets' "RobinsonII" and "McCULLOUGH" read as names. */
const driverName = (name: string): string =>
  name
    .replace(/([a-z])(II|III|IV|Jr\.?|Sr\.?)$/, '$1 $2')
    .replace(/\b(Mc|Mac)([A-Z])([A-Z]+)\b/g, (_m, pre: string, first: string, rest: string) => `${pre}${first}${rest.toLowerCase()}`);

const PeopleVisual = ({ figures, drivers }: { figures: UiCareerFigure[]; drivers: UiCareerOtherDrivers | undefined }) => {
  const all = figureById(figures, 'otherDriverRecords')?.value ?? 0;
  const single = figureById(figures, 'otherDriverRecordsSingleSeater')?.value ?? 0;
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const tap = useTapPreview();
  const [hot, setHot] = useState<number | null>(null);
  /* A series chip in the key lights the drivers he first raced there. */
  const chipTap = useTapPreview();
  const [focus, setFocus] = useState<string | null>(null);
  if (!all) return <div className="odo-visual" />;
  const daytonaOnly = all - single;
  const pitch = 7;
  const cols = Math.max(20, Math.floor(width / pitch));
  const rows = Math.ceil(all / cols);
  const rowsData = drivers?.rows ?? [];
  const old = odoColourOld();
  const inSeries = odoPeopleInSeries();
  const seriesTint = (index: number) => {
    const row = rowsData[index];
    return row ? seriesMetaById(drivers!.series[row[1]]).tint : 'var(--ink)';
  };
  const at = (index: number) => ({ cx: (index % cols) * pitch + pitch / 2, cy: Math.floor(index / cols) * pitch + pitch / 2 });
  const find = (event: { clientX: number; clientY: number; currentTarget: Element }): number | null => {
    const box = event.currentTarget.getBoundingClientRect();
    const col = Math.floor((event.clientX - box.left) / pitch);
    const row = Math.floor((event.clientY - box.top) / pitch);
    const index = row * cols + col;
    if (col < 0 || col >= cols || row < 0 || index >= all) return null;
    return index;
  };
  const hotRow = hot !== null ? rowsData[hot] : undefined;
  const hotSeries = hotRow ? seriesMetaById(drivers!.series[hotRow[1]]) : null;
  const tip =
    hot !== null && hotRow && hotSeries
      ? {
          ...(({ cx, cy }) => ({ x: cx, y: cy - 4, under: cy + 6 }))(at(hot)),
          meta: `${hotSeries.short} · ${hotRow[2]}`,
          tint: hotSeries.tint,
          title: hotRow[4] === 'artifact' ? `“${hotRow[0]}”` : driverName(hotRow[0]),
          detail:
            hotRow[4] === 'artifact'
              ? 'a misread line on one results sheet, not a person'
              : hot < single
                ? `first raced him here · ${hotRow[3]} ${hotRow[3] === 1 ? 'race' : 'races'} together`
                : `met only at the Daytona 24 Hours`,
          note: hotRow[4] === 'variant' ? 'likely one driver under two spellings' : null
        }
      : null;
  const firstSeries = drivers ? seriesOrder.filter((id) => drivers.series.includes(id) && id !== 'series_imsa_weathertech') : [];
  const seriesOf = (index: number) => (rowsData[index] ? drivers!.series[rowsData[index][1]] : null);
  /* Round 3: ink at rest (the soft step for the names met only at Daytona). A
   * chip, or the dot under the pointer, lights one series in its own hue and
   * steps every other name back to the faint step. */
  const lit = old ? null : focus ?? (hot !== null ? seriesOf(hot) : null);
  const tint = (index: number) => {
    if (old) return seriesTint(index);
    if (lit) return seriesOf(index) === lit ? seriesTint(index) : 'var(--odo-faint)';
    if (index >= single) return 'var(--odo-soft)';
    return inSeries ? seriesTint(index) : 'var(--ink)';
  };
  const metHere = (id: string) => rowsData.filter((row, index) => index < single && drivers!.series[row[1]] === id).length;
  return (
    <figure
      className="odo-visual"
      aria-label={`${all} other driver names: ${single} in his single-seater races, ${daytonaOnly} met only at the Daytona 24-hour race.`}
    >
      <div ref={ref} className={`odo-people${focus ? ' odo-people--focus' : ''}`} style={{ position: 'relative' }}>
        {width > 0 ? (
          <svg
            width={cols * pitch}
            height={rows * pitch}
            aria-hidden
            {...tap.surface({
              find: (event) => {
                const index = find(event);
                setHot(index);
                return index;
              },
              clear: () => setHot(null)
            })}
          >
            {Array.from({ length: all }, (_, index) => (
              <circle
                key={index}
                cx={at(index).cx}
                cy={at(index).cy}
                r={2.4}
                fill={tint(index)}
                className={`odo-people__dot${index < single ? '' : ' odo-people__dot--daytona'}${old && focus && seriesOf(index) !== focus ? ' odo-people__dot--off' : ''}`}
              />
            ))}
            {hot !== null ? (
              <g pointerEvents="none">
                <circle cx={at(hot).cx} cy={at(hot).cy} r={6.2} fill="none" stroke="var(--ink)" strokeWidth={1.4} />
                <circle cx={at(hot).cx} cy={at(hot).cy} r={4.6} fill={tint(hot)} stroke="var(--paper)" strokeWidth={1.2} />
              </g>
            ) : null}
          </svg>
        ) : null}
        {tip ? <VenueTipCard tip={tip} tap={tap} /> : null}
      </div>
      <figcaption className="odo-legend">
        <span className="odo-chips">
          {firstSeries.map((id) => (
            <i
              key={id}
              className={`odo-chip${focus === id ? ' odo-chip--on' : ''}`}
              style={{ background: seriesMetaById(id).tint }}
              aria-label={seriesMetaById(id).short}
              {...chipTap.target(id, { show: () => setFocus(id), hide: () => setFocus(null) })}
            />
          ))}
        </span>
        {focus ? (
          <span className="odo-read">
            <b>{seriesMetaById(focus).short}</b>: {metHere(focus)} drivers first raced him here
          </span>
        ) : (
          <span>the series they first raced him in</span>
        )}
        <span>
          <i aria-hidden className="odo-key odo-key--dot-daytona" />
          only at Daytona ({daytonaOnly})
        </span>
      </figcaption>
    </figure>
  );
};

const IncidentsVisual = () => {
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const figureRef = useRef<HTMLElement | null>(null);
  const rows = useMemo(
    () =>
      (uiDataPackage.screens.careerLab.resultConversion as Row[])
        .filter((row) => row.seriesId === 'series_indy_nxt')
        .map((row) => ({
          sessionId: asString(row.sessionId) ?? '',
          trackName: asString(row.trackName) ?? '',
          date: asString(row.raceDate) ?? asString(row.eventStartDate) ?? '',
          label: asString(row.raceLabel) ?? '',
          event: asString(row.eventName) ?? asString(row.raceLabel) ?? '',
          status: asString(row.status) ?? 'running',
          finish: asNumber(row.finishPosition),
          field: asNumber(row.fieldSize)
        }))
        .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'en', { numeric: true })),
    []
  );
  const [hot, setHot] = useState<{ index: number; x: number; y: number; under: number } | null>(null);
  const years = [...new Set(rows.map((row) => row.date.slice(0, 4)))];
  const contact = rows.filter((row) => row.status === 'contact').length;
  const mechanical = rows.filter((row) => row.status === 'mechanical').length;
  const ending = (row: (typeof rows)[number]) => (row.status === 'running' ? null : `ended early: ${row.status}`);
  const finishLine = (row: (typeof rows)[number]) =>
    [placeLine(row.finish, row.field), row.status === 'running' ? beatLine(row.finish, row.field) : null].filter(Boolean).join(' · ') || null;
  const hotRow = hot ? rows[hot.index] : null;
  return (
    <figure
      ref={figureRef}
      className={`odo-visual odo-visual--cards${hot ? ' odo-races--hot' : ''}`}
      aria-label={`His ${rows.length} INDY NXT races in date order: ${contact} ended early after contact and ${mechanical} with a mechanical failure.`}
    >
      <div className="odo-races" aria-hidden>
        {years.map((year) => (
          <span key={year} className="odo-races__year" style={{ ['--n' as string]: String(rows.filter((row) => row.date.startsWith(year)).length) }}>
            <span className="odo-races__cells">
              {rows.map((row, index) => {
                if (!row.date.startsWith(year)) return null;
                let el: HTMLElement | null = null;
                return (
                  <i
                    key={`${row.date}-${row.label}`}
                    ref={(node) => {
                      el = node;
                    }}
                    className={`odo-races__cell odo-races__cell--${row.status}${hot?.index === index ? ' odo-races__cell--hot' : ''}`}
                    {...tap.target(row.sessionId || index, {
                      show: () => el && setHot({ index, ...markBox(el, figureRef.current) }),
                      hide: () => setHot(null),
                      open: row.sessionId ? () => navigate(raceHref(row.sessionId)) : null
                    })}
                  />
                );
              })}
            </span>
            <span className="odo-races__label">{year}</span>
          </span>
        ))}
      </div>
      <figcaption className="odo-legend">
        <span>
          <i aria-hidden className="odo-key odo-key--out" />
          out after contact
        </span>
        <span>
          <i aria-hidden className="odo-key odo-key--out-hatch" />
          mechanical
        </span>
        <span className="odo-legend__note">One square is one INDY NXT race</span>
      </figcaption>
      {hot && hotRow ? (
        <VenueTipCard
          tap={tap}
          tip={{
            x: hot.x,
            y: hot.y,
            under: hot.under,
            venue: { sessionId: hotRow.sessionId, trackName: hotRow.trackName },
            meta: `INDY NXT · ${hotRow.date.slice(0, 4)}`,
            tint: 'var(--chapter-indy)',
            title: raceName({ eventName: hotRow.event, sessionId: hotRow.sessionId, trackName: hotRow.trackName }).title,
            detail: finishLine(hotRow),
            note: ending(hotRow),
            action: hotRow.sessionId ? 'open the race' : null
          }}
        />
      ) : null}
    </figure>
  );
};

/* ---------- a figure, and its "how" ---------- */

const figureFacts = (figure: UiCareerFigure): string[] => {
  const facts: string[] = [];
  if (figure.denominator) facts.push(`Out of ${wholeNumber.format(figure.denominator.value)} ${figure.denominator.unit}.`);
  if (figure.id.startsWith('otherDriverRecords') && figure.range) {
    facts.push(`${wholeNumber.format(figure.range.low)} to ${wholeNumber.format(figure.range.high)} people.`);
  }
  if (figure.class === 'modelled_range' && figure.range?.base) {
    facts.push(`Middle estimate ${wholeNumber.format(figure.range.base)} ${figure.unit}.`);
  }
  if (figure.parts && figure.id.startsWith('indyNxt')) {
    facts.push(`${figure.parts.map((part) => `${part.value} ${part.label}`).join(', ')}.`);
  }
  return facts;
};

/* The label's last word carries the chevron, so the two never part. */
const odoLabelWords = (label: string) => (
  <>
    {label.split(' ').slice(0, -1).join(' ')}{label.includes(' ') ? ' ' : ''}
    <span className="odo-fig__last">
      {label.split(' ').slice(-1)[0]}
      <span className="odo-fig__chev" aria-hidden />
    </span>
  </>
);

const OdoFigure = ({
  figure,
  label,
  short,
  progress,
  open,
  onToggle
}: {
  figure: UiCareerFigure;
  label: string;
  short?: string;
  progress: number;
  open: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    className={`odo-fig odo-fig--${figure.class}${open ? ' odo-fig--open' : ''}`}
    data-figure-id={figure.id}
    aria-expanded={open}
    aria-controls={`odo-how-${figure.id}`}
    onClick={onToggle}
  >
    <span className="odo-fig__value" aria-label={`${figure.display}${figure.unit === 'US gallons' ? ' US gallons' : ''}`}>
      <span aria-hidden>
        <RollingValue display={figure.display} progress={progress} />
      </span>
    </span>
    {short ? (
      <>
        <span className="odo-fig__label odo-fig__label--full">{odoLabelWords(label)}</span>
        <span className="odo-fig__label odo-fig__label--short">{odoLabelWords(short)}</span>
      </>
    ) : (
      <span className="odo-fig__label">{odoLabelWords(label)}</span>
    )}
  </button>
);

const OdoHow = ({ figure, label }: { figure: UiCareerFigure; label: string }) => (
  <div id={`odo-how-${figure.id}`} className="odo-how" role="region" aria-label={`How "${label}" was counted`}>
    <p className="odo-how__class">
      <span className={`odo-how__word odo-how__word--${figure.class}`}>{classWord[figure.class]}</span>
      <span className="odo-how__def">{classMeaning[figure.class]}</span>
    </p>
    <p className="odo-how__text">{figure.how}</p>
    {figure.caveat || figureFacts(figure).length ? (
      <p className="odo-how__note">
        {[...figureFacts(figure), figure.caveat].filter(Boolean).join(' ')}
      </p>
    ) : null}
  </div>
);

const classMeaning: Record<UiCareerFigureClass, string> = {
  counted: 'exact, added up from the official records',
  lower_bound: 'a floor; the true figure is higher',
  modelled_range: 'an estimate from stated assumptions'
};

const OdoGroup = ({
  group,
  figures,
  lifeStats,
  progressOf,
  openId,
  setOpenId
}: {
  group: OdoGroupSpec;
  figures: UiCareerFigure[];
  lifeStats: UiCareerLifeStats;
  progressOf: (id: string) => number;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) => {
  const items = group.figures
    .map((spec) => ({ spec, figure: figureById(figures, spec.id) }))
    .filter((item): item is { spec: OdoFigureSpec; figure: UiCareerFigure } => item.figure !== undefined);
  const openItem = items.find((item) => item.figure.id === openId) ?? null;
  const visual = (() => {
    switch (group.visual) {
      case 'series':
        return <SeriesVisual lifeStats={lifeStats} />;
      case 'distance':
        return <DistanceVisual figures={figures} />;
      case 'time':
        return <TimeVisual figures={figures} breakdown={lifeStats.timeBreakdown} />;
      case 'places':
        return <PlacesVisual />;
      case 'people':
        return <PeopleVisual figures={figures} drivers={lifeStats.otherDrivers} />;
      case 'incidents':
        return <IncidentsVisual />;
      default:
        return null;
    }
  })();
  return (
    <section className="odo-group" aria-labelledby={`odo-group-${group.key}`} data-group={group.key}>
      <h3 id={`odo-group-${group.key}`} className="odo-group__title">
        {group.title}
      </h3>
      <div className="odo-group__visual">{visual}</div>
      <div className="odo-group__figs" style={{ gridTemplateColumns: group.columns.split(' ').map((w) => `minmax(0, ${w})`).join(' ') }}>
        {items.map(({ spec, figure }) => (
          <OdoFigure
            key={figure.id}
            figure={figure}
            label={spec.label}
            short={spec.short}
            progress={progressOf(figure.id)}
            open={openId === figure.id}
            onToggle={() => setOpenId(openId === figure.id ? null : figure.id)}
          />
        ))}
      </div>
      {openItem ? <OdoHow figure={openItem.figure} label={openItem.spec.label} /> : null}
    </section>
  );
};

const OdometerMethod = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const span = `${monthYear(lifeStats.span.firstDay)} to ${monthYear(lifeStats.span.lastDay)}`;
  const races = figureById(lifeStats.figures, 'races')?.display ?? wholeNumber.format(lifeStats.personalRaceMileage.raceRows);
  const seriesCount = new Set(lifeStats.mileageBreakdowns.filter((row) => row.dimensionType === 'series').map((row) => row.dimensionValue)).size;
  return (
    <div id="odo-method" className="odo-method" role="region" aria-label="How these were counted">
      <div className="odo-method__col">
        <h3 className="odo-method__title">Where the numbers come from</h3>
        <p>
          Every figure is worked out from the BryceCast career dataset: the official results and timing sheets of his {races} races in{' '}
          {countWord(seriesCount)} series, {span}, and the practice, qualifying and test sessions that were imported with them. Karting, private testing and
          the simulator are not in it, so nothing here counts them.
        </p>
      </div>
      <div className="odo-method__col">
        <h3 className="odo-method__title">Three kinds of number</h3>
        <p>
          <strong>Counted</strong> figures are added up exactly from those records. Miles raced, for example, is each race's laps times that
          track's length, race by race.
        </p>
        <p>
          <strong>
            At least <span className="odo-plus">+</span>
          </strong>{' '}
          means the records have gaps, so the true figure is higher. Where a race has no official time, his laps times his best lap stand in,
          and real laps are slower than a best lap.
        </p>
        <p>
          <strong>Modelled</strong> figures are ranges built on stated guesses. Fuel uses a low, a middle and a high guess at what each car
          burns per mile.
        </p>
      </div>
      <div className="odo-method__col">
        <h3 className="odo-method__title">Rules kept throughout</h3>
        <p>
          At the Daytona 24 Hours only his own 142 of the car's 780 laps count. His three Formula Ford heats are not counted as races. Eleven
          sessions the source lists twice were taken out, and four Brands Hatch sessions were measured on the shorter layout they actually
          ran on. Numbers are whole, and a floor always rounds down, so it stays a floor.
        </p>
      </div>
    </div>
  );
};

const Odometer = ({ lifeStats, live }: { lifeStats: UiCareerLifeStats; live: LiveReadiness | null }) => {
  const reduced = useReducedMotion();
  const [viewRef, seen] = useInViewOnce<HTMLDivElement>(0.15);
  const [openId, setOpenId] = useState<string | null>(null);
  const [methodOpen, setMethodOpen] = useState(false);
  const order = ODOMETER_GROUPS.flatMap((group) => group.figures.map((spec) => spec.id));
  const figures = order
    .map((id) => figureById(lifeStats.figures, id))
    .filter((figure): figure is UiCareerFigure => figure !== undefined);
  const STAGGER = 60;
  const RUN = 2100;
  const elapsed = useClock(seen, RUN + STAGGER * order.length, reduced);
  const progressOf = (id: string) => (elapsed - Math.max(0, order.indexOf(id)) * STAGGER) / RUN;

  useEffect(() => {
    if (openId === null && !methodOpen) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenId(null);
        setMethodOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, methodOpen]);

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
    <section className={`career-odometer${odoColourOld() ? ' career-odometer--r2' : ''}`} aria-labelledby="career-odometer-title">
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
      <div className="odo-keyline">
        <p className="odo-keyline__key">
          Counted exactly unless marked. <span className="odo-plus">+</span> means at least: the true figure is higher. A range is
          modelled. <PointerWord mouse="Click" touch="Tap" /> a figure to see how it was counted.
        </p>
        <button
          type="button"
          className={`odo-keyline__toggle${methodOpen ? ' odo-keyline__toggle--open' : ''}`}
          aria-expanded={methodOpen}
          aria-controls="odo-method"
          onClick={() => setMethodOpen((open) => !open)}
        >
          How these were counted
          <span className="odo-fig__chev" aria-hidden />
        </button>
      </div>
      {methodOpen ? <OdometerMethod lifeStats={lifeStats} /> : null}
      <div ref={viewRef} className="odo-groups">
        {ODOMETER_GROUPS.map((group) => (
          <OdoGroup
            key={group.key}
            group={group}
            figures={lifeStats.figures}
            lifeStats={lifeStats}
            progressOf={progressOf}
            openId={openId}
            setOpenId={setOpenId}
          />
        ))}
      </div>
      <OdometerLive lifeStats={lifeStats} live={live} />
    </section>
  );
};

/* ============================================================
 * 2. His life in weeks (round 4): "A share of his life" and "His career
 *    in weeks" made one. Every week since he was born is a square; the
 *    weeks with a race meeting are lit by series. Pointing at any week
 *    says what the data holds for it, and nothing it doesn't.
 * ============================================================ */

const isoOf = (time: number): string => new Date(time).toISOString().slice(0, 10);
const mondayOf = (time: number): number => {
  const day = (new Date(time).getUTCDay() + 6) % 7;
  return time - day * dayMs;
};

/** ISO week-numbering year and week of a UTC date. */
const isoWeekYear = (time: number): { year: number; week: number } => {
  const date = new Date(time);
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const year = date.getUTCFullYear();
  const firstThursday = Date.UTC(year, 0, 4);
  const firstMonday = firstThursday - ((new Date(firstThursday).getUTCDay() + 6) % 7) * dayMs;
  return { year, week: 1 + Math.round((mondayOf(time) - firstMonday) / dayMs / 7) };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthColumns = MONTHS.map((label, month) => ({ label, week: isoWeekYear(Date.UTC(2021, month, 4)).week }));

const shortDate = (time: number, withYear = false): string =>
  new Date(time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

const ageOn = (birth: number, time: number): number => {
  const b = new Date(birth);
  const d = new Date(time);
  let age = d.getUTCFullYear() - b.getUTCFullYear();
  if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
};

type GridRace = UiCareerWeeksGrid['weeks'][number]['races'][number];
type LifeEvent = { eventId: string; seriesId: string; trackName: string; country: string; start: number };
type RaceResult = { label: string; finish: number | null; status: string };

type LifeWeek = {
  index: number;
  monday: number;
  year: number;
  week: number;
  kind: 'birth' | 'before' | 'milestone' | 'quiet' | 'race';
  races: GridRace[];
  milestones: Array<{ label: string; detail: string }>;
};

const countryShort = (country: string): string =>
  country === 'United States' ? 'US' : country === 'United Kingdom' ? 'UK' : country;

/** Everything the hover needs, joined once from the package. */
const useLifeModel = (lifeStats: UiCareerLifeStats) =>
  useMemo(() => {
    const share = lifeStats.lifeShare;
    const birth = toTime(share.birthDate);
    const end = toTime(share.asOf);
    const firstCareer = toTime(lifeStats.weeksGrid.weeks[0]?.monday ?? lifeStats.span.firstDay);
    const careerByMonday = new Map(lifeStats.weeksGrid.weeks.map((week) => [toTime(week.monday), week]));

    const events = new Map<string, LifeEvent>();
    for (const leg of lifeStats.travelLegs.legs) {
      for (const stop of [leg.from, leg.to]) {
        if (!events.has(stop.eventId)) {
          events.set(stop.eventId, { eventId: stop.eventId, seriesId: '', trackName: stop.trackName, country: stop.country, start: toTime(stop.date) });
        }
      }
    }
    const raceTotals = new Map<string, number>();
    for (const week of lifeStats.weeksGrid.weeks) {
      for (const race of week.races) {
        raceTotals.set(race.eventId, (raceTotals.get(race.eventId) ?? 0) + race.raceCount);
        const known = events.get(race.eventId);
        if (known) known.seriesId = race.seriesId;
      }
    }
    /* Results join on the meeting's start date and name. INDY NXT result rows
     * add the year to the name ("Detroit Grand Prix 2026"), and a doubleheader's
     * two events share a date, so the name must match from its start. */
    const gridName = new Map<string, string>();
    for (const week of lifeStats.weeksGrid.weeks) for (const race of week.races) gridName.set(race.eventId, race.eventName);
    const eventsByDate = new Map<string, string[]>();
    for (const event of events.values()) {
      const key = isoOf(event.start);
      eventsByDate.set(key, [...(eventsByDate.get(key) ?? []), event.eventId]);
    }
    const results = new Map<string, RaceResult[]>();
    const wetByEvent = new Map<string, WetRead[]>();
    for (const race of uiDataPackage.screens.careerLab.unclassifiedRaces ?? []) {
      const wet = race.eventId ? wetFor(race.sessionId) : null;
      if (wet && race.eventId) wetByEvent.set(race.eventId, [...(wetByEvent.get(race.eventId) ?? []), wet]);
    }
    for (const row of uiDataPackage.screens.careerLab.resultConversion as Row[]) {
      const name = asString(row.eventName) ?? '';
      const candidates = eventsByDate.get(asString(row.eventStartDate) ?? '') ?? [];
      const eventId =
        candidates.find((id) => gridName.get(id) === name) ??
        candidates
          .filter((id) => name.startsWith(gridName.get(id) ?? '\u0000'))
          .sort((a, b) => (gridName.get(b)?.length ?? 0) - (gridName.get(a)?.length ?? 0))[0];
      if (!eventId) continue;
      /* Wet weekends (round 2, intersections): each race's wet read, by meeting. */
      const wet = wetFor(asString(row.sessionId) ?? '');
      if (wet) wetByEvent.set(eventId, [...(wetByEvent.get(eventId) ?? []), wet]);
      const list = results.get(eventId) ?? [];
      list.push({ label: asString(row.raceLabel) ?? '', finish: asNumber(row.finishPosition), status: asString(row.status) ?? 'running' });
      results.set(eventId, list);
    }
    for (const list of results.values()) list.sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }));

    const milestoneByMonday = new Map<number, Array<{ label: string; detail: string }>>();
    for (const item of uiDataPackage.screens.careerLab.smallSeriesStories.origin?.items ?? []) {
      if (!item.date) continue;
      const monday = mondayOf(toTime(item.date));
      const list = milestoneByMonday.get(monday) ?? [];
      list.push({ label: item.label, detail: item.detail });
      milestoneByMonday.set(monday, list);
    }

    const weeks: LifeWeek[] = [];
    for (let monday = mondayOf(birth); monday <= end; monday += 7 * dayMs) {
      const { year, week } = isoWeekYear(monday);
      const career = careerByMonday.get(monday);
      const races = career?.races ?? [];
      const milestones = milestoneByMonday.get(monday) ?? [];
      const kind: LifeWeek['kind'] =
        weeks.length === 0
          ? 'birth'
          : races.length > 0
            ? 'race'
            : milestones.length > 0
              ? 'milestone'
              : monday >= firstCareer
                ? 'quiet'
                : 'before';
      weeks.push({ index: weeks.length, monday, year, week, kind, races, milestones });
    }

    /* For a week with no racing in the racing years: the meetings either side. */
    const prevRace: Array<number | null> = [];
    let last: number | null = null;
    for (const week of weeks) {
      prevRace.push(last);
      if (week.kind === 'race') last = week.index;
    }
    const nextRace: Array<number | null> = new Array(weeks.length).fill(null);
    let next: number | null = null;
    for (let index = weeks.length - 1; index >= 0; index -= 1) {
      nextRace[index] = next;
      if (weeks[index].kind === 'race') next = index;
    }

    const legMiles = new Map<string, number>();
    for (const leg of lifeStats.travelLegs.legs) legMiles.set(`${leg.from.eventId}>${leg.to.eventId}`, leg.greatCircleMiles);

    const years = [...new Set(weeks.map((week) => week.year))];
    const wetWeeksOn = switchValue('wetweeks') !== 'off';
    return { birth, end, weeks, years, events, raceTotals, results, prevRace, nextRace, legMiles, wetByEvent: wetWeeksOn ? wetByEvent : new Map<string, WetRead[]>() };
  }, [lifeStats]);

type LifeModel = ReturnType<typeof useLifeModel>;

const resultWord = (result: RaceResult): string => {
  if (result.status === 'contact') return `${result.finish ? `${ordinal(result.finish)}, ` : ''}out after contact`;
  if (result.status === 'mechanical') return `${result.finish ? `${ordinal(result.finish)}, ` : ''}out with a mechanical failure`;
  return result.finish ? ordinal(result.finish) : 'finished';
};

/** One line per venue and series in the week: an INDY NXT doubleheader is two
 *  events in the data but one weekend at one track, so its races are joined. */
const WeekRaceLines = ({ model, races }: { model: LifeModel; races: GridRace[] }) => {
  const first = races[0];
  const meta = seriesMetaById(first.seriesId);
  const event = model.events.get(first.eventId);
  const place = event ? `${event.trackName}, ${countryShort(event.country)}` : first.eventName;
  const results = races.flatMap((race) => model.results.get(race.eventId) ?? []);
  const inWeek = races.reduce((sum, race) => sum + race.raceCount, 0);
  const total = races.reduce((sum, race) => sum + (model.raceTotals.get(race.eventId) ?? race.raceCount), 0);
  const counted = (n: number) => (n === 1 ? 'One race' : `${n} races`);
  let outcome: string;
  if (inWeek === 0) {
    outcome = 'Days of this meeting; its races fell in another week';
  } else if (first.seriesId === 'series_imsa_weathertech') {
    outcome = `The 24-hour race: ${results[0]?.finish ? ordinal(results[0].finish) : 'finished'} overall, in a car shared with three co-drivers`;
  } else if (inWeek === total && results.length > 0) {
    const missing = total - results.length;
    outcome = `${counted(total)}: ${results.map(resultWord).join(', ')}${missing > 0 ? `; ${missing} not classified` : ''}`;
  } else {
    outcome = `${inWeek} of this meeting's ${total} races fell this week${results.length ? `. The meeting: ${results.map(resultWord).join(', ')}` : ''}`;
  }
  return (
    <span className="life-tip__race">
      <span className="life-tip__event">
        <i aria-hidden style={{ background: meta.tint }} />
        {meta.short} at {place}
      </span>
      <span className="life-tip__outcome">{outcome}</span>
      {(() => {
        const reads = races.flatMap((race) => model.wetByEvent.get(race.eventId) ?? []);
        if (reads.length === 0) return null;
        const of = (n: number) => (n === total ? (total === 1 ? 'the race' : `all ${total} races`) : `${n} of ${total} races`);
        const wet = reads.filter((read) => read.state === 'wet').length;
        const mixed = reads.length - wet;
        const modelled = reads.every((read) => read.modelled) ? ' (modelled)' : reads.some((read) => read.modelled) ? ' (partly modelled)' : '';
        const parts = [wet > 0 ? `wet track in ${of(wet)}` : null, mixed > 0 ? `damp or drying in ${of(mixed)}` : null].filter(Boolean).join('; ');
        return <span className="life-tip__wet">{`${parts.charAt(0).toUpperCase()}${parts.slice(1)}${modelled}`}</span>;
      })()}
    </span>
  );
};

const groupWeekRaces = (model: LifeModel, races: GridRace[]): GridRace[][] => {
  const groups = new Map<string, GridRace[]>();
  for (const race of races) {
    const key = `${race.seriesId}|${model.events.get(race.eventId)?.trackName ?? race.eventId}`;
    groups.set(key, [...(groups.get(key) ?? []), race]);
  }
  return [...groups.values()];
};

const WeekStory = ({ model, week }: { model: LifeModel; week: LifeWeek }) => {
  const sunday = week.monday + 6 * dayMs;
  const sameYear = new Date(week.monday).getUTCFullYear() === new Date(sunday).getUTCFullYear();
  const age = ageOn(model.birth, Math.min(sunday, model.end));
  const range =
    week.kind === 'birth'
      ? monthYear(isoOf(model.birth))
      : `${shortDate(week.monday, !sameYear)} to ${shortDate(sunday, true)}`;
  const head = (
    <span className="life-tip__date">
      {range}
      {week.kind === 'birth' ? null : <span className="life-tip__age"> · age {age}</span>}
    </span>
  );
  if (week.kind === 'birth') {
    return (
      <>
        {head}
        <span className="life-tip__line">Born.</span>
      </>
    );
  }
  if (week.kind === 'race') {
    return (
      <>
        {head}
        {groupWeekRaces(model, week.races).map((races) => (
          <WeekRaceLines key={races[0].eventId} model={model} races={races} />
        ))}
      </>
    );
  }
  if (week.kind === 'milestone') {
    return (
      <>
        {head}
        {week.milestones.map((item) => (
          <span key={item.label} className="life-tip__race">
            <span className="life-tip__event">
              <i aria-hidden className="life-tip__ring" />
              {item.label}
            </span>
            <span className="life-tip__outcome">{item.detail} A sourced karting milestone, not a race result.</span>
          </span>
        ))}
      </>
    );
  }
  if (week.kind === 'before') {
    return (
      <>
        {head}
        <span className="life-tip__line">No recorded racing.</span>
        <span className="life-tip__muted">
          {week.year >= 2016
            ? `The data holds a few karting milestones from 2016 to 2018, but no race-by-race results before ${monthYear(uiDataPackage.screens.careerLab.lifeStats.lifeShare.firstRaceDate)}.`
            : `The record starts with his first classified car race, in ${monthYear(uiDataPackage.screens.careerLab.lifeStats.lifeShare.firstRaceDate)}.`}
        </span>
      </>
    );
  }
  /* A quiet week in the racing years: the meetings either side, from the data. */
  const prevIndex = model.prevRace[week.index];
  const nextIndex = model.nextRace[week.index];
  const prevRace = prevIndex !== null ? model.weeks[prevIndex].races[model.weeks[prevIndex].races.length - 1] : null;
  const nextRace = nextIndex !== null ? model.weeks[nextIndex].races[0] : null;
  const prevEvent = prevRace ? model.events.get(prevRace.eventId) : undefined;
  const nextEvent = nextRace ? model.events.get(nextRace.eventId) : undefined;
  const sameSeason =
    prevRace && nextRace && prevEvent && nextEvent && prevRace.seriesId === nextRace.seriesId &&
    new Date(prevEvent.start).getUTCFullYear() === new Date(nextEvent.start).getUTCFullYear();
  const miles = prevRace && nextRace ? model.legMiles.get(`${prevRace.eventId}>${nextRace.eventId}`) : undefined;
  return (
    <>
      {head}
      <span className="life-tip__line">No recorded racing.</span>
      {sameSeason && prevRace ? (
        <span className="life-tip__muted">
          Between rounds of the {new Date(prevEvent!.start).getUTCFullYear()} {seriesMetaById(prevRace.seriesId).short} season.
        </span>
      ) : null}
      {prevEvent && prevRace ? (
        <span className="life-tip__muted">
          Last meeting: {seriesMetaById(prevRace.seriesId).short} at {prevEvent.trackName}, from {shortDate(prevEvent.start, true)}.
        </span>
      ) : null}
      {nextEvent && nextRace ? (
        <span className="life-tip__muted">
          Next: {seriesMetaById(nextRace.seriesId).short} at {nextEvent.trackName}, from {shortDate(nextEvent.start, true)}
          {miles && miles > 0 ? `, ${wholeNumber.format(miles)} miles away in a straight line` : ''}.
        </span>
      ) : null}
    </>
  );
};

const weekLabel = (model: LifeModel, week: LifeWeek): string => {
  if (week.kind === 'birth') return `${monthYear(isoOf(model.birth))}: born.`;
  const base = `Week of ${shortDate(week.monday, true)}`;
  if (week.kind === 'race') {
    return `${base}: ${week.races
      .map((race) => {
        const event = model.events.get(race.eventId);
        return `${seriesMetaById(race.seriesId).short} at ${event?.trackName ?? race.eventName}${race.bestFinish ? `, best ${ordinal(race.bestFinish)}` : ''}`;
      })
      .join('; ')}.`;
  }
  if (week.kind === 'milestone') return `${base}: ${week.milestones.map((item) => item.label).join('; ')}, a karting milestone.`;
  return `${base}: no recorded racing.`;
};

/* Round 3 colour (Jack: the life-in-weeks colours "don't fit the clean
 * aesthetic of the site"). Switch `lifecolour`:
 * - ink (default): every race week in ink on paper. A series' own colour
 *   shows only when asked for: point at (or tap) a series in the key, or any
 *   race week, and that series' weeks light in its hue while the other race
 *   weeks step back to a faint ink.
 * - muted: each series in its hue taken halfway to grey, quiet at rest; the
 *   same lighting on hover.
 * - old: round 2, every series in full colour; the key dims the others. */
type LifeColour = 'ink' | 'tone' | 'muted' | 'old';
const lifeColour = (): LifeColour => {
  const value = switchValue('lifecolour');
  return value === 'tone' || value === 'muted' || value === 'old' ? value : 'ink';
};
const mutedTint = (tint: string): string => `color-mix(in oklab, ${tint} 52%, var(--grey-ink3))`;
/** tone: one ink, lightest for the first series he raced and darkest for INDY NXT,
 *  so the grid darkens as he climbs. `order` is the series' place among those raced. */
const toneTint = (order: number, count: number): string =>
  `color-mix(in srgb, var(--ink) ${Math.round(34 + (66 * order) / Math.max(1, count - 1))}%, var(--paper))`;
/** The tone of a series among those in the grid (seriesOrder is the order he raced them). */
const toneOf = (seriesId: string, inGrid: string[]): string => toneTint(Math.max(0, inGrid.indexOf(seriesId)), inGrid.length);
/** The swatch a series wears in a version at rest. */
const lifeSwatch = (colour: LifeColour, seriesId: string, inGrid: string[]): string => {
  const tint = seriesMetaById(seriesId).tint;
  if (colour === 'muted') return mutedTint(tint);
  if (colour === 'tone') return toneOf(seriesId, inGrid);
  return tint;
};

const LifeGrid = ({
  lifeStats,
  model,
  focus = null,
  colour = 'ink'
}: {
  lifeStats: UiCareerLifeStats;
  model: LifeModel;
  focus?: string | null;
  colour?: LifeColour;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const coarse = useCoarsePointer();
  const [active, setActive] = useState<number | null>(null);
  const { weeks, years } = model;
  const raceIndexes = useMemo(() => weeks.filter((week) => week.kind === 'race').map((week) => week.index), [weeks]);

  /* Years as rows on a wide screen; years as columns on a phone. */
  const vertical = width > 0 && width < 640;
  const gap = vertical ? 2 : 3;
  const labelW = vertical ? 0 : 46;
  const headH = vertical ? 22 : 22;
  const maxWeek = 53;
  const cellW = vertical
    ? Math.max(6, Math.floor((width - 30 - gap * (years.length - 1)) / years.length))
    : Math.max(6, Math.min(22, Math.floor((width - labelW - gap * (maxWeek - 1)) / maxWeek)));
  const cellH = vertical ? 6 : cellW;
  const leftPad = vertical ? 30 : labelW;
  const pos = (week: LifeWeek) => {
    const row = years.indexOf(week.year);
    return vertical
      ? { x: leftPad + row * (cellW + gap), y: headH + (week.week - 1) * (cellH + gap) }
      : { x: leftPad + (week.week - 1) * (cellW + gap), y: headH + row * (cellH + gap) };
  };
  const svgW = vertical ? leftPad + years.length * (cellW + gap) : leftPad + maxWeek * (cellW + gap);
  const svgH = vertical ? headH + maxWeek * (cellH + gap) : headH + years.length * (cellH + gap);

  const byYearWeek = useMemo(() => new Map(weeks.map((week) => [`${week.year}-${week.week}`, week.index])), [weeks]);
  const pick = (clientX: number, clientY: number, target: SVGSVGElement): number | null => {
    const bounds = target.getBoundingClientRect();
    const px = clientX - bounds.left - leftPad;
    const py = clientY - bounds.top - headH;
    if (px < -2 || py < -2) return null;
    const along = vertical ? py : px;
    const across = vertical ? px : py;
    const alongPitch = vertical ? cellH + gap : cellW + gap;
    const acrossPitch = vertical ? cellW + gap : cellH + gap;
    const weekNo = Math.floor(along / alongPitch) + 1;
    const row = Math.floor(across / acrossPitch);
    if (row < 0 || row >= years.length || weekNo < 1 || weekNo > maxWeek) return null;
    return byYearWeek.get(`${years[row]}-${weekNo}`) ?? null;
  };

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? raceIndexes[raceIndexes.length - 1] ?? 0;
    let next: number | null = null;
    const sameWeekOtherRow = (delta: number) => {
      const week = weeks[current];
      const row = years.indexOf(week.year) + delta;
      if (row < 0 || row >= years.length) return current;
      return byYearWeek.get(`${years[row]}-${week.week}`) ?? byYearWeek.get(`${years[row]}-${Math.min(week.week, 52)}`) ?? current;
    };
    const along = vertical ? ['ArrowDown', 'ArrowUp'] : ['ArrowRight', 'ArrowLeft'];
    const across = vertical ? ['ArrowRight', 'ArrowLeft'] : ['ArrowDown', 'ArrowUp'];
    if (event.key === along[0]) next = Math.min(weeks.length - 1, current + 1);
    else if (event.key === along[1]) next = Math.max(0, current - 1);
    else if (event.key === across[0]) next = sameWeekOtherRow(1);
    else if (event.key === across[1]) next = sameWeekOtherRow(-1);
    else if (event.key === 'PageDown' || event.key === ']') next = raceIndexes.find((index) => index > current) ?? current;
    else if (event.key === 'PageUp' || event.key === '[') next = [...raceIndexes].reverse().find((index) => index < current) ?? current;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = weeks.length - 1;
    else if (event.key === 'Escape') {
      setActive(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setActive(next);
    }
  };

  const activeWeek = active === null ? null : weeks[active];
  const activePos = activeWeek ? pos(activeWeek) : null;
  /* The series in hand: the key's, else the race week under the pointer's. */
  const inGrid = useMemo(
    () => seriesOrder.filter((id) => weeks.some((week) => week.races.some((race) => race.seriesId === id))),
    [weeks]
  );
  const lit = colour === 'old' ? null : focus ?? (activeWeek?.kind === 'race' ? activeWeek.races[0]?.seriesId ?? null : null);
  const weekFill = (seriesId: string): string => {
    const tint = seriesMetaById(seriesId).tint;
    if (colour === 'old') return tint;
    if (lit) return seriesId === lit ? tint : 'var(--life-unlit)';
    return colour === 'ink' ? 'var(--life-race)' : lifeSwatch(colour, seriesId, inGrid);
  };
  /* The note sits beside the week, above it when there is room. */
  const tipW = Math.min(360, Math.max(240, width - 16));
  const tipLeft = activePos ? Math.max(0, Math.min(activePos.x + cellW / 2 - tipW / 2, width - tipW)) : 0;
  const tipAbove = activePos ? activePos.y > svgH * 0.45 : true;

  const firstRace = weeks.find((week) => week.kind === 'race');
  const lastRace = [...weeks].reverse().find((week) => week.kind === 'race');
  const birthWeek = weeks[0];
  const lastWeek = weeks[weeks.length - 1];
  const ageFirst = figureById(lifeStats.lifeShare.figures, 'ageAtFirstRace');
  const ageLast = figureById(lifeStats.lifeShare.figures, 'ageAtLastRace');

  return (
    <div ref={ref} className="life-grid" onPointerLeave={(event) => (event.pointerType === 'mouse' ? setActive(null) : undefined)}>
      {width > 0 ? (
        <>
          <svg
            width={svgW}
            height={svgH}
            tabIndex={0}
            role="img"
            aria-label={`Every week of his life, ${weeks.length} from ${monthYear(isoOf(model.birth))} to ${monthYear(isoOf(model.end))}. The ${raceIndexes.length} weeks with a race meeting are ${colour === 'ink' ? 'filled in' : 'coloured by series'}. Use the arrow keys to move week by week, Page Up and Page Down to jump between race weeks.`}
            onPointerMove={(event) => {
              if (event.pointerType === 'touch') return;
              const index = pick(event.clientX, event.clientY, event.currentTarget);
              if (index !== null) setActive(index);
            }}
            onPointerDown={(event) => {
              const index = pick(event.clientX, event.clientY, event.currentTarget);
              setActive(index);
            }}
            onFocus={() => setActive((current) => current ?? raceIndexes[raceIndexes.length - 1] ?? null)}
            onBlur={() => setActive(null)}
            onKeyDown={onKey}
          >
            {monthColumns.map((month, index) =>
              vertical ? (
                index % 2 === 0 ? (
                  <text key={month.label} x={0} y={headH + (month.week - 1) * (cellH + gap) + cellH} className="life-grid__axis">
                    {month.label}
                  </text>
                ) : null
              ) : (
                <text key={month.label} x={leftPad + (month.week - 1) * (cellW + gap)} y={13} className="life-grid__axis">
                  {month.label}
                </text>
              )
            )}
            {years.map((year, row) =>
              vertical ? (
                row % 2 === (years.length - 1) % 2 ? (
                  <text key={year} x={leftPad + row * (cellW + gap) + cellW / 2} y={13} textAnchor="middle" className="life-grid__year">
                    ’{String(year).slice(2)}
                  </text>
                ) : null
              ) : (
                <text key={year} x={0} y={headH + row * (cellH + gap) + cellH / 2} dominantBaseline="central" className="life-grid__year">
                  {year}
                </text>
              )
            )}
            {weeks.map((week) => {
              const { x, y } = pos(week);
              if (week.kind === 'race') {
                const ids = [...new Set(week.races.map((race) => race.seriesId))];
                return (
                  <g
                    key={week.index}
                    opacity={colour === 'old' && focus && !ids.includes(focus) ? 0.18 : 1}
                    style={{ transition: 'opacity 160ms ease' }}
                  >
                    <rect x={x} y={y} width={cellW} height={cellH} className="life-grid__race" style={{ fill: weekFill(ids[0]) }} />
                    {ids.length > 1 ? (
                      <rect
                        x={vertical ? x + cellW / 2 : x}
                        y={vertical ? y : y + cellH / 2}
                        width={vertical ? cellW / 2 : cellW}
                        height={vertical ? cellH : cellH / 2}
                        className="life-grid__race"
                        style={{ fill: weekFill(ids[1]) }}
                      />
                    ) : null}
                    {week.races.some((race) => model.wetByEvent.has(race.eventId)) ? (
                      <line className="wet-week" x1={x + 1} y1={y + cellH - 1} x2={x + cellW - 1} y2={y + 1} />
                    ) : null}
                  </g>
                );
              }
              if (week.kind === 'quiet') {
                return <rect key={week.index} x={x + 0.5} y={y + 0.5} width={cellW - 1} height={cellH - 1} className="life-grid__quiet" />;
              }
              if (week.kind === 'milestone') {
                return <rect key={week.index} x={x + 0.75} y={y + 0.75} width={cellW - 1.5} height={cellH - 1.5} className="life-grid__milestone" />;
              }
              if (week.kind === 'birth') {
                return <rect key={week.index} x={x} y={y} width={cellW} height={cellH} className="life-grid__birth" />;
              }
              return <rect key={week.index} x={x} y={y} width={cellW} height={cellH} className="life-grid__before" />;
            })}
            {!vertical && birthWeek && firstRace && lastRace ? (
              <>
                <text x={pos(birthWeek).x - 10} y={pos(birthWeek).y + cellH / 2} dominantBaseline="central" textAnchor="end" className="life-grid__note">
                  Born, {monthYear(isoOf(model.birth))}
                </text>
                <text
                  x={pos(lastWeek).x + cellW + 10}
                  y={pos(lastWeek).y + cellH / 2}
                  dominantBaseline="central"
                  className="life-grid__note"
                >
                  Latest race, age {ageLast?.display ?? ''}
                </text>
              </>
            ) : null}
            {activeWeek && activePos ? (
              <rect
                x={activePos.x - 2.5}
                y={activePos.y - 2.5}
                width={cellW + 5}
                height={cellH + 5}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5}
                pointerEvents="none"
              />
            ) : null}
          </svg>
          {activeWeek && activePos ? (
            <div
              className={`life-tip${tipAbove ? ' life-tip--above' : ''}`}
              style={{
                width: tipW,
                left: tipLeft,
                ...(tipAbove ? { top: activePos.y - 10 } : { top: activePos.y + cellH + 10 })
              }}
              role="status"
              aria-live="polite"
            >
              <WeekStory model={model} week={activeWeek} />
            </div>
          ) : (
            <span className="sr-only" role="status" aria-live="polite" />
          )}
          {activeWeek ? <span className="sr-only">{weekLabel(model, activeWeek)}</span> : null}
        </>
      ) : null}
      {vertical ? null : (
        <p className="life-grid__firstrace">
          First race, {firstRace ? monthYear(isoOf(firstRace.monday + 4 * dayMs)) : ''}, age {ageFirst?.display ?? ''}.{' '}
          {coarse ? 'Tap' : 'Point at'} any week to see what he was doing{colour === 'old' ? '' : ', or a series below to light its weeks'}.
        </p>
      )}
      {vertical ? (
        <p className="life-grid__firstrace">Tap any week to see what he was doing{colour === 'old' ? '' : ', or a series below to light its weeks'}.</p>
      ) : null}
    </div>
  );
};

const LifeInWeeks = ({ lifeStats }: { lifeStats: UiCareerLifeStats }) => {
  const share = lifeStats.lifeShare;
  const model = useLifeModel(lifeStats);
  const [howOpen, setHowOpen] = useState(false);
  /* Pointing at (or tapping) a series in the key lights only its weeks. */
  const [focus, setFocus] = useState<string | null>(null);
  const keyTap = useTapPreview();
  const colour = lifeColour();
  const f = (id: string) => figureById(share.figures, id);
  const eventDays = figureById(lifeStats.figures, 'eventDays');
  const raceWeeks = figureById(share.figures, 'raceWeeksShareOfLife') ?? figureById(lifeStats.figures, 'raceWeeks');
  const weeksLived = f('weeksLived');
  const daysAlive = f('daysAlive');
  const lifePct = f('eventDaysShareOfLife');
  const careerPct = f('eventDaysShareOfCareer');
  const ageFirst = f('ageAtFirstRace');
  const ageLast = f('ageAtLastRace');
  if (!eventDays || !raceWeeks || !weeksLived || !lifePct || !careerPct || !ageFirst || !ageLast) {
    return (
      <section className="career-life">
        <h2 className="career-section-title">His life in weeks</h2>
        <Unavailable>The share-of-life figures are not in this data package.</Unavailable>
      </section>
    );
  }
  const seriesInGrid = seriesOrder.filter((id) => model.weeks.some((week) => week.races.some((race) => race.seriesId === id)));
  const hasMilestones = model.weeks.some((week) => week.kind === 'milestone');
  const seriesKeyItems = seriesInGrid.map((id) => {
    const meta = seriesMetaById(id);
    return (
      <span
        key={id}
        className={`series-key__series${focus === id ? ' series-key__series--on' : ''}`}
        {...keyTap.target(id, { show: () => setFocus(id), hide: () => setFocus(null) })}
      >
        <i aria-hidden style={{ background: lifeSwatch(colour, id, seriesInGrid) }} />
        {meta.short}
      </span>
    );
  });
  const facts: Array<{ value: string; label: ReactNode }> = [
    { value: raceWeeks.display, label: <>of the {weeksLived.display} weeks he has lived held a race meeting</> },
    {
      value: lifePct.display,
      label: (
        <>
          of his {daysAlive?.display ?? ''} days alive were race-meeting days ({eventDays.display})
        </>
      )
    },
    { value: careerPct.display, label: <>of the days since his first race meeting</> },
    {
      value: `${ageFirst.display} to ${ageLast.display}`,
      label: (
        <>
          his age at his first race, {monthYear(share.firstRaceDate)}, and his latest, {monthYear(share.lastRaceDate)}
        </>
      )
    }
  ];
  return (
    <section className="career-life" aria-labelledby="career-life-title">
      <div className="career-section-head">
        <h2 id="career-life-title" className="career-section-title">
          His life in weeks
        </h2>
      </div>
      <div className="life-layout">
        <div className="life-layout__grid">
          <LifeGrid lifeStats={lifeStats} model={model} focus={focus} colour={colour} />
          <div className={`series-key series-key--${colour}${focus ? ' series-key--focus' : ''}`} aria-label="What the squares mean">
            {colour === 'ink' ? (
              <span>
                <i aria-hidden className="series-key__race" />
                a race meeting
              </span>
            ) : null}
            {colour === 'ink' ? null : seriesKeyItems}
            <span>
              <i aria-hidden className="series-key__empty" />
              racing years, no meeting
            </span>
            <span>
              <i aria-hidden className="series-key__before" />
              before his first race
            </span>
            {hasMilestones ? (
              <span>
                <i aria-hidden className="series-key__milestone" />
                karting milestone
              </span>
            ) : null}
            {model.wetByEvent.size > 0 ? (
              <span>
                <i aria-hidden className="series-key__wet" />
                a race on a wet track
              </span>
            ) : null}
            {colour === 'ink' ? (
              <span className="series-key__light">{seriesKeyItems}</span>
            ) : null}
          </div>
        </div>
        <div className="life-layout__facts">
          {facts.map((fact) => (
            <div key={fact.value} className="life-fact">
              <span className="life-fact__value">{fact.value}</span>
              <span className="life-fact__label">{fact.label}</span>
            </div>
          ))}
          <button
            type="button"
            className={`odo-keyline__toggle life-how-toggle${howOpen ? ' odo-keyline__toggle--open' : ''}`}
            aria-expanded={howOpen}
            aria-controls="life-how"
            onClick={() => setHowOpen((open) => !open)}
          >
            What a lit week means
            <span className="odo-fig__chev" aria-hidden />
          </button>
          {howOpen ? (
            <div id="life-how" className="life-how">
              <p>
                One square is one week, Monday to Sunday, from the week he was born to the week of his latest race. A week is lit when it
                holds at least one day of an official race meeting, from the first to the last day the series lists
                {colour === 'ink'
                  ? '. Pointing at a series, or at any race week, lights that series’ weeks in its colour.'
                  : ", in that series' colour. A week split in two colours held meetings in two series."}
              </p>
              <p>
                An unlit week only means no racing is recorded. Travel, testing, the simulator and karting before 2019 are not in the data;
                the outlined karting weeks are sourced milestones, not races.
              </p>
              <p>
                Days alive count every day from his birth in {monthYear(share.birthDate)} to {longDate(share.asOf)}, both included. The
                shares divide the {eventDays.display} days at race meetings by those days, and by the{' '}
                {wholeNumber.format(eventDays.denominator?.value ?? lifeStats.span.days)} days from his first race meeting to his latest.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

/* ============================================================
 * 6. The chapters: a horizontal timeline, one chapter open at a time
 * ============================================================ */

/* Career chapters in journey order — the climb from F1600 to INDY NXT.
 * Narrative lines are descriptive context only; every number beside them
 * comes from the source-backed series summary. */
const seriesChapters: Array<{ key: string; seriesId: string; name: string; years: string; short?: string; narrative: string }> = [
  {
    key: 'scca',
    seriesId: 'series_scca_super_tour',
    name: 'SCCA U.S. Majors Tour',
    years: '2019',
    short: 'SCCA',
    narrative: 'His first races on the record: Formula F at Homestead-Miami, Sebring, COTA and Road Atlanta, January to March 2019.'
  },
  {
    key: 'f1600',
    seriesId: 'series_frp_f1600',
    name: 'F1600 Championship Series',
    years: '2019',
    short: 'F1600',
    narrative: 'His first full season racing cars, in American grassroots open-wheel.'
  },
  {
    key: 'rcffs',
    seriesId: 'series_rcffs',
    name: 'Right Coast Formula F Series',
    years: '2019',
    short: 'RCFFS',
    narrative: 'One Formula F race at Mid-Ohio in June 2019, and his first win in a car.'
  },
  {
    key: 'formula-ford',
    seriesId: 'series_formula_ford',
    name: 'Formula Ford',
    years: '2019–20',
    narrative: 'A year in the UK’s old school of racecraft, through to the Festival and the Walter Hayes Trophy.'
  },
  {
    key: 'gb3',
    seriesId: 'series_gb3',
    name: 'GB3 Championship',
    years: '2021–22',
    short: 'GB3',
    narrative: 'Two seasons of British junior formula racing against deep international fields.'
  },
  {
    key: 'euroformula',
    seriesId: 'series_euroformula_open',
    name: 'Euroformula Open',
    years: '2023',
    short: 'Euroformula',
    narrative: 'A full European season in continental single-seaters.'
  },
  {
    key: 'fr-oceania',
    seriesId: 'series_froc',
    name: 'Castrol Toyota Formula Regional Oceania Championship',
    years: '2024',
    short: 'FR Oceania',
    narrative: 'A New Zealand summer in the Toyota series that feeds the junior ladder.'
  },
  {
    key: 'usf-pro-2000',
    seriesId: 'series_usf_pro_2000',
    name: 'USF Pro 2000 Championship',
    years: '2024',
    short: 'USF Pro 2000',
    narrative: 'One race on the Indianapolis Raceway Park oval: the 2024 Freedom 90.'
  },
  {
    key: 'daytona',
    seriesId: 'series_imsa_weathertech',
    name: 'IMSA WeatherTech SportsCar Championship',
    years: '2025',
    short: 'Daytona 24',
    narrative:
      'One race, twenty-four hours: the Rolex 24 at Daytona in a GTP prototype, shared with three co-drivers through the night.'
  },
  {
    key: 'indy-nxt',
    seriesId: 'series_indy_nxt',
    name: 'INDY NXT',
    years: '2024–26',
    narrative: 'The step below INDYCAR, and the current chapter.'
  }
];

/* Races entered per series, from the weeks grid the odometer's series bar
 * reads, so a chapter's count agrees with the bar. The series summary's
 * raceRows counts only classified finishes; where the two differ the panel
 * says so ("23 classified of 26 entered"). */
const enteredBySeries = new Map(
  racesBySeries(uiDataPackage.screens.careerLab.lifeStats).map((row) => [row.seriesId, row.races])
);

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
  const entered = enteredBySeries.get(chapter.seriesId) ?? null;
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
            <span aria-hidden className="chapter-panel__dot" style={{ background: chapterTint(chapter.seriesId) }} />
            {chapter.short ?? chapter.name}
          </h3>
          <span className="chapter-panel__count">
            {f1600Totals
              ? `${f1600Totals.classifiedRaces} classified of ${f1600Totals.raceCount} entered`
              : races !== null && entered !== null && races !== entered
                ? `${formatNumber(races, 0)} classified of ${formatNumber(entered, 0)} entered`
                : (entered ?? races) !== null
                  ? `${formatNumber(entered ?? races ?? 0, 0)} ${(entered ?? races) === 1 ? 'race' : 'races'}`
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
                  <Stat label="Field beaten, on average" value={formatPct(row.avgFieldBeatenPct ?? row.avgFinishPercentile)} />
                  <Stat label="Top-ten rate" value={formatPct(row.top10RatePct)} />
                </div>
              ) : null}
              <div className="chapter-panel__strip">
                <ChapterStrip seriesName={chapter.seriesId} />
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

const ChapterTimeline = ({ rowBySeriesId, lapLine }: { rowBySeriesId: Map<string, Row>; lapLine: string | null }) => {
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
          const row = rowBySeriesId.get(chapter.seriesId);
          const f1600Totals = chapter.key === 'f1600' ? uiDataPackage.screens.careerLab.smallSeriesStories.f1600?.totals ?? null : null;
          const races = f1600Totals ? f1600Totals.raceCount : enteredBySeries.get(chapter.seriesId) ?? (row ? asNumber(row.raceRows) : null);
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
              style={{ ['--tint' as string]: chapterTint(chapter.seriesId) }}
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
          row={rowBySeriesId.get(open.seriesId)}
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

/* November 17, 2026: the six deep dives rebuilt (src/screens/deepDives/);
 * `?deepdive=old` shows the versions live on brycecast.com for comparison. */
const DeepOrOld = ({ old, now }: { old: ReactNode; now: ReactNode }) => (useOldDeepDives() ? <>{old}</> : <>{now}</>);

const archiveItems: Array<{ key: string; title: string; blurb: string; render: () => ReactNode }> = [
  {
    key: 'before',
    title: 'Before the record',
    blurb: 'The karting years, and the run-up to his first race on the record.',
    render: () => <DeepOrOld old={<OriginTimeline />} now={<BeforeDeepDive />} />
  },
  {
    key: 'explorer',
    title: 'The explorer',
    blurb: 'Every race on one chart, grouped by series, season, track type or conditions.',
    render: () => <DeepOrOld old={<CareerExplorer />} now={<ExplorerDeepDive />} />
  },
  {
    key: 'rivals',
    title: 'The rivals',
    blurb: 'The drivers who shared an INDY NXT grid with him five or more times, and who finished ahead.',
    render: () => <DeepOrOld old={<RivalsCard />} now={<RivalsDeepDive />} />
  },
  {
    key: 'restarts',
    title: 'The restarts',
    blurb: 'What happened to his place at each INDY NXT restart.',
    render: () => <DeepOrOld old={<CareerRestarts />} now={<RestartsDeepDive />} />
  },
  {
    key: 'qualifying',
    title: 'Qualifying to the flag',
    blurb: 'Where qualifying put him against where he finished, in every series.',
    render: () => <DeepOrOld old={<QualiConversion />} now={<QualifyingDeepDive />} />
  },
  {
    key: 'climbs',
    title: 'Biggest climbs',
    blurb: 'The five races where he gained the most places.',
    render: () => <DeepOrOld old={<BestClimbs />} now={<ClimbsDeepDive />} />
  },
  {
    key: 'rain',
    title: 'Rain days',
    blurb: 'His wet and mixed days against his dry ones.',
    render: () => <DeepOrOld old={<RainDays />} now={<RainDeepDive />} />
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
  const rowBySeriesId = new Map(rows.map((row) => [asString(row.seriesId) ?? '', row]));

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
      {/* Round 6 (Jack, Nov 16, screenshot 6): the page's source closes the
          intro's last sentence instead of floating at the far right over the
          gap to the odometer. */}
      <header className="career-head">
        <div>
          <h1 className="screen-head__title">His career so far</h1>
          <p className="screen-head__sub">
            {lifeStats && races ? (
              <>
                {races.display} races in {seriesChapters.length} series, {monthYear(lifeStats.span.firstDay)} to{' '}
                {monthYear(lifeStats.span.lastDay)}
                {wins && podiums && topTens
                  ? `: ${wins.display} wins, ${podiums.display} podiums and ${topTens.display} top tens.`
                  : '.'}{' '}
                Every number on this page says how it was made.{' '}
              </>
            ) : null}
            <SourcePill
              title="Career"
              entries={careerLab.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
              caveats={careerLab.caveats}
            />
          </p>
        </div>
      </header>

      {lifeStats ? (
        <>
          <Odometer lifeStats={lifeStats} live={readiness?.payload ?? null} />
          <LifeInWeeks lifeStats={lifeStats} />
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
        <ChapterTimeline rowBySeriesId={rowBySeriesId} lapLine={lapLine} />
      )}

      {/* The campaigns (cumulative points arcs) retired 2026-07-21 on Jack's
          call: points always accumulate, so the arcs said nothing the season
          cards don't. Component retained in careerExplorer for archaeology. */}
      <ArchiveFold />
    </div>
  );
};

