import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Foreign-exchange rates for multi-currency transactions.
 *
 * Source: Frankfurter (ECB reference rates, free, no API key). We fetch
 * the full rate table for a base currency once and cache it in
 * AsyncStorage for 24h — rates move slowly enough that a daily snapshot
 * is plenty for personal expense tracking, and it keeps the app usable
 * offline after the first fetch.
 *
 * Convention: `getRate(from, to)` returns how many units of `to` equal
 * one unit of `from`. So a foreign amount converts to home currency as
 * `homeAmount = foreignAmount * getRate(foreignCurrency, homeCurrency)`.
 *
 * The transactions table stores the HOME-currency value in `amount` and
 * keeps the foreign trio in `fx_currency` / `fx_amount` / `fx_rate`, so
 * every existing aggregate (dashboard, budgets, day totals) keeps
 * working in home currency without change.
 */

const TTL_MS = 24 * 60 * 60 * 1000;
const API_BASE = 'https://api.frankfurter.dev/v1';

/** Short common set surfaced in the pickers. Home currency is prepended
 *  by the screens, so order here is just "most likely next". */
export const CURRENCIES = [
  'THB',
  'USD',
  'JPY',
  'EUR',
  'GBP',
  'CNY',
  'KRW',
  'SGD',
  'AUD',
  'HKD',
  'TWD',
  'VND',
] as const;

export type CurrencyMeta = { symbol: string; name: string };

export const CURRENCY_META: Record<string, CurrencyMeta> = {
  THB: { symbol: '฿', name: 'บาท' },
  USD: { symbol: '$', name: 'ดอลลาร์สหรัฐ' },
  JPY: { symbol: '¥', name: 'เยน' },
  EUR: { symbol: '€', name: 'ยูโร' },
  GBP: { symbol: '£', name: 'ปอนด์' },
  CNY: { symbol: '¥', name: 'หยวน' },
  KRW: { symbol: '₩', name: 'วอน' },
  SGD: { symbol: 'S$', name: 'ดอลลาร์สิงคโปร์' },
  AUD: { symbol: 'A$', name: 'ดอลลาร์ออสเตรเลีย' },
  HKD: { symbol: 'HK$', name: 'ดอลลาร์ฮ่องกง' },
  TWD: { symbol: 'NT$', name: 'ดอลลาร์ไต้หวัน' },
  VND: { symbol: '₫', name: 'ดอง' },
};

export function currencySymbol(code: string): string {
  return CURRENCY_META[code]?.symbol ?? code;
}

type RatesCache = { base: string; fetchedAt: number; rates: Record<string, number> };

function cacheKey(base: string): string {
  return `jt-fx-${base}`;
}

/**
 * Rate table for `base` — `rates[X]` = units of X per 1 base. Reads the
 * 24h AsyncStorage cache first; on miss/expiry it fetches and stores.
 * `base` itself is included as 1 so same-currency lookups never miss.
 */
async function getRates(base: string): Promise<Record<string, number>> {
  const key = cacheKey(base);
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      const parsed: RatesCache = JSON.parse(cached);
      if (parsed.base === base && Date.now() - parsed.fetchedAt < TTL_MS) {
        return parsed.rates;
      }
    }
  } catch {
    // Corrupt cache — fall through to a fresh fetch.
  }

  const res = await fetch(`${API_BASE}/latest?base=${encodeURIComponent(base)}`);
  if (!res.ok) throw new Error(`FX fetch failed (${res.status})`);
  const json = (await res.json()) as { rates?: Record<string, number> };
  const rates = { ...(json.rates ?? {}) };
  rates[base] = 1;
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({ base, fetchedAt: Date.now(), rates } satisfies RatesCache),
    );
  } catch {
    // Persisting the cache is best-effort; the rate is still usable now.
  }
  return rates;
}

/** Units of `to` per 1 unit of `from`. */
export async function getRate(from: string, to: string): Promise<number> {
  if (from === to) return 1;
  const rates = await getRates(from);
  const r = rates[to];
  if (!r || !Number.isFinite(r)) {
    throw new Error(`No FX rate ${from}→${to}`);
  }
  return r;
}

export async function convert(
  amount: number,
  from: string,
  to: string,
): Promise<number> {
  return amount * (await getRate(from, to));
}

/**
 * React hook wrapper around `getRate`. Re-fetches when `from`/`to`
 * change. Same-currency resolves to 1 synchronously. Exposes loading +
 * error so callers can show a "fetching rate…" / "couldn't fetch rate"
 * state and block dependent saves when there's no rate.
 */
export function useFxRate(
  from: string,
  to: string,
): { rate: number | null; loading: boolean; error: boolean } {
  const [rate, setRate] = useState<number | null>(from === to ? 1 : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    if (from === to) {
      setRate(1);
      setError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getRate(from, to)
      .then((r) => {
        if (!alive) return;
        setRate(r);
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setRate(null);
        setError(true);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [from, to]);

  return { rate, loading, error };
}
