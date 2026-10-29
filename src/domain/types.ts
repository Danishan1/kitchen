/**
 * Family Kitchen OS — versioned application data model.
 *
 * How ingredient data flows (no duplication):
 *  - `ingredients` is the single catalog: name, grocery category and the
 *    user-maintained price. Everything else references it by `ingredientId`.
 *  - Recipe ingredients = what a recipe needs per its base servings.
 *  - Meal plan × recipe scaling = planned requirements (computed, never stored).
 *  - Grocery items = a snapshot of "what to buy" for one list. Regenerating a
 *    list recomputes un-purchased items only; pantry stock is never modified by
 *    list generation.
 *  - Purchases are recorded on grocery items. Stock only changes when the user
 *    explicitly adds a purchase to the pantry, which writes one stock movement
 *    keyed to that grocery item (idempotent — cannot be added twice).
 *  - Pantry items hold the current known quantity (or `null` = unknown).
 *  - Expenses are actual money spent; estimates live on recipes/lists only.
 */

export type ID = string;
/** Local calendar date, `YYYY-MM-DD` (Asia/Kolkata by default — never UTC-shifted). */
export type ISODate = string;
/** Full timestamp, ISO 8601 with offset (`new Date().toISOString()`). */
export type ISODateTime = string;

export type Unit =
  | 'g' | 'kg' | 'ml' | 'l' | 'tsp' | 'tbsp' | 'cup' | 'pc' | 'pinch' | 'bunch' | 'packet' | 'dozen';

export type GroceryCategory =
  | 'atta-grains' | 'rice' | 'dal-pulses' | 'vegetables' | 'fruits' | 'meat-eggs-fish'
  | 'dairy' | 'spices-condiments' | 'oil' | 'tea-snacks' | 'fast-food' | 'household';

export type ExpenseCategory =
  | 'groceries' | 'meat-poultry' | 'dairy-eggs' | 'vegetables-fruit' | 'snacks-special'
  | 'equipment' | 'other';

export type Diet = 'veg' | 'egg' | 'nonveg';
export type RecipeCategory =
  | 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'beverage' | 'dessert' | 'fast-food' | 'side' | 'bread';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type MealSlot = 'breakfast' | 'packed' | 'lunch' | 'snacks' | 'dinner';
export type MealStatus = 'planned' | 'prepared' | 'skipped' | 'replaced';

export interface Ingredient {
  id: ID;
  name: string;
  category: GroceryCategory;
  /** Price in INR for `priceQty` × `priceUnit`, e.g. ₹60 per 1 kg. */
  price?: number;
  priceQty?: number;
  priceUnit?: Unit;
  aliases?: string[];
  /** Preferred unit for shopping lists & pantry (onions by kg even if recipes say "2 pcs"). */
  buyUnit?: Unit;
  /** Approximate weight of one piece in grams (user-editable). Enables pc ↔ g for this ingredient only. */
  pcGrams?: number;
  /** Approximate grams per teaspoon (user-editable). Enables tsp/tbsp ↔ g for this ingredient only. */
  tspGrams?: number;
  notes?: string;
}

export interface RecipeIngredient {
  id: ID;
  ingredientId: ID;
  qty: number;
  unit: Unit;
  note?: string;
  optional?: boolean;
  substitution?: string;
}

export interface RecipeStep {
  id: ID;
  text: string;
  timerMin?: number;
}

