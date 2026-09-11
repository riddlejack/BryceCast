import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Flag, Users } from 'lucide-react';
import { Card, HeroPanel, SourcePill, Stat, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useCoarsePointer, useMeasuredWidth, type ChartTip } from '../app/charts';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import { measuredTrackSectionsFor, trackSectionsFor } from '../assets/tracks/sections';
import {
  resolveHeatSections,
  sectionObservationsFromLaps,
  sectionObservationsFromRaceStory
} from '../data/sectionObservations';
import { loadSectionLaps, sectionLapVisitsFor, type SectionLapsPack } from '../data/sectionLaps';
import { loadPassMarks, resolvePassMarks, type PassMarksPack } from '../data/passMarks';
import { uiDataPackage } from '../data/uiDataPackage';
import { causeClause } from '../data/cautionCause';
import { SectionHeatCard, VenueYearsCard, validPriorComparison } from './sectionIntelligence';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition, formatWind, ordinal, shortVenue } from '../app/format';
import { restartBaselineSentence, restartThinVenueNote } from '../data/restartBaseline';
import { Link } from '../app/router';
import { displayRaceLabel, loadDebriefBySessionId, roundIndexOf, type ArchiveEntry } from '../data/debriefArchive';
import { loadRaceStory, type RaceStoryPack, type RaceStoryLapDriver } from '../data/raceStory';
import { getVenueBySessionId, pastVisits } from '../data/venueDossier';
import { FactDelta } from '../app/weatherGlyphs';
import type { UiVenueDossierVenue, UiVenueDossierVisit } from '../data/uiDataPackage';
import {
  isBryceCastCaptureTier,
  watchableCaptureForRace,
  replayProvenance,
  priorYearReplaysAtVenue,
  type ReplaySessionInfo
} from '../data/replayAvailable';
import { ReplayAffordance, priorYearTitle, useReplayCatalog } from './replayAffordance';
import { QualifyingRunByRunCard } from './qualifyingRunByRun';
import { resolveQualifyingHeatMode } from './qualifyingHeat';
import { useQualiLabForRace } from '../data/qualiLab';
import { TimingCoverageCard } from './timingCoverageCard';

type Row = Record<string, unknown>;

/* ---------- the lap chart: every car, every lap; Bryce in ink ---------- */

const rivalInk = 'rgba(29, 29, 31, 0.16)';
const teammateInk = 'rgba(29, 29, 31, 0.38)';

const triggerCopy: Record<string, string> = {
  green_flag_gain: 'passing under green',
  green_flag_loss: 'lost ground under green',
  caution_reorder_gain: 'moved up in the caution shuffle',
  caution_reorder_loss: 'shuffled back under caution',
  restart_gain: 'gained on the restart',
  restart_loss: 'slipped back on the restart'
};

