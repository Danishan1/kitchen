import { useState } from 'react';
import { useApp } from '../store';
import { Field, Modal, Stars } from './ui';
import { finishSession, sessionElapsed } from '../domain/sessions';
import { setMealStatus } from '../domain/planner';
import { formatDuration, today } from '../domain/dates';

/** Wrap up a cooking session: record time, notes, rating and optionally mark the meal prepared. */
export function FinishSessionDialog({
  sessionId, mealId, recipeId, onClose, onDone,
}: {
  sessionId?: string;
  mealId?: string;
  recipeId?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const { data, update } = useApp();
  const session = data.cookingSessions.find((s) => s.id === sessionId);
  const linkedMeal = data.meals.find((m) => m.id === (mealId ?? session?.mealId));
  const [wentWell, setWentWell] = useState('');
  const [improve, setImprove] = useState('');
  const [rating, setRating] = useState(0);
  const [markMeal, setMarkMeal] = useState(!!linkedMeal && linkedMeal.status === 'planned');
  const [rateRecipe, setRateRecipe] = useState(true);

  const save = () => {
    update((d) => {
      const prepareMeal = markMeal && linkedMeal && linkedMeal.status !== 'prepared';
      if (session) {
        if (linkedMeal && !session.mealId) d.cookingSessions.find((s) => s.id === session.id)!.mealId = linkedMeal.id;
        // When the meal is marked prepared, that step counts the recipe as cooked.
        finishSession(d, session.id, { wentWell, improve, rating: rating || undefined, countAsCooked: !prepareMeal });
      } else if (!prepareMeal && recipeId) {
        const r = d.recipes.find((x) => x.id === recipeId);
        if (r) {
          r.timesCooked += 1;
          r.lastCooked = today();
        }
      }
      if (prepareMeal) setMealStatus(d, linkedMeal!.id, 'prepared');
      if (rateRecipe && rating && recipeId) {
        const r = d.recipes.find((x) => x.id === recipeId);
        if (r) r.rating = rating;
      }
    }, 'Nice work! Session saved.');
    onClose();
    onDone?.();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Finish cooking"
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Keep cooking
          </button>
          <button className="btn primary" onClick={save}>
            Save & finish
          </button>
        </>
      }
    >
      {session ? (
        <div className="stat">
          <span className="label">Time taken</span>
          <span className="value">{formatDuration(sessionElapsed(session))}</span>
          <span className="sub">Estimated {session.estimatedMin} min</span>
        </div>
      ) : (
        <p className="small muted">No timer was running, so no time will be recorded.</p>
      )}
      <Field label="What went well?">
        <textarea value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="e.g. Rotis puffed; onions browned evenly" />
      </Field>
      <Field label="What to improve next time?">
        <textarea value={improve} onChange={(e) => setImprove(e.target.value)} placeholder="e.g. Chop everything before starting the tadka" />
      </Field>
      <div className="row between">
        <span className="field-label">How did it turn out?</span>
        <Stars value={rating} onChange={setRating} />
      </div>
      {recipeId && rating > 0 && (
        <label className="check small">
          <input type="checkbox" checked={rateRecipe} onChange={(e) => setRateRecipe(e.target.checked)} /> Also save this rating on the recipe
        </label>
      )}
      {linkedMeal && linkedMeal.status !== 'prepared' && (
        <label className="check">
          <input type="checkbox" checked={markMeal} onChange={(e) => setMarkMeal(e.target.checked)} /> Mark the planned meal as prepared
        </label>
      )}
    </Modal>
  );
}
