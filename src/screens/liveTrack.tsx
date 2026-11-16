import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackOutline } from '../assets/tracks';
import { measuredTrackSectionsFor, trackSectionsFor, type TrackSectionAnchor } from '../assets/tracks/sections';
import { loadSectionLaps, type SectionLapsPack } from '../data/sectionLaps';
import { stableDriverId } from '../data/livePageModel';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import type { TrackOverlayView } from '../three/TrackModel3D';
import {
  anchorSetForPack,
  buildFieldPlan,
  buildSectionLightPlan,
  dotT,
  matchFieldRows,
  mergeFieldLapLineCrossings,
  mergeObservedLapTimes,
  isNamedSectionLabel,
  lapLineCrossingsFrom,
  mergeLapLineCrossings,
  outlineGeometry,
  parseOutlinePoints,
  sectionAt,
  sectionDisplayName,
  segmentBases,
  type DotMode,
  type LapLineCrossing,
  type LitSection,
  type SectionLightPlan
} from './liveSectionLight';

/* ============================================================
   The live page's track: the circuit drawn large, the section
   Bryce is in lit amber during a replay, and a dot for each car
   at the last timing loop it crossed (round 6). Timing loops are
   the only position signal there is: a dot is a measured loop
   crossing, never a GPS position.
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

/* ---------- the section light ---------- */

export type SectionLightStatus =
  | 'live'            // a live session: the feed carries no loop crossings
  | 'loading'         // the race's section times are loading
  | 'no_sections'     // no usable section times for this race
  | 'waiting_line'    // usable, but no lap-line crossing seen yet
  | 'between'         // usable and placed, but this moment has no tiled lap
  | 'lit';

/** One car placed on the archive clock: its lap plan (section times in chain
 *  order) and the observed line crossings that anchor it. */
export interface CarPlacer {
  id: string;
  plan: SectionLightPlan;
  bases: Map<number, number>;
}

/** The other cars, as far as the timing lets them be placed. */
export interface FieldPlacement {
  /** The race's section times carry the other cars at all. */
  usable: boolean;
  reason: string | null;
  /** Other-car rows in the race's section times. */
  rows: number;
  /** Rows joined to a car by lap time so far. */
  joined: number;
  /** Joined cars with an observed line crossing to place them by. */
  placers: CarPlacer[];
}

export interface SectionLightState {
  status: SectionLightStatus;
  plan: SectionLightPlan | null;
  lit: LitSection | null;
  /** Bryce, placed the same way (null until a line crossing is seen). */
  bryce: CarPlacer | null;
  field: FieldPlacement;
}

const NO_FIELD: FieldPlacement = { usable: false, reason: null, rows: 0, joined: 0, placers: [] };

/** Reads the replay's virtual clock (epoch ms), or null outside a replay. */
export type VirtualNow = () => number | null;

