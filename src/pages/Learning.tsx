import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Circle, Pencil, Play, Plus, Printer, RotateCcw, ShieldCheck, Timer, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Empty, Field, Modal, PageHeader, Progress, Tabs, useConfirm } from '../components/ui';
import { LESSONS, PATHS, TWO_WEEK_PLAN, WORKFLOW_STEPS, type Lesson } from '../data/learning';
import { startSession, sessionElapsed } from '../domain/sessions';
import { formatDate, formatDuration, localDateOf, today } from '../domain/dates';
import { seedSafetyTips } from '../data/seed';
import { uid } from '../domain/util';
import { RecipeSelect } from '../components/MealEditor';
import { useNow } from '../hooks/useNow';

type Tab = 'plan' | 'paths' | 'sessions' | 'safety' | 'workflow';

export function LearningPage() {
  const { data } = useApp();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'plan';
  const done = LESSONS.filter((l) => data.learningProgress[l.id]?.done).length;
  const sessions = data.cookingSessions.filter((s) => s.status === 'done');
  const withEst = sessions.filter((s) => s.estimatedMin > 0);
  const avgDelta = withEst.length ? Math.round(withEst.reduce((a, s) => a + (s.elapsedSec / 60 - s.estimatedMin), 0) / withEst.length) : null;

  return (
    <div className="page">
      <PageHeader
        title="Cooking Learning"
        sub="Practise one skill at a time and track how your speed improves — without sacrificing quality."
        actions={
          <Link className="btn" to="/print/progress">
            <Printer /> Print progress checklist
          </Link>
        }
      />
      <div className="grid-3">
        <section className="card stat">
          <span className="label">Skills completed</span>
          <span className="value">
            {done}/{LESSONS.length}
          </span>
          <Progress pct={(done / LESSONS.length) * 100} />
        </section>
        <section className="card stat">
          <span className="label">Cooking sessions</span>
          <span className="value">{sessions.length}</span>
          <span className="sub">timed sessions recorded</span>
        </section>
        <section className="card stat">
          <span className="label">Speed vs estimate</span>
          <span className="value">{avgDelta == null ? '—' : `${avgDelta > 0 ? '+' : ''}${avgDelta} min`}</span>
          <span className="sub">{avgDelta == null ? 'finish a timed session to see this' : avgDelta > 0 ? 'slower than recipe estimates on average' : 'faster than recipe estimates on average'}</span>
        </section>
      </div>
      <Tabs<Tab>
        label="Learning sections"
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { value: 'plan', label: '2-week plan' },
          { value: 'paths', label: 'Skill paths' },
          { value: 'sessions', label: 'Sessions' },
          { value: 'workflow', label: 'Prep workflow' },
          { value: 'safety', label: 'Food safety' },
        ]}
      />
      {tab === 'plan' && <TwoWeek />}
      {tab === 'paths' && <Paths />}
      {tab === 'sessions' && <Sessions />}
      {tab === 'workflow' && <Workflow />}
      {tab === 'safety' && <Safety />}
    </div>
  );
}

function LessonCheck({ lesson }: { lesson: Lesson }) {
  const { data, update } = useApp();
  const p = data.learningProgress[lesson.id];
  return (
    <button
      className="icon-btn sm"
      aria-pressed={!!p?.done}
      aria-label={p?.done ? `Mark ${lesson.title} not done` : `Mark ${lesson.title} done`}
      onClick={() =>
        update((d) => {
          const cur = d.learningProgress[lesson.id] ?? { done: false };
          d.learningProgress[lesson.id] = { ...cur, done: !cur.done, date: !cur.done ? today() : undefined };
        })
      }
    >
      {p?.done ? <CheckCircle2 color="var(--ok)" /> : <Circle />}
    </button>
  );
}

