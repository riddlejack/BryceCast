import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { SourcePill } from '../app/components';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion, PointerOpen, type ChartTip } from '../app/charts';
import { formatDate } from '../app/format';
import { Link, useRouter } from '../app/router';
import { useTapPreview } from '../app/tapPreview';
import { uiDataPackage } from '../data/uiDataPackage';
import { TrackArt } from '../app/trackArt';
import { TrackStill, useStillIndex } from '../app/trackStill';
import { venueSlugFor } from '../app/venuePeek';
import { TrackModelSlot } from '../three/TrackModelSlot';
import { sceneWeatherFor } from '../three/weather/sceneWeather';
import { loadIndex } from '../three/trackModelLoad';
import { trackOutlineFor } from '../assets/tracks';
import { switchValue } from '../review/switches';
import { chapterTint, raceHref, seriesShort } from './careerExplorer';
import { enteredBySeries, statusShort, useArchiveRaces, statusWords, unclassifiedRaceFor, unclassifiedTitle, useSheetRaces, type SheetRace } from './careerRaceList';
import { DeepTip } from './deepDives/frame';
import { RainStreaks, wetFor } from './raceWet';
import './careerRace.css';

/* ============================================================================
 * The light race sheet (final pass, November 17, 2026): the page every
 * non-INDY NXT dot on the Career page opens. Brought up to the deep dives'
 * standard: one big figure and one sentence, then the race as the picture.
 *
 *   - the field: a ladder of the classified cars, P1 at the top, his grid slot
 *     ringed and his car rising (or falling) to the flag, once, as it comes into
 *     view. On a phone the same ladder lies on its side.
 *   - the chapter: every classified race of the series in date order, by the
 *     share of the field he beat, this one in his gold. A series he raced once
 *     shows his whole career instead.
 *
 * Every figure is the conversion table's (uiDataPackage resultConversion), the
 * same rows the Career charts draw. Two are read from elsewhere and say so in
 * Sources: the chapter's entered-race count (the life-stats weeks grid, which
 * the Career page's chapter counts read) and the field size (read back from
 * the share of the field beaten, as the Biggest climbs dive does).
 * `?racesheet=row` lays the field on its side at every width.
 * ==========================================================================*/

/* ---------- words ---------- */

const numberWords = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const count = (n: number) => (n >= 0 && n <= 10 ? numberWords[n] : String(n));
const ordinalOf = (n: number): string => {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
};

/** One plain sentence: where he started, where he finished, what it came to. */
const ledeFor = (race: SheetRace): string => {
  const { start, finish, wetDry } = race.row;
  const gain = race.row.gain ?? (start !== null ? start - finish : null);
  const tail = wetDry && wetDry !== 'dry' ? ` on a ${wetDry} track` : '';
  if (start === null) return finish === 1 ? `Won${tail}.` : `Finished ${ordinalOf(finish)}${tail}.`;
  if (finish === 1) return start === 1 ? `Started on pole and won${tail}.` : `Won from ${ordinalOf(start)} on the grid${tail}.`;
  if (gain === 0 || gain === null) return start === 1 ? `Started and finished on pole${tail}.` : `Started and finished ${ordinalOf(finish)}${tail}.`;
  const places = `${count(Math.abs(gain))} ${Math.abs(gain) === 1 ? 'place' : 'places'}`;
  return `Started ${start === 1 ? 'on pole' : ordinalOf(start)}, finished ${ordinalOf(finish)}: ${gain > 0 ? 'up' : 'down'} ${places}${tail}.`;
};

const dayText = (race: SheetRace): string =>
  race.raceDay
    ? formatDate(race.raceDay, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : `Weekend of ${formatDate(race.meetingDay, { month: 'long', day: 'numeric', year: 'numeric' })}`;

const shortDay = (race: SheetRace): string => formatDate(race.raceDay ?? race.meetingDay, { month: 'short', day: 'numeric', year: 'numeric' });

/** Career chapter keys (CareerScreen's seriesChapters), so "Back to Career" opens the race's chapter. */
const chapterKeys: Record<string, string> = {
  series_scca_super_tour: 'scca',
  series_frp_f1600: 'f1600',
  series_rcffs: 'rcffs',
  series_formula_ford: 'formula-ford',
  series_gb3: 'gb3',
  series_euroformula_open: 'euroformula',
  series_froc: 'fr-oceania',
  series_usf_pro_2000: 'usf-pro-2000',
  series_imsa_weathertech: 'daytona'
};

/* ---------- motion: one short play when the field comes into view ---------- */

const RISE_MS = 1150;
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const useRise = (play: boolean): number => {
  const reduced = useReducedMotion();
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setP(1);
      return undefined;
    }
    if (!play) return undefined;
    let frame = 0;
    const t0 = performance.now() + 250; // a beat on the grid before the lights go out
    const step = (now: number) => {
      const t = Math.min(Math.max((now - t0) / RISE_MS, 0), 1);
      setP(ease(t));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [play, reduced]);
  return p;
};

const useWide = (query = '(min-width: 900px)'): boolean => {
  const [wide, setWide] = useState(() => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : true));
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const media = window.matchMedia(query);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return wide;
};

/* ---------- the field ---------- */

interface FieldGeometry {
  /** Slots drawn: the field, or his grid slot when he started behind it. */
  depth: number;
  field: number | null;
  /** With no field size, a few slots past his own fade out. */
  tail: number;
}

const fieldGeometry = (race: SheetRace): FieldGeometry => {
  const { start, finish } = race.row;
  const own = Math.max(start ?? finish, finish);
  if (race.field !== null) return { depth: Math.max(race.field, own), field: race.field, tail: 0 };
  return { depth: own + 3, field: null, tail: 3 };
};

