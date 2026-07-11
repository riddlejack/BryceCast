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

export const trackTypeLabel = (value: unknown): string => {
  const text = (asString(value) ?? '').toLowerCase();
  if (text === 'r' || text === 'road') return 'Road course';
  if (text === 's' || text === 'street') return 'Street circuit';
  if (text === 'o' || text === 'oval') return 'Oval';
  return asString(value) ?? '—';
};
