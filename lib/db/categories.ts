import { getDb } from './client';
import type { LocalCategory } from '../sync/categories';

export type LocalCategoryRow = LocalCategory;

function randomUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listLocalCategories(ledgerId: string): Promise<LocalCategoryRow[]> {
  const db = await getDb();
  return db.getAllAsync<LocalCategoryRow>(
    `SELECT * FROM categories
     WHERE ledger_id = ? AND deleted_at IS NULL
     ORDER BY kind ASC, sort_order ASC`,
    [ledgerId],
  );
}

// ── Local-first writes (used for `local` ledgers; see LOCAL_FIRST_PLAN.md) ──

export type NewLocalCategory = {
  ledger_id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  kind: 'income' | 'expense';
  parent_id?: string | null;
  sort_order?: number;
};

/** Create a category on-device (client UUID, `pending_create`). */
export async function createLocalCategory(input: NewLocalCategory): Promise<string> {
  const db = await getDb();
  const id = randomUuid();
  const now = new Date().toISOString();
  let sortOrder = input.sort_order;
  if (sortOrder == null) {
    const row = await db.getFirstAsync<{ next: number }>(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next
         FROM categories WHERE ledger_id = ? AND kind = ?`,
      [input.ledger_id, input.kind],
    );
    sortOrder = row?.next ?? 0;
  }
  await db.runAsync(
    `INSERT INTO categories (
      id, ledger_id, name, icon, color, kind, sort_order, parent_id,
      created_at, updated_at, deleted_at, _sync_state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
    [
      id,
      input.ledger_id,
      input.name,
      input.icon ?? null,
      input.color ?? null,
      input.kind,
      sortOrder,
      input.parent_id ?? null,
      now,
      now,
    ],
  );
  return id;
}

/** Update a category on-device (keeps a never-pushed row as pending_create). */
export async function updateLocalCategory(
  id: string,
  patch: { name: string; icon: string | null; parent_id: string | null },
): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE categories
       SET name=?, icon=?, parent_id=?, updated_at=?,
           _sync_state=CASE WHEN _sync_state='pending_create'
                            THEN 'pending_create' ELSE 'pending_update' END
     WHERE id=?`,
    [patch.name, patch.icon, patch.parent_id, now, id],
  );
}

/**
 * Delete a category on-device. A row that was never pushed is hard-removed;
 * an already-synced row is soft-deleted (tombstone) so the deletion can be
 * propagated when/if the ledger is synced.
 */
export async function deleteLocalCategory(id: string): Promise<void> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ _sync_state: string }>(
    `SELECT _sync_state FROM categories WHERE id=?`,
    [id],
  );
  if (row?._sync_state === 'pending_create') {
    await db.runAsync(`DELETE FROM categories WHERE id=?`, [id]);
    return;
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE categories SET deleted_at=?, updated_at=?, _sync_state='pending_delete' WHERE id=?`,
    [now, now, id],
  );
}

type DefaultCat = { name: string; icon: string; children?: { name: string; icon: string }[] };

// Default Thai hierarchy seeded into a fresh LOCAL ledger (the cloud path
// uses the server-side `seed_default_categories` RPC instead).
const DEFAULT_CATEGORIES: Record<'expense' | 'income', DefaultCat[]> = {
  expense: [
    { name: 'อาหาร', icon: '🍜', children: [{ name: 'คาเฟ่', icon: '☕' }, { name: 'ของหวาน', icon: '🍰' }] },
    { name: 'เดินทาง', icon: '🚕', children: [{ name: 'น้ำมัน', icon: '⛽' }, { name: 'ขนส่งสาธารณะ', icon: '🚌' }] },
    { name: 'ช้อปปิ้ง', icon: '🛍️', children: [{ name: 'เสื้อผ้า', icon: '👕' }] },
    { name: 'ที่พัก', icon: '🏠' },
    { name: 'บิล/ค่าน้ำค่าไฟ', icon: '🧾' },
    { name: 'สุขภาพ', icon: '💊' },
    { name: 'บันเทิง', icon: '🎬' },
    { name: 'การศึกษา', icon: '📚' },
    { name: 'อื่นๆ', icon: '✨' },
  ],
  income: [
    { name: 'เงินเดือน', icon: '💰' },
    { name: 'โบนัส', icon: '🎁' },
    { name: 'รายได้เสริม', icon: '💵' },
    { name: 'อื่นๆ', icon: '✨' },
  ],
};

/**
 * Seed a fresh LOCAL ledger with the default category hierarchy (client
 * UUIDs, `pending_create`). Idempotent — no-ops if the ledger already has
 * any non-deleted category. Returns the number of categories created.
 */
export async function seedDefaultCategoriesLocal(ledgerId: string): Promise<number> {
  const db = await getDb();
  const existing = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) AS c FROM categories WHERE ledger_id=? AND deleted_at IS NULL`,
    [ledgerId],
  );
  if ((existing?.c ?? 0) > 0) return 0;

  const now = new Date().toISOString();
  let created = 0;
  await db.withTransactionAsync(async () => {
    for (const kind of ['expense', 'income'] as const) {
      let order = 0;
      for (const parent of DEFAULT_CATEGORIES[kind]) {
        const parentId = randomUuid();
        await db.runAsync(
          `INSERT INTO categories (
            id, ledger_id, name, icon, color, kind, sort_order, parent_id,
            created_at, updated_at, deleted_at, _sync_state
          ) VALUES (?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, NULL, 'pending_create')`,
          [parentId, ledgerId, parent.name, parent.icon, kind, order++, now, now],
        );
        created++;
        for (const child of parent.children ?? []) {
          await db.runAsync(
            `INSERT INTO categories (
              id, ledger_id, name, icon, color, kind, sort_order, parent_id,
              created_at, updated_at, deleted_at, _sync_state
            ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, 'pending_create')`,
            [randomUuid(), ledgerId, child.name, child.icon, kind, order++, parentId, now, now],
          );
          created++;
        }
      }
    }
  });
  return created;
}
