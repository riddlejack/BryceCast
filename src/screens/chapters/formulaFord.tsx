/* Formula Ford, 2019–20: the British year, and the wettest of his career.
 * Every Formula Ford race has the series' own condition report (TSL), and
 * by those reports nearly half his classified races ran wet or mixed. The
 * visual is the year on a calendar: each race at its finish, rain falling on
 * the ones the reports call wet or mixed, the long gap between the 2019
 * Festival and the 2020 season folded, the big meetings named. */

import { useMemo } from 'react';
import { PointerWord, useMeasuredWidth } from '../../app/charts';
import { useCareerRows, type CareerRow } from '../careerExplorer';
import { countWord, dayNumber, lab, monthShort, openOf, rowTip, Signature, tintOf, unclassifiedOf, useEntrance, useRaceCard, useSeriesRows, EASE } from './common';

const SERIES = 'series_formula_ford';
const GAP_DAYS = 60;

const eventNameOf = (() => {
  let map: Map<string, string> | null = null;
  return (sessionId: string): string => {
    if (!map) {
      map = new Map();
      for (const row of lab.resultConversion ?? []) map.set(String(row.sessionId), String(row.eventName ?? ''));
      for (const row of lab.unclassifiedRaces ?? []) map.set(row.sessionId, row.eventName ?? '');
    }
    return map.get(sessionId) ?? '';
  };
})();

const bigMeeting = (eventName: string): string | null => {
  const year = eventName.match(/(20\d\d)/)?.[1] ?? '';
  if (/Walter Hayes/i.test(eventName)) return `Walter Hayes Trophy`;
  if (/Formula Ford Festival/i.test(eventName)) return `Festival ${year}`.trim();
  return null;
};

type Mark = { kind: 'race'; row: CareerRow; date: string } | { kind: 'out'; sessionId: string; status: string; date: string; trackName: string };

