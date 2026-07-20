import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Card, SourcePill, Stat, Unavailable } from '../app/components';
import { ChartTipCard, chartFont, useMeasuredWidth, type ChartTip } from '../app/charts';
import { formatDate, formatGain, trackTypeLabel } from '../app/format';
import { Link, useRouter } from '../app/router';
import { uiDataPackage } from '../data/uiDataPackage';
import { chapterTint, raceHref, tipFor, useCareerRows, type CareerRow } from './careerExplorer';

/* The light race sheet: every non-INDY NXT race in the career table gets a
 * page of its own — the sourced facts, told plainly, with the chapter around
 * it for context. Depth varies by series (metric-family parity); this page
 * only states what the conversion table carries. */

const conditionLine = (row: CareerRow): string | null => {
  if (!row.wetDry) return null;
  if (row.wetDry === 'dry') return 'dry track';
  if (row.wetDry === 'wet') return 'wet track';
  return `${row.wetDry} track`;
};

/** Drop the series-and-year preamble from a label when a year token leads it —
 *  the kicker already says the series and season. */
const heroTitle = (row: CareerRow): string => {
  const stripped = row.raceLabel.replace(/^.*?\d{4}\s+/, '');
  return stripped.length >= 4 ? stripped : row.raceLabel;
};

/** The series chapter as a percentile strip with this race in full ink. */
const ChapterContext = ({ row, chapterRows }: { row: CareerRow; chapterRows: CareerRow[] }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const { navigate } = useRouter();
  const [tip, setTip] = useState<ChartTip | null>(null);

  const height = 52;
  const axisY = 30;
  const x = (percentile: number) => 10 + percentile * (width - 20);
  const sorted = [...chapterRows].sort((a, b) => a.percentile - b.percentile);
  const median = sorted[Math.floor(sorted.length / 2)].percentile;

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={`${row.seriesShort} finishing percentiles with this race highlighted`}>
          <line x1={10} x2={width - 10} y1={axisY} y2={axisY} stroke="var(--grid-hairline)" strokeWidth={1.5} />
          {chapterRows.map((other, index) => {
            const isThis = other.sessionId === row.sessionId;
            const clean = other.status === 'running';
            const tint = chapterTint(other.seriesName);
            return (
              <circle
                key={other.sessionId + index}
                cx={x(other.percentile)}
                cy={axisY}
                r={isThis ? 5.5 : 3.4}
                fill={clean ? tint : 'var(--surface-1)'}
                fillOpacity={isThis ? 1 : clean ? 0.25 : 0.7}
                stroke={clean ? (isThis ? tint : 'none') : tint}
                strokeWidth={1.2}
                style={{ cursor: isThis ? 'default' : 'pointer' }}
                onMouseEnter={() => setTip({ x: x(other.percentile), y: axisY - 8, ...tipFor(other) })}
                onMouseLeave={() => setTip(null)}
                onClick={() => {
                  if (!isThis) navigate(raceHref(other.sessionId));
                }}
              />
            );
          })}
          <rect x={x(median) - 1.75} y={axisY - 9} width={3.5} height={18} rx={1.75} fill="var(--ink-primary)" />
          <text x={10} y={height - 2} fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
            tougher days
          </text>
          <text x={width - 10} y={height - 2} textAnchor="end" fill="var(--ink-muted)" fontFamily={chartFont} fontSize={9.5}>
            stronger days
          </text>
        </svg>
      ) : null}
      {tip ? <ChartTipCard tip={tip} width={width} /> : null}
    </div>
  );
};

