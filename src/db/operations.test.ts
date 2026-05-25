import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from './db';
import {
  restockMaterial,
  produceBatch,
  undoProduction,
  createSale,
  deleteMaterialSafe,
  checkBatchStock,
} from './operations';
import type { AppConfig, Material, Product } from '../types';
import { plForSales } from '../lib/accounting';

const config: AppConfig = {
  businessName: 'T', currency: 'RM', currencySymbolPosition: 'before',
  labourRatePerHour: 24, machineRatePerHour: 0.43, defaultTargetMarginPct: 60,
  taxRatePct: 0, units: [], materialCategories: [], expenseCategories: [],
  salesChannels: [], vocabulary: {} as any, theme: { primary: '', accent: '' }, logoPath: '',
};

async function reset() {
  await Promise.all([
    db.materials.clear(), db.stockMovements.clear(), db.products.clear(),
    db.productions.clear(), db.sales.clear(), db.expenses.clear(),
  ]);
}

beforeEach(reset);

async function seedCandle(): Promise<{ productId: number; waxId: number }> {
  const waxId = (await db.materials.add({
    name: 'Wax', purchasePrice: 90, purchaseQty: 5, purchaseUnit: 'kg',
    costPerBaseUnit: 18, stockOnHand: 8, reorderThreshold: 2, category: 'Wax',
  } as Material)) as number;
  const productId = (await db.products.add({
    name: 'Candle', yieldMode: 'direct', unitsPerBatch: 12,
    lineItems: [{ materialId: waxId, amountUsed: 2.4, unit: 'kg' }],
    batchOverheads: [{ label: 'Labour', hours: 1, rateType: 'labour' }],
    packagingCostPerUnit: 0.8, sellPrice: 45,
  } as Product)) as number;
  return { productId, waxId };
}

describe('restock weighted-average', () => {
  it('blends cost, not overwrite, and logs a movement', async () => {
    const { waxId } = await seedCandle(); // 8kg @ 18
    await restockMaterial(waxId, 5, 110); // 5kg @ 22/kg
    const m = await db.materials.get(waxId);
    expect(m!.stockOnHand).toBe(13);
    // (8*18 + 5*22)/13 = (144+110)/13 = 254/13
    expect(m!.costPerBaseUnit).toBeCloseTo(254 / 13, 6);
    const moves = await db.stockMovements.where('materialId').equals(waxId).toArray();
    expect(moves.length).toBe(1);
    expect(moves[0].type).toBe('restock');
  });
});

describe('produce batch + undo', () => {
  it('decrements stock and writes movements; undo restores', async () => {
    const { productId, waxId } = await seedCandle();
    const product = (await db.products.get(productId))!;
    const prodId = await produceBatch(product, config, { batchMultiplier: 1 });
    let m = await db.materials.get(waxId);
    expect(m!.stockOnHand).toBeCloseTo(8 - 2.4, 6);
    const prod = await db.productions.get(prodId);
    expect(prod!.unitsProduced).toBe(12);
    expect(prod!.trueCostPerUnitSnapshot).toBeGreaterThan(0);

    await undoProduction(prodId);
    m = await db.materials.get(waxId);
    expect(m!.stockOnHand).toBeCloseTo(8, 6);
    expect(await db.productions.get(prodId)).toBeUndefined();
    expect((await db.stockMovements.where('relatedProductionId').equals(prodId).toArray()).length).toBe(0);
  });

  it('batchMultiplier scales material usage', async () => {
    const { productId, waxId } = await seedCandle();
    const product = (await db.products.get(productId))!;
    await produceBatch(product, config, { batchMultiplier: 2 });
    const m = await db.materials.get(waxId);
    expect(m!.stockOnHand).toBeCloseTo(8 - 4.8, 6);
  });

  it('detects shortfall without blocking', async () => {
    const { productId } = await seedCandle();
    const product = (await db.products.get(productId))!;
    const short = await checkBatchStock(product, 5); // needs 12kg, have 8
    expect(short.length).toBe(1);
    expect(short[0].resultingStock).toBeCloseTo(8 - 12, 6);
  });
});

describe('cost snapshot is frozen (Rule B)', () => {
  it('material price change does not alter a past sale COGS', async () => {
    const { productId, waxId } = await seedCandle();
    const product = (await db.products.get(productId))!;
    const saleId = await createSale(
      { date: new Date().toISOString(), productId, unitsSold: 10, unitPrice: 45 },
      config,
    );
    const before = (await db.sales.get(saleId))!;
    const snapshot = before.costPerUnitSnapshot;
    expect(snapshot).toBeGreaterThan(0);

    // material price doubles
    await db.materials.update(waxId, { costPerBaseUnit: 36 });

    const after = (await db.sales.get(saleId))!;
    expect(after.costPerUnitSnapshot).toBe(snapshot); // frozen
    const pl = plForSales([after], [], 0);
    expect(pl.cogs).toBeCloseTo(10 * snapshot, 6);
  });
});

describe('delete material safety', () => {
  it('blocks deleting a material used by a product', async () => {
    const { waxId } = await seedCandle();
    await expect(deleteMaterialSafe(waxId)).rejects.toThrow(/used by/);
  });
  it('allows deleting an unused material', async () => {
    const id = (await db.materials.add({
      name: 'Unused', purchasePrice: 1, purchaseQty: 1, purchaseUnit: 'kg',
      costPerBaseUnit: 1, stockOnHand: 1, reorderThreshold: 0, category: 'x',
    } as Material)) as number;
    await deleteMaterialSafe(id);
    expect(await db.materials.get(id)).toBeUndefined();
  });
});
