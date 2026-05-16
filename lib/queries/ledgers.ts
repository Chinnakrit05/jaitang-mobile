import { useQuery } from '@tanstack/react-query';

import { supabase } from '../supabase/client';

export type LedgerSummary = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  currency: string;
  is_personal: boolean;
  role: 'owner' | 'editor' | 'viewer';
};

/**
 * Lists every ledger the signed-in user can see — their own plus any
 * they've been invited to. Mirrors the shape of the web app's
 * `listLedgersForUser` so screens can share types eventually.
 */
async function fetchLedgers(): Promise<LedgerSummary[]> {
  const { data: own, error: ownErr } = await supabase
    .from('ledgers')
    .select('id, name, icon, color, currency, is_personal, owner_id');
  if (ownErr) throw ownErr;

  const userId = (await supabase.auth.getUser()).data.user?.id;

  const owned: LedgerSummary[] = (own ?? [])
    .filter((l) => l.owner_id === userId)
    .map((l) => ({
      id: l.id,
      name: l.name,
      icon: l.icon,
      color: l.color,
      currency: l.currency ?? 'THB',
      is_personal: l.is_personal,
      role: 'owner' as const,
    }));

  const { data: shared, error: shErr } = await supabase
    .from('ledger_members')
    .select(
      'role, ledgers!inner(id, name, icon, color, currency, is_personal, owner_id)',
    );
  if (shErr) throw shErr;

  const sharedRows: LedgerSummary[] = (shared ?? []).flatMap((row) => {
    const lRaw = row.ledgers as unknown;
    const l = Array.isArray(lRaw) ? lRaw[0] : lRaw;
    if (!l) return [];
    return [
      {
        id: l.id,
        name: l.name,
        icon: l.icon,
        color: l.color,
        currency: l.currency ?? 'THB',
        is_personal: l.is_personal,
        role: row.role as LedgerSummary['role'],
      },
    ];
  });

  // De-dupe by id (a user who owns a ledger they're also a member of
  // shouldn't appear twice).
  const seen = new Set<string>();
  return [...owned, ...sharedRows].filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });
}

export function useLedgers() {
  return useQuery({ queryKey: ['ledgers'], queryFn: fetchLedgers });
}
