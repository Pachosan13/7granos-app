// project/src/lib/format.ts

/** % con 2 decimales: 0.256 -> "25.60%" */
export const formatPercentage = (value: number): string =>
  `${(value * 100).toFixed(2)}%`;

/** DD/MM/YYYY */
export const formatDateDDMMYYYY = (date: Date | string): string => {
  const d = new Date(date);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

/** Intl money formatter (USD, es-PA) */
const moneyFmt = new Intl.NumberFormat('es-PA', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formatea a USD con 2 decimales. Acepta number o string numérico. */
export function money(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n ?? 0);
  return moneyFmt.format(Number.isFinite(v) ? v : 0);
}

/** Alias compatible con tu código previo (si ya usabas formatCurrencyUSD) */
export const formatCurrencyUSD = (amount: number | string): string => money(amount);
