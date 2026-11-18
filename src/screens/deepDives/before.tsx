import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent } from 'react';
import { SourcePill, type SourceEntry } from '../../app/components';
import {
  PointerWord,
  chartFont,
  useInViewOnce,
  useMeasuredWidth,
  useReducedMotion,
  type ChartTip
} from '../../app/charts';
import { uiDataPackage } from '../../data/uiDataPackage';
import type { UiCitedSource, UiOriginMilestone, UiSourceRef } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { seriesMetaById } from '../careerAtlas';
import { venueBetween } from '../venueOfDates';
import { meetingNameOf } from '../raceCardFacts';
import type { VenueTip } from '../../app/venueCard';
import { DeepDive, DeepTip } from './frame';
import './before.css';

/* ============================================================================
 * Before the record (November 17, 2026). The old year-by-year list becomes the
 * run-up: one time line from the first karting year to the first race of the
 * record (the SCCA Super Tour at Sebring, January 12, 2019), with the five
 * sourced karting facts placed on it as marks labelled in place, the lap times
 * as figures. At the flag the line hands off to the record itself: every one
 * of the 173 races as a small square in the month it ran, coloured by series,
 * read from the same weeks grid as "His life in weeks".
 *
 * Default: one time scale, 2016 to 2026, so the three karting years sit in
 * proportion to the seven and a half of the record; the karting marks crowd
 * into the first quarter, so their labels fan out along the top in date order
 * on stepped leaders. Where a desktop column is too narrow for that row of
 * labels, it draws the run-up instead. `?ddbefore=runup` always draws the
 * run-up: the scale breaks at the flag, the karting years get the stage and
 * the labels stand on their marks. A phone always reads the run-up top to
 * bottom, turning into the record at the flag.
 * ==========================================================================*/

const DAY = 86_400_000;
const utc = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthYear = (t: number): string => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const shortMonthYear = (t: number): string => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
};
const longDate = (t: number): string => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
const shortDate = (t: number): string => {
  const d = new Date(t);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const countWord = (n: number): string => words[n] ?? String(n);

/* ---------- the model ---------- */

type FactKind = 'time' | 'record' | 'title';

interface Fact {
  item: UiOriginMilestone;
  kind: FactKind;
  figure: string;
  line1: string;
  line2: string;
  /** Where it sits on the line: its date, or the start of its year when the source gives only the year. */
  t: number;
  /** The end of its year, for an undated fact drawn across the whole year. */
  t1: number | null;
}

/* Copy only: what each fact is, in a few words. Numbers and dates come from the package. */
const CAPTIONS: Record<string, [string, string?]> = {
  metric_badger_kart_club_2016_yamaha_junior_fast_time: ['Yamaha Junior fast time', 'Badger Kart Club'],
  metric_badger_kart_club_2017_classic_tag_junior_fast_time: ['TaG Junior fast time', 'Classic Track'],
  metric_badger_kart_club_2017_bus_stop_tag_junior_track_record: ['TaG Junior track record', 'Bus Stop layout'],
  metric_team_usa_2020_bkc_tag_jr_champion: ['BKC TaG Jr. championship'],
  metric_team_usa_2020_yamaha_kt100_runner_up: ['Yamaha KT100 championship']
};

interface MonthRace {
  seriesId: string;
  place: string;
  /** The source's event string, for the card's clean meeting name. */
  eventName: string;
  n: number;
}
interface Month {
  t: number;
  t1: number;
  races: MonthRace[];
  total: number;
}

/** "FRP F1600 2019 Round 1 - Road Atlanta" → "Road Atlanta"; "… - Race Weekend 2, Mid-Ohio (FRP …)" → "Mid-Ohio". */
const placeOf = (eventName: string): string => {
  const afterDash = eventName.includes(' - ') ? eventName.slice(eventName.lastIndexOf(' - ') + 3) : eventName;
  const bare = afterDash.replace(/\s*\(.*\)\s*$/, '').replace(/\s+\d{4}$/, '');
  return bare.includes(', ') ? bare.slice(bare.lastIndexOf(', ') + 2) : bare;
};

interface Model {
  facts: Fact[];
  months: Month[];
  maxStack: number;
  p0: number;
  p1: number;
  r0: number;
  r1: number;
  firstRace: number;
  firstPlace: string;
  firstSeries: string;
  firstSeriesShort: string;
  races: string;
  lastRace: number;
}

const useModel = (): Model | null =>
  useMemo(() => {
    const origin = uiDataPackage.screens.careerLab.smallSeriesStories.origin;
    const life = uiDataPackage.screens.careerLab.lifeStats;
    if (!origin || origin.items.length === 0 || !life) return null;

    const facts: Fact[] = [];
    for (const item of origin.items) {
      const kind: FactKind = item.kind === 'karting_track_record' ? 'record' : item.kind === 'karting_fast_time' ? 'time' : 'title';
      const year = item.year ?? (item.date ? Number(item.date.slice(0, 4)) : null);
      if (year === null) continue;
      const t = item.date ? utc(item.date) : Date.UTC(year, 0, 1);
      const t1 = item.date ? null : Date.UTC(year + 1, 0, 1) - DAY;
      const [line1, place] = CAPTIONS[item.id] ?? [item.label];
      const when = item.date ? shortMonthYear(t) : String(year);
      facts.push({
        item,
        kind,
        figure: item.figure ?? item.label,
        line1,
        line2: [place, when].filter(Boolean).join(' · '),
        t,
        t1
      });
    }
    if (facts.length === 0) return null;

    /* The record: every race in the month its week falls in (ISO rule: the week's Thursday). */
    const byMonth = new Map<number, Month>();
    let firstEvent: { eventName: string; seriesId: string } | null = null;
    for (const week of life.weeksGrid.weeks) {
      const thursday = utc(week.monday) + 3 * DAY;
      const d = new Date(thursday);
      const key = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      for (const race of week.races) {
        if (race.raceCount <= 0) continue;
        if (!firstEvent) firstEvent = race;
        const month = byMonth.get(key) ?? { t: key, t1: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1), races: [], total: 0 };
        month.races.push({ seriesId: race.seriesId, place: placeOf(race.eventName), eventName: race.eventName, n: race.raceCount });
        month.total += race.raceCount;
        byMonth.set(key, month);
      }
    }
    const share = life.lifeShare;
    const firstRace = utc(share.firstRaceDate);
    const lastRace = utc(share.lastRaceDate);
    const keys = [...byMonth.keys()].sort((a, b) => a - b);
    if (keys.length === 0 || !firstEvent) return null;
    /* Every month from the first to the last, empty ones included, so the gaps read as gaps. */
    const months: Month[] = [];
    const start = new Date(keys[0]);
    const end = new Date(keys[keys.length - 1]);
    for (let y = start.getUTCFullYear(), m = start.getUTCMonth(); Date.UTC(y, m, 1) <= end.getTime(); m === 11 ? ((m = 0), (y += 1)) : (m += 1)) {
      const key = Date.UTC(y, m, 1);
      months.push(byMonth.get(key) ?? { t: key, t1: Date.UTC(y, m + 1, 1), races: [], total: 0 });
    }
    const racesFigure = life.figures.find((figure) => figure.id === 'races');
    const summed = months.reduce((sum, month) => sum + month.total, 0);
    const minYear = Math.min(...facts.map((fact) => new Date(fact.t).getUTCFullYear()));
    const recordYear = new Date(firstRace).getUTCFullYear();
    const meta = seriesMetaById(firstEvent.seriesId);
    return {
      facts,
      months,
      maxStack: Math.max(...months.map((month) => month.total)),
      p0: Date.UTC(minYear, 0, 1),
      p1: Date.UTC(recordYear, 0, 1),
      r0: months[0].t,
      r1: months[months.length - 1].t1,
      firstRace,
      firstPlace: placeOf(firstEvent.eventName),
      firstSeries: meta.name,
      firstSeriesShort: meta.short,
      races: racesFigure?.display ?? String(summed),
      lastRace
    };
  }, []);

