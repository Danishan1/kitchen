import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Flag, Pause, Play, RotateCcw, Timer, X, ListChecks } from 'lucide-react';
import { useApp } from '../store';
import { Alert, Empty } from '../components/ui';
import { FinishSessionDialog } from '../components/FinishSessionDialog';
import { scaleRecipe, missingEquipment } from '../domain/recipes';
import { formatAmount } from '../domain/units';
import { formatDuration } from '../domain/dates';
import { pauseSession, resumeSession, sessionElapsed, startSession } from '../domain/sessions';
import { useNow } from '../hooks/useNow';

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.25, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
    navigator.vibrate?.([300, 150, 300]);
  } catch {
    /* audio not available */
  }
}

/** Countdown for one step. In-page only — it does not run while the browser is closed. */
function StepTimer({ minutes, stepKey }: { minutes: number; stepKey: string }) {
  const [endAt, setEndAt] = useState<number | null>(null);
  const [remainingPaused, setRemainingPaused] = useState<number>(minutes * 60);
  const now = useNow(endAt ? 500 : 0);
  const fired = useRef(false);
  useEffect(() => {
    setEndAt(null);
    setRemainingPaused(minutes * 60);
    fired.current = false;
  }, [stepKey, minutes]);
  const remaining = endAt ? Math.max(0, (endAt - now) / 1000) : remainingPaused;
  const done = endAt !== null && remaining <= 0;
  useEffect(() => {
    if (done && !fired.current) {
      fired.current = true;
      beep();
    }
  }, [done]);
  return (
    <div className={`timer-box ${done ? 'done' : ''}`} role="timer" aria-live="polite">
      <Timer aria-hidden />
      <span className="t">{formatDuration(Math.ceil(remaining))}</span>
      <div className="btn-group">
        {!endAt ? (
          <button className="btn primary" onClick={() => { fired.current = false; setEndAt(Date.now() + remainingPaused * 1000); }} disabled={remainingPaused <= 0}>
            <Play /> {remainingPaused === minutes * 60 ? `Start ${minutes} min` : 'Resume'}
          </button>
        ) : (
          !done && (
            <button className="btn" onClick={() => { setRemainingPaused(remaining); setEndAt(null); }}>
              <Pause /> Pause
            </button>
          )
        )}
        <button className="btn ghost" onClick={() => { setEndAt(null); setRemainingPaused(minutes * 60); fired.current = false; }}>
          <RotateCcw /> Reset
        </button>
      </div>
      {done && <b>Time’s up — check the food.</b>}
      <span className="tiny faint" style={{ flexBasis: '100%' }}>
        Timer works while this page is open. Keep the screen on; it can’t alert you if the browser is closed.
      </span>
    </div>
  );
}

