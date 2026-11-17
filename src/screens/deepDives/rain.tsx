import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useCareerRows, chapterTint, raceHref, seriesShort, Segmented, type CareerRow } from '../careerExplorer';
import { chartFont, useInViewOnce, useMeasuredWidth, useReducedMotion, PointerOpen, type ChartTip } from '../../app/charts';
import { useTapPreview } from '../../app/tapPreview';
import { useRouter } from '../../app/router';
import { SourcePill } from '../../app/components';
import { uiDataPackage } from '../../data/uiDataPackage';
import { switchValue } from '../../review/switches';
import { DeepDive, DeepTip } from './frame';
import './rain.css';

/**
 * Rain days (November 17, 2026). Every race with a sourced condition report is
 * a dot on one "share of the field beaten" axis. On reveal the days fall like
 * rain: the wet ones stop in the blue-grey sky band, the dry ones fall through
 * to the paper below. The two medians and the step between them are the hero.
 *
 * "By series" sorts the same dots into each series' own wet and dry strips,
 * because the pooled gap is a series mix: most wet days came in Formula Ford,
 * where he beat most of the field in any weather. Same dots, same median rule
 * (the old RainDays' medianOf), nothing recomputed differently.
 *
 * Review switch `ddrain`: null opens on "All races", `series` opens split.
 */

type View = 'together' | 'series';
type Phase = 'pre' | 'fall' | 'done';

/** The old RainDays' medianOf, exactly: the upper middle of the sorted lane, rounded to a whole percent. */
const medianOf = (laneRows: CareerRow[]): number => {
  const sorted = [...laneRows].sort((a, b) => a.percentile - b.percentile);
  return Math.round(sorted[Math.floor(sorted.length / 2)].percentile * 100);
};

/** A median only where a strip has enough races to have a middle worth drawing. */
const MIN_FOR_MEDIAN = 3;

const isWet = (row: CareerRow) => row.wetDry !== null && row.wetDry !== 'dry';

/* ---------- beeswarm: dots on one line, nudged up and down so none overlap ---------- */

const swarm = (xs: number[], r: number): number[] => {
  const d = 2 * r + 3;
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
    const y =
      candidates.find((c) => near.every((p) => (p.x - x) * (p.x - x) + (p.y - c) * (p.y - c) >= d * d - 0.01)) ?? 0;
    ys[i] = y;
    placed.push({ x, y });
  }
  return ys;
};

/* ---------- tiny weather glyphs, drawn in the site's line style ---------- */

const RainGlyph = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden>
    <path d="M3.2 7.6 a3 3 0 0 1 0.6-5.9 a4 4 0 0 1 7.5 0.9 a2.6 2.6 0 0 1 0.3 5 Z" strokeLinejoin="round" />
    <path d="M4.6 10.2 l-0.8 2.2 M7.6 10.2 l-0.8 2.2 M10.6 10.2 l-0.8 2.2" />
  </g>
);

const SunGlyph = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden>
    <circle cx={7} cy={7} r={2.7} />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
      const t = (a * Math.PI) / 180;
      return <line key={a} x1={7 + Math.cos(t) * 4.6} y1={7 + Math.sin(t) * 4.6} x2={7 + Math.cos(t) * 6.2} y2={7 + Math.sin(t) * 6.2} />;
    })}
  </g>
);

/* ---------- layout ---------- */

interface Strip {
  key: string;
  wet: boolean;
  top: number;
  height: number;
  median: number | null;
  /** Where the median figure sits: above the strip (wet) or below it (dry). */
  labelSide: 'above' | 'below';
  /** "typical wet day" / "wet" */
  medianWord: string;
  big: boolean;
}

interface LabelLine {
  text: string;
  tone: 'ink' | 'muted' | 'tint';
  tint?: string;
  weight?: number;
}

interface Label {
  key: string;
  x: number;
  y: number;
  lines: LabelLine[];
  glyph?: 'rain' | 'sun';
}

interface Layout {
  height: number;
  strips: Strip[];
  labels: Label[];
  /** Pairs of strips whose medians get the step connector. */
  steps: Array<{ wet: Strip; dry: Strip }>;
  /** Wash bands (the wet sky). */
  skies: Array<{ key: string; x: number; y: number; w: number; h: number }>;
  /** Series names written in the wet sky under their own dots (the "All races" view). */
  tags: Array<{ key: string; x: number; y: number; text: string; tint: string }>;
  pos: Map<string, { x: number; y: number }>;
  axisY: number;
}

