import {
  uiDataPackage,
  type UiVenueDossier,
  type UiVenueDossierDelta,
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

/** Neutral weather wording for a year-over-year delta. A delta is a fact about
 *  the day, never a verdict on the drive: "6° warmer · wind swung NW",
 *  "much the same". Returns null when there is no prior visit to compare. */
export const weatherDeltaText = (delta: UiVenueDossierDelta | null): string | null => {
  if (!delta) return null;
  const parts: string[] = [];
  if (delta.tempDeltaF !== null && delta.tempDeltaF !== 0) {
    parts.push(`${Math.abs(delta.tempDeltaF)}° ${delta.tempDeltaF > 0 ? 'warmer' : 'cooler'}`);
  }
  if (delta.windSwung && delta.windDirectionTo) {
    parts.push(`wind swung ${delta.windDirectionTo}`);
  } else if (delta.windSpeedDeltaMph !== null && Math.abs(delta.windSpeedDeltaMph) >= 2) {
    parts.push(`${Math.abs(delta.windSpeedDeltaMph)} mph ${delta.windSpeedDeltaMph > 0 ? 'breezier' : 'calmer'}`);
  }
  if (parts.length === 0 && delta.humidityDeltaPct !== null && Math.abs(delta.humidityDeltaPct) >= 8) {
    parts.push(`${Math.abs(delta.humidityDeltaPct)}% ${delta.humidityDeltaPct > 0 ? 'more humid' : 'drier'}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'much the same';
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
