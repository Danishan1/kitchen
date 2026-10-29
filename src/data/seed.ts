import type { AppData, Equipment, MealEntry, MealSlot, PantryItem, SafetyTip, Settings } from '../domain/types';
import { SCHEMA_VERSION } from '../domain/types';
import { addDays, startOfWeek, today } from '../domain/dates';
import { nowISO, uid } from '../domain/util';
import { seedIngredients } from './seedIngredients';
import { seedRecipes } from './seedRecipes';

export const defaultSettings = (): Settings => ({
  householdName: 'Our kitchen',
  householdSize: 5,
  members: [
    { id: 'm1', name: 'Cook (me)', role: 'Primary cook, works from home', packedLunch: false },
    { id: 'm2', name: 'College student 1', role: 'Leaves 7–8 AM', packedLunch: true },
    { id: 'm3', name: 'College student 2', role: 'Leaves 7–8 AM', packedLunch: true },
    { id: 'm4', name: 'Family member', role: 'Returns 5–8 PM', packedLunch: false },
    { id: 'm5', name: 'Family member', role: 'Returns 5–8 PM', packedLunch: false },
  ],
  location: 'Delhi',
  hometown: 'Amroha, Uttar Pradesh',
  mealTimes: { breakfast: '07:00', packed: '07:15', lunch: '13:30', snacks: '17:30', dinner: '20:30' },
  peoplePerMeal: { breakfast: 5, packed: 2, lunch: 3, snacks: 5, dinner: 5 },
  packedLunchNote: 'Two college students — pack by 7:15 AM in insulated lunchboxes.',
  cuisine: 'North Indian home cooking (western UP)',
  spiceLevel: 'medium-spicy',
  dietary: 'Halal. Beef (where legally available and properly sourced), chicken, eggs, fish; mutton occasionally.',
  halalOnly: true,
  nonVegDaysTarget: 4,
  weeklyBudget: 0,
  monthlyBudget: 0,
  budgetAlertPct: 80,
  defaultServings: 5,
  preferredUnits: 'metric+spoons',
  theme: 'system',
  weekStartsOn: 1,
  autoDeductPantry: false,
  avoidRepeatDays: 3,
});

const eq = (id: string, name: string, category: Equipment['category'], status: Equipment['status'], quantity = 1, extra: Partial<Equipment> = {}): Equipment => ({
  id, name, category, status, quantity, condition: status === 'owned' ? 'good' : undefined, ...extra,
});

export const seedEquipment = (): Equipment[] => [
  eq('gas-stove', 'Gas stove (2–3 burner)', 'appliance', 'owned'),
  eq('pressure-cooker', 'Pressure cooker (5 L)', 'cooking', 'owned', 1, { notes: 'Check gasket & whistle every few months.' }),
  eq('tawa', 'Tawa', 'cooking', 'owned'),
  eq('kadhai', 'Kadhai', 'cooking', 'owned'),
  eq('frying-pan', 'Frying pan (non-stick)', 'cooking', 'owned'),
  eq('pots', 'Pots & saucepans (patila)', 'cooking', 'owned', 3),
  eq('rolling-pin', 'Chakla-belan (rolling board & pin)', 'prep', 'owned'),
  eq('strainer', 'Strainer / colander', 'prep', 'owned'),
  eq('mixer', 'Mixer-grinder', 'appliance', 'owned'),
  eq('fridge', 'Refrigerator', 'appliance', 'owned'),
  eq('freezer', 'Freezer compartment', 'appliance', 'owned', 1, { notes: 'Part of the refrigerator.' }),
  eq('microwave', 'Microwave / OTG oven', 'appliance', 'optional', 0, { notes: 'Nice to have for reheating — not required by any seed recipe.' }),
  eq('air-fryer', 'Air fryer', 'appliance', 'optional', 0, { notes: 'Optional. Not needed for everyday cooking.' }),
  eq('knives', "Knives (chef's knife + small knife)", 'prep', 'owned', 2),
  eq('cutting-board', 'Cutting boards (separate one for raw meat)', 'prep', 'owned', 1, { notes: 'Consider a second board just for raw meat.', wishlist: true, wishlistPriority: 'high' }),
  eq('containers', 'Storage containers (airtight)', 'storage', 'owned', 10),
  eq('measuring', 'Measuring cups & spoons', 'measuring', 'missing', 0, { notes: 'Very helpful while learning — makes recipes repeatable.', wishlist: true, wishlistPriority: 'medium' }),
  eq('lunchbox', 'Insulated lunchboxes', 'serving', 'owned', 2, { notes: 'One per college student. Verify they keep food hot for the commute.' }),
  eq('flask', 'Insulated flask', 'serving', 'optional', 0, { wishlist: true, wishlistPriority: 'low' }),
  eq('thermometer', 'Food thermometer', 'measuring', 'optional', 0, { notes: 'Optional; helps check chicken/mince is cooked to 74 °C.', wishlist: true, wishlistPriority: 'low' }),
];

