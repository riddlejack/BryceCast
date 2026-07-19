import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CloudSun, ExternalLink, MapPin, Route, Tv } from 'lucide-react';
import { trackOutlineFor } from '../assets/tracks';
import { Card, Countdown, HeroPanel, SourcePill, Stat, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, focusFade, inkConnector, useMeasuredWidth, type ChartTip } from '../app/charts';
import { TrackArt } from '../app/trackArt';
import { asNumber, asString, formatClock, formatDate, formatGain, formatNumber, formatWind, ordinal, shortVenue, trackTypeLabel } from '../app/format';
import { FactDelta } from '../app/weatherGlyphs';
import { currentWindPill, observedAgoLabel, useEventWeather, type EventWeather } from '../app/useEventWeather';
import { Link, useRouter } from '../app/router';
import { useApiJson } from '../app/useApiJson';
import { normalizedName, useNextSession } from '../app/useNextSession';
import {
  daysUntil,
  getNextEventPrep,
  getPrepScreen,
  getStandingsSnapshot,
  getUpcomingEvents,
  raceDayOf,
  type UpcomingPrepEvent
} from '../data/upcoming';
import {
  uiDataPackage,
  type UiNextEventPrep,
  type UiNextEventPrepRace,
  type UiStandingsSnapshot,
  type UiVenueDossierVenue,
  type UiVenueDossierVisit
} from '../data/uiDataPackage';
import { getVenueByTrackName, getVenueDossier } from '../data/venueDossier';
import { loadDebriefArchive } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/** Compact venue names for chart row labels; falls back to shortVenue. */
const venueShortNames: Record<string, string> = {
  'World Wide Technology Raceway': 'WWTR',
  'The Milwaukee Mile': 'Milwaukee',
  'Iowa Speedway': 'Iowa',
  'Nashville Superspeedway': 'Nashville'
};

const venueShort = (trackName: string): string => venueShortNames[trackName] ?? shortVenue(trackName);

/** Session ids with a race-debrief page, shared by every module that links out. */
const useDebriefIds = (): Set<string> => {
  const [ids, setIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadDebriefArchive()
      .then((archive) => setIds(new Set(archive.map((entry) => entry.pack.sessionId))))
      .catch(() => setIds(new Set()));
  }, []);
  return ids;
};

/* ---------- the oval story: every start→finish, one row per race ---------- */

const positionDomain = (races: UiNextEventPrepRace[]): number => {
  const worst = Math.max(...races.flatMap((race) => [race.startPosition ?? 1, race.finishPosition ?? 1]));
  return Math.max(worst + 1, 12);
};

