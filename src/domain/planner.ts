import type { AppData, Diet, ID, ISODate, MealEntry, MealSlot, Recipe } from './types';
import { addDays, daysInRange, diffDays } from './dates';
import { totalTime } from './recipes';
import { aggregateRequirements, deductPantryForMeal, pantryStock, restorePantryForMeal } from './grocery';
import { uid } from './util';
import { MEAL_SLOTS } from './constants';

export const slotOrder = (s: MealSlot) => MEAL_SLOTS.findIndex((x) => x.id === s);

export function mealsOn(d: Pick<AppData, 'meals'>, date: ISODate): MealEntry[] {
  return d.meals.filter((m) => m.date === date).sort((a, b) => slotOrder(a.slot) - slotOrder(b.slot));
}

export function mealsInRange(d: Pick<AppData, 'meals'>, from: ISODate, to: ISODate): MealEntry[] {
  return d.meals.filter((m) => m.date >= from && m.date <= to);
}

export function mealDiet(meal: MealEntry, recipes: Map<ID, Recipe>): Diet {
  let diet: Diet = 'veg';
  for (const dish of meal.dishes) {
    const r = recipes.get(dish.recipeId);
    if (r?.diet === 'nonveg') return 'nonveg';
    if (r?.diet === 'egg') diet = 'egg';
  }
  return diet;
}

/**
 * Estimated hands-on time for a meal: the longest dish plus 40 % of the others
 * (dishes are usually cooked in parallel). Always presented as an estimate.
 */
export function mealTime(meal: MealEntry, recipes: Map<ID, Recipe>): number {
  if (meal.isLeftover || meal.status === 'skipped') return meal.isLeftover ? 10 : 0;
  const times = meal.dishes.map((x) => recipes.get(x.recipeId)).filter(Boolean).map((r) => totalTime(r!));
  if (!times.length) return 0;
  times.sort((a, b) => b - a);
  return Math.round(times[0] + times.slice(1).reduce((a, b) => a + b * 0.4, 0));
}

/**
 * Estimated cooking time for a whole day. A dish cooked once for several meals
 * (e.g. aloo paratha for breakfast AND packed lunch) is only counted once.
 */
export function dayMinutes(meals: MealEntry[], recipes: Map<ID, Recipe>): number {
  const seen = new Set<ID>();
  let total = 0;
  for (const m of meals) {
    const fresh = m.dishes.filter((x) => !seen.has(x.recipeId));
    m.dishes.forEach((x) => seen.add(x.recipeId));
    if (!fresh.length && m.dishes.length && !m.isLeftover) continue;
    total += mealTime({ ...m, dishes: fresh }, recipes);
  }
  return total;
}

export function mealName(meal: MealEntry, recipes: Map<ID, Recipe>): string {
  if (meal.title && !meal.dishes.length) return meal.title;
  const names = meal.dishes.map((x) => recipes.get(x.recipeId)?.name).filter(Boolean) as string[];
  const base = names.length ? names.join(' + ') : meal.title || 'Untitled meal';
  return meal.title && names.length ? `${meal.title} (${base})` : base;
}

const DIET_RANK: Record<Diet | 'none', number> = { none: 0, veg: 1, egg: 2, nonveg: 3 };

export interface DaySummary {
  date: ISODate;
  meals: number;
  minutes: number;
  diet: Diet | 'none';
  prepared: number;
}

export interface WeekSummary {
  days: DaySummary[];
  totalMin: number;
  planned: number;
  prepared: number;
  skipped: number;
  vegDays: number;
  nonVegDays: number;
  completionPct: number;
  repeats: { name: string; count: number }[];
  busiestDay?: DaySummary;
}

