import { useState } from 'react';
import { db } from '../db/db';
import { useConfig } from '../config';
import { useMaterials } from '../hooks';
import { restockMaterial, adjustStock, deleteMaterialSafe } from '../db/operations';
import { Modal, EmptyState, Field, confirmDialog } from '../components/ui';
import { formatCurrency, formatQty } from '../lib/format';
import { toCSV, parseCSV, downloadCSV } from '../lib/csv';
import type { Material } from '../types';

const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

// Returns a getter that looks up a value by any of several header aliases,
// ignoring case, spaces and punctuation (so "Purchase Price (RM)" == "purchaseprice").
function makeFieldGetter(row: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) map.set(normalizeKey(k), v);
  return (aliases: string[]): string => {
    for (const a of aliases) {
      const v = map.get(normalizeKey(a));
      if (v != null && v !== '') return v.trim();
    }
    return '';
  };
}

// Parse a number from messy cells like "RM 14.90", "125 g", "1/2 tsp".
function num(s: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/-?\d*\.?\d+/);
  return m ? Number(m[0]) : 0;
}

const blank = (cat: string, unit: string): Material => ({
  name: '',
  purchasePrice: 0,
  purchaseQty: 1,
  purchaseUnit: unit,
  costPerBaseUnit: 0,
  stockOnHand: 0,
  reorderThreshold: 0,
  supplier: '',
  category: cat,
});

