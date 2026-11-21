import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { useCareerRows, chapterTint, raceHref, seriesShort, type CareerRow } from '../careerExplorer';
import { chartFont, useInViewOnce, useMeasuredWidth, useReducedMotion, PointerOpen } from '../../app/charts';
import type { VenueTip } from '../../app/venueCard';
import { useVenuePreload } from '../../app/venuePeek';
import { useTapPreview } from '../../app/tapPreview';
import { useRouter } from '../../app/router';
import { SourcePill } from '../../app/components';
import { uiDataPackage } from '../../data/uiDataPackage';
import { DeepDive, DeepTip } from './frame';
import { raceTipOf, venuesOf } from './raceTip';
import { deepRaceTitle } from './raceTitle';
import { wetDryCall } from '../../app/wetDry';
import './rainRows.css';

/* ============================================================================
 * Rain days, round 3 (November 18, 2026).
 *
 * One question per row: in the wet, did he beat more of the field than in the
 * dry? Colour means weather and nothing else here: a wet race is rain blue, a
 * dry one grey ink. A series is a row of its own, named at the left with its
 * own swatch, ruled off from the next. "Better" is written on the chart: the
 * header reads worse ← → better, and each row's arrow runs from his typical
 * dry race to his typical wet one, so a row whose arrow points left did worse
 * in the wet.
 *
 * Top row: all 167 races (the two middles only, no dots: the dots are below).
 * Then every series that had a wet race, in career order. Then the series that
 * never saw a wet race, together, so the whole career is still on the chart.
 *
 * How sure each weather call is: a dot is solid where the series' report or an
 * observed call made it, light where only the weather model did (proxy review 3
 * found a third, ringed tier busy); the card names the source, read through
 * app/wetDry.ts like every other card. A hollow dot ended early, as everywhere.
 *
 * variant `rows`: a wet lane (in a light rain wash) over a dry lane, per row.
 * variant `bands`: one lane per row; the dry races become his usual range
 *   (middle half, a band) with its middle marked, and the wet races fall onto it.
 *
 * Medians: the old RainDays' medianOf exactly (sorted ascending, element
 * floor(n / 2), rounded to a whole percent). A wet middle is drawn only with
 * 3 or more wet races; with fewer, the dots stand alone.
 * ==========================================================================*/

type Variant = 'rows' | 'bands';
type Phase = 'pre' | 'fall' | 'done';
type Tier = 'report' | 'observed' | 'modelled' | 'none';

const MIN_FOR_MEDIAN = 3;

const medianOf = (rows: CareerRow[]): number => {
  const sorted = [...rows].sort((a, b) => a.percentile - b.percentile);
  return Math.round(sorted[Math.floor(sorted.length / 2)].percentile * 100);
};
/** The same rule at another rank: element floor(n · q) of the sorted lane. */
const rankOf = (rows: CareerRow[], q: number): number => {
  const sorted = [...rows].sort((a, b) => a.percentile - b.percentile);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].percentile * 100);
};

const isWet = (row: CareerRow) => row.wetDry !== null && row.wetDry !== 'dry';
const tierOf = (row: CareerRow): Tier =>
  row.wetDrySource === 'series_report' ? 'report' : row.wetDrySource === 'observed' ? 'observed' : row.wetDrySource === 'reanalysis' ? 'modelled' : 'none';
/** The card's weather words, read through app/wetDry.ts like every other card on the site:
 *  "damp track (series report)", "dry track (modelled, Open-Meteo)", "wet track (observed, NOAA)". */
const weatherWords = (row: CareerRow): string | null => {
  const call = wetDryCall(uiDataPackage.screens.careerLab.raceWeather?.[row.sessionId]);
  if (call) return `${call.words} (${call.tierWords})`;
  return row.wetDry === 'dry' ? 'dry track' : row.wetDry === 'wet' ? 'wet track' : row.wetDry ? 'wet for part of the race' : null;
};

/* ---------- beeswarm: dots on one line, nudged up and down so none overlap ---------- */

const swarm = (xs: number[], r: number, gap: number): number[] => {
  const d = 2 * r + gap;
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const placed: Array<{ x: number; y: number }> = [];
  const ys = new Array<number>(xs.length).fill(0);
  for (const i of order) {
    const x = xs[i];
    const near = placed.filter((p) => Math.abs(p.x - x) < d);
    const candidates = [0];
    for (const p of near) {
      const dy = Math.sqrt(Math.max(d * d - (p.x - x) * (p.x - x), 0));
      candidates.push(p.y + dy, p.y - dy);
    }
    candidates.sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
    const y = candidates.find((c) => near.every((p) => (p.x - x) ** 2 + (p.y - c) ** 2 >= d * d - 0.01)) ?? 0;
    ys[i] = y;
    placed.push({ x, y });
  }
  return ys;
};

