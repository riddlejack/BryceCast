import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CloudSun, ExternalLink, MapPin, Route, Tv } from 'lucide-react';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import { Card, Countdown, HeroPanel, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatClock, formatDate, formatNumber, shortVenue, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import { useApiJson } from '../app/useApiJson';
import { normalizedName, useNextSession } from '../app/useNextSession';
import {
  daysUntil,
  getNextEventPrep,
  getPrepScreen,
  getStandingsSnapshot,
  getUpcomingEvents,
  type UpcomingPrepEvent
} from '../data/upcoming';
import type { UiNextEventPrep, UiNextEventPrepRace, UiStandingsSnapshot } from '../data/uiDataPackage';
import { loadDebriefArchive } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/* ---------- shared: measured-width SVG charts (crisp text at any size) ---------- */

const useMeasuredWidth = <T extends HTMLElement>() => {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth((previous) => (Math.abs(previous - next) > 0.5 ? next : previous));
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

const chartFont = '-apple-system, system-ui, sans-serif';
const inkConnector = 'rgba(29, 29, 31, 0.32)';

/** Compact venue names for chart row labels; falls back to shortVenue. */
const venueShortNames: Record<string, string> = {
  'World Wide Technology Raceway': 'WWTR',
  'The Milwaukee Mile': 'Milwaukee',
  'Iowa Speedway': 'Iowa',
  'Nashville Superspeedway': 'Nashville'
};

const venueShort = (trackName: string): string => venueShortNames[trackName] ?? shortVenue(trackName);

/* ---------- hero: the track, drawn from OpenStreetMap geometry ---------- */

const TrackArt = ({ outline, annotateCorner }: { outline: TrackOutline; annotateCorner?: string | null }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [, , viewWidth, viewHeight] = outline.viewBox.split(' ').map(Number);
  const scale = width > 0 ? width / viewWidth : 1;
  const px = (visual: number) => visual / scale;
  const center = { x: viewWidth / 2, y: viewHeight / 2 };

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 ? (
        <svg
          viewBox={outline.viewBox}
          width={width}
          height={width * (viewHeight / viewWidth)}
          role="img"
          aria-label={`${outline.name} track outline`}
          style={{ overflow: 'visible', display: 'block' }}
        >
          <path
            d={outline.mainPath}
            fill="none"
            stroke="var(--ink-primary)"
            strokeWidth={px(2)}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {outline.startFinish ? (
            <g
              transform={`translate(${outline.startFinish.x} ${outline.startFinish.y}) rotate(${outline.startFinish.angleDeg + 90})`}
            >
              <line
                x1={-px(9)}
                x2={px(9)}
                stroke="var(--bryce)"
                strokeWidth={px(3.5)}
                strokeLinecap="round"
              />
            </g>
          ) : null}
          {outline.cornerArcs
            .filter((arc) => arc.label)
            .map((arc) => {
              const away = Math.hypot(arc.apex.x - center.x, arc.apex.y - center.y) || 1;
              const offsetX = ((arc.apex.x - center.x) / away) * px(22);
              const offsetY = ((arc.apex.y - center.y) / away) * px(22);
              const highlighted = annotateCorner != null && arc.label === annotateCorner;
              return (
                <g key={arc.label}>
                  {highlighted ? <circle cx={arc.apex.x} cy={arc.apex.y} r={px(4.5)} fill="var(--bryce)" /> : null}
                  <text
                    x={arc.apex.x + offsetX}
                    y={arc.apex.y + offsetY}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={highlighted ? 'var(--ink-primary)' : 'var(--ink-muted)'}
                    fontFamily={chartFont}
                    fontSize={px(12)}
                    fontWeight={highlighted ? 600 : 500}
                  >
                    {arc.label}
                  </text>
                </g>
              );
            })}
        </svg>
      ) : null}
    </div>
  );
};

/* ---------- the oval story: every start→finish, one row per race ---------- */

const positionDomain = (races: UiNextEventPrepRace[]): number => {
  const worst = Math.max(...races.flatMap((race) => [race.startPosition ?? 1, race.finishPosition ?? 1]));
  return Math.max(worst + 1, 12);
};