export const FormulaFordSignature = () => {
  const rows = useSeriesRows(SERIES);
  const all = useCareerRows();
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [stageRef, settled, reduced] = useEntrance<HTMLDivElement>();
  const card = useRaceCard();
  const tint = tintOf(SERIES);

  const marks = useMemo(() => {
    const list: Mark[] = [
      ...rows.map((row): Mark => ({ kind: 'race', row, date: row.date })),
      ...unclassifiedOf(SERIES).map((race): Mark => ({ kind: 'out', sessionId: race.sessionId, status: race.status, date: race.date, trackName: race.trackName }))
    ];
    return list.sort((a, b) => a.date.localeCompare(b.date) || idOf(a).localeCompare(idOf(b)));
  }, [rows]);

  if (rows.length === 0) return null;

  const wet = rows.filter((row) => row.wetDry === 'wet' || row.wetDry === 'mixed');
  const share = (list: CareerRow[]) => (list.length ? list.filter((row) => row.wetDry === 'wet' || row.wetDry === 'mixed').length / list.length : 0);
  const wettest = [...new Set(all.map((row) => row.seriesId))].every((id) => id === SERIES || share(all.filter((row) => row.seriesId === id)) < share(rows));
  const wetPodiums = wet.filter((row) => row.finish <= 3).length;
  const worst = Math.max(...rows.map((row) => row.finish));
  const outs = marks.filter((mark) => mark.kind === 'out');

  /* The time axis, with any stretch over two months without a race folded to a short break. */
  const days = marks.map((mark) => dayNumber(mark.date));
  const segments: Array<{ from: number; to: number }> = [];
  for (const day of days) {
    const last = segments[segments.length - 1];
    if (last && day - last.to <= GAP_DAYS) last.to = day;
    else segments.push({ from: day, to: day });
  }
  const longestGap = segments.length > 1 ? Math.max(...segments.slice(1).map((seg, i) => seg.from - segments[i].to)) : 0;
  const gapMonths = Math.round(longestGap / 30.44);

  const phone = width > 0 && width < 520;
  const left = 38;
  const right = 8;
  const breakW = phone ? 30 : 64;
  const minSeg = phone ? 30 : 56;
  const top = 46;
  const step = phone ? 14 : 16;
  const y = (place: number) => top + (place - 1) * step;
  const plotBottom = y(worst);
  const outY = plotBottom + (outs.length ? 24 : 0);
  const height = outY + 42;
  const usable = Math.max(width - left - right - breakW * (segments.length - 1) - minSeg * segments.length, 60);
  const totalSpan = segments.reduce((sum, seg) => sum + (seg.to - seg.from), 0) || 1;
  const segX: number[] = [];
  let cursor = left;
  for (const seg of segments) {
    segX.push(cursor);
    cursor += minSeg + ((seg.to - seg.from) / totalSpan) * usable + breakW;
  }
  const xOfDay = (day: number) => {
    const s = segments.findIndex((seg) => day >= seg.from && day <= seg.to);
    const seg = segments[Math.max(s, 0)];
    const w = ((seg.to - seg.from) / totalSpan) * usable;
    return segX[Math.max(s, 0)] + minSeg / 2 + (seg.to === seg.from ? 0 : ((day - seg.from) / (seg.to - seg.from)) * w);
  };
  /* Races on one day sit a few pixels apart, in running order. */
  const sameDay = new Map<string, number>();
  const placed = marks.map((mark) => {
    const k = sameDay.get(mark.date) ?? 0;
    sameDay.set(mark.date, k + 1);
    return { mark, k };
  });
  const countOn = (date: string) => sameDay.get(date) ?? 1;
  const spread = phone ? 5 : 9;
  const xOf = (mark: Mark, k: number) => xOfDay(dayNumber(mark.date)) + (k - (countOn(mark.date) - 1) / 2) * spread;

  const meetingsAt = new Map<string, number>();
  for (const { mark, k } of placed) {
    const label = bigMeeting(eventNameOf(idOf(mark)));
    if (label && !meetingsAt.has(label)) meetingsAt.set(label, xOf(mark, k));
  }
  /* Meeting names over the plot, pushed apart (right to left) so none overlap; a hairline drops to the meeting. */
  const charW = 6.3;
  const meetings = [...meetingsAt.entries()]
    .map(([label, x]) => ({ label: phone ? label.replace(' Trophy', '') : label, x, lx: x }))
    .sort((a, b) => a.x - b.x);
  let limit = width - right;
  for (let i = meetings.length - 1; i >= 0; i -= 1) {
    const half = (meetings[i].label.length * charW) / 2;
    meetings[i].lx = Math.max(left + half, Math.min(meetings[i].x, limit - half));
    limit = meetings[i].lx - half - 10;
  }
  /* Month names: each run of racing opens with its month and year, then a name at each new month. */
  const months: Array<{ x: number; label: string; anchor: 'start' | 'middle' }> = [];
  segments.forEach((seg) => {
    const start = new Date(seg.from * 86_400_000);
    const single = seg.to === seg.from;
    months.push({ x: single ? xOfDay(seg.from) : xOfDay(seg.from) - 4, label: `${monthShort(start.getUTCMonth())} ${start.getUTCFullYear()}`, anchor: single ? 'middle' : 'start' });
    let lastX = xOfDay(seg.from) - 4 + 62;
    for (let day = Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) / 86_400_000; day <= seg.to; ) {
      const date = new Date(day * 86_400_000);
      const x = xOfDay(day);
      if (x - lastX > (phone ? 30 : 24)) {
        months.push({ x, label: monthShort(date.getUTCMonth()), anchor: 'middle' });
        lastX = x + 12;
      }
      day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) / 86_400_000;
    }
  });
  const hover = card.surface(
    placed
      .filter(({ mark }) => mark.kind === 'race')
      .map(({ mark, k }) => {
        const row = (mark as Extract<Mark, { kind: 'race' }>).row;
        const x = xOf(mark, k);
        const cy = y(row.finish);
        return { key: row.sessionId, x, y: cy, tip: () => rowTip(row, x, cy - 8, cy + 8), open: openOf(row) };
      }),
    phone ? 14 : 18
  );

  return (
    <>
      <p className="chapter-panel__narrative">
        The British year{wettest ? ', and the wettest of his career' : ''}: by the series’ own reports, {wet.length} of his {rows.length} classified races ran wet or mixed,
        and {countWord(wetPodiums)} of those ended on the podium. It ran from the 2019 Festival to the 2020 Walter Hayes Trophy, with {countWord(gapMonths)} months
        between that first Festival and his next race.
      </p>
      <div ref={stageRef}>
        <div ref={ref}>
          <Signature
            className="chs-ff"
            tip={card.tip}
            width={width}
            tap={card.tap}
            venues={() => rows.map((row) => ({ sessionId: row.sessionId, trackName: row.trackName }))}
            foot={
              <>
                Each race at its finish, P1 at the top; the dashes are rain, on the races the series called wet or mixed. <PointerWord mouse="Hover" touch="Tap" /> a race for its track.
              </>
            }
          >
            {width > 0 ? (
              <svg width={width} height={height} role="img" aria-label={`Formula Ford: ${rows.length} classified races by date, ${wet.length} of them wet or mixed`}>
                {[1, 5, 10].filter((place) => place <= worst).map((place) => (
                  <g key={place}>
                    <line x1={left - 4} x2={width - right} y1={y(place)} y2={y(place)} className="chs-hair" strokeOpacity={0.07} />
                    <text x={left - 10} y={y(place) + 4} textAnchor="end" className="chs-axis">
                      P{place}
                    </text>
                  </g>
                ))}
                {outs.length ? (
                  <text x={left - 10} y={outY + 4} textAnchor="end" className="chs-axis">
                    DNF
                  </text>
                ) : null}
                {segments.slice(1).map((seg, i) => {
                  const x0 = segX[i + 1] - breakW + 6;
                  const w = breakW - 12;
                  return (
                    <g key={seg.from}>
                      <rect x={x0} y={top - 10} width={w} height={outY - top + 20} rx={3} className="chs-band" />
                      <text x={x0 + w / 2} y={(top + outY) / 2 - 2} textAnchor="middle" className="chs-axis">
                        {phone ? gapMonths : countWord(gapMonths)}
                      </text>
                      <text x={x0 + w / 2} y={(top + outY) / 2 + 14} textAnchor="middle" className="chs-axis">
                        {phone ? 'mo' : 'months'}
                      </text>
                    </g>
                  );
                })}
                {months.map((month, i) => (
                  <text key={i} x={month.x} y={outY + 30} textAnchor={month.anchor} className="chs-axis">
                    {month.label}
                  </text>
                ))}
                {meetings.map((meeting) => (
                  <g key={meeting.label}>
                    <text x={meeting.lx} y={top - 30} textAnchor="middle" className="chs-note">
                      {meeting.label}
                    </text>
                    <line x1={meeting.x} x2={meeting.x} y1={top - 24} y2={top - 14} className="chs-hair" strokeOpacity={0.5} />
                  </g>
                ))}
                <rect x={left} y={top - 12} width={Math.max(width - left - right, 0)} height={outY - top + 24} fill="transparent" {...hover} style={{ cursor: card.hot ? 'pointer' : 'default' }} />
                {placed.map(({ mark, k }, i) => {
                  const x = xOf(mark, k);
                  const delay = reduced ? 0 : 120 + i * 55;
                  if (mark.kind === 'out') {
                    return (
                      <path
                        key={mark.sessionId}
                        d={`M${x - 3},${outY - 3} L${x + 3},${outY + 3} M${x + 3},${outY - 3} L${x - 3},${outY + 3}`}
                        stroke="var(--ink-muted)"
                        strokeWidth={1.2}
                        style={{ opacity: settled ? 1 : 0, transition: `opacity 240ms ease ${delay}ms` }}
                      />
                    );
                  }
                  const row = mark.row;
                  const rainy = row.wetDry === 'wet' || row.wetDry === 'mixed';
                  const hot = card.hot === row.sessionId;
                  const cy = y(row.finish);
                  return (
                    <g key={row.sessionId} style={{ opacity: card.hot !== null && !hot ? 0.4 : 1, transition: 'opacity 160ms ease' }}>
                      {rainy ? (
                        <line pointerEvents="none"
                          x1={x}
                          x2={x}
                          y1={top - 8}
                          y2={cy - 7}
                          stroke="var(--ink)"
                          strokeOpacity={0.4}
                          strokeWidth={1}
                          strokeDasharray="2 3"
                          style={{ transformBox: 'fill-box', transformOrigin: 'center top', transform: `scaleY(${settled ? 1 : 0})`, transition: `transform 700ms ${EASE} ${delay}ms` }}
                        />
                      ) : null}
                      <circle pointerEvents="none" cx={x} cy={cy} r={hot ? 5 : 4} fill={tint} style={{ opacity: settled ? 1 : 0, transition: `opacity 260ms ease ${delay + (rainy ? 380 : 0)}ms` }} />

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

const idOf = (mark: Mark): string => (mark.kind === 'race' ? mark.row.sessionId : mark.sessionId);
