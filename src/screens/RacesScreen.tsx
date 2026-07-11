import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, ScreenHead, Unavailable } from '../app/components';
import { asNumber, asString, formatDate, formatGain, formatNumber, formatPosition } from '../app/format';
import { Link } from '../app/router';
import { displayRaceLabel, loadDebriefArchive, type ArchiveEntry } from '../data/debriefArchive';

const RaceRow = ({ entry }: { entry: ArchiveEntry }) => {
  const { pack } = entry;
  const finish = asNumber(pack.outcome.finishPosition);
  const start = asNumber(pack.outcome.startPosition);
  const points = asNumber(pack.outcome.points);
  const gain = start !== null && finish !== null ? formatGain(start - finish) : null;
  const shortLabel = displayRaceLabel(pack);
  const trackName = asString(pack.track.name) ?? '';
  const showTrack = trackName && !shortLabel.toLowerCase().includes(trackName.toLowerCase().split(' ')[0]);
  const date = (pack as unknown as Record<string, unknown>).eventStartDate;
  const top10 = finish !== null && finish <= 10;
  return (
    <Link
      to={`/races/${encodeURIComponent(pack.sessionId)}`}
      className="tower__row"
      style={{ gridTemplateColumns: '56px minmax(0,1fr) auto auto auto 16px' }}
    >
      <span className="figure row" style={{ fontSize: 17, gap: 4, color: 'var(--ink-primary)' }}>
        {formatPosition(finish)}
        {top10 ? <span aria-label="top ten" style={{ width: 5, height: 5, borderRadius: 2, background: 'var(--bryce)' }} /> : null}
      </span>
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {shortLabel}
        {showTrack ? <span className="tower__team"> {trackName}</span> : null}
      </span>
      <span className={`stat__delta ${gain?.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`} style={{ textAlign: 'right' }}>
        {gain ? gain.text : ''}
      </span>
      <span className="tower__gap tnum">{points !== null ? `${points} pts` : ''}</span>
      <span className="tower__gap" style={{ fontSize: 11.5, minWidth: 52 }}>
        {typeof date === 'string' ? formatDate(date, { month: 'short', day: 'numeric' }) : ''}
      </span>
      <ArrowRight size={13} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  );
};

const seasonSummary = (entries: ArchiveEntry[]): string => {
  const finishes = entries
    .map((entry) => asNumber(entry.pack.outcome.finishPosition))
    .filter((value): value is number => value !== null);
  if (finishes.length === 0) return '';
  const top10s = finishes.filter((finish) => finish <= 10).length;
  const best = Math.min(...finishes);
  const parts = [`${finishes.length} races`, `best P${best}`];
  if (top10s > 0) parts.push(`${top10s} top-10${top10s === 1 ? '' : 's'}`);
  return parts.join(' · ');
};

export const RacesScreen = () => {
  const [archive, setArchive] = useState<ArchiveEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDebriefArchive().then(setArchive).catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const seasons = useMemo(() => {
    if (!archive) return [];
    const bySeason = new Map<number, ArchiveEntry[]>();
    for (const entry of archive) {
      const list = bySeason.get(entry.pack.seasonYear) ?? [];
      list.push(entry);
      bySeason.set(entry.pack.seasonYear, list);
    }
    return [...bySeason.entries()].sort((a, b) => b[0] - a[0]);
  }, [archive]);

  const totalRaces = archive?.length ?? 0;

  return (
    <div className="page stack">
      <ScreenHead
        kicker="The archive"
        title="Races"
        sub={
          totalRaces > 0
            ? `Every INDY NXT weekend — ${formatNumber(totalRaces, 0)} races told straight from the official data, newest first.`
            : 'Every INDY NXT weekend, told straight from the official data.'
        }
      />
      {error ? (
        <Card>
          <Unavailable>The race archive failed an integrity check: {error}</Unavailable>
        </Card>
      ) : !archive ? (
        <>
          <div className="skeleton" style={{ height: 120 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </>
      ) : (
        seasons.map(([season, entries]) => (
          <Card
            key={season}
            flush
            title={`${season} season`}
            action={<span className="caption caption--secondary">{seasonSummary(entries)}</span>}
          >
            <div className="tower">
              {entries.map((entry) => (
                <RaceRow key={entry.pack.sessionId} entry={entry} />
              ))}
            </div>
          </Card>
        ))
      )}
    </div>
  );
};
