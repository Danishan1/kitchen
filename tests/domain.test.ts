import { describe, expect, it } from 'vitest';
import { createSeedData } from '../src/data/seed';
import { convert, convertFor, formatQty, humanize } from '../src/domain/units';
import { estimateRecipeCost, filterRecipes, missingEquipment, scaleRecipe } from '../src/domain/recipes';
import {
  addPurchaseToPantry, aggregateRequirements, createList, deductPantryForMeal, generatePlanItems, listTotals,
  markPurchased, pantryStock, recordListExpenses, restorePantryForMeal, unmarkPurchased, addManualItem,
} from '../src/domain/grocery';
import { monthSummary, weekSummary, expensesCsv, averageWeekly } from '../src/domain/budget';
import { copyDay, copyWeek, summarizeRange, suggestRecipes, moveMeal } from '../src/domain/planner';
import { parseImport, exportEnvelope, ImportError, migrate } from '../src/domain/schema';
import { addDays, startOfWeek, toISODate, parseISODate } from '../src/domain/dates';
import { toCsv } from '../src/domain/csv';
import type { AppData, MealEntry } from '../src/domain/types';

const REF = '2026-10-28'; // a Wednesday
const fresh = (): AppData => createSeedData(REF);
const meal = (over: Partial<MealEntry>): MealEntry => ({ id: 'm' + Math.random(), date: REF, slot: 'lunch', dishes: [], people: 5, status: 'planned', ...over });

describe('units', () => {
  it('converts only within a dimension', () => {
    expect(convert(1.5, 'kg', 'g')).toBe(1500);
    expect(convert(3, 'tsp', 'tbsp')).toBe(1);
    expect(convert(1, 'kg', 'ml')).toBeNull();
    expect(convert(1, 'bunch', 'g')).toBeNull();
  });
  it('uses ingredient density only when provided', () => {
    expect(convertFor(2, 'pc', 'kg', { pcGrams: 150 })).toBeCloseTo(0.3);
    expect(convertFor(2, 'pc', 'kg')).toBeNull();
  });
  it('humanizes and formats', () => {
    expect(humanize(1250, 'g')).toEqual({ qty: 1.25, unit: 'kg' });
    expect(humanize(10, 'ml')).toEqual({ qty: 2, unit: 'tsp' });
    expect(formatQty(1.5)).toBe('1½');
    expect(formatQty(0.25)).toBe('¼');
  });
});

