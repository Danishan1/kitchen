import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Minus, Package, Pencil, Plus, Printer, Search, Trash2, Wrench } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Empty, Field, Modal, NumberInput, PageHeader, Tabs, useConfirm } from '../components/ui';
import { EQUIPMENT_STATUS_LABEL, GROCERY_CATEGORIES, UNITS, groceryCategoryLabel } from '../domain/constants';
import type { Equipment, GroceryCategory, PantryItem, Unit } from '../domain/types';
import { applyMovement, expiringSoon, lowStock, pantryStock } from '../domain/grocery';
import { aggregateRequirements } from '../domain/grocery';
import { formatDate, formatDateTime, relativeDays, today } from '../domain/dates';
import { formatAmount } from '../domain/units';
import { formatINR, normalizeName, nowISO, uid } from '../domain/util';
import { findIngredientByName, ingredientCost, missingEquipment } from '../domain/recipes';

type Tab = 'pantry' | 'equipment' | 'wishlist' | 'history';

export function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'pantry';
  const setTab = (t: Tab) => setParams({ tab: t }, { replace: true });
  return (
    <div className="page">
      <PageHeader
        title="Kitchen Inventory"
        sub="Pantry stock is only as accurate as what you record — unknown quantities are never subtracted from shopping lists."
        actions={
          <>
            <Link className="btn" to="/print/pantry">
              <Printer /> Print pantry
            </Link>
            <Link className="btn" to="/print/equipment">
              <Printer /> Print equipment
            </Link>
          </>
        }
      />
      <Tabs<Tab>
        label="Inventory sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'pantry', label: 'Pantry' },
          { value: 'equipment', label: 'Equipment' },
          { value: 'wishlist', label: 'Wishlist' },
          { value: 'history', label: 'Stock history' },
        ]}
      />
      {tab === 'pantry' && <Pantry />}
      {tab === 'equipment' && <EquipmentTab />}
      {tab === 'wishlist' && <Wishlist />}
      {tab === 'history' && <History />}
    </div>
  );
}

/* ------------------------------ Pantry ------------------------------ */