/* ---------- shared drawing ---------- */

/** When each part appears as the line draws (0..1): the karting years take the
 *  first 62% of the clock, the flag lands at 64%, the record fills the rest. */
const clockOf = (model: Model, t: number): number =>
  t < model.p1 ? (0.62 * (t - model.p0)) / (model.p1 - model.p0) : 0.66 + (0.34 * (t - model.r0)) / (model.r1 - model.r0);
const FLAG_AT = 0.64;
const fade = (p: number, at: number): number => clamp((p - at) / 0.05, 0, 1);

const usePlayClock = (play: boolean, reduced: boolean): number => {
  const [p, setP] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) {
      setP(1);
      return undefined;
    }
    if (!play) return undefined;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / 2400);
      setP(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [play, reduced]);
  return p;
};

const factTip = (fact: Fact, x: number, y: number, under?: number): ChartTip => ({
  x,
  y,
  over: y,
  under,
  title: fact.item.label,
  detail: `${fact.item.detail}${fact.item.sourceName ? ` Source: ${fact.item.sourceName}.` : ''}`
});

const monthTip = (month: Month, x: number, y: number, under?: number): VenueTip => {
  /* One row per meeting, in the order they ran: "SCCA · Road Atlanta  2". */
  const rows = new Map<string, { label: string; tint: string; n: number }>();
  for (const race of month.races) {
    if (race.n <= 0) continue;
    const meta = seriesMetaById(race.seriesId);
    const name = meetingNameOf(race.eventName);
    const key = `${race.seriesId}|${name}`;
    const row = rows.get(key) ?? { label: `${meta.short} · ${name}`, tint: meta.tint, n: 0 };
    row.n += race.n;
    rows.set(key, row);
  }
  return {
    x,
    y,
    over: y,
    under,
    /* A still only for a month at one meeting: a list of several has no one track. */
    venue: rows.size === 1 ? venueBetween(month.t, month.t1) : null,
    title: monthYear(month.t),
    detail: month.total === 0 ? 'no races' : month.total === 1 ? '1 race' : `${month.total} races`,
    lines: [...rows.values()].map((row) => ({ label: row.label, tint: row.tint, value: String(row.n) }))
  };
};

