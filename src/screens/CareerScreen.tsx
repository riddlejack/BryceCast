import { Card, Reveal, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import { uiDataPackage } from '../data/uiDataPackage';
import {
  BestClimbs,
  CareerBests,
  CareerExplorer,
  ChapterStrip,
  DaytonaChapterBody,
  DaytonaSourcePill,
  RainDays,
  RivalsCard,
  TheClimb
} from './careerExplorer';

type Row = Record<string, string | number | null>;

/* Career chapters in journey order — the climb from F1600 to INDY NXT.
 * Narrative lines are descriptive context only; every number beside them
 * comes from the source-backed series summary. */
const seriesChapters: Array<{ name: string; years: string; short?: string; narrative: string }> = [
  {
    name: 'F1600 Championship Series',
    years: '2019',
    short: 'F1600',
    narrative: 'Where the climb started — his first season racing cars, in American grassroots open-wheel.'
  },
  {
    name: 'Formula Ford',
    years: '2020',
    narrative: 'A year in the UK’s classic school of racecraft — Festival and Walter Hayes country.'
  },
  {
    name: 'GB3 Championship',
    years: '2021–22',
    short: 'GB3',
    narrative: 'Two seasons of British junior formula racing against deep international fields.'
  },
  {
    name: 'Euroformula Open',
    years: '2023',
    narrative: 'Continental single-seaters — front-running pace across a full European campaign.'
  },
  {
    name: 'Castrol Toyota Formula Regional Oceania Championship',
    years: '2024',
    short: 'FR Oceania',
    narrative: 'A southern-hemisphere summer in the Toyota series that feeds the global junior ladder.'
  },
  {
    name: 'IMSA WeatherTech SportsCar Championship',
    years: '2025 · Daytona 24',
    short: 'IMSA',
    narrative:
      'One race, twenty-four hours: the Rolex 24 at Daytona in a GTP prototype — endurance racing’s deep end, shared with three co-drivers through the night.'
  },
  {
    name: 'INDY NXT',
    years: '2024–26 · current',
    narrative: 'The road to INDYCAR — the current chapter, one step from the top.'
  }
];

const ChapterCard = ({
  chapter,
  row,
  current,
  extra
}: {
  chapter: (typeof seriesChapters)[number];
  row: Row | undefined;
  current: boolean;
  extra?: string | null;
}) => {
  const races = row ? asNumber(row.raceRows) : null;
  const oneRace = chapter.short === 'IMSA';
  return (
    <div className={`journey__chapter${current ? ' journey__chapter--current' : ''}`}>
      <Card className={current ? undefined : 'panel--quiet'}>
        <div className="row row--between row--wrap" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div>
            <span className="caption" style={current ? { color: 'var(--ink-primary)', fontWeight: 570 } : undefined}>{chapter.years}</span>
            <h2 className="display" style={{ fontSize: 18, margin: '3px 0 0' }}>
              {chapter.short ?? chapter.name}
            </h2>
          </div>
          <span className="row" style={{ gap: 8 }}>
            {races !== null ? (
              <span className="chip chip--outline tnum">
                {formatNumber(races, 0)} {races === 1 ? 'race' : 'races'}
              </span>
            ) : null}
            {oneRace ? <DaytonaSourcePill /> : null}
          </span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>{chapter.narrative}</p>
        {oneRace ? (
          /* A single dot on a percentile strip says nothing — the one-race
           * chapter gets told as the race it was. */
          <DaytonaChapterBody />
        ) : (
          <>
            <div style={{ marginTop: 10 }}>
              <ChapterStrip seriesName={chapter.name} />
            </div>
            {row ? (
              <div className="row" style={{ gap: 26, marginTop: 10, flexWrap: 'wrap' }}>
                <Stat label="Avg finish" value={formatNumber(row.avgFinish)} />
                <Stat label="Field beaten (avg)" value={formatPct(row.avgFinishPercentile)} />
                <Stat label="Top-10 rate" value={formatPct(row.top10RatePct)} />
              </div>
            ) : null}
            {extra ? (
              <p className="caption caption--secondary" style={{ margin: '10px 0 0' }}>
                {extra}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
};

export const CareerScreen = () => {
  const careerLab = uiDataPackage.screens.careerLab;
  const rows = careerLab.seriesSummary as Row[];
  const rowByName = new Map(rows.map((row) => [asString(row.seriesName) ?? '', row]));
  const totalRaces = rows.reduce((sum, row) => sum + (asNumber(row.raceRows) ?? 0), 0);

  /* Lap texture for the current chapter: every sourced INDY NXT lap chart. */
  const lapTotals = (careerLab.lapPositionMix ?? []).reduce(
    (acc, season) => {
      for (const { position, laps } of season.positions) {
        acc.total += laps;
        if (position <= 5) acc.top5 += laps;
        if (position <= 10) acc.top10 += laps;
      }
      return acc;
    },
    { total: 0, top5: 0, top10: 0 }
  );
  const lapLine =
    lapTotals.total > 0
      ? `Lap by lap: of ${formatNumber(lapTotals.total, 0)} laps on sourced lap charts, ${formatNumber(lapTotals.top10, 0)} ran inside the top ten — ${formatNumber(lapTotals.top5, 0)} inside the top five.`
      : null;

  return (
    <div className="page stack">
      <header className="screen-head row row--between" style={{ alignItems: 'flex-end', gap: 14 }}>
        <div>
          <span className="kicker">Career Lab</span>
          <h1 className="screen-head__title">The climb.</h1>
          <p className="screen-head__sub">
            {seriesChapters.length} series, eight seasons, {formatNumber(totalRaces, 0)} source-backed races. Percentiles
            matter more than raw finishes — field sizes changed a lot along the way.
          </p>
        </div>
        <SourcePill
          title="Career Lab"
          entries={careerLab.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={careerLab.caveats}
        />
      </header>

      <CareerBests />

      <TheClimb />

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The explorer</span>
      </div>
      <CareerExplorer />

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The rivals</span>
      </div>
      <RivalsCard />

      {rows.length === 0 ? (
        <Card>
          <Unavailable>Career summary data unavailable.</Unavailable>
        </Card>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            <span className="kicker">The chapters</span>
          </div>
          <div className="journey">
            {seriesChapters.map((chapter, index) => (
              <Reveal key={chapter.name} delay={(index % 2) * 60}>
                <ChapterCard
                  chapter={chapter}
                  row={rowByName.get(chapter.name)}
                  current={index === seriesChapters.length - 1}
                  extra={index === seriesChapters.length - 1 ? lapLine : null}
                />
              </Reveal>
            ))}
          </div>
        </>
      )}

      <div className="grid grid--2">
        <BestClimbs />
        <RainDays />
      </div>
    </div>
  );
};
