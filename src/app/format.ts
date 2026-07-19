/** Null-safe formatting utilities. Missing values stay visibly unavailable —
 *  never coerced to zero, per the live data contract. */

export const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const asNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** "P4" or em-dash when unavailable. */
export const formatPosition = (value: unknown): string => {
  const position = asNumber(value);
  return position === null ? '—' : `P${position}`;
};

export const ordinal = (value: number): string => {
  const rem10 = value % 10;
  const rem100 = value % 100;
  if (rem10 === 1 && rem100 !== 11) return `${value}st`;
  if (rem10 === 2 && rem100 !== 12) return `${value}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${value}rd`;
  return `${value}th`;
};

/** Signed position delta framed by racing convention: positive = gained. */
export const formatGain = (value: unknown): { text: string; direction: 'up' | 'down' | 'flat' } | null => {
  const gain = asNumber(value);
  if (gain === null) return null;
  if (gain > 0) return { text: `▲ ${gain}`, direction: 'up' };
  if (gain < 0) return { text: `▽ ${Math.abs(gain)}`, direction: 'down' };
  return { text: '· even', direction: 'flat' };
};

export const formatNumber = (value: unknown, digits = 1): string => {
  const parsed = asNumber(value);
  if (parsed === null) return '—';
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(digits);
};

export const formatPct = (value: unknown, digits = 0): string => {
  const parsed = asNumber(value);
  return parsed === null ? '—' : `${parsed.toFixed(digits)}%`;
};

/** Finish percentile (0..1, higher = better field share beaten) as friendly text. */
export const formatPercentile = (value: unknown): string => {
  const parsed = asNumber(value);
  if (parsed === null) return '—';
  const pct = Math.round(parsed * 100);
  return `${ordinal(pct)} pctile`;
};

export const formatGap = (value: unknown): string => {
  const text = asString(value);
  if (text === null) return '—';
  return text.startsWith('-') || text.startsWith('+') ? text : `+${text}`;
};

export const formatLapTime = (value: unknown): string => asString(value) ?? '—';

export const formatClock = (iso: unknown, timezone?: string): string => {
  const text = asString(iso);
  if (!text) return '—';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
};

export const formatDate = (iso: unknown, options?: Intl.DateTimeFormatOptions): string => {
  const text = asString(iso);
  if (!text) return '—';
  const date = new Date(text.includes('T') ? text : `${text}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', options ?? { month: 'long', day: 'numeric' });
};

export const formatAge = (seconds: unknown): string => {
  const parsed = asNumber(seconds);
  if (parsed === null) return '—';
  if (parsed < 60) return `${Math.round(parsed)}s ago`;
  if (parsed < 3600) return `${Math.round(parsed / 60)}m ago`;
  if (parsed < 86400) return `${Math.round(parsed / 3600)}h ago`;
  return `${Math.round(parsed / 86400)}d ago`;
};

export const formatCountdown = (msRemaining: number): string => {
  if (msRemaining <= 0) return 'now';
  const totalSeconds = Math.floor(msRemaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
};

/** "Mid-Ohio Sports Car Course" → "Mid-Ohio" for compact captions. */
export const shortVenue = (value: unknown): string => {
  const text = asString(value);
  if (!text) return '—';
  return text.replace(/\s+(Sports Car Course|Motorsports Park|International Raceway|International Race Complex|Superspeedway|Raceway|Circuit|Mile)$/i, '');
};

/** 16-point compass label for a bearing in degrees (0 = N, 90 = E). Null when
 *  no direction is sourced — never a guessed cardinal. */
const CARDINALS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export const windCardinal = (value: unknown): string | null => {
  const deg = asNumber(value);
  if (deg === null) return null;
  return CARDINALS_16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
};

/** House wind grammar, in one place so every surface agrees. Speed leads, then
 *  the uppercase cardinal ("7 mph NNE"); the cardinal drops when no direction is
 *  sourced ("7 mph"). Zero wind renders "calm" with NO direction — a bearing for
 *  still air is meaningless, and rendering "from the N" at 0 mph was a bug. */
export const formatWind = (mph: number | null, cardinal: string | null): string => {
  if (mph === null) return '—';
  if (mph <= 0) return 'calm';
  return cardinal ? `${mph} mph ${cardinal}` : `${mph} mph`;
};

/** Compass-point center bearing for a 16-point cardinal label ("WNW" → 292.5).
 *  NWS forecasts quantize direction to these points, so the center bearing is
 *  the faithful numeric reading — null for anything unrecognized. */
export const cardinalToDeg = (value: unknown): number | null => {
  const text = asString(value);
  if (!text) return null;
  const index = CARDINALS_16.indexOf(text.toUpperCase());
  return index === -1 ? null : index * 22.5;
};

export const trackTypeLabel = (value: unknown): string => {
  const text = (asString(value) ?? '').toLowerCase();
  if (text === 'r' || text === 'road') return 'Road course';
  if (text === 's' || text === 'street') return 'Street circuit';
  if (text === 'o' || text === 'oval') return 'Oval';
  return asString(value) ?? '—';
};
