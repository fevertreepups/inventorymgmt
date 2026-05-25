import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useConfig } from '../config';
import { useSales, useProductMap, useMaterialMap } from '../hooks';
import {
  runForecast, estimateCogsRatio, projectMaterialDemand, breakEven, type BaselineMode,
} from '../lib/forecast';
import { formatCurrency, formatQty } from '../lib/format';
import { toCSV, downloadCSV } from '../lib/csv';
import { Header } from './Materials';
import { Field } from '../components/ui';

export default function Forecast() {
  const { config } = useConfig();
  const sales = useSales();
  const productMap = useProductMap();
  const materialMap = useMaterialMap();

  const [baselineMode, setBaselineMode] = useState<BaselineMode>('trailing3');
  const [manual, setManual] = useState(1000);
  const [growth, setGrowth] = useState(15);
  const [horizon, setHorizon] = useState(6);

  const cogsRatio = useMemo(() => estimateCogsRatio(sales), [sales]);

  const result = useMemo(
    () =>
      runForecast(
        { baselineMode, manualBaseline: manual, growthRatePct: growth, horizonMonths: horizon, taxRatePct: config.taxRatePct, cogsRatio },
        sales,
      ),
    [baselineMode, manual, growth, horizon, config.taxRatePct, cogsRatio, sales],
  );

  const demand = useMemo(
    () => projectMaterialDemand(result, sales, productMap, materialMap),
    [result, sales, productMap, materialMap],
  );

  const chartData = result.rows.map((r) => ({
    month: `M${r.monthIndex}`,
    Revenue: r.revenue,
    'Net profit': r.netProfit,
  }));

  // Break-even
  const [fixedCosts, setFixedCosts] = useState(1000);
  const [bePrice, setBePrice] = useState(45);
  const [beCost, setBeCost] = useState(12);
  const be = breakEven(fixedCosts, bePrice, beCost);

  const exportTable = () => {
    const rows = result.rows.map((r) => ({
      month: `M${r.monthIndex}`,
      revenue: r.revenue.toFixed(2),
      cogs: r.cogs.toFixed(2),
      grossProfit: r.grossProfit.toFixed(2),
      tax: r.tax.toFixed(2),
      netProfit: r.netProfit.toFixed(2),
    }));
    downloadCSV('forecast.csv', toCSV(rows));
  };

  return (
    <div className="space-y-6">
      <Header title="Growth Forecast" />

      <div className="card">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Baseline">
            <select className="input" value={baselineMode} onChange={(e) => setBaselineMode(e.target.value as BaselineMode)}>
              <option value="lastMonth">Last completed month</option>
              <option value="trailing3">Trailing 3-month average</option>
              <option value="manual">Manual entry</option>
            </select>
          </Field>
          {baselineMode === 'manual' && (
            <Field label="Manual baseline revenue">
              <input type="number" className="input" value={manual} onChange={(e) => setManual(Number(e.target.value))} />
            </Field>
          )}
          <Field label="Monthly growth %">
            <input type="number" className="input" value={growth} onChange={(e) => setGrowth(Number(e.target.value))} />
          </Field>
          <Field label="Horizon">
            <select className="input" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>
              <option value={3}>3 months</option>
              <option value={6}>6 months</option>
              <option value={12}>12 months</option>
            </select>
          </Field>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Baseline in use: <span className="font-medium">{result.baselineLabel}</span> ={' '}
          <span className="font-medium">{formatCurrency(result.baselineValue, config)}</span>. COGS ratio from history:{' '}
          <span className="font-medium">{(cogsRatio * 100).toFixed(1)}%</span>. Formula: revenue<sub>m</sub> = baseline ×
          (1 + growth)<sup>m</sup> × seasonality.
        </p>
      </div>

      <div className="card">
        <p className="mb-3 font-medium">Projected revenue &amp; net profit</p>
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="month" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip formatter={(v: number) => formatCurrency(v, config)} />
            <Legend />
            <Line type="monotone" dataKey="Revenue" stroke="var(--brand-accent)" strokeWidth={2} />
            <Line type="monotone" dataKey="Net profit" stroke="var(--brand-primary)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="card overflow-x-auto">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-medium">Projection table</p>
          <button className="btn-secondary" onClick={exportTable}>
            Export CSV
          </button>
        </div>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="th">Month</th>
              <th className="th">Revenue</th>
              <th className="th">COGS</th>
              <th className="th">Gross profit</th>
              <th className="th">Tax ({config.taxRatePct}%)</th>
              <th className="th">Net profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {result.rows.map((r) => (
              <tr key={r.monthIndex}>
                <td className="td">M{r.monthIndex}</td>
                <td className="td">{formatCurrency(r.revenue, config)}</td>
                <td className="td">{formatCurrency(r.cogs, config)}</td>
                <td className="td">{formatCurrency(r.grossProfit, config)}</td>
                <td className="td">{formatCurrency(r.tax, config)}</td>
                <td className="td font-medium">{formatCurrency(r.netProfit, config)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <p className="mb-3 font-medium">Projected material demand (over {horizon} months)</p>
        {demand.size === 0 ? (
          <p className="text-sm text-gray-400">Need sales history to project demand.</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="th">Material</th>
                <th className="th">Qty needed</th>
                <th className="th">Restock spend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...demand.entries()].map(([id, d]) => {
                const m = materialMap.get(id);
                return (
                  <tr key={id}>
                    <td className="td">{m?.name ?? id}</td>
                    <td className="td">
                      {formatQty(d.qty)} {m?.purchaseUnit}
                    </td>
                    <td className="td">{formatCurrency(d.restockSpend, config)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <p className="mb-3 font-medium">Break-even calculator</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Fixed costs / month">
            <input type="number" className="input" value={fixedCosts} onChange={(e) => setFixedCosts(Number(e.target.value))} />
          </Field>
          <Field label="Price per unit">
            <input type="number" className="input" value={bePrice} onChange={(e) => setBePrice(Number(e.target.value))} />
          </Field>
          <Field label="Variable cost per unit">
            <input type="number" className="input" value={beCost} onChange={(e) => setBeCost(Number(e.target.value))} />
          </Field>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Contribution margin = {formatCurrency(be.contributionMargin, config)} / unit. Break-even ={' '}
          <span className="font-medium">
            {be.unitsToBreakEven === Infinity ? '∞' : formatQty(be.unitsToBreakEven, 1)} units
          </span>{' '}
          ({be.revenueToBreakEven === Infinity ? '∞' : formatCurrency(be.revenueToBreakEven, config)} revenue) per month.
        </p>
        <p className="mt-1 text-xs text-gray-400">Formula: fixed costs ÷ (price − variable cost).</p>
      </div>
    </div>
  );
}
