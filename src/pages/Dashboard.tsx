import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { db, getMeta } from '../db/db';
import { useConfig } from '../config';
import { useMaterials, useProducts, useSales, useExpenses, useMaterialMap } from '../hooks';
import { computeProductCosting } from '../lib/costing';
import { plForMonth, lastNMonthKeys } from '../lib/accounting';
import { formatCurrency, monthKey, monthLabel } from '../lib/format';
import { Stat, EmptyState } from '../components/ui';

export default function Dashboard() {
  const { config } = useConfig();
  const v = config.vocabulary;
  const materials = useMaterials();
  const products = useProducts();
  const sales = useSales();
  const expenses = useExpenses();
  const materialMap = useMaterialMap();

  const lastBackup = useLiveQuery(() => getMeta('lastBackupAt'), [], undefined);

  const hasData = materials.length || products.length || sales.length || expenses.length;
  if (!hasData) {
    return (
      <div>
        <h1 className="mb-5 text-xl font-semibold">{config.businessName}</h1>
        <EmptyState
          title="Welcome — your book is empty"
          hint={`Get started: add ${v.materialPlural.toLowerCase()} → build a ${v.product.toLowerCase()} → log a sale. Or load example data from Settings.`}
          action={
            <div className="flex gap-2">
              <Link className="btn-primary" to="/materials">
                Add {v.materialPlural}
              </Link>
              <Link className="btn-secondary" to="/settings">
                Load example
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const thisMonth = monthKey(new Date());
  const pl = plForMonth(sales, expenses, thisMonth, config.taxRatePct);
  const inventoryValue = materials.reduce((s, m) => s + m.stockOnHand * m.costPerBaseUnit, 0);
  const lowStock = materials.filter((m) => m.stockOnHand <= m.reorderThreshold);

  // 6-month profit trend
  const trend = lastNMonthKeys(6).map((k) => {
    const p = plForMonth(sales, expenses, k, config.taxRatePct);
    return { month: monthLabel(k).split(' ')[0], revenue: p.revenue, profit: p.netProfit };
  });

  // best sellers (units by product, all-time)
  const unitsByProduct = new Map<number, number>();
  for (const s of sales) unitsByProduct.set(s.productId, (unitsByProduct.get(s.productId) ?? 0) + s.unitsSold);
  const bestSellers = products
    .map((p) => ({ name: p.name, units: unitsByProduct.get(p.id!) ?? 0 }))
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const backupStale =
    !lastBackup || Date.now() - new Date(lastBackup).getTime() > 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{config.businessName}</h1>
        <p className="text-sm text-gray-500">{monthLabel(thisMonth)}</p>
      </div>

      {backupStale && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          No backup in the last 30 days. Your data lives in this browser only —{' '}
          <Link to="/settings" className="font-medium underline">
            export a backup
          </Link>
          .
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Inventory value" value={formatCurrency(inventoryValue, config)} />
        <Stat label="Revenue this month" value={formatCurrency(pl.revenue, config)} />
        <Stat label="Profit this month" value={formatCurrency(pl.netProfit, config)} tone={pl.netProfit >= 0 ? 'good' : 'bad'} />
        <Stat label="Low-stock items" value={String(lowStock.length)} tone={lowStock.length > 0 ? 'warn' : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="mb-3 font-medium">Profit trend (6 months)</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(val: number) => formatCurrency(val, config)} />
              <Line type="monotone" dataKey="revenue" stroke="var(--brand-accent)" strokeWidth={2} dot={false} name="Revenue" />
              <Line type="monotone" dataKey="profit" stroke="var(--brand-primary)" strokeWidth={2} dot={false} name="Net profit" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <p className="mb-3 font-medium">Best sellers (units)</p>
          {bestSellers.every((b) => b.units === 0) ? (
            <p className="py-12 text-center text-sm text-gray-400">No sales yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bestSellers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="units" fill="var(--brand-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <p className="mb-3 font-medium">Margin by {v.product.toLowerCase()}</p>
          <table className="min-w-full">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">True cost</th>
                <th className="th">Price</th>
                <th className="th">Margin</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const c = computeProductCosting(p, materialMap, config);
                const target = p.targetMarginPct ?? config.defaultTargetMarginPct;
                const below = c.actualMargin != null && c.actualMargin * 100 < target;
                return (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="td">{p.name}</td>
                    <td className="td">{formatCurrency(c.trueCostPerUnit, config)}</td>
                    <td className="td">{p.sellPrice != null ? formatCurrency(p.sellPrice, config) : '—'}</td>
                    <td className={`td ${below ? 'font-semibold text-red-600' : 'text-emerald-600'}`}>
                      {c.actualMargin != null ? `${(c.actualMargin * 100).toFixed(1)}%` : '—'}
                      {below && ' ⚠'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="card">
          <p className="mb-3 font-medium">Low-stock alerts</p>
          {lowStock.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">All {v.materialPlural.toLowerCase()} above reorder level.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {lowStock.map((m) => (
                <li key={m.id} className="flex justify-between py-2 text-sm">
                  <span className={m.stockOnHand < 0 ? 'font-semibold text-red-600' : ''}>{m.name}</span>
                  <span className="text-gray-500">
                    {m.stockOnHand} / reorder {m.reorderThreshold} {m.purchaseUnit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
