import { useEffect, useState } from 'react';
import { asString } from './format';

type Row = Record<string, unknown>;

export interface NextSessionInfo {
  eventName: string | null;
  sessionName: string | null;
  startsAt: string | null;
}

/** Next scheduled INDY NXT session from the live-runner schedule feeds
 *  (/api/next-session). Optional — returns null when the endpoint is absent. */
export const useNextSession = (): NextSessionInfo | null => {
  const [info, setInfo] = useState<NextSessionInfo | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/next-session', { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const payload = (await response.json()) as Row;
        if (cancelled || payload.available !== true) return;
        const next = (payload.nextSession as Row) ?? null;
        if (!next) return;
        setInfo({
          eventName: asString(next.eventName),
          sessionName: asString(next.sessionName),
          startsAt: asString(next.startsAt)
        });
      } catch {
        /* schedule endpoint optional — day-precision package data covers the fallback */
      }
    };
    void load();
    const timer = setInterval(load, 5 * 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);
  return info;
};

export const normalizedName = (value: string | null): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
