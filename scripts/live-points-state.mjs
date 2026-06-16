const safeNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asArray = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const hasNumericSourceValue = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

const latestHistoricalStanding = (history = null) => ({
  points: safeNumber(history?.bryceStanding?.points),
  rank: safeNumber(history?.bryceStanding?.rank)
});

export const buildPointsProjectionState = ({ checkedAt, timingRows = [], bryce = null, readinessState, history = null }) => {
  const rows = asArray(timingRows);
  const countField = (field) => rows.filter((row) => hasNumericSourceValue(row?.[field])).length;
  const fieldCoverage = {
    rows: rows.length,
    runningDriverPointsRows: countField('runningDriverPoints'),
    totalDriverPointsRows: countField('totalDriverPoints'),
    totalEntrantPointsRows: countField('totalEntrantPoints')
  };
  const historical = latestHistoricalStanding(history);
  const bryceValues = {
    runningDriverPoints: safeNumber(bryce?.runningDriverPoints),
    totalDriverPoints: safeNumber(bryce?.totalDriverPoints),
    totalEntrantPoints: safeNumber(bryce?.totalEntrantPoints),
    historicalDriverPoints: historical.points,
    historicalRank: historical.rank
  };
  const brycePointFields = ['runningDriverPoints', 'totalDriverPoints', 'totalEntrantPoints'];
  const brycePresentFields = brycePointFields.filter((field) => hasNumericSourceValue(bryce?.[field]));
  const fullPointFieldCoverage =
    rows.length > 0 &&
    fieldCoverage.runningDriverPointsRows === rows.length &&
    fieldCoverage.totalDriverPointsRows === rows.length &&
    fieldCoverage.totalEntrantPointsRows === rows.length;
  const anyLivePointField =
    fieldCoverage.runningDriverPointsRows > 0 || fieldCoverage.totalDriverPointsRows > 0 || fieldCoverage.totalEntrantPointsRows > 0 || brycePresentFields.length > 0;
  const hasHistory = historical.points !== null || historical.rank !== null;
  const livePointEligible = ['ready', 'degraded'].includes(readinessState);

  let mode = 'unavailable';
  let source = 'none';
  let label = 'Live points unavailable';
  const warnings = [];

  if (readinessState === 'stale') {
    mode = 'stale';
    source = anyLivePointField ? 'archive' : hasHistory ? 'history_compact' : 'none';
    label = anyLivePointField ? 'Stale Race Control points' : hasHistory ? 'Historical points baseline' : 'Points unavailable';
    warnings.push('Live timing is stale; points must not be treated as current.');
  } else if (readinessState === 'wrong_series') {
    mode = hasHistory ? 'historical_fallback' : 'unavailable';
    source = hasHistory ? 'history_compact' : 'none';
    label = hasHistory ? 'Historical points baseline' : 'Points unavailable';
    warnings.push('Active Race Control feed is not Bryce INDY NXT; live points are blocked.');
  } else if (!livePointEligible) {
    mode = hasHistory ? 'historical_fallback' : 'unavailable';
    source = hasHistory ? 'history_compact' : 'none';
    label = hasHistory ? 'Historical points baseline' : 'Points unavailable';
    warnings.push(`Live Race Control points are unavailable while readiness is ${readinessState ?? 'unknown'}.`);
  } else if (brycePresentFields.length === brycePointFields.length && fullPointFieldCoverage) {
    mode = 'race_control_live';
    source = 'race_control_timing';
    label = 'Race Control running points';
  } else if (anyLivePointField) {
    mode = 'partial';
    source = 'race_control_timing';
    label = hasHistory ? 'Partial Race Control points with historical baseline' : 'Partial Race Control points';
    warnings.push('Race Control points fields are only partially populated.');
  } else if (hasHistory) {
    mode = 'historical_fallback';
    source = 'history_compact';
    label = 'Historical points baseline';
    warnings.push('Race Control live points fields are unavailable.');
  }

  return {
    schemaVersion: 'live-points.v1',
    checkedAt,
    mode,
    source,
    label,
    bryce: bryceValues,
    fieldCoverage,
    officialModelAvailable: false,
    reconciliationRequired: mode === 'race_control_live' || mode === 'partial',
    warnings
  };
};
