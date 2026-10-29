import type { AppData, CookingSession, ID } from './types';
import { nowISO, uid } from './util';
import { today } from './dates';
import { totalTime } from './recipes';

/**
 * Cooking sessions are timestamp based: elapsed time = saved seconds + (now − runningSince).
 * This survives refreshes, but the app does NOT claim to alert you while the
 * browser/tab is closed.
 */
export function sessionElapsed(s: CookingSession, now = Date.now()): number {
  const running = s.status === 'running' && s.runningSince ? Math.max(0, (now - new Date(s.runningSince).getTime()) / 1000) : 0;
  return s.elapsedSec + running;
}

export function startSession(d: AppData, opts: { recipeIds: ID[]; mealId?: ID; title?: string }): CookingSession {
  // Only one active session at a time — pause any other.
  for (const o of d.cookingSessions) if (o.status === 'running') pauseSession(d, o.id);
  const recipes = opts.recipeIds.map((id) => d.recipes.find((r) => r.id === id)).filter(Boolean);
  const est = recipes.length ? Math.max(...recipes.map((r) => totalTime(r!))) + recipes.slice(1).reduce((a, r) => a + totalTime(r!) * 0.4, 0) : 30;
  const s: CookingSession = {
    id: uid('cs'),
    recipeIds: opts.recipeIds,
    mealId: opts.mealId,
    title: opts.title || recipes.map((r) => r!.name).join(' + ') || 'Cooking session',
    startedAt: nowISO(),
    runningSince: nowISO(),
    elapsedSec: 0,
    estimatedMin: Math.round(est),
    status: 'running',
  };
  d.cookingSessions.unshift(s);
  return s;
}

export function pauseSession(d: AppData, id: ID) {
  const s = d.cookingSessions.find((x) => x.id === id);
  if (!s || s.status !== 'running') return;
  s.elapsedSec = Math.round(sessionElapsed(s));
  s.runningSince = undefined;
  s.status = 'paused';
}

export function resumeSession(d: AppData, id: ID) {
  const s = d.cookingSessions.find((x) => x.id === id);
  if (!s || s.status !== 'paused') return;
  for (const o of d.cookingSessions) if (o.status === 'running') pauseSession(d, o.id);
  s.runningSince = nowISO();
  s.status = 'running';
}

export function finishSession(
  d: AppData,
  id: ID,
  notes: { wentWell?: string; improve?: string; rating?: number; markMealPrepared?: boolean; countAsCooked?: boolean },
) {
  const s = d.cookingSessions.find((x) => x.id === id);
  if (!s) return;
  s.elapsedSec = Math.round(sessionElapsed(s));
  s.runningSince = undefined;
  s.status = 'done';
  s.endedAt = nowISO();
  s.wentWell = notes.wentWell;
  s.improve = notes.improve;
  s.rating = notes.rating;
  if (notes.countAsCooked !== false) {
    for (const rid of s.recipeIds) {
      const r = d.recipes.find((x) => x.id === rid);
      if (r) {
        r.timesCooked = (r.timesCooked || 0) + 1;
        r.lastCooked = today();
      }
    }
  }
  if (notes.markMealPrepared && s.mealId) {
    const m = d.meals.find((x) => x.id === s.mealId);
    if (m) m.status = 'prepared';
  }
}
