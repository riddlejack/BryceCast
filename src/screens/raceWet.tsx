/* Rain on the race marks (round 2, intersections lane; switch `rainmarks`:
 * on (default, the rain dive's blue) | ink (grey streaks, never near a series
 * colour) | off).
 *
 * One read of "was it wet?" per race, shared by every chart that marks it:
 * careerLab.raceWeather first, read through app/wetDry.ts (the series' report,
 * else the stations and race reports, else the reanalysis rain over the race
 * window), then the older resultConversion.wetDry for any race raceWeather
 * lacks. A dry or unknown race gets no mark. Words name their tier: "(observed)"
 * for stations or race reports, "(modelled)" for the reanalysis. */

import { uiDataPackage } from '../data/uiDataPackage';
import { wetCallFor, wetDryCall, wetPhrase, type WetTier } from '../app/wetDry';
import { switchValue } from '../review/switches';
import './rainMarks.css';

export interface WetRead {
  state: 'wet' | 'mixed';
  /** True when the call comes from the weather model, not a report or observations. */
  modelled: boolean;
  /** Who made the call: the series' report, observations (stations, race reports), or the model. */
  tier: WetTier;
  /** For a card, the track and who called it: "damp track (series report)", "wet track (observed, NOAA)",
   *  "wet track (modelled, Open-Meteo)" (app/wetDry.ts wetPhrase). */
  words: string;
  /** The track alone ("damp track", "dry at the start, then rain") and who called it ("series report"). */
  track: string;
  tierWords: string;
}

let cache: Map<string, WetRead> | null = null;

const build = (): Map<string, WetRead> => {
  const map = new Map<string, WetRead>();
  const lab = uiDataPackage.screens.careerLab;
  const weather = lab.raceWeather ?? {};
  for (const [sessionId, row] of Object.entries(weather)) {
    const call = wetDryCall(row);
    if (!call || call.state === 'dry') continue;
    map.set(sessionId, { state: call.state, modelled: call.tier === 'modelled', tier: call.tier, words: wetPhrase(call), track: call.words, tierWords: call.tierWords });
  }
  for (const entry of lab.resultConversion ?? []) {
    const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null;
    if (!sessionId || sessionId in weather) continue;
    const wetDry = typeof entry.wetDry === 'string' ? entry.wetDry : null;
    if (!wetDry || wetDry === 'dry') continue;
    const modelled = entry.weatherConfidence !== 'official';
    const call = wetCallFor(null, wetDry);
    if (!call || call.state === 'dry') continue;
    const tierWords = modelled ? 'modelled' : 'series report';
    map.set(sessionId, { state: call.state, modelled, tier: modelled ? 'modelled' : 'series', words: `${call.words} (${tierWords})`, track: call.words, tierWords });
  }
  return map;
};

/** The wet read for a race, or null (dry, unknown, or the switch is off). */
export const wetFor = (sessionId: string): WetRead | null => {
  if (switchValue('rainmarks') === 'off') return null;
  if (!cache) cache = build();
  return cache.get(sessionId) ?? null;
};

/** True when any of these races gets a mark (so a legend can name it). */
export const anyWet = (sessionIds: string[]): boolean => sessionIds.some((id) => wetFor(id) !== null);

/** A few short rain streaks falling onto a dot: three for wet, two fainter for damp or drying. */
export const RainStreaks = ({ cx, cy, r, read, dim = false }: { cx: number; cy: number; r: number; read: WetRead; dim?: boolean }) => {
  const count = read.state === 'wet' ? 3 : 2;
  const gap = 3.6;
  const top = cy - r - 10;
  const bottom = cy - r - 4.5;
  return (
    <g className={`rain-mark rain-mark--${read.state}${dim ? ' rain-mark--dim' : ''}${switchValue('rainmarks') === 'ink' ? ' rain-mark--ink' : ''}`} aria-hidden>
      {Array.from({ length: count }, (_, i) => {
        const sx = cx + (i - (count - 1) / 2) * gap + 1.2;
        return <line key={i} x1={sx} y1={top} x2={sx - 1.6} y2={bottom} />;
      })}
    </g>
  );
};
