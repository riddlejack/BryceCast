/** "His qualifying, run by run" — the Race Detail weekend-arc module (Brief M,
 *  first slice). One question: how did his qualifying build? Bryce's laps in
 *  session order, his best-lap staircase (gold), where the session's fastest lap
 *  settled (the benchmark line), and where his qualifying landed — with both
 *  denominators and the source tier on screen.
 *
 *  The build is the RaceTools / Timing71 capture (semantic layer); the rank and
 *  the headline best lap are the canonical official qualifying classification.
 *  Two substrates, each labelled where it draws. */

import { useState } from 'react';
import { Card, SourcePill } from '../app/components';
import { ChartTipCard, chartFont, useCoarsePointer, useMeasuredWidth, useReducedMotion, type ChartTip } from '../app/charts';
import {
  formatLapTime,
  gridOutcomeSentence,
  groupRankSentence,
  useQualiLabForRace,
  type QualiLabSession
} from '../data/qualiLab';

const GOLD = '#f5b63f';
const INK = '#1d1d1f';

const RunByRunChart = ({ session, height = 208 }: { session: QualiLabSession; height?: number }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [tip, setTip] = useState<ChartTip | null>(null);

  const laps = session.laps;
  if (laps.length < 2 || width < 2) {
    return <div ref={ref} style={{ width: '100%', height }} />;
  }

  const padL = 58;
  const padR = 16;
  const padT = 16;
  const padB = 30;
  const plotW = Math.max(width - padL - padR, 10);
  const plotH = height - padT - padB;

  /* The domain is the competitive (flying-lap) band, so the fine improvements
   * that ARE the build stay legible; out-/in-laps sit slower than the band and
   * clamp to the bottom edge as hollow marks (their true time is in the
   * tooltip). The session's fastest lap is folded in so its benchmark line
   * always sits in view just above his flyers. */
  const flyers = laps.filter((lap) => lap.kind === 'flying').map((lap) => lap.seconds);
  const band = flyers.length >= 2 ? flyers : laps.map((lap) => lap.seconds);
  const fastest = Math.min(...band, session.sessionBestSeconds);
  const slowest = Math.max(...band);
  const range = Math.max(slowest - fastest, 0.05);
  const yTop = fastest - range * 0.28;
  const yBottom = slowest + range * 0.22;
  const span = Math.max(yBottom - yTop, 0.001);

  // faster lap = higher on the chart (y grows downward as time grows); clamp
  // both ends so a slow support lap or the warmup staircase stays on-plot
  const xOf = (seq: number) => padL + (laps.length === 1 ? plotW / 2 : ((seq - 1) / (laps.length - 1)) * plotW);
  const yOf = (seconds: number) =>
    padT + (Math.max(0, Math.min(1, (seconds - yTop) / span)) * plotH);

  const benchmarkY = yOf(session.sessionBestSeconds);

  // running-best staircase (step-after): drops at each personal best
  const stair: string[] = [];
  laps.forEach((lap, index) => {
    const x = xOf(lap.seq);
    const y = yOf(lap.runningBestSeconds);
    if (index === 0) stair.push(`M ${x.toFixed(1)} ${y.toFixed(1)}`);
    else {
      const prevY = yOf(laps[index - 1].runningBestSeconds);
      stair.push(`L ${x.toFixed(1)} ${prevY.toFixed(1)}`);
      stair.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
    }
  });

  const yLabels = [yTop + span * 0.02, yTop + span * 0.5, yBottom];

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Bryce's ${session.venueName} ${session.seasonYear} qualifying laps in session order, fastest lap ${formatLapTime(session.bryceBestSeconds)}`}
        style={{ fontFamily: chartFont, display: 'block' }}
        onMouseLeave={() => setTip(null)}
      >
        {/* y gridlines + lap-time labels */}
        {yLabels.map((value, index) => {
          const y = yOf(value);
          return (
            <g key={index}>
              <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize={10.5} fill="var(--ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatLapTime(value)}
              </text>
            </g>
          );
        })}

        {/* the session's fastest lap — the benchmark he's building toward */}
        <line x1={padL} x2={width - padR} y1={benchmarkY} y2={benchmarkY} stroke={INK} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
        <text x={width - padR} y={benchmarkY - 5} textAnchor="end" fontSize={10.5} fill="var(--ink-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {session.sessionBestByBryce ? 'his session best' : `session best ${formatLapTime(session.sessionBestSeconds)}`}
        </text>

        {/* running-best staircase (gold) */}
        <path
          d={stair.join(' ')}
          fill="none"
          stroke={GOLD}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={reduced ? undefined : { strokeDasharray: 1200, strokeDashoffset: 0 }}
        />

        {/* x-axis run-order labels */}
        <text x={padL} y={height - 10} textAnchor="start" fontSize={10.5} fill="var(--ink-muted)">
          1st lap
        </text>
        <text x={width - padR} y={height - 10} textAnchor="end" fontSize={10.5} fill="var(--ink-muted)">
          {laps.length}
          {laps.length === 2 ? 'nd' : laps.length === 3 ? 'rd' : 'th'} lap
        </text>

        {/* the laps */}
        {laps.map((lap) => {
          const clamped = lap.seconds > yBottom; // out-/in-lap slower than the band
          const x = xOf(lap.seq);
          const y = yOf(lap.seconds);
          const flying = lap.kind === 'flying';
          return (
            <g key={lap.seq}>
              {/* generous invisible hit target */}
              <circle
                cx={x}
                cy={y}
                r={12}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x,
                    y,
                    title: `${formatLapTime(lap.seconds)}`,
                    detail: `${lap.isPersonalBest ? 'new best · ' : ''}lap ${lap.seq} of ${laps.length}${
                      clamped ? ' · out-lap' : flying ? '' : ' · slower lap'
                    }`
                  })
                }
              />
              <circle
                cx={x}
                cy={y}
                r={lap.isPersonalBest ? 4.2 : 3.2}
                fill={flying ? GOLD : 'var(--surface-0)'}
                stroke={flying ? GOLD : 'var(--hairline)'}
                strokeWidth={flying ? 0 : 1.4}
                opacity={clamped ? 0.5 : 1}
              />
            </g>
          );
        })}
      </svg>
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const QualiModule = ({ session }: { session: QualiLabSession }) => {
  const coarse = useCoarsePointer();
  const grid = gridOutcomeSentence(session);
  /* Ovals run one group, so the grid and the "in the session" rank are the same
   * number — show the group line only when it adds something (a road/street
   * weekend where the grid combines two groups). */
  const groupIsDistinct =
    session.onTrackGroupRank !== session.combinedGridPosition || session.groupFieldSize !== session.combinedFieldSize;
  const group = groupIsDistinct ? groupRankSentence(session) : null;

  // "his best came on his 8th lap"; only when it wasn't the opening lap
  const bestLine =
    session.bryceBestSeq && session.bryceBestSeq > 1
      ? `His fastest lap came on the ${session.bryceBestSeq}${session.bryceBestSeq === 2 ? 'nd' : session.bryceBestSeq === 3 ? 'rd' : 'th'} of ${session.laps.length}.`
      : null;

  /* Substrate honesty: the headline best lap is the official classification;
   * when the capture missed his single fastest lap, the run's floor sits a
   * touch slower than that, so say it rather than let the chart quietly disagree. */
  const gap = session.capturedBestVsOfficialSeconds;
  const captureGap =
    gap !== null && gap > 0.15 && session.officialBestLapSeconds !== null
      ? `His official best was ${formatLapTime(session.officialBestLapSeconds)}; the capture holds his laps down to ${formatLapTime(session.bryceBestSeconds)}.`
      : null;

  const is2026 = session.source === 'timing71';
  const entries = [
    {
      label: `Run-by-run laps · ${session.sourceTierLabel}`,
      note: `Bryce's laps in session order and the session's fastest lap come from the ${session.sourceTierLabel} — a third-party capture, not official timing.`
    },
    {
      label: 'Qualifying result · official qualifying classification',
      note: 'The grid position, group rank, and headline best lap come from the official qualifying classification in the canonical dataset.'
    },
    ...(is2026
      ? [
          {
            label: `2026 identity crosswalk · verdict ${session.crosswalkVerdict}`,
            note: `This 2026 Timing71 session is included only because its identity crosswalk validated GO${
              session.crosswalkCrossCheck ? ` (cross-check ${session.crosswalkCrossCheck})` : ''
            }.`
          }
        ]
      : [])
  ];

  return (
    <Card
      title="His qualifying, run by run"
      action={<SourcePill title={`${session.venueName} ${session.seasonYear} qualifying`} entries={entries} caveats={['Third-party derived analytics, never official timing.']} />}
    >
      <div style={{ padding: '0 18px 16px', display: 'grid', gap: 12 }}>
        <div className="row" style={{ gap: 24, flexWrap: 'wrap', alignItems: 'baseline' }}>
          {grid ? (
            <div>
              <div style={{ fontSize: 20, fontWeight: 640, letterSpacing: '-0.01em' }}>{grid}</div>
              {group ? <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 2 }}>{group}</div> : null}
            </div>
          ) : group ? (
            <div style={{ fontSize: 20, fontWeight: 640 }}>{group}</div>
          ) : null}
          <div>
            <div className="tnum" style={{ fontSize: 20, fontWeight: 640, letterSpacing: '-0.01em' }}>
              {formatLapTime(session.officialBestLapSeconds ?? session.bryceBestSeconds)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 2 }}>his best lap</div>
          </div>
        </div>

        <RunByRunChart session={session} />

        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
          {bestLine ? `${bestLine} ` : ''}
          {session.sessionBestByBryce
            ? 'His best was the session’s fastest lap.'
            : `The session’s fastest lap was ${formatLapTime(session.sessionBestSeconds)}.`}
          {captureGap ? ` ${captureGap}` : ''}{' '}
          <span style={{ color: 'var(--ink-muted)' }}>
            {coarse ? 'Tap' : 'Hover'} a lap for its time. Laps in session order; the gold line is his best so far. {session.sourceTierLabel}.
          </span>
        </p>
      </div>
    </Card>
  );
};

/** Renders the module for a race page when its weekend's qualifying is covered;
 *  renders nothing otherwise (honest absence — no placeholder). */
export const QualifyingRunByRunCard = ({ raceSessionId }: { raceSessionId: string }) => {
  const session = useQualiLabForRace(raceSessionId);
  if (!session || session === 'failed') return null;
  return <QualiModule session={session} />;
};
