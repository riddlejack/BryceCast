import { Database } from 'lucide-react';
import { formatDate } from './format';
import { getSeasonIndex } from '../data/seasons';
import { uiDataPackage } from '../data/uiDataPackage';

/** Visible package freshness at the result grain users care about. The race
 * count comes from the same completed-race index the archive renders; remaining
 * races come from the packaged standings snapshot. */
export const DataFreshness = () => {
  const rows = getSeasonIndex();
  const currentSeason = rows.reduce((latest, row) => Math.max(latest, row.seasonYear ?? 0), 0);
  const completed = currentSeason > 0 ? rows.filter((row) => row.seasonYear === currentSeason).length : 0;
  const snapshot = uiDataPackage.screens.upcomingPrep.standingsSnapshot;
  const remaining = snapshot.available ? Math.max(0, snapshot.racesRemaining) : null;
  const total = remaining === null ? null : completed + remaining;
  const freshnessDate = uiDataPackage.asOfDate || uiDataPackage.generatedAt;

  if (completed === 0 || currentSeason === 0) return null;

  return (
    <p
      role="status"
      className="row row--wrap caption caption--secondary"
      title={`UI data package generated ${uiDataPackage.generatedAt}`}
      style={{ gap: 6, margin: 0, padding: '0 2px' }}
    >
      <Database size={12} aria-hidden />
      <span>Results updated {formatDate(freshnessDate, { month: 'short', day: 'numeric' })}</span>
      <span aria-hidden>·</span>
      <span>
        {currentSeason} season: {total === null ? `${completed} races complete` : `${completed} of ${total} races complete`}
      </span>
    </p>
  );
};
