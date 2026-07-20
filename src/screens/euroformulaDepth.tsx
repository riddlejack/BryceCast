/** Euroformula Open 2023, in depth — one tap down inside the chapter card.
 *
 *  Two honest modules, both from the production-safe UI package (not the
 *  dimension pack, whose Euro qualifying→race join is ambiguous across the
 *  three-race weekends):
 *   1. Qualifying → race, on the grid-confirmed races only. Euro weekends mixed
 *      qualifying-set and reverse grids, so the conversion is shown ONLY where a
 *      qualifying session set the grid (labeled on screen), read Bryce-first.
 *   2. The venues — a per-circuit profile across the European campaign.
 *
 *  No lap, sector, weather, or team-pace claims: Euro's records hold none. */

import { useMemo, useState } from 'react';
import { ChartTipCard, chartFont, focusFade, useMeasuredWidth, type ChartTip } from '../app/charts';
import { SourcePill } from '../app/components';
import { asNumber, ordinal } from '../app/format';
import { useRouter } from '../app/router';
import { Link } from '../app/router';
import { uiDataPackage } from '../data/uiDataPackage';
import { chapterTint, raceHref } from './careerExplorer';

const EURO_SERIES = 'Euroformula Open';
const EURO_TINT = chapterTint(EURO_SERIES);

interface EuroRace {
  sessionId: string;
  eventName: string;
  raceLabel: string;
  trackName: string;
  start: number | null;
  finish: number | null;
  gain: number | null;
  percentile: number | null;
}

const roundOf = (eventName: string): number => {
  const match = eventName.match(/Round (\d+)/);
  return match ? Number(match[1]) : 0;
};

const useEuroRaces = (): EuroRace[] =>
  useMemo(() => {
    const rows = uiDataPackage.screens.careerLab.resultConversion ?? [];
    return rows
      .filter((row) => String(row.seriesName ?? '') === EURO_SERIES)
      .map((row) => ({
        sessionId: String(row.sessionId ?? ''),
        eventName: String(row.eventName ?? ''),
        raceLabel: String(row.raceLabel ?? ''),
        trackName: String(row.trackName ?? ''),
        start: asNumber(row.startPosition),
        finish: asNumber(row.finishPosition),
        gain: asNumber(row.positionGain),
        percentile: asNumber(row.finishPercentile)
      }));
  }, []);

/* ---------- 1 · Qualifying → race (grid-confirmed races only) ---------- */

