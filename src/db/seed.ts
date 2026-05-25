import { db, setMeta } from './db';
import type { AppConfig, Material, Product, Sale, Expense } from '../types';

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function monthsAgoIso(months: number, day = 15): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - months, day);
  return d.toISOString();
}

export const candleConfig: AppConfig = {
  businessName: 'Ember & Oak Candles',
  currency: 'RM',
  currencySymbolPosition: 'before',
  labourRatePerHour: 24,
  machineRatePerHour: 0.43,
  defaultTargetMarginPct: 60,
  taxRatePct: 0,
  units: ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'metre', 'cm', 'sheet'],
  materialCategories: ['Wax', 'Wick', 'Fragrance', 'Vessel', 'Packaging', 'Other'],
  expenseCategories: ['Rent', 'Marketing', 'Equipment', 'Utilities', 'Other'],
  salesChannels: ['Market', 'Online', 'Wholesale', 'Retail'],
  vocabulary: {
    material: 'Material',
    materialPlural: 'Materials',
    product: 'Product',
    productPlural: 'Products',
    productionRun: 'Batch',
    productionRunPlural: 'Batches',
  },
  theme: { primary: '#3a5a40', accent: '#a3b18a' },
  logoPath: '/assets/logo.png',
};

export const bakeryConfig: AppConfig = {
  businessName: 'Wawabakes Wonder',
  currency: 'RM',
  currencySymbolPosition: 'before',
  labourRatePerHour: 18,
  machineRatePerHour: 0.3,
  defaultTargetMarginPct: 55,
  taxRatePct: 6,
  units: ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'sheet'],
  materialCategories: ['Dairy', 'Dry Goods', 'Chocolate', 'Sweetener', 'Packaging', 'Other'],
  expenseCategories: ['Rent', 'Marketing', 'Equipment', 'Utilities', 'Other'],
  salesChannels: ['Market', 'Online', 'Wholesale', 'Retail'],
  vocabulary: {
    material: 'Ingredient',
    materialPlural: 'Ingredients',
    product: 'Recipe',
    productPlural: 'Recipes',
    productionRun: 'Bake',
    productionRunPlural: 'Bakes',
  },
  theme: { primary: '#7f5539', accent: '#e6ccb2' },
  logoPath: '/assets/logo.png',
};

async function clearAll(): Promise<void> {
  await db.transaction(
    'rw',
    [db.materials, db.stockMovements, db.products, db.productions, db.sales, db.expenses],
    async () => {
      await Promise.all([
        db.materials.clear(),
        db.stockMovements.clear(),
        db.products.clear(),
        db.productions.clear(),
        db.sales.clear(),
        db.expenses.clear(),
      ]);
    },
  );
}

export async function clearAllData(): Promise<void> {
  await clearAll();
}

export async function loadCandleSeed(): Promise<void> {
  await clearAll();
  await setMeta('config', JSON.stringify(candleConfig));

  const materials: Material[] = [
    { name: 'Soy Wax 464', purchasePrice: 90, purchaseQty: 5, purchaseUnit: 'kg', costPerBaseUnit: 18, stockOnHand: 8, reorderThreshold: 2, supplier: 'WaxCo', category: 'Wax' },
    { name: 'Cotton Wick CD-12', purchasePrice: 25, purchaseQty: 100, purchaseUnit: 'piece', costPerBaseUnit: 0.25, stockOnHand: 250, reorderThreshold: 50, supplier: 'WickWorld', category: 'Wick' },
    { name: 'Lavender Fragrance Oil', purchasePrice: 60, purchaseQty: 500, purchaseUnit: 'ml', costPerBaseUnit: 0.12, stockOnHand: 800, reorderThreshold: 200, supplier: 'AromaSupply', category: 'Fragrance' },
    { name: 'Amber Glass Jar 220ml', purchasePrice: 120, purchaseQty: 50, purchaseUnit: 'piece', costPerBaseUnit: 2.4, stockOnHand: 40, reorderThreshold: 20, supplier: 'GlassHouse', category: 'Vessel' },
    { name: 'Kraft Gift Box', purchasePrice: 40, purchaseQty: 50, purchaseUnit: 'piece', costPerBaseUnit: 0.8, stockOnHand: 60, reorderThreshold: 25, supplier: 'BoxIt', category: 'Packaging' },
  ];
  const ids = await db.materials.bulkAdd(materials, { allKeys: true });
  const [wax, wick, fragrance, jar] = ids as number[];

  const product: Product = {
    name: 'Lavender Soy Candle 220ml',
    yieldMode: 'direct',
    unitsPerBatch: 12,
    lineItems: [
      { materialId: wax, amountUsed: 2.4, unit: 'kg' },
      { materialId: wick, amountUsed: 12, unit: 'piece' },
      { materialId: fragrance, amountUsed: 240, unit: 'ml' },
      { materialId: jar, amountUsed: 12, unit: 'piece' },
    ],
    batchOverheads: [
      { label: 'Labour', hours: 1.5, rateType: 'labour' },
      { label: 'Melter electricity', hours: 1, rateType: 'machine' },
    ],
    packagingCostPerUnit: 0.8,
    sellPrice: 45,
  };
  const productId = (await db.products.add(product)) as number;

  // historical production run (frozen snapshot)
  await db.productions.add({
    date: monthsAgoIso(1, 5),
    productId,
    batchMultiplier: 1,
    unitsProduced: 12,
    unitsWasted: 0,
    trueCostPerUnitSnapshot: 9.55,
  });

  const sales: Sale[] = [
    { date: monthsAgoIso(2, 10), productId, unitsSold: 8, unitPrice: 45, channel: 'Market', costPerUnitSnapshot: 9.4 },
    { date: monthsAgoIso(1, 12), productId, unitsSold: 14, unitPrice: 45, channel: 'Online', costPerUnitSnapshot: 9.5 },
    { date: monthsAgoIso(1, 20), productId, unitsSold: 6, unitPrice: 42, channel: 'Wholesale', costPerUnitSnapshot: 9.5 },
    { date: isoDaysAgo(5), productId, unitsSold: 10, unitPrice: 45, channel: 'Online', costPerUnitSnapshot: 9.55 },
  ];
  await db.sales.bulkAdd(sales);

  const expenses: Expense[] = [
    { date: monthsAgoIso(1, 1), label: 'Studio rent', amount: 300, category: 'Rent' },
    { date: monthsAgoIso(1, 8), label: 'Instagram ads', amount: 80, category: 'Marketing' },
    { date: isoDaysAgo(3), label: 'Studio rent', amount: 300, category: 'Rent' },
  ];
  await db.expenses.bulkAdd(expenses);
}

