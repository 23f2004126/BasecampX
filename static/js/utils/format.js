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
