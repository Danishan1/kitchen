import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive, CalendarRange, Check, ClipboardList, Copy, Download, FileJson, MoreHorizontal, PackagePlus, Pencil, Plus, Printer,
  RefreshCw, ShoppingBasket, ShoppingCart, Trash2, Wallet, X,
} from 'lucide-react';
import { useApp } from '../store';
import { Alert, Empty, Field, Modal, NumberInput, PageHeader, Segmented, useConfirm } from '../components/ui';
import { GROCERY_CATEGORIES, UNITS, groceryCategoryLabel, slotLabel } from '../domain/constants';
import type { AppData, GroceryCategory, GroceryItem, GroceryList, Unit } from '../domain/types';
import {
  addManualItem, addPurchaseToPantry, createList, duplicateList, estimateItemPrice, generatePlanItems, listTotals, markPurchased,
  mealNeedsIngredients, recordListExpenses, unmarkPurchased,
} from '../domain/grocery';
import { addDays, formatDate, formatDay, formatDateTime, startOfWeek, today } from '../domain/dates';
import { mealName, mealsInRange } from '../domain/planner';
import { findIngredientByName } from '../domain/recipes';
import { formatAmount } from '../domain/units';
import { downloadFile, formatINR, groupBy, nowISO, slugify } from '../domain/util';
import { toCsv } from '../domain/csv';

