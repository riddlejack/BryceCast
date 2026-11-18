/* Formula Ford, 2019–20: the British year, and the wettest of his career. The
 * visual is the weather itself: every race he started as a column of sky, rain
 * drawn in it as the series' own report called the track (wet, damp, drying or
 * dry), his finish under it. The 2020 season reads as a wet July, a dry August
 * and September, and a wet autumn. Calls: careerLab.raceWeather through
 * app/wetDry.ts (every Formula Ford call is a series report). */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { wetDryCall } from '../../app/wetDry';
import { useCareerRows, type CareerRow } from '../careerExplorer';
import {
  countWord,
  dayLabel,
  dayNumber,
  lab,
  monthName,
  monthShort,
  openOf,
  outTip,
  rowTip,
  Signature,
  tintOf,
  unclassifiedOf,
  useEntrance,
  useRaceCard,
  useSeriesRows
} from './common';

const SERIES = 'series_formula_ford';
const GAP_DAYS = 60;

type Sky = 'wet' | 'damp' | 'drying' | 'mixed' | 'dry' | 'unknown';
type Mark =
  | { kind: 'race'; row: CareerRow; date: string; sessionId: string; sky: Sky; words: string | null }
  | { kind: 'out'; race: ReturnType<typeof unclassifiedOf>[number]; date: string; sessionId: string; sky: Sky; words: string | null };

const skyOf = (sessionId: string): { sky: Sky; words: string | null } => {
  const call = wetDryCall(lab.raceWeather?.[sessionId]);
  if (!call) return { sky: 'unknown', words: null };
  if (call.state === 'dry') return { sky: 'dry', words: call.words };
  if (call.state === 'wet') return { sky: 'wet', words: call.words };
  return { sky: /damp/.test(call.words) ? 'damp' : /drying/.test(call.words) ? 'drying' : 'mixed', words: call.words };
};

/* A small seeded generator, so the rain falls the same way on every visit. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Rain streaks for one race's sky, inside x..x+w, y..y+h. */
const streaks = (sky: Sky, x: number, y: number, w: number, h: number, seed: number): Array<[number, number]> => {
  if (sky === 'dry' || sky === 'unknown') return [];
  const random = seeded(seed);
  const gap = sky === 'damp' ? 17 : 8;
  const lanes = Math.max(2, Math.floor(w / 6));
  const out: Array<[number, number]> = [];
  for (let lane = 0; lane < lanes; lane += 1) {
    for (let sy = y + random() * gap; sy < y + h - 7; sy += gap * (0.8 + random() * 0.5)) {
      const depth = (sy - y) / h;
      if (sky === 'drying' && random() > 1 - depth * 0.95) continue; // the rain eases off down the column
      if (sky === 'mixed' && random() < 0.4) continue;
      out.push([x + 3 + (lane + random() * 0.6) * ((w - 6) / lanes), sy]);
    }
  }
  return out;
};

const joinWords = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