const QualiToRace = () => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<ChartTip | null>(null);

  const layer = uiDataPackage.screens.careerLab.qualifyingLayer;
  const euroSummary = useMemo(() => (layer.bySeries ?? []).find((row) => row.seriesName === EURO_SERIES) ?? null, [layer]);
  const races = useMemo(
    () =>
      (layer.conversionSample ?? [])
        .filter((row) => row.seriesName === EURO_SERIES && row.qualiRank !== null && row.finish !== null)
        .sort((a, b) => roundOf(a.eventName) - roundOf(b.eventName)),
    [layer]
  );
  if (!euroSummary || races.length === 0) return null;

  const maxPos = Math.max(8, ...races.flatMap((row) => [row.qualiRank ?? 1, row.finish ?? 1])) + 1;
  const height = 244;
  const top = 34;
  const bottom = 18;
  const plotH = height - top - bottom;
  const leftX = 92;
  const rightX = Math.max(width - 92, leftX + 60);
  const y = (position: number) => top + ((position - 1) / (maxPos - 1)) * plotH;
  const color = (outcome: string) => (outcome === 'ahead' ? 'var(--chapter-euro)' : outcome === 'behind' ? 'var(--ink-muted)' : 'var(--ink-primary)');

  return (
    <div>
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
        <h3 className="display" style={{ fontSize: 15, margin: 0 }}>
          Qualifying to race
        </h3>
        <span className="chip chip--outline" style={{ fontSize: 11.5 }}>
          grid-set by qualifying
        </span>
      </div>
      <p className="euro-copy">
        On the {races.length} races where a qualifying session set the grid, Bryce finished ahead of his slot in{' '}
        <strong>{euroSummary.finishedAhead}</strong>, held it in <strong>{euroSummary.held}</strong>. His sharpest Euro
        qualifying was <strong>P{euroSummary.bestQualiRank}</strong>, from an average of about P{Math.round(euroSummary.avgQualiRank ?? 0)}.
      </p>
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-label="Bryce's qualifying position to finish, every grid-set Euroformula race">
            <text x={leftX} y={16} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11} fontWeight={600}>
              Qualified
            </text>
            <text x={rightX} y={16} textAnchor="middle" fill="var(--ink-secondary)" fontFamily={chartFont} fontSize={11} fontWeight={600}>
              Finish
            </text>
            <text x={leftX} y={y(1) - 8} textAnchor="middle" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
              P1
            </text>
            <line x1={leftX} x2={leftX} y1={top} y2={top + plotH} stroke="var(--grid-hairline)" strokeWidth={1} />
            <line x1={rightX} x2={rightX} y1={top} y2={top + plotH} stroke="var(--grid-hairline)" strokeWidth={1} />
            {races.map((row, index) => {
              const focused = hovered === null || hovered === index;
              const stroke = color(row.conversionOutcome);
              const y1 = y(row.qualiRank ?? 1);
              const y2 = y(row.finish ?? 1);
              return (
                <g key={row.raceSessionId} style={{ opacity: focused ? 1 : focusFade, transition: 'opacity 150ms ease' }}>
                  <line x1={leftX} y1={y1} x2={rightX} y2={y2} stroke={stroke} strokeWidth={hovered === index ? 2.4 : 1.6} />
                  <circle cx={leftX} cy={y1} r={3} fill={stroke} />
                  <circle cx={rightX} cy={y2} r={3} fill={stroke} />
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
                      const outcome = row.conversionOutcome === 'ahead' ? 'gained on his grid' : row.conversionOutcome === 'behind' ? 'lost ground' : 'held station';
                      setTip({
                        x: (leftX + rightX) / 2,
                        y: (y1 + y2) / 2 - 6,
                        title: `${row.eventName.replace('Euroformula Open ', '')} · ${row.raceLabel}`,
                        detail: `qualified P${row.qualiRank} → finished P${row.finish} · ${outcome}`,
                        action: 'Open the race'
                      });
                    }}
                    onMouseLeave={() => {
                      setHovered(null);
                      setTip(null);
                    }}
                    onClick={() => navigate(raceHref(row.raceSessionId))}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <ChartTipCard tip={tip} width={width} /> : null}
      </div>
      <p className="euro-caption">
        Each line is one race, qualifying slot to flag · a Euro-magenta line marks a race he gained on his grid · P1 at the top.
        Only the {races.length} of 17 races whose grid a qualifying session set are shown — Euro’s three-race weekends also use
        reverse and second grids, which aren’t a read on qualifying. Click a line to open the race.
      </p>
    </div>
  );
};

/* ---------- 2 · The venues ---------- */

