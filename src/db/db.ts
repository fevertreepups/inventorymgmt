import Dexie, { type Table } from 'dexie';
import type {
  Material,
  StockMovement,
  Product,
  Production,
  Sale,
  Expense,
  MetaRow,
} from '../types';

export class CostBookDB extends Dexie {
  materials!: Table<Material, number>;
  stockMovements!: Table<StockMovement, number>;
  products!: Table<Product, number>;
  productions!: Table<Production, number>;
  sales!: Table<Sale, number>;
  expenses!: Table<Expense, number>;
  meta!: Table<MetaRow, string>;

  constructor(name = 'costbook') {
    super(name);
    this.version(1).stores({
      materials: '++id, name, category',
      stockMovements: '++id, materialId, date, type, relatedProductionId',
      products: '++id, name',
      productions: '++id, productId, date',
      sales: '++id, productId, date, channel',
      expenses: '++id, date, category',
      meta: 'key',
    });
  }
}

export const db = new CostBookDB();

export async function getMeta(key: string): Promise<string | undefined> {
  const row = await db.meta.get(key);
  return row?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}
