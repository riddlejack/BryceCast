import { useMemo, useRef, useState } from 'react';
import type { TrackOutline } from '../assets/tracks';
import type { ResolvedHeatSection } from '../data/sectionObservations';
import { ChartTipCard, chartFont, inkGoldDiverging, useMeasuredWidth, type ChartTip } from './charts';
import { ordinal } from './format';

/** The heat-map / section-intelligence layer (Brief H). `resolved` carries the
 *  curated section spans already joined to Bryce's percentile for the scope;
 *  TrackArt draws them, labels them, and runs the nearest-point hover. */
export interface TrackSectionsLayer {
  resolved: ResolvedHeatSection[];
  /** Persistent official labels beside each span (card: true, hero: false). */
  showLabels?: boolean;
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
  wind
}: {
  outline: TrackOutline;
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
  /** Near-track wind, drawn as a quiet flow arrow beside the shape and turned
   *  to true north via the outline's geographic orientation. Rendered ONLY for
   *  real-geo (OSM) outlines that carry northOffsetDeg — image-traced street
   *  circuits have no orientation, so the wind is honestly omitted there.
   *  bearingDeg is the compass direction the wind blows FROM (0=N, 90=E). */
  wind?: { bearingDeg: number; label: string } | null;
}) => {
  const [ref, measuredWidth] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /* Active section by family id: hover (mouse) or the touch-cycle selection. */
  const [hoveredFamily, setHoveredFamily] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
  const aspect = viewHeight / viewWidth;
  const width = maxHeight !== undefined ? Math.min(measuredWidth, maxHeight / aspect) : measuredWidth;
  const scale = width > 0 ? width / viewWidth : 1;
  const px = (visual: number) => visual / scale;
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
    const anchorPt = at ?? geometry.pointAtT(spanMid(section.startT, section.endT));
    const offset = Math.max(0, (measuredWidth - width) / 2);
    const pct = Math.round(section.percentile * 100);
    if (section.kind === 'derived_remainder') {
      setTip({
        x: anchorPt.x * scale + offset,
        y: anchorPt.y * scale,
        title: 'The rest of the lap, together',
        detail: `${ordinal(pct)} percentile this race`,
        action: section.combined
          ? 'combined untimed stretches · derived from lap time'
          : 'derived from lap time minus timed sections'
      });
      return;
    }
    setTip({
      x: anchorPt.x * scale + offset,
      y: anchorPt.y * scale,
      title: section.label,
      detail: `beat ${pct}% of the field this race`
    });
  };

  /** Nearest path sample to a client-space pointer position, with distance in
   *  viewBox units — shared by hover and tap so both honor the same hit radius. */
  const nearestSample = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * viewWidth;
    const vy = ((clientY - rect.top) / rect.height) * viewHeight;
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
    const offset = Math.max(0, (measuredWidth - width) / 2);
    setTip({
      x: sample.x * scale + offset,
      y: sample.y * scale,
      title: 'No timing loops on this stretch',
      detail: 'officially untimed'
    });
  };

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
          viewBox={outline.viewBox}
          width={width}
          height={width * (viewHeight / viewWidth)}
          role="img"
          aria-label={
            hasHeat
              ? `${outline.name} track outline, sections shaded by Bryce's pace`
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
                strokeWidth={px(2)}
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
                      strokeWidth={px(activeFamily === section.familyId ? 4 : 3)}
                      strokeLinecap="round"
                      strokeDasharray={`${px(0.1)} ${px(5)}`}
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
                    strokeWidth={px(activeFamily === section.familyId ? 7.5 : 6)}
                    strokeLinecap="round"
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
              <line x1={-px(8)} x2={px(8)} stroke="var(--bryce)" strokeWidth={px(3.5)} strokeLinecap="round" />
            </g>
          ) : null}
          {/* Section anchors: gold dots on the top-2 stretches, quiet ink ticks
              on the others (Brief E). */}
          {hasHeat
            ? heatSections.map((section) => {
                if (section.kind === 'derived_remainder') return null; // no loop dot on a derived stretch
                const mid = geometry.pointAtT(spanMid(section.startT, section.endT));
                return section.isTopSection ? (
                  <circle key={`dot-${section.familyId}`} cx={mid.x} cy={mid.y} r={px(4)} fill="var(--bryce)" />
                ) : (
                  <circle key={`dot-${section.familyId}`} cx={mid.x} cy={mid.y} r={px(2.5)} fill="var(--ink-primary)" />
                );
              })
            : null}
          {/* Official section labels beside each span (Brief H #1). */}
          {hasHeat && sections?.showLabels
            ? heatSections.map((section) => {
                if (section.kind === 'derived_remainder') return null; // derived stretches stay label-free; the key line names them
                const mid = geometry.pointAtT(spanMid(section.startT, section.endT));
                const away = Math.hypot(mid.x - center.x, mid.y - center.y) || 1;
                const lx = mid.x + ((mid.x - center.x) / away) * px(16);
                const ly = mid.y + ((mid.y - center.y) / away) * px(16);
                return (
                  <text
                    key={`label-${section.familyId}`}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="var(--ink-secondary)"
                    fontFamily={chartFont}
                    fontSize={px(10.5)}
                    fontWeight={500}
                    style={{ pointerEvents: 'none' }}
                  >
                    {section.label}
                  </text>
                );
              })
            : null}
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
                            x: arc.apex.x * scale + Math.max(0, (measuredWidth - width) / 2),
                            y: arc.apex.y * scale,
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
                      fontSize={px(11.5)}
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
            title={`Near-track wind ${wind.label} (modeled, not official)`}
            aria-label={`Near-track wind ${wind.label}`}
          >
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
            <span className="track-wind__label">{wind.label}</span>
          </div>
          {/* True-north reference: a hairline tick + upright "N" in tertiary
           * ink, rotated by the same geographic offset as the arrow, so the
           * wind direction is read against north — not screen-up. */}
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
                fontSize={8}
                fontWeight={500}
              >
                N
              </text>
            </svg>
          </div>
        </>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={measuredWidth} /> : null}
    </div>
  );
};
