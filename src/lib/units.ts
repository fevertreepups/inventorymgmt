// Unit conversion within a measurement family. Discrete counts do not convert.
// Factors are expressed relative to a base unit per family.

type Family = 'mass' | 'volume' | 'length';

const FACTORS: Record<string, { family: Family; toBase: number }> = {
  // mass, base = gram
  g: { family: 'mass', toBase: 1 },
  kg: { family: 'mass', toBase: 1000 },
  // volume, base = millilitre
  ml: { family: 'volume', toBase: 1 },
  l: { family: 'volume', toBase: 1000 },
  tsp: { family: 'volume', toBase: 5 },
  tbsp: { family: 'volume', toBase: 15 },
  // length, base = centimetre
  cm: { family: 'length', toBase: 1 },
  metre: { family: 'length', toBase: 100 },
  m: { family: 'length', toBase: 100 },
};

export function unitFamily(unit: string): Family | null {
  return FACTORS[unit]?.family ?? null;
}

export function canConvert(from: string, to: string): boolean {
  if (from === to) return true;
  const a = FACTORS[from];
  const b = FACTORS[to];
  return !!a && !!b && a.family === b.family;
}

/**
 * Convert an amount between units in the same measurement family.
 * Throws if units belong to different families or are unknown discrete units.
 */
export function convert(amount: number, from: string, to: string): number {
  if (from === to) return amount;
  const a = FACTORS[from];
  const b = FACTORS[to];
  if (!a || !b) {
    throw new Error(`Cannot convert between "${from}" and "${to}" (discrete or unknown unit)`);
  }
  if (a.family !== b.family) {
    throw new Error(`Cannot convert ${a.family} unit "${from}" to ${b.family} unit "${to}"`);
  }
  return (amount * a.toBase) / b.toBase;
}
