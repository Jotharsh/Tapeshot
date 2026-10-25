// Units and the reference objects. Everything is stored in millimetres; units are only for showing.

/** Reference objects that are the same size everywhere. [long side, short side] in mm. */
export const REFERENCES = [
  { id: 'a4', name: 'A4 paper', detail: '297 × 210 mm', long: 297, short: 210 },
  { id: 'letter', name: 'US Letter paper', detail: '11 × 8.5 in', long: 279.4, short: 215.9 },
  { id: 'a5', name: 'A5 paper', detail: '210 × 148 mm', long: 210, short: 148 },
  { id: 'card', name: 'Bank or ID card', detail: '85.6 × 54 mm', long: 85.6, short: 53.98 },
  { id: 'index', name: 'Index card', detail: '5 × 3 in', long: 127, short: 76.2 },
  { id: 'a3', name: 'A3 paper', detail: '420 × 297 mm', long: 420, short: 297 },
];

export const UNITS = [
  { id: 'mm', name: 'Millimetres' },
  { id: 'cm', name: 'Centimetres' },
  { id: 'm', name: 'Metres' },
  { id: 'in', name: 'Inches' },
  { id: 'ftin', name: 'Feet and inches' },
];

export const MM_PER = { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 };

const trim = (n, d) => { const t = n.toFixed(d); return t.includes('.') ? t.replace(/\.?0+$/, '') : t; };   // 180 stays 180, 12.50 becomes 12.5

const FRACTIONS = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'];

/** 1234 mm becomes 4′ ½″, rounded to the nearest eighth of an inch. */
export function toFeetInches(mm) {
  const eighths = Math.round(Math.abs(mm) / 25.4 * 8);
  const feet = Math.floor(eighths / 96), rest = eighths - feet * 96;
  const inches = Math.floor(rest / 8), frac = rest % 8;
  const inchText = `${inches || (frac ? '' : '0')}${FRACTIONS[frac]}`;
  return `${feet ? `${feet}′ ` : ''}${inchText}″`.replace(/\s+/g, ' ').trim();
}

/** A length for people: "12.3 cm", "4′ 3½″". */
export function formatLength(mm, unit = 'cm') {
  if (mm == null || !Number.isFinite(mm)) return '–';
  switch (unit) {
    case 'mm': return `${trim(mm, Math.abs(mm) < 100 ? 1 : 0)} mm`;
    case 'cm': return `${trim(mm / 10, 1)} cm`;
    case 'm': return `${trim(mm / 1000, 3)} m`;
    case 'in': return `${trim(mm / 25.4, 2)} in`;
    case 'ftin': return toFeetInches(mm);
    default: return `${trim(mm, 1)} mm`;
  }
}

/** The "give or take" part, in the same unit, to one or two meaningful digits (an estimate has no more than that). */
export function formatPlusMinus(mm, unit = 'cm') {
  if (mm == null || !Number.isFinite(mm)) return '';
  const u = unit === 'ftin' ? 'in' : unit;
  const value = mm / MM_PER[u];
  if (value >= 9.5) return `± ${Math.round(value)} ${u}`;
  const lead = Number(value.toExponential().split('e')[0].replace('.', '')[0]);        // first digit; 1 gets a second digit ("1.4")
  const digits = Math.max(0, (lead === 1 ? 1 : 0) - Math.floor(Math.log10(value)));
  return `± ${trim(value, digits)} ${u}`;
}

/** Reads a length someone typed, like "210", "8.5in" or "21 cm", into mm. `fallbackUnit` is used when no unit is typed. */
export function parseLength(text, fallbackUnit = 'mm') {
  const m = String(text).trim().toLowerCase().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|"|ft|feet|')?$/);
  if (!m) return null;
  const unit = { inch: 'in', inches: 'in', '"': 'in', feet: 'ft', "'": 'ft' }[m[2]] ?? m[2] ?? fallbackUnit;
  const mm = Math.round(Number(m[1]) * (MM_PER[unit] ?? 1) * 100) / 100;      // hundredths of a mm is plenty, and hides float dust
  return mm > 0 && Number.isFinite(mm) ? mm : null;
}

export function referenceById(id, custom) {
  if (id === 'custom' && custom) return { id: 'custom', name: 'Your own', detail: `${trim(custom.long, 1)} × ${trim(custom.short, 1)} mm`, long: custom.long, short: custom.short };
  return REFERENCES.find((r) => r.id === id) ?? REFERENCES[0];
}

/** Reads a size someone typed, like "210 x 297", "8.5 x 11 in" or "21 by 29.7 cm", into { long, short } in mm. */
export function parseSize(text, fallbackUnit = 'mm') {
  const m = String(text).trim().toLowerCase().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|"|ft)?\s*(?:x|×|by|\*)\s*(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|inches|"|ft)?$/);
  if (!m) return null;
  const unitOf = (u) => ({ inch: 'in', inches: 'in', '"': 'in' }[u] ?? u);
  const shared = unitOf(m[4]) ?? unitOf(m[2]) ?? fallbackUnit;           // "8.5 x 11 in": the unit at the end covers both numbers
  const a = Math.round(Number(m[1]) * MM_PER[unitOf(m[2]) ?? shared] * 100) / 100;
  const b = Math.round(Number(m[3]) * MM_PER[unitOf(m[4]) ?? shared] * 100) / 100;
  if (!(a > 0) || !(b > 0)) return null;
  return { long: Math.max(a, b), short: Math.min(a, b) };
}
