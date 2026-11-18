/* FR Oceania, 2024: the guest campaign in the New Zealand summer. He joined
 * the five-round championship for its last two rounds, so his six races are
 * races 10 to 15 of the season's 15. The visual is the whole season's run of
 * races, the nine before he arrived left quiet, and his six drawn grid to
 * flag: an open ring where he started, his finish in colour. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import type { CareerRow } from '../careerExplorer';
import { countWord, dayRange, lab, openOf, placeName, rowTip, Signature, tintOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_froc';

export const FrocSignature = () => {
  const rows = useSeriesRows(SERIES);
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);
  const story = lab.smallSeriesStories?.froc ?? null;

  const model = useMemo(() => {
    if (!story) return null;
    const byId = new Map(rows.map((row) => [row.sessionId, row]));
    const rounds = [
      ...(story.absentRounds ?? []).map((round) => ({ index: round.roundIndex ?? 0, track: round.trackName, date: round.eventDate, races: [] as Array<{ row: CareerRow; number: number; start: number | null }> })),
      ...story.events.map((event) => ({
        index: event.roundIndex ?? 0,
        track: event.trackName,
        date: event.eventDate,
        races: event.races
          .map((race) => ({ row: byId.get(race.sessionId), number: race.raceNumber, start: race.startPosition }))
          .filter((race): race is { row: CareerRow; number: number; start: number | null } => Boolean(race.row))
      }))
    ].sort((a, b) => a.index - b.index);
    return { rounds };
  }, [rows, story]);

  if (!story || !model) return null;
  const { rounds } = model;
  const total = story.coverage.racesInSeason;
  const perRound = Math.round(total / Math.max(story.coverage.roundsInSeries, 1));
  const raced = rounds.flatMap((round) => round.races);
  const firstNumber = Math.min(...raced.map((race) => race.number));
  const lastNumber = Math.max(...raced.map((race) => race.number));
  const poleWin = raced.find((race) => race.row.finish === 1 && race.start === 1);
  const deepest = Math.max(...raced.flatMap((race) => [race.row.finish, race.start ?? 0]));
  const absent = rounds.filter((round) => round.races.length === 0);

  const phone = width > 0 && width < 520;
  const left = 38;
  const right = 6;
  const top = 30;
  const step = phone ? 14 : 16;
  const y = (place: number) => top + (place - 1) * step;
  const bottom = y(deepest);
  const height = bottom + (phone ? 40 : 56);
  const slotW = (width - left - right) / Math.max(total, 1);
  const xOf = (number: number) => left + slotW * (number - 0.5);

  return (
    <>
      <p className="chapter-panel__narrative">
        A guest in the New Zealand summer: he joined the {countWord(story.coverage.roundsInSeries)}-round championship for its last{' '}
        {countWord(story.coverage.roundsRun)}, so his {countWord(raced.length)} races were races {firstNumber} to {lastNumber} of the season’s {total}
        {poleWin ? <>, and one of them was a win from the front of the grid at {placeName(poleWin.row.trackName)}</> : null}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-froc"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => raced.map((race) => ({ sessionId: race.row.sessionId, trackName: race.row.trackName }))}
            foot={
              <>
                The season’s {total} races in order; his six run from the open ring (where he started) to the dot (where he finished), P1 at the top.{' '}
                <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`FR Oceania 2024: the season's ${total} races; his ${raced.length}, grid to flag`}>
                {[1, 5, 10, 15].filter((place) => place <= deepest).map((place) => (
                  <g key={place}>
                    <line x1={left - 4} x2={width - right} y1={y(place)} y2={y(place)} className="chs-hair" strokeOpacity={0.07} />
                    <text x={left - 10} y={y(place) + 4} textAnchor="end" className="chs-axis">
                      P{place}
                    </text>
                  </g>
                ))}
                {absent.length ? (
                  <g>
                    <rect
                      x={left + slotW * (absent[0].index - 1) * perRound + 3}
                      y={top - 12}
                      width={slotW * absent.length * perRound - 6}
                      height={bottom - top + 24}
                      rx={4}
                      className="chs-band"
                    />
                    <text
                      x={left + (slotW * absent.length * perRound) / 2}
                      y={(top + bottom) / 2 + 4}
                      textAnchor="middle"
                      className="chs-axis"
                    >
                      {phone ? 'before he joined' : `rounds 1–${absent.length}, before he joined`}
                    </text>
                  </g>
                ) : null}
                {rounds.map((round) => {
                  const cx = left + slotW * perRound * (round.index - 0.5);
                  return (
                    <g key={round.index}>
                      <text x={cx} y={bottom + 26} textAnchor="middle" className={round.races.length ? 'chs-label' : 'chs-axis'}>
                        {phone ? `R${round.index}` : placeName(round.track)}
                      </text>
                      {!phone ? (
                        <text x={cx} y={bottom + 42} textAnchor="middle" className="chs-axis">
                          R{round.index}
                          {round.races.length ? ` · ${dayRange(round.races[0].row.date, round.races[round.races.length - 1].row.date)}` : ''}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {raced.map((race, k) => {
                  const x = xOf(race.number);
                  const fy = y(race.row.finish);
                  const sy = race.start !== null ? y(race.start) : fy;
                  const hot = card.hot === race.row.sessionId;
                  const delay = reduced ? 0 : 200 + k * 180;
                  const isPoleWin = poleWin?.row.sessionId === race.row.sessionId;
                  return (
                    <g key={race.row.sessionId} style={{ opacity: card.hot !== null && !hot ? 0.4 : 1, transition: 'opacity 160ms ease' }}>
                      {race.start !== null ? (
                        <>
                          <line x1={x} x2={x} y1={sy} y2={fy} stroke={tint} strokeWidth={1} strokeOpacity={0.7} />
                          <circle cx={x} cy={sy} r={3.6} fill="var(--surface-0)" stroke="var(--ink-muted)" strokeWidth={1} />
                        </>
                      ) : null}
                      <circle
                        cx={x}
                        cy={fy}
                        r={hot ? 5.4 : 4.4}
                        fill={tint}
                        style={{
                          opacity: settled ? 1 : 0,
                          transform: settled ? 'none' : `translateY(${sy - fy}px)`,
                          transition: `opacity 160ms ease ${delay}ms, transform 620ms ${EASE} ${delay}ms`
                        }}
                      />
                      {isPoleWin ? (
                        <text x={x} y={fy - 12} textAnchor="middle" className="chs-place" fontSize={12} style={{ opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay + 600}ms` }}>
                          win
                        </text>
                      ) : null}
                      <rect
                        x={x - slotW / 2}
                        y={top - 14}
                        width={slotW}
                        height={bottom - top + 28}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(race.row.sessionId, () => rowTip(race.row, x, Math.min(fy, sy) - 8, Math.max(fy, sy) + 8), openOf(race.row))}
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
