import type { AppData, Expense, ExpenseCategory, ISODate } from './types';
import { addDays, endOfMonth, startOfMonth, startOfWeek } from './dates';
import { EXPENSE_CATEGORIES } from './constants';
import { toCsv } from './csv';
import { expenseCategoryLabel } from './constants';

export const expensesInRange = (expenses: Expense[], from: ISODate, to: ISODate) =>
  expenses.filter((e) => e.date >= from && e.date <= to);

export const totalOf = (expenses: Expense[]) => Math.round(expenses.reduce((a, e) => a + (e.amount || 0), 0) * 100) / 100;

export function byCategory(expenses: Expense[]): { category: ExpenseCategory; total: number }[] {
  return EXPENSE_CATEGORIES.map((c) => ({ category: c.id, total: totalOf(expenses.filter((e) => e.category === c.id)) }));
}

export interface BudgetSummary {
  from: ISODate;
  to: ISODate;
  budget: number;
  spent: number;
  remaining: number;
  pct: number;
  /** 'none' when no budget is set yet. */
  level: 'none' | 'ok' | 'warn' | 'over';
}

export function summarize(expenses: Expense[], from: ISODate, to: ISODate, budget: number, alertPct: number): BudgetSummary {
  const spent = totalOf(expensesInRange(expenses, from, to));
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0;
  const level: BudgetSummary['level'] = budget <= 0 ? 'none' : spent > budget ? 'over' : pct >= alertPct ? 'warn' : 'ok';
  return { from, to, budget, spent, remaining: Math.round((budget - spent) * 100) / 100, pct, level };
}

export function weekSummary(d: Pick<AppData, 'expenses' | 'settings'>, date: ISODate): BudgetSummary {
  const from = startOfWeek(date, d.settings.weekStartsOn);
  return summarize(d.expenses, from, addDays(from, 6), d.settings.weeklyBudget, d.settings.budgetAlertPct);
}

export function monthSummary(d: Pick<AppData, 'expenses' | 'settings'>, date: ISODate): BudgetSummary {
  return summarize(d.expenses, startOfMonth(date), endOfMonth(date), d.settings.monthlyBudget, d.settings.budgetAlertPct);
}

/** Average spend per week across the last `weeks` complete-or-current weeks that have any expense. */
export function averageWeekly(d: Pick<AppData, 'expenses' | 'settings'>, date: ISODate, weeks = 8): { avg: number; weeksWithData: number } {
  const start = startOfWeek(date, d.settings.weekStartsOn);
  let total = 0, n = 0;
  for (let i = 0; i < weeks; i++) {
    const from = addDays(start, -7 * i);
    const t = totalOf(expensesInRange(d.expenses, from, addDays(from, 6)));
    if (t > 0) {
      total += t;
      n++;
    }
  }
  return { avg: n ? Math.round(total / n) : 0, weeksWithData: n };
}

/**
 * Approximate cost per prepared meal / per serving in a range:
 * food expenses (excluding equipment) ÷ meals marked prepared.
 */
export function costPerMeal(d: Pick<AppData, 'expenses' | 'meals'>, from: ISODate, to: ISODate) {
  const food = totalOf(expensesInRange(d.expenses, from, to).filter((e) => e.category !== 'equipment'));
  const meals = d.meals.filter((m) => m.date >= from && m.date <= to && m.status === 'prepared');
  const servings = meals.reduce((a, m) => a + (m.people || 0), 0);
  return {
    food,
    meals: meals.length,
    servings,
    perMeal: meals.length ? food / meals.length : null,
    perServing: servings ? food / servings : null,
  };
}

export function weeklyHistory(d: Pick<AppData, 'expenses' | 'settings'>, date: ISODate, weeks = 8) {
  const start = startOfWeek(date, d.settings.weekStartsOn);
  return Array.from({ length: weeks }, (_, i) => {
    const from = addDays(start, -7 * (weeks - 1 - i));
    const to = addDays(from, 6);
    return { from, to, total: totalOf(expensesInRange(d.expenses, from, to)) };
  });
}

export function expensesCsv(expenses: Expense[]): string {
  return toCsv([...expenses].sort((a, b) => (a.date < b.date ? -1 : 1)), [
    { header: 'Date', value: (e) => e.date },
    { header: 'Amount (INR)', value: (e) => e.amount },
    { header: 'Category', value: (e) => expenseCategoryLabel(e.category) },
    { header: 'Vendor', value: (e) => e.vendor },
    { header: 'Notes', value: (e) => e.notes },
    { header: 'Source', value: (e) => e.source },
  ]);
}
