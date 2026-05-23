import type { Category } from './queries/categories';

/**
 * Same sort-by-hierarchy helper as the web app's `sortByHierarchy()`.
 * Each parent is immediately followed by its subs so a flat dropdown
 * / chip row still reads as a tree.
 */
export function sortCategoriesByHierarchy<
  T extends { id: string; parent_id: string | null },
>(flat: T[]): T[] {
  const subsByParent = new Map<string, T[]>();
  const roots: T[] = [];
  for (const c of flat) {
    if (c.parent_id) {
      if (!subsByParent.has(c.parent_id)) subsByParent.set(c.parent_id, []);
      subsByParent.get(c.parent_id)!.push(c);
    } else {
      roots.push(c);
    }
  }
  const out: T[] = [];
  for (const root of roots) {
    out.push(root);
    const subs = subsByParent.get(root.id);
    if (subs) out.push(...subs);
  }
  for (const [parentId, subs] of subsByParent) {
    if (!roots.some((r) => r.id === parentId)) out.push(...subs);
  }
  return out;
}

// Re-export so screens don't have to know the shape.
export type { Category } from './queries/categories';
