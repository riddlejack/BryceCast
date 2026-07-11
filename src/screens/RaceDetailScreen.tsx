import { useEffect, useState } from 'react';
import { ArrowLeft, Flag, Users } from 'lucide-react';
import { Card, SourcePill, Stat, StatusChip, Unavailable } from '../app/components';
import { asNumber, asString, formatGain, formatNumber, formatPosition, ordinal } from '../app/format';
import { Link } from '../app/router';
import { displayRaceLabel, loadDebriefBySessionId, type ArchiveEntry } from '../data/debriefArchive';

/** Start → finish slope: two anchored points, gold for Bryce's finish. */
const StartFinishSlope = ({ start, finish, fieldSize }: { start: number; finish: number; fieldSize: number | null }) => {
  const scaleMax = Math.max(start, finish, fieldSize ?? 0, 20);
  const toY = (position: number) => 8 + ((position - 1) / (scaleMax - 1)) * 84;
  return (
    <svg viewBox="0 0 300 100" style={{ width: '100%', maxWidth: 420, height: 'auto' }} role="img" aria-label={`Started ${start}, finished ${finish}`}>
      <line x1="60" y1={toY(start)} x2="240" y2={toY(finish)} stroke="var(--axis-baseline)" strokeWidth="2" />
      <circle cx="60" cy={toY(start)} r="6" fill="var(--ink-secondary)" stroke="var(--surface-1)" strokeWidth="2" />
      <circle cx="240" cy={toY(finish)} r="7" fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth="2" />
      <text x="60" y={toY(start) - 12} textAnchor="middle" fill="var(--ink-secondary)" fontSize="12" fontWeight="600">
        P{start}
      </text>
      <text x="240" y={toY(finish) - 13} textAnchor="middle" fill="var(--bryce)" fontSize="13" fontWeight="700">
        P{finish}
      </text>
      <text x="60" y="99" textAnchor="middle" fill="var(--ink-muted)" fontSize="10">
        start
      </text>
      <text x="240" y="99" textAnchor="middle" fill="var(--ink-muted)" fontSize="10">
        finish
      </text>
    </svg>
  );
};

export const RaceDetailScreen = ({ sessionId }: { sessionId: string }) => {
  const [entry, setEntry] = useState<ArchiveEntry | null | 'loading'>('loading');

  useEffect(() => {
    setEntry('loading');
    loadDebriefBySessionId(sessionId)
      .then((found) => setEntry(found))
      .catch(() => setEntry(null));
  }, [sessionId]);

  if (entry === 'loading') {
    return (
      <div className="page stack">
        <div className="skeleton" style={{ height: 40 }} />
        <div className="skeleton" style={{ height: 220 }} />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="page stack">
        <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start' }}>
          <ArrowLeft size={14} aria-hidden /> All races
        </Link>
        <Card>
          <Unavailable>No debrief pack exists for this session yet.</Unavailable>
        </Card>
      </div>
    );
  }

  const { pack } = entry;
  const finish = asNumber(pack.outcome.finishPosition);
  const start = asNumber(pack.outcome.startPosition);
  const points = asNumber(pack.outcome.points);
  const cumulative = asNumber(pack.outcome.cumulativePoints);
  const standing = asNumber(pack.outcome.standingRank);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const fieldSize = asNumber(pack.lapStory?.fieldLapDrivers);
  const context = pack.raceContext;
  const team = pack.teamContext ?? {};
  const bryceIncidents = asNumber(context?.bryceIncidentCount);
  const weather = asString(context?.weatherContext);

  return (
    <div className="page stack">
      <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start' }}>
        <ArrowLeft size={14} aria-hidden /> All races
      </Link>
      <header>
        <div className="caption caption--secondary">
          {pack.seasonYear} · {asString(pack.track.name)} · {asString(pack.track.type)}
        </div>
        <h1 className="display" style={{ fontSize: 24, margin: '2px 0 0' }}>
          {displayRaceLabel(pack)}
        </h1>
      </header>

      <Card
        action={
          <SourcePill
            title={pack.raceLabel}
            entries={pack.sourceRefs.slice(0, 6).map((ref) => ({
              label: asString(ref.kind) ?? asString(ref.table) ?? 'Official source table',
              path: asString(ref.path) ?? undefined
            }))}
            caveats={pack.caveats}
          />
        }
      >
        <div className="row row--between row--wrap" style={{ alignItems: 'flex-start', gap: 20 }}>
          <div className="stat">
            <span className="caption" style={{ color: 'var(--bryce)' }}>Result</span>
            <span className="stat__value stat__value--hero" style={{ color: 'var(--bryce)' }}>
              {formatPosition(finish)}
            </span>
            {gain ? (
              <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
                {gain.text} from {formatPosition(start)}
                {fieldSize !== null ? ` · ${fieldSize}-car field` : ''}
              </span>
            ) : null}
          </div>
          {start !== null && finish !== null ? <StartFinishSlope start={start} finish={finish} fieldSize={fieldSize} /> : null}
        </div>
        <div className="grid grid--3" style={{ marginTop: 16 }}>
          <Stat label="Points scored" value={points ?? '—'} />
          <Stat label="Season points after" value={cumulative ?? '—'} />
          <Stat label="Standing after" value={standing !== null ? `P${standing}` : '—'} />
        </div>
      </Card>

      {pack.lapStory ? (
        <Card title="How the race ran">
          <div className="grid grid--3">
            <Stat label="Best running position" value={formatPosition(pack.lapStory.bryceBestRunningPosition)} />
            <Stat label="Net position change" value={formatNumber(pack.lapStory.bryceNetLapChartGain, 0)} />
            <Stat label="Race's biggest mover" value={asString(pack.lapStory.topLapChartMover) ?? '—'} />
          </div>
          <div className="row row--wrap" style={{ marginTop: 14, gap: 8 }}>
            {bryceIncidents !== null && bryceIncidents > 0 ? (
              <StatusChip tone="neutral" label={`${bryceIncidents} official incident record${bryceIncidents === 1 ? '' : 's'}`} />
            ) : null}
            {asNumber(context?.sessionIncidentCount) ? (
              <StatusChip tone="neutral" label={`${context?.sessionIncidentCount} incidents race-wide`} />
            ) : null}
            {weather ? <StatusChip tone="neutral" label={`conditions: ${weather.replaceAll('/', ' · ')}`} /> : null}
          </div>
        </Card>
      ) : null}

      {asNumber(team.teamCars) ? (
        <Card
          title={
            <span className="row" style={{ gap: 7 }}>
              <Users size={15} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
              Inside {asString(pack.outcome.teamName) ?? 'the team'}
            </span>
          }
        >
          <div className="grid grid--3">
            <Stat label="Bryce among team cars" value={asNumber(team.bryceTeamFinishRank) !== null ? ordinal(asNumber(team.bryceTeamFinishRank)!) : '—'} />
            <Stat label="Team cars" value={formatNumber(team.teamCars, 0)} />
            <Stat label="Team avg finish" value={formatNumber(team.teamAverageFinish)} />
          </div>
          {asString(team.teammates) ? (
            <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--ink-muted)' }}>
              Teammates: {asString(team.teammates)?.replaceAll(';', ' ·')}
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="row">
        <StatusChip tone="neutral" label="Official results · lap chart · race reports" />
        <Flag size={13} style={{ color: 'var(--ink-muted)' }} aria-hidden />
      </div>
    </div>
  );
};
