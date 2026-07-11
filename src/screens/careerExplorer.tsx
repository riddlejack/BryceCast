import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatGain } from '../app/format';
import { Link } from '../app/router';
import { uiDataPackage } from '../data/uiDataPackage';
import { packModules } from '../data/packModules';

interface ConversionRow {
  raceLabel: string;
  sessionId: string;
  seriesName: string;
  seasonYear: number | null;
  trackType: string;
  trackName: string;
  start: number;
  finish: number;
  gain: number | null;
}

/* Track-type colors from the validated categorical order (blue, orange→skip, aqua, violet). */
const trackTypeColor: Record<string, string> = {
  road: 'var(--series-1)',
  oval: 'var(--series-2)',
  street: 'var(--series-3)'
};

const useConversionRows = (): ConversionRow[] | null => {
  const [rows, setRows] = useState<ConversionRow[] | null>(null);
  useEffect(() => {
    const careerLab = uiDataPackage.screens.careerLab as unknown as Record<string, unknown>;
    const ref = careerLab.contextPackRef as { path: string } | undefined;
    const loader = ref ? packModules[`../../${ref.path}`] : undefined;
    if (!loader) {
      setRows([]);
      return;
    }
    loader().then((module) => {
      const pack = (module as { default: { resultConversion: Array<Record<string, string>> } }).default;
      const parsed = pack.resultConversion
        .map((row): ConversionRow | null => {
          const start = asNumber(row.startPosition);
          const finish = asNumber(row.finishPosition);
          if (start === null || finish === null) return null;
          return {
            raceLabel: (row.raceLabel ?? '').replace(/^\d{4}\s+/, ''),
            sessionId: row.sessionId ?? '',
            seriesName: row.seriesName ?? '',
            seasonYear: asNumber(row.seasonYear),
            trackType: (row.trackType ?? '').toLowerCase(),
            trackName: row.trackName ?? '',
            start,
            finish,
            gain: asNumber(row.positionGain)
          };
        })
        .filter((row): row is ConversionRow => row !== null);
      setRows(parsed);
    });
  }, []);
  return rows;
};

const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="chip"
    style={
      active
        ? { cursor: 'pointer', background: 'var(--ink-primary)', color: '#fff', borderColor: 'transparent' }
        : { cursor: 'pointer', color: 'var(--ink-secondary)' }
    }
  >
    {label}
  </button>
);

const ExplorerTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: ConversionRow }> }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const gain = row.gain !== null ? formatGain(row.gain) : null;
  return (
    <div style={{ background: 'var(--surface-0)', border: '1px solid var(--divider)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, maxWidth: 240, boxShadow: '0 6px 20px rgba(0,0,0,0.10)' }}>
      <div style={{ fontWeight: 600 }}>{row.raceLabel}</div>
      <div style={{ color: 'var(--ink-secondary)' }}>
        P{row.start} → P{row.finish}
        {gain ? ` · ${gain.text}` : ''}
      </div>
      <div style={{ color: 'var(--ink-muted)', fontSize: 11.5 }}>{row.trackName}</div>
    </div>
  );
};

export const CareerExplorer = () => {
  const rows = useConversionRows();
  const [seriesFilter, setSeriesFilter] = useState<string | null>(null);
  const [trackFilter, setTrackFilter] = useState<string | null>(null);

  const seriesNames = useMemo(() => (rows ? [...new Set(rows.map((row) => row.seriesName))] : []), [rows]);
  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (row) => (seriesFilter === null || row.seriesName === seriesFilter) && (trackFilter === null || row.trackType === trackFilter)
      ),
    [rows, seriesFilter, trackFilter]
  );

  const maxPosition = useMemo(() => Math.max(24, ...filtered.map((row) => Math.max(row.start, row.finish))), [filtered]);
  const gained = filtered.filter((row) => row.finish < row.start).length;

  if (rows === null) return <div className="skeleton" style={{ height: 380 }} />;
  if (rows.length === 0)
    return (
      <Card title="Start → finish explorer">
        <Unavailable>Result conversion data unavailable.</Unavailable>
      </Card>
    );

  return (
    <Card
      title="Start → finish explorer"
      action={
        <SourcePill
          title="Start → finish explorer"
          entries={[
            {
              label: 'Career result conversion table',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: 'Official/source-backed start and finish positions across all series. Races without a sourced grid position are excluded.'
            }
          ]}
        />
      }
    >
      <p style={{ margin: '-4px 0 10px', fontSize: 13, color: 'var(--ink-secondary)' }}>
        Every career race with a sourced grid position. Dots above the line are races where Bryce gained positions —{' '}
        <strong style={{ color: 'var(--ink-primary)' }}>
          {gained} of {filtered.length}
        </strong>{' '}
        in this view.
      </p>
      <div className="row row--wrap" style={{ gap: 6, marginBottom: 6 }}>
        <FilterChip label="All series" active={seriesFilter === null} onClick={() => setSeriesFilter(null)} />
        {seriesNames.map((name) => (
          <FilterChip
            key={name}
            label={name.replace('Castrol Toyota Formula Regional Oceania Championship', 'FR Oceania').replace(' Championship Series', '').replace(' Championship', '').replace('IMSA WeatherTech SportsCar', 'IMSA')}
            active={seriesFilter === name}
            onClick={() => setSeriesFilter(seriesFilter === name ? null : name)}
          />
        ))}
      </div>
      <div className="row row--wrap" style={{ gap: 6, marginBottom: 4 }}>
        <FilterChip label="All tracks" active={trackFilter === null} onClick={() => setTrackFilter(null)} />
        {(['road', 'street', 'oval'] as const).map((type) => (
          <FilterChip key={type} label={type} active={trackFilter === type} onClick={() => setTrackFilter(trackFilter === type ? null : type)} />
        ))}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 14, right: 14, bottom: 4, left: -18 }}>
          <CartesianGrid stroke="var(--grid-hairline)" />
          <XAxis
            type="number"
            dataKey="start"
            name="Start"
            domain={[1, maxPosition + 1]}
            tickCount={6}
            stroke="var(--ink-muted)"
            fontSize={11}
            label={{ value: 'started', position: 'insideBottomRight', offset: -2, fill: 'var(--ink-muted)', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="finish"
            name="Finish"
            domain={[1, maxPosition + 1]}
            reversed
            tickCount={6}
            stroke="var(--ink-muted)"
            fontSize={11}
            label={{ value: 'finished', angle: -90, position: 'insideLeft', offset: 26, fill: 'var(--ink-muted)', fontSize: 11 }}
          />
          <ReferenceLine
            segment={[
              { x: 1, y: 1 },
              { x: maxPosition + 1, y: maxPosition + 1 }
            ]}
            stroke="var(--axis-baseline)"
            strokeDasharray="4 4"
          />
          <Tooltip content={<ExplorerTooltip />} cursor={{ stroke: 'var(--axis-baseline)' }} />
          {(['road', 'street', 'oval'] as const).map((type) => (
            <Scatter
              key={type}
              name={type}
              data={filtered.filter((row) => row.trackType === type)}
              fill={trackTypeColor[type]}
              stroke="var(--surface-1)"
              strokeWidth={1.5}
              r={5.5}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="row row--wrap" style={{ gap: 12, marginTop: 4 }}>
        {(['road', 'street', 'oval'] as const).map((type) => (
          <span key={type} className="row" style={{ gap: 5, fontSize: 12, color: 'var(--ink-secondary)' }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: trackTypeColor[type] }} aria-hidden />
            {type}
          </span>
        ))}
        <span style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginLeft: 'auto' }}>above the line = positions gained</span>
      </div>
    </Card>
  );
};

