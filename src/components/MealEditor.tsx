import { useMemo, useState } from 'react';
import { Copy, Lightbulb, Plus, Trash2 } from 'lucide-react';
import type { MealEntry, MealSlot } from '../domain/types';
import { useApp } from '../store';
import { Alert, Field, Modal, NumberInput, useConfirm } from './ui';
import { MEAL_SLOTS, MEAL_STATUS_LABEL, RECIPE_CATEGORIES, slotLabel } from '../domain/constants';
import { mealTime, newMeal, setMealStatus, suggestRecipes } from '../domain/planner';
import { aggregateRequirements } from '../domain/grocery';
import { formatDay, formatMinutes } from '../domain/dates';
import { formatAmount, humanize } from '../domain/units';
import { missingEquipment } from '../domain/recipes';
import { uid } from '../domain/util';

export interface MealEditorTarget {
  mealId?: string;
  date: string;
  slot: MealSlot;
  /** Pre-fill a dish when adding from a recipe page. */
  recipeId?: string;
}

export function RecipeSelect({ value, onChange, id }: { value: string; onChange: (id: string) => void; id?: string }) {
  const { data } = useApp();
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Recipe">
      <option value="">Choose a recipe…</option>
      {RECIPE_CATEGORIES.map((c) => {
        const rs = data.recipes.filter((r) => r.category === c.id).sort((a, b) => a.name.localeCompare(b.name));
        if (!rs.length) return null;
        return (
          <optgroup key={c.id} label={c.label}>
            {rs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.favourite ? ' ★' : ''}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function MealEditor({ target, onClose }: { target: MealEditorTarget | null; onClose: () => void }) {
  if (!target) return null;
  return <MealEditorInner key={(target.mealId ?? '') + target.date + target.slot} target={target} onClose={onClose} />;
}

function MealEditorInner({ target, onClose }: { target: MealEditorTarget; onClose: () => void }) {
  const { data, update } = useApp();
  const confirm = useConfirm();
  const existing = target.mealId ? data.meals.find((m) => m.id === target.mealId) : undefined;
  const [m, setM] = useState<MealEntry>(() => {
    if (existing) return structuredClone(existing);
    const fresh = newMeal(target.date, target.slot, data.settings.peoplePerMeal[target.slot]);
    if (target.recipeId) fresh.dishes = [{ recipeId: target.recipeId, servings: fresh.people }];
    return fresh;
  });
  const [showSuggest, setShowSuggest] = useState(!existing);
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const suggestions = useMemo(() => (showSuggest ? suggestRecipes(data, m.date, m.slot, 6) : []), [showSuggest, data, m.date, m.slot]);
  const reqs = useMemo(() => aggregateRequirements(data, [{ ...m, status: 'planned' }]), [data, m]);
  const ingName = new Map(data.ingredients.map((i) => [i.id, i.name]));
  const eqWarnings = m.dishes.flatMap((x) => {
    const r = recipes.get(x.recipeId);
    return r ? missingEquipment(r, data.equipment).map((w) => `${r.name}: ${w.name} (${w.reason})`) : [];
  });

  const set = <K extends keyof MealEntry>(k: K, v: MealEntry[K]) => setM((p) => ({ ...p, [k]: v }));
  const setPeople = (n: number) =>
    setM((p) => ({ ...p, people: n, dishes: p.dishes.map((d) => (d.servings === p.people ? { ...d, servings: n } : d)) }));

  const addDish = (recipeId = '') => {
    if (recipeId && m.dishes.some((d) => d.recipeId === recipeId)) return;
    setM((p) => ({ ...p, dishes: [...p.dishes, { recipeId, servings: p.people }] }));
  };

  const save = () => {
    const clean = { ...m, dishes: m.dishes.filter((d) => d.recipeId) };
    if (!clean.dishes.length && !clean.title?.trim()) return;
    update((d) => {
      const prevStatus = existing?.status;
      const idx = d.meals.findIndex((x) => x.id === clean.id);
      const toSave = { ...clean, status: prevStatus ?? 'planned' } as MealEntry;
      if (idx >= 0) d.meals[idx] = { ...d.meals[idx], ...toSave };
      else d.meals.push(toSave);
      if (clean.status !== (prevStatus ?? 'planned')) setMealStatus(d, clean.id, clean.status, clean.replacedWith);
    }, existing ? 'Meal updated' : 'Meal added');
    onClose();
  };

  const remove = async () => {
    if (!existing) return onClose();
    if (!(await confirm({ title: 'Remove this meal?', message: 'It will be removed from the plan. Recipes are not affected.', confirmLabel: 'Remove', danger: true }))) return;
    update((d) => {
      if (existing.pantryDeducted) setMealStatus(d, existing.id, 'planned');
      d.meals = d.meals.filter((x) => x.id !== existing.id);
    }, 'Meal removed');
    onClose();
  };

  const duplicate = () => {
    update((d) => {
      d.meals.push({ ...structuredClone(m), id: uid('ml'), status: 'planned', pantryDeducted: false });
    }, 'Meal duplicated');
    onClose();
  };

  const valid = m.dishes.some((d) => d.recipeId) || !!m.title?.trim();

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title={`${existing ? 'Edit' : 'Add'} ${slotLabel(m.slot).toLowerCase()} · ${formatDay(m.date)}`}
      footer={
        <>
          {existing && (
            <>
              <button className="btn danger" onClick={remove}>
                <Trash2 /> Remove
              </button>
              <button className="btn" onClick={duplicate} title="Create a copy (then move it)">
                <Copy /> Duplicate
              </button>
            </>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Save meal
          </button>
        </>
      }
    >
      <div className="form-grid cols-4">
        <Field label="Date">
          <input type="date" value={m.date} onChange={(e) => e.target.value && set('date', e.target.value)} />
        </Field>
        <Field label="Meal">
          <select value={m.slot} onChange={(e) => set('slot', e.target.value as MealSlot)}>
            {MEAL_SLOTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="People eating">
          <NumberInput value={m.people} min={0} step={1} onChange={(n) => setPeople(Math.max(0, Math.round(n ?? 0)))} />
        </Field>
        <Field label="Status">
          <select value={m.status} onChange={(e) => set('status', e.target.value as MealEntry['status'])}>
            {Object.entries(MEAL_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {m.status === 'replaced' && (
          <Field label="Replaced with" className="full">
            <input type="text" value={m.replacedWith ?? ''} onChange={(e) => set('replacedWith', e.target.value)} placeholder="e.g. Ordered from outside / Maggi" />
          </Field>
        )}
      </div>

      <div className="stack">
        <div className="row between">
          <span className="field-label">Dishes &amp; servings</span>
          <div className="btn-group">
            <button className="btn sm ghost" onClick={() => setShowSuggest((v) => !v)}>
              <Lightbulb /> {showSuggest ? 'Hide' : 'Suggest'}
            </button>
            <button className="btn sm" onClick={() => addDish()}>
              <Plus /> Add dish
            </button>
          </div>
        </div>
        {m.dishes.length === 0 && <p className="small faint">No recipe yet — add a dish, pick a suggestion, or just type a title below (e.g. "Leftover rajma-chawal").</p>}
        {m.dishes.map((dish, i) => (
          <div className="dish-row" key={i}>
            <RecipeSelect
              value={dish.recipeId}
              onChange={(id) => setM((p) => ({ ...p, dishes: p.dishes.map((x, j) => (j === i ? { ...x, recipeId: id } : x)) }))}
            />
            <NumberInput
              ariaLabel="Servings"
              value={dish.servings}
              min={1}
              step={1}
              onChange={(n) => setM((p) => ({ ...p, dishes: p.dishes.map((x, j) => (j === i ? { ...x, servings: Math.max(1, Math.round(n ?? 1)) } : x)) }))}
            />
            <button className="icon-btn danger" aria-label="Remove dish" onClick={() => setM((p) => ({ ...p, dishes: p.dishes.filter((_, j) => j !== i) }))}>
              <Trash2 />
            </button>
          </div>
        ))}
        {showSuggest && (
          <div className="card" style={{ background: 'var(--surface-2)', boxShadow: 'none' }}>
            <div className="small bold" style={{ marginBottom: 6 }}>
              Suggestions for {slotLabel(m.slot).toLowerCase()}
            </div>
            {suggestions.length === 0 && <p className="small faint">No matching recipes for this meal type yet.</p>}
            <div className="stack sm">
              {suggestions.map((s) => (
                <button key={s.recipe.id} className="btn sm ghost" style={{ justifyContent: 'flex-start', height: 'auto', padding: '6px 8px' }} onClick={() => addDish(s.recipe.id)}>
                  <Plus />
                  <span className="truncate" style={{ textAlign: 'left' }}>
                    <b>{s.recipe.name}</b>
                    {s.reasons.length > 0 && <span className="faint"> · {s.reasons.join(' · ')}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="form-grid cols-2">
        <Field label="Title" hint="optional">
          <input type="text" value={m.title ?? ''} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Sunday special" />
        </Field>
        <label className="check" style={{ alignSelf: 'end', minHeight: 38 }}>
          <input type="checkbox" checked={!!m.isLeftover} onChange={(e) => set('isLeftover', e.target.checked)} />
          Leftover-based meal (no new shopping needed)
        </label>
        <Field label="Preparation reminder" hint="shows on dashboard checklist">
          <input type="text" value={m.reminder ?? ''} onChange={(e) => set('reminder', e.target.value)} placeholder="e.g. Soak rajma the night before" />
        </Field>
        <Field label="Notes">
          <input type="text" value={m.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Less spicy for Ammi" />
        </Field>
      </div>

      {eqWarnings.length > 0 && (
        <Alert kind="warn">
          Equipment marked unavailable: {eqWarnings.join('; ')}
        </Alert>
      )}

      {m.dishes.some((d) => d.recipeId) && (
        <details>
          <summary>
            Planned ingredients · est. {formatMinutes(mealTime(m, recipes))} cooking
          </summary>
          {m.isLeftover ? (
            <p className="small faint">Leftover meal — no ingredients added to shopping lists.</p>
          ) : (
            <ul className="small" style={{ columns: 2, marginTop: 6 }}>
              {reqs.map((r) => {
                const h = humanize(r.baseQty, r.baseUnit);
                return (
                  <li key={r.ingredientId + r.dim}>
                    {ingName.get(r.ingredientId)} — {formatAmount(h.qty, h.unit)}
                  </li>
                );
              })}
            </ul>
          )}
        </details>
      )}
    </Modal>
  );
}
