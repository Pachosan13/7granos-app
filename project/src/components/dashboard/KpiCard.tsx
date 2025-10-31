import React from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { formatCurrencyUSD } from '../../lib/format';

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export type KPIValueFormatter = (value: number) => string;

export interface KpiCardProps {
  title: string;
  value: number | null | undefined;
  previous?: number | null;
  deltaPct?: number | null;
  formatter?: KPIValueFormatter;
  prefix?: string;
  suffix?: string;
  tooltip?: string;
  highlight?: 'primary' | 'success' | 'warning';
}

const defaultFormatter: KPIValueFormatter = (value) =>
  typeof value === 'number' && Number.isFinite(value)
    ? formatCurrencyUSD(value)
    : formatCurrencyUSD(0);

function resolveDelta({ value, previous, deltaPct }: Pick<KpiCardProps, 'value' | 'previous' | 'deltaPct'>) {
  if (typeof deltaPct === 'number' && Number.isFinite(deltaPct)) return deltaPct;
  if (typeof value === 'number' && typeof previous === 'number' && previous !== 0) {
    return (value - previous) / previous;
  }
  return null;
}

export function KpiCard({
  title,
  value,
  previous,
  deltaPct,
  formatter = defaultFormatter,
  prefix,
  suffix,
  tooltip,
  highlight = 'primary',
}: KpiCardProps) {
  const resolvedValue = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const delta = resolveDelta({ value: resolvedValue, previous, deltaPct });
  const isPositive = typeof delta === 'number' ? delta >= 0 : true;
  const deltaText =
    typeof delta === 'number' && Number.isFinite(delta)
      ? `${(delta * 100).toFixed(1)}%`
      : '—';

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-100 transition hover:shadow-md dark:bg-slate-900 dark:ring-slate-800">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <div className={cn('mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-white')}>
            {prefix}
            {formatter(resolvedValue)}
            {suffix}
          </div>
        </div>
        <div
          className={cn(
            'inline-flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-inner',
            highlight === 'primary' && 'bg-[#4B2E05]',
            highlight === 'success' && 'bg-emerald-500',
            highlight === 'warning' && 'bg-amber-500'
          )}
          aria-hidden
        >
          {isPositive ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownRight className="h-5 w-5" />}
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{tooltip}</span>
        <span className={cn('inline-flex items-center gap-1 font-medium', isPositive ? 'text-emerald-500' : 'text-rose-500')}>
          {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />} {deltaText}
        </span>
      </div>
    </div>
  );
}

export default KpiCard;