export function GroceryPage() {
  const { listId } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, update } = useApp();
  const nav = useNavigate();
  const [buildOpen, setBuildOpen] = useState<null | { from: string; to: string; listId?: string }>(null);
  const [showAll, setShowAll] = useState(false);

  // Open the build dialog from links like /grocery?build=week
  useEffect(() => {
    const b = params.get('build');
    if (!b) return;
    const ws = startOfWeek(today(), data.settings.weekStartsOn);
    if (b === 'range') setBuildOpen({ from: params.get('from') ?? ws, to: params.get('to') ?? addDays(ws, 6) });
    else setBuildOpen({ from: today() > ws ? today() : ws, to: addDays(ws, 6) });
    setParams({}, { replace: true });
  }, [params, setParams, data.settings.weekStartsOn]);

  const lists = data.groceryLists;
  const current = listId ? lists.find((l) => l.id === listId) : undefined;

  useEffect(() => {
    if (!listId) {
      const pick = lists.find((l) => l.id === data.preferences.lastListId) ?? lists.find((l) => l.status === 'active');
      if (pick) nav(`/grocery/${pick.id}`, { replace: true });
    } else if (current && data.preferences.lastListId !== current.id) {
      update((d) => void (d.preferences.lastListId = current.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, current?.id]);

  const newBlank = () => {
    let id = '';
    update((d) => {
      id = createList(d, { name: `Shopping ${formatDate(today(), { day: 'numeric', month: 'short' })}` }).id;
    }, 'New list created');
    nav(`/grocery/${id}`);
  };

  const shown = lists.filter((l) => showAll || l.status !== 'done');

  return (
    <div className="page">
      <PageHeader
        title="Grocery Manager"
        sub="Plan-based lists subtract known pantry stock; purchases only change stock when you add them to the pantry."
        actions={
          <>
            <button className="btn" onClick={newBlank}>
              <Plus /> Blank list
            </button>
            <button className="btn primary" onClick={() => setBuildOpen({ from: today(), to: addDays(startOfWeek(today(), data.settings.weekStartsOn), 6) })}>
              <CalendarRange /> Build from meal plan
            </button>
          </>
        }
      />

      <div className="sidebar-layout left">
        <aside className="card stack" aria-label="Shopping lists">
          <div className="row between">
            <h2>Lists</h2>
            <label className="check tiny">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> show done
            </label>
          </div>
          {shown.length === 0 && <p className="small faint">No lists yet. Build one from your meal plan or start a blank list.</p>}
          <ul className="list tight">
            {shown.map((l) => {
              const items = data.groceryItems.filter((i) => i.listId === l.id);
              const done = items.filter((i) => i.purchased).length;
              return (
                <li key={l.id}>
                  <Link to={`/grocery/${l.id}`} className="row gap" style={{ fontWeight: l.id === listId ? 700 : 500, color: l.id === listId ? 'var(--primary)' : 'var(--text)' }}>
                    {l.status === 'template' ? <ClipboardList size={15} /> : l.status === 'done' ? <Archive size={15} /> : <ShoppingCart size={15} />}
                    <span className="grow truncate">{l.name}</span>
                    <span className="tiny faint num">
                      {done}/{items.length}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </aside>

        <div className="stack lg">
          {current ? (
            <ListView key={current.id} list={current} onRebuild={() => setBuildOpen({ from: current.fromDate ?? today(), to: current.toDate ?? addDays(today(), 6), listId: current.id })} />
          ) : (
            <div className="card">
              <Empty icon={<ShoppingBasket />} title="No list selected" action={<button className="btn primary sm" onClick={() => setBuildOpen({ from: today(), to: addDays(today(), 6) })}>Build from meal plan</button>}>
                Shopping lists can be generated from planned meals or created manually.
              </Empty>
            </div>
          )}
        </div>
      </div>

      {buildOpen && <BuildDialog initial={buildOpen} onClose={() => setBuildOpen(null)} onBuilt={(id) => { setBuildOpen(null); nav(`/grocery/${id}`); }} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function BuildDialog({ initial, onClose, onBuilt }: { initial: { from: string; to: string; listId?: string }; onClose: () => void; onBuilt: (id: string) => void }) {
  const { data, update } = useApp();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [target, setTarget] = useState<string>(initial.listId ?? 'new');
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const meals = useMemo(
    () => mealsInRange(data, from, to).filter((m) => m.dishes.length).sort((a, b) => a.date.localeCompare(b.date)),
    [data, from, to],
  );
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = meals.filter((m) => mealNeedsIngredients(m) && !excluded.has(m.id));

  const build = () => {
    let id = target;
    update((d) => {
      if (target === 'new') id = createList(d, { name: `Week of ${formatDate(from, { day: 'numeric', month: 'short' })}`, fromDate: from, toDate: to }).id;
      else {
        const l = d.groceryLists.find((x) => x.id === target)!;
        l.fromDate = from;
        l.toDate = to;
      }
      const ms = d.meals.filter((m) => selected.some((s) => s.id === m.id));
      const r = generatePlanItems(d, id, ms);
      if (!r.added && !r.removed) throw new Error('Nothing to buy — selected meals are covered by known pantry stock or purchases.');
    }, target === 'new' ? 'Shopping list created' : 'List updated from plan');
    onBuilt(id);
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="wide"
      title="Build shopping list from meal plan"
      footer={
        <>
          <span className="small muted grow">{selected.length} meals selected</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={build} disabled={!selected.length}>
            {target === 'new' ? 'Create list' : 'Update list'}
          </button>
        </>
      }
    >
      <div className="form-grid cols-3">
        <Field label="From">
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
        <Field label="Put items into">
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="new">A new list</option>
            {data.groceryLists.filter((l) => l.status === 'active').map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Alert kind="info">
        Ingredients are scaled to each meal’s servings and merged. Known pantry quantities are subtracted; items with unknown stock are listed in full. Re-building a list only replaces items you haven’t bought yet — manual items and purchases are kept.
      </Alert>
      {meals.length === 0 ? (
        <p className="small faint">No meals with recipes in this date range.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 340 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    checked={excluded.size === 0}
                    onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(meals.map((m) => m.id)))}
                  />
                </th>
                <th>Day</th>
                <th>Meal</th>
                <th className="right">Servings</th>
              </tr>
            </thead>
            <tbody>
              {meals.map((m) => {
                const can = mealNeedsIngredients(m);
                return (
                  <tr key={m.id} className={!can ? 'done' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        disabled={!can}
                        checked={can && !excluded.has(m.id)}
                        aria-label={`Include ${mealName(m, recipes)}`}
                        onChange={() =>
                          setExcluded((p) => {
                            const n = new Set(p);
                            if (n.has(m.id)) n.delete(m.id);
                            else n.add(m.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td className="nowrap">{formatDay(m.date)}</td>
                    <td>
                      <span className="faint small">{slotLabel(m.slot)} · </span>
                      {mealName(m, recipes)}
                      {!can && <span className="badge" style={{ marginLeft: 6 }}>{m.isLeftover ? 'leftover' : m.status}</span>}
                    </td>
                    <td className="right num">{m.dishes.map((x) => x.servings).join(' / ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

function listCsv(items: GroceryItem[]) {
  return toCsv(items, [
    { header: 'Category', value: (i) => groceryCategoryLabel(i.category) },
    { header: 'Item', value: (i) => i.name },
    { header: 'Quantity', value: (i) => i.qty },
    { header: 'Unit', value: (i) => i.unit },
    { header: 'Store', value: (i) => i.store },
    { header: 'Estimated ₹', value: (i) => i.estPrice },
    { header: 'Purchased', value: (i) => (i.purchased ? 'yes' : 'no') },
    { header: 'Purchased qty', value: (i) => (i.purchased ? `${i.purchasedQty ?? i.qty} ${i.purchasedUnit ?? i.unit}` : '') },
    { header: 'Actual ₹', value: (i) => i.actualPrice },
    { header: 'Vendor', value: (i) => i.vendor },
    { header: 'Purchase date', value: (i) => i.purchaseDate },
    { header: 'Note', value: (i) => i.note },
  ]);
}

function ListView({ list, onRebuild }: { list: GroceryList; onRebuild: () => void }) {
  const { data, update, toast } = useApp();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [shopMode, setShopMode] = useState(false);
  const [editing, setEditing] = useState<GroceryItem | null>(null);
  const [menu, setMenu] = useState(false);
  const groupMode = data.preferences.groceryGroupBy;
  const items = data.groceryItems.filter((i) => i.listId === list.id);
  const totals = listTotals(items);
  const groups = useMemo(() => {
    const g = groupBy(items, (i) => (groupMode === 'store' ? i.store || 'Any shop' : i.category));
    const order = groupMode === 'store' ? Object.keys(g).sort() : GROCERY_CATEGORIES.map((c) => c.id).filter((c) => g[c]);
    return order.map((k) => ({ key: k, label: groupMode === 'store' ? k : groceryCategoryLabel(k as GroceryCategory), items: g[k].sort((a, b) => Number(a.purchased) - Number(b.purchased) || a.name.localeCompare(b.name)) }));
  }, [items, groupMode]);
  const notInPantry = items.filter((i) => i.purchased && !i.stockMovementId);
  const notExpensed = items.filter((i) => i.purchased && !i.expenseId && i.actualPrice);

  const toggle = (it: GroceryItem) => {
    if (it.purchased) {
      update((d) => {
        const r = unmarkPurchased(d, it.id);
        if (!r.ok) throw new Error(r.message);
      });
    } else update((d) => markPurchased(d, it.id, { vendor: list.store }));
  };

  const setItem = (id: string, patch: Partial<GroceryItem>) =>
    update((d) => {
      const it = d.groceryItems.find((x) => x.id === id);
      if (it) Object.assign(it, patch);
    });

  const recordExpenses = () => {
    let res = { created: 0, total: 0, missingPrice: 0 };
    update((d) => {
      res = recordListExpenses(d, list.id, list.store);
    });
    if (res.created) toast(`Recorded ${formatINR(res.total)} as ${res.created} expense(s)${res.missingPrice ? ` · ${res.missingPrice} item(s) had no price` : ''}.`, 'success');
    else toast(res.missingPrice ? 'Enter actual prices on purchased items first.' : 'Nothing new to record.', 'info');
  };

  const addAllToPantry = () => {
    let n = 0;
    update((d) => {
      for (const it of d.groceryItems.filter((x) => x.listId === list.id && x.purchased && !x.stockMovementId)) if (addPurchaseToPantry(d, it.id).ok) n++;
    });
    toast(`Added ${n} purchase(s) to pantry stock.`, 'success');
  };

  const del = async () => {
    setMenu(false);
    if (!(await confirm({ title: `Delete “${list.name}”?`, message: 'The list and its items are removed. Recorded expenses and pantry stock are not changed.', confirmLabel: 'Delete list', danger: true }))) return;
    update((d) => {
      d.groceryItems = d.groceryItems.filter((i) => i.listId !== list.id);
      d.groceryLists = d.groceryLists.filter((l) => l.id !== list.id);
      if (d.preferences.lastListId === list.id) d.preferences.lastListId = undefined;
    }, 'List deleted');
    nav('/grocery');
  };

  const saveTemplate = () => {
    setMenu(false);
    let id = '';
    update((d) => {
      id = duplicateList(d, list.id, `${list.name} (template)`, 'template').id;
    }, 'Saved as reusable template');
    nav(`/grocery/${id}`);
  };
  const useTemplate = () => {
    let id = '';
    update((d) => {
      id = duplicateList(d, list.id, `${list.name.replace(/ \(template\)$/, '')} – ${formatDate(today(), { day: 'numeric', month: 'short' })}`, 'active').id;
    }, 'New list from template');
    nav(`/grocery/${id}`);
  };

  const exportCsv = () => downloadFile(`${slugify(list.name)}.csv`, listCsv(items), 'text/csv');
  const exportJson = () => downloadFile(`${slugify(list.name)}.json`, JSON.stringify({ list, items }, null, 2), 'application/json');

  return (
    <>
      <div className="card stack">
        <div className="row gap wrap between">
          <div className="stack sm grow">
            <input
              type="text"
              defaultValue={list.name}
              key={list.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== list.name && update((d) => void (d.groceryLists.find((l) => l.id === list.id)!.name = e.target.value.trim()))}
              aria-label="List name"
              style={{ fontWeight: 650, fontSize: '1.05rem', border: '1px solid transparent', padding: '4px 6px', marginLeft: -6 }}
            />
            <span className="tiny faint">
              {list.status === 'template' ? 'Reusable template' : list.status === 'done' ? 'Completed' : 'Active'}
              {list.fromDate && ` · plan ${formatDate(list.fromDate, { day: 'numeric', month: 'short' })}–${formatDate(list.toDate, { day: 'numeric', month: 'short' })}`} · updated {formatDateTime(list.updatedAt)}
            </span>
          </div>
          <div className="btn-group">
            {list.status === 'template' ? (
              <button className="btn primary" onClick={useTemplate}>
                <Copy /> Use template
              </button>
            ) : (
              <>
                <button className={`btn ${shopMode ? 'primary' : ''}`} onClick={() => setShopMode((v) => !v)} aria-pressed={shopMode}>
                  <ShoppingBasket /> {shopMode ? 'Exit shopping mode' : 'Shopping mode'}
                </button>
                <button className="btn" onClick={onRebuild} title="Recalculate un-purchased items from the meal plan">
                  <RefreshCw /> From plan
                </button>
              </>
            )}
            <Link className="btn" to={`/print/grocery/${list.id}`}>
              <Printer /> Print
            </Link>
            <div style={{ position: 'relative' }}>
              <button className="icon-btn" aria-label="More list actions" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
                <MoreHorizontal />
              </button>
              {menu && (
                <div className="card" style={{ position: 'absolute', right: 0, top: 40, zIndex: 10, padding: 6, display: 'grid', gap: 2, minWidth: 210 }} onClick={() => setMenu(false)}>
                  <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={exportCsv}>
                    <Download /> Export CSV
                  </button>
                  <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={exportJson}>
                    <FileJson /> Export JSON
                  </button>
                  {list.status !== 'template' && (
                    <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={saveTemplate}>
                      <ClipboardList /> Save as reusable template
                    </button>
                  )}
                  {list.status === 'active' && (
                    <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => update((d) => void (d.groceryLists.find((l) => l.id === list.id)!.status = 'done'), 'List marked done')}>
                      <Archive /> Mark list done
                    </button>
                  )}
                  {list.status === 'done' && (
                    <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => update((d) => void (d.groceryLists.find((l) => l.id === list.id)!.status = 'active'))}>
                      <ShoppingCart /> Re-open list
                    </button>
                  )}
                  <button className="btn sm ghost danger" style={{ justifyContent: 'flex-start' }} onClick={del}>
                    <Trash2 /> Delete list
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid-4">
          <div className="stat">
            <span className="label">Items</span>
            <span className="value">
              {totals.purchased}/{totals.items}
            </span>
            <span className="sub">purchased</span>
          </div>
          <div className="stat">
            <span className="label">Estimated (list)</span>
            <span className="value">{formatINR(totals.estimated)}</span>
            <span className="sub">{totals.unpriced ? `${totals.unpriced} item(s) unpriced` : 'from your price list'}</span>
          </div>
          <div className="stat">
            <span className="label">Still to buy (est.)</span>
            <span className="value">{formatINR(totals.estimatedPending)}</span>
          </div>
          <div className="stat">
            <span className="label">Actual spent</span>
            <span className="value">{formatINR(totals.actual)}</span>
            <span className="sub">entered prices</span>
          </div>
        </div>

        {(notInPantry.length > 0 || notExpensed.length > 0) && list.status !== 'template' && (
          <div className="row gap wrap">
            {notInPantry.length > 0 && (
              <button className="btn sm" onClick={addAllToPantry}>
                <PackagePlus /> Add {notInPantry.length} purchase(s) to pantry
              </button>
            )}
            {notExpensed.length > 0 && (
              <button className="btn sm" onClick={recordExpenses}>
                <Wallet /> Record {notExpensed.length} priced purchase(s) as expenses
              </button>
            )}
          </div>
        )}
      </div>

      {!shopMode && <AddItemRow listId={list.id} store={list.store} />}

      <div className="row between wrap gap">
        <Segmented<AppData['preferences']['groceryGroupBy']>
          label="Group by"
          value={groupMode}
          onChange={(v) => update((d) => void (d.preferences.groceryGroupBy = v))}
          options={[
            { value: 'category', label: 'By category' },
            { value: 'store', label: 'By shop' },
          ]}
        />
        {!shopMode && (
          <label className="row gap small">
            Default shop
            <input
              type="text"
              defaultValue={list.store ?? ''}
              placeholder="e.g. Kirana / Mandi"
              style={{ width: 160, minHeight: 32 }}
              onBlur={(e) => update((d) => void (d.groceryLists.find((l) => l.id === list.id)!.store = e.target.value.trim() || undefined))}
            />
          </label>
        )}
      </div>

      {items.length === 0 ? (
        <div className="card">
          <Empty icon={<ShoppingCart />} title="This list is empty">
            Add items above, or use “From plan” to fill it from planned meals.
          </Empty>
        </div>
      ) : shopMode ? (
        <div className="card">
          {groups.map((g) => (
            <div key={g.key}>
              <div className="group-head">
                <span>{g.label}</span>
                <span>
                  {g.items.filter((i) => i.purchased).length}/{g.items.length}
                </span>
              </div>
              {g.items.map((it) => (
                <div key={it.id} className={`shop-item ${it.purchased ? 'done' : ''}`}>
                  <input type="checkbox" checked={it.purchased} onChange={() => toggle(it)} aria-label={`Bought ${it.name}`} />
                  <div className="grow" onClick={() => toggle(it)} style={{ cursor: 'pointer' }}>
                    <div className="name">{it.name}</div>
                    <div className="small muted">
                      {formatAmount(it.qty, it.unit)}
                      {it.estPrice != null && ` · est ${formatINR(it.estPrice)}`}
                    </div>
                  </div>
                  {it.purchased && (
                    <div style={{ width: 96 }}>
                      <NumberInput ariaLabel={`Price paid for ${it.name}`} placeholder="₹ paid" value={it.actualPrice} min={0} onChange={(n) => setItem(it.id, { actualPrice: n })} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }} aria-label="Purchased" />
                  <th>Item</th>
                  <th>Quantity</th>
                  <th className="right">Est. ₹</th>
                  <th className="right">Paid ₹</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.key}>
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--surface-2)', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-2)' }}>
                      {g.label} <span className="faint">· {g.items.length}</span>
                    </td>
                  </tr>
                  {g.items.map((it) => (
                    <tr key={it.id} className={it.purchased ? 'done' : ''}>
                      <td>
                        <input type="checkbox" checked={it.purchased} onChange={() => toggle(it)} aria-label={`Purchased ${it.name}`} />
                      </td>
                      <td className="name" style={{ minWidth: 150 }}>
                        <div className="bold">{it.name}</div>
                        <div className="tiny faint">
                          {it.source === 'plan' ? (
                            <>
                              needs {formatAmount(it.requiredQty ?? it.qty, it.unit)}
                              {it.pantryOffset ? ` − ${formatAmount(it.pantryOffset, it.unit)} in pantry` : ''}
                              {it.pantryUnknown ? ' · pantry qty unknown' : ''}
                            </>
                          ) : (
                            'added manually'
                          )}
                          {it.store && groupMode !== 'store' ? ` · ${it.store}` : ''}
                        </div>
                      </td>
                      <td>
                        <div className="input-group" style={{ minWidth: 150 }}>
                          <div style={{ width: 72 }}>
                            <NumberInput ariaLabel={`Quantity of ${it.name}`} value={it.qty} min={0} onChange={(n) => n != null && setItem(it.id, { qty: n, estPrice: estimateItemPrice(data.ingredients.find((x) => x.id === it.ingredientId), n, it.unit) ?? it.estPrice })} />
                          </div>
                          <select value={it.unit} onChange={(e) => setItem(it.id, { unit: e.target.value as Unit, estPrice: estimateItemPrice(data.ingredients.find((x) => x.id === it.ingredientId), it.qty, e.target.value as Unit) ?? it.estPrice })} aria-label="Unit" style={{ width: 84 }}>
                            {UNITS.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="right num">{it.estPrice != null ? formatINR(it.estPrice) : '—'}</td>
                      <td className="right num">{it.purchased ? (it.actualPrice != null ? formatINR(it.actualPrice, true) : <span className="faint">—</span>) : ''}</td>
                      <td>
                        {it.purchased ? (
                          <div className="row gap wrap">
                            {it.stockMovementId ? <span className="badge ok">in pantry</span> : <button className="btn sm" onClick={() => update((d) => { const r = addPurchaseToPantry(d, it.id); if (!r.ok) throw new Error(r.message); }, 'Added to pantry')}>+ Pantry</button>}
                            {it.expenseId && <span className="badge primary">expensed</span>}
                          </div>
                        ) : (
                          <span className="tiny faint">to buy</span>
                        )}
                      </td>
                      <td className="actions">
                        <button className="icon-btn sm" aria-label={`Edit ${it.name}`} onClick={() => setEditing(it)}>
                          <Pencil />
                        </button>
                        <button
                          className="icon-btn sm danger"
                          aria-label={`Remove ${it.name}`}
                          onClick={() =>
                            update((d) => {
                              if (it.expenseId) throw new Error('This item is part of a recorded expense — delete the expense first.');
                              if (it.stockMovementId) unmarkPurchased(d, it.id);
                              d.groceryItems = d.groceryItems.filter((x) => x.id !== it.id);
                            }, 'Item removed')
                          }
                        >
                          <X />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </div>
      )}
      {editing && <PurchaseDialog item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AddItemRow({ listId, store }: { listId: string; store?: string }) {
  const { data, update } = useApp();
  const [name, setName] = useState('');
  const [qty, setQty] = useState<number | undefined>(1);
  const [unit, setUnit] = useState<Unit>('kg');
  const [category, setCategory] = useState<GroceryCategory>('vegetables');
  const match = findIngredientByName(data.ingredients, name);
  useEffect(() => {
    if (match) {
      setCategory(match.category);
      if (match.buyUnit) setUnit(match.buyUnit);
      else if (match.priceUnit) setUnit(match.priceUnit);
    }
  }, [match]);
  const add = () => {
    if (!name.trim() || !(qty! > 0)) return;
    update((d) => {
      addManualItem(d, listId, { ingredientId: match?.id, name: match?.name ?? name.trim(), category, qty: qty!, unit, store });
    });
    setName('');
    setQty(1);
  };
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <datalist id="grocery-ingredients">
        {data.ingredients.map((i) => (
          <option key={i.id} value={i.name} />
        ))}
      </datalist>
      <div className="row gap wrap">
        <input type="text" list="grocery-ingredients" value={name} onChange={(e) => setName(e.target.value)} placeholder="Add item (e.g. Onion, Dishwash liquid)" aria-label="Item name" style={{ flex: '2 1 200px' }} />
        <div style={{ width: 80 }}>
          <NumberInput ariaLabel="Quantity" value={qty} min={0} onChange={setQty} />
        </div>
        <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit" style={{ width: 96 }}>
          {UNITS.map((u) => (
            <option key={u.id} value={u.id}>
              {u.label}
            </option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value as GroceryCategory)} aria-label="Category" style={{ flex: '1 1 150px' }}>
          {GROCERY_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <button className="btn primary" type="submit" disabled={!name.trim()}>
          <Plus /> Add
        </button>
      </div>
    </form>
  );
}

function PurchaseDialog({ item, onClose }: { item: GroceryItem; onClose: () => void }) {
  const { data, update } = useApp();
  const [f, setF] = useState({
    name: item.name,
    note: item.note ?? '',
    store: item.store ?? '',
    purchased: item.purchased,
    qty: item.purchasedQty ?? item.qty,
    unit: item.purchasedUnit ?? item.unit,
    price: item.actualPrice,
    vendor: item.vendor ?? item.store ?? '',
    date: item.purchaseDate ?? today(),
    toPantry: !item.stockMovementId,
  });
  const locked = !!item.expenseId;
  const save = () => {
    update((d) => {
      const it = d.groceryItems.find((x) => x.id === item.id)!;
      it.name = f.name.trim() || it.name;
      it.note = f.note || undefined;
      it.store = f.store || undefined;
      if (f.purchased) {
        // Changing quantity after it was added to pantry: reverse and re-add so stock stays exact.
        const qtyChanged = it.purchased && (it.purchasedQty !== f.qty || it.purchasedUnit !== f.unit);
        if (qtyChanged && it.stockMovementId && !locked) {
          unmarkPurchased(d, it.id);
          f.toPantry = true;
        }
        markPurchased(d, it.id, { qty: f.qty, unit: f.unit, price: f.price, vendor: f.vendor || undefined, date: f.date });
        if (f.toPantry && !it.stockMovementId) addPurchaseToPantry(d, it.id);
      } else if (it.purchased) {
        const r = unmarkPurchased(d, it.id);
        if (!r.ok) throw new Error(r.message);
      }
      d.groceryLists.find((l) => l.id === it.listId)!.updatedAt = nowISO();
    }, 'Item saved');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Purchase: ${item.name}`}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save}>
            <Check /> Save
          </button>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label="Item name">
          <input type="text" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Shop for this item">
          <input type="text" value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })} placeholder="e.g. Mandi" />
        </Field>
        <Field label="Note" className="full">
          <input type="text" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.purchased} disabled={locked} onChange={(e) => setF({ ...f, purchased: e.target.checked })} /> Purchased
      </label>
      {locked && <p className="small faint">Included in a recorded expense — delete that expense to undo the purchase.</p>}
      {f.purchased && (
        <div className="form-grid cols-2">
          <Field label="Quantity bought">
            <div className="input-group">
              <NumberInput value={f.qty} min={0} onChange={(n) => setF({ ...f, qty: n ?? 0 })} />
              <select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value as Unit })} style={{ width: 100 }}>
                {UNITS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Price paid (₹)" hint={item.estPrice != null ? `est ${formatINR(item.estPrice)}` : undefined}>
            <NumberInput value={f.price} min={0} onChange={(n) => setF({ ...f, price: n })} placeholder="Total for this item" />
          </Field>
          <Field label="Vendor / shop">
            <input type="text" value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} />
          </Field>
          <Field label="Purchase date">
            <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </Field>
          {!item.stockMovementId ? (
            <label className="check full">
              <input type="checkbox" checked={f.toPantry} onChange={(e) => setF({ ...f, toPantry: e.target.checked })} /> Add this quantity to pantry stock
            </label>
          ) : (
            <p className="small ok-text full">Already added to pantry. Changing the quantity updates stock exactly once.</p>
          )}
        </div>
      )}
      {data.ingredients.find((i) => i.id === item.ingredientId)?.price == null && f.price && f.qty ? (
        <p className="tiny faint">Tip: add this price to your ingredient price list for future estimates.</p>
      ) : null}
    </Modal>
  );
}
