import { useEffect, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { Card, Unavailable } from '../app/components';
import { asNumber, asString, formatGain, formatPosition } from '../app/format';
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
  return (
    <Link to={`/races/${encodeURIComponent(pack.sessionId)}`} className="tower__row" style={{ gridTemplateColumns: '52px 1fr auto auto 16px' }}>
      <span className="figure" style={{ fontSize: 19, color: 'var(--bryce)' }}>{formatPosition(finish)}</span>
      <span className="tower__name" style={{ whiteSpace: 'normal' }}>
        {shortLabel}
        {showTrack ? <span className="tower__team"> {trackName}</span> : null}
      </span>
      <span className={`stat__delta ${gain?.direction === 'up' ? 'stat__delta--up' : 'stat__delta--down'}`} style={{ textAlign: 'right' }}>
        {gain ? gain.text : ''}
      </span>
      <span className="tower__gap">{points !== null ? `${points} pts` : ''}</span>
      <ArrowRight size={13} style={{ color: 'var(--ink-muted)' }} aria-hidden />
    </Link>
  );
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

  return (
    <div className="page stack">
      <header>
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>
          Races
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)', fontSize: 14 }}>
          Every INDY NXT weekend, told straight from the official data.
        </p>
      </header>
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
          <Card key={season} flush title={`${season} season`}>
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
