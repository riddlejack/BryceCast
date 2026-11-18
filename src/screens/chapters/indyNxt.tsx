/* INDY NXT, 2024–26: the current chapter. Beside the new chapters its three
 * stat tiles and one strip read plain, so the strip is split by season: one
 * row a year, every race placed by the share of the other cars he finished
 * ahead of, each row's middle race marked. No ranking words; the rows say it.
 * `?chapters=old` keeps round 2's tiles and single strip. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { useCareerRows } from '../careerExplorer';
import { openOf, rowTip, Signature, tintOf, useEntrance, useRaceCard, EASE } from './common';

const SERIES = 'series_indy_nxt';

export const IndyNxtSignature = ({ narrative, extra }: { narrative: string; extra?: string | null }) => {
  const all = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const seasons = useMemo(() => {
    const rows = all.filter((row) => row.seriesId === SERIES);
    const years = [...new Set(rows.map((row) => row.seasonYear ?? 0))].filter(Boolean).sort();
    return years.map((year) => {
      const list = rows.filter((row) => row.seasonYear === year);
      const sorted = [...list].sort((a, b) => a.percentile - b.percentile);
      return { year, rows: list, median: sorted[Math.floor(sorted.length / 2)]?.percentile ?? 0 };
    });
  }, [all]);

  if (seasons.length === 0) return null;
  const phone = width > 0 && width < 520;
  const left = phone ? 44 : 52;
  const right = 10;
  const rowH = phone ? 40 : 44;
  const top = 8;
  const height = top + rowH * seasons.length + 26;
  const r = 3.6;
  const x = (share: number) => left + r + Math.min(1, Math.max(0, share)) * (width - left - right - 2 * r);

  return (
    <>
      <p className="chapter-panel__narrative">{narrative}</p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-nxt"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => seasons.flatMap((season) => season.rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName })))}
            foot={
              <>
                A row a season; each race placed by how many of the other cars he finished ahead of, the dark tick the season’s middle race.{' '}
                <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label="INDY NXT by season: every race placed by the share of the field he beat">
                {seasons.map((season, s) => {
                  const cy = top + rowH * (s + 0.5);
                  return (
                    <g key={season.year}>
                      <text x={0} y={cy + 4} className="chs-label">
                        {season.year}
                      </text>
                      <line x1={left} x2={width - right} y1={cy} y2={cy} className="chs-hair" strokeOpacity={0.14} />
                      {season.rows.map((row, k) => {
                        const cx = x(row.percentile);
                        const hot = card.hot === row.sessionId;
                        const running = row.status === 'running';
                        return (
                          <g key={row.sessionId}>
                            <circle
                              cx={cx}
                              cy={cy}
                              r={hot ? r + 1.4 : r}
                              fill={running ? tint : 'var(--surface-0)'}
                              fillOpacity={running ? (hot ? 1 : 0.6) : 1}
                              stroke={running ? 'none' : tint}
                              strokeWidth={1.2}
                              style={{
                                opacity: settled ? 1 : 0,
                                transform: settled ? 'none' : `translateX(${x(season.median) - cx}px)`,
                                transition: `opacity 200ms ease ${reduced ? 0 : s * 200}ms, transform 700ms ${EASE} ${reduced ? 0 : s * 200 + k * 12}ms`
                              }}
                            />
                            <rect
                              x={cx - 5}
                              y={cy - rowH / 2 + 6}
                              width={10}
                              height={rowH - 12}
                              fill="transparent"
                              style={{ cursor: 'pointer' }}
                              {...card.bind(row.sessionId, () => rowTip(row, cx, cy - 8, cy + 8), openOf(row))}
                            />
                          </g>
                        );
                      })}
                      <rect x={x(season.median) - 1.5} y={cy - 9} width={3} height={18} rx={1.5} fill="var(--ink)" pointerEvents="none" />
                    </g>
                  );
                })}
                <text x={left} y={height - 6} className="chs-axis">
                  ← behind most of the field
                </text>
                <text x={width - right} y={height - 6} textAnchor="end" className="chs-axis">
                  ahead of most →
                </text>
              </svg>
            ) : null}
          </Signature>
        </div>
      </div>
      {extra ? <p className="caption caption--secondary chapter-panel__extra">{extra}</p> : null}
    </>
  );
};