export async function loadBakerySeed(): Promise<void> {
  await clearAll();
  await setMeta('config', JSON.stringify(bakeryConfig));

  const materials: Material[] = [
    { name: 'Lurpak Salted Butter', purchasePrice: 24, purchaseQty: 1, purchaseUnit: 'kg', costPerBaseUnit: 24, stockOnHand: 4, reorderThreshold: 1, supplier: 'GroceryCo', category: 'Dairy' },
    { name: 'Plain Flour', purchasePrice: 5, purchaseQty: 5, purchaseUnit: 'kg', costPerBaseUnit: 1, stockOnHand: 12, reorderThreshold: 3, supplier: 'GroceryCo', category: 'Dry Goods' },
    { name: 'Dark Chocolate Chips', purchasePrice: 40, purchaseQty: 2, purchaseUnit: 'kg', costPerBaseUnit: 20, stockOnHand: 3, reorderThreshold: 1, supplier: 'ChocSupply', category: 'Chocolate' },
    { name: 'Brown Sugar', purchasePrice: 8, purchaseQty: 2, purchaseUnit: 'kg', costPerBaseUnit: 4, stockOnHand: 5, reorderThreshold: 1, supplier: 'GroceryCo', category: 'Sweetener' },
    { name: 'Cookie Jar', purchasePrice: 30, purchaseQty: 20, purchaseUnit: 'piece', costPerBaseUnit: 1.5, stockOnHand: 25, reorderThreshold: 10, supplier: 'BoxIt', category: 'Packaging' },
  ];
  const ids = await db.materials.bulkAdd(materials, { allKeys: true });
  const [butter, flour, choc, sugar] = ids as number[];

  // byWeight: dough divided by weight. Batch dough output summed ~ 2400g, 200g per jar => 12 units.
  const product: Product = {
    name: 'Brown Butter Cookie Jar',
    yieldMode: 'byWeight',
    batchOutputQty: 2400,
    outputPerUnit: 200,
    batchOutputUnit: 'g',
    lineItems: [
      { materialId: butter, amountUsed: 500, unit: 'g' },
      { materialId: flour, amountUsed: 800, unit: 'g' },
      { materialId: choc, amountUsed: 400, unit: 'g' },
      { materialId: sugar, amountUsed: 700, unit: 'g' },
    ],
    batchOverheads: [
      { label: 'Labour', hours: 1.2, rateType: 'labour' },
      { label: 'Oven electricity', hours: 0.75, rateType: 'machine' },
    ],
    packagingCostPerUnit: 1.5,
    sellPrice: 18,
  };
  const productId = (await db.products.add(product)) as number;

  await db.productions.add({
    date: monthsAgoIso(1, 6),
    productId,
    batchMultiplier: 1,
    unitsProduced: 12,
    unitsWasted: 1,
    trueCostPerUnitSnapshot: 6.1,
  });

  const sales: Sale[] = [
    { date: monthsAgoIso(2, 14), productId, unitsSold: 10, unitPrice: 18, channel: 'Market', costPerUnitSnapshot: 6.0 },
    { date: monthsAgoIso(1, 9), productId, unitsSold: 18, unitPrice: 18, channel: 'Online', costPerUnitSnapshot: 6.05 },
    { date: monthsAgoIso(1, 22), productId, unitsSold: 8, unitPrice: 17, channel: 'Market', costPerUnitSnapshot: 6.1 },
    { date: isoDaysAgo(4), productId, unitsSold: 12, unitPrice: 18, channel: 'Online', costPerUnitSnapshot: 6.1 },
  ];
  await db.sales.bulkAdd(sales);

  const expenses: Expense[] = [
    { date: monthsAgoIso(1, 2), label: 'Kitchen rent', amount: 200, category: 'Rent' },
    { date: isoDaysAgo(2), label: 'Market stall fee', amount: 50, category: 'Marketing' },
  ];
  await db.expenses.bulkAdd(expenses);
}
