import { useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { useConfig } from './config';
import { loadCandleSeed, loadBakerySeed } from './db/seed';
import { Modal } from './components/ui';
import Dashboard from './pages/Dashboard';
import Materials from './pages/Materials';
import Products from './pages/Products';
import Sales from './pages/Sales';
import Expenses from './pages/Expenses';
import Forecast from './pages/Forecast';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/materials', label: 'materialPlural' },
  { to: '/products', label: 'productPlural' },
  { to: '/sales', label: 'Sales' },
  { to: '/expenses', label: 'Expenses' },
  { to: '/forecast', label: 'Forecast' },
  { to: '/reports', label: 'Reports' },
  { to: '/settings', label: 'Settings' },
];

export default function App() {
  const { config, reload } = useConfig();
  const [menuOpen, setMenuOpen] = useState(false);

  const counts = useLiveQuery(async () => {
    const [m, p, s, e] = await Promise.all([
      db.materials.count(),
      db.products.count(),
      db.sales.count(),
      db.expenses.count(),
    ]);
    const seenWelcome = (await db.meta.get('seenWelcome'))?.value === '1';
    return { total: m + p + s + e, seenWelcome };
  });

  const showWelcome = counts && counts.total === 0 && !counts.seenWelcome;

  const dismissWelcome = async () => {
    await db.meta.put({ key: 'seenWelcome', value: '1' });
    await reload();
  };

  const loadSeed = async (which: 'candle' | 'bakery') => {
    if (which === 'candle') await loadCandleSeed();
    else await loadBakerySeed();
    await db.meta.put({ key: 'seenWelcome', value: '1' });
    await reload();
  };

  const label = (l: string) =>
    l in config.vocabulary ? (config.vocabulary as any)[l] : l;

  return (
    <div className="min-h-screen lg:flex">
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 border-r border-gray-200 bg-white lg:block">
        <div className="px-5 py-4">
          <p className="text-lg font-bold" style={{ color: 'var(--brand-primary)' }}>
            CostBook
          </p>
          <p className="truncate text-xs text-gray-500">{config.businessName}</p>
        </div>
        <nav className="flex flex-col gap-1 px-2">
          {navItems.map((n) => (
            <NavItem key={n.to} to={n.to} end={n.end} label={label(n.label)} />
          ))}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
        <p className="font-bold" style={{ color: 'var(--brand-primary)' }}>
          CostBook
        </p>
        <button className="btn-secondary" onClick={() => setMenuOpen((v) => !v)}>
          Menu
        </button>
      </div>
      {menuOpen && (
        <nav className="flex flex-col gap-1 border-b border-gray-200 bg-white px-2 py-2 lg:hidden">
          {navItems.map((n) => (
            <NavItem key={n.to} to={n.to} end={n.end} label={label(n.label)} onClick={() => setMenuOpen(false)} />
          ))}
        </nav>
      )}

      <main className="flex-1 p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/products" element={<Products />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>

      <Modal open={!!showWelcome} title="Welcome to CostBook" onClose={dismissWelcome}>
        <p className="text-sm text-gray-600">
          CostBook is an inventory, costing and growth tool for small product businesses. Load an
          example to explore, or start with an empty book.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button className="card text-left hover:shadow-md" onClick={() => loadSeed('candle')}>
            <p className="font-medium">Ember &amp; Oak Candles</p>
            <p className="text-xs text-gray-500">Direct-yield example (1 pour = 12 candles).</p>
          </button>
          <button className="card text-left hover:shadow-md" onClick={() => loadSeed('bakery')}>
            <p className="font-medium">Wawabakes Wonder</p>
            <p className="text-xs text-gray-500">By-weight example with Ingredient/Recipe/Bake labels.</p>
          </button>
        </div>
        <div className="mt-4 text-right">
          <button className="btn-secondary" onClick={dismissWelcome}>
            Start empty
          </button>
        </div>
      </Modal>
    </div>
  );
}

function NavItem({
  to,
  label,
  end,
  onClick,
}: {
  to: string;
  label: string;
  end?: boolean;
  onClick?: () => void;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `rounded-lg px-3 py-2 text-sm font-medium ${
          isActive ? 'text-white' : 'text-gray-600 hover:bg-gray-100'
        }`
      }
      style={({ isActive }) => (isActive ? { backgroundColor: 'var(--brand-primary)' } : {})}
    >
      {label}
    </NavLink>
  );
}
