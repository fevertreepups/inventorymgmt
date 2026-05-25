import { describe, it, expect } from 'vitest';
import { convert, canConvert, unitFamily } from './units';

describe('unit conversion', () => {
  it('converts mass g<->kg', () => {
    expect(convert(2.4, 'kg', 'g')).toBe(2400);
    expect(convert(500, 'g', 'kg')).toBe(0.5);
  });

  it('converts volume ml<->l and spoons', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(convert(1, 'tbsp', 'ml')).toBe(15);
    expect(convert(1, 'tsp', 'ml')).toBe(5);
  });

  it('converts length m<->cm', () => {
    expect(convert(1, 'metre', 'cm')).toBe(100);
    expect(convert(250, 'cm', 'metre')).toBe(2.5);
  });

  it('returns same value for identical units', () => {
    expect(convert(7, 'piece', 'piece')).toBe(7);
  });

  it('throws across families', () => {
    expect(() => convert(1, 'g', 'ml')).toThrow();
  });

  it('throws for discrete units', () => {
    expect(() => convert(1, 'piece', 'g')).toThrow();
  });

  it('canConvert reflects families', () => {
    expect(canConvert('g', 'kg')).toBe(true);
    expect(canConvert('g', 'ml')).toBe(false);
    expect(canConvert('piece', 'piece')).toBe(true);
    expect(canConvert('piece', 'g')).toBe(false);
  });

  it('reports families', () => {
    expect(unitFamily('g')).toBe('mass');
    expect(unitFamily('ml')).toBe('volume');
    expect(unitFamily('piece')).toBeNull();
  });
});