export const CareerRaceScreen = ({ sessionId }: { sessionId: string }) => {
  const rows = useCareerRows();
  const row = useMemo(() => rows.find((candidate) => candidate.sessionId === sessionId) ?? null, [rows, sessionId]);
  const chapterRows = useMemo(() => (row ? rows.filter((candidate) => candidate.seriesName === row.seriesName) : []), [rows, row]);
  const chapterIndex = useMemo(() => chapterRows.findIndex((candidate) => candidate.sessionId === sessionId), [chapterRows, sessionId]);

  if (!row) {
    return (
      <div className="page stack">
        <Card>
          <Unavailable>No sourced career race matches this address.</Unavailable>
          <p style={{ marginTop: 10 }}>
            <Link to="/career" className="navlink">
              Back to the Career Lab
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  if (row.sessionId.includes('indy_nxt')) {
    /* INDY NXT races have the full debrief page — send readers there. */
    return (
      <div className="page stack">
        <Card title={row.raceLabel}>
          <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink-secondary)' }}>
            This race has a full debrief page with the lap chart and the day’s story.
          </p>
          <p style={{ marginTop: 10 }}>
            <Link to={`/races/${encodeURIComponent(row.sessionId)}`} className="navlink" style={{ color: 'var(--link)' }}>
              Open the race page →
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const gain = row.gain !== null ? formatGain(row.gain) : null;
  const clean = row.status === 'running';
  const previous = chapterIndex > 0 ? chapterRows[chapterIndex - 1] : null;
  const next = chapterIndex >= 0 && chapterIndex < chapterRows.length - 1 ? chapterRows[chapterIndex + 1] : null;
  const condition = conditionLine(row);
  const subParts = [
    row.trackName,
    trackTypeLabel(row.trackType),
    formatDate(row.date, { month: 'long', day: 'numeric', year: 'numeric' }),
    condition
  ].filter(Boolean);

  return (
    <div className="page stack">
      <header className="screen-head row row--between" style={{ alignItems: 'flex-end', gap: 14 }}>
        <div>
          <span className="kicker">
            {row.seriesShort} · {row.seasonYear ?? ''}
          </span>
          <h1 className="screen-head__title">{heroTitle(row)}</h1>
          <p className="screen-head__sub">{subParts.join(' · ')}</p>
        </div>
        <SourcePill
          title={row.raceLabel}
          entries={[
            {
              label: 'Career result conversion table',
              path: 'analysis/career-parity/output/tables/career_result_conversion.csv',
              note: 'Official/source-backed result rows across all series. Older series don’t expose INDY NXT-grade depth — this sheet states only what the sources carry.'
            },
            ...(condition
              ? [
                  {
                    label: 'Per-session condition report',
                    path: 'analysis/context-event-narrative-layer/output/weather_condition_context.csv',
                    note: 'Official series weather lines plus labeled modeled observations, joined by session.'
                  }
                ]
              : [])
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      </header>

      <Card>
        <div className="row" style={{ gap: 26, flexWrap: 'wrap' }}>
          <Stat label="Finished" value={`P${row.finish}`} hero delta={gain && gain.direction !== 'flat' ? gain : undefined} />
          <Stat label="Started" value={row.start !== null ? `P${row.start}` : '—'} />
          <Stat label="Field beaten" value={`${Math.round(row.percentile * 100)}%`} />
        </div>
        <p className="caption caption--secondary" style={{ margin: '10px 0 0' }}>
          {!clean
            ? `Official status: ${row.status} — the percentile still counts every classified car.`
            : row.start === null
              ? 'This series’ time cards don’t carry a sourced grid position.'
              : gain && gain.direction === 'up'
                ? `Up ${row.gain} ${row.gain === 1 ? 'place' : 'places'} from where he started.`
                : 'Percentile is the share of the field he beat — honest across changing field sizes.'}
        </p>
      </Card>

      <Card
        title={`The ${row.seriesShort} chapter around it`}
      >
        <p style={{ margin: '0 0 4px', fontSize: 13, color: 'var(--ink-secondary)' }}>
          Race {chapterIndex + 1} of {chapterRows.length} in his {row.seriesShort} chapter — every dot a race, this one in
          full ink.
        </p>
        <ChapterContext row={row} chapterRows={chapterRows} />
        <p className="caption caption--secondary" style={{ margin: '4px 0 0' }}>
          The ink tick marks the chapter median · ○ a day that ended early · click any other dot to open its race
        </p>
        <div className="row row--between row--wrap" style={{ marginTop: 12, gap: 8 }}>
          {previous ? (
            <Link to={raceHref(previous.sessionId)} className="navlink row" style={{ gap: 6, color: 'var(--link)' }}>
              <ArrowLeft size={14} aria-hidden /> {previous.raceLabel}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={raceHref(next.sessionId)} className="navlink row" style={{ gap: 6, color: 'var(--link)' }}>
              {next.raceLabel} <ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>

      <p>
        <Link to="/career" className="navlink" style={{ color: 'var(--link)' }}>
          ← Back to the Career Lab
        </Link>
      </p>
    </div>
  );
};
