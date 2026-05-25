import type { Sale, Expense } from '../types';
import { monthKey } from './format';

export interface ProfitAndLoss {
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  tax: number;
  netProfit: number;
}

export function plForSales(sales: Sale[], expenses: Expense[], taxRatePct: number): ProfitAndLoss {
  const revenue = sales.reduce((s, x) => s + x.unitsSold * x.unitPrice, 0);
  const cogs = sales.reduce((s, x) => s + x.unitsSold * x.costPerUnitSnapshot, 0);
  const grossProfit = revenue - cogs;
  const operatingExpenses = expenses.reduce((s, x) => s + x.amount, 0);
  const profitBeforeTax = grossProfit - operatingExpenses;
  const tax = Math.max(0, grossProfit) * (Math.max(0, taxRatePct) / 100);
  const netProfit = profitBeforeTax - tax;
  return { revenue, cogs, grossProfit, operatingExpenses, tax, netProfit };
}

export function filterByMonth<T extends { date: string }>(rows: T[], key: string): T[] {
  return rows.filter((r) => monthKey(r.date) === key);
}

export function plForMonth(
  sales: Sale[],
  expenses: Expense[],
  key: string,
  taxRatePct: number,
): ProfitAndLoss {
  return plForSales(filterByMonth(sales, key), filterByMonth(expenses, key), taxRatePct);
}

export function lastNMonthKeys(n: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKey(d));
  }
  return keys;
}
