/**
 * On-device backup file format. The user can export a ledger (or all of them)
 * to a JSON file and import it back later — the safety net for `local`
 * ledgers, which have no cloud copy (LOCAL_FIRST_PLAN.md Phase 1.5).
 *
 * The shape mirrors the snapshot the promote flow builds, but stays self-
 * contained (no auth context needed) and is versioned so future schema bumps
 * can upgrade old files at import time.
 */

export const BACKUP_VERSION = 1 as const;

export type BackupLedgerEntry = {
  ledger: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    currency: string;
    is_personal: boolean;
  };
  categories: Record<string, unknown>[];
  accounts: Record<string, unknown>[];
  trips: Record<string, unknown>[];
  recurring: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  transfers: Record<string, unknown>[];
  goals: Record<string, unknown>[];
  goal_contributions: Record<string, unknown>[];
  loans: Record<string, unknown>[];
  loan_repayments: Record<string, unknown>[];
};

export type BackupFile = {
  version: typeof BACKUP_VERSION;
  exported_at: string;
  app: 'jaitang-mobile';
  ledgers: BackupLedgerEntry[];
};