/** A small chequered flag on a short pole, standing on the line at (x, y). */
const Flag = ({ x, y, size, pole }: { x: number; y: number; size: number; pole?: number }) => {
  const c = size / 3;
  const h = Math.max(size * 1.9, pole ?? 0);
  const cells = [];
  for (let r = 0; r < 2; r += 1) {
    for (let k = 0; k < 3; k += 1) {
      cells.push(
        <rect key={`${r}-${k}`} x={x + 1 + k * c} y={y - h + r * c} width={c} height={c} fill={(r + k) % 2 === 0 ? 'var(--ink)' : 'var(--paper)'} />
      );
    }
  }
  return (
    <g className="before__flag">
      <line x1={x} x2={x} y1={y} y2={y - h} stroke="var(--ink)" strokeWidth={2} />
      {cells}
      <rect x={x + 1} y={y - h} width={size} height={c * 2} fill="none" stroke="var(--ink)" strokeWidth={1} />
    </g>
  );
};

/** The mark a fact makes on the line. */
const FactMark = ({ fact, cx, cy, vertical, to }: { fact: Fact; cx: number; cy: number; vertical: boolean; to: number }) => {
  if (fact.kind === 'title') {
    /* No date in the source: drawn across its whole year. */
    return vertical ? (
      <rect x={cx - 3} y={cy} width={6} height={Math.max(4, to - cy)} rx={3} fill="var(--ink)" opacity={0.55} />
    ) : (
      <rect x={cx} y={cy - 3} width={Math.max(4, to - cx)} height={6} rx={3} fill="var(--ink)" opacity={0.55} />
    );
  }
  if (fact.kind === 'record') {
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="none" stroke="var(--ink)" strokeWidth={1} />
        <circle cx={cx} cy={cy} r={5.5} fill="var(--ink)" />
      </g>
    );
  }
  return <circle cx={cx} cy={cy} r={5} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.6} />;
};

/** A label block: the figure, then one or two short lines. `anchor` is its left
 *  (or right) edge; `top` the top of the block. */
const LabelText = ({
  x,
  top,
  anchor,
  figure,
  line1,
  line2,
  F,
  cap,
  strong
}: {
  x: number;
  top: number;
  anchor: 'start' | 'end';
  figure: string;
  line1: string;
  line2?: string;
  F: number;
  cap: number;
  strong?: boolean;
}) => {
  const b0 = top + F * 0.8;
  const b1 = b0 + cap + 9;
  const b2 = b1 + cap + 5;
  return (
    <g fontFamily={chartFont}>
      <text x={x} y={b0} textAnchor={anchor} fontSize={F} fontWeight={strong ? 650 : 620} letterSpacing="-0.02em" fill="var(--ink)" className="before__figure">
        {figure}
      </text>
      <text x={x} y={b1} textAnchor={anchor} fontSize={cap} fontWeight={600} fill="var(--ink)">
        {line1}
      </text>
      {line2 ? (
        <text x={x} y={b2} textAnchor={anchor} fontSize={cap} fill="var(--ink-muted)">
          {line2}
        </text>
      ) : null}
    </g>
  );
};

/* Rough text widths, generous so labels never touch. */
const textW = (s: string, size: number, k = 0.56): number => s.length * size * k;

/* The record's squares: one per race, stacked in its month, coloured by series. */
const recordSquares = (months: Month[], at: (month: Month) => { x: number; w: number }, baseY: number, s: number) => {
  const out: Array<{ key: string; x: number; y: number; s: number; fill: string; t: number }> = [];
  for (const month of months) {
    const { x, w } = at(month);
    let k = 0;
    for (const race of month.races) {
      const fill = seriesMetaById(race.seriesId).tint;
      for (let i = 0; i < race.n; i += 1) {
        out.push({ key: `${month.t}-${k}`, x: x + (w - s) / 2, y: baseY - (k + 1) * (s + 1), s, fill, t: month.t });
        k += 1;
      }
    }
  }
  return out;
};

type Hover = { tip: VenueTip; key: string } | null;

/** The month under the pointer, or the nearest one with a race when it is within two months (a thin column is easy to miss). */
const nearestMonth = (months: Month[], i: number): Month | null => {
  if (i < 0) return null;
  if (months[i].total > 0) return months[i];
  for (let d = 1; d <= 2; d += 1) {
    if (months[i - d]?.total) return months[i - d];
    if (months[i + d]?.total) return months[i + d];
  }
  return months[i];
};

/* ---------- desktop: the line runs left to right ---------- */

interface Placed {
  key: string;
  fact: Fact | null;
  stemX: number;
  markX: number;
  w: number;
  side: 'right' | 'left';
  row: number;
  x0: number;
  x1: number;
  /** The one-scale view fans the labels out along the top: where the label stands, and the height its leader turns at. */
  fanX?: number;
  elbowY?: number;
}

