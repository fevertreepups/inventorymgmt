import { useState } from 'react';
import { db } from '../db/db';
import { useConfig } from '../config';
import { useExpenses } from '../hooks';
import { Modal, EmptyState, Field, confirmDialog } from '../components/ui';
import { Header } from './Materials';
import { formatCurrency } from '../lib/format';
import { toCSV, downloadCSV } from '../lib/csv';
import type { Expense } from '../types';

export default function Expenses() {
  const { config } = useConfig();
  const expenses = useExpenses();
  const [editing, setEditing] = useState<Expense | null>(null);

  const newExpense = (): Expense => ({
    date: new Date().toISOString().slice(0, 10),
    label: '',
    amount: 0,
    category: config.expenseCategories[0] ?? 'Other',
  });

  const remove = async (e: Expense) => {
    if (!confirmDialog('Delete this expense?')) return;
    await db.expenses.delete(e.id!);
  };

  const exportCsv = () => downloadCSV('expenses.csv', toCSV(expenses.map(({ id, ...r }) => r)));

  return (
    <div>
      <Header
        title="Expenses"
        actions={
          <>
            {expenses.length > 0 && (
              <button className="btn-secondary" onClick={exportCsv}>
                Export CSV
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing(newExpense())}>
              + Log expense
            </button>
          </>
        }
      />

      {expenses.length === 0 ? (
        <EmptyState
          title="No expenses logged"
          hint="Track rent, marketing, equipment and other operating costs here."
          action={
            <button className="btn-primary" onClick={() => setEditing(newExpense())}>
              + Log expense
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Label</th>
                <th className="th">Category</th>
                <th className="th">Amount</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className="td">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="td font-medium">{e.label}</td>
                  <td className="td">{e.category}</td>
                  <td className="td">{formatCurrency(e.amount, config)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1 text-xs">
                      <button className="btn-secondary px-2 py-1" onClick={() => setEditing(e)}>
                        Edit
                      </button>
                      <button className="btn-danger px-2 py-1" onClick={() => remove(e)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ExpenseModal expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ExpenseModal({ expense, onClose }: { expense: Expense; onClose: () => void }) {
  const { config } = useConfig();
  const [e, setE] = useState<Expense>(expense);
  const save = async () => {
    const row = { ...e, date: new Date(e.date).toISOString() };
    if (e.id == null) await db.expenses.add(row);
    else await db.expenses.update(e.id, row);
    onClose();
  };
  return (
    <Modal open title={e.id == null ? 'Log expense' : 'Edit expense'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" className="input" value={e.date.slice(0, 10)} onChange={(ev) => setE({ ...e, date: ev.target.value })} />
        </Field>
        <Field label="Category">
          <select className="input" value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value })}>
            {config.expenseCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <div className="col-span-2">
          <Field label="Label">
            <input className="input" value={e.label} onChange={(ev) => setE({ ...e, label: ev.target.value })} />
          </Field>
        </div>
        <Field label="Amount">
          <input type="number" className="input" value={e.amount} onChange={(ev) => setE({ ...e, amount: Number(ev.target.value) })} />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={!e.label}>
          Save
        </button>
      </div>
    </Modal>
  );
}