export const useSectionLight = ({
  sessionId,
  outline,
  history,
  virtualNow,
  speed
}: {
  /** The canonical race id of the replay; null on a live page. */
  sessionId: string | null;
  outline: TrackOutline | null;
  history: LiveSessionHistory | null;
  virtualNow: VirtualNow;
  speed: number;
}): SectionLightState => {
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

  const fieldPlan = useMemo(() => (currentPack && plan?.usable ? buildFieldPlan(currentPack, plan) : null), [currentPack, plan]);

  // Lap-line crossings outlive the history window (which trims to minutes),
  // and so do the field's crossings, lap times and row joins.
  const kept = useRef<{
    sessionId: string | null;
    crossings: Map<number, LapLineCrossing>;
    field: Map<string, Map<number, LapLineCrossing>>;
    times: Map<string, Map<number, number>>;
    matches: Map<string, number>;
  }>({ sessionId: null, crossings: new Map(), field: new Map(), times: new Map(), matches: new Map() });
  if (kept.current.sessionId !== sessionId) {
    kept.current = { sessionId, crossings: new Map(), field: new Map(), times: new Map(), matches: new Map() };
  }
  const [bases, setBases] = useState<Map<number, number>>(new Map());
  const [bryceId, setBryceId] = useState('');
  const [placers, setPlacers] = useState<{ joined: number; list: CarPlacer[] }>({ joined: 0, list: [] });
  useEffect(() => {
    setBases(new Map());
    setPlacers({ joined: 0, list: [] });
  }, [sessionId]);
  useEffect(() => {
    if (!plan?.usable || !history) return;
    const idOf = (row: Record<string, unknown>) => stableDriverId(row as never);
    const crossings = lapLineCrossingsFrom(history.samples, idOf);
    if (mergeLapLineCrossings(kept.current.crossings, crossings) || bases.size === 0) {
      const next = segmentBases(plan, [...kept.current.crossings.values()]);
      if (next.size > 0) setBases(next);
    }
    const id = history.samples.at(-1)?.bryceId ?? '';
    if (id) setBryceId(id);
    if (!fieldPlan?.usable) return;
    const moved = mergeFieldLapLineCrossings(kept.current.field, history.samples, idOf);
    const timed = mergeObservedLapTimes(kept.current.times, history.samples, idOf);
    if (!moved && !timed && placers.list.length > 0) return;
    kept.current.matches = matchFieldRows(fieldPlan, kept.current.times, kept.current.matches, id);
    const list: CarPlacer[] = [];
    for (const [car, row] of kept.current.matches) {
      const rowPlan = fieldPlan.rows[row];
      const carCrossings = kept.current.field.get(car);
      if (!rowPlan || !carCrossings) continue;
      const carBases = segmentBases(rowPlan, [...carCrossings.values()]);
      if (carBases.size > 0) list.push({ id: car, plan: rowPlan, bases: carBases });
    }
    setPlacers({ joined: kept.current.matches.size, list });
    // bases and placers are read only to retry after a reset; the history drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, plan, fieldPlan]);

  const [lit, setLit] = useState<LitSection | null>(null);
  useEffect(() => {
    if (!plan?.usable || bases.size === 0) {
      setLit(null);
      return undefined;
    }
    const tick = () => {
      const now = virtualNow();
      const next = now === null ? null : sectionAt(plan, bases, now);
      setLit((previous) =>
        previous?.lap === next?.lap && previous?.index === next?.index && previous?.enteredAtMs === next?.enteredAtMs ? previous : next
      );
    };
    tick();
    // Sections last 1-10 s of race time; at 16x that is well under a second.
    const every = Math.max(60, Math.min(250, Math.round(1000 / Math.max(1, speed) / 2)));
    const timer = window.setInterval(tick, every);
    return () => window.clearInterval(timer);
  }, [plan, bases, virtualNow, speed]);

  const bryce = useMemo<CarPlacer | null>(
    () => (plan?.usable && bases.size > 0 ? { id: bryceId || 'bryce', plan, bases } : null),
    [plan, bases, bryceId]
  );
  const field = useMemo<FieldPlacement>(() => {
    if (!fieldPlan) return NO_FIELD;
    if (!fieldPlan.usable) return { ...NO_FIELD, reason: fieldPlan.reason };
    return { usable: true, reason: null, rows: fieldPlan.rows.length, joined: placers.joined, placers: placers.list };
  }, [fieldPlan, placers]);

  if (!sessionId) return { status: 'live', plan: null, lit: null, bryce: null, field: NO_FIELD };
  if (!pack || pack.sessionId !== sessionId) return { status: 'loading', plan: null, lit: null, bryce: null, field: NO_FIELD };
  if (!plan?.usable) return { status: 'no_sections', plan, lit: null, bryce: null, field: NO_FIELD };
  if (bases.size === 0) return { status: 'waiting_line', plan, lit: null, bryce: null, field };
  return { status: lit ? 'lit' : 'between', plan, lit, bryce, field };
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
  lit: LitSection | null;
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
  return (
    <div ref={ref} className="live-track" data-live-track data-lit-section={lit?.anchor.familyId ?? ''} data-lit-lap={lit?.lap ?? ''}>
      {layout ? (
        <svg width={width} height={layout.svgHeight} viewBox={`0 0 ${width} ${layout.svgHeight}`} role="img" aria-label={ariaLabel} className="live-track__svg">
          {layout.pitPath ? <path d={layout.pitPath} className="live-track__pit" /> : null}
          <path d={layout.fullPath} className="live-track__base" strokeWidth={layout.stroke} />
          {layout.sections.map((section) => (
            <path
              key={section.familyId}
              d={section.d}
              className={`live-track__section${lit?.anchor.familyId === section.familyId ? ' live-track__section--lit' : ''}`}
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
            entry && !(litSlot && boxesOverlap(entry.label, litSlot, 2)) && entry.familyId !== lit?.anchor.familyId ? (
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

/* ---------- the car dots ---------- */

/** Who a dot is, from the timing rows. */
export interface CarLabel {
  no: string;
  surname: string;
  position: number | null;
}

interface PlacedCar {
  id: string;
  bryce: boolean;
  lit: LitSection;
  t: number;
}

const placeAll = (cars: CarPlacer[], bryceId: string | null, atMs: number, mode: DotMode): PlacedCar[] => {
  const placed: PlacedCar[] = [];
  for (const car of cars) {
    const lit = sectionAt(car.plan, car.bases, atMs);
    if (lit) placed.push({ id: car.id, bryce: car.id === bryceId, lit, t: dotT(lit, atMs, mode) });
  }
  return placed;
};

const signatureOf = (placed: PlacedCar[]) => placed.map((car) => `${car.id}:${car.lit.lap}:${car.lit.index}`).join('|');

const DOT_R = 5;
const PLATE_W = 22;
const PLATE_H = 16;

/**
 * Car dots over the track (3D model or 2D map: `view` says where a point of
 * the track is drawn). Default mode `loops`: each dot sits on the last timing
 * loop that car crossed and moves loop to loop. `glide` moves it through its
 * section by time between its two crossings. Several cars on one loop line up
 * along it, in running order. Bryce is the gold plate with his 9.
 */
export const TrackDots = ({
  view,
  chain,
  bryce,
  placers,
  virtualNow,
  speed,
  mode,
  cars,
  highlightId,
  onHoverCar,
  onCount
}: {
  view: TrackOverlayView;
  chain: TrackSectionAnchor[];
  bryce: CarPlacer | null;
  placers: CarPlacer[];
  virtualNow: VirtualNow;
  speed: number;
  mode: DotMode;
  cars: Map<string, CarLabel>;
  /** A car to ring (the running order's hovered row). */
  highlightId?: string | null;
  onHoverCar?: (id: string | null) => void;
  /** How many cars have a dot now (called when it changes). */
  onCount?: (placed: number) => void;
}) => {
  const all = useMemo(() => (bryce ? [bryce, ...placers] : placers), [bryce, placers]);
  const bryceId = bryce?.id ?? null;
  const [placed, setPlaced] = useState<PlacedCar[]>(() => {
    const now = virtualNow();
    return now === null ? [] : placeAll(all, bryceId, now, mode);
  });
  const sigRef = useRef('');
  useEffect(() => {
    let frame = 0;
    let timer = 0;
    const tick = () => {
      const now = virtualNow();
      const next = now === null ? [] : placeAll(all, bryceId, now, mode);
      if (mode === 'glide') {
        setPlaced(next);
        return;
      }
      const sig = signatureOf(next);
      if (sig !== sigRef.current) {
        sigRef.current = sig;
        setPlaced(next);
      }
    };
    sigRef.current = '';
    tick();
    if (mode === 'glide') {
      const loop = () => {
        tick();
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    } else {
      // A car crosses a loop every 1-10 s of race time; at 16x that is well under a second.
      timer = window.setInterval(tick, Math.max(60, Math.min(250, Math.round(1000 / Math.max(1, speed) / 2))));
    }
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [all, bryceId, virtualNow, speed, mode]);

  const count = placed.length;
  useEffect(() => {
    onCount?.(count);
  }, [count, onCount]);

  const [hover, setHover] = useState<{ id: string; pinned: boolean } | null>(null);
  // A dot moves on while it is read (loop to loop, or gliding): the label stays
  // with that car a moment after the pointer loses it.
  const leaveTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);
  const enter = useCallback(
    (id: string) => {
      window.clearTimeout(leaveTimer.current);
      setHover((current) => (current?.pinned ? current : { id, pinned: false }));
      onHoverCar?.(id);
    },
    [onHoverCar]
  );
  const leave = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      setHover((current) => (current?.pinned ? current : null));
      onHoverCar?.(null);
    }, 1_400);
  }, [onHoverCar]);
  const toggle = useCallback((id: string) => {
    setHover((current) => (current?.pinned && current.id === id ? null : { id, pinned: true }));
  }, []);

  const { project, halfWidth, version } = view;
  const ticks = useMemo(
    () =>
      chain
        .map((anchor) => {
          const a = project(anchor.startT, -halfWidth * 1.5);
          const b = project(anchor.startT, halfWidth * 1.5);
          return a && b ? { key: anchor.familyId, a, b } : null;
        })
        .filter((tick): tick is NonNullable<typeof tick> => tick !== null),
    // project reads the live camera; version says when it moved
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chain, project, halfWidth, version]
  );

  const drawn = useMemo(() => {
    const rank = (id: string) => cars.get(id)?.position ?? 999;
    const groups = new Map<string, PlacedCar[]>();
    for (const car of placed) {
      const key = mode === 'loops' ? `${car.lit.index}` : `${car.id}`;
      const list = groups.get(key) ?? [];
      list.push(car);
      groups.set(key, list);
    }
    const out: Array<{ car: PlacedCar; x: number; y: number }> = [];
    for (const list of groups.values()) {
      list.sort((a, b) => rank(a.id) - rank(b.id));
      const t = list[0].t;
      const centre = project(t, 0);
      if (!centre) continue;
      if (list.length === 1) {
        out.push({ car: list[0], x: centre[0], y: centre[1] });
        continue;
      }
      // Line them up along the loop: across the track at this point, on screen.
      const a = project(t, -halfWidth);
      const b = project(t, halfWidth);
      let dx = 1;
      let dy = 0;
      if (a && b) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len > 0.5) {
          dx = (b[0] - a[0]) / len;
          dy = (b[1] - a[1]) / len;
        }
      }
      // Touching, not spaced: a busy loop stays a short line across the track.
      const widths = list.map((car) => (car.bryce ? PLATE_W - 2 : DOT_R * 2 - 1));
      const total = widths.reduce((sum, w) => sum + w, 0);
      let cursor = -total / 2;
      list.forEach((car, index) => {
        const offset = cursor + widths[index] / 2;
        cursor += widths[index];
        out.push({ car, x: centre[0] + dx * offset, y: centre[1] + dy * offset });
      });
    }
    // Bryce and the ringed car draw last, on top.
    const focus = hover?.id ?? highlightId ?? null;
    out.sort((p, q) => Number(p.car.bryce || p.car.id === focus) - Number(q.car.bryce || q.car.id === focus));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, mode, cars, project, halfWidth, version, hover?.id, highlightId]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const focus = hover?.id ?? highlightId ?? null;
  const tipCar = hover ? drawn.find((entry) => entry.car.id === hover.id) ?? null : null;
  const tipLabel = tipCar ? cars.get(tipCar.car.id) : null;

  return (
    <>
      <svg ref={svgRef} className="live-dots" width="100%" height="100%" aria-hidden data-dots-mode={mode} data-dots-placed={count}>
        {ticks.map((tick) => (
          <line key={tick.key} x1={tick.a[0]} y1={tick.a[1]} x2={tick.b[0]} y2={tick.b[1]} className="live-dots__loop" />
        ))}
        {drawn.map(({ car, x, y }) => {
          const label = cars.get(car.id);
          const ringed = car.id === focus;
          return (
            <g
              key={car.id}
              className={`live-dots__car${car.bryce ? ' live-dots__car--bryce' : ''}${ringed ? ' is-focus' : ''}`}
              transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
              data-car={car.id}
              data-car-no={label?.no ?? ''}
              data-section={car.lit.anchor.familyId}
              onPointerEnter={() => enter(car.id)}
              onPointerLeave={leave}
              onClick={() => toggle(car.id)}
            >
              {/* a larger, invisible target for the pointer */}
              <circle r={car.bryce ? 14 : 9} className="live-dots__hit" />
              {ringed ? <circle r={car.bryce ? 15 : DOT_R + 4} className="live-dots__ring" /> : null}
              {car.bryce ? (
                <>
                  <rect x={-PLATE_W / 2} y={-PLATE_H / 2} width={PLATE_W} height={PLATE_H} rx={4} className="live-dots__plate" />
                  <text y={4} textAnchor="middle" className="live-dots__plate-no">
                    {label?.no || '9'}
                  </text>
                </>
              ) : (
                <circle r={DOT_R} className="live-dots__dot" />
              )}
            </g>
          );
        })}
      </svg>
      {tipCar ? (
        <div
          className="live-dots__tip"
          role="status"
          style={
            tipCar.x + 270 > (svgRef.current?.clientWidth ?? Infinity)
              ? { right: Math.round((svgRef.current?.clientWidth ?? 0) - tipCar.x + 14), top: Math.round(tipCar.y - 12) }
              : { left: Math.round(tipCar.x + 14), top: Math.round(tipCar.y - 12) }
          }
        >
          <strong>
            {tipLabel ? `No. ${tipLabel.no} ${tipLabel.surname}` : 'Car'}
            {tipLabel?.position ? `, P${tipLabel.position}` : ''}
          </strong>
          <span>
            {sectionDisplayName(tipCar.car.lit.anchor, tipCar.car.lit.index, chain.length)}, lap {tipCar.car.lit.lap}
          </span>
          <span className="live-dots__tip-detail">
            {mode === 'loops'
              ? 'At the timing loop it last crossed.'
              : 'Placed by time between its two timing loops, not GPS.'}
          </span>
        </div>
      ) : null}
    </>
  );
};
