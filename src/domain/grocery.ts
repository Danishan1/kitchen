/**
 * Grocery & pantry logic. All "mutating" functions operate on a draft copy of
 * AppData (the store clones before calling them), which keeps them easy to test.
 *
 * Distinctions kept on purpose:
 *  - requirement  = computed from planned meals (never stored on its own)
 *  - grocery item = what to buy, snapshot per list
 *  - purchase     = fields on a grocery item (qty, price, vendor, date)
 *  - stock        = pantry quantity, changed only through StockMovements
 */
import type {
  AppData, ExpenseCategory, GroceryItem, GroceryList, ID, Ingredient, MealEntry, PantryItem, StockMovement, Unit,
} from './types';
import { GROCERY_TO_EXPENSE } from './constants';
import { BASE_UNIT, convertFor, dimensionOf, formatAmount, humanize, roundQty, toBase, type Dimension } from './units';
import { ingredientCost, scaleQty, scaleFactor } from './recipes';
import { nowISO, uid } from './util';
import { addDays, today } from './dates';

export interface Requirement {
  ingredientId: ID;
  dim: Dimension;
  /** Quantity in the dimension's base unit (g / ml / pc / …). */
  baseQty: number;
  baseUnit: Unit;
  recipes: string[];
  mealIds: ID[];
}

/** Meals that still need cooking and therefore need ingredients. */
export const mealNeedsIngredients = (m: MealEntry) => m.status === 'planned' && !m.isLeftover;

/** Aggregate ingredient requirements across meals, merging compatible units. */
export function aggregateRequirements(data: Pick<AppData, 'recipes' | 'ingredients'>, meals: MealEntry[], includeOptional = false): Requirement[] {
  const recipes = new Map(data.recipes.map((r) => [r.id, r]));
  const ings = new Map(data.ingredients.map((i) => [i.id, i]));
  const map = new Map<string, Requirement>();
  for (const meal of meals) {
    if (!mealNeedsIngredients(meal)) continue;
    for (const dish of meal.dishes) {
      const r = recipes.get(dish.recipeId);
      if (!r) continue;
      const f = scaleFactor(r, dish.servings || meal.people);
      for (const ri of r.ingredients) {
        if (ri.optional && !includeOptional) continue;
        const scaled = scaleQty(ri.qty, ri.unit, f);
        // Prefer the ingredient's shopping unit (e.g. onions in kg) when a safe conversion exists.
        const ing = ings.get(ri.ingredientId);
        const inBuy = ing?.buyUnit ? convertFor(scaled, ri.unit, ing.buyUnit, ing) : null;
        const base = inBuy != null ? toBase(inBuy, ing!.buyUnit!) : toBase(scaled, ri.unit);
        const dim = dimensionOf(base.unit);
        const key = `${ri.ingredientId}|${dim}`;
        const cur = map.get(key);
        if (cur) {
          cur.baseQty += base.qty;
          if (!cur.recipes.includes(r.name)) cur.recipes.push(r.name);
          if (!cur.mealIds.includes(meal.id)) cur.mealIds.push(meal.id);
        } else {
          map.set(key, { ingredientId: ri.ingredientId, dim, baseQty: base.qty, baseUnit: base.unit, recipes: [r.name], mealIds: [meal.id] });
        }
      }
    }
  }
  return [...map.values()];
}

export interface StockInfo {
  /** Known stock in base units (only items with a known, convertible quantity). */
  known: number;
  /** True if any relevant pantry entry has unknown quantity or an unconvertible unit. */
  unknown: boolean;
  hasItem: boolean;
}

export function pantryStock(pantry: PantryItem[], ingredientId: ID, dim: Dimension, ing?: Ingredient): StockInfo {
  let known = 0;
  let unknown = false;
  let hasItem = false;
  for (const p of pantry) {
    if (p.ingredientId !== ingredientId) continue;
    hasItem = true;
    if (p.qty == null) {
      unknown = true;
      continue;
    }
    const inBase = convertFor(p.qty, p.unit, BASE_UNIT[dim], ing);
    if (inBase == null) {
      unknown = true; // e.g. "1 packet" of something needed in grams — can't compare safely
      continue;
    }
    known += inBase;
  }
  return { known, unknown, hasItem };
}

