import React from 'react';
import { formatCurrencyUSD, formatPercentage } from '../../lib/format';

export interface LeaderboardRow {
  sucursal_id: string;
  ventas: number;
  cogs: number;
  gastos: number;
  utilidad: number;
  margen_pct: number;
  sucursal_nombre?: string;
}

export interface LeaderboardProps {
  rows: LeaderboardRow[];
}

export function Leaderboard({ rows }: LeaderboardProps) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        No hay datos de sucursales en el rango seleccionado.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
      <table className="min-w-full divide-y divide-slate-100 dark:divide-slate-800">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
          <tr>
            <th className="px-6 py-3">Sucursal</th>
            <th className="px-6 py-3 text-right">Ventas</th>
            <th className="px-6 py-3 text-right">COGS</th>
            <th className="px-6 py-3 text-right">Gastos</th>
            <th className="px-6 py-3 text-right">Utilidad</th>
            <th className="px-6 py-3 text-right">Margen</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white text-sm text-slate-600 dark:divide-slate-800 dark:bg-slate-900 dark:text-slate-200">
          {rows.map((row) => {
            const name = row.sucursal_nombre || row.sucursal_id;
            return (
              <tr key={row.sucursal_id} className="transition hover:bg-amber-50/60 dark:hover:bg-amber-500/10">
                <td className="px-6 py-4 font-medium text-slate-900 dark:text-white">{name}</td>
                <td className="px-6 py-4 text-right font-medium text-[#4B2E05]">
                  {formatCurrencyUSD(row.ventas)}
                </td>
                <td className="px-6 py-4 text-right">{formatCurrencyUSD(row.cogs)}</td>
                <td className="px-6 py-4 text-right">{formatCurrencyUSD(row.gastos)}</td>
                <td className="px-6 py-4 text-right font-semibold text-[#D4AF37]">
                  {formatCurrencyUSD(row.utilidad)}
                </td>
                <td className="px-6 py-4 text-right">{formatPercentage(row.margen_pct || 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default Leaderboard;