export function summarizeRange(d: Pick<AppData, 'meals' | 'recipes'>, from: ISODate, to: ISODate): WeekSummary {
  const recipes = new Map(d.recipes.map((r) => [r.id, r]));
  const days: DaySummary[] = [];
  let totalMin = 0, planned = 0, prepared = 0, skipped = 0, vegDays = 0, nonVegDays = 0;
  const counts = new Map<string, number>();
  for (const date of daysInRange(from, to)) {
    const ms = mealsOn(d, date);
    let minutes = 0, diet: Diet | 'none' = 'none', prep = 0;
    minutes = dayMinutes(ms, recipes);
    const countedToday = new Set<string>();
    for (const m of ms) {
      if (m.status === 'prepared') prep++;
      if (m.status === 'skipped') skipped++;
      const md = mealDiet(m, recipes);
      if (m.dishes.length) diet = DIET_RANK[md] > DIET_RANK[diet] ? md : diet;
      if (!m.isLeftover && m.status !== 'skipped')
        for (const x of m.dishes) {
          const r = recipes.get(x.recipeId);
          // Staples, drinks and simple sides are expected to repeat; count a dish once per day.
          if (!r || r.category === 'bread' || r.category === 'beverage' || r.tags.includes('staple') || r.tags.includes('raita') || countedToday.has(r.id)) continue;
          countedToday.add(r.id);
          counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
        }
    }
    planned += ms.filter((m) => m.status !== 'skipped').length;
    prepared += prep;
    totalMin += minutes;
    if (diet === 'nonveg') nonVegDays++;
    else if (diet === 'veg' || diet === 'egg') vegDays++;
    days.push({ date, meals: ms.length, minutes, diet, prepared: prep });
  }
  const repeats = [...counts.entries()].filter(([, c]) => c > 1).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  const busiestDay = [...days].sort((a, b) => b.minutes - a.minutes)[0];
  return {
    days, totalMin, planned, prepared, skipped, vegDays, nonVegDays, repeats,
    completionPct: planned ? Math.round((prepared / planned) * 100) : 0,
    busiestDay: busiestDay?.minutes ? busiestDay : undefined,
  };
}

/* ---------- editing helpers (operate on a draft) ---------- */

export function duplicateMeal(d: AppData, mealId: ID, toDate?: ISODate, toSlot?: MealSlot): MealEntry | undefined {
  const m = d.meals.find((x) => x.id === mealId);
  if (!m) return;
  const copy: MealEntry = { ...structuredClone(m), id: uid('ml'), date: toDate ?? m.date, slot: toSlot ?? m.slot, status: 'planned', pantryDeducted: false, replacedWith: undefined };
  d.meals.push(copy);
  return copy;
}

export function moveMeal(d: AppData, mealId: ID, toDate: ISODate, toSlot?: MealSlot) {
  const m = d.meals.find((x) => x.id === mealId);
  if (!m) return;
  m.date = toDate;
  if (toSlot) m.slot = toSlot;
}

/** Copy all meals of one day onto another. `replace` clears the target day first. */
export function copyDay(d: AppData, from: ISODate, to: ISODate, replace = false): number {
  if (from === to) return 0;
  if (replace) d.meals = d.meals.filter((m) => m.date !== to);
  const src = d.meals.filter((m) => m.date === from);
  for (const m of src) duplicateMeal(d, m.id, to);
  return src.length;
}

/** Copy a 7-day block starting at `fromStart` onto `toStart`. */
export function copyWeek(d: AppData, fromStart: ISODate, toStart: ISODate, replace = false): number {
  let n = 0;
  for (let i = 0; i < 7; i++) n += copyDay(d, addDays(fromStart, i), addDays(toStart, i), replace);
  return n;
}

/* ---------- suggestions ---------- */

export interface Suggestion {
  recipe: Recipe;
  score: number;
  reasons: string[];
}

const SLOT_CATEGORIES: Record<MealSlot, string[]> = {
  breakfast: ['breakfast', 'bread'],
  packed: ['fast-food', 'lunch', 'breakfast', 'dinner'],
  lunch: ['lunch', 'side', 'dinner'],
  snacks: ['snack', 'beverage', 'fast-food'],
  dinner: ['dinner', 'side', 'lunch', 'fast-food'],
};

/**
 * Suggest recipes for a slot. Scores fit for the slot, ingredient availability
 * in the pantry (known stock only), freshness (avoid repeats), favourites, and
 * the veg/non-veg balance of the week vs. the household target.
 */