export function estimateItemPrice(ing: Ingredient | undefined, qty: number, unit: Unit): number | undefined {
  const c = ingredientCost(ing, qty, unit);
  return c == null ? undefined : Math.round(c);
}

/** Base-unit quantity of an item's purchase (falls back to planned qty). */
function purchasedBase(item: GroceryItem, dim: Dimension, ing?: Ingredient): number {
  const unit = item.purchasedUnit ?? item.unit;
  const qty = item.purchasedQty ?? item.qty;
  return convertFor(qty, unit, BASE_UNIT[dim], ing) ?? 0;
}

/**
 * (Re)generate plan-based items for a list.
 *  - Manual items and purchased items are never touched.
 *  - Un-purchased plan items are replaced by freshly computed ones (keeping the
 *    user's store/note choices per ingredient).
 *  - Pantry stock is read, never modified. Stock that was added to the pantry
 *    from *this list's* purchases is excluded from the offset, and purchased
 *    quantities are counted instead — so regenerating can never subtract the
 *    same stock twice or ask you to buy something again.
 */
export function generatePlanItems(d: AppData, listId: ID, meals: MealEntry[]): { added: number; removed: number } {
  const list = d.groceryLists.find((l) => l.id === listId);
  if (!list) throw new Error('Shopping list not found');
  const ingById = new Map(d.ingredients.map((i) => [i.id, i]));
  const existing = d.groceryItems.filter((i) => i.listId === listId);
  const stalePlan = existing.filter((i) => i.source === 'plan' && !i.purchased);
  const keepPrefs = new Map(stalePlan.filter((i) => i.ingredientId).map((i) => [i.ingredientId!, { store: i.store, note: i.note }]));
  const kept = existing.filter((i) => !(i.source === 'plan' && !i.purchased));
  const movementsById = new Map(d.stockMovements.map((m) => [m.id, m]));

  const reqs = aggregateRequirements(d, meals);
  const fresh: GroceryItem[] = [];
  for (const req of reqs) {
    const ing = ingById.get(req.ingredientId);
    const stock = pantryStock(d.pantry, req.ingredientId, req.dim, ing);
    const related = kept.filter((i) => i.ingredientId === req.ingredientId);

    // Stock that came from this list's purchases (already counted as "purchased").
    let addedFromList = 0;
    let purchased = 0;
    let manualPending = 0;
    for (const it of related) {
      if (it.purchased) {
        purchased += purchasedBase(it, req.dim, ing);
        const mv = it.stockMovementId ? movementsById.get(it.stockMovementId) : undefined;
        if (mv) addedFromList += convertFor(mv.delta, mv.unit, BASE_UNIT[req.dim], ing) ?? 0;
      } else {
        manualPending += convertFor(it.qty, it.unit, BASE_UNIT[req.dim], ing) ?? 0;
      }
    }
    const usableStock = stock.unknown ? 0 : Math.max(0, stock.known - addedFromList);
    const remaining = req.baseQty - usableStock - purchased - manualPending;
    if (remaining <= 0.0001) continue;

    const nice = humanize(remaining, req.baseUnit);
    const reqNice = humanize(req.baseQty, req.baseUnit);
    const reqInUnit = convertFor(reqNice.qty, reqNice.unit, nice.unit) ?? reqNice.qty;
    const offsetInUnit = convertFor(usableStock, req.baseUnit, nice.unit) ?? 0;
    const prefs = keepPrefs.get(req.ingredientId);
    fresh.push({
      id: uid('gi'),
      listId,
      ingredientId: req.ingredientId,
      name: ing?.name ?? 'Unknown',
      category: ing?.category ?? 'household',
      qty: nice.qty,
      unit: nice.unit,
      requiredQty: roundQty(reqInUnit, nice.unit),
      pantryOffset: offsetInUnit > 0 ? roundQty(offsetInUnit, nice.unit) : undefined,
      pantryUnknown: stock.unknown || undefined,
      source: 'plan',
      estPrice: estimateItemPrice(ing, nice.qty, nice.unit),
      store: prefs?.store ?? list.store,
      note: prefs?.note ?? `For: ${req.recipes.slice(0, 3).join(', ')}${req.recipes.length > 3 ? '…' : ''}`,
      purchased: false,
    });
  }

  d.groceryItems = [...d.groceryItems.filter((i) => i.listId !== listId), ...kept, ...fresh];
  list.mealIds = meals.filter(mealNeedsIngredients).map((m) => m.id);
  list.updatedAt = nowISO();
  return { added: fresh.length, removed: stalePlan.length };
}

