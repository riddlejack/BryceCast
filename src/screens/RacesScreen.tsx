import { useMemo, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, ScreenHead, SourcePill, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { trackOutlineFor } from '../assets/tracks';
import { formatDate, formatGain, formatNumber, formatPosition } from '../app/format';
import { Link, useRouter } from '../app/router';
import { displayRaceLabelText } from '../data/debriefArchive';
import { getSeasonIndex } from '../data/seasons';
import { getUpcomingEvents, raceDayOf, type UpcomingPrepEvent } from '../data/upcoming';
import { liveArchiveUpgradeFor, type LiveArchiveUpgrade } from '../data/liveRaceShellModel';
import type { LiveReadiness } from '../app/useReadiness';
import type { UiSeasonIndexRow } from '../data/uiDataPackage';

/** Archive labels drop the series prefix — everything here is INDY NXT. */
const archiveLabel = (raceLabel: string): string =>
  displayRaceLabelText(raceLabel).replace(/^INDY NXT by Firestone at (the )?/i, '');

/* ---------- tiny venue mark: letterboxed outline, no measurement needed ---------- */

const MiniTrack = ({ trackName, muted = false }: { trackName: string | null; muted?: boolean }) => {
  const outline = trackOutlineFor(trackName);
  return (
    <span className="race-row__mini" style={{ width: 44, height: 26, alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
      {outline ? (
        <svg viewBox={outline.viewBox} width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden>
          <path
            d={outline.mainPath}
            fill="none"
            stroke={muted ? 'var(--ink-muted)' : 'var(--ink-secondary)'}
            strokeWidth={1.2}
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </span>
  );
};

/* ---------- the season spine: finishes + standing, one shared x-axis ---------- */

const SeasonSpine = ({ rows }: { rows: UiSeasonIndexRow[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const ordered = rows;
  const n = ordered.length;
  if (n < 2) return null;

  const margin = { top: 26, right: 18, bottom: 24, left: 36 };
  const finishPanelHeight = 150;
  const panelGap = 34;
  const standingPanelHeight = 74;
  const height = margin.top + finishPanelHeight + panelGap + standingPanelHeight + margin.bottom;
  const plotWidth = Math.max(width - margin.left - margin.right, 80);
  const x = (index: number) => margin.left + (index / (n - 1)) * plotWidth;

  const finishes = ordered.map((row) => row.finishPosition ?? 0);
  const worstFinish = Math.max(...finishes, ...ordered.map((row) => row.startPosition ?? 1));
  const yFinish = (position: number) => margin.top + ((position - 1) / Math.max(worstFinish, 2)) * finishPanelHeight;

  const standings = ordered.map((row) => row.standingRank).filter((value): value is number => value !== null);
  const standingMin = Math.max(1, Math.min(...standings) - 1);
  const standingMax = Math.max(...standings) + 1;
  const standingTop = margin.top + finishPanelHeight + panelGap;
  const yStanding = (rank: number) =>
    standingTop + ((rank - standingMin) / Math.max(standingMax - standingMin, 1)) * standingPanelHeight;

  const finishTicks = [1, 5, 10, 15, 20, 25].filter((tick) => tick <= worstFinish + 1);
  const standingTicks = [...new Set([standingMin + 1, standingMax - 1])].filter(
    (tick) => tick >= standingMin && tick <= standingMax
  );
  const labelEvery = width < 560 ? 2 : 1;

  const finishLine = ordered
    .map((row, index) => `${x(index)},${yFinish(row.finishPosition ?? worstFinish)}`)
    .join(' ');
  // Step path (stepAfter): horizontal to the next round's x, then vertical.
  const standingRows = ordered.filter((row) => row.standingRank !== null);
  let standingPath = '';
  standingRows.forEach((row, index) => {
    const pointX = x(ordered.indexOf(row));
    const pointY = yStanding(row.standingRank as number);
    if (index === 0) {
      standingPath = `M${pointX} ${pointY}`;
    } else {
      standingPath += ` H${pointX} V${pointY}`;
    }
  });

  const clearHover = () => {
    setHovered(null);
    setTip(null);
  };

  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const bounds = svgRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const mouseX = event.clientX - bounds.left;
    if (mouseX < margin.left - 12 || mouseX > width - margin.right + 12) {
      clearHover();
      return;
    }
    const index = Math.min(n - 1, Math.max(0, Math.round(((mouseX - margin.left) / plotWidth) * (n - 1))));
    const row = ordered[index];
    setHovered(index);
    const clean = row.officialStatus === 'running';
    setTip({
      x: x(index),
      y: yFinish(row.finishPosition ?? worstFinish),
      title: archiveLabel(row.raceLabel),
      detail: [
        row.startPosition !== null ? `started P${row.startPosition}` : null,
        row.finishPosition !== null ? `finished P${row.finishPosition}` : null,
        !clean && row.officialStatus && row.officialStatus !== 'unknown' ? row.officialStatus : null,
        row.points !== null ? `${row.points} pts` : null,
        row.standingRank !== null ? `P${row.standingRank} in points` : null
      ]
        .filter(Boolean)
        .join(' · '),
      action: 'open the race page'
    });
  };

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label="Season results and championship standing, round by round"
          onMouseMove={onMove}
          onMouseLeave={clearHover}
          onClick={() => {
            if (hovered !== null) navigate(`/races/${encodeURIComponent(ordered[hovered].sessionId)}`);
          }}
          style={{ cursor: hovered !== null ? 'pointer' : 'default' }}
        >
          <text x={margin.left} y={13} fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11.5} fontWeight={550}>
            Race finishes
          </text>
          {finishTicks.map((tick) => (
            <g key={`f${tick}`}>
              <line x1={margin.left} x2={width - margin.right} y1={yFinish(tick)} y2={yFinish(tick)} stroke="var(--grid-hairline)" />
              <text
                x={margin.left - 8}
                y={yFinish(tick)}
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
          <text
            x={margin.left}
            y={standingTop - 9}
            fill="var(--ink-secondary)"
            fontFamily={chartFont}
            fontSize={11.5}
            fontWeight={550}
          >
            Championship standing
          </text>
          {standingTicks.map((tick) => (
            <g key={`s${tick}`}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={yStanding(tick)}
                y2={yStanding(tick)}
                stroke="var(--grid-hairline)"
              />
              <text
                x={margin.left - 8}
                y={yStanding(tick)}
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

          {hovered !== null ? (
            <line
              x1={x(hovered)}
              x2={x(hovered)}
              y1={margin.top - 6}
              y2={height - margin.bottom + 2}
              stroke="var(--axis-baseline)"
              strokeDasharray="3 3"
            />
          ) : null}

          <polyline points={finishLine} fill="none" stroke="var(--ink-primary)" strokeWidth={2} strokeLinejoin="round" />
          {ordered.map((row, index) => {
            const clean = row.officialStatus === 'running';
            const topFive = clean && row.finishPosition !== null && row.finishPosition <= 5;
            const pointY = yFinish(row.finishPosition ?? worstFinish);
            return (
              <circle
                key={row.sessionId}
                cx={x(index)}
                cy={pointY}
                r={hovered === index ? 5.4 : 4.2}
                fill={clean ? (topFive ? 'var(--bryce)' : 'var(--ink-primary)') : 'var(--surface-1)'}
                stroke={clean ? (topFive ? 'var(--bryce)' : 'var(--ink-primary)') : 'var(--ink-muted)'}
                strokeWidth={1.6}
                style={{ transition: 'r 120ms ease' }}
              />
            );
          })}

          <path d={standingPath} fill="none" stroke="var(--ink-secondary)" strokeWidth={1.7} strokeLinejoin="round" />
          {hovered !== null && ordered[hovered].standingRank !== null ? (
            <circle cx={x(hovered)} cy={yStanding(ordered[hovered].standingRank as number)} r={3.6} fill="var(--ink-secondary)" />
          ) : null}

          {ordered.map((row, index) =>
            index % labelEvery === 0 || index === n - 1 ? (
              <text
                key={`r${row.sessionId}`}
                x={x(index)}
                y={height - 8}
                textAnchor="middle"
                fill="var(--ink-muted)"
                fontFamily={chartFont}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {row.roundIndex ?? index + 1}
              </text>
            ) : null
          )}
          <text x={margin.left - 8} y={height - 8} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10.5}>
            round
          </text>
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

/* ---------- list rows: the index under the spine ---------- */

const RaceRow = ({ row }: { row: UiSeasonIndexRow }) => {
  const gain = row.startPosition !== null && row.finishPosition !== null ? formatGain(row.startPosition - row.finishPosition) : null;
  const shortLabel = archiveLabel(row.raceLabel);
  const clean = row.officialStatus === 'running';
  /* Gold means the same thing here as on the spine above: a top-5 finish. */
  const topFive = clean && row.finishPosition !== null && row.finishPosition <= 5;
  return (
    <Link to={`/races/${encodeURIComponent(row.sessionId)}`} className="tower__row race-row">
      <span className="figure row" style={{ fontSize: 17, gap: 4, color: 'var(--ink-primary)' }}>
        {formatPosition(row.finishPosition)}
        {topFive ? <span aria-label="top five" style={{ width: 5, height: 5, borderRadius: 2, background: 'var(--bryce)' }} /> : null}
      </span>
      <MiniTrack trackName={row.trackName} />
      {/* Name + status stack vertically (#24): the shared .tower__name is a
          centered flex row, so we flip it to a left-aligned column here. Status
          then sits on its own line under the race name — a long venue never
          truncates it to "mechanic", and it no longer steals the title column. */}
      <span
        className="tower__name"
        style={{ whiteSpace: 'normal', flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}
      >
        <span>{shortLabel}</span>
        {!clean && row.officialStatus && row.officialStatus !== 'unknown' ? (
          <span className="tower__team">
            {row.officialStatus.charAt(0).toUpperCase() + row.officialStatus.slice(1)}
          </span>
        ) : null}
      </span>
      <span className={`stat__delta ${gain?.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`} style={{ textAlign: 'right' }}>
        {gain ? gain.text : ''}
      </span>
      <span className="tower__gap tnum">{row.points !== null ? `${row.points} pts` : ''}</span>
      <span className="tower__gap race-row__date" style={{ fontSize: 11.5, minWidth: 52 }}>
        {(row.raceDate ?? row.eventStartDate) ? formatDate(row.raceDate ?? row.eventStartDate!, { month: 'short', day: 'numeric' }) : ''}
      </span>
      <ArrowRight size={13} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  );
};

const seasonSummary = (rows: UiSeasonIndexRow[]): string => {
  const finishes = rows.map((row) => row.finishPosition).filter((value): value is number => value !== null);
  if (finishes.length === 0) return '';
  const top10s = finishes.filter((finish) => finish <= 10).length;
  const best = Math.min(...finishes);
  const parts = [`${finishes.length} races`, `best P${best}`];
  if (top10s > 0) parts.push(`${top10s} top-10${top10s === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

/* ---------- remaining season: placeholder rounds, listed but not yet raced ---------- */

interface PlaceholderRound {
  eventId: string;
  trackName: string;
  raceDate: string;
  round: number;
  seasonTotal: number;
  label: string;
}

/** The rounds still to run this season — derived only from the typed adapters,
 *  never invented. The round number continues from the last completed round;
 *  the season total is that round plus the events the schedule still carries.
 *  (Verified 2026-07-19: 13 completed rounds + 4 upcoming = a 17-race season,
 *  matching the canonical INDY NXT schedule feed.) */
const remainingRoundsFor = (completed: UiSeasonIndexRow[], upcoming: UpcomingPrepEvent[]): PlaceholderRound[] => {
  if (upcoming.length === 0 || completed.length === 0) return [];
  const lastRun = Math.max(...completed.map((row) => row.roundIndex ?? 0));
  const seasonTotal = lastRun + upcoming.length;
  return upcoming.map((event, index) => ({
    eventId: event.eventId,
    trackName: event.trackName,
    raceDate: raceDayOf(event),
    round: lastRun + index + 1,
    seasonTotal,
    label: archiveLabel(event.eventName)
  }));
};

/* One placeholder row: the archive's grammar (outline mini in its fixed box,
 * series prefix trimmed, date) but quieter and honestly non-interactive — no
 * result numerals, no chevron, no link. It becomes a real, clickable row only
 * once the race has run and its results land in the package.
 *
 * The moment this round's race goes live (the shell exists), the row upgrades
 * IN PLACE: a quiet ink dot + "LIVE", and the row opens the race's live page —
 * the same URL that will hold the finished story forever (Brief R-c). */
const UpcomingRaceRow = ({ round, live }: { round: PlaceholderRound; live: LiveArchiveUpgrade | null }) =>
  live ? (
    <Link to={`/races/${encodeURIComponent(live.sessionId)}`} className="tower__row race-row--upcoming race-row--live">
      <MiniTrack trackName={round.trackName} />
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {round.label}
        <span className="tower__team">
          race {round.round} of {round.seasonTotal}
        </span>
      </span>
      <span
        className="row tnum"
        style={{ gap: 6, fontSize: 11.5, fontWeight: 650, color: 'var(--ink-primary)', justifyContent: 'flex-end' }}
      >
        {/* The spec's QUIET INK dot — never the status green; the archive is
            not a health indicator, it just points at the live page. */}
        <span className="live-dot" style={{ background: 'var(--ink-primary)' }} aria-hidden />
        LIVE
      </span>
      <ArrowRight size={13} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  ) : (
    <div className="tower__row race-row--upcoming" aria-disabled="true">
      <MiniTrack trackName={round.trackName} muted />
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {round.label}
        <span className="tower__team">
          race {round.round} of {round.seasonTotal}
        </span>
      </span>
      <span className="tower__gap tnum" style={{ fontSize: 11.5, color: 'var(--ink-muted)', minWidth: 52 }}>
        {round.raceDate ? formatDate(round.raceDate, { month: 'short', day: 'numeric' }) : ''}
      </span>
    </div>
  );

/* The remaining-season block no longer carries its own source control: its
 * schedule entry and caveats fold into the season card's one SourcePill (see
 * RacesScreen), so a single card keeps a single source drawer. */
const RemainingSeason = ({
  season,
  rounds,
  livePayload
}: {
  season: number;
  rounds: PlaceholderRound[];
  livePayload: LiveReadiness | null;
}) => (
  <div className="race-upcoming">
    <div className="race-upcoming__head">
      <p className="caption caption--secondary" style={{ margin: 0 }}>
        The rest of {season} — {rounds.length} round{rounds.length === 1 ? '' : 's'} still to run. Each opens once it&rsquo;s been
        raced.
      </p>
    </div>
    <div className="tower race-upcoming__list" style={{ margin: '4px -12px 0' }}>
      {rounds.map((round) => (
        <UpcomingRaceRow key={round.eventId} round={round} live={liveArchiveUpgradeFor(round.eventId, livePayload)} />
      ))}
    </div>
  </div>
);

export const RacesScreen = ({ livePayload = null }: { livePayload?: LiveReadiness | null }) => {
  const index = getSeasonIndex();

  const seasons = useMemo(() => {
    const bySeason = new Map<number, UiSeasonIndexRow[]>();
    for (const row of index) {
      const year = row.seasonYear ?? 0;
      const list = bySeason.get(year) ?? [];
      list.push(row);
      bySeason.set(year, list);
    }
    // rows arrive chronological; seasons newest-first, spine ascending, list newest-first
    return [...bySeason.entries()].sort((a, b) => b[0] - a[0]);
  }, [index]);

  // Upcoming events grouped by season year (soonest first — the adapter sorts
  // ascending by weekend start). Only seasons with a completed card below get
  // their remaining rounds shown; the source is the package's upcoming events.
  const upcomingBySeason = useMemo(() => {
    const bySeason = new Map<number, UpcomingPrepEvent[]>();
    for (const event of getUpcomingEvents()) {
      const year = Number(event.eventStartDate.slice(0, 4));
      if (!Number.isFinite(year)) continue;
      const list = bySeason.get(year) ?? [];
      list.push(event);
      bySeason.set(year, list);
    }
    return bySeason;
  }, []);

  return (
    <div className="page stack">
      <ScreenHead
        kicker="The archive"
        title="Races"
        sub={
          index.length > 0
            ? `Every INDY NXT weekend — ${formatNumber(index.length, 0)} races told straight from the official data.`
            : 'Every INDY NXT weekend, told straight from the official data.'
        }
      />
      {index.length === 0 ? (
        <Card>
          <Unavailable>No completed races in the package yet.</Unavailable>
        </Card>
      ) : (
        seasons.map(([season, rows]) => {
          const remaining = remainingRoundsFor(rows, upcomingBySeason.get(season) ?? []);
          return (
          <Card
            key={season}
            title={`${season} season`}
            action={
              <span className="row" style={{ gap: 12 }}>
                <span className="caption caption--secondary">{seasonSummary(rows)}</span>
                <SourcePill
                  title={`${season} season index`}
                  entries={[
                    {
                      label: 'Official results · every completed race',
                      path: 'analysis/predictive-race-intelligence/output/context-packs/race-debriefs/',
                      note: 'Start, finish, points, and official result status per round, from the race-debrief packs.'
                    },
                    {
                      label: 'Championship progression',
                      path: 'analysis/indy-nxt-discovery/output/deep_dive/tables/championship_progression.csv',
                      note: 'Standing after each round from official points progression.'
                    },
                    // Folded in from the former remaining-season pill: the same
                    // card now speaks with one source control.
                    ...(remaining.length > 0
                      ? [
                          {
                            label: 'Remaining rounds · official schedule',
                            path: 'analysis/predictive-race-intelligence/output/context-packs/upcoming-events/',
                            note: 'Venue, date, and running order for the rounds still to come, from the upcoming-event context packs.'
                          }
                        ]
                      : [])
                  ]}
                  caveats={[
                    'Standing is recorded after each round; mid-season rows shift as the season goes on.',
                    ...(remaining.length > 0
                      ? [
                          'Round numbers continue from the last completed round; the season total is that round plus the rounds still scheduled.',
                          'These rounds have not been raced, so no result is shown and the row does not open yet.'
                        ]
                      : [])
                  ]}
                />
              </span>
            }
          >
            {remaining.length > 0 ? <RemainingSeason season={season} rounds={remaining} livePayload={livePayload} /> : null}
            <p className="caption caption--secondary" style={{ margin: '0 0 8px' }}>
              Gold marks a top-5 finish · ○ a day that ended early · the quiet line is his championship position · click any
              round
            </p>
            <SeasonSpine rows={rows} />
            <div className="tower" style={{ margin: '10px -12px 0' }}>
              {[...rows].reverse().map((row) => (
                <RaceRow key={row.sessionId} row={row} />
              ))}
            </div>
          </Card>
          );
        })
      )}
    </div>
  );
};