interface ImsaPack {
  car85Result?: Record<string, unknown>;
  bryceStintContext?: Array<Record<string, unknown>>;
  counts?: Record<string, number>;
}

/** Feature story: the 2025 Rolex 24 at Daytona GTP drive. */
export const DaytonaStory = () => {
  const [pack, setPack] = useState<ImsaPack | null>(null);
  useEffect(() => {
    const loader = packModules['../../analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json'];
    if (!loader) return;
    loader().then((module) => setPack((module as { default: ImsaPack }).default));
  }, []);
  if (!pack?.car85Result) return null;
  const result = pack.car85Result;
  const stints = pack.counts?.bryceStints ?? null;
  return (
    <Card
      title="The Daytona 24"
      action={
        <SourcePill
          title="Rolex 24 at Daytona 2025"
          entries={[
            {
              label: 'Official IMSA / Al Kamel time cards',
              path: 'analysis/imsa-daytona-stint-class-pace/output/context-packs/imsa-daytona-stint-class-context.json',
              note: '37,885 official lap rows across the field; stint boundaries derived from pit in/out laps.'
            }
          ]}
        />
      }
    >
      <p style={{ margin: '-4px 0 14px', fontSize: 13.5, color: 'var(--ink-secondary)' }}>
        January 2025: 24 hours in a {String(result.vehicle ?? 'GTP car')} for {String(result.teamName ?? '')} — sports car
        racing's top class, shared with three co-drivers through the night.
      </p>
      <div className="grid grid--3">
        <Stat label="GTP class finish" value={`P${asNumber(result.classFinishPosition) ?? '—'}`} />
        <Stat label="Laps completed" value={asNumber(result.lapsCompleted) ?? '—'} />
        <Stat label="Bryce stints" value={stints ?? '—'} />
      </div>
      <div className="row row--wrap" style={{ marginTop: 12, gap: 8 }}>
        <span className="chip chip--outline">car #85 · {String(result.class ?? 'GTP')}</span>
        <span className="chip chip--outline tnum">best lap {String(result.bestLapTime ?? '—')}</span>
        <span className="chip chip--outline">{asNumber(result.pitStops) ?? '—'} pit stops</span>
      </div>
    </Card>
  );
};

/** Positive storytelling: the biggest single-race climbs of Bryce's career. */
export const BestClimbs = () => {
  const rows = useConversionRows();
  if (!rows || rows.length === 0) return null;
  const best = [...rows]
    .filter((row) => row.gain !== null && row.gain > 0)
    .sort((a, b) => (b.gain ?? 0) - (a.gain ?? 0))
    .slice(0, 5);
  if (best.length === 0) return null;
  return (
    <Card title="Biggest climbs" flush>
      <div className="tower">
        {best.map((row) => (
          <Link
            key={row.sessionId}
            to={row.sessionId.includes('indy_nxt') ? `/races/${encodeURIComponent(row.sessionId)}` : '/career'}
            className="tower__row"
            style={{ gridTemplateColumns: '64px 1fr auto' }}
          >
            <span className="stat__delta stat__delta--up figure" style={{ fontSize: 17 }}>
              ▲ {row.gain}
            </span>
            <span className="tower__name" style={{ whiteSpace: 'normal' }}>
              {row.raceLabel}
              <span className="tower__team"> {row.seasonYear ?? ''}</span>
            </span>
            <span className="tower__gap">
              P{row.start} → P{row.finish}
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
};
