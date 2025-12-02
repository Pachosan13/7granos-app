import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  MapPin,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import {
  gerenciaAlertasMock,
  gerenciaMetricsMock,
  gerenciaSerie14DiasMock,
  gerenciaSucursalesMock,
  gerenciaTopProductosMock,
  GerenciaAlerta,
  GerenciaSerieDia,
} from '../../mocks/gerencia';
import { formatCurrencyUSD, formatPercentage } from '../../lib/format';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const criticidadColor: Record<GerenciaAlerta['criticidad'], string> = {
  alta: 'bg-red-100 text-red-700 border-red-200',
  media: 'bg-amber-100 text-amber-800 border-amber-200',
  baja: 'bg-slate-100 text-slate-700 border-slate-200',
};

const criticidadDot: Record<GerenciaAlerta['criticidad'], string> = {
  alta: 'bg-red-500',
  media: 'bg-amber-500',
  baja: 'bg-slate-500',
};

export const GerenciaPage = () => {
  const [fechaSeleccionada, setFechaSeleccionada] = useState<string>('');
  const [sucursal, setSucursal] = useState<string>('San Pedro');

  const series = useMemo(
    () => gerenciaSerie14DiasMock.filter((item) => item.sucursal === sucursal),
    [sucursal]
  );

  useEffect(() => {
    if (series.length > 0) {
      setFechaSeleccionada(series[series.length - 1]?.fecha ?? '');
    } else {
      setFechaSeleccionada('');
    }
  }, [series]);

  const selectedPoint = useMemo<GerenciaSerieDia | undefined>(
    () => series.find((item) => item.fecha === fechaSeleccionada) ?? series[series.length - 1],
    [fechaSeleccionada, series]
  );

  const metrics = useMemo(() => gerenciaMetricsMock[sucursal] ?? gerenciaMetricsMock['San Pedro'], [sucursal]);

  const margenOperativo = selectedPoint?.margenPct ?? 1 - (metrics.foodCostPct + metrics.beverageCostPct + metrics.laborCostPct);

  const topProductos = useMemo(
    () => gerenciaTopProductosMock.filter((item) => item.sucursal === sucursal).slice(0, 5),
    [sucursal]
  );

  const alertas = useMemo(
    () => gerenciaAlertasMock.filter((alerta) => alerta.sucursal === sucursal),
    [sucursal]
  );

  const alertasActivas = metrics.alertaMarcaciones + metrics.alertaDepositosPendientes + alertas.length;

  const resumenMontos = useMemo(() => {
    const totalAjustes = topProductos.reduce((acc, item) => acc + item.totalVentas, 0);
    const margenPromedio =
      series.reduce((acc, item) => acc + item.margenPct, 0) / (series.length || 1);
    return { totalAjustes, margenPromedio };
  }, [series, topProductos]);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase text-slate-500 font-semibold mb-1">Contabilidad</p>
          <h1 className="text-4xl font-bold text-bean tracking-tight">Gerencia — Sucursal San Pedro (DEMO)</h1>
          <p className="text-slate-600 mt-2">
            KPI operativos diarios y alertas para la gestión de la sucursal.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 text-slate-800 rounded-xl p-4">
        Este módulo está en modo DEMO usando datos de ejemplo para mostrar el flujo gerencial por sucursal.
      </div>

      <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-bean">Filtros</h2>
            <p className="text-sm text-slate-600">Selecciona fecha y sucursal para refrescar el tablero.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              // DEMO: en la versión real, este botón dispararía una recarga de datos contra la API.
              // eslint-disable-next-line no-console
              console.log('Actualizar dashboard gerencial', { fechaSeleccionada, sucursal });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bean text-white shadow-sm hover:bg-bean/90"
          >
            <RefreshCw size={16} /> Actualizar
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <CalendarDays size={16} /> Fecha
            </span>
            <input
              type="date"
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-700 gap-2">
            <span className="font-semibold flex items-center gap-2">
              <MapPin size={16} /> Sucursal
            </span>
            <select
              value={sucursal}
              onChange={(e) => setSucursal(e.target.value)}
              className="border border-sand rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-bean"
            >
              {gerenciaSucursalesMock.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <div className="p-4 bg-off border border-sand rounded-xl w-full flex items-center gap-3">
              <AlertTriangle className="text-amber-500" size={18} />
              <div>
                <p className="text-xs text-slate-500">Recordatorio</p>
                <p className="text-sm text-slate-700">
                  Los datos son mock y se actualizan localmente.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KpiCard
            title="Ventas hoy"
            value={formatCurrencyUSD(selectedPoint?.ventas ?? metrics.ventasHoy)}
            subtitle={`Ayer: ${formatCurrencyUSD(metrics.ventasAyer)}`}
          />
          <KpiCard
            title="Ticket promedio"
            value={formatCurrencyUSD(metrics.ticketPromedio)}
            subtitle={`${metrics.numTransacciones.toLocaleString()} transacciones`}
          />
          <KpiCard
            title="Transacciones"
            value={metrics.numTransacciones.toLocaleString()}
            subtitle="Flujo del día"
          />
          <KpiCard
            title="Margen operativo"
            value={formatPercentage(margenOperativo)}
            subtitle={`Promedio 14d: ${formatPercentage(resumenMontos.margenPromedio)}`}
          />
          <KpiCard
            title="Food cost"
            value={formatPercentage(metrics.foodCostPct)}
            subtitle="Control cocina"
          />
          <KpiCard
            title="Beverage cost"
            value={formatPercentage(metrics.beverageCostPct)}
            subtitle="Bebidas"
          />
          <KpiCard
            title="Labor cost"
            value={formatPercentage(metrics.laborCostPct)}
            subtitle="Personal"
          />
          <KpiCard
            title="Alertas activas"
            value={alertasActivas.toString()}
            subtitle="Marcaciones / depósitos"
            badge={alertasActivas > 0 ? '!' : undefined}
            badgeTone={alertasActivas > 0 ? 'danger' : 'neutral'}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 flex flex-col">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-bean">Serie 14 días</h3>
              <p className="text-sm text-slate-600">Ventas vs. margen operativo por día (solo sucursal).</p>
            </div>
            <span className="text-xs uppercase tracking-wide text-slate-500 bg-off border border-sand rounded-full px-3 py-1">
              Demo mock
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" stroke="#64748b" fontSize={12} tickFormatter={(value) => (value as string).slice(5)} />
                <YAxis
                  yAxisId="left"
                  stroke="#64748b"
                  fontSize={12}
                  width={80}
                  tickFormatter={(v: number) => formatCurrencyUSD(v)}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#64748b"
                  fontSize={12}
                  width={60}
                  tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Ventas') return [formatCurrencyUSD(Number(value)), 'Ventas'];
                    return [`${Math.round(Number(value) * 100)}%`, 'Margen'];
                  }}
                  labelFormatter={(label) => label as string}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="ventas"
                  name="Ventas"
                  stroke="#4B2E05"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="margenPct"
                  name="Margen"
                  stroke="#10b981"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl shadow-lg border border-sand p-6 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-bean">Top productos del día</h3>
              <p className="text-sm text-slate-600">Ranking de ventas en la sucursal.</p>
            </div>
            <span className="text-sm text-slate-500">Total: {formatCurrencyUSD(resumenMontos.totalAjustes)}</span>
          </div>
          <div className="space-y-3">
            {topProductos.map((item) => (
              <div key={item.nombre} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <div className="flex items-center gap-2">
                    <ShoppingBag size={14} className="text-slate-500" />
                    <span className="font-semibold">{item.nombre}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {formatCurrencyUSD(item.totalVentas)} · {(item.porcentaje * 100).toFixed(1)}%
                  </div>
                </div>
                <div className="w-full h-2.5 bg-off rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-bean"
                    style={{ width: `${Math.min(100, item.porcentaje * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-sand p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-bean">Alertas operativas</h3>
              <p className="text-sm text-slate-600">Prioriza y asigna seguimiento.</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <BarChart3 size={16} className="text-bean" />
              <span>{alertas.length} alertas</span>
            </div>
          </div>
          <div className="space-y-3">
            {alertas.map((alerta, idx) => (
              <div
                key={`${alerta.tipo}-${idx}`}
                className="flex items-start gap-3 p-3 rounded-xl border border-sand bg-off"
              >
                <AlertCircle className="text-bean mt-0.5" size={18} />
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{alerta.mensaje}</p>
                    <span
                      className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1 rounded-full border ${criticidadColor[alerta.criticidad]}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${criticidadDot[alerta.criticidad]}`} />
                      {alerta.criticidad === 'alta'
                        ? 'Alta'
                        : alerta.criticidad === 'media'
                          ? 'Media'
                          : 'Baja'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">Tipo: {alerta.tipo}</p>
                </div>
              </div>
            ))}
            {alertas.length === 0 && (
              <div className="p-4 rounded-xl border border-sand text-sm text-slate-600 bg-off">
                Sin alertas para esta sucursal.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const KpiCard = ({
  title,
  value,
  subtitle,
  badge,
  badgeTone = 'neutral',
}: {
  title: string;
  value: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'neutral' | 'danger';
}) => {
  const badgeClass =
    badgeTone === 'danger'
      ? 'bg-red-100 text-red-700 border-red-200'
      : 'bg-slate-100 text-slate-700 border-slate-200';

  return (
    <div className="rounded-2xl border border-sand bg-white shadow-sm p-5 space-y-2">
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span className="font-semibold text-slate-700">{title}</span>
        {badge ? <span className={`text-xs px-2 py-0.5 rounded-full border ${badgeClass}`}>{badge}</span> : null}
      </div>
      <p className="text-2xl font-bold text-bean">{value}</p>
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
};

export default GerenciaPage;
