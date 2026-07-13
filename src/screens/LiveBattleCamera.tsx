import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { Unavailable } from '../app/components';
import {
  CAMERA_WINDOW_SECONDS,
  cameraDomainFor,
  cameraFrameForSample,
  cameraMembership,
  cameraPointSegments,
  cautionSpans,
  clipCameraSeries,
  detectBryceCrossings,
  easedCameraCenter,
  fullFieldCameraSeries,
  proximityStyle,
  resolveLadderCollisions,
  rollingMedian,
  threeLapTrend,
  type CameraPoint,
  type CameraSeries
} from '../data/liveCameraModel';
import { adaptiveNumericTicks, type LiveSessionHistory } from '../data/liveHistoryModel';
import { timestampWindowDomain } from '../data/liveMotionModel';

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

const stepPath = (points: CameraPoint[], x: (value: number) => number, y: (value: number) => number): string =>
  points.reduce((path, point, index) => {
    if (point.value === null) return path;
    if (index === 0) return `M${x(point.checkedAtMs)} ${y(point.value)}`;
    return `${path}H${x(point.checkedAtMs)}V${y(point.value)}`;
  }, '');

const relativeTimeLabel = (milliseconds: number) => {
  if (milliseconds === 0) return 'now';
  const minutes = Math.abs(milliseconds) / 60_000;
  return `−${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)}m`;
};

const signedGap = (seconds: number) => `${seconds < 0 ? '−' : '+'}${Math.abs(seconds).toFixed(1)}s`;

const samplePoint = (series: CameraSeries, checkedAt: string) => series.points.find((point) => point.checkedAt === checkedAt) ?? null;

