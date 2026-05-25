import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Per-ledger preferences for the quick-add category picker — purely
 * device-local (AsyncStorage), no backend involved.
 *
 * Two things live here:
 *   - `order`: an ordered list of category ids the user dragged into
 *     their preferred sequence on this device. Empty = use the default
 *     server `sort_order` + hierarchy grouping.
 *   - `showAll`: whether the picker expands to every category by default
 *     instead of capping at the first N with a "ดูเพิ่มเติม" tile.
 *
 * Why not server-side? Server `update_category` doesn't accept
 * sort_order today, and a sync pull would clobber any local sort_order
 * change anyway. AsyncStorage sidesteps both problems and works
 * identically for `local` and `synced` ledgers. Per-device drift is the
 * tradeoff; we can promote this to the cloud when there's a real
 * multi-device user reordering need.
 */

const ORDER_PREFIX = 'jaitang:cat-order:';
const SHOW_ALL_PREFIX = 'jaitang:cat-showall:';

export async function loadCategoryOrder(ledgerId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(ORDER_PREFIX + ledgerId);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function saveCategoryOrder(
  ledgerId: string,
  order: string[],
): Promise<void> {
  await AsyncStorage.setItem(ORDER_PREFIX + ledgerId, JSON.stringify(order));
}

export async function loadShowAllPref(ledgerId: string): Promise<boolean> {
  const raw = await AsyncStorage.getItem(SHOW_ALL_PREFIX + ledgerId);
  return raw === '1';
}

export async function saveShowAllPref(
  ledgerId: string,
  value: boolean,
): Promise<void> {
  await AsyncStorage.setItem(SHOW_ALL_PREFIX + ledgerId, value ? '1' : '0');
}

/**
 * Apply a saved order list to a flat category array. Categories present
 * in `order` come first (in that order); anything missing follows in
 * the input's existing order so brand-new categories don't disappear.
 *
 * Skipping the hierarchy helper when an order is in use is intentional:
 * once the user takes manual control we honor exactly what they set,
 * even if a sub ends up alongside an unrelated parent.
 */
export function applyCategoryOrder<T extends { id: string }>(
  cats: T[],
  order: string[],
): T[] {
  if (order.length === 0) return cats;
  const byId = new Map(cats.map((c) => [c.id, c]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const c = byId.get(id);
    if (c) {
      out.push(c);
      seen.add(id);
    }
  }
  for (const c of cats) {
    if (!seen.has(c.id)) out.push(c);
  }
  return out;
}
