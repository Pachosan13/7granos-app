// project/src/pages/VentasPage.tsx
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Receipt, Building2, Calendar } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthOrg } from '../context/AuthOrgContext';

/* ──────────────────────────────────────────────────────────
   Utilidades de fecha y formato
────────────────────────────────────────────────────────── */

// YYYY-MM-DD local
function ymdLocal(d: Date, tz = 'America/Panama') {
  const local = new Date(d.toLocaleString('en-US', { timeZone: tz }));
  const y = local.getFullYear();
  const m = String(local.getMonth() + 1).padStart(2, '0');
  const day = String(local.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayYMD(tz = 'America/Panama') {
  return ymdLocal(new Date(), tz);
}

// suma días a un YYYY-MM-DD de forma segura
function addDaysYMD(ymd: string, n: number, tz = 'America/Panama') {
  const [y, m, d] = ymd.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() + n);
  return ymdLocal(base, tz);
}

// rango inclusivo [from, to] en YYYY-MM-DD
function daysRangeInclusive(fromYMD: string, toYMD: string) {
  const out: string[] = [];
  let cur = fromYMD;
  while (cur <= toYMD) {
    out.push(cur);
    cur = addDaysYMD(cur, 1);
  }
  return out;
}

// últimos n días terminando HOY (inclusivo)
function startOfNDaysAgo(n: number, tz = 'America/Panama') {
  const end = todayYMD(tz);
  const start = addDaysYMD(end, -(n - 1), tz);
  return { start, end };
}

function formatCurrencyUSD(n: number) {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}

function formatDateDDMMYYYY(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

/* ──────────────────────────────────────────────────────────
   Tipos
────────────────────────────────────────────────────────── */

type RpcSerieRow = {
  d: string;            // 'YYYY-MM-DD'
  ventas_netas: number; // numeric
  itbms: number;        // numeric
  tx: number;           // bigint
};

type TablaSucursal = {
  nombre: string;
  ventas: number;
  transacciones: number;
  ticketPromedio: number;
};

/* ──────────────────────────────────────────────────────────
   Lectura de datos
────────────────────────────────────────────────────────── */

// RPC agrega por día; p_hasta es EXCLUSIVO
async function fetchSerieRPC(
  desdeIncl: string,
  hastaExcl: string,
  sucursalId: string | null
): Promise<RpcSerieRow[]> {
  const { data, error } = await supabase.rpc('rpc_ui_series_14d', {
    p_desde: desdeIncl,
    p_hasta: hastaExcl,
    p_sucursal_id: sucursalId,
  });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    d: String(r.d).slice(0, 10),
    ventas_netas: Number(r.ventas_netas ?? 0),
    itbms: Number(r.itbms ?? 0),
    tx: Number(r.tx ?? 0),
  }));
}

// ranking por sucursal desde la vista (cuando son "todas")
async function fetchRankingView(desdeIncl: string, hastaIncl: string): Promise<TablaSucursal[]> {
  const { data, error } = await supabase
    .from('v_ui_series_14d')
    .select('dia,sucursal,ventas_brutas,tickets')
    .gte('dia', desdeIncl)
    .lte('dia', hastaIncl);

  if (error) throw error;

  const map = new Map<string, { ventas: number; tx: number }>();
  for (const row of (data ?? []) as any[]) {
    const nombre = String(row.sucursal ?? 'Sin asignar');
    const ventas = Number(row.ventas_brutas ?? 0);
    const tx = Number(row.tickets ?? 0);
    const prev = map.get(nombre) ?? { ventas: 0, tx: 0 };
    map.set(nombre, { ventas: prev.ventas + ventas, tx: prev.tx + tx });
  }

  const out: TablaSucursal[] = [];
  for (const [nombre, v] of map.entries()) {
    out.push({
      nombre,
      ventas: v.ventas,
      transacciones: v.tx,
      ticketPromedio: v.tx > 0 ? v.ventas / v.tx : 0,
    });
  }
  out.sort((a, b) => b.ventas - a.ventas);
  return out;
}

