import { useMemo, useState, type CSSProperties } from 'react';
import { uiDataPackage } from '../../data/uiDataPackage';
import {
  chartFont,
  useCoarsePointer,
  useInViewOnce,
  useMeasuredWidth,
  useReducedMotion,
  type ChartTip
} from '../../app/charts';
import { useTapPreview } from '../../app/tapPreview';
import { SourcePill } from '../../app/components';
import { switchValue } from '../../review/switches';
import { Segmented, useCareerRows } from '../careerExplorer';
import { DeepDive, DeepTip } from './frame';
import { GROUP_LABEL, TEAMMATE_FLOOR, recordDetail, teammateWords, toRival, type Rival } from './rivalsModel';
import { GOLD, TyreBoard, TyreKey } from './rivalsTyres';
import { RaceGrid } from './rivalsGrid';
import './rivals.css';

/**
 * The rivals. Round 2 (November 17, 2026, Jack: "more interesting shapes
 * instead of just the generic boxes ... car tires or something like that"):
 * every race the two of them both finished is a tyre, and each tyre is a real
 * race with its own card and track still (headToHead[].sharedRaces).
 *
 * `?ddrivals=` switches the design:
 *   (default) tyres: the board, rival's tyres left of the name, Bryce's right,
 *             rolling out from the names on reveal (rivalsTyres.tsx);
 *   grid:     every INDY NXT race a column, every rival a row (rivalsGrid.tsx);
 *   boxes:    the squares board live before round 2 (below);
 *   tiles:    one small waffle per rival (below).
 */

const GOLD_TEXT = 'var(--link)'; /* the same hue at text contrast */
const INK = '#3a3a3f'; /* the house ramp's ink pole */
const PHONE_ROWS = 12;

type SortKey = 'shared' | 'record';
type Design = 'auto' | 'tyres' | 'grid' | 'boxes' | 'tiles';

/* ---------- the board: one named row per rival, races as squares ---------- */

interface RowPlace {
  rival: Rival;
  y: number;
}

