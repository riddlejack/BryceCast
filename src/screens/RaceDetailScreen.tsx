import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Flag, Users } from 'lucide-react';
import { Card, HeroPanel, SourcePill, Stat, StatusChip, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, inkGoldDiverging, useMeasuredWidth, type ChartTip } from '../app/charts';
import { TrackArt } from '../app/trackArt';
import { trackOutlineFor, type TrackOutline } from '../assets/tracks';
import { timedShareOf, trackSectionsFor, type TrackSectionAnchorSet } from '../assets/tracks/sections';
import {
  MIN_CLEAN_LAPS,
  lapContextOf,
  lapScopesFor,
  resolveHeatSections,
  sectionObservationsFromLaps,
  sectionObservationsFromRaceStory,
  type SectionScope,
  type SectionStat,
  type SectionObservationSet
} from '../data/sectionObservations';
import { loadSectionLaps, sectionLapVisitsFor, type SectionLapsPack } from '../data/sectionLaps';
import { uiDataPackage } from '../data/uiDataPackage';
import { ControlRow, Segmented } from './careerExplorer';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition, ordinal } from '../app/format';
import { Link } from '../app/router';
import { displayRaceLabel, loadDebriefBySessionId, roundIndexOf, type ArchiveEntry } from '../data/debriefArchive';
import { loadRaceStory, type RaceStoryPack, type RaceStoryLapDriver } from '../data/raceStory';

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

const LapChart = ({ story }: { story: RaceStoryPack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);
  const dotTipActive = useRef(false);

  const { totalLaps, fieldSize, drivers } = story.lapChart;
  const height = Math.max(280, Math.min(420, Math.round(width * 0.34)));
  const margin = { top: 16, right: width < 560 ? 74 : 120, bottom: 30, left: 36 };
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
          <CheckeredTick x={x(totalLaps) + 8} y={height - 19} />

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
                x={x(totalLaps) + 20}
                y={y(bryce.laps[bryce.laps.length - 1][1])}
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
  const hasBryceLine = story.bryce.inLapChart;
  const teammateCount = story.lapChart.drivers.filter((driver) => driver.isTeammate).length;
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
      <p className="caption caption--secondary" style={{ margin: '0 0 10px' }}>
        Bryce in ink with gold moments{teammateCount > 0 ? ` · ${story.teamContext?.teamName ?? 'team'} cars in darker gray` : ''} · the
        field in light gray · ○ marks a day that ended early · hover any line
      </p>
      {hasBryceLine ? (
        <LapChart story={story} />
      ) : (
        <>
          <div style={{ opacity: 0.55 }}>
            <LapChart story={story} />
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }}>
            Contact on the opening lap ended Bryce’s race before a lap went in the books — the chart shows how the rest of the
            field’s day unfolded.
          </p>
        </>
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

const TheDay = ({ story, pack }: { story: RaceStoryPack; pack: ArchiveEntry['pack'] }) => {
  const weather = story.weather;
  const context = pack.raceContext;
  const leader = asString(context?.topLeader);
  const leaderShare = asNumber(context?.topLeaderShare);
  const incidents = asNumber(context?.sessionIncidentCount);
  const bryceIncidents = asNumber(context?.bryceIncidentCount);
  const tempF = weather?.ambientTempC !== null && weather ? Math.round((weather.ambientTempC * 9) / 5 + 32) : null;
  const windMph = weather?.windSpeedKph !== null && weather ? Math.round(weather.windSpeedKph / 1.609344) : null;
  const gustMph = weather?.windGustKph !== null && weather ? Math.round(weather.windGustKph / 1.609344) : null;
  const sky = weather?.conditionRaw ? weather.conditionRaw.replaceAll('_', ' ') : null;
  const rainMm = weather?.precipitationMm ?? null;
  if (!weather && !leader && incidents === null) return null;

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
            }
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
            value={`${windMph} mph`}
            note={gustMph !== null && gustMph > windMph + 4 ? `gusts to ${gustMph}` : 'steady all race'}
          />
        ) : null}
        {rainMm !== null && rainMm > 0 ? (
          <DayTile label="Rain in the race hour" value={`${formatNumber(rainMm)} mm`} note={sky ?? 'race-hour reading'} />
        ) : sky ? (
          <DayTile label="Sky" value={sky} note="during the race hour" />
        ) : null}
      </div>
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

