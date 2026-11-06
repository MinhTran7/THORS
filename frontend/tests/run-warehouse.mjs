// Pure-logic checks for the purchase-order Excel import (no browser, no backend, no database).
import assert from 'node:assert/strict';
import { checkImport, inferMapping } from '../src/features/warehouse/excelImport.js';

const variants = [
  { detail_id: 1, product_id: 10, product_name: 'Áo thun', color: 'Đen', size: 'M' },
  { detail_id: 2, product_id: 10, product_name: 'Áo thun', color: 'Đen', size: 'L' },
  { detail_id: 3, product_id: 11, product_name: 'Quần jean', color: 'Xanh', size: '30' }
];
const mapping = { ...inferMapping([]), productName: '0', color: '1', size: '2', quantity: '3', unitPrice: '4' };
const rows = (...data) => data.map((cells, i) => ({ rowNumber: i + 2, cells }));
const check = (input, options = {}) =>
  checkImport(input, mapping, { type: 'PURCHASE_ORDER', variants, currentItems: [], ...options });

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`✓ ${name}`);
};

test('rows match variants by name/color/size (case/space-insensitive, accents kept)', () => {
  const r = check(rows(['Áo thun', 'Đen', 'M', '10', '50000'], ['QUẦN  jean', 'xanh', '30', '5', '70000']));
  assert.equal(r.valid, true);
  assert.deepEqual(
    r.items.map((i) => [i.detailId, i.quantity, i.unitPrice]),
    [
      [1, 10, 50000],
      [3, 5, 70000]
    ]
  );
});

test('unknown goods are reported per row instead of being created', () => {
  const r = check(rows(['Áo mới', 'Đỏ', 'M', '3', '1000']));
  assert.equal(r.valid, false);
  assert.match(r.rows[0].errors[0], /Không khớp/);
});

test('duplicate rows in the file are not summed silently', () => {
  const dup = rows(['Áo thun', 'Đen', 'M', '10', '50000'], ['Áo thun', 'Đen', 'M', '5', '50000']);
  assert.equal(check(dup).valid, false);
  const merged = check(dup, { mergeDuplicates: true });
  assert.equal(merged.valid, true);
  assert.equal(merged.items[0].quantity, 15);
});

test('merging duplicates with different prices requires a decision', () => {
  const r = check(rows(['Áo thun', 'Đen', 'M', '10', '50000'], ['Áo thun', 'Đen', 'M', '5', '48000']), { mergeDuplicates: true });
  assert.equal(r.valid, false);
  assert.ok(r.rows[0].errors.some((e) => /đơn giá khác nhau/.test(e)));
});

test('Excel combined with hand-picked lines asks how to treat overlaps', () => {
  const currentItems = [
    { detailId: 1, quantity: 4, unitPrice: 50000 },
    { detailId: 2, quantity: 6, unitPrice: 52000 }
  ];
  const input = rows(['Áo thun', 'Đen', 'M', '10', '50000'], ['Quần jean', 'Xanh', '30', '5', '70000']);
  const undecided = check(input, { currentItems });
  assert.equal(undecided.valid, false);
  assert.equal(undecided.conflicts, 1);

  const replaced = check(input, { currentItems, existingMode: 'replace' });
  assert.equal(replaced.valid, true);
  assert.deepEqual(
    replaced.items.map((i) => [i.detailId, i.quantity]),
    [
      [1, 10],
      [2, 6],
      [3, 5]
    ]
  );

  const added = check(input, { currentItems, existingMode: 'add' });
  assert.equal(added.items.find((i) => i.detailId === 1).quantity, 14);

  const kept = check(input, { currentItems, existingMode: 'keep' });
  assert.equal(kept.items.find((i) => i.detailId === 1).quantity, 4);
  assert.equal(kept.items.length, 3);
});

test('adding to an existing line with another price needs an explicit price choice', () => {
  const currentItems = [{ detailId: 1, quantity: 4, unitPrice: 50000 }];
  const input = rows(['Áo thun', 'Đen', 'M', '10', '45000']);
  const undecided = check(input, { currentItems, existingMode: 'add' });
  assert.equal(undecided.valid, false);
  assert.equal(undecided.priceConflicts, 1);
  const keepPrice = check(input, { currentItems, existingMode: 'add', priceMode: 'current' });
  assert.deepEqual([keepPrice.items[0].quantity, keepPrice.items[0].unitPrice], [14, 50000]);
  const filePrice = check(input, { currentItems, existingMode: 'add', priceMode: 'file' });
  assert.equal(filePrice.items[0].unitPrice, 45000);
});

test('receipt import cannot exceed the remaining quantity of the order line', () => {
  const sourceItems = [{ receipt_item_id: 7, detail_id: 1, quantity: 100, handled_quantity: 60, unit_price: 50000 }];
  const r = checkImport(rows(['Áo thun', 'Đen', 'M', '50']), mapping, { type: 'RECEIPT', variants, sourceItems, currentItems: [] });
  assert.equal(r.valid, false);
  assert.match(r.rows[0].errors.join(' '), /vượt phần còn được nhập/);
  const ok = checkImport(rows(['Áo thun', 'Đen', 'M', '40']), mapping, { type: 'RECEIPT', variants, sourceItems, currentItems: [] });
  assert.equal(ok.valid, true);
  assert.equal(ok.items[0].unitPrice, 50000, 'receipt price comes from the order line');
});

console.log(`\n${passed} warehouse import checks passed.`);