const ConversionChart = ({ prep, debriefIds }: { prep: UiNextEventPrep; debriefIds: Set<string> }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
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

  const leave = () => {
    setHovered(null);
    setTip(null);
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
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
            const rowTop = axisHeight + index * rowHeight;
            const y = rowTop + rowHeight / 2;
            const start = race.startPosition;
            const finish = race.finishPosition;
            if (start === null || finish === null) return null;
            const clean = race.officialStatus === 'running';
            const linked = debriefIds.has(race.sessionId);
            const isHovered = hovered === race.sessionId;
            const seasonShort = race.seasonYear !== null ? `’${String(race.seasonYear).slice(2)}` : '';
            const rowLabel = `${seasonShort} ${venueShort(race.trackName)}`;
            return (
              <g
                key={race.sessionId}
                style={{ opacity: hovered !== null && !isHovered ? focusFade : 1, transition: 'opacity 150ms ease', cursor: linked ? 'pointer' : 'default' }}
                onMouseEnter={() => {
                  setHovered(race.sessionId);
                  setTip({
                    x: x(finish),
                    y: rowTop + 4,
                    title: rowLabel,
                    detail: `started P${start} · finished P${finish}${clean ? '' : ` · ${race.officialStatus}`}`,
                    action: linked ? 'open the race page' : null
                  });
                }}
                onMouseLeave={leave}
                onClick={() => {
                  if (linked) navigate(`/races/${encodeURIComponent(race.sessionId)}`);
                }}
              >
                <rect x={0} y={rowTop} width={width} height={rowHeight} fill="transparent" />
                <text
                  x={labelWidth}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fill={race.sameTrack || isHovered ? 'var(--ink-primary)' : 'var(--ink-secondary)'}
                  fontFamily={chartFont}
                  fontSize={12}
                  fontWeight={race.sameTrack || isHovered ? 620 : 460}
                >
                  {rowLabel}
                </text>
                <line
                  x1={x(start)}
                  x2={x(finish)}
                  y1={y}
                  y2={y}
                  stroke={clean ? (isHovered ? 'var(--ink-primary)' : inkConnector) : 'var(--hairline)'}
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
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const OvalStory = ({ prep, trackTypeName, debriefIds }: { prep: UiNextEventPrep; trackTypeName: string; debriefIds: Set<string> }) => {
  const summary = prep.raceSummary;
  const anyLinked = prep.races.some((race) => debriefIds.has(race.sessionId));
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
        ○ started · ● finished · gold marks {venueShort(prep.trackName)}
      </p>
      <ConversionChart prep={prep} debriefIds={debriefIds} />
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
        When the car finished: average finish {formatNumber(summary.cleanAvgFinish)}, average gain {gainText}, top-10 in{' '}
        {summary.cleanTop10Count} of {summary.cleanRaceCount} · mechanical DNF shown dashed, excluded from these averages
        {anyLinked ? ' · click a race for its full story' : ''}.
      </p>
    </Card>
  );
};

/* ---------- his restart record at this venue (the prior) ---------- */

const restartMovePhrase = (net: number): string => (net > 0 ? `up ${net}` : net === 0 ? 'held even' : `back ${Math.abs(net)}`);

const restartCountWord = (value: number): string =>
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][value] ?? String(value);

/** "both times" / "every time" / "on three of five" — generalizes across venues
 *  without special-casing; a day with nothing to headline states the counts and
 *  lets the honest rows below carry the detail. */
const restartRecordPhrase = ({ gained, held, counted }: { gained: number; held: number; counted: number }): string => {
  const all = counted === 1 ? '' : counted === 2 ? ' both times' : ' every time';
  if (gained === counted) return `he gained ground${all || ' on it'}`;
  if (held === counted) return `he held his spot${all || ' on it'}`;
  const heldOrGained = gained + held;
  if (heldOrGained === counted) return `he held or gained ground${all || ' on it'}`;
  if (heldOrGained > 0) return `he held or gained ground on ${restartCountWord(heldOrGained)} of them`;
  return 'each one reads below, race by race';
};

const RestartPrior = ({ trackName }: { trackName: string }) => {
  const report = uiDataPackage.screens.careerLab.restarts;
  const target = trackName.trim().toLowerCase();
  const venueRaces = (report.byRace ?? []).filter((row) => row.trackName.trim().toLowerCase() === target);
  const counted = venueRaces.filter((row) => (row.bryceRestartsCounted ?? 0) > 0);
  if (counted.length === 0) {
    if (venueRaces.length === 0) return null; // no restart history at this venue — nothing to claim
    return (
      <Card title="His restart record here">
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          His past {trackName} visits had restarts, but his lap-chart line didn't reach them — no restart read to show here yet.
        </p>
      </Card>
    );
  }

  const gained = counted.reduce((sum, row) => sum + (row.bryceGained ?? 0), 0);
  const held = counted.reduce((sum, row) => sum + (row.bryceHeld ?? 0), 0);
  const runCounted = counted.reduce((sum, row) => sum + (row.bryceRestartsCounted ?? 0), 0);
  const soleBest = counted.some((row) => row.soleBestInField);
  const visits = counted.length;
  const introLead = `${restartCountWord(visits)} visit${visits === 1 ? '' : 's'}, ${restartCountWord(runCounted)} restart${runCounted === 1 ? '' : 's'} here`;
  const intro = `${introLead.charAt(0).toUpperCase()}${introLead.slice(1)} — ${restartRecordPhrase({ gained, held, counted: runCounted })}`;

  return (
    <Card
      title="His restart record here"
      action={
        <SourcePill
          title={`Restarts at ${trackName}`}
          entries={[
            {
              label: 'Restart report · per race',
              path: 'analysis/restart-report/output/tables/restart_by_race.csv',
              note: `Green-lap movement after each restart at ${trackName}, Bryce against the full field.`
            },
            {
              label: 'Official caution summaries and lap chart',
              path: 'data/career/career.dataset.json',
              note: 'Restarts from the official caution summary; movement from the official lap chart — positions only.'
            }
          ]}
          caveats={report.caveats}
        />
      }
    >
      <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '62ch' }}>
        {intro}
        {soleBest ? ' · best in the field on one of those days' : ''}.
      </p>
      <div className="stack" style={{ gap: 0, marginTop: 8 }}>
        {counted.map((row, index) => {
          const net = row.bryceNet ?? 0;
          const rankText =
            row.bryceRankInField !== null && row.fieldSizeRanked
              ? `${ordinal(row.bryceRankInField)} of ${row.fieldSizeRanked}`
              : '';
          const href = `/races/${encodeURIComponent(row.sessionId)}`;
          return (
            <Link
              key={row.sessionId}
              to={href}
              className="row"
              style={{
                gap: 12,
                alignItems: 'center',
                padding: '10px 0',
                borderTop: index === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)',
                color: 'inherit',
                textDecoration: 'none'
              }}
            >
              <span className="tnum caption" style={{ flex: '0 0 46px' }}>
                {row.seasonYear ?? '—'}
              </span>
              <span style={{ flex: 1, fontSize: 13.5, color: 'var(--ink-primary)' }}>
                {restartMovePhrase(net)} across {row.bryceRestartsCounted} restart{row.bryceRestartsCounted === 1 ? '' : 's'}
              </span>
              {rankText ? (
                <span className="tnum" style={{ flex: '0 0 84px', textAlign: 'right', fontSize: 12, color: 'var(--ink-secondary)' }}>
                  {rankText}
                </span>
              ) : (
                <span style={{ flex: '0 0 84px' }} />
              )}
            </Link>
          );
        })}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Net running order over the two green laps after each restart, against the full field. Positions, not lap times · click a
        year for its race.
      </p>
    </Card>
  );
};

