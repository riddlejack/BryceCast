import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { chartFont, useCoarsePointer } from '../../app/charts';
import { useRouter } from '../../app/router';
import { useTapPreview } from '../../app/tapPreview';
import { chapterTint, raceHref } from '../careerExplorer';
import { ClimbCard } from './card';
import { clamp, ease, type ClimbModel, type ClimbRace } from './model';

/* ============================================================================
 * The climb as a staircase (the default).
 *
 * One idea: he went up a step at a time. Each step is a series, in the order
 * he reached it, as wide as the races he ran there; each race is a dot on its
 * step, higher the more of the field he beat, so a win sits level with the
 * next step. The 8 races with no classified finish are a small cross under
 * the tread. The thin line on each step is his running form there (a
 * seven-race trimmed mean of the dots, middle 60%).
 *
 * On load the staircase builds itself on a clock: the tread runs out race by
 * race, each dot rising from the tread to its place as it passes, the risers
 * climbing between steps, the race count ticking up to the total. Reduced
 * motion draws it at rest. Nothing is tied to the scroll.
 * ==========================================================================*/

const RISER_UNITS = 5;
const DRAW_END = 0.84;

interface Geo {
  W: number;
  H: number;
  S: number;
  topPad: number;
  colW: number;
  r: number;
  x: (i: number) => number;
  floor: (step: number) => number;
  markY: (race: ClimbRace) => number;
  stepX: Array<{ x0: number; x1: number }>;
  totalUnits: number;
  unitOf: (i: number, step: number) => number;
}

const trimmedForm = (values: number[], half: number): number[] =>
  values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1)).sort((a, b) => a - b);
    const trim = Math.floor(slice.length * 0.2);
    const kept = slice.slice(trim, slice.length - trim);
    return kept.reduce((sum, v) => sum + v, 0) / kept.length;
  });

const textW = (s: string, size: number, k = 0.56): number => s.length * size * k;

