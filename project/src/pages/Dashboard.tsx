// project/src/pages/Dashboard.tsx
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DollarSign,
  Receipt,
  TrendingUp,
  Users,
  PieChart,
  RefreshCw,
  AlertTriangle,
  Building2,
  Clock,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';
import { useAuthOrg } from '../context/AuthOrgContext';
import { formatCurrencyUSD } from '../lib/format';
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

type KPI = {
  ventas_brutas: number;
  tickets: number;
  ticket_promedio?: number;
  margen_bruto: number;
  clientes_activos?: number;
  sucursal_id?: string;
};

export function Dashboard() {
  const navigate = useNavigate();
  const { sucursales, sucursalSeleccionada, getFilteredSucursalIds } = useAuthOrg();

  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // KPIs
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalTransacciones, setTotalTransacciones] = useState(0);
  const [ticketPromedio, setTicketPromedio] = useState(0);
  const [margenBruto, setMargenBruto] = useState(0);
  const [clientesActivos, setClientesActivos] = useState(0);

  // Datos para gráficos
  const [ventasPorDia, setVentasPorDia] = useState<any[]>([]);
  const [ventasPorSucursal, setVentasPorSucursal] = useState<any[]>([]);

  const [lastSync, setLastSync] = useState<Date | null>(null);

  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName = viewingAll
    ? null
    : sucursales.find(s => String(s.id) === selectedSucursalId)?.nombre ?? 'Sucursal';

  // Realtime
  const rt: any = useRealtimeVentas({
    enabled: true,
    debounceMs: 2000,
    onUpdate: () => loadData(),
  });
  let rtConnected = false;
  let rtError: string | null = null;
  let rtLastUpdate: string | Date | null = null;
  let onReconnect: () => void = () => window.location.reload();
  if (typeof rt === 'string') {
    rtConnected = rt === 'open';
    rtError = rt === 'error' ? 'Connection error' : null;
  } else if (rt && typeof rt === 'object') {
    // @ts-ignore
    rtConnected = typeof rt.connected === 'boolean' ? rt.connected : (rt.status === 'open');
    // @ts-ignore
    rtError = typeof rt.error === 'string' ? rt.error : (rt.status === 'error' ? 'Connection error' : null);
    // @ts-ignore
    rtLastUpdate = rt.lastUpdate ?? null;
    // @ts-ignore
    if (typeof rt.manualReconnect === 'function') onReconnect = rt.manualReconnect;
  }

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const idsToFilter = viewingAll
        ? getFilteredSucursalIds().map(String)
        : selectedSucursalId
        ? [String(selectedSucursalId)]
        : [];

      // 1) KPIs de hoy
      let kpisQuery = supabase.from('v_ui_kpis_hoy').select('*');
      if (!viewingAll && idsToFilter.length > 0) kpisQuery = kpisQuery.eq('sucursal_id', idsToFilter[0]);
      else if (viewingAll && idsToFilter.length > 0) kpisQuery = kpisQuery.in('sucursal_id', idsToFilter);

      const { data: kpisData, error: kpisError } = await kpisQuery;
      if (kpisError) throw kpisError;

      const kpis = (kpisData ?? []) as KPI[];
      const totals = kpis.reduce(
        (acc, row) => ({
          ventas: acc.ventas + Number(row.ventas_brutas ?? 0),
          tickets: acc.tickets + Number(row.tickets ?? 0),
          margen: acc.margen + Number(row.margen_bruto ?? 0),
          clientes: acc.clientes + Number(row.clientes_activos ?? 0),
        }),
        { ventas: 0, tickets: 0, margen: 0, clientes: 0 }
      );
      setTotalVentas(totals.ventas);
      setTotalTransacciones(totals.tickets);
      setTicketPromedio(totals.tickets > 0 ? totals.ventas / totals.tickets : 0);
      setMargenBruto(totals.margen);
      setClientesActivos(totals.clientes);

      // 2) Serie (tolerante: no usamos `dia` si no existe)
      let seriesQuery = supabase.from('v_ui_series_14d').select('*');
      if (!viewingAll && idsToFilter.length > 0) seriesQuery = seriesQuery.eq('sucursal_id', idsToFilter[0]);
      else if (viewingAll && idsToFilter.length > 0) seriesQuery = seriesQuery.in('sucursal_id', idsToFilter);

      const { data: seriesData, error: seriesError } = await seriesQuery;
      if (seriesError) throw seriesError;
      const series = seriesData ?? [];

      const hasDia = series.length > 0 && Object.prototype.hasOwnProperty.call(series[0], 'dia');
      if (hasDia) {
        const map = new Map<string, { dia: string; ventas: number; tickets: number }>();
        series
          .filter((r: any) => typeof r.dia === 'string' && r.dia.length > 0)
          .forEach((r: any) => {
            const dia = r.dia as string;
            const entry = map.get(dia) ?? { dia, ventas: 0, tickets: 0 };
            entry.ventas += Number(r.ventas_brutas ?? 0);
            entry.tickets += Number(r.tickets ?? 0);
            map.set(dia, entry);
          });
        const arr = Array.from(map.values())
          .sort((a, b) => a.dia.localeCompare(b.dia))
          .map(row => ({
            fecha: new Date(row.dia).toLocaleDateString('es-PA', { month: 'short', day: 'numeric' }),
            ventas: row.ventas,
            tickets: row.tickets,
          }));
        setVentasPorDia(arr);
      } else {
        setVentasPorDia([]); // sin dia -> sin serie
      }

      // 3) Ventas por sucursal (cuando viendo todas)
      if (viewingAll) {
        const map = new Map<string, { nombre: string; ventas: number }>();
        series.forEach((r: any) => {
          const id = String(r.sucursal_id ?? 'sin-id');
          const nombre = id; // hasta que expongamos nombre en la vista
          const entry = map.get(id) ?? { nombre, ventas: 0 };
          entry.ventas += Number(r.ventas_brutas ?? 0);
          map.set(id, entry);
        });
        const arr = Array.from(map.values()).sort((a, b) => b.ventas - a.ventas).slice(0, 6);
        setVentasPorSucursal(arr);
      } else {
        setVentasPorSucursal([]);
      }

      setLastSync(new Date());
    } catch (err: any) {
      console.error('[Dashboard] Error cargando datos:', err);
      setError(err?.message ?? 'Error desconocido');
      setVentasPorDia([]);
      setVentasPorSucursal([]);
    } finally {
      setLoading(false);
    }
  }, [viewingAll, selectedSucursalId, getFilteredSucursalIds]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (sucursalSeleccionada?.id) setSelectedSucursalId(String(sucursalSeleccionada.id));
    else setSelectedSucursalId(null);
  }, [sucursalSeleccionada]);

  const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } };
  const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                <RealtimeStatusIndicator
                  connected={rtConnected}
                  lastUpdate={rtLastUpdate}
                  error={rtError}
                  onReconnect={onReconnect}
                  compact
                />
              </div>
              <p className="text-gray-600 dark:text-gray-400">Resumen general de operaciones en tiempo real</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {viewingAll ? `Viendo datos de todas las sucursales (${sucursales.length} sucursales)` : `Viendo únicamente: ${selectedSucursalName}`}
              </p>
            </div>
            <button onClick={loadData} disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg disabled:opacity-50">
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>

          {lastSync && (
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              Última actualización: {lastSync.toLocaleTimeString('es-PA')}
            </div>
          )}
        </motion.div>

        {/* Filtro de sucursal */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-4">
            <Building2 className="h-5 w-5 text-gray-500 dark:text-gray-400" />
            <select
              value={viewingAll ? '' : String(selectedSucursalId ?? '')}
              onChange={(e) => setSelectedSucursalId(e.target.value ? String(e.target.value) : null)}
              className="flex-1 px-4 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400"
            >
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={String(s.id)} value={String(s.id)}>{s.nombre}</option>
              ))}
            </select>
            <div className="px-4 py-2 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300 text-sm font-medium">
              {viewingAll ? 'Vista General' : 'Vista Individual'}
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-red-800 dark:text-red-300">Error al cargar datos</h3>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* KPIs */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <motion.div variants={itemVariants}>
            <KPICard title="Ventas Hoy" value={totalVentas} icon={DollarSign}
              color="bg-gradient-to-br from-green-500 to-emerald-600" prefix="USD " onClick={() => navigate('/ventas')} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard title="Transacciones" value={totalTransacciones} icon={Receipt}
              color="bg-gradient-to-br from-blue-500 to-cyan-600" onClick={() => navigate('/ventas')} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard title="Ticket Promedio" value={ticketPromedio} icon={TrendingUp}
              color="bg-gradient-to-br from-purple-500 to-pink-600" prefix="USD " />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard title="Margen Bruto" value={margenBruto} icon={PieChart}
              color="bg-gradient-to-br from-orange-500 to-red-600" prefix="USD " />
          </motion.div>
          <motion.div variants={itemVariants}>
            <KPICard title="Clientes Activos" value={clientesActivos} icon={Users}
              color="bg-gradient-to-br from-indigo-500 to-purple-600" onClick={() => navigate('/clientes')} />
          </motion.div>
        </motion.div>

        {/* Grids */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ventas por día */}
          <motion.div variants={itemVariants} initial="hidden" animate="visible"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Ventas últimos 7 días</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Evolución diaria (se activa cuando la vista incluya <code>dia</code>)</p>
            </div>
            <div className="p-6 h-80">
              {ventasPorDia.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                  {loading ? 'Cargando…' : 'Sin datos disponibles'}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ventasPorDia}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} />
                    <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                    <Bar dataKey="ventas" fill="#3b82f6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.div>

          {/* Ventas por sucursal */}
          {viewingAll && (
            <motion.div variants={itemVariants} initial="hidden" animate="visible"
              className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
              <div className="p-6 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Ventas por sucursal</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Distribución (usa <code>sucursal_id</code>)</p>
              </div>
              <div className="p-6 h-80">
                {ventasPorSucursal.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                    {loading ? 'Cargando…' : 'Sin datos disponibles'}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={ventasPorSucursal} dataKey="ventas" nameKey="nombre" cx="50%" cy="50%" outerRadius={100}
                        label={(entry) => entry.nombre}>
                        {ventasPorSucursal.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrencyUSD(value)} />
                      <Legend />
                    </RePieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
