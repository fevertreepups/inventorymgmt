import type { AppConfig } from '../types';

// RULE A: round only at display. Two shared helpers; nothing else rounds.

export function roundForDisplay(value: number, dp = 2): number {
  if (!isFinite(value)) return 0;
  const f = Math.pow(10, dp);
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function formatCurrency(value: number, config: AppConfig): string {
  const n = roundForDisplay(value, 2).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return config.currencySymbolPosition === 'after'
    ? `${n}${config.currency}`
    : `${config.currency}${n}`;
}

export function formatQty(value: number, dp = 3): string {
  return roundForDisplay(value, dp).toLocaleString(undefined, {
    maximumFractionDigits: dp,
  });
}

export function monthKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // local timezone
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}
