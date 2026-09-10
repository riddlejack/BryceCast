import { ArrowRight, History } from 'lucide-react';
import type { ReplaySourceGap } from '../app/useReadiness';
import type { ReplaySession } from '../app/useReplaySession';
import { replayProvenance } from '../data/replayAvailable';

const duration = (value: number): string => {
  const rounded = Math.max(0, Math.round(value));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
};
const sourceClock = (value: string, replay: ReplaySession): string => {
  if (replayProvenance(replay.session).tier === 'racetools_capture') {
    return `${value.match(/T(\d{2}:\d{2}:\d{2})/)?.[1] ?? value} source clock`;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? value
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
};

/** Replaces the race state during a deliberately withheld replay interval. The
 * previous running order is absent here by design: the source did not observe
 * what happened between those two timestamps. */
export const ReplaySourceGapNotice = ({ gap, replay }: { gap: ReplaySourceGap; replay: ReplaySession }) => (
  <section className="replay-source-gap" role="status" aria-label="Replay source gap">
    <div>
      <span className="replay-bar__chip"><History size={13} aria-hidden /> Source gap</span>
      <h1 className="replay-source-gap__title">Timing coverage is unavailable here</h1>
      <p className="replay-source-gap__copy">
        The archive has no source observations for {duration(gap.sourceGapSeconds)}. It held the last observation for no more than{' '}
        {duration(gap.maximumHoldSeconds)}, then stopped rendering timing until the source returned.
      </p>
    </div>
    <button
      type="button"
      className="replay-source-gap__jump"
      onClick={() => replay.jumpTo(gap.resumeAt, gap.sourceGapSeconds)}
    >
      Jump to {sourceClock(gap.resumeAt, replay)} <ArrowRight size={14} aria-hidden />
    </button>
  </section>
);

export const ReplayGapSkippedNote = ({ replay }: { replay: ReplaySession }) => {
  const skipped = replay.skippedSourceGap;
  if (!skipped) return null;
  return (
    <section className="replay-gap-skipped" role="status">
      <span className="replay-bar__chip"><History size={13} aria-hidden /> Source gap skipped</span>
      <span>
        {duration(skipped.seconds)} without source timing was omitted. Replay resumed at {sourceClock(skipped.resumeAt, replay)}.
      </span>
    </section>
  );
};
