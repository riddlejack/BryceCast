import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { Countdown } from '../app/components';
import { asNumber, asString, formatDate, formatGain, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import type { ReadinessStatus } from '../app/useReadiness';
import { normalizedName, useNextSession } from '../app/useNextSession';
import { raceDayOf, type UpcomingPrepEvent } from '../data/upcoming';

type Row = Record<string, unknown>;

/* ---------- the home page's "now" line ----------
 * The landing page's live and in-season states, in the same one-line form as
 * "Last time out": a label, one large figure, the facts, and the way in.
 * - live: a session is running (readiness ready/degraded). Sits at the top.
 * - raceDay / raceWeek: the next race is today or within six days. Top.
 * - between: a race is on the calendar further out. Under the hero.
 * Off-season (nothing on the calendar, nothing live) there is no now line. */

export type HomeNowState = 'live' | 'raceDay' | 'raceWeek' | 'between';

export const homeNowState = (liveish: boolean, nextEvent: UpcomingPrepEvent | null, days: number | null): HomeNowState | null => {
  if (liveish) return 'live';
  if (!nextEvent || days === null || days < 0) return null;
  if (days === 0) return 'raceDay';
  if (days <= 6) return 'raceWeek';
  return 'between';
};

const LiveDisc = () => (
  <i className="home-disc" aria-hidden>
    <Radio size={20} />
  </i>
);

export const HomeNow = ({
  state,
  readiness,
  nextEvent,
  days
}: {
  state: HomeNowState;
  readiness: ReadinessStatus;
  nextEvent: UpcomingPrepEvent | null;
  days: number | null;
}) => {
  const nextSession = useNextSession();
  /* Re-render once a minute so "today" and the day count roll over on their own. */
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  if (state === 'live') {
    const weekend = (readiness.payload?.raceWeekend as Row | undefined) ?? {};
    const heartbeat = ((readiness.payload?.liveTiming as Row | undefined)?.heartbeat as Row | undefined) ?? {};
    const bryce = ((readiness.payload?.bryce as Row | undefined)?.bryce as Row | undefined) ?? null;
    const eventName = asString(weekend.eventName) ?? asString(heartbeat.eventName);
    const sessionName = asString(weekend.sessionName) ?? asString(heartbeat.sessionName);
    const rank = bryce ? asNumber(bryce.rank) : null;
    const start = bryce ? asNumber(bryce.startPosition) : null;
    const gain = rank !== null && start !== null ? formatGain(start - rank) : null;
    const lap = asNumber(heartbeat.lap) ?? asNumber(weekend.lap);
    const totalLaps = asNumber(heartbeat.totalLaps) ?? asNumber(weekend.totalLaps);
    const flag = asString(heartbeat.flag) ?? asString(weekend.flag);
    const facts = [
      gain && start !== null ? (
        <span key="gain">
          <b className={`home-gain home-gain--${gain.direction}`}>{gain.text}</b> from P{start} on the grid
        </span>
      ) : null,
      lap !== null && totalLaps !== null ? (
        <span key="lap">
          Lap <b>{lap}</b> of {totalLaps}
        </span>
      ) : null,
      flag ? <span key="flag">{flag.toLowerCase()} flag</span> : null
    ].filter(Boolean);
    return (
      <section className="home-line home-line--now home-line--live" aria-label="Live now">
        <div>
          <div className="home-label">
            Live now{eventName ? ` · ${eventName}` : ''}
            {sessionName && !(eventName ?? '').toLowerCase().includes(sessionName.toLowerCase()) ? ` · ${sessionName}` : ''}
          </div>
          <div className="home-line__big">{rank !== null ? `P${rank}` : 'On track'}</div>
        </div>
        <div className="home-line__facts">
          {facts.length > 0
            ? facts.map((fact, index) => (
                <span key={index}>
                  {index > 0 ? ' · ' : ''}
                  {fact}
                </span>
              ))
            : 'Bryce’s session is underway.'}
        </div>
        <Link to="/live" className="home-action">
          <LiveDisc />
          Follow it live
        </Link>
      </section>
    );
  }

  if (!nextEvent) return null;
  const venue = nextEvent.trackName;
  const raceDate = raceDayOf(nextEvent);
  /* A precise session start (the live runner's schedule) drives a real
   * countdown; the package's day-precision date is the fallback. */
  const sessionMatchesEvent =
    nextSession?.startsAt && normalizedName(nextSession.eventName).includes(normalizedName(nextEvent.eventName).slice(0, 12));
  const preciseStart = sessionMatchesEvent ? nextSession?.startsAt ?? null : null;
  const label = state === 'raceDay' ? 'Race day' : state === 'raceWeek' ? 'Race week' : 'Next race';
  const typeText = trackTypeLabel(nextEvent.trackType);
  const typeLabel = typeText === '—' ? null : typeText;

  return (
    <section className="home-line home-line--now" aria-label={label}>
      <div>
        <div className="home-label">
          {label} · {venue}
        </div>
        {(state === 'raceDay' || state === 'raceWeek') && preciseStart ? (
          <div className="home-line__count">
            <Countdown to={preciseStart} />
          </div>
        ) : (
          <div className="home-line__big">
            {days === 0 ? 'Today' : days}
            {days !== 0 ? <span className="home-line__unit">{days === 1 ? 'day' : 'days'}</span> : null}
          </div>
        )}
      </div>
      <div className="home-line__facts">
        {nextEvent.eventName}
        {typeLabel ? ` · ${typeLabel}` : ''} · {state === 'raceDay' ? '' : 'race day '}
        {formatDate(raceDate, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      {state === 'raceDay' ? (
        <Link to="/live" className="home-action">
          <LiveDisc />
          Follow it live
        </Link>
      ) : (
        <Link to="/race-week" className="home-textlink">
          The weekend ahead →
        </Link>
      )}
    </section>
  );
};
