import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { db } from './db';
import { loadBakerySeed, bakeryConfig } from './seed';
import { computeProductCosting } from '../lib/costing';
import type { Material } from '../types';

describe('Wawabakes Wonder seed mirrors the costing sheet (Block 3)', () => {
  it('produces cost/jar RM9.70 and true cost RM16.30', async () => {
    await loadBakerySeed();
    const products = await db.products.toArray();
    expect(products.length).toBe(1);
    const materials = await db.materials.toArray();
    const map = new Map<number, Material>();
    for (const m of materials) map.set(m.id!, m);

    const c = computeProductCosting(products[0], map, bakeryConfig);

    // Ingredients sum to 33.395 (sheet shows 33.40 after per-line rounding)
    expect(c.materialCostPerBatch).toBeCloseTo(33.39525, 4);
    // Overheads: electricity 0.65 + baking labour 36.00 (RM24/hr x 1.5h) = 36.65
    expect(c.overheadCostPerBatch).toBeCloseTo(36.65, 4);
    // Yield 1300g / 180g = 7.222 jars
    expect(c.unitsPerBatch).toBeCloseTo(1300 / 180, 6);
    // Cost per jar (before packaging) = RM9.70
    expect(c.costPerUnit).toBeCloseTo(9.7, 2);
    // True cost per jar = cost/jar + packaging(1.60) + finishing labour(5.00) = RM16.30
    expect(c.trueCostPerUnit).toBeCloseTo(16.3, 2);
  });
});