export function createList(d: AppData, partial: Partial<GroceryList> & { name: string }): GroceryList {
  const list: GroceryList = { id: uid('gl'), createdAt: nowISO(), updatedAt: nowISO(), status: 'active', ...partial };
  d.groceryLists.unshift(list);
  return list;
}

/** Duplicate a list (e.g. save/reuse a weekly template). Purchase data is cleared. */
export function duplicateList(d: AppData, listId: ID, name: string, status: GroceryList['status'] = 'active'): GroceryList {
  const src = d.groceryLists.find((l) => l.id === listId);
  if (!src) throw new Error('List not found');
  const copy = createList(d, { name, status, store: src.store, notes: src.notes });
  const items = d.groceryItems
    .filter((i) => i.listId === listId)
    .map<GroceryItem>((i) => ({
      id: uid('gi'),
      listId: copy.id,
      ingredientId: i.ingredientId,
      name: i.name,
      category: i.category,
      qty: i.qty,
      unit: i.unit,
      source: 'manual',
      estPrice: i.estPrice,
      store: i.store,
      note: i.note,
      purchased: false,
    }));
  d.groceryItems.push(...items);
  return copy;
}

export function addManualItem(d: AppData, listId: ID, item: Omit<GroceryItem, 'id' | 'listId' | 'source' | 'purchased'>): GroceryItem {
  const ing = item.ingredientId ? d.ingredients.find((i) => i.id === item.ingredientId) : undefined;
  const gi: GroceryItem = {
    ...item,
    id: uid('gi'),
    listId,
    source: 'manual',
    purchased: false,
    estPrice: item.estPrice ?? estimateItemPrice(ing, item.qty, item.unit),
  };
  d.groceryItems.push(gi);
  touchList(d, listId);
  return gi;
}

function touchList(d: AppData, listId: ID) {
  const l = d.groceryLists.find((x) => x.id === listId);
  if (l) l.updatedAt = nowISO();
}

export interface PurchaseInput {
  qty?: number;
  unit?: Unit;
  price?: number;
  vendor?: string;
  date?: string;
}

/** Record a purchase. Does NOT change stock — see addPurchaseToPantry. */
export function markPurchased(d: AppData, itemId: ID, p: PurchaseInput = {}) {
  const it = d.groceryItems.find((i) => i.id === itemId);
  if (!it) throw new Error('Item not found');
  it.purchased = true;
  it.purchasedQty = p.qty ?? it.purchasedQty ?? it.qty;
  it.purchasedUnit = p.unit ?? it.purchasedUnit ?? it.unit;
  if (p.price !== undefined) it.actualPrice = p.price;
  if (p.vendor !== undefined) it.vendor = p.vendor;
  it.purchaseDate = p.date ?? it.purchaseDate ?? today();
  touchList(d, it.listId);
}

/** Undo a purchase. Reverses pantry stock it added. Refuses if already recorded as an expense. */
export function unmarkPurchased(d: AppData, itemId: ID): { ok: boolean; message?: string } {
  const it = d.groceryItems.find((i) => i.id === itemId);
  if (!it) return { ok: false, message: 'Item not found' };
  if (it.expenseId && d.expenses.some((e) => e.id === it.expenseId)) {
    return { ok: false, message: 'This purchase is already included in a recorded expense. Delete or edit that expense first.' };
  }
  if (it.stockMovementId) reverseMovement(d, it.stockMovementId);
  it.purchased = false;
  it.stockMovementId = undefined;
  it.expenseId = undefined;
  touchList(d, it.listId);
  return { ok: true };
}