export interface Recipe {
  id: ID;
  name: string;
  category: RecipeCategory;
  cuisine: string;
  tags: string[];
  diet: Diet;
  dietaryNotes?: string;
  halalNotes?: string;
  servings: number;
  prepMin: number;
  cookMin: number;
  difficulty: Difficulty;
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  equipmentIds: ID[];
  tips: string[];
  mistakes: string[];
  storage?: string;
  notes?: string;
  favourite: boolean;
  lastCooked?: ISODate;
  timesCooked: number;
  photo?: string; // small data URL, resized on upload
  rating?: number; // 0-5
  feedback?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface MealDish {
  recipeId: ID;
  servings: number;
}

export interface MealEntry {
  id: ID;
  date: ISODate;
  slot: MealSlot;
  title?: string; // free text when not using a recipe ("Leftover rajma-chawal")
  dishes: MealDish[];
  people: number;
  status: MealStatus;
  replacedWith?: string;
  isLeftover?: boolean;
  reminder?: string; // preparation reminder e.g. "Soak rajma tonight"
  notes?: string;
  /** Set when pantry was auto-reduced for this meal (so it can be reversed, never doubled). */
  pantryDeducted?: boolean;
}

export interface GroceryList {
  id: ID;
  name: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  /** Date range used for plan-based generation (inclusive). */
  fromDate?: ISODate;
  toDate?: ISODate;
  /** Meal ids that were included when the list was last generated. */
  mealIds?: ID[];
  status: 'active' | 'done' | 'template';
  store?: string;
  notes?: string;
}

export interface GroceryItem {
  id: ID;
  listId: ID;
  ingredientId?: ID;
  name: string;
  category: GroceryCategory;
  qty: number; // quantity to buy (editable)
  unit: Unit;
  /** Planned requirement before pantry offset (plan items only). */
  requiredQty?: number;
  /** Known pantry stock that was offset (plan items only, in `unit`). */
  pantryOffset?: number;
  /** True when some pantry stock for this ingredient is unknown — nothing subtracted. */
  pantryUnknown?: boolean;
  source: 'plan' | 'manual';
  estPrice?: number;
  store?: string;
  note?: string;
  purchased: boolean;
  purchasedQty?: number;
  purchasedUnit?: Unit;
  actualPrice?: number;
  vendor?: string;
  purchaseDate?: ISODate;
  /** Stock movement id when this purchase has been added to pantry. */
  stockMovementId?: ID;
  /** Expense id when this purchase was recorded as an expense. */
  expenseId?: ID;
}

export interface PantryItem {
  id: ID;
  ingredientId: ID;
  /** `null` = quantity unknown (never subtracted from shopping lists). */
  qty: number | null;
  unit: Unit;
  minQty?: number;
  purchaseDate?: ISODate;
  expiry?: ISODate;
  location?: string;
  notes?: string;
  updatedAt: ISODateTime;
}

export interface StockMovement {
  id: ID;
  ingredientId: ID;
  delta: number;
  unit: Unit;
  reason: 'purchase' | 'cooked' | 'manual' | 'adjust';
  /** Grocery item id / meal id that caused it — guarantees idempotency. */
  refId?: ID;
  date: ISODateTime;
  note?: string;
}

export interface Expense {
  id: ID;
  date: ISODate;
  amount: number;
  category: ExpenseCategory;
  vendor?: string;
  notes?: string;
  source: 'manual' | 'grocery';
  groceryListId?: ID;
  createdAt: ISODateTime;
}

export type EquipmentStatus = 'owned' | 'missing' | 'damaged' | 'optional';

export interface Equipment {
  id: ID;
  name: string;
  category: 'cooking' | 'appliance' | 'prep' | 'storage' | 'serving' | 'measuring';
  status: EquipmentStatus;
  quantity: number;
  condition?: 'new' | 'good' | 'worn' | 'needs-repair';
  notes?: string;
  cost?: number;
  purchaseDate?: ISODate;
  wishlist?: boolean;
  wishlistPriority?: 'low' | 'medium' | 'high';
}

export interface CookingSession {
  id: ID;
  recipeIds: ID[];
  mealId?: ID;
  title: string;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  /** Accumulated seconds from completed run segments. */
  elapsedSec: number;
  /** Start of the currently running segment, if running. */
  runningSince?: ISODateTime;
  estimatedMin: number;
  wentWell?: string;
  improve?: string;
  rating?: number;
  status: 'running' | 'paused' | 'done';
}

export interface LessonProgress {
  done: boolean;
  date?: ISODate;
  notes?: string;
}

export interface SafetyTip {
  id: ID;
  title: string;
  body: string;
}

export interface HouseholdMember {
  id: ID;
  name: string;
  role?: string;
  packedLunch: boolean;
}

export interface Settings {
  householdName: string;
  householdSize: number;
  members: HouseholdMember[];
  location: string;
  hometown: string;
  mealTimes: Record<MealSlot, string>;
  peoplePerMeal: Record<MealSlot, number>;
  packedLunchNote: string;
  cuisine: string;
  spiceLevel: 'mild' | 'medium' | 'medium-spicy' | 'spicy';
  dietary: string;
  halalOnly: boolean;
  nonVegDaysTarget: number;
  weeklyBudget: number;
  monthlyBudget: number;
  budgetAlertPct: number;
  defaultServings: number;
  preferredUnits: 'metric' | 'metric+spoons';
  theme: 'system' | 'light' | 'dark';
  weekStartsOn: 0 | 1;
  autoDeductPantry: boolean;
  avoidRepeatDays: number;
}

export interface AppMeta {
  schemaVersion: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  deviceId: string;
}

export interface AppData {
  meta: AppMeta;
  settings: Settings;
  ingredients: Ingredient[];
  recipes: Recipe[];
  meals: MealEntry[];
  groceryLists: GroceryList[];
  groceryItems: GroceryItem[];
  pantry: PantryItem[];
  stockMovements: StockMovement[];
  expenses: Expense[];
  equipment: Equipment[];
  cookingSessions: CookingSession[];
  learningProgress: Record<string, LessonProgress>;
  /** Daily prep checklist ticks, keyed by date then item key. */
  checklists: Record<ISODate, Record<string, boolean>>;
  safetyTips: SafetyTip[];
  /** Small UI preferences that should travel with backups. */
  preferences: { plannerView: 'week' | '14' | 'month'; groceryGroupBy: 'category' | 'store'; lastListId?: ID };
}

export const SCHEMA_VERSION = 1;
