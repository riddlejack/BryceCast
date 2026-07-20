/** The small-series stories — three Career-chapter modules sized to what their
 *  records actually hold, told beside the bigger chapters they belong to.
 *
 *  - F1600 2019: the points arc renders in The Campaigns, so this is the
 *    complementary piece — where he qualified, and every round's races. F1600
 *    carries no sourced grid positions, so there is deliberately no
 *    grid-to-finish conversion and no pace trace here.
 *  - FROC 2024: a two-round guest campaign inside a five-round championship. The
 *    honest denominator (rounds run vs rounds in the series) is the centrepiece,
 *    and the rounds he did not contest are named, not hidden.
 *  - The origin: karting fast-times/records and the Team USA Scholarship, a
 *    quiet sourced timeline — context, never an eighth statistical chapter.
 *
 *  House grammar: chapter tints for identity (F1600 blue, FROC green), no gold
 *  (none of these is the current chapter). Every number is sourced; every fact
 *  carries a source drawer. */

import { Fragment, useMemo } from 'react';
import { Card, SourcePill, Stat, Unavailable, type SourceEntry } from '../app/components';
import { ordinal } from '../app/format';
import { Link } from '../app/router';
import { uiDataPackage } from '../data/uiDataPackage';
import type {
  UiF1600Event,
  UiF1600SeasonStory,
  UiFrocCampaignStory,
  UiFrocEvent,
  UiOriginMilestone,
  UiOriginMilestones,
  UiSourceRef
} from '../data/uiDataPackage';
import { chapterTint, raceHref } from './careerExplorer';

const F1600_TINT = chapterTint('F1600 Championship Series');
const FROC_TINT = chapterTint('Castrol Toyota Formula Regional Oceania Championship');

/* Shared source-drawer plumbing: the package sourceRefs become drawer entries. */
const refEntries = (refs: UiSourceRef[]): SourceEntry[] =>
  refs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }));

const posLabel = (position: number | null, status: string | null): string => {
  if (position !== null) return `P${position}`;
  if (status === 'dns') return 'DNS';
  if (status === 'dnf') return 'DNF';
  if (status === 'dsq') return 'DSQ';
  return '—';
};

/* ---------- 1 · F1600 2019: the season, round by round ---------- */

/** One F1600 weekend: where he qualified, then each of the round's races as a
 *  quiet finish cell. Podiums carry the chapter tint — the season's highlights,
 *  which is where the color is allowed to live. */
