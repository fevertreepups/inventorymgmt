import { useState } from 'react';
import { useConfig } from '../config';
import { useSales, useExpenses } from '../hooks';
import { plForMonth, lastNMonthKeys } from '../lib/accounting';
import { formatCurrency, monthLabel, monthKey } from '../lib/format';
import { Header } from './Materials';
import { Field } from '../components/ui';

export default function Reports() {
  const { config } = useConfig();
  const sales = useSales();
  const expenses = useExpenses();
  const months = lastNMonthKeys(12).reverse();
  const [month, setMonth] = useState(monthKey(new Date()));
  const pl = plForMonth(sales, expenses, month, config.taxRatePct);

  const rows: [string, number, boolean?][] = [
    ['Revenue', pl.revenue],
    ['Cost of goods sold (COGS)', -pl.cogs],
    ['Gross profit', pl.grossProfit, true],
    ['Operating expenses', -pl.operatingExpenses],
    [`Tax (${config.taxRatePct}%)`, -pl.tax],
    ['Net profit', pl.netProfit, true],
  ];

  return (
    <div className="space-y-6">
      <Header
        title="Reports"
        actions={
          <button className="btn-secondary print:hidden" onClick={() => window.print()}>
            Print P&amp;L
          </button>
        }
      />

      <div className="card max-w-xl print:border-0 print:shadow-none">
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Field label="Month">
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold">{config.businessName}</h2>
          <p className="text-sm text-gray-500">Profit &amp; Loss — {monthLabel(month)}</p>
        </div>

        <table className="mt-4 w-full">
          <tbody>
            {rows.map(([label, val, bold]) => (
              <tr key={label} className={bold ? 'border-t border-gray-300 font-semibold' : ''}>
                <td className="py-2 text-sm">{label}</td>
                <td className={`py-2 text-right text-sm ${val < 0 ? 'text-gray-500' : ''}`}>
                  {formatCurrency(val, config)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