const Wide = ({ model, width, version, p }: { model: Model; width: number; version: 'runup' | 'scale'; p: number }) => {
  const [hover, setHover] = useState<Hover>(null);
  const W = width;
  const F = Math.round(clamp(W * 0.024, 26, 46));
  const cap = W > 1800 ? 14 : 13;
  const rowBlock = Math.round(F * 0.8 + cap * 2 + 18);
  const rowH = rowBlock + 16;
  const baseGap = 26;
  const padR = 6;

  const geo = useMemo(() => {
    const { p0, p1, r0, r1 } = model;
    /* One scale needs room to fan its labels out in a row; narrower than
     * that, it draws the run-up instead. */
    const labelW = (figure: string, l1: string, l2: string, k: number) =>
      Math.max(textW(figure, F, k), textW(l1, cap, 0.58), textW(l2, cap, 0.55));
    const widestLabel = Math.max(
      ...model.facts.map((fact) => labelW(fact.figure, fact.line1, fact.line2, fact.kind === 'title' ? 0.56 : 0.6)),
      labelW(model.firstPlace, longDate(model.firstRace), `${model.firstSeriesShort} · race 1 of ${model.races}`, 0.6)
    );
    const mode: 'runup' | 'scale' = version === 'scale' && (W - padR) / (model.facts.length + 1) >= widestLabel + 24 ? 'scale' : 'runup';
    let x: (t: number) => number;
    let xB: number;
    let xR0: number;
    if (mode === 'scale') {
      const s = (W - padR) / (r1 - p0);
      x = (t) => (t - p0) * s;
      xB = x(p1);
      xR0 = x(r0);
    } else {
      xB = Math.round(W * 0.62);
      const gap = 30;
      const ps = xB / (p1 - p0);
      const rs = (W - padR - xB - gap) / (r1 - r0);
      x = (t) => (t < p1 ? (t - p0) * ps : xB + gap + (t - r0) * rs);
      xR0 = xB + gap;
    }
    const colW = x(model.months[0].t1) - x(model.months[0].t);
    const s = clamp(colW - 1.2, 2, 7);
    const combH = model.maxStack * (s + 1);

    /* Labels, placed right to left in the lowest row that is free: no two
     * labels touch, and no stem runs through another label. */
    const items: Array<Omit<Placed, 'row' | 'x0' | 'x1' | 'side'> & { fig: string; l1: string; l2: string }> = model.facts.map((fact, i) => ({
      key: fact.item.id ?? String(i),
      fact,
      stemX: x(fact.t),
      markX: x(fact.t),
      w: Math.max(textW(fact.figure, F, fact.kind === 'title' ? 0.56 : 0.6), textW(fact.line1, cap, 0.58), textW(fact.line2, cap, 0.55)),
      fig: fact.figure,
      l1: fact.line1,
      l2: fact.line2
    }));
    const flagX = x(model.firstRace);
    const flagLine1 = longDate(model.firstRace);
    const flagLine2 = `${model.firstSeriesShort} · race 1 of ${model.races}`;
    items.push({
      key: 'flag',
      fact: null,
      stemX: flagX,
      markX: flagX,
      w: Math.max(textW(model.firstPlace, F, 0.6), textW(flagLine1, cap, 0.58), textW(flagLine2, cap, 0.55)),
      fig: model.firstPlace,
      l1: flagLine1,
      l2: flagLine2
    });
    const combRow = Math.max(0, Math.ceil((combH + 14 - baseGap) / rowH));
    const placed: Placed[] = [];
    for (const item of [...items].sort((a, b) => b.stemX - a.stemX || (a.fact?.kind === 'title' && a.fact.figure === 'Champion' ? -1 : 1))) {
      /* Lowest free row first; on each row try the label right of its stem,
       * then left of it. Placed right to left, so a right-hand label can only
       * cover stems already placed; a left-hand one may cover no other stem. */
      let side: 'right' | 'left' = 'right';
      let x0 = item.stemX;
      let x1 = item.stemX + 12 + item.w;
      let row = 0;
      const fits = (r: number, a: number, b: number) =>
        placed.every((q) => {
          if (q.row === r && !(q.x1 + 14 < a || b + 14 < q.x0)) return false;
          const shared = Math.abs(q.stemX - item.stemX) < 1;
          if (!shared && q.row > r && q.stemX >= a - 6 && q.stemX <= b + 6) return false;
          if (!shared && q.row < r && item.stemX >= q.x0 - 6 && item.stemX <= q.x1 + 6) return false;
          return true;
        });
      search: for (let r = 0; r < 24; r += 1) {
        for (const candidate of ['right', 'left'] as const) {
          const a = candidate === 'right' ? item.stemX : item.stemX - 12 - item.w;
          const b = candidate === 'right' ? item.stemX + 12 + item.w : item.stemX;
          if (a < 0 || b > W - 2) continue;
          if (candidate === 'left' && items.some((other) => Math.abs(other.stemX - item.stemX) >= 1 && other.stemX >= a - 6 && other.stemX <= b + 6)) continue;
          const overRecord = b > xR0 - 4 || item.key === 'flag';
          const minRow = overRecord ? Math.max(combRow, item.key === 'flag' ? 1 : 0) : 0;
          if (r < minRow) continue;
          if (fits(r, a, b)) {
            side = candidate;
            x0 = a;
            x1 = b;
            row = r;
            break search;
          }
        }
      }
      placed.push({ ...item, side, row, x0, x1 });
    }
    /* On one scale the karting marks crowd into the first quarter, so the
     * labels fan out along the top in date order, each leader turning at its
     * own height (earlier ones higher, so no two cross). */
    const slotW = (W - padR) / items.length;
    if (mode === 'scale') {
      const labelBottom = 6 + rowBlock;
      const fanned: Placed[] = items.map((item, i) => {
        const fanX = i * slotW;
        return { ...item, side: 'right', row: 0, x0: fanX, x1: fanX + 12 + item.w, fanX, elbowY: labelBottom + 18 + i * 12 };
      });
      const axisY = labelBottom + 18 + (items.length - 1) * 12 + 22 + combH + 12;
      return { x, xB, xR0, s, combH, placed: fanned, items, axisY, flagX, height: axisY + 54, fanTop: 6, mode };
    }
    const rows = Math.max(...placed.map((q) => q.row)) + 1;
    const axisY = 6 + rowBlock + (rows - 1) * rowH + baseGap;
    return { x, xB, xR0, s, combH, placed, items, axisY, flagX, height: axisY + 54, fanTop: null as number | null, mode };
  }, [model, W, version, F, cap, rowBlock, rowH]);

  const { x, xB, xR0, s, placed, items, axisY, flagX, height } = geo;
  const topOf = (row: number) => (geo.fanTop !== null ? geo.fanTop : axisY - baseGap - row * rowH - rowBlock);
  const squares = recordSquares(model.months, (month) => ({ x: x(month.t), w: x(month.t1) - x(month.t) }), axisY - 1, s);

  /* The line draws itself: the karting years, then the record. */
  const proP = clamp(p / 0.62, 0, 1);
  const recP = clamp((p - 0.66) / 0.34, 0, 1);
  const lineTo = x(model.p0) + (xB - x(model.p0)) * proP;
  const recTo = xR0 + (W - padR - xR0) * recP;

  const years: Array<{ x: number; label: string; record: boolean }> = [];
  for (let y = new Date(model.p0).getUTCFullYear(); y < new Date(model.p1).getUTCFullYear(); y += 1) {
    years.push({ x: (x(Date.UTC(y, 0, 1)) + x(Date.UTC(y + 1, 0, 1) - 1)) / 2, label: String(y), record: false });
  }
  const recYears: number[] = [];
  for (let y = new Date(model.r0).getUTCFullYear(); y <= new Date(model.r1 - 1).getUTCFullYear(); y += 1) recYears.push(y);
  const yearW = x(Date.UTC(recYears[0] + 1, 0, 1)) - x(Date.UTC(recYears[0], 0, 1));
  const step = Math.max(1, Math.ceil(46 / Math.max(1, yearW)));
  recYears.forEach((y, i) => {
    if (i % step !== 0 && i !== recYears.length - 1) return;
    const a = Math.max(model.r0, Date.UTC(y, 0, 1));
    const b = Math.min(model.r1, Date.UTC(y + 1, 0, 1));
    const cx = (x(a) + x(b)) / 2;
    if (geo.mode === 'scale' && i === 0 && cx - (years[years.length - 1]?.x ?? -99) < 40) return;
    years.push({ x: cx, label: String(y), record: true });
  });

  const onRecordMove = (event: PointerEvent<SVGRectElement> | MouseEvent<SVGRectElement>) => {
    const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = event.clientX - box.left;
    const month = nearestMonth(model.months, model.months.findIndex((m) => px >= x(m.t) && px < x(m.t1)));
    if (!month) return;
    const mx = (x(month.t) + x(month.t1)) / 2;
    const top = axisY - Math.max(month.total, 1) * (s + 1) - 6;
    setHover({ key: `month:${month.t}`, tip: monthTip(month, mx, top, axisY + 8) });
  };

  const activeMonth = hover?.key.startsWith('month:') ? Number(hover.key.slice(6)) : null;

  return (
    <div className="before__stage" style={{ height }}>
      <svg
        width={W}
        height={height}
        className="before__svg"
        role="img"
        aria-label={`Karting from ${new Date(model.p0).getUTCFullYear()} to ${new Date(model.p1).getUTCFullYear() - 1}, then the record from ${model.firstPlace}, ${longDate(model.firstRace)}: ${model.races} races.`}
        onClick={() => setHover(null)}
      >
        {/* the line */}
        <line x1={x(model.p0)} x2={lineTo} y1={axisY} y2={axisY} stroke="var(--ink-muted)" strokeWidth={1.5} />
        {recP > 0 ? <line x1={xR0} x2={recTo} y1={axisY} y2={axisY} stroke="var(--grey-line)" strokeWidth={1} /> : null}
        {geo.mode === 'runup' && p >= FLAG_AT ? (
          <g stroke="var(--ink-muted)" strokeWidth={1.2} opacity={fade(p, FLAG_AT)}>
            <line x1={xB + 9} x2={xB + 15} y1={axisY + 6} y2={axisY - 6} />
            <line x1={xB + 15} x2={xB + 21} y1={axisY + 6} y2={axisY - 6} />
          </g>
        ) : null}

        {/* the record, one square per race */}
        <g>
          {squares.map((sq) => {
            const a = fade(p, clockOf(model, sq.t));
            if (a <= 0) return null;
            const dim = activeMonth !== null && activeMonth !== sq.t;
            return <rect key={sq.key} x={sq.x} y={sq.y} width={sq.s} height={sq.s} fill={sq.fill} opacity={a * (dim ? 0.35 : 1)} />;
          })}
        </g>
        <rect
          x={xR0}
          y={axisY - geo.combH - 8}
          width={Math.max(0, W - padR - xR0)}
          height={geo.combH + 16}
          fill="transparent"
          className="before__hit"
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse') onRecordMove(e);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setHover(null);
          }}
          onClick={(e) => {
            e.stopPropagation();
            onRecordMove(e);
          }}
        />

        {/* year labels and the two names */}
        {years.map((year) => (
          <text key={year.label} x={year.x} y={axisY + 21} textAnchor="middle" fontFamily={chartFont} fontSize={cap} fill="var(--ink-muted)" className="before__num">
            {year.label}
          </text>
        ))}
        <text x={x(model.p0)} y={axisY + 44} fontFamily={chartFont} fontSize={cap} fontWeight={600} fill="var(--ink-secondary)">
          Karting
        </text>
        <text x={W - padR} y={axisY + 44} textAnchor="end" fontFamily={chartFont} fontSize={cap} fontWeight={600} fill="var(--ink-secondary)" opacity={fade(p, 0.9)}>
          The record: {model.races} races to {shortMonthYear(model.lastRace)}
        </text>

        {/* the karting facts and the flag, labelled in place */}
        {placed.map((q) => {
          const top = topOf(q.row);
          const at = q.fact ? clockOf(model, q.fact.t) : FLAG_AT;
          const a = fade(p, at);
          if (a <= 0) return null;
          const item = items.find((it) => it.key === q.key)!;
          const lead = q.fanX ?? q.stemX;
          const textX = q.side === 'right' ? lead + 12 : lead - 12;
          const isFlag = q.key === 'flag';
          const lit = hover?.key === q.key;
          const stemBottom = isFlag ? axisY - geo.combH - 12 - 9 : q.fact?.kind === 'title' ? axisY - 4 : axisY - 9;
          return (
            <g
              key={q.key}
              opacity={a}
              className={q.fact ? 'before__fact' : 'before__passive'}
              transform={`translate(0 ${(1 - a) * 6})`}
              onPointerEnter={(e) => {
                if (q.fact && e.pointerType === 'mouse') setHover({ key: q.key, tip: factTip(q.fact, q.side === 'right' ? (q.fanX ?? q.stemX) + 12 + q.w / 2 : q.stemX - 12 - q.w / 2, top - 4, top + rowBlock + 8) });
              }}
              onPointerLeave={(e) => {
                if (e.pointerType === 'mouse') setHover(null);
              }}
              onClick={(e) => {
                if (!q.fact) return;
                e.stopPropagation();
                setHover(lit ? null : { key: q.key, tip: factTip(q.fact, q.side === 'right' ? (q.fanX ?? q.stemX) + 12 + q.w / 2 : q.stemX - 12 - q.w / 2, top - 4, top + rowBlock + 8) });
              }}
            >
              {q.fact ? <rect x={q.x0 - 4} y={top - 4} width={q.x1 - q.x0 + 8} height={rowBlock + 8} fill="transparent" /> : null}
              {q.fact && q.fanX === undefined ? <rect x={q.stemX - 10} y={top} width={20} height={axisY - top + 10} fill="transparent" /> : null}
              {q.fanX !== undefined && q.elbowY !== undefined ? (
                <path d={`M ${q.stemX} ${stemBottom} V ${q.elbowY} H ${q.fanX} V ${top + 2}`} fill="none" stroke={lit ? 'var(--ink)' : 'var(--grey-line)'} strokeWidth={1} />
              ) : (
                <line x1={q.stemX} x2={q.stemX} y1={top + 2} y2={stemBottom} stroke={lit ? 'var(--ink)' : 'var(--grey-line)'} strokeWidth={1} />
              )}
              <LabelText x={textX} top={top} anchor={q.side === 'right' ? 'start' : 'end'} figure={item.fig} line1={item.l1} line2={item.l2} F={F} cap={cap} strong={isFlag} />
              {q.fact ? <FactMark fact={q.fact} cx={q.markX} cy={axisY} vertical={false} to={q.fact.t1 !== null ? x(q.fact.t1) : q.markX} /> : null}
            </g>
          );
        })}
        {p >= FLAG_AT ? (
          <g opacity={fade(p, FLAG_AT)}>
            <Flag x={flagX} y={axisY} size={13} pole={geo.combH + 12 + (13 * 2) / 3} />
          </g>
        ) : null}
      </svg>
      {hover ? <DeepTip tip={hover.tip} width={W} /> : null}
    </div>
  );
};

