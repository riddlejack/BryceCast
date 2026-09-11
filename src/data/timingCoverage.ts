export type TimingCoverageStatus = 'observed' | 'partial' | 'unavailable';

export interface TimingCadence {
  p50Seconds?: number | null;
  p95Seconds?: number | null;
  maxSeconds?: number | null;
}

export interface TimingGaps {
  over2Seconds?: number | null;
  over5Seconds?: number | null;
  over10Seconds?: number | null;
  maxSeconds?: number | null;
}

export interface TimingSourceCoverage {
  tier: string;
  label: string;
  sourceSessionId?: string;
  supplementalPurpose?: string;
  clockBasis?: 'session_local_feed_clock' | 'utc_archive_timestamp' | 'utc_capture_timestamp' | string;
  clockCaveat?: string | null;
  observedArtifact?: string | null;
  observedStart?: string | null;
  observedEnd?: string | null;
  observationCount?: number | null;
  cadence?: TimingCadence | null;
  gaps?: TimingGaps | null;
  activeWindowCoverage?: Record<string, unknown> | null;
  lapObservationCoverage?: Record<string, unknown> | null;
  noGps?: boolean;
}

export interface TimingCoverageSession {
  canonicalSessionId: string;
  qualifiesRaceSessionId?: string | null;
  sessionType: 'race' | 'qualifying';
  sessionName?: string | null;
  event: string;
  year: number;
  status: TimingCoverageStatus;
  primarySource?: TimingSourceCoverage | null;
  sources?: TimingSourceCoverage[];
  replayArtifact?: string | null;
  replayBasis?: string | null;
  replayInterpolated?: boolean | null;
  replayInterpolationCoverage?: Record<string, unknown> | null;
  activeWindowCoverage?: Record<string, unknown> | null;
  lapObservationCoverage?: Record<string, unknown> | null;
  noGps?: boolean;
  caveats?: string[];
}

interface TimingCoverageLedger {
  schemaVersion: number;
  generatedAt: string;
  asOfDate: string;
  contract?: Record<string, string>;
  sessions: TimingCoverageSession[];
}

export interface RaceTimingCoverage {
  ledger: Pick<TimingCoverageLedger, 'generatedAt' | 'asOfDate' | 'contract'>;
  race: TimingCoverageSession;
  qualifying: TimingCoverageSession | null;
}

let ledgerPromise: Promise<TimingCoverageLedger | null> | null = null;

/** The ledger is intentionally a separate Vite chunk. Race pages load its
 * source audit only when opened; the home, archive, and live bundles stay lean. */
const loadTimingCoverageLedger = (): Promise<TimingCoverageLedger | null> => {
  if (!ledgerPromise) {
    ledgerPromise = import('../../data/historical-data-lake/catalog/timing-coverage-ledger.json')
      .then((module) => {
        const ledger = module.default as TimingCoverageLedger;
        return ledger?.schemaVersion === 1 && Array.isArray(ledger.sessions) ? ledger : null;
      })
      .catch(() => null);
  }
  return ledgerPromise;
};

export const loadTimingCoverageForRace = async (raceSessionId: string): Promise<RaceTimingCoverage | null> => {
  const ledger = await loadTimingCoverageLedger();
  if (!ledger) return null;
  const race = ledger.sessions.find(
    (session) => session.sessionType === 'race' && session.canonicalSessionId === raceSessionId
  );
  if (!race) return null;
  const qualifying =
    ledger.sessions.find(
      (session) =>
        session.sessionType === 'qualifying' && session.qualifiesRaceSessionId === raceSessionId
    ) ?? null;
  return {
    ledger: { generatedAt: ledger.generatedAt, asOfDate: ledger.asOfDate, contract: ledger.contract },
    race,
    qualifying
  };
};
