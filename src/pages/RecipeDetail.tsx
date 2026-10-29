import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CalendarPlus, ChefHat, Clock, Copy, Heart, Minus, Pencil, Plus, Printer, Timer, Trash2, Wrench,
} from 'lucide-react';
import { useApp } from '../store';
import { Alert, DietDot, Empty, Field, Stars, useConfirm } from '../components/ui';
import { MealEditor, type MealEditorTarget } from '../components/MealEditor';
import { DIFFICULTY_LABEL, recipeCategoryLabel } from '../domain/constants';
import { estimateRecipeCost, missingEquipment, scaleRecipe, totalTime } from '../domain/recipes';
import { formatAmount } from '../domain/units';
import { formatDate, formatDuration, formatMinutes, localDateOf, today } from '../domain/dates';
import { formatINR, nowISO, uid } from '../domain/util';
import { startSession } from '../domain/sessions';

export function RecipeDetail() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { data, update } = useApp();
  const nav = useNavigate();
  const confirm = useConfirm();
  const recipe = data.recipes.find((r) => r.id === id);
  const servings = Math.max(1, Number(params.get('servings')) || recipe?.servings || 5);
  const setServings = (n: number) => setParams((p) => { p.set('servings', String(Math.max(1, Math.min(60, n)))); return p; }, { replace: true });
  const [planTarget, setPlanTarget] = useState<MealEditorTarget | null>(null);

  const scaled = useMemo(() => (recipe ? scaleRecipe(recipe, servings, data.ingredients) : []), [recipe, servings, data.ingredients]);
  if (!recipe) {
    return (
      <div className="page narrow">
        <div className="card">
          <Empty title="Recipe not found" action={<Link className="btn" to="/recipes">Back to recipes</Link>} />
        </div>
      </div>
    );
  }
  const cost = estimateRecipeCost(recipe, servings, data.ingredients);
  const missing = missingEquipment(recipe, data.equipment);
  const eqById = new Map(data.equipment.map((e) => [e.id, e]));
  const sessions = data.cookingSessions.filter((s) => s.recipeIds.includes(recipe.id) && s.status === 'done');
  const setField = <K extends keyof typeof recipe>(k: K, v: (typeof recipe)[K]) =>
    update((d) => {
      const r = d.recipes.find((x) => x.id === recipe.id)!;
      r[k] = v;
      r.updatedAt = nowISO();
    });

  const duplicate = () => {
    const newId = uid('rc');
    update((d) => {
      d.recipes.push({ ...structuredClone(recipe), id: newId, name: `${recipe.name} (copy)`, favourite: false, timesCooked: 0, lastCooked: undefined, createdAt: nowISO(), updatedAt: nowISO() });
    }, 'Recipe duplicated');
    nav(`/recipes/${newId}/edit`);
  };
  const remove = async () => {
    const used = data.meals.filter((m) => m.dishes.some((x) => x.recipeId === recipe.id) && m.date >= today()).length;
    if (!(await confirm({ title: `Delete “${recipe.name}”?`, message: used ? `It is used in ${used} upcoming planned meal(s); those dishes will be removed from the plan.` : 'This cannot be undone (unless you restore a backup).', confirmLabel: 'Delete recipe', danger: true }))) return;
    update((d) => {
      d.recipes = d.recipes.filter((r) => r.id !== recipe.id);
      for (const m of d.meals) m.dishes = m.dishes.filter((x) => x.recipeId !== recipe.id);
      d.meals = d.meals.filter((m) => m.dishes.length || m.title);
    }, 'Recipe deleted');
    nav('/recipes');
  };
  const startCooking = () => {
    let sid = '';
    update((d) => {
      sid = startSession(d, { recipeIds: [recipe.id] }).id;
    });
    nav(`/recipes/${recipe.id}/cook?servings=${servings}&session=${sid}`);
  };

  return (
    <div className="page">
      <div className="row gap wrap between">
        <button className="btn ghost" onClick={() => nav(-1)}>
          <ArrowLeft /> Back
        </button>
        <div className="btn-group">
          <button className="btn primary" onClick={startCooking}>
            <ChefHat /> Cook now
          </button>
          <button className="btn" onClick={() => setPlanTarget({ date: today(), slot: recipe.category === 'breakfast' ? 'breakfast' : recipe.category === 'snack' || recipe.category === 'beverage' ? 'snacks' : 'dinner', recipeId: recipe.id })}>
            <CalendarPlus /> Add to plan
          </button>
          <Link className="btn" to={`/print/recipe/${recipe.id}?servings=${servings}`}>
            <Printer /> Print
          </Link>
          <Link className="btn" to={`/recipes/${recipe.id}/edit`}>
            <Pencil /> Edit
          </Link>
          <button className="btn" onClick={duplicate}>
            <Copy /> Duplicate
          </button>
          <button className="btn danger" onClick={remove} aria-label="Delete recipe">
            <Trash2 />
          </button>
        </div>
      </div>

      <div className="sidebar-layout">
        <div className="stack lg">
          <div className="card stack">
            {recipe.photo && <img className="photo-hero" src={recipe.photo} alt={recipe.name} />}
            <div className="row gap between top">
              <h1>{recipe.name}</h1>
              <button className="icon-btn" aria-pressed={recipe.favourite} aria-label={recipe.favourite ? 'Remove from favourites' : 'Add to favourites'} onClick={() => setField('favourite', !recipe.favourite)}>
                <Heart fill={recipe.favourite ? 'var(--danger)' : 'none'} color={recipe.favourite ? 'var(--danger)' : 'currentColor'} />
              </button>
            </div>
            <div className="meta-row">
              <DietDot diet={recipe.diet} label />
              <span>{recipeCategoryLabel(recipe.category)}</span>
              <span>{recipe.cuisine}</span>
              <span>{DIFFICULTY_LABEL[recipe.difficulty]}</span>
              <span>
                <Clock /> Prep {formatMinutes(recipe.prepMin)} · Cook {formatMinutes(recipe.cookMin)} · Total ≈ {formatMinutes(totalTime(recipe))}
              </span>
            </div>
            {recipe.tags.length > 0 && (
              <div className="row gap wrap">
                {recipe.tags.map((t) => (
                  <span key={t} className="badge">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {recipe.halalNotes && <Alert kind="info"><b>Halal sourcing:</b> {recipe.halalNotes}</Alert>}
            {recipe.dietaryNotes && <Alert kind="warn">{recipe.dietaryNotes}</Alert>}
            {missing.length > 0 && (
              <Alert kind="warn">
                Equipment unavailable: {missing.map((m) => `${m.name} (${m.reason})`).join(', ')}. <Link to="/inventory?tab=equipment">Update equipment</Link>
              </Alert>
            )}
          </div>

          <section className="card" aria-labelledby="ings">
            <div className="card-head">
              <h2 id="ings">Ingredients</h2>
              <div className="row gap">
                <span className="small muted">Servings</span>
                <button className="icon-btn sm" aria-label="Fewer servings" onClick={() => setServings(servings - 1)}>
                  <Minus />
                </button>
                <input type="number" min={1} value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} style={{ width: 64, textAlign: 'center' }} aria-label="Servings" />
                <button className="icon-btn sm" aria-label="More servings" onClick={() => setServings(servings + 1)}>
                  <Plus />
                </button>
              </div>
            </div>
            {servings !== recipe.servings && <p className="small faint" style={{ marginBottom: 6 }}>Scaled from {recipe.servings} servings. Spices and salt may need tasting — scaling isn’t always linear.</p>}
            <ul className="ing-list">
              {scaled.map((s) => (
                <li key={s.ri.id}>
                  <span className="qty">{formatAmount(s.qty, s.unit)}</span>
                  <span className="grow">
                    {s.name}
                    {s.ri.optional && <span className="badge" style={{ marginLeft: 6 }}>optional</span>}
                    {s.ri.note && <span className="note"> — {s.ri.note}</span>}
                    {s.ri.substitution && <div className="note">Swap: {s.ri.substitution}</div>}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card" aria-labelledby="steps">
            <div className="card-head">
              <h2 id="steps">Method</h2>
              <button className="btn sm" onClick={startCooking}>
                <ChefHat /> Step-by-step mode
              </button>
            </div>
            <ol className="steps">
              {recipe.steps.map((s) => (
                <li key={s.id}>
                  <div>
                    {s.text}
                    {s.timerMin ? (
                      <span className="badge primary" style={{ marginLeft: 6 }}>
                        <Timer size={12} /> {s.timerMin} min
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="grid-2">
            {recipe.tips.length > 0 && (
              <section className="card">
                <h3 style={{ marginBottom: 6 }}>Beginner tips</h3>
                <ul className="small stack sm">
                  {recipe.tips.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}
            {recipe.mistakes.length > 0 && (
              <section className="card">
                <h3 style={{ marginBottom: 6 }}>
                  <AlertTriangle size={15} style={{ verticalAlign: '-2px' }} /> Common mistakes
                </h3>
                <ul className="small stack sm">
                  {recipe.mistakes.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          {recipe.storage && (
            <section className="card">
              <h3 style={{ marginBottom: 6 }}>Storage & reheating</h3>
              <p className="small">{recipe.storage}</p>
            </section>
          )}
        </div>

        <aside className="stack lg">
          <section className="card stack">
            <h3>Estimated cost</h3>
            <div className="stat">
              <span className="value">{formatINR(cost.total)}</span>
              <span className="sub">
                for {servings} servings · ≈ {formatINR(cost.perServing, true)} per serving
              </span>
            </div>
            {cost.unpriced.length > 0 && (
              <p className="tiny faint">
                Not priced: {cost.unpriced.slice(0, 6).join(', ')}
                {cost.unpriced.length > 6 ? '…' : ''}. <Link to="/recipes/prices">Add prices</Link>
              </p>
            )}
            <p className="tiny faint">Estimate from your ingredient price list — not a guaranteed cost.</p>
          </section>

          <section className="card stack">
            <h3>
              <Wrench size={15} style={{ verticalAlign: '-2px' }} /> Equipment
            </h3>
            {recipe.equipmentIds.length === 0 ? (
              <p className="small faint">None listed.</p>
            ) : (
              <ul className="list tight">
                {recipe.equipmentIds.map((eid) => {
                  const e = eqById.get(eid);
                  const bad = !e || e.status === 'missing' || e.status === 'damaged';
                  return (
                    <li key={eid} className="row between">
                      <span>{e?.name ?? eid}</span>
                      <span className={`badge ${bad ? 'danger' : 'ok'}`}>{e ? e.status : 'not listed'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="card stack">
            <h3>Your notes</h3>
            <div className="row between">
              <span className="small muted">Rating</span>
              <Stars value={recipe.rating} onChange={(n) => setField('rating', n)} />
            </div>
            <div className="small muted">
              Cooked {recipe.timesCooked}× {recipe.lastCooked && `· last on ${formatDate(recipe.lastCooked)}`}
            </div>
            <Field label="Feedback / personal adjustments">
              <textarea defaultValue={recipe.feedback ?? ''} onBlur={(e) => e.target.value !== (recipe.feedback ?? '') && setField('feedback', e.target.value)} placeholder="e.g. Family wants it spicier; use 1 extra chilli" />
            </Field>
            {recipe.notes && <p className="small">{recipe.notes}</p>}
          </section>

          <section className="card stack">
            <h3>Cooking history</h3>
            {sessions.length === 0 ? (
              <p className="small faint">Use “Cook now” to time yourself. Estimated: {formatMinutes(totalTime(recipe))}.</p>
            ) : (
              <ul className="list tight">
                {sessions.slice(0, 6).map((s) => (
                  <li key={s.id} className="row between">
                    <Link to={`/learning/session/${s.id}`} className="small">
                      {formatDate(localDateOf(s.startedAt))}
                    </Link>
                    <span className={`small num ${s.elapsedSec / 60 > s.estimatedMin ? 'warn-text' : 'ok-text'}`}>
                      {formatDuration(s.elapsedSec)} / est {s.estimatedMin} min
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
      <MealEditor target={planTarget} onClose={() => setPlanTarget(null)} />
    </div>
  );
}
