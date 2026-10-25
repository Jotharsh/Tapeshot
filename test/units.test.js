import test from 'node:test';
import assert from 'node:assert/strict';
import { formatLength, formatPlusMinus, parseLength, toFeetInches, referenceById, REFERENCES } from '../js/units.js';

test('lengths read the way people write them', () => {
  assert.equal(formatLength(180, 'mm'), '180 mm');
  assert.equal(formatLength(42.46, 'mm'), '42.5 mm');
  assert.equal(formatLength(180, 'cm'), '18 cm');
  assert.equal(formatLength(184.2, 'cm'), '18.4 cm');
  assert.equal(formatLength(2345, 'm'), '2.345 m');
  assert.equal(formatLength(254, 'in'), '10 in');
  assert.equal(formatLength(100, 'in'), '3.94 in');
  assert.equal(formatLength(null, 'cm'), '–');
  assert.equal(formatLength(NaN, 'cm'), '–');
});

test('feet and inches, rounded to an eighth', () => {
  assert.equal(toFeetInches(304.8), '1′ 0″');
  assert.equal(toFeetInches(1219.2 + 25.4 * 3.5), '4′ 3½″');
  assert.equal(toFeetInches(25.4 * 0.5), '½″');
  assert.equal(toFeetInches(0), '0″');
  assert.equal(toFeetInches(25.4 * 11.95), '1′ 0″', 'rounds up into the next foot');
});

test('the give-or-take shows a sensible number of digits', () => {
  assert.equal(formatPlusMinus(2.2, 'mm'), '± 2 mm');
  assert.equal(formatPlusMinus(1.4, 'mm'), '± 1.4 mm');
  assert.equal(formatPlusMinus(0.4, 'mm'), '± 0.4 mm');
  assert.equal(formatPlusMinus(2.2, 'cm'), '± 0.2 cm');
  assert.equal(formatPlusMinus(12, 'ftin'), '± 0.5 in');
  assert.equal(formatPlusMinus(120, 'mm'), '± 120 mm');
  assert.equal(formatPlusMinus(null, 'mm'), '');
});

test('typed lengths are understood, in several units, and junk is refused', () => {
  assert.equal(parseLength('210'), 210);
  assert.equal(parseLength('21 cm'), 210);
  assert.equal(parseLength('8.5in'), 215.9);
  assert.equal(parseLength('8,5 in'), 215.9);
  assert.equal(parseLength('1 ft'), 304.8);
  assert.equal(parseLength('5', 'cm'), 50);
  for (const bad of ['', 'abc', '-3', '0', '3 parsecs', '1..2']) assert.equal(parseLength(bad), null, bad);
});

test('references are the real sizes, and custom ones work', () => {
  assert.deepEqual([referenceById('a4').long, referenceById('a4').short], [297, 210]);
  assert.equal(referenceById('nonsense').id, 'a4');
  assert.equal(referenceById('custom', { long: 100, short: 50 }).detail, '100 × 50 mm');
  for (const r of REFERENCES) assert.ok(r.long >= r.short && r.short > 0, r.id);
});

import { parseSize } from '../js/units.js';
test('a typed size is understood either way round, in any unit', () => {
  assert.deepEqual(parseSize('210 x 297'), { long: 297, short: 210 });
  assert.deepEqual(parseSize('297×210 mm'), { long: 297, short: 210 });
  assert.deepEqual(parseSize('8.5 x 11 in'), { long: 279.4, short: 215.9 });
  assert.deepEqual(parseSize('21 by 29,7 cm'), { long: 297, short: 210 });
  assert.deepEqual(parseSize('50 x 100', 'cm'), { long: 1000, short: 500 });
  for (const bad of ['', '210', 'a x b', '0 x 5', '5 x', '-5 x 6']) assert.equal(parseSize(bad), null, bad);
});
