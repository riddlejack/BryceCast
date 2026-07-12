import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { Card, HeroPanel, SourcePill, Stat, StatusChip, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
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
    const finishText = best.driver.finishPosition !== null ? `finished P${best.driver.finishPosition}` : null;
    const statusText = best.driver.status && best.driver.status !== 'running' ? best.driver.status : null;
    setTip({
      x: x(lap),
      y: y(best.position),
      title: best.driver.driverName,
      detail: [
        best.driver.carNumber ? `car ${best.driver.carNumber}` : null,
        `P${best.position} on lap ${lap}`,
        statusText ?? finishText
      ]
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
              return (
                <polyline
                  key={driver.driverId}
                  points={lineFor(driver)}
                  fill="none"
                  stroke={focused ? 'var(--ink-primary)' : driver.isTeammate ? teammateInk : rivalInk}
                  strokeWidth={focused ? 2 : 1.25}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  style={{ opacity: focusedDriver !== null && !focused ? 0.45 : 1, transition: 'opacity 150ms ease, stroke 150ms ease' }}
                />
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
        field in light gray · hover any line
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
      {mover && mover.gain > 0 ? (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
          {/^bryce/i.test(mover.name)
            ? `Nobody climbed further up the lap chart than Bryce: ${mover.gain} spots.`
            : `Biggest climber on the day: ${mover.name}, up ${mover.gain} spots on the lap chart.`}
        </p>
      ) : null}
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
      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Percentile of the field beaten in each timing section, from {formatNumber(sections.comparisonRows, 0)} official comparisons
        across the weekend.
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
      <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
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
    </Card>
  );
};

/* ---------- weekend arc + weather copy ---------- */

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

/** "dry/moderate/medium" → "dry track · moderate temps · medium wind". */
const weatherCopy = (raw: string): string => {
  const [track, temps, wind] = raw.split('/');
  const parts = [track ? `${track} track` : null, temps ? `${temps} temps` : null, wind ? `${wind} wind` : null].filter(Boolean);
  return parts.length === 3 ? parts.join(' · ') : raw.replaceAll('/', ' · ');
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

  useEffect(() => {
    setEntry('loading');
    setStory(null);
    loadDebriefBySessionId(sessionId)
      .then((found) => setEntry(found))
      .catch(() => setEntry(null));
    loadRaceStory(sessionId)
      .then((pack) => setStory(pack))
      .catch(() => setStory(null));
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
  const context = pack.raceContext;
  const bryceIncidents = asNumber(context?.bryceIncidentCount);
  const weather = asString(context?.weatherContext);
  const leader = asString(context?.topLeader);
  const leaderShare = asNumber(context?.topLeaderShare);
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
        <div className="grid grid--split" style={{ alignItems: 'end', gap: 20 }}>
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
          <div className="row" style={{ gap: 28, flexWrap: 'wrap' }}>
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

      <div className="grid grid--2">
        {story ? <TeamStory story={story} /> : null}
        {story ? <SectionStory story={story} /> : null}
      </div>

      <div className="row row--wrap" style={{ gap: 8 }}>
        {leader && leaderShare !== null ? <StatusChip tone="neutral" label={`${leader} led ${Math.round(leaderShare * 100)}% of laps`} /> : null}
        {asNumber(context?.sessionIncidentCount) ? (
          <StatusChip tone="neutral" label={`${context?.sessionIncidentCount} incidents race-wide`} />
        ) : null}
        {bryceIncidents !== null && bryceIncidents > 0 ? (
          <StatusChip tone="neutral" label={`${bryceIncidents} official incident record${bryceIncidents === 1 ? '' : 's'}`} />
        ) : null}
        {weather ? <StatusChip tone="neutral" label={weatherCopy(weather)} /> : null}
        <StatusChip tone="neutral" label="official results · lap chart · section reports" />
      </div>
    </div>
  );
};