export const FormulaFordRain = () => {
  const rows = useSeriesRows(SERIES);
  const all = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const marks = useMemo(() => {
    const clock = (sessionId: string) => lab.raceWeather?.[sessionId]?.window.start ?? '';
    const list: Mark[] = [
      ...rows.map((row): Mark => ({ kind: 'race', row, date: row.date, sessionId: row.sessionId, ...skyOf(row.sessionId) })),
      ...unclassifiedOf(SERIES).map((race): Mark => ({ kind: 'out', race, date: race.date, sessionId: race.sessionId, ...skyOf(race.sessionId) }))
    ];
    return list.sort((a, b) => (clock(a.sessionId) || a.date).localeCompare(clock(b.sessionId) || b.date));
  }, [rows]);

  if (rows.length === 0) return null;

  const isWet = (sky: Sky) => sky !== 'dry' && sky !== 'unknown';
  const wet = marks.filter((mark): mark is Extract<Mark, { kind: 'race' }> => mark.kind === 'race' && isWet(mark.sky));
  const share = (list: CareerRow[]) => (list.length ? list.filter((row) => row.wetDry === 'wet' || row.wetDry === 'mixed').length / list.length : 0);
  const wettest = [...new Set(all.map((row) => row.seriesId))].every((id) => id === SERIES || share(all.filter((row) => row.seriesId === id)) < share(rows));
  const wetPodiums = wet.filter((mark) => mark.row.finish <= 3).length;

  /* The main season's months: those that ran all wet, and all dry. */
  const year = [...marks.map((mark) => mark.date.slice(0, 4))].sort((a, b) => marks.filter((m) => m.date.startsWith(b)).length - marks.filter((m) => m.date.startsWith(a)).length)[0];
  const months = new Map<number, Sky[]>();
  for (const mark of marks.filter((m) => m.date.startsWith(year))) {
    const month = Number(mark.date.slice(5, 7)) - 1;
    months.set(month, [...(months.get(month) ?? []), mark.sky]);
  }
  const allWet = [...months].filter(([, skies]) => skies.every(isWet)).map(([month]) => month).sort((a, b) => a - b);
  const allDry = [...months].filter(([, skies]) => skies.every((sky) => sky === 'dry')).map(([month]) => month).sort((a, b) => a - b);

  /* Meetings: races a day or less apart at one track. A stretch of more than two months folds to a break. */
  const groups: Array<{ marks: Mark[]; breakBefore: number }> = [];
  for (const mark of marks) {
    const last = groups[groups.length - 1];
    const prev = last?.marks[last.marks.length - 1];
    const gapDays = prev ? dayNumber(mark.date) - dayNumber(prev.date) : 0;
    const track = (m: Mark) => (m.kind === 'race' ? m.row.trackName : m.race.trackName);
    if (last && prev && gapDays <= 1 && track(prev) === track(mark)) last.marks.push(mark);
    else groups.push({ marks: [mark], breakBefore: gapDays > GAP_DAYS ? gapDays : 0 });
  }
  const longBreak = Math.max(0, ...groups.map((group) => group.breakBefore));
  const breakMonths = Math.round(longBreak / 30.44);

  const phone = width > 0 && width < 520;
  const eventOf = (sessionId: string): string =>
    String(
      (lab.resultConversion ?? []).find((row) => row.sessionId === sessionId)?.eventName ??
        (lab.unclassifiedRaces ?? []).find((race) => race.sessionId === sessionId)?.eventName ??
        ''
    );
  const meetingLabel = (group: (typeof groups)[number]) => {
    const event = group.marks.map((mark) => eventOf(mark.sessionId)).join(' ');
    if (/Festival/i.test(event)) return `Festival ${group.marks[0].date.slice(0, 4)}`;
    if (/Walter Hayes/i.test(event)) return 'Walter Hayes Trophy';
    return null;
  };

  const finishText = (mark: Mark) => (mark.kind === 'race' ? `P${mark.row.finish}` : mark.race.status.toUpperCase());
  const podium = (mark: Mark) => mark.kind === 'race' && mark.row.finish <= 3;
  const tipOf = (mark: Mark, x: number, y: number, under: number) =>
    mark.kind === 'race' ? rowTip(mark.row, x, y, under) : outTip(mark.race, `Formula Ford · ${mark.date.slice(0, 4)}`, tint, x, y, under);
  const openFor = (mark: Mark) => (mark.kind === 'race' ? openOf(mark.row) : null);

  const lede = (
    <p className="chapter-panel__narrative">
      The British year{wettest ? ', and the wettest of his career' : ''}: the series’ own reports called {wet.length} of his {rows.length} classified races wet, damp or
      drying, and {countWord(wetPodiums)} of those ended on the podium.
      {allWet.length && allDry.length ? (
        <>
          {' '}
          In {year} every race in {joinWords(allWet.map(monthName))} ran wet, damp or drying, and every one in {joinWords(allDry.map(monthName))} dry.
        </>
      ) : null}
    </p>
  );

  const foot = (
    <>
      A column of sky for every race he started, the rain as the series reported the track: dense for wet, sparse for damp, thinning for drying, none for dry; his
      finish underneath. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
    </>
  );

  /* Phone: a row per race, the rain falling in a band across it. */
  if (phone) {
    const rowH = 22;
    const breakH = 24;
    const dateW = 56;
    const finishW = 40;
    let yy = 4;
    const placed = groups.flatMap((group, g) => {
      if (group.breakBefore) yy += breakH;
      else if (g > 0) yy += 6;
      return group.marks.map((mark) => {
        const y = yy;
        yy += rowH;
        return { mark, y, breakAt: group.breakBefore && mark === group.marks[0] ? y - breakH : null };
      });
    });
    const height = yy + 6;
    const bandX = dateW;
    const bandW = width - dateW - finishW;
    return (
      <>
        {lede}
        <div ref={stageRef}>
          <div ref={ref}>
            <Signature className="chs-rain" tip={card.tip} width={width} tap={card.tap} venues={() => marks.map((mark) => ({ sessionId: mark.sessionId, trackName: mark.kind === 'race' ? mark.row.trackName : mark.race.trackName }))} foot={foot}>
              {width > 0 ? (
                <svg width={width} height={height} role="img" aria-label={`Formula Ford: ${marks.length} races, the rain in each as the series reported it`}>
                  {placed.map(({ mark, y, breakAt }, i) => {
                    const hot = card.hot === mark.sessionId;
                    const delay = reduced ? 0 : 150 + i * 40;
                    return (
                      <g key={mark.sessionId}>
                        {breakAt !== null ? (
                          <text x={bandX} y={breakAt + 15} className="chs-axis">
                            {countWord(breakMonths)} months
                          </text>
                        ) : null}
                        <text x={0} y={y + 15} className="chs-axis">
                          {dayLabel(mark.date)}
                        </text>
                        <rect x={bandX} y={y + 3} width={bandW} height={rowH - 6} rx={2} className="chs-band" />
                        <g style={{ opacity: settled ? 1 : 0, transition: `opacity 300ms ease ${delay}ms` }}>
                          {streaks(mark.sky, bandX, y + 3, bandW, rowH - 6, i * 977 + 13).map(([sx, sy], k) => (
                            <line key={k} x1={sx} y1={sy} x2={sx - 1.5} y2={sy + 5} stroke="var(--ink)" strokeOpacity={hot ? 0.75 : 0.45} strokeWidth={1} />
                          ))}
                        </g>
                        <text x={width} y={y + 15} textAnchor="end" className={podium(mark) ? 'chs-place' : 'chs-axis'} fontSize={podium(mark) ? 13 : undefined} fill={podium(mark) || hot ? tint : undefined}>
                          {finishText(mark)}
                        </text>
                        <rect
                          x={0}
                          y={y}
                          width={width}
                          height={rowH}
                          fill="transparent"
                          style={{ cursor: 'pointer' }}
                          {...card.bind(mark.sessionId, () => tipOf(mark, width / 2, y, y + rowH), openFor(mark))}
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
  }

  /* Desktop: a column per race, left to right in time, meetings spaced apart, the long winter folded. */
  const left = 0;
  const meetingGap = 8;
  const breakW = 70;
  const inner = width - left;
  const nBreaks = groups.filter((group) => group.breakBefore).length;
  const colW = Math.min(30, (inner - meetingGap * (groups.length - 1 - nBreaks) - breakW * nBreaks) / marks.length);
  const top = 46;
  const skyH = 112;
  const ground = top + skyH;
  const finishY = ground + 20;
  const monthY = finishY + 24;
  const height = monthY + 8;
  let xx = left;
  const breaks: Array<{ x: number; months: number }> = [];
  const placed = groups.flatMap((group, g) => {
    if (group.breakBefore) {
      breaks.push({ x: xx + 2, months: Math.round(group.breakBefore / 30.44) });
      xx += breakW;
    } else if (g > 0) xx += meetingGap;
    const start = xx;
    const cols = group.marks.map((mark) => {
      const x = xx;
      xx += colW;
      return { mark, x };
    });
    return cols.map((col) => ({ ...col, group, groupStart: start, groupEnd: xx }));
  });
  const monthTicks: Array<{ x: number; label: string }> = [];
  for (const { mark, x } of placed) {
    const key = mark.date.slice(0, 7);
    if (!monthTicks.some((tick) => tick.label.startsWith(key))) monthTicks.push({ x, label: key });
  }

  return (
    <>
      {lede}
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature className="chs-rain" tip={card.tip} width={width} tap={card.tap} venues={() => marks.map((mark) => ({ sessionId: mark.sessionId, trackName: mark.kind === 'race' ? mark.row.trackName : mark.race.trackName }))} foot={foot}>
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`Formula Ford: ${marks.length} races, the rain in each as the series reported it, his finish under it`}>
                {(() => {
                  /* Meeting names over their first column; one that would run into the last drops to a lower line,
                   * one that would run off the right edge ends a margin short of it. */
                  const ends = [-Infinity, -Infinity];
                  const edge = width - 14;
                  return groups.map((group) => {
                    const label = meetingLabel(group);
                    const first = placed.find((p) => p.mark === group.marks[0]);
                    if (!label || !first) return null;
                    const textW = label.length * 7;
                    const fits = first.groupStart + textW <= edge;
                    const x0 = fits ? first.groupStart : edge - textW;
                    const line = x0 > ends[0] + 8 ? 0 : 1;
                    ends[line] = x0 + textW;
                    const ty = top - 10 - (1 - line) * 16;
                    return (
                      <g key={`m${first.mark.sessionId}`}>
                        <text x={fits ? first.groupStart : edge} y={ty} textAnchor={fits ? 'start' : 'end'} className="chs-axis">
                          {label}
                        </text>
                        <line x1={first.groupStart} x2={first.groupStart} y1={ty + 4} y2={top} className="chs-hair" />
                      </g>
                    );
                  });
                })()}
                {breaks.map((b) => (
                  <g key={b.x}>
                    <line x1={b.x + 8} x2={b.x + breakW - 12} y1={ground} y2={ground} className="chs-hair" strokeDasharray="2 4" strokeOpacity={0.5} />
                    <text x={b.x + breakW / 2 - 2} y={top + skyH / 2 - 2} textAnchor="middle" className="chs-axis">
                      {countWord(b.months)}
                    </text>
                    <text x={b.x + breakW / 2 - 2} y={top + skyH / 2 + 14} textAnchor="middle" className="chs-axis">
                      months
                    </text>
                  </g>
                ))}
                {placed.map(({ group, groupStart, groupEnd, mark }) =>
                  mark === group.marks[0] ? <line key={`g${mark.sessionId}`} x1={groupStart} x2={groupEnd} y1={ground} y2={ground} className="chs-hair" strokeOpacity={0.3} /> : null
                )}
                {placed.map(({ mark, x }, i) => {
                  const hot = card.hot === mark.sessionId;
                  const delay = reduced ? 0 : 150 + i * 55;
                  const cx = x + colW / 2;
                  return (
                    <g key={mark.sessionId}>
                      <rect x={x + 1} y={top} width={colW - 2} height={skyH} rx={2} fill="var(--ink)" fillOpacity={hot ? 0.07 : 0.025} />
                      <g
                        style={{
                          opacity: settled ? 1 : 0,
                          transform: settled ? 'none' : 'translateY(-10px)',
                          transition: `opacity 360ms ease ${delay}ms, transform 900ms ease-out ${delay}ms`
                        }}
                      >
                        {streaks(mark.sky, x + 1, top, colW - 2, skyH, i * 977 + 13).map(([sx, sy], k) => (
                          <line key={k} x1={sx} y1={sy} x2={sx - 2} y2={sy + 6} stroke="var(--ink)" strokeOpacity={hot ? 0.8 : 0.42} strokeWidth={1} />
                        ))}
                      </g>
                      <text
                        x={cx}
                        y={finishY}
                        textAnchor="middle"
                        className={podium(mark) ? 'chs-place' : 'chs-axis'}
                        fontSize={podium(mark) ? 13 : undefined}
                        fill={podium(mark) || hot ? tint : undefined}
                        style={{ opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay + 200}ms` }}
                      >
                        {finishText(mark)}
                      </text>
                      <rect
                        x={x}
                        y={top}
                        width={colW}
                        height={finishY + 6 - top}
                        fill="transparent"
                        style={{ cursor: 'pointer' }}
                        {...card.bind(mark.sessionId, () => tipOf(mark, cx, top, finishY + 6), openFor(mark))}
                      />
                    </g>
                  );
                })}
                {monthTicks.map((tick, i) => {
                  const [y4, m2] = tick.label.split('-');
                  const month = Number(m2) - 1;
                  const showYear = i === 0 || monthTicks[i - 1].label.slice(0, 4) !== y4;
                  return (
                    <text key={tick.label} x={tick.x} y={monthY} className="chs-axis">
                      {monthShort(month)}
                      {showYear ? ` ${y4}` : ''}
                    </text>
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
