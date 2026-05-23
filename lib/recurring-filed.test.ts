import assert from 'node:assert/strict';

import {
  monthKey,
  filedMarkKey,
  getFiled,
  isFiled,
  setFiled,
  clearFiled,
  filedTxIds,
  type FiledMarks,
} from './recurring-filed.ts';

/**
 * Run with:  npm test
 * (node --experimental-strip-types lib/recurring-filed.test.ts)
 *
 * Covers the "filed this month" marker logic behind the monthly report's
 * variable-bill rows — the double-fill guard and the txId tracking used to
 * keep filed bills out of the "this month" list.
 */

let passed = 0;
function test(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

const may = new Date(2026, 4, 24); // 2026-05-24 (month index 4 = May)
const june = new Date(2026, 5, 1); // 2026-06-01

test('monthKey is zero-padded YYYY-MM', () => {
  assert.equal(monthKey(may), '2026-05');
  assert.equal(monthKey(new Date(2026, 0, 9)), '2026-01');
  assert.equal(monthKey(new Date(2026, 11, 31)), '2026-12');
});

test('filedMarkKey combines rule id + month', () => {
  assert.equal(filedMarkKey('rule-1', may), 'rule-1|2026-05');
});

test('empty marks → not filed', () => {
  const marks: FiledMarks = {};
  assert.equal(isFiled(marks, 'rule-1', may), false);
  assert.equal(getFiled(marks, 'rule-1', may), undefined);
});

test('setFiled records amount + txId immutably', () => {
  const before: FiledMarks = {};
  const after = setFiled(before, 'rule-1', may, 850, 'tx-9');
  assert.deepEqual(before, {}, 'original map untouched');
  assert.equal(isFiled(after, 'rule-1', may), true);
  assert.deepEqual(getFiled(after, 'rule-1', may), { amount: 850, txId: 'tx-9' });
});

test('filing one month does NOT mark the next month', () => {
  const marks = setFiled({}, 'rule-1', may, 850, 'tx-9');
  assert.equal(isFiled(marks, 'rule-1', may), true);
  assert.equal(isFiled(marks, 'rule-1', june), false); // next period still due
});

test('double-fill guard: once filed, the row is "done" so no second entry', () => {
  // The report only renders the amount input when isFiled() is false.
  let marks: FiledMarks = {};
  assert.equal(isFiled(marks, 'electric', may), false); // shows input
  marks = setFiled(marks, 'electric', may, 1200, 'tx-1'); // user files it
  assert.equal(isFiled(marks, 'electric', may), true); // now "done", no input
});

test('filedTxIds returns this-month tx ids for excluding from the list', () => {
  let marks: FiledMarks = {};
  marks = setFiled(marks, 'electric', may, 1200, 'tx-1');
  marks = setFiled(marks, 'water', may, 300, 'tx-2');
  marks = setFiled(marks, 'rent', june, 9000, 'tx-3'); // different month
  const ids = filedTxIds(marks, may);
  assert.equal(ids.has('tx-1'), true);
  assert.equal(ids.has('tx-2'), true);
  assert.equal(ids.has('tx-3'), false, 'June fill excluded from May set');
  assert.equal(ids.size, 2);
});

test('filedTxIds skips marks with no txId', () => {
  const marks = setFiled({}, 'electric', may, 1200, null);
  assert.equal(filedTxIds(marks, may).size, 0);
});

test('clearFiled removes the marker immutably', () => {
  const filled = setFiled({}, 'rule-1', may, 850, 'tx-9');
  const cleared = clearFiled(filled, 'rule-1', may);
  assert.equal(isFiled(filled, 'rule-1', may), true, 'original untouched');
  assert.equal(isFiled(cleared, 'rule-1', may), false);
});

console.log(`\nrecurring-filed: ${passed} tests passed`);
