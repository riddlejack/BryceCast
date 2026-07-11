import { useEffect, useState } from 'react';
import { ArrowLeft, Users } from 'lucide-react';
import { Card, HeroPanel, SourcePill, Stat, StatusChip, Unavailable } from '../app/components';
import { LapStoryChart, type LapPoint } from '../app/charts';
import { asNumber, asString, formatGain, formatNumber, formatPosition, ordinal } from '../app/format';
import { Link } from '../app/router';
import { displayRaceLabel, loadDebriefBySessionId, type ArchiveEntry } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/** Start → finish slope: two anchored points, gold for Bryce's finish. */
const StartFinishSlope = ({ start, finish, fieldSize }: { start: number; finish: number; fieldSize: number | null }) => {
  const scaleMax = Math.max(start, finish, fieldSize ?? 0, 20);
  const toY = (position: number) => 10 + ((position - 1) / (scaleMax - 1)) * 78;
  return (
    <svg viewBox="0 0 300 104" style={{ width: '100%', maxWidth: 430, height: 'auto' }} role="img" aria-label={`Started ${start}, finished ${finish}`}>
      <line x1="60" y1={toY(start)} x2="240" y2={toY(finish)} stroke="var(--axis-baseline)" strokeWidth="2.5" />
      <circle cx="60" cy={toY(start)} r="6" fill="var(--ink-secondary)" stroke="var(--surface-1)" strokeWidth="2" />
      <circle cx="240" cy={toY(finish)} r="7" fill="var(--bryce)" stroke="var(--surface-1)" strokeWidth="2" />
      <text x="60" y={toY(start) - 12} textAnchor="middle" fill="var(--ink-secondary)" fontSize="12" fontWeight="550" fontFamily="-apple-system, system-ui, sans-serif">
        P{start}
      </text>
      <text x="240" y={toY(finish) - 13} textAnchor="middle" fill="var(--ink-primary)" fontSize="14" fontWeight="650" fontFamily="-apple-system, system-ui, sans-serif">
        P{finish}
      </text>
      <text x="60" y="102" textAnchor="middle" fill="var(--ink-muted)" fontSize="10">
        start
      </text>
      <text x="240" y="102" textAnchor="middle" fill="var(--ink-muted)" fontSize="10">
        finish
      </text>
    </svg>
  );
};

/* ---------- position story from our own capture archive (2026-era races) ---------- */

const raceNumberOf = (label: string): string | null => {
  const match = /Race (\d)/i.exec(label);
  return match ? match[1] : null;
};