/* ---------- phone: the run-up reads down, then turns into the record ---------- */

const Tall = ({ model, width, p }: { model: Model; width: number; p: number }) => {
  const [hover, setHover] = useState<Hover>(null);
  const W = width;
  const F = 26;
  const cap = 13;
  const axisX = 44;
  const textX = axisX + 22;
  const block = Math.round(F * 0.8 + cap * 2 + 18);
  const top = 14;
  const span = model.p1 - model.p0;
  const Hp = Math.max(440, (span / (30.44 * DAY)) * 14);
  const y = (t: number) => top + ((t - model.p0) / span) * Hp;

  const geo = useMemo(() => {
    const placed: Array<{ fact: Fact; markY: number; top: number }> = [];
    let floor = -Infinity;
    for (const fact of [...model.facts].sort((a, b) => a.t - b.t || (a.figure === 'Champion' ? -1 : 1))) {
      const markY = fact.t1 !== null ? y(fact.t) + 4 : y(fact.t);
      const want = markY - F * 0.55;
      const t0 = Math.max(want, floor + 12);
      placed.push({ fact, markY, top: t0 });
      floor = t0 + block;
    }
    const flagY = Math.max(top + Hp + 30, floor + 12 + F * 0.55);
    const flagTop = Math.max(flagY - F * 0.55 - 6, floor + 12);
    const colW = (W - 4 - axisX) / model.months.length;
    const s = clamp(colW - 1.2, 2, 7);
    const combH = model.maxStack * (s + 1);
    const baseY = flagTop + block + 26 + combH;
    return { placed, flagY, flagTop, s, combH, baseY, height: baseY + 52 };
  }, [model, W, Hp]);

  const { placed, flagY, flagTop, s, combH, baseY, height } = geo;
  const xr = (t: number) => axisX + ((t - model.r0) / (model.r1 - model.r0)) * (W - 4 - axisX);
  const squares = recordSquares(model.months, (month) => ({ x: xr(month.t), w: xr(month.t1) - xr(month.t) }), baseY - 1, s);

  const proP = clamp(p / 0.62, 0, 1);
  const recP = clamp((p - 0.66) / 0.34, 0, 1);
  const downTo = top + (flagY - top) * Math.min(1, proP * 1.0);
  const turnP = clamp((p - FLAG_AT) / 0.04, 0, 1);

  const years: Array<{ y: number; label: string }> = [];
  for (let yr = new Date(model.p0).getUTCFullYear(); yr < new Date(model.p1).getUTCFullYear(); yr += 1) {
    years.push({ y: y(Date.UTC(yr, 0, 1)), label: String(yr) });
  }
  const recYears: number[] = [];
  for (let yr = new Date(model.r0).getUTCFullYear(); yr <= new Date(model.r1 - 1).getUTCFullYear(); yr += 1) recYears.push(yr);
  const yearW = xr(Date.UTC(recYears[0] + 1, 0, 1)) - xr(Date.UTC(recYears[0], 0, 1));
  const step = Math.max(1, Math.ceil(44 / Math.max(1, yearW)));

  const pickMonth = (event: MouseEvent<SVGRectElement>) => {
    const box = (event.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = event.clientX - box.left;
    const month = nearestMonth(model.months, model.months.findIndex((m) => px >= xr(m.t) && px < xr(m.t1)));
    if (!month) return;
    const mx = (xr(month.t) + xr(month.t1)) / 2;
    setHover({ key: `month:${month.t}`, tip: monthTip(month, mx, baseY - combH - 8, baseY + 8) });
  };
  const activeMonth = hover?.key.startsWith('month:') ? Number(hover.key.slice(6)) : null;

  return (
    <div className="before__stage" style={{ height }}>
      <svg width={W} height={height} className="before__svg" role="img" aria-label={`Karting, then the record from ${model.firstPlace}, ${longDate(model.firstRace)}: ${model.races} races.`} onClick={() => setHover(null)}>
        {/* the line comes down the karting years, then turns along the record */}
        <line x1={axisX} x2={axisX} y1={top} y2={downTo} stroke="var(--ink-muted)" strokeWidth={1.5} />
        {turnP > 0 ? <line x1={axisX} x2={axisX} y1={flagY} y2={flagY + (baseY - flagY) * turnP} stroke="var(--grey-line)" strokeWidth={1} /> : null}
        {recP > 0 ? <line x1={axisX} x2={axisX + (W - 4 - axisX) * recP} y1={baseY} y2={baseY} stroke="var(--grey-line)" strokeWidth={1} /> : null}

        {years.map((yr) => (
          <g key={yr.label}>
            <line x1={axisX - 5} x2={axisX} y1={yr.y} y2={yr.y} stroke="var(--ink-muted)" strokeWidth={1} />
            <text x={axisX - 9} y={yr.y + 4.5} textAnchor="end" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)" className="before__num">
              {yr.label}
            </text>
          </g>
        ))}

        {placed.map(({ fact, markY, top: t0 }) => {
          const a = fade(p, clockOf(model, fact.t));
          if (a <= 0) return null;
          const key = fact.item.id;
          const lit = hover?.key === key;
          const midY = t0 + F * 0.45;
          return (
            <g
              key={key}
              opacity={a}
              className="before__fact"
              onClick={(e) => {
                e.stopPropagation();
                setHover(lit ? null : { key, tip: factTip(fact, Math.min(W - 90, textX + 90), t0 - 4, t0 + block + 6) });
              }}
            >
              <rect x={axisX + 8} y={t0 - 4} width={W - axisX - 8} height={block + 8} fill="transparent" />
              <path d={`M ${axisX + (fact.kind === 'title' ? 5 : 8)} ${markY} H ${axisX + 14} V ${midY} H ${textX - 6}`} fill="none" stroke={lit ? 'var(--ink)' : 'var(--grey-line)'} strokeWidth={1} />
              <LabelText x={textX} top={t0} anchor="start" figure={fact.figure} line1={fact.line1} line2={fact.line2} F={F} cap={cap} />
              <FactMark fact={fact} cx={axisX} cy={fact.t1 !== null ? y(fact.t) : markY} vertical to={fact.t1 !== null ? y(fact.t1) : markY} />
            </g>
          );
        })}

        {p >= FLAG_AT ? (
          <g opacity={fade(p, FLAG_AT)}>
            <Flag x={axisX} y={flagY} size={12} />
            <LabelText
              x={textX}
              top={flagTop}
              anchor="start"
              figure={model.firstPlace}
              line1={longDate(model.firstRace)}
              line2={`${model.firstSeriesShort} · race 1 of ${model.races}`}
              F={F}
              cap={cap}
              strong
            />
          </g>
        ) : null}

        <g>
          {squares.map((sq) => {
            const a = fade(p, clockOf(model, sq.t));
            if (a <= 0) return null;
            const dim = activeMonth !== null && activeMonth !== sq.t;
            return <rect key={sq.key} x={sq.x} y={sq.y} width={sq.s} height={sq.s} fill={sq.fill} opacity={a * (dim ? 0.35 : 1)} />;
          })}
        </g>
        <rect
          x={axisX}
          y={baseY - combH - 10}
          width={W - 4 - axisX}
          height={combH + 20}
          fill="transparent"
          className="before__hit"
          onClick={(e) => {
            e.stopPropagation();
            pickMonth(e);
          }}
        />
        {recYears.map((yr, i) => {
          if (i % step !== 0 && i !== recYears.length - 1) return null;
          if (i !== recYears.length - 1 && recYears.length - 1 - i < step) return null;
          const a = Math.max(model.r0, Date.UTC(yr, 0, 1));
          const b = Math.min(model.r1, Date.UTC(yr + 1, 0, 1));
          return (
            <text key={yr} x={(xr(a) + xr(b)) / 2} y={baseY + 19} textAnchor="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)" className="before__num">
              {yr}
            </text>
          );
        })}
        <text x={W - 4} y={baseY + 42} textAnchor="end" fontFamily={chartFont} fontSize={cap} fontWeight={600} fill="var(--ink-secondary)" opacity={fade(p, 0.9)}>
          The record: {model.races} races to {shortMonthYear(model.lastRace)}
        </text>
      </svg>
      {hover ? <DeepTip tip={hover.tip} width={W} /> : null}
    </div>
  );
};