const Board = ({ rivals, sort }: { rivals: Rival[]; sort: SortKey }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.15);
  const reduced = useReducedMotion();
  const tap = useTapPreview();
  const [tip, setTip] = useState<ChartTip | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const shown = reduced || inView;

  const phone = width > 0 && width < 640;
  const maxL = Math.max(...rivals.map((rival) => rival.behind));
  const maxR = Math.max(...rivals.map((rival) => rival.ahead));
  const visible = phone && !all ? rivals.slice(0, PHONE_ROWS) : rivals;

  /* ---- geometry ---- */
  const header = phone ? 26 : 30;
  let cell: number;
  let rowH: number;
  let nameCol = 0;
  let countW = 0;
  let teamCol = 0;
  let spineL: number; /* where the rival's squares start, growing left */
  let spineR: number; /* where Bryce's squares start, growing right */
  let groupGap = 0;
  if (phone) {
    /* The squares on one line under the name and record; the spine sits
     * where the longest ink row and the longest gold row both fit. */
    cell = Math.max(3.5, Math.floor(((width - 8) / (maxL + maxR)) * 4) / 4);
    rowH = 20 + cell + 9;
    spineL = Math.round((width - (maxL + maxR) * cell) / 2 + maxL * cell) - 1.5;
    spineR = spineL + 3;
    groupGap = sort === 'record' ? 26 : 0;
  } else {
    nameCol = width >= 1100 ? 176 : 150;
    countW = 26;
    teamCol = 150; /* room for "teammates for 31 of 45" after the longest gold row */
    const avail = width - nameCol - 2 * countW - teamCol - 16;
    cell = Math.max(5, Math.min(width >= 1500 ? 15 : 13, Math.floor(avail / (maxL + maxR))));
    rowH = Math.max(19, cell + 6);
    const total = countW + maxL * cell + nameCol + maxR * cell + countW + teamCol;
    const x0 = Math.max(0, (width - total) / 2);
    spineL = x0 + countW + maxL * cell;
    spineR = spineL + nameCol;
    groupGap = sort === 'record' ? 30 : 0;
  }
  const gap = Math.max(1, Math.round(cell * 0.22));
  const sq = cell - gap;

  const places: RowPlace[] = [];
  const groupHeads: Array<{ group: Rival['group']; y: number; count: number }> = [];
  let y = header;
  visible.forEach((rival, index) => {
    if (sort === 'record' && (index === 0 || visible[index - 1].group !== rival.group)) {
      y += index === 0 ? groupGap - 8 : groupGap;
      groupHeads.push({ group: rival.group, y: y - 8, count: rivals.filter((r) => r.group === rival.group).length });
    }
    places.push({ rival, y });
    y += rowH;
  });
  const height = y + 4;
  const sqTop = phone ? 21 : (rowH - sq) / 2;
  const nameBase = phone ? 14 : rowH / 2 + 4.5;

  const showTip = (place: RowPlace) => {
    setHovered(place.rival.name);
    setTip({
      x: phone ? width / 2 : (spineL + spineR) / 2,
      y: place.y + (phone ? 2 : 0),
      over: place.y,
      under: place.y + rowH,
      title: place.rival.name,
      detail: recordDetail(place.rival),
      action: null
    });
  };
  const hide = () => {
    setHovered(null);
    setTip(null);
  };

  const ease = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const labelStyle = (rowIndex: number, n: number): CSSProperties =>
    reduced ? {} : { opacity: shown ? 1 : 0, transition: `opacity 220ms ease ${rowIndex * 12 + n * 13 + 80}ms` };
  const squareStyle = (rowIndex: number, k: number): CSSProperties =>
    reduced
      ? {}
      : {
          transform: shown ? 'scale(1)' : 'scale(0)',
          transition: `transform 240ms ${ease} ${rowIndex * 12 + k * 13}ms`
        };

  return (
    <div ref={viewRef} className="rv">
      <div ref={ref} className="rv__board">
        {width > 0 ? (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={`Head-to-head records against ${rivals.length} INDY NXT rivals: one square per shared race, gold where Bryce finished ahead, ink where the rival did`}
            onMouseLeave={hide}
          >
            {/* the two sides, labelled in place */}
            <text x={spineL - (phone ? 6 : 4)} y={header - 12} textAnchor="end" className="rv__side" fill={INK} fontFamily={chartFont}>
              ← rival ahead
            </text>
            <text x={spineR + (phone ? 6 : 4)} y={header - 12} textAnchor="start" className="rv__side" fill={GOLD_TEXT} fontFamily={chartFont}>
              Bryce ahead →
            </text>

            {groupHeads.map((head) => (
              <text
                key={head.group}
                x={phone ? 0 : (spineL + spineR) / 2}
                y={head.y}
                textAnchor={phone ? 'start' : 'middle'}
                className="rv__group"
                fontFamily={chartFont}
              >
                {GROUP_LABEL[head.group]} · {head.count}
              </text>
            ))}

            {places.map((place, rowIndex) => {
              const { rival } = place;
              const faded = hovered !== null && hovered !== rival.name;
              const team = teammateWords(rival);
              const leftTip = spineL - rival.behind * cell;
              const rightTip = spineR + rival.ahead * cell;
              return (
                <g
                  key={rival.name}
                  className="rv__row"
                  style={{
                    transform: `translate(0px, ${place.y}px)`,
                    transition: reduced ? undefined : `transform 520ms ${ease}, opacity 160ms ease`,
                    opacity: faded ? 0.32 : 1
                  }}
                >
                  {phone ? (
                    <>
                      <text x={0} y={nameBase} className="rv__name" fontFamily={chartFont}>
                        {rival.name}
                        {team ? <tspan className="rv__team" dx={7}>{team}</tspan> : null}
                      </text>
                      <text x={width} y={nameBase} textAnchor="end" className="rv__rec" fontFamily={chartFont}>
                        <tspan fill={GOLD_TEXT}>{rival.ahead}</tspan>
                        <tspan fill="var(--ink-muted)">–</tspan>
                        <tspan fill={INK}>{rival.behind}</tspan>
                      </text>
                    </>
                  ) : (
                    <>
                      <text x={(spineL + spineR) / 2} y={nameBase} textAnchor="middle" className="rv__name" fontFamily={chartFont}>
                        {rival.name}
                      </text>
                      <text x={leftTip - 6} y={nameBase} textAnchor="end" className="rv__count" fill={INK} fontFamily={chartFont} style={labelStyle(rowIndex, rival.behind)}>
                        {rival.behind}
                      </text>
                      <text x={rightTip + 6} y={nameBase} textAnchor="start" className="rv__count" fill={GOLD_TEXT} fontFamily={chartFont} style={labelStyle(rowIndex, rival.ahead)}>
                        {rival.ahead}
                        {team ? (
                          <tspan className="rv__team" dx={10}>
                            {team}
                          </tspan>
                        ) : null}
                      </text>
                    </>
                  )}
                  {phone ? <line x1={(spineL + spineR) / 2} x2={(spineL + spineR) / 2} y1={sqTop - 3} y2={sqTop + sq + 3} stroke="var(--axis-baseline)" /> : null}
                  {Array.from({ length: rival.behind }, (_, k) => (
                    <rect
                      key={`b${k}`}
                      x={spineL - (k + 1) * cell + gap / 2}
                      y={sqTop}
                      width={sq}
                      height={sq}
                      rx={sq > 6 ? 1.5 : 0.75}
                      fill={INK}
                      className="rv__sq"
                      style={squareStyle(rowIndex, k)}
                    />
                  ))}
                  {Array.from({ length: rival.ahead }, (_, k) => (
                    <rect
                      key={`a${k}`}
                      x={spineR + k * cell + gap / 2}
                      y={sqTop}
                      width={sq}
                      height={sq}
                      rx={sq > 6 ? 1.5 : 0.75}
                      fill={GOLD}
                      className="rv__sq"
                      style={squareStyle(rowIndex, k)}
                    />
                  ))}
                  <rect
                    x={0}
                    y={0}
                    width={width}
                    height={rowH}
                    fill="transparent"
                    className="rv__hit"
                    {...tap.target(rival.name, { show: () => showTip(place), hide })}
                  />
                </g>
              );
            })}
          </svg>
        ) : null}
        {tip ? <DeepTip tip={tip} width={width} tap={tap} /> : null}
      </div>
      {phone && rivals.length > PHONE_ROWS ? (
        <button type="button" className="rv__more" onClick={() => setAll((value) => !value)} aria-expanded={all}>
          {all ? `The first ${PHONE_ROWS}` : `All ${rivals.length} drivers`}
        </button>
      ) : null}
    </div>
  );
};

