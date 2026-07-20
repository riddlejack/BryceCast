/** The GB3 years, in depth — the depth layer one tap down inside the GB3
 *  chapter card. Bryce's longest junior chapter (two seasons, 2021 Carlin and
 *  2022 Hitech) told honestly from the source-bounded gb3-deep-dive pack.
 *
 *  Every module is honest to the pack's displayRules: split by source family
 *  where 2021 (TSL PDFs) and 2022 (GB3 JSON) cover different fields; percentile
 *  and a labeled denominator on every stat; grid-to-finish only where 2021
 *  starts exist; conditions labeled 2021-only and never causal; team context is
 *  finishing order only. GB3 holds no lap traces or section timing, so there is
 *  deliberately no pace-trace, stint, or sector module here. */

import { useMemo, useState } from 'react';
import { ChartTipCard, chartFont, focusFade, useMeasuredWidth, type ChartTip } from '../app/charts';
import { SourcePill } from '../app/components';
import { ordinal } from '../app/format';
import { Link, useRouter } from '../app/router';
import { useGb3DeepDive, gb3DeepDiveRef, type Gb3DeepDivePack, type Gb3RaceResult, type Gb3TeamContext, type Gb3EventSummary } from '../data/gb3DeepDive';
import { chapterTint, raceHref } from './careerExplorer';

const GB3_TINT = chapterTint('GB3 Championship');

const roundOf = (eventName: string): number => {
  const match = eventName.match(/Round (\d+)/);
  return match ? Number(match[1]) : 0;
};

/* Chronological order that works across both families: 2021 numbers races
 * per-event, 2022 numbers them per-season, so sort by round then race. */
const chronoKey = <T extends { seasonYear: number; eventName: string; raceNumber: number }>(row: T): number =>
  row.seasonYear * 1_000_000 + roundOf(row.eventName) * 1_000 + row.raceNumber;

const cleanSessionName = (name: string): string => name.replace(/ Result$/, '').trim();
const raceLabel = (row: { seasonYear: number; eventName: string; trackName: string; sessionName: string }): string =>
  `${row.seasonYear} R${roundOf(row.eventName)} · ${row.trackName} · ${cleanSessionName(row.sessionName)}`;

const pctBeaten = (value: number | null): number | null => (value === null ? null : Math.round(value * 100));

/* Quiet, sentence-case source-family badge — one outline chip, never a wall of
 * tinted pills. */
const FamilyBadge = ({ children }: { children: string }) => (
  <span className="chip chip--outline" style={{ fontSize: 11.5 }}>
    {children}
  </span>
);

const SectionHead = ({ title, badge }: { title: string; badge?: string }) => (
  <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
    <h3 className="display" style={{ fontSize: 15, margin: 0 }}>
      {title}
    </h3>
    {badge ? <FamilyBadge>{badge}</FamilyBadge> : null}
  </div>
);

/* ---------- 1 · Within the team: finishing order among his own cars ---------- */

