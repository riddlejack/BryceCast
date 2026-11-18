import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackOutline } from '../assets/tracks';
import { measuredTrackSectionsFor, trackSectionsFor, type TrackSectionAnchor } from '../assets/tracks/sections';
import { loadSectionLaps, sectionLapVisitsFor, type SectionLapsPack } from '../data/sectionLaps';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { isNeutralisedFlag } from '../data/replayStart';
import { periodAt, type ReplayTimeline } from '../data/replayTimeline';
import type { TrackOverlayView } from '../three/TrackModel3D';
import {
  anchorSetForPack,
  buildSectionLightPlan,
  isNamedSectionLabel,
  outlineGeometry,
  parseOutlinePoints,
  sectionDisplayName,
  type SectionLightPlan
} from './liveSectionLight';
import {
  BASE_TRUST_MS,
  buildPaceModel,
  chainGeometry,
  distanceAhead,
  estimateBases,
  placeBryce,
  sectionOfShare,
  startPrior,
  tightenBases,
  tOfDistance,
  tOfSection,
  type BaseBounds,
  type BaseEstimate,
  type ChainGeometry,
  type LapSample,
  type PaceModel,
  type RaceClockModel
} from './liveMarker';
import type { FieldCar, FieldMode } from './liveField';
import { readingWords, type BryceMove } from '../data/overtakeModel';

/* ============================================================
   The live page's track: the circuit drawn large and, in a
   replay, Bryce's No. 9 moving round it with the section he is
   in filling amber behind him, and the cars around him placed by
   their gap (round 7). Timing measures only the moments a car
   crosses a loop: everything between is placed by time, never
   GPS, and the page says so.
   ============================================================ */

type Pt = { x: number; y: number };

/** Width of the element, tracked through resizes (mount-safe). */
const useElementWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    setWidth(node.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) > 0.5 ? next : previous));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

const useViewportHeight = () => {
  const [height, setHeight] = useState(() => (typeof window === 'undefined' ? 900 : window.innerHeight));
  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return height;
};

/* ---------- the race, placed on the replay clock ---------- */

export type RaceTrackStatus =
  | 'live'            // a live session: the feed carries no section times
  | 'loading'         // the race's section times are loading
  | 'no_sections'     // no usable section times for this race
  | 'waiting_line'    // usable, but nothing yet pins his first line crossing
  | 'placed';         // the clock can place him

export interface ReplayRace {
  status: RaceTrackStatus;
  plan: SectionLightPlan | null;
  geometry: ChainGeometry | null;
  model: RaceClockModel | null;
  totalLaps: number | null;
  /** What his pace rests on before his first clean lap. */
  paceBasis: PaceModel['fallbackBasis'] | null;
}

/** Reads the replay's virtual clock (epoch ms), or null outside a replay. */
export type VirtualNow = () => number | null;

const median = (values: number[]): number | null => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** His median clean time in each section of the chain, from another race's
 *  pack at the same venue (null where it does not carry that section). */
const venueSectionTimes = (pack: SectionLapsPack, chain: TrackSectionAnchor[]): Array<number | null> => {
  const byName = new Map(pack.sections.map((section) => [section.sectionName, section]));
  return chain.map((anchor) => {
    const section = byName.get(anchor.sectionName);
    if (!section) return null;
    return median(section.laps.flatMap((tuple) => (tuple[4] === 1 && tuple[6] !== null ? [tuple[6]] : [])));
  });
};

/** One frame's answer to "how many laps has Bryce completed". */
const bryceLapsOf = (sample: LiveSessionHistory['samples'][number]): number | null => {
  const bryce = sample.rows.find((row) => (row as Record<string, unknown>).bryce === true) ?? null;
  if (!bryce) return null;
  const raw = (bryce as Record<string, unknown>).laps;
  const value = Number(raw);
  return Number.isFinite(value) && String(raw ?? '').trim() !== '' ? value : null;
};

/**
 * Everything the replay's track and race bar need to place Bryce on the
 * clock: the race's section chain, his expected pace, and the line crossings
 * that anchor his laps, read off every frame the page has seen (its polls,
 * its history seed, the race timeline). liveMarker.ts does the placing.
 */
