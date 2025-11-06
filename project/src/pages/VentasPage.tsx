import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, DollarSign, Receipt, Building2, Calendar } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line } from "recharts";
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
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';

/* ──────────────────────────────────────────────────────────
   Tipos que devuelve cada variante de RPC
   - Todas:   rpc_ui_series_14d(desde, hasta)
   - Individ: rpc_ui_series_14d(p_desde, p_hasta, p_sucursal_id uuid)
   ────────────────────────────────────────────────────────── */
type SerieAllRow = {
  dia: string;          // 'YYYY-MM-DD'
  sucursal: string;     // nombre
  ventas: number;
  itbms: number;
  transacciones: number;
  propina: number;
};
type SerieOneRow = {
  d: string;            // 'YYYY-MM-DD'
  ventas_netas: number;
  tx: number;
type SucursalRow = { nombre: string; ventas: number; transacciones: number; ticketPromedio: number; };
type SyncBranchStat = { name: string; orders: number; sales?: number };
   Utilidades de fecha/formatos
function todayYMD(tz = 'America/Panama') {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear(); const mm = String(dt.getUTCMonth() + 1).padStart(2, '0'); const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
function formatCurrencyUSD(n: number) {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
function formatDateDDMMYYYY(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
   Página
export default function VentasPage() {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);
  // Rango por defecto: últimos 7 días
  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);
  // Filtro de sucursal (por UUID)
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );
  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName =
    viewingAll ? null : (sucursales.find(s => String(s.id) === selectedSucursalId)?.nombre ?? null);
  // Estado UI
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalTransacciones, setTotalTransacciones] = useState(0);
  const [totalITBMS, setTotalITBMS] = useState(0);
  const [rows, setRows] = useState<SucursalRow[]>([]);
  const [seriesData, setSeriesData] = useState<any[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [syncBanner, setSyncBanner] = useState<{
    when: string; stats: SyncBranchStat[]; visible: boolean; kind?: 'ok' | 'warn'; message?: string;
  } | null>(null);
  const headerNote = viewingAll
    ? `Viendo datos de todas las sucursales (${sucursales.length} sucursales)`
    : `Viendo únicamente: ${selectedSucursalName ?? 'Sucursal'}`;
  /* ────────────────────────────────────────────────────────
     CARGA PRINCIPAL — llama la RPC correcta según el modo
     ──────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      if (viewingAll) {
        // MODO TODAS — usa la variante por NOMBRE
        const { data, error } = await supabase.rpc<SerieAllRow>('rpc_ui_series_14d', {
          desde, hasta,
        });
        if (error) throw error;
        const all: SerieAllRow[] = data ?? [];
        // Serie por día (suma todas las sucursales)
        const byDay = new Map<string, { dia: string; fecha: string; ventas: number; tickets: number }>();
        for (const r of all) {
          const cur = byDay.get(r.dia) ?? { dia: r.dia, fecha: formatDateDDMMYYYY(r.dia), ventas: 0, tickets: 0 };
          cur.ventas += Number(r.ventas ?? 0);
          cur.tickets += Number(r.transacciones ?? 0);
          byDay.set(r.dia, cur);
        }
        const serie = Array.from(byDay.values()).sort((a, b) => a.dia.localeCompare(b.dia));
        setSeriesData(serie);
        // Tabla por sucursal
        const bySucursal = new Map<string, { nombre: string; ventas: number; transacciones: number }>();
          const cur = bySucursal.get(r.sucursal) ?? { nombre: r.sucursal, ventas: 0, transacciones: 0 };
          cur.transacciones += Number(r.transacciones ?? 0);
          bySucursal.set(r.sucursal, cur);
        const rowsList = Array.from(bySucursal.values())
          .map(e => ({ ...e, ticketPromedio: e.transacciones > 0 ? e.ventas / e.transacciones : 0 }))
          .sort((a, b) => b.ventas - a.ventas);
        setRows(rowsList);
        // KPIs
        let sumVentas = 0, sumTickets = 0, sumITBMS = 0;
          sumVentas += Number(r.ventas ?? 0);
          sumTickets += Number(r.transacciones ?? 0);
          sumITBMS += Number(r.itbms ?? 0);
        setTotalVentas(sumVentas);
        setTotalTransacciones(sumTickets);
        setTotalITBMS(sumITBMS);
        setDebugInfo({
          modo: 'todas',
          filtro: { desde, hasta },
          rowsCount: all.length,
          sample: all[0] ?? null,
          seriePreview: serie.slice(0, 3),
      } else {
        // MODO INDIVIDUAL — usa la variante por UUID
        const { data, error } = await supabase.rpc<SerieOneRow>('rpc_ui_series_14d', {
          p_desde: desde,
          p_hasta: hasta,
          p_sucursal_id: selectedSucursalId,
        const one: SerieOneRow[] = data ?? [];
        // Serie por día
        const serie = one
          .map(r => ({
            dia: r.d,
            fecha: formatDateDDMMYYYY(r.d),
            ventas: Number(r.ventas_netas ?? 0),
            tickets: Number(r.tx ?? 0),
          }))
          .sort((a, b) => a.dia.localeCompare(b.dia));
        // Tabla (una sola sucursal)
        const ventasTotal = serie.reduce((acc, r) => acc + r.ventas, 0);
        const txTotal = serie.reduce((acc, r) => acc + r.tickets, 0);
        setRows([
          {
            nombre: selectedSucursalName ?? 'Sucursal',
            ventas: ventasTotal,
            transacciones: txTotal,
            ticketPromedio: txTotal > 0 ? ventasTotal / txTotal : 0,
          },
        ]);
        setTotalVentas(ventasTotal);
        setTotalTransacciones(txTotal);
        setTotalITBMS(one.reduce((acc, r) => acc + Number(r.itbms ?? 0), 0));
          modo: 'individual',
          filtro: { desde, hasta, selectedSucursalId, selectedSucursalName },
          rowsCount: one.length,
          sample: one[0] ?? null,
      }
    } catch (e) {
      debugLog('[VentasPage] loadData error:', e);
      setRows([]); setSeriesData([]); setTotalVentas(0); setTotalTransacciones(0); setTotalITBMS(0);
      setDebugInfo({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName]);
     SYNC (igual que antes)
  const handleSync = useCallback(async () => {
    const base = functionsBase;
    if (!base) {
      setSyncBanner({ when: new Date().toISOString(), stats: [], visible: true, kind: 'warn', message: 'Edge Function no configurada (revisa VITE_SUPABASE_FUNCTIONS_BASE).' });
      return;
    setSyncing(true);
      const hoySync = hoy;
      const query = `?desde=${hoySync}&hasta=${hoySync}`;
      const endpoints = [
        `${base}/sync-ventas-detalle${query}`,
        `${base}/sync-ventas-v4${query}`,
        `${base}/sync-ventas${query}`,
      ];
      const invoke = async (url: string) => {
        const run = async (retry: boolean): Promise<Response> => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
          });
          if (!resp.ok && resp.status >= 500 && retry) return run(false);
          return resp;
        };
        return run(true);
      };
      let resp: Response | null = null;
      for (const ep of endpoints) {
        try {
          const r = await invoke(ep);
          if (!r.ok && r.status === 404) continue;
          resp = r; break;
        } catch { /* sigue */ }
      if (!resp) throw new Error('No fue posible ejecutar la sincronización');
      // Banner resumido
      let when = new Date().toISOString();
      try { const js = await resp.json(); if (js?.desde) when = js.desde; } catch {}
      setSyncBanner({ when, stats: [], visible: true, kind: 'ok', message: 'Sincronización completada.' });
      setTimeout(() => setSyncBanner(s => (s ? { ...s, visible: false } : s)), 6000);
      await loadData();
    } catch (e: any) {
      setSyncBanner({ when: new Date().toISOString(), stats: [], visible: true, kind: 'warn', message: e?.message ?? 'Error desconocido en sincronización' });
      debugLog('Sync Ventas (DB) error:', e);
      setSyncing(false);
  }, [functionsBase, hoy, loadData]);
     Realtime + efectos
  const rt: any = useRealtimeVentas({
    enabled: true, debounceMs: 1500,
    onUpdate: () => { debugLog('[VentasPage] realtime update'); loadData(); },
  });
  let rtConnected = false as boolean; let rtError: string | null = null; let rtLastUpdate: string | Date | null = null;
  let onReconnect: () => void = () => window.location.reload();
  if (typeof rt === 'string') { rtConnected = rt === 'open'; rtError = rt === 'error' ? 'Connection error' : null; }
  else if (rt && typeof rt === 'object') {
    // @ts-ignore
    rtConnected = typeof rt.connected === 'boolean' ? !!rt.connected : (rt.status === 'open');
    rtError = typeof rt.error === 'string' ? rt.error : (rt.status === 'error' ? 'Connection error' : null);
    rtLastUpdate = rt.lastUpdate ?? null;
    if (typeof rt.manualReconnect === 'function') onReconnect = rt.manualReconnect;
  }
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const handler = () => { debugLog('[VentasPage] evento debug:refetch-all'); loadData(); };
    window.addEventListener('debug:refetch-all', handler);
    return () => window.removeEventListener('debug:refetch-all', handler);
  }, [loadData]);
    if (sucursalSeleccionada?.id) setSelectedSucursalId(String(sucursalSeleccionada.id));
    else setSelectedSucursalId(null);
  }, [sucursalSeleccionada]);
  const bannerClass =
    syncBanner?.kind === 'warn'
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300'
      : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300';
     Render
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="p-6 lg:p-8 space-y-6">
        {/* Encabezado */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Ventas</h1>
                <RealtimeStatusIndicator connected={rtConnected} lastUpdate={rtLastUpdate} error={rtError} onReconnect={onReconnect} compact />
              </div>
              <p className="text-gray-600 dark:text-gray-400">Resumen y análisis de ventas por sucursal</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{headerNote}</p>
            </div>
            <button onClick={handleSync} disabled={syncing}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg disabled:opacity-50">
              <RefreshCw className={`h-5 w-5 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>
          {syncBanner?.visible && (
            <div className={`mt-4 text-sm rounded-xl border px-4 py-3 ${bannerClass}`}>
              {syncBanner.message ?? `Actualizado: ${new Date(syncBanner.when).toLocaleString()}`}
          )}
        </div>
        {/* Filtros */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Filtros
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Sucursal</label>
              <div className="flex gap-2">
                <select
                  value={viewingAll ? '' : String(selectedSucursalId ?? '')}
                  onChange={(e) => setSelectedSucursalId(e.target.value ? String(e.target.value) : null)}
                  className="flex-1 px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Todas las sucursales</option>
                  {sucursales.map((s) => (
                    <option key={String(s.id)} value={String(s.id)}>{s.nombre}</option>
                  ))}
                </select>
                <div className="inline-flex items-center px-3 rounded-lg border dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300">
                  <Building2 className="h-4 w-4 mr-2" />
                  {viewingAll ? 'Todas' : 'Individual'}
                </div>
          {/* Debug */}
          <div className="mt-3">
            <button className="text-xs underline text-gray-500 dark:text-gray-400" onClick={() => setShowDebug(s => !s)}>
              {showDebug ? 'Ocultar debug' : 'Mostrar debug'}
            {showDebug && (
              <pre className="mt-2 text-xs p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 overflow-auto">
{JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KPICard title="Total Ventas" value={totalVentas} icon={DollarSign}
            color="bg-gradient-to-br from-green-500 to-emerald-600" prefix="USD " trend={12} />
          <KPICard title="Total ITBMS" value={totalITBMS} icon={TrendingUp}
            color="bg-gradient-to-br from-indigo-500 to-purple-600" prefix="USD " trend={5} />
          <KPICard title="# Transacciones" value={totalTransacciones} icon={Receipt}
            color="bg-gradient-to-br from-blue-500 to-cyan-600" trend={8} />
        {/* Serie (14 días o rango elegido) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Serie de ventas</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Fuente: {viewingAll ? 'RPC rpc_ui_series_14d(desde,hasta)' : 'RPC rpc_ui_series_14d(p_desde,p_hasta,p_sucursal_id)'}
              </p>
          <div className="h-80 px-6 pb-6">
            {seriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                {loading ? 'Cargando…' : 'Sin datos en el período seleccionado.'}
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={seriesData} margin={{ top: 20, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="fecha" stroke="#6b7280" fontSize={12} minTickGap={16} />
                  <YAxis yAxisId="left" stroke="#6b7280" fontSize={12} tickFormatter={(v: number) => formatCurrencyUSD(v)} width={90} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6b7280" fontSize={12} width={70} />
                  <Tooltip
                    formatter={(value: number, name) => (name === 'Ventas' ? formatCurrencyUSD(value) : value.toLocaleString())}
                    labelFormatter={(label) => `Día: ${label}`}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="ventas" name="Ventas" fill="#3b82f6" stroke="#2563eb" strokeWidth={2} activeDot={{ r: 5 }} />
                  <Bar yAxisId="right" dataKey="tickets" name="Tickets" opacity={0.75} barSize={24} />
                </ComposedChart>
              </ResponsiveContainer>
        {/* Tabla por sucursal */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Resumen por sucursal ({desde} → {hasta})
            </h3>
          {loading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Cargando…</div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-gray-500 dark:text-gray-400">No hay datos de ventas en el período seleccionado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Sucursal</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ventas</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Transacciones</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ticket Promedio</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {rows.map((r) => (
                    <tr key={r.nombre} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4">{r.nombre}</td>
                      <td className="px-6 py-4 text-right font-semibold">{formatCurrencyUSD(r.ventas)}</td>
                      <td className="px-6 py-4 text-right">{r.transacciones.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right">{formatCurrencyUSD(r.ticketPromedio)}</td>
                    </tr>
                </tbody>
              </table>
      </div>
    </div>
