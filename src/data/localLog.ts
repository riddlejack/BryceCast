import type { BryceReplayPayload, OnboardCatalogSnapshot, RaceLogSnapshot } from './types';
import { loadApiJson } from './api';

export const loadRaceLogSnapshot = async (): Promise<RaceLogSnapshot | null> => {
  const apiSnapshot = await loadApiJson<RaceLogSnapshot>('/api/race-log/latest');
  if (apiSnapshot) return apiSnapshot;

  try {
    const response = await fetch(`/data/live-snapshot.json?t=${Date.now()}`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as RaceLogSnapshot;
  } catch {
    return null;
  }
};

export const loadOnboardCatalogSnapshot = async (): Promise<OnboardCatalogSnapshot | null> => {
  const apiSnapshot = await loadApiJson<OnboardCatalogSnapshot>('/api/onboard-catalog');
  if (apiSnapshot) return apiSnapshot;

  try {
    const response = await fetch(`/data/onboard-catalog.json?t=${Date.now()}`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as OnboardCatalogSnapshot;
  } catch {
    return null;
  }
};

export const loadBryceReplay = async (limit = 250): Promise<BryceReplayPayload | null> => {
  const apiReplay = await loadApiJson<BryceReplayPayload>(`/api/replay/bryce?limit=${limit}`);
  if (apiReplay) return apiReplay;
  return null;
};
