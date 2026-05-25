import type { AppConfig, Material, Product, LineItem, BatchOverhead } from '../types';
import { convert } from './units';

// RULE B: these functions recompute LIVE from current material prices.
// Historical snapshots are taken by callers at create-time, never here.

export interface ProductCosting {
  materialCostPerBatch: number;
  overheadCostPerBatch: number;
  totalBatchCost: number;
  unitsPerBatch: number;
  costPerUnit: number;
  trueCostPerUnit: number;
  suggestedPrice: number;
  actualMargin: number | null; // fraction (0.6 = 60%), null if no sellPrice
  lineCosts: { materialId: number; cost: number; missing: boolean }[];
}

/** Cost of one line item, converting the used amount into the material's purchaseUnit. */
export function lineItemCost(line: LineItem, material: Material): number {
  // costPerBaseUnit is per material.purchaseUnit. Convert amountUsed -> purchaseUnit.
  const amountInPurchaseUnit = convert(line.amountUsed, line.unit, material.purchaseUnit);
  return amountInPurchaseUnit * material.costPerBaseUnit;
}

export function overheadCost(o: BatchOverhead, config: AppConfig): number {
  if (o.hours != null && o.rateType) {
    const rate = o.rateType === 'machine' ? config.machineRatePerHour : config.labourRatePerHour;
    return o.hours * rate;
  }
  return o.cost ?? 0;
}

/** Resolve unitsPerBatch from either yield mode. Engine stays yield-mode-agnostic downstream. */
export function resolveUnitsPerBatch(product: Product): number {
  if (product.yieldMode === 'byWeight') {
    const out = product.batchOutputQty ?? 0;
    const per = product.outputPerUnit ?? 0;
    if (per <= 0) return 0;
    return out / per;
  }
  return product.unitsPerBatch ?? 0;
}

/** Sum line items in byWeight mode to auto-fill batch output qty (same unit assumed). */
export function sumLineItemsForOutput(product: Product, materials: Map<number, Material>): number {
  let total = 0;
  for (const li of product.lineItems) {
    const m = materials.get(li.materialId);
    if (!m) continue;
    try {
      total += product.batchOutputUnit
        ? convert(li.amountUsed, li.unit, product.batchOutputUnit)
        : li.amountUsed;
    } catch {
      total += li.amountUsed;
    }
  }
  return total;
}

export function computeProductCosting(
  product: Product,
  materials: Map<number, Material>,
  config: AppConfig,
): ProductCosting {
  const lineCosts = product.lineItems.map((li) => {
    const m = materials.get(li.materialId);
    if (!m) return { materialId: li.materialId, cost: 0, missing: true };
    return { materialId: li.materialId, cost: lineItemCost(li, m), missing: false };
  });

  const materialCostPerBatch = lineCosts.reduce((s, l) => s + l.cost, 0);
  const overheadCostPerBatch = product.batchOverheads.reduce(
    (s, o) => s + overheadCost(o, config),
    0,
  );
  const totalBatchCost = materialCostPerBatch + overheadCostPerBatch;
  const unitsPerBatch = resolveUnitsPerBatch(product);
  const costPerUnit = unitsPerBatch > 0 ? totalBatchCost / unitsPerBatch : 0;
  const trueCostPerUnit = costPerUnit + product.packagingCostPerUnit;

  const marginPct = product.targetMarginPct ?? config.defaultTargetMarginPct;
  // price such that margin = (price - cost)/price => price = cost / (1 - margin)
  const marginFraction = marginPct / 100;
  const suggestedPrice =
    marginFraction < 1 ? trueCostPerUnit / (1 - marginFraction) : trueCostPerUnit;

  let actualMargin: number | null = null;
  if (product.sellPrice != null && product.sellPrice > 0) {
    actualMargin = (product.sellPrice - trueCostPerUnit) / product.sellPrice;
  }

  return {
    materialCostPerBatch,
    overheadCostPerBatch,
    totalBatchCost,
    unitsPerBatch,
    costPerUnit,
    trueCostPerUnit,
    suggestedPrice,
    actualMargin,
    lineCosts,
  };
}

/** Weighted-average restock. If stock is 0, new cost = restock cost. */
export function weightedAverageCost(
  stockOnHand: number,
  oldCostPerBaseUnit: number,
  restockQty: number,
  restockCostPerBaseUnit: number,
): number {
  if (stockOnHand <= 0) return restockCostPerBaseUnit;
  return (
    (stockOnHand * oldCostPerBaseUnit + restockQty * restockCostPerBaseUnit) /
    (stockOnHand + restockQty)
  );
}

/** Suggested price for a target margin given a unit cost. */
export function priceForMargin(cost: number, marginPct: number): number {
  const f = marginPct / 100;
  return f < 1 ? cost / (1 - f) : cost;
}

/** Actual margin (fraction) given a price and cost. */
export function marginForPrice(price: number, cost: number): number {
  if (price <= 0) return 0;
  return (price - cost) / price;
}
