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
  labourRatePerHour: 24,
  machineRatePerHour: 0.4333333333,
  defaultTargetMarginPct: 55,
  taxRatePct: 6,
  units: ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'biji', 'sheet'],
  materialCategories: [
    'Dairy',
    'Dry Goods',
    'Chocolate',
    'Sweetener',
    'Leavening',
    'Flavouring',
    'Salt',
    'Packaging',
    'Other',
  ],
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

  // Ingredient master data taken verbatim from Wawabakes Wonder's costing
  // sheet, Block 1 (the only block whose line costs sum exactly to its stated
  // total of RM55.56). Unit prices: butter RM14.90/250g, castor RM4.50/kg, etc.
  // costPerBaseUnit = purchasePrice / purchaseQty at full precision (Rule A).
  // Stock levels are not in the sheet; seeded as one purchase pack of each.
  const materials: Material[] = [
    { name: 'Lurpak Salted Butter', purchasePrice: 14.9, purchaseQty: 250, purchaseUnit: 'g', costPerBaseUnit: 14.9 / 250, stockOnHand: 250, reorderThreshold: 125, supplier: 'Grocer', category: 'Dairy' },
    { name: 'Castor Sugar', purchasePrice: 4.5, purchaseQty: 1000, purchaseUnit: 'g', costPerBaseUnit: 4.5 / 1000, stockOnHand: 1000, reorderThreshold: 200, supplier: 'Grocer', category: 'Sweetener' },
    { name: 'Brown Sugar', purchasePrice: 4.95, purchaseQty: 1000, purchaseUnit: 'g', costPerBaseUnit: 4.95 / 1000, stockOnHand: 1000, reorderThreshold: 200, supplier: 'Grocer', category: 'Sweetener' },
    { name: 'Tepung Bakers (Flour)', purchasePrice: 2.95, purchaseQty: 1000, purchaseUnit: 'g', costPerBaseUnit: 2.95 / 1000, stockOnHand: 1000, reorderThreshold: 300, supplier: 'Grocer', category: 'Dry Goods' },
    { name: 'Corn Starch', purchasePrice: 6, purchaseQty: 400, purchaseUnit: 'g', costPerBaseUnit: 6 / 400, stockOnHand: 400, reorderThreshold: 100, supplier: 'Grocer', category: 'Dry Goods' },
    { name: 'Baking Soda', purchasePrice: 1.3, purchaseQty: 100, purchaseUnit: 'g', costPerBaseUnit: 1.3 / 100, stockOnHand: 100, reorderThreshold: 25, supplier: 'Grocer', category: 'Leavening' },
    { name: 'Egg (Grade A)', purchasePrice: 13.8, purchaseQty: 30, purchaseUnit: 'biji', costPerBaseUnit: 13.8 / 30, stockOnHand: 30, reorderThreshold: 6, supplier: 'Grocer', category: 'Dairy' },
    { name: 'Vanilla Essence', purchasePrice: 21, purchaseQty: 1000, purchaseUnit: 'ml', costPerBaseUnit: 21 / 1000, stockOnHand: 1000, reorderThreshold: 200, supplier: 'Grocer', category: 'Flavouring' },
    { name: 'Callebaut Chocolate', purchasePrice: 114, purchaseQty: 1000, purchaseUnit: 'g', costPerBaseUnit: 114 / 1000, stockOnHand: 1000, reorderThreshold: 300, supplier: 'Baking Supply', category: 'Chocolate' },
    { name: 'Maldon Seasalt', purchasePrice: 33, purchaseQty: 250, purchaseUnit: 'g', costPerBaseUnit: 33 / 250, stockOnHand: 250, reorderThreshold: 50, supplier: 'Baking Supply', category: 'Salt' },
    { name: 'Jar + Sticker', purchasePrice: 1.6, purchaseQty: 1, purchaseUnit: 'piece', costPerBaseUnit: 1.6, stockOnHand: 20, reorderThreshold: 10, supplier: 'Packaging Co', category: 'Packaging' },
  ];
  const ids = (await db.materials.bulkAdd(materials, { allKeys: true })) as number[];
  const [butter, castor, brown, flour, cornStarch, soda, egg, vanilla, choc, salt] = ids;

  // byWeight: total dough 1300 g divided into 180 g jars => 7.22 jars per bake.
  // Mirrors the sheet's Block 3 final costing:
  //   cost per jar RM9.70 = (ingredients RM33.40 + electricity RM0.65
  //     + batch labour RM36.00 @ RM24/hr x 1.5h) / 7.22 jars
  //   + packaging RM1.60 (jar + sticker) + finishing labour RM5.00
  //   = true cost RM16.30 per jar.
  // The RM1.60 packaging and RM5.00 per-jar finishing labour are combined into
  // packagingCostPerUnit (RM6.60), since both are per-unit add-ons after baking.
  const product: Product = {
    name: 'Wawabakes Wonder Cookie Jar',
    yieldMode: 'byWeight',
    batchOutputQty: 1300,
    outputPerUnit: 180,
    batchOutputUnit: 'g',
    lineItems: [
      { materialId: butter, amountUsed: 125, unit: 'g' },
      { materialId: castor, amountUsed: 110, unit: 'g' },
      { materialId: brown, amountUsed: 100, unit: 'g' },
      { materialId: flour, amountUsed: 195, unit: 'g' },
      { materialId: cornStarch, amountUsed: 7.5, unit: 'g' },
      { materialId: soda, amountUsed: 2.5, unit: 'g' },
      { materialId: egg, amountUsed: 1, unit: 'biji' },
      { materialId: vanilla, amountUsed: 15, unit: 'ml' },
      { materialId: choc, amountUsed: 200, unit: 'g' },
      { materialId: salt, amountUsed: 5, unit: 'g' },
    ],
    batchOverheads: [
      { label: 'Electricity', hours: 1.5, rateType: 'machine' },
      { label: 'Labour (baking)', hours: 1.5, rateType: 'labour' },
    ],
    packagingCostPerUnit: 6.6,
  };
  await db.products.add(product);
}