const rowKey = (row: CareerRow, index: number) => `${row.sessionId}#${index}`;

/* A fixed, seeded scatter of fall delays, so the rain falls the same way every visit. */
const delayFor = (index: number) => {
  const h = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return Math.round((h - Math.floor(h)) * 520);
};

export const RainDeepDive = () => {
  const rows = useCareerRows();
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const reduced = useReducedMotion();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.15);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>(() => (switchValue('ddrain') === 'series' ? 'series' : 'together'));
  const [phase, setPhase] = useState<Phase>(reduced ? 'done' : 'pre');
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const reported = useMemo(() => rows.filter((row) => row.wetDry !== null), [rows]);
  const dry = useMemo(() => reported.filter((row) => row.wetDry === 'dry'), [reported]);
  const wet = useMemo(() => reported.filter((row) => row.wetDry !== 'dry'), [reported]);
  /* Stable keys: the same race keeps its dot across both views. */
  const keyed = useMemo(() => reported.map((row, index) => ({ row, key: rowKey(row, index) })), [reported]);
  const keyOf = useMemo(() => new Map(keyed.map(({ row, key }) => [row, key])), [keyed]);
  const byKey = useMemo(() => new Map(keyed.map(({ row, key }) => [key, row])), [keyed]);

  /* Series in career order, each with its own wet and dry strips. */
  const series = useMemo(() => {
    const groups = new Map<string, CareerRow[]>();
    reported.forEach((row) => {
      const list = groups.get(row.seriesName) ?? [];
      list.push(row);
      groups.set(row.seriesName, list);
    });
    return [...groups.entries()].map(([name, list]) => {
      const wetRows = list.filter(isWet);
      const dryRows = list.filter((row) => !isWet(row));
      return {
        name,
        short: seriesShort(name),
        tint: chapterTint(name),
        wetRows,
        dryRows,
        wetMedian: wetRows.length >= MIN_FOR_MEDIAN ? medianOf(wetRows) : null,
        dryMedian: dryRows.length >= MIN_FOR_MEDIAN ? medianOf(dryRows) : null
      };
    });
  }, [reported]);

  const enough = dry.length >= 5 && wet.length >= 5;
  const dryMedian = enough ? medianOf(dry) : 0;
  const wetMedian = enough ? medianOf(wet) : 0;

  /* Entrance: the days fall once the section is in view, on a clock, then the medians draw. */
  const fallMs = 1250;
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
  const r = phone ? 4.6 : width >= 1800 ? 6 : 5.2;
  const gutter = phone ? 0 : Math.min(Math.max(width * 0.13, 150), 210);
  const plotL = gutter + r + 4;
  const plotR = width - r - (phone ? 6 : 14);
  const x = (p: number) => plotL + Math.min(1, Math.max(0, p)) * Math.max(plotR - plotL, 0);

  const layout = useMemo((): Layout | null => {
    if (!enough || width === 0) return null;
    const pos = new Map<string, { x: number; y: number }>();
    const strips: Strip[] = [];
    const labels: Label[] = [];
    const skies: Layout['skies'] = [];
    const steps: Layout['steps'] = [];
    const tags: Layout['tags'] = [];
    const pad = phone ? 7 : 9;

    /** Places one strip's dots from `top` down; returns the strip. */
    const place = (key: string, laneRows: CareerRow[], top: number, wetStrip: boolean, median: number | null, word: string, big: boolean): Strip => {
      const xs = laneRows.map((row) => x(row.percentile));
      const ys = swarm(xs, r);
      const reach = Math.max(0, ...ys.map((y) => Math.abs(y)));
      const height = 2 * reach + 2 * r + 2 * pad;
      const mid = top + height / 2;
      laneRows.forEach((row, i) => pos.set(keyOf.get(row) ?? '', { x: xs[i], y: mid + ys[i] }));
      const strip: Strip = { key, wet: wetStrip, top, height, median, labelSide: wetStrip ? 'above' : 'below', medianWord: word, big };
      strips.push(strip);
      return strip;
    };

    const skyX = phone ? 0 : gutter - 14;
    let y = 0;

    if (view === 'together') {
      const labelRow = phone ? 22 : 0;
      const medianRow = phone ? 34 : 42;
      // the sky: lane name (phone), the wet median's figure, the wet strip
      const skyTop = y;
      y += 10 + labelRow + medianRow;
      const wetStrip = place('wet', wet, y, true, wetMedian, 'typical wet day', true);
      y += wetStrip.height + 15;
      /* Name each series under its wet days, at its own middle race, nudged apart so none touch. */
      const charW = 6.6;
      let lastRight = -Infinity;
      series
        .filter((group) => group.wetRows.length > 0)
        .map((group) => {
          const sorted = [...group.wetRows].sort((a, b) => a.percentile - b.percentile);
          return { group, cx: x(sorted[Math.floor(sorted.length / 2)].percentile) };
        })
        .sort((a, b) => a.cx - b.cx)
        .forEach(({ group, cx }) => {
          const w = group.short.length * charW;
          const tick = x(wetMedian / 100);
          let left = Math.max(cx - w / 2, lastRight + 10, plotL - r);
          left = Math.min(left, width - 4 - w);
          // keep clear of the median tick: whole label on whichever side has room
          if (left < tick + 8 && left + w > tick - 8) left = tick + 8 + w <= width - 4 ? tick + 8 : tick - 8 - w;
          lastRight = left + w;
          tags.push({ key: group.name, x: left + w / 2, y: wetStrip.top + wetStrip.height + 6, text: group.short, tint: group.tint });
        });
      skies.push({ key: 'sky', x: skyX, y: skyTop, w: width - skyX, h: y - skyTop });
      labels.push({
        key: 'wet-name',
        x: phone ? 10 : 0,
        y: phone ? skyTop + 10 : wetStrip.top + wetStrip.height / 2 - 14,
        glyph: 'rain',
        lines: phone
          ? [{ text: `Wet, damp or drying · ${wet.length} races`, tone: 'ink', weight: 600 }]
          : [
              { text: 'Wet, damp or drying', tone: 'ink', weight: 600 },
              { text: `${wet.length} races`, tone: 'muted' }
            ]
      });
      y += 26; // the step between the two medians lives here
      const dryStrip = place('dry', dry, y, false, dryMedian, 'typical dry day', true);
      labels.push({
        key: 'dry-name',
        x: phone ? 10 : 0,
        y: phone ? dryStrip.top - 20 : dryStrip.top + dryStrip.height / 2 - 14,
        glyph: 'sun',
        lines: phone
          ? [{ text: `Dry · ${dry.length} races`, tone: 'ink', weight: 600 }]
          : [
              { text: 'Dry', tone: 'ink', weight: 600 },
              { text: `${dry.length} races`, tone: 'muted' }
            ]
      });
      y += dryStrip.height + medianRow + 4;
      steps.push({ wet: wetStrip, dry: dryStrip });
    } else {
      series.forEach((group, index) => {
        const nameRow = phone ? 22 : 0;
        const medianRow = 26;
        const blockTop = y;
        y += nameRow;
        const counts =
          group.wetRows.length > 0
            ? `${group.wetRows.length} wet · ${group.dryRows.length} dry`
            : `${group.dryRows.length} dry · no wet days`;
        let wetStrip: Strip | null = null;
        if (group.wetRows.length > 0) {
          const skyTop = y;
          y += medianRow + 5;
          wetStrip = place(`wet-${group.name}`, group.wetRows, y, true, group.wetMedian, 'wet', false);
          y += wetStrip.height + 2;
          skies.push({ key: `sky-${group.name}`, x: skyX, y: skyTop + 2, w: width - skyX, h: y - skyTop - 2 });
          y += 12;
        }
        let dryStrip: Strip | null = null;
        if (group.dryRows.length > 0) {
          dryStrip = place(`dry-${group.name}`, group.dryRows, y, false, group.dryMedian, 'dry', false);
          y += dryStrip.height + (group.dryMedian !== null ? medianRow : 4);
        }
        if (wetStrip && dryStrip) steps.push({ wet: wetStrip, dry: dryStrip });
        const bodyTop = blockTop + nameRow;
        labels.push({
          key: `name-${group.name}`,
          x: 0,
          y: phone ? blockTop + 2 : bodyTop + (y - bodyTop) / 2 - 14,
          lines: phone
            ? [
                { text: `${group.short}   `, tone: 'tint', tint: group.tint, weight: 650 },
                { text: counts, tone: 'muted' }
              ]
            : [
                { text: group.short, tone: 'tint', tint: group.tint, weight: 650 },
                { text: counts, tone: 'muted' }
              ]
        });
        y += index < series.length - 1 ? (phone ? 14 : 16) : 0;
      });
      y += phone ? 8 : 10;
    }

    const axisY = y + 4;
    return { height: axisY + (phone ? 40 : 30), strips, labels, steps, skies, tags, pos, axisY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enough, width, view, phone, r, gutter, wet, dry, series, wetMedian, dryMedian, keyOf]);

  if (!enough) return null;

  const conditionWord = (row: CareerRow) => (row.wetDry === 'dry' ? 'dry' : row.wetDry ?? '');
  const tipOf = (row: CareerRow, at: { x: number; y: number }): ChartTip => ({
    x: at.x,
    y: at.y - r - 3,
    over: at.y - r - 3,
    under: at.y + r + 4,
    title: row.raceLabel,
    detail: [
      conditionWord(row),
      row.seasonYear !== null && !row.raceLabel.includes(String(row.seasonYear)) ? `${row.seasonYear} ${row.seriesShort}` : row.seriesShort,
      row.start !== null ? `P${row.start} → P${row.finish}` : `finished P${row.finish}`,
      row.status !== 'running' ? row.status : null,
      `beat ${Math.round(row.percentile * 100)}% of the field`
    ]
      .filter(Boolean)
      .join(' · '),
    action: 'open the race page'
  });

  const find = (event: MouseEvent<Element>): string | null => {
    const svg = svgRef.current;
    if (!svg || !layout || phase === 'pre') return null;
    const box = svg.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    let best: string | null = null;
    let bestD = (phone ? 20 : 13) ** 2;
    layout.pos.forEach((p, key) => {
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
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

  /* The sentence: what the gap is, honestly. Every claim in it is checked against the strips. */
  const strongest = [...series]
    .filter((group) => group.dryMedian !== null)
    .sort((a, b) => (b.dryMedian ?? 0) - (a.dryMedian ?? 0))[0];
  const mostWet = [...series].sort((a, b) => b.wetRows.length - a.wetRows.length)[0];
  const compared = series.filter((group) => group.wetMedian !== null && group.dryMedian !== null);
  const rainNeverLifted = compared.length > 0 && compared.every((group) => (group.wetMedian ?? 0) <= (group.dryMedian ?? 0));
  const lede =
    wetMedian > dryMedian && rainNeverLifted && mostWet ? (
      <>
        {mostWet.wetRows.length} of the {wet.length} wet days came in {mostWet.short}
        {strongest && strongest.name === mostWet.name ? ', his strongest series' : ''}, which lifts the wet number. Within each series,
        his wet days sit <strong>at or below his dry ones</strong>.
      </>
    ) : wetMedian > dryMedian ? (
      <>
        When the sky got involved, his typical day got <strong>better</strong>.
      </>
    ) : (
      <>
        His typical dry day beat <strong>{dryMedian}%</strong> of the field; wet or mixed days sit at <strong>{wetMedian}%</strong>.
      </>
    );

  const smallWet = series.filter((group) => group.wetRows.length > 0 && group.wetRows.length < 6);
  const sources = (
    <SourcePill
      title="Rain days"
      entries={[
        {
          label: 'Per-session condition reports',
          path: 'analysis/context-event-narrative-layer/output/weather_condition_context.csv',
          note: `Official series weather lines plus labeled modeled observations, joined by session. ${reported.length} of ${rows.length} career races carry a sourced report (${dry.length} dry; ${wet.length} wet, damp or drying); the other ${rows.length - reported.length} stay out of both lanes.`
        },
        {
          label: 'Career result conversion · finishing percentile',
          path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
          note: `Each dot is one race, placed by the share of the field he beat. A lane's median is its middle race (the upper middle for an even count), rounded to a whole percent. Split by series, a strip draws its median only with ${MIN_FOR_MEDIAN} or more races${
            smallWet.length
              ? `; ${smallWet.map((group) => `${group.short} has ${group.wetRows.length} wet ${group.wetRows.length === 1 ? 'day' : 'days'}`).join(', ')}, so those medians are a reading, not a rating`
              : ''
          }.`
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

  const showDecor = phase === 'done';
  const axisTicks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <DeepDive
      className="rain"
      figure={figure}
      unit="of the field beaten on a typical wet day, against a dry one"
      lede={lede}
      sources={sources}
      controls={
        <Segmented<View>
          options={[
            { value: 'together', label: `All ${reported.length} races` },
            { value: 'series', label: 'By series' }
          ]}
          value={view}
          onChange={(next) => {
            clear();
            setView(next);
          }}
        />
      }
      foot={
        <>
          ○ a day that ended early · <PointerOpen what="any dot" then="to open its race" />
        </>
      }
    >
      <div ref={viewRef}>
        <div ref={ref} className="rain__stage">
          {layout ? (
            <svg
              ref={svgRef}
              width={width}
              className="rain__svg"
              style={{ height: layout.height, transition: phase === 'done' && !reduced ? 'height 720ms cubic-bezier(0.65, 0, 0.35, 1)' : 'none' }}
              role="img"
              aria-label={`Finishing percentile on ${dry.length} dry and ${wet.length} wet, damp or drying days. Typical wet day beat ${wetMedian}% of the field, typical dry day ${dryMedian}%.`}
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
                <linearGradient id="rain-sky" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" className="rain__sky-top" />
                  <stop offset="1" className="rain__sky-bottom" />
                </linearGradient>
                <pattern id="rain-streaks" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(14)">
                  <line x1="6" y1="2" x2="6" y2="9" className="rain__streak" />
                  <line x1="17" y1="12" x2="17" y2="18" className="rain__streak" />
                </pattern>
              </defs>

              {/* the wet sky */}
              {layout.skies.map((sky) => (
                <g key={`${view}-${sky.key}`} className="rain__fade-in">
                  <rect x={sky.x} y={sky.y} width={sky.w} height={sky.h} rx={10} fill="url(#rain-sky)" />
                  <rect x={sky.x} y={sky.y} width={sky.w} height={sky.h} rx={10} fill="url(#rain-streaks)" />
                </g>
              ))}

              {/* quarter gridlines and the axis */}
              {axisTicks.map((t) => (
                <g key={t}>
                  <line
                    x1={x(t)}
                    x2={x(t)}
                    y1={0}
                    y2={layout.axisY}
                    stroke="var(--grid-hairline)"
                    strokeWidth={1}
                    strokeDasharray={t === 0 || t === 1 ? undefined : '2 4'}
                  />
                  <text
                    x={x(t)}
                    y={layout.axisY + 16}
                    textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'}
                    className="rain__tick"
                    fontFamily={chartFont}
                  >
                    {Math.round(t * 100)}%
                  </text>
                </g>
              ))}
              <line x1={plotL - r} x2={plotR + r} y1={layout.axisY} y2={layout.axisY} stroke="var(--axis-baseline)" strokeWidth={1} />
              <text
                x={phone ? x(0.5) : gutter - 14}
                y={layout.axisY + (phone ? 34 : 16)}
                textAnchor={phone ? 'middle' : 'end'}
                className="rain__axis-title"
                fontFamily={chartFont}
              >
                {phone ? 'share of the field he beat →' : 'field beaten →'}
              </text>

              {/* lane and series names, in place */}
              {layout.labels.map((label) => {
                const tx = label.x + (label.glyph ? 21 : 0);
                return (
                  <g key={`${view}-${label.key}`} className="rain__fade-in rain__label">
                    {label.glyph === 'rain' ? (
                      <g className="rain__glyph">
                        <RainGlyph x={label.x} y={label.y} />
                      </g>
                    ) : null}
                    {label.glyph === 'sun' ? (
                      <g className="rain__glyph">
                        <SunGlyph x={label.x} y={label.y} />
                      </g>
                    ) : null}
                    <text x={tx} y={label.y + 12} fontFamily={chartFont}>
                      {label.lines.map((line, i) => (
                        <tspan
                          key={i}
                          x={phone || i === 0 ? undefined : tx}
                          dy={phone || i === 0 ? undefined : 18}
                          className={`rain__name rain__name--${line.tone}`}
                          fill={line.tone === 'tint' ? line.tint : undefined}
                          fontWeight={line.weight}
                        >
                          {line.text}
                        </tspan>
                      ))}
                    </text>
                  </g>
                );
              })}

              {/* the step from the dry median to the wet one */}
              {layout.steps.map(({ wet: w, dry: d }) =>
                w.median !== null && d.median !== null ? (
                  <g key={`${view}-step-${w.key}`} className="rain__fade-in rain__fade-in--late">
                  <path
                    className={`rain__step${showDecor ? ' rain__step--on' : ''}`}
                    d={`M${x(d.median / 100)} ${d.top + 1} L${x(w.median / 100)} ${w.top + w.height - 1}`}
                    pathLength={1}
                  />
                  </g>
                ) : null
              )}

              {/* which series those wet days were */}
              {layout.tags.map((tag) => (
                <text
                  key={`${view}-tag-${tag.key}`}
                  x={tag.x}
                  y={tag.y}
                  textAnchor="middle"
                  fontFamily={chartFont}
                  className="rain__fade-in rain__fade-in--late rain__tag"
                  fill={`color-mix(in srgb, ${tag.tint} 72%, var(--ink))`}
                >
                  {tag.text}
                </text>
              ))}

              {/* median ticks sit under the dots; their figures are drawn after */}
              {layout.strips.map((strip) => {
                if (strip.median === null) return null;
                const mx = x(strip.median / 100);
                const tickTop = strip.top - (strip.labelSide === 'above' ? 7 : 1);
                const tickBottom = strip.top + strip.height + (strip.labelSide === 'below' ? 7 : 1);
                return (
                  <g key={`${view}-tick-${strip.key}`} className={`rain__median${showDecor ? ' rain__median--on' : ''}`}>
                    <g className="rain__fade-in rain__fade-in--late">
                      <line x1={mx} x2={mx} y1={tickTop} y2={tickBottom} stroke="var(--ink)" strokeWidth={2.2} strokeLinecap="round" />
                    </g>
                  </g>
                );
              })}

              {/* every race, a dot */}
              {keyed.map(({ row, key }, index) => {
                const p = layout.pos.get(key);
                if (!p) return null;
                const running = row.status === 'running';
                const tint = chapterTint(row.seriesName);
                const isHover = hovered === key;
                const start = phase === 'pre';
                const delay = delayFor(index);
                const fall = Math.round(300 + 26 * Math.sqrt(p.y + 14));
                const transition =
                  phase === 'fall'
                    ? `transform ${fall}ms cubic-bezier(0.5, 0, 0.9, 0.55) ${delay}ms, opacity 120ms linear ${delay}ms`
                    : phase === 'done' && !reduced
                      ? `transform 720ms cubic-bezier(0.65, 0, 0.35, 1) ${Math.round(delay / 6)}ms`
                      : 'none';
                return (
                  <g
                    key={key}
                    style={{
                      transform: `translate(${p.x}px, ${start ? -14 : p.y}px)`,
                      opacity: start ? 0 : 1,
                      transition
                    }}
                  >
                    {isHover ? <circle r={r + 4} fill="none" stroke="var(--ink)" strokeWidth={1.4} /> : null}
                    <circle
                      r={isHover ? r + 1 : r}
                      fill={running ? tint : 'var(--paper)'}
                      fillOpacity={running ? 0.86 : 1}
                      stroke={running ? 'var(--paper)' : tint}
                      strokeWidth={running ? 0.9 : 1.6}
                    />
                  </g>
                );
              })}

              {/* medians: a tick through the strip and the figure at its end */}
              {layout.strips.map((strip) => {
                if (strip.median === null) return null;
                const mx = x(strip.median / 100);
                const tickTop = strip.top - (strip.labelSide === 'above' ? 7 : 1);
                const tickBottom = strip.top + strip.height + (strip.labelSide === 'below' ? 7 : 1);
                const numSize = strip.big ? (phone ? 24 : 30) : 14;
                const wordSize = strip.big ? (phone ? 12.5 : 13.5) : 12;
                const ly = strip.labelSide === 'above' ? tickTop - 6 : tickBottom + (strip.big ? numSize * 0.82 + 4 : 14);
                const room = plotR + r - mx;
                const needs = strip.big ? (phone ? 160 : 200) : 64;
                const leftward = room < needs;
                return (
                  <g key={`${view}-med-${strip.key}`} className={`rain__median${showDecor ? ' rain__median--on' : ''}`}>
                    <g className="rain__fade-in rain__fade-in--late">
                    <text x={leftward ? mx - 8 : mx + 8} y={ly} textAnchor={leftward ? 'end' : 'start'} fontFamily={chartFont}>
                      <tspan className="rain__med-num" fontSize={numSize}>
                        {strip.median}%
                      </tspan>
                      <tspan className="rain__med-word" fontSize={wordSize} dx={6}>
                        {strip.medianWord}
                      </tspan>
                    </text>
                    </g>
                  </g>
                );
              })}
            </svg>
          ) : null}
          {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
        </div>
      </div>
    </DeepDive>
  );
};
