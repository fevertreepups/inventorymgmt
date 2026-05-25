import { useState } from 'react';
import { db } from '../db/db';
import { useConfig } from '../config';
import { useProducts, useProductMap, useSales } from '../hooks';
import { createSale, currentTrueCostPerUnit } from '../db/operations';
import { Modal, EmptyState, Field, confirmDialog } from '../components/ui';
import { Header } from './Materials';
import { formatCurrency } from '../lib/format';
import { toCSV, downloadCSV } from '../lib/csv';
import type { Sale, Product } from '../types';

export default function Sales() {
  const { config } = useConfig();
  const sales = useSales();
  const products = useProducts();
  const productMap = useProductMap();
  const [editing, setEditing] = useState<Sale | null>(null);

  const newSale = (): Sale => ({
    date: new Date().toISOString().slice(0, 10),
    productId: products[0]?.id ?? 0,
    unitsSold: 1,
    unitPrice: products[0]?.sellPrice ?? 0,
    channel: config.salesChannels[0],
    costPerUnitSnapshot: 0,
  });

  const remove = async (s: Sale) => {
    if (!confirmDialog('Delete this sale?')) return;
    await db.sales.delete(s.id!);
  };

  const exportCsv = () => {
    const rows = sales.map((s) => ({
      date: s.date,
      product: productMap.get(s.productId)?.name ?? '',
      unitsSold: s.unitsSold,
      unitPrice: s.unitPrice,
      revenue: s.unitsSold * s.unitPrice,
      channel: s.channel ?? '',
      cogs: s.unitsSold * s.costPerUnitSnapshot,
    }));
    downloadCSV('sales.csv', toCSV(rows));
  };

  return (
    <div>
      <Header
        title="Sales"
        actions={
          <>
            {sales.length > 0 && (
              <button className="btn-secondary" onClick={exportCsv}>
                Export CSV
              </button>
            )}
            <button className="btn-primary" onClick={() => setEditing(newSale())} disabled={products.length === 0}>
              + Log sale
            </button>
          </>
        }
      />

      {products.length === 0 ? (
        <EmptyState title="No products to sell yet" hint="Build a product first, then log your sales here." />
      ) : sales.length === 0 ? (
        <EmptyState
          title="No sales logged"
          hint="Log your first sale to start tracking revenue and profit."
          action={
            <button className="btn-primary" onClick={() => setEditing(newSale())}>
              + Log sale
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Date</th>
                <th className="th">Product</th>
                <th className="th">Units</th>
                <th className="th">Price</th>
                <th className="th">Revenue</th>
                <th className="th">COGS</th>
                <th className="th">Channel</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map((s) => (
                <tr key={s.id}>
                  <td className="td">{new Date(s.date).toLocaleDateString()}</td>
                  <td className="td font-medium">{productMap.get(s.productId)?.name ?? '—'}</td>
                  <td className="td">{s.unitsSold}</td>
                  <td className="td">{formatCurrency(s.unitPrice, config)}</td>
                  <td className="td">{formatCurrency(s.unitsSold * s.unitPrice, config)}</td>
                  <td className="td text-gray-500">{formatCurrency(s.unitsSold * s.costPerUnitSnapshot, config)}</td>
                  <td className="td">{s.channel}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1 text-xs">
                      <button className="btn-secondary px-2 py-1" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                      <button className="btn-danger px-2 py-1" onClick={() => remove(s)}>
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

      {editing && <SaleModal sale={editing} products={products} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SaleModal({ sale, products, onClose }: { sale: Sale; products: Product[]; onClose: () => void }) {
  const { config } = useConfig();
  const [s, setS] = useState<Sale>(sale);
  const [refreshCost, setRefreshCost] = useState(false);
  const isNew = s.id == null;

  const save = async () => {
    if (isNew) {
      await createSale(
        { date: new Date(s.date).toISOString(), productId: s.productId, unitsSold: s.unitsSold, unitPrice: s.unitPrice, channel: s.channel },
        config,
      );
    } else {
      let snapshot = s.costPerUnitSnapshot;
      if (refreshCost) {
        const p = products.find((x) => x.id === s.productId);
        if (p) snapshot = await currentTrueCostPerUnit(p, config);
      }
      await db.sales.update(s.id!, { ...s, date: new Date(s.date).toISOString(), costPerUnitSnapshot: snapshot });
    }
    onClose();
  };

  return (
    <Modal open title={isNew ? 'Log sale' : 'Edit sale'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <input type="date" className="input" value={s.date.slice(0, 10)} onChange={(e) => setS({ ...s, date: e.target.value })} />
        </Field>
        <Field label="Product">
          <select
            className="input"
            value={s.productId}
            onChange={(e) => {
              const pid = Number(e.target.value);
              const p = products.find((x) => x.id === pid);
              setS({ ...s, productId: pid, unitPrice: p?.sellPrice ?? s.unitPrice });
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Units sold">
          <input type="number" className="input" value={s.unitsSold} onChange={(e) => setS({ ...s, unitsSold: Number(e.target.value) })} />
        </Field>
        <Field label="Unit price">
          <input type="number" className="input" value={s.unitPrice} onChange={(e) => setS({ ...s, unitPrice: Number(e.target.value) })} />
        </Field>
        <Field label="Channel">
          <select className="input" value={s.channel} onChange={(e) => setS({ ...s, channel: e.target.value })}>
            {config.salesChannels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {!isNew && (
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={refreshCost} onChange={(e) => setRefreshCost(e.target.checked)} />
          Refresh COGS to current cost (otherwise the original snapshot is kept)
        </label>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save}>
          Save
        </button>
      </div>
    </Modal>
  );
}
