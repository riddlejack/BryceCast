/** "His qualifying, run by run" — the Race Detail weekend-arc module (Brief M,
 *  first slice). One question: how did his qualifying build? Bryce's laps in
 *  session order, his best-lap staircase, where the fastest lap of his group (or
 *  the session, on ovals) settled — the benchmark line — and where his
 *  qualifying landed, with both denominators and the source tier on screen.
 *
 *  Chart colour follows the house standard: a single-series INK line, gold ONLY
 *  as the marker on his fastest lap (the terminal/current best). The build is the
 *  RaceTools / Timing71 capture (semantic layer); the rank and the headline best
 *  lap are the canonical official qualifying classification. Two substrates, each
 *  labelled where it draws.
 *
 *  The resolution is hoisted into RaceDetailScreen (so the page footer can name
 *  this module's source tier) and passed in; this file only renders it. */

import { useEffect, useMemo, useState } from 'react';
import { Card, SourcePill, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useCoarsePointer, useMeasuredWidth, useReducedMotion, type ChartTip } from '../app/charts';
import {
  formatLapTime,
  gridOutcomeSentence,
  groupRankSentence,
  type QualiLabCoverage,
  type QualiCoverageRace,
  type QualiGridClassification,
  type QualiLabResolution,
  type QualiLabSession,
  type QualiPairedNote
} from '../data/qualiLab';

const GOLD = '#f5b63f';
const INK = '#1d1d1f';

const gridBasisLabel = (basis: QualiGridClassification['lapSelection']): string => {
  if (basis === 'second_fastest' || basis === 'second_fastest_lap') return 'second-fastest lap';
  if (basis === 'two_lap_average' || basis === 'oval_two_lap_average') return 'two-lap average';
  return 'fastest lap';
};

/** The lap sequence of his fastest lap — the one gold marker (terminal best).
 *  Falls back to the last lap that reaches the running-best floor. */
