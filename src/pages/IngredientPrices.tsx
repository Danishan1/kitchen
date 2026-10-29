import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Field, Modal, NumberInput, PageHeader, useConfirm } from '../components/ui';
import { GROCERY_CATEGORIES, UNITS, groceryCategoryLabel } from '../domain/constants';
import type { GroceryCategory, Ingredient, Unit } from '../domain/types';
import { normalizeName, uid } from '../domain/util';

export function IngredientPrices() {
  const { data, update } = useApp();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.recipes) for (const ri of r.ingredients) m.set(ri.ingredientId, (m.get(ri.ingredientId) ?? 0) + 1);
    return m;
  }, [data.recipes]);

  const rows = data.ingredients
    .filter((i) => (!cat || i.category === cat) && (!q || normalizeName(i.name).includes(normalizeName(q))))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const patch = (id: string, p: Partial<Ingredient>) =>
    update((d) => {
      const i = d.ingredients.find((x) => x.id === id);
      if (i) Object.assign(i, p);
    });

  const remove = async (ing: Ingredient) => {
    const inRecipes = usage.get(ing.id) ?? 0;
    const inPantry = data.pantry.some((p) => p.ingredientId === ing.id);
    const inLists = data.groceryItems.some((g) => g.ingredientId === ing.id);
    if (inRecipes || inPantry || inLists) {
      await confirm({ title: 'Ingredient in use', message: `“${ing.name}” is used in ${inRecipes} recipe(s)${inPantry ? ', the pantry' : ''}${inLists ? ', shopping lists' : ''}. Remove it from those first.`, confirmLabel: 'OK', cancelLabel: 'Close' });
      return;
    }
    if (!(await confirm({ title: `Delete “${ing.name}”?`, confirmLabel: 'Delete', danger: true }))) return;
    update((d) => void (d.ingredients = d.ingredients.filter((x) => x.id !== ing.id)), 'Ingredient deleted');
  };

  return (
    <div className="page">
      <Link to="/recipes" className="btn ghost" style={{ width: 'fit-content' }}>
        <ArrowLeft /> Recipes
      </Link>
      <PageHeader
        title="Ingredient prices"
        sub="Your price list drives recipe and shopping-list estimates. Update it from real bills — estimates are never guaranteed."
        actions={
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus /> Add ingredient
          </button>
        }
      />
      <Alert kind="info">
        <b>Piece weight</b> and <b>g per tsp</b> are optional approximations. They let the app convert “2 onions” into kg for shopping, and teaspoons of spice into grams for costing. Leave blank if unsure — the app then won’t convert.
      </Alert>
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search ingredients" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Category</th>
                <th className="right">Price ₹</th>
                <th>per</th>
                <th>Buy in</th>
                <th className="right">Piece wt (g)</th>
                <th className="right">g / tsp</th>
                <th className="right">Recipes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td style={{ minWidth: 170 }}>
                    <input type="text" defaultValue={i.name} onBlur={(e) => e.target.value.trim() && e.target.value !== i.name && patch(i.id, { name: e.target.value.trim() })} aria-label="Name" />
                  </td>
                  <td>
                    <select value={i.category} onChange={(e) => patch(i.id, { category: e.target.value as GroceryCategory })} aria-label="Category" style={{ minWidth: 130 }}>
                      {GROCERY_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ width: 90 }}>
                    <NumberInput ariaLabel="Price" value={i.price} min={0} onChange={(n) => patch(i.id, { price: n, priceQty: i.priceQty ?? 1, priceUnit: i.priceUnit ?? 'kg' })} placeholder="—" />
                  </td>
                  <td>
                    <div className="input-group" style={{ minWidth: 140 }}>
                      <div style={{ width: 60 }}>
                        <NumberInput ariaLabel="Price quantity" value={i.priceQty ?? 1} min={0} onChange={(n) => patch(i.id, { priceQty: n || 1 })} />
                      </div>
                      <select value={i.priceUnit ?? 'kg'} onChange={(e) => patch(i.id, { priceUnit: e.target.value as Unit })} aria-label="Price unit">
                        {UNITS.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td>
                    <select value={i.buyUnit ?? ''} onChange={(e) => patch(i.id, { buyUnit: (e.target.value || undefined) as Unit | undefined })} aria-label="Shopping unit" style={{ minWidth: 80 }}>
                      <option value="">as recipe</option>
                      {UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={{ width: 90 }}>
                    <NumberInput ariaLabel="Piece weight grams" value={i.pcGrams} min={0} onChange={(n) => patch(i.id, { pcGrams: n || undefined })} placeholder="—" />
                  </td>
                  <td style={{ width: 80 }}>
                    <NumberInput ariaLabel="Grams per teaspoon" value={i.tspGrams} min={0} onChange={(n) => patch(i.id, { tspGrams: n || undefined })} placeholder="—" />
                  </td>
                  <td className="right num">{usage.get(i.id) ?? 0}</td>
                  <td className="actions">
                    <button className="icon-btn sm danger" aria-label={`Delete ${i.name}`} onClick={() => remove(i)}>
                      <Trash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small faint">{rows.length} ingredients · grouped by {cat ? groceryCategoryLabel(cat as GroceryCategory) : 'category'}</p>
      {adding && <AddIngredient onClose={() => setAdding(false)} />}
    </div>
  );
}

function AddIngredient({ onClose }: { onClose: () => void }) {
  const { data, update } = useApp();
  const [i, setI] = useState<Ingredient>({ id: uid('ing'), name: '', category: 'vegetables', priceQty: 1, priceUnit: 'kg' });
  const dupe = data.ingredients.some((x) => normalizeName(x.name) === normalizeName(i.name));
  return (
    <Modal
      open
      onClose={onClose}
      size="small"
      title="Add ingredient"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!i.name.trim() || dupe}
            onClick={() => {
              update((d) => void d.ingredients.push({ ...i, name: i.name.trim() }), 'Ingredient added');
              onClose();
            }}
          >
            Add
          </button>
        </>
      }
    >
      <Field label="Name">
        <input type="text" value={i.name} onChange={(e) => setI({ ...i, name: e.target.value })} autoFocus />
      </Field>
      {dupe && <p className="small error-text">An ingredient with this name already exists.</p>}
      <Field label="Category">
        <select value={i.category} onChange={(e) => setI({ ...i, category: e.target.value as GroceryCategory })}>
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid cols-3">
        <Field label="Price ₹">
          <NumberInput value={i.price} min={0} onChange={(n) => setI({ ...i, price: n })} />
        </Field>
        <Field label="per qty">
          <NumberInput value={i.priceQty} min={0} onChange={(n) => setI({ ...i, priceQty: n })} />
        </Field>
        <Field label="unit">
          <select value={i.priceUnit} onChange={(e) => setI({ ...i, priceUnit: e.target.value as Unit })}>
            {UNITS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
