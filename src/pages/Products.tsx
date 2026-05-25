import { useState } from 'react';
import { db } from '../db/db';
import { useConfig } from '../config';
import { useMaterials, useMaterialMap, useProducts } from '../hooks';
import { computeProductCosting, marginForPrice, priceForMargin, sumLineItemsForOutput } from '../lib/costing';
import { produceBatch, checkBatchStock, type BatchShortfall } from '../db/operations';
import { Modal, EmptyState, Field, confirmDialog } from '../components/ui';
import { Header } from './Materials';
import { formatCurrency, formatQty } from '../lib/format';
import type { Product, LineItem, BatchOverhead } from '../types';

const blankProduct = (): Product => ({
  name: '',
  yieldMode: 'direct',
  unitsPerBatch: 1,
  batchOutputQty: 0,
  outputPerUnit: 0,
  batchOutputUnit: 'g',
  lineItems: [],
  batchOverheads: [],
  packagingCostPerUnit: 0,
});

export default function Products() {
  const { config } = useConfig();
  const v = config.vocabulary;
  const products = useProducts();
  const materialMap = useMaterialMap();
  const [editing, setEditing] = useState<Product | null>(null);
  const [produceFor, setProduceFor] = useState<Product | null>(null);

  const remove = async (p: Product) => {
    if (!confirmDialog(`Delete ${p.name}?`)) return;
    await db.products.delete(p.id!);
  };

  return (
    <div>
      <Header
        title={v.productPlural}
        actions={
          <button className="btn-primary" onClick={() => setEditing(blankProduct())}>
            + Add {v.product}
          </button>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          title={`No ${v.productPlural.toLowerCase()} yet`}
          hint={`Build your first ${v.product.toLowerCase()} from your ${v.materialPlural.toLowerCase()} to see its true cost per unit.`}
          action={
            <button className="btn-primary" onClick={() => setEditing(blankProduct())}>
              + Add {v.product}
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {products.map((p) => {
            const c = computeProductCosting(p, materialMap, config);
            const target = p.targetMarginPct ?? config.defaultTargetMarginPct;
            const belowTarget = c.actualMargin != null && c.actualMargin * 100 < target;
            return (
              <div key={p.id} className="card">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-500">
                      {p.yieldMode === 'direct' ? 'Direct yield' : 'By weight'} · {formatQty(c.unitsPerBatch)} units/{v.productionRun.toLowerCase()}
                    </p>
                  </div>
                  <div className="flex gap-1 text-xs">
                    <button className="btn-secondary px-2 py-1" onClick={() => setProduceFor(p)}>
                      Produce
                    </button>
                    <button className="btn-secondary px-2 py-1" onClick={() => setEditing(p)}>
                      Edit
                    </button>
                    <button className="btn-danger px-2 py-1" onClick={() => remove(p)}>
                      Delete
                    </button>
                  </div>
                </div>
                <dl className="mt-3 space-y-1 text-sm">
                  <Row label="Material cost / batch" value={formatCurrency(c.materialCostPerBatch, config)} />
                  <Row label="Overheads / batch" value={formatCurrency(c.overheadCostPerBatch, config)} />
                  <Row label="Total batch cost" value={formatCurrency(c.totalBatchCost, config)} />
                  <Row label="Cost / unit" value={formatCurrency(c.costPerUnit, config)} />
                  <Row label="+ packaging" value={formatCurrency(p.packagingCostPerUnit, config)} />
                  <Row label="True cost / unit" value={formatCurrency(c.trueCostPerUnit, config)} bold />
                  <Row label={`Suggested @ ${target}%`} value={formatCurrency(c.suggestedPrice, config)} />
                  {p.sellPrice != null && (
                    <Row
                      label={`Your price ${formatCurrency(p.sellPrice, config)} → margin`}
                      value={`${(c.actualMargin! * 100).toFixed(1)}%`}
                      tone={belowTarget ? 'bad' : 'good'}
                    />
                  )}
                </dl>
                {c.lineCosts.some((l) => l.missing) && (
                  <p className="mt-2 text-xs text-red-600">Warning: a line item references a missing {v.material.toLowerCase()}.</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && <ProductEditor product={editing} onClose={() => setEditing(null)} />}
      {produceFor && <ProduceModal product={produceFor} onClose={() => setProduceFor(null)} />}
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'good' | 'bad' }) {
  const toneClass = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : '';
  return (
    <div className={`flex justify-between ${bold ? 'border-t border-gray-100 pt-1 font-semibold' : ''}`}>
      <dt className="text-gray-500">{label}</dt>
      <dd className={toneClass}>{value}</dd>
    </div>
  );
}

function ProductEditor({ product, onClose }: { product: Product; onClose: () => void }) {
  const { config } = useConfig();
  const v = config.vocabulary;
  const materials = useMaterials();
  const materialMap = useMaterialMap();
  const [p, setP] = useState<Product>(product);
  const [priceInput, setPriceInput] = useState<string>(product.sellPrice?.toString() ?? '');

  const costing = computeProductCosting(p, materialMap, config);

  const addLine = () => {
    const first = materials[0];
    if (!first) return;
    setP({ ...p, lineItems: [...p.lineItems, { materialId: first.id!, amountUsed: 0, unit: first.purchaseUnit }] });
  };
  const updateLine = (i: number, patch: Partial<LineItem>) => {
    const items = [...p.lineItems];
    items[i] = { ...items[i], ...patch };
    setP({ ...p, lineItems: items });
  };
  const removeLine = (i: number) => setP({ ...p, lineItems: p.lineItems.filter((_, j) => j !== i) });

  const addOverhead = () => setP({ ...p, batchOverheads: [...p.batchOverheads, { label: 'Labour', hours: 0, rateType: 'labour' }] });
  const updateOverhead = (i: number, patch: Partial<BatchOverhead>) => {
    const items = [...p.batchOverheads];
    items[i] = { ...items[i], ...patch };
    setP({ ...p, batchOverheads: items });
  };
  const removeOverhead = (i: number) => setP({ ...p, batchOverheads: p.batchOverheads.filter((_, j) => j !== i) });

  const autoSumOutput = () => {
    setP({ ...p, batchOutputQty: sumLineItemsForOutput(p, materialMap) });
  };

  const save = async () => {
    const sell = priceInput.trim() === '' ? undefined : Number(priceInput);
    const toSave = { ...p, sellPrice: sell };
    if (toSave.id == null) await db.products.add(toSave);
    else await db.products.update(toSave.id, toSave);
    onClose();
  };

  const setTargetFromPrice = () => {
    if (!priceInput) return;
    setP({ ...p, targetMarginPct: Math.round(marginForPrice(Number(priceInput), costing.trueCostPerUnit) * 100) });
  };
  const setPriceFromTarget = () => {
    const target = p.targetMarginPct ?? config.defaultTargetMarginPct;
    setPriceInput(priceForMargin(costing.trueCostPerUnit, target).toFixed(2));
  };

  return (
    <Modal open title={`${p.id == null ? 'Add' : 'Edit'} ${v.product}`} onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Name">
            <input className="input" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} />
          </Field>

          <Field label="Yield mode">
            <select
              className="input"
              value={p.yieldMode}
              onChange={(e) => setP({ ...p, yieldMode: e.target.value as Product['yieldMode'] })}
            >
              <option value="direct">Direct count (1 batch = N units)</option>
              <option value="byWeight">By weight/volume (divide output)</option>
            </select>
          </Field>

          {p.yieldMode === 'direct' ? (
            <Field label={`Units per ${v.productionRun.toLowerCase()}`}>
              <input type="number" className="input" value={p.unitsPerBatch ?? 0} onChange={(e) => setP({ ...p, unitsPerBatch: Number(e.target.value) })} />
            </Field>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Field label="Batch output">
                <input type="number" className="input" value={p.batchOutputQty ?? 0} onChange={(e) => setP({ ...p, batchOutputQty: Number(e.target.value) })} />
              </Field>
              <Field label="Unit">
                <select className="input" value={p.batchOutputUnit} onChange={(e) => setP({ ...p, batchOutputUnit: e.target.value })}>
                  {config.units.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
              <Field label="Per unit">
                <input type="number" className="input" value={p.outputPerUnit ?? 0} onChange={(e) => setP({ ...p, outputPerUnit: Number(e.target.value) })} />
              </Field>
              <div className="col-span-3">
                <button className="btn-secondary w-full" onClick={autoSumOutput}>
                  Auto-sum output from line items
                </button>
              </div>
            </div>
          )}

          <Field label="Packaging cost / unit">
            <input type="number" className="input" value={p.packagingCostPerUnit} onChange={(e) => setP({ ...p, packagingCostPerUnit: Number(e.target.value) })} />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Target margin %">
              <input type="number" className="input" value={p.targetMarginPct ?? config.defaultTargetMarginPct} onChange={(e) => setP({ ...p, targetMarginPct: Number(e.target.value) })} />
            </Field>
            <Field label="Your sell price">
              <input type="number" className="input" value={priceInput} onChange={(e) => setPriceInput(e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary flex-1 text-xs" onClick={setPriceFromTarget}>
              Suggest price ←
            </button>
            <button className="btn-secondary flex-1 text-xs" onClick={setTargetFromPrice}>
              → Margin from price
            </button>
          </div>
        </div>

        {/* Line items + overheads + live costing */}
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">{v.material} line items</span>
              <button className="text-xs text-brand underline" onClick={addLine}>
                + add
              </button>
            </div>
            {materials.length === 0 && <p className="text-xs text-gray-400">Add {v.materialPlural.toLowerCase()} first.</p>}
            <div className="space-y-2">
              {p.lineItems.map((li, i) => (
                <div key={i} className="flex gap-1">
                  <select className="input flex-1" value={li.materialId} onChange={(e) => updateLine(i, { materialId: Number(e.target.value) })}>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" className="input w-20" value={li.amountUsed} onChange={(e) => updateLine(i, { amountUsed: Number(e.target.value) })} />
                  <select className="input w-24" value={li.unit} onChange={(e) => updateLine(i, { unit: e.target.value })}>
                    {config.units.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <button className="btn-secondary px-2" onClick={() => removeLine(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="label mb-0">Batch overheads</span>
              <button className="text-xs text-brand underline" onClick={addOverhead}>
                + add
              </button>
            </div>
            <div className="space-y-2">
              {p.batchOverheads.map((o, i) => (
                <div key={i} className="flex gap-1">
                  <input className="input flex-1" value={o.label} onChange={(e) => updateOverhead(i, { label: e.target.value })} />
                  <select
                    className="input w-28"
                    value={o.rateType ?? 'fixed'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'fixed') updateOverhead(i, { rateType: undefined, hours: undefined, cost: o.cost ?? 0 });
                      else updateOverhead(i, { rateType: val as 'labour' | 'machine', cost: undefined, hours: o.hours ?? 0 });
                    }}
                  >
                    <option value="fixed">fixed</option>
                    <option value="labour">labour/hr</option>
                    <option value="machine">machine/hr</option>
                  </select>
                  <input
                    type="number"
                    className="input w-20"
                    value={o.rateType ? o.hours ?? 0 : o.cost ?? 0}
                    onChange={(e) =>
                      o.rateType ? updateOverhead(i, { hours: Number(e.target.value) }) : updateOverhead(i, { cost: Number(e.target.value) })
                    }
                  />
                  <button className="btn-secondary px-2" onClick={() => removeOverhead(i)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              Labour @ {formatCurrency(config.labourRatePerHour, config)}/hr · Machine @ {formatCurrency(config.machineRatePerHour, config)}/hr
            </p>
          </div>

          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="mb-1 font-medium">Live cost breakdown</p>
            <Row label="Material / batch" value={formatCurrency(costing.materialCostPerBatch, config)} />
            <Row label="Overheads / batch" value={formatCurrency(costing.overheadCostPerBatch, config)} />
            <Row label="Total batch cost" value={formatCurrency(costing.totalBatchCost, config)} />
            <Row label={`Units / ${v.productionRun.toLowerCase()}`} value={formatQty(costing.unitsPerBatch)} />
            <Row label="True cost / unit" value={formatCurrency(costing.trueCostPerUnit, config)} bold />
            <Row label="Suggested price" value={formatCurrency(costing.suggestedPrice, config)} />
            {costing.actualMargin != null && <Row label="Actual margin" value={`${(costing.actualMargin * 100).toFixed(1)}%`} />}
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={!p.name}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function ProduceModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const { config } = useConfig();
  const v = config.vocabulary;
  const [multiplier, setMultiplier] = useState(1);
  const [wasted, setWasted] = useState(0);
  const [shortfalls, setShortfalls] = useState<BatchShortfall[] | null>(null);
  const [checked, setChecked] = useState(false);

  const check = async () => {
    setShortfalls(await checkBatchStock(product, multiplier));
    setChecked(true);
  };

  const confirm = async () => {
    await produceBatch(product, config, { batchMultiplier: multiplier, unitsWasted: wasted });
    onClose();
  };

  return (
    <Modal open title={`Produce ${v.productionRun} — ${product.name}`} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Batch multiplier">
          <select className="input" value={multiplier} onChange={(e) => { setMultiplier(Number(e.target.value)); setChecked(false); }}>
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={3}>3×</option>
          </select>
        </Field>
        <Field label="Units wasted (optional)">
          <input type="number" className="input" value={wasted} onChange={(e) => setWasted(Number(e.target.value))} />
        </Field>
      </div>

      {!checked ? (
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={check}>
            Check stock
          </button>
        </div>
      ) : (
        <>
          {shortfalls && shortfalls.length > 0 ? (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <p className="font-medium">Insufficient stock — these will go negative:</p>
              <ul className="mt-1 list-disc pl-5">
                {shortfalls.map((s) => (
                  <li key={s.materialId}>
                    {s.name}: need {formatQty(s.needed)}, have {formatQty(s.available)} →{' '}
                    <span className="font-semibold">{formatQty(s.resultingStock)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs">You can still proceed if you have un-logged stock.</p>
            </div>
          ) : (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Stock is sufficient.</p>
          )}
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={confirm}>
              {shortfalls && shortfalls.length > 0 ? 'Proceed anyway' : 'Confirm production'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
