/**
 * "Filed this month" markers for variable recurring bills in the monthly
 * report.
 *
 * A variable recurring rule has `amount = null` on the rule itself, so the
 * rule can't tell us whether *this month's* instance has already been
 * entered. We track that separately: a map keyed by `${ruleId}|YYYY-MM`
 * whose value records the amount entered AND the id of the transaction it
 * created. The txId lets the report hide that transaction from its
 * "this month" list (it's already represented in the recurring section).
 *
 * These helpers are pure and dependency-free so the report screen and the
 * unit test share one source of truth. The screen persists the map to
 * AsyncStorage; this module only does key math and immutable updates.
 */

export type FiledMark = { amount: number; txId: string | null };
export type FiledMarks = Record<string, FiledMark>;

/** `YYYY-MM` for the given date (local time). */
export function monthKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Marker key for a rule in the month of `d`. */
export function filedMarkKey(ruleId: string, d: Date): string {
  return `${ruleId}|${monthKey(d)}`;
}

/** The mark (amount + txId) for the rule in the month of `d`, or undefined. */
export function getFiled(
  marks: FiledMarks,
  ruleId: string,
  d: Date,
): FiledMark | undefined {
  return marks[filedMarkKey(ruleId, d)];
}

/** Whether the rule has already been filed for the month of `d`. */
export function isFiled(marks: FiledMarks, ruleId: string, d: Date): boolean {
  return getFiled(marks, ruleId, d) !== undefined;
}

/** Immutably record `amount` (+ created txId) as filed for the month of `d`. */
export function setFiled(
  marks: FiledMarks,
  ruleId: string,
  d: Date,
  amount: number,
  txId: string | null,
): FiledMarks {
  return { ...marks, [filedMarkKey(ruleId, d)]: { amount, txId } };
}

/** Immutably clear the filed marker for the rule in the month of `d`. */
export function clearFiled(
  marks: FiledMarks,
  ruleId: string,
  d: Date,
): FiledMarks {
  const next = { ...marks };
  delete next[filedMarkKey(ruleId, d)];
  return next;
}

/**
 * The set of transaction ids filed in the month of `d` — used by the
 * report to exclude recurring-originated transactions from its
 * "this month" list so they aren't shown twice.
 */
export function filedTxIds(marks: FiledMarks, d: Date): Set<string> {
  const suffix = `|${monthKey(d)}`;
  const ids = new Set<string>();
  for (const [key, mark] of Object.entries(marks)) {
    if (key.endsWith(suffix) && mark.txId) ids.add(mark.txId);
  }
  return ids;
}
