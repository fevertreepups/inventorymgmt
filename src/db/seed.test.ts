import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from './db';
import { loadBakerySeed, bakeryConfig } from './seed';
import { computeProductCosting } from '../lib/costing';
import type { Material } from '../types';

describe('Wawabakes Wonder seed (no labour cost)', () => {
  it('produces cost/jar RM4.71 and true cost RM6.31', async () => {
    await loadBakerySeed();
    const products = await db.products.toArray();
    expect(products.length).toBe(1);
    const materials = await db.materials.toArray();
    const map = new Map<number, Material>();
    for (const m of materials) map.set(m.id!, m);

    const c = computeProductCosting(products[0], map, bakeryConfig);

    // Ingredients sum to 33.395 (sheet shows 33.40 after per-line rounding)
    expect(c.materialCostPerBatch).toBeCloseTo(33.39525, 4);
    // Overheads: electricity only = RM0.65 (no labour counted)
    expect(c.overheadCostPerBatch).toBeCloseTo(0.65, 4);
    // Yield 1300g / 180g = 7.222 jars
    expect(c.unitsPerBatch).toBeCloseTo(1300 / 180, 6);
    // Cost per jar (before packaging) = RM4.71
    expect(c.costPerUnit).toBeCloseTo(4.71, 2);
    // True cost per jar = cost/jar + packaging(1.60) = RM6.31
    expect(c.trueCostPerUnit).toBeCloseTo(6.31, 2);
  });
});
