import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CalendarDays, LineChart as LineChartIcon, Sparkles } from 'lucide-react';
import { formatCurrencyUSD } from '../lib/format';
import KpiCard from '../components/dashboard/KpiCard';
import {
  dashboardBaseMetrics7d,
  dashboardSerie30d,
  dashboardSucursalesMock,
  dashboardTopProductosMock,
  getFinancialKpis,
  type DashboardProductoTop,
  type DashboardSerieDia,
  type DashboardSucursal,
} from '../mocks/dashboard';

const USE_DASHBOARD_MOCK = true;

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(1)} %`;
}

function TrendTooltip({ label, payload }: any) {
  if (!payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-2 space-y-1">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {item.dataKey === 'margen' ? formatCurrencyUSD(item.value) : formatCurrencyUSD(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BranchTooltip({ label, payload }: any) {
  if (!payload?.length) return null;
  return (
    <div className="rounded-xl bg-white px-4 py-3 text-sm shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
      <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
      <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center justify-between gap-6">
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {item.dataKey === 'margenPct' ? formatPercent(item.value) : formatCurrencyUSD(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardExecutive() {
  // DEMO: using dashboard mock data from src/mocks/dashboard.ts for owner presentation
  const financial = useMemo(() => getFinancialKpis(dashboardBaseMetrics7d), []);
  const serie30d = useMemo<DashboardSerieDia[]>(() => dashboardSerie30d, []);
  const sucursales = useMemo<DashboardSucursal[]>(() => dashboardSucursalesMock, []);
  const topProductos = useMemo<DashboardProductoTop[]>(() => dashboardTopProductosMock, []);

  const topVentas = Math.max(...topProductos.map((p) => p.ventas));

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Tablero Ejecutivo (Demo)</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">Salud financiera 7 Granos</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Vista de propietario con KPIs críticos de margen, costos y comportamiento de ventas simulados para la presentación.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <CalendarDays className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Horizonte</p>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Últimos 30 días (mock)</p>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            title="Margen bruto"
            value={financial.margenBrutoPct}
            formatter={formatPercent}
            tooltip="Margen sobre ventas netas"
            highlight="success"
          />
          <KpiCard
            title="Margen operativo"
            value={financial.margenOperativoPct}
            formatter={formatPercent}
            tooltip="Utilidad operativa / Ventas"
            highlight="primary"
          />
          <KpiCard
            title="Ticket promedio"
            value={financial.ticketPromedio}
            formatter={(value) => formatCurrencyUSD(value)}
            tooltip="Ventas / Transacciones"
            highlight="warning"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <KpiCard
            title="Food Cost %"
            value={financial.foodCostPct}
            formatter={formatPercent}
            tooltip="Costo de alimentos / Ventas"
            highlight="warning"
          />
          <KpiCard
            title="Beverage Cost %"
            value={financial.beverageCostPct}
            formatter={formatPercent}
            tooltip="Costo de bebidas / Ventas"
            highlight="warning"
          />
          <KpiCard
            title="Labor Cost %"
            value={financial.laborCostPct}
            formatter={formatPercent}
            tooltip="Costo laboral / Ventas"
            highlight="warning"
          />
        </div>
      </section>

      <section className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <LineChartIcon className="h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Tendencia 30 días</h2>
              <p className="text-sm text-slate-500">Ventas y margen diario</p>
            </div>
          </div>
          {USE_DASHBOARD_MOCK && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-100 dark:bg-amber-900/30 dark:text-amber-100 dark:ring-amber-800">
              <Sparkles className="h-4 w-4" /> Demo mock
            </span>
          )}
        </div>
        <div className="h-[360px] px-6 pb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serie30d} margin={{ top: 20, right: 24, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="fecha"
                tickFormatter={(value) => {
                  const parsed = new Date(value);
                  return Number.isNaN(parsed.getTime())
                    ? value
                    : parsed.toLocaleDateString('es-PA', { day: '2-digit', month: 'short' });
                }}
                stroke="#94a3b8"
                fontSize={12}
              />
              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={(v: number) => formatCurrencyUSD(v)}
                width={90}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8"
                fontSize={12}
                tickFormatter={(v: number) => formatCurrencyUSD(v)}
                width={80}
              />
              <Tooltip content={<TrendTooltip />} />
              <Legend formatter={(value) => (value === 'ventas' ? 'Ventas' : 'Margen')} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="ventas"
                name="Ventas"
                stroke="#4B2E05"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="margen"
                name="Margen"
                stroke="#0ea5e9"
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Ventas y margen por sucursal</h2>
              <p className="text-sm text-slate-500">Barras apiladas con anotación de margen %</p>
            </div>
          </div>
          <div className="h-[320px] px-6 pb-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sucursales} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="nombre" stroke="#94a3b8" fontSize={12} />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(v: number) => formatCurrencyUSD(v)}
                  width={90}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickFormatter={(v: number) => `${v.toFixed(1)} %`}
                  width={60}
                />
                <Tooltip content={<BranchTooltip />} />
                <Legend />
                <Bar yAxisId="left" dataKey="ventas" name="Ventas" fill="#4B2E05" radius={[10, 10, 4, 4]} barSize={36} />
                <Line yAxisId="right" type="monotone" dataKey="margenPct" name="Margen %" stroke="#0ea5e9" strokeWidth={3} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="border-t border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-slate-800">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 font-medium">Sucursal</th>
                    <th className="py-2 font-medium">Ventas</th>
                    <th className="py-2 font-medium">Margen %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sucursales.map((sucursal) => (
                    <tr key={sucursal.id} className="text-slate-900 dark:text-slate-100">
                      <td className="py-3 font-semibold">{sucursal.nombre}</td>
                      <td className="py-3">{formatCurrencyUSD(sucursal.ventas)}</td>
                      <td className="py-3">{formatPercent(sucursal.margenPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 dark:bg-slate-900 dark:ring-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Top 5 productos</h2>
            <p className="text-sm text-slate-500">Tickets premium vs margen</p>
            <div className="mt-4 space-y-3">
              {topProductos.map((item) => (
                <div key={item.producto} className="rounded-xl border border-slate-100 p-3 shadow-sm dark:border-slate-800">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.producto}</p>
                      <p className="text-xs text-slate-500">{formatCurrencyUSD(item.margen)} margen</p>
                    </div>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{formatCurrencyUSD(item.ventas)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                      style={{ width: `${Math.max(12, Math.round((item.ventas / topVentas) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-inner ring-1 ring-amber-100 dark:from-amber-900/30 dark:to-orange-900/30 dark:ring-amber-800">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-700 dark:text-amber-100" />
              <div>
                <h3 className="text-base font-semibold text-amber-900 dark:text-amber-50">Modo demostración</h3>
                <p className="text-sm text-amber-800/80 dark:text-amber-100/80">
                  Todos los gráficos usan mocks locales para la reunión con dirección. Ningún dato real ni llamadas a Supabase.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
