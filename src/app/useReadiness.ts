import { useEffect, useRef, useState } from 'react';
import { uiDataPackage, type UiLiveFixture } from '../data/uiDataPackage';
import { useRouter } from './router';

/** Runtime readiness payload shares the fixture shape (live-readiness.v1). */
export type LiveReadiness = UiLiveFixture;

export interface ReadinessStatus {
  payload: LiveReadiness | null;
  /** true when rendering a package fixture via ?fixture= (dev/QA affordance) */
  fixtureMode: boolean;
  error: string | null;
  checkedAt: number | null;
}

/** Poll cadence per product contract: 1s live, gentle otherwise, backoff on failure. */
const cadenceFor = (state: string | undefined, failures: number): number => {
  if (failures > 0) return Math.min(60_000, 5_000 * 2 ** (failures - 1));
  switch (state) {
    case 'ready':
    case 'degraded':
      return 1_000;
    case 'pre_session':
      return 15_000;
    case 'wrong_series':
    case 'stale':
      return 30_000;
    default:
      return 60_000;
  }
};

export const useReadiness = (): ReadinessStatus => {
  const { route } = useRouter();
  const fixtureState = route.search.get('fixture');
  const fixtureVariant = route.search.get('variant') ?? 'base';

  const [status, setStatus] = useState<ReadinessStatus>({ payload: null, fixtureMode: false, error: null, checkedAt: null });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);

  useEffect(() => {
    if (fixtureState) {
      const fixture =
        uiDataPackage.screens.liveCompanionFixtures.fixtures.find(
          (candidate) => candidate.state === fixtureState && (candidate.variant ?? 'base') === fixtureVariant
        ) ?? null;
      setStatus({ payload: fixture, fixtureMode: true, error: fixture ? null : `No fixture for state ${fixtureState}`, checkedAt: Date.now() });
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch('/api/readiness', { headers: { accept: 'application/json' } });
        if (!response.ok) throw new Error(`readiness ${response.status}`);
        const payload = (await response.json()) as LiveReadiness;
        if (cancelled) return;
        failuresRef.current = 0;
        setStatus({ payload, fixtureMode: false, error: null, checkedAt: Date.now() });
        timerRef.current = setTimeout(tick, cadenceFor(payload.state, 0));
      } catch (error) {
        if (cancelled) return;
        failuresRef.current += 1;
        setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), checkedAt: Date.now() }));
        timerRef.current = setTimeout(tick, cadenceFor(undefined, failuresRef.current));
      }
    };

    void tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fixtureState, fixtureVariant]);

  return status;
};