/* ---------- the tiles: one small waffle per rival ---------- */

const Tiles = ({ rivals }: { rivals: Rival[] }) => {
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.1);
  const reduced = useReducedMotion();
  const shown = reduced || inView;
  return (
    <div ref={viewRef} className={`rv-tiles${shown ? ' rv-tiles--in' : ''}${reduced ? ' rv-tiles--still' : ''}`}>
      <div className="rv-tiles__key" aria-hidden>
        <span><i style={{ background: GOLD }} />Bryce ahead</span>
        <span><i style={{ background: INK }} />rival ahead</span>
        <span className="rv-tiles__keynote">one square per shared race</span>
      </div>
      <ol className="rv-tiles__grid">
        {rivals.map((rival, index) => {
          return (
            <li
              key={rival.name}
              className="rv-tile"
              aria-label={`${rival.name}: ${recordDetail(rival)}`}
              style={{ '--i': index } as CSSProperties}
            >
              <div className="rv-tile__name">{rival.name}</div>
              <div className="rv-tile__rec">
                <span style={{ color: GOLD_TEXT }}>{rival.ahead}</span>
                <span className="rv-tile__dash">–</span>
                <span style={{ color: INK }}>{rival.behind}</span>
              </div>
              <div className="rv-tile__waffle" aria-hidden>
                {Array.from({ length: rival.races }, (_, k) => (
                  <i key={k} style={{ background: k < rival.ahead ? GOLD : INK, '--k': k } as CSSProperties} />
                ))}
              </div>
              <div className="rv-tile__team">{rival.teammates >= TEAMMATE_FLOOR ? `teammates for ${rival.teammates} races` : ''}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/* ---------- the section ---------- */

export const RivalsDeepDive = () => {
  const raw = switchValue('ddrivals');
  const design: Design = raw === 'tyres' || raw === 'grid' || raw === 'boxes' || raw === 'tiles' ? raw : 'auto';
  const coarse = useCoarsePointer();
  const [sort, setSort] = useState<SortKey>('shared');
  const all = uiDataPackage.screens.careerLab.headToHead ?? [];
  const careerRows = useCareerRows();
  const rowsById = useMemo(() => new Map(careerRows.map((row) => [row.sessionId, row])), [careerRows]);

  /* Five shared races is the honest floor, as before: below that a record is a coin flip. */
  const charted = useMemo(
    () => all.filter((rival) => (rival.racesTogether ?? 0) >= 5 && rival.bryceAhead !== null && rival.bryceBehind !== null),
    [all]
  );
  const smallSample = all.length - charted.length;
  const rivals = useMemo(() => charted.map((rival) => toRival(rival, rowsById)), [charted, rowsById]);
  const ordered = useMemo(() => {
    if (sort === 'shared') return rivals; /* the package's own order: most shared races first */
    const rank = { bryce: 0, level: 1, rival: 2 } as const;
    return [...rivals].sort(
      (a, b) => rank[a.group] - rank[b.group] || b.share - a.share || b.races - a.races
    );
  }, [rivals, sort]);
  const perRace = design === 'auto' || design === 'tyres' || design === 'grid';

  if (charted.length === 0) return null;
  const mostShared = charted[0];

  return (
    <DeepDive
      className="dd--rivals"
      figure={charted.length}
      unit="drivers shared an INDY NXT grid with him five or more times"
      lede={
        <>
          Nobody shared more grids with him than <strong>{mostShared.driverName}</strong>, and Bryce finished ahead in{' '}
          <strong>
            {mostShared.bryceAhead} of {mostShared.racesTogether}
          </strong>
          .
        </>
      }
      sources={
        <SourcePill
          title="The rivals"
          entries={[
            {
              label: 'INDY NXT head-to-head records',
              path: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head.csv',
              note: 'Official classified finishes for every driver Bryce has shared an INDY NXT grid with, 2024–26. Counts races where both cars were classified; the chart holds rivals with five or more shared races.'
            },
            perRace
              ? {
                  label: 'How the tyres are drawn',
                  path: 'analysis/indy-nxt-discovery/output/tables/indy_nxt_head_to_head_races.csv',
                  note: `Each tyre is one race both cars were classified: gold-rimmed when Bryce finished ahead, plain black when the rival did. ${
                    design === 'grid'
                      ? 'Each column is one INDY NXT race in date order; an empty slot is a race the two did not both finish.'
                      : design === 'tyres'
                        ? 'Each side runs in date order, the first race nearest the name.'
                        : 'On a laptop or wider each column is one INDY NXT race in date order, and an empty slot is a race the two did not both finish; on a phone each rival is two rows of tyres, Bryce’s above, in date order.'
                  } The race list is rebuilt from the same race results by the same rule as the totals and checked against them. "Teammates" names a rival who shared Bryce's team in ${TEAMMATE_FLOOR} or more of their races. ${smallSample} more drivers shared fewer than five races and are left off.`
                }
              : {
                  label: 'How the squares are drawn',
                  note: `Each square is one race both cars finished: gold when Bryce was classified ahead, ink when the rival was. A row's squares are grouped by who finished ahead, not drawn in race order. "Teammates" names a rival who shared Bryce's team in ${TEAMMATE_FLOOR} or more of their races. ${smallSample} more drivers shared fewer than five races and are left off.`
                }
          ]}
          caveats={uiDataPackage.screens.careerLab.caveats}
        />
      }
      controls={
        <Segmented<SortKey>
          options={[
            { value: 'shared', label: 'Most races together' },
            { value: 'record', label: 'By record' }
          ]}
          value={sort}
          onChange={setSort}
        />
      }
      foot={
        <>
          {smallSample > 0 ? `${smallSample} more drivers shared fewer than five races` : null}
          {design === 'tiles'
            ? null
            : `${smallSample > 0 ? ' · ' : ''}${
                perRace
                  ? coarse
                    ? 'tap a tyre for the race, a name for the record'
                    : 'hover a tyre for the race and its track, a name for the record; click a tyre to open the race'
                  : `${coarse ? 'tap' : 'hover'} a driver for the record`
              }`}
        </>
      }
    >
      {design === 'grid' || design === 'auto' ? <TyreKey wideOnly={design === 'auto'} /> : null}
      {design === 'tiles' ? (
        <Tiles rivals={ordered} />
      ) : design === 'boxes' ? (
        <Board rivals={ordered} sort={sort} />
      ) : design === 'grid' ? (
        <RaceGrid rivals={ordered} sort={sort} />
      ) : design === 'auto' ? (
        <RaceGrid rivals={ordered} sort={sort} phoneBoard={<TyreBoard rivals={ordered} sort={sort} />} />
      ) : (
        <TyreBoard rivals={ordered} sort={sort} />
      )}
    </DeepDive>
  );
};
