import { useEffect, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useApp } from '../store';
import { scaleRecipe, totalTime, estimateRecipeCost } from '../domain/recipes';
import { formatAmount } from '../domain/units';
import { addDays, daysInRange, endOfMonth, formatDate, formatLongDay, formatMinutes, startOfMonth, startOfWeek, today, weekdayName } from '../domain/dates';
import { DIET_LABEL, DIFFICULTY_LABEL, EQUIPMENT_STATUS_LABEL, GROCERY_CATEGORIES, MEAL_SLOTS, expenseCategoryLabel, groceryCategoryLabel, slotLabel } from '../domain/constants';
import { dayMinutes, mealName, mealsOn } from '../domain/planner';
import { listTotals } from '../domain/grocery';
import { byCategory, expensesInRange, totalOf } from '../domain/budget';
import { formatINR, groupBy } from '../domain/util';
import { LESSONS, PATHS, TWO_WEEK_PLAN } from '../data/learning';

function Doc({ title, children }: { title: string; children: ReactNode }) {
  const nav = useNavigate();
  const { data } = useApp();
  useEffect(() => {
    document.title = `${title} · Family Kitchen OS`;
  }, [title]);
  return (
    <div className="print-page-wrap">
      <div className="print-toolbar no-print">
        <button className="btn" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}>
          <ArrowLeft /> Back
        </button>
        <span className="grow small muted">Print preview · use “Save as PDF” in the print dialog to keep a copy</span>
        <button className="btn primary" onClick={() => window.print()} autoFocus>
          <Printer /> Print
        </button>
      </div>
      <article className="doc">
        {children}
        <div className="doc-foot">
          <span>{data.settings.householdName} · Family Kitchen OS</span>
          <span>Printed {formatDate(today())}</span>
        </div>
      </article>
    </div>
  );
}

const Box = ({ checked }: { checked?: boolean }) => <span className={`box ${checked ? 'checked' : ''}`} aria-hidden />;

export function PrintPage() {
  const { kind, id } = useParams();
  switch (kind) {
    case 'recipe':
      return <RecipePrint id={id!} />;
    case 'grocery':
      return <GroceryPrint id={id!} />;
    case 'week':
      return <WeekPrint start={id} />;
    case 'day':
      return <DayPrint date={id ?? today()} />;
    case 'pantry':
      return <PantryPrint />;
    case 'expenses':
      return <ExpensesPrint month={id} />;
    case 'equipment':
      return <EquipmentPrint />;
    case 'progress':
      return <ProgressPrint />;
    case 'safety':
      return <SafetyPrint />;
    default:
      return (
        <Doc title="Not found">
          <p>Unknown document.</p>
        </Doc>
      );
  }
}

