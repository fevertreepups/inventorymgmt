import { db, setMeta, getMeta } from '../db/db';
import type { AppConfig } from '../types';

export interface BackupFile {
  app: 'costbook';
  version: 1;
  exportedAt: string;
  config: AppConfig | null;
  data: {
    materials: unknown[];
    stockMovements: unknown[];
    products: unknown[];
    productions: unknown[];
    sales: unknown[];
    expenses: unknown[];
  };
}

export async function exportBackup(): Promise<BackupFile> {
  const configStr = await getMeta('config');
  const [materials, stockMovements, products, productions, sales, expenses] = await Promise.all([
    db.materials.toArray(),
    db.stockMovements.toArray(),
    db.products.toArray(),
    db.productions.toArray(),
    db.sales.toArray(),
    db.expenses.toArray(),
  ]);
  await setMeta('lastBackupAt', new Date().toISOString());
  return {
    app: 'costbook',
    version: 1,
    exportedAt: new Date().toISOString(),
    config: configStr ? (JSON.parse(configStr) as AppConfig) : null,
    data: { materials, stockMovements, products, productions, sales, expenses },
  };
}

export function downloadBackup(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const ts = backup.exportedAt.replace(/[:.]/g, '-');
  a.href = url;
  a.download = `costbook-backup-${ts}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(backup: BackupFile): Promise<void> {
  if (backup.app !== 'costbook') throw new Error('Not a CostBook backup file');
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
      await db.materials.bulkAdd(backup.data.materials as any);
      await db.stockMovements.bulkAdd(backup.data.stockMovements as any);
      await db.products.bulkAdd(backup.data.products as any);
      await db.productions.bulkAdd(backup.data.productions as any);
      await db.sales.bulkAdd(backup.data.sales as any);
      await db.expenses.bulkAdd(backup.data.expenses as any);
    },
  );
  if (backup.config) await setMeta('config', JSON.stringify(backup.config));
}
