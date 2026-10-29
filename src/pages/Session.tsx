import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChefHat, Flag, Pause, Play, Trash2 } from 'lucide-react';
import { useApp } from '../store';
import { Empty, Field, Stars, useConfirm } from '../components/ui';
import { FinishSessionDialog } from '../components/FinishSessionDialog';
import { pauseSession, resumeSession, sessionElapsed } from '../domain/sessions';
import { formatDateTime, formatDuration } from '../domain/dates';
import { useNow } from '../hooks/useNow';

export function SessionPage() {
  const { id } = useParams();
  const { data, update } = useApp();
  const nav = useNavigate();
  const confirm = useConfirm();
  const s = data.cookingSessions.find((x) => x.id === id);
  const now = useNow(s?.status === 'running' ? 1000 : 0);
  const [finishing, setFinishing] = useState(false);
  if (!s)
    return (
      <div className="page narrow">
        <div className="card">
          <Empty title="Session not found" action={<Link className="btn" to="/learning?tab=sessions">All sessions</Link>} />
        </div>
      </div>
    );
  const elapsed = sessionElapsed(s, now);
  const recipes = s.recipeIds.map((r) => data.recipes.find((x) => x.id === r)).filter(Boolean);
  const pct = s.estimatedMin ? Math.min(100, (elapsed / 60 / s.estimatedMin) * 100) : 0;
  const patch = (p: Partial<typeof s>) => update((d) => void Object.assign(d.cookingSessions.find((x) => x.id === s.id)!, p));

  return (
    <div className="page narrow">
      <Link to="/learning?tab=sessions" className="btn ghost" style={{ width: 'fit-content' }}>
        <ArrowLeft /> Sessions
      </Link>
      <section className="card stack lg" style={{ textAlign: 'center' }}>
        <h1>{s.title}</h1>
        <div className="small muted">Started {formatDateTime(s.startedAt)}{s.endedAt && ` · finished ${formatDateTime(s.endedAt)}`}</div>
        <div style={{ fontSize: 'clamp(3rem, 12vw, 5rem)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }} role="timer" aria-live="off">
          {formatDuration(elapsed)}
        </div>
        <div className={`progress ${pct >= 100 ? 'over' : pct > 80 ? 'warn' : ''}`}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="small muted">Estimated {s.estimatedMin} min — estimates are guides, not deadlines.</div>
        {s.status !== 'done' && (
          <div className="row gap center wrap">
            {s.status === 'running' ? (
              <button className="btn lg" onClick={() => update((d) => pauseSession(d, s.id))}>
                <Pause /> Pause
              </button>
            ) : (
              <button className="btn lg" onClick={() => update((d) => resumeSession(d, s.id))}>
                <Play /> Resume
              </button>
            )}
            <button className="btn primary lg" onClick={() => setFinishing(true)}>
              <Flag /> Finish
            </button>
          </div>
        )}
        {recipes.length > 0 && (
          <div className="row gap center wrap">
            {recipes.map((r) => (
              <Link key={r!.id} className="btn sm" to={`/recipes/${r!.id}/cook?session=${s.id}${s.mealId ? `&meal=${s.mealId}` : ''}`}>
                <ChefHat /> {r!.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {s.status === 'done' && (
        <section className="card stack">
          <h2>Reflection</h2>
          <Field label="What went well">
            <textarea defaultValue={s.wentWell ?? ''} onBlur={(e) => patch({ wentWell: e.target.value })} />
          </Field>
          <Field label="What to improve">
            <textarea defaultValue={s.improve ?? ''} onBlur={(e) => patch({ improve: e.target.value })} />
          </Field>
          <div className="row between">
            <span className="field-label">Result</span>
            <Stars value={s.rating} onChange={(n) => patch({ rating: n })} />
          </div>
        </section>
      )}

      <button
        className="btn danger"
        style={{ width: 'fit-content' }}
        onClick={async () => {
          if (!(await confirm({ title: 'Delete this session?', message: 'The time record and notes will be removed. Recipe “times cooked” is not changed.', confirmLabel: 'Delete', danger: true }))) return;
          update((d) => void (d.cookingSessions = d.cookingSessions.filter((x) => x.id !== s.id)), 'Session deleted');
          nav('/learning?tab=sessions');
        }}
      >
        <Trash2 /> Delete session
      </button>

      {finishing && <FinishSessionDialog sessionId={s.id} recipeId={s.recipeIds.length === 1 ? s.recipeIds[0] : undefined} onClose={() => setFinishing(false)} />}
    </div>
  );
}