const F1600EventRow = ({ event }: { event: UiF1600Event }) => {
  const quali = event.qualifying;
  return (
    <div className="ss-event">
      <div className="ss-event__head">
        <span className="ss-event__round">R{event.roundIndex}</span>
        <span className="ss-event__venue">{event.trackName}</span>
      </div>
      <div className="ss-event__quali">
        {quali && quali.rank !== null ? (
          <>
            Qualified <strong>P{quali.rank}</strong>
            {quali.fieldSize !== null ? <span className="ss-muted"> of {quali.fieldSize}</span> : null}
          </>
        ) : (
          <span className="ss-muted">grid not sourced</span>
        )}
      </div>
      <div className="ss-races">
        {event.races.map((race) => {
          const label = posLabel(race.finishPosition, race.status);
          const inner = (
            <>
              <span className="ss-race__pos">{label}</span>
              <span className={`ss-race__mark${race.isPodium ? ' ss-race__mark--on' : ''}`} aria-hidden style={race.isPodium ? { background: F1600_TINT } : undefined} />
            </>
          );
          const title = `${event.trackName} · Race ${race.raceNumber} · ${label}`;
          return race.hasRacePage ? (
            <Link key={race.sessionId} to={raceHref(race.sessionId)} className="ss-race ss-race--link">
              {inner}
            </Link>
          ) : (
            <span key={race.sessionId} className="ss-race" title={title}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const F1600SeasonStory = () => {
  const story = uiDataPackage.screens.careerLab.smallSeriesStories.f1600;
  if (!story) {
    return <p className="ss-caption" style={{ margin: 0 }}>The F1600 season records are unavailable.</p>;
  }
  const totals = story.totals;
  const bestQualiCount = useMemo(() => {
    if (totals.bestQualiRank === null) return 0;
    return story.events.filter((event) => event.qualifying && event.qualifying.rank === totals.bestQualiRank).length;
  }, [story.events, totals.bestQualiRank]);

  return (
    <div className="ss-depth stack">
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <p className="ss-copy" style={{ margin: 0, maxWidth: '60ch' }}>
          His first season in cars, in American grassroots open-wheel — seven weekends, {totals.raceCount} races, and a
          third-place run in the championship built on {totals.podiums} podiums. The Campaigns chart the points; this is the
          weekend-by-weekend shape underneath.
        </p>
        <SourcePill title="The F1600 season, in depth" entries={refEntries(story.sourceRefs)} caveats={story.caveats} />
      </div>

      <div className="row row--wrap" style={{ gap: 26 }}>
        <Stat label="Podiums" value={totals.podiums} note={`in ${totals.classifiedRaces} classified races`} />
        <Stat label="Best finish" value={totals.bestFinish !== null ? `P${totals.bestFinish}` : '—'} note="at New Jersey" />
        <Stat
          label="Best qualifying"
          value={totals.bestQualiRank !== null ? `P${totals.bestQualiRank}` : '—'}
          note={bestQualiCount > 1 ? `${bestQualiCount} times` : 'once'}
        />
        <Stat label="Rounds" value={totals.roundCount} note={`${totals.roundsWithQualifying} with sourced qualifying`} />
      </div>

      <div>
        <div className="ss-events">
          {story.events.map((event) => (
            <F1600EventRow key={event.roundIndex ?? event.trackName} event={event} />
          ))}
        </div>
        <p className="ss-caption">
          Each weekend, left to right: where he qualified, then the round&rsquo;s races. A blue dot marks a podium. F1600 2019
          carries no sourced grid positions, so there is no grid-to-finish here — qualifying is only where he lined up. Click a
          race to open it.
        </p>
      </div>
    </div>
  );
};

/* ---------- 2 · FROC 2024: a two-round guest campaign ---------- */

/** The rounds ribbon: the whole five-round championship, with the two Bryce ran
 *  filled in the chapter tint and the three he didn&rsquo;t left quiet. The
 *  honest denominator made visible. */
const FrocRoundsRibbon = ({ story }: { story: UiFrocCampaignStory }) => {
  const runByRound = useMemo(() => new Map(story.events.map((event) => [event.roundIndex, event])), [story.events]);
  const rounds = useMemo(() => {
    const all = [
      ...story.events.map((event) => ({ roundIndex: event.roundIndex, trackName: event.trackName, run: true })),
      ...story.absentRounds.map((round) => ({ roundIndex: round.roundIndex, trackName: round.trackName, run: false }))
    ];
    return all.sort((a, b) => (a.roundIndex ?? 0) - (b.roundIndex ?? 0));
  }, [story.events, story.absentRounds]);
  const shortVenue = (name: string) => name.split(/[\s-]/)[0];

  return (
    <div>
      <div className="ss-ribbon" role="img" aria-label={`Bryce ran ${story.coverage.roundsRun} of the championship's ${story.coverage.roundsInSeries} rounds`}>
        {rounds.map((round) => (
          <div key={round.roundIndex ?? round.trackName} className={`ss-ribbon__seg${round.run ? ' ss-ribbon__seg--run' : ''}`}>
            <span className="ss-ribbon__round">R{round.roundIndex}</span>
            <span className="ss-ribbon__venue">{shortVenue(round.trackName)}</span>
            {round.run && runByRound.get(round.roundIndex) ? <span className="ss-ribbon__note">{runByRound.get(round.roundIndex)!.races.length} races</span> : <span className="ss-ribbon__note ss-muted">did not run</span>}
          </div>
        ))}
      </div>
      <p className="ss-caption">
        The 2024 championship ran five rounds; Bryce joined for the final two — {story.coverage.racesRun} races in all. Green
        marks the rounds he raced.
      </p>
    </div>
  );
};

const FrocEventRow = ({ event }: { event: UiFrocEvent }) => {
  const gridQuali = event.qualifying.filter((row) => !row.isReverseGrid);
  const bestRank = gridQuali.reduce<number | null>((best, row) => (row.rank === null ? best : best === null ? row.rank : Math.min(best, row.rank)), null);
  return (
    <div className="ss-event">
      <div className="ss-event__head">
        <span className="ss-event__round">R{event.roundIndex}</span>
        <span className="ss-event__venue">{event.trackName}</span>
      </div>
      <div className="ss-event__quali">
        {bestRank !== null ? (
          <>
            Qualified up to <strong>P{bestRank}</strong>
            <span className="ss-muted"> · {event.qualifying.length} sessions</span>
          </>
        ) : (
          <span className="ss-muted">qualifying recorded</span>
        )}
      </div>
      <div className="ss-races">
        {event.races.map((race) => {
          const finish = posLabel(race.finishPosition, race.status);
          const inner = (
            <>
              <span className="ss-race__pos">
                {race.startPosition !== null ? <span className="ss-muted">P{race.startPosition}&nbsp;→&nbsp;</span> : null}
                {finish}
              </span>
              <span className={`ss-race__mark${race.isPodium ? ' ss-race__mark--on' : ''}`} aria-hidden style={race.isPodium ? { background: FROC_TINT } : undefined} />
            </>
          );
          const title = `${event.trackName} · Race ${race.raceNumber}${race.startPosition !== null ? ` · P${race.startPosition} → ${finish}` : ` · ${finish}`}${race.isWin ? ' · win' : ''}`;
          return race.hasRacePage ? (
            <Link key={race.sessionId} to={raceHref(race.sessionId)} className="ss-race ss-race--wide ss-race--link">
              {inner}
            </Link>
          ) : (
            <span key={race.sessionId} className="ss-race ss-race--wide" title={title}>
              {inner}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const FrocCampaignStory = () => {
  const story = uiDataPackage.screens.careerLab.smallSeriesStories.froc;
  if (!story) {
    return <p className="ss-caption" style={{ margin: 0 }}>The FR Oceania campaign records are unavailable.</p>;
  }
  const totals = story.totals;
  return (
    <div className="ss-depth stack">
      <div className="row row--between row--wrap" style={{ alignItems: 'baseline', gap: 8 }}>
        <p className="ss-copy" style={{ margin: 0, maxWidth: '60ch' }}>
          A southern-hemisphere summer in the Toyota junior series. Bryce joined for the final two rounds of the 2024
          championship — {story.coverage.racesRun} races across Euromarque and Highlands, with a win at Highlands. Here is the
          guest campaign, honest about the rounds he didn&rsquo;t run.
        </p>
        <SourcePill title="The FR Oceania campaign, in depth" entries={refEntries(story.sourceRefs)} caveats={story.caveats} />
      </div>

      <FrocRoundsRibbon story={story} />

      <div className="row row--wrap" style={{ gap: 26 }}>
        <Stat label="Rounds run" value={`${story.coverage.roundsRun} of ${story.coverage.roundsInSeries}`} note="of the championship" />
        <Stat label="Races" value={story.coverage.racesRun} note="all with sourced starts" />
        <Stat label="Best finish" value={totals.bestFinish !== null ? `P${totals.bestFinish}` : '—'} note={totals.wins > 0 ? `${totals.wins === 1 ? 'a win' : `${totals.wins} wins`} at Highlands` : undefined} />
        <Stat label="Best qualifying" value={totals.bestQualiRank !== null ? `P${totals.bestQualiRank}` : '—'} note={`${totals.qualifyingSessions} sessions`} />
      </div>

      <div>
        <div className="ss-events">
          {story.events.map((event) => (
            <FrocEventRow key={event.roundIndex ?? event.trackName} event={event} />
          ))}
        </div>
        <p className="ss-caption">
          Each race reads grid to flag; a green dot marks a podium. Position change is the plain difference between start and
          finish, never a pace claim. Click a race to open it.
        </p>
      </div>
    </div>
  );
};

/* ---------- 3 · The origin: a quiet, sourced timeline ---------- */

const FIGURE_KINDS = new Set(['karting_championship_milestone', 'career_award']);

const MilestoneFact = ({ item }: { item: UiOriginMilestone }) => (
  <div className="ss-timeline__fact">
    <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span className="ss-timeline__label">{item.label}</span>
      {item.figure && FIGURE_KINDS.has(item.kind) ? <span className="chip chip--outline" style={{ fontSize: 11 }}>{item.figure}</span> : null}
    </div>
    <p className="ss-timeline__detail">{item.detail}</p>
    {item.sourceName ? <span className="ss-timeline__source">{item.sourceName}</span> : null}
  </div>
);

export const OriginTimeline = () => {
  const origin: UiOriginMilestones = uiDataPackage.screens.careerLab.smallSeriesStories.origin;
  const byYear = useMemo(() => {
    const groups: Array<{ year: number | null; items: UiOriginMilestone[] }> = [];
    for (const item of origin.items) {
      const last = groups[groups.length - 1];
      if (last && last.year === item.year) last.items.push(item);
      else groups.push({ year: item.year, items: [item] });
    }
    return groups;
  }, [origin.items]);

  const sourceEntries: SourceEntry[] = [
    ...origin.sources.map((source) => ({ label: source.sourceName, path: source.sourceUrl ?? undefined, note: 'Archived official page — stored as a source URL only.' })),
    ...refEntries(origin.sourceRefs)
  ];

  if (origin.items.length === 0) {
    return (
      <Card title="Before the record">
        <Unavailable>The early-career milestone records are unavailable.</Unavailable>
      </Card>
    );
  }

  return (
    <Card title="Before the record" action={<SourcePill title="Before the record" entries={sourceEntries} caveats={origin.caveats} />}>
      <p className="ss-copy" style={{ maxWidth: '62ch' }}>
        The measured career starts with F1600 in {origin.recordStartsYear}. What survives from around it — the karting years
        that came before, and the scholarship that carried the climb to Europe — is context, not a scoreboard. Every fact here
        is sourced; none is a race result.
      </p>
      <div className="ss-timeline">
        {byYear.map((group) => (
          <div key={group.year ?? 'undated'} className="ss-timeline__node">
            <div className="ss-timeline__year">
              <span className="ss-timeline__dot" aria-hidden />
              <span>{group.year ?? '—'}</span>
            </div>
            <div className="ss-timeline__facts">
              {group.items.map((item) => (
                <Fragment key={item.id}>
                  <MilestoneFact item={item} />
                </Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
