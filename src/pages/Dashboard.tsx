import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, BookOpen, CalendarPlus, Check, ChefHat, Clock, ListChecks, Package, Plus, Printer, ShoppingCart,
  SkipForward, Utensils, Wallet, History, Backpack,
} from 'lucide-react';
import { useApp } from '../store';
import { Empty, Progress } from '../components/ui';
import { MealEditor, type MealEditorTarget } from '../components/MealEditor';
import { ExpenseEditor } from '../components/ExpenseEditor';
import { addDays, formatDate, formatLongDay, formatMinutes, relativeDays, startOfWeek, today } from '../domain/dates';
import { MEAL_SLOTS, MEAL_STATUS_LABEL } from '../domain/constants';
import { dayMinutes, mealName, mealTime, mealsOn, setMealStatus, summarizeRange } from '../domain/planner';
import { expiringSoon, lowStock } from '../domain/grocery';
import { weekSummary } from '../domain/budget';
import { formatINR } from '../domain/util';
import { formatAmount } from '../domain/units';
import type { MealEntry } from '../domain/types';

interface CheckItem {
  key: string;
  text: string;
  link?: string;
}

export function Dashboard() {
  const { data, update } = useApp();
  const nav = useNavigate();
  const t = today();
  const [editor, setEditor] = useState<MealEditorTarget | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const ingName = useMemo(() => new Map(data.ingredients.map((i) => [i.id, i.name])), [data.ingredients]);
  const todays = mealsOn(data, t);
  const tomorrow = mealsOn(data, addDays(t, 1));
  const weekStart = startOfWeek(t, data.settings.weekStartsOn);
  const week = summarizeRange(data, weekStart, addDays(weekStart, 6));
  const budget = weekSummary(data, t);
  const low = lowStock(data);
  const expiring = expiringSoon(data, 4, t);
  const todayMin = dayMinutes(todays, recipes);
  const packed = todays.filter((m) => m.slot === 'packed');

  // Active shopping list
  const activeList = data.groceryLists.find((l) => l.id === data.preferences.lastListId && l.status === 'active') ?? data.groceryLists.find((l) => l.status === 'active');
  const pending = activeList ? data.groceryItems.filter((i) => i.listId === activeList.id && !i.purchased) : [];

  const recent = [...data.recipes].filter((r) => r.lastCooked).sort((a, b) => (a.lastCooked! < b.lastCooked! ? 1 : -1)).slice(0, 5);

  // Prep checklist: derived from today's meals + tonight's prep for tomorrow
  const checklist: CheckItem[] = [];
  for (const m of todays) {
    if (m.status !== 'planned') continue;
    if (m.reminder) checklist.push({ key: `rem-${m.id}`, text: m.reminder });
    for (const dsh of m.dishes) {
      const r = recipes.get(dsh.recipeId);
      if (r) checklist.push({ key: `rv-${m.id}-${r.id}`, text: `${MEAL_SLOTS.find((s) => s.id === m.slot)?.label}: review & prep ${r.name} (${dsh.servings} servings)`, link: `/recipes/${r.id}?servings=${dsh.servings}` });
    }
  }
  if (packed.length) checklist.push({ key: 'pack', text: `Pack ${packed.reduce((a, m) => a + m.people, 0)} lunches in insulated boxes before ${data.settings.mealTimes.packed}` });
  for (const m of tomorrow) if (m.reminder) checklist.push({ key: `tmr-${m.id}`, text: `Tonight, for tomorrow’s ${m.slot}: ${m.reminder}` });
  const ticks = data.checklists[t] ?? {};
  const toggleTick = (key: string) =>
    update((d) => {
      const day = (d.checklists[t] ||= {});
      day[key] = !day[key];
      // prune checklists older than 30 days
      for (const k of Object.keys(d.checklists)) if (k < addDays(t, -30)) delete d.checklists[k];
    });

  const setStatus = (m: MealEntry, s: MealEntry['status']) => update((d) => setMealStatus(d, m.id, s), `Marked ${MEAL_STATUS_LABEL[s].toLowerCase()}`);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{formatLongDay(t)}</h1>
          <div className="sub">
            {todays.length ? `${todays.length} meals planned · about ${formatMinutes(todayMin)} of cooking (estimate)` : 'Nothing planned for today yet'}
          </div>
        </div>
      </div>

      <div className="quick-actions no-print">
        <button className="btn" onClick={() => setEditor({ date: t, slot: 'dinner' })}>
          <CalendarPlus /> Add meal
        </button>
        <button className="btn" onClick={() => nav('/recipes/new')}>
          <Plus /> Add recipe
        </button>
        <button className="btn" onClick={() => nav('/grocery?build=week')}>
          <ShoppingCart /> Build shopping list
        </button>
        <button className="btn" onClick={() => setExpenseOpen(true)}>
          <Wallet /> Record expense
        </button>
        <button className="btn" onClick={() => nav(`/print/day/${t}`)}>
          <Printer /> Print today’s plan
        </button>
      </div>

      <div className="grid-3">
        <section className="card span-2" aria-labelledby="today-meals">
          <div className="card-head">
            <h2 id="today-meals">
              <Utensils /> Today’s meals
            </h2>
            <Link to="/planner" className="small">
              Open planner →
            </Link>
          </div>
          {todays.length === 0 ? (
            <Empty icon={<CalendarPlus />} title="No meals planned today" action={<button className="btn primary sm" onClick={() => setEditor({ date: t, slot: 'lunch' })}>Plan a meal</button>}>
              Add breakfast, lunch, dinner or packed lunches.
            </Empty>
          ) : (
            <ul className="list">
              {todays.map((m) => {
                const firstRecipe = m.dishes[0] && recipes.get(m.dishes[0].recipeId);
                return (
                  <li key={m.id}>
                    <div className="item-row">
                      <div className="grow stack sm">
                        <div className="row gap wrap">
                          <span className="tiny bold faint" style={{ textTransform: 'uppercase', letterSpacing: '.05em' }}>
                            {MEAL_SLOTS.find((s) => s.id === m.slot)?.label} · {data.settings.mealTimes[m.slot]}
                          </span>
                          {m.status !== 'planned' && <span className={`badge ${m.status === 'prepared' ? 'ok' : m.status === 'skipped' ? '' : 'accent'}`}>{MEAL_STATUS_LABEL[m.status]}</span>}
                          {m.isLeftover && <span className="badge">Leftover</span>}
                        </div>
                        <button className="btn ghost" style={{ justifyContent: 'flex-start', padding: 0, minHeight: 0, fontWeight: 600, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setEditor({ mealId: m.id, date: m.date, slot: m.slot })}>
                          {mealName(m, recipes)}
                        </button>
                        <div className="meta-row">
                          <span>
                            <Clock /> {formatMinutes(mealTime(m, recipes))}
                          </span>
                          <span>{m.people} people</span>
                          {m.dishes.map((dsh) => (
                            <Link key={dsh.recipeId} to={`/recipes/${dsh.recipeId}?servings=${dsh.servings}`}>
                              {recipes.get(dsh.recipeId)?.name ?? 'Recipe'}
                            </Link>
                          ))}
                        </div>
                        {m.notes && <span className="small faint">{m.notes}</span>}
                      </div>
                      <div className="btn-group no-print">
                        {firstRecipe && m.status === 'planned' && (
                          <Link className="btn sm" to={`/recipes/${firstRecipe.id}/cook?servings=${m.dishes[0].servings}&meal=${m.id}`} title="Cooking mode">
                            <ChefHat /> Cook
                          </Link>
                        )}
                        {m.status === 'planned' ? (
                          <>
                            <button className="icon-btn sm" title="Mark prepared" aria-label="Mark prepared" onClick={() => setStatus(m, 'prepared')}>
                              <Check />
                            </button>
                            <button className="icon-btn sm" title="Skip" aria-label="Skip meal" onClick={() => setStatus(m, 'skipped')}>
                              <SkipForward />
                            </button>
                          </>
                        ) : (
                          <button className="btn sm ghost" onClick={() => setStatus(m, 'planned')}>
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {packed.length > 0 && (
            <div className="alert info" style={{ marginTop: 8 }}>
              <Backpack />
              <div>
                <b>Packed lunches:</b> {packed.map((m) => `${mealName(m, recipes)} × ${m.people}`).join(', ')}. {data.settings.packedLunchNote}
              </div>
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="prep">
          <div className="card-head">
            <h2 id="prep">
              <ListChecks /> Prep checklist
            </h2>
            <span className="small faint">
              {Object.values(ticks).filter(Boolean).length}/{checklist.length}
            </span>
          </div>
          {checklist.length === 0 ? (
            <p className="small faint">Plan today’s meals or add preparation reminders to see a checklist.</p>
          ) : (
            <ul className="check-list">
              {checklist.map((c) => (
                <li key={c.key}>
                  <label style={{ fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={!!ticks[c.key]} onChange={() => toggleTick(c.key)} />
                    <span>
                      {c.text}
                      {c.link && (
                        <>
                          {' '}
                          <Link to={c.link} onClick={(e) => e.stopPropagation()}>
                            recipe
                          </Link>
                        </>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid-4">
        <section className="card stat">
          <span className="label">This week’s grocery spend</span>
          <span className="value">{formatINR(budget.spent)}</span>
          {budget.level === 'none' ? (
            <span className="sub">
              No weekly budget yet · <Link to="/budget">set one</Link>
            </span>
          ) : (
            <>
              <Progress pct={budget.pct} level={budget.level} />
              <span className={`sub ${budget.level === 'over' ? 'error-text' : budget.level === 'warn' ? 'warn-text' : ''}`}>
                {budget.remaining >= 0 ? `${formatINR(budget.remaining)} left of ${formatINR(budget.budget)}` : `${formatINR(-budget.remaining)} over ${formatINR(budget.budget)}`}
              </span>
            </>
          )}
        </section>
        <section className="card stat">
          <span className="label">Week plan completion</span>
          <span className="value">{week.completionPct}%</span>
          <Progress pct={week.completionPct} />
          <span className="sub">
            {week.prepared} of {week.planned} meals prepared · {week.nonVegDays} non-veg days
          </span>
        </section>
        <section className="card stat">
          <span className="label">Cooking this week (est.)</span>
          <span className="value">{formatMinutes(week.totalMin)}</span>
          <span className="sub">{week.busiestDay ? `Busiest: ${formatDate(week.busiestDay.date, { weekday: 'long' })} (${formatMinutes(week.busiestDay.minutes)})` : 'Plan meals to see effort'}</span>
        </section>
        <section className="card stat">
          <span className="label">Shopping pending</span>
          <span className="value">{pending.length}</span>
          <span className="sub">{activeList ? <Link to={`/grocery/${activeList.id}`}>{activeList.name}</Link> : <Link to="/grocery">Create a shopping list</Link>}</span>
        </section>
      </div>

      <div className="grid-3">
        <section className="card" aria-labelledby="use-soon">
          <div className="card-head">
            <h2 id="use-soon">
              <AlertTriangle /> Use soon
            </h2>
            <Link to="/inventory" className="small">
              Pantry →
            </Link>
          </div>
          {expiring.length === 0 ? (
            <p className="small faint">Nothing expiring in the next 4 days. Add best-before dates in the pantry to get alerts.</p>
          ) : (
            <ul className="list tight">
              {expiring.map((p) => (
                <li key={p.id} className="row between">
                  <span>{ingName.get(p.ingredientId)}</span>
                  <span className={`badge ${p.expiry! < t ? 'danger' : 'warn'}`}>{p.expiry! < t ? 'expired' : relativeDays(p.expiry!, t)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="low">
          <div className="card-head">
            <h2 id="low">
              <Package /> Low-stock staples
            </h2>
          </div>
          {low.length === 0 ? (
            <p className="small faint">No low-stock alerts. Set “minimum stock” on pantry items with known quantities to track this.</p>
          ) : (
            <ul className="list tight">
              {low.map((p) => (
                <li key={p.id} className="row between">
                  <span>{ingName.get(p.ingredientId)}</span>
                  <span className="small warn-text">
                    {formatAmount(p.qty!, p.unit)} (min {formatAmount(p.minQty!, p.unit)})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="upcoming">
          <div className="card-head">
            <h2 id="upcoming">
              <ShoppingCart /> Upcoming purchases
            </h2>
          </div>
          {pending.length === 0 ? (
            <p className="small faint">{activeList ? 'Everything on the active list is purchased.' : 'No active shopping list.'}</p>
          ) : (
            <ul className="list tight">
              {pending.slice(0, 7).map((i) => (
                <li key={i.id} className="row between">
                  <span className="truncate">{i.name}</span>
                  <span className="small muted nowrap">{formatAmount(i.qty, i.unit)}</span>
                </li>
              ))}
              {pending.length > 7 && (
                <li className="small">
                  <Link to={`/grocery/${activeList!.id}`}>+{pending.length - 7} more</Link>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>

      <section className="card" aria-labelledby="recent">
        <div className="card-head">
          <h2 id="recent">
            <History /> Recently cooked
          </h2>
          <Link to="/recipes" className="small">
            <BookOpen size={14} /> All recipes
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="small faint">Mark meals as prepared or finish a cooking session to build your history.</p>
        ) : (
          <div className="row gap wrap">
            {recent.map((r) => (
              <Link key={r.id} to={`/recipes/${r.id}`} className="badge primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>
                {r.name} · {relativeDays(r.lastCooked!, t)}
              </Link>
            ))}
          </div>
        )}
      </section>

      <MealEditor target={editor} onClose={() => setEditor(null)} />
      <ExpenseEditor open={expenseOpen} onClose={() => setExpenseOpen(false)} />
    </div>
  );
}
