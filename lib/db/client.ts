import * as SQLite from 'expo-sqlite';

import { migrate } from './schema';

const DB_NAME = 'jaitang.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Lazy-open singleton for the local DB. Migrations run once on first
 * open per process. Subsequent callers await the same promise.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync(DB_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

export async function getSyncState(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM sync_state WHERE key = ?',
    [key],
  );
  return row?.value ?? null;
}

export async function setSyncState(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_state (key, value) VALUES (?, ?)',
    [key, value],
  );
}
