import { describe, it, expect } from 'vitest';
import {
  computeProductCosting,
  weightedAverageCost,
  resolveUnitsPerBatch,
  priceForMargin,
  marginForPrice,
  lineItemCost,
} from './costing';
import type { AppConfig, Material, Product } from '../types';

const config: AppConfig = {
  businessName: 'Test',
  currency: 'RM',
  currencySymbolPosition: 'before',
  labourRatePerHour: 24,
  machineRatePerHour: 0.43,
  defaultTargetMarginPct: 60,
  taxRatePct: 0,
  units: [],
  materialCategories: [],
  expenseCategories: [],
  salesChannels: [],
  vocabulary: {} as any,
  theme: { primary: '', accent: '' },
  logoPath: '',
};

function mat(id: number, over: Partial<Material> = {}): Material {
  return {
    id,
    name: `m${id}`,
    purchasePrice: 0,
    purchaseQty: 1,
    purchaseUnit: 'kg',
    costPerBaseUnit: 18,
    stockOnHand: 100,
    reorderThreshold: 0,
    category: 'x',
    ...over,
  };
}

describe('weighted-average restock', () => {
  it('blends existing and new stock', () => {
    // 10 @ 2.00 + 10 @ 4.00 => 3.00
    expect(weightedAverageCost(10, 2, 10, 4)).toBe(3);
  });
  it('uses restock cost when stock is zero', () => {
    expect(weightedAverageCost(0, 999, 5, 7)).toBe(7);
  });
  it('does not simply overwrite', () => {
    const r = weightedAverageCost(90, 1, 10, 11);
    expect(r).toBeCloseTo(2, 6); // (90*1 + 10*11)/100 = 200/100 = 2
  });
});

describe('line item cost with conversion', () => {
  it('converts kg used against per-kg cost', () => {
    const m = mat(1, { purchaseUnit: 'kg', costPerBaseUnit: 18 });
    expect(lineItemCost({ materialId: 1, amountUsed: 2400, unit: 'g' }, m)).toBeCloseTo(43.2, 6);
  });
});

describe('yield modes', () => {
  it('direct mode uses unitsPerBatch', () => {
    const p: Product = {
      name: 'p',
      yieldMode: 'direct',
      unitsPerBatch: 12,
      lineItems: [],
      batchOverheads: [],
      packagingCostPerUnit: 0,
    };
    expect(resolveUnitsPerBatch(p)).toBe(12);
  });
  it('byWeight derives unitsPerBatch from output/perUnit', () => {
    const p: Product = {
      name: 'p',
      yieldMode: 'byWeight',
      batchOutputQty: 2400,
      outputPerUnit: 200,
      lineItems: [],
      batchOverheads: [],
      packagingCostPerUnit: 0,
    };
    expect(resolveUnitsPerBatch(p)).toBe(12);
  });
});

describe('product costing — candle (direct), hand calc', () => {
  const materials = new Map<number, Material>([
    [1, mat(1, { purchaseUnit: 'kg', costPerBaseUnit: 18 })], // wax
    [2, mat(2, { purchaseUnit: 'piece', costPerBaseUnit: 0.25 })], // wick
    [3, mat(3, { purchaseUnit: 'ml', costPerBaseUnit: 0.12 })], // fragrance
    [4, mat(4, { purchaseUnit: 'piece', costPerBaseUnit: 2.4 })], // jar
  ]);
  const product: Product = {
    name: 'Candle',
    yieldMode: 'direct',
    unitsPerBatch: 12,
    lineItems: [
      { materialId: 1, amountUsed: 2.4, unit: 'kg' }, // 43.2
      { materialId: 2, amountUsed: 12, unit: 'piece' }, // 3.0
      { materialId: 3, amountUsed: 240, unit: 'ml' }, // 28.8
      { materialId: 4, amountUsed: 12, unit: 'piece' }, // 28.8
    ],
    batchOverheads: [
      { label: 'Labour', hours: 1.5, rateType: 'labour' }, // 36
      { label: 'Elec', hours: 1, rateType: 'machine' }, // 0.43
    ],
    packagingCostPerUnit: 0.8,
    sellPrice: 45,
  };

  it('matches hand-calculated figures', () => {
    const c = computeProductCosting(product, materials, config);
    expect(c.materialCostPerBatch).toBeCloseTo(103.8, 6);
    expect(c.overheadCostPerBatch).toBeCloseTo(36.43, 6);
    expect(c.totalBatchCost).toBeCloseTo(140.23, 6);
    expect(c.costPerUnit).toBeCloseTo(11.685833, 5);
    expect(c.trueCostPerUnit).toBeCloseTo(12.485833, 5);
    expect(c.actualMargin).toBeCloseTo((45 - 12.485833) / 45, 5);
  });
});

describe('margin helpers', () => {
  it('priceForMargin inverts marginForPrice', () => {
    const price = priceForMargin(10, 60); // 25
    expect(price).toBeCloseTo(25, 6);
    expect(marginForPrice(price, 10)).toBeCloseTo(0.6, 6);
  });
});
