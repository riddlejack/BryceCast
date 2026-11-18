/* RCFFS, 2019: one race, and it was not alone. The Right Coast Formula F race
 * at Mid-Ohio ran on the same weekend as F1600's round 3, so he raced four
 * times in two series in a little over a day, and the last of the four was
 * his first win in a car. The visual is that weekend on its clock: each race
 * at its official start time, as high as the share of the field he beat. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { placeLine } from '../../app/raceFacts';
import { useCareerRows } from '../careerExplorer';
import { countWord, dayLabel, dayNumber, fieldOf, minutesOf, openOf, raceClock, rowTip, Signature, tintOf, useEntrance, useRaceCard, weekday, EASE } from './common';

const SERIES = 'series_rcffs';

export const RcffsSignature = () => {
  const all = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();

  const model = useMemo(() => {
    const race = all.find((row) => row.seriesId === SERIES);
    if (!race) return null;
    const day = dayNumber(race.date);
    const weekend = all
      .filter((row) => row.trackName === race.trackName && day - dayNumber(row.date) >= 0 && day - dayNumber(row.date) <= 2)
      .map((row) => ({ row, clock: raceClock(row.sessionId) }))
      .filter((item): item is { row: typeof race; clock: string } => item.clock !== null)
      .sort((a, b) => a.clock.localeCompare(b.clock));
    const firstWin = all.filter((row) => row.finish === 1).sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
    return { race, weekend, isFirstWin: firstWin?.sessionId === race.sessionId };
  }, [all]);

  if (!model || model.weekend.length === 0) return null;
  const { race, weekend, isFirstWin } = model;
  const days = [...new Set(weekend.map((item) => item.clock.slice(0, 10)))].sort();
  const otherSeries = [...new Set(weekend.map((item) => item.row.seriesId).filter((id) => id !== SERIES))];
  const otherShort = weekend.find((item) => item.row.seriesId !== SERIES)?.row.seriesShort ?? '';
  const otherCount = weekend.filter((item) => item.row.seriesId !== SERIES).length;
  const startAt = (clock: string) => dayNumber(clock) * 1440 + minutesOf(clock);
  const spanHours = (startAt(weekend[weekend.length - 1].clock) - startAt(weekend[0].clock)) / 60;
  const raceField = fieldOf(race);

  const phone = width > 0 && width < 520;
  const left = 6;
  const right = 6;
  const nightGap = phone ? 22 : 40;
  const dayFrom = 7 * 60;
  const dayTo = 17 * 60;
  const panelW = Math.max((width - left - right - nightGap * (days.length - 1)) / Math.max(days.length, 1), 60);
  const top = 46;
  const plotH = phone ? 120 : 140;
  const base = top + plotH;
  const height = base + 46;
  const xOf = (clock: string) => {
    const d = days.indexOf(clock.slice(0, 10));
    const t = (minutesOf(clock) - dayFrom) / (dayTo - dayFrom);
    return left + d * (panelW + nightGap) + Math.min(1, Math.max(0, t)) * panelW;
  };
  const yOf = (share: number) => base - share * plotH;

  return (
    <>
      <p className="chapter-panel__narrative">
        One race, on a crowded weekend: at Mid-Ohio he raced {countWord(weekend.length)} times in {countWord(otherSeries.length + 1)} series inside{' '}
        {Math.ceil(spanHours)} hours, {countWord(otherCount)} in {otherShort} and one in the Right Coast Formula F Series. That last one
        {raceField ? <>, from a field of {raceField},</> : null} {race.finish === 1 ? (isFirstWin ? 'was his first win in a car' : 'was a win') : `ended ${placeLine(race.finish, raceField)}`}.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-rcffs"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => weekend.map((item) => ({ sessionId: item.row.sessionId, trackName: item.row.trackName }))}
            foot={
              <>
                Each race at its official start, higher the more of the field he beat:{' '}
                <span className="chs-key" style={{ ['--key' as string]: tintOf(otherSeries[0] ?? '') }}>{otherShort}</span>{' '}
                <span className="chs-key" style={{ ['--key' as string]: tintOf(SERIES) }}>RCFFS</span>. <PointerWord mouse="Hover" touch="Tap" /> a race for its card.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`The Mid-Ohio weekend: ${weekend.length} races by start time, each as high as the share of the field he beat`}>
                <line x1={left} x2={width - right} y1={yOf(1)} y2={yOf(1)} className="chs-hair" strokeDasharray="2 4" />
                <text x={left} y={yOf(1) - 8} className="chs-axis">
                  ahead of every car
                </text>
                {days.map((day, d) => {
                  const x0 = left + d * (panelW + nightGap);
                  return (
                    <g key={day}>
                      <line x1={x0} x2={x0 + panelW} y1={base} y2={base} stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} />
                      {[8, 12, 16].map((hour) => {
                        const hx = x0 + ((hour * 60 - dayFrom) / (dayTo - dayFrom)) * panelW;
                        return (
                          <g key={hour}>
                            <line x1={hx} x2={hx} y1={base} y2={base + 4} stroke="var(--ink)" strokeOpacity={0.35} />
                            <text x={hx} y={base + 17} textAnchor="middle" className="chs-axis">
                              {hour === 12 ? 'noon' : hour < 12 ? `${hour} am` : `${hour - 12} pm`}
                            </text>
                          </g>
                        );
                      })}
                      <text x={x0} y={base + 38} className="chs-label">
                        {weekday(day)} {dayLabel(day)}
                      </text>
                    </g>
                  );
                })}
                {weekend.map(({ row, clock }, k) => {
                  const x = xOf(clock);
                  const field = fieldOf(row);
                  const share = row.percentile;
                  const y = yOf(share);
                  const tint = tintOf(row.seriesId);
                  const star = row.sessionId === race.sessionId;
                  const hot = card.hot === row.sessionId;
                  const delay = reduced ? 0 : k * 260;
                  const label = placeLine(row.finish, field) ?? `P${row.finish}`;
                  const anchor = x > width - 90 ? 'end' : x < 60 ? 'start' : 'middle';
                  return (
                    <g key={row.sessionId} style={{ opacity: card.hot !== null && !hot ? 0.4 : 1, transition: 'opacity 160ms ease' }}>
                      <line
                        x1={x}
                        x2={x}
                        y1={base}
                        y2={y}
                        stroke={tint}
                        strokeWidth={1}
                        style={{ transformBox: 'fill-box', transformOrigin: 'center bottom', transform: `scaleY(${settled ? 1 : 0})`, transition: `transform 620ms ${EASE} ${delay}ms` }}
                      />
                      <circle cx={x} cy={y} r={star ? (hot ? 6.6 : 5.8) : hot ? 5.2 : 4.2} fill={tint} style={{ opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay + 480}ms` }} />
                      <text
                        x={x}
                        y={y - (star ? 13 : 11)}
                        textAnchor={anchor}
                        className={star ? 'chs-place' : 'chs-note'}
                        style={{ fontSize: 12, opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay + 560}ms` }}
                      >
                        {label}
                      </text>
                      <rect
                        x={x - 18}
                        y={top - 30}
                        width={36}
                        height={plotH + 34}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(row.sessionId, () => rowTip(row, x, y - 8, y + 8, { note: `started ${clockText(clock)}` }), openOf(row))}
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

const clockText = (clock: string): string => {
  const minutes = minutesOf(clock);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