/* A fixed, seeded scatter of fall delays, so the rain falls the same way every visit. */
const delayFor = (index: number) => {
  const h = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return Math.round((h - Math.floor(h)) * 560);
};

/* ---------- groups ---------- */

interface Group {
  key: string;
  kind: 'all' | 'series' | 'never';
  name: string;
  tint: string | null;
  wet: CareerRow[];
  dry: CareerRow[];
  wetMed: number | null;
  dryMed: number | null;
  /** The dry middle half, for the bands variant. */
  dryLow: number | null;
  dryHigh: number | null;
  /** The series in a "never wet" row. */
  members: string[];
}

const verdictOf = (group: Group): { text: string; dir: 'up' | 'down' | 'same' | 'none' } => {
  if (group.kind === 'never') return { text: 'never raced in the wet', dir: 'none' };
  if (group.wetMed === null || group.dryMed === null) {
    return { text: group.wet.length === 1 ? 'one wet race: too few to call' : `${group.wet.length} wet races: too few to call`, dir: 'none' };
  }
  const delta = group.wetMed - group.dryMed;
  if (Math.abs(delta) < 2) return { text: 'the same in the wet', dir: 'same' };
  return delta > 0 ? { text: 'better in the wet', dir: 'up' } : { text: 'worse in the wet', dir: 'down' };
};

/* ---------- layout ---------- */

interface Placed {
  x: number;
  y: number;
  r: number;
  wet: boolean;
}

interface RowBox {
  group: Group;
  top: number;
  bottom: number;
  /** rows: the wet lane box; bands: the single lane. */
  wetTop: number;
  wetBottom: number;
  verdictY: number;
  dryTop: number;
  dryBottom: number;
  /** bands: the lane's centre line. */
  midY: number;
}

interface Layout {
  height: number;
  headH: number;
  rows: RowBox[];
  pos: Map<string, Placed>;
  plotL: number;
  plotR: number;
  gutter: number;
  phone: boolean;
  rWet: number;
  rDry: number;
}

const rowKey = (row: CareerRow, index: number) => `${row.sessionId}#${index}`;

