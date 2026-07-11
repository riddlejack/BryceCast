import { Fragment } from 'react';
import { CheckCircle2, ExternalLink, Tv, Wind } from 'lucide-react';
import { Card, SourcePill, Stat, StatusChip, Unavailable } from '../app/components';
import { asNumber, asString, formatDate, formatNumber, formatPct, ordinal, shortVenue, trackTypeLabel } from '../app/format';
import { Link } from '../app/router';
import { useApiJson } from '../app/useApiJson';
import { getPrepScreen, getUpcomingEvents, type UpcomingPrepEvent } from '../data/upcoming';

type Row = Record<string, unknown>;

/** Live weekend context: watch routes from the schedule feed + venue weather (NWS).
 *  Renders nothing when the local API isn't running — the static intelligence stands alone. */
const WeekendLiveCard = ({ venueName }: { venueName: string | null }) => {
  const session = useApiJson<Row>('/api/session', 120_000);
  const weather = useApiJson<Row>('/api/weather/upcoming', 300_000);

  const route = (session.data?.broadcastRoute as Row) ?? null;
  const primary = (route?.primaryVideo as Row) ?? null;
  const audio = Array.isArray(route?.audio) ? (route?.audio as Row[]) : [];

  const venueEvents = Array.isArray(weather.data?.events)
    ? (weather.data?.events as Row[]).filter((entry) => {
        const track = ((entry.event as Row)?.track as Row) ?? {};
        return venueName ? String(track.name ?? '').toLowerCase().includes(venueName.toLowerCase().split(' ')[0]) : false;
      })
    : [];
  const venueWeather = venueEvents[0] ?? null;
  const observation = ((venueWeather?.weather as Row)?.observation as Row) ?? null;
  const temperature = asNumber((observation?.temperature as Row)?.value ?? observation?.temperature);
  const readinessLabel = asString((venueWeather?.weather as Row)?.forecastReadiness ?? venueWeather?.forecastReadiness);

  if (!primary && !venueWeather) return null;

  return (
    <Card
      title={
        <span className="row" style={{ gap: 7 }}>
          <Tv size={15} style={{ color: 'var(--ink-secondary)' }} aria-hidden />
          Follow the weekend
        </span>
      }
    >
      {primary ? (
        <div className="row row--wrap" style={{ gap: 8 }}>
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
          {audio.slice(0, 1).map((entry, index) => (
            <a key={index} href={asString(entry.url) ?? '#'} target="_blank" rel="noreferrer" className="chip chip--outline" style={{ fontSize: 12.5, padding: '7px 14px' }}>
              <ExternalLink size={12} aria-hidden />
              {asString(entry.name) ?? 'Radio'}
            </a>
          ))}
        </div>
      ) : null}
      {venueWeather ? (
        <div className="row" style={{ marginTop: primary ? 12 : 0, gap: 10, fontSize: 13, color: 'var(--ink-secondary)' }}>
          <Wind size={14} aria-hidden />
          {temperature !== null ? <span className="figure" style={{ fontSize: 15, color: 'var(--ink-primary)' }}>{Math.round(temperature)}°C now</span> : null}
          <span>
            {readinessLabel === 'forecast_window_open'
              ? 'race-day forecast is live'
              : readinessLabel === 'too_far_for_event_forecast'
                ? 'race-day forecast opens closer to the weekend'
                : 'venue weather'}
          </span>
          <span className="caption" style={{ marginLeft: 'auto' }}>near-track · NWS</span>
        </div>
      ) : null}
    </Card>
  );
};

/** Historical prior band rendered as an honest interval — explicitly history, not prediction. */
const PriorBand = ({ event }: { event: UpcomingPrepEvent }) => {
  const band = event.predictionBand?.finishPercentileBand;
  if (!band) return null;
  /* percentile here: share of field beaten → higher is better. Render 0..1 left-to-right as better→worse finish. */
  const toPct = (value: number) => `${Math.round(value * 100)}%`;
  return (
    <div>
      <div className="row row--between" style={{ marginBottom: 6 }}>
        <span className="caption">The historical range · {band.n} road races</span>
        <span className="caption caption--secondary">history, not a prediction</span>
      </div>
      <div style={{ position: 'relative', height: 26 }}>
        <div style={{ position: 'absolute', inset: '11px 0', borderRadius: 4, background: 'var(--surface-3)' }} />
        <div
          style={{
            position: 'absolute',
            top: 8,
            bottom: 8,
            left: toPct(band.p25),
            width: `calc(${toPct(band.p75)} - ${toPct(band.p25)})`,
            borderRadius: 5,
            background: 'var(--seq-550)'
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: `calc(${toPct(band.median)} - 2px)`,
            width: 4,
            borderRadius: 2,
            background: 'var(--bryce)'
          }}
          title={`median ${ordinal(Math.round(band.median * 100))} percentile`}
        />
      </div>
      <div className="row row--between" style={{ fontSize: 11, color: 'var(--ink-muted)' }}>
        <span>tougher day</span>
        <span style={{ color: 'var(--bryce)' }}>median · {ordinal(Math.round(band.median * 100))} pctile</span>
        <span>stronger day</span>
      </div>
    </div>
  );
};