function ensureIngredient(d: AppData, it: GroceryItem): Ingredient {
  if (it.ingredientId) {
    const found = d.ingredients.find((i) => i.id === it.ingredientId);
    if (found) return found;
  }
  const n = it.name.trim().toLowerCase();
  const byName = d.ingredients.find((i) => i.name.trim().toLowerCase() === n);
  if (byName) {
    it.ingredientId = byName.id;
    return byName;
  }
  const ing: Ingredient = { id: uid('ing'), name: it.name.trim(), category: it.category };
  d.ingredients.push(ing);
  it.ingredientId = ing.id;
  return ing;
}

/** Apply a stock movement to the pantry. Returns the movement actually recorded. */
export function applyMovement(d: AppData, mv: Omit<StockMovement, 'id' | 'date'> & { date?: string }): StockMovement | null {
  const ingD = d.ingredients.find((i) => i.id === mv.ingredientId);
  let p = d.pantry.find((x) => x.ingredientId === mv.ingredientId && x.qty != null && convertFor(1, mv.unit, x.unit, ingD) != null);
  const record: StockMovement = { ...mv, id: uid('mv'), date: mv.date ?? nowISO() };
  if (!p) {
    const unknownItem = d.pantry.find((x) => x.ingredientId === mv.ingredientId);
    if (unknownItem && mv.delta > 0) {
      // Existing entry with unknown quantity: keep it unknown (we only know it increased),
      // but record what was bought so the user can count and set the real quantity.
      d.stockMovements.push(record);
      unknownItem.updatedAt = nowISO();
      unknownItem.purchaseDate = today();
      unknownItem.notes = `Quantity unknown · last added ${formatAmount(mv.delta, mv.unit)} on ${today()}. Count it and set the quantity to start tracking.`;
      return record;
    }
    if (mv.delta <= 0) return null; // nothing known to reduce
    const unit = ingD?.buyUnit && convertFor(1, mv.unit, ingD.buyUnit, ingD) != null ? ingD.buyUnit : mv.unit;
    p = { id: uid('pi'), ingredientId: mv.ingredientId, qty: 0, unit, updatedAt: nowISO(), purchaseDate: today(), location: defaultLocation(ingD?.category) };
    d.pantry.push(p);
  }
  const deltaInP = convertFor(mv.delta, mv.unit, p.unit, ingD) ?? 0;
  const next = Math.max(0, (p.qty ?? 0) + deltaInP);
  const applied = next - (p.qty ?? 0);
  p.qty = roundQty(next, p.unit);
  p.updatedAt = nowISO();
  if (mv.delta > 0) p.purchaseDate = today();
  // Record what was really applied (clamped at 0) so reversal is exact.
  record.delta = applied;
  record.unit = p.unit;
  d.stockMovements.push(record);
  return record;
}

export function reverseMovement(d: AppData, movementId: ID) {
  const mv = d.stockMovements.find((m) => m.id === movementId);
  if (!mv) return;
  const ing = d.ingredients.find((i) => i.id === mv.ingredientId);
  const p = d.pantry.find((x) => x.ingredientId === mv.ingredientId && x.qty != null && convertFor(1, mv.unit, x.unit, ing) != null);
  if (p && p.qty != null) {
    const delta = convertFor(mv.delta, mv.unit, p.unit, ing) ?? 0;
    p.qty = roundQty(Math.max(0, p.qty - delta), p.unit);
    p.updatedAt = nowISO();
  }
  d.stockMovements = d.stockMovements.filter((m) => m.id !== movementId);
}

function defaultLocation(cat?: string): string {
  if (cat === 'meat-eggs-fish') return 'Freezer';
  if (cat === 'dairy' || cat === 'vegetables' || cat === 'fruits') return 'Refrigerator';
  return 'Pantry shelf';
}

/** Add a purchased item's quantity to the pantry — exactly once per item. */
export function addPurchaseToPantry(d: AppData, itemId: ID): { ok: boolean; message?: string } {
  const it = d.groceryItems.find((i) => i.id === itemId);
  if (!it) return { ok: false, message: 'Item not found' };
  if (!it.purchased) return { ok: false, message: 'Mark the item as purchased first.' };
  if (it.stockMovementId && d.stockMovements.some((m) => m.id === it.stockMovementId)) {
    return { ok: false, message: 'Already added to pantry.' };
  }
  const ing = ensureIngredient(d, it);
  const mv = applyMovement(d, {
    ingredientId: ing.id,
    delta: it.purchasedQty ?? it.qty,
    unit: it.purchasedUnit ?? it.unit,
    reason: 'purchase',
    refId: it.id,
  });
  if (mv) it.stockMovementId = mv.id;
  return { ok: true };
}