/** Staples seeded with UNKNOWN quantity — nothing is subtracted until you record real stock. */
const seedPantry = (): PantryItem[] => {
  const staples: [string, string, number | null, string][] = [
    ['salt', 'g', null, 'Spice shelf'],
    ['turmeric', 'g', null, 'Spice shelf'],
    ['red-chilli', 'g', null, 'Spice shelf'],
    ['coriander-powder', 'g', null, 'Spice shelf'],
    ['cumin', 'g', null, 'Spice shelf'],
    ['garam-masala', 'g', null, 'Spice shelf'],
    ['oil', 'ml', null, 'Kitchen counter'],
    ['atta', 'kg', null, 'Pantry shelf'],
    ['rice', 'kg', null, 'Pantry shelf'],
    ['tea', 'g', null, 'Kitchen counter'],
    ['sugar', 'g', null, 'Kitchen counter'],
  ];
  return staples.map(([ingredientId, unit, qty, location]) => ({
    id: uid('pi'),
    ingredientId,
    qty,
    unit: unit as PantryItem['unit'],
    location,
    updatedAt: nowISO(),
    notes: 'Quantity unknown — update after checking your shelf.',
  }));
};

export const seedSafetyTips = (): SafetyTip[] => [
  { id: 'st1', title: 'Refrigerate cooked food promptly', body: 'Cool cooked food and put it in the fridge within 2 hours of cooking — within 1 hour on hot Delhi days (above ~32 °C). Divide large pots into shallow containers so they cool quickly. Keep the fridge at 5 °C or below.' },
  { id: 'st2', title: 'Store raw meat separately', body: 'Keep raw chicken, meat and fish in sealed containers on the lowest fridge shelf so juices cannot drip onto ready-to-eat food. Freeze if not cooking within a day.' },
  { id: 'st3', title: 'Avoid cross-contamination', body: 'Use a separate board and knife for raw meat. Wash hands, boards, knives and the sink with soap and hot water after handling raw meat or eggs. Do not wash raw chicken in a way that splashes — rinse gently and clean the sink afterwards.' },
  { id: 'st4', title: 'Cook and reheat thoroughly', body: 'Chicken, mince and eggs must be fully cooked — no pink meat and juices running clear (74 °C if you have a thermometer). Reheat leftovers until steaming hot all the way through, and reheat only once.' },
  { id: 'st5', title: 'Packed lunches for long commutes', body: 'Food for a long college commute needs suitable insulated containers and temperature control: pack hot food piping hot in a pre-warmed insulated box (fill it with hot water for 5 minutes first), or pack cold food with an ice pack. Avoid packing rice, cooked meat or dairy-based dishes that will sit at room temperature for many hours. If unsure, choose drier foods like parathas, rolls and dry sabzi.' },
  { id: 'st6', title: 'Label frozen portions', body: 'Label every frozen box with the dish name and the date it was cooked/frozen. Thaw in the fridge (not on the counter) and use the oldest first.' },
  { id: 'st7', title: 'Leftovers — when in doubt, throw it out', body: 'Eat refrigerated leftovers within 1–2 days; rice within 24 hours. Many food-safety agencies cite 3–4 days as an upper limit for cooked dishes kept at 5 °C or below. Smell and appearance are not reliable tests — if you are unsure, discard.' },
  { id: 'st8', title: 'Pulses that need full cooking', body: 'Rajma (kidney beans) must be soaked and boiled or pressure-cooked until completely soft. Undercooked kidney beans can make people ill.' },
];

