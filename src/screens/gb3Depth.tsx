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
import { useGb3DeepDive, GB3_PACK_PATH, type Gb3DeepDivePack, type Gb3RaceResult, type Gb3TeamContext } from '../data/gb3DeepDive';
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

  const rows = useMemo(() => [...pack.teamContext].sort((a, b) => chronoKey(a) - chronoKey(b)), [pack]);
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
        2022. He finished ahead of every teammate in {ledCount} {ledCount === 1 ? 'race' : 'races'}.
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
            {/* per-race marks */}
            {rows.map((row, index) => {
              const cx = x(index);
              if (row.bryceWithinTeamRank === null) {
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
                    onMouseEnter={() => setTip({ x: cx, y: missY - 8, title: raceLabel(row), detail: 'no classified result' })}
                    onMouseLeave={() => setTip(null)}
                  />
                );
              }
              const cy = laneY[Math.min(row.bryceWithinTeamRank - 1, 2)];
              return (
                <circle
                  key={row.sessionId}
                  cx={cx}
                  cy={cy}
                  r={3.6}
                  fill="var(--bryce)"
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setTip({ x: cx, y: cy - 8, title: raceLabel(row), detail: rankPhrase(row) })}
                  onMouseLeave={() => setTip(null)}
                  onClick={() => navigate(raceHref(row.sessionId))}
                />
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="gb3-caption">
        Gold marks Bryce · result order only — where he placed among his own cars, not a read on machinery, setup, or strategy.
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
  const gainColor = (row: Gb3RaceResult) => ((row.positionGain ?? 0) > 0 ? 'var(--bryce)' : 'var(--ink-muted)');

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
        Each line is one race, grid to flag · gold marks a race he gained ground · P1 sits at the top. Grid data is unavailable
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
          path: GB3_PACK_PATH,
          note: 'Source-bounded GB3 result conversion, team finishing order, venue profiles, 2021 grids, and 2021 conditions.'
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
        'Grid positions are official for 2021 only; 2022 carries no starts, so start-to-finish is 2021-only.',
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
      <WithinTeamStrip pack={pack} />
      <QualifyingToRace pack={pack} />
      <VenueRows pack={pack} />
      <ConditionsBar pack={pack} />
    </div>
  );
};
