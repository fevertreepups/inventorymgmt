import { describe, it, expect } from 'vitest';
import { parseCSV } from './csv';

// Mirror the importer helpers (kept in Materials.tsx) for unit testing.
const normalizeKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');
function makeFieldGetter(row: Record<string, string>) {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) map.set(normalizeKey(k), v);
  return (aliases: string[]): string => {
    for (const a of aliases) {
      const v = map.get(normalizeKey(a));
      if (v != null && v !== '') return v.trim();
    }
    return '';
  };
}
function num(s: string): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/-?\d*\.?\d+/);
  return m ? Number(m[0]) : 0;
}

describe('CSV import header aliasing', () => {
  it("maps Wawabakes' clean ingredient table", () => {
    const csv =
      'Item,Purchase Price (RM),Qty,Unit,Cost per Unit (Formula)\n' +
      'Lurpak Butter,15.3,250,g,0.0612\n' +
      'Callebaut Choc,114,1000,g,0.114\n';
    const rows = parseCSV(csv);
    const g0 = makeFieldGetter(rows[0]);
    expect(g0(['name', 'item'])).toBe('Lurpak Butter');
    expect(num(g0(['purchaseprice', 'price', 'purchaseprice(rm)']))).toBe(15.3);
    expect(num(g0(['purchaseqty', 'qty']))).toBe(250);
    expect(g0(['purchaseunit', 'unit'])).toBe('g');
    expect(num(g0(['costperbaseunit', 'costperunit', 'costperunit(formula)']))).toBe(0.0612);
  });

  it('extracts numbers from messy cells', () => {
    expect(num('RM 14.90 / 250 g')).toBe(14.9);
    expect(num('1/2 tsp (~2.5 g)')).toBe(1);
    expect(num('125 g')).toBe(125);
    expect(num('1,250')).toBe(1250);
    expect(num('')).toBe(0);
  });
});