const bestLapSeq = (session: QualiLabSession): number | null => {
  if (session.bryceBestSeq) return session.bryceBestSeq;
  for (let i = session.laps.length - 1; i >= 0; i -= 1) {
    if (Math.abs(session.laps[i].runningBestSeconds - session.bryceBestSeconds) < 1e-9) return session.laps[i].seq;
  }
  return null;
};

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
   * tooltip). The benchmark lap is folded in so its line always sits in view
   * just above his flyers. */
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
  const goldSeq = bestLapSeq(session);

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

  // benchmark label: his group's fastest (road split) vs the session's (oval)
  const benchLabel = session.sessionBestByBryce
    ? session.benchmarkScope === 'group'
      ? 'his group best'
      : 'his session best'
    : session.benchmarkScope === 'group'
      ? `group best ${formatLapTime(session.sessionBestSeconds)}`
      : `session best ${formatLapTime(session.sessionBestSeconds)}`;

  const showLap = (lap: (typeof laps)[number], x: number, y: number, clamped: boolean, flying: boolean) =>
    setTip({
      x,
      y,
      title: `${formatLapTime(lap.seconds)}`,
      detail: `${lap.isPersonalBest ? 'new best · ' : ''}lap ${lap.seq} of ${laps.length}${
        clamped ? ' · out-lap' : flying ? '' : ' · slower lap'
      }`
    });

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
        onClick={() => setTip(null)}
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

        {/* the benchmark he's building toward — his group's / the session's fastest */}
        <line x1={padL} x2={width - padR} y1={benchmarkY} y2={benchmarkY} stroke={INK} strokeWidth={1} strokeDasharray="2 3" opacity={0.5} />
        <text x={width - padR} y={benchmarkY - 5} textAnchor="end" fontSize={10.5} fill="var(--ink-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {benchLabel}
        </text>

        {/* running-best staircase — single-series ink line (house chart standard) */}
        <path
          d={stair.join(' ')}
          fill="none"
          stroke={INK}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.9}
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

        {/* the laps: ink marks; gold ONLY on his fastest lap (terminal best) */}
        {laps.map((lap) => {
          const clamped = lap.seconds > yBottom; // out-/in-lap slower than the band
          const x = xOf(lap.seq);
          const y = yOf(lap.seconds);
          const flying = lap.kind === 'flying';
          const isBest = lap.seq === goldSeq;
          return (
            <g key={lap.seq}>
              {/* generous invisible hit target — hover, tap, and keyboard focus */}
              <circle
                cx={x}
                cy={y}
                r={12}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`Lap ${lap.seq} of ${laps.length}: ${formatLapTime(lap.seconds)}${lap.isPersonalBest ? ', new best' : ''}`}
                style={{ cursor: 'pointer', outline: 'none' }}
                onMouseEnter={() => showLap(lap, x, y, clamped, flying)}
                onFocus={() => showLap(lap, x, y, clamped, flying)}
                onClick={(event) => {
                  event.stopPropagation();
                  showLap(lap, x, y, clamped, flying);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    showLap(lap, x, y, clamped, flying);
                  }
                }}
              />
              <circle
                cx={x}
                cy={y}
                r={isBest ? 4.6 : lap.isPersonalBest ? 3.6 : 3}
                fill={isBest ? GOLD : flying ? INK : 'var(--surface-0)'}
                stroke={isBest ? GOLD : flying ? INK : 'var(--hairline)'}
                strokeWidth={isBest || flying ? 0 : 1.4}
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

const QualiModule = ({
  session,
  coverage,
  gridClassification
}: {
  session: QualiLabSession;
  coverage: QualiLabCoverage;
  gridClassification: QualiGridClassification | null;
}) => {
  const coarse = useCoarsePointer();
  const cancelled = session.qualifyingStatus === 'cancelled';
  const gridClassifications = session.gridClassifications ?? [];
  const sharedDoubleheaderRun = gridClassifications.length > 1;
  const activeGridBasis = gridClassification?.lapSelection ?? null;
  const activeGridUsesFastestLap = activeGridBasis === null || activeGridBasis === 'fastest' || activeGridBasis === 'fastest_lap';
  const grid = cancelled ? null : gridOutcomeSentence(session);
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

  /* The headline best lap is the official classification where one exists; the
   * eight oval qualifying rows carry no official single-lap best, so the value
   * shown is his fastest CAPTURED lap and is labelled as such (never dressed up
   * as official). */
  const hasOfficialBest = session.officialBestLapSeconds !== null;
  const hasGrid = session.combinedGridPosition !== null;
  const bestValue = session.officialBestLapSeconds ?? session.bryceBestSeconds;
  const activeGridLapLabel = gridClassification && gridClassification.officialBestLapSeconds !== null
    ? sharedDoubleheaderRun
      ? `${gridClassification.raceLabel ?? 'This race'} grid lap · ${gridBasisLabel(gridClassification.lapSelection)}`
      : activeGridBasis === 'two_lap_average' || activeGridBasis === 'oval_two_lap_average'
        ? 'two-lap average'
        : null
    : null;
  const bestLabel = cancelled
    ? 'quickest observed lap before cancellation'
    : activeGridLapLabel ?? (hasOfficialBest ? 'his best lap' : 'captured best lap');

  /* Substrate honesty: when the capture's best lap sits a touch slower than the
   * official best, the run's floor and the headline disagree — disclose it
   * whenever the two render as DIFFERENT times (rounding tolerance), not only
   * beyond an arbitrary 0.15s. Sub-millisecond gaps that round to the same
   * displayed time need no sentence. */
  const gap = session.capturedBestVsOfficialSeconds;
  const captureGap =
    gap !== null &&
    gap > 0 &&
    hasOfficialBest &&
    (!sharedDoubleheaderRun || activeGridUsesFastestLap) &&
    formatLapTime(session.officialBestLapSeconds) !== formatLapTime(session.bryceBestSeconds)
      ? `His official best was ${formatLapTime(session.officialBestLapSeconds)}; the capture holds his laps down to ${formatLapTime(session.bryceBestSeconds)}.`
      : null;

  const rankNote = cancelled
    ? 'The qualifying session was cancelled and produced no official classification or grid. The available lap record is shown only as an interrupted run.'
    : !hasOfficialBest
    ? 'The grid position and rank come from the official qualifying classification in the canonical dataset; this oval qualifying carries no official single-lap best, so the best lap shown is his fastest captured lap.'
    : !hasGrid
      ? 'His group rank and headline best lap come from the official qualifying classification in the canonical dataset; the combined grid for this weekend is not in that data, so only his group result is shown.'
      : 'The grid position, group rank, and headline best lap come from the official qualifying classification in the canonical dataset.';

  const benchmarkSourceWord = session.benchmarkScope === 'group' ? 'the fastest lap in his qualifying group' : "the session's fastest lap";
  const runIsOfficial = session.sourceTier === 'official_section_results';

  const totalSessions = coverage.coveredSessions + coverage.excludedSessions;
  const coverageNote = `The lab covers ${coverage.coveredSessions} of ${totalSessions} INDY NXT qualifying sessions across 2024–2026. The other ${coverage.excludedSessions} are set aside: ${coverage.exclusions
    .map((exclusion) => `${exclusion.venueName} ${exclusion.seasonYear} (${exclusion.note})`)
    .join('; ')}.`;

  const is2026 = session.source === 'timing71';
  const entries = [
    {
      label: `Run-by-run laps · ${session.sourceTierLabel}`,
      note: runIsOfficial
        ? `Bryce's laps in session order and ${benchmarkSourceWord} come from the official Section Results report.`
        : `Bryce's laps in session order and ${benchmarkSourceWord} come from the ${session.sourceTierLabel} — a third-party capture, not official timing.`
    },
    {
      label: 'Qualifying result · official qualifying classification',
      note: rankNote
    },
    ...(cancelled && session.cancellation
      ? [{ label: 'Official cancellation notice', path: session.cancellation.url ?? undefined, note: session.cancellation.note }]
      : []),
    {
      label: `Coverage · ${coverage.coveredSessions} of ${totalSessions} qualifying sessions`,
      note: coverageNote
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
      title={cancelled ? 'His interrupted qualifying run' : 'His qualifying, run by run'}
      action={
        <SourcePill
          title={`${session.venueName} ${session.seasonYear} qualifying`}
          entries={entries}
          caveats={runIsOfficial ? ['Official Section Results are time-based timing-loop records, not GPS.'] : ['Third-party derived analytics, never official timing.']}
        />
      }
    >
      <div style={{ padding: '0 18px 16px', display: 'grid', gap: 12 }}>
        {cancelled ? (
          <Unavailable>
            <span>
              Qualifying was cancelled before an official classification. These laps are the interrupted session record and did not set a grid.
              {session.cancellation?.url ? (
                <> <a href={session.cancellation.url} target="_blank" rel="noreferrer">Official notice</a>.</>
              ) : null}
            </span>
          </Unavailable>
        ) : null}
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
              {formatLapTime(bestValue)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 2 }}>{bestLabel}</div>
          </div>
        </div>

        {sharedDoubleheaderRun ? (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginBottom: 6 }}>
              One physical qualifying session set both grids. The captured lap run is shared; each grid below is its own official classification.
            </div>
            <div className="row row--wrap" style={{ gap: '6px 18px' }}>
              {gridClassifications.map((classification) => {
                const active = classification.raceSessionId === gridClassification?.raceSessionId;
                return (
                  <span
                    key={classification.raceSessionId}
                    className="tnum"
                    style={{ fontSize: 12, color: active ? 'var(--ink-primary)' : 'var(--ink-secondary)', fontWeight: active ? 620 : 450 }}
                  >
                    {classification.raceLabel ?? 'Race grid'}:{' '}
                    {classification.combinedGridPosition !== null && classification.combinedFieldSize !== null
                      ? `P${classification.combinedGridPosition} of ${classification.combinedFieldSize}`
                      : 'classification unavailable'}{' '}
                    · {gridBasisLabel(classification.lapSelection)}
                    {classification.officialBestLapSeconds !== null ? ` · ${formatLapTime(classification.officialBestLapSeconds)}` : ''}
                    {active ? ' · this race' : ''}
                  </span>
                );
              })}
            </div>
          </div>
        ) : null}

        <RunByRunChart session={session} />

        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
          {bestLine ? `${bestLine} ` : ''}
          {cancelled
            ? 'The session was stopped before an official qualifying result.'
            : session.sessionBestByBryce
            ? session.benchmarkScope === 'group'
              ? 'His best was his group’s fastest lap.'
              : 'His best was the session’s fastest lap.'
            : session.benchmarkScope === 'group'
              ? `His group’s fastest lap was ${formatLapTime(session.sessionBestSeconds)}.`
              : `The session’s fastest lap was ${formatLapTime(session.sessionBestSeconds)}.`}
          {captureGap ? ` ${captureGap}` : ''}{' '}
          <span style={{ color: 'var(--ink-muted)' }}>
            {coarse ? 'Tap' : 'Hover'} a lap for its time. Laps in session order; the line is his best lap so far, the gold dot his fastest. {session.sourceTierLabel}.
          </span>
        </p>
      </div>
    </Card>
  );
};