function Pantry() {
  const { data, update } = useApp();
  const confirm = useConfirm();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState<'' | 'low' | 'expiring' | 'unknown'>('');
  const [edit, setEdit] = useState<PantryItem | 'new' | null>(null);
  const [adjust, setAdjust] = useState<PantryItem | null>(null);
  const ingById = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i])), [data.ingredients]);
  const low = new Set(lowStock(data).map((p) => p.id));
  const exp = new Set(expiringSoon(data, 4).map((p) => p.id));
  const t = today();

  const rows = data.pantry
    .filter((p) => {
      const ing = ingById.get(p.ingredientId);
      if (cat && ing?.category !== cat) return false;
      if (q && !normalizeName(ing?.name ?? '').includes(normalizeName(q))) return false;
      if (filter === 'low' && !low.has(p.id)) return false;
      if (filter === 'expiring' && !exp.has(p.id)) return false;
      if (filter === 'unknown' && p.qty != null) return false;
      return true;
    })
    .sort((a, b) => (ingById.get(a.ingredientId)?.name ?? '').localeCompare(ingById.get(b.ingredientId)?.name ?? ''));

  // Recipes fully coverable by KNOWN stock
  const canCook = useMemo(() => {
    return data.recipes.filter((r) => {
      const reqs = aggregateRequirements(data, [{ id: 'x', date: t, slot: 'lunch', dishes: [{ recipeId: r.id, servings: r.servings }], people: r.servings, status: 'planned' }]);
      return reqs.length > 0 && reqs.every((q) => {
        const s = pantryStock(data.pantry, q.ingredientId, q.dim, ingById.get(q.ingredientId));
        return !s.unknown && s.known >= q.baseQty;
      });
    });
  }, [data, ingById, t]);

  const value = data.pantry.reduce((a, p) => a + (p.qty != null ? ingredientCost(ingById.get(p.ingredientId), p.qty, p.unit) ?? 0 : 0), 0);

  return (
    <>
      <div className="grid-3">
        <section className="card stat">
          <span className="label">Pantry items</span>
          <span className="value">{data.pantry.length}</span>
          <span className="sub">{data.pantry.filter((p) => p.qty == null).length} with unknown quantity</span>
        </section>
        <section className="card stat">
          <span className="label">Alerts</span>
          <span className="value">{low.size + exp.size}</span>
          <span className="sub">
            {low.size} low · {exp.size} expiring within 4 days
          </span>
        </section>
        <section className="card stat">
          <span className="label">Known stock value (est.)</span>
          <span className="value">{formatINR(value)}</span>
          <span className="sub">from your price list</span>
        </section>
      </div>

      <section className="card stack">
        <label className="check">
          <input type="checkbox" checked={data.settings.autoDeductPantry} onChange={(e) => update((d) => void (d.settings.autoDeductPantry = e.target.checked), e.target.checked ? 'Pantry will reduce when meals are marked prepared' : 'Automatic pantry reduction off')} />
          <span>
            Reduce pantry automatically when a planned meal is marked prepared
            <span className="small faint"> — only known quantities are reduced; un-marking restores them.</span>
          </span>
        </label>
      </section>

      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search pantry" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search pantry" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Status filter">
          <option value="">All items</option>
          <option value="low">Low stock</option>
          <option value="expiring">Expiring soon</option>
          <option value="unknown">Unknown quantity</option>
        </select>
        <button className="btn primary" onClick={() => setEdit('new')}>
          <Plus /> Add pantry item
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="card">
          <Empty icon={<Package />} title={data.pantry.length ? 'No items match' : 'Pantry is empty'}>
            Add items after shopping, or use “+ Pantry” on purchased shopping-list items.
          </Empty>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Min</th>
                  <th>Location</th>
                  <th>Bought</th>
                  <th>Best before</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const ing = ingById.get(p.ingredientId);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="bold">{ing?.name ?? 'Unknown'}</div>
                        <div className="tiny faint" style={{ maxWidth: 360 }}>
                          {ing ? groceryCategoryLabel(ing.category) : ''}
                          {p.notes ? ` · ${p.notes}` : ''}
                        </div>
                      </td>
                      <td className="nowrap">
                        {p.qty == null ? <span className="badge">unknown</span> : <span className={low.has(p.id) ? 'warn-text bold' : ''}>{formatAmount(p.qty, p.unit)}</span>}
                        {low.has(p.id) && <span className="badge warn" style={{ marginLeft: 4 }}>low</span>}
                      </td>
                      <td className="nowrap small">{p.minQty ? formatAmount(p.minQty, p.unit) : '—'}</td>
                      <td className="small">{p.location ?? '—'}</td>
                      <td className="small nowrap">{p.purchaseDate ? formatDate(p.purchaseDate, { day: 'numeric', month: 'short' }) : '—'}</td>
                      <td className="small nowrap">
                        {p.expiry ? <span className={exp.has(p.id) ? (p.expiry < t ? 'error-text bold' : 'warn-text bold') : ''}>{formatDate(p.expiry, { day: 'numeric', month: 'short' })} ({p.expiry < t ? 'expired' : relativeDays(p.expiry, t)})</span> : '—'}
                      </td>
                      <td className="actions">
                        <button className="icon-btn sm" aria-label={`Adjust ${ing?.name}`} title="Use / add / set stock" onClick={() => setAdjust(p)}>
                          <Plus />
                        </button>
                        <button className="icon-btn sm" aria-label={`Edit ${ing?.name}`} onClick={() => setEdit(p)}>
                          <Pencil />
                        </button>
                        <button
                          className="icon-btn sm danger"
                          aria-label={`Delete ${ing?.name}`}
                          onClick={async () => {
                            if (await confirm({ title: `Remove ${ing?.name} from pantry?`, confirmLabel: 'Remove', danger: true })) update((d) => void (d.pantry = d.pantry.filter((x) => x.id !== p.id)), 'Removed from pantry');
                          }}
                        >
                          <Trash2 />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <section className="card stack">
        <h2>Cookable with known stock</h2>
        {canCook.length === 0 ? (
          <p className="small faint">Record known quantities for your staples to see which recipes you can make without shopping.</p>
        ) : (
          <div className="row gap wrap">
            {canCook.map((r) => (
              <Link key={r.id} to={`/recipes/${r.id}`} className="badge ok" style={{ padding: '4px 10px', fontSize: '0.82rem' }}>
                {r.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {edit && <PantryEditor item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
      {adjust && <AdjustDialog item={adjust} onClose={() => setAdjust(null)} />}
    </>
  );
}

const LOCATIONS = ['Pantry shelf', 'Spice shelf', 'Kitchen counter', 'Refrigerator', 'Freezer', 'Store room'];

function PantryEditor({ item, onClose }: { item?: PantryItem; onClose: () => void }) {
  const { data, update } = useApp();
  const ing = item ? data.ingredients.find((i) => i.id === item.ingredientId) : undefined;
  const [f, setF] = useState({
    name: ing?.name ?? '',
    category: (ing?.category ?? 'vegetables') as GroceryCategory,
    unknown: item ? item.qty == null : false,
    qty: item?.qty ?? undefined,
    unit: item?.unit ?? ('kg' as Unit),
    minQty: item?.minQty,
    location: item?.location ?? '',
    purchaseDate: item?.purchaseDate ?? today(),
    expiry: item?.expiry ?? '',
    notes: item?.notes ?? '',
  });
  const match = findIngredientByName(data.ingredients, f.name);
  const valid = f.name.trim() && (f.unknown || f.qty != null);
  const save = () => {
    update((d) => {
      let ingredientId = match?.id;
      if (!ingredientId) {
        ingredientId = uid('ing');
        d.ingredients.push({ id: ingredientId, name: f.name.trim(), category: f.category });
      }
      const rec: PantryItem = {
        id: item?.id ?? uid('pi'),
        ingredientId,
        qty: f.unknown ? null : (f.qty ?? 0),
        unit: f.unit,
        minQty: f.minQty || undefined,
        location: f.location || undefined,
        purchaseDate: f.purchaseDate || undefined,
        expiry: f.expiry || undefined,
        notes: f.notes || undefined,
        updatedAt: nowISO(),
      };
      if (item) {
        const prev = d.pantry.find((x) => x.id === item.id)!;
        if (prev.qty != null && rec.qty != null && prev.qty !== rec.qty && prev.unit === rec.unit)
          d.stockMovements.push({ id: uid('mv'), ingredientId, delta: rec.qty - prev.qty, unit: rec.unit, reason: 'adjust', date: nowISO(), note: 'Edited in pantry' });
        Object.assign(prev, rec);
      } else {
        d.pantry.push(rec);
        if (rec.qty) d.stockMovements.push({ id: uid('mv'), ingredientId, delta: rec.qty, unit: rec.unit, reason: 'manual', date: nowISO(), note: 'Added to pantry' });
      }
    }, item ? 'Pantry item updated' : 'Added to pantry');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${ing?.name}` : 'Add pantry item'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <datalist id="pantry-ings">
        {data.ingredients.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
      <div className="form-grid cols-2">
        <Field label="Ingredient">
          <input type="text" list="pantry-ings" value={f.name} disabled={!!item} onChange={(e) => {
            const m = findIngredientByName(data.ingredients, e.target.value);
            setF({ ...f, name: e.target.value, unit: m?.buyUnit ?? m?.priceUnit ?? f.unit, category: m?.category ?? f.category });
          }} />
        </Field>
        {!match && !item && f.name.trim() ? (
          <Field label="Category (new ingredient)">
            <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as GroceryCategory })}>
              {GROCERY_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <Field label="Current quantity">
          <div className="input-group">
            <NumberInput value={f.unknown ? undefined : f.qty} min={0} onChange={(n) => setF({ ...f, qty: n })} placeholder={f.unknown ? 'unknown' : '0'} />
            <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })} style={{ width: 100 }}>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <label className="check" style={{ alignSelf: 'end', minHeight: 38 }}>
          <input type="checkbox" checked={f.unknown} onChange={(e) => setF({ ...f, unknown: e.target.checked })} /> I don’t know the quantity
        </label>
        <Field label="Minimum desired stock" hint="for low-stock alerts">
          <NumberInput value={f.minQty} min={0} onChange={(n) => setF({ ...f, minQty: n })} placeholder={`in ${f.unit}`} />
        </Field>
        <Field label="Storage location">
          <input type="text" list="locations" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
          <datalist id="locations">
            {LOCATIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Field>
        <Field label="Purchase date">
          <input type="date" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
        </Field>
        <Field label="Best before / expiry" hint="optional">
          <input type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} />
        </Field>
        <Field label="Notes" className="full">
          <input type="text" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

function AdjustDialog({ item, onClose }: { item: PantryItem; onClose: () => void }) {
  const { data, update } = useApp();
  const ing = data.ingredients.find((i) => i.id === item.ingredientId);
  const [mode, setMode] = useState<'use' | 'add' | 'set'>(item.qty == null ? 'set' : 'use');
  const [amount, setAmount] = useState<number | undefined>();
  const [unit, setUnit] = useState<Unit>(item.unit);
  const go = () => {
    if (amount == null) return;
    update((d) => {
      const p = d.pantry.find((x) => x.id === item.id)!;
      if (mode === 'set') {
        const prev = p.qty;
        p.qty = amount;
        p.unit = unit;
        p.updatedAt = nowISO();
        d.stockMovements.push({ id: uid('mv'), ingredientId: p.ingredientId, delta: prev == null ? amount : amount - prev, unit, reason: 'adjust', date: nowISO(), note: prev == null ? 'Quantity recorded (was unknown)' : 'Stock count' });
      } else {
        const mv = applyMovement(d, { ingredientId: p.ingredientId, delta: mode === 'use' ? -amount : amount, unit, reason: 'manual', note: mode === 'use' ? 'Used' : 'Added' });
        if (!mv) throw new Error('Could not apply — quantity unknown or unit not convertible. Use “Set to” instead.');
      }
    }, 'Stock updated');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="small"
      title={`Stock: ${ing?.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={amount == null} onClick={go}>
            Apply
          </button>
        </>
      }
    >
      <p className="muted">Current: {item.qty == null ? 'unknown' : formatAmount(item.qty, item.unit)}</p>
      <div className="segmented" role="group" aria-label="Adjustment type">
        <button aria-pressed={mode === 'use'} onClick={() => setMode('use')} disabled={item.qty == null}>
          <Minus size={14} /> Used
        </button>
        <button aria-pressed={mode === 'add'} onClick={() => setMode('add')} disabled={item.qty == null}>
          <Plus size={14} /> Added
        </button>
        <button aria-pressed={mode === 'set'} onClick={() => setMode('set')}>
          Set to (count)
        </button>
      </div>
      <div className="input-group">
        <NumberInput value={amount} min={0} onChange={setAmount} placeholder="Amount" ariaLabel="Amount" />
        <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} style={{ width: 100 }} aria-label="Unit">
          {UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

/* ------------------------------ Equipment ------------------------------ */

function EquipmentTab() {
  const { data, update } = useApp();
  const [edit, setEdit] = useState<Equipment | 'new' | null>(null);
  const affected = data.recipes.filter((r) => missingEquipment(r, data.equipment).length > 0);
  const setStatus = (id: string, status: Equipment['status']) =>
    update((d) => {
      const e = d.equipment.find((x) => x.id === id)!;
      e.status = status;
      if (status === 'owned' && e.quantity === 0) e.quantity = 1;
    });
  return (
    <>
      <Alert kind="info">Default items are a starting guess — please check them against your actual kitchen. Recipes warn you when they need something marked missing or damaged.</Alert>
      {affected.length > 0 && (
        <Alert kind="warn">
          {affected.length} recipe(s) need unavailable equipment: {affected.slice(0, 5).map((r) => r.name).join(', ')}
          {affected.length > 5 ? '…' : ''}
        </Alert>
      )}
      <div className="row between">
        <span className="small muted">
          {data.equipment.filter((e) => e.status === 'owned').length} owned · {data.equipment.filter((e) => e.status === 'missing').length} missing · {data.equipment.filter((e) => e.status === 'damaged').length} damaged
        </span>
        <button className="btn primary" onClick={() => setEdit('new')}>
          <Plus /> Add equipment
        </button>
      </div>
      <div className="card flush">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Status</th>
                <th className="right">Qty</th>
                <th>Condition</th>
                <th>Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.equipment.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="bold">{e.name}</div>
                    <div className="tiny faint">{e.category}</div>
                  </td>
                  <td>
                    <select value={e.status} onChange={(ev) => setStatus(e.id, ev.target.value as Equipment['status'])} aria-label={`Status of ${e.name}`} style={{ width: 120 }}>
                      {Object.entries(EQUIPMENT_STATUS_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="right num">{e.quantity}</td>
                  <td className="small">{e.condition ?? '—'}</td>
                  <td className="small muted" style={{ maxWidth: 300 }}>
                    {e.notes}
                    {e.cost ? ` · ${formatINR(e.cost)}` : ''}
                    {e.purchaseDate ? ` · bought ${formatDate(e.purchaseDate)}` : ''}
                  </td>
                  <td className="actions">
                    <button className="icon-btn sm" aria-label={`Edit ${e.name}`} onClick={() => setEdit(e)}>
                      <Pencil />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <EquipmentEditor item={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function EquipmentEditor({ item, onClose }: { item?: Equipment; onClose: () => void }) {
  const { data, update } = useApp();
  const confirm = useConfirm();
  const [e, setE] = useState<Equipment>(() => item ?? { id: uid('eq'), name: '', category: 'cooking', status: 'owned', quantity: 1, condition: 'good' });
  const usedBy = data.recipes.filter((r) => r.equipmentIds.includes(e.id));
  const save = () => {
    update((d) => {
      const i = d.equipment.findIndex((x) => x.id === e.id);
      if (i >= 0) d.equipment[i] = e;
      else d.equipment.push(e);
    }, 'Equipment saved');
    onClose();
  };
  const remove = async () => {
    if (!(await confirm({ title: `Delete ${e.name}?`, message: usedBy.length ? `${usedBy.length} recipe(s) list it; they will show it as “not in your equipment list”.` : undefined, confirmLabel: 'Delete', danger: true }))) return;
    update((d) => void (d.equipment = d.equipment.filter((x) => x.id !== e.id)), 'Equipment deleted');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? `Edit ${item.name}` : 'Add equipment'}
      footer={
        <>
          {item && (
            <button className="btn danger" onClick={remove}>
              <Trash2 /> Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!e.name.trim()} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label="Name" className="full">
          <input type="text" value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
        </Field>
        <Field label="Category">
          <select value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value as Equipment['category'] })}>
            {['cooking', 'appliance', 'prep', 'storage', 'serving', 'measuring'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={e.status} onChange={(ev) => setE({ ...e, status: ev.target.value as Equipment['status'] })}>
            {Object.entries(EQUIPMENT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity">
          <NumberInput value={e.quantity} min={0} step={1} onChange={(n) => setE({ ...e, quantity: n ?? 0 })} />
        </Field>
        <Field label="Condition">
          <select value={e.condition ?? ''} onChange={(ev) => setE({ ...e, condition: (ev.target.value || undefined) as Equipment['condition'] })}>
            <option value="">—</option>
            <option value="new">New</option>
            <option value="good">Good</option>
            <option value="worn">Worn</option>
            <option value="needs-repair">Needs repair</option>
          </select>
        </Field>
        <Field label="Purchase cost (₹)" hint="optional">
          <NumberInput value={e.cost} min={0} onChange={(n) => setE({ ...e, cost: n })} />
        </Field>
        <Field label="Purchase date" hint="optional">
          <input type="date" value={e.purchaseDate ?? ''} onChange={(ev) => setE({ ...e, purchaseDate: ev.target.value || undefined })} />
        </Field>
        <Field label="Notes" className="full">
          <input type="text" value={e.notes ?? ''} onChange={(ev) => setE({ ...e, notes: ev.target.value })} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={!!e.wishlist} onChange={(ev) => setE({ ...e, wishlist: ev.target.checked })} /> On wishlist
        </label>
        {e.wishlist && (
          <Field label="Priority">
            <select value={e.wishlistPriority ?? 'low'} onChange={(ev) => setE({ ...e, wishlistPriority: ev.target.value as Equipment['wishlistPriority'] })}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        )}
      </div>
      {usedBy.length > 0 && <p className="small faint">Used by: {usedBy.map((r) => r.name).join(', ')}</p>}
    </Modal>
  );
}

function Wishlist() {
  const { data, update } = useApp();
  const items = data.equipment.filter((e) => e.wishlist).sort((a, b) => ['high', 'medium', 'low'].indexOf(a.wishlistPriority ?? 'low') - ['high', 'medium', 'low'].indexOf(b.wishlistPriority ?? 'low'));
  return (
    <>
      <Alert kind="info">An optional list — not a shopping push. Most home cooking needs only a stove, pressure cooker, kadhai, tawa and a good knife. Add something here only if it solves a real, repeated problem.</Alert>
      {items.length === 0 ? (
        <div className="card">
          <Empty icon={<Wrench />} title="Wishlist is empty">
            Mark any equipment item “On wishlist” from the Equipment tab.
          </Empty>
        </div>
      ) : (
        <div className="card">
          <ul className="list">
            {items.map((e) => (
              <li key={e.id} className="item-row">
                <span className={`badge ${e.wishlistPriority === 'high' ? 'danger' : e.wishlistPriority === 'medium' ? 'warn' : ''}`}>{e.wishlistPriority ?? 'low'}</span>
                <div className="grow">
                  <div className="bold">{e.name}</div>
                  {e.notes && <div className="small muted">{e.notes}</div>}
                </div>
                <button className="btn sm" onClick={() => update((d) => { const x = d.equipment.find((y) => y.id === e.id)!; x.wishlist = false; x.status = 'owned'; x.quantity = Math.max(1, x.quantity); x.purchaseDate = today(); }, 'Marked as owned')}>
                  Got it
                </button>
                <button className="btn sm ghost" onClick={() => update((d) => void (d.equipment.find((y) => y.id === e.id)!.wishlist = false))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function History() {
  const { data } = useApp();
  const ingById = new Map(data.ingredients.map((i) => [i.id, i.name]));
  const mv = [...data.stockMovements].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 200);
  return mv.length === 0 ? (
    <div className="card">
      <Empty icon={<AlertTriangle />} title="No stock movements yet">
        Movements appear when you add purchases to the pantry, adjust stock, or (if enabled) cook planned meals.
      </Empty>
    </div>
  ) : (
    <div className="card flush">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Item</th>
              <th className="right">Change</th>
              <th>Reason</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {mv.map((m) => (
              <tr key={m.id}>
                <td className="small nowrap">{formatDateTime(m.date)}</td>
                <td>{ingById.get(m.ingredientId) ?? '—'}</td>
                <td className={`right num ${m.delta < 0 ? 'error-text' : 'ok-text'}`}>
                  {m.delta > 0 ? '+' : '−'}
                  {formatAmount(Math.abs(m.delta), m.unit)}
                </td>
                <td>
                  <span className="badge">{m.reason}</span>
                </td>
                <td className="small muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
