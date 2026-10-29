import { useMemo, useState, type DragEvent } from 'react';
import { ChevronLeft, ChevronRight, Copy, Eraser, MoreHorizontal, Printer, ShoppingCart } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store';
import { Alert, Field, Modal, PageHeader, Segmented, useConfirm } from '../components/ui';
import { MealEditor, type MealEditorTarget } from '../components/MealEditor';
import { addDays, daysInRange, endOfMonth, formatDate, formatMinutes, parseISODate, startOfMonth, startOfWeek, today, weekdayName } from '../domain/dates';
import { MEAL_SLOTS } from '../domain/constants';
import { copyDay, copyWeek, dayMinutes, mealDiet, mealName, mealsOn, moveMeal, summarizeRange } from '../domain/planner';
import type { MealSlot } from '../domain/types';

type View = 'week' | '14' | 'month';

export function Planner() {
  const { data, update } = useApp();
  const nav = useNavigate();
  const confirm = useConfirm();
  const view = data.preferences.plannerView;
  const setView = (v: View) => update((d) => void (d.preferences.plannerView = v));
  const [anchor, setAnchor] = useState(() => today());
  const [editor, setEditor] = useState<MealEditorTarget | null>(null);
  const [copyOpen, setCopyOpen] = useState<null | { mode: 'day' | 'week'; from: string }>(null);
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const ws = data.settings.weekStartsOn;
  const t = today();

  const range = useMemo(() => {
    if (view === 'month') {
      const from = startOfMonth(anchor);
      return { from, to: endOfMonth(anchor) };
    }
    const from = startOfWeek(anchor, ws);
    return { from, to: addDays(from, view === '14' ? 13 : 6) };
  }, [anchor, view, ws]);

  const summary = summarizeRange(data, range.from, range.to);
  const step = (dir: number) => {
    if (view === 'month') {
      const d = parseISODate(anchor);
      d.setMonth(d.getMonth() + dir, 1);
      setAnchor(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`);
    } else setAnchor(addDays(anchor, dir * (view === '14' ? 14 : 7)));
  };

  const onDrop = (e: DragEvent, date: string, slot?: MealSlot) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData('text/meal-id');
    if (!id) return;
    const copy = e.altKey || e.ctrlKey || e.metaKey;
    update((d) => {
      if (copy) {
        const m = d.meals.find((x) => x.id === id);
        if (m) d.meals.push({ ...structuredClone(m), id: `${id}-c${Date.now()}`, date, slot: slot ?? m.slot, status: 'planned', pantryDeducted: false });
      } else moveMeal(d, id, date, slot);
    }, copy ? 'Meal copied' : 'Meal moved');
  };

  const clearDay = async (date: string) => {
    setDayMenu(null);
    const n = data.meals.filter((m) => m.date === date).length;
    if (!n) return;
    if (!(await confirm({ title: `Clear ${formatDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}?`, message: `${n} meal(s) will be removed from the plan.`, confirmLabel: 'Clear day', danger: true }))) return;
    update((d) => void (d.meals = d.meals.filter((m) => m.date !== date)), 'Day cleared');
  };

  const days = daysInRange(range.from, range.to);

  return (
    <div className="page">
      <PageHeader
        title="Meal Planner"
        sub={`${formatDate(range.from, { day: 'numeric', month: 'short' })} – ${formatDate(range.to)}`}
        actions={
          <>
            <button className="btn" onClick={() => setCopyOpen({ mode: 'week', from: startOfWeek(anchor, ws) })}>
              <Copy /> Copy week
            </button>
            <button className="btn" onClick={() => nav(`/grocery?build=range&from=${range.from}&to=${view === 'month' ? addDays(range.from, 6) : range.to}`)}>
              <ShoppingCart /> Shopping list
            </button>
            <button className="btn" onClick={() => nav(`/print/week/${startOfWeek(anchor, ws)}`)}>
              <Printer /> Print week
            </button>
          </>
        }
      />

      <div className="toolbar">
        <div className="btn-group">
          <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft />
          </button>
          <button className="btn sm" onClick={() => setAnchor(t)}>
            Today
          </button>
          <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight />
          </button>
        </div>
        <Segmented<View> label="Planner view" value={view} onChange={setView} options={[{ value: 'week', label: 'Week' }, { value: '14', label: '14 days' }, { value: 'month', label: 'Month' }]} />
        <span className="grow" />
        <span className="small muted">
          Est. {formatMinutes(summary.totalMin)} cooking · {summary.vegDays} veg / {summary.nonVegDays} non-veg days · {summary.prepared}/{summary.planned} prepared
        </span>
      </div>

      {summary.nonVegDays > data.settings.nonVegDaysTarget + (view === '14' ? data.settings.nonVegDaysTarget : 0) && view !== 'month' && (
        <Alert kind="info">More non-veg days than your target ({data.settings.nonVegDaysTarget}/week). Consider swapping one for a dal or egg dish.</Alert>
      )}
      {summary.repeats.filter((r) => r.count > (view === '14' ? 3 : 2)).length > 0 && view !== 'month' && (
        <Alert kind="info">Repeated often: {summary.repeats.filter((r) => r.count > (view === '14' ? 3 : 2)).map((r) => `${r.name} ×${r.count}`).join(', ')}.</Alert>
      )}

      {view === 'month' ? (
        <MonthView from={range.from} to={range.to} ws={ws} onPick={(d) => { setAnchor(d); setView('week'); }} />
      ) : (
        <div className={`week-grid ${view === 'week' ? 'seven' : ''}`}>
          {days.map((date) => {
            const ms = mealsOn(data, date);
            const mins = dayMinutes(ms, recipes);
            const diet = ms.some((m) => mealDiet(m, recipes) === 'nonveg') ? 'nonveg' : ms.some((m) => mealDiet(m, recipes) === 'egg') ? 'egg' : ms.some((m) => m.dishes.length) ? 'veg' : null;
            return (
              <div
                key={date}
                className={`day-col ${date === t ? 'today' : ''} ${dragOver === date ? 'drop' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(date);
                }}
                onDragLeave={() => setDragOver((d) => (d === date ? null : d))}
                onDrop={(e) => onDrop(e, date)}
              >
                <div className="day-head">
                  <div>
                    <div className="d">
                      {weekdayName(date)} {diet && <span className={`diet-dot ${diet}`} title={diet} style={{ marginLeft: 4, verticalAlign: '-1px' }} />}
                    </div>
                    <div className="m">
                      {formatDate(date, { day: 'numeric', month: 'short' })} · {formatMinutes(mins)}
                    </div>
                  </div>
                  <div style={{ position: 'relative' }}>
                    <button className="icon-btn sm" aria-label={`Day actions for ${date}`} aria-expanded={dayMenu === date} onClick={() => setDayMenu(dayMenu === date ? null : date)}>
                      <MoreHorizontal />
                    </button>
                    {dayMenu === date && (
                      <div className="card" style={{ position: 'absolute', right: 0, top: 34, zIndex: 10, padding: 6, display: 'grid', gap: 2, minWidth: 170 }}>
                        <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setDayMenu(null); setCopyOpen({ mode: 'day', from: date }); }}>
                          <Copy /> Copy day to…
                        </button>
                        <button className="btn sm ghost" style={{ justifyContent: 'flex-start' }} onClick={() => { setDayMenu(null); nav(`/print/day/${date}`); }}>
                          <Printer /> Print day
                        </button>
                        <button className="btn sm ghost danger" style={{ justifyContent: 'flex-start' }} onClick={() => clearDay(date)}>
                          <Eraser /> Clear day
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="day-body">
                  {MEAL_SLOTS.map((s) => {
                    const inSlot = ms.filter((m) => m.slot === s.id);
                    if (!inSlot.length)
                      return (
                        <button
                          key={s.id}
                          className="slot empty-slot"
                          onClick={() => setEditor({ date, slot: s.id })}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.stopPropagation();
                            onDrop(e, date, s.id);
                          }}
                        >
                          <span className="slot-label">+ {s.label}</span>
                        </button>
                      );
                    return inSlot.map((m) => (
                      <button
                        key={m.id}
                        className={`slot ${m.status}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/meal-id', m.id);
                          e.dataTransfer.effectAllowed = 'copyMove';
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.stopPropagation();
                          onDrop(e, date, s.id);
                        }}
                        onClick={() => setEditor({ mealId: m.id, date, slot: m.slot })}
                        title="Click to edit · drag to move (hold Ctrl/Alt to copy)"
                      >
                        <span className="slot-label">
                          <span>{s.label}</span>
                          <span>
                            {m.people}👤{m.status === 'prepared' ? ' ✓' : ''}
                          </span>
                        </span>
                        <span className="slot-name">{mealName(m, recipes)}</span>
                        {m.reminder && <span className="tiny warn-text">⏰ {m.reminder}</span>}
                      </button>
                    ));
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MealEditor target={editor} onClose={() => setEditor(null)} />
      {copyOpen && (
        <CopyDialog
          mode={copyOpen.mode}
          from={copyOpen.from}
          ws={ws}
          onClose={() => setCopyOpen(null)}
          onCopy={(from, to, replace) => {
            update((d) => {
              const n = copyOpen.mode === 'day' ? copyDay(d, from, to, replace) : copyWeek(d, from, to, replace);
              if (!n) throw new Error('Nothing to copy — the source has no meals.');
            }, copyOpen.mode === 'day' ? 'Day copied' : 'Week copied');
            setCopyOpen(null);
            setAnchor(to);
          }}
        />
      )}
    </div>
  );
}

function CopyDialog({ mode, from: initialFrom, ws, onClose, onCopy }: { mode: 'day' | 'week'; from: string; ws: 0 | 1; onClose: () => void; onCopy: (from: string, to: string, replace: boolean) => void }) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(addDays(initialFrom, mode === 'day' ? 1 : 7));
  const [replace, setReplace] = useState(false);
  const f = mode === 'week' ? startOfWeek(from, ws) : from;
  const tt = mode === 'week' ? startOfWeek(to, ws) : to;
  return (
    <Modal
      open
      onClose={onClose}
      size="small"
      title={mode === 'day' ? 'Copy a day' : 'Copy a week'}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={f === tt} onClick={() => onCopy(f, tt, replace)}>
            Copy
          </button>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label={mode === 'day' ? 'From day' : 'From week of'}>
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        </Field>
        <Field label={mode === 'day' ? 'To day' : 'To week of'}>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} />
        </Field>
      </div>
      {mode === 'week' && (
        <p className="small muted">
          Copies {formatDate(f, { day: 'numeric', month: 'short' })}–{formatDate(addDays(f, 6), { day: 'numeric', month: 'short' })} onto the week starting {formatDate(tt)}.
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace meals already planned on the target {mode === 'day' ? 'day' : 'days'}
      </label>
      <p className="small faint">Copied meals start as “planned”.</p>
    </Modal>
  );
}

function MonthView({ from, to, ws, onPick }: { from: string; to: string; ws: 0 | 1; onPick: (d: string) => void }) {
  const { data } = useApp();
  const recipes = useMemo(() => new Map(data.recipes.map((r) => [r.id, r])), [data.recipes]);
  const gridStart = startOfWeek(from, ws);
  const gridEnd = addDays(startOfWeek(to, ws), 6);
  const days = daysInRange(gridStart, gridEnd);
  const t = today();
  const dows = days.slice(0, 7).map((d) => formatDate(d, { weekday: 'short' }));
  return (
    <div className="card" style={{ padding: 8 }}>
      <div className="month-grid">
        {dows.map((d) => (
          <div key={d} className="dow">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const ms = mealsOn(data, d).filter((m) => m.slot !== 'snacks');
          return (
            <button key={d} className={`month-cell ${d < from || d > to ? 'out' : ''} ${d === t ? 'today' : ''}`} onClick={() => onPick(d)} aria-label={`${formatDate(d)}: ${ms.length} meals`}>
              <span className="n">{parseISODate(d).getDate()}</span>
              {ms.slice(0, 3).map((m) => (
                <span key={m.id} className="ml">
                  <span className={`diet-dot ${mealDiet(m, recipes)}`} style={{ width: 8, height: 8, marginRight: 3 }} />
                  {mealName(m, recipes)}
                </span>
              ))}
              {ms.length > 3 && <span className="ml faint">+{ms.length - 3}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