const WithinTeamStrip = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const rows = useMemo(() => [...pack.teamContext].sort((a, b) => chronoKey(a) - chronoKey(b)), [pack]);
  /* Official race status by session, for the two races with no classified
   * result — the status word renders plainly in the tip, nothing more. */
  const statusBySession = useMemo(() => new Map(pack.raceResults.map((row) => [row.sessionId, row.status])), [pack]);
  const teams2021 = rows.find((row) => row.seasonYear === 2021)?.teamName ?? 'Carlin';
  const teams2022 = rows.find((row) => row.seasonYear === 2022)?.teamName ?? 'Hitech';
  /* Short forms keep the on-chart season labels from colliding on phone. */
  const shortTeam = (name: string) => name.split(/[\s-]/)[0];
  const seasonSplit = rows.filter((row) => row.seasonYear === 2021).length;
  const ledCount = rows.filter((row) => row.bryceWithinTeamRank === 1).length;
  const classified = rows.filter((row) => row.bryceWithinTeamRank !== null).length;
  const unclassified = rows.length - classified;

  const height = 104;
  const laneTop = 20;
  const laneGap = 21;
  const laneY = [laneTop, laneTop + laneGap, laneTop + laneGap * 2];
  const missY = laneTop + laneGap * 3 + 4;
  const gutter = 82;
  const plotL = gutter;
  const plotR = width - 12;
  const x = (index: number) => plotL + ((index + 0.5) / rows.length) * (plotR - plotL);
  const divX = plotL + (seasonSplit / rows.length) * (plotR - plotL);

  const rankPhrase = (row: Gb3TeamContext): string => {
    const rank = row.bryceWithinTeamRank;
    if (rank === null) return 'no classified result';
    const pos = row.bryceFinishPosition !== null ? `P${row.bryceFinishPosition} · ` : '';
    if (rank === 1) return `${pos}led the team`;
    return `${pos}${ordinal(rank)} of ${row.teamRaceDriverCount}`;
  };

  const laneLabels = ['Led the team', '2nd in team', '3rd in team'];

  return (
    <div>
      <SectionHead title="Within the team" />
      <p className="gb3-copy">
        Where Bryce placed among his own team’s classified cars, race by race — {teams2021} through 2021, {teams2022} through
        2022. He led the team’s cars home in {ledCount} of {classified} classified races.
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label="Bryce's finishing order within his GB3 team, race by race">
            {/* lane guide lines + left labels */}
            {laneY.map((y, lane) => (
              <g key={lane}>
                <line x1={plotL} x2={plotR} y1={y} y2={y} stroke="var(--grid-hairline)" strokeWidth={1} />
                <text x={gutter - 10} y={y + 3.4} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>
                  {laneLabels[lane]}
                </text>
              </g>
            ))}
            {/* season divider + headers */}
            <line x1={divX} x2={divX} y1={laneTop - 8} y2={missY + 6} stroke="var(--divider)" strokeWidth={1} strokeDasharray="2 3" />
            <text x={(plotL + divX) / 2} y={12} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>
              2021 · {shortTeam(teams2021)}
            </text>
            <text x={(divX + plotR) / 2} y={12} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>
              2022 · {shortTeam(teams2022)}
            </text>
            {unclassified > 0 ? (
              <text x={gutter - 10} y={missY + 3.4} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={10}>
                no result
              </text>
            ) : null}
            {/* per-race marks: the GB3 chapter color marks the races he led the
              * team's cars home; the rest in quiet ink. Brand gold stays reserved
              * for Bryce/the current chapter — GB3 speaks in its own era hue. */}
            {rows.map((row, index) => {
              const cx = x(index);
              if (row.bryceWithinTeamRank === null) {
                /* Official status word, plainly, nothing more. */
                const status = statusBySession.get(row.sessionId);
                const statusWord = status === 'dnf' ? 'retired' : status === 'dsq' ? 'disqualified' : 'no classified result';
                return (
                  <circle
                    key={row.sessionId}
                    cx={cx}
                    cy={missY}
                    r={3.4}
                    fill="var(--surface-0)"
                    stroke="var(--ink-muted)"
                    strokeWidth={1.2}
                    style={{ cursor: 'default' }}
                    onMouseEnter={() => setTip({ x: cx, y: missY - 8, title: raceLabel(row), detail: statusWord })}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              }
              const led = row.bryceWithinTeamRank === 1;
              const cy = laneY[Math.min(row.bryceWithinTeamRank - 1, 2)];
              return (
                <circle
                  key={row.sessionId}
                  cx={cx}
                  cy={cy}
                  r={3.6}
                  fill={led ? 'var(--chapter-gb3)' : 'var(--ink-primary)'}
                  fillOpacity={led || hoveredId === row.sessionId ? 1 : 0.38}
                  style={{ cursor: 'pointer', transition: 'fill-opacity 150ms ease' }}
                  onMouseEnter={() => {
                    setHoveredId(row.sessionId);
                    setTip({ x: cx, y: cy - 8, title: raceLabel(row), detail: rankPhrase(row) });
                  }}
                  onMouseLeave={() => {
                    setHoveredId(null);
                    setTip(null);
                  }}
                  onClick={() => navigate(raceHref(row.sessionId))}
                />
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="gb3-caption">
        Amber = races he led the team’s cars home · result order only — where he placed among his own cars, not a read on
        machinery, setup, or strategy.
        {unclassified > 0 ? ` ${unclassified} of ${rows.length} races have no classified result (shown open).` : ''} Click any
        race to open it.
      </p>
    </div>
  );
};

/* ---------- 2 · Qualifying → race: grid-to-finish, 2021 only ---------- */

const QualifyingToRace = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const races = useMemo(
    () =>
      pack.raceResults
        .filter((row) => row.seasonYear === 2021 && row.startPosition !== null && row.finishPosition !== null)
        .sort((a, b) => chronoKey(a) - chronoKey(b)),
    [pack]
  );
  const gained = races.filter((row) => (row.positionGain ?? 0) > 0).length;
  const bestGain = races.reduce((best, row) => Math.max(best, row.positionGain ?? 0), 0);
  const maxPos = Math.max(8, ...races.flatMap((row) => [row.startPosition ?? 1, row.finishPosition ?? 1])) + 1;

  const height = 268;
  const top = 34;
  const bottom = 18;
  const plotH = height - top - bottom;
  const leftX = 94;
  const rightX = Math.max(width - 94, leftX + 60);
  const y = (position: number) => top + ((position - 1) / (maxPos - 1)) * plotH;
  const gainColor = (row: Gb3RaceResult) => ((row.positionGain ?? 0) > 0 ? 'var(--chapter-gb3)' : 'var(--ink-muted)');

  const tipFor = (row: Gb3RaceResult): ChartTip => {
    const gain = row.positionGain ?? 0;
    const move = gain > 0 ? `+${gain} gained` : gain < 0 ? `${gain} places` : 'held station';
    return {
      x: (leftX + rightX) / 2,
      y: (y(row.startPosition ?? 1) + y(row.finishPosition ?? 1)) / 2 - 6,
      title: raceLabel(row),
      detail: `P${row.startPosition} → P${row.finishPosition} · ${move}`,
      action: 'Open the race'
    };
  };

  return (
    <div>
      <SectionHead title="Qualifying to race" badge="2021 · TSL PDFs" />
      <p className="gb3-copy">
        In 2021, Bryce made up ground off the line in <strong>{gained}</strong> of his <strong>{races.length}</strong> starts —
        a best of <strong>{bestGain}</strong> places gained in a single race.
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label="Bryce's grid position to finish position, every 2021 GB3 race"
          >
            <text x={leftX} y={16} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11} fontWeight={600}>
              Grid
            </text>
            <text x={rightX} y={16} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11} fontWeight={600}>
              Finish
            </text>
            <text x={leftX} y={y(1) - 8} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
              P1
            </text>
            {/* column rails */}
            <line x1={leftX} x2={leftX} y1={top} y2={top + plotH} stroke="var(--grid-hairline)" strokeWidth={1} />
            <line x1={rightX} x2={rightX} y1={top} y2={top + plotH} stroke="var(--grid-hairline)" strokeWidth={1} />
            {/* slope lines */}
            {races.map((row, index) => {
              const focused = hovered === null || hovered === index;
              const color = gainColor(row);
              const y1 = y(row.startPosition ?? 1);
              const y2 = y(row.finishPosition ?? 1);
              return (
                <g key={row.sessionId} style={{ opacity: focused ? 1 : focusFade, transition: 'opacity 150ms ease' }}>
                  <line x1={leftX} y1={y1} x2={rightX} y2={y2} stroke={color} strokeWidth={hovered === index ? 2.4 : 1.6} />
                  <circle cx={leftX} cy={y1} r={3} fill={color} />
                  <circle cx={rightX} cy={y2} r={3} fill={color} />
                  {/* transparent hit band along the line */}
                  <line
                    x1={leftX}
                    y1={y1}
                    x2={rightX}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={14}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={() => {
                      setHovered(index);
                      setTip(tipFor(row));
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                      setTip(null);
                    }}
                    onClick={() => navigate(raceHref(row.sessionId))}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="gb3-caption">
        Each line is one race, grid to flag · amber marks a race he gained ground · P1 sits at the top. Grid data is unavailable
        for 2022’s official feed, so 2022 starts aren’t shown. Click a line to open the race.
      </p>
    </div>
  );
};

/* ---------- 3 · The venues: six circuits, two seasons ---------- */

const VenueRows = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const venues = useMemo(() => [...pack.trackProfile].sort((a, b) => b.avgFinishPercentile - a.avgFinishPercentile), [pack]);

  /* Best classified race per venue → the light race sheet it opens. */
  const bestRaceByVenue = useMemo(() => {
    const map = new Map<string, Gb3RaceResult>();
    for (const row of pack.raceResults) {
      if (row.finishPosition === null) continue;
      const held = map.get(row.trackName);
      if (
        !held ||
        row.finishPosition < (held.finishPosition ?? Infinity) ||
        (row.finishPosition === held.finishPosition && chronoKey(row) > chronoKey(held))
      ) {
        map.set(row.trackName, row);
      }
    }
    return map;
  }, [pack]);

  /* Content-sized stat columns so the venue name never collapses on phone. */
  const venueGrid = 'minmax(0,1fr) auto auto auto 14px';

  return (
    <div>
      <SectionHead title="The venues" />
      <p className="gb3-copy">
        Six circuits across the two seasons, strongest first by the share of the field he beat. Best finish and race count sit
        beside each — small samples, so percentile carries the comparison.
      </p>
      <div className="tower gb3-venues">
        <div className="tower__row gb3-venues__head" style={{ gridTemplateColumns: venueGrid }}>
          <span className="caption">Venue</span>
          <span className="caption" style={{ textAlign: 'right' }}>Races</span>
          <span className="caption" style={{ textAlign: 'right' }}>Best</span>
          <span className="caption" style={{ textAlign: 'right' }}>Field beat</span>
          <span />
        </div>
        {venues.map((venue) => {
          const best = bestRaceByVenue.get(venue.trackName);
          const beat = pctBeaten(venue.avgFinishPercentile);
          const inner = (
            <>
              <span className="tower__name" style={{ whiteSpace: 'normal' }}>
                <span
                  aria-hidden
                  style={{ width: 7, height: 7, borderRadius: '50%', background: GB3_TINT, opacity: 0.6, flex: 'none' }}
                />
                {venue.trackName}
              </span>
              <span className="tower__gap">{venue.raceRows}</span>
              <span className="tower__gap">P{venue.bestFinish}</span>
              <span className="tower__gap">{beat === null ? '—' : `${beat}%`}</span>
              <span className="gb3-venues__chev" aria-hidden>
                {best ? '›' : ''}
              </span>
            </>
          );
          return best ? (
            <Link
              key={venue.trackName}
              to={raceHref(best.sessionId)}
              className="tower__row gb3-venues__link"
              style={{ gridTemplateColumns: venueGrid }}
            >
              {inner}
            </Link>
          ) : (
            <div
              key={venue.trackName}
              className="tower__row"
              style={{ gridTemplateColumns: venueGrid }}
            >
              {inner}
            </div>
          );
        })}
      </div>
      <p className="gb3-caption">
        Field beat = the average share of the grid finished ahead of, across each venue’s races. Cross-venue comparison mixes
        2021 and 2022 fields, so read it as texture. Click a venue to open its best race.
      </p>
    </div>
  );
};

/* ---------- 4 · 2021 conditions: official session weather ---------- */

const ConditionsBar = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const counts = useMemo(() => {
    const acc = { dry: 0, damp: 0, wet: 0 };
    for (const row of pack.weatherContext) {
      if (row.wetDry === 'dry') acc.dry += 1;
      else if (row.wetDry === 'damp') acc.damp += 1;
      else acc.wet += 1;
    }
    return acc;
  }, [pack]);
  const total = counts.dry + counts.damp + counts.wet;
  if (total === 0) return null;

  /* Sequential ink ramp: light → dark = drier → wetter. One hue, keyed. */
  const segments = [
    { key: 'dry', label: 'dry', value: counts.dry, fill: 'rgba(29,29,31,0.20)' },
    { key: 'damp', label: 'damp', value: counts.damp, fill: 'rgba(29,29,31,0.48)' },
    { key: 'wet', label: 'wet', value: counts.wet, fill: 'rgba(29,29,31,0.82)' }
  ].filter((segment) => segment.value > 0);

  return (
    <div>
      <SectionHead title="2021 conditions" badge="2021 · TSL PDFs" />
      <p className="gb3-copy">
        Across {total} officially logged 2021 sessions — practice, qualifying and races — the track ran dry far more often than
        not.
      </p>
      <div className="gb3-conditions" role="img" aria-label={`${counts.dry} dry, ${counts.damp} damp, ${counts.wet} wet 2021 sessions`}>
        {segments.map((segment) => (
          <div key={segment.key} className="gb3-conditions__seg" style={{ flexGrow: segment.value, background: segment.fill }} title={`${segment.value} ${segment.label}`} />
        ))}
      </div>
      <div className="row row--wrap" style={{ gap: 14, marginTop: 8 }}>
        {segments.map((segment) => (
          <span key={segment.key} className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--ink-secondary)' }}>
            <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: segment.fill, flex: 'none' }} />
            {segment.value} {segment.label}
          </span>
        ))}
      </div>
      <p className="gb3-caption">
        Lighter to darker reads drier to wetter. Official TSL session labels — context only, never the cause of a result. 2022’s
        feed carries no conditions.
      </p>
    </div>
  );
};

