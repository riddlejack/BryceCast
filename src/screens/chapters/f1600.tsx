/* F1600, 2019: his first full season, and the only one built on triple-
 * headers. Seven weekends, three races each. The visual is the seven
 * weekends side by side, each weekend's three finishes joined, with the
 * podium as a quiet band at the top: the season reads as climbing into it. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { countWord, lab, openOf, placeName, rowTip, Signature, tintOf, unclassifiedOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_frp_f1600';

type Slot = { kind: 'race'; row: CareerRow } | { kind: 'out'; sessionId: string; status: string; date: string; trackName: string };

export const F1600Signature = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const rounds = useMemo(() => {
    const slots: Slot[] = [
      ...rows.map((row): Slot => ({ kind: 'race', row })),
      ...unclassifiedOf(SERIES).map((race): Slot => ({ kind: 'out', sessionId: race.sessionId, status: race.status, date: race.date, trackName: race.trackName }))
    ];
    const keyOf = (slot: Slot) => (slot.kind === 'race' ? `${slot.row.date}|${slot.row.sessionId}` : `${slot.date}|${slot.sessionId}`);
    slots.sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
    const out: Array<{ track: string; slots: Slot[] }> = [];
    for (const slot of slots) {
      const track = slot.kind === 'race' ? slot.row.trackName : slot.trackName;
      const last = out[out.length - 1];
      if (last && last.track === track) last.slots.push(slot);
      else out.push({ track, slots: [slot] });
    }
    return out;
  }, [rows]);

  if (rows.length === 0) return null;
  const campaign = lab.seasonCampaigns?.campaigns?.find((c) => c.seriesId === SERIES && c.seasonYear === 2019) ?? null;
  const rank = campaign?.officialStandingRank ?? null;
  const podiums = rows.filter((row) => row.finish <= 3).length;
  const lastFour = rounds.slice(-4).flatMap((round) => round.slots).filter((slot) => slot.kind === 'race' && slot.row.finish <= 3).length;
  const racesPerRound = Math.max(...rounds.map((round) => round.slots.length));
  const worst = Math.max(...rows.map((row) => row.finish));
  const outs = rounds.flatMap((round) => round.slots).filter((slot) => slot.kind === 'out');

  const phone = width > 0 && width < 520;
  const left = 38;
  const right = phone ? 4 : 56;
  const top = 12;
  const step = phone ? 15 : 17;
  const y = (place: number) => top + (place - 1) * step;
  const plotBottom = y(worst);
  const outY = plotBottom + (outs.length ? 26 : 0);
  const height = outY + (phone ? 34 : 50);
  const roundW = Math.max((width - left - right) / Math.max(rounds.length, 1), 30);
  const gap = Math.min(phone ? 11 : 20, roundW * 0.27);
  const xOf = (r: number, i: number, n: number) => left + roundW * (r + 0.5) + (i - (n - 1) / 2) * gap;
  const ticks = [1, 3, 6, 9, 12].filter((place) => place <= worst);

  return (
    <>
      <p className="chapter-panel__narrative">
        His first full season, and the only one run in threes: {countWord(rounds.length)} weekends of {countWord(racesPerRound)} races. He reached
        the podium {podiums} times, {lastFour} of them in the last four rounds{rank ? <>, and finished {ordinalPlace(rank)} in the championship</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-f1600"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                Each weekend's three races, left to right, joined; P1 at the top. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`F1600 2019: ${rounds.length} weekends of three races, his finish in each`}>
                <rect x={left - 4} y={y(1) - step / 2} width={width - left - right + 8} height={step * 3} rx={3} className="chs-band" />
                {!phone ? (
                  <text x={width - right + 10} y={y(2) + 4} className="chs-note">
                    podium
                  </text>
                ) : null}
                {ticks.map((place) => (
                  <text key={place} x={left - 10} y={y(place) + 4} textAnchor="end" className="chs-axis">
                    P{place}
                  </text>
                ))}
                {outs.length ? (
                  <text x={left - 10} y={outY + 4} textAnchor="end" className="chs-axis">
                    DNS
                  </text>
                ) : null}
                {rounds.map((round, r) => {
                  const n = round.slots.length;
                  const delay = reduced ? 0 : r * 160;
                  const raced = round.slots
                    .map((slot, i) => (slot.kind === 'race' ? { x: xOf(r, i, n), y: y(slot.row.finish) } : null))
                    .filter((point): point is { x: number; y: number } => point !== null);
                  const dim = card.hot !== null && !round.slots.some((slot) => (slot.kind === 'race' ? slot.row.sessionId : slot.sessionId) === card.hot);
                  return (
                    <g key={round.track + r} style={{ opacity: dim ? 0.4 : 1, transition: 'opacity 160ms ease' }}>
                      <polyline
                        points={raced.map((point) => `${point.x},${point.y}`).join(' ')}
                        fill="none"
                        stroke={tint}
                        strokeOpacity={0.55}
                        strokeWidth={1}
                        style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay + 420}ms` }}
                      />
                      {round.slots.map((slot, i) => {
                        const x = xOf(r, i, n);
                        if (slot.kind === 'out') {
                          return (
                            <g key={slot.sessionId} style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay + 300}ms` }}>
                              <path d={`M${x - 3},${outY - 3} L${x + 3},${outY + 3} M${x + 3},${outY - 3} L${x - 3},${outY + 3}`} stroke="var(--ink-muted)" strokeWidth={1.2} />
                            </g>
                          );
                        }
                        const row = slot.row;
                        const hot = card.hot === row.sessionId;
                        return (
                          <g key={row.sessionId}>
                            <circle
                              cx={x}
                              cy={y(row.finish)}
                              r={hot ? 5.2 : 4.2}
                              fill={tint}
                              style={{
                                opacity: settled ? 1 : 0,
                                transform: settled ? 'none' : `translateY(${y(1) - y(row.finish)}px)`,
                                transition: `opacity 200ms ease ${delay + i * 70}ms, transform 560ms ${EASE} ${delay + i * 70}ms`
                              }}
                            />
                            <rect
                              x={x - gap / 2}
                              y={top - step / 2}
                              width={gap}
                              height={plotBottom - top + step}
                              fill="transparent"
                              style={{ cursor: 'pointer' }}
                              {...card.bind(row.sessionId, () => rowTip(row, x, y(row.finish) - 8, y(row.finish) + 8), openOf(row))}
                            />
                          </g>
                        );
                      })}
                      <text x={left + roundW * (r + 0.5)} y={outY + 22} textAnchor="middle" className="chs-axis">
                        R{r + 1}
                      </text>
                      {!phone ? (
                        <text x={left + roundW * (r + 0.5)} y={outY + 40} textAnchor="middle" className="chs-label">
                          {placeName(round.track)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};

const ordinalPlace = (n: number): string => (n === 1 ? 'first' : n === 2 ? 'second' : n === 3 ? 'third' : `${n}th`);