/** Editable sample week: realistic home food, ~4 non-veg days, packed lunches Mon–Fri. */
function sampleWeek(s: Settings, start: string): MealEntry[] {
  const p = s.peoplePerMeal;
  const meals: MealEntry[] = [];
  const add = (day: number, slot: MealSlot, recipeIds: string[], extra: Partial<MealEntry> = {}) => {
    const people = extra.people ?? p[slot];
    meals.push({
      id: uid('ml'),
      date: addDays(start, day),
      slot,
      dishes: recipeIds.map((recipeId) => ({ recipeId, servings: people })),
      people,
      status: 'planned',
      ...extra,
    });
  };
  // Mon
  add(0, 'breakfast', ['aloo-paratha'], { reminder: 'Boil potatoes the night before.' });
  add(0, 'packed', ['aloo-paratha'], { notes: 'With pickle & dahi in a separate small box.' });
  add(0, 'lunch', ['moong-dal', 'plain-rice']);
  add(0, 'snacks', ['masala-chai']);
  add(0, 'dinner', ['chicken-curry', 'roti'], { reminder: 'Marinate chicken after lunch.' });
  // Tue
  add(1, 'breakfast', ['omelette']);
  add(1, 'packed', ['veg-sandwich']);
  add(1, 'lunch', ['aloo-gobi', 'roti']);
  add(1, 'snacks', ['masala-chai']);
  add(1, 'dinner', ['masoor-dal', 'plain-rice', 'bhindi'], { reminder: 'Soak rajma tonight for tomorrow.' });
  // Wed
  add(2, 'breakfast', ['poha']);
  add(2, 'packed', ['aloo-jeera', 'roti']);
  add(2, 'lunch', ['rajma', 'plain-rice']);
  add(2, 'snacks', ['masala-chai']);
  add(2, 'dinner', ['egg-curry', 'roti']);
  // Thu
  add(3, 'breakfast', ['aloo-paratha']);
  add(3, 'packed', ['veg-sandwich']);
  add(3, 'lunch', [], { title: 'Leftover rajma-chawal', isLeftover: true });
  add(3, 'snacks', ['masala-chai']);
  add(3, 'dinner', ['veg-khichdi', 'raita'], { notes: 'Light dinner.' });
  // Fri
  add(4, 'breakfast', ['omelette']);
  add(4, 'packed', ['chicken-roll'], { notes: 'Use the egg-roll variation if chicken is not available.' });
  add(4, 'lunch', ['moong-dal', 'plain-rice', 'bhindi']);
  add(4, 'snacks', ['masala-chai']);
  add(4, 'dinner', ['chicken-pulao', 'raita'], { reminder: 'Soak chole tonight for Saturday.' });
  // Sat
  add(5, 'breakfast', ['poha']);
  add(5, 'lunch', ['chole', 'plain-rice'], { people: 5 });
  add(5, 'snacks', ['veg-noodles']);
  add(5, 'dinner', ['chicken-burger']);
  // Sun
  add(6, 'breakfast', ['aloo-paratha']);
  add(6, 'lunch', ['chicken-biryani', 'raita'], { people: 5, reminder: 'Marinate chicken by 11 AM.' });
  add(6, 'snacks', ['masala-chai']);
  add(6, 'dinner', ['masoor-dal', 'roti']);
  return meals;
}

export function createSeedData(ref: string = today()): AppData {
  const settings = defaultSettings();
  const start = startOfWeek(ref, settings.weekStartsOn);
  const t = nowISO();
  return {
    meta: { schemaVersion: SCHEMA_VERSION, createdAt: t, updatedAt: t, deviceId: uid('dev') },
    settings,
    ingredients: structuredClone(seedIngredients),
    recipes: structuredClone(seedRecipes),
    meals: sampleWeek(settings, start),
    groceryLists: [],
    groceryItems: [],
    pantry: seedPantry(),
    stockMovements: [],
    expenses: [],
    equipment: seedEquipment(),
    cookingSessions: [],
    learningProgress: {},
    checklists: {},
    safetyTips: seedSafetyTips(),
    preferences: { plannerView: 'week', groceryGroupBy: 'category' },
  };
}

/** A blank workspace (keeps settings, catalog, recipes and equipment; clears plans and records). */
export function createEmptyData(): AppData {
  const d = createSeedData();
  d.meals = [];
  d.pantry = [];
  return d;
}
