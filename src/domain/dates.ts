import type { ISODate } from './types';

/**
 * Dates are stored as local calendar dates (`YYYY-MM-DD`). We never use
 * `toISOString()` for these because in India (UTC+5:30) midnight local time is
 * the previous day in UTC.
 */
export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const today = (): ISODate => toISODate(new Date());

export function addDays(date: ISODate, n: number): ISODate {
  const d = parseISODate(date);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(a).getTime() - parseISODate(b).getTime();
  return Math.round(ms / 86400000);
}

/** Start of the week containing `date`. weekStartsOn: 1 = Monday (default in India), 0 = Sunday. */
export function startOfWeek(date: ISODate, weekStartsOn: 0 | 1 = 1): ISODate {
  const d = parseISODate(date);
  const dow = d.getDay();
  const delta = (dow - weekStartsOn + 7) % 7;
  return addDays(date, -delta);
}

export function startOfMonth(date: ISODate): ISODate {
  return date.slice(0, 8) + '01';
}

export function endOfMonth(date: ISODate): ISODate {
  const d = parseISODate(date);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

export function daysInRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export const isInRange = (d: ISODate, from: ISODate, to: ISODate) => d >= from && d <= to;

const LOCALE = 'en-IN';

export function formatDate(date: ISODate | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }): string {
  if (!date) return '—';
  return parseISODate(date).toLocaleDateString(LOCALE, opts);
}

export const formatDay = (date: ISODate) => formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' });
export const formatLongDay = (date: ISODate) =>
  formatDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const weekdayName = (date: ISODate) => formatDate(date, { weekday: 'long' });

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function relativeDays(date: ISODate, ref: ISODate = today()): string {
  const n = diffDays(date, ref);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function formatMinutes(min: number): string {
  if (!isFinite(min) || min <= 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(r).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Local calendar date of a full ISO timestamp (avoids the UTC date shift). */
export const localDateOf = (iso: string): ISODate => toISODate(new Date(iso));
