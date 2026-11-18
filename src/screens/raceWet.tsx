/* Rain on the race marks (round 2, intersections lane; switch `rainmarks`:
 * on (default, the rain dive's blue) | ink (grey streaks, never near a series
 * colour) | off).
 *
 * One read of "was it wet?" per race, shared by every chart that marks it:
 * careerLab.raceWeather first (the official series condition report where one
 * exists, then weather-station observation and race reports, else the
 * reanalysis rain over the race window), then the older
 * resultConversion.wetDry for any race raceWeather lacks. A dry or unknown race
 * gets no mark. A reanalysis read says "(modelled)" wherever it is put in words. */

import { uiDataPackage } from '../data/uiDataPackage';
import { switchValue } from '../review/switches';
import './rainMarks.css';

export interface WetRead {
  state: 'wet' | 'mixed';
  /** True when the call comes from the weather model, not an official report. */
  modelled: boolean;
  /** For a card: "wet track", "wet track (modelled)", "damp track", "drying track". */
  words: string;
}

let cache: Map<string, WetRead> | null = null;

const mixedWord = (raw: string | null | undefined): string => {
  const last = (raw ?? '').split('/').pop()?.trim().toLowerCase() ?? '';
  return last === 'damp' || last === 'drying' ? last : 'mixed';
};

const build = (): Map<string, WetRead> => {
  const map = new Map<string, WetRead>();
  const lab = uiDataPackage.screens.careerLab;
  const weather = lab.raceWeather ?? {};
  for (const [sessionId, row] of Object.entries(weather)) {
    if (row.wetDry !== 'wet' && row.wetDry !== 'mixed') continue;
    /* Only a reanalysis call is modelled; a series report or a weather station's observation is not. */
    const modelled = row.wetDrySource === 'reanalysis';
    const base = row.wetDry === 'wet' ? 'wet' : mixedWord(row.seriesReport?.conditionRaw);
    map.set(sessionId, { state: row.wetDry, modelled, words: `${base} track${modelled ? ' (modelled)' : ''}` });
  }
  for (const entry of lab.resultConversion ?? []) {
    const sessionId = typeof entry.sessionId === 'string' ? entry.sessionId : null;
    if (!sessionId || sessionId in weather) continue;
    const wetDry = typeof entry.wetDry === 'string' ? entry.wetDry : null;
    if (!wetDry || wetDry === 'dry') continue;
    const modelled = entry.weatherConfidence !== 'official';
    const state: WetRead['state'] = wetDry === 'wet' ? 'wet' : 'mixed';
    map.set(sessionId, { state, modelled, words: `${state === 'wet' ? 'wet' : mixedWord(wetDry)} track${modelled ? ' (modelled)' : ''}` });
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
