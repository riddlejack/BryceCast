/* ============================================================================
 * How a finish reads on any card (career round 2 fix pass, Nov 17 2026).
 *
 * The conversion table's percentile counts Bryce himself ((n - place + 1) / n),
 * so P7 of 7 read "beat 14% of the field". Cards say what is true instead:
 * his place, the field, and how many of the other cars finished behind him.
 * Every chart's card uses these, so the wording is one grammar site-wide.
 * ==========================================================================*/

const whole = (value: unknown): number | null => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** "P8 of 23", "P8" without a field, null without a classified finish. */
export const placeLine = (finish: unknown, fieldSize?: unknown): string | null => {
  const place = whole(finish);
  if (place === null) return null;
  const field = whole(fieldSize);
  return field !== null && field >= place ? `P${place} of ${field}` : `P${place}`;
};

/** Cars that finished behind him, or null where the field is unknown. */
export const carsBeaten = (finish: unknown, fieldSize: unknown): number | null => {
  const place = whole(finish);
  const field = whole(fieldSize);
  if (place === null || field === null || field < place) return null;
  return field - place;
};

/** "ahead of 15 of the other 22", "ahead of all 18 others", "last of 7";
 *  null where the field is unknown (say nothing rather than a share). */
export const beatLine = (finish: unknown, fieldSize: unknown): string | null => {
  const beaten = carsBeaten(finish, fieldSize);
  const field = whole(fieldSize);
  if (beaten === null || field === null) return null;
  const others = field - 1;
  if (others <= 0) return null;
  if (beaten === others) return `ahead of all ${others} others`;
  if (beaten === 0) return `last of ${field}`;
  return `ahead of ${beaten} of the other ${others}`;
};

/** The share of the other cars he finished ahead of (0..1), or null. */
export const beatShare = (finish: unknown, fieldSize: unknown): number | null => {
  const beaten = carsBeaten(finish, fieldSize);
  const field = whole(fieldSize);
  return beaten === null || field === null || field <= 1 ? null : beaten / (field - 1);
};