/** P1, every fifth (every tenth when the slots are tight), and the last classified car. */
const tickPositions = (depth: number, field: number | null, step = 20): number[] => {
  const every = step * 5 >= 34 ? 5 : 10;
  const last = field ?? depth - 3;
  const ticks = [1];
  for (let tick = every; tick <= last; tick += every) ticks.push(tick);
  if (field !== null && !ticks.includes(field)) {
    if (ticks.length > 1 && (field - ticks[ticks.length - 1]) * step < 26) ticks.pop();
    ticks.push(field);
  }
  return ticks;
};

const startWords = (race: SheetRace): string | null =>
  race.row.start === null || race.row.start === race.row.finish ? null : `Started P${race.row.start}`;
const finishWords = (race: SheetRace): string =>
  race.row.start !== null && race.row.start === race.row.finish ? `Started and finished P${race.row.finish}` : `Finished P${race.row.finish}`;

const fieldAria = (race: SheetRace): string =>
  `The field, ${race.field !== null ? `${race.field} classified cars` : 'its size not in the source'}. ${
    race.row.start !== null ? `He started P${race.row.start} and finished P${race.row.finish}.` : `He finished P${race.row.finish}; no grid position in the source.`
  }`;

/** The ladder, P1 at the top: a rung per car, his grid slot ringed, the gold line his race. */
const FieldColumn = ({ race, height, play }: { race: SheetRace; height: number; play: boolean }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const p = useRise(play);
  const { depth, field, tail } = fieldGeometry(race);
  const { start, finish } = race.row;
  const top = 12;
  const bottom = tail ? 34 : 14;
  const step = Math.min(22, (height - top - bottom) / Math.max(depth - 1, 1));
  const svgH = top + step * (depth - 1) + bottom;
  const y = (position: number) => top + (position - 1) * step;
  const axisW = 40;
  const rungW = Math.min(96, Math.max(56, width * 0.34));
  const left = axisW;
  const right = left + rungW;
  const cx = left + rungW / 2;
  const from = start ?? finish;
  const markY = y(from) + (y(finish) - y(from)) * p;
  const lost = start !== null && finish > start;
  const ticks = tickPositions(depth, field, step);
  const lastRail = y(field ?? depth - tail) + 5;

  /* the two words beside the ladder, kept apart when the climb is short */
  const startText = startWords(race);
  let startLabelY = start !== null ? y(start) : 0;
  let finishLabelY = y(finish);
  const gap = Math.abs(startLabelY - finishLabelY);
  if (startText && gap < 20) {
    const push = (20 - gap) / 2;
    const finishFirst = finishLabelY <= startLabelY;
    finishLabelY += finishFirst ? -push : push;
    startLabelY += finishFirst ? push : -push;
  }

  return (
    <div ref={ref} className="crs-field crs-field--column">
      {width > 0 ? (
        <svg width={width} height={svgH} role="img" aria-label={fieldAria(race)}>
          {ticks.map((tick) => (
            <text key={tick} x={axisW - 10} y={y(tick)} dy="0.35em" textAnchor="end" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
              P{tick}
            </text>
          ))}
          <line x1={left} x2={left} y1={y(1) - 5} y2={lastRail} stroke="var(--grey-line)" />
          <line x1={right} x2={right} y1={y(1) - 5} y2={lastRail} stroke="var(--grey-line)" />
          {Array.from({ length: depth }, (_, i) => i + 1).map((position) => {
            const beyond = field !== null && position > field;
            const fading = field === null && position > depth - tail;
            const passed = start !== null && !lost && position > finish && position < start && markY < y(position) - 0.5;
            return (
              <line
                key={position}
                x1={left}
                x2={right}
                y1={y(position)}
                y2={y(position)}
                stroke={passed ? 'var(--ink)' : beyond ? 'var(--grey-ink3)' : 'var(--grey-line)'}
                strokeOpacity={passed ? 0.75 : fading ? 1 - (position - (depth - tail)) / (tail + 1) : 1}
                strokeWidth={passed ? 1.25 : 1}
                strokeDasharray={beyond || fading ? '2 3' : undefined}
              />
            );
          })}
          {start !== null ? (
            <>
              <line x1={cx} x2={cx} y1={y(start)} y2={markY} stroke={lost ? 'var(--grey-ink3)' : 'var(--bryce)'} strokeWidth={4} strokeLinecap="round" />
              <circle cx={cx} cy={y(start)} r={5} fill="var(--paper)" stroke="var(--ink)" strokeOpacity={0.6} strokeWidth={1.5} />
            </>
          ) : null}
          <circle cx={cx} cy={markY} r={7.5} fill="var(--bryce)" stroke="var(--ink)" strokeWidth={1.5} opacity={start === null ? p : 1} />
          {startText ? (
            <text x={right + 12} y={startLabelY} dy="0.35em" fontFamily={chartFont} fontSize={13} fill="var(--ink-muted)">
              {startText}
            </text>
          ) : null}
          <text x={right + 12} y={finishLabelY} dy="0.35em" fontFamily={chartFont} fontSize={14} fontWeight={620} fill="var(--ink)" opacity={p}>
            {finishWords(race)}
          </text>
          {tail ? (
            <text x={left} y={svgH - 6} fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
              Field size not in the source
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
};

/** The same ladder on its side: P1 on the left, his car running left to the flag. */
const FieldRow = ({ race, play }: { race: SheetRace; play: boolean }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const p = useRise(play);
  const { depth, field, tail } = fieldGeometry(race);
  const { start, finish } = race.row;
  const padL = 10;
  const padR = 10;
  const step = Math.min(40, (width - padL - padR) / Math.max(depth - 1, 1));
  const x = (position: number) => padL + (position - 1) * step;
  const railTop = 30;
  const railBottom = 62;
  const mid = (railTop + railBottom) / 2;
  const tickY = railBottom + 18;
  const startY = tickY + 22;
  const startText = startWords(race);
  const svgH = (startText ? startY + 8 : tickY + 8) + (tail ? 20 : 0);
  const from = start ?? finish;
  const markX = x(from) + (x(finish) - x(from)) * p;
  const lost = start !== null && finish > start;
  const lastX = x(field ?? depth - tail);
  const rowTicks = tickPositions(depth, field, step);
  const anchorFor = (at: number) => (at < 60 ? 'start' : at > width - 60 ? 'end' : 'middle');

  return (
    <div ref={ref} className="crs-field crs-field--row">
      {width > 0 ? (
        <svg width={width} height={svgH} role="img" aria-label={fieldAria(race)}>
          <line x1={x(1) - 5} x2={lastX + 5} y1={railTop} y2={railTop} stroke="var(--grey-line)" />
          <line x1={x(1) - 5} x2={lastX + 5} y1={railBottom} y2={railBottom} stroke="var(--grey-line)" />
          {Array.from({ length: depth }, (_, i) => i + 1).map((position) => {
            const beyond = field !== null && position > field;
            const fading = field === null && position > depth - tail;
            const passed = start !== null && !lost && position > finish && position < start && markX < x(position) - 0.5;
            return (
              <line
                key={position}
                x1={x(position)}
                x2={x(position)}
                y1={railTop}
                y2={railBottom}
                stroke={passed ? 'var(--ink)' : beyond ? 'var(--grey-ink3)' : 'var(--grey-line)'}
                strokeOpacity={passed ? 0.75 : fading ? 1 - (position - (depth - tail)) / (tail + 1) : 1}
                strokeDasharray={beyond || fading ? '2 3' : undefined}
              />
            );
          })}
          {start !== null ? (
            <>
              <line x1={x(start)} x2={markX} y1={mid} y2={mid} stroke={lost ? 'var(--grey-ink3)' : 'var(--bryce)'} strokeWidth={4} strokeLinecap="round" />
              <circle cx={x(start)} cy={mid} r={4.5} fill="var(--paper)" stroke="var(--ink)" strokeOpacity={0.6} strokeWidth={1.5} />
            </>
          ) : null}
          <circle cx={markX} cy={mid} r={7} fill="var(--bryce)" stroke="var(--ink)" strokeWidth={1.5} opacity={start === null ? p : 1} />
          <text x={x(finish)} y={railTop - 10} textAnchor={anchorFor(x(finish))} fontFamily={chartFont} fontSize={13} fontWeight={620} fill="var(--ink)" opacity={p}>
            {finishWords(race)}
          </text>
          {rowTicks.map((tick) => (
            <text key={tick} x={x(tick)} y={tickY} textAnchor={anchorFor(x(tick))} fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
              P{tick}
            </text>
          ))}
          {startText && start !== null ? (
            <text x={x(start)} y={startY} textAnchor={anchorFor(x(start))} fontFamily={chartFont} fontSize={12.5} fill="var(--ink-secondary)">
              {startText}
            </text>
          ) : null}
          {tail ? (
            <text x={padL} y={svgH - 4} fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
              Field size not in the source
            </text>
          ) : null}
        </svg>
      ) : null}
    </div>
  );
};

/* ---------- the chapter: every classified race of the series, in date order ---------- */

/** The chapter's time groups (years, else months, else meetings), each a run of race indexes. */
const timeGroups = (races: SheetRace[]): Array<{ first: number; last: number; label: string }> => {
  const dayOf = (race: SheetRace) => race.raceDay ?? race.meetingDay;
  const years = new Set(races.map((race) => dayOf(race).slice(0, 4)));
  const months = new Set(races.map((race) => dayOf(race).slice(0, 7)));
  const byYear = years.size > 1;
  const byMonth = !byYear && months.size > 1;
  const key = (race: SheetRace) => (byYear ? dayOf(race).slice(0, 4) : byMonth ? dayOf(race).slice(0, 7) : race.meetingDay);
  const label = (race: SheetRace) =>
    byYear ? dayOf(race).slice(0, 4) : byMonth ? formatDate(dayOf(race), { month: 'short' }) : formatDate(race.meetingDay, { month: 'short', day: 'numeric' });
  const groups: Array<{ first: number; last: number; label: string; key: string }> = [];
  races.forEach((race, index) => {
    const k = key(race);
    const open = groups[groups.length - 1];
    if (open && open.key === k) open.last = index;
    else groups.push({ first: index, last: index, label: label(race), key: k });
  });
  return groups;
};

const ChapterChart = ({
  races,
  current,
  height,
  career
}: {
  races: SheetRace[];
  current: SheetRace;
  height: number;
  /** Drawing the whole career (a one-race series): each dot in its chapter's tint. */
  career: boolean;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const narrow = width < 520;
  const m = { top: 12, right: 12, bottom: 28, left: narrow ? 40 : 46 };
  const plotW = Math.max(width - m.left - m.right, 40);
  const plotH = Math.max(height - m.top - m.bottom, 60);
  const n = races.length;
  const x = (index: number) => m.left + (n > 1 ? (index / (n - 1)) * plotW : plotW / 2);
  const y = (percentile: number) => m.top + (1 - Math.min(1, Math.max(0, percentile))) * plotH;
  const sorted = races.map((race) => race.row.percentile).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  /* Each group labelled at its middle; where labels would touch, the longer run keeps its label. */
  const groups = timeGroups(races);
  const labelW = (text: string) => text.length * 7 + 10;
  const placed: Array<{ cx: number; w: number; label: string }> = [];
  for (const group of [...groups].sort((a, b) => b.last - b.first - (a.last - a.first))) {
    const cx = Math.min(Math.max((x(group.first) + x(group.last)) / 2, m.left + labelW(group.label) / 2), m.left + plotW - labelW(group.label) / 2);
    const w = labelW(group.label);
    if (placed.every((other) => Math.abs(other.cx - cx) >= (other.w + w) / 2)) placed.push({ cx, w, label: group.label });
  }
  const boundaries = groups.slice(1).map((group) => (x(group.first - 1) + x(group.first)) / 2);
  const colW = n > 1 ? plotW / (n - 1) : plotW;
  const currentIndex = races.findIndex((race) => race.row.sessionId === current.row.sessionId);
  const path = races.map((race, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(race.row.percentile).toFixed(1)}`).join(' ');
  const tint = chapterTint(current.row.seriesName);
  /* The median's words sit on its line where no race's dot is in the way, nearest the right. */
  const medianText = `his median, ${Math.round(median * 100)}%`;
  const medianW = medianText.length * 6.4 + 8;
  const medianSpot = (() => {
    /* the chapter line's height at any x, for keeping the words off it as well as off the dots */
    const lineAt = (px: number): number | null => {
      if (career || n < 2) return null;
      const t = ((px - m.left) / plotW) * (n - 1);
      const i = Math.min(Math.max(Math.floor(t), 0), n - 2);
      const f = Math.min(Math.max(t - i, 0), 1);
      return y(races[i].row.percentile) + (y(races[i + 1].row.percentile) - y(races[i].row.percentile)) * f;
    };
    const clear = (lx: number, ly: number, strict: boolean) => {
      const dotsClear = races.every((race, index) => {
        const dx = x(index);
        const dy = y(race.row.percentile);
        return dx < lx - 10 || dx > lx + medianW + 10 || Math.abs(dy - (ly - 4)) > (index === currentIndex ? 16 : 12);
      });
      if (!dotsClear) return false;
      if (!strict) return true;
      for (let px = lx - 4; px <= lx + medianW + 4; px += 4) {
        const ly2 = lineAt(px);
        if (ly2 !== null && Math.abs(ly2 - (ly - 4)) < 10) return false;
      }
      return true;
    };
    for (const strict of [true, false]) {
      for (const below of [false, true]) {
        const ly = y(median) + (below ? 16 : -7);
        if (ly < m.top + 8 || ly > m.top + plotH - 4) continue;
        for (let lx = m.left + plotW - medianW; lx >= m.left + 4; lx -= 8) if (clear(lx, ly, strict)) return { lx, ly };
      }
    }
    return null;
  })();

  const tipFor = (race: SheetRace, index: number): ChartTip => ({
    x: x(index),
    y: y(race.row.percentile) - 10,
    under: y(race.row.percentile) + 10,
    title: career ? `${race.row.seriesShort} · ${race.title}` : race.title,
    detail: [
      shortDay(race),
      race.row.start !== null ? `P${race.row.start} → P${race.row.finish}` : `finished P${race.row.finish}`,
      `beat ${Math.round(race.row.percentile * 100)}% of the field`,
      wetFor(race.row.sessionId)?.words ?? null
    ]
      .filter(Boolean)
      .join(' · '),
    action: race.row.sessionId === current.row.sessionId ? undefined : 'open the race page'
  });

  return (
    <div ref={ref} className="crs-chart" style={{ height }}>
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${career ? 'His whole career' : `His ${current.row.seriesShort} races`}, in date order, by the share of the field he beat. This race: ${Math.round(
            current.row.percentile * 100
          )}%.`}
        >
          {[0, 0.5, 1].map((value) => (
            <g key={value}>
              <line x1={m.left} x2={m.left + plotW} y1={y(value)} y2={y(value)} stroke={value === 0 ? 'var(--axis-baseline)' : 'var(--grid-hairline)'} />
              <text x={m.left - 8} y={y(value)} dy="0.35em" textAnchor="end" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
                {Math.round(value * 100)}%
              </text>
            </g>
          ))}
          {!career && n > 2 ? (
            <g>
              <line x1={m.left} x2={m.left + plotW} y1={y(median)} y2={y(median)} stroke="var(--ink)" strokeOpacity={0.35} strokeDasharray="4 4" />
              {medianSpot ? (
                <text
                  x={medianSpot.lx}
                  y={medianSpot.ly}
                  fontFamily={chartFont}
                  fontSize={12}
                  fill="var(--ink-secondary)"
                  stroke="var(--paper)"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {medianText}
                </text>
              ) : null}
            </g>
          ) : null}
          {!career ? <path d={path} fill="none" stroke={tint} strokeOpacity={0.45} strokeWidth={1.25} /> : null}
          {races.map((race, index) => {
            if (index === currentIndex) return null;
            const dim = hover !== null && hover !== race.row.sessionId;
            return (
              <circle
                key={race.row.sessionId}
                cx={x(index)}
                cy={y(race.row.percentile)}
                r={career ? 3.2 : narrow ? 3.8 : 4.6}
                fill={career ? chapterTint(race.row.seriesName) : tint}
                fillOpacity={dim ? 0.3 : career ? 0.75 : 0.9}
              />
            );
          })}
          {/* rain streaks over a wet race's dot (round 2, intersections; switch rainmarks) */}
          {career
            ? null
            : races.map((race, index) => {
                const wet = wetFor(race.row.sessionId);
                if (!wet) return null;
                const isThis = index === currentIndex;
                return (
                  <RainStreaks
                    key={`wet-${race.row.sessionId}`}
                    cx={x(index)}
                    cy={y(race.row.percentile)}
                    r={isThis ? 8 : narrow ? 3.8 : 4.6}
                    read={wet}
                    dim={hover !== null && hover !== race.row.sessionId}
                  />
                );
              })}
          {currentIndex >= 0 ? (
            <g>
              <line x1={x(currentIndex)} x2={x(currentIndex)} y1={m.top + plotH} y2={y(current.row.percentile)} stroke="var(--ink)" strokeOpacity={0.25} />
              <circle cx={x(currentIndex)} cy={y(current.row.percentile)} r={8} fill="var(--bryce)" stroke="var(--ink)" strokeWidth={1.5} />
            </g>
          ) : null}
          {boundaries.map((bx) => (
            <line key={`b-${bx}`} x1={bx} x2={bx} y1={m.top + plotH} y2={m.top + plotH + 8} stroke="var(--axis-baseline)" />
          ))}
          {placed.map((tick) => (
            <text key={`${tick.label}-${tick.cx}`} x={tick.cx} y={height - 8} textAnchor="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)">
              {tick.label}
            </text>
          ))}
          {/* hit columns: hover or a first tap reads a race, a click or second tap opens it */}
          {races.map((race, index) => {
            const isThis = index === currentIndex;
            const w = Math.max(colW, 8);
            return (
              <rect
                key={`hit-${race.row.sessionId}`}
                x={x(index) - w / 2}
                y={m.top - 8}
                width={w}
                height={plotH + 16}
                fill="transparent"
                style={{ cursor: isThis ? 'default' : 'pointer' }}
                {...tap.target(race.row.sessionId, {
                  show: () => {
                    setHover(race.row.sessionId);
                    setTip(tipFor(race, index));
                  },
                  hide: () => {
                    setHover(null);
                    setTip(null);
                  },
                  open: isThis ? null : () => navigate(raceHref(race.row.sessionId))
                })}
              />
            );
          })}
        </svg>
      ) : null}
      {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
    </div>
  );
};

/* ---------- the way back ---------- */

/** Back to the Career page. When the reader came from it (the browser's own
 *  history says so), go back, so the chart he clicked is where he left it;
 *  otherwise open Career at this race's chapter and bring the chapter into view. */
const BackToCareer = ({ seriesId }: { seriesId: string }) => {
  const { navigate } = useRouter();
  const key = chapterKeys[seriesId];
  const to = key ? `/career#chapter-${key}` : '/career';
  const onClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    type NavEntry = { url: string | null; index: number };
    const nav = (window as unknown as { navigation?: { currentEntry?: NavEntry | null; entries?: () => NavEntry[] } }).navigation;
    const entries = nav?.entries?.();
    const here = nav?.currentEntry?.index;
    const previous = entries && here != null && here > 0 ? entries[here - 1] : null;
    if (previous?.url) {
      const url = new URL(previous.url);
      if (url.origin === window.location.origin && url.pathname.replace(/\/+$/, '') === '/career') {
        window.history.back();
        return;
      }
    }
    navigate(to);
    /* Career opens the chapter named in the hash; bring it into view once it is there. */
    if (!key) return;
    const t0 = performance.now();
    const find = () => {
      const panel = document.getElementById('career-chapters-title');
      if (panel) panel.scrollIntoView({ block: 'start' });
      else if (performance.now() - t0 < 3000) requestAnimationFrame(find);
    };
    requestAnimationFrame(find);
  };
  return (
    <a href={to} className="crs-back" onClick={onClick}>
      <ArrowLeft size={16} aria-hidden /> Back to Career
    </a>
  );
};

/* ---------- the page ---------- */

/** "Same weekend" when the neighbour ran at the same meeting; its date otherwise. */
const navWhen = (other: SheetRace, here: SheetRace): string =>
  other.meetingDay === here.meetingDay && other.row.trackName === here.row.trackName ? 'same weekend' : shortDay(other);

const RaceNav = ({ race, previous, next }: { race: SheetRace; previous: SheetRace | null; next: SheetRace | null }) =>
  previous || next ? (
    <nav className="crs-nav" aria-label="The races either side in this chapter">
      {previous ? (
        <Link to={raceHref(previous.row.sessionId)} className="crs-nav__link">
          <span className="crs-nav__when">
            <ArrowLeft size={14} aria-hidden /> Race before · {navWhen(previous, race)}
          </span>
          <span className="crs-nav__title">{previous.title.replace(" · ", "\u00a0· ")}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link to={raceHref(next.row.sessionId)} className="crs-nav__link crs-nav__link--next">
          <span className="crs-nav__when">
            Race after · {navWhen(next, race)} <ArrowRight size={14} aria-hidden />
          </span>
          <span className="crs-nav__title">{next.title.replace(" · ", "\u00a0· ")}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  ) : null;

/* ---------- the track: the 3D model where the venue has one ----------
 * Career round 2 (Jack, Nov 17: "if we could have the 3D modeled tracks for all
 * of the races that he's ever done"). The venue resolves through venuePeek's
 * aliases (the layout he raced that day, then the venue), so a model the 3D
 * venue lane adds lights this page with no code change. A venue in the Tracks
 * page's model index gets the interactive model (TrackModelSlot: lazy, never
 * in the first-load bundle); one with only a still gets the still; one with a
 * traced outline only, the 2D drawing; none, nothing. */

let modelSlugs: Set<string> | null | undefined;
const useModelSlugs = (): Set<string> | null | undefined => {
  const [value, setValue] = useState(modelSlugs);
  useEffect(() => {
    if (modelSlugs !== undefined) return undefined;
    let live = true;
    loadIndex().then((index) => {
      modelSlugs = index ? new Set(Object.keys(index)) : null;
      if (live) setValue(modelSlugs);
    });
    return () => {
      live = false;
    };
  }, []);
  return value;
};

interface SheetTrackInfo {
  slug: string | null;
  name: string;
  /** The venue's model (interactive), its still, its drawing, or nothing. */
  kind: 'model' | 'still' | 'line' | 'none' | 'wait';
  /** The picture is the layout he raced that day (a per-session alias). */
  raced: boolean;
  /** The race, for its race-hour weather on the model and the still. */
  sessionId: string;
}

const useSheetTrack = (sessionId: string, trackName: string): SheetTrackInfo => {
  const stillIndex = useStillIndex();
  const models = useModelSlugs();
  const outline = trackOutlineFor(trackName);
  const slug = venueSlugFor(stillIndex, { sessionId, trackName }) ?? outline?.slug ?? null;
  const raced = Boolean(stillIndex && (stillIndex as { bySession?: Record<string, string> }).bySession?.[sessionId]);
  const name = outline?.name ?? trackName;
  if (stillIndex === undefined || models === undefined) return { slug, name, kind: 'wait', raced, sessionId };
  const kind = slug && models?.has(slug) ? 'model' : slug && stillIndex?.venues[slug] ? 'still' : outline ? 'line' : 'none';
  return { slug, name, kind, raced, sessionId };
};

const layoutWords = (track: SheetTrackInfo, seriesShort: string, year: number | null): string =>
  track.raced
    ? `${track.name}, in the layout he raced.`
    : `${track.name} as it is today. The layout ${seriesShort} ran in ${year ?? 'that year'} isn’t in the source data.`;

/** The interactive model, full width under the race. */
const SheetModel = ({ track, words }: { track: SheetTrackInfo; words: string }) => {
  /* No sections are shaded on these races, so the hint leaves out "point at a section". */
  const coarse = useCoarsePointer();
  return (
  <section className="crs-model" aria-label={`${track.name} in 3D`}>
    <h2 className="crs-model__title">The track</h2>
    <TrackModelSlot
      slug={track.slug!}
      name={track.name}
      sections={[]}
      caption={words}
      weather={sceneWeatherFor(track.sessionId)}
      hint={coarse ? 'Drag sideways to turn it, pinch to zoom.' : 'Drag to turn it, hold ⌘ or Ctrl and scroll to zoom.'}
      fallback={<TrackStill slug={track.slug} interactive={false} alt={`${track.name}: the 3D track.`} sizes="100vw" />}
    />
  </section>
  );
};

/** The still (or drawing) in the race's own column. */
const SheetStill = ({ track, words, trackName }: { track: SheetTrackInfo; words: string; trackName: string }) => {
  const outline = trackOutlineFor(trackName);
  if (track.kind !== 'still' && track.kind !== 'line') return null;
  return (
    <figure className="crs-track">
      <TrackStill
        slug={track.slug}
        interactive={false}
        alt={`${track.name}: the 3D track.`}
        sizes="(max-width: 900px) 100vw, 420px"
        weather={sceneWeatherFor(track.sessionId)}
        fallback={outline ? <TrackArt outline={outline} showCornerLabels={false} maxHeight={260} /> : null}
      />
      <figcaption>{words}</figcaption>
    </figure>
  );
};

/* ---------- a race with no classified finish ---------- */

const unclassifiedLede = (status: string): string => {
  const s = status.toLowerCase();
  if (s === 'dns') return 'He didn’t take the start.';
  if (s === 'dnf') return 'He didn’t make it to the flag.';
  if (s === 'dsq') return 'He was disqualified from the result.';
  return 'He has no finishing position in this race.';
};

/** The other races of the same meeting (same series, venue and season, within
 *  four days), so a race with no result still leads somewhere. */
const SameWeekend = ({ sessionId }: { sessionId: string }) => {
  const all = useArchiveRaces();
  const here = all.find((race) => race.sessionId === sessionId);
  if (!here) return null;
  const t0 = Date.parse(here.day);
  const weekend = all.filter(
    (race) =>
      race.seriesName === here.seriesName &&
      race.trackName === here.trackName &&
      race.seasonYear === here.seasonYear &&
      Math.abs(Date.parse(race.day) - t0) <= 4 * 86400000
  );
  if (weekend.length < 2) return null;
  return (
    <figure className="crs-panel crs-weekend">
      <figcaption className="crs-panel__title">The weekend</figcaption>
      <ol className="crs-weekend__list">
        {weekend.map((race) => {
          const isHere = race.sessionId === sessionId;
          const result = race.finish !== null ? `P${race.finish}${race.field !== null ? ` of ${race.field}` : ''}` : statusShort(race.status);
          const body = (
            <>
              <span className="crs-weekend__title">{race.title.replace(`${here.title.split(' · ')[0]} · `, '')}</span>
              <span className={`crs-weekend__result${race.finish === null ? ' crs-weekend__result--none' : ''}`}>{result}</span>
            </>
          );
          return (
            <li key={race.sessionId}>
              {isHere ? (
                <span className="crs-weekend__row crs-weekend__row--here" aria-current="page">
                  {body}
                  <span aria-hidden />
                </span>
              ) : (
                <Link to={race.href} className="crs-weekend__row">
                  {body}
                  <ArrowRight size={14} aria-hidden />
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
};

const Unclassified = ({ sessionId }: { sessionId: string }) => {
  const race = unclassifiedRaceFor(sessionId);
  const track = useSheetTrack(sessionId, race?.trackName ?? '');
  if (!race) return null;
  const { title, round } = unclassifiedTitle(race);
  const short = seriesShort(race.seriesName ?? '');
  const words = layoutWords(track, short, race.seasonYear);
  return (
    <div className="page crs crs--unclassified" style={{ ['--tint' as string]: chapterTint(race.seriesName ?? '') }}>
      <header className="crs-head">
        <div>
          <span className="kicker crs-head__kicker">
            <span className="crs-head__swatch" aria-hidden />
            {[short, race.seasonYear, round !== null ? `Round ${round}` : null].filter(Boolean).join(' · ')}
          </span>
          <h1 className="screen-head__title crs-head__title">{title.replace(' · ', '\u00a0· ')}</h1>
          <p className="crs-head__sub">
            {race.raceDate
              ? formatDate(race.raceDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
              : race.eventStartDate
                ? `Weekend of ${formatDate(race.eventStartDate, { month: 'long', day: 'numeric', year: 'numeric' })}`
                : null}
            {race.trackName ? ` · ${race.trackName}` : null}
          </p>
        </div>
        <SourcePill
          title={title}
          entries={[
            {
              label: 'Career miles ledger',
              path: 'analysis/career-life-stats/output/tables/miles_raced.csv',
              note: 'Every canonical race row of his career, with its date, venue, series and result status. This race has no classified finish, so the result table has no row for it.'
            }
          ]}
          caveats={[]}
        />
      </header>
      <section className="crs-stage crs-stage--unclassified">
        <div className="crs-words">
          <div className="dd__figure">
            <span className="dd__num">{statusShort(race.status ?? '')}</span>
            <span className="dd__unit">{(statusWords(race.status ?? '') || 'No classified finish').toLowerCase()}</span>
          </div>
          <p className="dd__lede crs-words__lede">{unclassifiedLede(race.status ?? '')}</p>
          <dl className="crs-facts">
            {[
              ['Series', race.seriesName],
              ['Track', race.trackName],
              ['Country', race.country]
            ]
              .filter((entry): entry is [string, string] => Boolean(entry[1]))
              .map(([label, value]) => (
                <div key={label} className="crs-facts__row">
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
        </div>
        {track.kind === 'still' || track.kind === 'line' ? (
          <SheetStill track={track} words={words} trackName={race.trackName ?? ''} />
        ) : (
          <SameWeekend sessionId={sessionId} />
        )}
      </section>
      {track.kind === 'still' || track.kind === 'line' ? <SameWeekend sessionId={sessionId} /> : null}
      {track.kind === 'model' ? <SheetModel track={track} words={words} /> : null}
      <BackToCareer seriesId={race.seriesId ?? ''} />
    </div>
  );
};

const Missing = ({ sessionId }: { sessionId: string }) => {
  if (unclassifiedRaceFor(sessionId)) return <Unclassified sessionId={sessionId} />;
  const counted = (uiDataPackage.screens.careerLab.lifeStats?.coveredSessionIds ?? []).includes(sessionId);
  return (
    <div className="page crs">
      <header className="crs-head">
        <div>
          <span className="kicker">Career</span>
          <h1 className="screen-head__title crs-head__title">{counted ? 'No classified finish' : 'No race at this address'}</h1>
          <p className="crs-head__sub">
            {counted
              ? 'This race is in his record, but he has no finishing position in it (a retirement, a disqualification or a non-start), so it has no sheet of its own.'
              : 'No sourced career race matches this address.'}
          </p>
        </div>
      </header>
      <BackToCareer seriesId="" />
    </div>
  );
};

/** INDY NXT races have the full race page: go straight there, replacing this address. */
const IndyNxtRedirect = ({ sessionId }: { sessionId: string }) => {
  const to = `/races/${encodeURIComponent(sessionId)}`;
  useEffect(() => {
    window.history.replaceState(null, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, [to]);
  return (
    <div className="page crs">
      <Link to={to} className="crs-back">
        Opening the race page <ArrowRight size={16} aria-hidden />
      </Link>
    </div>
  );
};

export const CareerRaceScreen = ({ sessionId }: { sessionId: string }) =>
  sessionId.includes('indy_nxt') ? <IndyNxtRedirect sessionId={sessionId} /> : <RaceSheet sessionId={sessionId} />;

const RaceSheet = ({ sessionId }: { sessionId: string }) => {
  const races = useSheetRaces();
  const wide = useWide();
  const layout = switchValue('racesheet') === 'row' ? 'row' : 'ladder';
  const [stageRef, inView] = useInViewOnce<HTMLElement>(0.3);
  const race = useMemo(() => races.find((candidate) => candidate.row.sessionId === sessionId) ?? null, [races, sessionId]);
  const chapter = useMemo(() => (race ? races.filter((candidate) => candidate.seriesId === race.seriesId) : []), [races, race]);
  const entered = useMemo(enteredBySeries, []);
  const track = useSheetTrack(sessionId, race?.row.trackName ?? '');

  if (!race) return <Missing sessionId={sessionId} />;

  const index = chapter.findIndex((candidate) => candidate.row.sessionId === sessionId);
  const previous = index > 0 ? chapter[index - 1] : null;
  const next = index >= 0 && index < chapter.length - 1 ? chapter[index + 1] : null;
  const oneRace = chapter.length < 2;
  const enteredCount = entered.get(race.seriesId) ?? null;
  const outline = trackOutlineFor(race.row.trackName);
  const words = layoutWords(track, race.row.seriesShort, race.row.seasonYear);
  const { depth } = fieldGeometry(race);
  const column = layout === 'ladder' && wide;
  /* With neither a grid slot nor a field size there is no field to draw: the chapter takes the room. */
  const showField = race.field !== null || (race.row.start !== null && race.row.start !== race.row.finish);
  const stageH = column ? Math.round(Math.min(440, Math.max(320, 15 * depth + 44))) : 240;

  const facts: Array<[string, string]> = [
    ...(race.row.seriesName !== race.row.seriesShort ? ([['Series', race.row.seriesName]] as Array<[string, string]>) : []),
    ...(race.team ? ([['Team', race.team]] as Array<[string, string]>) : []),
    ['Track', `${race.row.trackName}${race.row.trackType === 'oval' ? ', oval' : ''}`],
    ...(race.row.wetDry ? ([['Conditions', `${race.row.wetDry} track`]] as Array<[string, string]>) : []),
    ...(race.points !== null ? ([['Points', String(race.points)]] as Array<[string, string]>) : [])
  ];

  const still = track.kind === 'still' || track.kind === 'line' ? <SheetStill track={track} words={words} trackName={race.row.trackName} /> : null;

  return (
    <div className={`page crs${column ? ' crs--column' : ' crs--row'}${showField ? '' : ' crs--nofield'}`} style={{ ['--tint' as string]: chapterTint(race.row.seriesName) }}>
      <header className="crs-head">
        <div>
          <span className="kicker crs-head__kicker">
            <span className="crs-head__swatch" aria-hidden />
            {[race.row.seriesShort, race.row.seasonYear, race.round !== null ? `Round ${race.round}` : null].filter(Boolean).join(' · ')}
          </span>
          <h1 className="screen-head__title crs-head__title">{race.title.replace(' · ', '\u00a0· ')}</h1>
          <p className="crs-head__sub">
            {dayText(race)} · {race.row.trackName}
          </p>
        </div>
        <SourcePill
          title={race.title}
          entries={[
            {
              label: 'Career result conversion table',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: 'Official or source-backed result rows across every series: grid, finish, finishing percentile, team, points and conditions. Older series don’t carry INDY NXT-grade depth, so this sheet states only what the row holds.'
            },
            {
              label: 'Field size',
              note: 'The canonical result row’s field size; where it has none, read back from the share of the field beaten, (field − finish) ÷ (field − 1), so field = (finish − share) ÷ (1 − share): the cars classified. It can’t be read back for a win. Where he started behind the last classified car, the slots past it are dashed.'
            },
            {
              label: 'Races in the chapter',
              note: 'The chart holds the races with a classified finish, the rows this table carries. The entered count is the life-stats weeks grid’s, the count the Career page’s chapter panels read; the difference is retirements, disqualifications and non-starts.'
            },
            {
              label: 'Race day',
              note: 'The race’s own day from its official start (raceDate), else the season campaign’s race date; otherwise the meeting’s first day, shown as “Weekend of”.'
            },
            ...(race.row.wetDry
              ? [
                  {
                    label: 'Per-session condition report',
                    path: 'analysis/context-event-narrative-layer/output/weather_condition_context.csv',
                    note: 'Official series weather lines plus labelled modelled observations, joined by session.'
                  }
                ]
              : []),
            ...(track.kind !== 'none' && track.kind !== 'wait'
              ? [
                  {
                    label: track.kind === 'model' ? 'Track model' : 'Track picture',
                    note: `${outline ? `${outline.source.attribution} ` : ''}${
                      track.raced
                        ? `The ${track.kind === 'model' ? 'model' : 'picture'} is ${track.name} in the layout he raced that day.`
                        : `The ${track.kind === 'model' ? 'model' : 'picture'} is today’s ${track.name}; the layout this series ran in ${race.row.seasonYear ?? 'that year'} is not in the source data.`
                    }`
                  }
                ]
              : [])
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      </header>

      <section className="crs-stage" ref={stageRef}>
        <div className="crs-words">
          <div className="dd__figure">
            <span className="dd__num">
              P{race.row.finish}
              {race.field !== null ? <span className="dd__of"> of {race.field}</span> : null}
            </span>
            <span className="dd__unit">{race.field !== null ? 'at the flag, of the cars classified' : 'at the flag'}</span>
          </div>
          <p className="dd__lede crs-words__lede">{ledeFor(race)}</p>
          {!showField ? (
            <p className="crs-words__note">
              {race.row.start === null ? 'The source gives neither his grid slot nor the size of the field.' : 'The source doesn’t give the size of the field.'}
            </p>
          ) : null}
          <dl className="crs-facts">
            {facts.map(([label, value]) => (
              <div key={label} className="crs-facts__row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {column && still ? still : null}
        </div>

        {showField ? (
          <figure className="crs-panel crs-panel--field">
            <figcaption className="crs-panel__title">{race.row.start === null ? 'The field at the flag' : 'The field, grid to flag'}</figcaption>
            {column ? <FieldColumn race={race} height={stageH} play={inView} /> : <FieldRow race={race} play={inView} />}
            {race.row.start === null ? <p className="crs-panel__foot">The source has no grid position for this race.</p> : null}
          </figure>
        ) : null}

        <figure className="crs-panel crs-panel--chapter">
          <figcaption className="crs-panel__title">
            {oneRace ? `His only ${race.row.seriesShort} race, among all ${races.length} classified` : `His ${race.row.seriesShort} races`}
            {!oneRace ? (
              <span className="crs-panel__count">
                {enteredCount !== null && enteredCount !== chapter.length
                  ? `${chapter.length} classified of ${enteredCount} entered`
                  : `${chapter.length} races`}
              </span>
            ) : null}
          </figcaption>
          <div className="crs-panel__axis">Share of the field he beat, race by race</div>
          <ChapterChart races={oneRace ? races : chapter} current={race} height={column ? stageH - 22 : 240} career={oneRace} />
          <p className="crs-panel__foot">
            <PointerOpen what="any other race" then="to open it" start />
          </p>
        </figure>

        {!column && still ? still : null}
      </section>

      {track.kind === 'model' ? <SheetModel track={track} words={words} /> : null}

      <RaceNav race={race} previous={previous} next={next} />
      <BackToCareer seriesId={race.seriesId} />
    </div>
  );
};
