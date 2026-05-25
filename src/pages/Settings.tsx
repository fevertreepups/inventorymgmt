import { useState } from 'react';
import { useConfig } from '../config';
import { loadCandleSeed, loadBakerySeed, clearAllData } from '../db/seed';
import { exportBackup, downloadBackup, importBackup, type BackupFile } from '../lib/backup';
import { Header } from './Materials';
import { Field, confirmDialog } from '../components/ui';
import type { AppConfig } from '../types';

export default function Settings() {
  const { config, save, reload } = useConfig();
  const [c, setC] = useState<AppConfig>(config);
  const [msg, setMsg] = useState('');

  const saveConfig = async () => {
    await save(c);
    setMsg('Configuration saved.');
  };

  const list = (arr: string[]) => arr.join(', ');
  const parseList = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const doExport = async () => {
    downloadBackup(await exportBackup());
    setMsg('Backup exported.');
  };

  const doImport = async (file: File) => {
    if (!confirmDialog('Importing replaces ALL current data. Continue?')) return;
    const backup = JSON.parse(await file.text()) as BackupFile;
    await importBackup(backup);
    await reload();
    setMsg('Backup restored.');
  };

  const loadSeed = async (which: 'candle' | 'bakery') => {
    if (!confirmDialog('This replaces all current data with example data. Continue?')) return;
    if (which === 'candle') await loadCandleSeed();
    else await loadBakerySeed();
    await reload();
    setMsg('Example data loaded.');
  };

  const clearData = async () => {
    if (!confirmDialog('Delete ALL data? This cannot be undone (export a backup first).')) return;
    await clearAllData();
    setMsg('All data cleared.');
  };

  return (
    <div className="max-w-3xl space-y-6">
      <Header title="Settings" />
      {msg && <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</div>}

      <section className="card">
        <h2 className="mb-3 font-medium">Business &amp; branding</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Business name">
            <input className="input" value={c.businessName} onChange={(e) => setC({ ...c, businessName: e.target.value })} />
          </Field>
          <Field label="Currency symbol">
            <input className="input" value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value })} />
          </Field>
          <Field label="Symbol position">
            <select className="input" value={c.currencySymbolPosition} onChange={(e) => setC({ ...c, currencySymbolPosition: e.target.value as any })}>
              <option value="before">Before (RM10.00)</option>
              <option value="after">After (10.00€)</option>
            </select>
          </Field>
          <Field label="Primary colour">
            <input type="color" className="input h-10" value={c.theme.primary} onChange={(e) => setC({ ...c, theme: { ...c.theme, primary: e.target.value } })} />
          </Field>
          <Field label="Accent colour">
            <input type="color" className="input h-10" value={c.theme.accent} onChange={(e) => setC({ ...c, theme: { ...c.theme, accent: e.target.value } })} />
          </Field>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Rates &amp; tax</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Labour rate / hour">
            <input type="number" className="input" value={c.labourRatePerHour} onChange={(e) => setC({ ...c, labourRatePerHour: Number(e.target.value) })} />
          </Field>
          <Field label="Machine rate / hour">
            <input type="number" className="input" value={c.machineRatePerHour} onChange={(e) => setC({ ...c, machineRatePerHour: Number(e.target.value) })} />
          </Field>
          <Field label="Default target margin %">
            <input type="number" className="input" value={c.defaultTargetMarginPct} onChange={(e) => setC({ ...c, defaultTargetMarginPct: Number(e.target.value) })} />
          </Field>
          <Field label="Tax rate %">
            <input type="number" className="input" value={c.taxRatePct} onChange={(e) => setC({ ...c, taxRatePct: Number(e.target.value) })} />
          </Field>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Vocabulary (relabel the app for your trade)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ['material', 'Material (singular)'],
              ['materialPlural', 'Materials (plural)'],
              ['product', 'Product (singular)'],
              ['productPlural', 'Products (plural)'],
              ['productionRun', 'Batch (singular)'],
              ['productionRunPlural', 'Batches (plural)'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                className="input"
                value={(c.vocabulary as any)[key]}
                onChange={(e) => setC({ ...c, vocabulary: { ...c.vocabulary, [key]: e.target.value } })}
              />
            </Field>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Lists</h2>
        <div className="space-y-3">
          <Field label="Units (comma separated)">
            <input className="input" value={list(c.units)} onChange={(e) => setC({ ...c, units: parseList(e.target.value) })} />
          </Field>
          <Field label="Material categories">
            <input className="input" value={list(c.materialCategories)} onChange={(e) => setC({ ...c, materialCategories: parseList(e.target.value) })} />
          </Field>
          <Field label="Expense categories">
            <input className="input" value={list(c.expenseCategories)} onChange={(e) => setC({ ...c, expenseCategories: parseList(e.target.value) })} />
          </Field>
          <Field label="Sales channels">
            <input className="input" value={list(c.salesChannels)} onChange={(e) => setC({ ...c, salesChannels: parseList(e.target.value) })} />
          </Field>
        </div>
        <div className="mt-4">
          <button className="btn-primary" onClick={saveConfig}>
            Save configuration
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Backup &amp; restore</h2>
        <p className="mb-3 text-sm text-gray-500">
          All data lives in this browser. Export regularly — clearing browser data wipes everything.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={doExport}>
            Export backup (.json)
          </button>
          <label className="btn-secondary cursor-pointer">
            Restore backup
            <input type="file" accept=".json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} />
          </label>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 font-medium">Example data</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => loadSeed('candle')}>
            Load Ember &amp; Oak Candles
          </button>
          <button className="btn-secondary" onClick={() => loadSeed('bakery')}>
            Load Wawabakes Wonder (bakery)
          </button>
          <button className="btn-danger" onClick={clearData}>
            Clear all data
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-medium">Security note</h2>
        <p className="text-sm text-gray-500">
          CostBook stores data locally on this device with no login. Anyone with access to this
          browser can read it. Multi-device sync with real security is a v2 item.
        </p>
      </section>
    </div>
  );
}
