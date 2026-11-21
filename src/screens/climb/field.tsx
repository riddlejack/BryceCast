import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { chartFont, useCoarsePointer } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { chapterTint, raceHref } from '../careerExplorer';
import { ClimbCard } from './card';
import { useSlide, type Slide } from './slide';
import { clamp, ease, type ClimbModel, type ClimbRace } from './model';

/* ============================================================================
 * The climb as the field (`?climb=field`).
 *
 * One idea: where he finished in the pack, every race. Each race hangs from
 * the P1 line as a thin bar as long as its field (cars in the result), the
 * part behind him in his series' colour, the part ahead of him grey, his
 * place the notch between. Read across, the colour climbing towards the line
 * is him moving up the order; each new series starts lower and climbs again.
 * A field deeper than 35 cars (only the Rolex 24's 61) is cut with its count
 * printed. A race with no classified finish is a dotted bar with a
 * cross where a notch would be.
 *
 * On load the bars drop from the P1 line in a wave, left to right, then the
 * colour fills each one up to his place. Reduced motion draws it at rest.
 * ==========================================================================*/

const DROP_END = 0.62;
const FILL_END = 0.92;

export const FieldView = ({ model, width, p }: { model: ClimbModel; width: number; p: number }) => {
  const { races, steps } = model;
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const coarse = useCoarsePointer();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const slideRef = useRef<Slide | null>(null);
  const n = races.length;
  const phone = width < 640;

  const geo = useMemo(() => {
    const W = width;
    const cap = 35;
    const top = phone ? 46 : 52;
    const u = clamp(W * 0.0085, 7, 14);
    const H = top + cap * u + 26;
    const padL = phone ? 34 : 38;
    const colW = (W - padL - 2) / n;
    const x = (i: number) => padL + (i + 0.5) * colW;
    const y = (place: number) => top + (Math.min(place, cap) - 0.5) * u;
    return { W, H, top, u, cap, colW, padL, x, y, barW: clamp(colW * 0.62, 1.2, 7) };
  }, [width, n, phone]);
  const { W, H, top, u, cap, colW, x, y, barW, padL } = geo;

  const dropT = (i: number) => ease((p / DROP_END - (i / n) * 0.7) / 0.3);
  const fillT = (i: number) => ease(((p - DROP_END) / (FILL_END - DROP_END) - (i / n) * 0.5) / 0.5);
  const lateFade = clamp((p - FILL_END) / 0.06, 0, 1);

  const hoveredRace = hover !== null ? races[hover] : null;
  const activeStep = hoveredRace ? hoveredRace.step : null;

  const find = (event: MouseEvent<Element>): number | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    /* A finger sliding sideways walks race by race at any height (./slide). */
    const byX = slideRef.current?.sliding() ?? false;
    if (!byX && (my < top - 12 || my > H - 20)) {
      setHover(null);
      return null;
    }
    const i = clamp(Math.round((mx - padL) / colW - 0.5), 0, n - 1);
    const d = Math.abs(x(i) - mx);
    /* a finger reaches at least 24 px either side of a bar */
    if (!byX && d > Math.max(colW, coarse || tap.armed !== null ? 24 : 8)) {
      setHover(null);
      return null;
    }
    setHover(i);
    return i;
  };

  const slide = useSlide(tap, find, () => setHover(null), (key) => {
    const race = races[key as number];
    return race?.hasPage ? () => navigate(raceHref(race.sessionId)) : null;
  });
  slideRef.current = slide;

  /* series bands across the top: one per step, the one-offs called out inside */
  const bandLabelF = phone ? 12 : 13.5;
  const markOf = (race: ClimbRace) => (race.finish !== null ? y(race.finish) : y(Math.min(race.field ?? cap, cap)));

  return (
    <div className="climb-stage" style={{ height: H }}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="climb-svg"
        role="img"
        aria-label={`Every race's field, front at the top, with his finishing place marked: ${model.total} races.`}
        data-hovering={hover !== null ? '' : undefined}
        {...slide.handlers}
      >
        {steps.map((step, s) => {
          const x0 = x(step.from) - colW / 2;
          const x1 = x(step.to) + colW / 2;
          const label = x1 - x0 > textW(step.name, bandLabelF) + 10;
          return (
            <g key={step.key} opacity={activeStep !== null && activeStep !== s ? 0.45 : 1} aria-hidden>
              <line x1={x0 + 1} x2={x1 - 1} y1={top - 14} y2={top - 14} stroke={step.tint} strokeWidth={3} strokeLinecap="round" opacity={clamp(p / 0.2, 0, 1)} />
              {label ? (
                <text x={x0 + 2} y={top - 22} fontFamily={chartFont} fontSize={bandLabelF} fontWeight={activeStep === s ? 700 : 600} fill="var(--ink)" opacity={clamp(p / 0.25, 0, 1)}>
                  {step.name}
                  {!phone ? <tspan fontWeight={400} fill="var(--ink-muted)"> {step.years}</tspan> : null}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* the position scale */}
        {[1, 10, 20, 30].map((place) => (
          <g key={place} aria-hidden>
            <line x1={padL - 4} x2={W - 2} y1={y(place)} y2={y(place)} stroke="var(--grid-hairline)" />
            <text x={padL - 8} y={y(place)} textAnchor="end" dominantBaseline="middle" fontFamily={chartFont} fontSize={12} fill="var(--ink-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
              P{place}
            </text>
          </g>
        ))}

        {races.map((race) => {
          const field = race.field ?? race.finish ?? 1;
          const d = dropT(race.index);
          if (d <= 0) return null;
          const cx = x(race.index);
          const tint = chapterTint(race.seriesName);
          const lit = hover === race.index;
          const dim = activeStep !== null && activeStep !== race.step ? 0.3 : 1;
          const bottom = top + (top + Math.min(field, cap) * u - top) * d;
          const cut = field > cap;
          const bw = lit ? barW + 2 : barW;
          if (race.finish === null) {
            return (
              <g key={race.sessionId} opacity={dim}>
                <line x1={cx} x2={cx} y1={top} y2={bottom} stroke={tint} strokeWidth={Math.max(1, bw * 0.6)} strokeDasharray="1.5 2.5" strokeOpacity={0.7} />
                {d >= 1 ? (
                  <g stroke={tint} strokeWidth={1.6} strokeLinecap="round" opacity={fillT(race.index)}>
                    <line x1={cx - 3} x2={cx + 3} y1={bottom + 3} y2={bottom + 9} />
                    <line x1={cx - 3} x2={cx + 3} y1={bottom + 9} y2={bottom + 3} />
                  </g>
                ) : null}
              </g>
            );
          }
          const f = fillT(race.index);
          const notch = y(race.finish) + u * 0.5;
          const fillTop = bottom - (bottom - notch) * f;
          return (
            <g key={race.sessionId} opacity={dim}>
              {/* ahead of him */}
              <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(0, Math.min(bottom, notch) - top)} fill="var(--grey-line)" rx={bw / 2} />
              {/* behind him: his series' colour fills up to his place */}
              {bottom > notch ? (
                <rect x={cx - bw / 2} y={notch} width={bw} height={bottom - notch} fill="var(--grey-hair)" rx={bw / 2} />
              ) : null}
              {f > 0 && bottom > notch ? <rect x={cx - bw / 2} y={fillTop} width={bw} height={bottom - fillTop} fill={tint} opacity={0.75} rx={bw / 2} /> : null}
              {f > 0 ? (
                <rect
                  x={cx - bw / 2 - 1.5}
                  y={notch - 2 - u * 0.5 + (1 - f) * (bottom - notch)}
                  width={bw + 3}
                  height={Math.max(3, u - 3)}
                  rx={1.5}
                  fill={tint}
                  stroke={lit ? 'var(--ink)' : 'none'}
                  strokeWidth={1.2}
                />
              ) : null}
              {cut && d >= 1 ? (
                <text x={cx} y={bottom + 13} textAnchor="middle" fontFamily={chartFont} fontSize={11.5} fill="var(--ink-muted)" opacity={lateFade}>
                  {field}
                </text>
              ) : null}
            </g>
          );
        })}

      </svg>
      {hoveredRace ? (
        <ClimbCard race={hoveredRace} x={x(hoveredRace.index)} y={Math.max(top, markOf(hoveredRace) - u)} under={markOf(hoveredRace) + u} width={W} tap={tap} />
      ) : null}
    </div>
  );
};

const textW = (s: string, size: number, k = 0.58): number => s.length * size * k;