/* ──────────────────────────────────────────────────────────
   Página principal
────────────────────────────────────────────────────────── */
export default function VentasPage() {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();

  // Filtros de fecha
  const { start: defStart, end: defEnd } = startOfNDaysAgo(14);
  const [desde, setDesde] = useState(defStart);
  const [hasta, setHasta] = useState(defEnd);

  // Filtro de sucursal ('' = todas)
  const [selectedSucursal, setSelectedSucursal] = useState<string>('');

  // Datos
  const [serieFilled, setSerieFilled] = useState<Array<{ fecha: string; ventas: number; itbms: number; tx: number }>>([]);
  const [ranking, setRanking] = useState<TablaSucursal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sincroniza el dropdown si el contexto cambia
  useEffect(() => {
    if (sucursalSeleccionada?.id) {
      setSelectedSucursal(String(sucursalSeleccionada.id));
    }
  }, [sucursalSeleccionada?.id]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sucId = selectedSucursal || null;

      // p_hasta (EXCLUSIVO) = hasta + 1 día
      const hastaExcl = addDaysYMD(hasta, 1);

      const [rowsRPC, rankingRows] = await Promise.all([
        fetchSerieRPC(desde, hastaExcl, sucId),
        selectedSucursal ? Promise.resolve([]) : fetchRankingView(desde, hasta),
      ]);

      // rellenar días que falten en la serie (0s)
      const byDay = new Map<string, { ventas: number; itbms: number; tx: number }>();
      for (const r of rowsRPC) {
        byDay.set(r.d, { ventas: r.ventas_netas, itbms: r.itbms, tx: r.tx });
      }
      const days = daysRangeInclusive(desde, hasta);
      const filled = days.map((d) => {
        const v = byDay.get(d);
        return { fecha: d, ventas: v?.ventas ?? 0, itbms: v?.itbms ?? 0, tx: v?.tx ?? 0 };
      });

      setSerieFilled(filled);
      setRanking(rankingRows);
    } catch (e: any) {
      setError(e?.message || 'No fue posible cargar ventas.');
      setSerieFilled([]);
      setRanking([]);
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, selectedSucursal]);

  useEffect(() => {
    load();
  }, [load]);

  // KPIs desde la serie ya rellenada
  const kpis = useMemo(() => {
    const ventas = serieFilled.reduce((acc, r) => acc + (r.ventas || 0), 0);
    const itbms = serieFilled.reduce((acc, r) => acc + (r.itbms || 0), 0);
    const tx = serieFilled.reduce((acc, r) => acc + (r.tx || 0), 0);
    const ticket = tx > 0 ? ventas / tx : 0;
    return { ventas, itbms, tx, ticket };
  }, [serieFilled]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-bean">Ventas</h1>
          <p className="text-slate7g">Serie diaria, KPIs y ranking por sucursal.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl border border-sand px-4 py-2 text-sm text-bean shadow-sm"
          >
            <RefreshCw className={loading ? 'animate-spin h-4 w-4' : 'h-4 w-4'} />
            {loading ? 'Actualizando…' : 'Actualizar'}
          </button>
        </div>
      </header>

      {/* Filtros */}
      <section className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-5">
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Desde
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full rounded-xl border border-sand px-9 py-2"
              />
            </div>
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate7g">
            Hasta
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={hasta}
                min={desde}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full rounded-xl border border-sand px-9 py-2"
              />
            </div>
          </label>
          <label className="md:col-span-2 flex flex-col gap-2 text-sm text-slate7g">
            Sucursal
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedSucursal}
                onChange={(e) => setSelectedSucursal(e.target.value)}
                className="w-full rounded-xl border border-sand px-9 py-2"
              >
                <option value="">Todas mis sucursales</option>
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={load}
              className="w-full rounded-xl border border-sand px-4 py-2 text-sm text-bean hover:border-bean"
              disabled={loading}
            >
              {loading ? 'Cargando…' : 'Aplicar'}
            </button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<DollarSign className="h-4 w-4" />}
          title="Ventas netas"
          value={formatCurrencyUSD(kpis.ventas)}
          helper={`${formatDateDDMMYYYY(desde)} — ${formatDateDDMMYYYY(hasta)}`}
        />
        <KpiCard
          icon={<Receipt className="h-4 w-4" />}
          title="ITBMS"
          value={formatCurrencyUSD(kpis.itbms)}
          helper="Impuesto agregado"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          title="Transacciones"
          value={kpis.tx.toLocaleString('en-US')}
          helper="Cantidad de tickets"
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          title="Ticket promedio"
          value={formatCurrencyUSD(kpis.ticket)}
          helper="Ventas / Transacciones"
        />
      </section>

      {/* Serie 14 días */}
      <section className="rounded-2xl border border-sand bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-sand px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Serie 14 días</h2>
            <p className="text-sm text-slate-500">Ventas netas, ITBMS y transacciones</p>
          </div>
        </header>
        <div className="h-80 px-2 py-4">
          {serieFilled.length > 0 ? (
            <ResponsiveContainer>
              <ComposedChart data={serieFilled}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="fecha" />
                <YAxis yAxisId="left" tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`)} />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip
                  formatter={(val: any, name) => {
                    if (name === 'tx') return [Number(val).toLocaleString('en-US'), 'TX'];
                    return [formatCurrencyUSD(Number(val)), name === 'ventas' ? 'Ventas' : 'ITBMS'];
                  }}
                  labelFormatter={(l) => formatDateDDMMYYYY(String(l))}
                />
                <Bar yAxisId="right" dataKey="tx" name="TX" />
                <Area yAxisId="left" dataKey="ventas" name="Ventas" type="monotone" strokeWidth={2} />
                <Area yAxisId="left" dataKey="itbms" name="ITBMS" type="monotone" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message={loading ? 'Cargando…' : 'No hay datos en el rango seleccionado.'} />
          )}
        </div>
      </section>

      {/* Ranking (solo cuando todas las sucursales) */}
      {!selectedSucursal && (
        <section className="rounded-2xl border border-sand bg-white shadow-sm">
          <header className="flex items-center justify-between border-b border-sand px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Ranking por sucursal</h2>
              <p className="text-sm text-slate-500">Agregado del rango seleccionado</p>
            </div>
          </header>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-sand text-sm">
              <thead className="bg-sand/40">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-slate-600">Sucursal</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">Ventas</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">TX</th>
                  <th className="px-6 py-3 text-right font-medium text-slate-600">Ticket prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand/70">
                {ranking.length > 0 ? (
                  ranking.map((r) => (
                    <tr key={r.nombre}>
                      <td className="px-6 py-3">{r.nombre}</td>
                      <td className="px-6 py-3 text-right font-mono">{formatCurrencyUSD(r.ventas)}</td>
                      <td className="px-6 py-3 text-right font-mono">{r.transacciones.toLocaleString('en-US')}</td>
                      <td className="px-6 py-3 text-right font-mono">{formatCurrencyUSD(r.ticketPromedio)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      <EmptyState message={loading ? 'Cargando…' : 'Sin datos para mostrar.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          {error}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   UI mínimos internos
────────────────────────────────────────────────────────── */
function KpiCard({
  icon,
  title,
  value,
  helper,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  helper?: string;
}) {
  return (
    <article className="rounded-2xl border border-sand bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-semibold text-slate-800">{value}</p>
      {helper && <p className="text-xs text-slate-500">{helper}</p>}
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-8 text-center text-sm text-slate-500">
      <RefreshCw className="h-5 w-5 text-slate-400" />
      <span>{message}</span>
    </div>
  );
}