/* ---------- the section ---------- */

const refEntries = (refs: UiSourceRef[]): SourceEntry[] => refs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }));
const citedSourceEntry = (source: UiCitedSource): SourceEntry => ({
  label: source.sourceName,
  path: source.sourceUrl ?? undefined,
  note: source.archived ? 'Archived official page, stored as a source URL only.' : 'Direct official page, stored as a source URL only.'
});

export const BeforeDeepDive = () => {
  const model = useModel();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.3);
  const reduced = useReducedMotion();
  const p = usePlayClock(inView, reduced);
  const version = switchValue('ddbefore') === 'runup' ? 'runup' : 'scale';
  if (!model) return null;
  const origin = uiDataPackage.screens.careerLab.smallSeriesStories.origin;

  const laps = model.facts.filter((fact) => fact.kind !== 'title');
  const records = laps.filter((fact) => fact.kind === 'record').length;
  const titles = model.facts.filter((fact) => fact.kind === 'title');
  const titleYear = titles.length ? new Date(titles[0].t).getUTCFullYear() : null;

  /* The package's first caveat still says the record starts with F1600; the
   * record now starts at Sebring (ledger, November 16, 2026). */
  const caveats = [
    `The sourced race-by-race record starts with the ${model.firstSeries} at ${model.firstPlace} on ${longDate(model.firstRace)}. The karting years before it survive only as the ${countWord(model.facts.length)} facts drawn here: context, not a scoreboard.`,
    ...origin.caveats.filter((caveat) => !/starts with F1600/.test(caveat)),
    ...(titles.length
      ? [`The ${titleYear} championship and runner-up carry only a year in their source, so each is drawn across the whole of ${titleYear}.`]
      : []),
    `${model.firstPlace} is the first race with an official classification. His first car races, at Homestead-Miami a week earlier (January 4 to 6, 2019), have none and are recorded as gaps, not results (career ledger, November 16, 2026).`
  ];
  const entries: SourceEntry[] = [
    ...origin.sources.map(citedSourceEntry),
    {
      label: 'The record',
      path: 'analysis/ui-data-package/ui-data-package.json (screens.careerLab.lifeStats: figures, lifeShare.firstRaceDate, weeksGrid)',
      note: `The ${model.races} races and the first race's date are the Career page's own figures. Each square is one race, placed in the month its race week falls in and coloured by series; heats are not counted.`
    },
    ...refEntries(origin.sourceRefs)
  ];

  return (
    <DeepDive
      className="dd--before"
      venues={() => (model ? model.months.map((month) => venueBetween(month.t, month.t1)).filter((ref) => ref !== null) : [])}
      figure={shortDate(model.firstRace)}
      unit={
        <>
          race 1 of {model.races}: the {model.firstSeries} at {model.firstPlace}
        </>
      }
      lede={
        <>
          Where his record starts. Before it, karting at Badger Kart Club: {countWord(laps.length)} lap times on the club&rsquo;s
          boards{records ? `, ${records === 1 ? 'one of them a track record' : `${countWord(records)} of them track records`}` : ''}
          {titles.length ? <>, then <strong>a club title and a runner-up</strong> in {titleYear}</> : null}.
        </>
      }
      sources={<SourcePill title="Before the record" entries={entries} caveats={caveats} />}
      foot={
        <>
          Lap times are club fast-time board entries, not race results · <PointerWord mouse="point at" touch="tap" /> a mark to read it
        </>
      }
    >
      <div
        ref={(node) => {
          ref.current = node;
          viewRef.current = node;
        }}
        className="before__wrap"
      >
        {width > 0 ? (
          width < 640 ? (
            <Tall model={model} width={width} p={p} />
          ) : (
            <Wide model={model} width={width} version={version} p={p} />
          )
        ) : null}
      </div>
    </DeepDive>
  );
};
