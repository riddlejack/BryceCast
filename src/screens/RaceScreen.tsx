import { useEffect, useState } from 'react';
import type { LiveReadiness } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { loadDebriefBySessionId } from '../data/debriefArchive';
import { raceSurfaceFor, type DebriefPresence } from '../data/liveRaceShellModel';
import { RaceDetailScreen } from './RaceDetailScreen';
import { LiveRaceShell } from './LiveRaceShell';

/**
 * /races/<sessionId> — one URL, two surfaces, zero ceremony. The routing
 * decision lives in {@link raceSurfaceFor}: completed races (no live claim on
 * the page) render the ordinary RaceDetailScreen on first paint, exactly as
 * before — the debrief check below never gates that path, so the hard
 * zero-regression bar holds. Only when the live feed (or this client's engaged
 * replay) claims the page does the debrief's presence decide shell vs debrief.
 */
export const RaceScreen = ({
  sessionId,
  payload,
  history,
  replay
}: {
  sessionId: string;
  payload: LiveReadiness | null;
  history: LiveSessionHistory | null;
  replay: ReplaySession | null;
}) => {
  const [debrief, setDebrief] = useState<DebriefPresence>('loading');

  useEffect(() => {
    let cancelled = false;
    setDebrief('loading');
    // Same cached archive load RaceDetailScreen performs — no second fetch.
    loadDebriefBySessionId(sessionId)
      .then((entry) => {
        if (!cancelled) setDebrief(entry ? 'present' : 'absent');
      })
      .catch(() => {
        if (!cancelled) setDebrief('absent');
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const replayActive = Boolean(replay && !replay.unavailable && !replay.refusedReason && !replay.endedByLive);
  // A URL-requested replay that has not resolved its capture yet (the catalog
  // fetch is in flight) must hold the skeleton — never flash the debrief on the
  // way into the shell. Refused/unavailable replays fall through honestly.
  const replayResolving = Boolean(replay && replayActive && !replay.session);
  const surface = raceSurfaceFor({
    requestedSessionId: sessionId,
    debrief,
    payload,
    replayCanonicalSessionId: replayActive ? replay?.session?.canonicalSessionId ?? null : null
  });

  if (surface === 'pending' || (replayResolving && surface === 'detail')) {
    // A live claim with the debrief check still in flight: hold the same
    // skeleton the debrief page opens with, then commit to one surface.
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 40 }} />
        <div className="skeleton" style={{ height: 220 }} />
        <div className="skeleton" style={{ height: 340 }} />
      </div>
    );
  }

  if (surface === 'shell') {
    return <LiveRaceShell sessionId={sessionId} payload={payload} history={history} replay={replayActive ? replay : null} />;
  }

  return <RaceDetailScreen sessionId={sessionId} />;
};
