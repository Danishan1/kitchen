import type { AppData } from './types';
import { SCHEMA_VERSION } from './types';
import { defaultSettings, seedSafetyTips } from '../data/seed';
import { nowISO, uid } from './util';

const ARRAY_KEYS = [
  'ingredients', 'recipes', 'meals', 'groceryLists', 'groceryItems', 'pantry', 'stockMovements',
  'expenses', 'equipment', 'cookingSessions', 'safetyTips',
] as const;

export class ImportError extends Error {
  constructor(public problems: string[]) {
    super(problems.join('\n'));
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Bring any older (or partial) data object up to the current schema without
 * losing fields. New fields get defaults; unknown extra fields are kept.
 */
export function migrate(raw: unknown): AppData {
  if (!isObj(raw)) throw new ImportError(['Data is not an object.']);
  const d = raw as Record<string, unknown>;
  const meta = isObj(d.meta) ? d.meta : {};
  const version = typeof meta.schemaVersion === 'number' ? meta.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new ImportError([`This backup was made by a newer version of the app (schema ${version}). Update the app before importing.`]);
  }

  const out = { ...d } as unknown as AppData;
  for (const k of ARRAY_KEYS) if (!Array.isArray(out[k])) (out as unknown as Record<string, unknown>)[k] = [];
  out.settings = { ...defaultSettings(), ...(isObj(d.settings) ? (d.settings as object) : {}) };
  out.settings.mealTimes = { ...defaultSettings().mealTimes, ...(out.settings.mealTimes ?? {}) };
  out.settings.peoplePerMeal = { ...defaultSettings().peoplePerMeal, ...(out.settings.peoplePerMeal ?? {}) };
  if (!Array.isArray(out.settings.members)) out.settings.members = [];
  out.learningProgress = isObj(d.learningProgress) ? (d.learningProgress as AppData['learningProgress']) : {};
  out.checklists = isObj(d.checklists) ? (d.checklists as AppData['checklists']) : {};
  out.preferences = { plannerView: 'week', groceryGroupBy: 'category', ...(isObj(d.preferences) ? (d.preferences as object) : {}) };
  if (!out.safetyTips.length) out.safetyTips = seedSafetyTips();

  // Per-record defaults (v0 → v1 and defensive repair)
  const withDefaults = <T,>(defaults: Partial<T>, rec: T): T => Object.assign({}, defaults, rec);
  out.recipes = out.recipes.map((r) =>
    withDefaults(
      {
        tags: [], tips: [], mistakes: [], equipmentIds: [], steps: [], ingredients: [], favourite: false, timesCooked: 0,
        cuisine: 'Indian', diet: 'veg', difficulty: 'easy', category: 'lunch', servings: 5, prepMin: 0, cookMin: 0,
        createdAt: nowISO(), updatedAt: nowISO(),
      },
      r,
    ),
  );
  out.meals = out.meals.map((m) => withDefaults({ dishes: [], people: 1, status: 'planned' }, m));
  out.groceryItems = out.groceryItems.map((i) => withDefaults({ source: 'manual', purchased: false, category: 'household' }, i));
  out.equipment = out.equipment.map((e) => withDefaults({ quantity: 1, status: 'owned', category: 'cooking' }, e));

  out.meta = {
    createdAt: typeof meta.createdAt === 'string' ? meta.createdAt : nowISO(),
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : nowISO(),
    deviceId: typeof meta.deviceId === 'string' ? meta.deviceId : uid('dev'),
    schemaVersion: SCHEMA_VERSION,
  };
  return out;
}

/** Validate an imported JSON string. Returns migrated data or throws ImportError with readable problems. */
export function parseImport(json: string): AppData {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new ImportError([`The file is not valid JSON (${(e as Error).message}).`]);
  }
  if (!isObj(raw)) throw new ImportError(['The file does not contain a Family Kitchen OS backup object.']);
  // Accept both a raw AppData and the export envelope { app, exportedAt, data }.
  const data = isObj(raw.data) && raw.app === 'family-kitchen-os' ? raw.data : raw;
  if (!isObj(data)) throw new ImportError(['Backup has no data.']);
  const problems: string[] = [];
  const looksLikeApp = ['recipes', 'meals', 'settings'].some((k) => k in data);
  if (!looksLikeApp) problems.push('This does not look like a Family Kitchen OS backup (no recipes, meals or settings found).');
  for (const k of ARRAY_KEYS) if (k in data && !Array.isArray(data[k])) problems.push(`"${k}" should be a list.`);
  if (Array.isArray(data.recipes)) {
    data.recipes.forEach((r, i) => {
      if (!isObj(r) || typeof r.id !== 'string' || typeof r.name !== 'string') problems.push(`Recipe #${i + 1} is missing an id or name.`);
      else if (r.ingredients !== undefined && !Array.isArray(r.ingredients)) problems.push(`Recipe "${r.name}" has invalid ingredients.`);
    });
  }
  if (Array.isArray(data.meals)) {
    data.meals.forEach((m, i) => {
      if (!isObj(m) || typeof m.id !== 'string' || typeof m.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.date as string)) problems.push(`Meal #${i + 1} has an invalid id or date.`);
    });
  }
  if (Array.isArray(data.expenses)) {
    data.expenses.forEach((e, i) => {
      if (!isObj(e) || typeof e.amount !== 'number' || !isFinite(e.amount as number)) problems.push(`Expense #${i + 1} has an invalid amount.`);
    });
  }
  if (problems.length) throw new ImportError(problems.slice(0, 12));
  return migrate(data);
}

export function exportEnvelope(d: AppData): string {
  return JSON.stringify({ app: 'family-kitchen-os', exportedAt: nowISO(), schemaVersion: SCHEMA_VERSION, data: d }, null, 2);
}
