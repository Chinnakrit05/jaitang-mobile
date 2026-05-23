import { getDb } from './client';
import type { LocalCategory } from '../sync/categories';

export type LocalCategoryRow = LocalCategory;

export async function listLocalCategories(ledgerId: string): Promise<LocalCategoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalCategoryRow>(
    `SELECT * FROM categories
     WHERE ledger_id = ? AND deleted_at IS NULL
     ORDER BY kind ASC, sort_order ASC`,
    [ledgerId],
  );
}