const EventCard = ({ event }: { event: UpcomingPrepEvent }) => {
  const sameTrackRaces = asNumber(event.sameTrack.raceCount);
  const prep = getPrepScreen();
  return (
    <Card
      title={event.eventName}
      action={
        <SourcePill
          title={event.eventName}
          entries={[
            { label: 'Upcoming-event intelligence pack', path: event.contextPackRef.path, note: 'Source-hash verified analytics pack generated from official results history.' },
            ...event.contextPackRef.sourceRefs.slice(0, 4).map((path) => ({ label: 'Upstream table', path }))
          ]}
          caveats={prep.caveats}
        />
      }
    >
      <div style={{ color: 'var(--ink-secondary)', fontSize: 13.5, marginTop: -6 }}>
        {event.trackName} · {trackTypeLabel(event.trackType)}
        {event.trackLengthMi ? ` · ${event.trackLengthMi} mi` : ''}
        {event.cornerCount ? ` · ${event.cornerCount} corners` : ''} ·{' '}
        {formatDate(event.eventStartDate, { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>

      <div className="grid grid--3" style={{ margin: '16px 0' }}>
        <Stat
          label={sameTrackRaces ? `At ${shortVenue(event.trackName)} · ${formatNumber(sameTrackRaces, 0)} races` : `At ${shortVenue(event.trackName)}`}
          value={sameTrackRaces ? formatNumber(event.sameTrack.avgFinish) : '—'}
          unit={sameTrackRaces ? 'avg finish' : undefined}
        />
        <Stat
          label={`${trackTypeLabel(event.trackType)}s · ${formatNumber(event.trackTypeHistory.raceCount, 0)} races`}
          value={formatNumber(event.trackTypeHistory.avgFinish)}
          unit="avg finish"
        />
        <Stat label="Top-10 rate · this track type" value={formatPct(event.trackTypeHistory.top10RatePct)} />
      </div>

      <PriorBand event={event} />

      {event.top10Path.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <span className="caption">What needs to go right</span>
          <div className="stack" style={{ gap: 10, marginTop: 8 }}>
            {event.top10Path.map((item, index) => (
              <div key={index} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <CheckCircle2 size={15} style={{ color: 'var(--seq-400)', marginTop: 2, flexShrink: 0 }} aria-hidden />
                <div style={{ fontSize: 13.5 }}>
                  <strong>{item.factor}.</strong>{' '}
                  <span style={{ color: 'var(--ink-secondary)' }}>{item.whyItMatters}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {event.analogRaces.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <span className="caption">Races that rhyme with this one</span>
          <div className="stack" style={{ gap: 6, marginTop: 8 }}>
            {event.analogRaces.slice(0, 4).map((analog) => (
              <Link key={analog.sessionId} to={`/races/${encodeURIComponent(analog.sessionId)}`} className="row row--between" style={{ fontSize: 13.5, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
                <span>{analog.raceLabel}</span>
                <span className="chip chip--outline" style={{ fontSize: 10.5 }}>
                  {analog.analogType.replaceAll('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
};

export const RaceWeekScreen = () => {
  const events = getUpcomingEvents();
  return (
    <div className="page stack">
      <header>
        <h1 className="display" style={{ fontSize: 26, margin: 0 }}>
          Race Week
        </h1>
        <p style={{ margin: '4px 0 0', color: 'var(--ink-secondary)', fontSize: 14 }}>
          The weekend ahead, read through everything Bryce’s career data knows.
        </p>
      </header>
      <WeekendLiveCard venueName={events[0]?.trackName ?? null} />
      {events.length === 0 ? (
        <Card>
          <Unavailable>
            No upcoming event packs in the current data package — the schedule roll-forward lands shortly.
          </Unavailable>
        </Card>
      ) : (
        <Fragment>
          {events.slice(0, 2).map((event) => (
            <EventCard key={event.eventId} event={event} />
          ))}
          {events.length > 2 ? (
            <Card title="Later this season">
              <div className="stack" style={{ gap: 8 }}>
                {events.slice(2).map((event) => (
                  <div key={event.eventId} className="row row--between" style={{ fontSize: 13.5 }}>
                    <span>{event.eventName}</span>
                    <span style={{ color: 'var(--ink-muted)' }}>{formatDate(event.eventStartDate, { month: 'short', day: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </Fragment>
      )}
      <div className="row">
        <StatusChip tone="neutral" label="Weather joins live on race day via NWS" />
      </div>
    </div>
  );
};
