/**
 * Display formatting shared by all pages.
 */
const DATE_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const MONEY_FMT = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** '2026-05-12' or an ISO datetime -> '12 May 2026' (or '—'). */
export function formatDate(value) {
  if (!value) return '—';
  // Plain dates ('YYYY-MM-DD') are parsed as local dates, not UTC midnight.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : DATE_FMT.format(date);
}

/** ISO datetime -> 'just now', '5 min ago', '3 h ago', '2 days ago', then the date. */
export function timeAgo(value) {
  const seconds = (Date.now() - new Date(value).getTime()) / 1000;
  if (Number.isNaN(seconds)) return '';
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  return formatDate(value);
}

/** '20 May 2026 – 31 May 2026' */
export function formatRange(start, end) {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** 18500 -> '₹18,500' */
export function formatMoney(value) {
  return MONEY_FMT.format(Number(value) || 0);
}

/** 'Booked' -> 'badge-booked' (matches the badge colours in style.css) */
export function badgeClass(value) {
  return `badge-soft badge-${String(value || '').toLowerCase()}`;
}
