import { useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { chartFont, useCoarsePointer, useInViewOnce, useMeasuredWidth, useReducedMotion } from '../../app/charts';
import { TAP_CARD, TapAction, useTapPreview, useTouchPlacement, type TapPreview } from '../../app/tapPreview';
import { useRouter } from '../../app/router';
import { VenuePeek, useVenuePicture } from '../../app/venuePeek';
import { chapterTint, raceHref } from '../careerExplorer';
import { switchValue } from '../../review/switches';
import { GROUP_LABEL, surname, teammateWords, type Rival, type RivalRace } from './rivalsModel';

/**
 * The rivals as tyres (career round 2, November 17, 2026). Jack: "use more
 * interesting shapes instead of just the generic boxes ... make it be car
 * tires or something like that." Every race the two of them both finished
 * is one tyre seen side-on. Bryce's are the ones with gold: a gold sidewall
 * stripe (the way Firestone marks its alternate compound in red) and gold
 * wheels. The rival's are plain black on silver.
 *
 *   TyreBoard (default): the board's comparison kept, one named row per
 *     rival, the rival's tyres to the left, Bryce's to the right, each side
 *     in date order from the name outward. On reveal they roll out from the
 *     names to their counts, turning as they go.
 *   RaceGrid (?ddrivals=grid): every INDY NXT race a column in date order,
 *     every rival a row, so a column is one race day and the empty cells show
 *     who came and went across 2024–26.
 */

export const GOLD = '#e09a2f'; /* the house ramp's gold pole (charts.inkGoldDiverging) */
export const GOLD_TEXT = 'var(--link)';
export const INK = '#3a3a3f'; /* the house ramp's ink pole */
const RUBBER = '#222225';
const FACE = '#323237';
const METAL = '#c3c2c7';
export const PHONE_ROWS = 12;

/* ---------- the tyre ---------- */

/* Round 3 (November 18, 2026). Jack: "if we could use cleaner tires for the
 * rivals section, that'd be great." The round 2 tyre carried a dashed tread
 * ring, a sidewall stripe and five tapered spokes: at 7-10 px they blurred
 * into noise. The tyre is now three flat shapes plus spokes drawn as plain
 * strokes, every edge at least a pixel wide at the sizes the charts use:
 *
 *   ?rvtyre (default)  spoked: black rubber, a gold (Bryce) or silver (the
 *                      rival) wheel, five straight spokes and a hub; the
 *                      spokes are what you see turn as the tyres roll in.
 *   ?rvtyre=slick      a race slick, no spokes: rubber, wheel, hub, and one
 *                      short white sidewall mark that shows the roll.
 *   ?rvtyre=old        round 2's tyre (tread ring, gold stripe, tapered spokes).
 */
const tyreStyle = (): 'spoked' | 'slick' | 'old' => {
  const asked = switchValue('rvtyre');
  return asked === 'slick' || asked === 'old' ? asked : 'spoked';
};

const SPOKES = [0, 72, 144, 216, 288];

/** One tyre, drawn at unit radius 10 and scaled. */
export const TyreDefs = ({ prefix }: { prefix: string }) => {
  const style = tyreStyle();
  return (
    <defs>
      {(['b', 'r'] as const).map((side) => {
        const wheel = side === 'b' ? GOLD : METAL;
        if (style === 'old') {
          return (
            <g key={side}>
              <symbol id={`${prefix}-${side}`} viewBox="-10 -10 20 20" overflow="visible">
                <circle r={10} fill={RUBBER} />
                <circle r={9.2} fill="none" stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1.2} strokeDasharray="1.5 1.15" />
                {side === 'b' ? <circle r={7.7} fill="none" stroke={GOLD} strokeWidth={1.05} /> : null}
                <circle r={6.1} fill={wheel} />
                {SPOKES.map((angle) => (
                  <path key={angle} d="M -0.8 -2 L -1.4 -5.25 A 5.35 5.35 0 0 1 1.4 -5.25 L 0.8 -2 Z" fill={FACE} fillOpacity={side === 'b' ? 0.42 : 0.36} transform={`rotate(${angle + 36})`} />
                ))}
                <circle r={1.35} fill={FACE} />
              </symbol>
              <symbol id={`${prefix}-${side}s`} viewBox="-10 -10 20 20" overflow="visible">
                <circle r={10} fill={RUBBER} />
                <circle r={6.7} fill={wheel} />
                <circle r={1.9} fill={FACE} />
              </symbol>
            </g>
          );
        }
        const body = (small: boolean) => (
          <>
            <circle r={10} fill={RUBBER} />
            <circle r={6.4} fill={wheel} />
            {style === 'spoked' && !small
              ? SPOKES.map((angle) => (
                  <line key={angle} x1={0} y1={-2.2} x2={0} y2={-5.6} stroke={FACE} strokeOpacity={side === 'b' ? 0.55 : 0.5} strokeWidth={1.25} strokeLinecap="round" transform={`rotate(${angle})`} />
                ))
              : null}
            {style === 'slick' && !small ? <path d="M -3.2 -8.3 A 8.3 8.3 0 0 1 3.2 -8.3" fill="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1.3} strokeLinecap="round" /> : null}
            <circle r={small ? 1.9 : 1.8} fill={FACE} />
          </>
        );
        return (
          <g key={side}>
            <symbol id={`${prefix}-${side}`} viewBox="-10 -10 20 20" overflow="visible">
              {body(false)}
            </symbol>
            <symbol id={`${prefix}-${side}s`} viewBox="-10 -10 20 20" overflow="visible">
              {body(true)}
            </symbol>
          </g>
        );
      })}
    </defs>
  );
};

/* Under 6 px of radius the spokes and the slick's mark become noise (stars on
 * a phone): the small tyre is rubber, wheel and hub. Round 2's cut-over stays 4.6. */
export const tyreHref = (prefix: string, ahead: boolean, r: number) =>
  `#${prefix}-${ahead ? 'b' : 'r'}${r < (tyreStyle() === 'old' ? 4.6 : 6) ? 's' : ''}`;

/** Tyre centres on whole pixels and radii on half pixels, so every tyre's
 *  edge lands the same way on the screen (no soft and sharp neighbours). */
export const snap = (v: number) => Math.round(v);
export const snapR = (r: number) => Math.round(r * 2) / 2;

/** A tyre glyph for a key or a label, in its own little SVG. */
const TyreIcon = ({ ahead, size = 13 }: { ahead: boolean; size?: number }) => {
  const prefix = `rvi${useId().replace(/:/g, '')}`;
  return (
    <svg width={size} height={size} viewBox="-10.5 -10.5 21 21" aria-hidden className="rv-ty__icon">
      <TyreDefs prefix={prefix} />
      <use href={tyreHref(prefix, ahead, size / 2)} x={-10} y={-10} width={20} height={20} />
    </svg>
  );
};

export const TyreKey = ({ wideOnly = false }: { wideOnly?: boolean }) => (
  <div className={`rv-ty__key${wideOnly ? ' rv-ty__key--wide' : ''}`} aria-hidden>
    <span>
      <TyreIcon ahead /> Bryce finished ahead
    </span>
    <span>
      <TyreIcon ahead={false} /> the rival finished ahead
    </span>
    <span className="rv-ty__keynote">one tyre per race they both finished</span>
  </div>
);

/* ---------- what a mark is ---------- */

export type Focus =
  | { kind: 'race'; rival: Rival; race: RivalRace; x: number; y: number; r: number }
  | { kind: 'rival'; rival: Rival; x: number; y: number; r: number }
  | { kind: 'column'; race: RivalRace; ahead: number; behind: number; x: number; y: number; r: number };

const focusKey = (focus: Focus) =>
  focus.kind === 'race' ? `s:${focus.rival.name}|${focus.race.sessionId}` : focus.kind === 'rival' ? `r:${focus.rival.name}` : `c:${focus.race.sessionId}`;

/* ---------- the card: the race and its track, or the rival's record ---------- */

const CardBody = ({ focus, action }: { focus: Focus; action: ReactNode }) => {
  if (focus.kind === 'rival') {
    const team = teammateWords(focus.rival);
    return (
      <div className="rvc__body">
        <strong className="rvc__title">{focus.rival.name}</strong>
        <span className="rvc__record">
          <b style={{ color: GOLD_TEXT }}>{focus.rival.ahead}</b>
          <span className="rvc__dash">–</span>
          <b style={{ color: INK }}>{focus.rival.behind}</b>
          <span className="rvc__words">Bryce ahead in {focus.rival.ahead} of {focus.rival.races} shared races</span>
        </span>
        {team ? <span className="rvc__note">{team}</span> : null}
        {action}
      </div>
    );
  }
  const { race } = focus;
  const year = race.year ?? '';
  if (focus.kind === 'column') {
    const total = focus.ahead + focus.behind;
    return (
      <div className="rvc__body">
        <span className="rvc__meta">
          <i style={{ background: chapterTint('INDY NXT') }} />
          INDY NXT · {year}
        </span>
        <strong className="rvc__title">{race.label}</strong>
        <span className="rvc__line">
          Bryce <b>P{race.bryceFinish}</b> · ahead of <b>{focus.ahead}</b> of the {total} rivals here who finished
        </span>
        {action}
      </div>
    );
  }
  const rivalName = surname(focus.rival.name);
  return (
    <div className="rvc__body">
      <span className="rvc__meta">
        <i style={{ background: chapterTint('INDY NXT') }} />
        INDY NXT · {year}
        {race.sameTeam ? ' · teammates' : ''}
      </span>
      <strong className="rvc__title">{race.label}</strong>
      <span className="rvc__duel">
        <span className={race.ahead ? 'rvc__win' : ''}>
          Bryce <b>P{race.bryceFinish}</b>
        </span>
        <span className="rvc__vs">{race.ahead ? 'ahead of' : 'behind'}</span>
        <span className={race.ahead ? '' : 'rvc__win rvc__win--rival'}>
          {rivalName} <b>P{race.rivalFinish}</b>
        </span>
      </span>
      {action}
    </div>
  );
};

const STILL_W = 248;

export const RivalCard = ({ focus, width, tap, coarse }: { focus: Focus; width: number; tap: TapPreview; coarse: boolean }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const hasRace = focus.kind !== 'rival';
  const touch = coarse || tap.armed !== null;
  const sessionId = focus.kind === 'rival' ? null : focus.race.sessionId;
  const trackName = focus.kind === 'rival' ? null : focus.race.trackName;
  /* The card is placed by its measured height, so place it again once the
   * stills index says whether this race has a picture. */
  const picture = useVenuePicture({ sessionId, trackName });
  const pictureState = !hasRace ? '-' : picture === undefined ? 'loading' : picture ? picture.src600 : 'none';
  const place = useTouchPlacement(ref, focus.x, focus.y - focus.r, focus.y + focus.r, `${focusKey(focus)}|${tap.openArmed ? 1 : 0}|${touch ? 1 : 0}|${pictureState}`);
  const still = hasRace ? <VenuePeek className="rvc__still" sessionId={sessionId} trackName={trackName} /> : null;
  if (touch) {
    return (
      <div ref={ref} className="rvc rvc--touch" style={{ ...place, width: hasRace ? STILL_W + 2 : undefined }} {...{ [TAP_CARD]: '' }} role="status">
        {still}
        <CardBody focus={focus} action={hasRace ? <div className="rvc__tap"><TapAction tap={tap} /></div> : null} />
      </div>
    );
  }
  const cardW = hasRace ? STILL_W + 2 : 250;
  const cardH = hasRace ? 250 : 96;
  const below = focus.y - focus.r - 12 < cardH;
  const left = Math.min(Math.max(focus.x, cardW / 2 + 2), Math.max(width - cardW / 2 - 2, cardW / 2 + 2));
  return (
    <div
      className={`rvc${below ? ' rvc--below' : ''}`}
      style={{ left, top: below ? focus.y + focus.r + 10 : focus.y - focus.r - 10, width: cardW }}
      aria-hidden
    >
      {still}
      <CardBody focus={focus} action={hasRace ? <span className="rvc__action">Click to open the race</span> : null} />
    </div>
  );
};

/* ---------- shared hover plumbing ---------- */

export interface Mark {
  key: string;
  x: number;
  y: number;
  r: number;
  /** Bands only: half width and half height of the box that reads them. */
  hw?: number;
  hh?: number;
  focus: () => Focus;
  open: string | null;
}

export const useMarks = (svg: RefObject<SVGSVGElement | null>, marks: Mark[], bands: Mark[], reachFor: (r: number, finger: boolean) => number) => {
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const coarse = useCoarsePointer();
  const finger = coarse || tap.armed !== null;
  const [focus, setFocus] = useState<Focus | null>(null);
  const clear = () => setFocus(null);
  const find = (event: MouseEvent<Element>): string | null => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return null;
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    let best: Mark | null = null;
    let bestD = Infinity;
    for (const mark of marks) {
      const reach = reachFor(mark.r, finger);
      const dx = mx - mark.x;
      const dy = my - mark.y;
      if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
      const d = dx * dx + dy * dy;
      if (d < bestD && d <= reach * reach) {
        best = mark;
        bestD = d;
      }
    }
    if (!best) best = bands.find((band) => Math.abs(mx - band.x) <= (band.hw ?? band.r) && Math.abs(my - band.y) <= (band.hh ?? band.r)) ?? null;
    if (!best) {
      clear();
      return null;
    }
    setFocus(best.focus());
    return best.key;
  };
  const byKey = new Map([...marks, ...bands].map((mark) => [mark.key, mark]));
  const handlers = tap.surface({
    find,
    clear,
    open: (key) => {
      const href = byKey.get(String(key))?.open;
      return href ? () => navigate(href) : null;
    }
  });
  return { tap, focus, handlers, setFocus };
};