/* ---------- the Friday signal: best practice rank → race finish ---------- */

const FridaySlope = ({ prep, debriefIds }: { prep: UiNextEventPrep; debriefIds: Set<string> }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
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

  const leave = () => {
    setHovered(null);
    setTip(null);
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
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
            const linked = debriefIds.has(row.sessionId);
            const isHovered = hovered === row.sessionId;
            const focused = isHovered || (hovered === null && row.sameTrack);
            const seasonShort = row.seasonYear !== null ? `’${String(row.seasonYear).slice(2)}` : '';
            const rowLabel = `${seasonShort} ${venueShort(row.trackName)}`;
            return (
              <g
                key={row.sessionId}
                style={{ cursor: linked ? 'pointer' : 'default' }}
                onMouseEnter={() => {
                  setHovered(row.sessionId);
                  setTip({
                    x: (leftX + rightX) / 2,
                    y: Math.min(y(practice), y(finish)),
                    title: rowLabel,
                    detail: `best practice P${practice} → finished P${finish}`,
                    action: linked ? 'open the race page' : null
                  });
                }}
                onMouseLeave={leave}
                onClick={() => {
                  if (linked) navigate(`/races/${encodeURIComponent(row.sessionId)}`);
                }}
              >
                <line x1={leftX} x2={rightX} y1={y(practice)} y2={y(finish)} stroke="transparent" strokeWidth={14} />
                <g style={{ opacity: hovered !== null && !isHovered ? 0.12 : focused ? 1 : 0.34, transition: 'opacity 150ms ease' }}>
                  <line
                    x1={leftX}
                    x2={rightX}
                    y1={y(practice)}
                    y2={y(finish)}
                    stroke="var(--ink-primary)"
                    strokeWidth={focused ? 2.2 : 1.6}
                    strokeLinecap="round"
                    style={{ pointerEvents: 'none' }}
                  />
                  <circle cx={leftX} cy={y(practice)} r={3.4} fill="var(--surface-1)" stroke="var(--ink-primary)" strokeWidth={1.6} />
                  <circle cx={rightX} cy={y(finish)} r={row.sameTrack ? 4.6 : 3.4} fill={row.sameTrack ? 'var(--bryce)' : 'var(--ink-primary)'} />
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
              </g>
            );
          })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const FridaySignal = ({ prep, trackTypeName, debriefIds }: { prep: UiNextEventPrep; trackTypeName: string; debriefIds: Set<string> }) => {
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
        you liked practice, you’ll love the race.
      </p>
      <FridaySlope prep={prep} debriefIds={debriefIds} />
      <p className="caption caption--secondary" style={{ margin: '6px 0 0' }}>
        Gold dots: {venueShort(prep.trackName)} weekends. Practice order and race format differ; read as a signal, not a scale.
      </p>
    </Card>
  );
};

