/* Was the track wet? One answer per race, for every place the site says it (the 3D track's weather and caption,
 * the race marks' rain streaks, the race-day tiles, the cards). careerLab.raceWeather already applies the data's
 * precedence and records which source made the call (`wetDrySource`):
 *
 *   1. series_report   the series' own condition line on the official classification ("Wet", "Damp", "Drying")
 *   2. observed        weather stations near the track (NOAA GHCNh) and race reports, over the race window
 *   3. reanalysis      the Open-Meteo / ERA5 model's rain over the race window (wet at 0.5 mm or more)
 *
 * This file only reads that call and puts it in words, naming its tier, so no page treats an observed call as a
 * modelled one. A call from 1 or 2 also decides whether rain falls in a picture: an observed or reported dry race
 * shows no rain, whatever the model's sky says. (Nov 18 2026, proxy review 2.) */

import type { UiRaceWeather } from '../data/uiDataPackage';

export type WetTier = 'series' | 'observed' | 'modelled';

export interface WetDryCall {
  state: 'wet' | 'mixed' | 'dry';
  tier: WetTier;
  /** The track in the source's own terms: "wet track", "damp track", "wet, drying track", "dry at the start, then rain". */
  words: string;
  /** Who made the call, for a caption's brackets: "series report", "observed, NOAA", "race report", "modelled, Open-Meteo". */
  tierWords: string;
  /** False when a report or the stations say dry: no rain is drawn, whatever the model's sky. */
  rainMayFall: boolean;
}

const TRACK_WORDS = ['wet', 'damp', 'drying', 'dry'];

/** "Wet/Drying" -> "wet, drying"; "Overcast / Drying" -> "drying"; "Damp" -> "damp". */
const reportWords = (raw: string | null | undefined): string | null => {
  const parts = (raw ?? '')
    .split(/[\/,]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => TRACK_WORDS.includes(part));
  return parts.length ? parts.join(', ') : null;
};

/** The observed call's own summary, cut to its first clause: "Mixed. Dry at the start: …, then light rain …" -> "dry at the start, then rain". */
const observedMixedWords = (summary: string | null | undefined): string | null => {
  const m = /^\s*mixed\.\s*([^:.;]+)/i.exec(summary ?? '');
  if (!m) return null;
  const head = m[1].trim().toLowerCase();
  const later = /\bthen\b[^.]*\brain\b/i.test(summary ?? '') && !/rain/.test(head) ? ', then rain' : '';
  return `${head}${later}`;
};

const tierOf = (row: Pick<UiRaceWeather, 'wetDrySource'>): WetTier =>
  row.wetDrySource === 'series_report' ? 'series' : row.wetDrySource === 'observed' ? 'observed' : 'modelled';

const tierWordsOf = (tier: WetTier, row: Partial<Pick<UiRaceWeather, 'observed'>>): string => {
  if (tier === 'series') return 'series report';
  if (tier === 'modelled') return 'modelled, Open-Meteo';
  const kinds = new Set((row.observed?.evidence ?? []).map((e) => e.kind));
  return kinds.has('station') ? 'observed, NOAA' : 'race report';
};

/** The wet/dry call for one raceWeather row, or null where the row has none. */
export const wetDryCall = (row: Partial<UiRaceWeather> | null | undefined): WetDryCall | null => {
  if (!row || (row.wetDry !== 'wet' && row.wetDry !== 'mixed' && row.wetDry !== 'dry')) return null;
  const tier = tierOf(row as UiRaceWeather);
  const state = row.wetDry;
  let words: string;
  if (state === 'wet') words = 'wet track';
  else if (state === 'dry') words = 'dry track';
  else {
    const said = tier === 'series' ? reportWords(row.seriesReport?.conditionRaw) : tier === 'observed' ? observedMixedWords(row.observed?.summary) : null;
    words = said ? (/track|rain|start|end/.test(said) ? said : `${said} track`) : 'wet for part of the race';
  }
  return { state, tier, words, tierWords: tierWordsOf(tier, row), rainMayFall: tier === 'modelled' || state !== 'dry' };
};
