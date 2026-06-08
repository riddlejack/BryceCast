import { loadApiJson } from './api';
import { historyPoints } from './seed';
import type { SeasonHistoryPayload } from './types';

const fallbackHistory: SeasonHistoryPayload = {
  checkedAt: new Date().toISOString(),
  source: 'seed',
  points: historyPoints,
  bryceStanding: {
    rank: 12,
    points: 124,
    wins: 0,
    top5: 0,
    top10: 3,
    bestFinish: 7
  },
  yearSummaries: [
    { year: 2024, starts: 14, bestFinish: 3, top10s: 8, averageFinish: 11.2 },
    { year: 2025, starts: 14, bestFinish: 5, top10s: 6, averageFinish: 13.0 },
    { year: 2026, starts: 7, bestFinish: 7, top10s: 3, averageFinish: 13.3 }
  ],
  teammateSummaries: []
};

export const loadSeasonHistory = async (): Promise<SeasonHistoryPayload> => {
  const apiHistory = await loadApiJson<SeasonHistoryPayload>('/api/history/bryce');
  if (apiHistory && Array.isArray(apiHistory.points) && apiHistory.points.length > 0) {
    return apiHistory;
  }

  try {
    const response = await fetch('/data/history-bryce.json', {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = (await response.json()) as SeasonHistoryPayload;
    if (!Array.isArray(payload.points) || payload.points.length === 0) {
      throw new Error('history payload has no points');
    }
    return payload;
  } catch {
    return fallbackHistory;
  }
};
