import { useCallback, useEffect, useRef, useState } from 'react';
import { uiDataPackage, type UiLiveFixture } from '../data/uiDataPackage';
import { useRouter } from './router';

/** Runtime readiness payload shares the fixture shape (live-readiness.v1). */
export type LiveReadiness = UiLiveFixture;

export interface ReplaySourceGap {
  code: 'source_gap';
  sessionKey: string;
  requestedAt: string;
  lastObservedAt: string;
  heldThroughAt: string;
  nextObservedAt: string;
  resumeAt: string;
  sourceGapSeconds: number;
  maximumHoldSeconds: number;
  message: string;
}

export interface ReadinessStatus {
  payload: LiveReadiness | null;
  /** true when rendering a package fixture via ?fixture= (dev/QA affordance) */
  fixtureMode: boolean;
  error: string | null;
  /** A replay interval deliberately withheld after its bounded hold expired. */
  sourceGap: ReplaySourceGap | null;
  checkedAt: number | null;
  /** Forces an immediate poll, cancelling the scheduled one. A cold pre-race
   *  page sits on a 15s pre_session cadence (60s after a failed fetch); when a
   *  replay engages server-side in ~30ms the page must not wait out that gap on
   *  the cue card, so the replay hook nudges an immediate refetch. */
  refresh: () => void;
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

/**
 * @param getReplayParams When the Live page is driving a per-client replay, this
 *   returns `?replay=<sessionKey>&rt=<isoVirtualTime>&speed=<n>` for the current
 *   virtual frame; otherwise `''`. It is appended to every readiness poll, so
 *   the replay lives entirely in THIS client's requests — a plain client (no
 *   params) always receives the real feed. Read at poll time so `rt` is current.
 */
export const useReadiness = (getReplayParams?: () => string): ReadinessStatus => {
  const { route } = useRouter();
  const fixtureState = route.search.get('fixture');
  const fixtureVariant = route.search.get('variant') ?? 'base';
  const replayParamsRef = useRef<() => string>(() => '');
  replayParamsRef.current = getReplayParams ?? (() => '');

  const [status, setStatus] = useState<ReadinessStatus>({ payload: null, fixtureMode: false, error: null, sourceGap: null, checkedAt: null, refresh: () => {} });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failuresRef = useRef(0);
  const nudgeRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (fixtureState) {
      const fixture =
        uiDataPackage.screens.liveCompanionFixtures.fixtures.find(
          (candidate) => candidate.state === fixtureState && (candidate.variant ?? 'base') === fixtureVariant
        ) ?? null;
      nudgeRef.current = () => {};
      setStatus({ payload: fixture, fixtureMode: true, error: fixture ? null : `No fixture for state ${fixtureState}`, sourceGap: null, checkedAt: Date.now(), refresh: () => {} });
      return undefined;
    }

    let cancelled = false;

    const tick = async () => {
      try {
        const response = await fetch(`/api/readiness${replayParamsRef.current()}`, { headers: { accept: 'application/json' } });
        if (response.status === 409) {
          const refused = (await response.json().catch(() => null)) as { error?: string; gap?: ReplaySourceGap } | null;
          if (refused?.error === 'source_gap' && refused.gap?.resumeAt) {
            if (cancelled) return;
            failuresRef.current = 0;
            // Drop the prior payload immediately. Keeping it would visually hold
            // the last known rank through an interval the archive did not see.
            setStatus({ payload: null, fixtureMode: false, error: null, sourceGap: refused.gap, checkedAt: Date.now(), refresh: nudgeRef.current });
            timerRef.current = setTimeout(tick, 1_000);
            return;
          }
        }
        if (!response.ok) throw new Error(`readiness ${response.status}`);
        const payload = (await response.json()) as LiveReadiness;
        if (cancelled) return;
        failuresRef.current = 0;
        setStatus({ payload, fixtureMode: false, error: null, sourceGap: null, checkedAt: Date.now(), refresh: nudgeRef.current });
        timerRef.current = setTimeout(tick, cadenceFor(payload.state, 0));
      } catch (error) {
        if (cancelled) return;
        failuresRef.current += 1;
        setStatus((previous) => ({ ...previous, error: error instanceof Error ? error.message : String(error), checkedAt: Date.now(), refresh: nudgeRef.current }));
        timerRef.current = setTimeout(tick, cadenceFor(undefined, failuresRef.current));
      }
    };

    // An immediate poll that cancels the scheduled one — idempotent enough that a
    // spurious call just refreshes readiness a beat early.
    nudgeRef.current = () => {
      if (cancelled) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      void tick();
    };
    setStatus((previous) => ({ ...previous, refresh: nudgeRef.current }));

    void tick();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [fixtureState, fixtureVariant]);

  const refresh = useCallback(() => nudgeRef.current(), []);
  return { ...status, refresh };
};
