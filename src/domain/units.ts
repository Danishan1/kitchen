import type { Unit } from './types';

/**
 * Safe unit conversion.
 * Conversions are only performed inside one dimension:
 *   mass:   g, kg
 *   volume: ml, l, tsp (5 ml), tbsp (15 ml), cup (240 ml)
 *   count:  pc, dozen (12 pc)
 * Units like "bunch", "packet" and "pinch" are their own dimension and are never
 * converted. Mass ↔ volume is never converted because density varies by ingredient.
 */
export type Dimension = 'mass' | 'volume' | 'count' | 'bunch' | 'packet' | 'pinch';

const TABLE: Record<Unit, { dim: Dimension; factor: number }> = {
  g: { dim: 'mass', factor: 1 },
  kg: { dim: 'mass', factor: 1000 },
  ml: { dim: 'volume', factor: 1 },
  l: { dim: 'volume', factor: 1000 },
  tsp: { dim: 'volume', factor: 5 },
  tbsp: { dim: 'volume', factor: 15 },
  cup: { dim: 'volume', factor: 240 },
  pc: { dim: 'count', factor: 1 },
  dozen: { dim: 'count', factor: 12 },
  bunch: { dim: 'bunch', factor: 1 },
  packet: { dim: 'packet', factor: 1 },
  pinch: { dim: 'pinch', factor: 1 },
};

export const BASE_UNIT: Record<Dimension, Unit> = {
  mass: 'g',
  volume: 'ml',
  count: 'pc',
  bunch: 'bunch',
  packet: 'packet',
  pinch: 'pinch',
};

export const dimensionOf = (u: Unit): Dimension => TABLE[u]?.dim ?? 'count';
export const isKnownUnit = (u: string): u is Unit => u in TABLE;

export function canConvert(from: Unit, to: Unit): boolean {
  return dimensionOf(from) === dimensionOf(to);
}

/** Convert, or return `null` if the conversion isn't safe. */
export function convert(qty: number, from: Unit, to: Unit): number | null {
  if (from === to) return qty;
  if (!canConvert(from, to)) return null;
  return (qty * TABLE[from].factor) / TABLE[to].factor;
}

export function toBase(qty: number, unit: Unit): { qty: number; unit: Unit } {
  const dim = dimensionOf(unit);
  return { qty: qty * TABLE[unit].factor, unit: BASE_UNIT[dim] };
}

/** Round to a sensible kitchen precision. */
export function roundQty(qty: number, unit: Unit): number {
  if (!isFinite(qty)) return 0;
  if (unit === 'pc' || unit === 'dozen' || unit === 'packet' || unit === 'bunch') {
    // Pieces: round to halves (½ onion is fine), never below 0.5 if > 0.
    const r = Math.round(qty * 2) / 2;
    return qty > 0 && r === 0 ? 0.5 : r;
  }
  if (unit === 'g' || unit === 'ml') return qty >= 100 ? Math.round(qty / 5) * 5 : Math.round(qty);
  if (unit === 'tsp' || unit === 'tbsp' || unit === 'cup' || unit === 'pinch') return Math.round(qty * 4) / 4;
  return Math.round(qty * 100) / 100; // kg, l
}

/**
 * Express a base-unit quantity in the most readable unit
 * (1250 g → 1.25 kg, 30 ml → 2 tbsp, 1500 ml → 1.5 l).
 */
export function humanize(qty: number, unit: Unit): { qty: number; unit: Unit } {
  const dim = dimensionOf(unit);
  const base = toBase(qty, unit);
  if (dim === 'mass') {
    return base.qty >= 1000 ? { qty: roundQty(base.qty / 1000, 'kg'), unit: 'kg' } : { qty: roundQty(base.qty, 'g'), unit: 'g' };
  }
  if (dim === 'volume') {
    if (base.qty >= 1000) return { qty: roundQty(base.qty / 1000, 'l'), unit: 'l' };
    if (base.qty < 15) return { qty: roundQty(base.qty / 5, 'tsp'), unit: 'tsp' };
    if (base.qty < 90 && unit !== 'ml') return { qty: roundQty(base.qty / 15, 'tbsp'), unit: 'tbsp' };
    return { qty: roundQty(base.qty, 'ml'), unit: 'ml' };
  }
  return { qty: roundQty(qty, unit), unit };
}

const FRACTIONS: [number, string][] = [
  [0.25, '¼'],
  [0.5, '½'],
  [0.75, '¾'],
];

/** Display a quantity: 1.5 → "1½", 0.25 → "¼", 2.0 → "2". */
export function formatQty(qty: number): string {
  if (!isFinite(qty)) return '—';
  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 100) / 100;
  const f = FRACTIONS.find(([v]) => Math.abs(v - frac) < 0.01);
  if (f) return `${whole > 0 ? whole : ''}${f[1]}`;
  if (frac === 0) return String(whole);
  return String(Math.round(qty * 100) / 100);
}

export function unitLabel(u: Unit, qty = 1): string {
  switch (u) {
    case 'l':
      return 'litre';
    case 'pc':
      return qty > 1 ? 'pcs' : 'pc';
    case 'bunch':
      return qty > 1 ? 'bunches' : 'bunch';
    case 'packet':
      return qty > 1 ? 'packets' : 'packet';
    case 'pinch':
      return qty > 1 ? 'pinches' : 'pinch';
    default:
      return u;
  }
}

export const formatAmount = (qty: number, unit: Unit) => `${formatQty(qty)} ${unitLabel(unit, qty)}`;

/** Per-ingredient density hints (user-maintained approximations). */
export interface Density {
  pcGrams?: number;
  tspGrams?: number;
}

function toGrams(qty: number, unit: Unit, d: Density): number | null {
  const dim = dimensionOf(unit);
  if (dim === 'mass') return toBase(qty, unit).qty;
  if (dim === 'count' && d.pcGrams) return toBase(qty, unit).qty * d.pcGrams;
  if (dim === 'volume' && d.tspGrams) return (toBase(qty, unit).qty / 5) * d.tspGrams;
  return null;
}

function fromGrams(g: number, unit: Unit, d: Density): number | null {
  const dim = dimensionOf(unit);
  const f = TABLE[unit].factor;
  if (dim === 'mass') return g / f;
  if (dim === 'count' && d.pcGrams) return g / d.pcGrams / f;
  if (dim === 'volume' && d.tspGrams) return ((g / d.tspGrams) * 5) / f;
  return null;
}

/**
 * Ingredient-aware conversion: standard conversion first, then (only if the
 * user has set a density for that ingredient) pieces/spoons ↔ grams.
 */
export function convertFor(qty: number, from: Unit, to: Unit, d?: Density): number | null {
  const std = convert(qty, from, to);
  if (std != null || !d) return std;
  const g = toGrams(qty, from, d);
  return g == null ? null : fromGrams(g, to, d);
}