export function CookMode() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, update } = useApp();
  const nav = useNavigate();
  const recipe = data.recipes.find((r) => r.id === id);
  const servings = Math.max(1, Number(params.get('servings')) || recipe?.servings || 5);
  const mealId = params.get('meal') ?? undefined;
  const sessionId = params.get('session') ?? data.cookingSessions.find((s) => s.status !== 'done' && s.recipeIds.includes(id ?? ''))?.id;
  const session = data.cookingSessions.find((s) => s.id === sessionId);
  const now = useNow(session?.status === 'running' ? 1000 : 0);
  const [step, setStep] = useState(-1); // -1 = mise en place
  const [checkedIngs, setCheckedIngs] = useState<Set<string>>(new Set());
  const [doneSteps, setDoneSteps] = useState<Set<number>>(new Set());
  const [showIngs, setShowIngs] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, servings, data.ingredients) : []), [recipe, servings, data.ingredients]);

  // Keep the screen awake while cooking (where supported).
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav2 = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    const req = () => nav2.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    req();
    const vis = () => document.visibilityState === 'visible' && req();
    document.addEventListener('visibilitychange', vis);
    return () => {
      document.removeEventListener('visibilitychange', vis);
      lock?.release().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') setStep((s) => Math.min((recipe?.steps.length ?? 1) - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep((s) => Math.max(-1, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [recipe]);

  if (!recipe) {
    return (
      <div className="cook">
        <div />
        <div className="cook-body">
          <Empty title="Recipe not found" action={<button className="btn" onClick={() => nav('/recipes')}>Back</button>} />
        </div>
      </div>
    );
  }

  const total = recipe.steps.length;
  const cur = step >= 0 ? recipe.steps[step] : undefined;
  const missing = missingEquipment(recipe, data.equipment);
  const ensureSession = () => {
    if (session) return;
    let sid = '';
    update((d) => {
      sid = startSession(d, { recipeIds: [recipe.id], mealId }).id;
    });
    setParams((p) => { p.set('session', sid); return p; }, { replace: true });
  };

  const next = () => {
    if (step >= 0) setDoneSteps((s) => new Set(s).add(step));
    if (step === -1) ensureSession();
    if (step < total - 1) setStep(step + 1);
    else setFinishing(true);
  };

  const ingList = (
    <ul className="check-list">
      {scaled.map((s) => (
        <li key={s.ri.id}>
          <label>
            <input
              type="checkbox"
              checked={checkedIngs.has(s.ri.id)}
              onChange={() =>
                setCheckedIngs((p) => {
                  const n = new Set(p);
                  if (n.has(s.ri.id)) n.delete(s.ri.id);
                  else n.add(s.ri.id);
                  return n;
                })
              }
            />
            <span>
              <b>{formatAmount(s.qty, s.unit)}</b> {s.name}
              {s.ri.note && <span className="faint small"> — {s.ri.note}</span>}
              {s.ri.optional && <span className="faint small"> (optional)</span>}
            </span>
          </label>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="cook" role="main">
      <div className="cook-head">
        <button className="icon-btn" aria-label="Exit cooking mode" onClick={() => nav(`/recipes/${recipe.id}?servings=${servings}`)}>
          <X />
        </button>
        <div className="grow">
          <div className="bold truncate">{recipe.name}</div>
          <div className="tiny faint">{servings} servings</div>
        </div>
        {session ? (
          <div className="row gap">
            <span className="session-pill">
              <Timer size={14} /> {formatDuration(sessionElapsed(session, now))}
            </span>
            {session.status === 'running' ? (
              <button className="icon-btn" aria-label="Pause session timer" onClick={() => update((d) => pauseSession(d, session.id))}>
                <Pause />
              </button>
            ) : session.status === 'paused' ? (
              <button className="icon-btn" aria-label="Resume session timer" onClick={() => update((d) => resumeSession(d, session.id))}>
                <Play />
              </button>
            ) : null}
          </div>
        ) : (
          <button className="btn sm" onClick={ensureSession}>
            <Timer /> Start timer
          </button>
        )}
        <button className="icon-btn" aria-label="Show ingredients" aria-pressed={showIngs} onClick={() => setShowIngs((v) => !v)}>
          <ListChecks />
        </button>
      </div>

      <div className={`cook-body ${step >= 0 ? 'split' : ''}`}>
        <div className="stack lg">
          {step === -1 ? (
            <>
              <div className="cook-step-n">Before you start</div>
              <div className="cook-step" style={{ fontSize: '1.3rem' }}>
                Read the steps once, check equipment, then measure and prepare every ingredient.
              </div>
              {missing.length > 0 && <Alert kind="warn">Unavailable equipment: {missing.map((m) => `${m.name} (${m.reason})`).join(', ')}</Alert>}
              <div className="card">
                <div className="card-head">
                  <h2>Ingredients ({checkedIngs.size}/{scaled.length} ready)</h2>
                  <button className="btn sm ghost" onClick={() => setCheckedIngs(new Set(scaled.map((s) => s.ri.id)))}>
                    Tick all
                  </button>
                </div>
                {ingList}
              </div>
              {recipe.equipmentIds.length > 0 && (
                <p className="muted">Equipment: {recipe.equipmentIds.map((e) => data.equipment.find((x) => x.id === e)?.name ?? e).join(', ')}</p>
              )}
            </>
          ) : (
            <>
              <div className="cook-step-n">
                Step {step + 1} of {total}
                {doneSteps.has(step) && ' · done'}
              </div>
              <div className="progress">
                <span style={{ width: `${((step + 1) / total) * 100}%` }} />
              </div>
              <p className="cook-step">{cur?.text}</p>
              {cur?.timerMin ? <StepTimer minutes={cur.timerMin} stepKey={`${recipe.id}-${step}`} /> : null}
              {showIngs && <div className="card">{ingList}</div>}
              <details>
                <summary>All steps</summary>
                <ol className="check-list" style={{ marginTop: 6 }}>
                  {recipe.steps.map((s, i) => (
                    <li key={s.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={doneSteps.has(i)}
                          onChange={() =>
                            setDoneSteps((p) => {
                              const n = new Set(p);
                              if (n.has(i)) n.delete(i);
                              else n.add(i);
                              return n;
                            })
                          }
                        />
                        <span onClick={(e) => { e.preventDefault(); setStep(i); }} style={{ cursor: 'pointer', fontWeight: i === step ? 700 : 400 }}>
                          {i + 1}. {s.text}
                        </span>
                      </label>
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </div>
        {step >= 0 && (
          <aside className="cook-ings card">
            <h3 style={{ marginBottom: 6 }}>Ingredients</h3>
            {ingList}
          </aside>
        )}
      </div>

      <div className="cook-foot">
        <button className="btn lg" onClick={() => setStep(Math.max(-1, step - 1))} disabled={step === -1}>
          <ChevronLeft /> Back
        </button>
        <button className="btn primary lg" onClick={next}>
          {step === -1 ? (
            <>
              Start cooking <ChevronRight />
            </>
          ) : step < total - 1 ? (
            <>
              Next <ChevronRight />
            </>
          ) : (
            <>
              <Flag /> Finish
            </>
          )}
        </button>
      </div>

      {finishing && (
        <FinishSessionDialog
          sessionId={session?.id}
          mealId={mealId}
          recipeId={recipe.id}
          onClose={() => setFinishing(false)}
          onDone={() => nav(`/recipes/${recipe.id}?servings=${servings}`)}
        />
      )}
    </div>
  );
}
