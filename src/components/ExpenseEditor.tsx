import { useState } from 'react';
import type { Expense } from '../domain/types';
import { EXPENSE_CATEGORIES } from '../domain/constants';
import { today } from '../domain/dates';
import { nowISO, uid } from '../domain/util';
import { useApp } from '../store';
import { Field, Modal, NumberInput, useConfirm } from './ui';
import { Trash2 } from 'lucide-react';

export function ExpenseEditor({ expense, open, onClose }: { expense?: Expense; open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Inner key={expense?.id ?? 'new'} expense={expense} onClose={onClose} />;
}

function Inner({ expense, onClose }: { expense?: Expense; onClose: () => void }) {
  const { update, data } = useApp();
  const confirm = useConfirm();
  const [e, setE] = useState<Expense>(
    () => expense ?? { id: uid('ex'), date: today(), amount: 0, category: 'groceries', source: 'manual', createdAt: nowISO() },
  );
  const vendors = [...new Set(data.expenses.map((x) => x.vendor).filter(Boolean))] as string[];
  const valid = e.amount > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date);
  const save = () => {
    update((d) => {
      const i = d.expenses.findIndex((x) => x.id === e.id);
      if (i >= 0) d.expenses[i] = e;
      else d.expenses.push(e);
    }, expense ? 'Expense updated' : 'Expense recorded');
    onClose();
  };
  const remove = async () => {
    if (!expense) return;
    const linked = data.groceryItems.filter((i) => i.expenseId === expense.id).length;
    if (
      !(await confirm({
        title: 'Delete this expense?',
        message: linked ? `${linked} shopping-list purchase(s) are linked to it. They will be un-linked so you can record them again.` : 'This cannot be undone.',
        confirmLabel: 'Delete',
        danger: true,
      }))
    )
      return;
    update((d) => {
      d.expenses = d.expenses.filter((x) => x.id !== expense.id);
      for (const it of d.groceryItems) if (it.expenseId === expense.id) it.expenseId = undefined;
    }, 'Expense deleted');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Record expense'}
      footer={
        <>
          {expense && (
            <button className="btn danger" onClick={remove}>
              <Trash2 /> Delete
            </button>
          )}
          <span className="grow" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={!valid}>
            Save
          </button>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label="Amount (₹)">
          <NumberInput value={e.amount || undefined} min={0} onChange={(n) => setE({ ...e, amount: n ?? 0 })} placeholder="0" />
        </Field>
        <Field label="Date">
          <input type="date" value={e.date} onChange={(ev) => setE({ ...e, date: ev.target.value })} />
        </Field>
        <Field label="Category">
          <select value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value as Expense['category'] })}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Vendor / shop">
          <input type="text" list="vendor-list" value={e.vendor ?? ''} onChange={(ev) => setE({ ...e, vendor: ev.target.value })} placeholder="e.g. Sharma Kirana, sabzi mandi" />
          <datalist id="vendor-list">
            {vendors.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </Field>
        <Field label="Notes" className="full">
          <input type="text" value={e.notes ?? ''} onChange={(ev) => setE({ ...e, notes: ev.target.value })} />
        </Field>
      </div>
      {e.source === 'grocery' && <p className="small faint">Created from a shopping list.</p>}
    </Modal>
  );
}
