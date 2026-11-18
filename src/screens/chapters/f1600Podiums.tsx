/* F1600, 2019: his first season run in threes, seven weekends of three races.
 * The visual is a podium for every weekend, his podium finishes standing on
 * their steps, all three results in race order underneath, so the season
 * reads as the podiums filling up: empty early, crowded by the end. Counts
 * and places from the career rows and unclassifiedRaces; the championship
 * place from seasonCampaigns. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { countWord, lab, openOf, ordinalWord, placeName, rowTip, Signature, tintOf, unclassifiedOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_frp_f1600';

type Slot = { kind: 'race'; row: CareerRow } | { kind: 'out'; sessionId: string; status: string; date: string; trackName: string };

/* Podium steps, left to right: second, first, third; height in step units. */
const STEPS: Array<{ place: number; rise: number }> = [
  { place: 2, rise: 2 },
  { place: 1, rise: 3 },
  { place: 3, rise: 1 }
];

export const F1600Podiums = () => {
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
  const podiumRows = rows.filter((row) => row.finish <= 3);
  const byPlace = (place: number) => podiumRows.filter((row) => row.finish === place).length;
  const lastFour = rounds.slice(-4).flatMap((round) => round.slots).filter((slot) => slot.kind === 'race' && slot.row.finish <= 3).length;
  const racesPerRound = Math.max(...rounds.map((round) => round.slots.length));
  const stack = Math.max(1, ...rounds.map((round) => Math.max(...STEPS.map((step) => round.slots.filter((slot) => slot.kind === 'race' && slot.row.finish === step.place).length))));
  const placeWords = [1, 2, 3]
    .map((place) => ({ place, n: byPlace(place) }))
    .filter((item) => item.n > 0)
    .sort((a, b) => b.n - a.n)
    .map((item, i) => (i === 0 ? `${countWord(item.n)} of them ${ordinalWord(item.place)}` : item.n === 1 ? `once ${ordinalWord(item.place)}` : `${countWord(item.n)} times ${ordinalWord(item.place)}`));

  const phone = width > 0 && width < 520;
  const colW = width / Math.max(rounds.length, 1);
  const pw = Math.min(colW * 0.8, 96);
  const sw = pw / 3;
  const unit = phone ? 12 : 16;
  const dotR = phone ? 3.8 : 4.4;
  const dotGap = dotR * 2 + 3;
  const top = 10 + stack * dotGap;
  const floorY = top + unit * 3;
  const listY = floorY + 18;
  const lineH = 16;
  const labelY = listY + lineH * racesPerRound + 8;
  const height = labelY + (phone ? 8 : 26);

  return (
    <>
      <p className="chapter-panel__narrative">
        His first season run in threes: {countWord(rounds.length)} weekends of {countWord(racesPerRound)} races. He stood on the podium {countWord(podiumRows.length)}{' '}
        times, {placeWords.join(' and ')}, and {countWord(lastFour)} of the {countWord(podiumRows.length)} came in the last four rounds
        {rank ? <>; he finished {ordinalWord(rank)} in the championship</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-podiums"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                A podium for each weekend, his top-three finishes on their steps; under it, the weekend’s three results in race order.{' '}
                <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`F1600 2019: a podium for each of ${rounds.length} weekends, his ${podiumRows.length} podium finishes on their steps`}>
                <line x1={0} x2={width} y1={floorY} y2={floorY} className="chs-hair" strokeOpacity={0.22} />
                {rounds.map((round, r) => {
                  const cx = colW * (r + 0.5);
                  const delay = reduced ? 0 : 200 + r * 180;
                  const stepX = (k: number) => cx - pw / 2 + sw * k;
                  return (
                    <g key={round.track + r}>
                      {STEPS.map((step, k) => (
                        <rect
                          key={step.place}
                          x={stepX(k) + 0.5}
                          y={floorY - unit * step.rise}
                          width={sw - 1}
                          height={unit * step.rise}
                          fill="var(--ink)"
                          fillOpacity={0.045}
                          stroke="var(--ink)"
                          strokeOpacity={0.22}
                          strokeWidth={1}
                          style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay}ms` }}
                        />
                      ))}
                      {STEPS.map((step, k) => {
                        const on = round.slots.filter((slot): slot is { kind: 'race'; row: CareerRow } => slot.kind === 'race' && slot.row.finish === step.place);
                        return on.map((slot, j) => {
                          const x = stepX(k) + sw / 2;
                          const y = floorY - unit * step.rise - dotR - 2 - j * dotGap;
                          const hot = card.hot === slot.row.sessionId;
                          return (
                            <circle
                              key={slot.row.sessionId}
                              cx={x}
                              cy={y}
                              r={hot ? dotR + 1.2 : dotR}
                              fill={tint}
                              style={{
                                opacity: settled ? 1 : 0,
                                transform: settled ? 'none' : 'translateY(-26px)',
                                transition: `opacity 160ms ease ${delay + 260 + j * 120}ms, transform 520ms ${EASE} ${delay + 260 + j * 120}ms`
                              }}
                            />
                          );
                        });
                      })}
                      {round.slots.map((slot, i) => {
                        const ly = listY + lineH * i + 4;
                        if (slot.kind === 'out') {
                          return (
                            <text key={slot.sessionId} x={cx} y={ly} textAnchor="middle" className="chs-axis" style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${delay + 420}ms` }}>
                              {slot.status.toUpperCase()}
                            </text>
                          );
                        }
                        const row = slot.row;
                        const podium = row.finish <= 3;
                        const hot = card.hot === row.sessionId;
                        const dotY = podium ? floorY - unit * (STEPS.find((step) => step.place === row.finish)?.rise ?? 1) - dotR - 2 : ly - 4;
                        return (
                          <g key={row.sessionId}>
                            <text
                              x={cx}
                              y={ly}
                              textAnchor="middle"
                              className={podium ? 'chs-place' : 'chs-axis'}
                              fontSize={podium ? 13 : undefined}
                              fill={podium || hot ? tint : undefined}
                              style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${delay + 420 + i * 60}ms` }}
                            >
                              P{row.finish}
                            </text>
                            <rect
                              x={cx - colW / 2 + 2}
                              y={ly - 12}
                              width={colW - 4}
                              height={lineH}
                              fill="transparent"
                              style={{ cursor: 'pointer' }}
                              {...card.bind(row.sessionId, () => rowTip(row, cx, Math.min(dotY, ly - 12) - 4, ly + 6), openOf(row))}
                            />
                          </g>
                        );
                      })}
                      <rect
                        x={cx - pw / 2}
                        y={top - dotGap}
                        width={pw}
                        height={floorY - top + dotGap}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...(() => {
                          const best = round.slots
                            .filter((slot): slot is { kind: 'race'; row: CareerRow } => slot.kind === 'race')
                            .sort((a, b) => a.row.finish - b.row.finish)[0];
                          return best ? card.bind(best.row.sessionId, () => rowTip(best.row, cx, top - 4, floorY + 4), openOf(best.row)) : {};
                        })()}
                      />
                      <text x={cx} y={labelY + 4} textAnchor="middle" className="chs-axis">
                        R{r + 1}
                      </text>
                      {!phone ? (
                        <text x={cx} y={labelY + 21} textAnchor="middle" className="chs-label">
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