/** Tiny checkered tick beside the final-lap axis label. */
const CheckeredTick = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`} aria-hidden>
    {[0, 1, 2, 3].map((column) =>
      [0, 1].map((row) => (
        <rect
          key={`${column}-${row}`}
          x={column * 3}
          y={row * 3}
          width={3}
          height={3}
          fill={(column + row) % 2 === 0 ? 'var(--ink-muted)' : 'transparent'}
        />
      ))
    )}
  </g>
);

/** The lap-chart fields this chart reads — a structural subset of
 *  RaceStoryPack, so the live race page shell can feed the SAME chart its
 *  building running-order window without forking the grammar. */
export type LapChartStory = Pick<RaceStoryPack, 'lapChart' | 'inflections'>;

/** Live-shell layer for a race still running: caution spans shade as they
 *  happen and the checkered tick stays down until the flag. Absent (every
 *  debrief page), rendering is exactly as before. */
export interface LapChartBuildingLayer {
  cautionSpans: Array<{ fromLap: number; toLap: number }>;
}

export const LapChart = ({ story, building }: { story: LapChartStory; building?: LapChartBuildingLayer }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const dotTipActive = useRef(false);

  const { totalLaps, fieldSize, drivers } = story.lapChart;
  const height = Math.max(280, Math.min(420, Math.round(width * 0.34)));
  /* The end labels ("Bryce P10") live in the right gutter. On phones they used
   * to left-anchor past the plot's edge and the SVG clip ate their last digit —
   * P10 read "P1", P21 read "P2". The fix reserves a wider phone gutter INSIDE
   * the clip and right-anchors the full label to a fixed inset from the SVG
   * edge, so no digit can ever fall outside the viewport (FABLE_LESSONS #8). */
  const phone = width < 560;
  const endLabelEdgePad = 8;
  const margin = { top: 16, right: phone ? 88 : 120, bottom: 30, left: 36 };
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const plotHeight = height - margin.top - margin.bottom;
  const x = (lap: number) => margin.left + ((lap - 1) / Math.max(totalLaps - 1, 1)) * plotWidth;
  const y = (position: number) => margin.top + ((position - 1) / Math.max(fieldSize - 1, 1)) * plotHeight;
  const lapFromX = (px: number) => Math.round(((px - margin.left) / plotWidth) * Math.max(totalLaps - 1, 1) + 1);

  const positionAt = useMemo(() => {
    const maps = new Map<string, Map<number, number>>();
    for (const driver of drivers) maps.set(driver.driverId, new Map(driver.laps));
    return maps;
  }, [drivers]);

  const bryce = drivers.find((driver) => driver.isBryce) ?? null;
  const winner = drivers.find((driver) => driver.finishPosition === 1) ?? null;

  const xTicks = useMemo(() => {
    const step = width < 560 ? (totalLaps > 40 ? 15 : 10) : 5;
    const ticks = [1];
    for (let lap = step; lap < totalLaps - step / 2; lap += step) ticks.push(lap);
    ticks.push(totalLaps);
    return ticks;
  }, [totalLaps, width]);
  const yTicks = [1, 5, 10, 15, 20, 25].filter((tick) => tick <= fieldSize);

  const clearHover = () => {
    setFocusedDriver(null);
    if (!dotTipActive.current) setTip(null);
  };

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (dotTipActive.current) return;
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const mouseX = event.clientX - bounds.left;
    const mouseY = event.clientY - bounds.top;
    if (mouseX < margin.left - 8 || mouseX > width - margin.right + 8 || mouseY < margin.top - 8 || mouseY > height - margin.bottom + 8) {
      clearHover();
      return;
    }
    const lap = Math.min(Math.max(lapFromX(mouseX), 1), totalLaps);
    let best: { driver: RaceStoryLapDriver; position: number; distance: number } | null = null;
    for (const driver of drivers) {
      const position = positionAt.get(driver.driverId)?.get(lap);
      if (position === undefined) continue;
      const distance = Math.abs(y(position) - mouseY);
      if (!best || distance < best.distance) best = { driver, position, distance };
    }
    if (!best || best.distance > 26) {
      clearHover();
      return;
    }
    setFocusedDriver(best.driver.driverId);
    const lastLap = best.driver.laps[best.driver.laps.length - 1]?.[0] ?? totalLaps;
    const statusText =
      best.driver.status && !['running', 'unknown'].includes(best.driver.status) ? best.driver.status : null;
    const outcomeText =
      lastLap < totalLaps
        ? `out on lap ${lastLap}${statusText ? ` · ${statusText}` : ''}`
        : best.driver.finishPosition !== null
          ? `finished P${best.driver.finishPosition}`
          : null;
    setTip({
      x: x(lap),
      y: y(best.position),
      title: best.driver.driverName,
      detail: [best.driver.carNumber ? `car ${best.driver.carNumber}` : null, `P${best.position} on lap ${lap}`, outcomeText]
        .filter(Boolean)
        .join(' · ')
    });
  };

  const lineFor = (driver: RaceStoryLapDriver) => driver.laps.map(([lap, position]) => `${x(lap)},${y(position)}`).join(' ');

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label="Running position of every car, lap by lap"
          onMouseMove={onMove}
          onMouseLeave={clearHover}
        >
          {/* Live shell only: caution spans shade as they happen (same quiet
              wash as the Live page's gap chart). Never present on a debrief. */}
          {(building?.cautionSpans ?? []).map((span, index) => {
            const left = Math.max(x(Math.max(span.fromLap - 0.5, 1)), margin.left);
            const right = Math.min(x(Math.min(span.toLap + 0.5, totalLaps)), width - margin.right);
            return (
              <rect
                key={`caution-${index}`}
                x={left}
                y={margin.top}
                width={Math.max(right - left, 2)}
                height={plotHeight}
                fill="var(--status-warn-dot)"
                opacity={0.1}
              />
            );
          })}
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={width - margin.right} y1={y(tick)} y2={y(tick)} stroke="var(--grid-hairline)" />
              <text
                x={margin.left - 8}
                y={y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                P{tick}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <g key={tick}>
              <text
                x={x(tick)}
                y={height - 10}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {tick}
              </text>
            </g>
          ))}
          <text x={margin.left - 8} y={height - 10} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
            lap
          </text>
          {/* The checkered tick marks a FINISHED distance; a building chart's
              right edge is "now", so the tick stays down until the flag. */}
          {building ? null : <CheckeredTick x={x(totalLaps) + 8} y={height - 19} />}

          {/* rivals first, teammates above them, Bryce last (paint order = read order) */}
          {drivers
            .filter((driver) => !driver.isBryce)
            .map((driver) => {
              const focused = focusedDriver === driver.driverId;
              const lastLap = driver.laps[driver.laps.length - 1];
              const retiredEarly = lastLap !== undefined && lastLap[0] < totalLaps;
              return (
                <g
                  key={driver.driverId}
                  style={{ opacity: focusedDriver !== null && !focused ? 0.45 : 1, transition: 'opacity 150ms ease' }}
                >
                  <polyline
                    points={lineFor(driver)}
                    fill="none"
                    stroke={focused ? 'var(--ink-primary)' : driver.isTeammate ? teammateInk : rivalInk}
                    strokeWidth={focused ? 2 : 1.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    style={{ transition: 'stroke 150ms ease' }}
                  />
                  {retiredEarly ? (
                    <circle
                      cx={x(lastLap[0])}
                      cy={y(lastLap[1])}
                      r={3}
                      fill="var(--surface-1)"
                      stroke={focused ? 'var(--ink-primary)' : 'var(--ink-muted)'}
                      strokeWidth={1.4}
                    />
                  ) : null}
                </g>
              );
            })}
          {bryce && bryce.laps.length > 0 ? (
            <>
              <polyline
                points={lineFor(bryce)}
                fill="none"
                stroke="var(--ink-primary)"
                strokeWidth={2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle
                cx={x(bryce.laps[bryce.laps.length - 1][0])}
                cy={y(bryce.laps[bryce.laps.length - 1][1])}
                r={4.6}
                fill="var(--bryce)"
                stroke="var(--surface-1)"
                strokeWidth={1.5}
              />
              <text
                x={phone ? width - endLabelEdgePad : x(totalLaps) + 20}
                y={y(bryce.laps[bryce.laps.length - 1][1])}
                textAnchor={phone ? 'end' : 'start'}
                dominantBaseline="middle"
                fill="var(--ink-primary)"
                fontFamily={chartFont}
                fontSize={12}
                fontWeight={650}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                Bryce P{bryce.finishPosition ?? bryce.laps[bryce.laps.length - 1][1]}
              </text>
            </>
          ) : null}
          {winner && !winner.isBryce && width >= 560 ? (
            <text
              x={x(totalLaps) + 20}
              y={y(1)}
              dominantBaseline="middle"
              fill="var(--ink-muted)"
              fontFamily={chartFont}
              fontSize={11}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {winner.driverName.split(' ').slice(-1)[0]} P1
            </text>
          ) : null}

          {/* Bryce inflection moments: gold-marked, hoverable */}
          {bryce
            ? story.inflections.map((moment) => (
                <g key={`${moment.lap}-${moment.toPosition}`}>
                  <circle
                    cx={x(moment.lap)}
                    cy={y(moment.toPosition)}
                    r={4}
                    fill="var(--bryce)"
                    stroke="var(--surface-1)"
                    strokeWidth={1.5}
                  />
                  <circle
                    cx={x(moment.lap)}
                    cy={y(moment.toPosition)}
                    r={11}
                    fill="transparent"
                    onMouseEnter={() => {
                      dotTipActive.current = true;
                      setFocusedDriver(null);
                      setTip({
                        x: x(moment.lap),
                        y: y(moment.toPosition),
                        title: `Lap ${moment.lap}`,
                        detail: `P${moment.fromPosition ?? '—'} → P${moment.toPosition}${triggerCopy[moment.trigger] ? ` · ${triggerCopy[moment.trigger]}` : ''}`
                      });
                    }}
                    onMouseLeave={() => {
                      dotTipActive.current = false;
                      setTip(null);
                    }}
                  />
                </g>
              ))
            : null}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const LapChartCard = ({ story, mover }: { story: RaceStoryPack; mover: { name: string; gain: number } | null }) => {
  const coarse = useCoarsePointer();
  const hasBryceLine = story.bryce.inLapChart;
  const teammateCount = story.lapChart.drivers.filter((driver) => driver.isTeammate).length;
  /* Zero-lap day (lap-1 contact): with no Bryce line to draw, the legend itself
   * must lead with WHY, or the empty ink reads as "Bryce is missing" (Jack's
   * review). The reason is the official status the hero already carries; the lap
   * is the first one he never completed. */
  const bryceStatus = asString(story.bryce.status);
  const endedOnLap = (story.bryce.lapsCompleted ?? 0) + 1;
  const zeroLapReason = bryceStatus ? `${bryceStatus.charAt(0).toUpperCase()}${bryceStatus.slice(1)}` : 'A first-lap incident';
  return (
    <Card
      title="The race, lap by lap"
      action={
        <SourcePill
          title="Full-field lap chart"
          entries={[
            {
              label: 'Official lap chart · every car',
              path: 'data/career/career.dataset.json',
              note: `Running order at each of ${story.lapChart.totalLaps} laps for all ${story.lapChart.fieldSize} cars, from the official lap chart.`
            },
            {
              label: 'Inflection moments',
              path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_lap_inflection_points.csv',
              note: 'Bryce position swings with their lap trigger (green-flag move, caution shuffle, restart).'
            }
          ]}
          caveats={story.caveats}
        />
      }
    >
      {hasBryceLine ? (
        <p className="caption caption--secondary" style={{ margin: '0 0 10px' }}>
          Bryce in ink with gold moments{teammateCount > 0 ? ` · ${story.teamContext?.teamName ?? 'team'} cars in darker gray` : ''} · the
          field in light gray · ○ marks a day that ended early · {coarse ? 'tap any line' : 'hover any line'}
        </p>
      ) : (
        /* Fact first: the legend explains the missing ink so it never reads as
           "Bryce is missing." The hero already carries the official status. */
        <p className="caption caption--secondary" style={{ margin: '0 0 10px' }}>
          {zeroLapReason} ended Bryce’s race on lap {endedOnLap} — the chart shows the rest of the field’s day. ○ marks a car that
          ended early · {coarse ? 'tap any line' : 'hover any line'}
        </p>
      )}
      {hasBryceLine ? (
        <LapChart story={story} />
      ) : (
        <div style={{ opacity: 0.55 }}>
          <LapChart story={story} />
        </div>
      )}
      {(() => {
        const bryceLaps = story.lapChart.drivers.find((driver) => driver.isBryce)?.laps.length ?? 0;
        const battle = story.battles[0];
        const meaningful = battle && bryceLaps > 0 && battle.lapsAdjacent >= Math.max(6, Math.round(bryceLaps * 0.15));
        return (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-secondary)', display: 'grid', gap: 3 }}>
            {meaningful ? (
              <span>
                Closest company: {battle.driverName} — within one spot for {battle.lapsAdjacent} laps
                {battle.swaps >= 2 ? `, trading places ${battle.swaps} times` : ''}.
              </span>
            ) : null}
            {mover && mover.gain > 0 ? (
              <span>
                {/^bryce/i.test(mover.name)
                  ? `Nobody climbed further up the lap chart than Bryce: ${mover.gain} spots.`
                  : `Biggest climber on the day: ${mover.name}, up ${mover.gain} spots on the lap chart.`}
              </span>
            ) : null}
          </div>
        );
      })()}
    </Card>
  );
};

/* ---------- the day: conditions and race character, real numbers ---------- */

const DayTile = ({ label, value, note }: { label: string; value: ReactNode; note?: string | null }) => (
  <div className="stat">
    <span className="caption">{label}</span>
    <span className="tnum" style={{ fontSize: 19, fontWeight: 620, letterSpacing: '-0.01em' }}>
      {value}
    </span>
    {note ? <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>{note}</span> : null}
  </div>
);

/** Year-over-year conditions strip: this visit against Bryce's previous race
 *  at the same venue, in the dossier's per-value glyph grammar — neutral-ink
 *  ▲▽ deltas beside each reading, plus the wind-swing mini-visual. Renders
 *  only when the venue has been visited at least twice. */
const YoYConditionsStrip = ({ venue, visit }: { venue: UiVenueDossierVenue; visit: UiVenueDossierVisit }) => {
  const prior = venue.visits.find((candidate) => candidate.sessionId === visit.deltaVsPrior?.priorSessionId) ?? null;
  const here = visit.conditions;
  const d = visit.deltaVsPrior;
  if (!d || !here) return null;

  const segments: ReactNode[] = [];
  if (here.ambientTempF !== null) {
    segments.push(
      <span key="temp" className="row" style={{ gap: 4, alignItems: 'center' }}>
        <span className="tnum">{here.ambientTempF}°F</span>
        <FactDelta delta={d.tempDeltaF} unit="°" />
      </span>
    );
  }
  if (here.humidityPct !== null) {
    segments.push(
      <span key="humidity" className="row" style={{ gap: 4, alignItems: 'center' }}>
        <span className="tnum">{Math.round(here.humidityPct)}%</span>
        <FactDelta delta={d.humidityDeltaPct} />
      </span>
    );
  }
  if (here.windSpeedMph !== null) {
    segments.push(
      <span key="wind" className="row" style={{ gap: 4, alignItems: 'center' }}>
        {/* Value + speed delta only; the from→to reads across the year labels,
            so the swing mini-arrows are gone (Jack's review). Calm at 0 mph. */}
        <span className="tnum">{formatWind(here.windSpeedMph, here.windCardinal)}</span>
        <FactDelta delta={d.windSpeedDeltaMph} unit=" mph" />
      </span>
    );
  }
  segments.push(
    <span key="vs" style={{ color: 'var(--ink-muted)' }}>
      vs{' '}
      {prior ? (
        <Link to={prior.raceHref} className="navlink" style={{ padding: 0 }}>
          {d.priorSeasonYear}
        </Link>
      ) : (
        d.priorSeasonYear
      )}
    </span>
  );

  return (
    <div style={{ borderTop: '1px solid var(--grid-hairline)', marginTop: 14, paddingTop: 12 }}>
      <span className="caption">This place, other years</span>
      <div className="row row--wrap" style={{ gap: 10, marginTop: 6, fontSize: 13, color: 'var(--ink-secondary)', alignItems: 'center' }}>
        <span style={{ color: 'var(--ink-primary)', fontWeight: 560 }}>{visit.seasonYear}:</span>
        {segments.length > 1
          ? segments.flatMap((segment, index) =>
              index > 0
                ? [
                    <span key={`dot-${index}`} aria-hidden style={{ color: 'var(--ink-muted)' }}>
                      ·
                    </span>,
                    segment
                  ]
                : [segment]
            )
          : 'no near-track reading on file'}
      </div>
    </div>
  );
};

const TheDay = ({ story, pack, venue, visit }: { story: RaceStoryPack; pack: ArchiveEntry['pack']; venue: UiVenueDossierVenue | null; visit: UiVenueDossierVisit | null }) => {
  const weather = story.weather;
  const context = pack.raceContext;
  const leader = asString(context?.topLeader);
  const leaderShare = asNumber(context?.topLeaderShare);
  const incidents = asNumber(context?.sessionIncidentCount);
  const bryceIncidents = asNumber(context?.bryceIncidentCount);
  const cautions = story.cautions;
  /* The caution tile's note: counted facts, and the two things the big "2"
     hides — that those cautions are a SUBSET of the race-wide incidents, and
     that the yellow laps are a fraction of the whole race (design review). Both
     denominators render when we have them; the cause clause never turns a tie
     into a verdict ("1 contact, 1 debris", not "mostly contact"). */
  const cautionTileNote = (() => {
    if (!cautions || cautions.count <= 0) return null;
    const causes = causeClause(cautions.categories, ', ');
    const total = cautions.totalRaceLaps;
    const clauses = [
      incidents !== null && incidents >= cautions.count
        ? `${cautions.count} of ${incidents} recorded incident${incidents === 1 ? '' : 's'} brought out a full-course caution`
        : `${cautions.count} full-course caution${cautions.count === 1 ? '' : 's'}`,
      total !== null
        ? `${cautions.lapsUnderYellow} of ${total} laps under yellow`
        : `${cautions.lapsUnderYellow} lap${cautions.lapsUnderYellow === 1 ? '' : 's'} under yellow`,
      causes
    ].filter(Boolean);
    return clauses.join(' · ');
  })();
  const tempF = weather?.ambientTempC !== null && weather ? Math.round((weather.ambientTempC * 9) / 5 + 32) : null;
  const windMph = weather?.windSpeedKph !== null && weather ? Math.round(weather.windSpeedKph / 1.609344) : null;
  const gustMph = weather?.windGustKph !== null && weather ? Math.round(weather.windGustKph / 1.609344) : null;
  const sky = weather?.conditionRaw ? weather.conditionRaw.replaceAll('_', ' ') : null;
  const rainMm = weather?.precipitationMm ?? null;
  if (!weather && !leader && incidents === null && !(cautions && cautions.count > 0)) return null;

  return (
    <Card
      title={
        <>
          <Flag size={15} aria-hidden />
          The day
        </>
      }
      action={
        <SourcePill
          title="Race-day conditions and character"
          entries={[
            {
              label: 'Near-track weather · race hour',
              path: 'data/career/career.dataset.json',
              note: weather?.source ?? 'Modeled near-track weather.'
            },
            {
              label: 'Leader and incident context',
              path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/leader_lap_context.csv',
              note: 'Leader share from the official leader-lap summary; incident counts from official race reports.'
            },
            ...(cautions && cautions.count > 0
              ? [
                  {
                    label: 'Full-course cautions',
                    path: 'analysis/caution-atlas/output/tables/caution_by_race.csv',
                    note: 'Caution count, laps under yellow, and official causes from the Results-PDF caution summary — counts only.'
                  }
                ]
              : [])
          ]}
          caveats={weather ? [weather.caveat] : undefined}
        />
      }
    >
      {/* Every tile carries a note line so the row reads level (Jack's review). */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))', gap: 16 }}>
        {leader && leaderShare !== null ? (
          <DayTile label={`${leader} led`} value={`${Math.round(leaderShare * 100)}%`} note="of all laps" />
        ) : null}
        {incidents !== null ? (
          <DayTile
            label="Incidents race-wide"
            value={incidents}
            note={
              bryceIncidents !== null && bryceIncidents > 0
                ? `${bryceIncidents} involving Bryce`
                : incidents === 0
                  ? 'a clean one'
                  : 'none involving Bryce'
            }
          />
        ) : null}
        {cautions && cautions.count > 0 ? (
          <DayTile label="Full-course cautions" value={cautions.count} note={cautionTileNote} />
        ) : null}
        {tempF !== null ? (
          <DayTile
            label="Air temperature"
            value={`${tempF}°F`}
            note={weather?.humidityPct != null ? `${Math.round(weather.humidityPct)}% humidity` : 'race-hour reading'}
          />
        ) : null}
        {windMph !== null ? (
          <DayTile
            label="Wind"
            value={formatWind(windMph, null)}
            note={windMph <= 0 ? 'still air' : gustMph !== null && gustMph > windMph + 4 ? `gusts to ${gustMph}` : 'steady all race'}
          />
        ) : null}
        {rainMm !== null && rainMm > 0 ? (
          <DayTile label="Rain in the race hour" value={`${formatNumber(rainMm)} mm`} note={sky ?? 'race-hour reading'} />
        ) : sky ? (
          <DayTile label="Sky" value={sky} note="during the race hour" />
        ) : null}
      </div>
      {venue && venue.visits.length >= 2 && visit ? <YoYConditionsStrip venue={venue} visit={visit} /> : null}
    </Card>
  );
};

/* ---------- where the lap time lived (humanized section strengths) ---------- */

const SectionRow = ({ name, percentile }: { name: string; percentile: number }) => {
  const pct = Math.round(percentile * 100);
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center' }}>
      <span
        title={name}
        style={{ fontSize: 12.5, color: 'var(--ink-secondary)', flex: '0 0 47%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {name}
      </span>
      <span style={{ position: 'relative', flex: 1, height: 4, borderRadius: 2, background: 'var(--surface-2)' }}>
        <span
          style={{
            position: 'absolute',
            top: -3,
            left: `calc(${pct}% - 5px)`,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: 'var(--ink-primary)'
          }}
        />
      </span>
      <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-primary)', width: 38, textAlign: 'right' }}>
        {ordinal(pct)}
      </span>
    </div>
  );
};

const SectionStory = ({ story }: { story: RaceStoryPack }) => {
  const sections = story.sections;
  if (!sections || (sections.comparisonRows ?? 0) < 50) return null; // display policy: suppress low denominators
  if (sections.best.length === 0 && sections.weakest.length === 0) return null;
  return (
    <Card
      className="card--flex"
      title="Where the lap time lived"
      action={
        <SourcePill
          title="Section signal"
          entries={[
            {
              label: 'Official Section Results reports',
              path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/section_results_deep_by_race.csv',
              note: `Percentile of Bryce's section times vs the field across ${formatNumber(sections.comparisonRows, 0)} comparisons. Names follow the track's official timing stations.`
            }
          ]}
          caveats={[sections.caveat]}
        />
      }
    >
      {/* Intro line shares a baseline with the team card's intro (Jack's review). */}
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)', minHeight: 20 }}>
        Section-by-section pace against the whole field.
      </p>
      <div className="grid grid--2" style={{ gap: 22 }}>
        <div>
          <span className="caption">Strongest stretches</span>
          <div className="stack" style={{ gap: 10, marginTop: 10 }}>
            {sections.best.slice(0, 4).map((section) => (
              <SectionRow key={section.name} name={section.name} percentile={section.percentile} />
            ))}
          </div>
        </div>
        <div>
          <span className="caption">Toughest stretches</span>
          <div className="stack" style={{ gap: 10, marginTop: 10 }}>
            {sections.weakest.slice(0, 4).map((section) => (
              <SectionRow key={section.name} name={section.name} percentile={section.percentile} />
            ))}
          </div>
        </div>
      </div>
      <p style={{ margin: 0, paddingTop: 14, marginTop: 'auto', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Percentile of the field beaten in each timing section, from {formatNumber(sections.comparisonRows, 0)} official comparisons
        across the weekend.
      </p>
    </Card>
  );
};

/* ---------- the restart report card: green-lap moves against the field ---------- */

const restartCountWord = (value: number): string =>
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][value] ?? String(value);

const RestartDeltaChip = ({ net }: { net: number }) => {
  const gain = formatGain(net);
  if (!gain) return null;
  return <span className={`stat__delta stat__delta--${gain.direction}`} style={{ fontSize: 12 }}>{gain.text}</span>;
};

const restartSourcePill = (
  <SourcePill
    title="Restarts, green-lap by green-lap"
    entries={[
      {
        label: 'Official caution summary',
        path: 'data/career/career.dataset.json',
        note: 'Each restart is the first green lap after an official caution period, from the Results-PDF caution summary.'
      },
      {
        label: 'Official lap chart',
        path: 'analysis/restart-report/output/tables/restart_events.csv',
        note: 'Running order at the last caution lap vs two green laps later, for every car — positions only, never lap times.'
      }
    ]}
    caveats={[
      'Positions can shift for pit cycles as well as passes; this is net movement, not a pass count.',
      'A window shorter than two laps means a fresh caution or the finish arrived first.'
    ]}
  />
);

/** The quiet field-baseline line (Brief K v2): the typical restart place-swing
 *  across the whole field at this venue — the norm Bryce's figures read against.
 *  Falls back to the series-wide baseline when the venue's sample is thin, and
 *  always states its denominator. Venue resolved from the validated restart
 *  report by this race's session id. */
const RestartBaselineLine = ({ sessionId }: { sessionId: string }) => {
  const report = uiDataPackage.screens.careerLab.restarts;
  const field = report.fieldBaseline;
  if (!field) return null;
  const venueSlug = (report.byRace ?? []).find((row) => row.sessionId === sessionId)?.venueSlug ?? null;
  const venueRow = venueSlug ? (report.venueBaselines ?? []).find((row) => row.venueSlug === venueSlug) ?? null : null;
  const stableVenue = venueRow && venueRow.stable ? venueRow : null;
  const sentence = restartBaselineSentence(stableVenue ?? field, stableVenue ? 'venue' : 'series');
  if (!sentence) return null;
  const thin =
    !stableVenue && venueRow && venueRow.restarts > 0
      ? restartThinVenueNote(shortVenue(venueRow.trackName), venueRow.restarts)
      : null;
  return (
    <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
      {sentence}
      {thin ? ` · ${thin}` : ''}
    </p>
  );
};

const RestartsCard = ({ story }: { story: RaceStoryPack }) => {
  const restarts = story.restarts;
  if (!restarts) return null;

  // Honest empty states: no cautions, or the only caution ran to the flag.
  if (restarts.detected === 0) {
    const line =
      restarts.noRestartReason === 'cautions_ended_under_yellow'
        ? 'The caution flew as the race wound down, so there was no restart to run.'
        : 'The field ran green flag to flag — no cautions, so no restarts this race.';
    return (
      <Card title={<><Flag size={15} aria-hidden />Restarts</>} action={restartSourcePill}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>{line}</p>
      </Card>
    );
  }

  const classified = restarts.events.filter((event) => event.bryce);
  const detectedWord = restartCountWord(restarts.detected);

  // Bryce's race ended before (or without covering) the restarts: keep the field
  // fact, give the day dignity, and show no read we cannot stand behind.
  if (classified.length === 0) {
    return (
      <Card title={<><Flag size={15} aria-hidden />Restarts</>} action={restartSourcePill}>
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>
          The field took {detectedWord} restart{restarts.detected === 1 ? '' : 's'} this race; Bryce's lap-chart line doesn't
          reach them, so there's no restart read to show for him here.
        </p>
        <RestartBaselineLine sessionId={story.sessionId} />
      </Card>
    );
  }

  const { bryce } = restarts;
  const countedWord = restartCountWord(bryce.counted);
  const heldOrGained = bryce.gained + bryce.held;

  // Headline: superlatives are computed, never asserted; wording stays Bryce-first
  // and never leans on deficit language on a tougher restart day.
  let headline: string;
  if (bryce.soleBestInField) {
    headline = `No car in the field made up more ground on the restarts than Bryce.`;
  } else if (bryce.net > 0) {
    headline = `Bryce gained ${bryce.net} spot${bryce.net === 1 ? '' : 's'} across ${countedWord} restart${bryce.counted === 1 ? '' : 's'}.`;
  } else if (heldOrGained === bryce.counted) {
    headline = `Bryce held or gained his spot on every restart — ${countedWord} of ${countedWord}.`;
  } else if (bryce.gained > 0) {
    headline = `Bryce moved forward on ${restartCountWord(bryce.gained)} of ${countedWord} restart${bryce.counted === 1 ? '' : 's'}.`;
  } else if (bryce.held > 0) {
    headline = `Bryce held station on ${restartCountWord(bryce.held)} of ${countedWord} restart${bryce.counted === 1 ? '' : 's'}.`;
  } else {
    headline = `Bryce took the green on ${countedWord} restart${bryce.counted === 1 ? '' : 's'} this race.`;
  }

  // The per-restart rows below always carry each honest rank; the summary rank
  // is elevated to a headline only when it reads as a highlight — a deficit is
  // never headlined (house dignity rule).
  const showRankLine = bryce.soleBestInField || bryce.net >= 0;
  const rankLine =
    showRankLine && bryce.rankInField !== null && bryce.fieldSizeRanked
      ? bryce.soleBestInField
        ? `Best of ${bryce.fieldSizeRanked} cars on the restarts.`
        : `${ordinal(bryce.rankInField)} of ${bryce.fieldSizeRanked} cars for ground made up on the restarts.`
      : null;

  return (
    <Card title={<><Flag size={15} aria-hidden />Restarts</>} action={restartSourcePill}>
      <p style={{ margin: '0 0 4px', fontSize: 15, color: 'var(--ink-primary)', fontWeight: 560 }}>{headline}</p>
      {rankLine ? (
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--ink-secondary)' }}>{rankLine}</p>
      ) : (
        <div style={{ height: 12 }} />
      )}

      <div className="stack" style={{ gap: 0 }}>
        {classified.map((event, index) => {
          const before = event.bryce!.baselinePosition;
          const after = event.bryce!.endPosition;
          const rank = event.bryce!.rankInField;
          const size = event.bryce!.fieldSize;
          return (
            <div
              key={event.restartIndex ?? index}
              className="row"
              title={event.cautionReasons ? `Restart after: ${event.cautionReasons}` : undefined}
              style={{
                gap: 12,
                alignItems: 'center',
                padding: '11px 0',
                borderTop: index === 0 ? 'none' : '1px solid rgba(0,0,0,0.06)'
              }}
            >
              <span className="caption" style={{ flex: '0 0 76px' }}>
                Lap {event.restartLap}
                {!event.fullWindow ? ' ·' : ''}
              </span>
              <span className="tnum" style={{ flex: 1, fontSize: 14, color: 'var(--ink-primary)' }}>
                {formatPosition(before)} <span style={{ color: 'var(--ink-muted)' }}>→</span> {formatPosition(after)}
              </span>
              <RestartDeltaChip net={event.bryce!.net ?? 0} />
              {rank !== null && size ? (
                <span className="tnum" style={{ flex: '0 0 84px', textAlign: 'right', fontSize: 12, color: 'var(--ink-secondary)' }}>
                  {ordinal(rank)} of {size}
                </span>
              ) : (
                <span style={{ flex: '0 0 84px' }} />
              )}
            </div>
          );
        })}
      </div>

      <RestartBaselineLine sessionId={story.sessionId} />

      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Running order over the two green laps after each restart, Bryce against the full field
        {classified.length < restarts.detected
          ? ` · ${restartCountWord(restarts.detected - classified.length)} later restart${restarts.detected - classified.length === 1 ? '' : 's'} ran after his race`
          : ''}
        . Positions, not lap times.
      </p>
    </Card>
  );
};

/* ---------- inside the team (number-line, same form as the points strip) ---------- */

const TeamStrip = ({ story }: { story: RaceStoryPack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const teammates = story.teammates;
  const fieldSize = Math.max(story.lapChart.fieldSize, ...teammates.map((teammate) => teammate.finishPosition ?? 1));
  const height = 66;
  const axisY = 36;
  const x = (position: number) => 14 + ((position - 1) / Math.max(fieldSize - 1, 1)) * (width - 28);

  if (teammates.length < 2) return null;
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Team finishing positions">
          <line x1={14} x2={width - 14} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
          {[1, Math.round(fieldSize / 2), fieldSize].map((tick) => (
            <text
              key={tick}
              x={x(tick)}
              y={axisY + 22}
              textAnchor="middle"
              fill="var(--ink-muted)"
              fontFamily={chartFont}
              fontSize={10}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              P{tick}
            </text>
          ))}
          {teammates.map((teammate) => {
            const finish = teammate.finishPosition;
            if (finish === null) return null;
            const pointX = x(finish);
            const detailParts = [
              teammate.carNumber ? `car ${teammate.carNumber}` : null,
              teammate.startPosition !== null ? `P${teammate.startPosition} → P${finish}` : `finished P${finish}`,
              teammate.status && teammate.status !== 'running' ? teammate.status : null
            ].filter(Boolean);
            return (
              <g key={teammate.driverName}>
                {teammate.isBryce ? (
                  <rect x={pointX - 8} y={axisY - 8} width={16} height={16} rx={4.5} fill="var(--bryce)" />
                ) : (
                  <circle cx={pointX} cy={axisY} r={4} fill="var(--ink-primary)" fillOpacity={0.55} />
                )}
                {teammate.isBryce ? (
                  <text
                    x={pointX}
                    y={axisY + 0.5}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill="var(--bryce-ink-on)"
                    fontFamily={chartFont}
                    fontSize={10}
                    fontWeight={700}
                  >
                    9
                  </text>
                ) : null}
                <circle
                  cx={pointX}
                  cy={axisY}
                  r={12}
                  fill="transparent"
                  onMouseEnter={() => setTip({ x: pointX, y: axisY - 8, title: teammate.driverName, detail: detailParts.join(' · ') })}
                  onMouseLeave={() => setTip(null)}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

const TeamStory = ({ story }: { story: RaceStoryPack }) => {
  const teammates = story.teammates;
  if (teammates.length < 2) return null;
  const bryceRow = teammates.find((teammate) => teammate.isBryce);
  const bryceTeamRank = bryceRow ? teammates.filter((teammate) => (teammate.finishPosition ?? 99) < (bryceRow.finishPosition ?? 99)).length + 1 : null;
  return (
    <Card
      className="card--flex"
      title={
        <>
          <Users size={15} aria-hidden />
          Inside {story.teamContext?.teamName ?? 'the team'}
        </>
      }
      action={
        <SourcePill
          title="Team context"
          entries={[
            {
              label: 'Official results · same session',
              path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/team_context_by_race.csv',
              note: 'Finishing positions for every car the team ran in this race.'
            }
          ]}
          caveats={story.teamContext?.statusCaveat ? [story.teamContext.statusCaveat] : undefined}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)', minHeight: 20 }}>
        {bryceTeamRank !== null ? (
          <>
            <strong style={{ color: 'var(--ink-primary)' }}>{ordinal(bryceTeamRank)}</strong> of {teammates.length}{' '}
            {story.teamContext?.teamName ?? 'team'} cars
            {story.teamContext?.teamAverageFinish !== null ? ` · team average finish ${formatNumber(story.teamContext?.teamAverageFinish)}` : ''}
          </>
        ) : null}
      </p>
      <TeamStrip story={story} />
      <div className="stack" style={{ gap: 0, marginTop: 4 }}>
        {teammates
          .filter((teammate) => !teammate.isBryce)
          .map((teammate) => (
            <div
              key={teammate.driverName}
              className="row row--between"
              style={{ padding: '6px 0', borderBottom: '1px solid var(--grid-hairline)', fontSize: 13 }}
            >
              <span style={{ fontWeight: 520 }}>{teammate.driverName}</span>
              <span className="tnum" style={{ color: 'var(--ink-secondary)' }}>
                {teammate.startPosition !== null ? `P${teammate.startPosition} → ` : ''}
                {formatPosition(teammate.finishPosition)}
                {teammate.status && teammate.status !== 'running' ? ` · ${teammate.status}` : ''}
              </span>
            </div>
          ))}
      </div>
      <p style={{ margin: 0, paddingTop: 14, marginTop: 'auto', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Every {story.teamContext?.teamName ?? 'team'} car in this race, start to finish, from official results.
      </p>
    </Card>
  );
};

/* ---------- weekend arc ---------- */

/** Qualifying-session ranks may be within a group; grid is the full-field rank. */
const weekendArc = (story: RaceStoryPack): string | null => {
  const signal = story.weekendSignal;
  if (!signal) return null;
  const stations = [
    ['Practice', signal.bestPracticeRank],
    ['Qualifying session', signal.bestQualifyingRank],
    ['Grid', signal.raceStart],
    ['Flag', signal.raceFinish]
  ].filter((station): station is [string, number] => station[1] !== null);
  if (stations.length < 3) return null;
  return stations.map(([label, rank]) => `${label} P${rank}`).join(' → ');
};

/* ---------- hero verdict (field-strength framing, facts + context only) ---------- */

const verdictFor = (story: RaceStoryPack): string | null => {
  const strength = story.fieldStrength;
  if (!strength || strength.resultVsFieldStrength === null) return null;
  const delta = strength.resultVsFieldStrength;
  if (delta > 0.05) return 'Finished ahead of what this field’s strength suggested.';
  if (delta >= -0.05) return 'Right in line with what this field’s strength suggested.';
  const depth = strength.seasonDepthRank;
  if (depth && depth.rank <= 3) {
    return `One of the season’s deepest fields — ${ordinal(depth.rank)} of ${depth.of} by rating.`;
  }
  return null;
};

/* ---------- screen ---------- */

/* ---------- the time machine: watch this race unfold ---------- */

/** Silent unless our own/lake capture of THIS race exists, or the venue has a
 *  watchable capture from an EARLIER year. Where the magic is real, it invites
 *  you into the Live page in replay mode: this race's own replay first, then a
 *  quiet "watch an earlier year here" for each prior visit-year at this venue.
 *  Prior years join STRICTLY by venue identity — the venue-dossier visits for
 *  this race's venue, each resolved through watchableCaptureForRace — never by
 *  event name, which drifts year to year. */
const WatchRaceUnfold = ({ sessionId }: { sessionId: string }) => {
  const available = useReplayCatalog();
  const venue = getVenueBySessionId(sessionId);
  const currentVisit = venue?.visits.find((visit) => visit.sessionId === sessionId) ?? null;
  const currentCapture = available ? watchableCaptureForRace(available, sessionId) : null;
  const priors = priorYearReplaysAtVenue(available, pastVisits(venue, sessionId), currentVisit?.seasonYear);

  if (!currentCapture && priors.length === 0) return null;

  const isOwnCapture = currentCapture ? isBryceCastCaptureTier(replayProvenance(currentCapture).tier) : false;
  const currentCopy = isOwnCapture
    ? 'Recorded race timing, replayed from our Race Control capture. Sampling intervals and gaps are documented.'
    : 'Replay reconstructed from archived timing observations. Sampling intervals and gaps are documented.';

  return (
    <section className="race-replay" aria-label="Watch this race unfold">
      {currentCapture ? (
        <ReplayAffordance capture={currentCapture} fromSessionId={sessionId} title="Watch this race unfold" copy={currentCopy} />
      ) : null}
      {priors.length > 0 ? (
        <div className={`race-replay__years${currentCapture ? '' : ' race-replay__years--sole'}`}>
          <span className="race-replay__years-lead">Watch an earlier year here</span>
          {priors.map((prior) => (
            <ReplayAffordance
              key={prior.sessionId}
              capture={prior.capture}
              fromSessionId={prior.sessionId}
              title={priorYearTitle(prior.seasonYear, prior.raceLabel)}
              variant="compact"
            />
          ))}
        </div>
      ) : null}
    </section>
  );
};

export const RaceDetailScreen = ({ sessionId }: { sessionId: string }) => {
  const [entry, setEntry] = useState<ArchiveEntry | null | 'loading'>('loading');
  const [story, setStory] = useState<RaceStoryPack | null>(null);
  const [sectionLaps, setSectionLaps] = useState<SectionLapsPack | null>(null);
  const [visitPacks, setVisitPacks] = useState<SectionLapsPack[]>([]);
  const [passMarks, setPassMarks] = useState<PassMarksPack | null>(null);

  useEffect(() => {
    setEntry('loading');
    setStory(null);
    setSectionLaps(null);
    setVisitPacks([]);
    setPassMarks(null);
    loadPassMarks(sessionId)
      .then((pack) => setPassMarks(pack))
      .catch(() => setPassMarks(null));
    loadDebriefBySessionId(sessionId)
      .then((found) => setEntry(found))
      .catch(() => setEntry(null));
    loadRaceStory(sessionId)
      .then((pack) => setStory(pack))
      .catch(() => setStory(null));
    loadSectionLaps(sessionId)
      .then(async (pack) => {
        setSectionLaps(pack);
        if (!pack) return;
        const visitRefs = sectionLapVisitsFor(pack.venueName);
        if (visitRefs.length < 2) return;
        const loaded = await Promise.all(visitRefs.map((ref) => loadSectionLaps(ref.sessionId).catch(() => null)));
        setVisitPacks(loaded.filter((visit): visit is SectionLapsPack => visit !== null));
      })
      .catch(() => setSectionLaps(null));
  }, [sessionId]);

  /* The footer source line must name the feeds the visible replay cards cite, so
   * the catalog is read here — before any early return — and threaded down. */
  const replayCatalog = useReplayCatalog();

  /* The qualifying resolution is hoisted here (not read inside the card) so the
   * footer provenance can include the Quali module's own source tier when it
   * renders. Read before any early return. */
  const qualiResolution = useQualiLabForRace(sessionId);

  if (entry === 'loading') {
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 40 }} />
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="page stack">
        <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} aria-hidden /> All races
        </Link>
        <Card>
          <Unavailable>No debrief pack exists for this session yet.</Unavailable>
        </Card>
      </div>
    );
  }

  const { pack } = entry;
  const finish = asNumber(pack.outcome.finishPosition);
  const start = asNumber(pack.outcome.startPosition);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const fieldSize = story?.lapChart.fieldSize ?? asNumber(pack.lapStory?.fieldLapDrivers);
  /* The race's own date when the pack carries it (raceOrder.sessionStartDate);
   * eventStartDate is the WEEKEND's first day and can sit a day early. */
  const eventDate =
    asString((pack.raceOrder as Row | undefined)?.sessionStartDate) ??
    asString((pack as unknown as Row).eventStartDate);
  const verdict = story ? verdictFor(story) : null;
  const arc = story ? weekendArc(story) : null;
  const moverName = asString(pack.lapStory?.topLapChartMover);
  const moverGain = asNumber(pack.lapStory?.topLapChartGain);
  const mover = moverName && moverGain !== null ? { name: moverName, gain: moverGain } : null;
  const impact = story?.pointsImpact ?? null;
  const standingMove =
    impact && impact.standingBefore !== null && impact.standingAfter !== null && impact.standingBefore !== impact.standingAfter
      ? impact.standingAfter < impact.standingBefore
        ? { text: `up from P${impact.standingBefore}`, direction: 'up' as const }
        : { text: `from P${impact.standingBefore}`, direction: 'down' as const }
      : null;
  const bryceStatus = story?.bryce.status ?? null;
  const outline = trackOutlineFor(asString(pack.track.name));
  /* Anchored venues only: any curation still held at 'approximate' (a venue
   * whose span placement isn't yet visually verified) renders no heat layer and
   * keeps SectionStory. WWTR was promoted once its lake-map loop locations were
   * wired; road/street venues without verifiable geometry stay unregistered. */
  const sectionAnchorsAny = trackSectionsFor(asString(pack.track.name));
  const pdfAnchors = sectionAnchorsAny && sectionAnchorsAny.confidence === 'anchored' ? sectionAnchorsAny : null;
  /* When THIS race carries measured loop-crossing data, the heat map upgrades to
   * the venue's finer 8-section tiling (Nashville 2024/2025); every other race
   * keeps the curated-PDF set. Both flow through the identical contract. */
  const measuredAnchors =
    sectionLaps?.sourceTier === 'lake_loop_crossings' ? measuredTrackSectionsFor(asString(pack.track.name)) : null;
  const sectionAnchors = measuredAnchors ?? pdfAnchors;
  const qualifyingHeat = resolveQualifyingHeatMode(qualiResolution, asString(pack.track.name), sectionAnchors);
  const fallbackSet = story ? sectionObservationsFromRaceStory(story) : null;
  const heroSet = sectionLaps ? sectionObservationsFromLaps(sectionLaps) : fallbackSet;
  const heroHeat = sectionAnchors && heroSet ? resolveHeatSections(sectionAnchors, heroSet) : [];
  const heroSectionsLayer = heroHeat.length > 0 ? { resolved: heroHeat, showLabels: false } : null;
  const dossierVenue = getVenueBySessionId(sessionId);
  const dossierVisit = dossierVenue?.visits.find((visit) => visit.sessionId === sessionId) ?? null;
  /* Historic race-hour wind, drawn on the hero shape (real-geo outlines only).
   * Calm (0 mph) carries no bearing — the pill draws no arrow and reads "calm". */
  const heroWind =
    dossierVisit?.conditions && dossierVisit.conditions.windSpeedMph !== null
      ? {
          bearingDeg: dossierVisit.conditions.windSpeedMph <= 0 ? null : dossierVisit.conditions.windDirectionDeg,
          label: formatWind(dossierVisit.conditions.windSpeedMph, dossierVisit.conditions.windCardinal)
        }
      : null;

  return (
    <div className="page stack">
      <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start', padding: '4px 2px' }}>
        <ArrowLeft size={14} aria-hidden /> All races
      </Link>
      <header className="screen-head" style={{ margin: 0 }}>
        <span className="kicker">
          {pack.seasonYear} season · Round {roundIndexOf(pack)} · {asString(pack.track.name)}
          {eventDate ? ` · ${formatDate(eventDate, { month: 'long', day: 'numeric' })}` : ''}
        </span>
        <h1 className="screen-head__title">{displayRaceLabel(pack)}</h1>
      </header>

      <HeroPanel tint="bryce">
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <span className="caption">Result</span>
          <SourcePill
            title={pack.raceLabel}
            entries={[
              ...pack.sourceRefs.slice(0, 6).map((ref) => ({
                label: asString(ref.kind) ?? asString(ref.table) ?? 'Official source table',
                path: asString(ref.path) ?? undefined
              })),
              /* The hero shape's heat overlay can draw from the measured lake
                 pack — when it does, this drawer names that tier too (mixed-
                 tier honesty: every module that draws a third-party-derived
                 layer names its source where it draws it). */
              ...(heroHeat.length > 0 && heroSet?.sourceTier === 'lake_loop_crossings'
                ? [
                    {
                      label: 'Section shading · RaceTools race-weekend capture',
                      path: sectionLaps?.sourceRefs?.find((ref) => ref.key === 'nashvilleIntervalPack')?.path,
                      note: "The track shape's section shading comes from the RaceTools race-weekend capture's timing-loop crossings — a third-party capture; not official timing."
                    }
                  ]
                : [])
            ]}
            caveats={
              bryceStatus && bryceStatus !== 'running'
                ? [...pack.caveats, `Official finishing status: ${bryceStatus}.`]
                : pack.caveats
            }
          />
        </div>
        <div className="hero-race">
          <div className="stat">
            <span className="stat__value stat__value--hero">{formatPosition(finish)}</span>
            {gain ? (
              <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
                {gain.text} from {formatPosition(start)}
                {fieldSize !== null ? ` · ${fieldSize}-car field` : ''}
              </span>
            ) : null}
            {verdict ? (
              <span style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 6, maxWidth: '38ch' }}>{verdict}</span>
            ) : null}
            {arc ? (
              <span className="tnum" style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 8 }}>
                {arc}
              </span>
            ) : null}
            {bryceStatus && bryceStatus !== 'running' ? (
              /* Dignity for a hard day (#23): the hero leads with the humane
                 sentence; the exact clinical status stays in the source drawer. */
              <span style={{ fontSize: 13, color: 'var(--ink-secondary)', marginTop: 8, maxWidth: '38ch' }}>
                {`${bryceStatus.charAt(0).toUpperCase()}${bryceStatus.slice(1)}`} ended Bryce’s race on lap{' '}
                {(story?.bryce.lapsCompleted ?? 0) + 1}.
              </span>
            ) : null}
          </div>
          {/* Fixed art zone: every venue letterboxes into the same box, so the
              layout never shifts race to race (street circuits stay calm and empty). */}
          <div className="hero-race__art">
            {outline ? (
              <TrackArt
                outline={outline}
                showCornerLabels={false}
                maxHeight={150}
                sections={heroSectionsLayer}
                wind={heroWind}
              />
            ) : null}
          </div>
          <div className="row" style={{ gap: 28, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Stat label="Points scored" value={impact?.racePoints ?? asNumber(pack.outcome.points) ?? '—'} />
            <Stat label="Season points" value={impact?.cumulativePoints ?? asNumber(pack.outcome.cumulativePoints) ?? '—'} />
            <Stat
              label="Standing after"
              value={
                (impact?.standingAfter ?? asNumber(pack.outcome.standingRank)) !== null
                  ? `P${impact?.standingAfter ?? asNumber(pack.outcome.standingRank)}`
                  : '—'
              }
              delta={standingMove ?? undefined}
            />
          </div>
        </div>
      </HeroPanel>

      <WatchRaceUnfold sessionId={sessionId} />

      <TimingCoverageCard sessionId={sessionId} />

      {/* Weekend arc, chronological: qualifying (Friday signal) before the race
          it set the grid for. Renders the covered module, a quiet Race-2 note,
          or nothing (Brief M). Resolution hoisted above for footer provenance. */}
      <QualifyingRunByRunCard resolution={qualiResolution} />

      {story ? <LapChartCard story={story} mover={mover} /> : null}

      {/* Deeper analysis rides above the summary stats (Jack's directive,
          2026-07-19): once the race has been watched and read lap by lap, the
          track section-by-section — and its year-over-year shapes card, kept
          adjacent — come before The Day and Restarts settle the context. */}
      {outline && sectionAnchors ? (
        <SectionHeatCard
          key={sessionId}
          outline={outline}
          anchors={sectionAnchors}
          laps={sectionLaps}
          fallbackSet={fallbackSet}
          passMarks={passMarks}
          title="Race and qualifying, section by section"
          qualifying={qualifyingHeat}
          priorComparison={validPriorComparison(visitPacks, sessionId, sectionAnchors)}
        />
      ) : (
        /* No geometric anchors yet (IMS awaits a verified calibration between
           the correct 2.44-mi feed geometry and its outline): the same numbers
           render as the table, IN THE SAME SLOT the heat map occupies on
           anchored pages — sections always follow the lap chart, whatever
           their form (Jack's page-to-page consistency review, 2026-07-21). */
        story ? <SectionStory story={story} /> : null
      )}

      {outline && sectionAnchors ? <VenueYearsCard outline={outline} anchors={sectionAnchors} visits={visitPacks} /> : null}

      {story ? <TheDay story={story} pack={pack} venue={dossierVenue} visit={dossierVisit} /> : null}

      {story ? <RestartsCard story={story} /> : null}

      {/* Where the heat card renders, the section table retires INTO its
          drawer (director ruling, 2026-07-18): same numbers, richer form. */}
      {story ? <TeamStory story={story} /> : null}

      {/* The footer claim is built from the sources the page's VISIBLE modules
          actually cite (finding #19): official results + lap chart always; section
          reports when PDF sections render; the RaceTools capture when a measured
          page, pass marks, or a RaceTools replay card show; Timing71 when a
          Timing71-normalized replay card shows; our own capture when its replay
          shows. No claim of "all official" over a third-party feed. */}
      {(() => {
        const tierOf = (visit: SectionLapsPack) => visit.sourceTier ?? 'parsed_pdf_aggregate';
        const packs = [...(sectionLaps ? [sectionLaps] : []), ...visitPacks];
        const hasLake = packs.some((visit) => tierOf(visit) === 'lake_loop_crossings');
        /* Pass marks are RaceTools-capture-derived wherever they draw — they
           put the capture in the claim even on official-PDF section pages. */
        const marksDrawn =
          passMarks !== null && sectionAnchors !== null && resolvePassMarks(sectionAnchors, passMarks).length > 0;
        const hasPdfSections =
          packs.some((visit) => tierOf(visit) !== 'lake_loop_crossings') || (!sectionLaps && story?.sections != null);

        /* Replay cards on this page (WatchRaceUnfold: this race + prior years at
           this venue) cite their own feeds — mirror exactly what renders there. */
        const replayVenue = getVenueBySessionId(sessionId);
        const currentVisit = replayVenue?.visits.find((visit) => visit.sessionId === sessionId) ?? null;
        const currentCapture = replayCatalog ? watchableCaptureForRace(replayCatalog, sessionId) : null;
        const priorReplays = replayCatalog
          ? priorYearReplaysAtVenue(replayCatalog, pastVisits(replayVenue, sessionId), currentVisit?.seasonYear)
          : [];
        const replaySessions = [currentCapture, ...priorReplays.map((prior) => prior.capture)].filter(
          (session): session is ReplaySessionInfo => session !== null
        );
        const replayTiers = new Set(replaySessions.map((session) => replayProvenance(session).tier));

        /* The Quali module draws from its own capture tier when it renders; the
           quiet Race-2 note makes no data claim, so only a rendered session
           counts toward the footer. */
        const qualiTier = qualiResolution && qualiResolution !== 'failed' ? qualiResolution.session?.sourceTier ?? null : null;

        const hasRaceTools = hasLake || marksDrawn || replayTiers.has('racetools_capture') || qualiTier === 'racetools_capture';
        const hasTiming71 = replayTiers.has('timing71_normalized') || qualiTier === 'timing71_normalized';
        const hasOwnCapture = [...replayTiers].some(isBryceCastCaptureTier);

        const parts = ['official results', 'the official lap chart'];
        if (hasPdfSections) parts.push('official section reports');
        if (hasOwnCapture) parts.push('our Race Control timing capture');
        if (hasRaceTools) parts.push('the RaceTools race-weekend capture');
        if (hasTiming71) parts.push('Timing71 normalized timing');
        if (story?.weather) parts.push('modeled near-track weather (Open-Meteo)');
        const sources =
          parts.length === 1
            ? parts[0]
            : parts.length === 2
              ? `${parts[0]} and ${parts[1]}`
              : `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;

        return (
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
            Everything on this page comes from {sources}.
          </p>
        );
      })()}
    </div>
  );
};