/** Race-2 doubleheader page whose own qualifying was not captured: a quiet note
 *  in the weekend-arc slot instead of silence — no rank claim, never Race-1's. */
const QualiPairedNoteCard = ({ note }: { note: QualiPairedNote }) => (
  <Card title="His qualifying, run by run">
    <div style={{ padding: '0 18px 16px' }}>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-secondary)', lineHeight: 1.55 }}>
        This is {note.notedRaceLabel ?? 'the second race'} of the {note.venueName} {note.seasonYear} doubleheader. Only{' '}
        {note.capturedRaceLabel ?? 'the first race'}’s qualifying run was captured, and it set a different grid, so there’s
        no separate run-by-run to show for {note.notedRaceLabel ?? 'this race'}.
      </p>
    </div>
  </Card>
);

const QualiCoverageNoteCard = ({ race }: { race: QualiCoverageRace }) => (
  <Card title="His qualifying, run by run">
    <Unavailable>
      <span>
        {race.note}
        {race.sourceUrl ? (
          <> <a href={race.sourceUrl} target="_blank" rel="noreferrer">Official notice</a>.</>
        ) : null}
      </span>
    </Unavailable>
  </Card>
);

/** Renders the module for a race page from the resolution hoisted in
 *  RaceDetailScreen: the covered qualifying module, a quiet Race-2 note, or
 *  nothing (honest absence — no placeholder). */
export const QualifyingRunByRunCard = ({ resolution }: { resolution: QualiLabResolution | null | 'failed' }) => {
  if (!resolution || resolution === 'failed') return null;
  if (resolution.session)
    return <QualiModule session={resolution.session} coverage={resolution.coverage} gridClassification={resolution.gridClassification} />;
  if (resolution.pairedNote) return <QualiPairedNoteCard note={resolution.pairedNote} />;
  if (resolution.coverageRace && (resolution.coverageRace.status === 'cancelled' || resolution.coverageRace.status === 'unavailable'))
    return <QualiCoverageNoteCard race={resolution.coverageRace} />;
  return null;
};
