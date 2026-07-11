import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatNumber, formatPct } from '../app/format';
import { uiDataPackage } from '../data/uiDataPackage';
import { BestClimbs, CareerExplorer, DaytonaStory } from './careerExplorer';

type Row = Record<string, string | number | null>;

/** Career chapters in journey order — the climb from F1600 to INDY NXT. */
const seriesChapters: Array<{ name: string; years: string }> = [
  { name: 'F1600 Championship Series', years: '2019' },
  { name: 'Formula Ford', years: '2020' },
  { name: 'GB3 Championship', years: '2021–22' },
  { name: 'Euroformula Open', years: '2023' },
  { name: 'Castrol Toyota Formula Regional Oceania Championship', years: '2024' },
  { name: 'IMSA WeatherTech SportsCar Championship', years: '2025 · Daytona 24' },
  { name: 'INDY NXT', years: '2024–26 · current' }
];

const seriesYearLabel: Record<string, string> = Object.fromEntries(seriesChapters.map((chapter) => [chapter.name, chapter.years]));
const seriesOrder: Record<string, number> = Object.fromEntries(seriesChapters.map((chapter, index) => [chapter.name, index]));

const SeriesCard = ({ row }: { row: Row }) => {
  const name = asString(row.seriesName) ?? 'Series';
  const races = asNumber(row.raceRows);
  return (
    <Card>
      <div className="row row--between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="caption caption--secondary">{seriesYearLabel[name] ?? ''}</div>
          <h2 className="display" style={{ fontSize: 17, margin: '2px 0 0' }}>
            {name}
          </h2>
        </div>
        <span className="chip chip--outline">{formatNumber(races, 0)} {races === 1 ? 'race' : 'races'}</span>
      </div>
      <div className="grid grid--3" style={{ marginTop: 14 }}>
        <Stat label="Avg finish" value={formatNumber(row.avgFinish)} />
        <Stat label="Field beaten (avg)" value={formatPct(row.avgFinishPercentile)} />
        <Stat label="Top 10 rate" value={formatPct(row.top10RatePct)} />
      </div>
    </Card>
  );
};

export const CareerScreen = () => {
  const careerLab = uiDataPackage.screens.careerLab;
  const rows = [...(careerLab.seriesSummary as Row[])].sort(
    (a, b) => (seriesOrder[asString(a.seriesName) ?? ''] ?? 99) - (seriesOrder[asString(b.seriesName) ?? ''] ?? 99)
  );

  return (
    <div className="page stack">
      <header className="row row--between">
        <div>
          <h1 className="display" style={{ fontSize: 26, margin: 0 }}>
            Career Lab
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)', fontSize: 14 }}>
            Seven series, eight seasons, every result source-backed. Percentiles matter more than raw finishes — field
            sizes changed a lot along the way.
          </p>
        </div>
        <SourcePill
          title="Career Lab"
          entries={careerLab.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={careerLab.caveats}
        />
      </header>
      <CareerExplorer />
      <BestClimbs />
      <DaytonaStory />
      {rows.length === 0 ? (
        <Card>
          <Unavailable>Career summary data unavailable.</Unavailable>
        </Card>
      ) : (
        <div className="grid grid--2">
          {rows.map((row) => (
            <SeriesCard key={asString(row.seriesId) ?? asString(row.seriesName) ?? ''} row={row} />
          ))}
        </div>
      )}
    </div>
  );
};
