import type { Sale, Production, Material, Product } from '../types';
import { monthKey } from './format';
import { convert } from './units';
import { resolveUnitsPerBatch } from './costing';

export type BaselineMode = 'lastMonth' | 'trailing3' | 'manual';

export interface ForecastInput {
  baselineMode: BaselineMode;
  manualBaseline?: number;
  growthRatePct: number;
  horizonMonths: number;
  seasonality?: Record<number, number>; // 1-12 -> multiplier
  taxRatePct: number;
  cogsRatio: number; // COGS / revenue from history (0..1)
}

export interface ForecastRow {
  monthIndex: number;
  monthNumber: number; // 1-12 calendar month
  revenue: number;
  cogs: number;
  grossProfit: number;
  tax: number;
  netProfit: number;
}

export interface ForecastResult {
  baselineValue: number;
  baselineLabel: string;
  rows: ForecastRow[];
}

/** Compute revenue baseline from sales history. */
export function computeBaseline(
  sales: Sale[],
  mode: BaselineMode,
  manual: number | undefined,
  now: Date = new Date(),
): { value: number; label: string } {
  if (mode === 'manual') {
    return { value: manual ?? 0, label: 'Manual entry' };
  }
  const byMonth = new Map<string, number>();
  for (const s of sales) {
    const k = monthKey(s.date);
    byMonth.set(k, (byMonth.get(k) ?? 0) + s.unitsSold * s.unitPrice);
  }

  if (mode === 'lastMonth') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const k = monthKey(d);
    return { value: byMonth.get(k) ?? 0, label: `Last completed month (${k})` };
  }

  // trailing3: average of the 3 completed months before current
  let sum = 0;
  const months: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const k = monthKey(d);
    sum += byMonth.get(k) ?? 0;
    months.push(k);
  }
  return { value: sum / 3, label: `Trailing 3-month average (${months.reverse().join(', ')})` };
}

export function runForecast(input: ForecastInput, sales: Sale[], now: Date = new Date()): ForecastResult {
  const { value, label } = computeBaseline(sales, input.baselineMode, input.manualBaseline, now);
  const rows: ForecastRow[] = [];
  const g = input.growthRatePct / 100;
  const taxF = Math.max(0, input.taxRatePct) / 100;

  for (let i = 1; i <= input.horizonMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthNumber = d.getMonth() + 1;
    const seasonal = input.seasonality?.[monthNumber] ?? 1;
    const revenue = value * Math.pow(1 + g, i) * seasonal;
    const cogs = revenue * input.cogsRatio;
    const grossProfit = revenue - cogs;
    const tax = Math.max(0, grossProfit) * taxF;
    const netProfit = grossProfit - tax;
    rows.push({ monthIndex: i, monthNumber, revenue, cogs, grossProfit, tax, netProfit });
  }

  return { baselineValue: value, baselineLabel: label, rows };
}

/** Estimate cogs ratio from history; default 0.5 if no data. */
export function estimateCogsRatio(sales: Sale[]): number {
  let rev = 0;
  let cogs = 0;
  for (const s of sales) {
    rev += s.unitsSold * s.unitPrice;
    cogs += s.unitsSold * s.costPerUnitSnapshot;
  }
  if (rev <= 0) return 0.5;
  return cogs / rev;
}

/**
 * Projected material demand for a forecast: how much of each material is needed
 * to produce the forecast revenue, based on each product's recent unit price and BOM.
 * Returns map materialId -> { qty (in purchaseUnit), restockSpend }.
 */
export function projectMaterialDemand(
  result: ForecastResult,
  sales: Sale[],
  products: Map<number, Product>,
  materials: Map<number, Material>,
): Map<number, { qty: number; restockSpend: number }> {
  // average revenue share per product from history
  const revByProduct = new Map<number, number>();
  const unitsByProduct = new Map<number, number>();
  let totalRev = 0;
  for (const s of sales) {
    const r = s.unitsSold * s.unitPrice;
    revByProduct.set(s.productId, (revByProduct.get(s.productId) ?? 0) + r);
    unitsByProduct.set(s.productId, (unitsByProduct.get(s.productId) ?? 0) + s.unitsSold);
    totalRev += r;
  }

  const totalForecastRevenue = result.rows.reduce((s, r) => s + r.revenue, 0);
  const demand = new Map<number, { qty: number; restockSpend: number }>();
  if (totalRev <= 0) return demand;

  for (const [productId, rev] of revByProduct) {
    const product = products.get(productId);
    if (!product) continue;
    const avgPrice =
      (unitsByProduct.get(productId) ?? 0) > 0 ? rev / (unitsByProduct.get(productId) ?? 1) : 0;
    if (avgPrice <= 0) continue;
    const share = rev / totalRev;
    const forecastRevForProduct = totalForecastRevenue * share;
    const forecastUnits = forecastRevForProduct / avgPrice;
    const unitsPerBatch = resolveUnitsPerBatch(product);
    if (unitsPerBatch <= 0) continue;
    const batches = forecastUnits / unitsPerBatch;

    for (const li of product.lineItems) {
      const m = materials.get(li.materialId);
      if (!m) continue;
      let qtyInPurchaseUnit: number;
      try {
        qtyInPurchaseUnit = convert(li.amountUsed, li.unit, m.purchaseUnit) * batches;
      } catch {
        qtyInPurchaseUnit = li.amountUsed * batches;
      }
      const prev = demand.get(li.materialId) ?? { qty: 0, restockSpend: 0 };
      prev.qty += qtyInPurchaseUnit;
      prev.restockSpend += qtyInPurchaseUnit * m.costPerBaseUnit;
      demand.set(li.materialId, prev);
    }
  }
  return demand;
}

/** Break-even units = fixed costs / contribution margin per unit. */
export function breakEven(fixedCosts: number, pricePerUnit: number, variableCostPerUnit: number) {
  const contribution = pricePerUnit - variableCostPerUnit;
  return {
    contributionMargin: contribution,
    unitsToBreakEven: contribution > 0 ? fixedCosts / contribution : Infinity,
    revenueToBreakEven: contribution > 0 ? (fixedCosts / contribution) * pricePerUnit : Infinity,
  };
}