function usePractice() {
  const { update } = useApp();
  const nav = useNavigate();
  return (recipeId: string) => {
    let sid = '';
    update((d) => {
      sid = startSession(d, { recipeIds: [recipeId] }).id;
    });
    nav(`/recipes/${recipeId}/cook?session=${sid}`);
  };
}

function TwoWeek() {
  const { data } = useApp();
  const practice = usePractice();
  const byId = new Map(LESSONS.map((l) => [l.id, l]));
  return (
    <div className="grid-2">
      {TWO_WEEK_PLAN.map((day) => {
        const lessons = day.lessonIds.map((id) => byId.get(id)!).filter(Boolean);
        const allDone = lessons.every((l) => data.learningProgress[l.id]?.done);
        return (
          <section key={day.day} className="card stack" style={allDone ? { borderColor: 'var(--ok)' } : undefined}>
            <div className="row between">
              <h3>
                Day {day.day} · {day.title}
              </h3>
              {allDone && <span className="badge ok">done</span>}
            </div>
            <p className="small muted">{day.focus}</p>
            {lessons.map((l) => (
              <div key={l.id} className="item-row">
                <LessonCheck lesson={l} />
                <span className="grow small">
                  <b>{l.title}</b>
                  {l.targetMin && <span className="faint"> · target {l.targetMin} min</span>}
                </span>
                {l.recipeId && (
                  <button className="btn sm" onClick={() => practice(l.recipeId!)}>
                    <Play /> Practise
                  </button>
                )}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function Paths() {
  const { data, update } = useApp();
  const practice = usePractice();
  const [path, setPath] = useState(PATHS[0].id);
  const lessons = LESSONS.filter((l) => l.pathId === path);
  return (
    <>
      <div className="pill-nav" role="group" aria-label="Skill paths">
        {PATHS.map((p) => {
          const ls = LESSONS.filter((l) => l.pathId === p.id);
          const d = ls.filter((l) => data.learningProgress[l.id]?.done).length;
          return (
            <button key={p.id} aria-pressed={path === p.id} onClick={() => setPath(p.id)}>
              {p.title} {d}/{ls.length}
            </button>
          );
        })}
      </div>
      <p className="muted small">{PATHS.find((p) => p.id === path)?.description}</p>
      <div className="stack lg">
        {lessons.map((l) => {
          const prog = data.learningProgress[l.id];
          const recipe = l.recipeId ? data.recipes.find((r) => r.id === l.recipeId) : undefined;
          return (
            <section key={l.id} className="card stack">
              <div className="row gap between top">
                <div className="row gap top">
                  <LessonCheck lesson={l} />
                  <div>
                    <h3>{l.title}</h3>
                    <div className="small muted">{l.goal}</div>
                  </div>
                </div>
                <span className={`badge ${l.level === 'beginner' ? 'ok' : l.level === 'intermediate' ? 'warn' : 'danger'}`}>{l.level}</span>
              </div>
              <div className="grid-2">
                <div>
                  <div className="field-label">Checklist</div>
                  <ul className="small">
                    {l.checklist.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                {l.fixes.length > 0 && (
                  <div>
                    <div className="field-label">Problems & fixes</div>
                    <ul className="small">
                      {l.fixes.map((f) => (
                        <li key={f.problem}>
                          <b>{f.problem}:</b> {f.fix}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="row gap wrap">
                {recipe && (
                  <>
                    <Link className="btn sm" to={`/recipes/${recipe.id}`}>
                      <BookOpen /> {recipe.name}
                    </Link>
                    <button className="btn sm primary" onClick={() => practice(recipe.id)}>
                      <Play /> Practise with timer
                    </button>
                  </>
                )}
                {l.targetMin && <span className="small faint">Target time: {l.targetMin} min</span>}
                {prog?.date && <span className="small ok-text">Completed {formatDate(prog.date)}</span>}
              </div>
              <Field label="My notes">
                <input
                  type="text"
                  defaultValue={prog?.notes ?? ''}
                  placeholder="What did you learn?"
                  onBlur={(e) =>
                    e.target.value !== (prog?.notes ?? '') &&
                    update((d) => {
                      d.learningProgress[l.id] = { ...(d.learningProgress[l.id] ?? { done: false }), notes: e.target.value };
                    })
                  }
                />
              </Field>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Sessions() {
  const { data, update } = useApp();
  const nav = useNavigate();
  const now = useNow(1000);
  const [newOpen, setNewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [recipeIds, setRecipeIds] = useState<string[]>(['']);
  const active = data.cookingSessions.filter((s) => s.status !== 'done');
  const done = data.cookingSessions.filter((s) => s.status === 'done');
  return (
    <>
      <Alert kind="info">Session timers are based on timestamps, so they stay correct if you refresh. They can’t alert you while the browser is closed.</Alert>
      <div className="row between">
        <h2>Active</h2>
        <button className="btn primary" onClick={() => setNewOpen(true)}>
          <Timer /> Start a session
        </button>
      </div>
      {active.length === 0 ? (
        <p className="small faint">No session running. Start one here or with “Cook now” on any recipe.</p>
      ) : (
        <div className="grid-2">
          {active.map((s) => (
            <Link key={s.id} to={`/learning/session/${s.id}`} className="card row gap between" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div>
                <div className="bold">{s.title}</div>
                <div className="small muted">
                  {s.status} · est {s.estimatedMin} min
                </div>
              </div>
              <span className="session-pill" style={{ fontSize: '1.1rem' }}>
                {formatDuration(sessionElapsed(s, now))}
              </span>
            </Link>
          ))}
        </div>
      )}
      <h2>History</h2>
      {done.length === 0 ? (
        <div className="card">
          <Empty icon={<Timer />} title="No sessions yet">
            Every timed session records estimated vs actual time and what to improve.
          </Empty>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>What</th>
                  <th className="right">Estimated</th>
                  <th className="right">Actual</th>
                  <th>Went well / improve</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {done.map((s) => {
                  const over = s.elapsedSec / 60 - s.estimatedMin;
                  return (
                    <tr key={s.id}>
                      <td className="nowrap small">{formatDate(localDateOf(s.startedAt), { day: 'numeric', month: 'short' })}</td>
                      <td>
                        <Link to={`/learning/session/${s.id}`}>{s.title}</Link>
                        {s.rating ? <span className="faint small"> · {'★'.repeat(s.rating)}</span> : null}
                      </td>
                      <td className="right num">{s.estimatedMin} min</td>
                      <td className={`right num ${over > 5 ? 'warn-text' : over < 0 ? 'ok-text' : ''}`}>{formatDuration(s.elapsedSec)}</td>
                      <td className="small muted" style={{ maxWidth: 360 }}>
                        {s.wentWell && <div>✓ {s.wentWell}</div>}
                        {s.improve && <div>→ {s.improve}</div>}
                      </td>
                      <td className="actions">
                        <Link className="icon-btn sm" to={`/learning/session/${s.id}`} aria-label="Open session">
                          <Pencil />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {newOpen && (
        <Modal
          open
          onClose={() => setNewOpen(false)}
          title="Start cooking session"
          footer={
            <>
              <button className="btn" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  let sid = '';
                  update((d) => {
                    sid = startSession(d, { recipeIds: recipeIds.filter(Boolean), title: title.trim() || undefined }).id;
                  });
                  setNewOpen(false);
                  nav(`/learning/session/${sid}`);
                }}
              >
                <Play /> Start timer
              </button>
            </>
          }
        >
          <Field label="Title" hint="optional">
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Dal-chawal-sabzi lunch" />
          </Field>
          <div className="field-label">Dishes (cooked together)</div>
          {recipeIds.map((r, i) => (
            <div key={i} className="row gap">
              <div className="grow">
                <RecipeSelect value={r} onChange={(v) => setRecipeIds((p) => p.map((x, j) => (j === i ? v : x)))} />
              </div>
              <button className="icon-btn danger" aria-label="Remove" onClick={() => setRecipeIds((p) => p.filter((_, j) => j !== i))}>
                <Trash2 />
              </button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setRecipeIds((p) => [...p, ''])}>
            <Plus /> Add dish
          </button>
          <p className="small faint">The estimate assumes dishes are cooked in parallel (longest dish + 40% of the others).</p>
        </Modal>
      )}
    </>
  );
}

function Workflow() {
  return (
    <section className="card stack">
      <h2>The 7-step cooking workflow</h2>
      <p className="small muted">Speed comes from order, not rushing. Follow this every time until it becomes habit.</p>
      <ol className="steps">
        {WORKFLOW_STEPS.map((s) => (
          <li key={s}>
            <div>{s}</div>
          </li>
        ))}
      </ol>
      <Alert kind="info">
        <b>Example — dal, rice & aloo jeera for 5 (≈45 min):</b> soak rice and put dal in the cooker first (longest) → boil potatoes in a second cooker or pot → chop onion, tomato, garlic while both cook → cook rice on burner 2 once dal is off → tadka while cooker cools → toss aloo jeera last → taste, garnish, serve; wipe counters while rice rests.
      </Alert>
    </section>
  );
}

function Safety() {
  const { data, update } = useApp();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <>
      <Alert kind="warn">These are conservative general reminders, not a substitute for official food-safety guidance. When in doubt, throw it out.</Alert>
      <div className="grid-2">
        {data.safetyTips.map((t) => (
          <section key={t.id} className="card stack">
            {editing === t.id ? (
              <SafetyEdit
                tip={t}
                onDone={(tip) => {
                  update((d) => {
                    const i = d.safetyTips.findIndex((x) => x.id === t.id);
                    if (tip) d.safetyTips[i] = tip;
                    else d.safetyTips.splice(i, 1);
                  });
                  setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="row between top">
                  <h3 className="row gap">
                    <ShieldCheck size={16} color="var(--primary)" /> {t.title}
                  </h3>
                  <button className="icon-btn sm" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t.id)}>
                    <Pencil />
                  </button>
                </div>
                <p className="small">{t.body}</p>
              </>
            )}
          </section>
        ))}
      </div>
      <div className="row gap">
        <button
          className="btn"
          onClick={() => {
            const id = uid('st');
            update((d) => void d.safetyTips.push({ id, title: 'New reminder', body: '' }));
            setEditing(id);
          }}
        >
          <Plus /> Add reminder
        </button>
        <button
          className="btn ghost"
          onClick={async () => {
            if (await confirm({ title: 'Restore default safety reminders?', message: 'Your edits to these reminders will be replaced.', confirmLabel: 'Restore', danger: true })) update((d) => void (d.safetyTips = seedSafetyTips()), 'Defaults restored');
          }}
        >
          <RotateCcw /> Restore defaults
        </button>
      </div>
    </>
  );
}

function SafetyEdit({ tip, onDone }: { tip: { id: string; title: string; body: string }; onDone: (t: { id: string; title: string; body: string } | null) => void }) {
  const [t, setT] = useState(tip);
  return (
    <div className="stack">
      <Field label="Title">
        <input type="text" value={t.title} onChange={(e) => setT({ ...t, title: e.target.value })} />
      </Field>
      <Field label="Reminder">
        <textarea value={t.body} rows={5} onChange={(e) => setT({ ...t, body: e.target.value })} />
      </Field>
      <div className="row gap">
        <button className="btn danger sm" onClick={() => onDone(null)}>
          <Trash2 /> Delete
        </button>
        <span className="grow" />
        <button className="btn sm" onClick={() => onDone(tip)}>
          Cancel
        </button>
        <button className="btn primary sm" onClick={() => onDone(t)}>
          Save
        </button>
      </div>
    </div>
  );
}
