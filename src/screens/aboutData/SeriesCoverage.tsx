import { useInViewOnce, useReducedMotion } from '../../app/charts';
import { uiDataPackage } from '../../data/uiDataPackage';
import { racesBySeries, seriesInfo } from './career';
import './seriesCoverage.css';

/* What each series' record holds, beyond the official result every race has.
 * Read from the career lab's per-series parity table (a metric is "held" when
 * its status is anything but unavailable) and, for live timing, from the
 * INDY NXT coverage block. Race counts are the Career odometer's. */

type Column = { key: string; label: string; family?: string; title: string };

export const COVERAGE_COLUMNS: Column[] = [
  { key: 'quali', label: 'Qualifying', family: 'qualifying_conversion', title: 'qualifying results tied to the race grid' },
  { key: 'laps', label: 'Lap times', family: 'lap_shape', title: 'his lap times, lap by lap' },
  { key: 'sections', label: 'Sections', family: 'section_pace', title: 'times through each named stretch of track' },
  { key: 'wet', label: 'Wet or dry', family: 'weather_context', title: 'wet, dry or mixed, or near-track weather' },
  { key: 'live', label: 'Live timing', title: 'the series’ live timing, recorded as it ran' }
];

type Parity = { metricFamily: string; parityStatus: string };

const parityBySeries = (uiDataPackage.screens.careerLab.parityBySeries ?? {}) as unknown as Record<string, Parity[]>;
/* Qualifying is read from the qualifying layer itself (the source Qualifying to
 * the flag uses), not the older parity table, so the two pages agree. */
const qualiSeries = new Set(
  (uiDataPackage.screens.careerLab.qualifyingLayer.bySeries ?? []).filter((row) => row.conversionRaces > 0).map((row) => row.seriesId)
);
const liveSeriesId = (uiDataPackage.screens.sourceOps.coverage as { indyNxt?: { seriesId?: string } } | null)?.indyNxt?.seriesId ?? null;

export const coverageRows = racesBySeries.map((row) => {
  const info = seriesInfo(row.seriesId);
  const parity = parityBySeries[info.name] ?? [];
  const held = (family: string | undefined, key: string): boolean => {
    if (key === 'live') return row.seriesId === liveSeriesId;
    if (key === 'quali') return qualiSeries.has(row.seriesId);
    const entry = parity.find((item) => item.metricFamily === family);
    return Boolean(entry && !entry.parityStatus.startsWith('unavailable'));
  };
  return {
    ...row,
    ...info,
    cells: COVERAGE_COLUMNS.map((column) => held(column.family, column.key))
  };
});

export const SeriesCoverage = ({ mini = false }: { mini?: boolean }) => {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.2);
  const reduced = useReducedMotion();
  const shown = inView || reduced || mini;
  const max = Math.max(1, ...coverageRows.map((row) => row.races));
  if (coverageRows.length === 0) return null;

  if (mini) {
    return (
      <svg viewBox={`0 0 ${COVERAGE_COLUMNS.length * 18 + 64} ${coverageRows.length * 9 + 2}`} className="cov-mini" aria-hidden>
        {coverageRows.map((row, r) => (
          <g key={row.seriesId} transform={`translate(0 ${r * 9 + 1})`}>
            <rect x={0} y={1.5} width={Math.max(2, (row.races / max) * 52)} height={5} rx={1} fill={row.tint} opacity={0.85} />
            {row.cells.map((held, c) => (
              <circle
                key={c}
                cx={64 + c * 18 + 9}
                cy={4}
                r={held ? 3.2 : 2.6}
                fill={held ? 'var(--ink)' : 'none'}
                stroke={held ? 'none' : 'var(--grey-line)'}
                strokeWidth={1}
              />
            ))}
          </g>
        ))}
      </svg>
    );
  }

  return (
    <div ref={ref} className={`cov${shown ? ' cov--in' : ''}`} role="table" aria-label="What each series’ record holds">
      <div className="cov__row cov__row--head" role="row">
        <span role="columnheader" className="cov__series">Series</span>
        <span role="columnheader" className="cov__races">Races</span>
        {COVERAGE_COLUMNS.map((column) => (
          <span key={column.key} role="columnheader" className="cov__col" title={column.title}>
            <span>{column.label}</span>
          </span>
        ))}
      </div>
      {coverageRows.map((row, r) => (
        <div key={row.seriesId} className="cov__row" role="row" style={{ ['--cov-delay' as string]: `${r * 55}ms` }}>
          <span role="rowheader" className="cov__series" title={row.name}>
            {row.short}
          </span>
          <span role="cell" className="cov__races">
            <span className="cov__bar" style={{ width: `${(row.races / max) * 100}%`, background: row.tint }} aria-hidden />
            <span className="cov__n tnum">{row.races}</span>
          </span>
          {row.cells.map((held, c) => (
            <span key={COVERAGE_COLUMNS[c].key} role="cell" className="cov__col">
              <span className={`cov__dot${held ? ' cov__dot--held' : ''}`} aria-label={held ? COVERAGE_COLUMNS[c].label : `no ${COVERAGE_COLUMNS[c].label.toLowerCase()}`} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
};