export const Staircase = ({ model, width, p }: { model: ClimbModel; width: number; p: number }) => {
  const { races, steps } = model;
  const { navigate } = useRouter();
  const tap = useTapPreview();
  const coarse = useCoarsePointer();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const n = races.length;
  const phone = width < 640;

  /* Named moments, plus the two one-off series, labelled over their dots.
     Each label stands on its own leader, which runs straight up from the dot;
     labels stack in rows so no leader passes through another label: a label
     reads rightward from its leader (leftward near the right edge), and a row
     is taken only if no other leader rises through the label and its own
     leader rises through no label below it. Only x matters here, so it is
     laid out before the chart's height is known. */
  const notes = useMemo(() => {
    const colW0 = (width - 4) / n;
    const x0 = (i: number) => 2 + (i + 0.5) * colW0;
    const items = model.moments.map((moment) => ({ key: `${moment.sessionId}/${moment.kind}`, index: moment.index, text: moment.shortLabel }));
    for (const race of races) {
      if (race.oneOff && !items.some((item) => item.index === race.index)) {
        items.push({ key: `oneoff/${race.sessionId}`, index: race.index, text: `${race.seriesShort}${race.finish !== null ? ` · P${race.finish}` : ''}` });
      }
    }
    items.sort((a, b) => b.index - a.index);
    type Note = { key: string; index: number; text: string; step: number; cx: number; row: number; a: number; b: number };
    /* Right to left: each label reads rightward from its leader (shifted left
       only where the chart, or the next step up, ends) and takes the lowest
       row above every leader its text covers and clear of the labels beside
       it. A leader to the left of a label never reaches it: that label's own
       row is higher. */
    const placed: Note[] = [];
    for (const item of items) {
      const race = races[item.index];
      const cx = x0(item.index);
      const w = textW(item.text, 12.5, 0.55) + 4;
      const hi = race.step < steps.length - 1 ? x0(steps[race.step].to) + colW0 / 2 - 4 : width - 2;
      const a = Math.max(2, Math.min(cx - 3, hi - w));
      const b = a + w;
      const same = placed.filter((q) => q.step === race.step);
      let row = Math.max(0, ...same.filter((q) => q.cx >= a - 4 && q.cx <= b + 4).map((q) => q.row + 1));
      while (same.some((q) => q.row === row && !(q.b + 10 < a || b + 10 < q.a))) row += 1;
      placed.push({ ...item, step: race.step, cx, row, a, b });
    }
    return placed;
  }, [model.moments, races, steps, width, n]);
  const topRows = Math.max(0, ...notes.filter((note) => note.step === steps.length - 1).map((note) => note.row + 1));

  const geo = useMemo((): Geo => {
    const W = width;
    const S = Math.round(clamp(W * 0.06, 50, 92));
    const topPad = phone ? 64 : Math.max(Math.round(clamp(W * 0.05, 64, 96)), 18 + topRows * 16);
    const H = topPad + steps.length * S + (phone ? 50 : 58);
    const padL = 2;
    const padR = 2;
    const colW = (W - padL - padR) / n;
    const x = (i: number) => padL + (i + 0.5) * colW;
    const floor = (step: number) => topPad + (steps.length - step) * S;
    const markY = (race: ClimbRace) => floor(race.step) - 6 - (race.percentile ?? 0) * (S - 12);
    const stepX = steps.map((step) => ({ x0: x(step.from) - colW / 2, x1: x(step.to) + colW / 2 }));
    const unitOf = (i: number, step: number) => i + RISER_UNITS * (step + 1);
    const totalUnits = n + RISER_UNITS * (steps.length + 1) + 2;
    return { W, H, S, topPad, colW, r: clamp(colW * 0.42, 2.3, 4.4), x, floor, markY, stepX, totalUnits, unitOf };
  }, [width, n, steps, phone, topRows]);

  const { W, H, S, topPad, colW, r, x, floor, markY, stepX } = geo;
  const head = (clamp(p / DRAW_END, 0, 1) * geo.totalUnits) as number;
  const raceT = (race: ClimbRace) => ease((head - geo.unitOf(race.index, race.step)) / 7);
  const shownCount = p >= DRAW_END ? model.total : races.filter((race) => head >= geo.unitOf(race.index, race.step)).length;

  /* running form per step: the classified dots of the step itself, one-offs left out */
  const forms = useMemo(
    () =>
      steps.map((_, s) => {
        const on = races.filter((race) => race.step === s && !race.oneOff && race.percentile !== null);
        const form = trimmedForm(on.map((race) => race.percentile!), 3);
        return on.map((race, k) => ({ x: x(race.index), y: floor(s) - 6 - form[k] * (S - 12), index: race.index }));
      }),
    [steps, races, x, floor, S]
  );

  /* step labels: on the step's face under its tread where it fits; a narrow
     step labels itself to the left of its riser, where the stairs leave room */
  const nameF = Math.round(clamp(S * 0.27, 14, 21));
  const subF = phone ? 12 : 13;
  const labels = steps.map((step, s) => {
    const sub = phone ? step.years : `${step.years} · ${step.count} race${step.count === 1 ? '' : 's'}`;
    const w = Math.max(textW(step.name, nameF, 0.6), textW(sub, subF, 0.55));
    /* a phone has no room beside the risers: every label sits on its step's
       face and may run on over the next, lower part of the stairs */
    const face = phone || s === 0 || stepX[s].x1 - stepX[s].x0 - 14 >= w;
    return { s, sub, face, w };
  });

  const hoveredRace = hover !== null ? races[hover] : null;
  const activeStep = hoveredRace ? hoveredRace.step : null;

  const find = (event: MouseEvent<Element>): number | null => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return null;
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    let best: { i: number; d: number } | null = null;
    for (const race of races) {
      const cy = race.finish === null ? floor(race.step) + 8 : markY(race);
      const d = Math.hypot((x(race.index) - mx) * 1.4, cy - my);
      if (!best || d < best.d) best = { i: race.index, d };
    }
    const reach = coarse || tap.armed !== null ? 30 : 26;
    if (!best || best.d > reach) {
      setHover(null);
      return null;
    }
    setHover(best.i);
    return best.i;
  };

  const drawn = (s: number) => {
    /* how far the tread of step s has run, 0..1 */
    const step = steps[s];
    const u0 = geo.unitOf(step.from, s) - 0.5;
    const u1 = geo.unitOf(step.to, s) + 0.5;
    return clamp((head - u0) / (u1 - u0), 0, 1);
  };
  const riserT = (s: number) => clamp((head - (geo.unitOf(steps[s].from, s) - RISER_UNITS)) / (RISER_UNITS - 0.5), 0, 1);
  const lateFade = (at: number) => clamp((p - at) / 0.06, 0, 1);

  const figureF = Math.round(clamp(W * 0.042, 40, 88));
  const figureY = phone ? 44 : topPad + figureF * 0.35;
  const firstPlace = races[0]?.title.split(' · ')[0] ?? '';
  const headX = (() => {
    for (let s = steps.length - 1; s >= 0; s -= 1) {
      const t = drawn(s);
      if (t > 0) return { x: stepX[s].x0 + (stepX[s].x1 - stepX[s].x0) * t, y: floor(s), on: t < 1 || s < steps.length - 1 };
    }
    return null;
  })();

  return (
    <div className="climb-stage" style={{ height: H }}>
      <svg
        ref={svgRef}
        width={W}
        height={H}
        className="climb-svg"
        role="img"
        aria-label={`The climb: ${model.total} races on ${steps.length} steps, ${steps.map((step) => `${step.name} ${step.years}, ${step.count} races`).join('; ')}.`}
        data-hovering={hover !== null ? '' : undefined}
        {...tap.surface({
          find,
          clear: () => setHover(null),
          open: (key) => {
            const race = races[key as number];
            return race?.hasPage ? () => navigate(raceHref(race.sessionId)) : null;
          }
        })}
      >
        {/* the count, ticking up as the stairs build */}
        <g className="climb-figure" aria-hidden fontFamily={chartFont}>
          <text x={2} y={figureY} fontSize={figureF} fontWeight={640} letterSpacing="-0.035em" fill="var(--ink)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {shownCount}
          </text>
          {phone ? (
            <>
              <text x={3} y={figureY + 24} fontSize={13} fill="var(--ink-secondary)">
                races, from a club race
              </text>
              <text x={3} y={figureY + 41} fontSize={13} fill="var(--ink-secondary)">
                at {firstPlace} to INDY NXT
              </text>
            </>
          ) : (
            <text x={4} y={figureY + subF + 20} fontSize={subF + 2} fill="var(--ink-secondary)">
              races, from a club race at {firstPlace} to INDY NXT
            </text>
          )}
        </g>

        {/* the steps: a block per series, its tread on top, the riser up from the last */}
        {steps.map((step, s) => {
          const t = drawn(s);
          const { x0, x1 } = stepX[s];
          const fl = floor(s);
          const dim = activeStep !== null && activeStep !== s;
          const rt = s === 0 ? 1 : riserT(s);
          const prevFloor = s === 0 ? H : floor(s - 1);
          return (
            <g key={step.key} opacity={dim ? 0.5 : 1} className="climb-step">
              <rect
                x={x0}
                y={fl}
                width={Math.max(0, (x1 - x0) * t)}
                height={H - fl}
                fill={`color-mix(in srgb, ${step.tint} ${activeStep === s ? 15 : 9}%, var(--paper))`}
              />
              {s > 0 && rt > 0 ? (
                <line x1={x0} x2={x0} y1={prevFloor} y2={prevFloor - (prevFloor - fl) * rt} stroke={step.tint} strokeWidth={2} strokeLinecap="round" />
              ) : null}
              {t > 0 ? <line x1={x0} x2={x0 + (x1 - x0) * t} y1={fl} y2={fl} stroke={step.tint} strokeWidth={2.5} strokeLinecap="round" /> : null}
            </g>
          );
        })}

        {/* step names */}
        {labels.map(({ s, sub, face, w }) => {
          const step = steps[s];
          const a = clamp((head - (geo.unitOf(step.from, s) - 1)) / 6, 0, 1);
          if (a <= 0) return null;
          const fl = floor(s);
          const lit = activeStep === s;
          const lx = face ? Math.min(stepX[s].x0 + (phone ? 5 : 8), W - w - 2) : Math.max(4, stepX[s].x0 - 10 - w);
          const ly = face ? fl + 12 + nameF * 0.82 : fl - S * 0.5 - (nameF + subF) / 2 + nameF * 0.82;
          return (
            <g key={step.key} opacity={a} transform={`translate(0 ${(1 - a) * 5})`} fontFamily={chartFont} aria-hidden>
              <text x={lx} y={ly} fontSize={nameF} fontWeight={lit ? 700 : 630} letterSpacing="-0.015em" fill="var(--ink)">
                {step.name}
              </text>
              <text x={lx} y={ly + subF + 6} fontSize={subF} fill="var(--ink-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {sub}
              </text>
            </g>
          );
        })}

        {/* running form on each step */}
        {forms.map((pts, s) => {
          if (pts.length < 3) return null;
          const t = drawn(s);
          if (t <= 0) return null;
          const limitX = stepX[s].x0 + (stepX[s].x1 - stepX[s].x0) * t;
          const shown = pts.filter((pt) => pt.x <= limitX);
          if (shown.length < 2) return null;
          const d = shown.map((pt, k) => `${k === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
          return (
            <path
              key={`form${s}`}
              d={d}
              fill="none"
              stroke="var(--ink)"
              strokeOpacity={activeStep === null || activeStep === s ? 0.55 : 0.2}
              strokeWidth={1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}

        {/* every race */}
        <g>
          {races.map((race) => {
            const t = raceT(race);
            if (t <= 0) return null;
            const cx = x(race.index);
            const tint = chapterTint(race.seriesName);
            const lit = hover === race.index;
            const dim = activeStep !== null && activeStep !== race.step ? 0.28 : 1;
            if (race.finish === null) {
              const cy = floor(race.step) + 8;
              const k = (lit ? 4.2 : 3) * t;
              return (
                <g key={race.sessionId} opacity={dim} stroke={tint} strokeWidth={lit ? 2 : 1.6} strokeLinecap="round">
                  <line x1={cx - k} x2={cx + k} y1={cy - k} y2={cy + k} />
                  <line x1={cx - k} x2={cx + k} y1={cy + k} y2={cy - k} />
                </g>
              );
            }
            const cy = floor(race.step) - 3 + (markY(race) - floor(race.step) + 3) * t;
            const rr = lit ? r + 2.2 : r;
            if (race.oneOff) {
              const k = rr * 1.25;
              return (
                <path
                  key={race.sessionId}
                  d={`M${cx} ${cy - k} L${cx + k} ${cy} L${cx} ${cy + k} L${cx - k} ${cy} Z`}
                  fill={tint}
                  stroke="var(--paper)"
                  strokeWidth={1}
                  opacity={dim * t}
                />
              );
            }
            const clean = race.status === 'running';
            return (
              <circle
                key={race.sessionId}
                cx={cx}
                cy={cy}
                r={rr}
                fill={clean ? tint : 'var(--paper)'}
                fillOpacity={clean ? (lit ? 1 : 0.82) : 1}
                stroke={clean ? (lit ? 'var(--ink)' : 'var(--paper)') : tint}
                strokeWidth={clean ? (lit ? 1.5 : 0.8) : 1.4}
                opacity={dim * t}
              />
            );
          })}
        </g>

        {/* the climber's head while it draws */}
        {headX && p < DRAW_END && p > 0 && headX.on ? <circle cx={headX.x} cy={headX.y} r={4} fill="var(--ink)" /> : null}

        {/* moments */}
        {!phone
          ? notes.map((note, j) => {
              const a = lateFade(DRAW_END + 0.02 * j);
              if (a <= 0) return null;
              const race = races[note.index];
              const cx = x(note.index);
              const my = race.finish === null ? floor(race.step) + 3 : markY(race) - r - 2;
              const ly = floor(race.step) - S - 12 - note.row * 16;
              return (
                <g key={note.key} opacity={a} className="climb-note" aria-hidden>
                  <line x1={cx} x2={cx} y1={my} y2={ly + 3} stroke="var(--ink-secondary)" strokeOpacity={0.55} strokeWidth={1} />
                  <text
                    x={note.a}
                    y={ly}
                    textAnchor="start"
                    fontFamily={chartFont}
                    fontSize={12.5}
                    fill="var(--ink-secondary)"
                    stroke="var(--paper)"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {note.text}
                  </text>
                </g>
              );
            })
          : null}
        {/* rings on the moments, at every width */}
        {notes.map((note, j) => {
          const a = lateFade(DRAW_END + 0.02 * j);
          const race = races[note.index];
          if (a <= 0 || race.finish === null || race.oneOff) return null;
          return <circle key={`ring${note.key}`} cx={x(note.index)} cy={markY(race)} r={r + 3} fill="none" stroke="var(--ink)" strokeWidth={1.2} opacity={a} />;
        })}
      </svg>
      {hoveredRace ? (
        <ClimbCard
          race={hoveredRace}
          x={x(hoveredRace.index)}
          y={(hoveredRace.finish === null ? floor(hoveredRace.step) + 8 : markY(hoveredRace)) - r - 3}
          under={(hoveredRace.finish === null ? floor(hoveredRace.step) + 8 : markY(hoveredRace)) + r + 3}
          width={W}
          tap={tap}
        />
      ) : null}
    </div>
  );
};
