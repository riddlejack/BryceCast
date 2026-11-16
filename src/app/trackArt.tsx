import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { TrackOutline } from '../assets/tracks';
import type { ResolvedHeatSection } from '../data/sectionObservations';
import { ChartTipCard, chartFont, inkGoldDiverging, useMeasuredWidth, type ChartTip } from './charts';
import { ordinal } from './format';
import { switchValue } from '../review/switches';

/** The heat-map / section-intelligence layer (Brief H). `resolved` carries the
 *  curated section spans already joined to Bryce's percentile for the scope;
 *  TrackArt draws them, labels them, and runs the nearest-point hover. */
export interface TrackSectionsLayer {
  resolved: ResolvedHeatSection[];
  /** Persistent official labels beside each span (card: true, hero: false). */
  showLabels?: boolean;
  /** Short scope phrase used in tooltips and accessible copy. Race-section
   * maps keep the default; qualifying maps name the selected qualifying lap. */
  contextLabel?: string;
}

interface Pt {
  x: number;
  y: number;
}

const parsePoints = (d: string): Pt[] => {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const points: Pt[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) points.push({ x: nums[i], y: nums[i + 1] });
  return points;
};

/** Whether fractional t falls within a span [start,end]; end<start wraps t=0. */
const spanContains = (start: number, end: number, t: number): boolean =>
  start <= end ? t >= start && t <= end : t >= start || t <= end;

/** Whether t falls within ANY of a section's render spans (one for a measured
 *  section, several for a derived remainder that covers disjoint stretches). */
const sectionContainsT = (section: ResolvedHeatSection, t: number): boolean =>
  section.renderSpans.some((span) => spanContains(span.startT, span.endT, t));

/** Forward arc-length of a span in [0,1], handling the wrap seam. */
const spanLength = (start: number, end: number): number => ((end - start + 1) % 1) || (end === start ? 0 : 1);

/** Midpoint t of a span, handling the wrap seam. */
const spanMid = (start: number, end: number): number => (start + spanLength(start, end) / 2) % 1;

/** Outline-only track line art (OSM tracing, docs/CREATIVE_DIRECTION.md
 *  locked decision 5): thin ink line, gold start/finish tick, optional quiet
 *  corner labels, optional gold section-note dot with hover tooltip, and the
 *  optional Section Intelligence heat-map layer (Brief H). */