export const RainRows = ({ variant }: { variant: Variant }) => {
  const rows = useCareerRows();
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const reduced = useReducedMotion();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.15);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'pre');
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<VenueTip | null>(null);

  const reported = useMemo(() => rows.filter((row) => row.wetDry !== null), [rows]);
  const preload = useVenuePreload(() => venuesOf(reported));
  const keyed = useMemo(() => reported.map((row, index) => ({ row, key: rowKey(row, index), index })), [reported]);
  const keyOf = useMemo(() => new Map(keyed.map(({ row, key }) => [row, key])), [keyed]);
  const byKey = useMemo(() => new Map(keyed.map(({ row, key }) => [key, row])), [keyed]);

  const groups = useMemo((): Group[] => {
    const make = (key: string, kind: Group['kind'], name: string, tint: string | null, list: CareerRow[], members: string[] = []): Group => {
      const wet = list.filter(isWet);
      const dry = list.filter((row) => !isWet(row));
      return {
        key,
        kind,
        name,
        tint,
        wet,
        dry,
        wetMed: wet.length >= MIN_FOR_MEDIAN ? medianOf(wet) : null,
        dryMed: dry.length >= MIN_FOR_MEDIAN ? medianOf(dry) : null,
        dryLow: dry.length >= 5 ? rankOf(dry, 0.25) : null,
        dryHigh: dry.length >= 5 ? rankOf(dry, 0.75) : null,
        members
      };
    };
    const bySeries = new Map<string, CareerRow[]>();
    reported.forEach((row) => bySeries.set(row.seriesName, [...(bySeries.get(row.seriesName) ?? []), row]));
    const withWet: Group[] = [];
    const neverRows: CareerRow[] = [];
    const neverNames: string[] = [];
    bySeries.forEach((list, name) => {
      if (list.some(isWet)) withWet.push(make(name, 'series', seriesShort(name), chapterTint(name), list));
      else {
        neverRows.push(...list);
        neverNames.push(seriesShort(name));
      }
    });
    const out = [make('all', 'all', `All ${reported.length} races`, null, reported), ...withWet];
    if (neverRows.length > 0) out.push(make('never', 'never', 'No wet races', null, neverRows, neverNames));
    return out;
  }, [reported]);

  const all = groups[0];
  const enough = all !== undefined && all.wet.length >= 5 && all.dry.length >= 5;

  /* Entrance: the races fall once the section is in view, on a clock; then the middles and arrows draw. */
  const fallMs = 1350;
  const started = useRef(false);
  useEffect(() => {
    if (reduced) {
      setPhase('done');
      return undefined;
    }
    if (!inView || width === 0 || started.current) return undefined;
    started.current = true;
    const frame = requestAnimationFrame(() => setPhase('fall'));
    return () => cancelAnimationFrame(frame);
  }, [inView, width, reduced]);
  useEffect(() => {
    if (phase !== 'fall') return undefined;
    const done = window.setTimeout(() => setPhase('done'), fallMs);
    return () => window.clearTimeout(done);
  }, [phase]);

  const phone = width > 0 && width < 640;
  const wide = width >= 1800;
  const rWet = phone ? 5 : wide ? 6.8 : 6;
  const rDry = phone ? 3.9 : wide ? 5.1 : 4.6;
  const gutter = phone ? 0 : Math.min(Math.max(width * 0.17, 176), 250);
  const plotL = phone ? 12 : gutter + 24;
  const plotR = width - (phone ? 12 : 22);
  const x = (share: number) => plotL + Math.min(1, Math.max(0, share)) * Math.max(plotR - plotL, 0);

  const layout = useMemo((): Layout | null => {
    if (!enough || width === 0) return null;
    const pos = new Map<string, Placed>();
    const out: RowBox[] = [];
    const headH = phone ? 46 : 52;
    const nameRow = phone ? 40 : 0;
    const nameRowFor = (group: Group) => (phone && group.kind === 'never' ? 56 : nameRow);
    const pad = phone ? 6 : 8;
    const verdictH = phone ? 30 : 30;
    let y = headH + (phone ? 4 : 10);

    const placeLane = (list: CareerRow[], r: number, gap: number, wet: boolean, centre: number) => {
      const xs = list.map((row) => x(row.percentile / 1));
      const ys = swarm(xs, r, gap);
      list.forEach((row, i) => pos.set(keyOf.get(row) ?? '', { x: xs[i], y: centre + ys[i], r, wet }));
    };
    const reachOf = (list: CareerRow[], r: number, gap: number) => {
      if (list.length === 0) return 0;
      const ys = swarm(
        list.map((row) => x(row.percentile)),
        r,
        gap
      );
      return Math.max(0, ...ys.map(Math.abs)) + r;
    };

    groups.forEach((group, index) => {
      const top = y;
      y += nameRowFor(group);
      if (group.kind === 'all') {
        // the summary: two middles and the arrow between them, nothing else
        const h = phone ? 44 : 50;
        const box: RowBox = { group, top, bottom: 0, wetTop: y, wetBottom: y, verdictY: y + h / 2, dryTop: y + h, dryBottom: y + h, midY: y + h / 2 };
        y += h;
        box.bottom = y;
        out.push(box);
      } else if (variant === 'rows') {
        const wetReach = group.wet.length ? reachOf(group.wet, rWet, 2.5) : 0;
        const dryReach = reachOf(group.dry, rDry, 1.6);
        const wetTop = y;
        const wetH = group.wet.length ? 2 * wetReach + 2 * pad : 0;
        if (group.wet.length) placeLane(group.wet, rWet, 2.5, true, wetTop + wetH / 2);
        y += wetH;
        const verdictY = y + verdictH / 2;
        y += verdictH;
        const dryTop = y;
        const dryH = 2 * dryReach + 2 * pad;
        placeLane(group.dry, rDry, 1.6, false, dryTop + dryH / 2);
        y += dryH;
        out.push({ group, top, bottom: y, wetTop, wetBottom: wetTop + wetH, verdictY, dryTop, dryBottom: y, midY: dryTop + dryH / 2 });
      } else {
        // bands: one lane; the dry range is a band through the middle, the races swarm over it
        const both = [...group.dry, ...group.wet];
        const xs = both.map((row) => x(row.percentile));
        // wet races are placed first so they sit on the line; dry specks fill around them
        const wetYs = swarm(
          group.wet.map((row) => x(row.percentile)),
          rWet,
          2.5
        );
        const dryXs = group.dry.map((row) => x(row.percentile));
        const rug = rDry * 0.62;
        const dryYs = swarm(dryXs, rug, 1.4);
        const bandHalf = phone ? 9 : 11;
        const up = Math.max(bandHalf, ...wetYs.map((v) => -v + rWet)) + pad;
        const down = Math.max(bandHalf, ...wetYs.map((v) => v + rWet));
        void xs;
        const midY = y + up;
        // the dry races: a quiet rug under the band, each still a race to point at
        const rugY = midY + down + 5 + Math.max(0, ...dryYs.map(Math.abs)) + rug;
        group.wet.forEach((row, i) => pos.set(keyOf.get(row) ?? '', { x: x(row.percentile), y: midY + wetYs[i], r: rWet, wet: true }));
        group.dry.forEach((row, i) => pos.set(keyOf.get(row) ?? '', { x: dryXs[i], y: rugY + dryYs[i], r: rug, wet: false }));
        const lowest = rugY + Math.max(0, ...dryYs.map(Math.abs)) + rug;
        y = lowest + 4;
        const verdictY = y + 12;
        y += 24;
        out.push({ group, top, bottom: y, wetTop: midY - up, wetBottom: midY + down, verdictY, dryTop: midY - up, dryBottom: lowest, midY });
      }
      y += index < groups.length - 1 ? (phone ? 14 : 18) : 6;
    });
    return { height: y + (phone ? 40 : 34), headH, rows: out, pos, plotL, plotR, gutter, phone, rWet, rDry };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enough, width, variant, phone, rWet, rDry, gutter, groups, keyOf]);

  if (!enough || !all) return null;
  const wetMedian = all.wetMed ?? 0;
  const dryMedian = all.dryMed ?? 0;

  const tipOf = (row: CareerRow, at: Placed): VenueTip => {
    return {
      x: at.x,
      y: at.y - at.r - 3,
      over: at.y - at.r - 3,
      under: at.y + at.r + 4,
      ...raceTipOf(row, {
        note:
          [
            weatherWords(row),
            row.status !== 'running' ? `ended early: ${row.status}` : null
          ]
            .filter(Boolean)
            .join(' · ') || null
      }),
      title: deepRaceTitle(row.sessionId, raceTipOf(row).title)
    };
  };

  const find = (event: MouseEvent<Element>): string | null => {
    const svg = svgRef.current;
    if (!svg || !layout || phase === 'pre') return null;
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best: string | null = null;
    let bestD = (phone ? 20 : 13) ** 2;
    layout.pos.forEach((p, key) => {
      // a wet race wins a near tie: there are fewer of them and they are the point
      const d = (p.x - px) ** 2 + (p.y - py) ** 2 - (p.wet ? 6 : 0);
      if (d < bestD) {
        bestD = d;
        best = key;
      }
    });
    const row = best === null ? undefined : byKey.get(best);
    const p = best === null ? undefined : layout.pos.get(best);
    if (best === null || !row || !p) {
      setHovered(null);
      setTip(null);
      return null;
    }
    setHovered(best);
    setTip(tipOf(row, p));
    return best;
  };
  const clear = () => {
    setHovered(null);
    setTip(null);
  };

  /* The sentence: what the gap is, honestly. Every claim in it is checked against the rows. */
  const seriesGroups = groups.filter((group) => group.kind === 'series');
  const mostWet = [...seriesGroups].sort((a, b) => b.wet.length - a.wet.length)[0];
  const strongest = [...groups]
    .filter((group) => group.kind === 'series' && group.dryMed !== null)
    .sort((a, b) => (b.dryMed ?? 0) - (a.dryMed ?? 0))[0];
  const compared = seriesGroups.filter((group) => group.wetMed !== null && group.dryMed !== null);
  const lone = seriesGroups.filter((group) => group.wetMed === null && group.dryMed !== null && group.wet.length > 0);
  const rainNeverLifted =
    compared.length > 0 &&
    compared.every((group) => (group.wetMed ?? 0) <= (group.dryMed ?? 0)) &&
    lone.every((group) => group.wet.every((row) => Math.round(row.percentile * 100) < (group.dryMed ?? 0)));
  const arrowsWord = compared.length === 1 ? 'its arrow points left' : compared.length === 2 ? 'both arrows point left' : 'every arrow points left';
  const lede =
    wetMedian > dryMedian && rainNeverLifted && mostWet ? (
      <>
        {mostWet.wet.length} of his {all.wet.length} wet races were in {mostWet.name}
        {strongest && strongest.key === mostWet.key ? ', his strongest series' : ''}, and that lifts the wet average. Inside each
        series, <strong>the rain never helped</strong>: {arrowsWord}{lone.length ? `, and ${lone.length === 1 ? 'the one wet race elsewhere' : `the ${lone.length} lone wet races elsewhere`} sat below his dry middle` : ''}.
      </>
    ) : wetMedian > dryMedian ? (
      <>
        In a typical wet race he beat <strong>a larger share of the field</strong> than in a typical dry one.
      </>
    ) : (
      <>
        His typical dry race beat <strong>{dryMedian}%</strong> of the field; wet or mixed races sit at <strong>{wetMedian}%</strong>.
      </>
    );

  const tierCount = (source: string) => reported.filter((row) => row.wetDrySource === source).length;
  const calibration = uiDataPackage.screens.careerLab.raceWeatherSummary?.calibration;
  const sources = (
    <SourcePill
      title="Rain days"
      entries={[
        {
          label: 'Weather for every race',
          path: 'analysis/ui-data-package/ui-data-package.json (screens.careerLab.raceWeather)',
          note: `Wet or dry for each race: the official series condition report where there is one (${tierCount('series_report')}), else an observed call from the nearest weather station and race reports (${tierCount('observed')}), both drawn solid; else Open-Meteo reanalysis over the race window, modelled (${tierCount('reanalysis')}), drawn light. Each race's card names its source. ${all.dry.length} dry; ${all.wet.length} wet or mixed. A modelled dry is weak evidence: checked against the official reports, the reanalysis caught ${calibration?.modelCaughtWetOrMixed ?? '?'} of ${calibration?.officialWetOrMixed ?? '?'} wet or damp races.`
        },
        {
          label: 'Career result conversion · share of the field beaten',
          path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
          note: `Each dot is one race, placed by the share of the other cars he finished ahead of. A row's typical race is its middle one (the upper middle for an even count), rounded to a whole percent; the arrow runs from the typical dry race to the typical wet one. A wet middle is drawn only with ${MIN_FOR_MEDIAN} or more wet races${
            variant === 'bands' ? '. The grey band is the middle half of his dry races (from the race a quarter of the way up to the one three quarters up, by the same rule)' : ''
          }. The series with no wet race (${groups.find((group) => group.kind === 'never')?.members.join(', ') ?? 'none'}) share the last row.`
        }
      ]}
      caveats={uiDataPackage.screens.careerLab.caveats}
    />
  );

  const figure = (
    <>
      {wetMedian}%<span className="dd__of"> vs {dryMedian}%</span>
    </>
  );

  const decor = phase === 'done';
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  /* An arrow from the dry middle to the wet middle, with the two figures at its ends. */
  const Verdict = ({ box, big }: { box: RowBox; big: boolean }) => {
    const { group } = box;
    const y = box.verdictY;
    const items: ReactElement[] = [];
    const font = big ? (phone ? 14 : 15) : phone ? 12 : 12.5;
    const charW = font * 0.6;
    const dx = group.dryMed !== null ? x(group.dryMed / 100) : null;
    const wx = group.wetMed !== null ? x(group.wetMed / 100) : null;
    const dryText = group.dryMed !== null ? `${group.dryMed}% dry` : '';
    const wetText = group.wetMed !== null ? `${group.wetMed}% wet` : '';
    if (dx !== null && wx !== null) {
      const dir = wx >= dx ? 1 : -1;
      const head = big ? 7 : 5.5;
      const len = Math.abs(wx - dx);
      const tailGap = big ? 9 : 5;
      const headGap = big ? 9 : 5;
      if (len > tailGap + headGap + head) {
        const x1 = dx + dir * tailGap;
        const x2 = wx - dir * headGap;
        items.push(
          <path
            key="shaft"
            className={`rr__arrow${decor ? ' rr__arrow--on' : ''}${big ? ' rr__arrow--big' : ''}`}
            d={`M${x1} ${y} L${x2} ${y}`}
            pathLength={1}
          />,
          <path
            key="head"
            className={`rr__head${decor ? ' rr__head--on' : ''}`}
            d={`M${x2 - dir * head} ${y - head * 0.62} L${x2} ${y} L${x2 - dir * head} ${y + head * 0.62}`}
          />
        );
      }
      // the figures sit outside the two ends; if the outer one would run off the page, both go on the free side
      const leftIsDry = dx <= wx;
      const leftX = Math.min(dx, wx) - (big ? 14 : 9);
      const rightX = Math.max(dx, wx) + (big ? 14 : 9);
      const leftText = leftIsDry ? dryText : wetText;
      const rightText = leftIsDry ? wetText : dryText;
      const rightFits = rightX + rightText.length * charW <= width - 2;
      const leftFits = leftX - leftText.length * charW >= (phone ? 2 : plotL - 18);
      const fig = (text: string, at: number, anchor: 'start' | 'end', isWet: boolean, k: string) => (
        <text key={k} x={at} y={y + font * 0.36} textAnchor={anchor} fontFamily={chartFont} className={`rr__fig${isWet ? ' rr__fig--wet' : ''}`} fontSize={font}>
          {text}
        </text>
      );
      if (rightFits && leftFits) {
        items.push(fig(leftText, leftX, 'end', !leftIsDry, 'l'), fig(rightText, rightX, 'start', leftIsDry, 'r'));
      } else if (!rightFits) {
        items.push(fig(`${leftText} · ${rightText}`.replace(/^ · | · $/g, ''), leftX, 'end', false, 'l'));
      } else {
        items.push(fig(`${leftText} · ${rightText}`.replace(/^ · | · $/g, ''), rightX, 'start', false, 'r'));
      }
    } else if (dx !== null) {
      const room = plotR - dx > dryText.length * charW + 14;
      items.push(
        <text key="d" x={room ? dx + 9 : dx - 9} y={y + font * 0.36} textAnchor={room ? 'start' : 'end'} fontFamily={chartFont} className="rr__fig" fontSize={font}>
          {dryText}
        </text>
      );
    }
    return <g className={`rr__verdict${decor ? ' rr__verdict--on' : ''}`}>{items}</g>;
  };

  return (
    <DeepDive
      className="rain rr"
      figure={figure}
      unit="of the field beaten in a typical wet race, against a typical dry one"
      lede={lede}
      sources={sources}
      foot={
        <>
          <span className="rr-key">
            <svg width="40" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4.4" className="rr-key__wet" />
              <circle cx="20" cy="6" r="4.4" className="rr-key__dry" />
            </svg>
            wet, dry
          </span>
          <span className="rr-key">
            <svg width="26" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" className="rr-key__ink" />
              <circle cx="20" cy="6" r="4" className="rr-key__ink rr-key__soft" />
            </svg>
            weather reported or observed, modelled
          </span>
          <span className="rr-key">
            <svg width="14" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" className="rr-key__hollow" />
            </svg>
            ended early
          </span>
          <span className="rr-key">
            <PointerOpen what="any dot" then="to open its race" start />
          </span>
        </>
      }
    >
      <div ref={viewRef}>
        <div ref={ref} className="rr__stage" onPointerEnter={preload}>
          {layout ? (
            <svg
              ref={svgRef}
              width={width}
              className="rr__svg"
              style={{ height: layout.height }}
              role="img"
              aria-label={`Share of the field beaten, wet races against dry, one row per series. All races: typical wet race ${wetMedian}%, typical dry race ${dryMedian}%. ${seriesGroups
                .map((group) => `${group.name}: ${verdictOf(group).text}${group.wetMed !== null && group.dryMed !== null ? ` (${group.wetMed}% wet, ${group.dryMed}% dry)` : ''}`)
                .join('; ')}.`}
              data-hovering={hovered ? '' : undefined}
              {...tap.surface({
                find,
                clear,
                open: (key) => {
                  const row = byKey.get(String(key));
                  return row ? () => navigate(raceHref(row.sessionId)) : null;
                }
              })}
            >
              <defs>
                <pattern id="rr-streaks" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
                  <line x1="5" y1="2" x2="5" y2="8" className="rr__streak" />
                  <line x1="14" y1="11" x2="14" y2="16" className="rr__streak" />
                </pattern>
                <linearGradient id="rr-better" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0" className="rr__better-0" />
                  <stop offset="1" className="rr__better-1" />
                </linearGradient>
              </defs>

              {/* the header: percentages, then which way is better, written on the chart */}
              <g fontFamily={chartFont}>
                {ticks.map((t) =>
                  layout.phone && (t === 0.25 || t === 0.75) ? null : (
                    <text
                      key={t}
                      x={x(t)}
                      y={14}
                      textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
                      className="rr__tick"
                    >
                      {Math.round(t * 100)}%
                    </text>
                  )
                )}
                <rect x={plotL} y={layout.phone ? 24 : 26} width={Math.max(plotR - plotL, 0)} height={3} rx={1.5} fill="url(#rr-better)" />
                <text x={plotL} y={layout.phone ? 42 : 46} textAnchor="start" className="rr__worse">
                  ← beat fewer
                </text>
                <text x={plotR} y={layout.phone ? 42 : 46} textAnchor="end" className="rr__better">
                  beat more · better →
                </text>
              </g>

              {/* quarter lines, from the header to the foot */}
              {ticks.map((t) => (
                <line
                  key={`g${t}`}
                  x1={x(t)}
                  x2={x(t)}
                  y1={layout.headH + 4}
                  y2={layout.height - (layout.phone ? 36 : 30)}
                  className={`rr__grid${t === 0.5 ? ' rr__grid--mid' : ''}`}
                />
              ))}

              {/* rows: the rule between them, the name, the wet wash, the dry band */}
              {layout.rows.map((box, index) => {
                const { group } = box;
                const verdict = verdictOf(group);
                const counts =
                  group.kind === 'all'
                    ? `${group.wet.length} wet · ${group.dry.length} dry`
                    : group.kind === 'never'
                      ? `${group.dry.length} dry · ${group.members.join(', ')}`
                      : `${group.wet.length} wet · ${group.dry.length} dry`;
                const nameY = layout.phone ? box.top + 15 : (box.top + box.bottom) / 2 - (group.kind === 'never' ? 14 : 12);
                return (
                  <g key={group.key} className="rr__row">
                    {index > 0 ? <line x1={0} x2={width} y1={box.top - (layout.phone ? 7 : 9)} y2={box.top - (layout.phone ? 7 : 9)} className="rr__rule" /> : null}
                    {variant === 'rows' && box.wetBottom > box.wetTop ? (
                      <g className="rr__fade">
                        <rect
                          x={plotL - layout.rWet - 8}
                          y={box.wetTop + 1}
                          width={plotR - plotL + 2 * layout.rWet + 16}
                          height={box.wetBottom - box.wetTop - 2}
                          rx={8}
                          className="rr__sky"
                        />
                        <rect
                          x={plotL - layout.rWet - 8}
                          y={box.wetTop + 1}
                          width={plotR - plotL + 2 * layout.rWet + 16}
                          height={box.wetBottom - box.wetTop - 2}
                          rx={8}
                          fill="url(#rr-streaks)"
                        />
                      </g>
                    ) : null}
                    {variant === 'bands' && group.kind !== 'all' && group.dryLow !== null && group.dryHigh !== null ? (
                      <g className={`rr__band${decor ? ' rr__band--on' : ''}`} style={{ transformOrigin: `${x((group.dryMed ?? 50) / 100)}px ${box.midY}px` }}>
                        <rect
                          x={x(group.dryLow / 100)}
                          y={box.midY - (layout.phone ? 9 : 11)}
                          width={Math.max(x(group.dryHigh / 100) - x(group.dryLow / 100), 2)}
                          height={layout.phone ? 18 : 22}
                          rx={layout.phone ? 9 : 11}
                          className="rr__band-rect"
                        />
                      </g>
                    ) : null}

                    {/* the middles: a tick through each lane */}
                    {group.kind !== 'all' && group.dryMed !== null ? (
                      <line
                        x1={x(group.dryMed / 100)}
                        x2={x(group.dryMed / 100)}
                        y1={variant === 'rows' ? box.verdictY : box.midY - (layout.phone ? 13 : 15)}
                        y2={variant === 'rows' ? box.dryBottom - 3 : box.midY + (layout.phone ? 13 : 15)}
                        className={`rr__mid rr__mid--dry${decor ? ' rr__mid--on' : ''}`}
                      />
                    ) : null}
                    {group.kind !== 'all' && group.wetMed !== null ? (
                      <line
                        x1={x(group.wetMed / 100)}
                        x2={x(group.wetMed / 100)}
                        y1={variant === 'rows' ? box.wetTop + 3 : box.midY - (layout.phone ? 13 : 15)}
                        y2={variant === 'rows' ? box.verdictY : box.midY + (layout.phone ? 13 : 15)}
                        className={`rr__mid rr__mid--wet${decor ? ' rr__mid--on' : ''}`}
                      />
                    ) : null}
                    {group.kind === 'all' ? (
                      <g className={`rr__summary${decor ? ' rr__summary--on' : ''}`}>
                        {group.dryMed !== null ? <circle cx={x(group.dryMed / 100)} cy={box.verdictY} r={layout.phone ? 6 : 7} className="rr__sum-dry" /> : null}
                        {group.wetMed !== null ? <circle cx={x(group.wetMed / 100)} cy={box.verdictY} r={layout.phone ? 6 : 7} className="rr__sum-wet" /> : null}
                      </g>
                    ) : null}

                    {/* the name, the verdict, the counts */}
                    <g className="rr__label">
                      {layout.phone ? (
                        <text x={plotL - (group.tint ? 0 : 0)} y={nameY} fontFamily={chartFont}>
                          <tspan className="rr__name">{group.name}</tspan>
                          <tspan className={`rr__say rr__say--${verdict.dir}`} dx={8}>
                            {group.kind === 'all' || verdict.dir !== 'none' ? verdict.text : ''}
                          </tspan>
                          <tspan x={plotL} dy={17} className="rr__count">
                            {group.kind === 'never' ? `${group.dry.length} dry · ${group.members.slice(0, 3).join(', ')},` : verdict.dir === 'none' ? `${counts} · ${verdict.text}` : counts}
                          </tspan>
                          {group.kind === 'never' ? (
                            <tspan x={plotL} dy={16} className="rr__count">
                              {group.members.slice(3).join(', ')}
                            </tspan>
                          ) : null}
                        </text>
                      ) : (
                        <>
                          {group.tint ? <rect x={0} y={nameY - 12} width={3} height={15} rx={1.5} fill={group.tint} /> : null}
                          <text x={11} y={nameY} fontFamily={chartFont} className="rr__name">
                            {group.name}
                          </text>
                          <text x={11} y={nameY + 18} fontFamily={chartFont} className={`rr__say rr__say--${verdict.dir}`}>
                            {verdict.text}
                          </text>
                          {group.kind === 'never' ? (
                            <text x={11} y={nameY + 35} fontFamily={chartFont} className="rr__count">
                              <tspan>{`${group.dry.length} dry races in`}</tspan>
                              <tspan x={11} dy={15}>
                                {`${group.members.slice(0, 3).join(', ')}${group.members.length > 3 ? ',' : ''}`}
                              </tspan>
                              {group.members.length > 3 ? (
                                <tspan x={11} dy={15}>
                                  {group.members.slice(3).join(', ')}
                                </tspan>
                              ) : null}
                            </text>
                          ) : (
                            <text x={11} y={nameY + 35} fontFamily={chartFont} className="rr__count">
                              {counts}
                            </text>
                          )}
                        </>
                      )}
                    </g>
                  </g>
                );
              })}

              {/* the hovered race: a guide down to its row's verdict line, so it is never lost among its neighbours */}
              {hovered && layout.pos.get(hovered) ? (
                <line
                  x1={layout.pos.get(hovered)!.x}
                  x2={layout.pos.get(hovered)!.x}
                  y1={layout.headH - 4}
                  y2={layout.pos.get(hovered)!.y - layout.pos.get(hovered)!.r - 5}
                  className="rr__guide"
                />
              ) : null}

              {/* every race, a dot, falling like rain into its row */}
              {keyed.map(({ row, key, index }) => {
                const p = layout.pos.get(key);
                if (!p) return null;
                const tier = tierOf(row);
                const running = row.status === 'running';
                const isHover = hovered === key;
                const dim = hovered !== null && !isHover;
                const start = phase === 'pre';
                const delay = delayFor(index);
                const fall = Math.round(320 + 26 * Math.sqrt(p.y + 14));
                const transition =
                  phase === 'fall'
                    ? `transform ${fall}ms cubic-bezier(0.5, 0, 0.9, 0.55) ${delay}ms, opacity 140ms linear ${delay}ms`
                    : 'opacity 160ms ease';
                const cls = `rr__dot rr__dot--${p.wet ? 'wet' : 'dry'} rr__dot--${tier}${running ? '' : ' rr__dot--early'}${isHover ? ' rr__dot--hover' : ''}`;
                return (
                  <g
                    key={key}
                    style={{
                      transform: `translate(${p.x}px, ${start ? -18 : p.y}px)`,
                      opacity: start ? 0 : dim ? 0.55 : 1,
                      transition
                    }}
                  >
                    {isHover ? <circle r={p.r + 4.5} className="rr__hover-ring" /> : null}
                    <circle r={isHover ? p.r + 1 : p.r} className={cls} />
                  </g>
                );
              })}

              {/* the arrows and figures draw last, over the dots */}
              {layout.rows.map((box) => (
                <Verdict key={`v-${box.group.key}`} box={box} big={box.group.kind === 'all'} />
              ))}
            </svg>
          ) : null}
          {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
        </div>
      </div>
    </DeepDive>
  );
};
