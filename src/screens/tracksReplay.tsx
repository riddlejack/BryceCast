import { useState } from 'react';
import { Link } from '../app/router';
import { ordinal } from '../app/format';
import type { LiveReadiness, ReplaySourceGap } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import type { LiveSessionHistory } from '../data/liveHistoryModel';
import { replayDeepLinkQuery } from '../data/liveRaceShellModel';
import { uiDataPackage } from '../data/uiDataPackage';
import { TrackWeatherProvider } from '../three/weather/sceneWeather';
import { ReplayBar, replayDeskPhaseOf, useReplayStage } from './LiveScreen';
import { TrackPanel } from './liveParts';
import { RaceBar } from './liveRaceBar';
import { ReplayGapSkippedNote, ReplaySourceGapNotice } from './replaySourceGap';
import './live.css';

/**
 * The replay on the Tracks page (round 8): the same race as /live — the same
 * clock, bar, field, turn fill and formation start — on the page's own 3D
 * track, without the Live desk's running order and Bryce column. Everything
 * here is the Live page's own parts (useReplayStage, ReplayBar, RaceBar,
 * TrackPanel); this file only arranges them.
 */
const TracksReplay = ({
  replay,
  payload,
  history,
  sourceGap,
  sessionId,
  onExit
}: {
  replay: ReplaySession;
  payload: LiveReadiness | null;
  history: LiveSessionHistory | null;
  sourceGap: ReplaySourceGap | null;
  /** The canonical race being replayed (the pickers' race). */
  sessionId: string;
  onExit: () => void;
}) => {
  const { framed, phase } = replayDeskPhaseOf(payload, sourceGap);
  const stage = useReplayStage({ payload: framed, phase, history, sessionKind: 'race', replay });
  const [hoverCar, setHoverCar] = useState<string | null>(null);

  // His place, beside the flag and lap: the grid slot on the formation lap,
  // then the running position. A fixed width, so a change never moves the bar.
  const startPosition =
    (uiDataPackage.screens.raceDebrief.seasonIndex ?? []).find((row) => row.sessionId === sessionId)?.startPosition ?? null;
  // The running place is the stage's one reading, the same the race bar shows.
  const place =
    stage.shownPhase === 'prestart'
      ? startPosition
        ? `Starts ${ordinal(startPosition)}`
        : null
      : stage.place !== null
        ? `Bryce P${stage.place}`
        : null;

  const liveHref = `/live${replayDeepLinkQuery(replay.getReplayParams()) || `?replay=${encodeURIComponent(replay.session?.sessionKey ?? '')}`}&from=${encodeURIComponent(sessionId)}`;

  return (
    <section className="tracks-replay" data-tracks-replay data-desk-phase={stage.shownPhase} aria-label="The race, replayed on the track">
      <ReplayGapSkippedNote replay={replay} />
      {sourceGap ? <ReplaySourceGapNotice gap={sourceGap} replay={replay} /> : null}
      <ReplayBar
        replay={replay}
        payload={framed}
        onExit={onExit}
        lead={
          <div className="tracks-replay__lead">
            {stage.readout}
            <span className="tracks-replay__place tnum" data-tracks-replay-place>
              {place ?? ' '}
            </span>
          </div>
        }
      />
      {/* The bar's room is held before its axis lands, so the stage never moves down. */}
      <div className="tracks-replay__race">
        {stage.axis ? (
          <RaceBar replay={replay} axis={stage.axis} timeline={replay.timeline} virtualNow={stage.virtualNow} now={stage.now} place={stage.place} onSeek={stage.seek} />
        ) : null}
      </div>
      {/* The race hour's weather on the replay's track (the race being replayed). */}
      <TrackWeatherProvider sessionId={sessionId}>
        <TrackPanel
          identity={stage.identity}
          replay={replay}
          race={stage.race}
          mode={stage.shownPhase === 'race' || stage.shownPhase === 'ended' ? 'race' : 'prestart'}
          field={stage.fieldMode}
          fieldCars={stage.fieldCars}
          trail={stage.trail}
          bryceLabel={stage.bryceLabel}
          highlightId={hoverCar}
          onHoverCar={setHoverCar}
        />
      </TrackWeatherProvider>
      <p className="tracks-replay__out">
        <Link to={liveHref}>Full replay on the Live page →</Link>
      </p>
    </section>
  );
};

export default TracksReplay;
