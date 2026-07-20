/* Restart field-baseline copy (Brief K v2, design-review law).
 *
 * The stored figure is the pooled MEAN ABSOLUTE running-order change per car per
 * restart (`meanAbsoluteFieldMove`). The median is 0 — most cars don't move — so
 * it is never "typical", and a ± would read like a signed interval. The house
 * sentence therefore states the average plainly and carries BOTH denominators:
 * the number of restarts and the number of car-result observations the mean is
 * pooled over. Shared so Race Week, Race Detail, and Career never drift. */

import type { UiRestartFieldBaseline, UiRestartVenueBaseline } from './uiDataPackage';

type RestartBaseline = UiRestartVenueBaseline | UiRestartFieldBaseline;

/** Group a car-result count with thousands separators: 1297 -> "1,297". */
const groupCount = (value: number): string => value.toLocaleString('en-US');

/** The field-baseline sentence, both denominators, no ±.
 *  Series-wide: "Across 67 INDY NXT restarts since 2024, the average car changed
 *  running order by 0.7 places (1,297 car results)".
 *  Venue: "Across 6 restarts here since 2024, the average car changed running
 *  order by 1.1 places (120 car results)". */
export const restartBaselineSentence = (source: RestartBaseline, scope: 'venue' | 'series'): string | null => {
  if (source.meanAbsoluteFieldMove === null) return null;
  const span = source.spanFirstSeason ?? 2024;
  const places = source.meanAbsoluteFieldMove.toFixed(1);
  const obs = source.driverObservations;
  const lead =
    scope === 'venue'
      ? `Across ${source.restarts} restart${source.restarts === 1 ? '' : 's'} here since ${span}`
      : `Across ${source.restarts} INDY NXT restart${source.restarts === 1 ? '' : 's'} since ${span}`;
  return `${lead}, the average car changed running order by ${places} places (${groupCount(obs)} car result${
    obs === 1 ? '' : 's'
  })`;
};

/** The honest thin-venue note when a venue has some — but too few — covered
 *  restarts to headline, so the line falls back to the series-wide baseline. */
export const restartThinVenueNote = (venueName: string, coveredRestarts: number): string =>
  `${venueName} has only ${coveredRestarts} covered restart${coveredRestarts === 1 ? '' : 's'}, so this uses all INDY NXT.`;