/* ---------- the track, section by section (the shape as the interface) ---------- */

/** The house ink↔gold key rendered as a short swatch strip. Keyed on screen so
 *  gold's one meaning here (a stronger stretch) is never ambiguous. */
const HeatKey = () => {
  const stops = [0, 0.2, 0.4, 0.5, 0.6, 0.8, 1];
  return (
    <div className="row" style={{ gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Tougher</span>
      <span style={{ display: 'flex', borderRadius: 3, overflow: 'hidden' }}>
        {stops.map((stop) => (
          <span key={stop} style={{ width: 20, height: 8, background: inkGoldDiverging(stop) }} />
        ))}
      </span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Stronger</span>
      <span style={{ fontSize: 11.5, color: 'var(--ink-secondary)' }}>
        deeper gold = stronger stretch, deeper ink = tougher
      </span>
    </div>
  );
};

/** Single-lap drawer row: a one-dot strip would imply a distribution that
 *  isn't there (director ruling), so one lap gets its plain value instead. */
const SectionSingleLapRow = ({
  label,
  observation
}: {
  label: string;
  observation: { percentile: number | null; cautionState?: 'green' | 'caution' | 'restart' | 'unknown' };
}) => (
  <div className="row row--between" style={{ gap: 12 }}>
    <span
      title={label}
      style={{ fontSize: 12.5, color: 'var(--ink-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {label}
    </span>
    <span className="tnum" style={{ fontSize: 12, color: observation.percentile === null ? 'var(--ink-muted)' : 'var(--ink-primary)', textAlign: 'right' }}>
      {observation.percentile === null
        ? 'no timing row for this lap'
        : `this lap: ${ordinal(Math.round(observation.percentile * 100))} percentile${
            observation.cautionState && observation.cautionState !== 'green' ? ` · ${cautionCopy[observation.cautionState]}` : ''
          }`}
    </span>
  </div>
);

/** One drawer row: official label, summary ordinal, clean-lap count, and the
 *  distribution strip — every clean lap a quiet dot on the 0–100 scale, the
 *  summary statistic a gold tick. The percentile's meaning, shown not told. */
const SectionDistributionRow = ({
  label,
  observation,
  stat
}: {
  label: string;
  observation: { percentile: number | null; observationCount: number | null; lapPercentiles?: Array<{ lap: number; percentile: number }> };
  stat: SectionStat;
}) => {
  const points = observation.lapPercentiles ?? [];
  const suppressed = observation.percentile === null;
  return (
    <div className="row" style={{ gap: 12, alignItems: 'center' }}>
      <span
        title={label}
        style={{ fontSize: 12.5, color: 'var(--ink-secondary)', flex: '0 0 32%', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
      <span style={{ position: 'relative', flex: 1, height: 22 }}>
        <span style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, borderRadius: 1, background: 'var(--surface-2)' }} />
        {points.map((point) => (
          <span
            key={point.lap}
            style={{
              position: 'absolute',
              top: 8,
              left: `calc(${point.percentile * 100}% - 3px)`,
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--ink-primary)',
              opacity: 0.18
            }}
          />
        ))}
        {observation.percentile !== null ? (
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: `calc(${observation.percentile * 100}% - 1.5px)`,
              width: 3,
              height: 16,
              borderRadius: 1.5,
              background: 'var(--bryce)'
            }}
          />
        ) : null}
      </span>
      <span className="tnum" style={{ fontSize: 12, color: suppressed ? 'var(--ink-muted)' : 'var(--ink-primary)', width: 92, textAlign: 'right' }}>
        {suppressed
          ? `${observation.observationCount ?? 0} clean ${observation.observationCount === 1 ? 'lap' : 'laps'}`
          : `${ordinal(Math.round(observation.percentile! * 100))} · ${observation.observationCount ?? 0} ${
              observation.observationCount === 1 ? 'lap' : 'laps'
            }`}
      </span>
    </div>
  );
};

const cautionCopy: Record<string, string> = {
  green: 'green flag',
  caution: 'under caution',
  restart: 'restart lap',
  unknown: 'no flag report'
};

const scopeKeyOf = (scope: SectionScope): string =>
  scope.kind === 'full_race' ? 'full' : scope.kind === 'lap_window' ? scope.label : 'lap';

const SectionHeatCard = ({
  outline,
  anchors,
  laps,
  fallbackSet
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  laps: SectionLapsPack | null;
  fallbackSet: SectionObservationSet | null;
}) => {
  const [scopeKey, setScopeKey] = useState('full');
  const [scrubLap, setScrubLap] = useState(1);
  const [stat, setStat] = useState<SectionStat>('median');
  const [numbersOpen, setNumbersOpen] = useState(false);

  const scopes = useMemo(() => (laps ? lapScopesFor(laps.totalLaps) : []), [laps]);
  const lapContext = useMemo(() => (laps ? lapContextOf(laps) : []), [laps]);
  const scope: SectionScope = useMemo(() => {
    if (!laps || scopeKey === 'full') return { kind: 'full_race' };
    if (scopeKey === 'lap') return { kind: 'single_lap', lap: scrubLap };
    return scopes.find((entry) => entry.kind === 'lap_window' && entry.label === scopeKey) ?? { kind: 'full_race' };
  }, [laps, scopeKey, scrubLap, scopes]);

  const set = useMemo(() => {
    if (laps) return sectionObservationsFromLaps(laps, scope, stat);
    return fallbackSet;
  }, [laps, scope, stat, fallbackSet]);
  const heatSections = useMemo(() => (set ? resolveHeatSections(anchors, set) : []), [anchors, set]);
  const hasHeat = heatSections.length > 0;
  const suppressedCount = set ? set.sections.filter((section) => section.percentile === null).length : 0;
  const singleLap = scope.kind === 'single_lap';
  const scrubContext = singleLap ? lapContext.find((entry) => entry.lap === scrubLap) ?? null : null;
  const drawerRows = useMemo(() => {
    if (!set) return [];
    const labelFor = new Map(anchors.sections.map((anchor) => [anchor.sectionName, anchor.label]));
    return [...set.sections]
      .map((observation) => ({ observation, label: labelFor.get(observation.sectionName) ?? observation.sectionName }))
      .sort((left, right) => (right.observation.percentile ?? -1) - (left.observation.percentile ?? -1));
  }, [set, anchors]);

  /* Coverage up front (Jack's review): how much of the lap the loops see. */
  const coverage = `${anchors.sections.length} timed sections · ${Math.round(timedShareOf(anchors) * 100)}% of the lap`;
  const scopeSummary = !set
    ? null
    : singleLap
      ? `${coverage} · Lap ${scrubLap} of ${laps?.totalLaps ?? '—'} · ${scrubContext ? cautionCopy[scrubContext.caution] : 'no flag report'}`
      : scope.kind === 'lap_window'
        ? `${coverage} · ${scope.label} · laps ${scope.fromLap}–${scope.toLap} · ${set.comparisonRows ?? 0} clean-lap comparisons`
        : `${coverage} · ${set.comparisonRows ?? 0} clean-lap comparisons`;

  return (
    <Card
      title="The track, section by section"
      action={
        <SourcePill
          title="Section signal"
          entries={[
            {
              label: 'Official Section Results, lap by lap',
              path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
              note: `Bryce's per-lap section times and field percentiles from the official timing loops. Section names follow the track's official timing stations; span lengths are measured from official time × speed (${anchors.confidence}).`
            }
          ]}
          caveats={[
            'Section times come from official timing loops — they are time-based, not GPS or car position.',
            ...(set ? [set.caveat] : []),
            anchors.note
          ]}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        {hasHeat
          ? 'Hover the shape to read Bryce’s pace stretch by stretch — the gold dots mark his two strongest.'
          : set
            ? 'Too few clean laps in this scope to compare sections.'
            : 'The venue shape, with the start/finish line marked.'}
      </p>
      {laps ? (
        <div className="stack" style={{ gap: 10, marginBottom: 12 }}>
          <ControlRow label="Scope">
            <Segmented
              wrap
              options={[
                { value: 'full', label: 'Full race' },
                ...scopes
                  .filter((entry): entry is Extract<SectionScope, { kind: 'lap_window' }> => entry.kind === 'lap_window')
                  .map((entry) => ({ value: entry.label, label: entry.label })),
                { value: 'lap', label: 'One lap' }
              ]}
              value={scopeKey}
              onChange={setScopeKey}
            />
          </ControlRow>
          {singleLap ? (
            <ControlRow label="Lap">
              <span className="stack" style={{ gap: 4, minWidth: 220, flex: 1, maxWidth: 380 }}>
                <input
                  type="range"
                  min={1}
                  max={laps.totalLaps}
                  value={scrubLap}
                  onChange={(event) => setScrubLap(Number(event.target.value))}
                  aria-label={`Lap ${scrubLap} of ${laps.totalLaps}`}
                  style={{ width: '100%' }}
                />
                <span style={{ position: 'relative', display: 'block', height: 4 }} aria-hidden>
                  {lapContext
                    .filter((entry) => entry.caution !== 'green')
                    .map((entry) => (
                      <span
                        key={entry.lap}
                        style={{
                          position: 'absolute',
                          left: `${((entry.lap - 1) / Math.max(laps.totalLaps - 1, 1)) * 100}%`,
                          width: 2,
                          height: 4,
                          background: 'var(--ink-muted)',
                          opacity: 0.6
                        }}
                      />
                    ))}
                </span>
              </span>
            </ControlRow>
          ) : null}
        </div>
      ) : null}
      {hasHeat ? (
        <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <HeatKey />
          {scopeSummary ? (
            <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
              {scopeSummary}
            </span>
          ) : null}
        </div>
      ) : null}
      <TrackArt
        outline={outline}
        showCornerLabels={false}
        maxHeight={300}
        sections={hasHeat ? { resolved: heatSections, showLabels: true } : null}
      />
      {suppressedCount > 0 && !singleLap && hasHeat ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {suppressedCount === 1 ? 'One stretch stays uncoloured' : `${suppressedCount} stretches stay uncoloured`} — under{' '}
          {MIN_CLEAN_LAPS} clean laps in this scope.
        </p>
      ) : null}
      {singleLap && scrubContext && scrubContext.caution !== 'green' ? (
        <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
          Lap {scrubLap} ran {cautionCopy[scrubContext.caution]} — one lap is a snapshot, not a trend.
        </p>
      ) : null}
      {laps && set ? (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--divider)', paddingTop: 12 }}>
          <button
            type="button"
            onClick={() => setNumbersOpen((open) => !open)}
            aria-expanded={numbersOpen}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              fontSize: 13,
              color: 'var(--link)',
              cursor: 'pointer'
            }}
          >
            {numbersOpen ? 'Hide the numbers' : 'The numbers behind the shades'}
          </button>
          {numbersOpen ? (
            <div className="stack" style={{ gap: 12, marginTop: 12 }}>
              {!singleLap ? (
                <ControlRow label="Stat">
                  <Segmented
                    options={[
                      { value: 'median', label: 'Median lap' },
                      { value: 'mean', label: 'Average lap' }
                    ]}
                    value={stat}
                    onChange={setStat}
                  />
                </ControlRow>
              ) : null}
              {!singleLap ? (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  Each dot is one clean lap — its share of the field beaten in that section. The gold tick is his{' '}
                  {stat === 'median' ? 'median' : 'average'} lap, the number the map's shade carries.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  One lap's field share per section, exactly as timed — {scrubContext ? cautionCopy[scrubContext.caution] : 'no flag report'}.
                </p>
              )}
              <div className="stack" style={{ gap: 10 }}>
                {drawerRows.map(({ observation, label }) =>
                  singleLap ? (
                    <SectionSingleLapRow key={observation.sectionName} label={label} observation={observation} />
                  ) : (
                    <SectionDistributionRow key={observation.sectionName} label={label} observation={observation} stat={stat} />
                  )
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
                Clean green-flag laps only — caution and restart laps are excluded from the shades. Loop timing measures
                time, not car position.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      <p style={{ margin: 0, paddingTop: 14, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        {hasHeat
          ? 'Section times from official timing loops — time-based, not GPS. Stretches without timing loops stay the plain line.'
          : set
            ? `Sections need ${MIN_CLEAN_LAPS} clean laps in a scope to compare honestly.`
            : 'No official section times are on file for this race yet.'}
      </p>
    </Card>
  );
};

/* ---------- this place, other years (YoY shapes, same scale, same key) ---------- */

const VisitShape = ({
  outline,
  anchors,
  pack
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  pack: SectionLapsPack;
}) => {
  const set = useMemo(() => sectionObservationsFromLaps(pack, { kind: 'full_race' }, 'median'), [pack]);
  const resolved = useMemo(() => resolveHeatSections(anchors, set), [anchors, set]);
  /* Orientation, not a second question (director ruling): each year carries its
   * official result as quiet label text from the synchronous season index. */
  const indexRow = uiDataPackage.screens.raceDebrief.seasonIndex.find((row) => row.sessionId === pack.sessionId) ?? null;
  const resultLabel =
    indexRow && indexRow.finishPosition !== null
      ? indexRow.startPosition !== null
        ? `P${indexRow.finishPosition} from P${indexRow.startPosition}`
        : `P${indexRow.finishPosition}`
      : null;
  return (
    <div className="stack" style={{ gap: 6, flex: '1 1 240px', minWidth: 220, maxWidth: 420 }}>
      <TrackArt outline={outline} showCornerLabels={false} maxHeight={170} sections={resolved.length > 0 ? { resolved } : null} />
      <div className="row row--between" style={{ alignItems: 'baseline' }}>
        <span style={{ fontSize: 13 }}>
          <strong style={{ fontWeight: 600 }}>{pack.seasonYear ?? '—'}</strong>
          {resultLabel ? <span className="tnum" style={{ color: 'var(--ink-secondary)' }}> · {resultLabel}</span> : null}
        </span>
        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {set.comparisonRows ?? 0} clean-lap comparisons
        </span>
      </div>
    </div>
  );
};

const VenueYearsCard = ({
  outline,
  anchors,
  visits
}: {
  outline: TrackOutline;
  anchors: TrackSectionAnchorSet;
  visits: SectionLapsPack[];
}) => {
  if (visits.length < 2) return null;
  return (
    <Card
      title="This place, other years"
      action={
        <SourcePill
          title="Same venue, every visit"
          entries={[
            {
              label: 'Official Section Results, lap by lap',
              path: 'analysis/indy-nxt-race-lap-section-enhancement/output/race_section_lap_observations.csv',
              note: 'Each year aggregates its own race on the same scale: median clean-lap percentile per section.'
            }
          ]}
          caveats={['Different years can carry different field sizes and caution patterns; each shape states its own denominator.']}
        />
      }
    >
      <p style={{ margin: '0 0 12px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        The same shape, one per visit — same scale, same key as above.
      </p>
      <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <HeatKey />
        <span className="tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
          {anchors.sections.length} timed sections · {Math.round(timedShareOf(anchors) * 100)}% of the lap
        </span>
      </div>
      <div className="row" style={{ gap: 22, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {visits.map((pack) => (
          <VisitShape key={pack.sessionId} outline={outline} anchors={anchors} pack={pack} />
        ))}
      </div>
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

/** "Practice P12 → Qualifying P8 → Grid P8 → Flag P6", stations omitted when unknown. */
const weekendArc = (story: RaceStoryPack): string | null => {
  const signal = story.weekendSignal;
  if (!signal) return null;
  const stations = [
    ['Practice', signal.bestPracticeRank],
    ['Qualifying', signal.bestQualifyingRank],
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

export const RaceDetailScreen = ({ sessionId }: { sessionId: string }) => {
  const [entry, setEntry] = useState<ArchiveEntry | null | 'loading'>('loading');
  const [story, setStory] = useState<RaceStoryPack | null>(null);
  const [sectionLaps, setSectionLaps] = useState<SectionLapsPack | null>(null);
  const [visitPacks, setVisitPacks] = useState<SectionLapsPack[]>([]);

  useEffect(() => {
    setEntry('loading');
    setStory(null);
    setSectionLaps(null);
    setVisitPacks([]);
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
  const eventDate = asString((pack as unknown as Row).eventStartDate);
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
  /* Anchored venues only: approximate curations (e.g. WWTR, held for measured
   * loop locations from the lake) render no heat layer and keep SectionStory. */
  const sectionAnchorsAny = trackSectionsFor(asString(pack.track.name));
  const sectionAnchors = sectionAnchorsAny && sectionAnchorsAny.confidence === 'anchored' ? sectionAnchorsAny : null;
  const fallbackSet = story ? sectionObservationsFromRaceStory(story) : null;
  const heroSet = sectionLaps ? sectionObservationsFromLaps(sectionLaps) : fallbackSet;
  const heroHeat = sectionAnchors && heroSet ? resolveHeatSections(sectionAnchors, heroSet) : [];
  const heroSectionsLayer = heroHeat.length > 0 ? { resolved: heroHeat, showLabels: false } : null;

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
            entries={pack.sourceRefs.slice(0, 6).map((ref) => ({
              label: asString(ref.kind) ?? asString(ref.table) ?? 'Official source table',
              path: asString(ref.path) ?? undefined
            }))}
            caveats={pack.caveats}
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
              <span style={{ marginTop: 8 }}>
                <StatusChip tone="neutral" label={`official status: ${bryceStatus}`} />
              </span>
            ) : null}
          </div>
          {/* Fixed art zone: every venue letterboxes into the same box, so the
              layout never shifts race to race (street circuits stay calm and empty). */}
          <div className="hero-race__art">
            {outline ? (
              <TrackArt outline={outline} showCornerLabels={false} maxHeight={150} sections={heroSectionsLayer} />
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

      {story ? <LapChartCard story={story} mover={mover} /> : null}

      {story ? <TheDay story={story} pack={pack} /> : null}

      {outline && sectionAnchors ? (
        <SectionHeatCard outline={outline} anchors={sectionAnchors} laps={sectionLaps} fallbackSet={fallbackSet} />
      ) : null}

      {outline && sectionAnchors ? <VenueYearsCard outline={outline} anchors={sectionAnchors} visits={visitPacks} /> : null}

      {/* Where the heat card renders, the section table retires INTO its
          drawer (director ruling, 2026-07-18): same numbers, richer form.
          Venues without a heat card keep the table — the handoff is per-page
          and automatic as venues gain anchors. */}
      {story ? (
        outline && sectionAnchors ? (
          <TeamStory story={story} />
        ) : (
          <div className="grid grid--2">
            <TeamStory story={story} />
            <SectionStory story={story} />
          </div>
        )
      ) : null}

      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Everything on this page comes from official results, the official lap chart, and official section reports.
      </p>
    </div>
  );
};
