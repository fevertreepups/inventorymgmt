import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from './db';
import { loadBakerySeed, bakeryConfig } from './seed';
import { computeProductCosting } from '../lib/costing';
import type { Material } from '../types';

describe('Wawabakes Wonder seed mirrors the costing sheet (Block 1)', () => {
  it('recipe tallies to the sheet total and yield', async () => {
    await loadBakerySeed();
    const products = await db.products.toArray();
    expect(products.length).toBe(1);
    const materials = await db.materials.toArray();
    const map = new Map<number, Material>();
    for (const m of materials) map.set(m.id!, m);

    const c = computeProductCosting(products[0], map, bakeryConfig);

    // Block 1 line costs sum to 33.395 (sheet shows 33.40 after per-line rounding)
    expect(c.materialCostPerBatch).toBeCloseTo(33.39525, 4);
    // Overheads: electricity 0.65 + labour 18 + jar 3.50 = 22.15
    expect(c.overheadCostPerBatch).toBeCloseTo(22.15, 4);
    // Total batch cost = 55.545 (sheet's RM55.56 comes from rounding each line first)
    expect(c.totalBatchCost).toBeCloseTo(55.54525, 4);
    // Yield 1300g / 180g = 7.222 jars
    expect(c.unitsPerBatch).toBeCloseTo(1300 / 180, 6);
    // Cost per jar
    expect(c.trueCostPerUnit).toBeCloseTo(55.54525 / (1300 / 180), 4);
  });
});
