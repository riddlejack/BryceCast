/** Compact canonical calendar for runtime consumers. An analytics package's
 * list of upcoming events is a date-filtered view, not a durable schedule. */
export const buildIndyNxtCalendar = (data) => {
  const tracks = new Map(data.tracks.map((track) => [track.id, track]));
  return {
    schemaVersion: 'brycecast.indyNxtCalendar.v1', sourceUpdatedAt: data.updatedAt,
    source: 'data/career/career.dataset.json',
    events: data.events.filter((event) => event.seriesId === 'series_indy_nxt').map((event) => ({
      id: event.id, eventId: event.id, eventName: event.name,
      seasonYear: event.seasonYear, eventStartDate: event.eventStartDate,
      eventEndDate: event.eventEndDate ?? event.eventStartDate,
      track: { id: event.trackId, name: tracks.get(event.trackId)?.name ?? null },
      timezone: event.timezone ?? tracks.get(event.trackId)?.timezone ?? null,
      sourceRefs: event.provenanceRefs ?? []
    }))
  };
};
