import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Quick-add shortcuts — local-only "templates" the user can tap to
 * spin up a new transaction with pre-filled fields. Stored in
 * AsyncStorage as a JSON array per ledger (no server sync yet, since
 * shortcuts are a personal preference rather than shared data).
 *
 * Cap at 8 per ledger so the quick-add row stays readable. Newer
 * shortcuts go to the front; oldest gets evicted FIFO-style when the
 * cap is hit.
 */

export type Shortcut = {
  id: string;
  ledger_id: string;
  name: string;
  icon: string | null;
  kind: 'income' | 'expense';
  amount: number;
  note: string | null;
  category_id: string | null;
  payment_method: 'cash' | 'transfer' | null;
  created_at: string;
};

const MAX_PER_LEDGER = 8;
const KEY_PREFIX = 'jt-shortcuts:';

function randomId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function listShortcuts(ledgerId: string): Promise<Shortcut[]> {
  const raw = await AsyncStorage.getItem(KEY_PREFIX + ledgerId);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is Shortcut =>
        s && typeof s === 'object' && typeof s.id === 'string',
    );
  } catch {
    return [];
  }
}

export async function addShortcut(
  input: Omit<Shortcut, 'id' | 'created_at'>,
): Promise<Shortcut> {
  const list = await listShortcuts(input.ledger_id);
  const fresh: Shortcut = {
    ...input,
    id: randomId(),
    created_at: new Date().toISOString(),
  };
  const next = [fresh, ...list].slice(0, MAX_PER_LEDGER);
  await AsyncStorage.setItem(
    KEY_PREFIX + input.ledger_id,
    JSON.stringify(next),
  );
  return fresh;
}

export async function removeShortcut(
  id: string,
  ledgerId: string,
): Promise<void> {
  const list = await listShortcuts(ledgerId);
  const next = list.filter((s) => s.id !== id);
  await AsyncStorage.setItem(KEY_PREFIX + ledgerId, JSON.stringify(next));
}