/* ---------- 0 · The season arc: qualifying and best finish, round by round ---------- */

/* Both campaigns read left to right, split by the season divider so the two
 * source families never blend. Each round shows where he qualified (open mark)
 * and his best race result (filled mark); the filled marks connect into the
 * season's finishing arc. Qualifying is official grid slot for 2021 and the
 * qualifying-session order for 2022, with the gap to pole in the tip. */
const SeasonArc = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const events = useMemo(
    () => [...pack.eventSummary].sort((a, b) => a.seasonYear * 100 + roundOf(a.eventName) - (b.seasonYear * 100 + roundOf(b.eventName))),
    [pack]
  );
  const rows2021 = useMemo(() => events.filter((row) => row.seasonYear === 2021), [events]);
  const rows2022 = useMemo(() => events.filter((row) => row.seasonYear === 2022), [events]);

  /* Primary qualifying gap-to-pole per event (the first "Qualifying" segment),
     for the tip only — never a headline number. */
  const gapByEvent = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of pack.qualifyingContext) {
      if (row.gapToPole === null) continue;
      const isPrimary = /(^|[^d])qualifying$/i.test(row.sessionSegment.trim()) || !map.has(row.eventName);
      if (isPrimary || !map.has(row.eventName)) map.set(row.eventName, row.gapToPole);
    }
    return map;
  }, [pack]);

  /* Best classified race per event → the light race sheet each round opens. */
  const bestRaceByEvent = useMemo(() => {
    const map = new Map<string, Gb3RaceResult>();
    for (const row of pack.raceResults) {
      if (row.finishPosition === null) continue;
      const held = map.get(row.eventName);
      if (!held || row.finishPosition < (held.finishPosition ?? Infinity)) map.set(row.eventName, row);
    }
    return map;
  }, [pack]);

  const wins = events.filter((row) => row.bestFinish === 1).length;
  const podiumRounds = events.filter((row) => (row.bestFinish ?? 99) <= 3).length;

  const maxPos =
    Math.max(
      14,
      ...events.flatMap((row) => [row.bestFinish ?? 1, row.bestQualifyingPosition ?? 1])
    ) + 1;

  const top = 36;
  const bottom = 26;
  const gutter = 34;
  const plotL = gutter;
  const plotR = Math.max(width - 12, plotL + 80);
  const laneGap = 26; // gap around the season divider (wide layout only)
  const divX = plotL + ((rows2021.length) / events.length) * (plotR - plotL);

  // ≥8px-diameter marks everywhere (r≥4) so the qualifying open mark is not a
  // 6px speck; podium finishes get a touch more.
  const MARK_R = 4;
  const PODIUM_R = 4.8;

  // On a phone the two seasons cannot share one 15-round plot without their 24px
  // hit targets overlapping, so they stack as small multiples — each season gets
  // the full width, spreading its 7–8 rounds to ≥40px apart. Wide screens keep
  // the side-by-side bands split by the season divider.
  const phone = width > 0 && width < 560;
  const deskHeight = 236;
  const deskPlotH = deskHeight - top - bottom;
  const phoneHeaderH = 20;
  const phonePanelH = 148;
  const phoneLabelH = 18;
  const phoneBlock = phoneHeaderH + phonePanelH + phoneLabelH;
  const phoneBlockGap = 26;
  const phoneTopPad = 8;
  const height = phone ? phoneTopPad + phoneBlock * 2 + phoneBlockGap + bottom : deskHeight;

  interface SeasonPanel {
    rows: Gb3EventSummary[];
    season: string;
    xL: number;
    xR: number;
    yTop: number;
    panelH: number;
    headerAnchor: 'start' | 'middle';
    headerY: number;
    labelY: number;
  }

  const phonePanelTop = (blockIndex: number) => phoneTopPad + blockIndex * (phoneBlock + phoneBlockGap);
  const panels: SeasonPanel[] = phone
    ? [
        { rows: rows2021, season: '2021 · Carlin', xL: plotL, xR: plotR, yTop: phonePanelTop(0) + phoneHeaderH, panelH: phonePanelH, headerAnchor: 'start', headerY: phonePanelTop(0) + 13, labelY: phonePanelTop(0) + phoneHeaderH + phonePanelH + 13 },
        { rows: rows2022, season: '2022 · Hitech', xL: plotL, xR: plotR, yTop: phonePanelTop(1) + phoneHeaderH, panelH: phonePanelH, headerAnchor: 'start', headerY: phonePanelTop(1) + 13, labelY: phonePanelTop(1) + phoneHeaderH + phonePanelH + 13 }
      ]
    : [
        { rows: rows2021, season: '2021 · Carlin', xL: plotL, xR: divX - laneGap / 2, yTop: top, panelH: deskPlotH, headerAnchor: 'middle', headerY: 16, labelY: deskHeight - 8 },
        { rows: rows2022, season: '2022 · Hitech', xL: divX + laneGap / 2, xR: plotR, yTop: top, panelH: deskPlotH, headerAnchor: 'middle', headerY: 16, labelY: deskHeight - 8 }
      ];

  const yOf = (panel: SeasonPanel, pos: number) => panel.yTop + ((pos - 1) / (maxPos - 1)) * panel.panelH;
  const xOf = (panel: SeasonPanel, index: number, count: number) => panel.xL + ((index + 0.5) / count) * (panel.xR - panel.xL);

  const yTicks = [1, 5, 10, maxPos - 1 > 14 ? 20 : 14].filter((tick, i, arr) => arr.indexOf(tick) === i && tick < maxPos);

  const podium = (row: Gb3EventSummary) => (row.bestFinish ?? 99) <= 3;

  const renderPanel = (panel: SeasonPanel) => {
    const count = panel.rows.length;
    const finishPts = panel.rows
      .filter((row) => row.bestFinish !== null)
      .map((row) => `${xOf(panel, panel.rows.indexOf(row), count).toFixed(1)},${yOf(panel, row.bestFinish as number).toFixed(1)}`)
      .join(' ');
    return (
      <g key={panel.season}>
        <text x={panel.headerAnchor === 'middle' ? (panel.xL + panel.xR) / 2 : panel.xL} y={panel.headerY} textAnchor={panel.headerAnchor} fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={10.5}>
          {panel.season}
        </text>
        <polyline points={finishPts} fill="none" stroke="var(--chapter-gb3)" strokeWidth={1.6} strokeOpacity={0.55} strokeLinejoin="round" />
        {panel.rows.map((row, index) => {
          const key = `${row.seasonYear}-${roundOf(row.eventName)}`;
          const cx = xOf(panel, index, count);
          const qy = row.bestQualifyingPosition !== null ? yOf(panel, row.bestQualifyingPosition) : null;
          const fy = row.bestFinish !== null ? yOf(panel, row.bestFinish) : null;
          const focused = hoveredKey === null || hoveredKey === key;
          const race = bestRaceByEvent.get(row.eventName);
          const gap = gapByEvent.get(row.eventName);
          const showTip = () => {
            const q = row.bestQualifyingPosition !== null ? `qualified P${row.bestQualifyingPosition}${gap ? ` · ${gap}s off pole` : ''}` : 'qualifying unavailable';
            const f = row.bestFinish !== null ? `best finish P${row.bestFinish}` : 'no classified finish';
            setHoveredKey(key);
            setTip({
              x: cx,
              y: (fy ?? qy ?? panel.yTop) - 8,
              title: `${row.seasonYear} R${roundOf(row.eventName)} · ${row.trackName}`,
              detail: `${q} · ${f} · ${row.raceRows} ${row.raceRows === 1 ? 'race' : 'races'}`,
              action: race ? 'Open the round’s best race' : undefined
            });
          };
          const clear = () => {
            setHoveredKey(null);
            setTip(null);
          };
          return (
            <g key={key} style={{ opacity: focused ? 1 : focusFade, transition: 'opacity 150ms ease' }}>
              {/* quali→finish connector for the round */}
              {qy !== null && fy !== null ? (
                <line x1={cx} y1={qy} x2={cx} y2={fy} stroke="var(--ink-muted)" strokeWidth={1} strokeOpacity={0.4} />
              ) : null}
              {/* qualifying: open mark (≥8px) */}
              {qy !== null ? (
                <circle cx={cx} cy={qy} r={MARK_R} fill="var(--surface-0)" stroke="var(--ink-muted)" strokeWidth={1.4} />
              ) : null}
              {/* best finish: filled mark, chapter tint for a podium round */}
              {fy !== null ? (
                <circle cx={cx} cy={fy} r={podium(row) ? PODIUM_R : MARK_R} fill={podium(row) ? 'var(--chapter-gb3)' : 'var(--ink-primary)'} />
              ) : null}
              {/* generous hit target — ≥24px wide and non-overlapping within a panel */}
              <rect
                x={cx - 12}
                y={panel.yTop - 6}
                width={24}
                height={panel.panelH + 12}
                fill="transparent"
                style={{ cursor: race ? 'pointer' : 'default' }}
                onMouseEnter={showTip}
                onMouseLeave={clear}
                onClick={() => race && navigate(raceHref(race.sessionId))}
              />
              {/* round label */}
              <text x={cx} y={panel.labelY} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
                R{roundOf(row.eventName)}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div>
      <SectionHead title="The season, round by round" />
      <p className="gb3-copy">
        Two campaigns end to end — where he qualified and the best he took from each round. Across the two seasons he reached the
        podium in <strong>{podiumRounds}</strong> of <strong>{events.length}</strong> rounds, with his first GB3 win coming at
        Donington in 2022{wins > 1 ? ` (one of ${wins})` : ''}.
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label="Bryce's qualifying and best finish for every GB3 round, 2021 and 2022, stacked by season on phones">
            {/* y grid + P-labels: once across the shared band on wide screens,
                per stacked panel on phones */}
            {(phone ? panels : [panels[0]]).map((panel) =>
              yTicks.map((tick) => (
                <g key={`grid-${panel.season}-${tick}`}>
                  <line x1={panel.xL} x2={phone ? panel.xR : plotR} y1={yOf(panel, tick)} y2={yOf(panel, tick)} stroke="var(--grid-hairline)" strokeWidth={1} />
                  <text x={gutter - 8} y={yOf(panel, tick) + 3.2} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
                    P{tick}
                  </text>
                </g>
              ))
            )}
            {/* season divider only when the seasons sit side by side */}
            {!phone ? (
              <>
                <line x1={divX} x2={divX} y1={top - 10} y2={height - bottom + 8} stroke="var(--divider)" strokeWidth={1} strokeDasharray="2 3" />
                <text x={plotL} y={28} textAnchor="start" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
                  P1 at the top
                </text>
              </>
            ) : null}
            {panels.map(renderPanel)}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="gb3-caption">
        Open marks = qualifying, filled = the round’s best finish; the amber line follows his best finish through each season, and
        amber dots mark podium rounds. 2021 qualifying is official TSL grid; 2022 reads the qualifying-session order (no dedicated
        grid feed), so the two seasons stay side by side, never merged. Click a round to open its best race.
      </p>
    </div>
  );
};

/* ---------- source honesty ---------- */

const Gb3SourcePill = ({ pack }: { pack: Gb3DeepDivePack }) => {
  const r2021 = pack.sourceFamilyReadiness.find((row) => row.seasonYear === 2021);
  const r2022 = pack.sourceFamilyReadiness.find((row) => row.seasonYear === 2022);
  return (
    <SourcePill
      title="The GB3 years, in depth"
      entries={[
        {
          label: 'GB3 deep-dive context pack',
          path: gb3DeepDiveRef()?.path,
          note: 'Source-bounded GB3 result conversion, team finishing order, venue profiles, 2021 grids, and 2021 conditions. Integrity-verified (sha256) against the package source inventory at load.'
        },
        {
          label: '2021 · TSL official PDFs',
          note: `${r2021?.events ?? 7} events, ${r2021?.bryceRaceRows ?? 20} Bryce races — official classifications, grids, and session conditions.`
        },
        {
          label: '2022 · GB3 official JSON',
          note: `${r2022?.events ?? 8} events, ${r2022?.bryceRaceRows ?? 24} Bryce races — official classifications and pit counts; no grids or conditions.`
        }
      ]}
      caveats={[
        'The two seasons come from different sources that cover different fields, so detail stays split by season.',
        'Every finish travels with the share of the field it beat and its race count — fields ran 16 to 23 cars.',
        'Grid positions are official for 2021 only; 2022 carries no race starts, so start-to-finish is 2021-only.',
        'Qualifying is the official TSL grid for 2021 and the qualifying-session result order for 2022 (the JSON feed has no dedicated qualifying table); the season arc keeps them side by side, never merged.',
        'Condition strings are official 2021 session labels — context, never a cause of a result.',
        'Team context is finishing order within Bryce’s own cars, not a read on machinery, setup, or strategy.',
        'GB3’s records hold no lap traces or section timing, so there are no pace-trace charts here.'
      ]}
    />
  );
};

/* ---------- the depth layer ---------- */

export const Gb3DepthLayer = () => {
  const pack = useGb3DeepDive();
  if (pack === 'failed') {
    /* Fail closed: a pack that does not match its registered hash renders
       nothing but this honest line — never unverified numbers. */
    return (
      <p className="gb3-caption" style={{ margin: 0 }}>
        The GB3 records failed their integrity check against the source inventory, so they are not shown.
      </p>
    );
  }
  if (!pack) {
    return <p className="gb3-caption" style={{ margin: 0 }}>Opening the GB3 records…</p>;
  }
  return (
    <div className="gb3-depth stack">
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <p className="gb3-copy" style={{ margin: 0, maxWidth: '60ch' }}>
          Two seasons in British GB3, against deep international fields — the longest chapter of the climb, and its first real
          proving ground. Here is what the official records hold.
        </p>
        <Gb3SourcePill pack={pack} />
      </div>
      <SeasonArc pack={pack} />
      <WithinTeamStrip pack={pack} />
      <QualifyingToRace pack={pack} />
      <VenueRows pack={pack} />
      <ConditionsBar pack={pack} />
    </div>
  );
};
