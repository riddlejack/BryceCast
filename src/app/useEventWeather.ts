import { useEffect, useRef, useState } from 'react';
import { asNumber, asString, formatDate, formatNumber, formatWind, windCardinal } from './format';
import type { UiVenueDossierScheduledSession } from '../data/uiDataPackage';

type Row = Record<string, unknown>;

/* ---------- near-track weather: shared by Race Week and the Home hero ----------
 *  One hook, one source of truth. The race-week hero's wind pill, the weather
 *  window, and the Home race-day hero all read from here, so the "now" reading
 *  can never disagree between two spots on the same page (Jack's review). */

export interface CurrentConditions {
  tempF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  windDirectionDeg: number | null;
  windCardinal: string | null;
  sky: string | null;
}

export interface RaceHourSlot {
  sessionId: string;
  sessionLabel: string;
  when: string;
  tempText: string;
  /** Numeric reads for delta math; null when the NWS unit isn't Fahrenheit or
   *  the wind speed is a range ("5 to 10 mph" carries no single number). */
  tempF: number | null;
  humidityPct: number | null;
  windMph: number | null;
  windDirCardinal: string | null;
  sky: string | null;
  windText: string | null;
}

export interface EventWeather {
  current: CurrentConditions | null;
  raceHour: RaceHourSlot[];
  readinessNote: string | null;
  /** NWS observation timestamp — how old the "at the track right now" read is. */
  observedAt: string | null;
}

const sessionLabelFor = (session: UiVenueDossierScheduledSession): string =>
  asString(session.sessionName) ?? session.sessionType.charAt(0).toUpperCase() + session.sessionType.slice(1);

/** Turn one weather report (observation + forecastHourly) into the current-now
 *  block plus the race-hour strip. NWS hourly periods carry the venue's local
 *  wall clock with an offset; a scheduled session start is the same local wall
 *  clock without one, so the race hour is the period whose local date+hour
 *  matches. */
const readWeatherReport = (
  weatherData: Row,
  scheduledSessions: UiVenueDossierScheduledSession[],
  readinessNote: string | null
): EventWeather => {
  const observation = (weatherData.observation ?? {}) as Row;
  const temperatureC = asNumber(observation.temperatureC);
  const windSpeedKph = asNumber(observation.windSpeedKph);
  const windMph = windSpeedKph !== null ? Math.round(windSpeedKph / 1.609344) : null;
  const current: CurrentConditions = {
    tempF: temperatureC !== null ? Math.round((temperatureC * 9) / 5 + 32) : null,
    humidityPct: asNumber(observation.relativeHumidityPct),
    windMph,
    windDirectionDeg: asNumber(observation.windDirectionDeg),
    /* Still air carries no direction — drop the cardinal at 0 mph so nothing
     *  downstream can render "from the N" for a calm reading. */
    windCardinal: windMph === 0 ? null : windCardinal(observation.windDirectionDeg),
    sky: asString(observation.textDescription)
  };
  const hourly = Array.isArray(weatherData.forecastHourly) ? (weatherData.forecastHourly as Row[]) : [];
  const raceHour: RaceHourSlot[] = [];
  for (const session of scheduledSessions) {
    const start = asString(session.scheduledStart);
    if (!start) continue;
    const targetHour = start.slice(0, 13); // YYYY-MM-DDTHH
    const period = hourly.find((row) => (asString(row.startTime) ?? '').slice(0, 13) === targetHour);
    if (!period) continue;
    const windText = asString(period.windSpeed);
    const windDir = asString(period.windDirection);
    const tempUnit = asString(period.temperatureUnit) ?? 'F';
    const singleMph = windText?.match(/^(\d+)\s*mph$/i);
    const slotMph = singleMph ? Number(singleMph[1]) : null;
    raceHour.push({
      sessionId: session.sessionId,
      sessionLabel: sessionLabelFor(session),
      when: formatDate(start, { weekday: 'short', hour: 'numeric' }),
      tempText: `${formatNumber(period.temperature, 0)}°${tempUnit}`,
      tempF: tempUnit === 'F' ? asNumber(period.temperature) : null,
      humidityPct: asNumber(period.relativeHumidityPct),
      windMph: slotMph,
      windDirCardinal: windDir,
      sky: asString(period.shortForecast),
      /* House wind convention: speed + direction as one value, calm at 0 mph.
       *  A range ("5 to 10 mph") carries no single number, so keep its raw text
       *  and append the cardinal the way NWS ships it. */
      windText: slotMph !== null ? formatWind(slotMph, windDir) : windText ? `${windText}${windDir ? ` ${windDir}` : ''}` : null
    });
  }
  return { current, raceHour, readinessNote, observedAt: asString(observation.timestamp) ?? null };
};

