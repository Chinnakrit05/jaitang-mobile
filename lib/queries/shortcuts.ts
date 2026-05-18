import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addShortcut,
  listShortcuts,
  removeShortcut,
  type Shortcut,
} from '../shortcuts';

export function useShortcuts(ledgerId: string | undefined) {
  return useQuery<Shortcut[]>({
    queryKey: ['shortcuts', ledgerId],
    queryFn: () => listShortcuts(ledgerId!),
    enabled: !!ledgerId,
  });
}

export function useAddShortcut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Shortcut, 'id' | 'created_at'>) =>
      addShortcut(input),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['shortcuts', vars.ledger_id] });
    },
  });
}

export function useRemoveShortcut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; ledger_id: string }) =>
      removeShortcut(input.id, input.ledger_id),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['shortcuts', vars.ledger_id] });
    },
  });
}