export const TrackArt = ({
  outline,
  annotation,
  showCornerLabels = true,
  maxHeight,
  progress,
  sections = null,
  passMarks = null,
  wind,
  strokeScale = 1,
  labelPlacement = 'beside',
  labelRoom = 0,
  labelSize
}: {
  outline: TrackOutline;
  /** Multiplies the heat-map stroke, dots and start/finish tick (the Tracks
   *  page draws a thick line; every other caller keeps 1). */
  strokeScale?: number;
  /** 'beside' (default) pushes each section label away from the shape's
   *  centre. 'outside' searches along the track's normal for a spot that clears
   *  the line itself and every other label, with a hairline leader when the
   *  label had to move further out. */
  labelPlacement?: 'beside' | 'outside';
  /** Pixels of room kept around the drawing for 'outside' labels. */
  labelRoom?: number;
  /** Section label size in screen pixels (default 10.5; 'outside' uses 12.5). */
  labelSize?: number;
  annotation?: { corner: string; note: string } | null;
  showCornerLabels?: boolean;
  /** Cap the rendered height so differently-shaped circuits occupy one
   *  consistent box (the art letterboxes inside it, centered). */
  maxHeight?: number;
  /** Optional sourced lap progress. Draws a second ink stroke over a quiet
   * outline; it is race completion, never a car/GPS position. */
  progress?: number;
  /** Optional Section Intelligence heat-map layer. */
  sections?: TrackSectionsLayer | null;
  /** Optional pass marks (heat-map v2): each green Bryce pass as a quiet open
   *  circle at its bracketed interval's span midpoint, hover for lap/direction/
   *  the other car. Placed between timing loops — never a precise track spot. */
  passMarks?: Array<{
    id: string;
    startT: number;
    endT: number;
    lap: number;
    direction: 'gain' | 'loss';
    otherName: string;
  }> | null;
  /** Near-track wind, drawn as a quiet flow arrow beside the shape and turned
   *  to true north via the outline's geographic orientation. Rendered ONLY for
   *  real-geo (OSM) outlines that carry northOffsetDeg — image-traced street
   *  circuits have no orientation, so the wind is honestly omitted there.
   *  bearingDeg is the compass direction the wind blows FROM (0=N, 90=E), or
   *  null for calm/no-direction — then no arrow and no north tick draw, just the
   *  label (e.g. "calm"). `frame` is a one-word timeframe shown before the value
   *  ("now · 7 mph NNE") so a live pill never reads as a contradiction of a
   *  forecast elsewhere on the page. */
  wind?: { bearingDeg: number | null; label: string; frame?: string } | null;
}) => {
  const [ref, measuredWidth] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* Active section by family id: hover (mouse) or the touch-cycle selection. */
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  /* A pass mark owns the tip while hovered, so the section nearest-point hover
   * doesn't fight it (same pattern as the lap chart's inflection dots). */
  const markTipActive = useRef(false);
  const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
  const aspect = viewHeight / viewWidth;
  const outside = labelPlacement === 'outside';
  /* Room around the art for outside labels (0 for every other caller, which
   * keeps their geometry exactly as before). */
  const room = outside ? Math.max(0, Math.min(labelRoom, measuredWidth * 0.1)) : 0;
  const artAvailable = Math.max(0, measuredWidth - room * 2);
  const width =
    maxHeight !== undefined ? Math.max(0, Math.min(artAvailable, (maxHeight - room * 2) / aspect)) : artAvailable;
  const scale = width > 0 ? width / viewWidth : 1;
  const px = (visual: number) => visual / scale;
  /* Margin in viewBox units, and the svg's own box in screen pixels. */
  const margin = room / scale;
  const svgWidth = width + room * 2;
  const svgInset = Math.max(0, (measuredWidth - svgWidth) / 2);
  /** Screen position (container pixels) of a viewBox point. */
  const toScreen = (point: { x: number; y: number }) => ({
    x: (point.x + margin) * scale + svgInset,
    y: (point.y + margin) * scale
  });
  const weight = (visual: number) => px(visual * strokeScale);
  const labelPx = labelSize ?? (outside ? 12.5 : 12);
  const center = { x: viewWidth / 2, y: viewHeight / 2 };
  const heatSections = sections?.resolved ?? [];
  const hasHeat = heatSections.length > 0;

  /* Path geometry for span drawing + nearest-point hover. Sampled once per
   * outline; the SVG dash trick uses the same [0,1] parameterisation. */
  const geometry = useMemo(() => {
    const points = parsePoints(outline.mainPath);
    const n = points.length;
    const cum = new Array(n + 1).fill(0);
    for (let i = 0; i < n; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % n];
      cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
    }
    const total = cum[n] || 1;
    const pointAtT = (t: number): Pt => {
      const d = ((((t % 1) + 1) % 1) * total);
      let i = 0;
      while (i < n && cum[i + 1] < d) i += 1;
      const a = points[i % n];
      const b = points[(i + 1) % n];
      const segLen = cum[i + 1] - cum[i] || 1;
      const frac = (d - cum[i]) / segLen;
      return { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
    };
    const SAMPLES = 200;
    const samples = Array.from({ length: SAMPLES }, (_, k) => {
      const t = k / SAMPLES;
      const p = pointAtT(t);
      return { t, x: p.x, y: p.y };
    });
    return { pointAtT, samples };
  }, [outline.mainPath]);

  /** Explicit sub-path polyline for a span, sampled along the real geometry, so
   *  a derived stretch can draw a dotted line of its own weight (the pathLength
   *  dash trick only masks the full outline and can't also carry a dot pattern).
   *  Forward sampling handles the wrap seam. */
  const spanPolyline = (start: number, end: number): string => {
    const length = spanLength(start, end);
    const steps = Math.max(2, Math.round(length * 240));
    let d = '';
    for (let i = 0; i <= steps; i += 1) {
      const point = geometry.pointAtT((start + (length * i) / steps) % 1);
      d += `${i === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)} `;
    }
    return d.trim();
  };

  /** Two dash descriptors so a wrapping span still draws (SVG dashes don't
   *  cross the M/Z seam on their own). pathLength=1 → dash units are fractions. */
  const dashesFor = (start: number, end: number): Array<{ dasharray: string; dashoffset: number }> =>
    start <= end
      ? [{ dasharray: `${end - start} 2`, dashoffset: -start }]
      : [
          { dasharray: `${1 - start} 2`, dashoffset: -start },
          { dasharray: `${end} 2`, dashoffset: 0 }
        ];

  const activeFamily =
    hoveredFamily ?? (selectedIndex !== null ? heatSections[selectedIndex]?.familyId ?? null : null);

  const showTipFor = (section: ResolvedHeatSection, at?: { x: number; y: number }) => {
    const anchorPt = toScreen(at ?? geometry.pointAtT(spanMid(section.startT, section.endT)));
    const pct = Math.round(section.percentile * 100);
    if (section.kind === 'derived_remainder') {
      setTip({
        x: anchorPt.x,
        y: anchorPt.y,
        title: 'The rest of the lap, together',
        detail: `${ordinal(pct)} percentile ${sections?.contextLabel ?? 'this race'}`,
        action: section.combined
          ? 'combined untimed stretches · derived from lap time'
          : 'derived from lap time minus timed sections'
      });
      return;
    }
    setTip({
      x: anchorPt.x,
      y: anchorPt.y,
      title: section.label,
      detail: `beat ${pct}% of the field ${sections?.contextLabel ?? 'this race'}`
    });
  };

  /** Nearest path sample to a client-space pointer position, with distance in
   *  viewBox units — shared by hover and tap so both honor the same hit radius. */
  const nearestSample = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * (viewWidth + margin * 2) - margin;
    const vy = ((clientY - rect.top) / rect.height) * (viewHeight + margin * 2) - margin;
    let best = geometry.samples[0];
    let bestDist = Infinity;
    for (const sample of geometry.samples) {
      const distance = (sample.x - vx) ** 2 + (sample.y - vy) ** 2;
      if (distance < bestDist) {
        bestDist = distance;
        best = sample;
      }
    }
    return { sample: best, dist: Math.sqrt(bestDist) };
  };

  /** The honest-explanation tip for stretches without timing loops (Jack's
   *  review: the gaps must explain themselves, not just the caption). */
  const showUntimedTip = (sample: { x: number; y: number }) => {
    const at = toScreen(sample);
    setTip({
      x: at.x,
      y: at.y,
      title: 'No timing loops on this stretch',
      detail: 'officially untimed'
    });
  };

  /* Pass marks distributed along their spans: one green Bryce pass = one open
   * circle; several on the same span fan out evenly so none hide behind another. */
  const placedMarks = useMemo(() => {
    const bySpan = new Map<string, NonNullable<typeof passMarks>>();
    for (const mark of passMarks ?? []) {
      const key = `${mark.startT}-${mark.endT}`;
      if (!bySpan.has(key)) bySpan.set(key, []);
      bySpan.get(key)!.push(mark);
    }
    const out: Array<{ id: string; x: number; y: number; lap: number; direction: 'gain' | 'loss'; otherName: string }> = [];
    for (const group of bySpan.values()) {
      const count = group.length;
      group.forEach((mark, index) => {
        const length = spanLength(mark.startT, mark.endT);
        const t = (mark.startT + length * ((index + 1) / (count + 1))) % 1;
        const point = geometry.pointAtT(t);
        out.push({ id: mark.id, x: point.x, y: point.y, lap: mark.lap, direction: mark.direction, otherName: mark.otherName });
      });
    }
    return out;
  }, [passMarks, geometry]);

  /* Which section spans get a DIRECT label, and where. A compressed street
   * circuit (Detroit: 18 loop-to-loop families) piled every station code on top
   * of the next at phone width — "I6 → I7" over "I7 → I8" over "S/F" — an
   * unreadable text mound (the audit blocker). Two rules fix it, both here so no
   * label ever renders before it clears:
   *   1. Priority — the gold "strongest" anchors first (the card's whole point),
   *      then human-named features (a "Back straight"), then S/F, then the plain
   *      station codes. Every suppressed code is still one tap away in the tip.
   *   2. Collision detection — a label is kept only if its box clears every label
   *      already placed; on phones the direct labels are hard-capped at five. */
  const compactLabels = width > 0 && width < 500;
  const sectionLabels = useMemo(() => {
    if (!hasHeat || !sections?.showLabels || width === 0) return [];
    const pxOf = (visual: number) => visual / (width / viewWidth);
    type PlacedLabel = {
      familyId: string;
      /** Every section this label names (two for a merged "Turn 1"). */
      familyIds: string[];
      label: string;
      lx: number;
      ly: number;
      rank: number;
      percentile: number;
      halfW: number;
      halfH: number;
      t: number;
      leader?: { x1: number; y1: number; x2: number; y2: number } | null;
    };
    const candidateFor = (
      familyIds: string[],
      label: string,
      t: number,
      isTopSection: boolean,
      percentile: number
    ): PlacedLabel => {
        const mid = geometry.pointAtT(t);
        const away = Math.hypot(mid.x - center.x, mid.y - center.y) || 1;
        const hasWord = /[a-z]{3,}/.test(label); // a named feature, e.g. "Back straight"
        const isStartFinish = /S\/F/.test(label);
        const halfW = outside ? pxOf(label.length * labelPx * 0.28 + 3) : pxOf(label.length * labelPx * 0.29 + 4);
        const halfH = outside ? pxOf(labelPx * 0.62) : pxOf(labelPx * 0.62);
        /* The SVG paints with overflow visible. Vertically that's fine — the
         * card has room above and below — but the card is width-tight, so an
         * outward-pushed label near the outline's left/right edge spills past
         * the card and clips (the Detroit "I2A → I2" edge cut). Clamp X into the
         * viewBox; leave Y as the natural outward push so bottom labels still
         * sit clear of the outline. */
        const rawX = mid.x + ((mid.x - center.x) / away) * pxOf(16);
        const rawY = mid.y + ((mid.y - center.y) / away) * pxOf(16);
        return {
          familyId: familyIds[0],
          familyIds,
          label,
          lx: Math.min(Math.max(rawX, halfW + pxOf(2)), viewWidth - halfW - pxOf(2)),
          ly: rawY,
          rank: isTopSection ? 0 : hasWord ? 1 : isStartFinish ? 2 : 3,
          percentile,
          halfW,
          halfH,
          t
        };
    };
    const timed = heatSections.filter((section) => section.kind !== 'derived_remainder');
    /* A corner timed in two short pieces ("Turn 1 entry", "Turn 1 exit") gets
     * ONE label, "Turn 1", at the middle of the pair. Two labels for a few
     * hundred feet of track crowded the start/finish line at Laguna Seca (the
     * three-label cluster in the Nov 14 review). Each piece still reads out on
     * hover under its own name, and the bars and the grid keep both. */
    const pieceSuffix = /\s+(entry|exit)$/i;
    const pieces = new Map<string, ResolvedHeatSection[]>();
    for (const section of timed) {
      if (!pieceSuffix.test(section.label)) continue;
      const base = section.label.replace(pieceSuffix, '');
      pieces.set(base, [...(pieces.get(base) ?? []), section]);
    }
    const merged: PlacedLabel[] = [];
    const absorbed = new Set<string>();
    for (const [base, members] of pieces) {
      if (members.length < 2) continue;
      const chain = [...members].sort((left, right) => left.startT - right.startT);
      const joined = chain.every((section, index) => index === 0 || Math.abs(section.startT - chain[index - 1].endT) < 0.003);
      if (!joined) continue;
      for (const section of chain) absorbed.add(section.familyId);
      merged.push(
        candidateFor(
          chain.map((section) => section.familyId),
          base,
          spanMid(chain[0].startT, chain[chain.length - 1].endT),
          chain.some((section) => section.isTopSection),
          Math.max(...chain.map((section) => section.percentile))
        )
      );
    }
    const candidates: PlacedLabel[] = [
      ...timed
        .filter((section) => !absorbed.has(section.familyId))
        .map((section) =>
          candidateFor([section.familyId], section.label, spanMid(section.startT, section.endT), Boolean(section.isTopSection), section.percentile)
        ),
      ...merged
    ].sort((left, right) => left.rank - right.rank || right.percentile - left.percentile);
    /* The gold start/finish tick crosses the line well past the stroke, so a
     * label that only clears the line can still sit on the tick. Its points
     * join the obstacles both placements test against. */
    const startFinishPoints = outline.startFinish
      ? (() => {
          const sf = outline.startFinish;
          const angle = ((sf.angleDeg + 90) * Math.PI) / 180;
          const half = pxOf(8 * strokeScale) + pxOf(2);
          return Array.from({ length: 11 }, (_, k) => {
            const u = -half + (2 * half * k) / 10;
            return { x: sf.x + Math.cos(angle) * u, y: sf.y + Math.sin(angle) * u };
          });
        })()
      : [];

    /* Phones show only labels a family member can read cold: gold anchors,
     * named features, S/F. Plain station-code spans (rank 3) never fill in —
     * they live in the tap tooltip (the audit's arbitrary-filler fix). */
    const eligible = compactLabels ? candidates.filter((candidate) => candidate.rank < 3) : candidates;
    const cap = compactLabels ? 5 : eligible.length;
    const gap = pxOf(3);
    const kept: PlacedLabel[] = [];
    const clashes = (candidate: { lx: number; ly: number; halfW: number; halfH: number }) =>
      kept.some(
        (other) =>
          Math.abs(other.lx - candidate.lx) < other.halfW + candidate.halfW + gap &&
          Math.abs(other.ly - candidate.ly) < other.halfH + candidate.halfH + gap
      );
    if (!outside) {
      /* Inside placement: push each label out from the shape's centre by its
       * own half-size along that direction, so a 12 px label clears the line
       * instead of straddling it; one further step if the first spot still
       * touches the line, and otherwise the label stays in the tap tip. */
      const line = [...Array.from({ length: 480 }, (_, k) => geometry.pointAtT(k / 480)), ...startFinishPoints];
      const half = pxOf(3 * strokeScale);
      const touchesLine = (box: { lx: number; ly: number; halfW: number; halfH: number }) =>
        line.some((point) => {
          const dx = Math.max(Math.abs(point.x - box.lx) - box.halfW, 0);
          const dy = Math.max(Math.abs(point.y - box.ly) - box.halfH, 0);
          return Math.hypot(dx, dy) < half + pxOf(1.5);
        });
      for (const candidate of eligible) {
        if (kept.length >= cap) break;
        const mid = geometry.pointAtT(candidate.t);
        const away = Math.hypot(mid.x - center.x, mid.y - center.y) || 1;
        const ux = (mid.x - center.x) / away;
        const uy = (mid.y - center.y) / away;
        const extent = Math.abs(ux) * candidate.halfW + Math.abs(uy) * candidate.halfH;
        let placed: PlacedLabel | null = null;
        for (const step of [6, 14]) {
          const reach = half + pxOf(step) + extent;
          const box = {
            ...candidate,
            lx: Math.min(Math.max(mid.x + ux * reach, candidate.halfW + pxOf(2)), viewWidth - candidate.halfW - pxOf(2)),
            ly: mid.y + uy * reach
          };
          if (!touchesLine(box) && !clashes(box)) {
            placed = box;
            break;
          }
        }
        if (placed) kept.push(placed);
      }
      return kept;
    }

    /* Outside placement (the Tracks page, F5): a label never sits on the line
     * or on a section dot. For each label, step outward along the track's
     * normal at its span midpoint — the side away from the shape's centre
     * first — and keep the first spot whose box clears every point of the
     * line by the stroke's half-width plus a margin, clears every label
     * already placed, and stays inside the drawing's room. */
    const dense = [...Array.from({ length: 720 }, (_, k) => geometry.pointAtT(k / 720)), ...startFinishPoints];
    const strokeHalf = pxOf(3 * strokeScale);
    const clearance = strokeHalf + pxOf(4);
    const steps = [6, 16, 30, 48, 72].map((step) => strokeHalf + pxOf(step));
    const minX = -margin;
    const maxX = viewWidth + margin;
    const minY = -margin;
    const maxY = viewHeight + margin;
    for (const candidate of eligible) {
      if (kept.length >= cap) break;
      const mid = geometry.pointAtT(candidate.t);
      const ahead = geometry.pointAtT(candidate.t + 0.004);
      const behind = geometry.pointAtT(candidate.t - 0.004);
      const tx = ahead.x - behind.x;
      const ty = ahead.y - behind.y;
      const len = Math.hypot(tx, ty) || 1;
      let nx = -ty / len;
      let ny = tx / len;
      if (nx * (mid.x - center.x) + ny * (mid.y - center.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const sides = [
        { x: nx, y: ny },
        { x: -nx, y: -ny }
      ];
      let placed: PlacedLabel | null = null;
      for (let stepIndex = 0; stepIndex < steps.length && !placed; stepIndex += 1) {
        for (const side of sides) {
          const extent = Math.abs(side.x) * candidate.halfW + Math.abs(side.y) * candidate.halfH;
          const lx = mid.x + side.x * (steps[stepIndex] + extent);
          const ly = mid.y + side.y * (steps[stepIndex] + extent);
          const box = { lx, ly, halfW: candidate.halfW, halfH: candidate.halfH };
          if (lx - box.halfW < minX || lx + box.halfW > maxX || ly - box.halfH < minY || ly + box.halfH > maxY) continue;
          const onLine = dense.some((point) => {
            const dx = Math.max(Math.abs(point.x - lx) - box.halfW, 0);
            const dy = Math.max(Math.abs(point.y - ly) - box.halfH, 0);
            return Math.hypot(dx, dy) < clearance;
          });
          if (onLine || clashes(box)) continue;
          placed = {
            ...candidate,
            lx,
            ly,
            leader:
              stepIndex > 0
                ? {
                    x1: mid.x + side.x * (strokeHalf + pxOf(2)),
                    y1: mid.y + side.y * (strokeHalf + pxOf(2)),
                    x2: lx - side.x * (extent + pxOf(2)),
                    y2: ly - side.y * (extent + pxOf(2))
                  }
                : null
          };
          break;
        }
      }
      if (placed) kept.push(placed);
    }
    return kept;
  }, [hasHeat, sections?.showLabels, heatSections, geometry, center.x, center.y, width, viewWidth, viewHeight, compactLabels, outside, labelPx, strokeScale, margin, outline.startFinish]);

  const showPassTip = (mark: { x: number; y: number; lap: number; direction: 'gain' | 'loss'; otherName: string }) => {
    markTipActive.current = true;
    setHoveredFamily(null);
    setTip({
      x: toScreen(mark).x,
      y: toScreen(mark).y,
      title: `Lap ${mark.lap}`,
      /* Spatial words, Bryce-first, no signed numbers. */
      detail: mark.direction === 'gain' ? `past ${mark.otherName}` : `${mark.otherName} by him`,
      action: 'a pass involving Bryce · placed between timing loops'
    });
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (markTipActive.current) return;
    if (!hasHeat || event.pointerType === 'touch') return;
    const hit = nearestSample(event.clientX, event.clientY);
    if (!hit) return;
    if (hit.dist > px(18)) {
      setHoveredFamily(null);
      if (selectedIndex === null) setTip(null);
      return;
    }
    const found = heatSections.find((section) => sectionContainsT(section, hit.sample.t));
    if (!found) {
      setHoveredFamily(null);
      showUntimedTip(hit.sample);
      return;
    }
    setHoveredFamily(found.familyId);
    showTipFor(found, hit.sample);
  };

  const handleLeave = () => {
    setHoveredFamily(null);
    if (selectedIndex === null) setTip(null);
  };

  /* Touch / click: a tap ON an untimed stretch explains it; anywhere else
   * cycles through the timed sections (Brief E). */
  const handleActivate = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!hasHeat) return;
    const hit = nearestSample(event.clientX, event.clientY);
    if (hit && hit.dist <= px(18) && !heatSections.some((section) => sectionContainsT(section, hit.sample.t))) {
      setSelectedIndex(null);
      setHoveredFamily(null);
      showUntimedTip(hit.sample);
      return;
    }
    const next = selectedIndex === null ? 0 : (selectedIndex + 1) % heatSections.length;
    setSelectedIndex(next);
    setHoveredFamily(null);
    showTipFor(heatSections[next]);
  };
  /* The svg is centered in the (possibly wider) container; pin the wind pill
   * and north tick to the art itself, not the container edges. */
  const artInset = Math.max(0, (measuredWidth - width) / 2);
  /* Screen direction of true north (angle-from-up = northOffsetDeg). */
  const northRad = typeof outline.northOffsetDeg === 'number' ? (outline.northOffsetDeg * Math.PI) / 180 : null;

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        position: 'relative',
        display: 'flex',
        justifyContent: 'center',
        cursor: hasHeat ? 'crosshair' : 'default',
        touchAction: hasHeat ? 'manipulation' : undefined
      }}
      onPointerMove={hasHeat ? handleMove : undefined}
      onPointerLeave={hasHeat ? handleLeave : undefined}
      onClick={hasHeat ? handleActivate : undefined}
    >
      {width > 0 ? (
        <svg
          ref={svgRef}
          viewBox={margin > 0 ? `${-margin} ${-margin} ${viewWidth + margin * 2} ${viewHeight + margin * 2}` : outline.viewBox}
          width={svgWidth}
          height={width * (viewHeight / viewWidth) + room * 2}
          role="img"
          aria-label={
            hasHeat
              ? `${outline.name} track outline, sections shaded by Bryce's pace ${sections?.contextLabel ?? 'this race'}`
              : `${outline.name} track outline`
          }
          style={{ overflow: 'visible', display: 'block' }}
        >
          {hasHeat ? (
            <>
              {/* Base outline stays quiet everywhere; measured sections colour
                  over it, unmeasured stretches (e.g. the frontstretch) read as
                  the honest base line. */}
              <path
                d={outline.mainPath}
                fill="none"
                stroke="var(--grid-hairline)"
                strokeWidth={weight(2)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {heatSections.map((section) => {
                const focused = activeFamily === null || activeFamily === section.familyId;
                const color = inkGoldDiverging(section.percentile);
                if (section.kind === 'derived_remainder') {
                  /* The untimed stretches: a dotted line on the same heat scale
                     but a deliberately quieter, distinct texture — derived from
                     lap time, never mistakable for a measured timing loop. */
                  return section.renderSpans.map((span, index) => (
                    <path
                      key={`${section.familyId}-${index}`}
                      d={spanPolyline(span.startT, span.endT)}
                      fill="none"
                      stroke={color}
                      strokeWidth={weight(activeFamily === section.familyId ? 4 : 3)}
                      strokeLinecap="round"
                      strokeDasharray={`${px(0.1)} ${weight(5)}`}
                      style={{ opacity: focused ? 0.9 : 0.3, transition: 'opacity 150ms ease-out, stroke-width 150ms ease-out' }}
                    />
                  ));
                }
                return dashesFor(section.startT, section.endT).map((dash, index) => (
                  <path
                    key={`${section.familyId}-${index}`}
                    d={outline.mainPath}
                    fill="none"
                    pathLength={1}
                    stroke={color}
                    strokeWidth={weight(activeFamily === section.familyId ? 7.5 : 6)}
                    /* Thick lines (strokeScale > 1) meet their neighbours
                     * flush; round caps would bleed one colour into the next. */
                    strokeLinecap={strokeScale > 1 ? 'butt' : 'round'}
                    strokeDasharray={dash.dasharray}
                    strokeDashoffset={dash.dashoffset}
                    style={{ opacity: focused ? 1 : 0.35, transition: 'opacity 150ms ease-out, stroke-width 150ms ease-out' }}
                  />
                ));
              })}
            </>
          ) : progress === undefined ? (
            <path
              d={outline.mainPath}
              fill="none"
              stroke="var(--ink-primary)"
              strokeWidth={px(2)}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : (
            <>
              <path
                d={outline.mainPath}
                fill="none"
                stroke="var(--grid-hairline)"
                strokeWidth={px(2)}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={outline.mainPath}
                fill="none"
                stroke="var(--ink-primary)"
                strokeWidth={px(2.4)}
                strokeLinejoin="round"
                strokeLinecap="round"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1 - Math.max(0, Math.min(1, progress))}
                className="track-art__progress"
              />
            </>
          )}
          {outline.startFinish ? (
            <g
              transform={`translate(${outline.startFinish.x} ${outline.startFinish.y}) rotate(${outline.startFinish.angleDeg + 90})`}
            >
              <line x1={-weight(8)} x2={weight(8)} stroke="var(--bryce)" strokeWidth={weight(3.5)} strokeLinecap="round" />
            </g>
          ) : null}
          {/* Section anchors: gold dots on the top-2 stretches, quiet ink ticks
              on the others (Brief E). */}
          {hasHeat
            ? heatSections.map((section) => {
                if (section.kind === 'derived_remainder') return null; // no loop dot on a derived stretch
                const mid = geometry.pointAtT(spanMid(section.startT, section.endT));
                return section.isTopSection ? (
                  <circle key={`dot-${section.familyId}`} cx={mid.x} cy={mid.y} r={weight(strokeScale > 1 ? 2.6 : 4)} fill={strokeScale > 1 ? 'var(--ink-primary)' : 'var(--bryce)'} stroke={strokeScale > 1 ? 'var(--bryce)' : undefined} strokeWidth={strokeScale > 1 ? px(2) : undefined} />
                ) : (
                  <circle key={`dot-${section.familyId}`} cx={mid.x} cy={mid.y} r={strokeScale > 1 ? px(2.6) : px(2.5)} fill="var(--ink-primary)" />
                );
              })
            : null}
          {/* Direct section labels (Brief H #1): priority-ranked, collision-
              detected, phone-capped. Suppressed codes stay one tap away. */}
          {sectionLabels.map((entry) => (
            <g key={`label-${entry.familyId}`} style={{ pointerEvents: 'none' }}>
              {entry.leader ? (
                <line
                  x1={entry.leader.x1}
                  y1={entry.leader.y1}
                  x2={entry.leader.x2}
                  y2={entry.leader.y2}
                  stroke="var(--ink-faint)"
                  strokeWidth={px(1)}
                />
              ) : null}
              <text
                x={entry.lx}
                y={entry.ly}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={outside && activeFamily !== null && entry.familyIds.includes(activeFamily) ? 'var(--ink-primary)' : 'var(--ink-secondary)'}
                fontFamily={chartFont}
                fontSize={px(labelPx)}
                fontWeight={500}
              >
                {entry.label}
              </text>
            </g>
          ))}
          {/* Pass marks (heat-map v2): quiet open circles on the spans where a
              green Bryce pass happened; hover reads lap · direction · other car. */}
          {placedMarks.map((mark) => (
            <g key={`pass-${mark.id}`}>
              <circle
                cx={mark.x}
                cy={mark.y}
                r={px(3.6)}
                fill="var(--surface-1)"
                stroke="var(--ink-secondary)"
                strokeWidth={px(1.5)}
                style={{ pointerEvents: 'none' }}
              />
              <circle
                cx={mark.x}
                cy={mark.y}
                r={px(11)}
                fill="transparent"
                data-pass-mark={mark.id}
                aria-label={`Lap ${mark.lap}: a pass involving Bryce, ${mark.direction === 'gain' ? `past ${mark.otherName}` : `${mark.otherName} by him`}`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => showPassTip(mark)}
                onMouseLeave={() => {
                  markTipActive.current = false;
                  setTip(null);
                }}
              />
            </g>
          ))}
          {outline.cornerArcs
            .filter((arc) => arc.label)
            .map((arc) => {
              const away = Math.hypot(arc.apex.x - center.x, arc.apex.y - center.y) || 1;
              const offsetX = ((arc.apex.x - center.x) / away) * px(20);
              const offsetY = ((arc.apex.y - center.y) / away) * px(20);
              const annotated = annotation != null && arc.label === annotation.corner;
              return (
                <g key={arc.label}>
                  {annotated ? (
                    <>
                      <circle cx={arc.apex.x} cy={arc.apex.y} r={px(4)} fill="var(--bryce)" />
                      <circle
                        cx={arc.apex.x}
                        cy={arc.apex.y}
                        r={px(13)}
                        fill="transparent"
                        style={{ cursor: 'default' }}
                        onMouseEnter={() =>
                          setTip({
                            x: toScreen(arc.apex).x,
                            y: toScreen(arc.apex).y,
                            title: `Turn ${annotation.corner}`,
                            detail: annotation.note
                          })
                        }
                        onMouseLeave={() => setTip(null)}
                      />
                    </>
                  ) : null}
                  {showCornerLabels ? (
                    <text
                      x={arc.apex.x + offsetX}
                      y={arc.apex.y + offsetY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="var(--ink-muted)"
                      fontFamily={chartFont}
                      fontSize={px(12)}
                      fontWeight={500}
                      style={{ pointerEvents: 'none' }}
                    >
                      {arc.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
        </svg>
      ) : null}
      {wind && typeof outline.northOffsetDeg === 'number' && northRad !== null ? (
        <>
          <div
            className="track-wind"
            style={{ left: artInset }}
            title={`Near-track wind${wind.frame ? ` (${wind.frame})` : ''} ${wind.label} (modeled, not official)`}
            aria-label={`Near-track wind${wind.frame ? ` ${wind.frame}` : ''} ${wind.label}`}
          >
            {wind.frame ? <span className="track-wind__frame">{wind.frame}</span> : null}
            {/* Calm (or no sourced direction) draws no arrow — a bearing for
             * still air is meaningless; the label just reads "calm". */}
            {wind.bearingDeg !== null ? (
              <svg
                width={22}
                height={22}
                viewBox="0 0 22 22"
                aria-hidden
                /* Flow arrow: points the way the air moves across the track
                 * (bearing is the FROM direction, so it blows toward +180),
                 * turned to true north by the outline's geographic offset. */
                style={{ transform: `rotate(${wind.bearingDeg + 180 + outline.northOffsetDeg}deg)` }}
              >
                <line x1={11} y1={17.5} x2={11} y2={5} stroke="var(--ink-secondary)" strokeWidth={1.6} strokeLinecap="round" />
                <path d="M11 3.2 L15 8.4 L11 6.7 L7 8.4 Z" fill="var(--ink-secondary)" />
              </svg>
            ) : null}
            <span className="track-wind__label">{wind.label}</span>
          </div>
          {/* True-north reference: a hairline tick + upright "N" in tertiary
           * ink, rotated by the same geographic offset as the arrow, so the
           * wind direction is read against north — not screen-up. Drops with the
           * arrow when the wind is calm (nothing to orient). */}
          {wind.bearingDeg !== null ? (
          <div className="track-north" style={{ right: artInset }} aria-hidden>
            <svg width={30} height={30} viewBox="0 0 30 30" style={{ overflow: 'visible', display: 'block' }}>
              <line
                x1={15 + Math.sin(northRad) * 3.5}
                y1={15 - Math.cos(northRad) * 3.5}
                x2={15 + Math.sin(northRad) * 9.5}
                y2={15 - Math.cos(northRad) * 9.5}
                stroke="var(--ink-muted)"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
              <text
                x={15 + Math.sin(northRad) * 14}
                y={15 - Math.cos(northRad) * 14}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={12}
                fontWeight={500}
              >
                N
              </text>
            </svg>
          </div>
          ) : null}
        </>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={measuredWidth} /> : null}
    </div>
  );
};

/* ---------- the small track icon: the 3D model from above ----------
 * Round 7 (Jack's review of Nov 16): the small line drawings on /races and on
 * the Race Week board become "a bird's eye view of the 3D tracks", with the
 * outline "as visible as it is right now". Each icon is the venue's own 3D
 * model (public/tracks-3d/models, drawn by src/three/trackScene.js) from
 * straight above, turned to sit the way the line drawing does, the land paled
 * toward the paper and the track drawn as a bold ink ribbon on the model's own
 * centreline. Made by Portfolio/builds/project-brycecast/site-refresh/
 * stills-tools (run.sh icons: icon-stills.mjs, icon-page.js, finish_icons.py)
 * into public/tracks-3d/icons/<slug>-<box>(@2x).webp, one per box:
 *   row    76 x 42 CSS px (the Races list)
 *   board  132 x 84 CSS px (the Race Week board)
 * A venue with no model keeps its line drawing (`fallback`), and ?icons=line
 * shows the line drawings everywhere, for comparison.
 * Two looks (round 7): A, straight above, the land paled and feathered
 * (<slug>-<box>.webp); B, the whole plate tilted 14 degrees in the stills' own
 * colours with its real edge (<slug>-<box>-b.webp, icon-stills.mjs --plate,
 * ICON_VARIANT=b finish_icons.py). DEFAULT_ICON_LOOK picks one; ?icons=a and
 * ?icons=b show either. */

/** Venues with a bird's-eye icon (public/tracks-3d/icons/index.json lists the same). */
export const TRACK_ICON_SLUGS: ReadonlySet<string> = new Set([
  'barber-motorsports-park',
  'indianapolis-motor-speedway-road-course',
  'iowa-speedway',
  'mid-ohio-sports-car-course',
  'nashville-superspeedway',
  'portland-international-raceway',
  'road-america',
  'streets-of-arlington',
  'streets-of-detroit',
  'streets-of-st-petersburg',
  'the-milwaukee-mile',
  'weathertech-raceway-laguna-seca',
  'world-wide-technology-raceway',
  // modelled for the icons only (not on the Tracks page): the oval from the IMS road course's OSM data; Phoenix
  // and Long Beach from OSM (round 7)
  'indianapolis-motor-speedway',
  'phoenix-raceway',
  'streets-of-long-beach'
]);

const DEFAULT_ICON_LOOK: 'a' | 'b' = 'a';   // B shrinks the ovals at 76 px (the plate is wider than the track)
const ICON_LOOK: 'line' | 'a' | 'b' = (() => {
  try {
    const q = switchValue('icons');
    return q === 'line' || q === 'a' || q === 'b' ? q : DEFAULT_ICON_LOOK;
  } catch {
    return DEFAULT_ICON_LOOK;
  }
})();

export type TrackIconBox = 'row' | 'board';

export const TrackIcon = ({
  slug,
  box,
  fallback = null,
  muted = false,
  alt = ''
}: {
  slug: string | null | undefined;
  box: TrackIconBox;
  /** Drawn where the venue has no icon (the line drawing). */
  fallback?: ReactNode;
  /** A venue he has no race at: the icon steps back, as the muted line did. */
  muted?: boolean;
  alt?: string;
}) => {
  const [failed, setFailed] = useState(false);
  if (!slug || ICON_LOOK === 'line' || failed || !TRACK_ICON_SLUGS.has(slug)) return <>{fallback}</>;
  const [w, h] = box === 'row' ? [76, 42] : [132, 84];
  const base = `/tracks-3d/icons/${slug}-${box}${ICON_LOOK === 'b' ? '-b' : ''}`;
  return (
    <img
      className={`track-icon track-icon--${box}${muted ? ' track-icon--muted' : ''}`}
      src={`${base}.webp`}
      srcSet={`${base}.webp 1x, ${base}@2x.webp 2x`}
      width={w}
      height={h}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};
