import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, CloudSun, ExternalLink, Flag, MapPin, Route, Tv } from 'lucide-react';
import { Card, Countdown, HeroPanel, SourcePill, Stat, Unavailable } from '../app/components';
import { asNumber, asString, formatClock, formatDate, formatNumber, formatPct, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import { useApiJson } from '../app/useApiJson';
import { normalizedName, useNextSession } from '../app/useNextSession';
import { daysUntil, getPrepScreen, getUpcomingEvents, type UpcomingPrepEvent } from '../data/upcoming';
import { loadDebriefArchive } from '../data/debriefArchive';

type Row = Record<string, unknown>;

/* ---------- family-readable framing for the top-10 path factors ----------
 * The analytics pack text (models, percentile error) stays available in the
 * source drawer; these are the plain-English lines the family reads. */
const factorFamilyCopy: Array<{ match: RegExp; copy: string }> = [
  { match: /qualifying|start position/i, copy: 'Where you start matters most — a clean qualifying lap has been the best single predictor of where Bryce finishes.' },
  { match: /conversion/i, copy: 'Turning pace into positions on this kind of track — his record here sets the baseline for the weekend.' },
  { match: /same-track/i, copy: 'He’s raced here before, so the notebook is open: braking points, restarts, and where passing actually works.' },
  { match: /chaos|incident/i, copy: 'Clean laps win weekends — the tough results in the data usually trace back to contact or penalties, not pace.' },
  { match: /analog/i, copy: 'The most similar past races give a feel for how this one could flow.' }
];

const familyCopyFor = (factor: string, fallback: string | null): string =>
  factorFamilyCopy.find((entry) => entry.match.test(factor))?.copy ?? fallback ?? '';

/* ---------- weekend grouping (double-headers share one HQ) ---------- */

interface Weekend {
  primary: UpcomingPrepEvent;
  races: UpcomingPrepEvent[];
}

const groupWeekend = (events: UpcomingPrepEvent[]): Weekend | null => {
  if (events.length === 0) return null;
  const [primary] = events;
  const primaryTime = new Date(`${primary.eventStartDate}T12:00:00`).getTime();
  const races = events.filter(
    (event) =>
      event.trackName === primary.trackName &&
      Math.abs(new Date(`${event.eventStartDate}T12:00:00`).getTime() - primaryTime) <= 2 * 24 * 3600 * 1000
  );
  return { primary, races };
};

/* ---------- follow the weekend (watch/listen routes from the schedule feed) ---------- */

const FollowTheWeekend = () => {
  const session = useApiJson<Row>('/api/session', 120_000);
  const route = (session.data?.broadcastRoute as Row) ?? null;
  const primary = (route?.primaryVideo as Row) ?? null;
  const audio = Array.isArray(route?.audio) ? (route?.audio as Row[]) : [];
  if (!primary && audio.length === 0) return null;
  return (
    <Card
      title={
        <>
          <Tv size={15} aria-hidden />
          Follow the weekend
        </>
      }
    >
      <div className="row row--wrap" style={{ gap: 8 }}>
        {primary ? (
          <a
            href={asString(primary.url) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="chip chip--bryce"
            style={{ fontSize: 12.5, padding: '7px 14px' }}
          >
            <ExternalLink size={12} aria-hidden />
            Watch on {asString(primary.name) ?? 'broadcast'}
          </a>
        ) : null}
        {audio.slice(0, 2).map((entry, index) => (
          <a
            key={index}
            href={asString(entry.url) ?? '#'}
            target="_blank"
            rel="noreferrer"
            className="chip chip--outline"
            style={{ fontSize: 12.5, padding: '7px 14px' }}
          >
            <ExternalLink size={12} aria-hidden />
            {asString(entry.name) ?? 'Radio'}
          </a>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Routes from the official schedule feed — where the broadcast actually lives this weekend.
      </p>
    </Card>
  );
};

/* ---------- prior band ---------- */

const PriorBand = ({ event }: { event: UpcomingPrepEvent }) => {
  const band = ((event.predictionBand as unknown as Row)?.finishPercentileBand ?? {}) as Row;
  const p25 = asNumber(band.p25);
  const median = asNumber(band.median);
  const p75 = asNumber(band.p75);
  const n = asNumber(band.n);
  if (p25 === null || median === null || p75 === null) return null;
  const toPct = (value: number) => Math.round(value * 100);
  const typeName = trackTypeLabel(event.trackType).toLowerCase();

  return (
    <Card
      title="The shape of the weekend"
      action={
        <SourcePill
          title="Historical prior band"
          entries={[
            {
              label: 'Career prior matrix · finish percentile band',
              path: 'analysis/predictive-race-intelligence/output/career_prior_matrix.csv',
              note: `p25/median/p75 of Bryce's finish percentile across ${formatNumber(n, 0)} ${typeName} races. No model prediction — a source-backed historical range.`
            }
          ]}
          caveats={['History, not a prediction. The band describes past races on this track type, nothing more.']}
        />
      }
    >
      <p style={{ margin: '0 0 16px', fontSize: 13.5, color: 'var(--ink-secondary)', maxWidth: '64ch' }}>
        Across {formatNumber(n, 0)} {typeName} races, Bryce’s typical day landed around the{' '}
        <strong style={{ color: 'var(--ink-primary)' }}>{toPct(median)}th percentile</strong> of the field — a quarter of
        days below the {toPct(p25)}th, a quarter above the {toPct(p75)}th.
      </p>
      <div style={{ position: 'relative', height: 34, margin: '0 6px' }}>
        <div style={{ position: 'absolute', top: 14, left: 0, right: 0, height: 6, borderRadius: 3, background: 'var(--surface-2)' }} />
        <div
          style={{
            position: 'absolute',
            top: 12,
            left: `${toPct(p25)}%`,
            width: `${Math.max(toPct(p75) - toPct(p25), 2)}%`,
            height: 10,
            borderRadius: 5,
            background: 'color-mix(in srgb, var(--series-1) 30%, transparent)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 6,
            left: `calc(${toPct(median)}% - 2px)`,
            width: 4,
            height: 22,
            borderRadius: 2,
            background: 'var(--bryce)'
          }}
        />
      </div>
      <div className="row row--between" style={{ marginTop: 4 }}>
        <span className="caption">Tougher day</span>
        <span className="caption" style={{ color: 'var(--ink-primary)', fontWeight: 570 }}>median · {toPct(median)}th pctile</span>
        <span className="caption">Stronger day</span>
      </div>
      <p style={{ margin: '14px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>History, not a prediction.</p>
    </Card>
  );
};

/* ---------- what needs to go right ---------- */

const PathFactors = ({ event }: { event: UpcomingPrepEvent }) => {
  const factors = Array.isArray(event.top10Path) ? (event.top10Path as unknown as Row[]) : [];
  if (factors.length === 0) return null;
  return (
    <Card
      title="What needs to go right"
      action={
        <SourcePill
          title="Top-10 path factors"
          entries={factors.map((factor) => ({
            label: asString(factor.factor) ?? 'Factor',
            note: [asString(factor.whyItMatters), asString(factor.actionableRead)].filter(Boolean).join(' — ')
          }))}
          caveats={['Path language only — no win or top-10 probability is claimed. The analytical detail behind each factor lives here.']}
        />
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        {factors.map((factor, index) => {
          const title = asString(factor.factor) ?? `Factor ${index + 1}`;
          const state = asString(factor.currentState);
          return (
            <div key={title} className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
              <span
                className="figure"
                style={{ flex: 'none', width: 20, fontSize: 14, color: 'var(--ink-muted)', textAlign: 'right' }}
              >
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 640, fontSize: 14 }}>{title}</div>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--ink-secondary)' }}>
                  {familyCopyFor(title, asString(factor.actionableRead))}
                </p>
                {state && state.length < 70 ? (
                  <span className="chip chip--outline" style={{ marginTop: 6 }}>{state}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- races that rhyme ---------- */

const AnalogRaces = ({ event }: { event: UpcomingPrepEvent }) => {
  const analogs = Array.isArray(event.analogRaces) ? (event.analogRaces as unknown as Row[]) : [];
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadDebriefArchive()
      .then((archive) => setAvailableIds(new Set(archive.map((entry) => entry.pack.sessionId))))
      .catch(() => setAvailableIds(new Set()));
  }, []);
  if (analogs.length === 0) return null;
  return (
    <Card title="Races that rhyme with this one">
      <div className="stack" style={{ gap: 8 }}>
        {analogs.slice(0, 5).map((analog, index) => {
          const sessionId = asString(analog.sessionId);
          const label = asString(analog.raceLabel) ?? `Analog ${index + 1}`;
          const kind = asString(analog.analogType) === 'same_track' ? 'same track' : 'same track type';
          const linked = sessionId !== null && availableIds.has(sessionId);
          const row = (
            <div
              className="row row--between"
              style={{
                padding: '9px 12px',
                borderRadius: 10,
                background: 'var(--surface-0)'
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: linked ? 600 : 450 }}>{label}</span>
              <span className="row" style={{ gap: 8 }}>
                <span className="chip chip--outline">{kind}</span>
                {linked ? <span style={{ color: 'var(--ink-secondary)', fontSize: 12 }}>debrief →</span> : null}
              </span>
            </div>
          );
          return linked && sessionId ? (
            <Link key={label + index} to={`/races/${encodeURIComponent(sessionId)}`}>
              {row}
            </Link>
          ) : (
            <div key={label + index}>{row}</div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- weather window ---------- */

interface EventWeather {
  observationText: string | null;
  temperatureF: number | null;
  periods: Array<{ name: string; temperature: string; forecast: string; wind: string | null }>;
  readinessNote: string | null;
}

const useEventWeather = (eventId: string | null): EventWeather | null => {
  const [weather, setWeather] = useState<EventWeather | null>(null);
  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/weather/upcoming', { headers: { accept: 'application/json' } });
        if (!response.ok) return;
        const payload = (await response.json()) as Row;
        const events = Array.isArray(payload.events) ? (payload.events as Row[]) : [];
        const match = events.find((entry) => asString((entry.event as Row)?.id) === eventId);
        if (!match || cancelled) return;
        const weatherData = (match.weather ?? {}) as Row;
        const observation = (weatherData.observation ?? {}) as Row;
        const temperatureC = asNumber(observation.temperatureC);
        const readiness = (match.forecastReadiness ?? {}) as Row;
        const eventRow = (match.event ?? {}) as Row;
        const eventDates = new Set(
          [asString(eventRow.eventStartDate), asString(eventRow.eventEndDate)].filter(
            (value): value is string => value !== null
          )
        );
        const forecast = Array.isArray(weatherData.forecast) ? (weatherData.forecast as Row[]) : [];
        const periods = forecast
          .filter((period) => {
            // Match by the period's actual date (NWS startTime carries the local
            // offset) — weekday names would hit the wrong week for events 6+ days out.
            const startTime = asString(period.startTime);
            const isDaytime = period.isDaytime !== false;
            return isDaytime && startTime !== null && eventDates.has(startTime.slice(0, 10));
          })
          .slice(0, 3)
          .map((period) => ({
            name: asString(period.name) ?? '',
            temperature: `${formatNumber(period.temperature, 0)}°${asString(period.temperatureUnit) ?? 'F'}`,
            forecast: asString(period.shortForecast) ?? '',
            wind: asString(period.windSpeed)
          }));
        setWeather({
          observationText: asString(observation.textDescription),
          temperatureF: temperatureC !== null ? Math.round((temperatureC * 9) / 5 + 32) : null,
          periods,
          readinessNote: asString(readiness.note)
        });
      } catch {
        /* weather optional */
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [eventId]);
  return weather;
};

const WeatherWindow = ({ weather }: { weather: EventWeather | null }) => {
  if (!weather) return null;
  return (
    <Card
      title={
        <>
          <CloudSun size={15} aria-hidden />
          Weather window
        </>
      }
      action={
        <SourcePill
          title="Weather window"
          entries={[
            {
              label: 'National Weather Service forecast + nearest station observation',
              path: '/api/weather/upcoming',
              note: 'Ambient near-track weather. Not official INDY NXT weather and not track temperature.'
            }
          ]}
        />
      }
    >
      {weather.periods.length > 0 ? (
        <div className="grid grid--3">
          {weather.periods.map((period) => (
            <div key={period.name} className="stat">
              <span className="caption">{period.name}</span>
              <span className="stat__value" style={{ fontSize: 22 }}>{period.temperature}</span>
              <span style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{period.forecast}</span>
              {period.wind ? <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>wind {period.wind}</span> : null}
            </div>
          ))}
        </div>
      ) : (
        <Unavailable>{weather.readinessNote ?? 'The NWS forecast window opens closer to the weekend.'}</Unavailable>
      )}
      {weather.temperatureF !== null ? (
        <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-secondary)' }}>
          At the track right now: {weather.temperatureF}°F{weather.observationText ? `, ${weather.observationText.toLowerCase()}` : ''}.
        </p>
      ) : null}
      <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--ink-muted)' }}>
        Near-track weather · NWS · not official series weather.
      </p>
    </Card>
  );
};

/* ---------- later this season ---------- */

const LaterThisSeason = ({ events }: { events: UpcomingPrepEvent[] }) => {
  if (events.length === 0) return null;
  return (
    <Card title="Later this season">
      <div className="stack" style={{ gap: 4 }}>
        {events.map((event) => {
          const days = daysUntil(event);
          return (
            <div
              key={event.eventId}
              className="row row--between"
              style={{ padding: '7px 0', borderBottom: '1px solid var(--grid-hairline)' }}
            >
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 560 }}>{event.eventName}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                  {event.trackName} · {trackTypeLabel(event.trackType)}
                </div>
              </div>
              <span className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 12.5, color: 'var(--ink-secondary)' }}>
                  {formatDate(event.eventStartDate, { month: 'short', day: 'numeric' })}
                </span>
                {days !== null ? <span className="chip chip--outline tnum">{days}d</span> : null}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

/* ---------- screen ---------- */

export const RaceWeekScreen = () => {
  const prep = getPrepScreen();
  const upcoming = getUpcomingEvents();
  const weekend = useMemo(() => groupWeekend(upcoming), [upcoming]);
  const nextSession = useNextSession();
  const weather = useEventWeather(weekend?.primary.eventId ?? null);

  if (!weekend) {
    return (
      <div className="page stack">
        <header className="screen-head">
          <span className="kicker">Race week HQ</span>
          <h1 className="screen-head__title">Off-season</h1>
        </header>
        <Card>
          <Unavailable>No upcoming races in the schedule yet. The next event appears here as soon as it’s published.</Unavailable>
        </Card>
      </div>
    );
  }

  const { primary, races } = weekend;
  const sameTrack = primary.sameTrack as Row;
  const typeHistory = primary.trackTypeHistory as Row;
  const hasTrackHistory = (asNumber(sameTrack.raceCount) ?? 0) > 0;
  const days = daysUntil(primary);
  const sessionMatches =
    nextSession?.startsAt && normalizedName(nextSession.eventName).includes(normalizedName(primary.eventName).slice(0, 12));
  const preciseStart = sessionMatches ? nextSession?.startsAt ?? null : null;
  const later = upcoming.filter((event) => !races.includes(event));

  return (
    <div className="page stack">
      <header className="screen-head row row--between" style={{ alignItems: 'flex-end', gap: 14 }}>
        <div>
          <span className="kicker">Race week HQ</span>
          <h1 className="screen-head__title">{primary.eventName}</h1>
          <p className="screen-head__sub row row--wrap" style={{ gap: 6 }}>
            <span className="row" style={{ gap: 5, whiteSpace: 'nowrap' }}>
              <MapPin size={13} aria-hidden />
              {primary.trackName}
            </span>
            · {trackTypeLabel(primary.trackType)}
            {asNumber(primary.trackLengthMi) !== null ? <> · {formatNumber(primary.trackLengthMi, 3)} mi</> : null}
            {asNumber(primary.cornerCount) !== null && asNumber(primary.cornerCount)! > 0 ? (
              <> · {formatNumber(primary.cornerCount, 0)} corners</>
            ) : null}
          </p>
        </div>
        <SourcePill
          title={prep.title}
          entries={prep.sourceRefs.map((ref) => ({ label: ref.key, path: ref.path, note: ref.note }))}
          caveats={prep.caveats}
        />
      </header>

      <HeroPanel tint="bryce">
        <span className="kicker">
          {days === 0 ? 'Race day' : days === 1 ? 'Tomorrow' : days !== null ? `In ${days} days` : 'Upcoming'}
          {' · '}
          {races
            .map(
              (race) =>
                `${formatDate(race.eventStartDate, { weekday: 'long' })}${races.length > 1 ? ` ${race.eventName.replace(/^.*Race (\d)$/, 'Race $1')}` : ''}`
            )
            .join(' · ')}
        </span>
        <div className="grid grid--split" style={{ marginTop: 18, alignItems: 'end', gap: 20 }}>
          <div>
            {preciseStart ? (
              <>
                <span className="caption">
                  First session · {formatDate(preciseStart, { weekday: 'short', month: 'short', day: 'numeric' })} ·{' '}
                  {formatClock(preciseStart)} your time
                  {nextSession?.sessionName ? ` · ${nextSession.sessionName}` : ''}
                </span>
                <div style={{ marginTop: 8 }}>
                  <Countdown to={preciseStart} />
                </div>
              </>
            ) : (
              <>
                <span className="caption">
                  Race weekend · {formatDate(primary.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}
                </span>
                <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-muted)' }}>
                  Exact session times appear here once Race Control publishes the weekend schedule.
                </p>
              </>
            )}
          </div>
          <div>
            <span className="caption">
              How Bryce runs {hasTrackHistory ? `at ${primary.trackName}` : `on ${trackTypeLabel(primary.trackType).toLowerCase()}s`}
            </span>
            <div className="row" style={{ gap: 26, marginTop: 8 }}>
              <Stat label="Races" value={formatNumber(hasTrackHistory ? sameTrack.raceCount : typeHistory.raceCount, 0)} />
              <Stat label="Avg finish" value={formatNumber(hasTrackHistory ? sameTrack.avgFinish : typeHistory.avgFinish)} />
              <Stat label="Top-10 rate" value={formatPct(hasTrackHistory ? sameTrack.top10RatePct : typeHistory.top10RatePct)} />
            </div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 16, gap: 7, color: 'var(--ink-muted)', fontSize: 12 }}>
          <Route size={12} aria-hidden />
          The live companion arms automatically for every session this weekend.
        </div>
      </HeroPanel>

      <div className="grid grid--split">
        <div className="stack">
          <PriorBand event={primary} />
          <PathFactors event={primary} />
        </div>
        <div className="stack">
          <FollowTheWeekend />
          <WeatherWindow weather={weather} />
          <AnalogRaces event={primary} />
        </div>
      </div>

      <LaterThisSeason events={later} />
    </div>
  );
};
