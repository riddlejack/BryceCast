import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { SourcePill } from '../app/components';
import { useRouter } from '../app/router';
import { formatDate } from '../app/format';
import {
  loadReplayAvailable,
  replayProvenance,
  type ReplayAvailable,
  type ReplaySessionInfo
} from '../data/replayAvailable';

/** Loads the replay catalog once. Null while the check is in flight and where
 *  replay is disabled (production 404) or unreachable — every caller treats null
 *  as "no replay here" and renders nothing, so the affordance is silent unless
 *  the magic is real. */
export const useReplayCatalog = (): ReplayAvailable | null => {
  const [available, setAvailable] = useState<ReplayAvailable | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadReplayAvailable()
      .then((value) => {
        if (!cancelled) setAvailable(value);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
};

/** The replay's quiet meta line: date · minutes of capture/replay · laps. */
const replayMeta = (capture: ReplaySessionInfo, isOwnCapture: boolean): string => {
  const date = capture.firstCheckedAt ? formatDate(capture.firstCheckedAt, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const minutes = capture.durationSeconds ? Math.round(capture.durationSeconds / 60) : null;
  const captureWord = isOwnCapture ? 'capture' : 'replay';
  return [date, minutes ? `${minutes} min of ${captureWord}` : null, capture.totalLaps ? `${capture.totalLaps} laps` : null]
    .filter(Boolean)
    .join(' · ');
};

const provPathFor = (isOwnCapture: boolean): string =>
  isOwnCapture
    ? '/api/replay/available → data/live/brycecast.sqlite'
    : '/api/replay/available → analysis/replay-feeds (lake-fed)';

/**
 * One replay affordance — a link into the existing Live-page replay experience,
 * never a new surface. `primary` is the full time-machine invitation (the race's
 * own capture, or Race Week's headline "last year"); `compact` is a quiet row
 * for an additional prior year. Both name their source tier through the same
 * SourcePill drawer as every other module, and the drawer carries the as-raced
 * honesty line for third-party replays (from {@link replayProvenance}) — the one
 * home for that line, never duplicated into the visible copy.
 */
export const ReplayAffordance = ({
  capture,
  fromSessionId,
  title,
  copy,
  variant = 'primary'
}: {
  capture: ReplaySessionInfo;
  /** Where "exit replay" returns — the canonical race page of the race being
   *  watched, so leaving last year's replay lands on last year's race page. */
  fromSessionId: string;
  title: string;
  copy?: string;
  variant?: 'primary' | 'compact';
}) => {
  const { navigate } = useRouter();
  const prov = replayProvenance(capture);
  const isOwnCapture = prov.tier === 'brycecast_capture';
  const meta = replayMeta(capture, isOwnCapture);
  const open = () => navigate(`/live?replay=${encodeURIComponent(capture.sessionKey)}&from=${encodeURIComponent(fromSessionId)}`);
  const sourcePill = (
    <SourcePill
      title={title}
      entries={[{ label: prov.label, path: provPathFor(isOwnCapture), note: prov.detail }]}
      caveats={prov.caveat ? [prov.caveat] : undefined}
    />
  );

  if (variant === 'compact') {
    return (
      <div className="race-replay__year">
        <button type="button" className="race-replay__year-link" onClick={open}>
          <span className="race-replay__year-play" aria-hidden>
            <Play size={14} />
          </span>
          <span className="race-replay__year-text">
            <span className="race-replay__year-title">{title}</span>
            {meta ? <span className="race-replay__year-meta tnum">{meta}</span> : null}
          </span>
        </button>
        <div className="race-replay__year-prov">
          <span className="caption caption--secondary">{prov.label}</span>
          {sourcePill}
        </div>
      </div>
    );
  }

  return (
    <div className="race-replay__affordance">
      <button type="button" className="race-replay__cta" onClick={open}>
        <span className="race-replay__play" aria-hidden>
          <Play size={20} />
        </span>
        <span className="race-replay__body">
          <span className="race-replay__title">{title}</span>
          {copy ? <span className="race-replay__copy">{copy}</span> : null}
          {meta ? <span className="race-replay__meta tnum">{meta}</span> : null}
        </span>
      </button>
      <div className="race-replay__provenance">
        <span className="caption caption--secondary">{prov.label}</span>
        {sourcePill}
      </div>
    </div>
  );
};

/** Copy for a prior-year affordance title. Single-race years read "the 2025
 *  race"; a doubleheader year keeps its label ("2025 · Race 1") so the two
 *  never collide. */
export const priorYearTitle = (seasonYear: number, raceLabel: string): string =>
  raceLabel.trim() === String(seasonYear) ? `Watch the ${seasonYear} race unfold` : `Watch ${raceLabel} unfold`;