export const useReplayRace = ({
  sessionId,
  outline,
  history,
  timeline,
  greenAt,
  startPosition,
  flag
}: {
  /** The canonical race id of the replay; null on a live page. */
  sessionId: string | null;
  outline: TrackOutline | null;
  history: LiveSessionHistory | null;
  timeline: ReplayTimeline | null;
  /** The archive's green flag (not clamped to the capture's first frame). */
  greenAt: string | null;
  startPosition: number | null;
  /** The flag on the page now: the fallback for "neutralised" without a timeline. */
  flag: string | null;
}): ReplayRace => {
  const [pack, setPack] = useState<{ sessionId: string; pack: SectionLapsPack | null } | null>(null);
  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;
    loadSectionLaps(sessionId)
      .then((loaded) => {
        if (!cancelled) setPack({ sessionId, pack: loaded });
      })
      .catch(() => {
        if (!cancelled) setPack({ sessionId, pack: null });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const currentPack = pack && pack.sessionId === sessionId ? pack.pack : null;
  const plan = useMemo(() => {
    if (!currentPack) return null;
    const set = anchorSetForPack(currentPack, [
      currentPack.sourceTier === 'lake_loop_crossings' ? measuredTrackSectionsFor(currentPack.venueName) : null,
      trackSectionsFor(currentPack.venueName),
      measuredTrackSectionsFor(currentPack.venueName)
    ]);
    return buildSectionLightPlan(currentPack, set, outline);
  }, [currentPack, outline]);
  const geometry = useMemo(() => (plan?.usable ? chainGeometry(plan.chain) : null), [plan]);

  // His history at the venue: the latest earlier race here whose sections join.
  const [venue, setVenue] = useState<{ sessionId: string; times: Array<number | null> | null } | null>(null);
  useEffect(() => {
    if (!currentPack || !plan?.usable || !sessionId) return undefined;
    let cancelled = false;
    const visits = sectionLapVisitsFor(currentPack.venueName);
    const here = visits.findIndex((ref) => ref.sessionId === sessionId);
    const earlier = (here >= 0 ? visits.slice(0, here) : visits.filter((ref) => ref.sessionId !== sessionId)).reverse().slice(0, 2);
    void (async () => {
      for (const ref of earlier) {
        const other = await loadSectionLaps(ref.sessionId).catch(() => null);
        if (cancelled) return;
        const times = other ? venueSectionTimes(other, plan.chain) : null;
        if (times && times.every((value) => value !== null)) {
          setVenue({ sessionId, times });
          return;
        }
      }
      if (!cancelled) setVenue({ sessionId, times: null });
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPack, plan, sessionId]);

  const pace = useMemo(() => {
    if (!plan?.usable || !currentPack) return null;
    const byName = new Map(currentPack.sections.map((section) => [section.sectionName, section]));
    const field = plan.chain.map((anchor) => median(byName.get(anchor.sectionName)?.fieldSeconds ?? []));
    const laps = [...plan.laps.values()].map((lap) => ({ lap: lap.lap, lapSeconds: lap.lapSeconds, sectionSeconds: lap.sectionSeconds, clean: lap.clean }));
    return buildPaceModel(laps, plan.chain.length, { venue: venue?.sessionId === sessionId ? venue.times : null, field });
  }, [plan, currentPack, venue, sessionId]);

  // The bounds on each lap segment's line crossing outlive the history window
  // (which trims to minutes) and every seek: they are facts about the race.
  const kept = useRef<{ sessionId: string | null; bounds: Map<number, BaseBounds> }>({ sessionId: null, bounds: new Map() });
  if (kept.current.sessionId !== sessionId) kept.current = { sessionId, bounds: new Map() };
  const [boundsVersion, setBoundsVersion] = useState(0);
  useEffect(() => {
    if (!plan?.usable) return;
    const samples: LapSample[] = [];
    for (const sample of history?.samples ?? []) {
      const laps = bryceLapsOf(sample);
      // A frame this client polled is a whole frame; a seeded or caught-up one
      // comes from the server's breakpoints, whose lap count can be stale.
      if (laps !== null) samples.push({ atMs: sample.checkedAtMs, laps, upperOnly: sample.expectedCadenceMs === undefined });
    }
    for (const frame of timeline?.frames ?? []) {
      if (frame.bryceLaps !== null) samples.push({ atMs: frame.atMs, laps: frame.bryceLaps, upperOnly: true });
    }
    if (tightenBases(plan, kept.current.bounds, samples)) setBoundsVersion((value) => value + 1);
  }, [history, timeline, plan]);

  const greenMs = greenAt ? Date.parse(greenAt) : NaN;
  const bases = useMemo(() => {
    if (!plan?.usable) return new Map<number, BaseEstimate>();
    const priors = new Map<number, number>();
    const prior = startPrior(Number.isFinite(greenMs) ? greenMs : null, startPosition);
    const firstSegment = plan.segmentOf.get(1);
    if (prior !== null && firstSegment !== undefined) priors.set(firstSegment, prior);
    const out = new Map<number, BaseEstimate>();
    for (const [segment, estimate] of estimateBases(kept.current.bounds, priors)) {
      if (estimate.fromPrior || estimate.spreadMs <= BASE_TRUST_MS) out.set(segment, estimate);
    }
    return out;
    // boundsVersion says the kept bounds moved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, boundsVersion, greenMs, startPosition]);

  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;
  const flagRef = useRef(flag);
  flagRef.current = flag;
  const neutralisedAt = useCallback((atMs: number) => {
    const known = timelineRef.current;
    if (known && known.periods.length + known.frames.length > 0) return periodAt(known, atMs) !== null;
    return isNeutralisedFlag(flagRef.current);
  }, []);

  const model = useMemo<RaceClockModel | null>(
    () => (plan?.usable && geometry && pace && bases.size > 0 ? { geometry, plan, bases, pace, neutralisedAt, greenMs: Number.isFinite(greenMs) ? greenMs : null } : null),
    [plan, geometry, pace, bases, neutralisedAt, greenMs]
  );

  const totalLaps = currentPack?.totalLaps ?? null;
  const paceBasis = pace?.fallbackBasis ?? null;
  if (!sessionId) return { status: 'live', plan: null, geometry: null, model: null, totalLaps: null, paceBasis: null };
  if (!pack || pack.sessionId !== sessionId) return { status: 'loading', plan: null, geometry: null, model: null, totalLaps: null, paceBasis: null };
  if (!plan?.usable) return { status: 'no_sections', plan, geometry: null, model: null, totalLaps, paceBasis: null };
  if (!model) return { status: 'waiting_line', plan, geometry, model: null, totalLaps, paceBasis };
  return { status: 'placed', plan, geometry, model, totalLaps, paceBasis };
};

/* ---------- drawing ---------- */

interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PlacedLabel extends LabelBox {
  text: string;
  anchor: 'start' | 'middle' | 'end';
  tx: number;
  ty: number;
}

const boxesOverlap = (a: LabelBox, b: LabelBox, pad = 4) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

const pointInPolygon = (p: Pt, polygon: Pt[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-9) + a.x) inside = !inside;
  }
  return inside;
};

const spanLength = (start: number, end: number) => (end >= start ? end - start : 1 - start + end);
const spanMid = (start: number, end: number) => (start + spanLength(start, end) / 2) % 1;

/** Approximate text width: Schibsted Grotesk runs about 0.53 em a glyph. */
const textWidth = (text: string, size: number) => text.length * size * 0.54;

export interface LiveTrackProps {
  outline: TrackOutline;
  /** The race's timing sections in driving order from the line, or null to
   *  draw the plain circuit. */
  chain: TrackSectionAnchor[] | null;
  /** The section Bryce is in (its name is drawn large); null for none. */
  lit: { index: number; lap: number } | null;
  /** Upper bound on the drawing's height, in px. */
  maxHeight?: number;
  /** Reserve side room for section labels even before the sections load. */
  labelRoom?: boolean;
  ariaLabel: string;
  /** Drawn over the circuit (the car dots), as the 3D model draws it. */
  overlay?: (view: TrackOverlayView) => ReactNode;
}

export const LiveTrack = ({ outline, chain, lit, maxHeight, ariaLabel, labelRoom = false, overlay }: LiveTrackProps) => {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const viewportHeight = useViewportHeight();
  const geometry = useMemo(() => outlineGeometry(outline.mainPath), [outline.mainPath]);
  const sfT = useMemo(() => (outline.startFinish ? geometry.tOfPoint(outline.startFinish) : null), [geometry, outline.startFinish]);

  const layout = useMemo(() => {
    if (width <= 0) return null;
    const [, , vw, vh] = outline.viewBox.split(' ').map(Number);
    const compact = width < 560;
    // Room for section names only where sections can be named or lit (a
    // replay); live, the circuit takes the width and the start/finish label
    // finds its own room. Decided up front so the drawing does not jump when
    // the section times arrive.
    const named = !compact && (labelRoom || (chain?.length ?? 0) > 0);
    const marginX = compact
      ? 10
      : named
        ? Math.round(Math.min(130, Math.max(64, width * 0.1)))
        : Math.round(Math.min(60, Math.max(28, width * 0.05)));
    const marginY = compact ? 30 : 44;
    const heightCap = Math.max(240, Math.min(maxHeight ?? 940, viewportHeight * (compact ? 0.55 : 0.78)));
    const scale = Math.min((width - marginX * 2) / vw, (heightCap - marginY * 2) / vh);
    const tw = vw * scale;
    const th = vh * scale;
    const svgHeight = Math.round(th + marginY * 2);
    const ox = (width - tw) / 2;
    const oy = marginY;
    const toPx = (p: Pt): Pt => ({ x: ox + p.x * scale, y: oy + p.y * scale });
    const at = (t: number) => toPx(geometry.pointAtT(t));
    const stroke = compact ? 7 : Math.round(Math.min(13, Math.max(8, width / 95)));
    const litStroke = stroke + (compact ? 3 : 4);

    const SAMPLES = 720;
    const samples = Array.from({ length: SAMPLES }, (_, index) => at(index / SAMPLES));
    const polyline = (start: number, end: number) => {
      const length = spanLength(start, end);
      const steps = Math.max(2, Math.round(length * 900));
      let d = '';
      for (let i = 0; i <= steps; i += 1) {
        const p = at((start + (length * i) / steps) % 1);
        d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
      }
      return d.trim();
    };
    const fullPath = `${samples.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} Z`;
    const pitPath = outline.pitPath
      ? parseOutlinePoints(outline.pitPath)
          .map(toPx)
          .map((p, index) => `${index === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(' ')
      : null;

    /** Unit normal at t pointing out of the circuit's enclosed shape. */
    const outward = (t: number): { p: Pt; n: Pt; tan: Pt } => {
      const p = at(t);
      const a = at(t - 0.003);
      const b = at(t + 0.003);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const tan = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      let n = { x: -tan.y, y: tan.x };
      if (pointInPolygon({ x: p.x + n.x * 10, y: p.y + n.y * 10 }, samples)) n = { x: -n.x, y: -n.y };
      return { p, n, tan };
    };

    const clearOfTrack = (box: LabelBox) => {
      const pad = stroke / 2 + 4;
      for (const s of samples) {
        if (s.x > box.x - pad && s.x < box.x + box.w + pad && s.y > box.y - pad && s.y < box.y + box.h + pad) return false;
      }
      return true;
    };
    const inBounds = (box: LabelBox) => box.x >= 2 && box.y >= 2 && box.x + box.w <= width - 2 && box.y + box.h <= svgHeight - 2;

    /** Place a label outside the line at t, stepping outward until it clears
     *  the circuit and every label already placed. */
    const place = (t: number, text: string, size: number, placed: LabelBox[], force = false): PlacedLabel | null => {
      const { p, n } = outward(t);
      const w = textWidth(text, size);
      const h = size * 1.25;
      const anchor: PlacedLabel['anchor'] = n.x > 0.38 ? 'start' : n.x < -0.38 ? 'end' : 'middle';
      let fallback: PlacedLabel | null = null;
      for (let d = stroke / 2 + 7; d <= stroke / 2 + 64; d += 5) {
        const q = { x: p.x + n.x * d, y: p.y + n.y * d };
        const x = anchor === 'start' ? q.x : anchor === 'end' ? q.x - w : q.x - w / 2;
        const y = n.y > 0.38 ? q.y : n.y < -0.38 ? q.y - h : q.y - h / 2;
        const label: PlacedLabel = { x, y, w, h, text, anchor, tx: q.x, ty: y + h * 0.78 };
        if (!fallback) fallback = label;
        if (inBounds(label) && clearOfTrack(label) && placed.every((other) => !boxesOverlap(label, other))) return label;
      }
      if (!force || !fallback) return null;
      // A forced label stays readable: pull it back inside the drawing.
      const dx = Math.max(2 - fallback.x, Math.min(0, width - 2 - (fallback.x + fallback.w)));
      const dy = Math.max(2 - fallback.y, Math.min(0, svgHeight - 2 - (fallback.y + fallback.h)));
      return { ...fallback, x: fallback.x + dx, y: fallback.y + dy, tx: fallback.tx + dx, ty: fallback.ty + dy };
    };

    const quietSize = compact ? 12 : 12.5;
    const litSize = compact ? 13.5 : 15;
    const placed: LabelBox[] = [];
    const sfLabel = sfT !== null ? place(sfT, 'Start / finish', quietSize, placed) : null;
    if (sfLabel) placed.push(sfLabel);
    const quiet: Array<{ familyId: string; label: PlacedLabel } | null> = (chain ?? []).map((anchor) => {
      if (compact || !isNamedSectionLabel(anchor.label)) return null;
      const label = place(spanMid(anchor.startT, anchor.endT), anchor.label, quietSize, placed);
      if (!label) return null;
      placed.push(label);
      return { familyId: anchor.familyId, label };
    });
    // Each section's lit label slot, clear of the circuit and the line's label
    // (quiet labels under it are hidden while it shows).
    const litSlots = (chain ?? []).map((anchor, index, list) =>
      place(spanMid(anchor.startT, anchor.endT), sectionDisplayName(anchor, index, list.length), litSize, sfLabel ? [sfLabel] : [], true)
    );
    const sections = (chain ?? []).map((anchor) => ({ familyId: anchor.familyId, d: polyline(anchor.startT, anchor.endT) }));
    const loopTicks = (chain ?? [])
      .filter((anchor) => sfT === null || Math.abs(anchor.startT - sfT) > 0.002)
      .map((anchor) => {
        const { p, n } = outward(anchor.startT);
        const half = stroke / 2 + 0.5;
        return { x1: p.x - n.x * half, y1: p.y - n.y * half, x2: p.x + n.x * half, y2: p.y + n.y * half };
      });
    const sfTick = sfT !== null
      ? (() => {
          const { p, n } = outward(sfT);
          const half = stroke * 1.25;
          return { x1: p.x - n.x * half, y1: p.y - n.y * half, x2: p.x + n.x * half, y2: p.y + n.y * half };
        })()
      : null;
    // Which way the cars run: a small chevron just past the line. The chain
    // runs in increasing t, which is driving order on every curated venue.
    const chevron = sfT !== null
      ? (() => {
          const { p, tan } = outward(sfT + 0.035);
          const s = stroke * 0.42;
          const nx = -tan.y;
          const ny = tan.x;
          const tip = { x: p.x + tan.x * s, y: p.y + tan.y * s };
          const a = { x: p.x - tan.x * s + nx * s, y: p.y - tan.y * s + ny * s };
          const b = { x: p.x - tan.x * s - nx * s, y: p.y - tan.y * s - ny * s };
          return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} L${tip.x.toFixed(1)} ${tip.y.toFixed(1)} L${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
        })()
      : null;
    // For an overlay: a point of the circuit, `lat` px across the line.
    const project = (t: number, lat = 0): [number, number] => {
      const p = at(t);
      if (!lat) return [p.x, p.y];
      const a = at(t - 0.002);
      const b = at(t + 0.002);
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return [p.x - ((b.y - a.y) / len) * lat, p.y + ((b.x - a.x) / len) * lat];
    };
    return { compact, quietSize, litSize, svgHeight, stroke, litStroke, fullPath, pitPath, sections, quiet, litSlots, sfLabel, loopTicks, sfTick, chevron, project };
  }, [width, outline, geometry, sfT, chain, maxHeight, viewportHeight, labelRoom]);

  const litSlot = lit && layout ? layout.litSlots[lit.index] ?? null : null;
  const litFamily = lit ? chain?.[lit.index]?.familyId ?? null : null;
  return (
    <div ref={ref} className="live-track" data-live-track data-lit-section={litFamily ?? ''} data-lit-lap={lit?.lap ?? ''}>
      {layout ? (
        <svg width={width} height={layout.svgHeight} viewBox={`0 0 ${width} ${layout.svgHeight}`} role="img" aria-label={ariaLabel} className="live-track__svg">
          {layout.pitPath ? <path d={layout.pitPath} className="live-track__pit" /> : null}
          <path d={layout.fullPath} className="live-track__base" strokeWidth={layout.stroke} />
          {layout.sections.map((section) => (
            <path
              key={section.familyId}
              d={section.d}
              className="live-track__section"
              strokeWidth={layout.litStroke}
            />
          ))}
          {layout.loopTicks.map((tick, index) => (
            <line key={index} {...tick} className="live-track__loop" />
          ))}
          {layout.chevron ? <path d={layout.chevron} className="live-track__chevron" strokeWidth={Math.max(1.5, layout.stroke * 0.22)} /> : null}
          {layout.sfTick ? <line {...layout.sfTick} className="live-track__sf" /> : null}
          {layout.sfLabel ? (
            <text x={layout.sfLabel.tx} y={layout.sfLabel.ty} textAnchor={layout.sfLabel.anchor} fontSize={layout.quietSize} className="live-track__label">
              {layout.sfLabel.text}
            </text>
          ) : null}
          {layout.quiet.map((entry) =>
            entry && !(litSlot && boxesOverlap(entry.label, litSlot, 2)) && entry.familyId !== litFamily ? (
              <text key={entry.familyId} x={entry.label.tx} y={entry.label.ty} textAnchor={entry.label.anchor} fontSize={layout.quietSize} className="live-track__label">
                {entry.label.text}
              </text>
            ) : null
          )}
          {litSlot ? (
            <text x={litSlot.tx} y={litSlot.ty} textAnchor={litSlot.anchor} fontSize={layout.litSize} className="live-track__label live-track__label--lit">
              {litSlot.text}
            </text>
          ) : null}
        </svg>
      ) : (
        <div style={{ height: 240 }} aria-hidden />
      )}
      {layout && overlay ? (
        <div className="live-track__overlay">
          {overlay({ version: width * 10_000 + layout.svgHeight, project: layout.project, halfWidth: layout.stroke / 2 })}
        </div>
      ) : null}
    </div>
  );
};


/* ---------- Bryce's marker, the fill, the cars around him ---------- */

/** Who a car is, from the timing rows. */
export interface CarLabel {
  no: string;
  surname: string;
  position: number | null;
}

/** Where his marker was last drawn, for the page's caption and the bar. */
export interface MarkerReadout {
  lap: number;
  index: number;
  holding: boolean;
}

/** Wall ms over which a finished section's fill fades out. */
const FADE_WALL_MS = 1_000;
/** Wall ms over which a car eases to a new gap when a frame lands. */
const GAP_EASE_WALL_MS = 700;
/** A drop in his drawn distance smaller than this (laps) is held, never drawn
 *  backwards; a larger one is a jump of the clock (a seek, a restart). */
const BACKWARDS_TOLERANCE_LAPS = 0.25;
const FILL_STEPS = 28;

const PLATE_W = 32;
const PLATE_H = 24;
const PLATE_LIFT = 27;
const CAR_R = 8.5;
/** A pass shows by his plate this long (wall time, any speed), if the clock
 *  reached it within this much race time of playing. */
const PASS_WALL_MS = 4_500;
const PASS_FRESH_MS = 20_000;
/** Two cars nearer than this (px, centre to centre) would overlap their
 *  numbers or their counts: the pile shows one plate, the best placed, with a
 *  quiet "+n" at its shoulder. */
const PILE_PX = 24;
/** Cars this near his foot sit under his stem: they count into his "+n". */
const BRYCE_PILE_PX = 20;

const pathThrough = (points: Array<[number, number] | null>): string => {
  let d = '';
  let open = false;
  for (const point of points) {
    if (!point) {
      open = false;
      continue;
    }
    d += `${open ? 'L' : 'M'}${point[0].toFixed(1)} ${point[1].toFixed(1)} `;
    open = true;
  }
  return d.trim();
};

/** Screen width of the track at t (px), for the fill's stroke. */
const trackWidthAt = (view: TrackOverlayView, t: number): number => {
  const a = view.project(t, -view.halfWidth);
  const b = view.project(t, view.halfWidth);
  return a && b ? Math.max(3, Math.min(40, Math.hypot(b[0] - a[0], b[1] - a[1]))) : 8;
};

const sectionPath = (view: TrackOverlayView, geometry: ChainGeometry, index: number, upTo = 1): string =>
  pathThrough(Array.from({ length: FILL_STEPS + 1 }, (_, step) => view.project(tOfSection(geometry, index, (upTo * step) / FILL_STEPS), 0)));

/**
 * Over the track (the 3D model or the 2D map: `view` says where a point of
 * the track is drawn): Bryce's No. 9 plate raised above the circuit, moving
 * continuously by liveMarker.ts's rule; the amber fill growing from the start
 * of his section to him, fading as he crosses into the next; the cars around
 * him as small ink marks with their numbers, placed by their gap to him. All
 * moved in one animation frame loop, never through React state.
 */
export const TrackMarks = ({
  view,
  race,
  virtualNow,
  clockEpoch,
  cars,
  fieldMode,
  trail,
  bryceLabel,
  highlightId,
  onHoverCar,
  onReadout,
  moves,
  frameMs
}: {
  view: TrackOverlayView;
  race: ReplayRace;
  virtualNow: VirtualNow;
  /** Bumped when the clock jumps: the marker may then move backwards once. */
  clockEpoch: number;
  cars: FieldCar[];
  fieldMode: FieldMode;
  /** `?trail=lap`: the lap's finished sections stay lightly tinted. */
  trail: boolean;
  bryceLabel: CarLabel | null;
  highlightId?: string | null;
  onHoverCar?: (id: string | null) => void;
  onReadout?: (readout: MarkerReadout | null) => void;
  /** His place changes (round 10): each pass shows by his plate for a few
   *  seconds as the clock reaches it, and the other car's mark is ringed. */
  moves?: BryceMove[];
  /** The time of the frame the page shows: the pass appears with it. */
  frameMs?: number;
}) => {
  const movesRef = useRef(moves);
  movesRef.current = moves;
  const frameMsRef = useRef(frameMs);
  frameMsRef.current = frameMs;
  const viewRef = useRef(view);
  viewRef.current = view;
  const raceRef = useRef(race);
  raceRef.current = race;
  const carsRef = useRef(cars);
  carsRef.current = cars;
  const epochRef = useRef(clockEpoch);
  epochRef.current = clockEpoch;
  const trailRef = useRef(trail);
  trailRef.current = trail;
  const readoutRef = useRef(onReadout);
  readoutRef.current = onReadout;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const fillRef = useRef<SVGPathElement | null>(null);
  const fadeRef = useRef<SVGPathElement | null>(null);
  const trailPathRef = useRef<SVGPathElement | null>(null);
  const bryceRef = useRef<SVGGElement | null>(null);
  const bryceMoreRef = useRef<SVGTextElement | null>(null);
  const passRef = useRef<SVGTextElement | null>(null);
  const carRefs = useRef(new Map<string, SVGGElement>());
  const tipRef = useRef<HTMLDivElement | null>(null);
  const tipLineRef = useRef<HTMLSpanElement | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef(hover);
  hoverRef.current = hover;

  useEffect(() => {
    let frame = 0;
    let held: { distance: number; epoch: number } | null = null;
    let last: { lap: number; index: number } | null = null;
    let fade: { lap: number; index: number; startedAt: number } | null = null;
    let finished: number[] = [];
    let lastReadout = '';
    let passSeen: number | null | undefined;
    let pass: { startedAt: number; rivals: string[] } | null = null;
    let ringed: string[] = [];
    const eased = new Map<string, { from: number; to: number; at: number }>();
    const positions = new Map<string, [number, number]>();
    let easedEpoch = epochRef.current;
    let lastEpoch = epochRef.current;
    const setMore = (node: SVGTextElement | null | undefined, count: number) => {
      if (!node) return;
      const text = count > 0 ? `+${count}` : '';
      if (node.textContent !== text) node.textContent = text;
      node.setAttribute('visibility', count > 0 ? 'visible' : 'hidden');
    };

    const hide = (node: Element | null) => node?.setAttribute('visibility', 'hidden');
    const show = (node: Element | null) => node?.setAttribute('visibility', 'visible');

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const current = viewRef.current;
      const model = raceRef.current.model;
      const now = virtualNow();
      const wall = performance.now();
      positions.clear();
      const place = model && now !== null ? placeBryce(model, now) : null;
      if (!model || !place || now === null) {
        hide(bryceRef.current);
        hide(fillRef.current);
        hide(fadeRef.current);
        hide(trailPathRef.current);
        for (const node of carRefs.current.values()) hide(node);
        svgRef.current?.setAttribute('data-marks-bryce', 'none');
        if (lastReadout !== 'none') {
          lastReadout = 'none';
          readoutRef.current?.(null);
        }
        held = null;
        last = null;
        return;
      }
      const geometry = model.geometry;
      let distance = place.distance;
      if (held && held.epoch === epochRef.current && distance < held.distance && held.distance - distance < BACKWARDS_TOLERANCE_LAPS) {
        distance = held.distance;
      }
      held = { distance, epoch: epochRef.current };
      const lap = Math.floor(distance) + 1;
      const at = sectionOfShare(geometry, distance - Math.floor(distance));
      const t = tOfSection(geometry, at.index, at.fraction);

      // A loop crossed: the section just finished fades; a new lap clears the trail.
      // A jump of the clock is not a crossing: nothing fades where he was.
      const jumped = lastEpoch !== epochRef.current;
      lastEpoch = epochRef.current;
      if (jumped) fade = null;
      if (last && !jumped && (last.index !== at.index || last.lap !== lap)) {
        fade = { lap: last.lap, index: last.index, startedAt: wall };
        if (lap !== last.lap) finished = [];
        else if (!finished.includes(last.index)) finished.push(last.index);
      }
      if (!last || Math.abs(last.lap - lap) > 1) finished = [];
      last = { lap, index: at.index };

      const width = trackWidthAt(current, t);
      const fill = fillRef.current;
      if (fill) {
        fill.setAttribute('d', at.fraction > 0.002 ? sectionPath(current, geometry, at.index, at.fraction) : '');
        fill.setAttribute('stroke-width', width.toFixed(1));
        show(fill);
      }
      const fadeNode = fadeRef.current;
      if (fadeNode) {
        const left = fade ? 1 - (wall - fade.startedAt) / FADE_WALL_MS : 0;
        if (fade && left > 0) {
          fadeNode.setAttribute('d', sectionPath(current, geometry, fade.index));
          fadeNode.setAttribute('stroke-width', width.toFixed(1));
          fadeNode.setAttribute('opacity', (0.9 * left).toFixed(3));
          show(fadeNode);
        } else {
          fade = null;
          hide(fadeNode);
        }
      }
      const trailNode = trailPathRef.current;
      if (trailNode) {
        if (trailRef.current && finished.length > 0) {
          trailNode.setAttribute('d', finished.map((index) => sectionPath(current, geometry, index)).join(' '));
          trailNode.setAttribute('stroke-width', width.toFixed(1));
          show(trailNode);
        } else hide(trailNode);
      }

      const point = current.project(t, 0);
      const bryce = bryceRef.current;
      if (bryce && point) {
        bryce.setAttribute('transform', `translate(${point[0].toFixed(1)} ${point[1].toFixed(1)})`);
        show(bryce);
        positions.set('bryce', point);
      } else hide(bryce);
      svgRef.current?.setAttribute('data-marks-bryce', `${lap}:${at.index}:${place.holding ? 'hold' : 'move'}`);

      // A pass, by his plate, as the clock reaches it: only when the clock
      // played into it (a jump past one says nothing), for a few seconds of
      // wall time at any speed. Pit stops and caution reshuffles never show.
      const frameAt = frameMsRef.current;
      const passNow = frameAt !== undefined && Number.isFinite(frameAt) ? Math.min(now, frameAt) : now;
      let newest: number | null = null;
      for (const move of movesRef.current ?? []) {
        if (move.atMs > passNow) break;
        if (move.cause === 'pass') newest = move.atMs;
      }
      if (newest !== passSeen) {
        const first = passSeen === undefined;
        passSeen = newest;
        const reading = newest === null ? [] : (movesRef.current ?? []).filter((move) => move.atMs === newest && move.cause === 'pass');
        const words = readingWords(reading);
        const fresh = !first && !jumped && newest !== null && passNow - newest < PASS_FRESH_MS;
        const node = passRef.current;
        if (words && fresh && node) {
          node.textContent = words.text;
          node.setAttribute('data-tone', words.tone);
          pass = { startedAt: wall, rivals: reading.map((move) => move.rivalId) };
        } else if (!fresh) pass = null;
      }
      if (jumped) pass = null;
      const passOn = pass !== null && wall - pass.startedAt < PASS_WALL_MS;
      if (!passOn) pass = null;
      const passNode = passRef.current;
      if (passNode) {
        passNode.setAttribute('visibility', passOn ? 'visible' : 'hidden');
        // In over a fifth of a second, out over the last six tenths.
        const age = passOn ? wall - pass!.startedAt : 0;
        passNode.setAttribute('opacity', passOn ? Math.min(1, age / 200, (PASS_WALL_MS - age) / 600).toFixed(2) : '0');
      }
      const ring = passOn ? pass!.rivals : [];
      if (ring.join() !== ringed.join()) {
        for (const id of ringed) carRefs.current.get(id)?.removeAttribute('data-passing');
        for (const id of ring) carRefs.current.get(id)?.setAttribute('data-passing', 'true');
        ringed = ring;
      }
      svgRef.current?.setAttribute('data-marks-pass', passOn ? String(passSeen) : 'none');

      // The other cars: their gap to him, eased, turned into distance at his pace.
      // A jump of the clock drops the easing: each car takes its new gap at
      // once, never flying across the track to it.
      if (easedEpoch !== epochRef.current) {
        eased.clear();
        easedEpoch = epochRef.current;
      }
      const from = { ...place, distance };
      let drawn = 0;
      const placed: Array<{ id: string; position: number; point: [number, number]; node: SVGGElement }> = [];
      for (const car of carsRef.current) {
        const node = carRefs.current.get(car.id);
        if (!node) continue;
        let ease = eased.get(car.id);
        if (!ease) {
          ease = { from: car.offsetSeconds, to: car.offsetSeconds, at: wall };
          eased.set(car.id, ease);
        } else if (ease.to !== car.offsetSeconds) {
          const u = Math.min(1, (wall - ease.at) / GAP_EASE_WALL_MS);
          ease.from = ease.from + (ease.to - ease.from) * u;
          ease.to = car.offsetSeconds;
          ease.at = wall;
        }
        const u = Math.min(1, (wall - ease.at) / GAP_EASE_WALL_MS);
        const offset = ease.from + (ease.to - ease.from) * (u * u * (3 - 2 * u));
        const carPoint = current.project(tOfDistance(geometry, distanceAhead(model, from, offset, now)), 0);
        if (!carPoint) {
          hide(node);
          continue;
        }
        node.setAttribute('transform', `translate(${carPoint[0].toFixed(1)} ${carPoint[1].toFixed(1)})`);
        positions.set(car.id, carPoint);
        placed.push({ id: car.id, position: car.position ?? 999, point: carPoint, node });
        drawn += 1;
      }
      // Piles (the grid, a restart, a caution): one plate each, the best
      // placed car, with "+n" for the rest; cars under his stem count into
      // his own "+n", so his 9 is never buried.
      const bryceAt = positions.get('bryce');
      let underBryce = 0;
      const leaders: Array<{ point: [number, number]; more: number; node: SVGGElement }> = [];
      placed.sort((a, b) => a.position - b.position);
      for (const car of placed) {
        if (bryceAt && Math.hypot(car.point[0] - bryceAt[0], car.point[1] - bryceAt[1]) < BRYCE_PILE_PX) {
          underBryce += 1;
          hide(car.node);
          continue;
        }
        const leader = leaders.find((other) => Math.hypot(car.point[0] - other.point[0], car.point[1] - other.point[1]) < PILE_PX);
        if (leader) {
          leader.more += 1;
          hide(car.node);
          continue;
        }
        leaders.push({ point: car.point, more: 0, node: car.node });
        show(car.node);
      }
      // Each count takes the first free spot round its plate (right shoulder,
      // left shoulder, below right, below left), clear of his plate, his own
      // count and every other plate, so no two numbers ever touch.
      type Box = { x0: number; y0: number; x1: number; y1: number };
      const hit = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
      const taken: Box[] = leaders.map((leader) => ({ x0: leader.point[0] - CAR_R, y0: leader.point[1] - CAR_R, x1: leader.point[0] + CAR_R, y1: leader.point[1] + CAR_R }));
      if (bryceAt) {
        taken.push({ x0: bryceAt[0] - PLATE_W / 2 - 2, y0: bryceAt[1] - PLATE_LIFT - PLATE_H / 2 - 2, x1: bryceAt[0] + PLATE_W / 2 + 2, y1: bryceAt[1] + 3 });
        if (underBryce > 0) {
          const w = textWidth(`+${underBryce}`, 10) + 2;
          taken.push({ x0: bryceAt[0] + PLATE_W / 2 + 3, y0: bryceAt[1] - PLATE_LIFT - 6, x1: bryceAt[0] + PLATE_W / 2 + 5 + w, y1: bryceAt[1] - PLATE_LIFT + 7 });
        }
      }
      for (const leader of leaders) {
        const node = leader.node.querySelector<SVGTextElement>('.live-marks__more');
        if (!node || leader.more === 0) {
          setMore(node, 0);
          continue;
        }
        const w = textWidth(`+${leader.more}`, 10) + 2;
        const spots: Array<[number, number, 'start' | 'end']> = [
          [CAR_R - 1, -CAR_R + 1, 'start'],
          [-CAR_R + 1, -CAR_R + 1, 'end'],
          [CAR_R - 1, CAR_R + 8, 'start'],
          [-CAR_R + 1, CAR_R + 8, 'end']
        ];
        const boxOf = ([dx, dy, anchor]: [number, number, 'start' | 'end']): Box => {
          const x = leader.point[0] + dx;
          const y = leader.point[1] + dy;
          return anchor === 'start' ? { x0: x, y0: y - 8, x1: x + w, y1: y + 2 } : { x0: x - w, y0: y - 8, x1: x, y1: y + 2 };
        };
        const own: Box = { x0: leader.point[0] - CAR_R, y0: leader.point[1] - CAR_R, x1: leader.point[0] + CAR_R, y1: leader.point[1] + CAR_R };
        const spot = spots.find((candidate) => { const box = boxOf(candidate); return !taken.some((other) => other !== own && !(other.x0 === own.x0 && other.y0 === own.y0) && hit(box, other)); }) ?? spots[0];
        node.setAttribute('x', String(spot[0]));
        node.setAttribute('y', String(spot[1]));
        node.setAttribute('text-anchor', spot[2]);
        taken.push(boxOf(spot));
        setMore(node, leader.more);
      }
      for (const car of placed) if (!leaders.some((leader) => leader.node === car.node)) setMore(car.node.querySelector<SVGTextElement>('.live-marks__more'), 0);
      setMore(bryceMoreRef.current, underBryce);
      svgRef.current?.setAttribute('data-marks-cars', String(drawn));
      svgRef.current?.setAttribute('data-marks-plates', String(leaders.length));

      const tip = tipRef.current;
      const focus = hoverRef.current;
      const tipAt = focus ? positions.get(focus) : undefined;
      if (tip && tipAt) {
        const box = svgRef.current?.clientWidth ?? Infinity;
        const right = tipAt[0] + 280 > box;
        tip.style.left = right ? '' : `${Math.round(tipAt[0] + 16)}px`;
        tip.style.right = right ? `${Math.round(box - tipAt[0] + 16)}px` : '';
        tip.style.top = `${Math.round(tipAt[1] - (focus === 'bryce' ? PLATE_LIFT + 14 : 12))}px`;
        if (focus === 'bryce' && tipLineRef.current) {
          const name = sectionDisplayName(geometry.chain[at.index], at.index, geometry.chain.length);
          const text = `${name}, lap ${lap}`;
          if (tipLineRef.current.textContent !== text) tipLineRef.current.textContent = text;
        }
      }

      const key = `${lap}:${at.index}:${place.holding}`;
      if (key !== lastReadout) {
        lastReadout = key;
        readoutRef.current?.({ lap, index: at.index, holding: place.holding });
      }
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [virtualNow]);

  const leaveTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const enter = useCallback(
    (id: string) => {
      window.clearTimeout(leaveTimer.current);
      setHover(id);
      onHoverCar?.(id === 'bryce' ? null : id);
    },
    [onHoverCar]
  );
  // A mark moves on while it is read: the label stays a moment after the
  // pointer loses it.
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setHover(null);
      onHoverCar?.(null);
    }, 1_200);
  }, [onHoverCar]);

  const { project, halfWidth, version } = view;
  const chain = race.geometry?.chain ?? [];
  const ticks = useMemo(
    () =>
      chain
        .map((anchor) => {
          const a = project(anchor.startT, -halfWidth * 1.4);
          const b = project(anchor.startT, halfWidth * 1.4);
          return a && b ? { key: anchor.familyId, a, b } : null;
        })
        .filter((tick): tick is NonNullable<typeof tick> => tick !== null),
    // project reads the live camera; version says when it moved
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain, project, halfWidth, version]
  );

  const focus = hover ?? highlightId ?? null;
  const hoveredCar = hover && hover !== 'bryce' ? cars.find((car) => car.id === hover) ?? null : null;
  return (
    <>
      <svg ref={svgRef} className="live-marks" width="100%" height="100%" aria-hidden data-marks-field={fieldMode} data-marks-trail={trail ? 'lap' : 'off'}>
        {ticks.map((tick) => (
          <line key={tick.key} x1={tick.a[0]} y1={tick.a[1]} x2={tick.b[0]} y2={tick.b[1]} className="live-marks__loop" />
        ))}
        <path ref={trailPathRef} className="live-marks__trail" visibility="hidden" />
        <path ref={fadeRef} className="live-marks__fade" visibility="hidden" />
        <path ref={fillRef} className="live-marks__fill" visibility="hidden" />
        {cars.map((car) => (
          <g
            key={car.id}
            ref={(node) => {
              if (node) carRefs.current.set(car.id, node);
              else carRefs.current.delete(car.id);
            }}
            className={`live-marks__car${car.id === focus ? ' is-focus' : ''}`}
            visibility="hidden"
            data-car={car.id}
            data-car-no={car.no}
            onPointerEnter={() => enter(car.id)}
            onPointerLeave={leave}
          >
            <circle r={CAR_R + 5} className="live-marks__hit" />
            <circle r={CAR_R} className="live-marks__dot" />
            <text y={3.2} textAnchor="middle" className="live-marks__no">
              {car.no}
            </text>
            <text x={CAR_R - 1} y={-CAR_R + 1} className="live-marks__more" visibility="hidden" />
          </g>
        ))}
        <g ref={bryceRef} className={`live-marks__bryce${hover === 'bryce' ? ' is-focus' : ''}`} visibility="hidden" onPointerEnter={() => enter('bryce')} onPointerLeave={leave}>
          <ellipse rx={11} ry={4.4} className="live-marks__shadow" />
          <line x1={0} y1={0} x2={0} y2={-PLATE_LIFT + PLATE_H / 2} className="live-marks__stem" />
          <circle r={2.6} className="live-marks__foot" />

          <rect x={-PLATE_W / 2 - 6} y={-PLATE_LIFT - PLATE_H / 2 - 6} width={PLATE_W + 12} height={PLATE_H + PLATE_LIFT + 10} className="live-marks__hit" />
          <rect x={-PLATE_W / 2} y={-PLATE_LIFT - PLATE_H / 2} width={PLATE_W} height={PLATE_H} rx={6} className="live-marks__plate" />
          <text y={-PLATE_LIFT + 6} textAnchor="middle" className="live-marks__plate-no">
            {bryceLabel?.no || '9'}
          </text>
          {/* a pass, for a few seconds as it happens */}
          <text ref={passRef} y={-PLATE_LIFT - PLATE_H / 2 - 8} textAnchor="middle" className="live-marks__pass" visibility="hidden" />
          {/* the cars under his stem, counted beside his plate */}
          <text ref={bryceMoreRef} x={PLATE_W / 2 + 4} y={-PLATE_LIFT + 4} className="live-marks__more" visibility="hidden" />
        </g>
      </svg>
      {hover ? (
        <div ref={tipRef} className="live-marks__tip" role="status">
          {hover === 'bryce' ? (
            <>
              <strong>
                No. {bryceLabel?.no || '9'} {bryceLabel?.surname || 'Aron'}
                {bryceLabel?.position ? `, P${bryceLabel.position}` : ''}
              </strong>
              <span ref={tipLineRef} />
              <span className="live-marks__tip-detail">Placed by time between the timing loops, not GPS.</span>
            </>
          ) : (
            <>
              <strong>
                {hoveredCar ? `No. ${hoveredCar.no} ${hoveredCar.surname}` : 'Car'}
                {hoveredCar?.position ? `, P${hoveredCar.position}` : ''}
              </strong>
              {hoveredCar ? (
                <span>
                  {Math.abs(hoveredCar.offsetSeconds).toFixed(1)} s {hoveredCar.offsetSeconds > 0 ? 'ahead of' : 'behind'} Bryce
                </span>
              ) : null}
              <span className="live-marks__tip-detail">Placed by the gap, not GPS.</span>
            </>
          )}
        </div>
      ) : null}
    </>
  );
};