export const LiveBattleCamera = ({ history }: { history: LiveSessionHistory | null }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const retainedMembership = useRef(new Set<string>());
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  const series = useMemo(() => fullFieldCameraSeries(history), [history]);
  const bryceSeries = series.find((entry) => entry.bryce) ?? null;
  const latestSample = history?.samples.at(-1) ?? null;
  const timeDomain = useMemo(() => timestampWindowDomain(history?.samples.map((sample) => sample.checkedAt) ?? []), [history]);
  const latestBrycePoint = bryceSeries?.points.filter((point) => point.value !== null).at(-1) ?? null;
  const cameraTarget = useMemo(() => {
    if (!bryceSeries || !latestSample || !latestBrycePoint) return null;
    const median = rollingMedian(bryceSeries.points, latestSample.checkedAtMs) ?? latestBrycePoint.value!;
    return cameraDomainFor(median, latestBrycePoint.value!);
  }, [bryceSeries, latestBrycePoint, latestSample]);
  const [cameraCenter, setCameraCenter] = useState<number | null>(null);
  const cameraSession = useRef<string | null>(null);
  const skipNextCameraAnimation = useRef(false);

  useLayoutEffect(() => {
    const sessionKey = history?.sessionKey ?? null;
    if (cameraSession.current === sessionKey) return;
    cameraSession.current = sessionKey;
    retainedMembership.current = new Set<string>();
    skipNextCameraAnimation.current = true;
    setCameraCenter(cameraTarget?.center ?? null);
    setTip(null);
    setFocusedId(null);
  }, [cameraTarget?.center, history?.sessionKey]);

  useEffect(() => {
    if (!cameraTarget) return;
    if (skipNextCameraAnimation.current) {
      skipNextCameraAnimation.current = false;
      return;
    }
    if (reducedMotion || cameraCenter === null) {
      setCameraCenter(cameraTarget.center);
      return;
    }
    let frame = 0;
    const settle = () => {
      setCameraCenter((previous) => {
        const next = easedCameraCenter(previous, cameraTarget.center, false);
        if (Math.abs(next - cameraTarget.center) > 0.01) frame = window.requestAnimationFrame(settle);
        return Math.abs(next - cameraTarget.center) <= 0.01 ? cameraTarget.center : next;
      });
    };
    frame = window.requestAnimationFrame(settle);
    return () => window.cancelAnimationFrame(frame);
    // cameraCenter is intentionally excluded: one animation owns each sourced target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraTarget?.center, reducedMotion]);

  const domain = cameraCenter === null || !latestBrycePoint
    ? cameraTarget
    : cameraDomainFor(cameraCenter, latestBrycePoint.value!);
  const height = 300;
  const margin = { top: 22, right: width < 520 ? 100 : 138, bottom: 43, left: 50 };
  const plotWidth = Math.max(width - margin.left - margin.right, 120);
  const plotHeight = height - margin.top - margin.bottom;
  const plotRight = margin.left + plotWidth;
  const x = (checkedAtMs: number) => timeDomain
    ? margin.left + ((checkedAtMs - timeDomain.startMs) / (timeDomain.endMs - timeDomain.startMs)) * plotWidth
    : margin.left;
  const y = (value: number) => domain
    ? margin.top + ((value - domain.lower) / CAMERA_WINDOW_SECONDS) * plotHeight
    : margin.top + plotHeight / 2;

  const visibleSeries = useMemo(() => {
    if (!timeDomain || !domain) return [];
    return series
      .map((entry) => clipCameraSeries(entry, timeDomain.startMs, timeDomain.endMs))
      .filter((entry) => entry.bryce || entry.points.some((point) => point.value !== null && point.value >= domain.lower - 0.5 && point.value <= domain.upper + 0.5));
  }, [domain?.lower, domain?.upper, series, timeDomain]);
  const currentFrame = latestSample ? cameraFrameForSample(latestSample) : [];
  retainedMembership.current = domain ? cameraMembership(currentFrame, domain, retainedMembership.current) : new Set<string>();
  const currentById = new Map(currentFrame.map((entry) => [entry.id, entry]));
  const currentBryce = latestSample ? currentById.get(latestSample.bryceId) ?? null : null;
  const currentInFrame = currentFrame.filter((entry) => retainedMembership.current.has(entry.id) && entry.value !== null);
  const labeledIds = new Set([
    ...(currentBryce ? [currentBryce.id] : []),
    ...currentInFrame
      .filter((entry) => !entry.bryce && currentBryce?.value !== null && currentBryce?.value !== undefined)
      .sort((left, right) => Math.abs(left.value! - currentBryce!.value!) - Math.abs(right.value! - currentBryce!.value!) || left.id.localeCompare(right.id))
      .slice(0, 4)
      .map((entry) => entry.id),
    ...(focusedId ? [focusedId] : [])
  ]);
  const ladderEntries = currentInFrame.filter((entry) => labeledIds.has(entry.id));
  const ladderY = new Map(resolveLadderCollisions(
    ladderEntries.map((entry) => ({ id: entry.id, desiredY: y(entry.value!) })),
    margin.top + 8,
    margin.top + plotHeight - 8,
    32
  ).map((entry) => [entry.id, entry.y]));
  const nearestAhead = currentBryce?.value === null || currentBryce?.value === undefined
    ? null
    : currentFrame.filter((entry) => entry.value !== null && entry.value < currentBryce.value! && entry.id !== currentBryce.id)
      .sort((left, right) => currentBryce.value! - left.value! - (currentBryce.value! - right.value!))[0] ?? null;
  const nearestBehind = currentBryce?.value === null || currentBryce?.value === undefined
    ? null
    : currentFrame.filter((entry) => entry.value !== null && entry.value > currentBryce.value! && entry.id !== currentBryce.id)
      .sort((left, right) => left.value! - currentBryce.value! - (right.value! - currentBryce.value!))[0] ?? null;
  const crossings = useMemo(() => detectBryceCrossings(history), [history]);
  const bryceCautions = useMemo(() => cautionSpans(bryceSeries?.points ?? []), [bryceSeries]);
  const yTicks = domain ? adaptiveNumericTicks([domain.lower, domain.upper], plotHeight, 55) : [];
  const xTicks = timeDomain ? [-300_000, -240_000, -180_000, -120_000, -60_000, 0].filter((_, index) => width >= 520 || index % 2 === 0 || index === 5) : [];
  const lapBoundaries = useMemo(() => {
    if (!latestSample || !timeDomain) return [];
    const boundaries: Array<{ lap: number; checkedAtMs: number }> = [];
    history?.samples.forEach((sample) => {
      if (sample.checkedAtMs < timeDomain.startMs || sample.lap === null || boundaries.at(-1)?.lap === sample.lap) return;
      boundaries.push({ lap: sample.lap, checkedAtMs: sample.checkedAtMs });
    });
    if (boundaries.length <= 6) return boundaries;
    const stride = Math.ceil(boundaries.length / 5);
    return boundaries.filter((_, index) => index % stride === 0 || index === boundaries.length - 1);
  }, [history, latestSample, timeDomain]);

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !timeDomain || !domain || visibleSeries.length === 0) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const cursorX = event.clientX - bounds.left;
    const cursorY = event.clientY - bounds.top;
    const cursorTime = timeDomain.startMs + Math.max(0, Math.min(1, (cursorX - margin.left) / plotWidth)) * (timeDomain.endMs - timeDomain.startMs);
    const sample = history!.samples.reduce((closest, candidate) => Math.abs(candidate.checkedAtMs - cursorTime) < Math.abs(closest.checkedAtMs - cursorTime) ? candidate : closest);
    const candidates = visibleSeries.flatMap((entry) => {
      const point = samplePoint(entry, sample.checkedAt);
      return point?.value === null || point?.value === undefined ? [] : [{ entry, point, distance: Math.abs(y(point.value) - cursorY) }];
    });
    const nearest = candidates.sort((left, right) => left.distance - right.distance)[0];
    if (!nearest || nearest.distance > 24) {
      setFocusedId(null);
      setTip(null);
      return;
    }
    const bryce = bryceSeries ? samplePoint(bryceSeries, sample.checkedAt) : null;
    const pointIndex = nearest.entry.points.findIndex((point) => point.checkedAt === sample.checkedAt);
    const trend = threeLapTrend(nearest.entry.points, pointIndex);
    const toBryce = bryce?.value === null || bryce?.value === undefined ? 'gap to Bryce unavailable' : `${signedGap(nearest.point.value! - bryce.value)} to Bryce`;
    const trendLabel = trend === null ? '' : ` · 3-lap trend ${trend <= 0 ? 'gained' : 'lost'} ${Math.abs(trend).toFixed(1)}s`;
    setFocusedId(nearest.entry.id);
    setTip({
      x: x(sample.checkedAtMs),
      y: y(nearest.point.value!),
      title: nearest.entry.bryce ? `${nearest.entry.name} · №9` : nearest.entry.name,
      detail: `${toBryce} · +${nearest.point.value!.toFixed(1)}s to leader${trendLabel}`
    });
  };

  const nonComparable = currentFrame.filter((entry) => entry.status && (entry.bryce || /pit|retir|lapped|out|stopp/i.test(entry.status)));
  const bryceUnavailable = currentBryce?.value === null || currentBryce?.value === undefined;
  const leaderChangeCount = bryceSeries?.points.filter((point) => point.breakBefore).length ?? 0;

  return (
    <div ref={ref} className="live-camera">
      {width > 0 && history && latestSample && timeDomain && domain && bryceSeries && latestBrycePoint ? (
        <>
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label="Leader-referenced broadcast camera following Bryce over the trailing five minutes"
            data-camera-chart="battle-camera"
            data-session-key={history.sessionKey}
            data-source-checked-at={latestSample.checkedAt}
            data-source-sample-count={history.samples.length}
            data-time-domain-start={new Date(timeDomain.startMs).toISOString()}
            data-time-domain-end={new Date(timeDomain.endMs).toISOString()}
            data-camera-domain-lower={domain.lower.toFixed(4)}
            data-camera-domain-upper={domain.upper.toFixed(4)}
            data-camera-target-center={cameraTarget?.center.toFixed(4)}
            data-camera-rendered-center={domain.center.toFixed(4)}
            data-camera-easing={reducedMotion ? 'off' : 'on'}
            data-bryce-driver-id={latestSample.bryceId}
            data-bryce-gap-to-leader={currentBryce?.value?.toFixed(4) ?? ''}
            data-bryce-rank={currentBryce?.rank ?? ''}
            data-visible-driver-ids={currentInFrame.map((entry) => entry.id).join(',')}
            data-leader-change-break-count={leaderChangeCount}
            onMouseMove={onMove}
            onMouseLeave={() => { setTip(null); setFocusedId(null); }}
          >
            <defs><clipPath id={`battle-camera-${history.sessionKey.replace(/[^a-z0-9]/gi, '-')}`}><rect x={margin.left} y={margin.top} width={plotWidth} height={plotHeight} /></clipPath></defs>
            <g clipPath={`url(#battle-camera-${history.sessionKey.replace(/[^a-z0-9]/gi, '-')})`}>
              {bryceCautions.map((span, index) => (
                <rect key={`${span.startMs}-${index}`} x={x(Math.max(span.startMs, timeDomain.startMs))} y={margin.top} width={Math.max(2, x(Math.min(span.endMs, timeDomain.endMs)) - x(Math.max(span.startMs, timeDomain.startMs)))} height={plotHeight} fill="var(--status-warn-dot)" opacity={0.1} data-caution-span />
              ))}
              {yTicks.map((tick) => <line key={tick} x1={margin.left} x2={plotRight} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />)}
              {visibleSeries.filter((entry) => !entry.bryce).flatMap((entry) => {
                const bryceByTime = new Map((bryceSeries?.points ?? []).map((point) => [point.checkedAt, point.value]));
                return entry.points.slice(0, -1).flatMap((point, index) => {
                  const next = entry.points[index + 1];
                  if (point.value === null || next.value === null || next.breakBefore) return [];
                  const bryceValue = bryceByTime.get(next.checkedAt);
                  if (bryceValue === null || bryceValue === undefined) return [];
                  const style = proximityStyle(next.value - bryceValue);
                  const faded = focusedId && focusedId !== entry.id ? 0.22 : 1;
                  return <path key={`${entry.id}-${point.checkedAt}`} data-camera-series data-driver-id={entry.id} data-from-source={point.checkedAt} data-to-source={next.checkedAt} d={`M${x(point.checkedAtMs)} ${y(point.value)}H${x(next.checkedAtMs)}V${y(next.value)}`} fill="none" stroke="var(--ink-primary)" strokeWidth={style.strokeWidth} strokeOpacity={style.opacity * faded} strokeLinejoin="round" />;
                });
              })}
              {cameraPointSegments(bryceSeries.points).map((segment, index) => (
                <path key={index} data-camera-series data-driver-id={bryceSeries.id} data-series-role="bryce" d={stepPath(segment, x, y)} fill="none" stroke="var(--bryce)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={focusedId && focusedId !== bryceSeries.id ? 0.22 : 1} />
              ))}
              {crossings.filter((crossing) => crossing.checkedAtMs >= timeDomain.startMs && crossing.checkedAtMs <= timeDomain.endMs).map((crossing) => (
                <circle key={crossing.id} data-bryce-crossing data-rival-id={crossing.rivalId} data-crossing-direction={crossing.direction} data-crossing-lap={crossing.lap ?? ''} cx={x(crossing.checkedAtMs)} cy={y(crossing.value)} r={5} fill="var(--surface-1)" stroke="var(--bryce)" strokeWidth={2} tabIndex={0} aria-label={`${crossing.direction === 'ahead_of' ? 'ahead of' : 'behind'} ${crossing.rivalName}${crossing.lap === null ? '' : `, lap ${crossing.lap}`}`} onMouseMove={(event) => { event.stopPropagation(); setTip({ x: x(crossing.checkedAtMs), y: y(crossing.value), title: crossing.direction === 'ahead_of' ? `ahead of ${crossing.rivalName}` : `behind ${crossing.rivalName}`, detail: crossing.lap === null ? 'observed rank crossing' : `lap ${crossing.lap}` }); }} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ x: x(crossing.checkedAtMs), y: y(crossing.value), title: crossing.direction === 'ahead_of' ? `ahead of ${crossing.rivalName}` : `behind ${crossing.rivalName}`, detail: crossing.lap === null ? 'observed rank crossing' : `lap ${crossing.lap}` })} onBlur={() => setTip(null)} />
              ))}
              {currentInFrame.map((entry) => <circle key={entry.id} data-ladder-dot data-driver-id={entry.id} cx={plotRight} cy={y(entry.value!)} r={entry.bryce ? 4 : 2.8} fill={entry.bryce ? 'var(--bryce)' : entry.id === nearestAhead?.id ? '#5581c2' : entry.id === nearestBehind?.id ? '#2f9377' : 'var(--ink-primary)'} opacity={entry.bryce ? 1 : 0.82} />)}
            </g>
            {yTicks.map((tick) => <text key={`label-${tick}`} x={margin.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>{tick.toFixed(tick < 10 ? 1 : 0)}s</text>)}
            <text transform={`translate(12 ${margin.top + plotHeight / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>behind the leader</text>
            {xTicks.map((offset) => <text key={offset} x={x(timeDomain.endMs + offset)} y={height - 8} textAnchor={offset === -300_000 ? 'start' : offset === 0 ? 'end' : 'middle'} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>{relativeTimeLabel(offset)}</text>)}
            {lapBoundaries.map((boundary) => <g key={`${boundary.lap}-${boundary.checkedAtMs}`}><line x1={x(boundary.checkedAtMs)} x2={x(boundary.checkedAtMs)} y1={margin.top} y2={margin.top + 8} stroke="var(--axis-baseline)" /><text x={x(boundary.checkedAtMs)} y={margin.top - 6} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>L{boundary.lap}</text></g>)}
            <line x1={plotRight} x2={plotRight} y1={margin.top} y2={margin.top + plotHeight} stroke="var(--axis-baseline)" strokeDasharray="2 4" />
            {ladderEntries.map((entry) => {
              const labelY = ladderY.get(entry.id) ?? y(entry.value!);
              const delta = currentBryce?.value === null || currentBryce?.value === undefined ? null : entry.value! - currentBryce.value;
              const role = entry.id === nearestAhead?.id ? 'ahead' : entry.id === nearestBehind?.id ? 'behind' : null;
              const roleColor = role === 'ahead' ? '#5581c2' : role === 'behind' ? '#2f9377' : 'var(--ink-secondary)';
              return <g key={entry.id} data-ladder-label data-driver-id={entry.id} data-label-y={labelY.toFixed(2)} data-gap-to-bryce={delta?.toFixed(4) ?? ''}>
                <path d={`M${plotRight + 3} ${y(entry.value!)}H${plotRight + 8}L${plotRight + 14} ${labelY}`} fill="none" stroke={entry.bryce ? 'var(--bryce)' : roleColor} strokeWidth={1} opacity={0.72} />
                {entry.bryce ? <g data-ladder-label-content transform={`translate(${plotRight + 16} ${labelY})`}><rect x={0} y={-9} width={28} height={18} rx={4} fill="var(--bryce)" /><text x={14} y={0.5} textAnchor="middle" dominantBaseline="middle" fill="#1d1d1f" fontFamily={chartFont} fontSize={10.5} fontWeight={750}>№9</text></g> : <text data-ladder-label-content x={plotRight + 16} y={labelY} dominantBaseline="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={width < 520 ? 8.7 : 9.8} fontWeight={role ? 650 : 500}>{entry.name} {delta === null ? '' : signedGap(delta)}{role ? <tspan x={plotRight + 16} dy={10.5} fontSize={8.2}>{role} now</tspan> : null}</text>}
              </g>;
            })}
          </svg>
          <div className="live-camera__status" aria-live="polite">
            <span>gaps in seconds, from official Race Control timing.</span>
            {bryceUnavailable ? <strong>Bryce’s timing coordinate is unavailable; camera held at his last valid position.</strong> : null}
            {nonComparable.filter((entry) => !entry.bryce).slice(0, 2).map((entry) => <span key={entry.id}>{entry.name}: {entry.status}</span>)}
          </div>
          {tip ? <ChartTipCard tip={tip} width={width} /> : null}
        </>
      ) : <Unavailable>The camera starts after Race Control publishes two full-field samples with a contiguous numeric interval chain to Bryce.</Unavailable>}
    </div>
  );
};
