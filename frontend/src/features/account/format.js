// Backend trả LocalDateTime theo UTC, không kèm múi giờ ("2026-10-12T09:42:18").
export function parseUtc(value) {
  if (!value) return null;
  const text = String(value);
  return new Date(/([zZ]|[+-]\d\d:?\d\d)$/.test(text) ? text : `${text}Z`);
}

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

export const formatDate = (value) =>
  parseUtc(value)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) ?? '—';

export const formatMonthYear = (value) => parseUtc(value)?.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) ?? '—';

export const formatLogDate = (value) =>
  parseUtc(value)?.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) ?? '—';

export const formatTime = (value) =>
  parseUtc(value)?.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) ?? '';

export function formatToday(date = new Date()) {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'long' });
  const rest = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `${weekday}, ${rest}`;
}

// Múi giờ của người xem: số phút lệch về phía đông UTC (Việt Nam = 420)
export const tzOffsetMinutes = () => -new Date().getTimezoneOffset();

export function tzLabel() {
  const minutes = tzOffsetMinutes();
  const sign = minutes >= 0 ? '+' : '-';
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

export const toYmd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const humanize = (code = '') => {
  const text = code.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};