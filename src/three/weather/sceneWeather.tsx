import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { uiDataPackage } from '../../data/uiDataPackage';
import { formatWind, windCardinal } from '../../app/format';
import { REVIEW_HOST, switchValue } from '../../review/switches';

/* ============================================================================
 * The race hour's weather, as the 3D model and its stills draw it (career
 * round 2, Nov 17 2026). One adapter turns either source into one scene state:
 *
 *  1. careerLab.raceWeather (the data lane's block for every race, keyed by
 *     sessionId: sky, wetDry, rainMm, cloudPct, windKph, gustKph,
 *     windFromDeg, tempC, source {name, tier, url}). Read first when present;
 *     absent until that lane lands, and nothing here needs it.
 *  2. The venue dossier's per-visit conditions (INDY NXT, Open-Meteo hourly
 *     archive for the race hour: sky words, wet/dry, wind, gust, bearing).
 *
 * Every number shown is the source's own; only the look (the sky category,
 * how hard the rain falls) is derived, from the source's own words and rain.
 * ==========================================================================*/

export type Sky = 'clear' | 'partly' | 'overcast' | 'rain' | 'storm';

export interface SceneWeather {
  sessionId: string;
  sky: Sky;
  /** The source's own words for the sky ("light drizzle"), when it has them. */
  skyWords: string | null;
  wet: boolean;
  /** 0..1, how hard the rain falls in the picture (derived from rainMm or the sky words); 0 when dry. */
  rainIntensity: number;
  rainMm: number | null;
  cloudPct: number | null;
  windKph: number | null;
  gustKph: number | null;
  /** The bearing the wind blows FROM, degrees from true north. */
  windFromDeg: number | null;
  tempC: number | null;
  source: { name: string; tier: 'observed' | 'modelled'; url: string | null };
}

