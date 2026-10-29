import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, FileText, Package, Printer, Receipt, ShoppingCart, Wrench } from 'lucide-react';
import { useApp } from '../store';
import { PageHeader, Segmented } from '../components/ui';
import { addDays, endOfMonth, formatDate, formatDuration, formatMinutes, localDateOf, parseISODate, startOfMonth, startOfWeek, today } from '../domain/dates';
import { summarizeRange, mealsInRange } from '../domain/planner';
import { byCategory, expensesInRange, totalOf } from '../domain/budget';
import { expenseCategoryLabel } from '../domain/constants';
import { formatINR } from '../domain/util';
import { estimateRecipeCost } from '../domain/recipes';

type Period = 'week' | 'lastweek' | 'month' | 'lastmonth';

export function ReportsPage() {
  const { data } = useApp();
  const [period, setPeriod] = useState<Period>('week');
  const t = today();
  const ws = startOfWeek(t, data.settings.weekStartsOn);
  const range = useMemo(() => {
    if (period === 'week') return { from: ws, to: addDays(ws, 6), budget: data.settings.weeklyBudget };
    if (period === 'lastweek') return { from: addDays(ws, -7), to: addDays(ws, -1), budget: data.settings.weeklyBudget };
    if (period === 'month') return { from: startOfMonth(t), to: endOfMonth(t), budget: data.settings.monthlyBudget };
    const d = parseISODate(startOfMonth(t));
    d.setMonth(d.getMonth() - 1);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    return { from, to: endOfMonth(from), budget: data.settings.monthlyBudget };
  }, [period, t, ws, data.settings]);

  const plan = summarizeRange(data, range.from, range.to);
  const meals = mealsInRange(data, range.from, range.to);
  const replaced = meals.filter((m) => m.status === 'replaced').length;
  const ex = expensesInRange(data.expenses, range.from, range.to);
  const spent = totalOf(ex);
  const cats = byCategory(ex).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);
  const vendors = Object.entries(ex.reduce<Record<string, number>>((a, e) => ((a[e.vendor || 'Unspecified'] = (a[e.vendor || 'Unspecified'] ?? 0) + e.amount), a), {})).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const est = meals.filter((m) => m.status !== 'skipped' && !m.isLeftover).reduce((a, m) => a + m.dishes.reduce((b, d) => {
    const r = data.recipes.find((x) => x.id === d.recipeId);
    return b + (r ? estimateRecipeCost(r, d.servings, data.ingredients).total : 0);
  }, 0), 0);
  const sessions = data.cookingSessions.filter((s) => s.status === 'done' && localDateOf(s.startedAt) >= range.from && localDateOf(s.startedAt) <= range.to);
  const cookedSec = sessions.reduce((a, s) => a + s.elapsedSec, 0);
  const perRecipe = useMemo(() => {
    const m = new Map<string, { name: string; n: number; actual: number; est: number }>();
    for (const s of data.cookingSessions.filter((x) => x.status === 'done' && x.recipeIds.length === 1)) {
      const r = data.recipes.find((x) => x.id === s.recipeIds[0]);
      if (!r) continue;
      const cur = m.get(r.id) ?? { name: r.name, n: 0, actual: 0, est: s.estimatedMin };
      cur.n++;
      cur.actual += s.elapsedSec / 60;
      m.set(r.id, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [data]);
  const topRecipes = [...data.recipes].filter((r) => r.timesCooked > 0).sort((a, b) => b.timesCooked - a.timesCooked).slice(0, 8);
  const neverTried = data.recipes.filter((r) => r.timesCooked === 0).length;
  const lists = data.groceryLists.filter((l) => l.status !== 'template' && localDateOf(l.createdAt) >= range.from && localDateOf(l.createdAt) <= range.to);
  const purchasedItems = data.groceryItems.filter((i) => i.purchased && i.purchaseDate && i.purchaseDate >= range.from && i.purchaseDate <= range.to).length;
  const month = startOfMonth(range.from);

  return (
    <div className="page">
      <PageHeader title="Reports" sub={`${formatDate(range.from)} – ${formatDate(range.to)}`} />
      <Segmented<Period>
        label="Report period"
        value={period}
        onChange={setPeriod}
        options={[
          { value: 'week', label: 'This week' },
          { value: 'lastweek', label: 'Last week' },
          { value: 'month', label: 'This month' },
          { value: 'lastmonth', label: 'Last month' },
        ]}
      />

      <div className="grid-4">
        <section className="card stat">
          <span className="label">Meals prepared</span>
          <span className="value">
            {plan.prepared}/{plan.planned}
          </span>
          <span className="sub">
            {plan.skipped} skipped · {replaced} replaced
          </span>
        </section>
        <section className="card stat">
          <span className="label">Veg / non-veg days</span>
          <span className="value">
            {plan.vegDays} / {plan.nonVegDays}
          </span>
          <span className="sub">target {data.settings.nonVegDaysTarget} non-veg days per week</span>
        </section>
        <section className="card stat">
          <span className="label">Spent (actual)</span>
          <span className="value">{formatINR(spent)}</span>
          <span className="sub">{range.budget ? `budget ${formatINR(range.budget)} · ${spent > range.budget ? 'over' : 'within'}` : 'no budget set'}</span>
        </section>
        <section className="card stat">
          <span className="label">Time cooked (timed)</span>
          <span className="value">{formatDuration(cookedSec)}</span>
          <span className="sub">
            {sessions.length} sessions · planned ≈ {formatMinutes(plan.totalMin)}
          </span>
        </section>
      </div>

      <div className="grid-3">
        <section className="card stack">
          <h2>Spending by category</h2>
          {cats.length === 0 ? (
            <p className="small faint">No expenses in this period.</p>
          ) : (
            cats.map((c) => (
              <div className="hbar" key={c.category}>
                <span className="truncate">{expenseCategoryLabel(c.category)}</span>
                <span className="track">
                  <span style={{ width: `${(c.total / cats[0].total) * 100}%` }} />
                </span>
                <span className="num">{formatINR(c.total)}</span>
              </div>
            ))
          )}
          <hr />
          <div className="row between small">
            <span>Recipe cost estimate for planned meals</span>
            <b>{formatINR(est)}</b>
          </div>
          <div className="row between small">
            <span>Actual recorded</span>
            <b>{formatINR(spent)}</b>
          </div>
        </section>
        <section className="card stack">
          <h2>Top vendors</h2>
          {vendors.length === 0 ? (
            <p className="small faint">Add vendors to expenses to compare shops.</p>
          ) : (
            <ul className="list tight">
              {vendors.map(([v, a]) => (
                <li key={v} className="row between">
                  <span>{v}</span>
                  <b className="num">{formatINR(a)}</b>
                </li>
              ))}
            </ul>
          )}
          <hr />
          <div className="small muted">
            {lists.length} shopping list(s) created · {purchasedItems} items purchased
          </div>
        </section>
        <section className="card stack">
          <h2>Most planned dishes</h2>
          {plan.repeats.length === 0 ? (
            <p className="small faint">No repeated dishes in this period.</p>
          ) : (
            <ul className="list tight">
              {plan.repeats.slice(0, 8).map((r) => (
                <li key={r.name} className="row between">
                  <span>{r.name}</span>
                  <span className="badge">×{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="card stack">
          <h2>Speed: estimated vs actual (all time)</h2>
          {perRecipe.length === 0 ? (
            <p className="small faint">Time single-recipe sessions to see your improvement.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Recipe</th>
                    <th className="right">Sessions</th>
                    <th className="right">Avg actual</th>
                    <th className="right">Estimate</th>
                  </tr>
                </thead>
                <tbody>
                  {perRecipe.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="right num">{r.n}</td>
                      <td className={`right num ${r.actual / r.n > r.est ? 'warn-text' : 'ok-text'}`}>{formatMinutes(r.actual / r.n)}</td>
                      <td className="right num">{formatMinutes(r.est)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card stack">
          <h2>Recipes</h2>
          <div className="small muted">
            {data.recipes.length} recipes · {data.recipes.filter((r) => r.favourite).length} favourites · {neverTried} not cooked yet
          </div>
          {topRecipes.length > 0 && (
            <ul className="list tight">
              {topRecipes.map((r) => (
                <li key={r.id} className="row between">
                  <Link to={`/recipes/${r.id}`}>{r.name}</Link>
                  <span className="small faint">cooked {r.timesCooked}×</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card stack">
        <h2>
          <Printer size={17} style={{ verticalAlign: '-3px' }} /> Printable documents
        </h2>
        <p className="small muted">Each opens a clean print layout. Use your browser’s “Save as PDF” to keep a copy.</p>
        <div className="quick-actions">
          <Link className="btn" to={`/print/week/${ws}`}>
            <CalendarDays /> Weekly meal plan
          </Link>
          <Link className="btn" to={`/print/day/${t}`}>
            <FileText /> Today’s plan
          </Link>
          <Link className="btn" to={data.preferences.lastListId ? `/print/grocery/${data.preferences.lastListId}` : '/grocery'}>
            <ShoppingCart /> Shopping list
          </Link>
          <Link className="btn" to="/print/pantry">
            <Package /> Pantry inventory
          </Link>
          <Link className="btn" to={`/print/expenses/${month}`}>
            <Receipt /> Monthly expenses
          </Link>
          <Link className="btn" to="/print/equipment">
            <Wrench /> Equipment
          </Link>
          <Link className="btn" to="/print/progress">
            <ClipboardList /> Cooking progress
          </Link>
          <Link className="btn" to="/print/safety">
            <FileText /> Food-safety sheet
          </Link>
        </div>
      </section>
    </div>
  );
}
