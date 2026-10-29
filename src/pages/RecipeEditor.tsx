import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Field, NumberInput, PageHeader } from '../components/ui';
import { DIFFICULTY_LABEL, GROCERY_CATEGORIES, RECIPE_CATEGORIES, UNITS } from '../domain/constants';
import type { Diet, Difficulty, GroceryCategory, Recipe, RecipeCategory, Unit } from '../domain/types';
import { findIngredientByName } from '../domain/recipes';
import { nowISO, uid } from '../domain/util';

interface IngRow {
  key: string;
  name: string;
  qty?: number;
  unit: Unit;
  note: string;
  optional: boolean;
  substitution: string;
  newCategory: GroceryCategory;
}
interface StepRow {
  key: string;
  text: string;
  timerMin?: number;
}

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Resize an uploaded image to keep backups small. */
async function resizeImage(file: File, max = 900): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read image'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function RecipeEditor() {
  const { id } = useParams();
  const { data, update, toast } = useApp();
  const nav = useNavigate();
  const existing = id ? data.recipes.find((r) => r.id === id) : undefined;
  const ingName = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i.name])), [data.ingredients]);

  const [r, setR] = useState(() => ({
    name: existing?.name ?? '',
    category: existing?.category ?? ('dinner' as RecipeCategory),
    cuisine: existing?.cuisine ?? 'North Indian home-style',
    tags: existing?.tags.join(', ') ?? '',
    diet: existing?.diet ?? ('veg' as Diet),
    dietaryNotes: existing?.dietaryNotes ?? '',
    halalNotes: existing?.halalNotes ?? '',
    servings: existing?.servings ?? data.settings.defaultServings,
    prepMin: existing?.prepMin ?? 15,
    cookMin: existing?.cookMin ?? 20,
    difficulty: existing?.difficulty ?? ('easy' as Difficulty),
    equipmentIds: existing?.equipmentIds ?? ['gas-stove'],
    tips: existing?.tips.join('\n') ?? '',
    mistakes: existing?.mistakes.join('\n') ?? '',
    storage: existing?.storage ?? '',
    notes: existing?.notes ?? '',
    photo: existing?.photo,
  }));
  const [ings, setIngs] = useState<IngRow[]>(() =>
    existing
      ? existing.ingredients.map((x) => ({ key: x.id, name: ingName.get(x.ingredientId) ?? '', qty: x.qty, unit: x.unit, note: x.note ?? '', optional: !!x.optional, substitution: x.substitution ?? '', newCategory: 'vegetables' }))
      : [{ key: uid(), name: '', qty: undefined, unit: 'g', note: '', optional: false, substitution: '', newCategory: 'vegetables' }],
  );
  const [steps, setSteps] = useState<StepRow[]>(() => (existing ? existing.steps.map((s) => ({ key: s.id, text: s.text, timerMin: s.timerMin })) : [{ key: uid(), text: '' }]));
  const [errors, setErrors] = useState<string[]>([]);

  const set = <K extends keyof typeof r>(k: K, v: (typeof r)[K]) => setR((p) => ({ ...p, [k]: v }));
  const updIng = (i: number, patch: Partial<IngRow>) => setIngs((p) => p.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveStep = (i: number, dir: number) =>
    setSteps((p) => {
      const n = [...p];
      const j = i + dir;
      if (j < 0 || j >= n.length) return p;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const save = () => {
    const errs: string[] = [];
    if (!r.name.trim()) errs.push('Give the recipe a name.');
    if (!(r.servings > 0)) errs.push('Servings must be at least 1.');
    const ingRows = ings.filter((x) => x.name.trim());
    if (!ingRows.length) errs.push('Add at least one ingredient.');
    ingRows.forEach((x) => !(x.qty! > 0) && errs.push(`Enter a quantity for “${x.name}”.`));
    const stepRows = steps.filter((s) => s.text.trim());
    if (!stepRows.length) errs.push('Add at least one step.');
    setErrors(errs);
    if (errs.length) return;

    const recipeId = existing?.id ?? uid('rc');
    update((d) => {
      const resolved = ingRows.map((x) => {
        let ing = findIngredientByName(d.ingredients, x.name);
        if (!ing) {
          ing = { id: uid('ing'), name: x.name.trim(), category: x.newCategory };
          d.ingredients.push(ing);
        }
        return { id: uid('ri'), ingredientId: ing.id, qty: x.qty!, unit: x.unit, note: x.note.trim() || undefined, optional: x.optional || undefined, substitution: x.substitution.trim() || undefined };
      });
      const rec: Recipe = {
        ...(existing ?? { favourite: false, timesCooked: 0, createdAt: nowISO() }),
        id: recipeId,
        name: r.name.trim(),
        category: r.category,
        cuisine: r.cuisine.trim(),
        tags: r.tags.split(',').map((t) => t.trim()).filter(Boolean),
        diet: r.diet,
        dietaryNotes: r.dietaryNotes.trim() || undefined,
        halalNotes: r.halalNotes.trim() || undefined,
        servings: r.servings,
        prepMin: r.prepMin || 0,
        cookMin: r.cookMin || 0,
        difficulty: r.difficulty,
        ingredients: resolved,
        steps: stepRows.map((s) => ({ id: uid('st'), text: s.text.trim(), timerMin: s.timerMin || undefined })),
        equipmentIds: r.equipmentIds,
        tips: lines(r.tips),
        mistakes: lines(r.mistakes),
        storage: r.storage.trim() || undefined,
        notes: r.notes.trim() || undefined,
        photo: r.photo,
        updatedAt: nowISO(),
      } as Recipe;
      const i = d.recipes.findIndex((x) => x.id === recipeId);
      if (i >= 0) d.recipes[i] = rec;
      else d.recipes.push(rec);
    }, existing ? 'Recipe saved' : 'Recipe created');
    nav(`/recipes/${recipeId}`, { replace: true });
  };

  const onPhoto = async (f?: File) => {
    if (!f) return;
    try {
      set('photo', await resizeImage(f));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <div className="page narrow">
      <PageHeader
        title={existing ? `Edit: ${existing.name}` : 'New recipe'}
        actions={
          <>
            <button className="btn" onClick={() => nav(-1)}>
              Cancel
            </button>
            <button className="btn primary" onClick={save}>
              Save recipe
            </button>
          </>
        }
      />
      {errors.length > 0 && (
        <Alert kind="danger">
          <ul>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}

      <section className="card stack lg">
        <div className="form-grid cols-2">
          <Field label="Recipe name" className="full">
            <input type="text" value={r.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ammi’s chicken korma" autoFocus={!existing} />
          </Field>
          <Field label="Category">
            <select value={r.category} onChange={(e) => set('category', e.target.value as RecipeCategory)}>
              {RECIPE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Diet">
            <select value={r.diet} onChange={(e) => set('diet', e.target.value as Diet)}>
              <option value="veg">Vegetarian</option>
              <option value="egg">Egg</option>
              <option value="nonveg">Non-vegetarian</option>
            </select>
          </Field>
          <Field label="Cuisine">
            <input type="text" value={r.cuisine} onChange={(e) => set('cuisine', e.target.value)} />
          </Field>
          <Field label="Tags" hint="comma separated">
            <input type="text" value={r.tags} onChange={(e) => set('tags', e.target.value)} placeholder="tiffin, quick, weekend" />
          </Field>
        </div>
        <div className="form-grid cols-4">
          <Field label="Servings">
            <NumberInput value={r.servings} min={1} step={1} onChange={(n) => set('servings', n ?? 0)} />
          </Field>
          <Field label="Prep (min)">
            <NumberInput value={r.prepMin} min={0} step={1} onChange={(n) => set('prepMin', n ?? 0)} />
          </Field>
          <Field label="Active cooking (min)">
            <NumberInput value={r.cookMin} min={0} step={1} onChange={(n) => set('cookMin', n ?? 0)} />
          </Field>
          <Field label="Difficulty">
            <select value={r.difficulty} onChange={(e) => set('difficulty', e.target.value as Difficulty)}>
              {Object.entries(DIFFICULTY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="small faint">Total time ≈ {(r.prepMin || 0) + (r.cookMin || 0)} min (estimate).</p>
      </section>

      <section className="card stack">
        <div className="card-head">
          <h2>Ingredients</h2>
          <span className="small faint">Type an existing ingredient or a new one</span>
        </div>
        <datalist id="ingredient-names">
          {data.ingredients.map((i) => (
            <option key={i.id} value={i.name} />
          ))}
        </datalist>
        {ings.map((x, i) => {
          const isNew = x.name.trim() && !findIngredientByName(data.ingredients, x.name);
          return (
            <div key={x.key} className="edit-row ing">
              <input type="text" list="ingredient-names" value={x.name} onChange={(e) => updIng(i, { name: e.target.value })} placeholder="Ingredient" aria-label="Ingredient" />
              <NumberInput ariaLabel="Quantity" value={x.qty} min={0} onChange={(n) => updIng(i, { qty: n })} placeholder="Qty" />
              <select value={x.unit} onChange={(e) => updIng(i, { unit: e.target.value as Unit })} aria-label="Unit">
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <input type="text" value={x.note} onChange={(e) => updIng(i, { note: e.target.value })} placeholder="Note (chopped…)" aria-label="Note" />
              <button className="icon-btn danger" aria-label="Remove ingredient" onClick={() => setIngs((p) => p.filter((_, j) => j !== i))}>
                <Trash2 />
              </button>
              <div className="row gap wrap" style={{ gridColumn: '1 / -1' }}>
                <label className="check small">
                  <input type="checkbox" checked={x.optional} onChange={(e) => updIng(i, { optional: e.target.checked })} /> Optional
                </label>
                <input type="text" className="grow" style={{ minHeight: 32, flex: 1, minWidth: 180 }} value={x.substitution} onChange={(e) => updIng(i, { substitution: e.target.value })} placeholder="Substitution (optional)" aria-label="Substitution" />
                {isNew && (
                  <label className="row gap small">
                    New ingredient → category
                    <select style={{ width: 'auto', minHeight: 32 }} value={x.newCategory} onChange={(e) => updIng(i, { newCategory: e.target.value as GroceryCategory })}>
                      {GROCERY_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
          );
        })}
        <button className="btn" onClick={() => setIngs((p) => [...p, { key: uid(), name: '', unit: 'g', note: '', optional: false, substitution: '', newCategory: 'vegetables' }])}>
          <Plus /> Add ingredient
        </button>
      </section>

      <section className="card stack">
        <h2>Steps</h2>
        <p className="small faint">One action per step, in order. Add a timer (minutes) for waiting steps — it appears in cooking mode.</p>
        {steps.map((s, i) => (
          <div key={s.key} className="edit-row" style={{ gridTemplateColumns: 'auto 1fr' }}>
            <span className="badge primary" style={{ alignSelf: 'start', marginTop: 8 }}>
              {i + 1}
            </span>
            <div className="stack sm">
              <textarea value={s.text} onChange={(e) => setSteps((p) => p.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} rows={2} placeholder="Describe this step" aria-label={`Step ${i + 1}`} />
              <div className="row gap wrap">
                <span className="small muted">Timer</span>
                <div style={{ width: 90 }}>
                  <NumberInput ariaLabel="Timer minutes" value={s.timerMin} min={0} onChange={(n) => setSteps((p) => p.map((x, j) => (j === i ? { ...x, timerMin: n } : x)))} placeholder="min" />
                </div>
                <span className="grow" />
                <button className="icon-btn sm" aria-label="Move up" onClick={() => moveStep(i, -1)} disabled={i === 0}>
                  <ArrowUp />
                </button>
                <button className="icon-btn sm" aria-label="Move down" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>
                  <ArrowDown />
                </button>
                <button className="icon-btn sm danger" aria-label="Remove step" onClick={() => setSteps((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 />
                </button>
              </div>
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => setSteps((p) => [...p, { key: uid(), text: '' }])}>
          <Plus /> Add step
        </button>
      </section>

      <section className="card stack">
        <h2>Equipment needed</h2>
        <div className="grid-3" style={{ gap: 6 }}>
          {data.equipment.map((e) => (
            <label key={e.id} className="check small">
              <input
                type="checkbox"
                checked={r.equipmentIds.includes(e.id)}
                onChange={(ev) => set('equipmentIds', ev.target.checked ? [...r.equipmentIds, e.id] : r.equipmentIds.filter((x) => x !== e.id))}
              />
              {e.name}
              {(e.status === 'missing' || e.status === 'damaged') && <span className="badge danger">{e.status}</span>}
            </label>
          ))}
        </div>
      </section>

      <section className="card stack">
        <h2>Guidance & notes</h2>
        <div className="form-grid cols-2">
          <Field label="Beginner tips" hint="one per line">
            <textarea value={r.tips} onChange={(e) => set('tips', e.target.value)} rows={4} />
          </Field>
          <Field label="Common mistakes" hint="one per line">
            <textarea value={r.mistakes} onChange={(e) => set('mistakes', e.target.value)} rows={4} />
          </Field>
          <Field label="Storage & reheating">
            <textarea value={r.storage} onChange={(e) => set('storage', e.target.value)} rows={3} />
          </Field>
          <Field label="Notes">
            <textarea value={r.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
          </Field>
          <Field label="Dietary notes">
            <input type="text" value={r.dietaryNotes} onChange={(e) => set('dietaryNotes', e.target.value)} />
          </Field>
          <Field label="Halal sourcing notes">
            <input type="text" value={r.halalNotes} onChange={(e) => set('halalNotes', e.target.value)} placeholder="e.g. Buy from halal butcher" />
          </Field>
        </div>
      </section>

      <section className="card stack">
        <h2>Photo</h2>
        {r.photo ? (
          <div className="stack">
            <img src={r.photo} alt="" className="photo-hero" />
            <button className="btn danger" onClick={() => set('photo', undefined)}>
              <X /> Remove photo
            </button>
          </div>
        ) : (
          <label className="btn" style={{ width: 'fit-content' }}>
            <ImagePlus /> Add photo
            <input type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        )}
        <p className="small faint">Photos are resized and stored with your data (they make backups larger).</p>
      </section>

      <div className="row gap" style={{ justifyContent: 'flex-end' }}>
        <button className="btn" onClick={() => nav(-1)}>
          Cancel
        </button>
        <button className="btn primary" onClick={save}>
          Save recipe
        </button>
      </div>
    </div>
  );
}
