/* FR Oceania, 2024: the guest campaign in the New Zealand summer, the last two
 * rounds of five. The visual is his six starting grids, drawn as grids: two
 * staggered columns of slots, one per car in that race, the front at the top;
 * an open ring on the slot he started from, his finish in colour, a line
 * between. The Highlands race he won from pole is one slot, ring and dot
 * together. Starts, finishes and rounds: smallSeriesStories.froc (official
 * results); fields: the race sheets. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { countWord, fieldOf, lab, openOf, placeName, rowTip, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_froc';

interface GridRace {
  row: CareerRow;
  number: number;
  inRound: number;
  start: number | null;
  field: number;
}

export const FrocGrids = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);
  const story = lab.smallSeriesStories?.froc ?? null;

  const rounds = useMemo(() => {
    if (!story) return [];
    const byId = new Map(rows.map((row) => [row.sessionId, row]));
    return story.events
      .map((event) => ({
        index: event.roundIndex ?? 0,
        track: event.trackName,
        races: event.races
          .map((race, k): GridRace | null => {
            const row = byId.get(race.sessionId);
            if (!row) return null;
            return { row, number: race.raceNumber ?? 0, inRound: k + 1, start: race.startPosition ?? null, field: fieldOf(row) ?? Math.max(row.finish, race.startPosition ?? 0) };
          })
          .filter((race): race is GridRace => race !== null)
      }))
      .sort((a, b) => a.index - b.index);
  }, [rows, story]);

  if (!story || rounds.length === 0) return null;
  const raced = rounds.flatMap((round) => round.races);
  const total = story.coverage.racesInSeason;
  const firstNumber = Math.min(...raced.map((race) => race.number));
  const lastNumber = Math.max(...raced.map((race) => race.number));
  const poleWin = raced.find((race) => race.row.finish === 1 && race.start === 1);
  const absent = [...(story.absentRounds ?? [])].sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0));
  const deepest = Math.max(...raced.map((race) => race.field));

  const phone = width > 0 && width < 520;
  const perLine = phone ? 3 : raced.length;
  const gap = phone ? 0 : 26;
  const gridW = (width - gap * (rounds.length - 1)) / perLine;
  const slotW = Math.min(phone ? 16 : 18, gridW * 0.2);
  const colGap = slotW * 1.5;
  const rowGap = phone ? 13 : 15;
  const headH = phone ? 36 : 40;
  const gridH = Math.ceil(deepest / 2) * rowGap + rowGap / 2;
  const footH = 26;
  const blockH = headH + gridH + footH;
  const lines = Math.ceil(raced.length / perLine);
  const height = lines * blockH + (phone ? 0 : 4);

  /* Slot n of a grid: odd slots in the left column, even in the right, each row half a row lower on the right. */
  const slot = (n: number, gx: number, gy: number) => {
    const col = (n - 1) % 2;
    const line = Math.floor((n - 1) / 2);
    return { x: gx + (col === 0 ? -colGap / 2 : colGap / 2), y: gy + line * rowGap + col * (rowGap / 2) };
  };

  let index = 0;
  const blocks = rounds.flatMap((round, r) =>
    round.races.map((race) => {
      const i = index++;
      const col = i % perLine;
      const line = Math.floor(i / perLine);
      const x0 = col * gridW + (phone ? 0 : r * gap);
      return { round, race, i, x0, y0: line * blockH };
    })
  );

  return (
    <>
      <p className="chapter-panel__narrative">
        A guest in the New Zealand summer: he joined the {countWord(story.coverage.roundsInSeries)}-round championship for its last {countWord(story.coverage.roundsRun)},
        {absent.length ? <> after {absent.map((round) => placeName(round.trackName)).join(', ').replace(/, ([^,]*)$/, ' and $1')} had run without him</> : null}, so his{' '}
        {countWord(raced.length)} races were races {firstNumber} to {lastNumber} of the season’s {total}
        {poleWin ? <>, and one of them, at {placeName(poleWin.row.trackName)}, he won from pole</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-grids"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => raced.map((race) => ({ sessionId: race.row.sessionId, trackName: race.row.trackName }))}
            foot={
              <>
                Each race’s starting grid, front at the top, a slot for every car: the ring is where he started, the dot where he finished.{' '}
                <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`FR Oceania 2024: his ${raced.length} starting grids, where he started and where he finished`}>
                {blocks.map(({ round, race, i, x0, y0 }) => {
                  const gx = x0 + gridW / 2;
                  const gy = y0 + headH + rowGap / 2;
                  const startAt = race.start ? slot(race.start, gx, gy) : null;
                  const finishAt = slot(race.row.finish, gx, gy);
                  const hot = card.hot === race.row.sessionId;
                  const delay = reduced ? 0 : 200 + i * 200;
                  const won = race.row.finish === 1;
                  const firstOfRound = race.inRound === 1;
                  return (
                    <g key={race.row.sessionId}>
                      {firstOfRound || phone ? (
                        <text x={phone ? gx : x0 + 4} y={y0 + 13} textAnchor={phone ? 'middle' : 'start'} className="chs-label">
                          {phone ? placeName(round.track) : `Round ${round.index} · ${placeName(round.track)}`}
                        </text>
                      ) : null}
                      <text x={gx} y={y0 + (phone ? 29 : 31)} textAnchor="middle" className="chs-axis">
                        race {race.inRound}
                      </text>
                      {Array.from({ length: race.field }, (_, k) => {
                        const p = slot(k + 1, gx, gy);
                        return (
                          <path
                            key={k}
                            d={`M${p.x - slotW / 2},${p.y + 3} L${p.x - slotW / 2},${p.y - 1} L${p.x + slotW / 2},${p.y - 1} L${p.x + slotW / 2},${p.y + 3}`}
                            fill="none"
                            stroke="var(--ink)"
                            strokeOpacity={0.24}
                            strokeWidth={1}
                            style={{ opacity: settled ? 1 : 0, transition: `opacity 200ms ease ${delay + k * 14}ms` }}
                          />
                        );
                      })}
                      {startAt && (startAt.x !== finishAt.x || startAt.y !== finishAt.y) ? (
                        <line
                          x1={startAt.x}
                          y1={startAt.y}
                          x2={finishAt.x}
                          y2={finishAt.y}
                          stroke={tint}
                          strokeOpacity={0.55}
                          strokeWidth={1.2}
                          style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay + 520}ms` }}
                        />
                      ) : null}
                      {startAt ? <circle cx={startAt.x} cy={startAt.y} r={5.6} fill="var(--surface-0)" stroke={tint} strokeWidth={1.4} style={{ opacity: settled ? 1 : 0, transition: `opacity 200ms ease ${delay + 300}ms` }} /> : null}
                      <circle
                        cx={finishAt.x}
                        cy={finishAt.y}
                        r={hot ? 4.8 : 3.8}
                        fill={tint}
                        style={{
                          opacity: settled ? 1 : 0,
                          transform: settled || !startAt ? 'none' : `translate(${startAt.x - finishAt.x}px, ${startAt.y - finishAt.y}px)`,
                          transition: `opacity 160ms ease ${delay + 420}ms, transform 700ms ${EASE} ${delay + 520}ms`
                        }}
                      />
                      <text x={gx} y={y0 + headH + gridH + 16} textAnchor="middle" className={won ? 'chs-place' : 'chs-axis'} fontSize={won ? 13 : undefined} fill={won || hot ? tint : undefined}>
                        {race.start ? `P${race.start} → P${race.row.finish}` : `P${race.row.finish}`}
                        {won && !phone ? <tspan className="chs-note" dx={5}>win</tspan> : null}
                      </text>
                      <rect
                        x={x0}
                        y={y0 + 18}
                        width={gridW}
                        height={blockH - 18}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(race.row.sessionId, () => rowTip(race.row, gx, y0 + headH - 4, y0 + headH + gridH + 20), openOf(race.row))}
                      />
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
