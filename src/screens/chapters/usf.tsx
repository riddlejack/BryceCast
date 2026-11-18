/* USF Pro 2000, 2024: one race, the Freedom 90 at Indianapolis Raceway Park,
 * run in the middle of his first INDY NXT season. It was the first oval race
 * on his record, seven weeks before INDY NXT took him to one. The visual is
 * his 2024: every race he ran that year, in three series on two sides of the
 * world, with the ovals ringed. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { placeLine } from '../../app/raceFacts';
import { useCareerRows } from '../careerExplorer';
import { countWord, dayLabel, dayNumber, fieldOf, monthShort, openOf, placeName, rowTip, Signature, tintOf, useEntrance, useRaceCard, EASE } from './common';

const SERIES = 'series_usf_pro_2000';

export const UsfSignature = () => {
  const all = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();

  const model = useMemo(() => {
    const race = all.find((row) => row.seriesId === SERIES);
    if (!race) return null;
    const year = race.seasonYear ?? Number(race.date.slice(0, 4));
    const rows = all.filter((row) => row.date.startsWith(String(year)));
    const lanes: Array<{ seriesId: string; short: string; rows: typeof rows }> = [];
    for (const row of rows) {
      const lane = lanes.find((l) => l.seriesId === row.seriesId);
      if (lane) lane.rows.push(row);
      else lanes.push({ seriesId: row.seriesId, short: row.seriesShort, rows: [row] });
    }
    const ovals = all.filter((row) => row.trackType === 'oval').sort((a, b) => a.date.localeCompare(b.date));
    const firstOval = ovals[0] ?? null;
    const nextOval = ovals.find((row) => row.seriesId !== SERIES) ?? null;
    return { race, year, rows, lanes, firstOval, nextOval };
  }, [all]);

  if (!model) return null;
  const { race, year, rows, lanes, firstOval, nextOval } = model;
  const isFirstOval = firstOval?.sessionId === race.sessionId;
  const weeksToNext = isFirstOval && nextOval ? Math.round((dayNumber(nextOval.date) - dayNumber(race.date)) / 7) : null;
  const away = lanes.find((lane) => lane.seriesId === 'series_froc');

  const phone = width > 0 && width < 520;
  const labelW = phone ? 0 : 108;
  const left = labelW + 8;
  const right = 10;
  const laneH = phone ? 46 : 42;
  const top = phone ? 30 : 34;
  const height = top + laneH * lanes.length + 30;
  const d0 = dayNumber(`${year}-01-01`);
  const d1 = dayNumber(`${year + 1}-01-01`);
  const x = (iso: string) => left + ((dayNumber(iso) - d0) / (d1 - d0)) * (width - left - right);
  const laneY = (i: number) => top + laneH * (i + 0.5);
  const raceIndex = lanes.findIndex((lane) => lane.seriesId === SERIES);
  const rx = x(race.date);
  const ry = laneY(raceIndex);
  const labelRight = rx < width * 0.62;

  return (
    <>
      <p className="chapter-panel__narrative">
        One race, in the middle of his first INDY NXT season: the Freedom 90 on the {placeName(race.trackName)} oval, {dayLabel(race.date)}, {year}, where he{' '}
        {race.start !== null ? <>went from P{race.start} to {placeLine(race.finish, fieldOf(race))}</> : <>finished {placeLine(race.finish, fieldOf(race))}</>}.
        {isFirstOval ? <> It was the first oval race of his career{weeksToNext ? <>, {countWord(weeksToNext)} weeks before INDY NXT took him to one at {placeName(nextOval?.trackName ?? '')}</> : null}.</> : null}
        {away ? <> That year he raced {rows.length} times in {countWord(lanes.length)} series, beginning with {countWord(away.rows.length)} in New Zealand.</> : null}
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-usf"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                Every race of his {year}, by date; a ring marks an oval. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`His ${year}: ${rows.length} races in ${lanes.length} series by date, ovals ringed`}>
                {Array.from({ length: 12 }, (_, m) => {
                  const mx = x(`${year}-${String(m + 1).padStart(2, '0')}-01`);
                  return (
                    <g key={m}>
                      <line x1={mx} x2={mx} y1={top - 4} y2={height - 24} className="chs-hair" strokeOpacity={0.06} />
                      {!phone || m % 2 === 0 ? (
                        <text x={mx + 3} y={height - 8} className="chs-axis">
                          {monthShort(m)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
                {lanes.map((lane, i) => {
                  const ly = laneY(i);
                  const tint = tintOf(lane.seriesId);
                  return (
                    <g key={lane.seriesId}>
                      <line x1={left} x2={width - right} y1={ly} y2={ly} className="chs-hair" strokeOpacity={0.12} />
                      {phone ? (
                        <text x={left} y={ly - 13} className="chs-axis">
                          {lane.short}
                        </text>
                      ) : (
                        <text x={0} y={ly + 4} className="chs-label">
                          {lane.short}
                        </text>
                      )}
                      {lane.rows.map((row) => {
                        const cx = x(row.date);
                        const hot = card.hot === row.sessionId;
                        const star = row.sessionId === race.sessionId;
                        const delay = reduced ? 0 : (dayNumber(row.date) - d0) * 3.2;
                        return (
                          <g key={row.sessionId} style={{ opacity: card.hot !== null && !hot ? 0.45 : 1, transition: 'opacity 160ms ease' }}>
                            <g style={{ opacity: settled ? 1 : 0, transition: `opacity 280ms ${EASE} ${delay}ms` }}>
                              {row.trackType === 'oval' ? <circle cx={cx} cy={ly} r={star ? 9.5 : 7.5} fill="none" stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1} /> : null}
                              <circle cx={cx} cy={ly} r={star ? (hot ? 6.2 : 5.4) : hot ? 4.8 : 3.8} fill={tint} />
                            </g>
                            <rect
                              x={cx - 5}
                              y={ly - laneH / 2 + 4}
                              width={10}
                              height={laneH - 8}
                              fill="transparent"
                              style={{ cursor: 'pointer' }}
                              {...card.bind(row.sessionId, () => rowTip(row, cx, ly - 10, ly + 10, row.trackType === 'oval' ? { note: 'oval' } : {}), openOf(row))}
                            />
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
                <text
                  x={labelRight ? rx + 16 : rx - 16}
                  y={ry + 4}
                  textAnchor={labelRight ? 'start' : 'end'}
                  className="chs-place"
                  fontSize={12}
                  pointerEvents="none"
                  style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${reduced ? 0 : 900}ms` }}
                >
                  {isFirstOval ? 'first oval · ' : ''}P{race.start ?? '?'} → P{race.finish}
                </text>
              </svg>
            ) : null}
          </Signature>
        </div>
      </div>
    </>
  );
};