const EuroVenues = ({ races }: { races: EuroRace[] }) => {
  const venues = useMemo(() => {
    const map = new Map<string, { trackName: string; races: number; bestFinish: number; pctileSum: number; pctileCount: number; best: EuroRace | null }>();
    for (const race of races) {
      const entry = map.get(race.trackName) ?? { trackName: race.trackName, races: 0, bestFinish: Infinity, pctileSum: 0, pctileCount: 0, best: null };
      entry.races += 1;
      if (race.finish !== null && race.finish < entry.bestFinish) {
        entry.bestFinish = race.finish;
        entry.best = race;
      } else if (race.finish !== null && race.finish === entry.bestFinish && entry.best && roundOf(race.eventName) > roundOf(entry.best.eventName)) {
        entry.best = race;
      }
      if (race.percentile !== null) {
        entry.pctileSum += race.percentile;
        entry.pctileCount += 1;
      }
      map.set(race.trackName, entry);
    }
    return [...map.values()]
      .map((entry) => ({
        trackName: entry.trackName,
        races: entry.races,
        bestFinish: Number.isFinite(entry.bestFinish) ? entry.bestFinish : null,
        avgBeaten: entry.pctileCount > 0 ? Math.round((entry.pctileSum / entry.pctileCount) * 100) : null,
        best: entry.best
      }))
      .sort((a, b) => (b.avgBeaten ?? -1) - (a.avgBeaten ?? -1));
  }, [races]);

  const venueGrid = 'minmax(0,1fr) auto auto auto 14px';

  return (
    <div>
      <h3 className="display" style={{ fontSize: 15, margin: '0 0 2px' }}>
        The venues
      </h3>
      <p className="euro-copy">
        Six circuits across the 2023 European campaign, strongest first by the share of the field he beat.
      </p>
      <div className="tower euro-venues">
        <div className="tower__row euro-venues__head" style={{ gridTemplateColumns: venueGrid }}>
          <span className="caption">Venue</span>
          <span className="caption" style={{ textAlign: 'right' }}>Races</span>
          <span className="caption" style={{ textAlign: 'right' }}>Best</span>
          <span className="caption" style={{ textAlign: 'right' }}>Field beat</span>
          <span />
        </div>
        {venues.map((venue) => {
          const inner = (
            <>
              <span className="tower__name" style={{ whiteSpace: 'normal' }}>
                <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: EURO_TINT, opacity: 0.6, flex: 'none' }} />
                {venue.trackName}
              </span>
              <span className="tower__gap">{venue.races}</span>
              <span className="tower__gap">{venue.bestFinish !== null ? `P${venue.bestFinish}` : '—'}</span>
              <span className="tower__gap">{venue.avgBeaten === null ? '—' : `${venue.avgBeaten}%`}</span>
              <span className="euro-venues__chev" aria-hidden>{venue.best ? '›' : ''}</span>
            </>
          );
          return venue.best ? (
            <Link key={venue.trackName} to={raceHref(venue.best.sessionId)} className="tower__row euro-venues__link" style={{ gridTemplateColumns: venueGrid }}>
              {inner}
            </Link>
          ) : (
            <div key={venue.trackName} className="tower__row" style={{ gridTemplateColumns: venueGrid }}>
              {inner}
            </div>
          );
        })}
      </div>
      <p className="euro-caption">
        Field beat = the average share of the grid he finished ahead of, across each venue’s races. Small samples, so read it as
        texture. Click a venue to open his best race there.
      </p>
    </div>
  );
};

const EuroSourcePill = ({ conversionRaces }: { conversionRaces: number }) => (
  <SourcePill
    title="Euroformula Open 2023, in depth"
    entries={[
      {
        label: 'Career qualifying layer',
        path: 'analysis/qualifying-layer/output/summary.json',
        note: `${conversionRaces} grid-confirmed Euro conversion races (a qualifying session set the grid); reverse and second grids are excluded from the conversion.`
      },
      {
        label: 'Career result conversion',
        path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
        note: 'Official Euroformula Open classifications — 17 classified races, grids, and finishes across six venues (the Barcelona finale ran without him).'
      }
    ]}
    caveats={[
      'Qualifying→race is shown only where a qualifying session set the grid; Euro’s three-race weekends also run reverse and second grids, which aren’t a read on qualifying.',
      'Records read Bryce-first (ahead of his grid, or held it), never a bare “ahead”.',
      'Cross-venue field-beaten mixes different fields (races ran 8 to 10 cars), so read the venue table as texture.',
      'Euro’s records hold no lap traces, sectors, weather, or team-pace context, so there are no pace charts here.'
    ]}
  />
);

export const EuroformulaDepthLayer = () => {
  const races = useEuroRaces();
  const layer = uiDataPackage.screens.careerLab.qualifyingLayer;
  const euroSummary = (layer.bySeries ?? []).find((row) => row.seriesName === EURO_SERIES) ?? null;
  if (races.length === 0) {
    return <p className="euro-caption" style={{ margin: 0 }}>The Euroformula records are unavailable.</p>;
  }
  return (
    <div className="euro-depth stack">
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <p className="euro-copy" style={{ margin: 0, maxWidth: '58ch' }}>
          A full European campaign in continental single-seaters — front-running pace across six circuits. Here is how his
          weekends converted, and where he was strongest.
        </p>
        <EuroSourcePill conversionRaces={euroSummary?.conversionRaces ?? 7} />
      </div>
      <QualiToRace />
      <EuroVenues races={races} />
    </div>
  );
};
