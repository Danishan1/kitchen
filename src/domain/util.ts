import type { ID } from './types';

export function uid(prefix = ''): ID {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${prefix ? '_' : ''}${Date.now().toString(36)}${rand}`;
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });

/** ₹1,23,456 — Indian digit grouping. */
export function formatINR(n: number | undefined | null, precise = false): string {
  if (n == null || !isFinite(n)) return '—';
  return (precise ? inr2 : inr).format(n);
}

export const nowISO = () => new Date().toISOString();

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function sum(nums: (number | undefined)[]): number {
  return nums.reduce<number>((a, b) => a + (b ?? 0), 0);
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function slugify(s: string): string {
  return normalizeName(s).replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function downloadFile(filename: string, content: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
