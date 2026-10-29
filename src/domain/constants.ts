import type {
  Diet, Difficulty, EquipmentStatus, ExpenseCategory, GroceryCategory, MealSlot, MealStatus,
  RecipeCategory, Unit,
} from './types';

export const GROCERY_CATEGORIES: { id: GroceryCategory; label: string }[] = [
  { id: 'atta-grains', label: 'Atta & grains' },
  { id: 'rice', label: 'Rice' },
  { id: 'dal-pulses', label: 'Dal & pulses' },
  { id: 'vegetables', label: 'Vegetables' },
  { id: 'fruits', label: 'Fruits' },
  { id: 'meat-eggs-fish', label: 'Meat, eggs & fish' },
  { id: 'dairy', label: 'Dairy' },
  { id: 'spices-condiments', label: 'Spices & condiments' },
  { id: 'oil', label: 'Cooking oil & ghee' },
  { id: 'tea-snacks', label: 'Tea & snacks' },
  { id: 'fast-food', label: 'Homemade fast-food items' },
  { id: 'household', label: 'Household & kitchen consumables' },
];
export const groceryCategoryLabel = (c: GroceryCategory) =>
  GROCERY_CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string }[] = [
  { id: 'groceries', label: 'Groceries & staples' },
  { id: 'meat-poultry', label: 'Meat & poultry' },
  { id: 'dairy-eggs', label: 'Dairy & eggs' },
  { id: 'vegetables-fruit', label: 'Vegetables & fruit' },
  { id: 'snacks-special', label: 'Snacks & special meals' },
  { id: 'equipment', label: 'Kitchen equipment' },
  { id: 'other', label: 'Other food-related' },
];
export const expenseCategoryLabel = (c: ExpenseCategory) =>
  EXPENSE_CATEGORIES.find((x) => x.id === c)?.label ?? c;

/** How grocery purchases roll up into expense categories. */
export const GROCERY_TO_EXPENSE: Record<GroceryCategory, ExpenseCategory> = {
  'atta-grains': 'groceries',
  rice: 'groceries',
  'dal-pulses': 'groceries',
  vegetables: 'vegetables-fruit',
  fruits: 'vegetables-fruit',
  'meat-eggs-fish': 'meat-poultry',
  dairy: 'dairy-eggs',
  'spices-condiments': 'groceries',
  oil: 'groceries',
  'tea-snacks': 'snacks-special',
  'fast-food': 'snacks-special',
  household: 'other',
};

export const MEAL_SLOTS: { id: MealSlot; label: string; short: string }[] = [
  { id: 'breakfast', label: 'Breakfast', short: 'B' },
  { id: 'packed', label: 'Packed lunch', short: 'P' },
  { id: 'lunch', label: 'Lunch', short: 'L' },
  { id: 'snacks', label: 'Evening tea & snacks', short: 'S' },
  { id: 'dinner', label: 'Dinner', short: 'D' },
];
export const slotLabel = (s: MealSlot) => MEAL_SLOTS.find((x) => x.id === s)?.label ?? s;

export const MEAL_STATUS_LABEL: Record<MealStatus, string> = {
  planned: 'Planned',
  prepared: 'Prepared',
  skipped: 'Skipped',
  replaced: 'Replaced',
};

export const RECIPE_CATEGORIES: { id: RecipeCategory; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch', label: 'Lunch' },
  { id: 'dinner', label: 'Dinner' },
  { id: 'side', label: 'Dal / sabzi / side' },
  { id: 'bread', label: 'Roti & bread' },
  { id: 'snack', label: 'Snack' },
  { id: 'beverage', label: 'Beverage' },
  { id: 'dessert', label: 'Dessert' },
  { id: 'fast-food', label: 'Homemade fast food' },
];
export const recipeCategoryLabel = (c: RecipeCategory) =>
  RECIPE_CATEGORIES.find((x) => x.id === c)?.label ?? c;

export const DIET_LABEL: Record<Diet, string> = { veg: 'Veg', egg: 'Egg', nonveg: 'Non-veg' };
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  owned: 'Owned',
  missing: 'Missing',
  damaged: 'Damaged',
  optional: 'Optional',
};

export const UNITS: { id: Unit; label: string }[] = [
  { id: 'g', label: 'g' },
  { id: 'kg', label: 'kg' },
  { id: 'ml', label: 'ml' },
  { id: 'l', label: 'litre' },
  { id: 'tsp', label: 'tsp' },
  { id: 'tbsp', label: 'tbsp' },
  { id: 'cup', label: 'cup' },
  { id: 'pc', label: 'piece' },
  { id: 'dozen', label: 'dozen' },
  { id: 'bunch', label: 'bunch' },
  { id: 'packet', label: 'packet' },
  { id: 'pinch', label: 'pinch' },
];