/** Record purchased-but-unexpensed items of a list as expenses, grouped by expense category. */
export function recordListExpenses(d: AppData, listId: ID, vendorFallback?: string): { created: number; total: number; missingPrice: number } {
  const items = d.groceryItems.filter((i) => i.listId === listId && i.purchased && !i.expenseId);
  const missingPrice = items.filter((i) => i.actualPrice == null).length;
  const priced = items.filter((i) => i.actualPrice != null && i.actualPrice > 0);
  const groups = new Map<string, GroceryItem[]>();
  for (const it of priced) {
    const cat = GROCERY_TO_EXPENSE[it.category] ?? 'groceries';
    const key = `${cat}|${it.purchaseDate ?? today()}|${it.vendor || vendorFallback || ''}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(it);
  }
  const list = d.groceryLists.find((l) => l.id === listId);
  let total = 0;
  for (const [key, its] of groups) {
    const [cat, date, vendor] = key.split('|');
    const amount = its.reduce((a, b) => a + (b.actualPrice ?? 0), 0);
    total += amount;
    const id = uid('ex');
    d.expenses.push({
      id,
      date,
      amount: Math.round(amount * 100) / 100,
      category: cat as ExpenseCategory,
      vendor: vendor || undefined,
      notes: `${list?.name ?? 'Shopping list'}: ${its.map((i) => i.name).join(', ')}`.slice(0, 300),
      source: 'grocery',
      groceryListId: listId,
      createdAt: nowISO(),
    });
    for (const it of its) it.expenseId = id;
  }
  return { created: groups.size, total, missingPrice };
}

export interface ListTotals {
  estimated: number;
  estimatedPending: number;
  actual: number;
  items: number;
  purchased: number;
  unpriced: number;
}

export function listTotals(items: GroceryItem[]): ListTotals {
  let estimated = 0, estimatedPending = 0, actual = 0, purchased = 0, unpriced = 0;
  for (const i of items) {
    estimated += i.estPrice ?? 0;
    if (i.estPrice == null) unpriced++;
    if (i.purchased) {
      purchased++;
      actual += i.actualPrice ?? 0;
    } else estimatedPending += i.estPrice ?? 0;
  }
  return { estimated, estimatedPending, actual, items: items.length, purchased, unpriced };
}

/** Reduce pantry for a prepared meal (only when the user enabled it). Idempotent per meal. */
export function deductPantryForMeal(d: AppData, mealId: ID): number {
  const meal = d.meals.find((m) => m.id === mealId);
  if (!meal || meal.pantryDeducted) return 0;
  const reqs = aggregateRequirements(d, [{ ...meal, status: 'planned', isLeftover: false }]);
  let n = 0;
  for (const r of reqs) {
    const mv = applyMovement(d, { ingredientId: r.ingredientId, delta: -r.baseQty, unit: r.baseUnit, reason: 'cooked', refId: meal.id });
    if (mv) n++;
  }
  meal.pantryDeducted = true;
  return n;
}

export function restorePantryForMeal(d: AppData, mealId: ID) {
  const meal = d.meals.find((m) => m.id === mealId);
  const ids = d.stockMovements.filter((m) => m.reason === 'cooked' && m.refId === mealId).map((m) => m.id);
  ids.forEach((id) => reverseMovement(d, id));
  if (meal) meal.pantryDeducted = false;
}

/** Pantry items at or below minimum desired stock (known quantities only). */
export function lowStock(d: Pick<AppData, 'pantry'>): PantryItem[] {
  return d.pantry.filter((p) => p.qty != null && p.minQty != null && p.minQty > 0 && p.qty <= p.minQty);
}

export function expiringSoon(d: Pick<AppData, 'pantry'>, withinDays = 3, ref = today()): PantryItem[] {
  const lim = addDays(ref, withinDays);
  return d.pantry
    .filter((p) => p.expiry && p.expiry <= lim && (p.qty == null || p.qty > 0))
    .sort((a, b) => (a.expiry! < b.expiry! ? -1 : 1));
}
