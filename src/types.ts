// Core domain types. Code always uses Material/Product/Production internally;
// only displayed strings change via config.vocabulary.

export interface Vocabulary {
  material: string;
  materialPlural: string;
  product: string;
  productPlural: string;
  productionRun: string;
  productionRunPlural: string;
}

export interface AppConfig {
  businessName: string;
  currency: string;
  currencySymbolPosition: 'before' | 'after';
  labourRatePerHour: number;
  machineRatePerHour: number;
  defaultTargetMarginPct: number;
  taxRatePct: number;
  units: string[];
  materialCategories: string[];
  expenseCategories: string[];
  salesChannels: string[];
  vocabulary: Vocabulary;
  theme: { primary: string; accent: string };
  logoPath: string;
}

export interface Material {
  id?: number;
  name: string;
  purchasePrice: number;
  purchaseQty: number;
  purchaseUnit: string;
  costPerBaseUnit: number; // weighted-average, per purchaseUnit
  stockOnHand: number; // in purchaseUnit
  reorderThreshold: number;
  supplier?: string;
  category: string;
}

export type StockMovementType = 'restock' | 'production' | 'wastage' | 'manual-adjust';

export interface StockMovement {
  id?: number;
  date: string; // ISO
  materialId: number;
  type: StockMovementType;
  quantityDelta: number; // +/- in purchaseUnit
  costPerBaseUnitAtTime: number;
  note?: string;
  relatedProductionId?: number;
}

export interface LineItem {
  materialId: number;
  amountUsed: number;
  unit: string;
}

export interface BatchOverhead {
  label: string;
  cost?: number; // direct cost, OR
  hours?: number; // time-based
  rateType?: 'labour' | 'machine'; // which config rate to apply to hours
}

export type YieldMode = 'direct' | 'byWeight';

export interface Product {
  id?: number;
  name: string;
  lineItems: LineItem[];
  batchOverheads: BatchOverhead[];
  yieldMode: YieldMode;
  unitsPerBatch?: number; // direct mode
  batchOutputQty?: number; // byWeight mode
  outputPerUnit?: number; // byWeight mode
  batchOutputUnit?: string; // byWeight mode unit
  packagingCostPerUnit: number;
  sellPrice?: number;
  targetMarginPct?: number; // overrides config default if set
}

export interface Production {
  id?: number;
  date: string;
  productId: number;
  batchMultiplier: number;
  unitsProduced: number;
  unitsWasted: number;
  trueCostPerUnitSnapshot: number;
}

export interface Sale {
  id?: number;
  date: string;
  productId: number;
  unitsSold: number;
  unitPrice: number;
  channel?: string;
  costPerUnitSnapshot: number;
}

export interface Expense {
  id?: number;
  date: string;
  label: string;
  amount: number;
  category: string;
}

export interface MetaRow {
  key: string;
  value: string;
}
