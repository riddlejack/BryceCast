import { useEffect, useState } from 'react';
import { Download, Play } from 'lucide-react';
import { Card, SourcePill, StatusChip } from '../app/components';
import { Link } from '../app/router';
import {
  loadTimingCoverageForRace,
  type RaceTimingCoverage,
  type TimingCoverageSession,
  type TimingSourceCoverage
} from '../data/timingCoverage';

const seconds = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(3))}s` : '—';

const compactNumber = (value: number | null | undefined): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('en-US') : '—';

const clock = (value: string | null | undefined, basis?: string | null): string | null => {
  if (!value) return null;
  if (basis === 'session_local_feed_clock') {
    const parts = value.match(/T(\d{2}:\d{2}:\d{2})/);
    return parts ? `${parts[1]} source clock` : value;
  }
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? null
    : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
};

const numberFrom = (record: Record<string, unknown> | null | undefined, keys: string[]): number | null => {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

const recordFrom = (
  record: Record<string, unknown> | null | undefined,
  key: string
): Record<string, unknown> | null => {
  const value = record?.[key];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
};

const stringFrom = (record: Record<string, unknown> | null | undefined, key: string): string | null => {
  const value = record?.[key];
  return typeof value === 'string' ? value : null;
};

const activeCoverageLine = (session: TimingCoverageSession): string | null => {
  const coverage = session.activeWindowCoverage ?? session.primarySource?.activeWindowCoverage;
  if (!coverage) return null;
  const basis = session.primarySource?.clockBasis;
  const start = clock(stringFrom(coverage, 'observedStart'), basis);
  const end = clock(stringFrom(coverage, 'observedEnd'), basis);
  const count = numberFrom(coverage, ['observationCount']);
  const cadence = recordFrom(coverage, 'cadence');
  const gaps = recordFrom(coverage, 'gaps') ?? cadence;
  const p50 = numberFrom(cadence, ['p50Seconds']);
  const p95 = numberFrom(cadence, ['p95Seconds']);
  const max = numberFrom(gaps, ['maxSeconds']) ?? numberFrom(cadence, ['maxSeconds']);
  const bits = [
    count !== null ? `${compactNumber(count)} direct observations` : null,
    start && end ? `${start}–${end}` : null,
    p50 !== null && p95 !== null ? `cadence p50 ${seconds(p50)} · p95 ${seconds(p95)}` : null,
    max !== null ? `longest source gap ${seconds(max)}` : null
  ].filter((value): value is string => value !== null);
  return bits.length > 0 ? `Active race window: ${bits.join(' · ')}.` : null;
};

const lapCoverageLine = (session: TimingCoverageSession): string | null => {
  const coverage = session.lapObservationCoverage ?? session.primarySource?.lapObservationCoverage;
  if (!coverage) return null;
  const changes = numberFrom(coverage, ['lapChangeObservationCount']);
  const samples = numberFrom(coverage, ['sampleCount']);
  const minLap = numberFrom(coverage, ['minLap']);
  const maxLap = numberFrom(coverage, ['maxLap']);
  if (changes === null && samples === null) return null;
  const range = minLap !== null && maxLap !== null ? ` across recorded lap indexes ${minLap}–${maxLap}` : '';
  return `${changes !== null ? `${changes} observed lap-counter changes${range}` : 'Observed session clock'}${samples !== null ? ` · ${compactNumber(samples)} retained source samples` : ''}.`;
};

const sourceEndpoint = (session: TimingCoverageSession): string =>
  `/api/timing-archive/${encodeURIComponent(session.canonicalSessionId)}/observations`;

const sourceEntries = (session: TimingCoverageSession) => {
  const sources = session.sources?.length ? session.sources : session.primarySource ? [session.primarySource] : [];
  if (sources.length === 0) {
    return [{
      label: `${session.sessionName ?? session.sessionType} timing coverage`,
      note: 'The expected session remains in the ledger, but no retained timing observations were found.'
    }];
  }
  return sources.map((source, index) => ({
    label: `${session.sessionType === 'race' ? 'Race' : 'Qualifying'} ${index === 0 ? 'primary' : 'supplemental'} · ${source.label}`,
    path: index === 0 && source.observedArtifact ? sourceEndpoint(session) : undefined,
    note:
      index === 0
        ? 'Direct source observations. The downloadable gzip is served through the audited timing-archive endpoint.'
        : 'Independent retained source used for coverage context; the archive download serves the primary source.'
  }));
};

const statusTone = (status: TimingCoverageSession['status']): 'good' | 'warn' | 'neutral' =>
  status === 'observed' ? 'good' : status === 'partial' ? 'warn' : 'neutral';

const TimingSession = ({ session, race }: { session: TimingCoverageSession; race: boolean }) => {
  const source: TimingSourceCoverage | null = session.primarySource ?? null;
  const cadence = source?.cadence;
  const gaps = source?.gaps;
  const start = clock(source?.observedStart, source?.clockBasis);
  const end = clock(source?.observedEnd, source?.clockBasis);
  const activeCoverage = race ? activeCoverageLine(session) : lapCoverageLine(session);
  const replayCoverage = session.replayInterpolationCoverage;
  const maxHold = numberFrom(replayCoverage, ['maximumHoldSeconds', 'maxHoldSeconds']);
  const withheld = numberFrom(replayCoverage, ['withheldSeconds']);
  const terminalLatency = numberFrom(session.activeWindowCoverage, ['terminalFlagObservationLatencySeconds']);

  return (
    <div className="timing-archive__session">
      <div className="row row--between row--wrap">
        <div>
          <div className="timing-archive__eyebrow">{race ? 'Race timing' : session.sessionName ?? 'Qualifying timing'}</div>
          <div className="timing-archive__source">{source?.label ?? 'No retained observation source'}</div>
        </div>
        <StatusChip tone={statusTone(session.status)} label={session.status === 'observed' ? 'observed' : session.status} />
      </div>

      {source ? (
        <div className="timing-archive__facts tnum">
          <span><strong>{compactNumber(source.observationCount)}</strong> retained source observations</span>
          {start && end ? <span>{start}–{end}</span> : null}
          {cadence ? <span>Cadence p50 {seconds(cadence.p50Seconds)} · p95 {seconds(cadence.p95Seconds)}</span> : null}
          {gaps ? <span>Full retained span: {compactNumber(gaps.over5Seconds)} gaps over 5s · longest {seconds(gaps.maxSeconds)}</span> : null}
        </div>
      ) : null}

      {activeCoverage ? <p className="timing-archive__note">{activeCoverage}</p> : null}
      {race && terminalLatency !== null ? (
        <p className="timing-archive__note">The terminal flag was retained {seconds(terminalLatency)} after the active timing window ended.</p>
      ) : null}
      {race && session.replayArtifact ? (
        <p className="timing-archive__note">
          Replay uses {session.replayInterpolated ? 'bounded step-hold between source observations' : 'the retained source snapshots'}
          {session.replayInterpolated && maxHold !== null ? `, holding at most ${seconds(maxHold)}` : ''}
          {withheld !== null && withheld > 0 ? ` and withholding ${seconds(withheld)} across longer gaps` : ''}.
        </p>
      ) : null}
      {session.status === 'unavailable' ? (
        <p className="timing-archive__note">{session.caveats?.[0] ?? 'No observed timing archive is available for this session.'}</p>
      ) : null}

      <div className="timing-archive__actions">
        {race && session.replayArtifact ? (
          <Link
            to={`/live?replay=${encodeURIComponent(session.canonicalSessionId)}&from=${encodeURIComponent(session.canonicalSessionId)}`}
            className="navlink"
          >
            <Play size={13} aria-hidden /> Play race timing
          </Link>
        ) : null}
        {source?.observedArtifact ? (
          <a className="navlink" href={sourceEndpoint(session)} download>
            <Download size={13} aria-hidden /> Download {race ? 'race' : 'qualifying'} observations
          </a>
        ) : null}
      </div>
    </div>
  );
};

export const TimingCoverageCard = ({ sessionId }: { sessionId: string }) => {
  const [coverage, setCoverage] = useState<RaceTimingCoverage | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    setCoverage('loading');
    loadTimingCoverageForRace(sessionId).then((value) => {
      if (!cancelled) setCoverage(value);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (coverage === 'loading') return <div className="skeleton" style={{ height: 190 }} aria-label="Loading timing archive" />;
  if (!coverage) return null;

  const sessions = [coverage.race, coverage.qualifying].filter(
    (session): session is TimingCoverageSession => session !== null
  );
  const caveats = [...new Set(sessions.flatMap((session) => session.caveats ?? []))];
  caveats.push(
    ...sessions.flatMap((session) =>
      (session.sources ?? (session.primarySource ? [session.primarySource] : []))
        .map((source) => source.clockCaveat)
        .filter((note): note is string => Boolean(note))
    )
  );
  caveats.push('These are timing-line and display-state observations, not GPS or continuous track position.');
  caveats.push('Observation existence does not prove uninterrupted session coverage; cadence, gaps, and coverage bounds are shown separately.');

  return (
    <Card
      className="timing-archive"
      title="Timing archive"
      action={<SourcePill title="Timing archive" entries={sessions.flatMap(sourceEntries)} caveats={caveats} />}
    >
      <p className="timing-archive__intro">
        The retained source frames behind this weekend’s timing story, with observed data kept distinct from replay interpolation.
      </p>
      <div className="timing-archive__grid">
        <TimingSession session={coverage.race} race />
        {coverage.qualifying ? <TimingSession session={coverage.qualifying} race={false} /> : null}
      </div>
    </Card>
  );
};
