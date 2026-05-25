import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';

export const useMaterials = () => useLiveQuery(() => db.materials.toArray(), [], []);
export const useProducts = () => useLiveQuery(() => db.products.toArray(), [], []);
export const useSales = () => useLiveQuery(() => db.sales.orderBy('date').reverse().toArray(), [], []);
export const useExpenses = () =>
  useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray(), [], []);
export const useProductions = () =>
  useLiveQuery(() => db.productions.orderBy('date').reverse().toArray(), [], []);

export function useMaterialMap() {
  const materials = useMaterials();
  const map = new Map<number, (typeof materials)[number]>();
  for (const m of materials) if (m.id != null) map.set(m.id, m);
  return map;
}

export function useProductMap() {
  const products = useProducts();
  const map = new Map<number, (typeof products)[number]>();
  for (const p of products) if (p.id != null) map.set(p.id, p);
  return map;
}