/* ---------- the points picture: the neighborhood around Bryce ---------- */

const PointsStrip = ({ snapshot }: { snapshot: Extract<UiStandingsSnapshot, { available: true }> }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
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
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Championship points around Bryce">
          <line x1={14} x2={width - 14} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
          {nearby.map((entry) => {
            const pointX = x(entry.points);
            const above = entry.pointsRankInCapture % 2 === 0;
            const gap = entry.points - snapshot.bryce.points;
            const gapText = entry.isBryce ? null : gap > 0 ? `+${gap} on Bryce` : `−${Math.abs(gap)} behind Bryce`;
            const hoverTarget = (
              <circle
                cx={pointX}
                cy={axisY}
                r={12}
                fill="transparent"
                onMouseEnter={() =>
                  setTip({
                    x: pointX,
                    y: axisY - 8,
                    title: entry.driverName,
                    detail: `${entry.points} pts${gapText ? ` · ${gapText}` : ''}`
                  })
                }
                onMouseLeave={() => setTip(null)}
              />
            );
            return (
              <g key={entry.carNo}>
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
                        textAnchor={labelAllRivals ? 'middle' : entry.points < snapshot.bryce.points ? 'start' : 'end'}
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
                {hoverTarget}
              </g>
            );
          })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const PointsPicture = ({ snapshot }: { snapshot: UiStandingsSnapshot }) => {
  const [hoveredCar, setHoveredCar] = useState<string | null>(null);
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
              onMouseEnter={() => setHoveredCar(entry.carNo)}
              onMouseLeave={() => setHoveredCar(null)}
              style={{
                padding: '7px 10px',
                margin: '0 -10px',
                borderRadius: 8,
                borderBottom: '1px solid var(--grid-hairline)',
                fontSize: 13,
                background: hoveredCar === entry.carNo ? 'var(--surface-0)' : 'transparent',
                transition: 'background 150ms ease'
              }}
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

/* ---------- races that rhyme ---------- */

const AnalogRaces = ({ event, debriefIds }: { event: UpcomingPrepEvent; debriefIds: Set<string> }) => {
  const analogs = Array.isArray(event.analogRaces) ? (event.analogRaces as unknown as Row[]) : [];
  if (analogs.length === 0) return null;
  return (
    <Card title="Races that rhyme with this one">
      <div className="stack" style={{ gap: 8 }}>
        {analogs.slice(0, 5).map((analog, index) => {
          const sessionId = asString(analog.sessionId);
          const label = asString(analog.raceLabel) ?? `Analog ${index + 1}`;
          const kind = asString(analog.analogType) === 'same_track' ? 'same track' : 'same track type';
          const linked = sessionId !== null && debriefIds.has(sessionId);
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

/* ---------- weather window: current-now + the race-hour strip ----------
 *  The near-track weather hook, its report reader, and the wind-pill builder
 *  now live in app/useEventWeather.ts so the Home race-day hero reads from the
 *  exact same source — the "now" pill can never disagree with this window. */

const WeatherWindow = ({
  weather,
  unavailable,
  raceDate
}: {
  weather: EventWeather | null;
  unavailable: boolean;
  raceDate: string;
}) => {
  // First load in flight: stay quiet. Only render the module once we have a
  // reading or the retries have exhausted into an honest unavailable state.
  if (!weather && !unavailable) return null;
  const current = weather?.current ?? null;
  const raceHour = weather?.raceHour ?? [];
  const observedLabel = observedAgoLabel(weather?.observedAt ?? null);
  const header = (
    <>
      <CloudSun size={15} aria-hidden />
      Weather window
    </>
  );
  const sourcePill = (
    <SourcePill
      title="Weather window"
      entries={[
        {
          label: 'National Weather Service forecast + nearest station observation',
          path: '/api/weather/upcoming',
          note: 'Ambient near-track weather. Not official INDY NXT weather and not track temperature.'
        }
      ]}
      caveats={['NWS is the nearest station and grid forecast, not a sensor at the track surface.']}
    />
  );
  if (!weather) {
    return (
      <Card className="card--flex" title={header} action={sourcePill}>
        <Unavailable>Weather is unavailable right now — the near-track feed didn&apos;t answer. It refreshes on the next check.</Unavailable>
      </Card>
    );
  }
  return (
    <Card className="card--flex" title={header} action={sourcePill}>
      {current && current.tempF !== null ? (
        <>
          <div className="row row--between" style={{ alignItems: 'baseline', gap: 10 }}>
            <span className="caption">At the track right now</span>
            {observedLabel ? <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{observedLabel}</span> : null}
          </div>
          {/* One baseline for all four: label + value only. Wind carries its
              direction inside the value ("7 mph NNE", "calm" at 0), so it sits
              level with Air/Humidity/Sky — no orphaned sub-line (Jack's review). */}
          <div className="weather-stats">
            <Stat label="Air" value={<span className="tnum">{current.tempF}°F</span>} />
            {current.humidityPct !== null ? (
              <Stat label="Humidity" value={<span className="tnum">{Math.round(current.humidityPct)}%</span>} />
            ) : null}
            {current.windMph !== null ? (
              <Stat label="Wind" value={<span className="tnum">{formatWind(current.windMph, current.windCardinal)}</span>} />
            ) : null}
            {current.sky ? <Stat label="Sky" value={<span style={{ fontSize: 17 }}>{current.sky.toLowerCase()}</span>} /> : null}
          </div>
        </>
      ) : (
        <Unavailable>Current near-track conditions appear here once the weather service reaches the venue.</Unavailable>
      )}

      <div style={{ borderTop: '1px solid var(--divider)', margin: '16px 0 0', paddingTop: 14 }}>
        <span className="caption">His race hour</span>
        {raceHour.length > 0 ? (
          <div className="stack" style={{ gap: 4, marginTop: 8 }}>
            {raceHour.map((slot, index) => (
              <div
                key={slot.sessionId}
                className="row row--between"
                /* Divide between rows only; the last sits flush so no hairline
                   dangles into the dead space before the footnote (Jack's review). */
                style={{ padding: '6px 0', borderBottom: index < raceHour.length - 1 ? '1px solid var(--grid-hairline)' : undefined }}
              >
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 560 }}>{slot.sessionLabel}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                    {slot.when}
                    {slot.sky ? ` · ${slot.sky.toLowerCase()}` : ''}
                  </div>
                </div>
                <div className="row" style={{ gap: 12 }}>
                  <span className="tnum" style={{ fontSize: 16, fontWeight: 560 }}>{slot.tempText}</span>
                  {slot.windText ? <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{slot.windText}</span> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-secondary)' }}>
            The hourly forecast reaches his sessions closer to {formatDate(raceDate, { month: 'long', day: 'numeric' })} — it fills in within a
            day or two of green.
          </p>
        )}
      </div>

      <p className="card__footnote" style={{ marginTop: 'auto', paddingTop: 12, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Near-track weather · NWS · not official series weather.
      </p>
    </Card>
  );
};

/* ---------- this place, other years (the venue dossier) ---------- */

/** One condition row: label left; value + optional delta right. Weather
 *  deltas ride the row itself (Jack's review) in neutral ink — the FactDelta
 *  grammar, never the verdict colors. */
const ConditionLine = ({ label, value, delta }: { label: string; value: ReactNode; delta?: ReactNode }) => (
  <div className="row row--between" style={{ fontSize: 12.5, padding: '3px 0' }}>
    <span style={{ color: 'var(--ink-muted)' }}>{label}</span>
    <span className="row" style={{ gap: 6, alignItems: 'center', minWidth: 0 }}>
      <span style={{ color: 'var(--ink-secondary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {delta ?? null}
    </span>
  </div>
);

const VisitColumn = ({
  visit,
  debriefIds
}: {
  visit: UiVenueDossierVisit;
  debriefIds: Set<string>;
}) => {
  const c = visit.conditions;
  const d = visit.deltaVsPrior;
  const finishDelta = d ? formatGain(d.finishDelta) : null;
  const clickable = debriefIds.has(visit.sessionId);
  const inner = (
    <>
      <div className="row row--between" style={{ alignItems: 'baseline' }}>
        <span className="caption" style={{ fontSize: 12.5 }}>{visit.raceLabel}</span>
        {visit.result.fieldSize !== null ? (
          <span style={{ fontSize: 11, color: 'var(--ink-muted)' }}>{visit.result.fieldSize}-car field</span>
        ) : null}
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'baseline', marginTop: 4 }}>
        <span className="tnum" style={{ fontSize: 21, fontWeight: 620 }}>
          P{visit.result.startPosition ?? '—'} → P{visit.result.finishPosition ?? '—'}
        </span>
        {finishDelta && d ? (
          <span className={`stat__delta ${finishDelta.direction === 'up' ? 'stat__delta--up' : finishDelta.direction === 'down' ? 'stat__delta--down' : 'stat__delta--flat'}`}>
            {finishDelta.text}
          </span>
        ) : null}
      </div>
      <div style={{ marginTop: 8, borderTop: '1px solid var(--grid-hairline)', paddingTop: 6 }}>
        {c ? (
          <>
            <ConditionLine
              label="Air"
              value={c.ambientTempF !== null ? `${c.ambientTempF}°F` : '—'}
              delta={<FactDelta delta={d?.tempDeltaF} unit="°" />}
            />
            <ConditionLine
              label="Humidity"
              value={c.humidityPct !== null ? `${Math.round(c.humidityPct)}%` : '—'}
              delta={<FactDelta delta={d?.humidityDeltaPct} />}
            />
            {/* From→to reads across the columns already (2024 "9 mph SE" →
                2025 "6 mph NNE"); the row is value + speed delta only, no swing
                mini-arrows (Jack's review). */}
            <ConditionLine
              label="Wind"
              value={formatWind(c.windSpeedMph, c.windCardinal)}
              delta={d ? <FactDelta delta={d.windSpeedDeltaMph} unit=" mph" /> : undefined}
            />
            <ConditionLine label="Sky" value={c.sky ?? '—'} />
          </>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>No near-track weather on file for this visit.</div>
        )}
      </div>
    </>
  );
  return clickable ? (
    <Link to={visit.raceHref} className="dossier-col dossier-col--link">
      {inner}
    </Link>
  ) : (
    <div className="dossier-col">{inner}</div>
  );
};

const VenueDossierModule = ({
  venue,
  debriefIds
}: {
  venue: UiVenueDossierVenue;
  debriefIds: Set<string>;
}) => {
  if (venue.visits.length === 0) return null;
  return (
    <Card
      title="This place, other years"
      action={
        <SourcePill
          title="This place, other years"
          entries={[
            { label: 'Official INDY NXT results by venue and year', path: 'data/career/career.dataset.json', note: 'Grid, finish, gain, field size, and official status for every past visit.' },
            { label: 'Near-track weather (modeled)', path: 'data/career/career.dataset.json', note: 'Open-Meteo hourly archive joined to the race hour. Not official series weather or track temperature.' }
          ]}
          caveats={getVenueDossier().caveats}
        />
      }
    >
      {/* The dossier owns the past: the result and the weather, year by year.
          This weekend's forecast lives in the Weather window, one home per
          timeframe (Jack's review). */}
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-secondary)' }}>
        What the day gave him here before — the result and the weather, year by year.
      </p>
      <div className="dossier-grid">
        {venue.visits.map((visit) => (
          <VisitColumn key={visit.sessionId} visit={visit} debriefIds={debriefIds} />
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        ▲▽ compare each column with the visit before it. A weather delta is a fact about the day, not a verdict on the drive.
        Conditions are modeled near-track, never official series weather.
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
                {/* The race's own date, so the day count beside it agrees. */}
                <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  {formatDate(raceDayOf(event), { month: 'short', day: 'numeric' })}
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

/* ---------- hero blocks (quiet vertical rhythm, hairline-divided) ---------- */

const HeroBlock = ({ label, children, divider }: { label?: string; children: ReactNode; divider?: boolean }) => (
  <div style={divider ? { borderTop: '1px solid var(--divider)', paddingTop: 16 } : undefined}>
    {label ? <span className="caption">{label}</span> : null}
    {children}
  </div>
);

/* ---------- screen ---------- */

export const RaceWeekScreen = () => {
  const prep = getPrepScreen();
  const upcoming = getUpcomingEvents();
  const weekend = useMemo(() => groupWeekend(upcoming), [upcoming]);
  const nextSession = useNextSession();
  const dossierVenue = weekend ? getVenueByTrackName(weekend.primary.trackName) : null;
  const { weather, unavailable: weatherUnavailable } = useEventWeather(
    weekend?.primary.eventId ?? null,
    dossierVenue?.venueId ?? null,
    dossierVenue?.upcoming?.scheduledSessions ?? []
  );
  const nextEventPrep = getNextEventPrep();
  const standings = getStandingsSnapshot();
  const debriefIds = useDebriefIds();

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
   * sessions had Turn 3 as the best section family); venue-gated until a
   * later session generalizes it from the supplemental pack. */
  const sectionNote =
    primary.trackName === 'Nashville Superspeedway'
      ? { corner: '3', note: 'his strongest section in 2 of 3 past Nashville practice sessions' }
      : null;

  /* Current near-track wind, drawn on the hero shape (real-geo outlines only;
   * TrackArt omits it where the outline has no geographic orientation). Framed
   * "now" so it never reads as a contradiction of the race-hour forecast on the
   * same page, and built from the same hook as the weather window so the two
   * always agree (Jack's review). */
  const heroWind = currentWindPill(weather?.current ?? null, 'now');

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
        {/* Same three-zone rhythm as the race-detail hero: what's coming | the
            track, dead-center | what he's done here. Nothing wanders. */}
        <div className="hero-race hero-race--week">
          <div>
            {preciseStart ? (
              <HeroBlock
                label={`First session · ${formatDate(preciseStart, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatClock(preciseStart)} your time${nextSession?.sessionName ? ` · ${nextSession.sessionName}` : ''}`}
              >
                <div style={{ marginTop: 8 }}>
                  <Countdown to={preciseStart} />
                </div>
              </HeroBlock>
            ) : (
              <HeroBlock
                /* Race day is the RACE session's date (raceDayOf), never the
                   weekend's first practice day; a multi-race weekend keeps its
                   weekend-start framing. Days-to-green counts to the race. */
                label={`${
                  races.length > 1
                    ? `Race weekend · ${formatDate(primary.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}`
                    : `Race day · ${formatDate(raceDayOf(primary), { weekday: 'long', month: 'long', day: 'numeric' })}`
                }`}
              >
                <div className="row" style={{ gap: 10, alignItems: 'baseline', marginTop: 6 }}>
                  <span className="figure" style={{ fontSize: 34, lineHeight: 1.05 }}>
                    {days === 0 ? 'Today' : days ?? '—'}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--ink-secondary)', fontWeight: 500 }}>
                    {days === 0 ? 'race day' : days === 1 ? 'day to green' : 'days to green'}
                  </span>
                </div>
              </HeroBlock>
            )}
          </div>
          <div className="hero-race__art">
            {outline ? <TrackArt outline={outline} annotation={sectionNote} maxHeight={190} wind={heroWind} /> : null}
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            {hereBefore.length > 0 ? (
              <HeroBlock label="He’s raced here before">
                <div className="row row--wrap" style={{ gap: 24, marginTop: 8 }}>
                  {hereBefore.map((race) => (
                    <Stat
                      key={race.sessionId}
                      label={String(race.seasonYear ?? '')}
                      value={
                        <span className="tnum" style={{ fontSize: 21 }}>
                          P{race.startPosition} → P{race.finishPosition}
                        </span>
                      }
                    />
                  ))}
                </div>
              </HeroBlock>
            ) : (
              <HeroBlock label={`${trackTypeName} record`}>
                <div className="row" style={{ gap: 24, marginTop: 8 }}>
                  <Stat label={`${trackTypeName} races`} value={formatNumber((primary.trackTypeHistory as Row).raceCount, 0)} />
                  <Stat label="Avg finish" value={formatNumber((primary.trackTypeHistory as Row).avgFinish)} />
                </div>
              </HeroBlock>
            )}
          </div>
        </div>
        <div
          className="row"
          style={{ gap: 7, color: 'var(--ink-muted)', fontSize: 12, borderTop: '1px solid var(--divider)', paddingTop: 14, marginTop: 18 }}
        >
          <Route size={12} aria-hidden />
          The live companion arms automatically for every session this weekend.
        </div>
      </HeroPanel>

      {dossierVenue && dossierVenue.visits.length > 0 ? (
        <VenueDossierModule venue={dossierVenue} debriefIds={debriefIds} />
      ) : null}

      {eventPrep ? <OvalStory prep={eventPrep} trackTypeName={trackTypeName} debriefIds={debriefIds} /> : null}

      <RestartPrior trackName={primary.trackName} />

      <div className="grid grid--2">
        {eventPrep ? <FridaySignal prep={eventPrep} trackTypeName={trackTypeName} debriefIds={debriefIds} /> : null}
        <PointsPicture snapshot={standings} />
      </div>

      <div className="grid grid--2">
        <FollowTheWeekend />
        <WeatherWindow weather={weather} unavailable={weatherUnavailable} raceDate={raceDayOf(primary)} />
      </div>

      <AnalogRaces event={primary} debriefIds={debriefIds} />

      <LaterThisSeason events={later} />
    </div>
  );
};