describe('dates (India-safe)', () => {
  it('does not shift local dates', () => {
    expect(toISODate(parseISODate('2026-03-01'))).toBe('2026-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(startOfWeek('2026-10-28', 1)).toBe('2026-10-26');
  });
});

describe('recipes', () => {
  it('seed recipes are complete', () => {
    const d = fresh();
    expect(d.recipes.length).toBeGreaterThanOrEqual(18);
    const ids = new Set(d.ingredients.map((i) => i.id));
    for (const r of d.recipes) {
      expect(r.steps.length, r.name).toBeGreaterThan(1);
      for (const ri of r.ingredients) expect(ids.has(ri.ingredientId), `${r.name}: ${ri.ingredientId}`).toBe(true);
      for (const e of r.equipmentIds) expect(d.equipment.some((x) => x.id === e), `${r.name}: ${e}`).toBe(true);
    }
  });

  it('scales ingredients by servings', () => {
    const d = fresh();
    const dal = d.recipes.find((r) => r.id === 'moong-dal')!;
    const at10 = scaleRecipe(dal, 10, d.ingredients);
    expect(at10.find((s) => s.ri.ingredientId === 'moong-dal')!.qty).toBe(500);
    const at2 = scaleRecipe(dal, 2, d.ingredients);
    expect(at2.find((s) => s.ri.ingredientId === 'moong-dal')!.qty).toBe(100);
    // tiny amounts never scale to zero
    expect(at2.find((s) => s.ri.ingredientId === 'hing')!.qty).toBeGreaterThan(0);
  });

  it('estimates cost from user prices', () => {
    const d = fresh();
    const rice = d.recipes.find((r) => r.id === 'plain-rice')!;
    const c = estimateRecipeCost(rice, 5, d.ingredients);
    expect(c.total).toBeCloseTo(35, 0); // 500 g at ₹70/kg
  });

  it('searches by ingredient and filters', () => {
    const d = fresh();
    const r = filterRecipes(d, { q: 'bhindi' });
    expect(r.some((x) => x.id === 'bhindi')).toBe(true);
    expect(filterRecipes(d, { q: 'chicken' }).every((x) => x.diet === 'nonveg')).toBe(true);
    expect(filterRecipes(d, { diet: 'veg', maxTime: 30 }).every((x) => x.diet === 'veg' && x.prepMin + x.cookMin <= 30)).toBe(true);
  });

  it('warns about unavailable equipment', () => {
    const d = fresh();
    const rice = d.recipes.find((r) => r.id === 'moong-dal')!;
    expect(missingEquipment(rice, d.equipment)).toHaveLength(0);
    d.equipment.find((e) => e.id === 'pressure-cooker')!.status = 'damaged';
    expect(missingEquipment(rice, d.equipment)[0].reason).toBe('damaged');
  });
});

describe('grocery generation', () => {
  it('aggregates and merges across meals with unit conversion', () => {
    const d = fresh();
    const meals = [
      meal({ dishes: [{ recipeId: 'plain-rice', servings: 5 }] }),
      meal({ dishes: [{ recipeId: 'veg-khichdi', servings: 5 }] }),
    ];
    const reqs = aggregateRequirements(d, meals);
    const rice = reqs.filter((r) => r.ingredientId === 'rice');
    expect(rice).toHaveLength(1);
    expect(rice[0].baseQty).toBe(750); // 500 + 250 g
    // onions (pc in recipes) converted to the buy unit (kg) via density
    const onion = reqs.find((r) => r.ingredientId === 'onion')!;
    expect(onion.dim).toBe('mass');
  });

  it('skips prepared, skipped and leftover meals', () => {
    const d = fresh();
    const reqs = aggregateRequirements(d, [
      meal({ status: 'prepared', dishes: [{ recipeId: 'plain-rice', servings: 5 }] }),
      meal({ status: 'skipped', dishes: [{ recipeId: 'plain-rice', servings: 5 }] }),
      meal({ isLeftover: true, dishes: [{ recipeId: 'plain-rice', servings: 5 }] }),
    ]);
    expect(reqs).toHaveLength(0);
  });

  it('subtracts known pantry stock but never unknown stock', () => {
    const d = fresh();
    // seed pantry has rice with UNKNOWN quantity
    expect(pantryStock(d.pantry, 'rice', 'mass').unknown).toBe(true);
    const list = createList(d, { name: 'Test' });
    const meals = [meal({ dishes: [{ recipeId: 'plain-rice', servings: 5 }] })];
    generatePlanItems(d, list.id, meals);
    const riceItem = d.groceryItems.find((i) => i.ingredientId === 'rice')!;
    expect(riceItem.qty).toBe(500);
    expect(riceItem.pantryUnknown).toBe(true);

    // Now record 300 g known
    d.pantry.find((p) => p.ingredientId === 'rice')!.qty = 0.3;
    generatePlanItems(d, list.id, meals);
    const again = d.groceryItems.filter((i) => i.ingredientId === 'rice');
    expect(again).toHaveLength(1);
    expect(again[0].qty).toBe(200);
    expect(again[0].pantryOffset).toBe(300);
  });

  it('never double-counts stock or purchases when regenerated', () => {
    const d = fresh();
    d.pantry.find((p) => p.ingredientId === 'rice')!.qty = 0; // known: none
    const list = createList(d, { name: 'Week' });
    const meals = [meal({ dishes: [{ recipeId: 'plain-rice', servings: 10 }] })]; // 1 kg
    generatePlanItems(d, list.id, meals);
    const item = d.groceryItems.find((i) => i.ingredientId === 'rice')!;
    expect(item.qty).toBe(1);
    expect(item.unit).toBe('kg');

    markPurchased(d, item.id, { qty: 1, unit: 'kg', price: 70, vendor: 'Kirana' });
    expect(addPurchaseToPantry(d, item.id).ok).toBe(true);
    expect(addPurchaseToPantry(d, item.id).ok).toBe(false); // idempotent
    expect(d.pantry.find((p) => p.ingredientId === 'rice')!.qty).toBe(1);

    // Regenerate: no new rice item, purchased item kept, pantry untouched
    generatePlanItems(d, list.id, meals);
    generatePlanItems(d, list.id, meals);
    const riceItems = d.groceryItems.filter((i) => i.listId === list.id && i.ingredientId === 'rice');
    expect(riceItems).toHaveLength(1);
    expect(riceItems[0].purchased).toBe(true);
    expect(d.pantry.find((p) => p.ingredientId === 'rice')!.qty).toBe(1);

    // Undo purchase reverses stock exactly
    expect(unmarkPurchased(d, item.id).ok).toBe(true);
    expect(d.pantry.find((p) => p.ingredientId === 'rice')!.qty).toBe(0);
  });

  it('keeps manual items and counts them against requirements', () => {
    const d = fresh();
    const list = createList(d, { name: 'Manual' });
    addManualItem(d, list.id, { ingredientId: 'rice', name: 'Rice', category: 'rice', qty: 300, unit: 'g' });
    generatePlanItems(d, list.id, [meal({ dishes: [{ recipeId: 'plain-rice', servings: 5 }] })]);
    const rice = d.groceryItems.filter((i) => i.listId === list.id && i.ingredientId === 'rice');
    expect(rice).toHaveLength(2);
    expect(rice.find((i) => i.source === 'plan')!.qty).toBe(200);
  });

  it('records expenses once, grouped by category', () => {
    const d = fresh();
    const list = createList(d, { name: 'Shop' });
    const a = addManualItem(d, list.id, { ingredientId: 'chicken', name: 'Chicken', category: 'meat-eggs-fish', qty: 1, unit: 'kg' });
    const b = addManualItem(d, list.id, { ingredientId: 'onion', name: 'Onion', category: 'vegetables', qty: 1, unit: 'kg' });
    markPurchased(d, a.id, { price: 250, date: REF });
    markPurchased(d, b.id, { price: 40, date: REF });
    const r1 = recordListExpenses(d, list.id);
    expect(r1.created).toBe(2);
    expect(r1.total).toBe(290);
    const r2 = recordListExpenses(d, list.id);
    expect(r2.created).toBe(0);
    expect(d.expenses).toHaveLength(2);
    expect(unmarkPurchased(d, a.id).ok).toBe(false); // protected once expensed
    const t = listTotals(d.groceryItems.filter((i) => i.listId === list.id));
    expect(t.actual).toBe(290);
  });

  it('deducts pantry for a prepared meal only once and can restore', () => {
    const d = fresh();
    d.pantry.find((p) => p.ingredientId === 'rice')!.qty = 2; // kg
    const m = meal({ dishes: [{ recipeId: 'plain-rice', servings: 5 }] });
    d.meals.push(m);
    deductPantryForMeal(d, m.id);
    deductPantryForMeal(d, m.id);
    expect(d.pantry.find((p) => p.ingredientId === 'rice')!.qty).toBe(1.5);
    restorePantryForMeal(d, m.id);
    expect(d.pantry.find((p) => p.ingredientId === 'rice')!.qty).toBe(2);
  });
});

describe('budget', () => {
  it('updates weekly and monthly summaries', () => {
    const d = fresh();
    d.settings.weeklyBudget = 3000;
    d.settings.monthlyBudget = 12000;
    d.expenses.push(
      { id: 'e1', date: REF, amount: 2500, category: 'groceries', source: 'manual', createdAt: '' },
      { id: 'e2', date: '2026-10-05', amount: 1000, category: 'meat-poultry', source: 'manual', createdAt: '' },
    );
    const w = weekSummary(d, REF);
    expect(w.spent).toBe(2500);
    expect(w.remaining).toBe(500);
    expect(w.level).toBe('warn'); // 83 % ≥ 80 %
    const m = monthSummary(d, REF);
    expect(m.spent).toBe(3500);
    expect(m.level).toBe('ok');
    expect(averageWeekly(d, REF).weeksWithData).toBe(2);
    expect(expensesCsv(d.expenses)).toContain('Meat & poultry');
  });
  it('reports "none" when no budget set', () => {
    expect(weekSummary(fresh(), REF).level).toBe('none');
  });
});

describe('planner', () => {
  it('seeds a balanced week', () => {
    const d = fresh();
    const s = summarizeRange(d, startOfWeek(REF), addDays(startOfWeek(REF), 6));
    expect(s.nonVegDays).toBeGreaterThanOrEqual(3);
    expect(s.nonVegDays).toBeLessThanOrEqual(5);
    expect(s.planned).toBeGreaterThan(25);
  });
  it('copies days and weeks, moves meals', () => {
    const d = fresh();
    const start = startOfWeek(REF);
    const n = copyDay(d, start, addDays(start, 14));
    expect(n).toBeGreaterThan(0);
    expect(d.meals.filter((m) => m.date === addDays(start, 14))).toHaveLength(n);
    const w = copyWeek(d, start, addDays(start, 7));
    expect(w).toBeGreaterThan(25);
    const m = d.meals[0];
    moveMeal(d, m.id, '2027-01-01', 'dinner');
    expect(d.meals[0].date).toBe('2027-01-01');
  });
  it('suggests recipes for a slot', () => {
    const d = fresh();
    const s = suggestRecipes(d, REF, 'breakfast');
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((x) => ['breakfast', 'bread'].includes(x.recipe.category))).toBe(true);
  });
});