/* ---------- the tyre board ---------- */

interface RowPlace {
  rival: Rival;
  y: number;
}

export type SortKey = 'shared' | 'record';

export const TyreBoard = ({ rivals, sort }: { rivals: Rival[]; sort: SortKey }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const [viewRef, inView] = useInViewOnce<HTMLDivElement>(0.12);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const [all, setAll] = useState(false);
  const prefix = `rvt${useId().replace(/:/g, '')}`;
  const shown = reduced || inView;

  const phone = width > 0 && width < 640;
  const maxL = Math.max(1, ...rivals.map((rival) => rival.behind));
  const maxR = Math.max(1, ...rivals.map((rival) => rival.ahead));
  const visible = phone && !all ? rivals.slice(0, PHONE_ROWS) : rivals;

  /* ---- geometry ----
   * Laptop and up: the board, rival's tyres growing left of the name, Bryce's
   * right. Phone: the two sides stacked under the name, both from the left
   * edge, so the two rows compare as lengths at a tyre size a thumb can hit. */
  const header = phone ? 30 : 34;
  let cell: number;
  let rowH: number;
  let nameCol = 0;
  let spineL = 0;
  let spineR = 0;
  let groupGap = 0;
  if (phone) {
    cell = Math.max(6, Math.min(13, Math.floor(((width - 30) / Math.max(maxL, maxR)) * 4) / 4));
    rowH = 19 + cell * 2 + 2 + 12;
    groupGap = sort === 'record' ? 26 : 0;
  } else {
    nameCol = width >= 1100 ? 180 : 154;
    const countW = 28;
    const teamCol = 150;
    const avail = width - nameCol - 2 * countW - teamCol - 16;
    cell = Math.max(7, Math.min(width >= 1500 ? 17 : 15, Math.floor((avail / (maxL + maxR)) * 4) / 4));
    rowH = Math.max(20, cell + 5);
    const total = countW + maxL * cell + nameCol + maxR * cell + countW + teamCol;
    const x0 = Math.max(0, (width - total) / 2);
    spineL = x0 + countW + maxL * cell;
    spineR = spineL + nameCol;
    groupGap = sort === 'record' ? 32 : 0;
  }
  const r = snapR(cell / 2 - Math.max(0.35, cell * 0.035));

  const places: RowPlace[] = [];
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

  /* Where each tyre sits, in the row's own coordinates, and where it rolled from. */
  const tyresFor = (rival: Rival) => {
    const behind = rival.list.filter((race) => !race.ahead);
    const ahead = rival.list.filter((race) => race.ahead);
    if (phone) {
      const ay = 19 + cell / 2;
      const by = ay + cell + 2;
      return [
        ...ahead.map((race, k) => ({ race, x: 4 + k * cell + cell / 2, y: ay, from: 4 })),
        ...behind.map((race, k) => ({ race, x: 4 + k * cell + cell / 2, y: by, from: 4 }))
      ];
    }
    const cy = rowH / 2;
    return [
      ...behind.map((race, k) => ({ race, x: spineL - k * cell - cell / 2, y: cy, from: spineL })),
      ...ahead.map((race, k) => ({ race, x: spineR + k * cell + cell / 2, y: cy, from: spineR }))
    ];
  };

  const marks: Mark[] = [];
  const bands: Mark[] = [];
  places.forEach((place) => {
    const rival = place.rival;
    for (const tyre of tyresFor(rival)) {
      const key = `s:${rival.name}|${tyre.race.sessionId}`;
      const mx = tyre.x;
      const my = place.y + tyre.y;
      marks.push({ key, x: mx, y: my, r, open: raceHref(tyre.race.sessionId), focus: () => ({ kind: 'race', rival, race: tyre.race, x: mx, y: my, r }) });
    }
    /* The name reads the record: the name column on a laptop, the name line on a phone. */
    const bx = phone ? width / 2 : (spineL + spineR) / 2;
    const by = place.y + (phone ? 8 : rowH / 2);
    bands.push({
      key: `r:${rival.name}`,
      x: bx,
      y: by,
      r: 0,
      hw: phone ? width / 2 : nameCol / 2,
      hh: phone ? 10 : rowH / 2,
      open: null,
      focus: () => ({ kind: 'rival', rival, x: bx, y: phone ? place.y + 2 : by, r: phone ? 0 : rowH / 2 - 2 })
    });
  });

  const { tap, focus, handlers } = useMarks(svgRef, marks, bands, (mr, finger) => (finger ? Math.max(mr * 1.4, 11) : Math.max(mr * 1.15, 6)));

  const hoveredRival = focus && focus.kind !== 'column' ? focus.rival.name : null;
  const hoveredRace = focus && focus.kind === 'race' ? focus.race.sessionId : null;

  const ease = 'cubic-bezier(0.22, 0.75, 0.3, 1)';
  const SPEED = 0.6; /* px per ms: every tyre rolls at the same speed, so the far ones arrive last */
  const rollStyle = (from: number, to: number, rowIndex: number): CSSProperties => {
    if (reduced) return {};
    const d = to - from;
    const deg = (d / r) * (180 / Math.PI);
    const duration = Math.max(200, Math.abs(d) / SPEED);
    return {
      transform: shown ? 'translateX(0px) rotate(0deg)' : `translateX(${-d}px) rotate(${-deg}deg)`,
      opacity: shown ? 1 : 0,
      transition: `transform ${duration}ms ${ease} ${rowIndex * 26}ms, opacity 90ms linear ${rowIndex * 26}ms`
    };
  };
  const countStyle = (rowIndex: number, n: number): CSSProperties =>
    reduced ? {} : { opacity: shown ? 1 : 0, transition: `opacity 240ms ease ${rowIndex * 26 + Math.max(200, (n * cell) / SPEED) - 60}ms` };

  return (
    <div ref={viewRef} className="rv rv-ty">
      <div ref={ref} className="rv__board">
        {width > 0 ? (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            role="img"
            aria-label={`Head-to-head records against ${rivals.length} INDY NXT rivals: one tyre per shared race, gold-rimmed where Bryce finished ahead, plain black where the rival did`}
            {...handlers}
          >
            <TyreDefs prefix={prefix} />
            {phone ? null : (
              <>
                <g transform={`translate(${spineL - 4}, ${header - 17})`}>
                  <use href={tyreHref(prefix, false, r)} x={-12} y={-6} width={12} height={12} />
                  <text x={-17} y={4} textAnchor="end" className="rv__side" fill={INK} fontFamily={chartFont}>
                    rival ahead
                  </text>
                </g>
                <text x={(spineL + spineR) / 2} y={header - 13} textAnchor="middle" className="rv-ty__note" fontFamily={chartFont}>
                  one tyre per race
                </text>
                <g transform={`translate(${spineR + 4}, ${header - 17})`}>
                  <use href={tyreHref(prefix, true, r)} x={0} y={-6} width={12} height={12} />
                  <text x={17} y={4} textAnchor="start" className="rv__side" fill={GOLD_TEXT} fontFamily={chartFont}>
                    Bryce ahead
                  </text>
                </g>
              </>
            )}
            {phone ? (
              <g transform={`translate(4, ${header - 16})`}>
                <use href={tyreHref(prefix, true, r)} x={0} y={-6} width={12} height={12} />
                <text x={16} y={4} className="rv__side" fill={GOLD_TEXT} fontFamily={chartFont}>
                  Bryce ahead
                </text>
                <use href={tyreHref(prefix, false, r)} x={112} y={-6} width={12} height={12} />
                <text x={128} y={4} className="rv__side" fill={INK} fontFamily={chartFont}>
                  rival ahead
                </text>
              </g>
            ) : null}

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
              const faded = hoveredRival !== null && hoveredRace === null && hoveredRival !== rival.name;
              const team = teammateWords(rival);
              const tyres = tyresFor(rival);
              const nameBase = phone ? 13 : rowH / 2 + 4.5;
              return (
                <g
                  key={rival.name}
                  className="rv__row"
                  style={{
                    transform: `translate(0px, ${place.y}px)`,
                    transition: reduced ? undefined : `transform 520ms cubic-bezier(0.23, 1, 0.32, 1), opacity 160ms ease`,
                    opacity: faded ? 0.3 : 1
                  }}
                >
                  {phone ? (
                    <>
                      <text x={0} y={nameBase} className="rv__name" fontFamily={chartFont} data-rival={rival.name}>
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
                      <text x={(spineL + spineR) / 2} y={nameBase} textAnchor="middle" className="rv__name" fontFamily={chartFont} data-rival={rival.name}>
                        {rival.name}
                      </text>
                      <text x={spineL - rival.behind * cell - 6} y={nameBase} textAnchor="end" className="rv__count" fill={INK} fontFamily={chartFont} style={countStyle(rowIndex, rival.behind)}>
                        {rival.behind}
                      </text>
                      <text x={spineR + rival.ahead * cell + 6} y={nameBase} textAnchor="start" className="rv__count" fill={GOLD_TEXT} fontFamily={chartFont} style={countStyle(rowIndex, rival.ahead)}>
                        {rival.ahead}
                        {team ? (
                          <tspan className="rv__team" dx={10}>
                            {team}
                          </tspan>
                        ) : null}
                      </text>
                    </>
                  )}
                  {tyres.map((tyre) => {
                    const lit = hoveredRace === null || hoveredRace === tyre.race.sessionId;
                    const isFocus = lit && hoveredRace !== null && hoveredRival === rival.name;
                    return (
                      <g key={tyre.race.sessionId} transform={`translate(${snap(tyre.x)}, ${snap(tyre.y)})`} data-race={tyre.race.sessionId} className="rv-ty__tyre" style={{ opacity: lit ? 1 : 0.2 }}>
                        <g className="rv-ty__roll" style={rollStyle(tyre.from, tyre.x, rowIndex)}>
                          <use href={tyreHref(prefix, tyre.race.ahead, r)} x={-r} y={-r} width={r * 2} height={r * 2} />
                        </g>
                        {isFocus ? <circle r={r + 2.2} fill="none" stroke="var(--ink)" strokeWidth={1.4} /> : null}
                      </g>
                    );
                  })}
                  {!rival.list.length ? (
                    <text x={phone ? 4 : spineR} y={phone ? 19 + cell : nameBase} className="rv__team" fontFamily={chartFont}>
                      {rival.ahead}–{rival.behind}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        {focus ? <RivalCard focus={focus} width={width} tap={tap} coarse={coarse} /> : null}
      </div>
      {phone && rivals.length > PHONE_ROWS ? (
        <button type="button" className="rv__more" onClick={() => setAll((value) => !value)} aria-expanded={all}>
          {all ? `The first ${PHONE_ROWS}` : `All ${rivals.length} drivers`}
        </button>
      ) : null}
    </div>
  );
};
