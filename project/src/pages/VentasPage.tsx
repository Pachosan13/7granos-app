// src/pages/VentasPage.tsx
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
import { KPICard } from '../components/KPICard';
import { RealtimeStatusIndicator } from '../components/RealtimeStatusIndicator';
import { useRealtimeVentas } from '../hooks/useRealtimeVentas';
import { debugLog, getFunctionsBase } from '../utils/diagnostics';
import { ToastContainer, createToast, dismissToast, type ToastItem } from '../components/Toast';

type SucursalRow = { nombre: string; ventas: number; transacciones: number; ticketPromedio: number; };
type SyncBranchStat = { name: string; orders: number; sales?: number };

type NormalizedSerieRow = {
  dia: string;
  ventas: number;
  itbms: number;
  tx: number;
  sucursal: string | null;
};
type ChartSerieRow = NormalizedSerieRow & { fecha: string; tickets: number };

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
}
function formatCurrencyUSD(n: number) {
  return (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}
function formatDateDDMMYYYY(ymd: string) {
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function VentasPage() {
  const { sucursales, sucursalSeleccionada } = useAuthOrg();
  const functionsBase = useMemo(() => getFunctionsBase(), []);

  // Rango por defecto: últimos 7 días
  const hoy = useMemo(() => todayYMD(), []);
  const [desde, setDesde] = useState(addDays(hoy, -7));
  const [hasta, setHasta] = useState(hoy);

  // Filtro de sucursal (por ID)
  const [selectedSucursalId, setSelectedSucursalId] = useState<string | null>(
    sucursalSeleccionada?.id ? String(sucursalSeleccionada.id) : null
  );
  const viewingAll = selectedSucursalId === null;
  const selectedSucursalName =
    viewingAll ? null : (sucursales.find(s => String(s.id) === selectedSucursalId)?.nombre ?? null);
  const individual = !viewingAll;

  const [sucursalesMap, setSucursalesMap] = useState<Map<string, string>>(new Map());
  const [mapReady, setMapReady] = useState(false);

  // Estado UI
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [totalVentas, setTotalVentas] = useState(0);
  const [totalTransacciones, setTotalTransacciones] = useState(0);
  const [totalITBMS, setTotalITBMS] = useState(0);
  const [rows, setRows] = useState<SucursalRow[]>([]);
  const [seriesData, setSeriesData] = useState<ChartSerieRow[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [syncBanner, setSyncBanner] = useState<{
    when: string; stats: SyncBranchStat[]; visible: boolean; kind?: 'ok' | 'warn'; message?: string;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => createToast(setToasts, toast), []);

  const headerNote = viewingAll
    ? `Viendo datos de todas las sucursales (${sucursales.length} sucursales)`
    : `Viendo únicamente: ${selectedSucursalName ?? 'Sucursal'}`;

  useEffect(() => {
    let alive = true;
    const loadSucursalesMap = async () => {
      try {
        const { data, error } = await supabase.from('sucursal').select('id,nombre');
        if (!alive) return;
        if (error) throw error;
        setSucursalesMap(new Map((data ?? []).map((s) => [s.nombre, s.id])));
      } catch (err) {
        if (!alive) return;
        const message = err instanceof Error ? err.message : 'Error desconocido';
        debugLog('[VentasPage] loadSucursalesMap error:', err);
        pushToast({ title: 'No se pudo cargar sucursales', description: message, tone: 'error' });
      } finally {
        if (alive) setMapReady(true);
      }
    };
    loadSucursalesMap();
    return () => {
      alive = false;
    };
  }, [pushToast]);

  // ====== CARGA PRINCIPAL DESDE RPC ======
  const loadData = useCallback(async () => {
    if (individual && !mapReady) {
      return;
    }
    setLoading(true);
    try {
      let sucursalUuid: string | null = null;
      if (individual) {
        sucursalUuid = selectedSucursalName ? sucursalesMap.get(selectedSucursalName) ?? null : null;
        if (!sucursalUuid) {
          pushToast({ title: 'Sucursal sin UUID', description: 'No se encontró el identificador de la sucursal seleccionada.', tone: 'error' });
          throw new Error('Sucursal sin UUID');
        }
      }

      const serieArgs = individual
        ? { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalUuid }
        : { desde, hasta };
      const kpiArgs = individual
        ? { p_desde: desde, p_hasta: hasta, p_sucursal_id: sucursalUuid }
        : { p_desde: desde, p_hasta: hasta };

      if (import.meta.env.DEV) {
        console.debug('RPC args rpc_ui_series_14d', serieArgs);
        console.debug('RPC args rpc_ui_kpis_resumen', kpiArgs);
      }

      const [{ data: serieData, error: serieError }, { data: kpiData, error: kpiError }] = await Promise.all([
        supabase.rpc('rpc_ui_series_14d', serieArgs as Record<string, string>),
        supabase.rpc('rpc_ui_kpis_resumen', kpiArgs as Record<string, string>),
      ]);

      if (serieError) throw serieError;
      if (kpiError) throw kpiError;

      const serieRows = Array.isArray(serieData) ? (serieData as Record<string, unknown>[]) : [];
      const toNumber = (value: unknown) => {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        const parsed = Number(value ?? 0);
        return Number.isFinite(parsed) ? parsed : 0;
      };
      const toString = (value: unknown) => (typeof value === 'string' ? value : '');
      const toStringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

      const normalizedSerie: NormalizedSerieRow[] = serieRows.map((row) => {
        if (individual) {
          const dia = toString(row.d);
          return {
            dia,
            ventas: toNumber(row.ventas_netas ?? row.ventas),
            itbms: toNumber(row.itbms),
            tx: toNumber(row.tx ?? row.transacciones),
            sucursal: selectedSucursalName ?? null,
          };
        }
        const dia = toString(row.dia);
        const rawSucursal = 'sucursal' in row ? row.sucursal : undefined;
        const rawNombre = 'nombre' in row ? row.nombre : undefined;
        const sucursalNombre = toStringOrNull(rawSucursal ?? rawNombre);
        return {
          dia,
          ventas: toNumber(row.ventas ?? row.ventas_netas),
          itbms: toNumber(row.itbms),
          tx: toNumber(row.transacciones ?? row.tx),
          sucursal: sucursalNombre,
        };
      });

      const serie = normalizedSerie
        .map((row) => ({
          ...row,
          fecha: row.dia ? formatDateDDMMYYYY(row.dia) : '',
          tickets: row.tx,
        }))
        .sort((a, b) => a.dia.localeCompare(b.dia));
      setSeriesData(serie);

      const kpiRow = (Array.isArray(kpiData) ? (kpiData[0] as Record<string, unknown> | undefined) : undefined) ?? {};
      const ventasTotal = toNumber((kpiRow as Record<string, unknown>).ventas ?? (kpiRow as Record<string, unknown>).ventas_netas);
      const itbmsTotal = toNumber((kpiRow as Record<string, unknown>).itbms);
      const txTotal = toNumber((kpiRow as Record<string, unknown>).tx ?? (kpiRow as Record<string, unknown>).transacciones);
      setTotalVentas(ventasTotal);
      setTotalITBMS(itbmsTotal);
      setTotalTransacciones(txTotal);

      if (individual) {
        const nombre = selectedSucursalName ?? 'Sucursal';
        setRows([
          {
            nombre,
            ventas: ventasTotal,
            transacciones: txTotal,
            ticketPromedio: txTotal > 0 ? ventasTotal / txTotal : 0,
          },
        ]);
      } else {
        const bySucursal = new Map<string, { nombre: string; ventas: number; transacciones: number }>();
        for (const r of normalizedSerie) {
          const nombre = r.sucursal ?? 'Sin sucursal';
          const cur = bySucursal.get(nombre) ?? { nombre, ventas: 0, transacciones: 0 };
          cur.ventas += r.ventas;
          cur.transacciones += r.tx;
          bySucursal.set(nombre, cur);
        }
        const rowsList = Array.from(bySucursal.values())
          .map((e) => ({ ...e, ticketPromedio: e.transacciones > 0 ? e.ventas / e.transacciones : 0 }))
          .sort((a, b) => b.ventas - a.ventas);
        setRows(rowsList);
      }

      setDebugInfo({
        filtro: { desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, individual, sucursalUuid },
        rowsCount: normalizedSerie.length,
        seriePreview: serie.slice(0, 3),
        serieRawSample: serieRows[0] ?? null,
        kpi: kpiRow,
      });
    } catch (e) {
      debugLog('[VentasPage] loadData error:', e);
      setRows([]); setSeriesData([]); setTotalVentas(0); setTotalTransacciones(0); setTotalITBMS(0);
      setDebugInfo({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [individual, mapReady, desde, hasta, viewingAll, selectedSucursalId, selectedSucursalName, sucursalesMap, pushToast]);

  // ====== SYNC (igual que antes) ======
  const handleSync = useCallback(async () => {
    const base = functionsBase;
    if (!base) {
      setSyncBanner({ when: new Date().toISOString(), stats: [], visible: true, kind: 'warn', message: 'Edge Function no configurada (revisa VITE_SUPABASE_FUNCTIONS_BASE).' });
      return;
    }
    setSyncing(true);
    try {
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
      }
      if (!resp) throw new Error('No fue posible ejecutar la sincronización');
      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        let friendly = `HTTP ${resp.status}`;
        if (resp.status === 401 || resp.status === 403) friendly = 'Sesión caducada o permisos insuficientes.';
        else if (resp.status === 404) friendly = 'Recurso de sincronización no encontrado.';
        else if (resp.status >= 500) friendly = 'Servicio remoto con errores, reintenta en unos minutos.';
        throw new Error(`${friendly}${txt ? ` · ${txt.slice(0, 120)}` : ''}`);
      }
      let bannerStats: SyncBranchStat[] = []; let when = new Date().toISOString();
      try {
        const js = await resp.json();
        if (js?.desde) when = js.desde;
        if (Array.isArray(js?.branches)) {
          bannerStats = js.branches.map((b: any) => ({
            name: String(b.name ?? b.branch ?? 'Sucursal'),
            orders: Number(b.orders ?? b.count ?? 0),
            sales: typeof b.sales === 'number' ? b.sales : undefined,
          }));
        }
      } catch { /* ignore */ }
      if (bannerStats.length > 0) {
        setSyncBanner({ when, stats: bannerStats, visible: true, kind: 'ok' });
        setTimeout(() => setSyncBanner(s => (s ? { ...s, visible: false } : s)), 12000);
      } else {
        setSyncBanner({ when, stats: [], visible: true, kind: 'ok', message: 'Sincronización completada.' });
        setTimeout(() => setSyncBanner(s => (s ? { ...s, visible: false } : s)), 6000);
      }
      await loadData();
    } catch (e: any) {
      setSyncBanner({ when: new Date().toISOString(), stats: [], visible: true, kind: 'warn', message: e?.message ?? 'Error desconocido en sincronización' });
      debugLog('Sync Ventas (DB) error:', e);
    } finally {
      setSyncing(false);
    }
  }, [functionsBase, hoy, loadData]);

  // Realtime (siempre recargar al evento)
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
    // @ts-ignore
    rtError = typeof rt.error === 'string' ? rt.error : (rt.status === 'error' ? 'Connection error' : null);
    // @ts-ignore
    rtLastUpdate = rt.lastUpdate ?? null;
    // @ts-ignore
    if (typeof rt.manualReconnect === 'function') onReconnect = rt.manualReconnect;
  }

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const handler = () => { debugLog('[VentasPage] evento debug:refetch-all'); loadData(); };
    window.addEventListener('debug:refetch-all', handler);
    return () => window.removeEventListener('debug:refetch-all', handler);
  }, [loadData]);
  useEffect(() => {
    if (sucursalSeleccionada?.id) setSelectedSucursalId(String(sucursalSeleccionada.id));
    else setSelectedSucursalId(null);
  }, [sucursalSeleccionada]);

  const bannerClass =
    syncBanner?.kind === 'warn'
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700 text-amber-800 dark:text-amber-300'
      : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700 text-green-800 dark:text-green-300';

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
        </div>

        {/* Filtros */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Filtros
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
            </div>
            <div>
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
              </div>
            </div>
          </div>

          {/* Debug */}
          <div className="mt-3">
            <button className="text-xs underline text-gray-500 dark:text-gray-400" onClick={() => setShowDebug(s => !s)}>
              {showDebug ? 'Ocultar debug' : 'Mostrar debug'}
            </button>
            {showDebug && (
              <pre className="mt-2 text-xs p-3 rounded-lg bg-gray-50 dark:bg-gray-900 border dark:border-gray-700 overflow-auto">
{JSON.stringify(debugInfo, null, 2)}
              </pre>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KPICard title="Total Ventas" value={totalVentas} icon={DollarSign}
            color="bg-gradient-to-br from-green-500 to-emerald-600" prefix="USD " trend={12} />
          <KPICard title="Total ITBMS" value={totalITBMS} icon={TrendingUp}
            color="bg-gradient-to-br from-indigo-500 to-purple-600" prefix="USD " trend={5} />
          <KPICard title="# Transacciones" value={totalTransacciones} icon={Receipt}
            color="bg-gradient-to-br from-blue-500 to-cyan-600" trend={8} />
        </div>

        {/* Serie (14 días o rango elegido) */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Serie de ventas</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fuente: RPC rpc_ui_series_14d</p>
            </div>
          </div>
          <div className="h-80 px-6 pb-6">
            {seriesData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 text-sm">
                {loading ? 'Cargando…' : 'Sin datos en el período seleccionado.'}
              </div>
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
                  <Bar yAxisId="right" dataKey="tickets" name="Tickets" fill="#10b981" opacity={0.75} barSize={24} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabla por sucursal */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden">
          <div className="p-6 border-b border-gray-100 dark:border-gray-700">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Resumen por sucursal ({desde} → {hasta})
            </h3>
          </div>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <ToastContainer toasts={toasts} onDismiss={(id) => dismissToast(setToasts, id)} />
    </div>
  );
}

export default VentasPage;