const ConversionChart = ({ prep }: { prep: UiNextEventPrep }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const races = prep.races;
  const labelWidth = width < 480 ? 86 : 118;
  const rowHeight = 30;
  const axisHeight = 20;
  const plotLeft = labelWidth + 6;
  const plotWidth = Math.max(width - plotLeft - 14, 60);
  const maxPosition = positionDomain(races);
  const x = (position: number) => plotLeft + ((position - 1) / (maxPosition - 1)) * plotWidth;
  const height = axisHeight + races.length * rowHeight + 6;
  const ticks = [1, 5, 10, 15, 20].filter((tick) => tick <= maxPosition);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Start to finish, every INDY NXT oval race">
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={axisHeight - 4} y2={height - 4} stroke="var(--grid-hairline)" />
              <text
                x={x(tick)}
                y={axisHeight - 9}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}
          {races.map((race, index) => {
            const y = axisHeight + index * rowHeight + rowHeight / 2;
            const start = race.startPosition;
            const finish = race.finishPosition;
            if (start === null || finish === null) return null;
            const clean = race.officialStatus === 'running';
            const seasonShort = race.seasonYear !== null ? `’${String(race.seasonYear).slice(2)}` : '';
            const rowLabel = `${seasonShort} ${venueShort(race.trackName)}`;
            return (
              <g key={race.sessionId}>
                <title>
                  {`${race.raceLabel}: started P${start}, finished P${finish}${clean ? '' : ` (${race.officialStatus})`}`}
                </title>
                <text
                  x={labelWidth}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={race.sameTrack ? 'var(--ink-primary)' : 'var(--ink-secondary)'}
                  fontFamily={chartFont}
                  fontSize={12}
                  fontWeight={race.sameTrack ? 620 : 460}
                >
                  {rowLabel}
                </text>
                <line
                  x1={x(start)}
                  x2={x(finish)}
                  y1={y}
                  y2={y}
                  stroke={clean ? inkConnector : 'var(--hairline)'}
                  strokeWidth={2}
                  strokeDasharray={clean ? undefined : '3 4'}
                  strokeLinecap="round"
                />
                <circle cx={x(start)} cy={y} r={4} fill="var(--surface-1)" stroke={clean ? 'rgba(29,29,31,0.5)' : 'var(--hairline)'} strokeWidth={1.6} />
                <circle
                  cx={x(finish)}
                  cy={y}
                  r={4.6}
                  fill={clean ? (race.sameTrack ? 'var(--bryce)' : 'var(--ink-primary)') : 'var(--surface-1)'}
                  stroke={clean ? (race.sameTrack ? 'var(--bryce)' : 'var(--ink-primary)') : 'var(--ink-muted)'}
                  strokeWidth={1.6}
                />
                {race.sameTrack ? (
                  <text
                    x={x(finish) + (finish <= start ? -10 : 10)}
                    y={y}
                    textAnchor={finish <= start ? 'end' : 'start'}
                    dominantBaseline="middle"
                    fill="var(--ink-primary)"
                    fontFamily={chartFont}
                    fontSize={11.5}
                    fontWeight={640}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    P{finish}
                  </text>
                ) : null}
                {!clean ? (
                  <text
                    x={x(Math.max(start, finish)) + 6}
                    y={y - 11}
                    textAnchor="end"
                    fill="var(--ink-muted)"
                    fontFamily={chartFont}
                    fontSize={11}
                  >
                    {race.officialStatus}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
};

const OvalStory = ({ prep, trackTypeName }: { prep: UiNextEventPrep; trackTypeName: string }) => {
  const summary = prep.raceSummary;
  const gainText =
    summary.cleanAvgGain !== null && summary.cleanAvgGain > 0 ? `+${formatNumber(summary.cleanAvgGain)}` : formatNumber(summary.cleanAvgGain);
  return (
    <Card
      title={`Every ${trackTypeName.toLowerCase()}, start to finish`}
      action={
        <SourcePill
          title={`Bryce's INDY NXT ${trackTypeName.toLowerCase()} record`}
          entries={[
            {
              label: 'Race debrief scores · start/finish rows',
              path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/race_debrief_scores.csv',
              note: 'Start and finish for every Bryce INDY NXT race on this track type.'
            },
            {
              label: 'Official result status',
              path: 'data/career/career.dataset.json',
              note: 'Result status from official session results labels the non-running race.'
            }
          ]}
          caveats={prep.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
        {summary.raceCount} starts. He finished ahead of where he started in {summary.movedForwardCount} of them
        {summary.nonRunningStatuses.length === 1 ? ' — the exception was a mechanical retirement, not pace' : ''}.
      </p>
      <p className="caption caption--secondary" style={{ margin: '0 0 10px' }}>
        ○ started · ● finished · gold marks {shortVenue(prep.trackName)}
      </p>
      <ConversionChart prep={prep} />
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
        When the car finished: average finish {formatNumber(summary.cleanAvgFinish)}, average gain {gainText}, top-10 in{' '}
        {summary.cleanTop10Count} of {summary.cleanRaceCount} · mechanical DNF shown dashed, excluded from these averages.
      </p>
    </Card>
  );
};

/* ---------- the Friday signal: best practice rank → race finish ---------- */

const FridaySlope = ({ prep }: { prep: UiNextEventPrep }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const rows = prep.fridaySignal.filter((row) => row.officialStatus === 'running' && row.bestPracticeRank !== null && row.raceFinish !== null);
  if (rows.length < 3) return null;
  const worst = Math.max(...rows.flatMap((row) => [row.bestPracticeRank ?? 1, row.raceFinish ?? 1]));
  const maxRank = Math.max(worst + 1, 12);
  const height = 210;
  const top = 26;
  const bottom = height - 22;
  const leftX = width < 480 ? 96 : 130;
  const rightX = width - (width < 480 ? 96 : 130);
  const y = (rank: number) => top + ((rank - 1) / (maxRank - 1)) * (bottom - top);

  /* Same-track finish labels can land a position apart; spread any pair
   * closer than a line-height so neither is obscured. */
  const labeledRows = rows.filter((row) => row.sameTrack);
  const labelY = new Map<string, number>(labeledRows.map((row) => [row.sessionId, y(row.raceFinish as number)]));
  const ordered = [...labeledRows].sort((a, b) => (labelY.get(a.sessionId) ?? 0) - (labelY.get(b.sessionId) ?? 0));
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = labelY.get(ordered[index - 1].sessionId) ?? 0;
    const current = labelY.get(ordered[index].sessionId) ?? 0;
    if (current - previous < 14) labelY.set(ordered[index].sessionId, previous + 14);
  }

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Best practice rank versus race finish on ovals">
          {[leftX, rightX].map((columnX) => (
            <line key={columnX} x1={columnX} x2={columnX} y1={top - 6} y2={bottom + 6} stroke="var(--grid-hairline)" />
          ))}
          <text x={leftX} y={14} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11.5} fontWeight={550}>
            Friday practice
          </text>
          <text x={rightX} y={14} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11.5} fontWeight={550}>
            Race finish
          </text>
          {[1, Math.round(maxRank / 2), maxRank].map((rank) => (
            <text
              key={rank}
              x={leftX - 34}
              y={y(rank)}
              textAnchor="end"
              dominantBaseline="middle"
              fill="var(--ink-muted)"
              fontFamily={chartFont}
              fontSize={10.5}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              P{rank}
            </text>
          ))}
          {rows.map((row) => {
            const practice = row.bestPracticeRank as number;
            const finish = row.raceFinish as number;
            const seasonShort = row.seasonYear !== null ? `’${String(row.seasonYear).slice(2)}` : '';
            return (
              <g key={row.sessionId}>
                <title>{`${row.raceLabel}: best practice P${practice} → finished P${finish}`}</title>
                <line
                  x1={leftX}
                  x2={rightX}
                  y1={y(practice)}
                  y2={y(finish)}
                  stroke="var(--ink-primary)"
                  strokeWidth={row.sameTrack ? 2.2 : 1.6}
                  strokeOpacity={row.sameTrack ? 1 : 0.34}
                  strokeLinecap="round"
                />
                <circle cx={leftX} cy={y(practice)} r={3.4} fill="var(--surface-1)" stroke="var(--ink-primary)" strokeOpacity={row.sameTrack ? 1 : 0.4} strokeWidth={1.6} />
                <circle cx={rightX} cy={y(finish)} r={row.sameTrack ? 4.6 : 3.4} fill={row.sameTrack ? 'var(--bryce)' : 'var(--ink-primary)'} fillOpacity={row.sameTrack ? 1 : 0.4} />
                {row.sameTrack ? (
                  <text
                    x={rightX + 12}
                    y={labelY.get(row.sessionId) ?? y(finish)}
                    dominantBaseline="middle"
                    fill="var(--ink-primary)"
                    fontFamily={chartFont}
                    fontSize={11.5}
                    fontWeight={620}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {seasonShort} · P{finish}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
};

const FridaySignal = ({ prep, trackTypeName }: { prep: UiNextEventPrep; trackTypeName: string }) => {
  const summary = prep.fridaySummary;
  if (summary.weekendCount < 3) return null;
  return (
    <Card
      title="The Friday signal"
      action={
        <SourcePill
          title="Practice rank vs race finish"
          entries={[
            {
              label: 'Prep session signals',
              path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/prep_session_signals.csv',
              note: `Best practice rank and race result for every Bryce ${trackTypeName.toLowerCase()} weekend with practice data. Mechanical-DNF weekend excluded from the summary count, shown in the drawer.`
            }
          ]}
          caveats={prep.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 6px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>
        On {trackTypeName.toLowerCase()}s, race day has beaten Friday. His finish improved on his best practice rank in{' '}
        <strong style={{ color: 'var(--ink-primary)' }}>
          {summary.finishBeatBestPractice} of {summary.weekendCount}
        </strong>{' '}
        clean weekends{summary.medianPositionsBetter !== null ? `, typically by ${summary.medianPositionsBetter} spots` : ''}. If
        practice looks mid, wait for the race.
      </p>
      <FridaySlope prep={prep} />
      <p className="caption caption--secondary" style={{ margin: '6px 0 0' }}>
        Gold dots: {shortVenue(prep.trackName)} weekends. Practice order and race format differ; read as a signal, not a scale.
      </p>
    </Card>
  );
};

/* ---------- the points picture: the neighborhood around P17 ---------- */

const PointsStrip = ({ snapshot }: { snapshot: Extract<UiStandingsSnapshot, { available: true }> }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const bryceRank = snapshot.bryce.pointsRankInCapture;
  const nearby = snapshot.entries.filter((entry) => Math.abs(entry.pointsRankInCapture - bryceRank) <= 3);
  const minPoints = Math.min(...nearby.map((entry) => entry.points));
  const maxPoints = Math.max(...nearby.map((entry) => entry.points));
  const pad = Math.max(Math.round((maxPoints - minPoints) * 0.08), 6);
  const domainMin = minPoints - pad;
  const domainMax = maxPoints + pad;
  const height = 74;
  const axisY = 40;
  const x = (points: number) => 14 + ((points - domainMin) / (domainMax - domainMin)) * (width - 28);
  /* On narrow cards the interior rival labels collide; the list below carries
   * the values, so the strip keeps only its endpoints (anchoring the scale)
   * and Bryce. */
  const labelAllRivals = width >= 560;
  const endpointRanks = new Set([nearby[0]?.pointsRankInCapture, nearby[nearby.length - 1]?.pointsRankInCapture]);

  return (
    <div ref={ref} style={{ width: '100%' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Championship points around Bryce">
          <line x1={14} x2={width - 14} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
          {nearby.map((entry) => {
            const pointX = x(entry.points);
            const above = entry.pointsRankInCapture % 2 === 0;
            return (
              <g key={entry.carNo}>
                <title>{`${entry.driverName} · ${entry.points} pts`}</title>
                {entry.isBryce ? (
                  <>
                    <rect x={pointX - 9} y={axisY - 9} width={18} height={18} rx={5} fill="var(--bryce)" />
                    <text
                      x={pointX}
                      y={axisY + 0.5}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill="var(--bryce-ink-on)"
                      fontFamily={chartFont}
                      fontSize={11}
                      fontWeight={700}
                    >
                      9
                    </text>
                    <text
                      x={pointX}
                      y={axisY + 26}
                      textAnchor="middle"
                      fill="var(--ink-primary)"
                      fontFamily={chartFont}
                      fontSize={11.5}
                      fontWeight={640}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {entry.points}
                    </text>
                  </>
                ) : (
                  <>
                    <circle cx={pointX} cy={axisY} r={4} fill="var(--ink-primary)" fillOpacity={0.55} />
                    {labelAllRivals || endpointRanks.has(entry.pointsRankInCapture) ? (
                      <text
                        x={pointX}
                        y={above ? axisY - 14 : axisY + 20}
                        textAnchor={
                          labelAllRivals ? 'middle' : entry.points < snapshot.bryce.points ? 'start' : 'end'
                        }
                        fill="var(--ink-secondary)"
                        fontFamily={chartFont}
                        fontSize={10.5}
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      >
                        {entry.driverName.split(' ').slice(-1)[0]} {entry.points}
                      </text>
                    ) : null}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      ) : null}
    </div>
  );
};

const PointsPicture = ({ snapshot }: { snapshot: UiStandingsSnapshot }) => {
  if (!snapshot.available) {
    return (
      <Card title="The points picture">
        <Unavailable>Standings context is unavailable in this build: {snapshot.reason}</Unavailable>
      </Card>
    );
  }
  const bryceRank = snapshot.bryce.pointsRankInCapture;
  const rivals = snapshot.entries.filter((entry) => !entry.isBryce && Math.abs(entry.pointsRankInCapture - bryceRank) <= 3);
  const nextUp = snapshot.entries.find((entry) => entry.pointsRankInCapture === bryceRank - 1);

  return (
    <Card
      title="The points picture"
      action={
        <SourcePill
          title="Championship points around Bryce"
          entries={[
            {
              label: 'Race Control capture · last completed race',
              path: snapshot.capturePath,
              note: `Full-field running points at the end of ${snapshot.eventName ?? 'the last race'} (${snapshot.sessionName ?? 'race'}). The /api/timing route serves the same capture.`
            },
            {
              label: 'Career head-to-head',
              path: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv',
              note: 'Shared-race records vs each rival across all Bryce INDY NXT seasons.'
            }
          ]}
          caveats={snapshot.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 2px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '60ch' }}>
        <strong style={{ color: 'var(--ink-primary)' }}>{snapshot.bryce.points} points</strong> with {snapshot.racesRemaining}{' '}
        races left{nextUp ? ` — ${nextUp.driverName.split(' ').slice(-1)[0]} is ${nextUp.points - snapshot.bryce.points} up the road` : ''}.
      </p>
      <PointsStrip snapshot={snapshot} />
      <div className="stack" style={{ gap: 0, marginTop: 6 }}>
        {rivals.map((entry) => {
          const gap = entry.points - snapshot.bryce.points;
          const record =
            entry.headToHead && entry.headToHead.bryceAhead !== null && entry.headToHead.bryceBehind !== null
              ? `${entry.headToHead.bryceAhead}–${entry.headToHead.bryceBehind}`
              : null;
          return (
            <div
              key={entry.carNo}
              className="row row--between"
              style={{ padding: '7px 0', borderBottom: '1px solid var(--grid-hairline)', fontSize: 13 }}
            >
              <span style={{ fontWeight: 520 }}>{entry.driverName}</span>
              <span className="row" style={{ gap: 14 }}>
                {record ? (
                  <span className="tnum" style={{ color: 'var(--ink-muted)', fontSize: 12 }}>
                    head-to-head {record}
                  </span>
                ) : null}
                <span className="tnum" style={{ color: 'var(--ink-secondary)', minWidth: 38, textAlign: 'right' }}>
                  {gap > 0 ? `+${gap}` : `−${Math.abs(gap)}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <p className="caption caption--secondary" style={{ margin: '10px 0 0' }}>
        Points from our timing capture at {shortVenue(snapshot.eventName)} · unofficial · head-to-head counts every shared race
        since 2024.
      </p>
    </Card>
  );
};

/* ---------- the shape of the weekend (historical prior band) ---------- */

const PriorBand = ({ event }: { event: UpcomingPrepEvent }) => {
  const band = ((event.predictionBand as unknown as Row)?.finishPercentileBand ?? {}) as Row;
  const p25 = asNumber(band.p25);
  const median = asNumber(band.median);
  const p75 = asNumber(band.p75);
  const n = asNumber(band.n);
  if (p25 === null || median === null || p75 === null) return null;
  const toPct = (value: number) => Math.round(value * 100);
  const typeName = trackTypeLabel(event.trackType).toLowerCase();

  return (
    <Card
      title="The shape of the weekend"
      action={
        <SourcePill
          title="Historical prior band"
          entries={[
            {
              label: 'Career prior matrix · finish percentile band',
              path: 'analysis/predictive-race-intelligence/output/career_prior_matrix.csv',
              note: `p25/median/p75 of Bryce's finish percentile across ${formatNumber(n, 0)} ${typeName} races. No model prediction — a source-backed historical range.`
            }
          ]}
          caveats={['History, not a prediction. The band describes past races on this track type, nothing more.']}
        />
      }
    >
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>
        Across {formatNumber(n, 0)} {typeName} races, his typical day landed around the{' '}
        <strong style={{ color: 'var(--ink-primary)' }}>{toPct(median)}th percentile</strong> of the field — a quarter of days
        below the {toPct(p25)}th, a quarter above the {toPct(p75)}th.
      </p>
      <div style={{ position: 'relative', height: 34, margin: '0 6px' }}>
        <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 6, borderRadius: 3, background: 'var(--surface-2)' }} />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: `${toPct(p25)}%`,
            width: `${Math.max(toPct(p75) - toPct(p25), 2)}%`,
            height: 10,
            borderRadius: 5,
            background: 'color-mix(in srgb, var(--series-1) 30%, transparent)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: `calc(${toPct(median)}% - 2px)`,
            width: 4,
            height: 22,
            borderRadius: 2,
            background: 'var(--bryce)'
          }}
        />
      </div>
      <div className="row row--between" style={{ marginTop: 4 }}>
        <span className="caption">Tougher day</span>
        <span className="caption" style={{ color: 'var(--ink-primary)', fontWeight: 570 }}>
          median · {toPct(median)}th pctile
        </span>
        <span className="caption">Stronger day</span>
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>History, not a prediction.</p>
    </Card>
  );
};

/* ---------- what needs to go right (family-readable path factors) ---------- */

const factorFamilyCopy: Array<{ match: RegExp; copy: string }> = [
  { match: /qualifying|start position/i, copy: 'Where you start matters most — a clean qualifying lap has been the best single predictor of where Bryce finishes.' },
  { match: /conversion/i, copy: 'Turning pace into positions on this kind of track — his record here sets the baseline for the weekend.' },
  { match: /same-track/i, copy: 'He’s raced here before, so the notebook is open: restarts, traffic, and where passing actually works.' },
  { match: /chaos|incident/i, copy: 'Clean laps win weekends — the tough results in the data usually trace back to contact or reliability, not pace.' },
  { match: /analog/i, copy: 'The most similar past races give a feel for how this one could flow.' }
];

const familyCopyFor = (factor: string, fallback: string | null): string =>
  factorFamilyCopy.find((entry) => entry.match.test(factor))?.copy ?? fallback ?? '';

const PathFactors = ({ event }: { event: UpcomingPrepEvent }) => {
  const factors = Array.isArray(event.top10Path) ? (event.top10Path as unknown as Row[]) : [];
  if (factors.length === 0) return null;
  return (
    <Card
      title="What needs to go right"
      action={
        <SourcePill
          title="Top-10 path factors"
          entries={factors.map((factor) => ({
            label: asString(factor.factor) ?? 'Factor',
            note: [asString(factor.whyItMatters), asString(factor.actionableRead)].filter(Boolean).join(' — ')
          }))}
          caveats={['Path language only — no win or top-10 probability is claimed. The analytical detail behind each factor lives here.']}
        />
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {factors.map((factor, index) => {
          const title = asString(factor.factor) ?? `Factor ${index + 1}`;
          const state = asString(factor.currentState);
          return (
            <div key={title} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span className="figure" style={{ flex: 'none', width: 20, fontSize: 14, color: 'var(--ink-muted)', textAlign: 'right' }}>
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 640, fontSize: 14 }}>{title}</div>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }}>
                  {familyCopyFor(title, asString(factor.actionableRead))}
                </p>
                {state && state.length < 70 ? (
                  <span className="chip chip--outline" style={{ marginTop: 6 }}>
                    {state}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- races that rhyme ---------- */

const AnalogRaces = ({ event }: { event: UpcomingPrepEvent }) => {
  const analogs = Array.isArray(event.analogRaces) ? (event.analogRaces as unknown as Row[]) : [];
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadDebriefArchive()
      .then((archive) => setAvailableIds(new Set(archive.map((entry) => entry.pack.sessionId))))
      .catch(() => setAvailableIds(new Set()));
  }, []);
  if (analogs.length === 0) return null;
  return (
    <Card title="Races that rhyme with this one">
      <div className="stack" style={{ gap: 8 }}>
        {analogs.slice(0, 5).map((analog, index) => {
          const sessionId = asString(analog.sessionId);
          const label = asString(analog.raceLabel) ?? `Analog ${index + 1}`;
          const kind = asString(analog.analogType) === 'same_track' ? 'same track' : 'same track type';
          const linked = sessionId !== null && availableIds.has(sessionId);
          const row = (
            <div className="row row--between" style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--surface-0)' }}>
              <span style={{ fontSize: 13.5, fontWeight: linked ? 600 : 450 }}>{label}</span>
              <span className="row" style={{ gap: 8 }}>
                <span className="chip chip--outline">{kind}</span>
                {linked ? <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>debrief →</span> : null}
              </span>
            </div>
          );
          return linked && sessionId ? (
            <Link key={label + index} to={`/races/${encodeURIComponent(sessionId)}`}>
              {row}
            </Link>
          ) : (
            <div key={label + index}>{row}</div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- weather window ---------- */

interface EventWeather {
  observationText: string | null;
  temperatureF: number | null;
  periods: Array<{ name: string; temperature: string; forecast: string; wind: string | null }>;
  readinessNote: string | null;
}

const useEventWeather = (eventId: string | null): EventWeather | null => {
  const [weather, setWeather] = useState<EventWeather | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/weather/upcoming', { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const payload = (await response.json()) as Row;
        const events = Array.isArray(payload.events) ? (payload.events as Row[]) : [];
        const match = events.find((entry) => asString((entry.event as Row)?.id) === eventId);
        if (!match || cancelled) return;
        const weatherData = (match.weather ?? {}) as Row;
        const observation = (weatherData.observation ?? {}) as Row;
        const temperatureC = asNumber(observation.temperatureC);
        const readiness = (match.forecastReadiness ?? {}) as Row;
        const eventRow = (match.event ?? {}) as Row;
        const eventDates = new Set(
          [asString(eventRow.eventStartDate), asString(eventRow.eventEndDate)].filter((value): value is string => value !== null)
        );
        const forecast = Array.isArray(weatherData.forecast) ? (weatherData.forecast as Row[]) : [];
        const periods = forecast
          .filter((period) => {
            // Match by the period's actual date (NWS startTime carries the local
            // offset) — weekday names would hit the wrong week for events 6+ days out.
            const startTime = asString(period.startTime);
            const isDaytime = period.isDaytime !== false;
            return isDaytime && startTime !== null && eventDates.has(startTime.slice(0, 10));
          })
          .slice(0, 3)
          .map((period) => ({
            name: asString(period.name) ?? '',
            temperature: `${formatNumber(period.temperature, 0)}°${asString(period.temperatureUnit) ?? 'F'}`,
            forecast: asString(period.shortForecast) ?? '',
            wind: asString(period.windSpeed)
          }));
        setWeather({
          observationText: asString(observation.textDescription),
          temperatureF: temperatureC !== null ? Math.round((temperatureC * 9) / 5 + 32) : null,
          periods,
          readinessNote: asString(readiness.note)
        });
      } catch {
        /* weather optional */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);
  return weather;
};

const WeatherWindow = ({ weather, raceDate }: { weather: EventWeather | null; raceDate: string }) => {
  if (!weather) return null;
  return (
    <Card
      title={
        <>
          <CloudSun size={15} aria-hidden />
          Weather window
        </>
      }
      action={
        <SourcePill
          title="Weather window"
          entries={[
            {
              label: 'National Weather Service forecast + nearest station observation',
              path: '/api/weather/upcoming',
              note: 'Ambient near-track weather. Not official INDY NXT weather and not track temperature.'
            }
          ]}
        />
      }
    >
      {weather.periods.length > 0 ? (
        <div className="grid grid--3">
          {weather.periods.map((period) => (
            <div key={period.name} className="stat">
              <span className="caption">{period.name}</span>
              <span className="stat__value" style={{ fontSize: 22 }}>
                {period.temperature}
              </span>
              <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{period.forecast}</span>
              {period.wind ? <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>wind {period.wind}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <Unavailable>
          Race-day forecast appears here once the NWS window reaches {formatDate(raceDate, { month: 'long', day: 'numeric' })} —
          usually about a week out.
        </Unavailable>
      )}
      {weather.temperatureF !== null ? (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
          At the track right now: {weather.temperatureF}°F
          {weather.observationText ? `, ${weather.observationText.toLowerCase()}` : ''}.
        </p>
      ) : null}
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Near-track weather · NWS · not official series weather.
      </p>
    </Card>
  );
};

/* ---------- follow the weekend ---------- */

const FollowTheWeekend = () => {
  const session = useApiJson<Row>('/api/session', 120_000);
  const route = (session.data?.broadcastRoute as Row) ?? null;
  const primary = (route?.primaryVideo as Row) ?? null;
  const audio = Array.isArray(route?.audio) ? (route?.audio as Row[]) : [];
  if (!primary && audio.length === 0) return null;
  return (
    <Card
      title={
        <>
          <Tv size={15} aria-hidden />
          Follow the weekend
        </>
      }
    >
      <div className="row row--wrap" style={{ gap: 8 }}>
        {primary ? (
          <a
            href={asString(primary.url) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="chip chip--bryce"
            style={{ fontSize: 12.5, padding: '7px 14px' }}
          >
            <ExternalLink size={12} aria-hidden />
            Watch on {asString(primary.name) ?? 'broadcast'}
          </a>
        ) : null}
        {audio.slice(0, 2).map((entry, index) => (
          <a
            key={index}
            href={asString(entry.url) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="chip chip--outline"
            style={{ fontSize: 12.5, padding: '7px 14px' }}
          >
            <ExternalLink size={12} aria-hidden />
            {asString(entry.name) ?? 'Radio'}
          </a>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Routes from the official schedule feed — where the broadcast actually lives this weekend.
      </p>
    </Card>
  );
};

/* ---------- later this season ---------- */

const LaterThisSeason = ({ events }: { events: UpcomingPrepEvent[] }) => {
  if (events.length === 0) return null;
  return (
    <Card title="Later this season">
      <div className="stack" style={{ gap: 4 }}>
        {events.map((event) => {
          const days = daysUntil(event);
          return (
            <div key={event.eventId} className="row row--between" style={{ padding: '7px 0', borderBottom: '1px solid var(--grid-hairline)' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 560 }}>{event.eventName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  {event.trackName} · {trackTypeLabel(event.trackType)}
                </div>
              </div>
              <span className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  {formatDate(event.eventStartDate, { month: 'short', day: 'numeric' })}
                </span>
                {days !== null ? <span className="chip chip--outline tnum">{days}d</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- weekend grouping (double-headers share one HQ) ---------- */

interface Weekend {
  primary: UpcomingPrepEvent;
  races: UpcomingPrepEvent[];
}

const groupWeekend = (events: UpcomingPrepEvent[]): Weekend | null => {
  if (events.length === 0) return null;
  const [primary] = events;
  const primaryTime = new Date(`${primary.eventStartDate}T12:00:00`).getTime();
  const races = events.filter(
    (event) =>
      event.trackName === primary.trackName &&
      Math.abs(new Date(`${event.eventStartDate}T12:00:00`).getTime() - primaryTime) <= 2 * 24 * 3600 * 1000
  );
  return { primary, races };
};

/* ---------- screen ---------- */

export const RaceWeekScreen = () => {
  const prep = getPrepScreen();
  const upcoming = getUpcomingEvents();
  const weekend = useMemo(() => groupWeekend(upcoming), [upcoming]);
  const nextSession = useNextSession();
  const weather = useEventWeather(weekend?.primary.eventId ?? null);
  const nextEventPrep = getNextEventPrep();
  const standings = getStandingsSnapshot();

  if (!weekend) {
    return (
      <div className="page stack">
        <header className="screen-head">
          <span className="kicker">Race week</span>
          <h1 className="screen-head__title">Off-season</h1>
        </header>
        <Card>
          <Unavailable>No upcoming races in the schedule yet. The next event appears here as soon as it’s published.</Unavailable>
        </Card>
      </div>
    );
  }

  const { primary, races } = weekend;
  const eventPrep = nextEventPrep && nextEventPrep.eventId === primary.eventId ? nextEventPrep : null;
  const trackTypeName = trackTypeLabel(primary.trackType);
  const outline = trackOutlineFor(primary.trackName);
  const days = daysUntil(primary);
  const sessionMatches =
    nextSession?.startsAt && normalizedName(nextSession.eventName).includes(normalizedName(primary.eventName).slice(0, 12));
  const preciseStart = sessionMatches ? nextSession?.startsAt ?? null : null;
  const later = upcoming.filter((event) => !races.includes(event));
  const hereBefore = eventPrep?.races.filter((race) => race.sameTrack) ?? [];
  /* Verified against the venue prep section pack (2 of 3 Nashville practice
   * sessions had Turn 3 as the best section family); venue-gated until the
   * next page session generalizes it from the supplemental pack. */
  const sectionNote =
    primary.trackName === 'Nashville Superspeedway'
      ? { corner: '3', text: 'Turn 3 was his strongest section in 2 of 3 past Nashville practice sessions.' }
      : null;

  return (
    <div className="page stack">
      <header className="screen-head row row--between" style={{ alignItems: 'flex-end', gap: 14 }}>
        <div>
          <span className="kicker">Race week</span>
          <h1 className="screen-head__title">{primary.eventName}</h1>
          <p className="screen-head__sub row row--wrap" style={{ gap: 6 }}>
            <span className="row" style={{ gap: 5, whiteSpace: 'nowrap' }}>
              <MapPin size={13} aria-hidden />
              {primary.trackName}
            </span>
            · {trackTypeName}
            {asNumber(primary.trackLengthMi) !== null ? <> · {formatNumber(primary.trackLengthMi, 2)} mi</> : null}
            {asNumber(primary.cornerCount) !== null && asNumber(primary.cornerCount)! > 0 ? (
              <> · {formatNumber(primary.cornerCount, 0)} corners</>
            ) : null}
          </p>
        </div>
        <SourcePill
          title={prep.title}
          entries={prep.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={prep.caveats}
        />
      </header>

      <HeroPanel tint="bryce">
        <div className="grid grid--split" style={{ alignItems: 'center', gap: 26 }}>
          {outline ? (
            <div>
              <TrackArt outline={outline} annotateCorner={sectionNote?.corner ?? null} />
              {sectionNote ? (
                <p className="caption caption--secondary" style={{ margin: '10px 0 0', textAlign: 'center' }}>
                  {sectionNote.text}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="stack" style={{ gap: 18 }}>
            <div>
              {preciseStart ? (
                <>
                  <span className="caption">
                    First session · {formatDate(preciseStart, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                    {formatClock(preciseStart)} your time
                    {nextSession?.sessionName ? ` · ${nextSession.sessionName}` : ''}
                  </span>
                  <div style={{ marginTop: 8 }}>
                    <Countdown to={preciseStart} />
                  </div>
                </>
              ) : (
                <>
                  <span className="caption">
                    {races.length > 1 ? 'Race weekend' : 'Race day'} ·{' '}
                    {formatDate(primary.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}
                  </span>
                  <div className="row" style={{ gap: 10, alignItems: 'baseline', marginTop: 6 }}>
                    <span className="stat__value stat__value--hero">{days ?? '—'}</span>
                    <span style={{ fontSize: 15, color: 'var(--ink-secondary)', fontWeight: 500 }}>
                      {days === 1 ? 'day to green' : 'days to green'}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-muted)' }}>
                    Session times appear here once Race Control publishes the weekend schedule.
                  </p>
                </>
              )}
            </div>
            {hereBefore.length > 0 ? (
              <div>
                <span className="caption">He’s raced here before</span>
                <div className="row row--wrap" style={{ gap: 22, marginTop: 8 }}>
                  {hereBefore.map((race) => (
                    <Stat
                      key={race.sessionId}
                      label={String(race.seasonYear ?? '')}
                      value={
                        <span className="tnum">
                          P{race.startPosition} → P{race.finishPosition}
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className="row" style={{ gap: 26 }}>
                <Stat label={`${trackTypeName} races`} value={formatNumber((primary.trackTypeHistory as Row).raceCount, 0)} />
                <Stat label="Avg finish" value={formatNumber((primary.trackTypeHistory as Row).avgFinish)} />
              </div>
            )}
            <div className="row" style={{ gap: 7, color: 'var(--ink-muted)', fontSize: 12 }}>
              <Route size={12} aria-hidden />
              The live companion arms automatically for every session this weekend.
            </div>
          </div>
        </div>
      </HeroPanel>

      {eventPrep ? <OvalStory prep={eventPrep} trackTypeName={trackTypeName} /> : null}

      <div className="grid grid--2">
        {eventPrep ? <FridaySignal prep={eventPrep} trackTypeName={trackTypeName} /> : null}
        <PointsPicture snapshot={standings} />
      </div>

      <div className="grid grid--split">
        <div className="stack">
          <PriorBand event={primary} />
          <PathFactors event={primary} />
        </div>
        <div className="stack">
          <FollowTheWeekend />
          <WeatherWindow weather={weather} raceDate={primary.eventStartDate} />
          <AnalogRaces event={primary} />
        </div>
      </div>

      <LaterThisSeason events={later} />
    </div>
  );
};