function RecipePrint({ id }: { id: string }) {
  const { data } = useApp();
  const [params] = useSearchParams();
  const r = data.recipes.find((x) => x.id === id);
  if (!r)
    return (
      <Doc title="Recipe not found">
        <p>Recipe not found.</p>
      </Doc>
    );
  const servings = Number(params.get('servings')) || r.servings;
  const scaled = scaleRecipe(r, servings, data.ingredients);
  const cost = estimateRecipeCost(r, servings, data.ingredients);
  return (
    <Doc title={r.name}>
      <h1>{r.name}</h1>
      <div className="doc-meta">
        <span>
          <b>Serves:</b> {servings}
        </span>
        <span>
          <b>Prep:</b> {formatMinutes(r.prepMin)}
        </span>
        <span>
          <b>Cook:</b> {formatMinutes(r.cookMin)}
        </span>
        <span>
          <b>Total:</b> ≈ {formatMinutes(totalTime(r))}
        </span>
        <span>
          <b>{DIET_LABEL[r.diet]}</b> · {DIFFICULTY_LABEL[r.difficulty]}
        </span>
        <span>
          <b>Est. cost:</b> {formatINR(cost.total)}
        </span>
      </div>
      {r.halalNotes && <p className="note"><b>Halal sourcing:</b> {r.halalNotes}</p>}
      {r.dietaryNotes && <p className="note"><b>Note:</b> {r.dietaryNotes}</p>}
      <h2>Ingredients</h2>
      <ul className="doc-ings">
        {scaled.map((s) => (
          <li key={s.ri.id}>
            <Box /> <b>{formatAmount(s.qty, s.unit)}</b> {s.name}
            {s.ri.note && <span className="muted"> — {s.ri.note}</span>}
            {s.ri.optional && <span className="muted"> (optional)</span>}
            {s.ri.substitution && <div className="muted note">Swap: {s.ri.substitution}</div>}
          </li>
        ))}
      </ul>
      {r.equipmentIds.length > 0 && (
        <p className="note">
          <b>Equipment:</b> {r.equipmentIds.map((e) => data.equipment.find((x) => x.id === e)?.name ?? e).join(', ')}
        </p>
      )}
      <h2>Method</h2>
      <ol className="doc-steps">
        {r.steps.map((s) => (
          <li key={s.id}>
            {s.text}
            {s.timerMin ? <b> ({s.timerMin} min)</b> : null}
          </li>
        ))}
      </ol>
      {(r.tips.length > 0 || r.mistakes.length > 0) && (
        <div className="two-col group">
          {r.tips.length > 0 && (
            <div>
              <h3>Tips</h3>
              <ul className="note">
                {r.tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          {r.mistakes.length > 0 && (
            <div>
              <h3>Avoid</h3>
              <ul className="note">
                {r.mistakes.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {r.storage && (
        <div className="group">
          <h3>Storage & reheating</h3>
          <p className="note">{r.storage}</p>
        </div>
      )}
      {r.feedback && (
        <div className="group">
          <h3>My notes</h3>
          <p className="note">{r.feedback}</p>
        </div>
      )}
    </Doc>
  );
}

function GroceryPrint({ id }: { id: string }) {
  const { data } = useApp();
  const list = data.groceryLists.find((l) => l.id === id);
  if (!list)
    return (
      <Doc title="List not found">
        <p>Shopping list not found.</p>
      </Doc>
    );
  const items = data.groceryItems.filter((i) => i.listId === id);
  const byStore = data.preferences.groceryGroupBy === 'store';
  const g = groupBy(items, (i) => (byStore ? i.store || 'Any shop' : i.category));
  const keys = byStore ? Object.keys(g).sort() : GROCERY_CATEGORIES.map((c) => c.id).filter((c) => g[c]);
  const totals = listTotals(items);
  return (
    <Doc title={list.name}>
      <h1>{list.name}</h1>
      <div className="doc-meta">
        <span>
          <b>Date:</b> {formatDate(today())}
        </span>
        {list.store && (
          <span>
            <b>Shop:</b> {list.store}
          </span>
        )}
        {list.fromDate && (
          <span>
            <b>For meals:</b> {formatDate(list.fromDate, { day: 'numeric', month: 'short' })} – {formatDate(list.toDate, { day: 'numeric', month: 'short' })}
          </span>
        )}
        <span>
          <b>Items:</b> {items.length}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 24 }} />
            <th>Item</th>
            <th>Quantity</th>
            <th className="num">Est. ₹</th>
            <th className="num" style={{ width: 80 }}>Paid ₹</th>
          </tr>
        </thead>
        {keys.map((k) => (
          <tbody key={k} className="group">
            <tr>
              <td colSpan={5} style={{ fontWeight: 700, paddingTop: 10, borderBottom: '1.5px solid #111' }}>
                {byStore ? k : groceryCategoryLabel(k as never)}
              </td>
            </tr>
            {g[k]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((i) => (
                <tr key={i.id}>
                  <td>
                    <Box checked={i.purchased} />
                  </td>
                  <td>
                    {i.name}
                    {i.note && i.source === 'manual' && <span className="muted"> — {i.note}</span>}
                  </td>
                  <td>{formatAmount(i.qty, i.unit)}</td>
                  <td className="num">{i.estPrice != null ? formatINR(i.estPrice) : ''}</td>
                  <td className="num">{i.actualPrice != null ? formatINR(i.actualPrice) : ''}</td>
                </tr>
              ))}
          </tbody>
        ))}
        <tbody>
          <tr className="total-row">
            <td />
            <td colSpan={2}>Total estimated</td>
            <td className="num">{formatINR(totals.estimated)}</td>
            <td className="num">{totals.actual ? formatINR(totals.actual) : ''}</td>
          </tr>
        </tbody>
      </table>
      {totals.unpriced > 0 && <p className="note muted">{totals.unpriced} item(s) have no price estimate.</p>}
    </Doc>
  );
}

function WeekPrint({ start }: { start?: string }) {
  const { data } = useApp();
  const from = start ?? startOfWeek(today(), data.settings.weekStartsOn);
  const days = daysInRange(from, addDays(from, 6));
  const recipes = new Map(data.recipes.map((r) => [r.id, r]));
  const cell = (date: string, slot: string) =>
    mealsOn(data, date)
      .filter((m) => m.slot === slot)
      .map((m) => mealName(m, recipes) + (m.people ? ` (${m.people})` : ''))
      .join('; ');
  const reminders = days.flatMap((d) => mealsOn(data, d).filter((m) => m.reminder).map((m) => ({ d, m })));
  return (
    <Doc title="Weekly meal plan">
      <h1>Meal plan: {formatDate(from, { day: 'numeric', month: 'short' })} – {formatDate(addDays(from, 6))}</h1>
      <div className="doc-meta">
        <span>
          <b>Household:</b> {data.settings.householdSize} people
        </span>
        <span>
          <b>Packed lunches:</b> {data.settings.peoplePerMeal.packed}
        </span>
      </div>
      <table className="week-table">
        <thead>
          <tr>
            <th>Day</th>
            {MEAL_SLOTS.map((s) => (
              <th key={s.id}>{s.id === 'snacks' ? 'Tea & snacks' : s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d}>
              <td className="day">
                {weekdayName(d)}
                <div className="muted" style={{ fontWeight: 400 }}>
                  {formatDate(d, { day: 'numeric', month: 'short' })}
                </div>
              </td>
              {MEAL_SLOTS.map((s) => (
                <td key={s.id}>{cell(d, s.id)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Preparation reminders</h2>
      {reminders.length === 0 ? (
        <p className="note muted">None.</p>
      ) : (
        <ul className="note">
          {reminders.map(({ d, m }) => (
            <li key={m.id}>
              <b>
                {weekdayName(d)} {slotLabel(m.slot).toLowerCase()}:
              </b>{' '}
              {m.reminder}
            </li>
          ))}
        </ul>
      )}
      {data.settings.packedLunchNote && (
        <p className="note">
          <b>Packed lunches:</b> {data.settings.packedLunchNote} Use insulated boxes; pack hot food piping hot or cold food with an ice pack.
        </p>
      )}
    </Doc>
  );
}

function DayPrint({ date }: { date: string }) {
  const { data } = useApp();
  const recipes = new Map(data.recipes.map((r) => [r.id, r]));
  const ms = mealsOn(data, date);
  return (
    <Doc title={`Plan for ${date}`}>
      <h1>{formatLongDay(date)}</h1>
      <div className="doc-meta">
        <span>
          <b>Meals:</b> {ms.length}
        </span>
        <span>
          <b>Est. cooking:</b> {formatMinutes(dayMinutes(ms, recipes))}
        </span>
      </div>
      {ms.length === 0 && <p>No meals planned.</p>}
      {ms.map((m) => (
        <div key={m.id} className="group">
          <h2>
            {slotLabel(m.slot)} · {data.settings.mealTimes[m.slot]} — {mealName(m, recipes)} ({m.people} people)
          </h2>
          {m.reminder && <p className="note">⏰ {m.reminder}</p>}
          {m.notes && <p className="note">{m.notes}</p>}
          {m.dishes.map((dsh) => {
            const r = recipes.get(dsh.recipeId);
            if (!r) return null;
            return (
              <div key={dsh.recipeId}>
                <h3>
                  {r.name} — {dsh.servings} servings · ≈ {formatMinutes(totalTime(r))}
                </h3>
                <ul className="doc-ings">
                  {scaleRecipe(r, dsh.servings, data.ingredients).map((s) => (
                    <li key={s.ri.id}>
                      <Box /> {formatAmount(s.qty, s.unit)} {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </Doc>
  );
}

function PantryPrint() {
  const { data } = useApp();
  const ing = new Map(data.ingredients.map((i) => [i.id, i]));
  const g = groupBy(data.pantry, (p) => ing.get(p.ingredientId)?.category ?? 'household');
  return (
    <Doc title="Pantry inventory">
      <h1>Pantry inventory</h1>
      <div className="doc-meta">
        <span>
          <b>Items:</b> {data.pantry.length}
        </span>
        <span>Use the blank column for a stock count.</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Recorded qty</th>
            <th>Min</th>
            <th>Location</th>
            <th>Best before</th>
            <th style={{ width: 90 }}>Count</th>
          </tr>
        </thead>
        {GROCERY_CATEGORIES.filter((c) => g[c.id]).map((c) => (
          <tbody key={c.id} className="group">
            <tr>
              <td colSpan={6} style={{ fontWeight: 700, paddingTop: 10, borderBottom: '1.5px solid #111' }}>
                {c.label}
              </td>
            </tr>
            {g[c.id].map((p) => (
              <tr key={p.id}>
                <td>{ing.get(p.ingredientId)?.name}</td>
                <td>{p.qty == null ? 'unknown' : formatAmount(p.qty, p.unit)}</td>
                <td>{p.minQty ? formatAmount(p.minQty, p.unit) : ''}</td>
                <td>{p.location ?? ''}</td>
                <td>{p.expiry ? formatDate(p.expiry, { day: 'numeric', month: 'short' }) : ''}</td>
                <td />
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Doc>
  );
}

function ExpensesPrint({ month }: { month?: string }) {
  const { data } = useApp();
  const from = startOfMonth(month ?? today());
  const to = endOfMonth(from);
  const ex = expensesInRange(data.expenses, from, to).sort((a, b) => a.date.localeCompare(b.date));
  const total = totalOf(ex);
  const cats = byCategory(ex).filter((c) => c.total > 0);
  return (
    <Doc title="Monthly expense summary">
      <h1>Expenses — {formatDate(from, { month: 'long', year: 'numeric' })}</h1>
      <div className="doc-meta">
        <span>
          <b>Total:</b> {formatINR(total, true)}
        </span>
        <span>
          <b>Budget:</b> {data.settings.monthlyBudget ? formatINR(data.settings.monthlyBudget) : 'not set'}
        </span>
        {data.settings.monthlyBudget > 0 && (
          <span>
            <b>{total > data.settings.monthlyBudget ? 'Over by' : 'Remaining'}:</b> {formatINR(Math.abs(data.settings.monthlyBudget - total))}
          </span>
        )}
        <span>
          <b>Entries:</b> {ex.length}
        </span>
      </div>
      <h2>By category</h2>
      <table>
        <tbody>
          {cats.map((c) => (
            <tr key={c.category}>
              <td>{expenseCategoryLabel(c.category)}</td>
              <td className="num">{formatINR(c.total, true)}</td>
              <td className="num">{total ? Math.round((c.total / total) * 100) : 0}%</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>All entries</h2>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>Vendor</th>
            <th>Notes</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ex.map((e) => (
            <tr key={e.id}>
              <td>{formatDate(e.date, { day: 'numeric', month: 'short' })}</td>
              <td>{expenseCategoryLabel(e.category)}</td>
              <td>{e.vendor}</td>
              <td className="note">{e.notes}</td>
              <td className="num">{formatINR(e.amount, true)}</td>
            </tr>
          ))}
          <tr className="total-row">
            <td colSpan={4}>Total</td>
            <td className="num">{formatINR(total, true)}</td>
          </tr>
        </tbody>
      </table>
    </Doc>
  );
}

function EquipmentPrint() {
  const { data } = useApp();
  return (
    <Doc title="Kitchen equipment">
      <h1>Kitchen equipment</h1>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Category</th>
            <th>Status</th>
            <th className="num">Qty</th>
            <th>Condition</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {data.equipment.map((e) => (
            <tr key={e.id}>
              <td>{e.name}</td>
              <td>{e.category}</td>
              <td>{EQUIPMENT_STATUS_LABEL[e.status]}</td>
              <td className="num">{e.quantity}</td>
              <td>{e.condition ?? ''}</td>
              <td className="note">
                {e.notes}
                {e.wishlist ? ` (wishlist: ${e.wishlistPriority ?? 'low'})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Doc>
  );
}

function ProgressPrint() {
  const { data } = useApp();
  const byId = new Map(LESSONS.map((l) => [l.id, l]));
  return (
    <Doc title="Cooking progress checklist">
      <h1>Cooking progress checklist</h1>
      <div className="doc-meta">
        <span>
          <b>Completed:</b> {LESSONS.filter((l) => data.learningProgress[l.id]?.done).length} / {LESSONS.length} skills
        </span>
      </div>
      <h2>Two-week beginner plan</h2>
      <table>
        <tbody>
          {TWO_WEEK_PLAN.map((d) => (
            <tr key={d.day} className="group">
              <td style={{ width: 60 }}>
                <b>Day {d.day}</b>
              </td>
              <td>
                <b>{d.title}</b> — {d.focus}
                <div>
                  {d.lessonIds.map((id) => (
                    <span key={id} style={{ marginRight: 14 }}>
                      <Box checked={data.learningProgress[id]?.done} /> {byId.get(id)?.title}
                    </span>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {PATHS.map((p) => (
        <div key={p.id} className="group">
          <h2>{p.title}</h2>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {LESSONS.filter((l) => l.pathId === p.id).map((l) => (
              <li key={l.id} style={{ padding: '3px 0' }}>
                <Box checked={data.learningProgress[l.id]?.done} /> {l.title} <span className="muted">({l.level})</span>
                {data.learningProgress[l.id]?.date && <span className="muted"> — done {formatDate(data.learningProgress[l.id].date)}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Doc>
  );
}

function SafetyPrint() {
  const { data } = useApp();
  return (
    <Doc title="Food safety reminders">
      <h1>Kitchen food-safety reminders</h1>
      {data.safetyTips.map((t) => (
        <div key={t.id} className="group">
          <h3>{t.title}</h3>
          <p className="note">{t.body}</p>
        </div>
      ))}
      <p className="note muted">General reminders only. When in doubt, throw it out.</p>
    </Doc>
  );
}