export function suggestRecipes(d: AppData, date: ISODate, slot: MealSlot, limit = 6): Suggestion[] {
  const recipes = new Map(d.recipes.map((r) => [r.id, r]));
  const avoid = d.settings.avoidRepeatDays || 0;
  const weekStart = addDays(date, -3);
  const weekEnd = addDays(date, 3);
  const week = summarizeRange(d, weekStart, weekEnd);
  const wantNonVeg = week.nonVegDays < d.settings.nonVegDaysTarget;
  const dayDiet = mealsOn(d, date).map((m) => mealDiet(m, recipes));

  const recentUse = new Map<ID, number>();
  for (const m of d.meals) {
    if (m.status === 'skipped') continue;
    const gap = Math.abs(diffDays(m.date, date));
    for (const x of m.dishes) recentUse.set(x.recipeId, Math.min(recentUse.get(x.recipeId) ?? 999, gap));
  }

  const out: Suggestion[] = [];
  for (const r of d.recipes) {
    const reasons: string[] = [];
    let score = 0;
    const cats = SLOT_CATEGORIES[slot];
    const ci = cats.indexOf(r.category);
    if (ci === -1) continue;
    score += 30 - ci * 6;

    // Pantry coverage (known stock only)
    const reqs = aggregateRequirements(d, [{ id: 'tmp', date, slot, dishes: [{ recipeId: r.id, servings: r.servings }], people: r.servings, status: 'planned' }]);
    if (reqs.length) {
      const ingMap = new Map(d.ingredients.map((i) => [i.id, i]));
      const covered = reqs.filter((q) => {
        const s = pantryStock(d.pantry, q.ingredientId, q.dim, ingMap.get(q.ingredientId));
        return !s.unknown && s.known >= q.baseQty;
      }).length;
      const pct = covered / reqs.length;
      score += pct * 30;
      if (pct >= 0.6) reasons.push(`${Math.round(pct * 100)}% of ingredients in stock`);
    }

    const gap = recentUse.get(r.id);
    if (gap !== undefined && gap <= avoid) {
      score -= 40;
      reasons.push(gap === 0 ? 'already planned that day' : `planned ${gap} day(s) away`);
    } else if (gap === undefined || gap > 7) {
      score += 8;
      if (r.timesCooked === 0) reasons.push('not tried yet');
    }

    if (r.favourite) {
      score += 10;
      reasons.push('favourite');
    }
    if (r.diet === 'nonveg' && wantNonVeg && !dayDiet.includes('nonveg')) {
      score += 10;
      reasons.push('balances non-veg days');
    } else if (r.diet === 'veg' && !wantNonVeg) {
      score += 6;
      reasons.push('balances veg days');
    }
    if (d.settings.halalOnly && r.diet === 'nonveg' && !r.halalNotes) score -= 5;
    if ((slot === 'breakfast' || slot === 'packed') && totalTime(r) <= 30) {
      score += 8;
      reasons.push('quick for a morning');
    }
    out.push({ recipe: r, score, reasons });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function newMeal(date: ISODate, slot: MealSlot, people: number): MealEntry {
  return { id: uid('ml'), date, slot, dishes: [], people, status: 'planned' };
}

/**
 * Change a meal's status. When the user enabled "auto-reduce pantry", marking a
 * meal prepared deducts its ingredients once; un-marking restores them.
 */
export function setMealStatus(d: AppData, mealId: ID, status: MealEntry['status'], replacedWith?: string) {
  const m = d.meals.find((x) => x.id === mealId);
  if (!m) return;
  const wasPrepared = m.status === 'prepared';
  m.status = status;
  m.replacedWith = status === 'replaced' ? replacedWith ?? m.replacedWith : undefined;
  if (status === 'prepared' && !wasPrepared) {
    if (d.settings.autoDeductPantry) deductPantryForMeal(d, m.id);
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (const x of m.dishes) {
      const r = d.recipes.find((rr) => rr.id === x.recipeId);
      if (r && !m.isLeftover) {
        r.timesCooked = (r.timesCooked || 0) + 1;
        if (!r.lastCooked || r.lastCooked < m.date) r.lastCooked = m.date <= iso ? m.date : iso;
      }
    }
  }
  if (wasPrepared && status !== 'prepared') {
    if (m.pantryDeducted) restorePantryForMeal(d, m.id);
    for (const x of m.dishes) {
      const r = d.recipes.find((rr) => rr.id === x.recipeId);
      if (r && !m.isLeftover && r.timesCooked > 0) r.timesCooked -= 1;
    }
  }
}
