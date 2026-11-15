import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TrackOutline } from '../assets/tracks';
import { measuredTrackSectionsFor, trackSectionsFor, type TrackSectionAnchor } from '../assets/tracks/sections';
import { loadSectionLaps, type SectionLapsPack } from '../data/sectionLaps';
import { stableDriverId } from '../data/livePageModel';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import {
  anchorSetForPack,
  buildSectionLightPlan,
  isNamedSectionLabel,
  lapLineCrossingsFrom,
  mergeLapLineCrossings,
  outlineGeometry,
  parseOutlinePoints,
  sectionAt,
  sectionDisplayName,
  segmentBases,
  type LapLineCrossing,
  type LitSection,
  type SectionLightPlan
} from './liveSectionLight';

/* ============================================================
   The live page's track: the circuit drawn large, the section
   Bryce is in lit amber during a replay. A section, never a dot:
   timing loops are the only position signal there is.
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

export interface SectionLightState {
  status: SectionLightStatus;
  plan: SectionLightPlan | null;
  lit: LitSection | null;
}

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

  // Lap-line crossings outlive the history window (which trims to minutes).
  const kept = useRef<{ sessionId: string | null; crossings: Map<number, LapLineCrossing> }>({ sessionId: null, crossings: new Map() });
  if (kept.current.sessionId !== sessionId) kept.current = { sessionId, crossings: new Map() };
  const [bases, setBases] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    setBases(new Map());
  }, [sessionId]);
  useEffect(() => {
    if (!plan?.usable || !history) return;
    const crossings = lapLineCrossingsFrom(history.samples, (row) => stableDriverId(row as never));
    if (mergeLapLineCrossings(kept.current.crossings, crossings) || bases.size === 0) {
      const next = segmentBases(plan, [...kept.current.crossings.values()]);
      if (next.size > 0) setBases(next);
    }
    // bases is read only to retry after a reset; the history drives this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, plan]);

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

  if (!sessionId) return { status: 'live', plan: null, lit: null };
  if (!pack || pack.sessionId !== sessionId) return { status: 'loading', plan: null, lit: null };
  if (!plan?.usable) return { status: 'no_sections', plan, lit: null };
  if (bases.size === 0) return { status: 'waiting_line', plan, lit: null };
  return { status: lit ? 'lit' : 'between', plan, lit };
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
}

export const LiveTrack = ({ outline, chain, lit, maxHeight, ariaLabel, labelRoom = false }: LiveTrackProps) => {
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
    return { compact, quietSize, litSize, svgHeight, stroke, litStroke, fullPath, pitPath, sections, quiet, litSlots, sfLabel, loopTicks, sfTick, chevron };
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
    </div>
  );
};
