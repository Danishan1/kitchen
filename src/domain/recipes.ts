import type { AppData, Equipment, Ingredient, Recipe, RecipeIngredient, Unit } from './types';
import { convertFor, roundQty } from './units';
import { normalizeName } from './util';

export interface ScaledIngredient {
  ri: RecipeIngredient;
  ingredient?: Ingredient;
  name: string;
  qty: number;
  unit: Unit;
}

export const scaleFactor = (recipe: Pick<Recipe, 'servings'>, servings: number) =>
  recipe.servings > 0 && servings > 0 ? servings / recipe.servings : 1;

/** Scale a single quantity; pinches are rounded but never drop to 0. */
export function scaleQty(qty: number, unit: Unit, factor: number): number {
  const scaled = roundQty(qty * factor, unit);
  return qty > 0 && scaled === 0 ? (unit === 'g' || unit === 'ml' ? 1 : 0.25) : scaled;
}

export function scaleRecipe(recipe: Recipe, servings: number, ingredients: Ingredient[]): ScaledIngredient[] {
  const f = scaleFactor(recipe, servings);
  const byId = new Map(ingredients.map((i) => [i.id, i]));
  return recipe.ingredients.map((ri) => {
    const ing = byId.get(ri.ingredientId);
    return { ri, ingredient: ing, name: ing?.name ?? 'Unknown ingredient', qty: scaleQty(ri.qty, ri.unit, f), unit: ri.unit };
  });
}

export const totalTime = (r: Pick<Recipe, 'prepMin' | 'cookMin'>) => (r.prepMin || 0) + (r.cookMin || 0);

/** Cost of a quantity of an ingredient from user-maintained prices. `null` if unknown/unconvertible. */
export function ingredientCost(ing: Ingredient | undefined, qty: number, unit: Unit): number | null {
  if (!ing || ing.price == null || !ing.priceUnit || !ing.priceQty) return null;
  const inPriceUnits = convertFor(qty, unit, ing.priceUnit, ing);
  if (inPriceUnits == null) return null;
  return (inPriceUnits / ing.priceQty) * ing.price;
}

export interface CostEstimate {
  total: number;
  perServing: number;
  priced: number;
  unpriced: string[];
}

/** Estimated (never guaranteed) ingredient cost for a recipe at a serving count. */
export function estimateRecipeCost(recipe: Recipe, servings: number, ingredients: Ingredient[]): CostEstimate {
  const scaled = scaleRecipe(recipe, servings, ingredients);
  let total = 0;
  let priced = 0;
  const unpriced: string[] = [];
  for (const s of scaled) {
    if (s.ri.optional) continue;
    const c = ingredientCost(s.ingredient, s.qty, s.unit);
    if (c == null) unpriced.push(s.name);
    else {
      total += c;
      priced++;
    }
  }
  return { total, perServing: servings > 0 ? total / servings : 0, priced, unpriced };
}

/** Equipment the recipe needs that is not currently usable (missing/damaged or not in inventory). */
export function missingEquipment(recipe: Recipe, equipment: Equipment[]): { id: string; name: string; reason: string }[] {
  const byId = new Map(equipment.map((e) => [e.id, e]));
  const out: { id: string; name: string; reason: string }[] = [];
  for (const id of recipe.equipmentIds) {
    const e = byId.get(id);
    if (!e) out.push({ id, name: id, reason: 'not in your equipment list' });
    else if (e.status === 'missing' || e.status === 'damaged') out.push({ id, name: e.name, reason: e.status });
    else if (e.quantity <= 0) out.push({ id, name: e.name, reason: 'quantity is 0' });
  }
  return out;
}

export interface RecipeFilter {
  q?: string;
  category?: string;
  diet?: string;
  difficulty?: string;
  maxTime?: number;
  favourites?: boolean;
}

export function filterRecipes(data: Pick<AppData, 'recipes' | 'ingredients'>, f: RecipeFilter): Recipe[] {
  const q = normalizeName(f.q ?? '');
  const ingName = new Map(data.ingredients.map((i) => [i.id, normalizeName(i.name)]));
  return data.recipes.filter((r) => {
    if (f.category && r.category !== f.category) return false;
    if (f.diet && r.diet !== f.diet) return false;
    if (f.difficulty && r.difficulty !== f.difficulty) return false;
    if (f.maxTime && totalTime(r) > f.maxTime) return false;
    if (f.favourites && !r.favourite) return false;
    if (!q) return true;
    if (normalizeName(r.name).includes(q)) return true;
    if (r.tags.some((t) => normalizeName(t).includes(q))) return true;
    return r.ingredients.some((ri) => (ingName.get(ri.ingredientId) ?? '').includes(q));
  });
}

/** Find a catalog ingredient by (case-insensitive) name or alias. */
export function findIngredientByName(ingredients: Ingredient[], name: string): Ingredient | undefined {
  const n = normalizeName(name);
  return ingredients.find((i) => normalizeName(i.name) === n || i.aliases?.some((a) => normalizeName(a) === n));
}
