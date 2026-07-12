import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import { uiDataPackage } from '../data/uiDataPackage';
import { BestClimbs, CareerBests, CareerExplorer, ChapterStrip, DaytonaStory, TheClimb } from './careerExplorer';

type Row = Record<string, string | number | null>;

/* Career chapters in journey order — the climb from F1600 to INDY NXT.
 * Narrative lines are descriptive context only; every number beside them
 * comes from the source-backed series summary. */
const seriesChapters: Array<{ name: string; years: string; short?: string; narrative: string }> = [
  {
    name: 'F1600 Championship Series',
    years: '2019',
    short: 'F1600',
    narrative: 'Where the climb started — a first season in American grassroots open-wheel.'
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
    narrative: 'Twenty-four hours at Daytona in a GTP prototype — endurance racing’s deep end.'
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
  current
}: {
  chapter: (typeof seriesChapters)[number];
  row: Row | undefined;
  current: boolean;
}) => {
  const races = row ? asNumber(row.raceRows) : null;
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
          {races !== null ? (
            <span className="chip chip--outline tnum">
              {formatNumber(races, 0)} {races === 1 ? 'race' : 'races'}
            </span>
          ) : null}
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '58ch' }}>{chapter.narrative}</p>
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
      </Card>
    </div>
  );
};

export const CareerScreen = () => {
  const careerLab = uiDataPackage.screens.careerLab;
  const rows = careerLab.seriesSummary as Row[];
  const rowByName = new Map(rows.map((row) => [asString(row.seriesName) ?? '', row]));
  const totalRaces = rows.reduce((sum, row) => sum + (asNumber(row.raceRows) ?? 0), 0);

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
              <ChapterCard
                key={chapter.name}
                chapter={chapter}
                row={rowByName.get(chapter.name)}
                current={index === seriesChapters.length - 1}
              />
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 10 }}>
        <span className="kicker">The explorer</span>
      </div>
      <CareerExplorer />
      <div className="grid grid--2">
        <BestClimbs />
        <DaytonaStory />
      </div>
    </div>
  );
};