describe('import/export', () => {
  it('round-trips JSON exactly', () => {
    const d = fresh();
    const back = parseImport(exportEnvelope(d));
    expect(back).toEqual(d);
  });
  it('rejects invalid files with helpful messages', () => {
    expect(() => parseImport('not json')).toThrow(ImportError);
    expect(() => parseImport('{"hello":1}')).toThrow(/does not look like/);
    expect(() => parseImport(JSON.stringify({ recipes: [{ name: 'x' }] }))).toThrow(/missing an id/);
    expect(() => parseImport(JSON.stringify({ meta: { schemaVersion: 999 }, recipes: [] }))).toThrow(/newer version/);
  });
  it('migrates old/partial data without losing fields', () => {
    const m = migrate({ recipes: [{ id: 'a', name: 'Test', custom: 1 }], settings: { householdSize: 4 } });
    expect(m.settings.householdSize).toBe(4);
    expect(m.settings.weekStartsOn).toBe(1);
    expect((m.recipes[0] as unknown as { custom: number }).custom).toBe(1);
    expect(m.meals).toEqual([]);
  });
  it('writes safe CSV', () => {
    const csv = toCsv([{ a: 'x,"y"', b: '=SUM(1)' }], [
      { header: 'A', value: (r) => r.a },
      { header: 'B', value: (r) => r.b },
    ], false);
    expect(csv).toBe('A,B\r\n"x,""y""",\'=SUM(1)');
  });
});