type Row = Record<string, unknown>;
const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Sky words (Open-Meteo's WMO descriptions, or a category name) to a sky category. */
export const skyOf = (words: string | null, wet = false): Sky | null => {
  if (!words) return wet ? 'rain' : null;
  const w = words.toLowerCase();
  if (/thunder|storm/.test(w)) return 'storm';
  if (/rain|drizzle|shower|sleet|snow/.test(w)) return 'rain';
  if (/partly|mostly cloudy|broken|scattered/.test(w)) return 'partly';
  if (/overcast|fog|mist|cloudy/.test(w)) return 'overcast';
  if (/clear|sun|fair/.test(w)) return 'clear';
  return null;
};

const rainIntensityOf = (sky: Sky, words: string | null, rainMm: number | null, wet: boolean): number => {
  if (sky !== 'rain' && sky !== 'storm') return 0;
  if (rainMm !== null && rainMm > 0) return Math.max(0.15, Math.min(1, Math.sqrt(rainMm / 6)));
  const w = (words ?? '').toLowerCase();
  if (/heavy|violent|storm|thunder/.test(w)) return 0.95;
  if (/moderate/.test(w)) return 0.6;
  if (/light|drizzle|slight/.test(w)) return 0.3;
  return wet ? 0.45 : 0.35;
};

/** One row of careerLab.raceWeather (the data lane's shape) to a scene state. */
const fromRaceWeather = (row: Row): SceneWeather | null => {
  const sessionId = str(row.sessionId);
  if (!sessionId) return null;
  const wet = str(row.wetDry) === 'wet';
  const rawSky = str(row.sky);
  const sky = (['clear', 'partly', 'overcast', 'rain', 'storm'] as const).find((s) => s === rawSky) ?? skyOf(rawSky, wet);
  if (!sky) return null;
  const source = (row.source ?? {}) as Row;
  const rainMm = num(row.rainMm);
  return {
    sessionId,
    sky,
    skyWords: str(row.skyWords) ?? null,
    wet: wet || sky === 'rain' || sky === 'storm',
    rainIntensity: rainIntensityOf(sky, str(row.skyWords), rainMm, wet),
    rainMm,
    cloudPct: num(row.cloudPct),
    windKph: num(row.windKph),
    gustKph: num(row.gustKph),
    windFromDeg: num(row.windFromDeg),
    tempC: num(row.tempC),
    source: { name: str(source.name) ?? 'Race-hour weather', tier: source.tier === 'observed' ? 'observed' : 'modelled', url: str(source.url) }
  };
};

/** One venue-dossier visit's conditions to a scene state. */
const fromDossier = (sessionId: string, c: Row): SceneWeather | null => {
  const words = str(c.sky);
  const wet = str(c.wetDry) === 'wet';
  const sky = skyOf(words, wet);
  if (!sky) return null;
  return {
    sessionId,
    sky,
    skyWords: words,
    wet,
    rainIntensity: rainIntensityOf(sky, words, null, wet),
    rainMm: null,
    cloudPct: null,
    windKph: num(c.windSpeedKph),
    gustKph: num(c.windGustKph),
    windFromDeg: num(c.windDirectionDeg),
    tempC: num(c.ambientTempC),
    source: {
      name: str(c.source) ?? 'Open-Meteo Historical Weather API hourly archive',
      tier: c.sourceType === 'observed_station' || c.sourceType === 'trackside_official' ? 'observed' : 'modelled',
      url: 'https://open-meteo.com/en/docs/historical-weather-api'
    }
  };
};

let table: Map<string, SceneWeather> | null = null;
const weatherTable = (): Map<string, SceneWeather> => {
  if (table) return table;
  table = new Map();
  const screens = (uiDataPackage as unknown as { screens?: Row }).screens ?? {};
  // the venue dossier first, so the career-wide block (when it lands) overrides it race by race
  const dossier = (screens.venueDossier ?? {}) as { venues?: Array<{ visits?: Array<{ sessionId: string; conditions: Row | null }> }> };
  for (const venue of dossier.venues ?? []) {
    for (const visit of venue.visits ?? []) {
      if (!visit.conditions) continue;
      const w = fromDossier(visit.sessionId, visit.conditions);
      if (w) table.set(w.sessionId, w);
    }
  }
  const lab = (screens.careerLab ?? {}) as Row;
  const block = lab.raceWeather as unknown;
  const rows: Row[] = Array.isArray(block)
    ? (block as Row[])
    : block && typeof block === 'object'
      ? Object.entries(block as Record<string, Row>).map(([key, row]) => ({ sessionId: key, ...(row ?? {}) }))
      : [];
  for (const row of rows) {
    const w = fromRaceWeather(row);
    if (w) table.set(w.sessionId, w);
  }
  return table;
};

/* A small local fixture for checks (review copy only): ?wxfixture=rain|overcast|sun|wind|storm|calm */
const FIXTURE: Record<string, Omit<SceneWeather, 'sessionId'>> = {
  sun: { sky: 'clear', skyWords: 'clear sky', wet: false, rainIntensity: 0, rainMm: 0, cloudPct: 5, windKph: 9, gustKph: 18, windFromDeg: 225, tempC: 27, source: { name: 'fixture', tier: 'modelled', url: null } },
  overcast: { sky: 'overcast', skyWords: 'overcast', wet: false, rainIntensity: 0, rainMm: 0, cloudPct: 100, windKph: 14, gustKph: 26, windFromDeg: 300, tempC: 16, source: { name: 'fixture', tier: 'modelled', url: null } },
  rain: { sky: 'rain', skyWords: 'moderate rain', wet: true, rainIntensity: 0.6, rainMm: 2.2, cloudPct: 100, windKph: 16, gustKph: 34, windFromDeg: 200, tempC: 14, source: { name: 'fixture', tier: 'modelled', url: null } },
  storm: { sky: 'storm', skyWords: 'thunderstorm', wet: true, rainIntensity: 1, rainMm: 7, cloudPct: 100, windKph: 30, gustKph: 62, windFromDeg: 250, tempC: 22, source: { name: 'fixture', tier: 'modelled', url: null } },
  wind: { sky: 'partly', skyWords: 'partly cloudy', wet: false, rainIntensity: 0, rainMm: 0, cloudPct: 45, windKph: 38, gustKph: 64, windFromDeg: 270, tempC: 19, source: { name: 'fixture', tier: 'modelled', url: null } },
  calm: { sky: 'clear', skyWords: 'clear sky', wet: false, rainIntensity: 0, rainMm: 0, cloudPct: 0, windKph: 0, gustKph: 4, windFromDeg: null, tempC: 24, source: { name: 'fixture', tier: 'modelled', url: null } }
};

/** The weather for a race, or null where no source has it. */
export const sceneWeatherFor = (sessionId: string | null | undefined): SceneWeather | null => {
  if (!sessionId) return null;
  if (REVIEW_HOST) {
    const fixture = switchValue('wxfixture');
    if (fixture && FIXTURE[fixture]) return { sessionId, ...FIXTURE[fixture] };
  }
  return weatherTable().get(sessionId) ?? null;
};

/** The weather review switch: 'arrow' (default), 'sock', or 'off' (no weather on the models at all). */
export type WeatherTake = 'arrow' | 'sock' | 'off';
export const weatherTake = (search?: URLSearchParams): WeatherTake => {
  const value = switchValue('wx', search);
  return value === 'sock' || value === 'off' ? value : 'arrow';
};

/** "light drizzle, wind 8 mph WSW, gusts 27" in the house wind grammar. */
export const weatherWords = (w: SceneWeather): string => {
  const sky = w.skyWords ?? { clear: 'clear', partly: 'partly cloudy', overcast: 'overcast', rain: 'rain', storm: 'thunderstorm' }[w.sky];
  const parts = [w.wet && w.sky !== 'rain' && w.sky !== 'storm' ? `${sky}, a wet track` : sky];
  if (w.windKph !== null) {
    const mph = Math.round(w.windKph / 1.609344);
    const wind = formatWind(mph, mph > 0 ? windCardinal(w.windFromDeg) : null);
    const gust = w.gustKph !== null ? Math.round(w.gustKph / 1.609344) : null;
    parts.push(mph > 0 ? `wind ${wind}${gust !== null && gust > mph + 4 ? `, gusts ${gust}` : ''}` : 'calm');
  }
  return parts.join(', ');
};

/** One clause for the model's caption: "Race hour: light drizzle, wind 8 mph WSW (modelled, Open-Meteo)." */
export const weatherCaption = (w: SceneWeather): string => {
  const who = /open-meteo/i.test(w.source.name) ? 'Open-Meteo' : w.source.name;
  return `Race hour: ${weatherWords(w)} (${w.source.tier}, ${who}).`;
};

/* ---------- the page says which race the models below it show ---------- */

const TrackWeatherContext = createContext<SceneWeather | null | undefined>(undefined);

/** Every 3D model and still below this draws the race's weather (the Tracks
 *  page's selected race, the replay). `weather` overrides the lookup. */
export const TrackWeatherProvider = ({ sessionId, weather, children }: { sessionId?: string | null; weather?: SceneWeather | null; children: ReactNode }) => {
  const value = useMemo(() => (weather !== undefined ? weather : sceneWeatherFor(sessionId ?? null)), [weather, sessionId]);
  return <TrackWeatherContext.Provider value={value}>{children}</TrackWeatherContext.Provider>;
};

/** The weather a model or still should draw: its own prop if given (null: none), else the page's. */
export const useTrackWeather = (own?: SceneWeather | null): SceneWeather | null => {
  const fromPage = useContext(TrackWeatherContext);
  if (own !== undefined) return own;
  return fromPage ?? null;
};

/** True inside a TrackWeatherProvider: the page draws weather on its models and stills. */
export const usePageDrawsWeather = (): boolean => useContext(TrackWeatherContext) !== undefined;
