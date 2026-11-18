import { useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { raceHref } from '../careerExplorer';
import { GROUP_LABEL, type Rival, type RivalRace } from './rivalsModel';
import { GOLD_TEXT, INK, PHONE_ROWS, RivalCard, TyreDefs, tyreHref, useMarks, type Mark, type SortKey } from './rivalsTyres';

/**
 * ?ddrivals=grid: the rivals on the INDY NXT calendar (career round 2,
 * November 17, 2026). Every race of his INDY NXT career is a column in date
 * order, every rival a row, every race they both finished a tyre in its
 * column. A column is one race day, so pointing at it reads that race against
 * everyone; the empty slots show who came and went over the three seasons.
 * On reveal the tyres roll into place race by race, left to right.
 */

interface Column {
  race: RivalRace;
  index: number;
  x: number;
}

export const RaceGrid = ({ rivals, sort, phoneBoard }: { rivals: Rival[]; sort: SortKey; /** Shown instead on a phone, where 45 columns are too small to read. */ phoneBoard?: ReactNode }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.12);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [all, setAll] = useState(false);
  const prefix = `rvg${useId().replace(/:/g, '')}`;
  const shown = reduced || inView;

  /* Every race any charted rival shared with him, in date order. */
  const races = useMemo(() => {
    const byId = new Map<string, RivalRace>();
    for (const rival of rivals) for (const race of rival.list) if (!byId.has(race.sessionId)) byId.set(race.sessionId, race);
    return [...byId.values()].sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
  }, [rivals]);
  const seasons = useMemo(() => {
    const out: Array<{ year: number | null; from: number; to: number }> = [];
    races.forEach((race, index) => {
      const last = out[out.length - 1];
      if (last && last.year === race.year) last.to = index;
      else out.push({ year: race.year, from: index, to: index });
    });
    return out;
  }, [races]);

  const phone = width > 0 && width < 640;
  const visible = phone && !all ? rivals.slice(0, PHONE_ROWS) : rivals;
  const n = Math.max(1, races.length);
  const gapUnits = 0.9 * Math.max(0, seasons.length - 1);

  /* ---- geometry ---- */
  const nameCol = phone ? 0 : width >= 1100 ? 178 : 150;
  const recCol = phone ? 0 : 64;
  const fit = (width - nameCol - (phone ? 0 : 14) - recCol) / (n + gapUnits);
  const colW = Math.max(5, Math.min(phone ? 14 : width >= 2000 ? 26 : 23, Math.floor(fit * 4) / 4));
  const seasonGap = colW * 0.9;
  const gridW = colW * n + seasonGap * Math.max(0, seasons.length - 1);
  /* Names, grid and records as one block, centred when the columns hit their cap. */
  const blockX = phone ? 0 : Math.max(0, (width - (nameCol + 14 + gridW + recCol)) / 2);
  const nameX = blockX + nameCol;
  const x0 = phone ? Math.max(0, (width - gridW) / 2) : nameX + 14;
  const r = colW / 2 - Math.max(0.4, colW * 0.06);
  const header = phone ? 30 : 36;
  const lineH = phone ? 17 : 0;
  const rowH = phone ? lineH + colW + 9 : Math.max(18, colW + 3);
  const groupGap = sort === 'record' ? (phone ? 24 : 30) : 0;

  const columns: Column[] = races.map((race, index) => {
    const season = seasons.findIndex((s) => index >= s.from && index <= s.to);
    return { race, index, x: x0 + index * colW + season * seasonGap + colW / 2 };
  });
  const colById = new Map(columns.map((column) => [column.race.sessionId, column]));

  const places: Array<{ rival: Rival; y: number }> = [];
  const groupHeads: Array<{ group: Rival['group']; y: number; count: number }> = [];
  let y = header;
  visible.forEach((rival, index) => {
    if (sort === 'record' && (index === 0 || visible[index - 1].group !== rival.group)) {
      y += index === 0 ? groupGap - 8 : groupGap;
      groupHeads.push({ group: rival.group, y: y - 9, count: rivals.filter((other) => other.group === rival.group).length });
    }
    places.push({ rival, y });
    y += rowH;
  });
  const height = y + 4;
  const tyreY = phone ? lineH + colW / 2 : rowH / 2;

  /* Column totals for the race card: charted rivals he beat and lost to that day. */
  const columnRecord = (sessionId: string) => {
    let ahead = 0;
    let behind = 0;
    for (const rival of rivals) {
      const race = rival.list.find((item) => item.sessionId === sessionId);
      if (!race) continue;
      if (race.ahead) ahead += 1;
      else behind += 1;
    }
    return { ahead, behind };
  };

  const marks: Mark[] = [];
  places.forEach((place) => {
    for (const race of place.rival.list) {
      const column = colById.get(race.sessionId);
      if (!column) continue;
      const mx = column.x;
      const my = place.y + tyreY;
      marks.push({
        key: `s:${place.rival.name}|${race.sessionId}`,
        x: mx,
        y: my,
        r,
        open: raceHref(race.sessionId),
        focus: () => ({ kind: 'race', rival: place.rival, race, x: mx, y: my, r })
      });
    }
  });
  const bands: Mark[] = [
    ...places.map((place): Mark => {
      const bx = phone ? width / 2 : nameX - nameCol / 2;
      const by = place.y + (phone ? 8 : rowH / 2);
      return {
        key: `r:${place.rival.name}`,
        x: bx,
        y: by,
        r: 0,
        hw: phone ? width / 2 : nameCol / 2 + 6,
        hh: phone ? 9 : rowH / 2,
        open: null,
        focus: () => ({ kind: 'rival', rival: place.rival, x: phone ? width / 2 : bx, y: phone ? place.y + 2 : by, r: phone ? 0 : rowH / 2 - 2 })
      };
    }),
    ...columns.map(
      (column): Mark => ({
        key: `c:${column.race.sessionId}`,
        x: column.x,
        y: (header - 14 + height) / 2,
        r: 0,
        hw: colW / 2,
        hh: (height - header + 14) / 2,
        open: raceHref(column.race.sessionId),
        focus: () => ({ kind: 'column', race: column.race, ...columnRecord(column.race.sessionId), x: column.x, y: header - 8, r: 4 })
      })
    )
  ];

  const { tap, focus, handlers } = useMarks(svgRef, marks, bands, (mr, finger) => (finger ? Math.max(mr * 1.3, 8) : Math.max(mr * 1.1, 5)));
  const hotRival = focus && focus.kind !== 'column' ? focus.rival.name : null;
  const hotRace = focus && focus.kind !== 'rival' ? focus.race.sessionId : null;
  const hotColumn = hotRace ? colById.get(hotRace) : undefined;

  const ease = 'cubic-bezier(0.22, 0.75, 0.3, 1)';
  const rollStyle = (column: number, rowIndex: number): CSSProperties => {
    if (reduced) return {};
    const d = colW * 1.6;
    const deg = (d / r) * (180 / Math.PI);
    const delay = column * 34 + rowIndex * 5;
    return {
      transform: shown ? 'translateX(0px) rotate(0deg)' : `translateX(${-d}px) rotate(${-deg}deg)`,
      opacity: shown ? 1 : 0,
      transition: `transform 380ms ${ease} ${delay}ms, opacity 120ms linear ${delay}ms`
    };
  };

  return (
    <div ref={viewRef} className="rv rv-grid">
      <div ref={ref} className="rv__board">
        {phone && phoneBoard ? (
          phoneBoard
        ) : width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`Every INDY NXT race against ${rivals.length} rivals: one column per race, one tyre where both finished, gold-rimmed where Bryce finished ahead`}
            {...handlers}
          >
            <TyreDefs prefix={prefix} />
            {hotColumn ? (
              <rect x={hotColumn.x - colW / 2} y={header - 12} width={colW} height={height - header + 12} rx={Math.min(6, colW / 2)} className="rv-grid__band" />
            ) : null}
            {seasons.map((season) => {
              const left = columns[season.from].x - colW / 2;
              const right = columns[season.to].x + colW / 2;
              return (
                <g key={season.year ?? 'unknown'}>
                  <text x={left} y={header - 17} className="rv-grid__season" fontFamily={chartFont}>
                    {season.year}
                    <tspan className="rv-grid__count" dx={6}>
                      {season.to - season.from + 1} races
                    </tspan>
                  </text>
                  <line x1={left} x2={right} y1={header - 11} y2={header - 11} className="rv-grid__rule" />
                </g>
              );
            })}

            {groupHeads.map((head) => (
              <text key={head.group} x={phone ? 0 : blockX} y={head.y} textAnchor="start" className="rv__group" fontFamily={chartFont}>
                {GROUP_LABEL[head.group]} · {head.count}
              </text>
            ))}

            {places.map((place, rowIndex) => {
              const { rival } = place;
              const faded = hotRival !== null && hotRace === null && hotRival !== rival.name;
              const shared = new Set(rival.list.map((race) => race.sessionId));
              return (
                <g
                  key={rival.name}
                  className="rv__row"
                  style={{
                    transform: `translate(0px, ${place.y}px)`,
                    transition: reduced ? undefined : 'transform 520ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease',
                    opacity: faded ? 0.3 : 1
                  }}
                >
                  <text
                    x={phone ? 0 : nameX}
                    y={phone ? 12 : rowH / 2 + 4.5}
                    textAnchor={phone ? 'start' : 'end'}
                    className={`rv__name${hotRival === rival.name ? ' rv__name--hot' : ''}`}
                    fontFamily={chartFont}
                    data-rival={rival.name}
                  >
                    {rival.name}
                  </text>
                  <text x={phone ? width : x0 + gridW + 12} y={phone ? 12 : rowH / 2 + 4.5} textAnchor={phone ? 'end' : 'start'} className="rv__rec" fontFamily={chartFont}>
                    <tspan fill={GOLD_TEXT}>{rival.ahead}</tspan>
                    <tspan fill="var(--ink-muted)">–</tspan>
                    <tspan fill={INK}>{rival.behind}</tspan>
                  </text>
                  {columns.map((column) =>
                    shared.has(column.race.sessionId) ? null : (
                      <circle key={column.race.sessionId} cx={column.x} cy={tyreY} r={Math.max(1, r * 0.2)} className="rv-grid__slot" />
                    )
                  )}
                  {rival.list.map((race) => {
                    const column = colById.get(race.sessionId);
                    if (!column) return null;
                    const isFocus = hotRace === race.sessionId && hotRival === rival.name;
                    return (
                      <g key={race.sessionId} transform={`translate(${column.x}, ${tyreY})`} data-race={race.sessionId} className="rv-ty__tyre">
                        <g className="rv-ty__roll" style={rollStyle(column.index, rowIndex)}>
                          <use href={tyreHref(prefix, race.ahead, r)} x={-r} y={-r} width={r * 2} height={r * 2} />
                        </g>
                        {isFocus ? <circle r={r + 2} fill="none" stroke="var(--ink)" strokeWidth={1.3} /> : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        ) : null}
        {focus && !(phone && phoneBoard) ? <RivalCard focus={focus} width={width} tap={tap} coarse={coarse} /> : null}
      </div>
      {phone && !phoneBoard && rivals.length > PHONE_ROWS ? (
        <button type="button" className="rv__more" onClick={() => setAll((value) => !value)} aria-expanded={all}>
          {all ? `The first ${PHONE_ROWS}` : `All ${rivals.length} drivers`}
        </button>
      ) : null}
    </div>
  );
};
