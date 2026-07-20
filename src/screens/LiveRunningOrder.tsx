import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { Unavailable } from '../app/components';
import type { LiveHistorySample, LiveSessionHistory } from '../data/liveHistoryModel';
import {
  RUNNING_ORDER_LANE_COUNT,
  detectBryceRunningOrderCrossings,
  fullFieldRunningOrderSeries,
  lastRunningOrderChange,
  nearestRunningOrderSegment,
  resolveRunningOrderLadder,
  runningOrderCautionSpans,
  runningOrderDomainFor,
  runningOrderFrameForSample,
  runningOrderGapWords,
  runningOrderIdentityStyle,
  runningOrderPointSegments,
  runningOrderProximityStyle,
  runningOrderTimeDomain,
  sampleIndexAtOrBefore,
  type RenderedRunningOrderSegment,
  type RunningOrderDomain,
  type RunningOrderPoint,
  type RunningOrderSeries
} from '../data/liveRunningOrderModel';

const LADDER_GUTTER_PX = 130;
const CAMERA_EASE_MS = 400;

const useReducedMotion = () => {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduced;
};

const useLaneCamera = (
  target: number | null,
  laneHeight: number,
  reducedMotion: boolean,
  sessionKey: string | null
) => {
  const [center, setCenter] = useState<number | null>(target);
  const [offsetY, setOffsetY] = useState(0);
  const [moving, setMoving] = useState(false);
  const previousTarget = useRef<number | null>(target);
  const previousSession = useRef(sessionKey);

  useLayoutEffect(() => {
    if (target === null) return;
    const previous = previousTarget.current;
    const sessionChanged = previousSession.current !== sessionKey;
    previousSession.current = sessionKey;
    previousTarget.current = target;
    if (previous === null || previous === target || reducedMotion || sessionChanged) {
      setMoving(false);
      setCenter(target);
      setOffsetY(0);
      return;
    }
    setMoving(false);
    setCenter(target);
    setOffsetY((target - previous) * laneHeight);
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setMoving(true);
        setOffsetY(0);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [laneHeight, reducedMotion, sessionKey, target]);

  return { center, offsetY, moving };
};

const stepPath = (
  points: RunningOrderPoint[],
  x: (value: number) => number,
  y: (value: number) => number
): string => points.reduce((path, point, index) => {
  if (point.rank === null) return path;
  if (index === 0) return `M${x(point.checkedAtMs)} ${y(point.rank)}`;
  return `${path}H${x(point.checkedAtMs)}V${y(point.rank)}`;
}, '');

const pixelSegments = (
  series: RunningOrderSeries,
  segments: RunningOrderPoint[][],
  x: (value: number) => number,
  y: (value: number) => number
): RenderedRunningOrderSegment[] => segments.flatMap((segment) => segment.slice(1).flatMap((point, index) => {
  const previous = segment[index];
  if (previous.rank === null || point.rank === null) return [];
  const horizontal: RenderedRunningOrderSegment = {
    driverId: series.id,
    x1: x(previous.checkedAtMs),
    y1: y(previous.rank),
    x2: x(point.checkedAtMs),
    y2: y(previous.rank),
    checkedAtMs: previous.checkedAtMs,
    rank: previous.rank,
    kind: 'horizontal'
  };
  if (previous.rank === point.rank) return [horizontal];
  return [horizontal, {
    driverId: series.id,
    x1: x(point.checkedAtMs),
    y1: y(previous.rank),
    x2: x(point.checkedAtMs),
    y2: y(point.rank),
    checkedAtMs: point.checkedAtMs,
    rank: point.rank,
    kind: 'vertical'
  } satisfies RenderedRunningOrderSegment];
}));

const relativeTimeLabel = (offsetMs: number): string => {
  if (Math.abs(offsetMs) < 500) return 'now';
  const seconds = Math.round(Math.abs(offsetMs) / 1_000);
  if (seconds < 60) return `−${seconds}s`;
  const minutes = seconds / 60;
  return `−${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`;
};

const relativeTicks = (domain: { startMs: number; endMs: number }, width: number): number[] => {
  const spanSeconds = Math.max(0.001, (domain.endMs - domain.startMs) / 1_000);
  const target = width < 520 ? 3 : 6;
  const idealStep = spanSeconds / Math.max(1, target - 1);
  const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find((candidate) => candidate >= idealStep) ?? steps.at(-1)!;
  const offsets = [];
  for (let offset = Math.floor(spanSeconds / step) * step; offset > 0; offset -= step) offsets.push(offset);
  return [...offsets.map((offset) => domain.endMs - offset * 1_000), domain.endMs];
};

const LAP_TICK_MIN_GAP_PX = 32;

const lapBoundariesFor = (
  history: LiveSessionHistory,
  domain: { startMs: number; endMs: number },
  toX: (checkedAtMs: number) => number,
  minGapPx = LAP_TICK_MIN_GAP_PX
): Array<{ lap: number; checkedAtMs: number }> => {
  const boundaries: Array<{ lap: number; checkedAtMs: number }> = [];
  history.samples.forEach((sample) => {
    if (sample.checkedAtMs < domain.startMs || sample.checkedAtMs > domain.endMs || sample.lap === null) return;
    if (boundaries.at(-1)?.lap !== sample.lap) boundaries.push({ lap: sample.lap, checkedAtMs: sample.checkedAtMs });
  });
  // Collision-filter the lap labels in pixel space, walking right (newest) to
  // left: always keep the newest lap tick — the live edge must read its true
  // lap — then drop any earlier label that would land within minGapPx of the
  // last one we kept. This declutters the crowded right edge (where breakpoints,
  // and thus lap changes, bunch up) instead of the uniform-stride thinning that
  // could still leave ticks overlapping there.
  const kept: Array<{ lap: number; checkedAtMs: number }> = [];
  let lastKeptX = Number.POSITIVE_INFINITY;
  for (let index = boundaries.length - 1; index >= 0; index -= 1) {
    const candidateX = toX(boundaries[index].checkedAtMs);
    if (kept.length === 0 || Math.abs(lastKeptX - candidateX) >= minGapPx) {
      kept.push(boundaries[index]);
      lastKeptX = candidateX;
    }
  }
  return kept.reverse();
};

const isLappedUpstream = (row: Record<string, unknown>, bryceRank: number, bryceLaps: number | null): boolean => {
  const rank = Number(row.liveRank ?? row.rank);
  if (!Number.isFinite(rank) || rank >= bryceRank) return false;
  const rowLaps = Number(row.laps);
  if (bryceLaps !== null && Number.isFinite(rowLaps) && rowLaps < bryceLaps) return true;
  return /(?:^|\s)\d+\s+laps?\b|lap\s+down|lapped/i.test([row.diff, row.gap, row.status, row.comment].join(' '));
};

export const LiveRunningOrder = ({
  history,
  clockCheckedAt,
  replayEnded = false
}: {
  history: LiveSessionHistory | null;
  clockCheckedAt?: string | null;
  /** True only when a simulated replay has run its distance and gone cold. The
   *  time axis still shows a gap past the last sample, but nothing more is
   *  coming — so the status reads "end of the capture", never "waiting on live
   *  timing…" (the same defect the pre-session/ended hero already retired). */
  replayEnded?: boolean;
}) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const series = useMemo(() => fullFieldRunningOrderSeries(history), [history]);
  const latestSample = history?.samples.at(-1) ?? null;
  const currentFrame = useMemo(() => latestSample ? runningOrderFrameForSample(latestSample) : [], [latestSample]);
  const currentBryce = latestSample ? currentFrame.find((entry) => entry.id === latestSample.bryceId) ?? null : null;
  const maximumRank = Math.max(RUNNING_ORDER_LANE_COUNT, ...currentFrame.map((entry) => entry.rank));
  const targetDomain = currentBryce ? runningOrderDomainFor(currentBryce.rank, maximumRank) : null;
  const timeDomain = useMemo(() => runningOrderTimeDomain(history, clockCheckedAt), [clockCheckedAt, history]);

  const height = 318;
  const margin = { top: 29, right: LADDER_GUTTER_PX, bottom: 42, left: 44 };
  const plotWidth = Math.max(width - margin.left - margin.right, 110);
  const plotHeight = height - margin.top - margin.bottom;
  const laneHeight = plotHeight / (RUNNING_ORDER_LANE_COUNT - 1);
  const plotRight = margin.left + plotWidth;
  const { center, offsetY, moving } = useLaneCamera(
    targetDomain?.center ?? null,
    laneHeight,
    reducedMotion,
    history?.sessionKey ?? null
  );
  const domain: RunningOrderDomain | null = center === null
    ? targetDomain
    : { lower: center - Math.floor(RUNNING_ORDER_LANE_COUNT / 2), upper: center + Math.floor(RUNNING_ORDER_LANE_COUNT / 2), center };
  const x = (checkedAtMs: number) => timeDomain
    ? margin.left + ((checkedAtMs - timeDomain.startMs) / Math.max(1, timeDomain.endMs - timeDomain.startMs)) * plotWidth
    : margin.left;
  const y = (rank: number) => domain ? margin.top + (rank - domain.lower) * laneHeight : margin.top + plotHeight / 2;
  const sceneY = (rank: number) => y(rank) + offsetY;

  const rendered = useMemo(() => series.map((entry) => {
    const segments = timeDomain ? runningOrderPointSegments(entry.points, timeDomain.startMs, timeDomain.endMs) : [];
    return { entry, segments };
  }), [series, timeDomain]);
  const renderedPixelSegments = useMemo(
    () => rendered.flatMap(({ entry, segments }) => pixelSegments(entry, segments, x, sceneY)),
    // x and sceneY are render-local scale closures; their scalar dependencies make this deterministic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [domain?.lower, offsetY, plotWidth, rendered, timeDomain?.endMs, timeDomain?.startMs]
  );

  const currentById = new Map(currentFrame.map((entry) => [entry.id, entry]));
  const identityById = new Map(series.map((entry) => [entry.id, entry]));
  const nearestAhead = currentBryce
    ? currentFrame.filter((entry) => entry.rank < currentBryce.rank).sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))[0] ?? null
    : null;
  const nearestBehind = currentBryce
    ? currentFrame.filter((entry) => entry.rank > currentBryce.rank).sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))[0] ?? null
    : null;
  const ladder = targetDomain ? resolveRunningOrderLadder(currentFrame, targetDomain) : [];
  const crossings = useMemo(() => detectBryceRunningOrderCrossings(history), [history]);
  const cautionSpans = useMemo(() => runningOrderCautionSpans(history?.samples ?? [], timeDomain?.endMs), [history, timeDomain?.endMs]);
  const xTicks = timeDomain ? relativeTicks(timeDomain, plotWidth) : [];
  const lapBoundaries = history && timeDomain ? lapBoundariesFor(history, timeDomain, x) : [];
  const clipId = `running-order-${history?.sessionKey.replace(/[^a-z0-9]/gi, '-') ?? 'empty'}`;
  const sceneTransition = moving ? `transform ${CAMERA_EASE_MS}ms cubic-bezier(0.23, 1, 0.32, 1)` : 'none';
  const latestFrameIds = new Set(currentFrame.map((entry) => entry.id));
  const liveEndpointX = timeDomain && latestSample ? x(latestSample.checkedAtMs) : null;
  const currentBryceRow = latestSample?.rows.find((row) => String(row.driverId ?? row.DriverID ?? row.no ?? '').trim() === latestSample.bryceId) ?? null;
  const bryceLaps = currentBryceRow && Number.isFinite(Number(currentBryceRow.laps)) ? Number(currentBryceRow.laps) : null;
  const lappedUpstream = latestSample && currentBryce
    ? latestSample.rows.filter((row) => isLappedUpstream(row, currentBryce.rank, bryceLaps))
    : [];

  const tipFor = (driverId: string, sampleIndex: number, tipX: number, tipY: number): ChartTip | null => {
    if (!history) return null;
    const sample = history.samples[sampleIndex];
    const entry = runningOrderFrameForSample(sample).find((candidate) => candidate.id === driverId);
    const identity = series.find((candidate) => candidate.id === driverId);
    if (!entry || !identity) return null;
    const gap = runningOrderGapWords(sample, driverId);
    const change = lastRunningOrderChange(history, driverId, sampleIndex);
    return {
      x: tipX,
      y: tipY,
      title: identity.bryce ? `${identity.name} · №9` : identity.name,
      detail: [
        `P${entry.rank}`,
        gap === '—' ? 'gap to Bryce unavailable' : gap,
        change ? `${change.text}${change.lap === null ? '' : `, lap ${change.lap}`}` : 'position unchanged in this view'
      ].join(' · ')
    };
  };

  const clearFocus = () => {
    setFocusedId(null);
    setTip(null);
  };

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !history || !timeDomain) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    if (cursorX < margin.left || cursorX > plotRight || cursorY < margin.top || cursorY > margin.top + plotHeight) {
      clearFocus();
      return;
    }
    const hit = nearestRunningOrderSegment(renderedPixelSegments, cursorX, cursorY);
    if (!hit) {
      clearFocus();
      return;
    }
    const cursorTime = timeDomain.startMs + ((cursorX - margin.left) / plotWidth) * (timeDomain.endMs - timeDomain.startMs);
    const sampleIndex = sampleIndexAtOrBefore(history, cursorTime);
    const nextTip = tipFor(hit.driverId, sampleIndex, hit.x, hit.y);
    if (!nextTip) {
      clearFocus();
      return;
    }
    setFocusedId(hit.driverId);
    setTip(nextTip);
  };

  return (
    <div ref={ref} className="live-running-order">
      {width > 0 && history && history.samples.length >= 2 && latestSample && currentBryce && domain && targetDomain && timeDomain ? (
        <>
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label="Official running position for the cars around Bryce over the trailing five minutes"
            data-running-order-chart="true"
            data-session-key={history.sessionKey}
            data-source-checked-at={latestSample.checkedAt}
            data-source-sample-count={history.samples.length}
            data-clock-checked-at={clockCheckedAt ?? latestSample.checkedAt}
            data-time-domain-start={new Date(timeDomain.startMs).toISOString()}
            data-time-domain-end={new Date(timeDomain.endMs).toISOString()}
            data-time-domain-span-ms={timeDomain.endMs - timeDomain.startMs}
            data-window-growing={timeDomain.growing ? 'true' : 'false'}
            data-ordering-waiting={timeDomain.waiting ? 'true' : 'false'}
            data-plot-left={margin.left}
            data-now-x={plotRight.toFixed(2)}
            data-latest-sample-x={liveEndpointX?.toFixed(2) ?? ''}
            data-history-touches-now={liveEndpointX !== null && Math.abs(liveEndpointX - plotRight) < 0.01 ? 'true' : 'false'}
            data-ladder-gutter-px={LADDER_GUTTER_PX}
            data-lane-lower={targetDomain.lower}
            data-lane-upper={targetDomain.upper}
            data-camera-target-center={targetDomain.center}
            data-camera-rendered-center={domain.center}
            data-camera-offset-y={offsetY.toFixed(2)}
            data-camera-easing={reducedMotion ? 'off' : 'on'}
            data-focused-driver-id={focusedId ?? ''}
            data-visible-driver-ids={ladder.map((entry) => entry.id).join(',')}
            data-lapped-upstream-count={lappedUpstream.length}
            onMouseMove={onMove}
            onMouseLeave={clearFocus}
          >
            <defs>
              <clipPath id={clipId}><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath>
              <clipPath id={`${clipId}-scene`}><rect x={0} y={margin.top - 16} width={width} height={plotHeight + 32} /></clipPath>
            </defs>
            <g clipPath={`url(#${clipId})`}>
              {cautionSpans.filter((span) => span.endMs >= timeDomain.startMs && span.startMs <= timeDomain.endMs).map((span, index) => {
                const left = x(Math.max(span.startMs, timeDomain.startMs));
                const right = x(Math.min(span.endMs, timeDomain.endMs));
                return <rect key={`${span.startMs}-${index}`} data-caution-span x={left} y={margin.top} width={Math.max(2, right - left)} height={plotHeight} fill="var(--status-warn-dot)" opacity={0.1} />;
              })}
            </g>
            <g clipPath={`url(#${clipId}-scene)`}>
              <g className="live-running-order__scene" style={{ transform: `translateY(${offsetY}px)`, transition: sceneTransition }}>
              {Array.from({ length: RUNNING_ORDER_LANE_COUNT }, (_, index) => targetDomain.lower + index).map((rank) => (
                <g key={rank}>
                  <line x1={margin.left} x2={plotRight} y1={y(rank)} y2={y(rank)} stroke="var(--grid-hairline)" />
                  <text x={margin.left - 8} y={y(rank)} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5} style={{ fontVariantNumeric: 'tabular-nums' }}>P{rank}</text>
                </g>
              ))}
              </g>
            </g>
              <g clipPath={`url(#${clipId})`}>
                <g className="live-running-order__marks" style={{ transform: `translateY(${offsetY}px)`, transition: sceneTransition }}>
                {rendered.filter(({ entry }) => !entry.bryce).flatMap(({ entry, segments }) => {
                  const current = currentById.get(entry.id);
                  const delta = current && currentBryce ? current.rank - currentBryce.rank : Number.POSITIVE_INFINITY;
                  const atEdge = Boolean(current && (current.rank === targetDomain.lower || current.rank === targetDomain.upper));
                  const style = runningOrderProximityStyle(delta, atEdge);
                  const identityStyle = runningOrderIdentityStyle(entry.id, entry.startPosition);
                  const isFocused = focusedId === entry.id;
                  const opacity = isFocused ? 1 : style.opacity * (focusedId ? 0.22 : 1);
                  return segments.map((segment, index) => (
                    <path
                      key={`${entry.id}-${index}`}
                      data-running-order-series
                      data-driver-id={entry.id}
                      data-line-pattern={identityStyle.name}
                      data-current-rank={current?.rank ?? ''}
                      data-live-endpoint-x={latestFrameIds.has(entry.id) && segment.at(-1)?.checkedAtMs === latestSample.checkedAtMs ? liveEndpointX?.toFixed(2) : undefined}
                      d={stepPath(segment, x, y)}
                      fill="none"
                      stroke="var(--ink-primary)"
                      strokeWidth={isFocused ? Math.max(style.strokeWidth, 2) : style.strokeWidth}
                      strokeOpacity={opacity}
                      strokeDasharray={identityStyle.dashArray ?? undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transition: 'stroke-opacity 150ms cubic-bezier(0.23, 1, 0.32, 1)' }}
                    />
                  ));
                })}
                {rendered.filter(({ entry }) => entry.bryce).flatMap(({ entry, segments }) => segments.map((segment, index) => (
                  <path
                    key={`${entry.id}-${index}`}
                    data-running-order-series
                    data-series-role="bryce"
                    data-driver-id={entry.id}
                    data-current-rank={currentBryce.rank}
                    data-live-endpoint-x={segment.at(-1)?.checkedAtMs === latestSample.checkedAtMs ? liveEndpointX?.toFixed(2) : undefined}
                    d={stepPath(segment, x, y)}
                    fill="none"
                    stroke="var(--bryce)"
                    strokeWidth={2.5}
                    strokeOpacity={focusedId && focusedId !== entry.id ? 0.22 : 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'stroke-opacity 150ms cubic-bezier(0.23, 1, 0.32, 1)' }}
                  />
                )))}
                {crossings.filter((crossing) => crossing.checkedAtMs >= timeDomain.startMs && crossing.checkedAtMs <= timeDomain.endMs).map((crossing) => {
                  const crossingTip = {
                    x: x(crossing.checkedAtMs),
                    y: y(crossing.rank),
                    title: crossing.direction === 'ahead_of' ? `ahead of ${crossing.rivalName}` : `behind ${crossing.rivalName}`,
                    detail: crossing.lap === null ? null : `lap ${crossing.lap}`
                  } satisfies ChartTip;
                  return <circle
                    key={crossing.id}
                    data-bryce-crossing
                    data-rival-id={crossing.rivalId}
                    data-crossing-direction={crossing.direction}
                    data-crossing-lap={crossing.lap ?? ''}
                    cx={crossingTip.x}
                    cy={crossingTip.y}
                    r={5}
                    fill="var(--surface-1)"
                    stroke="var(--bryce)"
                    strokeWidth={2}
                    tabIndex={0}
                    aria-label={`${crossingTip.title}${crossing.lap === null ? '' : `, lap ${crossing.lap}`}`}
                    onMouseMove={(event) => { event.stopPropagation(); setFocusedId(latestSample.bryceId); setTip(crossingTip); }}
                    onMouseLeave={clearFocus}
                    onFocus={() => { setFocusedId(latestSample.bryceId); setTip(crossingTip); }}
                    onBlur={clearFocus}
                  />;
                })}
                </g>
              </g>
              <line x1={plotRight} x2={plotRight} y1={margin.top} y2={margin.top + plotHeight} stroke="var(--axis-baseline)" />
            <g clipPath={`url(#${clipId}-scene)`}>
              <g className="live-running-order__ladder" style={{ transform: `translateY(${offsetY}px)`, transition: sceneTransition }}>
              {ladder.map((entry) => {
                const rowY = y(entry.rank) + entry.yOffset;
                const role = entry.id === nearestAhead?.id ? 'ahead' : entry.id === nearestBehind?.id ? 'behind' : null;
                const color = role === 'ahead' ? '#5581c2' : role === 'behind' ? '#2f9377' : entry.bryce ? 'var(--bryce)' : 'var(--ink-primary)';
                const identity = identityById.get(entry.id);
                const identityStyle = runningOrderIdentityStyle(entry.id, identity?.startPosition ?? entry.startPosition);
                const gap = runningOrderGapWords(latestSample, entry.id, false);
                const currentTip = tipFor(entry.id, history.samples.length - 1, plotRight + 11, rowY - 8);
                const ariaGap = entry.bryce ? 'Bryce' : gap === '—' ? 'gap unavailable' : gap;
                return <g
                  key={entry.id}
                  data-ladder-row
                  data-driver-id={entry.id}
                  data-live-rank={entry.rank}
                  data-y-offset={entry.yOffset}
                  data-gap-text={gap}
                  data-role={role ?? ''}
                  data-line-pattern={entry.bryce ? 'bryce' : identityStyle.name}
                  tabIndex={0}
                  aria-label={`${entry.bryce ? 'Bryce Aron, car 9' : entry.name}, P${entry.rank}, ${ariaGap}${role ? `, ${role} now` : ''}`}
                  onFocus={() => { setFocusedId(entry.id); if (currentTip) setTip(currentTip); }}
                  onBlur={clearFocus}
                  onMouseEnter={() => { setFocusedId(entry.id); if (currentTip) setTip(currentTip); }}
                  onMouseLeave={clearFocus}
                >
                  <circle data-ladder-dot cx={plotRight + 9} cy={rowY} r={4.5} fill={color} stroke="var(--surface-1)" strokeWidth={1.5} />
                  {entry.bryce ? (
                    <g transform={`translate(${plotRight + 18} ${rowY})`}>
                      <rect x={0} y={-9} width={30} height={18} rx={4} fill="var(--bryce)" />
                      <text x={15} y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#1d1d1f" fontFamily={chartFont} fontSize={10.5} fontWeight={750}>№9</text>
                    </g>
                  ) : (
                    <g transform={`translate(${plotRight + 14} ${rowY})`}>
                      <line
                        data-ladder-pattern-swatch
                        x1={0}
                        x2={16}
                        y1={0}
                        y2={0}
                        stroke="var(--ink-primary)"
                        strokeWidth={1.5}
                        strokeOpacity={0.8}
                        strokeDasharray={identityStyle.dashArray ?? undefined}
                        strokeLinecap="round"
                      />
                    </g>
                  )}
                  {!entry.bryce ? (
                    <g transform={`translate(${plotRight + 35} ${rowY})`}>
                      <text y={role ? -9 : -4} fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={9.5} fontWeight={role ? 650 : 540}>{entry.name}</text>
                      <text y={role ? 1.5 : 7} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={8.5}>{gap}</text>
                      {role ? <text y={12} fill={color} fontFamily={chartFont} fontSize={8.2} fontWeight={650}>{role} now</text> : null}
                    </g>
                  ) : null}
                </g>;
              })}
              </g>
            </g>
            {xTicks.map((tick, index) => (
              <text key={tick} x={x(tick)} y={height - 8} textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>{relativeTimeLabel(tick - timeDomain.endMs)}</text>
            ))}
            {lapBoundaries.map((boundary) => (
              <g key={`${boundary.lap}-${boundary.checkedAtMs}`}>
                <line x1={x(boundary.checkedAtMs)} x2={x(boundary.checkedAtMs)} y1={margin.top} y2={margin.top + 7} stroke="var(--axis-baseline)" />
                <text x={x(boundary.checkedAtMs)} y={margin.top - 7} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>L{boundary.lap}</text>
              </g>
            ))}
          </svg>
          <div className="live-running-order__status" aria-live="polite">
            {replayEnded ? (
              <span>end of the capture</span>
            ) : timeDomain.waiting ? (
              <span>waiting on live timing…</span>
            ) : (
              <span aria-hidden>&nbsp;</span>
            )}
          </div>
          <div className="sr-only" aria-label="Current running order near Bryce">
            {ladder.map((entry) => <span key={entry.id}>{entry.bryce ? 'Bryce Aron, car 9' : entry.name}: P{entry.rank}, {entry.bryce ? 'Bryce' : runningOrderGapWords(latestSample, entry.id)}. </span>)}
          </div>
          {tip ? <ChartTipCard tip={tip} width={width} /> : null}
        </>
      ) : (
        <Unavailable>The running order appears after two official timing samples.</Unavailable>
      )}
    </div>
  );
};
