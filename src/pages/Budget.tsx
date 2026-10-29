import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Printer, Receipt } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Empty, Field, NumberInput, PageHeader, Progress } from '../components/ui';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { EXPENSE_CATEGORIES, expenseCategoryLabel } from '../domain/constants';
import { averageWeekly, byCategory, costPerMeal, expensesCsv, expensesInRange, monthSummary, weekSummary, weeklyHistory } from '../domain/budget';
import { addDays, endOfMonth, formatDate, parseISODate, startOfMonth, startOfWeek, today } from '../domain/dates';
import { downloadFile, formatINR } from '../domain/util';
import { estimateRecipeCost } from '../domain/recipes';
import { listTotals } from '../domain/grocery';
import type { Expense } from '../domain/types';

export function BudgetPage() {
  const { data, update } = useApp();
  const t = today();
  const [month, setMonth] = useState(startOfMonth(t));
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Expense | undefined>();
  const [open, setOpen] = useState(false);

  const w = weekSummary(data, t);
  const m = monthSummary(data, month);
  const avg = averageWeekly(data, t);
  const cpm = costPerMeal(data, month, endOfMonth(month));
  const history = weeklyHistory(data, t, 8);
  const maxBar = Math.max(1, data.settings.weeklyBudget, ...history.map((h) => h.total));
  const monthExpenses = expensesInRange(data.expenses, month, endOfMonth(month));
  const cats = byCategory(monthExpenses).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const catMax = Math.max(1, ...cats.map((c) => c.total));
  const rows = monthExpenses
    .filter((e) => (!cat || e.category === cat) && (!q || `${e.vendor ?? ''} ${e.notes ?? ''}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  // Estimates (clearly separate from actual spend)
  const ws = startOfWeek(t, data.settings.weekStartsOn);
  const plannedEstimate = useMemo(() => {
    let total = 0;
    for (const meal of data.meals) {
      if (meal.date < ws || meal.date > addDays(ws, 6) || meal.status === 'skipped' || meal.isLeftover) continue;
      for (const d of meal.dishes) {
        const r = data.recipes.find((x) => x.id === d.recipeId);
        if (r) total += estimateRecipeCost(r, d.servings, data.ingredients).total;
      }
    }
    return total;
  }, [data, ws]);
  const listEstimate = data.groceryLists.filter((l) => l.status === 'active').reduce((a, l) => a + listTotals(data.groceryItems.filter((i) => i.listId === l.id)).estimatedPending, 0);

  const shiftMonth = (n: number) => {
    const d = parseISODate(month);
    d.setMonth(d.getMonth() + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
  };

  return (
    <div className="page">
      <PageHeader
        title="Budget & Expenses"
        sub="Actual spending you record. Recipe and list amounts are estimates and shown separately."
        actions={
          <>
            <button className="btn" onClick={() => downloadFile(`expenses-${month.slice(0, 7)}.csv`, expensesCsv(monthExpenses), 'text/csv')}>
              <Download /> CSV (month)
            </button>
            <button className="btn" onClick={() => downloadFile(`expenses-all.csv`, expensesCsv(data.expenses), 'text/csv')}>
              <Download /> CSV (all)
            </button>
            <Link className="btn" to={`/print/expenses/${month}`}>
              <Printer /> Print month
            </Link>
            <button className="btn primary" onClick={() => { setEditing(undefined); setOpen(true); }}>
              <Plus /> Record expense
            </button>
          </>
        }
      />

      {w.level === 'over' && <Alert kind="danger">You are {formatINR(-w.remaining)} over this week’s budget.</Alert>}
      {w.level === 'warn' && <Alert kind="warn">You’ve used {w.pct}% of this week’s budget (alert at {data.settings.budgetAlertPct}%).</Alert>}
      {m.level === 'over' && <Alert kind="danger">This month is {formatINR(-m.remaining)} over budget.</Alert>}

      <div className="grid-4">
        <section className="card stat">
          <span className="label">This week</span>
          <span className="value">{formatINR(w.spent)}</span>
          {w.level !== 'none' ? (
            <>
              <Progress pct={w.pct} level={w.level} />
              <span className="sub">{w.remaining >= 0 ? `${formatINR(w.remaining)} remaining` : `${formatINR(-w.remaining)} over`} of {formatINR(w.budget)}</span>
            </>
          ) : (
            <span className="sub">No weekly budget set</span>
          )}
        </section>
        <section className="card stat">
          <span className="label">{formatDate(month, { month: 'long', year: 'numeric' })}</span>
          <span className="value">{formatINR(m.spent)}</span>
          {m.level !== 'none' ? (
            <>
              <Progress pct={m.pct} level={m.level} />
              <span className="sub">{m.remaining >= 0 ? `${formatINR(m.remaining)} remaining` : `${formatINR(-m.remaining)} over`} of {formatINR(m.budget)}</span>
            </>
          ) : (
            <span className="sub">No monthly budget set</span>
          )}
        </section>
        <section className="card stat">
          <span className="label">Average per week</span>
          <span className="value">{formatINR(avg.avg)}</span>
          <span className="sub">{avg.weeksWithData ? `over ${avg.weeksWithData} week(s) with expenses` : 'record expenses to see this'}</span>
        </section>
        <section className="card stat">
          <span className="label">Approx. per meal (month)</span>
          <span className="value">{cpm.perMeal != null ? formatINR(cpm.perMeal) : '—'}</span>
          <span className="sub">{cpm.perServing != null ? `≈ ${formatINR(cpm.perServing, true)} per serving · ${cpm.meals} prepared meals` : 'needs expenses + meals marked prepared'}</span>
        </section>
      </div>

      <div className="grid-3">
        <section className="card stack">
          <h2>Budget settings</h2>
          <div className="form-grid cols-2">
            <Field label="Weekly budget (₹)">
              <NumberInput value={data.settings.weeklyBudget || undefined} min={0} placeholder="Not set" onChange={(n) => update((d) => void (d.settings.weeklyBudget = n ?? 0))} />
            </Field>
            <Field label="Monthly budget (₹)">
              <NumberInput value={data.settings.monthlyBudget || undefined} min={0} placeholder="Not set" onChange={(n) => update((d) => void (d.settings.monthlyBudget = n ?? 0))} />
            </Field>
            <Field label="Alert at (% used)" className="full">
              <NumberInput value={data.settings.budgetAlertPct} min={1} step={1} onChange={(n) => update((d) => void (d.settings.budgetAlertPct = Math.min(100, Math.max(1, n ?? 80))))} />
            </Field>
          </div>
          {avg.weeksWithData >= 2 ? (
            <div className="row gap wrap">
              <span className="small muted">Your tracked average is {formatINR(avg.avg)}/week.</span>
              <button className="btn sm" onClick={() => update((d) => { d.settings.weeklyBudget = Math.round(avg.avg / 100) * 100; d.settings.monthlyBudget = Math.round((avg.avg * 4.33) / 100) * 100; }, 'Budget set from your average')}>
                Use as budget
              </button>
            </div>
          ) : (
            <p className="small faint">Tip: track 2–4 weeks of real purchases first, then set a budget from your average.</p>
          )}
        </section>

        <section className="card stack">
          <h2>Estimates vs actual (this week)</h2>
          <ul className="list tight">
            <li className="row between">
              <span className="small">Planned meals — recipe cost estimate</span>
              <b className="num">{formatINR(plannedEstimate)}</b>
            </li>
            <li className="row between">
              <span className="small">Active shopping lists — still to buy (est.)</span>
              <b className="num">{formatINR(listEstimate)}</b>
            </li>
            <li className="row between">
              <span className="small">Actual recorded expenses</span>
              <b className="num">{formatINR(w.spent)}</b>
            </li>
          </ul>
          <p className="tiny faint">Estimates use your ingredient price list. Recipe estimates ignore what is already in your pantry; actual expenses are only what you record.</p>
        </section>

        <section className="card stack">
          <h2>Last 8 weeks</h2>
          <div className="bars" aria-label="Weekly spending chart">
            {history.map((h) => (
              <div className="bar" key={h.from} title={`${formatDate(h.from, { day: 'numeric', month: 'short' })}: ${formatINR(h.total)}`}>
                <small className="num">{h.total ? formatINR(h.total).replace('₹', '') : ''}</small>
                <span className={`fill ${data.settings.weeklyBudget && h.total > data.settings.weeklyBudget ? 'over' : ''}`} style={{ height: `${(h.total / maxBar) * 80}%` }} />
                <small>{formatDate(h.from, { day: 'numeric', month: 'short' })}</small>
              </div>
            ))}
          </div>
          {data.settings.weeklyBudget > 0 && <p className="tiny faint">Red bars exceeded the weekly budget of {formatINR(data.settings.weeklyBudget)}.</p>}
        </section>
      </div>

      <section className="card stack">
        <div className="card-head">
          <h2>
            <Receipt /> Expenses
          </h2>
          <div className="row gap">
            <button className="icon-btn sm" aria-label="Previous month" onClick={() => shiftMonth(-1)}>
              <ChevronLeft />
            </button>
            <b>{formatDate(month, { month: 'long', year: 'numeric' })}</b>
            <button className="icon-btn sm" aria-label="Next month" onClick={() => shiftMonth(1)}>
              <ChevronRight />
            </button>
          </div>
        </div>

        {cats.length > 0 && (
          <div className="stack sm">
            {cats.map((c) => (
              <div className="hbar" key={c.category}>
                <span className="truncate">{expenseCategoryLabel(c.category)}</span>
                <span className="track">
                  <span style={{ width: `${(c.total / catMax) * 100}%` }} />
                </span>
                <span className="num">{formatINR(c.total)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="toolbar">
          <input type="search" placeholder="Search vendor or notes" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} aria-label="Search expenses" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category filter">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        {rows.length === 0 ? (
          <Empty icon={<Receipt />} title="No expenses this month" action={<button className="btn sm primary" onClick={() => { setEditing(undefined); setOpen(true); }}>Record expense</button>}>
            Record bills from the kirana, mandi or butcher — or record purchases from a shopping list.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Category</th>
                  <th>Vendor</th>
                  <th>Notes</th>
                  <th className="right">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDate(e.date, { day: 'numeric', month: 'short' })}</td>
                    <td className="nowrap">{expenseCategoryLabel(e.category)}</td>
                    <td>{e.vendor ?? '—'}</td>
                    <td className="small muted" style={{ maxWidth: 320 }}>
                      {e.notes}
                      {e.source === 'grocery' && <span className="badge" style={{ marginLeft: 4 }}>list</span>}
                    </td>
                    <td className="right num bold">{formatINR(e.amount, true)}</td>
                    <td className="actions">
                      <button className="icon-btn sm" aria-label="Edit expense" onClick={() => { setEditing(e); setOpen(true); }}>
                        <Pencil />
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td colSpan={4} className="bold">
                    Total ({rows.length})
                  </td>
                  <td className="right num bold">{formatINR(rows.reduce((a, e) => a + e.amount, 0), true)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ExpenseEditor open={open} expense={editing} onClose={() => setOpen(false)} />
    </div>
  );
}
