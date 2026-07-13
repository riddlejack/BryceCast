import { useLayoutEffect, useMemo, useState } from 'react';
import {
  appendLiveHistoryPayload,
  createLiveHistoryState,
  liveSessionHistoryForPayload,
  type LiveHistoryState,
  type LiveSessionHistory
} from '../data/liveHistoryModel';
import type { LiveReadiness } from './useReadiness';

export interface LiveSessionHistoryStatus {
  state: LiveHistoryState;
  active: LiveSessionHistory | null;
}

/** Lives above route selection in AppV3. Navigating away from /live therefore
 * cannot destroy the session's five-minute chart window. */
export const useLiveSessionHistory = (payload: LiveReadiness | null): LiveSessionHistoryStatus => {
  const [state, setState] = useState<LiveHistoryState>(createLiveHistoryState);
  useLayoutEffect(() => {
    if (!payload) return;
    setState((previous) => appendLiveHistoryPayload(previous, payload));
  }, [payload]);
  const active = useMemo(() => liveSessionHistoryForPayload(state, payload), [payload, state]);
  return { state, active };
};