/** Quiet freshness label for the current observation. "right now" is only
 *  honest with the age of the read shown next to it. */
export const observedAgoLabel = (iso: string | null, now = Date.now()): string | null => {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return 'observed just now';
  if (minutes < 60) return `observed ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `observed ${hours}h ago`;
};

/** The track-shape wind pill, built from current conditions in ONE place so the
 *  hero pill and the weather window never disagree (fix 4). `frame` is the
 *  one-word timeframe shown before the value ("now"). Calm (0 mph) carries no
 *  bearing — the pill then draws no arrow and reads "now · calm" (fix 3). */
export const currentWindPill = (
  current: CurrentConditions | null,
  frame?: string
): { bearingDeg: number | null; label: string; frame?: string } | null => {
  if (!current || current.windMph === null) return null;
  return {
    bearingDeg: current.windMph <= 0 ? null : current.windDirectionDeg,
    label: formatWind(current.windMph, current.windCardinal),
    frame
  };
};

/** Current-now + race-hour forecast for a venue. Prefers the upcoming-events
 *  feed, but falls back to the venue's live weather by trackId — the imminent
 *  race rolls off the "upcoming" set exactly when the family most wants its
 *  forecast, so the race-week venue must never go dark.
 *  The server caches near-track weather for 5 minutes; the page polls on that
 *  cadence so "at the track right now" stays honest, with a short capped retry
 *  on a failed poll and a persistent-unavailable state after retries run out. */
const WEATHER_POLL_MS = 5 * 60 * 1000;
const WEATHER_RETRY_MS = 20 * 1000;
const WEATHER_MAX_RETRIES = 3;

export const useEventWeather = (
  eventId: string | null,
  trackId: string | null,
  scheduledSessions: UiVenueDossierScheduledSession[]
): { weather: EventWeather | null; unavailable: boolean } => {
  const [weather, setWeather] = useState<EventWeather | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const weatherRef = useRef<EventWeather | null>(null);
  const sessionKey = scheduledSessions.map((session) => `${session.sessionId}@${session.scheduledStart}`).join('|');
  useEffect(() => {
    if (!eventId && !trackId) return undefined;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    /** One fetch pass. Returns a report, or null when no near-track weather
     *  could be reached (network error, no matching event, no live fallback). */
    const fetchOnce = async (): Promise<EventWeather | null> => {
      try {
        const response = await fetch('/api/weather/upcoming', { headers: { accept: 'application/json' } });
        if (response.ok) {
          const payload = (await response.json()) as Row;
          const events = Array.isArray(payload.events) ? (payload.events as Row[]) : [];
          const match = events.find((entry) => asString((entry.event as Row)?.id) === eventId);
          if (match) {
            return readWeatherReport(
              (match.weather ?? {}) as Row,
              scheduledSessions,
              asString((match.forecastReadiness as Row)?.note)
            );
          }
        }
        /* Fallback: the venue isn't in the upcoming set (it's the current race).
         * Pull its live weather straight by trackId. */
        if (!trackId) return null;
        const live = await fetch(`/api/weather/live?trackId=${encodeURIComponent(trackId)}`, { headers: { accept: 'application/json' } });
        if (!live.ok) return null;
        const liveData = (await live.json()) as Row;
        return readWeatherReport(liveData, scheduledSessions, null);
      } catch {
        return null;
      }
    };

    const attempt = async (retriesLeft: number) => {
      const report = await fetchOnce();
      if (cancelled) return;
      if (report) {
        weatherRef.current = report;
        setWeather(report);
        setUnavailable(false);
        return;
      }
      if (retriesLeft > 0) {
        retryTimer = setTimeout(() => void attempt(retriesLeft - 1), WEATHER_RETRY_MS);
        return;
      }
      // Retries exhausted: only surface the unavailable state when we have never
      // shown weather. If we have a prior read, keep it — its age keeps climbing
      // honestly rather than blanking the module on a transient outage.
      if (!weatherRef.current) setUnavailable(true);
    };

    void attempt(WEATHER_MAX_RETRIES);
    pollTimer = setInterval(() => void attempt(WEATHER_MAX_RETRIES), WEATHER_POLL_MS);
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [eventId, trackId, sessionKey]);
  return { weather, unavailable };
};
