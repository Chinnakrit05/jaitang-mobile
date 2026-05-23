/**
 * Lightweight currency formatter that matches what the web app uses
 * via `Intl.NumberFormat`. Port lives here so screens can format
 * without dragging in a full locale-helper module yet.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  locale = 'th-TH',
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // RN's bundled Intl might miss some currencies in Hermes; fall back.
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function formatDate(iso: string, locale = 'th-TH'): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}
