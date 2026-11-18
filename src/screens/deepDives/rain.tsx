import { switchValue } from '../../review/switches';
import { RainDeepDiveOld } from './rainOld';
import { RainRows } from './rainRows';

/**
 * Rain days, round 3 (November 18, 2026). Jack on round 2: the dots were
 * "impossible to tell apart", every colour showed at once, series ran into
 * each other, and nothing said that right is better. The redo answers one
 * question per row: did he beat more of the field in the wet than in the dry?
 *
 * Review switch `ddrain`:
 *   (default) rows  — one row per series, the wet days in a rain-blue lane over
 *                     the dry days in grey, an arrow from the dry middle to the
 *                     wet middle;
 *   bands           — the dry days drawn as his usual range (a band), the wet
 *                     days falling onto it;
 *   old             — round 2's version.
 */
export const RainDeepDive = () => {
  const value = switchValue('ddrain');
  if (value === 'old') return <RainDeepDiveOld />;
  return <RainRows variant={value === 'bands' ? 'bands' : 'rows'} />;
};
