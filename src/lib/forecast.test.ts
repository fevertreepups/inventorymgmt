import { describe, it, expect } from 'vitest';
import { runForecast, computeBaseline, estimateCogsRatio, breakEven } from './forecast';
import type { Sale } from '../types';

const NOW = new Date(2026, 4, 15); // May 2026 (month index 4)

function sale(monthsAgo: number, units: number, price: number, cost: number): Sale {
  const d = new Date(2026, 4 - monthsAgo, 10);
  return { date: d.toISOString(), productId: 1, unitsSold: units, unitPrice: price, costPerUnitSnapshot: cost };
}

describe('baseline', () => {
  const sales = [sale(1, 10, 10, 4), sale(2, 20, 10, 4), sale(3, 30, 10, 4)];
  it('lastMonth picks previous month revenue', () => {
    const b = computeBaseline(sales, 'lastMonth', undefined, NOW);
    expect(b.value).toBe(100); // 10 units * 10
  });
  it('trailing3 averages 3 prior months', () => {
    const b = computeBaseline(sales, 'trailing3', undefined, NOW);
    expect(b.value).toBeCloseTo((100 + 200 + 300) / 3, 6);
  });
  it('manual uses provided value', () => {
    expect(computeBaseline(sales, 'manual', 555, NOW).value).toBe(555);
  });
});

describe('forecast projection', () => {
  it('applies compound growth', () => {
    const r = runForecast(
      { baselineMode: 'manual', manualBaseline: 1000, growthRatePct: 10, horizonMonths: 3, taxRatePct: 0, cogsRatio: 0.5 },
      [],
      NOW,
    );
    expect(r.rows[0].revenue).toBeCloseTo(1100, 6);
    expect(r.rows[1].revenue).toBeCloseTo(1210, 6);
    expect(r.rows[2].revenue).toBeCloseTo(1331, 6);
    expect(r.rows[0].cogs).toBeCloseTo(550, 6);
    expect(r.rows[0].grossProfit).toBeCloseTo(550, 6);
  });

  it('applies tax to net profit', () => {
    const r = runForecast(
      { baselineMode: 'manual', manualBaseline: 1000, growthRatePct: 0, horizonMonths: 1, taxRatePct: 10, cogsRatio: 0.5 },
      [],
      NOW,
    );
    expect(r.rows[0].grossProfit).toBeCloseTo(500, 6);
    expect(r.rows[0].tax).toBeCloseTo(50, 6);
    expect(r.rows[0].netProfit).toBeCloseTo(450, 6);
  });

  it('applies seasonality multiplier', () => {
    const month = (NOW.getMonth() + 1 + 1 - 1) % 12 + 1; // next month number
    const r = runForecast(
      { baselineMode: 'manual', manualBaseline: 1000, growthRatePct: 0, horizonMonths: 1, taxRatePct: 0, cogsRatio: 0, seasonality: { [month]: 2 } },
      [],
      NOW,
    );
    expect(r.rows[0].revenue).toBeCloseTo(2000, 6);
  });
});

describe('cogs ratio estimate', () => {
  it('computes ratio from history', () => {
    const sales = [sale(1, 10, 10, 4)]; // rev 100, cogs 40
    expect(estimateCogsRatio(sales)).toBeCloseTo(0.4, 6);
  });
  it('defaults when no sales', () => {
    expect(estimateCogsRatio([])).toBe(0.5);
  });
});

describe('break-even', () => {
  it('computes units and revenue', () => {
    const r = breakEven(1000, 25, 10);
    expect(r.contributionMargin).toBe(15);
    expect(r.unitsToBreakEven).toBeCloseTo(66.6667, 3);
    expect(r.revenueToBreakEven).toBeCloseTo(1666.667, 2);
  });
  it('infinite when no contribution', () => {
    expect(breakEven(1000, 10, 10).unitsToBreakEven).toBe(Infinity);
  });
});