const useArchiveStory = (pack: ArchiveEntry['pack'] | null): LapPoint[] | null => {
  const [points, setPoints] = useState<LapPoint[] | null>(null);
  const eventStartDate = pack ? asString((pack as unknown as Row).eventStartDate) : null;
  const raceLabel = pack?.raceLabel ?? '';

  useEffect(() => {
    if (!pack || !eventStartDate) return;
    let cancelled = false;
    const load = async () => {
      try {
        const listResponse = await fetch('/api/replay/bryce?limit=1', { headers: { accept: 'application/json' } });
        if (!listResponse.ok) return;
        const listing = (await listResponse.json()) as Row;
        if (listing.available !== true) return;
        const sessions = Array.isArray(listing.sessions) ? (listing.sessions as Row[]) : [];
        const wantedRace = raceNumberOf(raceLabel);
        const eventMs = new Date(`${eventStartDate}T12:00:00Z`).getTime();
        const matches = sessions.filter((session) => {
          const first = asString(session.firstCheckedAt);
          if (!first) return false;
          const firstMs = new Date(first).getTime();
          // Packs carry the weekend start date; the race itself may run a day
          // or two later. Race-number matching disambiguates double-headers.
          if (!Number.isFinite(firstMs) || Math.abs(firstMs - eventMs) > 2.5 * 24 * 3600 * 1000) return false;
          const name = asString(session.sessionName) ?? '';
          if (!/^Race( \d)?$/i.test(name)) return false;
          const sessionRace = raceNumberOf(name);
          return wantedRace === sessionRace || (wantedRace === null && sessionRace === null);
        });
        if (matches.length !== 1 || cancelled) return;
        const key = asString(matches[0].sessionKey);
        if (!key) return;
        const response = await fetch(`/api/replay/bryce?sample=lap&limit=200&sessionKey=${encodeURIComponent(key)}`, {
          headers: { accept: 'application/json' }
        });
        if (!response.ok) return;
        const data = (await response.json()) as Row;
        if (cancelled || data.available !== true) return;
        const rows = Array.isArray(data.rows) ? (data.rows as Row[]) : [];
        const byLap = new Map<number, LapPoint>();
        for (const row of rows) {
          const lap = asNumber(row.laps);
          const rank = asNumber(row.rank);
          if (lap === null || rank === null) continue;
          byLap.set(lap, { lap, rank, flag: asString(row.flag) });
        }
        const series = [...byLap.values()].sort((a, b) => a.lap - b.lap);
        if (series.length >= 2) setPoints(series);
      } catch {
        /* archive optional */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [pack, eventStartDate, raceLabel]);

  return points;
};

/* ---------- section signal (denominator-badged per display policy) ---------- */

const parseSections = (value: string | null): Array<{ name: string; pct: number }> =>
  (value ?? '')
    .split(';')
    .map((part) => {
      const [name, score] = part.split(':');
      const pct = Number(score);
      return name && Number.isFinite(pct) ? { name: name.trim(), pct: Math.round(pct * 100) } : null;
    })
    .filter((entry): entry is { name: string; pct: number } => entry !== null)
    .slice(0, 3);

const SectionSignal = ({ pack }: { pack: ArchiveEntry['pack'] }) => {
  const signal = (pack as unknown as Row).sectionSignal as Row | undefined;
  if (!signal) return null;
  const rows = asNumber(signal.sectionComparisonRows);
  if (rows === null || rows < 50) return null; // display policy: suppress under 50 comparisons
  const best = parseSections(asString(signal.bestSectionFamilies));
  const weakest = parseSections(asString(signal.weakestSectionFamilies));
  if (best.length === 0 && weakest.length === 0) return null;
  return (
    <Card
      title="Where the lap time lived"
      action={
        <SourcePill
          title="Section signal"
          entries={[
            {
              label: 'Official Section Results reports',
              note: `Percentile of Bryce's section times vs the field across ${formatNumber(rows, 0)} section comparisons. Section codes are the track's official timing stations.`
            }
          ]}
        />
      }
    >
      <div className="grid grid--2">
        <div>
          <span className="caption">Strongest sections</span>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {best.map((section) => (
              <div key={section.name} className="row row--between" style={{ fontSize: 13 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{section.name}</span>
                <span className="tnum" style={{ color: 'var(--status-good)' }}>{section.pct}th pctile</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <span className="caption">Toughest sections</span>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {weakest.map((section) => (
              <div key={section.name} className="row row--between" style={{ fontSize: 13 }}>
                <span className="mono" style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{section.name}</span>
                <span className="tnum" style={{ color: 'var(--ink-secondary)' }}>{section.pct}th pctile</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        From {formatNumber(rows, 0)} official section-time comparisons across the weekend.
      </p>
    </Card>
  );
};

/* ---------- screen ---------- */

export const RaceDetailScreen = ({ sessionId }: { sessionId: string }) => {
  const [entry, setEntry] = useState<ArchiveEntry | null | 'loading'>('loading');

  useEffect(() => {
    setEntry('loading');
    loadDebriefBySessionId(sessionId)
      .then((found) => setEntry(found))
      .catch(() => setEntry(null));
  }, [sessionId]);

  const story = useArchiveStory(entry !== 'loading' && entry ? entry.pack : null);

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
  const percentile = asNumber(pack.outcome.finishPercentile);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const fieldSize = asNumber(pack.lapStory?.fieldLapDrivers);
  const context = pack.raceContext;
  const team = pack.teamContext ?? {};
  const bryceIncidents = asNumber(context?.bryceIncidentCount);
  const weather = asString(context?.weatherContext);
  const leader = asString(context?.topLeader);
  const leaderShare = asNumber(context?.topLeaderShare);

  return (
    <div className="page stack">
      <Link to="/races" className="navlink" style={{ alignSelf: 'flex-start', padding: '4px 2px' }}>
        <ArrowLeft size={14} aria-hidden /> All races
      </Link>
      <header className="screen-head" style={{ margin: 0 }}>
        <span className="kicker">
          {pack.seasonYear} · {asString(pack.track.name)}
        </span>
        <h1 className="screen-head__title">{displayRaceLabel(pack)}</h1>
      </header>

      <HeroPanel
        tint="bryce"
        style={undefined}
      >
        <div className="row row--between" style={{ alignItems: 'flex-start' }}>
          <span className="caption">Result</span>
          <SourcePill
            title={pack.raceLabel}
            entries={pack.sourceRefs.slice(0, 6).map((ref) => ({
              label: asString(ref.kind) ?? asString(ref.table) ?? 'Official source table',
              path: asString(ref.path) ?? undefined
            }))}
            caveats={pack.caveats}
          />
        </div>
        <div className="grid grid--split" style={{ alignItems: 'center' }}>
          <div className="stat">
            <span className="stat__value stat__value--hero">{formatPosition(finish)}</span>
            {gain ? (
              <span className={`stat__delta ${gain.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`}>
                {gain.text} from {formatPosition(start)}
                {fieldSize !== null ? ` · ${fieldSize}-car field` : ''}
              </span>
            ) : null}
            {percentile !== null ? (
              <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)', marginTop: 4 }}>
                Finished ahead of {Math.round(percentile * 100)}% of the field.
              </span>
            ) : null}
          </div>
          {start !== null && finish !== null ? <StartFinishSlope start={start} finish={finish} fieldSize={fieldSize} /> : null}
        </div>
        <div className="row" style={{ gap: 28, marginTop: 18, flexWrap: 'wrap' }}>
          <Stat label="Points scored" value={points ?? '—'} />
          <Stat label="Season points after" value={cumulative ?? '—'} />
          <Stat label="Standing after" value={standing !== null ? `P${standing}` : '—'} />
        </div>
      </HeroPanel>

      {story ? (
        <Card
          title="Position story · lap by lap"
          action={
            <SourcePill
              title="Position story"
              entries={[
                {
                  label: 'BryceCast live archive (SQLite)',
                  path: '/api/replay/bryce?sample=lap',
                  note: 'One point per lap from our own 1-second Race Control capture during this race.'
                }
              ]}
            />
          }
        >
          <LapStoryChart points={story} />
        </Card>
      ) : null}

      {pack.lapStory ? (
        <div className="grid grid--2">
          <Card title="How the race ran">
            <div className="grid grid--3">
              <Stat label="Best running spot" value={formatPosition(pack.lapStory.bryceBestRunningPosition)} />
              <Stat label="Net change" value={formatNumber(pack.lapStory.bryceNetLapChartGain, 0)} />
              <Stat label="Biggest mover" value={asString(pack.lapStory.topLapChartMover) ?? '—'} />
            </div>
            <div className="row row--wrap" style={{ marginTop: 14, gap: 8 }}>
              {bryceIncidents !== null && bryceIncidents > 0 ? (
                <StatusChip tone="neutral" label={`${bryceIncidents} official incident record${bryceIncidents === 1 ? '' : 's'}`} />
              ) : null}
              {asNumber(context?.sessionIncidentCount) ? (
                <StatusChip tone="neutral" label={`${context?.sessionIncidentCount} incidents race-wide`} />
              ) : null}
              {leader && leaderShare !== null ? (
                <StatusChip tone="neutral" label={`${leader} led ${Math.round(leaderShare * 100)}% of laps`} />
              ) : null}
              {weather ? <StatusChip tone="neutral" label={`conditions: ${weather.replaceAll('/', ' · ')}`} /> : null}
            </div>
          </Card>

          {asNumber(team.teamCars) ? (
            <Card
              title={
                <>
                  <Users size={15} aria-hidden />
                  Inside {asString(pack.outcome.teamName) ?? 'the team'}
                </>
              }
            >
              <div className="grid grid--3">
                <Stat
                  label="Bryce among team cars"
                  value={asNumber(team.bryceTeamFinishRank) !== null ? ordinal(asNumber(team.bryceTeamFinishRank)!) : '—'}
                />
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
        </div>
      ) : null}

      <SectionSignal pack={pack} />

      <div className="row">
        <StatusChip tone="neutral" label="Official results · lap chart · race reports" />
      </div>
    </div>
  );
};
