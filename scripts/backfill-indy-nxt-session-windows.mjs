import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = dirname(__dirname);
const datasetPath = join(root, 'data/career/career.dataset.json');
const rawDir = join(root, 'data/career/raw/indy-nxt/racecontrol');
const trackActivityRawPath = join(rawDir, 'trackactivityleaderboardfeed_nxt.json');
const scheduleRawPath = join(rawDir, 'schedulefeed_nxt.json');
const reportPath = join(root, 'data/career/reports/indy-nxt-session-window-backfill-report.json');
const trackActivitySourceUrl = 'https://indycar.blob.core.windows.net/racecontrol/trackactivityleaderboardfeed_nxt.json';
const scheduleSourceUrl = 'https://indycar.blob.core.windows.net/racecontrol/schedulefeed_nxt.json';
const refresh = process.argv.includes('--refresh');

const raceControlEventTrackIds = {
  5545: 'track_road_america',
  5537: 'track_road_america',
  5544: 'track_mid_ohio_sports_car_course',
  5543: 'track_mid_ohio_sports_car_course',
  5538: 'track_nashville_superspeedway',
  5547: 'track_portland_international_raceway',
  5540: 'track_the_milwaukee_mile',
  5542: 'track_weathertech_raceway_laguna_seca',
  5541: 'track_weathertech_raceway_laguna_seca'
};

const asArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);
const relative = (path) => path.replace(`${root}/`, '');

const readJsonIfExists = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return fallback;
  }
};

const fetchJsonCached = async (url, path) => {
  if (!refresh) {
    const cached = await readJsonIfExists(path, null);
    if (cached) return { payload: cached, fromCache: true };
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  const payload = await response.json();
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  return { payload, fromCache: false };
};

const sourceUtcDateTime = (value) => {
  const normalized = String(value ?? '').trim();
  const match = normalized.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/);
  return match ? `${match[1]}T${match[2]}Z` : null;
};

