# CostBook

An inventory, unit-costing, accounting and growth-forecasting app for any small
product-based business that turns purchased materials into finished products —
home bakeries, candle makers, soap makers, jewellery makers, screen printers,
ceramicists, woodworkers, and more.

**85% replicable, 15% bespoke.** The costing engine, inventory, dashboard,
accounting and forecasting are identical for every business. The bespoke 15% —
branding, currency, units, rates, tax, categories, and the *vocabulary itself*
("Materials/Products" vs "Ingredients/Recipes") — is all driven by a single
`config.json`. You never fork the code to deploy for a new client.

It is **local-first**: a static site backed by IndexedDB (via Dexie). No server,
no login, no paid APIs. Clone, install, run.

---

## Quick start

```bash
git clone <repo>
cd inventorymgmt
npm install
npm run dev        # http://localhost:5173
```

On first run a welcome screen lets you load one of two example businesses or
start empty. Build for production with:

```bash
npm run build      # outputs static bundle to dist/
npm run preview    # preview the production build
npm test           # run the unit test suite
```

## Deploy (no env setup needed)

`npm run build` produces a static `dist/` deployable to:

- **Vercel** — `vercel.json` already provides the SPA rewrite.
- **Netlify / Cloudflare Pages** — `public/_redirects` provides the SPA fallback.

Set the build command to `npm run build` and the publish directory to `dist`.

## Rebrand & re-vocabulary for a new business (under 10 steps)

Do this entirely in the **Settings** screen (saved to the browser), or by editing
`public/config.json` before deploying:

1. Set `businessName`.
2. Set `currency` and `currencySymbolPosition` (`before`/`after`).
3. Set `labourRatePerHour` and `machineRatePerHour` (machine = electricity / kiln / equipment time).
4. Set `defaultTargetMarginPct` and `taxRatePct`.
5. Edit the `units`, `materialCategories`, `expenseCategories`, `salesChannels` lists.
6. Set the `vocabulary` map — e.g. a bakery uses `material: "Ingredient"`,
   `product: "Recipe"`, `productionRun: "Bake"`. Every user-facing label follows this map.
7. Set `theme.primary` / `theme.accent` colours and `logoPath`.
8. Clear seed data ("Clear all data" in Settings) and add your own, or import a CSV.

No code changes. The app relabels itself across every screen.

## CSV import

On the Materials/Ingredients screen, **Import CSV**. Expected columns (header row):

```
name,category,purchasePrice,purchaseQty,purchaseUnit,costPerBaseUnit,stockOnHand,reorderThreshold,supplier
```

`costPerBaseUnit` is optional — if omitted it is computed as `purchasePrice / purchaseQty`.
Every table also has **Export CSV** so you are never locked in.

## Backup & restore

Local-first means clearing your browser data wipes everything, so backups matter.

- **Settings → Export backup** dumps all data + config to one timestamped `.json`.
- **Settings → Restore backup** loads a `.json` (with a confirm — it replaces current data).
- The dashboard shows a reminder if you haven't backed up in 30 days.

## Two costing rules (plain language)

**Weighted-average restocking.** When you restock a material, the cost per unit is
*not* overwritten with the new price. It is blended with what you already hold:

```
newCost = (stockOnHand * oldCost + restockQty * restockCost) / (stockOnHand + restockQty)
```

So buying 5kg of wax at a higher price when you already hold 8kg nudges the average
up gradually, instead of jumping. If stock is zero, the new cost is simply the
restock cost.

**Live cost vs. frozen history.** Product costing screens always recompute from
*today's* material prices, so you see your true current cost. But logged **sales**
and **production runs** snapshot their cost at the moment they happen and never
change. If wax gets pricier next month, last month's recorded profit stays put.
Past is frozen; present is live.

## Yield modes

A product computes `unitsPerBatch` from one of two modes; the costing engine is
mode-agnostic downstream:

- **Direct count** — you enter `unitsPerBatch` directly (one pour = 12 candles).
- **By weight/volume** — you enter `batchOutputQty` + `outputPerUnit`; units =
  output ÷ per-unit (e.g. 2400g of dough ÷ 200g = 12 cookie jars). The output can
  be auto-summed from line items.

## Forecasting

The growth forecast starts from an explicit **baseline** you pick: last completed
month, a trailing 3-month average (default), or a manual figure — always shown
with its value. You set monthly growth %, a 3/6/12-month horizon, and optional
per-month seasonality. Outputs: projected revenue, COGS, gross profit, tax, net
profit, projected material demand, and projected restock spend, plus a transparent
break-even calculator (fixed costs ÷ contribution margin). Formulas are shown, no
black box.

## Tech

React + Vite + TypeScript + Tailwind, Dexie (IndexedDB), Recharts, Vitest.
All money/quantity values are stored at full precision and rounded only on display
(`roundForDisplay` / `formatCurrency`).

## Tests

`npm test` covers unit conversion, costing maths, margin calc, weighted-average
restock, both yield modes, forecast projection & break-even, and the cost-snapshot
rule (a material price change must not alter a past sale's COGS).

## Security note

CostBook has no login. Data is stored unencrypted in the browser on the device;
anyone with the device can read it via devtools. A PIN over IndexedDB would be
cosmetic only, so v1 ships without one. Real multi-device security is v2.

## v2 roadmap (deliberately not built — protects replicability & deploy speed)

- Multi-user accounts and roles
- Multi-device sync with real authentication/encryption
- Supplier purchase orders and invoice tracking
- Barcode scanning
- Online-store / payment integrations
- Jurisdiction-specific tax-filing exports
- Customer CRM / repeat-order tracking
