import { windCardinal } from './format';

/** Weather-delta grammar (Jack's dossier review, gate 3): the same ▲▽ glyphs
 *  as result deltas, but in NEUTRAL secondary ink — a weather delta is a fact
 *  about the day, not a verdict on the drive, so it never wears the green/red
 *  verdict colors. Renders nothing for null or zero (honest absence beats a
 *  placeholder). */
export const FactDelta = ({ delta, unit = '' }: { delta: number | null | undefined; unit?: string }) => {
  if (delta === null || delta === undefined || delta === 0) return null;
  return (
    <span
      className="tnum"
      style={{ fontSize: 11.5, color: 'var(--ink-secondary)', whiteSpace: 'nowrap' }}
    >
      {delta > 0 ? '▲' : '▽'}
      {Math.abs(delta)}
      {unit}
    </span>
  );
};

/** Tiny flow arrow in a north-up compass frame: points the way the air moves
 *  (bearing is the FROM direction, so the arrow draws at bearing + 180 from
 *  screen-up). Same convention as the track-shape wind pill. */
const FlowArrow = ({ bearingDeg, ink }: { bearingDeg: number; ink: string }) => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 22 22"
    aria-hidden
    style={{ transform: `rotate(${bearingDeg + 180}deg)`, flex: 'none', display: 'block' }}
  >
    <line x1={11} y1={18.5} x2={11} y2={7} stroke={ink} strokeWidth={2.8} strokeLinecap="round" />
    <path d="M11 2.6 L16.4 9.6 L11 7.2 L5.6 9.6 Z" fill={ink} />
  </svg>
);

/** Compact wind-direction swing: a muted arrow at the prior visit's bearing, a
 *  quiet →, and an ink arrow at this visit's bearing — north-up frame (no
 *  track shape in these modules). Renders ONLY when the direction actually
 *  moved at least one compass point (22.5°); same-cardinal churn never shows. */
export const WindSwing = ({ fromDeg, toDeg }: { fromDeg: number; toDeg: number }) => {
  const swing = Math.abs(((toDeg - fromDeg + 540) % 360) - 180);
  if (swing < 22.5) return null;
  const fromLabel = windCardinal(fromDeg) ?? '—';
  const toLabel = windCardinal(toDeg) ?? '—';
  return (
    <span
      role="img"
      aria-label={`wind swung ${fromLabel} to ${toLabel}`}
      title={`Wind swung ${fromLabel} → ${toLabel} (north-up)`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flex: 'none' }}
    >
      <FlowArrow bearingDeg={fromDeg} ink="var(--ink-muted)" />
      <span aria-hidden style={{ color: 'var(--ink-muted)', fontSize: 10, lineHeight: 1 }}>
        →
      </span>
      <FlowArrow bearingDeg={toDeg} ink="var(--ink-primary)" />
    </span>
  );
};