const utcToLocalDateTime = (value, timezone) => {
  const sourceUtc = sourceUtcDateTime(value);
  if (!sourceUtc || !timezone) return null;
  const date = new Date(sourceUtc);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}T${byType.hour}:${byType.minute}:${byType.second}`;
};

const trackActivitySourceEvidence = ({ retrievedAt }) => ({
  id: 'source_indy_nxt_2026_race_control_trackactivity_schedule',
  sourceType: 'official_json',
  sourceName: 'INDY NXT Race Control trackactivity feed',
  url: trackActivitySourceUrl,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-session-windows.mjs',
  licenseNotes: 'Public official INDYCAR Race Control JSON feed; store source-backed session window fields and raw artifact.',
  confidenceTier: 'official',
  coverage: 'Current INDY NXT Race Control event/session activity feed with session IDs, scheduled start/end windows, and estimated green flags.',
  parser: 'scripts/backfill-indy-nxt-session-windows.mjs',
  rawArtifactPath: relative(trackActivityRawPath),
  notes: 'Importer updates only existing canonical sessions whose officialSessionId exactly matches trackactivity sessionid. Race Control feed datetime strings are stored as source UTC and converted to the canonical event/session timezone for local session windows. No name/date fuzzy matching is performed.'
});

const scheduleSourceEvidence = ({ retrievedAt }) => ({
  id: 'source_indy_nxt_2026_race_control_schedule',
  sourceType: 'official_json',
  sourceName: 'INDY NXT Race Control schedule feed',
  url: scheduleSourceUrl,
  retrievedAt,
  publishedAt: null,
  accessedBy: 'scripts/backfill-indy-nxt-session-windows.mjs',
  licenseNotes: 'Public official INDYCAR Race Control JSON feed; store source-backed session schedule fields and raw artifact.',
  confidenceTier: 'official',
  coverage: 'Current INDY NXT Race Control event schedule feed with event IDs and broadcast/session start-end windows.',
  parser: 'scripts/backfill-indy-nxt-session-windows.mjs',
  rawArtifactPath: relative(scheduleRawPath),
  notes: 'Importer updates only existing canonical sessions when the schedule eventid matches the canonical officialEventId and a normalized practice/race label maps to exactly one canonical session. Qualification rows are skipped because schedule-feed labels are coarser than canonical group sessions.'
});

const upsert = (map, row) => {
  const current = map.get(row.id);
  if (!current) {
    map.set(row.id, row);
    return;
  }
  map.set(row.id, {
    ...current,
    ...row,
    provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), ...(row.provenanceRefs ?? [])]))
  });
};

const trackActivitySessions = (payload) => {
  const events = asArray(payload?.trackactivity?.event);
  return events.flatMap((event) =>
    asArray(event?.sessions?.session).map((session) => ({
      eventId: String(event.eventid ?? ''),
      eventName: event.eventname ?? null,
      sessionId: String(session.sessionid ?? ''),
      sessionLabel: session.sessionlabel ?? null,
      sessionType: session.sessiontype ?? null,
      sourceStartUtc: sourceUtcDateTime(session.startdatetime),
      sourceEndUtc: sourceUtcDateTime(session.enddatetime),
      sourceEstimatedGreenFlagUtc: sourceUtcDateTime(session.estimatedgreenflag),
      resultOfficial: session.resultsofficial === '1',
      resultImported: session.resultsimported === '1',
      raw: session
    }))
  );
};

const normalizeLabel = (value) =>
  String(value ?? '')
    .replace(/^INDY NXT\s*-\s*/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/^qualifications$/, 'qualifying');

const safeScheduleLabel = (label) => {
  const normalized = normalizeLabel(label);
  if (/^practice(?: \d+)?$/.test(normalized)) return normalized;
  if (/^race(?: \d+)?$/.test(normalized)) return normalized;
  return null;
};

const eventRaceKey = (event) => {
  const name = normalizeLabel(event?.name);
  const match = name.match(/\brace ([12])\b/);
  return match ? `race ${match[1]}` : null;
};

const canonicalScheduleKeys = (session, event) => {
  const label = normalizeLabel(session.sessionName);
  const keys = new Set();
  if (/^practice(?: \d+)?$/.test(label)) keys.add(label);
  if (label === 'race') keys.add(eventRaceKey(event) ?? 'race');
  if (/^race [12]$/.test(label)) keys.add(label);
  return [...keys];
};

const sessionTypeFromRaceControl = (session) => {
  const type = String(session.sessionType ?? '').trim().toUpperCase();
  if (type === 'P') return 'practice';
  if (type === 'Q') return 'qualifying';
  if (type === 'R') return 'race';
  const label = normalizeLabel(session.sessionLabel);
  if (/practice/.test(label)) return 'practice';
  if (/qual/.test(label)) return 'qualifying';
  if (/race/.test(label)) return 'race';
  return 'unknown';
};

const raceNumberFrom = (sessionLabel, eventName) => {
  const sessionMatch = normalizeLabel(sessionLabel).match(/\brace ([12])\b/);
  if (sessionMatch) return Number(sessionMatch[1]);
  const eventMatch = normalizeLabel(eventName).match(/\brace ([12])\b/);
  return eventMatch ? Number(eventMatch[1]) : null;
};

const scheduleFeedSessions = (payload) => {
  const events = asArray(payload?.schedule?.race);
  return events.flatMap((event) =>
    asArray(event?.broadcasts?.broadcast).map((broadcast) => ({
      eventId: String(event.eventid ?? ''),
      eventName: event.name ?? null,
      eventUrl: event.link_url ?? null,
      scheduleLabel: broadcast.name ?? null,
      matchKey: safeScheduleLabel(broadcast.name),
      sourceStartUtc: sourceUtcDateTime(broadcast.start),
      sourceEndUtc: sourceUtcDateTime(broadcast.end),
      raw: broadcast
    }))
  );
};

const scheduleFeedEvents = (payload) =>
  asArray(payload?.schedule?.race).map((event) => ({
    eventId: String(event.eventid ?? ''),
    eventName: event.name ?? null,
    eventUrl: event.link_url ?? null,
    sourceGreenFlagUtc: sourceUtcDateTime(event.green_flag),
    raw: event
  }));

const localDate = (value) => (typeof value === 'string' && value.includes('T') ? value.slice(0, 10) : null);

const main = async () => {
  await mkdir(rawDir, { recursive: true });
  await mkdir(dirname(reportPath), { recursive: true });

  const dataset = await readJsonIfExists(datasetPath, {});
  const retrievedAt = new Date().toISOString();
  const trackActivityFetch = await fetchJsonCached(trackActivitySourceUrl, trackActivityRawPath);
  const scheduleFetch = await fetchJsonCached(scheduleSourceUrl, scheduleRawPath);
  const feedSessions = trackActivitySessions(trackActivityFetch.payload).filter((session) => session.sessionId);
  const scheduleSessions = scheduleFeedSessions(scheduleFetch.payload).filter((session) => session.eventId);
  const scheduleEvents = scheduleFeedEvents(scheduleFetch.payload).filter((event) => event.eventId && event.sourceGreenFlagUtc);

  const sessions = new Map(asArray(dataset.sessions).map((row) => [row.id, row]));
  const events = new Map(asArray(dataset.events).map((row) => [row.id, row]));
  const sourceEvidenceMap = new Map(asArray(dataset.sourceEvidence).map((row) => [row.id, row]));
  const tracksById = new Map(asArray(dataset.tracks).map((row) => [row.id, row]));
  const eventsById = new Map(events);
  const eventsByOfficialId = new Map(Array.from(events.values()).map((row) => [String(row.officialEventId ?? ''), row]).filter(([id]) => id));
  const scheduleEventsById = new Map(scheduleEvents.map((event) => [event.eventId, event]));
  upsert(sourceEvidenceMap, trackActivitySourceEvidence({ retrievedAt }));
  upsert(sourceEvidenceMap, scheduleSourceEvidence({ retrievedAt }));

  const report = {
    checkedAt: retrievedAt,
    refresh,
    sources: {
      trackActivity: {
        sourceUrl: trackActivitySourceUrl,
        rawArtifactPath: relative(trackActivityRawPath),
        fetched: trackActivityFetch.fromCache ? 0 : 1,
        cached: trackActivityFetch.fromCache ? 1 : 0
      },
      schedule: {
        sourceUrl: scheduleSourceUrl,
        rawArtifactPath: relative(scheduleRawPath),
        fetched: scheduleFetch.fromCache ? 0 : 1,
        cached: scheduleFetch.fromCache ? 1 : 0
      }
    },
    feedSessions: feedSessions.length,
    scheduleFeedSessions: scheduleSessions.length,
    directCanonicalMatches: 0,
    scheduleCanonicalMatches: 0,
    scheduleGreenFlagCanonicalMatches: 0,
    sessionsUpdated: [],
    scheduleSessionsUpdated: [],
    scheduleGreenFlagSessionsUpdated: [],
    scheduleOnlyEventsCreated: [],
    scheduleOnlySessionsCreated: [],
    scheduleOnlySessionsUpdated: [],
    scheduleSessionsSkipped: [],
    scheduleGreenFlagSessionsSkipped: [],
    feedSessionsWithoutCanonicalMatch: [],
    notes: [
      'Only exact officialSessionId/sessionid matches are updated.',
      'Trackactivity startdatetime becomes scheduledStart; estimatedgreenflag becomes actualStart when present because Race Control labels it as the expected green flag rather than the post-session official start.',
      'Race Control datetime strings are treated as UTC source values and converted to event-local timestamps before canonical storage.',
      'Schedule-feed updates require exact eventid plus an unambiguous normalized practice/race label. Qualifying rows are skipped because schedule labels do not expose canonical group timing.',
      'Event-level green_flag values are used only for exact-event race sessions that do not already have a higher-priority trackactivity or broadcast schedule window.',
      'Future Race Control trackactivity sessions can create schedule-only canonical event/session rows when the event has a curated track mapping. These rows carry no result rows and remain status=scheduled until official result imports arrive.'
    ]
  };

  for (const feedSession of feedSessions) {
    const canonicalSessionId = `session_indy_nxt_2026_${feedSession.sessionId}`;
    const current = sessions.get(canonicalSessionId);
    if (!current) {
      continue;
    }
    if (current.ingestionState === 'schedule_only') {
      continue;
    }

    report.directCanonicalMatches += 1;
    const event = eventsById.get(current.eventId);
    const timezone = current.timezone ?? event?.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(feedSession.raw.startdatetime, timezone);
    const scheduledEnd = utcToLocalDateTime(feedSession.raw.enddatetime, timezone);
    const estimatedGreenFlag = utcToLocalDateTime(feedSession.raw.estimatedgreenflag, timezone);
    const next = {
      ...current,
      scheduledStart: scheduledStart ?? current.scheduledStart,
      actualStart: estimatedGreenFlag ?? current.actualStart,
      scheduledEnd: scheduledEnd ?? current.scheduledEnd ?? null,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_trackactivity',
      raw: {
        ...(current.raw ?? {}),
        raceControlTrackActivityWindow: {
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sessionType: feedSession.sessionType,
          sourceTimezone: 'UTC',
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEndUtc: feedSession.sourceEndUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          scheduledStart,
          scheduledEnd,
          estimatedGreenFlag,
          resultImported: feedSession.resultImported,
          resultOfficial: feedSession.resultOfficial
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_trackactivity_schedule']))
    };
    sessions.set(canonicalSessionId, next);
    report.sessionsUpdated.push({
      sessionId: canonicalSessionId,
      officialSessionId: feedSession.sessionId,
      scheduledStart: next.scheduledStart,
      actualStart: next.actualStart,
      scheduledEnd: next.scheduledEnd,
      timezone,
      sourceStartUtc: feedSession.sourceStartUtc,
      sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc
    });
  }

  const unmatchedFeedSessions = feedSessions.filter((feedSession) => {
    if (!feedSession.sessionId) return false;
    const existing = sessions.get(`session_indy_nxt_2026_${feedSession.sessionId}`);
    return !existing || existing.ingestionState === 'schedule_only';
  });
  const unmatchedByEventId = new Map();
  for (const feedSession of unmatchedFeedSessions) {
    if (!unmatchedByEventId.has(feedSession.eventId)) unmatchedByEventId.set(feedSession.eventId, []);
    unmatchedByEventId.get(feedSession.eventId).push(feedSession);
  }

  for (const [eventOfficialId, eventFeedSessions] of unmatchedByEventId) {
    const trackId = raceControlEventTrackIds[eventOfficialId];
    const track = tracksById.get(trackId);
    const scheduleEvent = scheduleEventsById.get(eventOfficialId);
    if (!trackId || !track) {
      for (const feedSession of eventFeedSessions) {
        report.feedSessionsWithoutCanonicalMatch.push({
          sessionId: feedSession.sessionId,
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          reason: 'no_curated_track_mapping_for_schedule_only_event'
        });
      }
      continue;
    }

    const timezone = track.timezone;
    const eventId = `event_indy_nxt_2026_${eventOfficialId}`;
    let event = events.get(eventId);
    const localWindows = eventFeedSessions
      .map((feedSession) => ({
        start: utcToLocalDateTime(feedSession.raw.startdatetime, timezone),
        end: utcToLocalDateTime(feedSession.raw.enddatetime, timezone)
      }))
      .filter((row) => row.start);
    const localDates = localWindows
      .flatMap((row) => [localDate(row.start), localDate(row.end)])
      .filter(Boolean)
      .sort();

    if (!event) {
      event = {
        id: eventId,
        seriesId: 'series_indy_nxt',
        seasonYear: 2026,
        name: scheduleEvent?.eventName ?? eventFeedSessions[0]?.eventName ?? `INDY NXT Race Control Event ${eventOfficialId}`,
        round: null,
        eventStartDate: localDates[0] ?? null,
        eventEndDate: localDates.at(-1) ?? localDates[0] ?? null,
        trackId,
        country: track.country ?? 'United States',
        officialEventId: eventOfficialId,
        timezone,
        status: 'scheduled',
        raw: {
          raceControlScheduleOnlyEvent: {
            eventId: eventOfficialId,
            eventName: scheduleEvent?.eventName ?? eventFeedSessions[0]?.eventName ?? null,
            eventUrl: scheduleEvent?.eventUrl ?? null,
            sourceTimezone: 'UTC',
            trackActivitySessionIds: eventFeedSessions.map((feedSession) => feedSession.sessionId)
          }
        },
        provenanceRefs: Array.from(new Set([
          'source_indy_nxt_2026_race_control_schedule',
          'source_indy_nxt_2026_race_control_trackactivity_schedule',
          ...(track.provenanceRefs ?? [])
        ]))
      };
      events.set(eventId, event);
      eventsById.set(eventId, event);
      eventsByOfficialId.set(eventOfficialId, event);
      report.scheduleOnlyEventsCreated.push({
        eventId,
        officialEventId: eventOfficialId,
        eventName: event.name,
        trackId,
        eventStartDate: event.eventStartDate,
        eventEndDate: event.eventEndDate,
        timezone
      });
    }

    for (const feedSession of eventFeedSessions) {
      const sessionId = `session_indy_nxt_2026_${feedSession.sessionId}`;
      const current = sessions.get(sessionId);
      const scheduledStart = utcToLocalDateTime(feedSession.raw.startdatetime, timezone);
      const scheduledEnd = utcToLocalDateTime(feedSession.raw.enddatetime, timezone);
      const estimatedGreenFlag = utcToLocalDateTime(feedSession.raw.estimatedgreenflag, timezone);
      if (!scheduledStart) {
        report.feedSessionsWithoutCanonicalMatch.push({
          sessionId: feedSession.sessionId,
          eventId: feedSession.eventId,
          eventName: feedSession.eventName,
          sessionLabel: feedSession.sessionLabel,
          sourceStartUtc: feedSession.sourceStartUtc,
          sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
          reason: 'missing_or_unparseable_start_for_schedule_only_session'
        });
        continue;
      }

      const next = {
        ...(current ?? {}),
        id: sessionId,
        eventId,
        sessionType: sessionTypeFromRaceControl(feedSession),
        sessionName: feedSession.sessionLabel ?? 'Race Control Session',
        raceNumber: raceNumberFrom(feedSession.sessionLabel, event.name),
        scheduledStart,
        actualStart: estimatedGreenFlag,
        scheduledEnd,
        timezone,
        lapsScheduled: null,
        distanceScheduled: null,
        status: 'scheduled',
        officialSessionId: feedSession.sessionId,
        timePrecision: 'local_datetime',
        timeSource: 'official_race_control_trackactivity_schedule_only',
        weatherObservationRefs: [],
        ingestionState: 'schedule_only',
        broadcastRouteRefs: [],
        notificationRefs: [],
        raw: {
          raceControlTrackActivityWindow: {
            eventId: feedSession.eventId,
            eventName: feedSession.eventName,
            sessionLabel: feedSession.sessionLabel,
            sessionType: feedSession.sessionType,
            sourceTimezone: 'UTC',
            sourceStartUtc: feedSession.sourceStartUtc,
            sourceEndUtc: feedSession.sourceEndUtc,
            sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc,
            scheduledStart,
            scheduledEnd,
            estimatedGreenFlag,
            resultImported: feedSession.resultImported,
            resultOfficial: feedSession.resultOfficial,
            scheduleOnly: true
          }
        },
        provenanceRefs: [
          'source_indy_nxt_2026_race_control_trackactivity_schedule',
          'source_indy_nxt_2026_race_control_schedule'
        ]
      };
      sessions.set(sessionId, next);
      const reportRow = {
        sessionId,
        officialSessionId: feedSession.sessionId,
        eventId,
        officialEventId: eventOfficialId,
        sessionLabel: feedSession.sessionLabel,
        sessionType: next.sessionType,
        scheduledStart,
        actualStart: estimatedGreenFlag,
        scheduledEnd,
        timezone,
        sourceStartUtc: feedSession.sourceStartUtc,
        sourceEstimatedGreenFlagUtc: feedSession.sourceEstimatedGreenFlagUtc
      };
      if (current) report.scheduleOnlySessionsUpdated.push(reportRow);
      else report.scheduleOnlySessionsCreated.push(reportRow);
    }
  }

  for (const scheduleSession of scheduleSessions) {
    if (!scheduleSession.matchKey) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        reason: 'unsupported_or_ambiguous_schedule_label'
      });
      continue;
    }

    const event = eventsByOfficialId.get(scheduleSession.eventId);
    if (!event) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'no_existing_canonical_event'
      });
      continue;
    }

    const candidates = Array.from(sessions.values()).filter((session) => {
      if (session.eventId !== event.id) return false;
      const keys = canonicalScheduleKeys(session, event);
      return keys.includes(scheduleSession.matchKey);
    });

    if (candidates.length !== 1) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: candidates.length === 0 ? 'no_unambiguous_canonical_session' : 'multiple_canonical_sessions',
        candidateSessionIds: candidates.map((session) => session.id)
      });
      continue;
    }

    const current = candidates[0];
    if (['official_race_control_trackactivity', 'official_race_control_trackactivity_schedule_only'].includes(current.timeSource)) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'higher_priority_trackactivity_window_exists',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const timezone = current.timezone ?? event.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(scheduleSession.raw.start, timezone);
    const scheduledEnd = utcToLocalDateTime(scheduleSession.raw.end, timezone);
    if (!scheduledStart) {
      report.scheduleSessionsSkipped.push({
        eventId: scheduleSession.eventId,
        eventName: scheduleSession.eventName,
        scheduleLabel: scheduleSession.scheduleLabel,
        matchKey: scheduleSession.matchKey,
        reason: 'missing_or_unparseable_start',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const next = {
      ...current,
      scheduledStart,
      scheduledEnd: scheduledEnd ?? current.scheduledEnd ?? null,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_schedule',
      raw: {
        ...(current.raw ?? {}),
        raceControlScheduleWindow: {
          eventId: scheduleSession.eventId,
          eventName: scheduleSession.eventName,
          eventUrl: scheduleSession.eventUrl,
          scheduleLabel: scheduleSession.scheduleLabel,
          matchKey: scheduleSession.matchKey,
          sourceTimezone: 'UTC',
          sourceStartUtc: scheduleSession.sourceStartUtc,
          sourceEndUtc: scheduleSession.sourceEndUtc,
          scheduledStart,
          scheduledEnd
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_schedule']))
    };
    sessions.set(current.id, next);
    report.scheduleCanonicalMatches += 1;
    report.scheduleSessionsUpdated.push({
      sessionId: current.id,
      eventId: scheduleSession.eventId,
      scheduleLabel: scheduleSession.scheduleLabel,
      scheduledStart: next.scheduledStart,
      scheduledEnd: next.scheduledEnd,
      timezone,
      sourceStartUtc: scheduleSession.sourceStartUtc,
      sourceEndUtc: scheduleSession.sourceEndUtc
    });
  }

  for (const scheduleEvent of scheduleEvents) {
    const event = eventsByOfficialId.get(scheduleEvent.eventId);
    if (!event) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'no_existing_canonical_event'
      });
      continue;
    }

    const candidates = Array.from(sessions.values()).filter((session) => session.eventId === event.id && session.sessionType === 'race');
    if (candidates.length !== 1) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: candidates.length === 0 ? 'no_canonical_race_session' : 'multiple_canonical_race_sessions',
        candidateSessionIds: candidates.map((session) => session.id)
      });
      continue;
    }

    const current = candidates[0];
    if (['official_race_control_trackactivity', 'official_race_control_trackactivity_schedule_only', 'official_race_control_schedule'].includes(current.timeSource)) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'higher_priority_window_exists',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const timezone = current.timezone ?? event.timezone ?? null;
    const scheduledStart = utcToLocalDateTime(scheduleEvent.raw.green_flag, timezone);
    if (!scheduledStart) {
      report.scheduleGreenFlagSessionsSkipped.push({
        eventId: scheduleEvent.eventId,
        eventName: scheduleEvent.eventName,
        reason: 'missing_or_unparseable_green_flag',
        candidateSessionIds: [current.id]
      });
      continue;
    }

    const next = {
      ...current,
      scheduledStart,
      timePrecision: 'local_datetime',
      timeSource: 'official_race_control_schedule_green_flag',
      raw: {
        ...(current.raw ?? {}),
        raceControlScheduleGreenFlagWindow: {
          eventId: scheduleEvent.eventId,
          eventName: scheduleEvent.eventName,
          eventUrl: scheduleEvent.eventUrl,
          sourceTimezone: 'UTC',
          sourceGreenFlagUtc: scheduleEvent.sourceGreenFlagUtc,
          scheduledStart
        }
      },
      provenanceRefs: Array.from(new Set([...(current.provenanceRefs ?? []), 'source_indy_nxt_2026_race_control_schedule']))
    };
    sessions.set(current.id, next);
    report.scheduleGreenFlagCanonicalMatches += 1;
    report.scheduleGreenFlagSessionsUpdated.push({
      sessionId: current.id,
      eventId: scheduleEvent.eventId,
      eventName: scheduleEvent.eventName,
      scheduledStart: next.scheduledStart,
      timezone,
      sourceGreenFlagUtc: scheduleEvent.sourceGreenFlagUtc
    });
  }

  const nextDataset = {
    ...dataset,
    updatedAt: retrievedAt,
    events: Array.from(events.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sessions: Array.from(sessions.values()).sort((a, b) => a.id.localeCompare(b.id)),
    sourceEvidence: Array.from(sourceEvidenceMap.values()).sort((a, b) => a.id.localeCompare(b.id))
  };

  await writeFile(datasetPath, `${JSON.stringify(nextDataset, null, 2)}\n`);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    wrote: datasetPath,
    report: reportPath,
    directCanonicalMatches: report.directCanonicalMatches,
    sessionsUpdated: report.sessionsUpdated.length,
    scheduleCanonicalMatches: report.scheduleCanonicalMatches,
    scheduleSessionsUpdated: report.scheduleSessionsUpdated.length,
    scheduleGreenFlagCanonicalMatches: report.scheduleGreenFlagCanonicalMatches,
    scheduleGreenFlagSessionsUpdated: report.scheduleGreenFlagSessionsUpdated.length,
    scheduleOnlyEventsCreated: report.scheduleOnlyEventsCreated.length,
    scheduleOnlySessionsCreated: report.scheduleOnlySessionsCreated.length,
    scheduleOnlySessionsUpdated: report.scheduleOnlySessionsUpdated.length,
    feedSessionsWithoutCanonicalMatch: report.feedSessionsWithoutCanonicalMatch.length,
    source: {
      trackActivity: trackActivityFetch.fromCache ? 'cache' : 'fetch',
      schedule: scheduleFetch.fromCache ? 'cache' : 'fetch'
    }
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
