import {
  uiDataPackage,
  type UiVenueDossier,
  type UiVenueDossierVenue,
  type UiVenueDossierVisit
} from './uiDataPackage';

/** "This place, other years" — Bryce's most explicit ask. Accessors stay
 *  tolerant of package builds that predate the module so a stale bundle
 *  degrades to an honest empty state instead of throwing. */

const emptyDossier: UiVenueDossier = {
  schemaVersion: 'brycecast.venueDossier.v1',
  title: 'This place, other years',
  readiness: 'unavailable',
  venues: [],
  venueCount: 0,
  caveats: [],
  sourceRefs: []
};

export const getVenueDossier = (): UiVenueDossier => {
  const screens = uiDataPackage.screens as Record<string, unknown>;
  return (screens.venueDossier as UiVenueDossier | undefined) ?? emptyDossier;
};

const normalize = (name: string | null | undefined) =>
  String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Venue record by track name (the identity every screen already holds). */
export const getVenueByTrackName = (trackName: string | null | undefined): UiVenueDossierVenue | null => {
  const target = normalize(trackName);
  if (!target) return null;
  return getVenueDossier().venues.find((venue) => normalize(venue.trackName) === target) ?? null;
};

/** Venue record that contains a given INDY NXT race session (for race pages). */
export const getVenueBySessionId = (sessionId: string | null | undefined): UiVenueDossierVenue | null => {
  if (!sessionId) return null;
  return (
    getVenueDossier().venues.find((venue) => venue.visits.some((visit) => visit.sessionId === sessionId)) ?? null
  );
};

/** Past visits at a venue, oldest first, optionally excluding one session
 *  (the race page's own race). */
export const pastVisits = (
  venue: UiVenueDossierVenue | null,
  excludeSessionId?: string | null
): UiVenueDossierVisit[] => {
  if (!venue) return [];
  return venue.visits.filter((visit) => visit.sessionId !== excludeSessionId);
};
