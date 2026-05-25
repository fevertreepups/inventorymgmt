import { db } from './db';
import type { AppConfig, Material, Product, Production, Sale } from '../types';
import { convert } from '../lib/units';
import {
  computeProductCosting,
  weightedAverageCost,
} from '../lib/costing';

function nowIso(): string {
  return new Date().toISOString();
}

/** Restock: weighted-average cost update + a StockMovement row. */
export async function restockMaterial(
  materialId: number,
  restockQty: number,
  restockTotalPrice: number,
  opts: { unit?: string; note?: string; date?: string } = {},
): Promise<void> {
  await db.transaction('rw', db.materials, db.stockMovements, async () => {
    const m = await db.materials.get(materialId);
    if (!m) throw new Error('Material not found');
    // restock cost is per purchaseUnit
    const restockCostPerBaseUnit = restockQty > 0 ? restockTotalPrice / restockQty : 0;
    const newCost = weightedAverageCost(
      m.stockOnHand,
      m.costPerBaseUnit,
      restockQty,
      restockCostPerBaseUnit,
    );
    await db.materials.update(materialId, {
      costPerBaseUnit: newCost,
      stockOnHand: m.stockOnHand + restockQty,
      purchasePrice: restockTotalPrice,
      purchaseQty: restockQty,
    });
    await db.stockMovements.add({
      date: opts.date ?? nowIso(),
      materialId,
      type: 'restock',
      quantityDelta: restockQty,
      costPerBaseUnitAtTime: restockCostPerBaseUnit,
      note: opts.note,
    });
  });
}

/** Manual stock adjustment (stock-take). Note required by UI. */
export async function adjustStock(
  materialId: number,
  newStockOnHand: number,
  note: string,
): Promise<void> {
  await db.transaction('rw', db.materials, db.stockMovements, async () => {
    const m = await db.materials.get(materialId);
    if (!m) throw new Error('Material not found');
    const delta = newStockOnHand - m.stockOnHand;
    await db.materials.update(materialId, { stockOnHand: newStockOnHand });
    await db.stockMovements.add({
      date: nowIso(),
      materialId,
      type: 'manual-adjust',
      quantityDelta: delta,
      costPerBaseUnitAtTime: m.costPerBaseUnit,
      note,
    });
  });
}

export interface BatchShortfall {
  materialId: number;
  name: string;
  needed: number;
  available: number;
  resultingStock: number;
}

/** Check whether a batch would push any material negative. */
export async function checkBatchStock(
  product: Product,
  batchMultiplier: number,
): Promise<BatchShortfall[]> {
  const shortfalls: BatchShortfall[] = [];
  for (const li of product.lineItems) {
    const m = await db.materials.get(li.materialId);
    if (!m) continue;
    let used: number;
    try {
      used = convert(li.amountUsed, li.unit, m.purchaseUnit) * batchMultiplier;
    } catch {
      used = li.amountUsed * batchMultiplier;
    }
    const resulting = m.stockOnHand - used;
    if (resulting < 0) {
      shortfalls.push({
        materialId: li.materialId,
        name: m.name,
        needed: used,
        available: m.stockOnHand,
        resultingStock: resulting,
      });
    }
  }
  return shortfalls;
}

/** Produce a batch: snapshot true cost, decrement stock, write movements. */
export async function produceBatch(
  product: Product,
  config: AppConfig,
  opts: { batchMultiplier: number; unitsWasted?: number; unitsProducedOverride?: number; date?: string },
): Promise<number> {
  return db.transaction('rw', db.materials, db.stockMovements, db.productions, async () => {
    const materials = new Map<number, Material>();
    for (const li of product.lineItems) {
      const m = await db.materials.get(li.materialId);
      if (m) materials.set(li.materialId, m);
    }
    const costing = computeProductCosting(product, materials, config);
    const unitsPerBatch = costing.unitsPerBatch;
    const unitsProduced =
      opts.unitsProducedOverride ?? unitsPerBatch * opts.batchMultiplier;

    const productionId = await db.productions.add({
      date: opts.date ?? nowIso(),
      productId: product.id!,
      batchMultiplier: opts.batchMultiplier,
      unitsProduced,
      unitsWasted: opts.unitsWasted ?? 0,
      trueCostPerUnitSnapshot: costing.trueCostPerUnit,
    });

    for (const li of product.lineItems) {
      const m = materials.get(li.materialId);
      if (!m) continue;
      let used: number;
      try {
        used = convert(li.amountUsed, li.unit, m.purchaseUnit) * opts.batchMultiplier;
      } catch {
        used = li.amountUsed * opts.batchMultiplier;
      }
      await db.materials.update(li.materialId, { stockOnHand: m.stockOnHand - used });
      await db.stockMovements.add({
        date: opts.date ?? nowIso(),
        materialId: li.materialId,
        type: 'production',
        quantityDelta: -used,
        costPerBaseUnitAtTime: m.costPerBaseUnit,
        relatedProductionId: productionId,
      });
    }
    return productionId;
  });
}

/** Undo a production: re-increment stock and remove its movements. */
export async function undoProduction(productionId: number): Promise<void> {
  await db.transaction('rw', db.materials, db.stockMovements, db.productions, async () => {
    const movements = await db.stockMovements
      .where('relatedProductionId')
      .equals(productionId)
      .toArray();
    for (const mv of movements) {
      const m = await db.materials.get(mv.materialId);
      if (m) {
        await db.materials.update(mv.materialId, {
          stockOnHand: m.stockOnHand - mv.quantityDelta, // delta was negative; subtract to restore
        });
      }
      await db.stockMovements.delete(mv.id!);
    }
    await db.productions.delete(productionId);
  });
}

/** Current live true cost per unit for a product (for snapshotting a sale). */
export async function currentTrueCostPerUnit(
  product: Product,
  config: AppConfig,
): Promise<number> {
  const materials = new Map<number, Material>();
  for (const li of product.lineItems) {
    const m = await db.materials.get(li.materialId);
    if (m) materials.set(li.materialId, m);
  }
  return computeProductCosting(product, materials, config).trueCostPerUnit;
}

/** Create a sale, snapshotting COGS at sale time. */
export async function createSale(
  sale: Omit<Sale, 'id' | 'costPerUnitSnapshot'>,
  config: AppConfig,
): Promise<number> {
  const product = await db.products.get(sale.productId);
  let snapshot = 0;
  if (product) snapshot = await currentTrueCostPerUnit(product, config);
  return db.sales.add({ ...sale, costPerUnitSnapshot: snapshot });
}

/** Block deletion of a material that products depend on. */
export async function deleteMaterialSafe(materialId: number): Promise<void> {
  const products = await db.products.toArray();
  const dependents = products.filter((p) =>
    p.lineItems.some((li) => li.materialId === materialId),
  );
  if (dependents.length > 0) {
    throw new Error(
      `Cannot delete: used by ${dependents.length} product(s): ${dependents
        .map((p) => p.name)
        .join(', ')}`,
    );
  }
  await db.transaction('rw', db.materials, db.stockMovements, async () => {
    await db.stockMovements.where('materialId').equals(materialId).delete();
    await db.materials.delete(materialId);
  });
}