export default function Materials() {
  const { config } = useConfig();
  const v = config.vocabulary;
  const materials = useMaterials();

  const [editing, setEditing] = useState<Material | null>(null);
  const [restockFor, setRestockFor] = useState<Material | null>(null);
  const [adjustFor, setAdjustFor] = useState<Material | null>(null);
  const [historyFor, setHistoryFor] = useState<Material | null>(null);
  const [error, setError] = useState('');

  const openNew = () => setEditing(blank(config.materialCategories[0] ?? 'Other', config.units[0] ?? 'piece'));

  const save = async (m: Material) => {
    if (m.id == null) {
      // initial cost from purchase
      const cost = m.purchaseQty > 0 ? m.purchasePrice / m.purchaseQty : 0;
      await db.materials.add({ ...m, costPerBaseUnit: cost });
    } else {
      await db.materials.update(m.id, m);
    }
    setEditing(null);
  };

  const remove = async (m: Material) => {
    setError('');
    if (!confirmDialog(`Delete ${m.name}?`)) return;
    try {
      await deleteMaterialSafe(m.id!);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const exportCsv = () => {
    const rows = materials.map((m) => ({
      name: m.name,
      category: m.category,
      purchasePrice: m.purchasePrice,
      purchaseQty: m.purchaseQty,
      purchaseUnit: m.purchaseUnit,
      costPerBaseUnit: m.costPerBaseUnit,
      stockOnHand: m.stockOnHand,
      reorderThreshold: m.reorderThreshold,
      supplier: m.supplier ?? '',
    }));
    downloadCSV('materials.csv', toCSV(rows));
  };

  const importCsv = async (file: File) => {
    setError('');
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      const toAdd: Material[] = [];
      for (const r of rows) {
        const g = makeFieldGetter(r);
        const name = g(['name', 'item', 'ingredient', 'material', 'product']);
        if (!name) continue;
        // skip total / summary rows and stray repeated header rows
        if (/^(total|grand total|subtotal)/i.test(name)) continue;
        if (['item', 'ingredient', 'material', 'name', 'product'].includes(name.toLowerCase())) continue;
        const qty = num(g(['purchaseqty', 'qty', 'quantity', 'packsize', 'purchasequantity'])) || 1;
        const price = num(g(['purchaseprice', 'price', 'unitprice', 'purchaseprice(rm)', 'cost']));
        const explicitUnitCost = num(g(['costperbaseunit', 'costperunit', 'costperunit(formula)', 'unitcost']));
        toAdd.push({
          name,
          category: g(['category']) || config.materialCategories[0] || 'Other',
          purchasePrice: price,
          purchaseQty: qty,
          purchaseUnit: g(['purchaseunit', 'unit']) || config.units[0] || 'piece',
          costPerBaseUnit: explicitUnitCost || (qty > 0 ? price / qty : 0),
          stockOnHand: num(g(['stockonhand', 'stock', 'onhand'])),
          reorderThreshold: num(g(['reorderthreshold', 'reorder', 'reorderlevel'])),
          supplier: g(['supplier']) || '',
        });
      }
      if (toAdd.length === 0) {
        setError('No rows imported. Expected a "name" (or Item/Ingredient) column.');
        return;
      }
      await db.materials.bulkAdd(toAdd);
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
  };

  return (
    <div>
      <Header
        title={v.materialPlural}
        actions={
          <>
            <label className="btn-secondary cursor-pointer">
              Import CSV
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
              />
            </label>
            <button className="btn-secondary" onClick={exportCsv}>
              Export CSV
            </button>
            <button className="btn-primary" onClick={openNew}>
              + Add {v.material}
            </button>
          </>
        }
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {materials.length === 0 ? (
        <EmptyState
          title={`No ${v.materialPlural.toLowerCase()} yet`}
          hint={`Add your first ${v.material.toLowerCase()} or import a CSV from your spreadsheet.`}
          action={
            <button className="btn-primary" onClick={openNew}>
              + Add {v.material}
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Name</th>
                <th className="th">Category</th>
                <th className="th">Cost / unit</th>
                <th className="th">Stock</th>
                <th className="th">Reorder at</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materials.map((m) => {
                const low = m.stockOnHand <= m.reorderThreshold;
                const neg = m.stockOnHand < 0;
                return (
                  <tr key={m.id}>
                    <td className="td font-medium">{m.name}</td>
                    <td className="td">{m.category}</td>
                    <td className="td">
                      {formatCurrency(m.costPerBaseUnit, config)} / {m.purchaseUnit}
                    </td>
                    <td className={`td ${neg ? 'font-semibold text-red-600' : low ? 'text-amber-600' : ''}`}>
                      {formatQty(m.stockOnHand)} {m.purchaseUnit}
                      {low && !neg && <span className="ml-2 text-xs">(low)</span>}
                    </td>
                    <td className="td">{formatQty(m.reorderThreshold)}</td>
                    <td className="td">
                      <div className="flex justify-end gap-1 text-xs">
                        <button className="btn-secondary px-2 py-1" onClick={() => setRestockFor(m)}>
                          Restock
                        </button>
                        <button className="btn-secondary px-2 py-1" onClick={() => setAdjustFor(m)}>
                          Adjust
                        </button>
                        <button className="btn-secondary px-2 py-1" onClick={() => setHistoryFor(m)}>
                          History
                        </button>
                        <button className="btn-secondary px-2 py-1" onClick={() => setEditing(m)}>
                          Edit
                        </button>
                        <button className="btn-danger px-2 py-1" onClick={() => remove(m)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && <EditModal material={editing} onSave={save} onClose={() => setEditing(null)} />}
      {restockFor && <RestockModal material={restockFor} onClose={() => setRestockFor(null)} />}
      {adjustFor && <AdjustModal material={adjustFor} onClose={() => setAdjustFor(null)} />}
      {historyFor && <HistoryModal material={historyFor} onClose={() => setHistoryFor(null)} />}
    </div>
  );
}

export function Header({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

function EditModal({
  material,
  onSave,
  onClose,
}: {
  material: Material;
  onSave: (m: Material) => void;
  onClose: () => void;
}) {
  const { config } = useConfig();
  const v = config.vocabulary;
  const [m, setM] = useState<Material>(material);
  const isNew = m.id == null;

  return (
    <Modal open title={`${isNew ? 'Add' : 'Edit'} ${v.material}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Name">
            <input className="input" value={m.name} onChange={(e) => setM({ ...m, name: e.target.value })} />
          </Field>
        </div>
        <Field label="Category">
          <select className="input" value={m.category} onChange={(e) => setM({ ...m, category: e.target.value })}>
            {config.materialCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Supplier (optional)">
          <input className="input" value={m.supplier ?? ''} onChange={(e) => setM({ ...m, supplier: e.target.value })} />
        </Field>
        <Field label="Purchase price">
          <input type="number" className="input" value={m.purchasePrice} onChange={(e) => setM({ ...m, purchasePrice: Number(e.target.value) })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Purchase qty">
            <input type="number" className="input" value={m.purchaseQty} onChange={(e) => setM({ ...m, purchaseQty: Number(e.target.value) })} />
          </Field>
          <Field label="Unit">
            <select className="input" value={m.purchaseUnit} onChange={(e) => setM({ ...m, purchaseUnit: e.target.value })}>
              {config.units.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Stock on hand">
          <input type="number" className="input" value={m.stockOnHand} onChange={(e) => setM({ ...m, stockOnHand: Number(e.target.value) })} disabled={!isNew} />
        </Field>
        <Field label="Reorder threshold">
          <input type="number" className="input" value={m.reorderThreshold} onChange={(e) => setM({ ...m, reorderThreshold: Number(e.target.value) })} />
        </Field>
      </div>
      {!isNew && (
        <p className="mt-2 text-xs text-gray-400">
          Stock is changed via Restock / Adjust so every change is logged.
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={() => onSave(m)} disabled={!m.name}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function RestockModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const { config } = useConfig();
  const [qty, setQty] = useState(material.purchaseQty);
  const [price, setPrice] = useState(material.purchasePrice);
  const [note, setNote] = useState('');

  const submit = async () => {
    await restockMaterial(material.id!, qty, price, { note });
    onClose();
  };

  const newUnitCost = qty > 0 ? price / qty : 0;
  return (
    <Modal open title={`Restock ${material.name}`} onClose={onClose}>
      <p className="mb-3 text-sm text-gray-500">
        Current: {formatQty(material.stockOnHand)} {material.purchaseUnit} @{' '}
        {formatCurrency(material.costPerBaseUnit, config)} / {material.purchaseUnit}. New cost is a
        weighted average.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Quantity (${material.purchaseUnit})`}>
          <input type="number" className="input" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <Field label="Total price paid">
          <input type="number" className="input" value={price} onChange={(e) => setPrice(Number(e.target.value))} />
        </Field>
        <div className="col-span-2">
          <Field label="Note (optional)">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        This purchase: {formatCurrency(newUnitCost, config)} / {material.purchaseUnit}.
      </p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit} disabled={qty <= 0}>
          Restock
        </button>
      </div>
    </Modal>
  );
}

function AdjustModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const [newStock, setNewStock] = useState(material.stockOnHand);
  const [note, setNote] = useState('');
  const submit = async () => {
    await adjustStock(material.id!, newStock, note);
    onClose();
  };
  return (
    <Modal open title={`Adjust stock — ${material.name}`} onClose={onClose}>
      <div className="grid grid-cols-1 gap-3">
        <Field label={`New stock count (${material.purchaseUnit})`}>
          <input type="number" className="input" value={newStock} onChange={(e) => setNewStock(Number(e.target.value))} />
        </Field>
        <Field label="Reason / note (required)">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. stock-take correction" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submit} disabled={!note.trim()}>
          Save adjustment
        </button>
      </div>
    </Modal>
  );
}

function HistoryModal({ material, onClose }: { material: Material; onClose: () => void }) {
  const { config } = useConfig();
  const moves = useLiveMovements(material.id!);
  return (
    <Modal open title={`Stock history — ${material.name}`} onClose={onClose} wide>
      {moves.length === 0 ? (
        <p className="text-sm text-gray-500">No movements recorded yet.</p>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th">Change</th>
                <th className="th">Unit cost</th>
                <th className="th">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {moves.map((mv) => (
                <tr key={mv.id}>
                  <td className="td">{new Date(mv.date).toLocaleDateString()}</td>
                  <td className="td">{mv.type}</td>
                  <td className={`td ${mv.quantityDelta < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {mv.quantityDelta > 0 ? '+' : ''}
                    {formatQty(mv.quantityDelta)}
                  </td>
                  <td className="td">{formatCurrency(mv.costPerBaseUnitAtTime, config)}</td>
                  <td className="td text-gray-500">{mv.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
function useLiveMovements(materialId: number) {
  return (
    useLiveQuery(
      () => db.stockMovements.where('materialId').equals(materialId).reverse().sortBy('date'),
      [materialId],
      [],
    ) ?? []
  );
}
